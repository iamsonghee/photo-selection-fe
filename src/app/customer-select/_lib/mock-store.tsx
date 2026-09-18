"use client";

/**
 * 고객 직접 셀렉 — 단계 5(목업 기반 프론트 구현) 전용 임시 저장소.
 *
 * 실제 API/DB 연동 전이라 모든 상태를 브라우저 sessionStorage에만 보관한다(새로고침에는
 * 살아남고, 탭을 닫으면 사라짐). 여기서 만든 데이터 모양(Photo/ColorTag/StarRating)은
 * 기존 `@/types`와 `@/lib/gallery-filter`가 그대로 소비할 수 있는 형태로 맞춰서,
 * 실제 연동 단계(단계 6)에서 이 store만 실제 API 호출로 바꿔치면 되도록 했다.
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import type { Photo, ColorTag, StarRating } from "@/types";

/** 이번 1차 범위는 참가자를 2명으로 고정한 데모다 — 색 슬롯은 기존 갤러리와 같은 팔레트를 쓴다. */
export const PARTICIPANTS: { id: ColorTag; name: string; hex: string }[] = [
  { id: "red", name: "신랑", hex: "#ef4444" },
  { id: "blue", name: "신부", hex: "#3b82f6" },
];

export type MockComment = string;

export interface MockProject {
  id: string;
  name: string;
  shootType: string;
  target: number;
  photoCount: number;
  uploaded: boolean;
  photos: Photo[];
  selectedIds: string[];
  /** photoId -> { rating, color, comment } — gallery-filter.PhotoStateMap과 같은 모양 */
  photoStates: Record<string, { rating?: StarRating; color?: ColorTag[]; comment?: string }>;
  participantDone: Record<ColorTag, boolean>;
  exported: boolean;
}

const STORAGE_PREFIX = "acut:customer-select:";

function storageKey(projectId: string) {
  return `${STORAGE_PREFIX}${projectId}`;
}

function emptyProject(id: string): MockProject {
  return {
    id,
    name: "",
    shootType: "돌·성장",
    target: 30,
    photoCount: 0,
    uploaded: false,
    photos: [],
    selectedIds: [],
    photoStates: {},
    participantDone: { red: false, blue: false, green: false, yellow: false, purple: false },
    exported: false,
  };
}

/** 사진 800장 등 대량 업로드를 실제로 만들지 않고, 그 결과 모양만 즉시 생성한다.
 *  color/placeholder는 화면 확인용 그라디언트 SVG data URI — 실사진 대신이다. */
export function generateMockPhotos(projectId: string, count: number, startNumber = 3050): Photo[] {
  const photos: Photo[] = [];
  for (let i = 0; i < count; i++) {
    const hue = (i * 47) % 360;
    const svg =
      `data:image/svg+xml,${encodeURIComponent(
        `<svg xmlns="http://www.w3.org/2000/svg" width="240" height="240">` +
        `<rect width="240" height="240" fill="hsl(${hue},38%,72%)"/>` +
        `<rect width="240" height="240" fill="hsl(${hue},30%,40%)" opacity="0.18"/>` +
        `<text x="50%" y="55%" font-family="sans-serif" font-size="42" fill="hsl(${hue},30%,25%)" text-anchor="middle" dominant-baseline="middle">${i + 1}</text>` +
        `</svg>`
      )}`;
    photos.push({
      id: `${projectId}-p${i}`,
      projectId,
      orderIndex: i + 1,
      url: svg,
      previewUrl: svg,
      originalFilename: `IMG_${startNumber + i}.JPG`,
      selected: false,
    });
  }
  return photos;
}

/** 생성 화면(new/page.tsx)이 프로젝트 만들기 직후 남겨두는 임시 값 — 아직 메인 레코드가
 *  없는 새 프로젝트의 이름/촬영유형/목표 수만 담는다. Provider의 하이드레이션 단계에서
 *  한 번만 흡수하고 지운다(§아래 hydrate 참고). */
function draftStorageKey(projectId: string) {
  return `${STORAGE_PREFIX}draft:${projectId}`;
}

function loadProject(id: string): MockProject {
  if (typeof window === "undefined") return emptyProject(id);
  try {
    const raw = window.sessionStorage.getItem(storageKey(id));
    if (!raw) return emptyProject(id);
    const parsed = JSON.parse(raw) as MockProject;
    return { ...emptyProject(id), ...parsed };
  } catch {
    return emptyProject(id);
  }
}

/** 클라이언트 마운트 시 한 번에: 저장된 프로젝트를 읽고, 아직 이름이 없으면(=방금 생성 화면을
 *  거쳐온 새 프로젝트) 생성 화면이 남긴 draft를 그 자리에서 합쳐 반환한다. 두 개의 별도 effect로
 *  나누면(Provider가 프로젝트를 읽는 effect + 페이지가 draft를 적용하는 effect) 부모/자식 effect
 *  실행 순서 때문에 한쪽이 다른 쪽의 갱신을 덮어쓰는 경합이 생긴다 — 그래서 한 함수에서 원자적으로
 *  처리한다. */
function hydrateProject(id: string): MockProject {
  const loaded = loadProject(id);
  if (loaded.name || typeof window === "undefined") return loaded;
  try {
    const draftKey = draftStorageKey(id);
    const raw = window.sessionStorage.getItem(draftKey);
    if (!raw) return loaded;
    const draft = JSON.parse(raw) as { name?: string; shootType?: string; target?: number };
    window.sessionStorage.removeItem(draftKey);
    return {
      ...loaded,
      name: draft.name ?? loaded.name,
      shootType: draft.shootType ?? loaded.shootType,
      target: draft.target ?? loaded.target,
    };
  } catch {
    return loaded;
  }
}

function saveProject(project: MockProject) {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(storageKey(project.id), JSON.stringify(project));
  } catch {
    /* 저장소 접근 불가(시크릿 모드 등) — 이번 세션 안에서는 메모리 상태로만 계속 동작 */
  }
}

interface StoreValue {
  project: MockProject;
  /** sessionStorage에서 실제 값을 읽어 들이기 전(서버 렌더 직후 첫 프레임)이면 false.
   *  이 값이 false인 동안 project는 항상 emptyProject라 화면에 그대로 쓰면 안 된다. */
  hydrated: boolean;
  currentIdentity: ColorTag;
  setCurrentIdentity: (id: ColorTag) => void;
  update: (patch: Partial<MockProject> | ((prev: MockProject) => Partial<MockProject>)) => void;
  toggleSelect: (photoId: string) => void;
  toggleLike: (photoId: string, identity: ColorTag) => void;
  setStar: (photoId: string, star: StarRating | 0) => void;
  setComment: (photoId: string, text: string) => void;
  toggleDone: (identity: ColorTag) => void;
  reset: () => void;
}

const StoreContext = createContext<StoreValue | null>(null);

export function CustomerSelectStoreProvider({
  projectId,
  children,
}: {
  projectId: string;
  children: React.ReactNode;
}) {
  // 초기 상태는 서버(SSR)와 클라이언트 첫 렌더가 항상 같은 값(emptyProject)이어야 한다 —
  // sessionStorage는 클라이언트에만 있으므로, useState 초기화 함수 안에서 바로 읽으면
  // 서버가 그린 HTML과 클라이언트가 처음 그리는 내용이 달라져 하이드레이션 불일치 에러가 난다.
  // 실제 값은 아래 mount effect에서 한 번만 읽어 들인다.
  const [project, setProject] = useState<MockProject>(() => emptyProject(projectId));
  const [currentIdentity, setCurrentIdentity] = useState<ColorTag>("red");
  const [hydrated, setHydrated] = useState(false);
  const hydratedProjectIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (hydratedProjectIdRef.current === projectId) return;
    hydratedProjectIdRef.current = projectId;
    // sessionStorage(브라우저 전용)를 읽어 초기 상태를 채우는 하이드레이션 전용 effect다 —
    // 위 useState를 SSR과 같은 값으로 시작시켜 놓고 마운트 직후 딱 한 번만(ref로 가드) 실제 값으로
    // 갈아 끼우는 의도된 패턴이라 setState-in-effect 경고를 여기서만 끈다.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setProject(hydrateProject(projectId));
    setHydrated(true);
  }, [projectId]);

  useEffect(() => {
    // 하이드레이션 전에는 아직 emptyProject 상태다 — 이 시점에 저장하면 실제 저장된 값을
    // 빈 값으로 덮어써 버리므로, 실제 값을 읽어 들인 뒤부터만 저장한다.
    if (!hydrated) return;
    saveProject(project);
  }, [project, hydrated]);

  const update = useCallback(
    (patch: Partial<MockProject> | ((prev: MockProject) => Partial<MockProject>)) => {
      setProject((prev) => ({ ...prev, ...(typeof patch === "function" ? patch(prev) : patch) }));
    },
    []
  );

  const toggleSelect = useCallback((photoId: string) => {
    setProject((prev) => {
      const has = prev.selectedIds.includes(photoId);
      return {
        ...prev,
        selectedIds: has ? prev.selectedIds.filter((id) => id !== photoId) : [...prev.selectedIds, photoId],
      };
    });
  }, []);

  const toggleLike = useCallback((photoId: string, identity: ColorTag) => {
    setProject((prev) => {
      const current = prev.photoStates[photoId]?.color ?? [];
      const has = current.includes(identity);
      const nextColor = has ? current.filter((c) => c !== identity) : [...current, identity];
      return {
        ...prev,
        photoStates: {
          ...prev.photoStates,
          [photoId]: { ...prev.photoStates[photoId], color: nextColor },
        },
      };
    });
  }, []);

  const setStar = useCallback((photoId: string, star: StarRating | 0) => {
    setProject((prev) => ({
      ...prev,
      photoStates: {
        ...prev.photoStates,
        [photoId]: { ...prev.photoStates[photoId], rating: star === 0 ? undefined : star },
      },
    }));
  }, []);

  const setComment = useCallback((photoId: string, text: string) => {
    setProject((prev) => ({
      ...prev,
      photoStates: {
        ...prev.photoStates,
        [photoId]: { ...prev.photoStates[photoId], comment: text.trim() || undefined },
      },
    }));
  }, []);

  const toggleDone = useCallback((identity: ColorTag) => {
    setProject((prev) => ({
      ...prev,
      participantDone: { ...prev.participantDone, [identity]: !prev.participantDone[identity] },
    }));
  }, []);

  const reset = useCallback(() => {
    const fresh = emptyProject(projectId);
    setProject(fresh);
    saveProject(fresh);
  }, [projectId]);

  const value = useMemo<StoreValue>(
    () => ({ project, hydrated, currentIdentity, setCurrentIdentity, update, toggleSelect, toggleLike, setStar, setComment, toggleDone, reset }),
    [project, hydrated, currentIdentity, update, toggleSelect, toggleLike, setStar, setComment, toggleDone, reset]
  );

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

export function useCustomerSelectStore() {
  const ctx = useContext(StoreContext);
  if (!ctx) throw new Error("useCustomerSelectStore must be used within CustomerSelectStoreProvider");
  return ctx;
}

/* ── 파생 계산 — 실제 API 연동 후에도 이 규칙은 그대로 재사용 가능(순수 함수) ── */

export function reviewedPhotoIds(project: MockProject): string[] {
  const set = new Set<string>(project.selectedIds);
  Object.entries(project.photoStates).forEach(([id, s]) => {
    if (s.rating || s.comment || (s.color && s.color.length > 0)) set.add(id);
  });
  return Array.from(set);
}

export function likedBy(project: MockProject, identity: ColorTag): string[] {
  return Object.entries(project.photoStates)
    .filter(([, s]) => s.color?.includes(identity))
    .map(([id]) => id);
}

export function likedByEither(project: MockProject): string[] {
  const set = new Set<string>();
  PARTICIPANTS.forEach((p) => likedBy(project, p.id).forEach((id) => set.add(id)));
  return Array.from(set);
}

export function likedByAll(project: MockProject): string[] {
  return likedByEither(project).filter((id) => PARTICIPANTS.every((p) => project.photoStates[id]?.color?.includes(p.id)));
}

export function disagreementIds(project: MockProject): string[] {
  const both = new Set(likedByAll(project));
  return likedByEither(project).filter((id) => !both.has(id));
}

/** 둘 다 찜한 사진 ÷ 하나라도 찜한 사진. 아직 아무도 안 찜했으면 null(표시 안 함). */
export function tasteMatchPct(project: MockProject): number | null {
  const either = likedByEither(project).length;
  if (either === 0) return null;
  return Math.round((likedByAll(project).length / either) * 100);
}

export function bothDone(project: MockProject): boolean {
  return PARTICIPANTS.every((p) => project.participantDone[p.id]);
}

export function requestedPhotoIds(project: MockProject): string[] {
  return Object.entries(project.photoStates)
    .filter(([, s]) => !!s.comment)
    .map(([id]) => id);
}
