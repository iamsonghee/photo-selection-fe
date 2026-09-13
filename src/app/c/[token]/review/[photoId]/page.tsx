"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { Check, RefreshCw, Maximize2, X } from "lucide-react";
import { useSelection } from "@/contexts/SelectionContext";
import { useReview } from "@/contexts/ReviewContext";
import { PrevNextButton } from "@/components/PrevNextButton";
import { SelectionConfirmDialog } from "@/components/customer/SelectionConfirmDialog";
import { PhotoPositionBar } from "@/components/customer/PhotoPositionBar";
import { PhotoFilmstrip } from "@/components/customer/PhotoFilmstrip";
import { PhotoFocusOverlay } from "@/components/customer/PhotoFocusOverlay";
import type { ReviewPhotoItem } from "@/lib/customer-api-server";
import { normalizeReviewDeadlineYmd } from "@/lib/format-review-deadline";
import { isReceiptMode } from "@/lib/review-mode";
import { hasShortcutModifier } from "@/lib/keyboard-shortcut-guard";
import { useAdjacentImagePreload } from "@/lib/use-adjacent-image-preload";
import { normalizeReviewComment } from "@/lib/review-submission-validation";
import { triggerSelectionHaptic } from "@/lib/selection-feedback";
import { useHoldPreview } from "@/hooks/useHoldPreview";

/* ── design tokens ── */
const BG_BASE    = "var(--background)";
const BORDER_HI  = "var(--border-strong)";
const MUTED      = "var(--muted-foreground)";
const DIM        = "var(--subtle-foreground)";
const MONO       = "'JetBrains Mono', 'Space Mono', monospace";

export default function ReviewViewerPage() {
  const params  = useParams();
  const router  = useRouter();
  const token   = (params?.token as string) ?? "";
  const photoId = params?.photoId as string;

  const { project, loading: selectionLoading } = useSelection();
  const { reviewPhotos, loadReviewPhotos, reviewPhotosLoading, reviewState, setReview, getReview, resetAll } = useReview();

  const [activePhotoId,    setActivePhotoId]    = useState(photoId);
  const [showSubmitModal,  setShowSubmitModal]  = useState(false);
  const [revisionDraft,    setRevisionDraft]    = useState("");
  const [revisionError,    setRevisionError]    = useState<string | null>(null);
  /* 사유가 비었다는 경고는 "누르자마자"가 아니라 실제로 비운 채 칸을 떠났을 때만 띄운다 —
   * 재보정을 고른 직후엔 아직 적을 기회조차 없었는데 먼저 혼내는 꼴이 된다.
   * 적지 않은 채 제출까지 간 경우는 하단 검토 진행 영역이 해당 사진으로 안내한다. */
  const [reasonNudge,      setReasonNudge]      = useState(false);
  const [submitError,      setSubmitError]      = useState<string | null>(null);
  /* 전송 중에는 모달 버튼을 잠가 이중 제출을 막는다(성공하면 화면이 통째로 바뀌므로 해제는 실패 경로에만 있다) */
  const [submitting,       setSubmitting]       = useState(false);
  const [photographer,     setPhotographer]     = useState<string | null>(null);
  /* 사진 탭/클릭 → 전체화면 집중 보기(셀렉 뷰어와 같은 공통 오버레이) */
  const [focusOpen,        setFocusOpen]        = useState(false);
  const [helpOpen,         setHelpOpen]         = useState(false);
  /* 방금 판단한 사진 — 그 썸네일의 배지만 한 번 튀게 한다(아래 .rvx-badge-pop) */
  const [justJudgedId,     setJustJudgedId]     = useState<string | null>(null);
  /* 필름스트립이 한 화면에 다 들어오면 위치 트랙은 같은 말을 두 번 하는 셈이라 감춘다 */
  const stripRef = useRef<HTMLDivElement>(null);
  const [stripOverflows, setStripOverflows] = useState(true);

  // URL 파라미터가 바뀔 때만 동기화 (브라우저 뒤로가기 등)
  useEffect(() => { setActivePhotoId(photoId); }, [photoId]);

  useEffect(() => {
    if (!token) return;
    fetch(`/api/c/photographer?token=${encodeURIComponent(token)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => data?.name && setPhotographer(data.name))
      .catch(() => {});
  }, [token]);

  useEffect(() => {
    if (!project?.id || !project?.status) return;
    loadReviewPhotos(token, project.id, project.status);
  }, [token, project?.id, project?.status, loadReviewPhotos]);

  /* 남은 재보정이 0이면 고를 수 있는 답이 `확정` 하나뿐이라, 이 화면의 일은 판단이 아니라 감상이다 —
   * 판단 패널을 통째로 걷어내 그만큼 사진에 돌려준다(목록의 수령 모드와 같은 판별식). */
  const receiptMode = project ? isReceiptMode(project) : false;

  const photos       = reviewPhotos;
  const reviewDeadlineDisplay = useMemo(
    () => normalizeReviewDeadlineYmd(project?.reviewDeadline ?? null),
    [project?.reviewDeadline]
  );
  const currentIndex = useMemo(() => photos.findIndex((p) => p.id === activePhotoId), [photos, activePhotoId]);

  const total         = photos.length;
  const approvedCount = useMemo(() => photos.filter((p) => getReview(p.id)?.status === "approved").length, [photos, getReview]);
  const revisionCount = useMemo(() => photos.filter((p) => getReview(p.id)?.status === "revision_requested").length, [photos, getReview]);
  const reviewedCount = approvedCount + revisionCount;
  const pendingCount  = total - approvedCount - revisionCount;
  const allReviewed   = total > 0 && pendingCount === 0;
  /* 재보정은 "무엇을 고쳐달라"가 본문이다. 이유 없는 재보정은 작가가 손댈 수 없으므로 전달을 막는다. */
  const revisionsMissingComment = useMemo(
    () => photos.filter((p) => {
      const r = getReview(p.id);
      return r?.status === "revision_requested" && !(r.comment ?? "").trim();
    }),
    [photos, reviewState], // eslint-disable-line react-hooks/exhaustive-deps
  );
  const canSubmit = allReviewed && revisionsMissingComment.length === 0;
  const current      = currentIndex >= 0 ? photos[currentIndex] : null;
  const prevId       = currentIndex > 0 ? photos[currentIndex - 1]?.id : photos[photos.length - 1]?.id;
  const nextId       = currentIndex < photos.length - 1 && currentIndex >= 0 ? photos[currentIndex + 1]?.id : photos[0]?.id;

  const review     = current ? getReview(current.id) : null;
  const status     = review?.status ?? "pending";
  const isApproved = status === "approved";
  const isRevision = status === "revision_requested";
  const [originalReadyUrl, setOriginalReadyUrl] = useState<string | null>(null);
  const {
    previewActive: holdOriginal,
    consumedRef: photoHoldTriggeredRef,
    beginHold: startPhotoHold,
    moveHold: movePhotoHold,
    endHold: endPhotoHold,
    cancelHold: cancelPhotoHold,
    showPreview: showOriginal,
    hidePreview: hideOriginal,
  } = useHoldPreview({
    enabled: Boolean(current?.originalUrl && originalReadyUrl === current.originalUrl),
    resetKey: current?.id,
  });

  useEffect(() => {
    if (current) {
      const c = review?.comment ?? "";
      setRevisionDraft(c);
      setRevisionError(null);
      setReasonNudge(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current?.id, review?.comment]);

  const navigate = useCallback((id: string) => {
    setActivePhotoId(id);
    window.history.replaceState(null, "", `/c/${token}/review/${id}`);
  }, [token]);

  const goPrev = useCallback(() => { if (prevId) navigate(prevId); }, [prevId, navigate]);
  const goNext = useCallback(() => { if (nextId) navigate(nextId); }, [nextId, navigate]);

  /* 원본 비교가 켜져 리렌더돼도 스와이프 시작점이 0으로 초기화되지 않게 ref에 둔다. */
  const pageTouchStartRef = useRef<{ x: number; y: number } | null>(null);
  const handleTouchStart = (e: React.TouchEvent) => {
    if (e.touches.length !== 1) {
      pageTouchStartRef.current = null;
      return;
    }
    pageTouchStartRef.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
  };
  const handleTouchEnd = (e: React.TouchEvent) => {
    const start = pageTouchStartRef.current;
    pageTouchStartRef.current = null;
    const end = e.changedTouches[0];
    /* 길게 누르기는 원본 비교로 이미 소비됐다. 손을 뗄 때 사진 이동까지 실행하지 않는다. */
    if (!start || !end || photoHoldTriggeredRef.current) return;
    const diffX = start.x - end.clientX;
    const diffY = start.y - end.clientY;
    if (Math.abs(diffX) > 50 && Math.abs(diffX) > Math.abs(diffY) * 1.5) {
      if (diffX > 0) goNext();
      else goPrev();
    }
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (focusOpen) return;
      if (e.isComposing) return;
      if (hasShortcutModifier(e)) return; // Cmd/Ctrl+←/→(방향키), 윈도우 Alt+←/→(뒤로/앞으로 가기)와 겹치지 않게
      /* 도움말이 열려 있으면 Esc는 그것부터 닫는다 — 바로 목록으로 나가면 화면이 두 단계 사라진 것처럼 보인다 */
      if (e.key === "Escape" && helpOpen) { e.preventDefault(); setHelpOpen(false); return; }
      if (e.key === "?") {
        const typing = document.activeElement?.tagName === "TEXTAREA" || document.activeElement?.tagName === "INPUT";
        if (!typing) { e.preventDefault(); setHelpOpen((v) => !v); return; }
      }
      if (e.key === "ArrowLeft")  { e.preventDefault(); goPrev(); }
      if (e.key === "ArrowRight") { e.preventDefault(); goNext(); }
      if (e.key === "Escape")     { e.preventDefault(); router.replace(`/c/${token}/review`); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [focusOpen, goPrev, goNext, router, token, helpOpen]);


  /* 판단 뒤에도 현재 사진에 머문다. 사진이 즉시 바뀌면 사용자가 확정 결과를 확인하기 어렵고,
   * 비슷한 컷에서는 이동 자체를 알아채기 어렵다. 다음 사진은 사용자가 직접 이동한다. */
  /* 눌림 효과는 React state가 아니라 DOM 클래스로 건다 — 탭마다 리렌더를 일으키지 않고,
   * 같은 버튼을 연속으로 눌러도 애니메이션이 매번 처음부터 다시 재생돼야 하기 때문이다. */
  const pressFx = useCallback((event: React.PointerEvent<HTMLElement>) => {
    const el = event.currentTarget;
    el.classList.remove("rvx-pressed");
    void el.offsetWidth; // 리플로우를 강제해야 같은 클래스를 다시 붙였을 때 애니메이션이 재시작된다
    el.classList.add("rvx-pressed");
  }, []);
  const pressFxEnd = useCallback((event: React.AnimationEvent<HTMLElement>) => {
    if (event.animationName === "rvx-press") event.currentTarget.classList.remove("rvx-pressed");
  }, []);

  const handleApprove = useCallback(() => {
    if (!current) return;
    /* 셀렉 뷰어와 같은 공통 유틸(안드로이드 전용 — iOS Safari에는 Vibration API가 없다) */
    triggerSelectionHaptic("change");
    if (isApproved) { setJustJudgedId(null); setReview(current.id, "pending" as "approved"); return; }
    setJustJudgedId(current.id);
    setReview(current.id, "approved");
  }, [current, isApproved, setReview]);

  /* ResizeObserver의 첫 콜백은 비동기라 effect 본문에서 setState를 호출하지 않아도 초기 측정이 된다 */
  useEffect(() => {
    const scroller = stripRef.current?.querySelector<HTMLElement>(".cfs-root");
    if (!scroller || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(() => {
      setStripOverflows(scroller.scrollWidth > scroller.clientWidth + 4);
    });
    observer.observe(scroller);
    return () => observer.disconnect();
  }, [total]);

  // 재보정 버튼 클릭 → 즉시 토글 (선택/해제)
  const openRevisionInline = useCallback(() => {
    if (!current) return;
    triggerSelectionHaptic("change");
    if (isRevision) {
      setJustJudgedId(null);
      setReview(current.id, "pending" as "approved");
      setRevisionDraft("");
      setRevisionError(null);
      setReasonNudge(false);
    } else {
      setJustJudgedId(current.id);
      setRevisionDraft(review?.comment ?? "");
      setReview(current.id, "revision_requested", review?.comment || undefined);
      setRevisionError(null);
    }
  }, [current, isRevision, review, setReview]);

  // Y/R 키보드 단축키 — 확정 / 재보정 (한글 IME에서도 e.code로 물리 키 인식)
  useEffect(() => {
    // 수령 모드에는 판단이 없다 — 단축키가 살아 있으면 화면에 없는 동작이 조용히 일어난다
    if (receiptMode) return;
    const onKey = (e: KeyboardEvent) => {
      if (document.activeElement?.tagName === "INPUT" || document.activeElement?.tagName === "TEXTAREA") {
        return;
      }
      /* Cmd/Ctrl+R(새로고침)·Cmd/Ctrl+Y(맥 크롬/엣지 방문기록) 같은 브라우저 조합키와 겹치지
       * 않게 막는다 — 이게 없어서 맥에서 새로고침(Cmd+R)을 누르면 재보정 버튼이 같이 눌렸다. */
      if (hasShortcutModifier(e)) return;
      if (e.code === "KeyY") {
        e.preventDefault();
        handleApprove();
      } else if (e.code === "KeyR") {
        e.preventDefault();
        openRevisionInline();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [handleApprove, openRevisionInline, receiptMode]);

  /* 원본 비교 단축키 — 라이트룸의 백슬래시 관용구. 누르는 동안만 켜지므로 keyup에서 반드시 끈다.
   * (창을 벗어나 keyup을 놓칠 수 있어 blur에서도 해제한다) */
  useEffect(() => {
    const onDown = (e: KeyboardEvent) => {
      if (e.repeat || e.isComposing) return;
      if (e.code !== "Backslash") return;
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") return;
      e.preventDefault();
      showOriginal();
    };
    const onUp = (e: KeyboardEvent) => { if (e.code === "Backslash") hideOriginal(); };
    const release = () => hideOriginal();
    window.addEventListener("keydown", onDown);
    window.addEventListener("keyup", onUp);
    window.addEventListener("blur", release);
    return () => {
      window.removeEventListener("keydown", onDown);
      window.removeEventListener("keyup", onUp);
      window.removeEventListener("blur", release);
    };
  }, [hideOriginal, showOriginal]);

  // 재보정 상태를 먼저 명시적으로 선택한 뒤 버튼으로 코멘트를 저장한다.
  const handleRevisionSave = useCallback(() => {
    if (!current || !isRevision) return;
    const normalized = normalizeReviewComment(revisionDraft);
    if (revisionDraft.trim() && !normalized) {
      setRevisionError("내용을 확인해 주세요. 한글 자음 한 글자는 코멘트로 저장되지 않습니다.");
      return;
    }
    setReview(current.id, "revision_requested", normalized);
    setRevisionDraft(normalized ?? "");
    setRevisionError(null);
  }, [current, isRevision, revisionDraft, setReview]);

  const handleSubmit = useCallback(async () => {
    if ((!receiptMode && !canSubmit) || photos.length === 0 || !token || submitting) return;
    setSubmitError(null);
    setSubmitting(true);
    try {
    const hasRealIds = photos.some((p) => (p as ReviewPhotoItem).photoVersionId?.length > 0);
    let finalStatus: string | null = null;
    if (hasRealIds) {
      const withVersion = photos.filter((p) => (p as ReviewPhotoItem).photoVersionId);
      const reviews: Array<{
        photo_version_id: string;
        photo_id: string;
        status: "approved" | "revision_requested";
        customer_comment: string | null;
      }> = [];
      for (const p of withVersion) {
        // 마지막 보정본 수령은 갤러리와 동일하게 전체 사진을 확정 제출한다.
        if (receiptMode) {
          reviews.push({ photo_version_id: p.photoVersionId!, photo_id: p.id, status: "approved", customer_comment: null });
          continue;
        }
        const rev = getReview(p.id);
        if (!rev || (rev.status !== "approved" && rev.status !== "revision_requested")) {
          setSubmitError(
            "일부 사진의 검토 선택이 없습니다. 각 장에서 확정 또는 재보정을 선택한 뒤 다시 시도해 주세요."
          );
          setSubmitting(false);
          return;
        }
        reviews.push({
          photo_version_id: (p as ReviewPhotoItem).photoVersionId!,
          photo_id: p.id,
          status: rev.status,
          customer_comment: rev.comment ?? null,
        });
      }
      const res  = await fetch("/api/c/review/submit", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token, reviews }) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { setSubmitError((data && typeof data.error === "string" && data.error) || `서버 오류 (${res.status})`); setSubmitting(false); return; }
      finalStatus = typeof data?.status === "string" ? data.status : null;
    } else {
      const result = !receiptMode && revisionCount > 0 ? "has_revision" : "all_approved";
      const res  = await fetch("/api/c/review-submit", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token, result }) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { setSubmitError((data && typeof data.error === "string" && data.error) || `서버 오류 (${res.status})`); setSubmitting(false); return; }
      finalStatus = typeof data?.status === "string" ? data.status : null;
    }
    resetAll();
    if (finalStatus === "delivered") {
      window.location.replace(`/c/${token}/delivered`);
      return;
    }
    // 재보정이 포함되면 editing_v2 — '셀렉 확정' 문구의 confirmed 대신 잠금 갤러리로
    if (finalStatus === "editing_v2" || finalStatus === "editing") {
      window.location.replace(`/c/${token}/locked`);
      return;
    }
    window.location.replace(`/c/${token}/confirmed`);
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : "제출에 실패했습니다. 다시 시도해 주세요.");
      setSubmitting(false);
    }
  }, [canSubmit, receiptMode, token, revisionCount, photos, getReview, resetAll, submitting]);

  /* 어느 사진에서든 꾹 눌러 원본을 볼 수 있으므로 인접 사진은 원본·보정본을 함께 준비한다 */
  const preloadUrlGroups = useMemo(
    () => photos.map((photo) => [photo.originalUrl, photo.versionUrl]),
    [photos],
  );
  useAdjacentImagePreload(preloadUrlGroups, currentIndex >= 0 ? currentIndex : null, {
    wrap: true,
    desktopBefore: 1,
    desktopAfter: 1,
    desktopMaxDecoded: 6,
    mobileMaxDecoded: 4,
  });

  /* ── guard states ── */
  if (selectionLoading || !project) {
    return (
      <div style={{ display: "flex", minHeight: "100vh", alignItems: "center", justifyContent: "center", background: BG_BASE }}>
        <p style={{ fontFamily: MONO, fontSize: 11, color: DIM, letterSpacing: "0.1em" }}>
          {selectionLoading ? "LOADING…" : "INVALID_TOKEN"}
        </p>
      </div>
    );
  }

  const canShowReview = project.status === "reviewing_v1" || project.status === "reviewing_v2";
  if (!canShowReview) {
    return (
      <div style={{ display: "flex", minHeight: "100vh", alignItems: "center", justifyContent: "center", background: BG_BASE }}>
        <Link href={`/c/${token}/confirmed`} style={{ fontFamily: MONO, fontSize: 11, color: MUTED, border: `1px solid ${BORDER_HI}`, padding: "8px 16px", textDecoration: "none" }}>
          BACK_TO_CONFIRMED
        </Link>
      </div>
    );
  }

  if (!current) {
    if (reviewPhotosLoading || photos.length === 0) {
      return (
        <div style={{ display: "flex", minHeight: "100vh", alignItems: "center", justifyContent: "center", background: BG_BASE }}>
          <p style={{ fontFamily: MONO, fontSize: 11, color: DIM, letterSpacing: "0.1em" }}>LOADING_ASSETS…</p>
        </div>
      );
    }
    // photos loaded but ID mismatch — navigate to first photo
    if (photos[0]) {
      window.history.replaceState(null, "", `/c/${token}/review/${photos[0].id}`);
      setActivePhotoId(photos[0].id);
    }
    return null;
  }

  const versionLabel      = project.status === "reviewing_v2" ? "보정 V2" : "보정 V1";
  /* 파일명은 격자(검토 목록·셀렉 갤러리)에서 걷어내고 상세 한 곳에만 둔다 — 훑어볼 때는 읽지 않지만,
   * 작가에게 "이 사진 다시 봐 주세요"라고 짚어 말할 때 쓰는 유일한 번호다.
   * 규칙은 셀렉 갤러리 `getPhotoDisplayName`과 같다: 원본 파일명 → URL에서 추출 → 순번.
   * 자리는 앱바가 아니라 **사진 좌상단 회차 라벨 옆**이다 — 앱바는 이미 두 줄(프로젝트명·요약)이라
   * 세 줄이 되면 높이가 늘고, 그 높이는 사진이 차지할 공간을 그대로 깎는다. */
  const displayName = (() => {
    const name = current.originalFilename?.trim();
    if (name) return name.split("/").pop() ?? name;
    const fromUrl = (current.versionUrl ?? current.originalUrl ?? "").split("?")[0].split("/").pop();
    if (fromUrl) return decodeURIComponent(fromUrl);
    return `#${currentIndex + 1}`;
  })();
  const revisionRemaining = Math.max(0, (project.maxRevisionCount ?? 0) - (project.revisionRound ?? 0));
  const canRequestRevision = revisionRemaining > 0;
  /* 비교는 "누르고 있는 동안 원본" 방식이다(라이트룸 관용구) — 3단 토글(원본/나란히/보정)은
   * 무엇을 보고 있는지 계속 기억해야 하는데, 꾹 누르기는 손을 떼면 원래대로라 상태가 남지 않는다. */
  const compareOriginal = holdOriginal && originalReadyUrl === current.originalUrl;
  /* 보정본과 원본을 모두 마운트하고 opacity만 바꾼다. src 자체를 교체하면 디코드가 끝난
   * 원본이어도 브라우저 합성 시점에 빈 프레임이 끼어 비교가 깜빡일 수 있다. */
  const stageUrl = current.versionUrl || current.originalUrl;
  const originalCompareUrl = current.originalUrl;

  const filmstripItems = photos.map((p) => ({
    id: p.id,
    url: p.versionUrl || p.originalUrl || "",
    label: p.originalFilename || "사진",
  }));

  const seekToRatio = (ratio: number) => {
    if (photos.length === 0) return;
    const clamped = Math.min(1, Math.max(0, ratio));
    const target = photos[Math.round(clamped * (photos.length - 1))];
    if (target && target.id !== activePhotoId) navigate(target.id);
  };

  return (
    <>
      <style>{`
        /* ── 보정본 검토 ──
         * 셀렉 뷰어와 같은 셸을 쓴다: 사진(가변) + 우측 판단 패널(고정) + 하단 필름스트립.
         * 예전에는 좌측 썸네일 사이드바 + 모바일/PC 레이아웃 두 벌이었는데, PC에서 사진이 세로에
         * 갇히고(무대 높이의 98%) 가로가 37% 남는 상황이라 컨트롤을 옆으로 보내는 편이 사진에 유리하다. */
        .rvx-root {
          position: fixed; inset: 0; overflow: hidden;
          display: flex; flex-direction: column;
          --viewer-surface: #191c1f;
          --viewer-surface-raised: #24282c;
          --viewer-stage: #0f1113;
          --review-panel-width: 320px;
          background: var(--viewer-stage); color: #fff;
          font-family: Pretendard, 'Noto Sans KR', sans-serif;
        }
        .rvx-appbar {
          flex-shrink: 0; height: 68px; padding: 0 24px;
          display: flex; align-items: center; gap: 14px;
          background: var(--viewer-surface); border-bottom: 0;
        }
        .rvx-close {
          width: 32px; height: 32px; flex: 0 0 32px; margin-left: -6px;
          display: grid; place-items: center;
          border: 0; background: transparent; color: #fff; cursor: pointer; border-radius: 8px;
        }
        .rvx-close:hover { background: rgba(255,255,255,.1); }
        .rvx-title { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px; }
        .rvx-count { font: 600 15px/20px Pretendard, sans-serif; letter-spacing: -.2px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        /* 파일명은 제목이되 "제목처럼 읽히는 이름"이 아니라 식별자다 — 무게를 한 단계 낮춘다.
         * 다른 화면의 파일명은 Space Mono를 쓰지만 여기서는 Pretendard다: 이 자리는 14px로 크고,
         * 한글 파일명(예: 다혜태희1781.jpg)이 흔한데 Space Mono에는 한글 글립이 없어
         * 한 문자열 안에서 두 서체의 자폭이 섞여 깨져 보인다. */
        .rvx-fileline { display: flex; align-items: baseline; gap: 7px; min-width: 0; }
        .rvx-filename { min-width: 0; overflow: hidden; text-overflow: ellipsis; font-weight: 500; font-size: 14px; }
        .rvx-file-separator { color: rgba(255,255,255,.24); }
        .rvx-version { flex: 0 0 auto; color: rgba(255,255,255,.54); font: 500 11px/1 Pretendard, sans-serif; }
        .rvx-summary { display: flex; gap: 10px; font: 600 12px/16px Pretendard, sans-serif; white-space: nowrap; }
        .rvx-sum-approved { color: #4ade80; }
        .rvx-sum-revision { color: #ffbb33; }
        .rvx-sum-pending { color: var(--muted-foreground); }
        .rvx-sum-n {
          display: inline-block; font-weight: 700; font-variant-numeric: tabular-nums;
          animation: rvx-bump 220ms cubic-bezier(.34,1.56,.64,1) both;
        }
        @keyframes rvx-bump { 0% { transform: scale(1); } 45% { transform: scale(1.45); } 100% { transform: scale(1); } }
        @media (prefers-reduced-motion: reduce) { .rvx-sum-n { animation: none; } }
        .rvx-deadline {
          flex: 0 0 auto; font: 600 12px/1 Pretendard, sans-serif; color: var(--muted-foreground); white-space: nowrap;
        }

        .rvx-body { flex: 1; min-height: 0; display: flex; }
        .rvx-stage {
          flex: 1; min-width: 0; position: relative;
          display: flex; align-items: center; justify-content: center; gap: 12px;
          padding: 8px; overflow: hidden; background: var(--viewer-stage);
        }
        .rvx-frame {
          position: relative; height: 100%; flex: 1; min-width: 0;
          display: flex; align-items: center; justify-content: center;
        }
        .rvx-frame img {
          max-width: 100%; max-height: 100%; object-fit: contain; display: block;
          box-shadow: none;
        }
        .rvx-original-overlay {
          position: absolute; inset: 0; margin: auto;
          width: 100%; height: 100%; object-fit: contain;
          /* 원본이 보정본을 완전히 가리되 사진 주변 배경색은 유지한다. */
          background: var(--viewer-stage);
          opacity: 0; pointer-events: none;
        }
        .rvx-original-overlay-on { opacity: 1; }
        .rvx-hold-hint { display: none; }
        .rvx-empty {
          display: grid; place-items: center; width: 100%; height: 100%;
          color: var(--subtle-foreground); font-size: 12px;
        }

        /* 판단 패널 — 셀렉 뷰어의 우측 패널과 같은 자리·폭·표면을 사용한다.
         * 현재 상태 → 판단 → 필요한 경우에만 사유 입력 순으로 읽히도록 위에서 아래로 쌓는다. */
        .rvx-panel {
          flex: 0 0 var(--review-panel-width); width: var(--review-panel-width); box-sizing: border-box;
          display: flex; flex-direction: column; gap: 16px;
          padding: 20px; overflow-y: auto;
          background: var(--viewer-surface);
        }
        .rvx-panel-status {
          display: flex; align-items: center; gap: 10px;
          min-height: 42px; padding-bottom: 14px;
          border-bottom: 1px solid rgba(255,255,255,.08);
        }
        .rvx-panel-status-icon {
          width: 28px; height: 28px; flex: 0 0 28px; border-radius: 50%;
          display: grid; place-items: center;
          background: rgba(255,255,255,.08); color: rgba(255,255,255,.64);
        }
        .rvx-panel-status-icon::before { content: ""; width: 7px; height: 7px; border-radius: 50%; background: currentColor; }
        .rvx-panel-status-approved .rvx-panel-status-icon::before,
        .rvx-panel-status-revision .rvx-panel-status-icon::before { display: none; }
        .rvx-panel-status-approved .rvx-panel-status-icon { background: rgba(34,197,94,.13); color: #4ade80; }
        .rvx-panel-status-revision .rvx-panel-status-icon { background: rgba(245,158,11,.13); color: #fbbf24; }
        .rvx-panel-status-copy { min-width: 0; display: flex; flex-direction: column; gap: 4px; }
        .rvx-panel-status-copy span { font: 500 11px/1 Pretendard, sans-serif; color: rgba(255,255,255,.44); }
        .rvx-panel-status-copy strong { font: 700 13px/1 Pretendard, sans-serif; color: #fff; }
        .rvx-panel-status-approved .rvx-panel-status-copy strong { color: #86efac; }
        .rvx-panel-status-revision .rvx-panel-status-copy strong { color: #fcd34d; }
        .rvx-decision-help { margin: -6px 0 2px; color: rgba(255,255,255,.48); font: 400 11px/1.5 Pretendard, sans-serif; }
        .rvx-shortcuts { margin-top: auto; }
        @media (max-width: 1200px) { .rvx-root { --review-panel-width: 288px; } }
        /* 패널이 좁아지면 판단 두 버튼의 폭 차이가 줄어 위계가 흐려진다.
         * 라벨에서 "요청"만 덜어 내면 다시 벌어진다(옆에 확정이 있어 "재보정"만으로도 뜻이 분명하다).
         * 767px 이하는 모바일 레이아웃이라 폭이 넉넉하므로 그대로 둔다. */
        @media (max-width: 1200px) and (min-width: 768px) {
          .rvx-quiet-more { display: none; }
        }

        .rvx-panel-label {
          display: flex; align-items: center; gap: 6px;
          font: 600 12px/1 Pretendard, sans-serif; color: var(--muted-foreground);
        }
        .rvx-required {
          padding: 2px 6px; border-radius: 999px;
          background: rgba(255,170,0,.18); color: #ffbb33;
          font: 700 10px/1 Pretendard, sans-serif;
        }

        /* 확정과 재보정은 "둘 중 하나"라서 한 줄에 나란히 둔다(모바일과 같은 모양 — 마크업도 CSS도 한 벌).
         * 세로로 쌓으면 104px을 쓰는데 한 줄이면 56px이고, 두 선택지가 동시에 보여 관계가 읽힌다.
         * 위계는 높이·채움·폭으로 준다: 확정은 56px 채움에 남는 폭을 다 갖고, 재보정은 40px 무테에
         * 글자만큼만 쓴다(최대 46%로 묶어, 라벨이 길어져도 보조가 primary보다 넓어지지 않게 한다). */
        .rvx-decision { display: flex; flex-direction: row; align-items: center; gap: 8px; }
        .rvx-btn {
          height: 56px; box-sizing: border-box;
          display: flex; align-items: center; justify-content: center; gap: 8px;
          border: 1px solid var(--border); border-radius: 12px;
          background: rgba(255,255,255,.06); color: #fff; cursor: pointer;
          font: 700 15px/1 Pretendard, sans-serif;
          transition: background .15s ease, border-color .15s ease, transform .08s ease, filter .08s ease;
        }
        .rvx-btn:disabled { opacity: .35; cursor: not-allowed; }
        .rvx-btn:focus-visible { outline: 2px solid #fff; outline-offset: 2px; }
        /* 누르는 순간의 반응을 카운터·배지와 함께 제공한다. */
        .rvx-btn:active:not(:disabled) { transform: scale(.97); filter: brightness(1.15); }
        /* :active는 "손가락이 닿아 있는 동안"이라 짧게 톡 치면 60~100ms 만에 끝난다 —
         * transition이 목표값에 닿기도 전에 손이 떨어져 사실상 아무것도 보이지 않는다.
         * 그래서 탭 길이와 무관하게 끝까지 재생되는 애니메이션을 pointerdown에서 직접 건다. */
        .rvx-pressed { animation: rvx-press 170ms ease-out; }
        @keyframes rvx-press {
          0%   { transform: none;         filter: brightness(1); }
          35%  { transform: scale(.94);   filter: brightness(1.35); }
          100% { transform: none;         filter: brightness(1); }
        }
        @media (prefers-reduced-motion: reduce) { .rvx-pressed { animation: none; } }
        /* 확정 = 기본 경로의 primary. 평면 한 겹이면 단조로워서 아주 옅은 위→아래 그라데이션을 얹는다.
         * 색은 입히지 않는다(초록은 "확정됨" 결과의 몫이라 누르기 전부터 쓰면 판단 완료로 오인된다). */
        .rvx-btn-approve {
          flex: 1 1 auto; min-width: 0;
          background: linear-gradient(180deg, rgba(255,255,255,.2), rgba(255,255,255,.12));
          border-color: rgba(255,255,255,.34);
        }
        .rvx-btn-approve:hover:not(:disabled) {
          background: linear-gradient(180deg, rgba(255,255,255,.28), rgba(255,255,255,.18));
          border-color: rgba(255,255,255,.5);
        }

        /* 재보정 = 소수의 경로(30장 중 두어 장). 테두리도 면도 없는 보조 액션으로 한 단 낮춘다 */
        .rvx-quiet {
          height: 40px; flex: 0 1 auto; max-width: 46%; min-width: 0;
          padding: 0 14px; box-sizing: border-box;
          display: flex; align-items: center; justify-content: center; gap: 7px;
          border: 0; border-radius: 10px; background: transparent;
          color: var(--muted-foreground); cursor: pointer;
          font: 600 13px/1 Pretendard, sans-serif; white-space: nowrap;
          transition: background .15s ease, color .15s ease, transform .08s ease;
        }
        .rvx-quiet span { overflow: hidden; text-overflow: ellipsis; }
        .rvx-quiet:hover:not(:disabled) { background: rgba(255,255,255,.08); color: #fff; }
        .rvx-quiet:active:not(:disabled) { transform: scale(.97); }
        .rvx-quiet:disabled { opacity: .35; cursor: not-allowed; }
        .rvx-quiet:focus-visible { outline: 2px solid #fff; outline-offset: 2px; }

        /* 단축키 힌트는 키보드가 있는 화면에서만 (모바일에서는 아래 미디어쿼리가 감춘다) */
        .rvx-key {
          margin-left: 2px; padding: 3px 6px; border-radius: 5px;
          border: 1px solid rgba(255,255,255,.2); background: rgba(0,0,0,.3);
          font: 700 10px/1 Pretendard, sans-serif; color: rgba(255,255,255,.6);
        }

        /* 판단이 끝나면 큰 버튼 두 개를 접고 "무엇으로 정했는지 + 바꾸는 길"만 남긴다(역시 한 줄) */
        .rvx-verdict { display: flex; flex-direction: row; align-items: center; gap: 8px; width: 100%; }
        .rvx-chip {
          height: 40px; flex: 1 1 auto; min-width: 0; box-sizing: border-box;
          display: flex; align-items: center; justify-content: center; gap: 7px;
          border: 1px solid; border-radius: 999px; cursor: pointer;
          font: 700 13px/1 Pretendard, sans-serif;
          transition: transform .08s ease;
        }
        .rvx-chip:focus-visible { outline: 2px solid #fff; outline-offset: 2px; }
        .rvx-chip:active { transform: scale(.97); }
        /* 확정=초록, 재보정=앰버. 주황은 "제출/진행" 전용이라 판단 상태에는 쓰지 않는다. */
        .rvx-chip-approved { background: rgba(0,200,90,.16); border-color: rgba(0,200,90,.5); color: #4ade80; }
        .rvx-chip-revision { background: rgba(255,170,0,.16); border-color: rgba(255,170,0,.5); color: #ffbb33; }
        /* 결정된 순간이 눈에 걸리도록 아이콘만 한 번 튄다 — 색만 바뀌면 바뀐 줄도 모른다 */
        .rvx-chip-icon { animation: rvx-pop 180ms cubic-bezier(.34,1.56,.64,1) both; }
        @keyframes rvx-pop { from { transform: scale(.4); opacity: 0; } to { transform: none; opacity: 1; } }
        .rvx-quiet-swap { flex: 0 0 auto; max-width: none; height: 40px; font-size: 12px; }
        @media (prefers-reduced-motion: reduce) { .rvx-chip-icon { animation: none; } }

        .rvx-comment-block { display: none; flex-direction: column; gap: 8px; }
        .rvx-comment-block-open { display: flex; }
        .rvx-comment-block-off { display: none; }
        .rvx-comment {
          width: 100%; box-sizing: border-box; min-height: 96px; resize: vertical;
          padding: 10px 12px; border-radius: 10px;
          border: 1px solid var(--border); background: rgba(0,0,0,.45); color: #fff;
          font: 400 13px/1.5 Pretendard, sans-serif; outline: 0;
        }
        .rvx-comment:focus { border-color: rgba(255,255,255,.5); }
        .rvx-comment:disabled { opacity: .5; cursor: not-allowed; resize: none; }
        .rvx-comment-error { margin: 0; font: 400 11px/1.5 Pretendard, sans-serif; color: #ffbb33; }

        /* 비교는 사진에 붙는 도구 — 좌상단 회차 라벨과 같은 톤의 하단 중앙 pill */
        .rvx-compare {
          position: absolute; bottom: 10px; left: 50%; transform: translateX(-50%); z-index: 2;
          height: 34px; padding: 0 14px; box-sizing: border-box;
          display: flex; align-items: center; justify-content: center; gap: 7px;
          border: 1px solid rgba(255,255,255,.28); border-radius: 999px;
          background: rgba(0,0,0,.62); color: rgba(255,255,255,.82); cursor: pointer;
          font: 600 12px/1 Pretendard, sans-serif; white-space: nowrap;
          backdrop-filter: blur(6px);
          transition: background .15s ease, border-color .15s ease, color .15s ease;
          user-select: none; -webkit-user-select: none; touch-action: none;
        }
        .rvx-compare:hover:not(:disabled) { color: #fff; border-color: rgba(255,255,255,.5); }
        .rvx-compare:focus-visible { outline: 2px solid #fff; outline-offset: 2px; }
        .rvx-compare-on { background: rgba(255,255,255,.92); border-color: #fff; color: #111; }
        /* 단축키 안내는 grid의 마지막 행(바닥) — 늘 보이되 시선 순서에서는 마지막 */
        .rvx-shortcuts {
          margin: auto 0 0; padding: 6px 0; width: 100%;
          border: 0; background: transparent; cursor: pointer;
          font: 400 11px/1.7 Pretendard, sans-serif; color: var(--subtle-foreground); text-align: center;
        }
        .rvx-shortcuts:hover { color: var(--muted-foreground); }
        .rvx-shortcuts b { color: var(--muted-foreground); font-weight: 700; }

        /* 단축키 도움말 */
        .rvx-help {
          position: fixed; inset: 0; z-index: 210;
          display: grid; place-items: center; padding: 20px;
          background: rgba(0,0,0,.72); backdrop-filter: blur(4px);
        }
        .rvx-help-card {
          width: 100%; max-width: 360px; box-sizing: border-box;
          padding: 24px; border-radius: 14px;
          background: #16181b; border: 1px solid var(--border); color: #fff;
        }
        .rvx-help-card h3 { margin: 0 0 16px; font: 800 16px/1 Pretendard, sans-serif; }
        .rvx-help-card dl { margin: 0 0 20px; display: flex; flex-direction: column; gap: 10px; }
        .rvx-help-card dl > div { display: flex; align-items: center; gap: 12px; }
        .rvx-help-card dt { flex: 0 0 88px; display: flex; gap: 4px; margin: 0; }
        .rvx-help-card dd { margin: 0; font: 400 13px/1.4 Pretendard, sans-serif; color: var(--muted-foreground); }
        .rvx-help-card kbd {
          min-width: 26px; box-sizing: border-box; padding: 4px 6px; text-align: center;
          border: 1px solid rgba(255,255,255,.24); border-radius: 6px;
          background: rgba(255,255,255,.08);
          font: 700 11px/1 Pretendard, sans-serif; color: #fff;
        }
        .rvx-help-card > button {
          width: 100%; height: 40px; border: 1px solid rgba(255,255,255,.28); border-radius: 10px;
          background: transparent; color: #fff; cursor: pointer; font: 700 13px/1 Pretendard, sans-serif;
        }
        .rvx-help-card > button:hover { background: rgba(255,255,255,.1); }

        /* 필름스트립과 전체 검토 결과를 한 줄에 둔다. 완료되는 순간 별도 풋터가 솟아오르지 않고,
         * 같은 자리에서 진행 문구가 전달 CTA로 바뀌므로 사진 높이가 흔들리지 않는다. */
        .rvx-strip {
          flex-shrink: 0; position: relative;
          min-height: 124px; box-sizing: border-box;
          display: grid; grid-template-columns: minmax(0, 1fr) var(--review-panel-width);
          background: var(--viewer-surface);
        }
        .rvx-strip-receipt { grid-template-columns: minmax(0, 1fr); }
        .rvx-strip-gallery { position: relative; min-width: 0; padding: 22px 24px 14px; }
        .rvx-position { position: absolute; top: 6px; left: 24px; right: 24px; height: 16px; }
        /* 트랙을 감췄으면 그 자리(위쪽 여백)도 함께 거둔다 */
        .rvx-strip-flat .rvx-strip-gallery { padding-top: 12px; }
        .rvx-completion {
          position: relative; min-width: 0; padding: 18px 20px;
          display: flex; align-items: center; justify-content: space-between; gap: 12px;
          background: var(--viewer-surface);
        }
        /* 전달 영역은 우측 패널과 정렬하고 안내와 버튼을 세로로 분리한다. */
        .rvx-completion-actionable { flex-direction: column; align-items: stretch; justify-content: center; gap: 10px; }
        .rvx-completion-actionable .rvx-completion-copy { text-align: center; }
        .rvx-completion-actionable .rvx-completion-copy > span { display: none; }
        .rvx-completion-copy { min-width: 0; display: flex; flex-direction: column; gap: 5px; }
        .rvx-completion-copy span { color: rgba(255,255,255,.46); font: 500 10px/1 Pretendard, sans-serif; }
        .rvx-completion-copy strong { color: #fff; font: 700 13px/1.25 Pretendard, sans-serif; white-space: nowrap; }
        .rvx-completion-copy small { color: rgba(255,255,255,.52); font: 400 11px/1.3 Pretendard, sans-serif; }
        .rvx-completion-count { flex: 0 0 auto; color: rgba(255,255,255,.68); font: 700 12px/1 Pretendard, sans-serif; }
        .rvx-completion-progress { position: absolute; left: 20px; right: 20px; bottom: 13px; height: 2px; overflow: hidden; border-radius: 99px; background: rgba(255,255,255,.1); }
        .rvx-completion-progress span { display: block; height: 100%; background: rgba(255,255,255,.54); transition: width 180ms ease; }
        .rvx-completion-action {
          flex: 0 0 auto; min-width: 108px; height: 42px; padding: 0 15px;
          border: 0; border-radius: 9px; background: var(--accent); color: #fff; cursor: pointer;
          font: 700 13px/1 Pretendard, sans-serif;
          transition: background-color 150ms ease, transform 80ms ease;
        }
        .rvx-completion-action:hover { background: #e64500; }
        .rvx-completion-action:active { transform: scale(.98); }
        .rvx-completion-action:focus-visible { outline: 2px solid #fff; outline-offset: 2px; }
        .rvx-completion-check {
          width: 26px; height: 26px; flex: 0 0 26px; border-radius: 50%;
          display: grid; place-items: center; color: #86efac; background: rgba(34,197,94,.13);
        }
        .rvx-badge {
          position: absolute; top: 5px; left: 5px; z-index: 2;
          width: 18px; height: 18px; border-radius: 50%;
          display: grid; place-items: center;
          border: 1px solid rgba(255,255,255,.18); box-shadow: 0 1px 4px rgba(0,0,0,.5);
        }
        .rvx-badge-approved { background: rgba(10,50,28,.9); color: #86efac; }
        .rvx-badge-revision { background: rgba(64,42,5,.92); color: #fcd34d; }
        /* 방금 판단한 한 장만 튄다 — 첫 로드에서 이미 판단된 배지가 한꺼번에 튀면 그건 잡음이다.
         * 판단 직후 시선이 가는 곳(스크롤로 움직이는 필름스트립)에서 결과가 쌓이는 것을 보여준다. */
        .rvx-badge-pop { animation: rvx-pop 240ms cubic-bezier(.34,1.56,.64,1) both; }
        @media (prefers-reduced-motion: reduce) { .rvx-badge-pop { animation: none; } }

        @media (max-width: 767px) {
          .rvx-appbar { height: 52px; padding: 0 14px; }
          .rvx-deadline { display: none; }
          /* 좁은 화면에서는 패널을 사진 아래로 — 마크업은 그대로 두고 방향만 바꾼다(레이아웃 한 벌 유지) */
          .rvx-body { flex-direction: column; }
          /* 가로에 갇힌 사진은 폭을 키우는 것 말고 커질 방법이 없다 — 좌우 여백을 없앤다 */
          .rvx-stage { padding: 8px 0; }
          .rvx-arrows button { background: rgba(0,0,0,.18) !important; border-color: rgba(255,255,255,.12) !important; }
          /* 좁은 화면은 패널이 사진 아래 한 줄짜리 띠라 중앙 정렬이 뜻이 없다 — 기존 flex 줄바꿈으로 되돌린다 */
          .rvx-panel {
            display: flex;
            flex: 0 0 auto; width: 100%; padding: 12px 14px;
            flex-direction: row; flex-wrap: wrap; align-items: center; gap: 8px;
          }
          .rvx-panel-status { flex: 1 1 100%; min-height: 36px; padding-bottom: 10px; }
          .rvx-decision-help { display: none; }
          .rvx-shortcuts { display: none; }
          /* 재보정일 때만 펼친다 — 접혀 있으면 그만큼 사진에 돌아간다 */
          .rvx-comment-block { display: none; }
          .rvx-comment-block-open { display: flex; flex: 1 1 100%; }
          .rvx-comment { min-height: 64px; }
          .rvx-panel { padding: 10px 14px; gap: 8px; }
          .rvx-strip { grid-template-columns: minmax(0, 1fr) 152px; min-height: 92px; }
          .rvx-strip-receipt { grid-template-columns: minmax(0, 1fr); }
          .rvx-strip-gallery { padding: 20px 10px 10px 12px; }
          .rvx-completion { padding: 12px 10px; gap: 8px; }
          .rvx-completion-copy { gap: 4px; }
          .rvx-completion-copy span { display: none; }
          .rvx-completion-copy strong { font-size: 11px; white-space: normal; }
          .rvx-completion-copy small { font-size: 10px; }
          .rvx-completion-count { font-size: 11px; }
          .rvx-completion-progress { left: 10px; right: 10px; bottom: 8px; }
          .rvx-completion-action { min-width: 0; width: 100%; height: 42px; padding: 0 8px; font-size: 11px; }
          .rvx-completion-actionable { flex-direction: column; align-items: stretch; justify-content: center; gap: 7px; }
          .rvx-completion-actionable .rvx-completion-copy { display: none; }
          .rvx-completion-check { display: none; }
          /* 비교 버튼이 사진으로 옮겨가 패널 한 줄이 통째로 판단 버튼 몫이 된다.
           * 가로 배치 자체는 이제 공통이라 여기서는 줄을 통째로 차지하는 것만 지정한다. */
          .rvx-decision { flex: 1 1 100%; }
          /* 물리 키가 없는 화면에서 단축키 힌트는 뜻이 없다 */
          .rvx-key { display: none; }
          /* 화면이 넓어 보조 버튼을 굳이 묶어 둘 필요가 없다 */
          .rvx-quiet { max-width: none; }
          .rvx-strip-flat .rvx-strip-gallery { padding-top: 10px; }
          .rvx-position { left: 12px; right: 12px; }
          /* 모바일은 사진 자체를 길게 누르는 방식만 사용한다. 별도 비교 버튼은 사진과
           * 판단 버튼 사이에 또 하나의 조작 체계를 만들기 때문에 감춘다. */
          .rvx-compare { display: none; }
          .rvx-hold-hint {
            display: block; position: absolute; left: 50%; bottom: 10px; z-index: 3;
            transform: translateX(-50%); padding: 6px 10px; border-radius: 999px;
            background: rgba(0,0,0,.58); color: rgba(255,255,255,.72);
            font: 500 11px/1 Pretendard, sans-serif; white-space: nowrap;
            pointer-events: none; backdrop-filter: blur(6px);
          }
        }
        @media (prefers-reduced-motion: reduce) {
          .rvx-original-overlay { transition: none; }
        }
      `}</style>

      <div className="rvx-root" onTouchStart={handleTouchStart} onTouchEnd={handleTouchEnd}>
        <header className="rvx-appbar">
          <button
            type="button"
            className="rvx-close"
            onClick={() => router.replace(`/c/${token}/review`)}
            aria-label="검토 목록으로"
          >
            <X size={18} strokeWidth={2} />
          </button>
          <div className="rvx-title">
            {/* 제목 자리는 **파일명**이다. 한 장을 보고 있는 화면에서 "어느 프로젝트인가"는 이미
              * 아는 사실(바로 앞 목록의 제목)이고, 정작 필요한 "어느 사진인가"가 없었다.
              * 작가에게 "이 사진 다시 봐 주세요"라고 짚어 말할 때 쓰는 번호가 이것이다. */}
            <span className="rvx-count rvx-fileline">
              <span className="rvx-filename" title={displayName}>{displayName}</span>
              <span className="rvx-file-separator" aria-hidden>·</span>
              <span className="rvx-version">{compareOriginal ? "원본" : versionLabel}</span>
            </span>
            {/* 진행 카운트(N/M)는 하단 푸터가 그리므로 여기서는 분류별 요약만 — 같은 숫자를 두 번 말하지 않는다 */}
            {receiptMode ? (
              /* 수령 모드에는 확정/재보정/미검토라는 분류 자체가 없다 — 대신 왜 판단 버튼이
               * 없는지를 말한다(목록 화면의 안내와 같은 사실, 앱바에 맞게 줄인 문구). */
              <span className="rvx-summary">
                <span className="rvx-sum-pending">이번이 마지막 보정본이에요</span>
              </span>
            ) : (
            <span className="rvx-summary">
              {/* 숫자에 key를 걸어 값이 바뀔 때마다 새로 마운트시킨다 — 그래야 애니메이션이 매번 재생된다. */}
              <span className="rvx-sum-approved">확정 <b key={approvedCount} className="rvx-sum-n">{approvedCount}</b></span>
              <span className="rvx-sum-revision">재보정 <b key={revisionCount} className="rvx-sum-n">{revisionCount}</b></span>
              <span className="rvx-sum-pending">미검토 <b key={pendingCount} className="rvx-sum-n">{pendingCount}</b></span>
            </span>
            )}
          </div>
          {(photographer || reviewDeadlineDisplay) && (
            <span className="rvx-deadline">
              {photographer}
              {photographer && reviewDeadlineDisplay ? " · " : ""}
              {reviewDeadlineDisplay ? `검토 마감 ${reviewDeadlineDisplay}` : ""}
            </span>
          )}
        </header>

        <div className="rvx-body">
          <main className="rvx-stage">
            {stageUrl ? (
              <div className="rvx-frame">
                <img
                  src={stageUrl}
                  alt="보정본"
                  decoding="async"
                  fetchPriority="high"
                  draggable={false}
                  style={{
                    cursor: "zoom-in",
                    userSelect: "none",
                    WebkitUserSelect: "none",
                    WebkitTouchCallout: "none",
                  }}
                  onContextMenu={(event) => event.preventDefault()}
                  onDragStart={(event) => event.preventDefault()}
                  onPointerDown={startPhotoHold}
                  onPointerMove={movePhotoHold}
                  onPointerUp={() => endPhotoHold(false)}
                  onPointerLeave={cancelPhotoHold}
                  onPointerCancel={cancelPhotoHold}
                  onClick={() => {
                    if (photoHoldTriggeredRef.current) return;
                    setFocusOpen(true);
                  }}
                />
                {originalCompareUrl && originalCompareUrl !== stageUrl && (
                  <img
                    src={originalCompareUrl}
                    alt=""
                    aria-hidden="true"
                    decoding="async"
                    draggable={false}
                    onLoad={() => setOriginalReadyUrl(originalCompareUrl)}
                    className={`rvx-original-overlay${compareOriginal ? " rvx-original-overlay-on" : ""}`}
                  />
                )}
                {originalCompareUrl && originalCompareUrl !== stageUrl && (
                  <span className="rvx-hold-hint">{compareOriginal ? "원본 보는 중" : "사진을 꾹 누르면 원본을 볼 수 있어요."}</span>
                )}
                {/* 비교 대상이 사진이니 버튼도 사진에 붙인다 — 패널에 두면(이전: 패널 맨 아래, 판단 버튼과 450px)
                  * 원본을 확인하는 내내 시선이 사진과 패널을 왕복한다. 좌상단 회차 라벨과 짝을 이루는 하단 중앙.
                  * 가로 사진이면 레터박스 검은 여백에 얹혀 사진을 아예 가리지 않는다(세로 사진은 아래 끝에 걸친다).
                  * img의 형제라 이 버튼을 눌러도 사진의 집중 보기는 열리지 않는다. */}
                <button
                  type="button"
                  className={`rvx-compare${compareOriginal ? " rvx-compare-on" : ""}`}
                  aria-pressed={compareOriginal}
                  onPointerDown={(event) => { event.preventDefault(); showOriginal(); }}
                  onPointerUp={hideOriginal}
                  onPointerLeave={hideOriginal}
                  onPointerCancel={hideOriginal}
                >
                  <Maximize2 size={13} strokeWidth={1.9} style={{ transform: "rotate(90deg)" }} aria-hidden />
                  {compareOriginal ? "원본 보는 중" : "꾹 눌러 원본"}
                </button>
              </div>
            ) : (
              <div className="rvx-empty">이미지를 불러올 수 없습니다</div>
            )}
            {/* 일반 상세에서는 화살표를 유지하고, 사진만 남기는 집중 보기에서만 제거한다. */}
            <div className="rvx-arrows">
              <PrevNextButton direction="prev" onClick={goPrev} size="sm" />
              <PrevNextButton direction="next" onClick={goNext} size="sm" />
            </div>
          </main>

          {/* 수령 모드에서는 판단 패널을 렌더하지 않는다 — 그 폭·높이가 통째로 사진에 돌아간다.
            * (버튼만 감추고 껍데기를 남기면 빈 상자가 사진을 계속 밀어낸다) */}
          {!receiptMode && (
          <aside className="rvx-panel" aria-label="검토 판단">
            <div className={`rvx-panel-status${isApproved ? " rvx-panel-status-approved" : isRevision ? " rvx-panel-status-revision" : ""}`}>
              <span className="rvx-panel-status-icon" aria-hidden>
                {isApproved ? <Check size={14} strokeWidth={3} /> : isRevision ? <RefreshCw size={13} strokeWidth={2.6} /> : null}
              </span>
              <span className="rvx-panel-status-copy">
                <span>검토 상태</span>
                <strong>{isApproved ? "확정했어요" : isRevision ? "재보정을 요청했어요" : "아직 검토하지 않았어요"}</strong>
              </span>
            </div>
            {/* 아직 안 골랐을 때만 크게 편다. 판단이 끝난 사진에 필요한 건 큰 버튼 두 개가 아니라
              * "무엇으로 정했는지"와 "바꾸는 길" 하나씩이다 — 접으면 그만큼 사진에 돌아간다.
              * 확정과 재보정의 무게도 실제 비율을 따른다(30장 중 재보정은 두어 장): 확정은 채워진
              * 56px primary, 재보정은 무테 40px 보조 액션. */}
            <div className="rvx-decision">
              {!isApproved && !isRevision ? (
                <>
                  <button type="button" className="rvx-btn rvx-btn-approve" onClick={handleApprove} onPointerDown={pressFx} onAnimationEnd={pressFxEnd}>
                    <Check size={20} strokeWidth={2.6} aria-hidden />
                    <span>확정</span>
                    <kbd className="rvx-key" aria-hidden>Y</kbd>
                  </button>
                  <button
                    type="button"
                    className="rvx-quiet"
                    onPointerDown={pressFx}
                    onAnimationEnd={pressFxEnd}
                    onClick={openRevisionInline}
                    disabled={!canRequestRevision}
                    title={canRequestRevision ? undefined : "남은 재보정 횟수가 없습니다"}
                  >
                    <RefreshCw size={16} strokeWidth={2.2} aria-hidden />
                    {/* 한 줄이 된 뒤로 보조 버튼에 키 힌트까지 넣으면 폭이 primary를 넘본다.
                      * R은 패널 아래 단축키 줄이 이미 알려 준다. */}
                    <span>재보정<span className="rvx-quiet-more"> 요청</span></span>
                  </button>
                </>
              ) : (
                <div className="rvx-verdict">
                  {/* 칩 자체가 해제 토글이다(단축키 Y/R와 같은 동작) */}
                  <button
                    type="button"
                    className={`rvx-chip rvx-chip-${isApproved ? "approved" : "revision"}`}
                    onPointerDown={pressFx}
                    onAnimationEnd={pressFxEnd}
                    onClick={isApproved ? handleApprove : openRevisionInline}
                    aria-pressed="true"
                    title="눌러서 판단 취소"
                  >
                    {isApproved
                      ? <Check className="rvx-chip-icon" size={15} strokeWidth={3} aria-hidden />
                      : <RefreshCw className="rvx-chip-icon" size={14} strokeWidth={2.6} aria-hidden />}
                    {isApproved ? "확정됨" : "재보정 요청됨"}
                  </button>
                  <button
                    type="button"
                    className="rvx-quiet rvx-quiet-swap"
                    onPointerDown={pressFx}
                    onAnimationEnd={pressFxEnd}
                    onClick={isApproved ? openRevisionInline : handleApprove}
                    disabled={isApproved && !canRequestRevision}
                    title={isApproved && !canRequestRevision ? "남은 재보정 횟수가 없습니다" : undefined}
                  >
                    {isApproved ? "재보정으로 바꾸기" : "확정으로 바꾸기"}
                  </button>
                </div>
              )}
            </div>

            {!isRevision && (
              <p className="rvx-decision-help">수정이 필요하면 재보정을 고른 뒤 사유를 남겨주세요.</p>
            )}

            {/* 재보정을 선택한 사진에서만 사유 입력을 펼친다. */}
            <div className={`rvx-comment-block${isRevision ? " rvx-comment-block-open" : ""}${isApproved ? " rvx-comment-block-off" : ""}`}>
              <label className="rvx-panel-label" htmlFor="rvx-revision-comment">
                재보정 요청 내용 {isRevision && <span className="rvx-required">필수</span>}
              </label>
              <textarea
                id="rvx-revision-comment"
                className="rvx-comment"
                value={revisionDraft}
                maxLength={100}
                disabled={!isRevision}
                placeholder={
                  isRevision
                    ? "예) 얼굴이 조금 어두워요 (100자)"
                    : "재보정을 고르면 요청 내용을 적을 수 있어요"
                }
                onChange={(event) => {
                  setRevisionDraft(event.target.value.slice(0, 100));
                  setRevisionError(null);
                  setReasonNudge(false);
                }}
                onBlur={() => {
                  handleRevisionSave();
                  if (isRevision && !revisionDraft.trim()) setReasonNudge(true);
                }}
              />
              {revisionError && <p className="rvx-comment-error">{revisionError}</p>}
              {reasonNudge && isRevision && !revisionDraft.trim() && !revisionError && (
                <p className="rvx-comment-error">작가가 무엇을 고쳐야 할지 알 수 있게 적어주세요.</p>
              )}
            </div>

            {/* 한 줄 요약은 그대로 두되 눌러서 전체 목록을 펼 수 있게 한다 — `?`만으로는 아무도 모른다 */}
            <button type="button" className="rvx-shortcuts" onClick={() => setHelpOpen(true)}>
              <b>Y</b> 확정 · <b>R</b> 재보정 · <b>\</b> 원본 · <b>← →</b> 이동 · <b>?</b> 도움말
            </button>
          </aside>
          )}
        </div>


        <div className={`rvx-strip${stripOverflows ? "" : " rvx-strip-flat"}`} ref={stripRef}>
          <div className="rvx-strip-gallery">
            {/* 썸네일이 한 화면에 다 보이면 트랙은 같은 정보를 되풀이할 뿐이다 */}
            {stripOverflows && (
              <PhotoPositionBar
                className="rvx-position"
                tone="plain"
                ordinal={currentIndex + 1}
                total={total}
                onSeek={seekToRatio}
              />
            )}
            <PhotoFilmstrip
              items={filmstripItems}
              activeId={activePhotoId}
              onSelect={navigate}
              colorize
              badge={(item) => {
                const st = getReview(item.id)?.status;
                if (st !== "approved" && st !== "revision_requested") return null;
                const approved = st === "approved";
                return (
                  <span
                    className={`rvx-badge rvx-badge-${approved ? "approved" : "revision"}${item.id === justJudgedId ? " rvx-badge-pop" : ""}`}
                    aria-label={approved ? "확정됨" : "재보정 요청"}
                  >
                    {approved
                      ? <Check size={11} strokeWidth={3.5} />
                      : <RefreshCw size={10} strokeWidth={3} />}
                  </span>
                );
              }}
            />
          </div>

          {receiptMode ? (
            <aside className="rvx-completion rvx-completion-actionable" aria-label="보정본 수령">
              <span className="rvx-completion-copy"><strong>보정본 {total}장을 확인해 주세요</strong></span>
              <button type="button" className="rvx-completion-action" disabled={submitting || total === 0} onClick={() => { setSubmitError(null); setShowSubmitModal(true); }}>수령 완료</button>
            </aside>
          ) : (
            <aside className={`rvx-completion${canSubmit ? " rvx-completion-complete rvx-completion-actionable" : ""}${!canSubmit && revisionsMissingComment.length > 0 && pendingCount === 0 ? " rvx-completion-actionable" : ""}`} aria-label="검토 진행" aria-live="polite">
              {canSubmit ? (
                <>
                  <span className="rvx-completion-copy">
                    <span>검토 완료</span>
                    <strong>{total}장 모두 확인했어요</strong>
                  </span>
                  <button type="button" className="rvx-completion-action" onClick={() => setShowSubmitModal(true)}>작가에게 전달</button>
                </>
              ) : revisionsMissingComment.length > 0 && pendingCount === 0 ? (
                <>
                  <span className="rvx-completion-copy">
                    <span>전달 전 확인</span>
                    <strong>재보정 사유 {revisionsMissingComment.length}개 필요</strong>
                  </span>
                  <button type="button" className="rvx-completion-action" onClick={() => navigate(revisionsMissingComment[0].id)}>사유 확인</button>
                </>
              ) : (
                <>
                  <span className="rvx-completion-copy">
                    <span>검토 진행</span>
                    <strong>{reviewedCount} / {total}장 검토</strong>
                    <small>{pendingCount}장 남았어요</small>
                  </span>
                  <span className="rvx-completion-count">{Math.round((reviewedCount / Math.max(total, 1)) * 100)}%</span>
                  <span className="rvx-completion-progress" aria-hidden><span style={{ width: `${Math.round((reviewedCount / Math.max(total, 1)) * 100)}%` }} /></span>
                </>
              )}
            </aside>
          )}
        </div>
      </div>

      {/* 전달 확인은 셀렉 확정과 같은 관문이라 같은 컴포넌트(라이트)를 쓴다 — 문구만 바꿔 끼운다 */}
      {showSubmitModal && (
        <SelectionConfirmDialog
          title={receiptMode ? "보정본을 수령할까요?" : "검토 결과를 전달할까요?"}
          description={receiptMode ? (<>보정본 {total}장을 수령하고 프로젝트를 완료합니다.<br />수령 후에는 되돌릴 수 없어요.</>) : (
            <>
              확정 {approvedCount}장, 재보정 요청 {revisionCount}장을 작가에게 전달합니다.
              <br />
              전달 후에는 검토 결과를 바꿀 수 없어요.
            </>
          )}
          confirmLabel={receiptMode ? "수령 완료" : "전달하기"}
          busyLabel={receiptMode ? "처리 중..." : "전달 중..."}
          confirming={submitting}
          error={submitError}
          onCancel={() => { if (!submitting) { setShowSubmitModal(false); setSubmitError(null); } }}
          onConfirm={() => { void handleSubmit(); }}
        />
      )}

      {helpOpen && (
        <div className="rvx-help" role="dialog" aria-modal="true" aria-label="단축키" onClick={() => setHelpOpen(false)}>
          <div className="rvx-help-card" onClick={(e) => e.stopPropagation()}>
            <h3>단축키</h3>
            <dl>
              <div><dt><kbd>Y</kbd></dt><dd>현재 사진 확정</dd></div>
              <div><dt><kbd>R</kbd></dt><dd>재보정 요청</dd></div>
              <div><dt><kbd>\</kbd></dt><dd>누르고 있는 동안 원본 보기</dd></div>
              <div><dt><kbd>←</kbd><kbd>→</kbd></dt><dd>이전 · 다음 사진</dd></div>
              <div><dt><kbd>Esc</kbd></dt><dd>목록으로 돌아가기</dd></div>
              <div><dt><kbd>?</kbd></dt><dd>이 도움말</dd></div>
            </dl>
            <button type="button" onClick={() => setHelpOpen(false)}>닫기</button>
          </div>
        </div>
      )}

      <PhotoFocusOverlay
        open={focusOpen}
        src={stageUrl}
        originalSrc={originalCompareUrl}
        alt={compareOriginal ? "원본" : "보정본"}
        onClose={() => setFocusOpen(false)}
        onPrev={goPrev}
        onNext={goNext}
      />

    </>
  );
}
