"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useParams, useRouter } from "next/navigation";
import { Button, ProgressBar } from "@/components/ui";
/** 고객 플로우: API Route 호출 (Service Role로 selections 처리) */
async function fetchCustomerPhotos(token: string) {
  const res = await fetch(`/api/c/photos?token=${encodeURIComponent(token)}`);
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error ?? "Failed to load");
  }
  return res.json();
}

/** 다른 세션이 저장한 selections 변경을 반영하기 위한 경량 폴링 조회. */
async function fetchSelectionsPoll(
  token: string,
  projectId: string
): Promise<{ selectedIds: string[]; photoStates: Record<string, PhotoState> } | null> {
  const res = await fetch(
    `/api/c/selections?token=${encodeURIComponent(token)}&project_id=${encodeURIComponent(projectId)}`,
    { cache: "no-store" }
  );
  if (!res.ok) return null;
  return res.json();
}

async function upsertSelectionApi(
  token: string,
  projectId: string,
  photoId: string,
  state: {
    rating?: number | null;
    comment?: string | null;
    /** 생략하면 서버가 기존 선택 상태를 그대로 유지한다 (별점/코멘트만 저장할 때). */
    is_selected?: boolean;
  }
) {
  const res = await fetch("/api/c/selections", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      token,
      project_id: projectId,
      photo_id: photoId,
      ...state,
    }),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error ?? "Failed");
  }
}

/**
 * 색상 하나를 원자적으로 add/remove하는 RPC를 호출한다. 색상은 다중 선택 배열
 * 필드라, 전체 배열을 통째로 재전송하는 방식은 두 세션이 동시에 다른 색을 추가하면
 * 한쪽이 완전히 유실되는 lost-update가 있다 — 서버가 현재 DB 값 기준으로 원자적으로
 * 병합한 최신 배열을 돌려주고, 그 값을 그대로 신뢰한다.
 */
async function toggleColorApi(
  token: string,
  projectId: string,
  photoId: string,
  color: ColorTag,
  add: boolean
): Promise<ColorTag[]> {
  const res = await fetch("/api/c/selections", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      token,
      project_id: projectId,
      photo_id: photoId,
      color_op: { color, add },
    }),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error ?? "Failed");
  }
  const data = await res.json();
  return (data.colorTags ?? []) as ColorTag[];
}

/**
 * patch에 실제로 존재하는 키만 API payload로 변환한다 — 로컬 캐시 전체를
 * 재전송하면 다른 세션이 그 사이 저장한 값(예: 별점)을 덮어쓰게 되므로,
 * 이번에 바뀐 필드만 서버로 보낸다. color는 toggleColorApi(원자적 add/remove)로만
 * 저장하므로 여기서는 다루지 않는다.
 */
function patchToApiPayload(patch: Partial<Omit<PhotoState, "color">>): {
  rating?: number | null;
  comment?: string | null;
} {
  const payload: { rating?: number | null; comment?: string | null } = {};
  if ("rating" in patch) payload.rating = patch.rating ?? null;
  if ("comment" in patch) payload.comment = patch.comment ?? null;
  return payload;
}

async function confirmProjectApi(token: string, projectId: string) {
  const res = await fetch("/api/c/confirm", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token, project_id: projectId }),
  });
  console.log("[확정] API 응답", res.status, await res.clone().text());
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error ?? "Failed");
  }
}
import type { StarRating, ColorTag, PhotoGroupInfo } from "@/types";

const ALL_COLORS: readonly ColorTag[] = ["red", "yellow", "green", "blue", "purple"];

export type PhotoState = {
  rating?: StarRating;
  color?: ColorTag[];
  comment?: string;
};

type SelectionContextValue = {
  project: import("@/types").Project | null;
  photos: import("@/types").Photo[];
  photoGroups: PhotoGroupInfo[];
  selectedIds: Set<string>;
  photoStates: Record<string, PhotoState>;
  Y: number;
  N: number;
  toggle: (photoId: string) => void;
  isSelected: (photoId: string) => boolean;
  updatePhotoState: (photoId: string, patch: Partial<Omit<PhotoState, "color">>) => void;
  toggleColor: (photoId: string, color: ColorTag) => void;
  projectId: string | null;
  projectStatus: string | null;
  loading: boolean;
};

const SelectionContext = createContext<SelectionContextValue | null>(null);

export function useSelection() {
  const ctx = useContext(SelectionContext);
  if (!ctx) throw new Error("useSelection must be used within SelectionProvider");
  return ctx;
}

export function useSelectionOptional() {
  return useContext(SelectionContext);
}

export function SelectionProvider({ children }: { children: React.ReactNode }) {
  const params = useParams();
  const router = useRouter();
  const token = (params?.token as string) ?? "";

  const [project, setProject] = useState<import("@/types").Project | null>(null);
  const [photos, setPhotos] = useState<import("@/types").Photo[]>([]);
  const [photoGroups, setPhotoGroups] = useState<PhotoGroupInfo[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [photoStates, setPhotoStates] = useState<Record<string, PhotoState>>({});
  const [loading, setLoading] = useState(true);

  // toggleColor()가 리렌더 사이클보다 빠른 연속 클릭에서도 항상 최신 색상 상태를 기준으로
  // 다음 값을 계산하도록, React state와 별개로 동기 ref를 둔다(selectedIdsRef와 동일한 이유).
  const photoStatesRef = useRef<Record<string, PhotoState>>({});
  useEffect(() => {
    photoStatesRef.current = photoStates;
  }, [photoStates]);

  // toggle()이 리렌더 사이클보다 빠른 연속 클릭에서도 항상 "지금까지의 모든 호출을 반영한"
  // 진짜 최신 상태를 기준으로 다음 값을 계산하도록, React state와 별개로 동기 ref를 둔다.
  // hydration/poll 병합/리셋 등 다른 경로로 selectedIds가 바뀌는 경우를 위해 아래 effect로도 동기화한다.
  const selectedIdsRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    selectedIdsRef.current = selectedIds;
  }, [selectedIds]);

  // color는 다중 선택 배열 필드라 "color" 단일 키로는 서로 다른 색상의 dirty 상태를
  // 구분할 수 없다 — (photoId, color) 조합별로 관리하기 위해 `color:${ColorTag}` 형태의
  // 동적 키를 함께 쓴다(예: 초록만 이 세션에서 dirty이고 노랑은 다른 세션이 바꾼 경우를 구분).
  type FieldKey = "selected" | "rating" | "comment" | `color:${ColorTag}`;
  // photoId -> 필드별 로컬 변경 횟수(모노토닉 증가). poll이 시작된 시점과 응답을 적용하는
  // 시점 사이에 그 필드가 새로 바뀌었는지 판단하는 기준선이 된다.
  const fieldVersionRef = useRef<Map<string, Partial<Record<FieldKey, number>>>>(new Map());
  const bumpVersion = useCallback((photoId: string, field: FieldKey) => {
    const m = fieldVersionRef.current;
    const cur = m.get(photoId) ?? {};
    m.set(photoId, { ...cur, [field]: (cur[field] ?? 0) + 1 });
  }, []);
  const getVersion = useCallback((photoId: string, field: FieldKey): number => {
    return fieldVersionRef.current.get(photoId)?.[field] ?? 0;
  }, []);

  // poll 응답 도착 순서가 역전돼도(오래된 GET이 더 최신 GET보다 늦게 도착) 항상 최신 poll만
  // 반영되도록 하는 시퀀스 번호. token/projectId가 바뀌면 아래 hydration effect에서 리셋한다.
  const pollSeqRef = useRef(0);
  const appliedPollSeqRef = useRef(0);

  /**
   * is_selected 저장 큐 — photoId당 in-flight 요청을 최대 1개로 직렬화한다.
   * AbortController로는 서버가 이미 받아 처리 중인 UPSERT의 커밋 순서까지는 막을 수
   * 없으므로(클라이언트에서 abort해도 서버 핸들러는 이미 실행 중일 수 있음), 애초에
   * 같은 photoId에 대해 두 번째 요청을 병렬로 내보내지 않는 방식으로 근본 해결한다.
   * desiredSelectedRef는 "지금 사용자가 원하는 최종 상태"만 담고, flush 루프는 매번
   * 그 최신값을 다시 읽어 보낸 뒤, 보낸 뒤에도 값이 그대로면 종료하고 바뀌었으면
   * 최신값으로 즉시 재시도한다 — 중간 상태는 절대 서버에 보내지 않고 합쳐진다.
   */
  const desiredSelectedRef = useRef<Map<string, boolean>>(new Map());
  const selectionFlushingRef = useRef<Set<string>>(new Set());

  const flushSelection = useCallback(
    async (photoId: string) => {
      if (selectionFlushingRef.current.has(photoId)) return; // 이미 도는 루프가 최신값까지 처리한다
      if (!project?.id || !token) return;
      const projectId = project.id;
      selectionFlushingRef.current.add(photoId);
      try {
        for (;;) {
          const target = desiredSelectedRef.current.get(photoId);
          if (target === undefined) break;
          let ok = true;
          try {
            await upsertSelectionApi(token, projectId, photoId, { is_selected: target });
          } catch (e) {
            console.error(e);
            ok = false;
          }
          // 이 요청을 보낸 뒤에도 사용자의 최신 의도가 그대로면(더 안 바뀌었으면) 큐를 비우고 종료.
          // 그 사이 또 바뀌었으면 성공/실패와 무관하게 최신값으로 다시 시도한다.
          if (desiredSelectedRef.current.get(photoId) === target) {
            desiredSelectedRef.current.delete(photoId);
            if (!ok) {
              // 실패했고 그 이후 새 조작이 없었다면, 실제로는 저장되지 않은 값이므로
              // 로컬 낙관적 상태를 서버 실패 이전 상태로 되돌린다(사용자의 최신 의도를
              // 덮어쓰는 게 아니라, 방금 그 시도 자체가 무효였음을 반영하는 것).
              setSelectedIds((prev) => {
                const next = new Set(prev);
                if (target) next.delete(photoId);
                else next.add(photoId);
                return next;
              });
            }
            break;
          }
        }
      } finally {
        selectionFlushingRef.current.delete(photoId);
      }
    },
    [project?.id, token]
  );

  /** 별점/색상/코멘트 저장 큐 — is_selected와 완전히 독립된 별도 직렬화(같은 사진이어도
   *  서로의 진행을 막거나 취소하지 않음, UPSERT가 필드별로 독립 컬럼이라 안전). 여러 필드가
   *  짧은 시간에 연달아 바뀌면 객체를 병합해 누적하고, 한 번의 요청으로 합쳐 보낸다. */
  const desiredPatchRef = useRef<Map<string, Partial<PhotoState>>>(new Map());
  const patchFlushingRef = useRef<Set<string>>(new Set());

  const flushPatch = useCallback(
    async (photoId: string) => {
      if (patchFlushingRef.current.has(photoId)) return;
      if (!project?.id || !token) return;
      const projectId = project.id;
      patchFlushingRef.current.add(photoId);
      try {
        for (;;) {
          const patch = desiredPatchRef.current.get(photoId);
          if (!patch) break;
          const apiPayload = patchToApiPayload(patch);
          try {
            await upsertSelectionApi(token, projectId, photoId, apiPayload);
          } catch (e) {
            console.error(e);
          }
          // 참조 동일성으로 "이 요청을 보낸 뒤 새 병합이 있었는지" 판단한다 —
          // updatePhotoState가 매번 새 객체를 만들어 넣으므로, 그대로면 그 사이 변경 없음.
          if (desiredPatchRef.current.get(photoId) === patch) {
            desiredPatchRef.current.delete(photoId);
            break;
          }
        }
      } finally {
        patchFlushingRef.current.delete(photoId);
      }
    },
    [project?.id, token]
  );

  /**
   * 색상(컬러칩) 저장 큐. color는 다중 선택 배열 필드라 (photoId, color)별 독립 큐로
   * 만들면 같은 사진의 서로 다른 색상 요청이 병렬로 나가 응답 순서가 뒤바뀔 수 있으므로,
   * photoId 하나당 in-flight 요청을 최대 1개로 제한해 대기 중인 모든 색상 의도를
   * 순서대로(직렬로) 처리한다. desiredColorRef에 항목이 남아있다는 사실 자체가 곧
   * 그 (photoId,color)가 아직 서버에 확정 반영되지 않은 dirty 상태라는 뜻이다.
   */
  const desiredColorRef = useRef<Map<string, Map<ColorTag, boolean>>>(new Map());
  const colorFlushingRef = useRef<Set<string>>(new Set());

  const flushColor = useCallback(
    async (photoId: string) => {
      if (colorFlushingRef.current.has(photoId)) return;
      if (!project?.id || !token) return;
      const projectId = project.id;
      colorFlushingRef.current.add(photoId);
      try {
        for (;;) {
          const pending = desiredColorRef.current.get(photoId);
          if (!pending || pending.size === 0) break;
          // 처리할 색 하나를 "확인"만 하고 아직 큐에서 지우지 않는다 — 요청이 진행되는
          // 동안에도 이 (photoId,color)는 계속 dirty로 남아 폴링이 되돌리지 못하게 한다.
          const [color, target] = pending.entries().next().value as [ColorTag, boolean];

          let serverArray: ColorTag[] | null = null;
          let ok = true;
          try {
            serverArray = await toggleColorApi(token, projectId, photoId, color, target);
          } catch (e) {
            console.error(e);
            ok = false;
          }

          // 이 요청을 보낸 뒤에도 이 색에 대한 의도가 그대로면(재클릭 없었으면) true.
          const stillLatest = desiredColorRef.current.get(photoId)?.get(color) === target;

          if (ok && serverArray) {
            // 서버 배열은 "방금 처리한 이 색 하나"에 대해서만 권위 있다. 이 사진에 대해
            // 아직 큐에 남아있는(=아직 안 보낸) 다른 색 의도들을 그 위에 다시 얹어 병합해야,
            // 아직 전송 전인 다른 색 변경이 이번 응답 적용으로 사라지지 않는다. 재클릭으로
            // stillLatest가 false라면 이 색 자체도 서버값 대신 최신 의도를 반영한다.
            const merged = new Set(serverArray);
            if (!stillLatest) {
              const latestForThisColor = desiredColorRef.current.get(photoId)?.get(color);
              if (latestForThisColor !== undefined) {
                if (latestForThisColor) merged.add(color);
                else merged.delete(color);
              }
            }
            for (const [c, on] of desiredColorRef.current.get(photoId)?.entries() ?? []) {
              if (c === color) continue; // 이 색은 위에서 이미 반영함
              if (on) merged.add(c);
              else merged.delete(c);
            }
            const arr = Array.from(merged);
            const colorValue = arr.length ? arr : undefined;
            // ref/실제 state 모두 "color 필드만" 병합 갱신 — 동시에 진행 중일 수 있는
            // rating/comment 갱신(updatePhotoState)을 덮어쓰지 않도록 prev를 기준으로 병합한다.
            photoStatesRef.current = {
              ...photoStatesRef.current,
              [photoId]: { ...photoStatesRef.current[photoId], color: colorValue },
            };
            setPhotoStates((prev) => ({
              ...prev,
              [photoId]: { ...prev[photoId], color: colorValue },
            }));
          }

          if (stillLatest) {
            desiredColorRef.current.get(photoId)?.delete(color);
            if (!ok) {
              // 실패했고 그 이후 새 의도가 없었다면, 이번 시도 자체가 무효이므로
              // 로컬 낙관적 상태를 시도 이전으로 되돌린다.
              const cur = photoStatesRef.current[photoId]?.color ?? [];
              const reverted = target ? cur.filter((c) => c !== color) : [...cur, color];
              const revertedValue = reverted.length ? reverted : undefined;
              photoStatesRef.current = {
                ...photoStatesRef.current,
                [photoId]: { ...photoStatesRef.current[photoId], color: revertedValue },
              };
              setPhotoStates((prev) => ({
                ...prev,
                [photoId]: { ...prev[photoId], color: revertedValue },
              }));
            }
          }
          // stillLatest가 false면 큐에 그대로 남겨둔 채(dirty 유지) 루프 계속
          // -> 다음 iteration에서 최신 의도를 재시도한다.
        }
      } finally {
        colorFlushingRef.current.delete(photoId);
      }
    },
    [project?.id, token]
  );

  const toggleColor = useCallback(
    (photoId: string, color: ColorTag) => {
      if (!project?.id || !token) return;
      // photoStatesRef(동기 ref) 기준으로 판단 — React state 클로저 대신,
      // 렌더 전 연속 클릭에도 항상 직전 클릭의 결과를 보고 판단한다.
      const cur = photoStatesRef.current[photoId]?.color ?? [];
      const nextOn = !cur.includes(color);
      const nextColors = nextOn
        ? [...cur.filter((c) => c !== color), color]
        : cur.filter((c) => c !== color);
      const colorValue = nextColors.length ? nextColors : undefined;

      // 다음 클릭(리렌더 전이라도)이 이 결과를 즉시 보게 한다. rating/comment 등 다른 필드는
      // 건드리지 않고 color 필드만 병합 갱신한다(동시 진행 중인 updatePhotoState와 충돌 방지).
      photoStatesRef.current = {
        ...photoStatesRef.current,
        [photoId]: { ...photoStatesRef.current[photoId], color: colorValue },
      };
      // 낙관적 UI 변경보다 먼저 버전/큐를 갱신 — poll의 dirty 스냅샷이 이 순간을 놓치지 않도록.
      bumpVersion(photoId, `color:${color}`);
      const m = desiredColorRef.current.get(photoId) ?? new Map<ColorTag, boolean>();
      m.set(color, nextOn);
      desiredColorRef.current.set(photoId, m);

      setPhotoStates((prev) => ({
        ...prev,
        [photoId]: { ...prev[photoId], color: colorValue },
      }));
      flushColor(photoId);
    },
    [project?.id, token, flushColor, bumpVersion]
  );

  useEffect(() => {
    if (!token) {
      setProject(null);
      setPhotos([]);
      setPhotoGroups([]);
      setSelectedIds(new Set());
      setPhotoStates({});
      setLoading(false);
      return;
    }
    desiredSelectedRef.current = new Map();
    selectionFlushingRef.current = new Set();
    desiredPatchRef.current = new Map();
    patchFlushingRef.current = new Set();
    desiredColorRef.current = new Map();
    colorFlushingRef.current = new Set();
    fieldVersionRef.current = new Map();
    pollSeqRef.current = 0;
    appliedPollSeqRef.current = 0;
    selectedIdsRef.current = new Set();
    photoStatesRef.current = {};
    let cancelled = false;
    setLoading(true);
    fetchCustomerPhotos(token)
      .then((data) => {
        if (cancelled) return;
        setProject(data.project ?? null);
        setPhotos(data.photos ?? []);
        setPhotoGroups(data.photoGroups ?? []);
        setSelectedIds(new Set(data.selectedIds ?? []));
        setPhotoStates(data.photoStates ?? {});
        photoStatesRef.current = data.photoStates ?? {};
      })
      .catch((e) => {
        if (!cancelled) console.error(e);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [token]);

  const updatePhotoState = useCallback(
    (photoId: string, patch: Partial<Omit<PhotoState, "color">>) => {
      // 낙관적 UI 변경보다 먼저 버전/큐를 갱신 — poll의 dirty 스냅샷이 이 순간을 놓치지 않도록.
      (Object.keys(patch) as Array<"rating" | "comment">).forEach((key) =>
        bumpVersion(photoId, key)
      );
      if (project?.id && token) {
        // 병렬로 새 요청을 쏘지 않고 큐에 병합만 해둔다 — flushPatch가 in-flight 요청이
        // 끝난 뒤 최신 병합본을 다시 확인해 필요하면 한 번 더 보낸다(직렬화/coalescing).
        const existing = desiredPatchRef.current.get(photoId) ?? {};
        desiredPatchRef.current.set(photoId, { ...existing, ...patch });
      }

      // setState 업데이터는 React가 순수성 검증을 위해 두 번 호출할 수 있으므로(Strict Mode 등),
      // 그 안에서 직접 fetch를 실행하면 매번 API가 2번씩 나간다. 업데이터는 로컬 표시용 상태
      // 계산만 하고, 실제 서버 저장은 바뀐 필드(patch)만 골라 setState 호출이 끝난 뒤 한 번만 보낸다.
      setPhotoStates((prev) => {
        const prevPhoto = prev[photoId] ?? {};
        const merged: PhotoState = { ...prevPhoto, ...patch };
        // `rating: undefined`만으로는 스프레드가 이전 값을 덮어쓰지 않는 경우가 있어 명시 제거
        if ("rating" in patch && patch.rating === undefined) {
          delete merged.rating;
        }
        photoStatesRef.current = { ...photoStatesRef.current, [photoId]: merged };
        return { ...prev, [photoId]: merged };
      });

      if (project?.id && token) flushPatch(photoId);
    },
    [project?.id, token, flushPatch, bumpVersion]
  );

  const toggle = useCallback(
    (photoId: string) => {
      if (!project?.id || !token) return;
      const requiredCount = project.requiredCount;
      // React state(selectedIds)의 클로저 값 대신 항상 최신인 selectedIdsRef를 기준으로 삼는다 —
      // 그래야 리렌더 사이클보다 빠른 연속 클릭에서도 매 클릭이 직전 클릭의 결과를 보고 판단한다.
      const current = selectedIdsRef.current;
      const isSelected = current.has(photoId);
      // 이미 목표 장수(N)를 채운 상태면 새 사진은 추가 선택할 수 없다 —
      // 그렇지 않으면 고객이 N장을 넘겨 선택해도 확정 버튼이 계속 비활성화된 채로 남는다.
      if (!isSelected && requiredCount > 0 && current.size >= requiredCount) {
        return;
      }
      const nextIsSelected = !isSelected;
      const next = new Set(current);
      if (isSelected) next.delete(photoId);
      else next.add(photoId);

      // 다음 클릭(리렌더 전이라도)이 이 결과를 즉시 보게 한다.
      selectedIdsRef.current = next;
      // 낙관적 UI 변경보다 먼저 버전/큐를 갱신 — poll의 dirty 스냅샷이 이 순간을 놓치지 않도록.
      bumpVersion(photoId, "selected");
      // is_selected만 명시적으로 바꾼다 — 별점/코멘트/색상은 건드리지 않고 그대로 유지한다.
      // 병렬 요청 대신 큐에 최신 의도만 갱신 — flushSelection이 photoId당 요청을
      // 최대 1개로 직렬화하고, 완료 후 의도가 그대로면 종료, 바뀌었으면 최신값으로 재시도한다.
      desiredSelectedRef.current.set(photoId, nextIsSelected);

      setSelectedIds(next);
      flushSelection(photoId);
    },
    [project?.id, project?.requiredCount, token, flushSelection, bumpVersion]
  );

  const isSelected = useCallback(
    (photoId: string) => selectedIds.has(photoId),
    [selectedIds]
  );

  const Y = selectedIds.size;
  const N = project?.requiredCount ?? 0;
  const projectId = project?.id ?? null;
  const projectStatus = project?.status ?? null;

  // 다른 세션이 저장한 변경사항을 반영하기 위한 폴링. 필드별(selected/rating/color/comment)
  // 로컬 버전 + dirty(저장 큐에 아직 남아있는 의도) 상태를 GET을 보내는 "시작 시점"에 스냅샷해두고,
  // 응답이 도착했을 때 그 스냅샷과 비교한다 — 시작 시점과 적용 시점 둘 다 dirty가 아니고 버전도
  // 그대로일 때만 서버값을 적용한다. poll 시퀀스 번호로 오래된 응답이 더 최신 응답보다 늦게
  // 도착해도 적용되지 않도록 막는다.
  useEffect(() => {
    if (!token || !projectId) return;
    if (projectStatus !== "selecting" && projectStatus !== "preparing") return;
    let cancelled = false;
    const POLL_MS = 5000;

    const isSelectedDirty = (photoId: string) => desiredSelectedRef.current.has(photoId);
    const isPatchFieldDirty = (photoId: string, field: "rating" | "comment") => {
      const p = desiredPatchRef.current.get(photoId);
      return !!p && field in p;
    };
    const isColorDirty = (photoId: string, color: ColorTag) =>
      desiredColorRef.current.get(photoId)?.has(color) ?? false;

    const poll = async () => {
      if (cancelled || document.hidden) return;
      const mySeq = ++pollSeqRef.current;
      // GET을 보내기 "직전" 스냅샷 — 이 GET이 떠 있는 동안 로컬에서 뭔가 바뀌었는지의 기준선.
      const versionSnapshot = new Map(
        Array.from(fieldVersionRef.current.entries()).map(([id, v]) => [id, { ...v }])
      );
      const dirtySnapshotSelected = new Set(desiredSelectedRef.current.keys());
      const dirtySnapshotPatch = new Map(
        Array.from(desiredPatchRef.current.entries()).map(([id, p]) => [id, new Set(Object.keys(p))])
      );
      const dirtySnapshotColor = new Map(
        Array.from(desiredColorRef.current.entries()).map(([id, m]) => [id, new Set(m.keys())])
      );

      const data = await fetchSelectionsPoll(token, projectId);
      if (cancelled || !data) return;
      // 이 응답보다 이미 더 최신 poll이 적용됐으면 이 응답 자체를 폐기(응답 순서 역전 방지)
      if (mySeq <= appliedPollSeqRef.current) return;
      appliedPollSeqRef.current = mySeq;

      const serverSelected = new Set(data.selectedIds);
      setSelectedIds((prev) => {
        const next = new Set(prev);
        for (const photoId of new Set([...serverSelected, ...prev])) {
          const versionOk =
            getVersion(photoId, "selected") === (versionSnapshot.get(photoId)?.selected ?? 0);
          const dirtyAtStart = dirtySnapshotSelected.has(photoId);
          const dirtyNow = isSelectedDirty(photoId);
          if (!versionOk || dirtyAtStart || dirtyNow) continue; // 로컬 값 유지
          if (serverSelected.has(photoId)) next.add(photoId);
          else next.delete(photoId);
        }
        return next;
      });

      const serverStates = data.photoStates;
      setPhotoStates((prev) => {
        const next = { ...prev };
        for (const photoId of new Set([...Object.keys(serverStates), ...Object.keys(prev)])) {
          const local: PhotoState = { ...(next[photoId] ?? {}) };
          (["rating", "comment"] as const).forEach((field) => {
            const versionOk =
              getVersion(photoId, field) === (versionSnapshot.get(photoId)?.[field] ?? 0);
            const dirtyAtStart = dirtySnapshotPatch.get(photoId)?.has(field) ?? false;
            const dirtyNow = isPatchFieldDirty(photoId, field);
            if (!versionOk || dirtyAtStart || dirtyNow) return; // 이 필드만 로컬값 유지
            const sv = serverStates[photoId];
            if (sv && field in sv) {
              (local as Record<string, unknown>)[field] = sv[field];
            } else {
              delete (local as Record<string, unknown>)[field];
            }
          });

          // color는 다중 선택 배열 필드라 색상 하나 단위로 병합한다 — 이 세션이 방금 바꿨거나
          // 바꾸는 중인 색만 로컬 값을 유지하고, 나머지 색은 서버가 돌려준 최신 배열을 그대로
          // 반영한다(다른 세션이 그 사이 추가/제거한 색을 놓치지 않으면서, 이 세션의 아직 저장
          // 되지 않은 변경은 폴링이 되돌리지 않는다).
          const nextColors = new Set(local.color ?? []);
          ALL_COLORS.forEach((color) => {
            const key: FieldKey = `color:${color}`;
            const versionOk =
              getVersion(photoId, key) === (versionSnapshot.get(photoId)?.[key] ?? 0);
            const dirtyAtStart = dirtySnapshotColor.get(photoId)?.has(color) ?? false;
            const dirtyNow = isColorDirty(photoId, color);
            if (!versionOk || dirtyAtStart || dirtyNow) return; // 이 색상만 로컬값 유지
            const serverHasColor = serverStates[photoId]?.color?.includes(color) ?? false;
            if (serverHasColor) nextColors.add(color);
            else nextColors.delete(color);
          });
          if (nextColors.size > 0) local.color = Array.from(nextColors);
          else delete local.color;

          if (Object.keys(local).length > 0) next[photoId] = local;
          else delete next[photoId];
        }
        return next;
      });
    };
    const intervalId = setInterval(poll, POLL_MS);
    const onVisible = () => {
      if (!document.hidden) poll();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      cancelled = true;
      clearInterval(intervalId);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [token, projectId, projectStatus, getVersion]);

  const value = useMemo<SelectionContextValue>(
    () => ({
      project,
      photos,
      photoGroups,
      selectedIds,
      photoStates,
      Y,
      N,
      toggle,
      isSelected,
      updatePhotoState,
      toggleColor,
      projectId,
      projectStatus,
      loading,
    }),
    [
      project,
      photos,
      photoGroups,
      selectedIds,
      photoStates,
      Y,
      N,
      toggle,
      isSelected,
      updatePhotoState,
      toggleColor,
      projectId,
      projectStatus,
      loading,
    ]
  );

  return (
    <SelectionContext.Provider value={value}>
      {children}
    </SelectionContext.Provider>
  );
}

/** 갤러리/뷰어 페이지에서 하단 확정 바를 보여줄 때 사용. */
export function SelectionConfirmBar() {
  const ctx = useContext(SelectionContext);
  const router = useRouter();
  const params = useParams();
  const token = (params?.token as string) ?? "";
  const [showConfirmModal, setShowConfirmModal] = useState(false);

  if (!ctx) return null;
  const status = ctx.project?.status;
  if (status !== "selecting" && status !== "preparing") return null;

  const { project, Y, N, projectId } = ctx;
  const canConfirm = Y === N;

  const handleFinalConfirm = useCallback(async () => {
    console.log("[확정] 버튼 클릭됨");
    if (!projectId || !token) return;
    try {
      console.log("[확정] API 호출 시작", token);
      await confirmProjectApi(token, projectId);
      setShowConfirmModal(false);
      console.log("[확정] 성공 분기 진입, 이동 시작");
      router.push(`/c/${token}/confirmed`);
      window.location.href = `/c/${token}/confirmed`;
    } catch (e) {
      console.log("[확정] 실패 분기 진입", e);
      console.error(e);
      const msg = e instanceof Error ? e.message : String(e);
      if (msg.includes("Project is not in selecting status")) {
        // 서버 상태와 로컬 상태가 어긋난 경우 최신 상태를 재조회 후 올바른 화면으로 이동
        try {
          const latest = await fetchCustomerPhotos(token);
          const latestStatus = latest?.project?.status as string | undefined;
          setShowConfirmModal(false);
          if (latestStatus === "confirmed") {
            window.location.href = `/c/${token}/confirmed`;
            return;
          }
          if (
            latestStatus === "editing" ||
            latestStatus === "reviewing_v1" ||
            latestStatus === "reviewing_v2"
          ) {
            window.location.href = `/c/${token}/locked`;
            return;
          }
          if (latestStatus === "delivered") {
            window.location.href = `/c/${token}/delivered`;
            return;
          }
        } catch (refreshError) {
          console.error("[확정] 상태 재조회 실패", refreshError);
        }
      }
    }
  }, [token, projectId, router]);

  return (
    <>
      <div className="fixed bottom-0 left-0 right-0 z-20 border-t border-border bg-surface-raised/95 p-4 backdrop-blur">
        <div className="mx-auto flex max-w-4xl flex-col gap-3">
          <div className="flex items-center justify-between">
            <span className="font-mono text-sm text-muted-foreground">
              선택 {Y} / {N}
            </span>
            {Y < N && (
              <span className="text-sm text-danger">
                {N - Y}개 더 선택 필요
              </span>
            )}
            {Y === N && (
              <span className="text-sm text-success">
                ✅ 정확히 {N}장 선택됨
              </span>
            )}
            {Y > N && (
              <span className="text-sm text-warning">
                {N}장 초과 선택됨
              </span>
            )}
          </div>
          <ProgressBar
            value={Y}
            max={N}
            variant={Y === N ? "success" : Y < N ? "danger" : "warning"}
          />
          <div className="flex justify-end">
            <Button
              variant="primary"
              disabled={!canConfirm}
              onClick={() => {
                console.log("[확정] 바 버튼 클릭됨 (모달 열림)", { canConfirm, Y, N });
                setShowConfirmModal(true);
              }}
            >
              최종확정
            </Button>
          </div>
        </div>
      </div>
      {showConfirmModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
          <div className="w-full max-w-sm rounded-xl border border-border bg-surface-raised p-6">
            <h3 className="text-lg font-semibold text-foreground">최종확정</h3>
            <p className="mt-2 text-sm text-muted-foreground">
              정말 이 {N}장으로 선택을 완료하시겠습니까?
            </p>
            <div className="mt-4 flex gap-2">
              <Button
                variant="outline"
                className="flex-1"
                onClick={() => setShowConfirmModal(false)}
              >
                취소
              </Button>
              <Button
                variant="primary"
                className="flex-1"
                onClick={() => {
                  console.log("[확정] 모달 버튼 클릭됨", { canConfirm });
                  handleFinalConfirm();
                }}
                disabled={!canConfirm}
              >
                최종확정
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
