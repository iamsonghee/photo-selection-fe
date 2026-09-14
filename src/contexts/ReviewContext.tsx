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
import { useParams } from "next/navigation";
import type { ReviewStatus } from "@/types";
import type { ReviewPhotoItem } from "@/lib/customer-api-server";
import { normalizeReviewComment } from "@/lib/review-submission-validation";
import type { CommentSaveStatus } from "@/lib/comment-save-status";

export type ReviewStateItem = {
  status: ReviewStatus;
  comment?: string | null;
};

type ReviewContextValue = {
  /** 네비게이션 간 유지되는 리뷰 사진 목록 */
  reviewPhotos: ReviewPhotoItem[];
  loadReviewPhotos: (token: string, projectId: string, status: string) => void;
  reviewPhotosLoading: boolean;
  /** photoId → { status, comment } (임시 저장, 갤러리에서 최종 제출 시 사용) */
  reviewState: Record<string, ReviewStateItem>;
  setReview: (photoId: string, status: ReviewStatus, comment?: string | null) => void;
  getReview: (photoId: string) => ReviewStateItem | null;
  clearReview: (photoId: string) => void;
  /** 제출 후 로컬 상태 초기화용 */
  resetAll: () => void;
  /** 초안이 저장소에 남아 있는지 — 화면에서 "자동 저장됨"을 표시할 때 쓴다 */
  draftSaved: boolean;
  /** photoId → 서버 저장 진행 상태 — 셀렉 화면의 commentSaveStates와 같은 용도(CommentSaveIndicator) */
  commentSaveStates: Record<string, CommentSaveStatus>;
};

const ReviewContext = createContext<ReviewContextValue | null>(null);

export function useReview() {
  const ctx = useContext(ReviewContext);
  if (!ctx) throw new Error("useReview must be used within ReviewProvider");
  return ctx;
}

export function useReviewOptional() {
  return useContext(ReviewContext);
}

/** 새로고침 시 아직 제출하지 않은 검토(확정/재보정 선택)가 사라지지 않도록 탭 단위로 임시 저장 */
const REVIEW_STATE_PREFIX = "review_state_";

function reviewStateStorageKey(token: string, scope: string) {
  return `${REVIEW_STATE_PREFIX}${token}_${scope}`;
}

/**
 * 검토 초안의 진짜 저장소는 **서버**(`version_review_drafts`)이고, localStorage는 그 **보조**다.
 *
 * 서버에 두는 이유: PC에서 일부를 확정해 두고 나중에 모바일에서 이어 보는 흐름이 실제로 일어난다.
 * 기기마다 상태가 다르면 무엇이 참인지 알 수 없고, 잘못된 상태로 제출될 수 있다.
 * 셀렉이 한 장 고를 때마다 서버에 저장되는 것과 같은 수준으로 맞춘다.
 *
 * localStorage는 두 가지를 맡는다: 첫 화면이 서버 응답을 기다리는 동안 보여줄 값,
 * 그리고 네트워크가 끊겼을 때의 임시 보관. 서버 값이 도착하면 서버가 이긴다.
 */
function readDraft(key: string): string | null {
  try {
    const fromLocal = localStorage.getItem(key);
    if (fromLocal != null) return fromLocal;
    /* sessionStorage 시절에 작성 중이던 초안을 한 번만 옮겨온다 — 배포 시점에 검토 중이던 사람이 잃지 않도록 */
    const fromSession = sessionStorage.getItem(key);
    if (fromSession != null) {
      localStorage.setItem(key, fromSession);
      sessionStorage.removeItem(key);
      return fromSession;
    }
  } catch {
    /* 시크릿 모드 등 저장소 접근 불가 */
  }
  return null;
}

/** 회차가 넘어가면(reviewing_v1 → v2) 지난 회차 초안은 남겨둘 이유가 없다.
 *  토큰은 프로젝트마다 다르므로 같은 토큰의 다른 scope만 정리한다. */
function dropStaleDrafts(token: string, keepKey: string) {
  try {
    const mine = `${REVIEW_STATE_PREFIX}${token}`;
    for (const key of Object.keys(localStorage)) {
      if (key.startsWith(mine) && key !== keepKey) localStorage.removeItem(key);
    }
  } catch {
    /* 저장소 접근 불가 */
  }
}

function normalizeStoredReviewState(value: unknown): Record<string, ReviewStateItem> {
  if (!value || typeof value !== "object") return {};
  return Object.fromEntries(
    Object.entries(value as Record<string, ReviewStateItem>).map(([photoId, item]) => [
      photoId,
      { ...item, comment: normalizeReviewComment(item?.comment) },
    ]),
  );
}

export function ReviewProvider({ children }: { children: React.ReactNode }) {
  const params = useParams();
  const token = (params?.token as string) ?? "";

  const [reviewPhotos, setReviewPhotos] = useState<ReviewPhotoItem[]>([]);
  const [reviewPhotosLoading, setReviewPhotosLoading] = useState(false);
  const [storageScope, setStorageScope] = useState("");
  const [reviewState, setReviewState] = useState<Record<string, ReviewStateItem>>({});
  /** 저장소를 쓸 수 있는 환경인지 한 번만 확인한다(시크릿 모드 등에서는 "저장됨"이라 말하면 안 된다).
   *  effect에서 setState 하지 않도록 lazy 초기화로 한 번만 판정하고, 표시 여부는 파생값으로 계산한다. */
  const [storageAvailable] = useState(() => {
    try {
      const probe = "__acut_probe__";
      localStorage.setItem(probe, "1");
      localStorage.removeItem(probe);
      return true;
    } catch {
      return false;
    }
  });
  const loadedKeyRef = useRef<string | null>(null);

  /* 서버 동기화용 — 폴링이 도는 프로젝트와, 사진별 photo_version_id(초안 저장 키) */
  const [projectId, setProjectId] = useState("");
  const versionIdByPhotoRef = useRef<Map<string, string>>(new Map());
  /* 로컬이 서버보다 최신인지 판단하는 도구: photoId별 버전과, 아직 저장 중인 값(dirty).
   * 셀렉(SelectionContext)과 같은 방식이되, 검토는 status와 코멘트가 함께 움직여 사진 단위로 충분하다. */
  const versionRef = useRef<Map<string, number>>(new Map());
  const dirtyRef = useRef<Map<string, ReviewStateItem | null>>(new Map());
  const saveTimersRef = useRef<Map<string, number>>(new Map());
  const pollSeqRef = useRef(0);
  const appliedPollSeqRef = useRef(0);

  // 코멘트 자동저장 상태 — 셀렉(SelectionContext)의 commentSaveStates와 같은 패턴:
  // "saved"는 2초 뒤 idle로 되돌아간다(계속 떠 있으면 상시 노출이라 의미가 없다).
  const [commentSaveStates, setCommentSaveStates] = useState<Record<string, CommentSaveStatus>>({});
  const commentSavedTimersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  const setCommentSaveStatus = useCallback((photoId: string, status: CommentSaveStatus) => {
    const existingTimer = commentSavedTimersRef.current.get(photoId);
    if (existingTimer) {
      clearTimeout(existingTimer);
      commentSavedTimersRef.current.delete(photoId);
    }
    setCommentSaveStates((prev) => ({ ...prev, [photoId]: status }));
    if (status === "saved") {
      const timer = setTimeout(() => {
        commentSavedTimersRef.current.delete(photoId);
        setCommentSaveStates((prev) => (prev[photoId] === "saved" ? { ...prev, [photoId]: "idle" } : prev));
      }, 2000);
      commentSavedTimersRef.current.set(photoId, timer);
    }
  }, []);

  const bumpVersion = useCallback((photoId: string) => {
    const next = (versionRef.current.get(photoId) ?? 0) + 1;
    versionRef.current.set(photoId, next);
    return next;
  }, []);

  const loadReviewPhotos = useCallback((token: string, projectId: string, status: string) => {
    const key = `${projectId}:${status}`;
    if (loadedKeyRef.current === key) return;
    if (!token || !projectId) return;
    if (status !== "reviewing_v1" && status !== "reviewing_v2") return;
    loadedKeyRef.current = key;
    setStorageScope(key);
    setProjectId(projectId);
    const storageKey = reviewStateStorageKey(token, key);
    try {
      dropStaleDrafts(token, storageKey);
      // 이전 버전의 회차 구분 없는 임시 데이터는 다른 검토 회차로 섞이지 않게 폐기한다.
      sessionStorage.removeItem(`${REVIEW_STATE_PREFIX}${token}`);
    } catch {
      /* 저장소 접근 불가 */
    }

    /* 사진과 초안을 **함께** 기다렸다가 한 번에 그린다.
     * 예전에는 localStorage 값을 먼저 그리고 서버 값을 나중에 덮었는데, 그 사이(수백 ms)에
     * 이 기기의 옛 판단이 보인다. 다른 기기에서 이미 바꿔 둔 것을 모른 채 그 위에 판단을
     * 덮어쓸 수 있어, "지금 상태를 보고 고른다"는 전제가 깨진다.
     * localStorage는 서버 초안 조회가 실패했을 때만 읽는다(그때는 옛 값이라도 없는 것보다 낫다). */
    setReviewPhotosLoading(true);
    const photosPromise = fetch(`/api/c/review?token=${encodeURIComponent(token)}`)
      .then((res) => (res.ok ? res.json() : null))
      .catch(() => null);
    const draftsPromise = fetch(`/api/c/review/draft?token=${encodeURIComponent(token)}`, { cache: "no-store" })
      .then((res) => (res.ok ? res.json() : null))
      .catch(() => null);

    Promise.all([photosPromise, draftsPromise])
      .then(([data, draftData]) => {
        const photos = (data?.photos ?? []) as ReviewPhotoItem[];
        setReviewPhotos(photos);
        versionIdByPhotoRef.current = new Map(photos.map((p) => [p.id, p.photoVersionId]));

        let seed: Record<string, ReviewStateItem>;
        if (draftData?.drafts) {
          seed = normalizeStoredReviewState(draftData.drafts);
        } else {
          try {
            const raw = readDraft(storageKey);
            seed = raw ? normalizeStoredReviewState(JSON.parse(raw)) : {};
          } catch {
            seed = {};
          }
        }
        /* 이미 제출된 검토는 초안이 없는 사진에만 채운다(초안이 더 최신이다) */
        for (const p of photos) {
          const ex = p.existingReview;
          if (ex && seed[p.id] == null) {
            seed[p.id] = { status: ex.status, comment: normalizeReviewComment(ex.customerComment) };
          }
        }
        setReviewState(seed);
      })
      .finally(() => setReviewPhotosLoading(false));
  }, []);

  useEffect(() => {
    if (!token || !storageScope) return;
    const storageKey = reviewStateStorageKey(token, storageScope);
    try {
      if (Object.keys(reviewState).length === 0) {
        localStorage.removeItem(storageKey);
      } else {
        localStorage.setItem(storageKey, JSON.stringify(reviewState));
      }
    } catch {
      // 저장소 사용 불가(시크릿 모드·용량 초과) — 로컬 state만으로 계속 동작한다
    }
  }, [reviewState, storageScope, token]);

  /* 판단 한 장을 서버에 올린다. 타자마다 보내지 않도록 사진별로 350ms 묶고, 보내는 동안에는
   * dirty로 표시해 폴링이 그 사진을 되돌리지 못하게 한다.
   * status "pending"(판단 취소)은 서버에서 행 삭제로 처리된다 — 행 없음이 곧 미검토다. */
  const queueDraftSave = useCallback((photoId: string, next: ReviewStateItem | null) => {
    if (!token) return;
    dirtyRef.current.set(photoId, next);
    setCommentSaveStatus(photoId, "saving");
    const timers = saveTimersRef.current;
    const pending = timers.get(photoId);
    if (pending) window.clearTimeout(pending);
    timers.set(
      photoId,
      window.setTimeout(() => {
        timers.delete(photoId);
        const photoVersionId = versionIdByPhotoRef.current.get(photoId);
        /* 사진 목록이 아직 안 왔으면 저장 키가 없다 — 로컬(localStorage)에만 남고 다음 판단 때 다시 올라간다 */
        if (!photoVersionId) { dirtyRef.current.delete(photoId); return; }
        const versionAtSend = versionRef.current.get(photoId) ?? 0;
        fetch("/api/c/review/draft", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            token,
            photo_id: photoId,
            photo_version_id: photoVersionId,
            status: next?.status ?? "pending",
            comment: next?.comment ?? null,
          }),
        })
          .then((res) => {
            if (!res.ok) { setCommentSaveStatus(photoId, "error"); return; }
            /* 보내는 사이에 또 바뀌었으면 dirty도, "저장됨" 표시도 아직 이르다 — 뒤따르는 저장이 정리한다 */
            if ((versionRef.current.get(photoId) ?? 0) === versionAtSend) {
              dirtyRef.current.delete(photoId);
              setCommentSaveStatus(photoId, "saved");
            }
          })
          /* 실패해도 로컬 값은 그대로 두고 dirty를 유지한다(폴링이 덮어쓰지 않도록) */
          .catch(() => setCommentSaveStatus(photoId, "error"));
      }, 350),
    );
  }, [token, setCommentSaveStatus]);

  useEffect(() => () => {
    for (const id of saveTimersRef.current.values()) window.clearTimeout(id);
    saveTimersRef.current.clear();
  }, []);

  const setReview = useCallback((photoId: string, status: ReviewStatus, comment?: string | null) => {
    const next: ReviewStateItem = { status, comment: normalizeReviewComment(comment) };
    bumpVersion(photoId);
    setReviewState((prev) => ({ ...prev, [photoId]: next }));
    /* "pending"은 판단 취소라 서버에서는 행을 지운다(위 queueDraftSave 주석) */
    queueDraftSave(photoId, status === "approved" || status === "revision_requested" ? next : null);
  }, [bumpVersion, queueDraftSave]);

  const getReview = useCallback(
    (photoId: string): ReviewStateItem | null => {
      return reviewState[photoId] ?? null;
    },
    [reviewState]
  );

  const clearReview = useCallback((photoId: string) => {
    bumpVersion(photoId);
    setReviewState((prev) => {
      const next = { ...prev };
      delete next[photoId];
      return next;
    });
    queueDraftSave(photoId, null);
  }, [bumpVersion, queueDraftSave]);

  /* 제출 직후 로컬 정리. 서버 초안은 제출 API가 지우므로 여기서 다시 부르지 않는다. */
  const resetAll = useCallback(() => {
    for (const id of saveTimersRef.current.values()) window.clearTimeout(id);
    saveTimersRef.current.clear();
    for (const id of commentSavedTimersRef.current.values()) clearTimeout(id);
    commentSavedTimersRef.current.clear();
    dirtyRef.current.clear();
    versionRef.current.clear();
    setReviewState({});
    setCommentSaveStates({});
  }, []);

  /* 다른 기기가 저장한 판단을 따라잡는 폴링 — 셀렉의 selections 폴링과 같은 주기·같은 규칙이다.
   * GET을 보내기 직전의 버전/ dirty를 스냅샷해 두고, 응답이 왔을 때 그 사이 내가 건드리지 않은
   * 사진에만 서버 값을 적용한다. 응답에 없는 사진은 "판단 취소됨"이므로 로컬에서도 지운다. */
  useEffect(() => {
    if (!token || !projectId) return;
    let cancelled = false;
    const POLL_MS = 5000;

    const poll = async () => {
      if (cancelled || document.hidden) return;
      const mySeq = ++pollSeqRef.current;
      const versionSnapshot = new Map(versionRef.current);
      const dirtySnapshot = new Set(dirtyRef.current.keys());

      let drafts: Record<string, ReviewStateItem> | null = null;
      try {
        const res = await fetch(`/api/c/review/draft?token=${encodeURIComponent(token)}`, { cache: "no-store" });
        if (!res.ok) return;
        const data = await res.json();
        drafts = normalizeStoredReviewState(data?.drafts ?? {});
      } catch {
        return; // 네트워크 실패는 조용히 넘긴다 — 다음 주기에 다시 시도한다
      }
      if (cancelled || !drafts) return;
      if (mySeq <= appliedPollSeqRef.current) return; // 더 최신 응답이 이미 적용됨
      appliedPollSeqRef.current = mySeq;

      const serverDrafts = drafts;
      setReviewState((prev) => {
        const next = { ...prev };
        let changed = false;
        const ids = new Set([...Object.keys(serverDrafts), ...Object.keys(prev)]);
        for (const photoId of ids) {
          const versionOk = (versionRef.current.get(photoId) ?? 0) === (versionSnapshot.get(photoId) ?? 0);
          const dirtyAtStart = dirtySnapshot.has(photoId);
          const dirtyNow = dirtyRef.current.has(photoId);
          if (!versionOk || dirtyAtStart || dirtyNow) continue; // 이 사진은 로컬 값을 지킨다
          const server = serverDrafts[photoId];
          if (server) {
            const local = next[photoId];
            if (local?.status === server.status && (local?.comment ?? null) === (server.comment ?? null)) continue;
            next[photoId] = server;
            changed = true;
          } else if (next[photoId]) {
            delete next[photoId];
            changed = true;
          }
        }
        return changed ? next : prev;
      });
    };

    /* 첫 진입에도 한 번 당겨온다 — 다른 기기에서 이미 판단해 둔 것이 있으면 곧바로 보여야 한다 */
    poll();
    const intervalId = window.setInterval(poll, POLL_MS);
    const onVisible = () => { if (!document.hidden) poll(); };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [token, projectId]);

  const draftSaved = storageAvailable && Object.keys(reviewState).length > 0;

  const value = useMemo<ReviewContextValue>(
    () => ({
      reviewPhotos,
      loadReviewPhotos,
      reviewPhotosLoading,
      reviewState,
      setReview,
      getReview,
      clearReview,
      resetAll,
      draftSaved,
      commentSaveStates,
    }),
    [reviewPhotos, loadReviewPhotos, reviewPhotosLoading, reviewState, setReview, getReview, clearReview, resetAll, draftSaved, commentSaveStates]
  );

  return (
    <ReviewContext.Provider value={value}>
      {children}
    </ReviewContext.Provider>
  );
}
