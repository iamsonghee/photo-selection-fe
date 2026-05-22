"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { Check, RefreshCw, Maximize2, X, ChevronLeft, ChevronRight } from "lucide-react";
import { useSelection } from "@/contexts/SelectionContext";
import { useReview } from "@/contexts/ReviewContext";
import { PrevNextButton } from "@/components/PrevNextButton";
import FullScreenCompareModal from "@/components/FullScreenCompareModal";
import type { ReviewPhotoItem } from "@/lib/customer-api-server";
import { normalizeReviewDeadlineYmd } from "@/lib/format-review-deadline";

/* ── design tokens ── */
const BG_BASE    = "#030303";
const BG_PANEL   = "#0a0a0a";
const BG_INPUT   = "#111111";
const BORDER     = "#222222";
const BORDER_HI  = "#333333";
const TEXT       = "#ffffff";
const MUTED      = "#888888";
const DIM        = "#555555";
const ACCENT     = "#ff4d00";
const ACCENT_HO  = "#e64500";
const ACCENT_DIM = "rgba(255,77,0,0.1)";
const GREEN      = "#00ff66";
const ORANGE     = "#ffaa00";
const MONO       = "'JetBrains Mono', 'Space Mono', monospace";

type ViewMode = "side-by-side" | "single-original" | "single-retouched";

export default function ReviewViewerPage() {
  const params  = useParams();
  const router  = useRouter();
  const token   = (params?.token as string) ?? "";
  const photoId = params?.photoId as string;

  const { project, loading: selectionLoading } = useSelection();
  const { reviewPhotos, loadReviewPhotos, reviewPhotosLoading, reviewState, setReview, getReview, resetAll } = useReview();

  const [activePhotoId,    setActivePhotoId]    = useState(photoId);
  const [viewMode,         setViewMode]         = useState<ViewMode>("side-by-side");
  const [isMobile,         setIsMobile]         = useState(false);
  const [revisionComment,  setRevisionComment]  = useState("");
  const [fullOpen,         setFullOpen]         = useState(false);
  const [fullInitial,      setFullInitial]      = useState<"original" | "version">("original");
  const [showSubmitModal,  setShowSubmitModal]  = useState(false);
  const [revisionDraft,    setRevisionDraft]    = useState("");
  const [submitError,      setSubmitError]      = useState<string | null>(null);
  const [photographer,     setPhotographer]     = useState<string | null>(null);
  const [sidebarOpen,      setSidebarOpen]      = useState(true);

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

  // 재보정 0회 프로젝트는 사진별 확정 화면 대신 /review 갤러리(수령 완료) 화면으로 이동
  useEffect(() => {
    if (!project) return;
    if ((project.maxRevisionCount ?? 0) === 0) {
      router.replace(`/c/${token}/review`);
    }
  }, [project, router, token]);

  const photos       = reviewPhotos;
  const reviewDeadlineDisplay = useMemo(
    () => normalizeReviewDeadlineYmd(project?.reviewDeadline ?? null),
    [project?.reviewDeadline]
  );
  const currentIndex = useMemo(() => photos.findIndex((p) => p.id === activePhotoId), [photos, activePhotoId]);

  const total         = photos.length;
  const approvedCount = useMemo(() => photos.filter((p) => getReview(p.id)?.status === "approved").length, [photos, reviewState]);
  const revisionCount = useMemo(() => photos.filter((p) => getReview(p.id)?.status === "revision_requested").length, [photos, reviewState]);
  const pendingCount  = total - approvedCount - revisionCount;
  const reviewedCount = approvedCount + revisionCount;
  const allReviewed   = total > 0 && pendingCount === 0;
  const progressPct   = total > 0 ? Math.round((reviewedCount / total) * 100) : 0;
  const current      = currentIndex >= 0 ? photos[currentIndex] : null;
  const prevId       = currentIndex > 0 ? photos[currentIndex - 1]?.id : photos[photos.length - 1]?.id;
  const nextId       = currentIndex < photos.length - 1 && currentIndex >= 0 ? photos[currentIndex + 1]?.id : photos[0]?.id;

  const review     = current ? getReview(current.id) : null;
  const status     = review?.status ?? "pending";
  const isApproved = status === "approved";
  const isRevision = status === "revision_requested";

  useEffect(() => {
    if (current) {
      const c = review?.comment ?? "";
      setRevisionComment(c);
      setRevisionDraft(c);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current?.id]);

  const navigate = useCallback((id: string) => {
    setActivePhotoId(id);
    window.history.replaceState(null, "", `/c/${token}/review/${id}`);
  }, [token]);

  const goPrev = useCallback(() => { if (prevId) navigate(prevId); }, [prevId, navigate]);
  const goNext = useCallback(() => { if (nextId) navigate(nextId); }, [nextId, navigate]);

  let touchStartX = 0;
  const handleTouchStart = (e: React.TouchEvent) => { touchStartX = e.touches[0].clientX; };
  const handleTouchEnd   = (e: React.TouchEvent) => {
    const diff = touchStartX - e.changedTouches[0].clientX;
    if (Math.abs(diff) > 50) { diff > 0 ? goNext() : goPrev(); }
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.isComposing) return;
      if (e.key === "ArrowLeft")  { e.preventDefault(); goPrev(); }
      if (e.key === "ArrowRight") { e.preventDefault(); goNext(); }
      if (e.key === "Escape")     { e.preventDefault(); router.replace(`/c/${token}/review`); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [goPrev, goNext, router, token]);

  // 모바일 감지 + 모바일에서 보정본 단일 뷰
  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const mql = window.matchMedia("(max-width: 900px)");
    const apply = (matches: boolean) => {
      setIsMobile(matches);
      if (matches) setViewMode("single-retouched");
    };
    apply(mql.matches);
    const onChange = (e: MediaQueryListEvent) => apply(e.matches);
    mql.addEventListener?.("change", onChange);
    return () => mql.removeEventListener?.("change", onChange);
  }, []);

  const handleApprove = useCallback(() => {
    if (!current) return;
    if (isApproved) { setReview(current.id, "pending" as "approved"); return; }
    setReview(current.id, "approved");
  }, [current, isApproved, setReview]);

  // 재보정 버튼 클릭 → 즉시 토글 (선택/해제)
  const openRevisionInline = useCallback(() => {
    if (!current) return;
    if (isRevision) {
      setReview(current.id, "pending" as "approved");
      setRevisionDraft("");
    } else {
      setRevisionDraft(review?.comment ?? "");
      setReview(current.id, "revision_requested", review?.comment || undefined);
    }
  }, [current, isRevision, review, setReview]);

  // Y/R 키보드 단축키 — 확정 / 재보정 (한글 IME에서도 e.code로 물리 키 인식)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (document.activeElement?.tagName === "INPUT" || document.activeElement?.tagName === "TEXTAREA") {
        return;
      }
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
  }, [handleApprove, openRevisionInline]);

  // 코멘트 인풋 blur 시 자동 저장
  const handleRevisionSave = useCallback(() => {
    if (!current || !isRevision) return;
    setReview(current.id, "revision_requested", revisionDraft || undefined);
    setRevisionComment(revisionDraft);
  }, [current, isRevision, revisionDraft, setReview]);

  const handleSubmit = useCallback(async () => {
    if (!allReviewed || !token) return;
    setSubmitError(null);
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
        const rev = getReview(p.id);
        if (!rev || (rev.status !== "approved" && rev.status !== "revision_requested")) {
          setSubmitError(
            "일부 사진의 검토 선택이 없습니다. 각 장에서 확정 또는 재보정을 선택한 뒤 다시 시도해 주세요."
          );
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
      if (!res.ok) { setSubmitError((data && typeof data.error === "string" && data.error) || `서버 오류 (${res.status})`); return; }
      finalStatus = typeof data?.status === "string" ? data.status : null;
    } else {
      const result = revisionCount > 0 ? "has_revision" : "all_approved";
      const res  = await fetch("/api/c/review-submit", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token, result }) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { setSubmitError((data && typeof data.error === "string" && data.error) || `서버 오류 (${res.status})`); return; }
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
  }, [allReviewed, token, revisionCount, photos, getReview, resetAll]);

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
  const revisionRemaining = Math.max(0, (project.maxRevisionCount ?? 0) - (project.revisionRound ?? 0));
  const canRequestRevision = revisionRemaining > 0;
  const statusLabelKo = isApproved ? "확정됨" : isRevision ? "재보정 요청" : "미검토";

  const showOriginal  = viewMode === "side-by-side" || viewMode === "single-original";
  const showRetouched = viewMode === "side-by-side" || viewMode === "single-retouched";

  /* ── 모바일 전용 디테일 뷰 ── */
  if (isMobile) {
    const mobileTab: "original" | "retouched" = viewMode === "single-original" ? "original" : "retouched";
    return (
      <div style={{ minHeight: "100dvh", background: BG_BASE, color: TEXT, display: "flex", flexDirection: "column", fontFamily: "'Pretendard Variable',-apple-system,sans-serif", overflow: "hidden" }}>

        {/* 모바일 헤더 (모달 chrome) */}
        <header style={{ flexShrink: 0, background: "rgba(10,10,10,0.95)", backdropFilter: "blur(12px)", borderBottom: `1px solid ${BORDER}`, display: "flex", alignItems: "center", gap: 10, padding: "0 14px", paddingTop: "env(safe-area-inset-top,0px)", minHeight: 52 }}>
          <button
            type="button"
            onClick={() => router.replace(`/c/${token}/review`)}
            aria-label="갤러리로 닫기"
            style={{ display: "flex", alignItems: "center", justifyContent: "center", width: 32, height: 32, background: "transparent", color: TEXT, border: `1px solid ${BORDER_HI}`, borderRadius: 8, flexShrink: 0, cursor: "pointer" }}
          >
            <X size={16} />
          </button>
          <span style={{ flex: 1, fontSize: 13, fontWeight: 600, color: TEXT, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {current.originalFilename?.split("/").pop() ?? `사진 ${currentIndex + 1}`}
          </span>
          <span style={{ fontFamily: MONO, fontSize: 11, color: MUTED, flexShrink: 0 }}>
            {currentIndex + 1} / {total}
          </span>
        </header>

        {/* 탭 */}
        <div style={{ flexShrink: 0, display: "flex", borderBottom: `1px solid ${BORDER}`, background: "rgba(5,5,5,0.9)" }}>
          <button type="button" onClick={() => setViewMode("single-retouched")}
            style={{ flex: 1, height: 40, background: "transparent", border: "none", cursor: "pointer", fontFamily: MONO, fontSize: 11, fontWeight: 700, letterSpacing: "0.03em", transition: "all 0.15s",
              color: mobileTab === "retouched" ? ACCENT : MUTED,
              borderBottom: mobileTab === "retouched" ? `2px solid ${ACCENT}` : "2px solid transparent",
            }}>
            보정본
          </button>
          <button type="button" onClick={() => setViewMode("single-original")}
            style={{ flex: 1, height: 40, background: "transparent", border: "none", cursor: "pointer", fontFamily: MONO, fontSize: 11, fontWeight: 700, letterSpacing: "0.03em", transition: "all 0.15s",
              color: mobileTab === "original" ? MUTED : MUTED,
              borderBottom: mobileTab === "original" ? `2px solid ${MUTED}` : "2px solid transparent",
            }}>
            원본
          </button>
          <button type="button" onClick={() => { setFullInitial(mobileTab === "original" ? "original" : "version"); setFullOpen(true); }}
            style={{ width: 40, height: 40, background: "transparent", border: "none", borderLeft: `1px solid ${BORDER}`, cursor: "pointer", color: MUTED, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
            <Maximize2 size={14} />
          </button>
        </div>

        {/* 이미지 */}
        <div style={{ flex: 1, minHeight: 0, position: "relative", background: "#0a0a0a", overflow: "hidden" }}
          onTouchStart={handleTouchStart} onTouchEnd={handleTouchEnd}>
          {mobileTab === "retouched" ? (
            current.versionUrl
              ? <img src={current.versionUrl} alt="보정본" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "contain" }} />
              : <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", color: DIM, fontFamily: MONO, fontSize: 11 }}>이미지 없음</div>
          ) : (
            current.originalUrl
              ? <img src={current.originalUrl} alt="원본" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "contain" }} />
              : <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", color: DIM, fontFamily: MONO, fontSize: 11 }}>이미지 없음</div>
          )}
          {/* 이전/다음 */}
          <PrevNextButton direction="prev" onClick={goPrev} size="sm" />
          <PrevNextButton direction="next" onClick={goNext} size="sm" />
        </div>

        {/* 액션 바 */}
        <div style={{ flexShrink: 0, borderTop: `1px solid ${BORDER}`, background: "rgba(5,5,5,0.97)", paddingBottom: "env(safe-area-inset-bottom,0px)" }}>
          {/* 코멘트 인풋 */}
          {isRevision && (
            <div style={{ padding: "10px 14px 0" }}>
              <input type="text" value={revisionDraft} onChange={(e) => setRevisionDraft(e.target.value.slice(0, 100))} onBlur={handleRevisionSave}
                placeholder="재보정 요청 코멘트 (선택, 100자)"
                style={{ width: "100%", height: 38, background: BG_INPUT, border: `1px solid rgba(255,170,0,0.4)`, borderRadius: 8, color: TEXT, padding: "0 12px", fontFamily: "'Inter',-apple-system,sans-serif", fontSize: 13, outline: "none", boxSizing: "border-box" }} />
            </div>
          )}
          <div style={{ padding: "10px 14px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <div style={{ width: 7, height: 7, borderRadius: "50%", background: isApproved ? GREEN : isRevision ? ORANGE : DIM }} />
              <span style={{ fontFamily: MONO, fontSize: 11, color: isApproved ? GREEN : isRevision ? ORANGE : MUTED }}>{statusLabelKo}</span>
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              {canRequestRevision && (
                <button type="button" onClick={openRevisionInline}
                  style={{ height: 40, padding: "0 16px", display: "flex", alignItems: "center", gap: 6, fontFamily: MONO, fontSize: 12, fontWeight: 700, cursor: "pointer", border: "1px solid", borderRadius: 8, transition: "all 0.15s", background: isRevision ? "rgba(255,170,0,0.1)" : "transparent", color: isRevision ? ORANGE : MUTED, borderColor: isRevision ? "rgba(255,170,0,0.45)" : BORDER_HI }}>
                  <RefreshCw size={12} />{isRevision ? "재보정 ✓" : "재보정"}
                </button>
              )}
              <button type="button" onClick={handleApprove}
                style={{ height: 40, padding: "0 16px", display: "flex", alignItems: "center", gap: 6, fontFamily: MONO, fontSize: 12, fontWeight: 700, cursor: "pointer", border: "1px solid", borderRadius: 8, transition: "all 0.15s", background: isApproved ? "rgba(0,255,102,0.12)" : "transparent", color: isApproved ? GREEN : MUTED, borderColor: isApproved ? "rgba(0,255,102,0.4)" : BORDER_HI }}>
                <Check size={12} />{isApproved ? "확정됨" : "확정"}
              </button>
            </div>
          </div>
          {/* 전달 버튼 */}
          {allReviewed && (
            <div style={{ padding: "0 14px 10px" }}>
              <button type="button" onClick={() => setShowSubmitModal(true)}
                style={{ width: "100%", height: 44, background: ACCENT, border: "none", borderRadius: 10, color: "#000", fontFamily: MONO, fontSize: 13, fontWeight: 700, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
                작가에게 전달 →
              </button>
            </div>
          )}
        </div>

        {/* Submit Modal */}
        {showSubmitModal && (
          <div style={{ position: "fixed", inset: 0, zIndex: 200, display: "flex", alignItems: "flex-end", justifyContent: "center", background: "rgba(0,0,0,0.82)", backdropFilter: "blur(6px)", padding: 16, paddingBottom: "calc(16px + env(safe-area-inset-bottom,0px))" }}
            onClick={() => setShowSubmitModal(false)}>
            <div style={{ width: "100%", maxWidth: 440, background: BG_PANEL, border: `1px solid ${ACCENT}`, borderRadius: 16, padding: 28, position: "relative" }} onClick={(e) => e.stopPropagation()}>
              <h3 style={{ fontSize: 18, fontWeight: 800, color: TEXT, marginBottom: 10 }}>검토 결과를 전달할까요?</h3>
              <p style={{ color: MUTED, fontSize: 13, lineHeight: 1.7, marginBottom: 20 }}>
                확정 <span style={{ color: GREEN, fontWeight: 700 }}>{approvedCount}장</span>, 재보정 요청 <span style={{ color: ORANGE, fontWeight: 700 }}>{revisionCount}장</span>
              </p>
              {submitError && <p style={{ color: "#ef4444", fontSize: 12, marginBottom: 12 }}>{submitError}</p>}
              <div style={{ display: "flex", gap: 10 }}>
                <button type="button" onClick={() => { setShowSubmitModal(false); setSubmitError(null); }} style={{ flex: 1, height: 46, border: `1px solid ${BORDER_HI}`, background: "none", color: MUTED, fontSize: 13, fontWeight: 700, cursor: "pointer", borderRadius: 10 }}>취소</button>
                <button type="button" onClick={async () => { await handleSubmit(); }} style={{ flex: 1, height: 46, background: ACCENT, color: "#000", fontSize: 13, fontWeight: 900, border: "none", cursor: "pointer", borderRadius: 10 }}>전달하기</button>
              </div>
            </div>
          </div>
        )}

        <FullScreenCompareModal open={fullOpen} initialSide={fullInitial} originalUrl={current.originalUrl} versionUrl={current.versionUrl} versionLabel={versionLabel} onClose={() => setFullOpen(false)} />
      </div>
    );
  }

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500;700&display=swap');

        html, body { overflow: hidden; }

        .rv-workspace {
          display: flex;
          flex: 1;
          min-height: 0;
          overflow: hidden;
        }
        .rv-panel-left {
          width: 200px;
          flex-shrink: 0;
        }

        .rv-thumb-card {
          border: 1px solid ${BORDER};
          position: relative;
          background: ${BG_INPUT};
          cursor: pointer;
          transition: border-color 0.2s;
          overflow: hidden;
          display: block;
          height: 0;
          padding-bottom: 100%;
        }
        .rv-thumb-card:hover { border-color: ${BORDER_HI}; }
        .rv-thumb-card.rv-active { border-color: ${ACCENT}; }

        .rv-btn-icon {
          background: transparent;
          border: none;
          color: ${MUTED};
          padding: 6px 10px;
          cursor: pointer;
          font-family: ${MONO};
          font-size: 11px;
          display: flex;
          align-items: center;
          gap: 5px;
          transition: all 0.15s;
          white-space: nowrap;
        }
        .rv-btn-icon:hover { color: ${TEXT}; }
        .rv-btn-icon.rv-active { color: ${ACCENT}; }

        .rv-tool-group {
          display: flex;
          align-items: center;
          background: rgba(255,255,255,0.04);
          border: 1px solid ${BORDER};
          border-radius: 8px;
          padding: 2px;
          gap: 1px;
        }
        .rv-tool-group .rv-btn-icon {
          border-radius: 6px;
          padding: 5px 9px;
        }
        .rv-tool-group .rv-btn-icon.rv-active {
          background: ${ACCENT_DIM};
          color: ${ACCENT};
        }

        .rv-section-title {
          display: flex;
          align-items: center;
          gap: 8px;
          margin-bottom: 12px;
          font-family: ${MONO};
          font-size: 10px;
          text-transform: uppercase;
          letter-spacing: 0.05em;
          color: ${DIM};
        }
        .rv-section-title::before {
          content: '';
          width: 3px;
          height: 10px;
          background: ${BORDER_HI};
          flex-shrink: 0;
        }

        .rv-meta-grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 12px;
        }
        .rv-meta-item { display: flex; flex-direction: column; gap: 3px; }
        .rv-meta-label { font-family: ${MONO}; font-size: 9px; color: ${DIM}; text-transform: uppercase; letter-spacing: 0.05em; }
        .rv-meta-value { font-family: ${MONO}; font-size: 11px; color: ${TEXT}; }

        .rv-btn {
          width: 100%;
          height: 44px;
          display: flex;
          align-items: center;
          justify-content: center;
          font-family: ${MONO};
          font-size: 12px;
          font-weight: 700;
          cursor: pointer;
          border: 1px solid;
          transition: all 0.2s;
          letter-spacing: 0.03em;
          gap: 8px;
        }
        .rv-btn-approve {
          background: ${ACCENT};
          color: #000;
          border-color: ${ACCENT};
        }
        .rv-btn-approve:hover { background: ${ACCENT_HO}; border-color: ${ACCENT_HO}; }
        .rv-btn-revision {
          background: transparent;
          color: ${TEXT};
          border-color: ${BORDER_HI};
        }
        .rv-btn-revision:hover { border-color: ${MUTED}; background: rgba(255,255,255,0.02); }

        ::-webkit-scrollbar { width: 4px; height: 4px; }
        ::-webkit-scrollbar-track { background: ${BG_BASE}; }
        ::-webkit-scrollbar-thumb { background: ${BORDER_HI}; }

        .rv-btn-submit {
          background: ${ACCENT}; color: #000; font-weight: 900;
          font-family: ${MONO}; transition: all 0.3s ease;
          clip-path: polygon(0 0, 100% 0, 100% 65%, 88% 100%, 0 100%);
          border: none; cursor: pointer;
          display: flex; align-items: center; gap: 10px;
          padding: 0 28px; height: 48px; font-size: 14px; white-space: nowrap;
        }
        .rv-btn-submit:disabled { opacity: 1; cursor: not-allowed; background: #1a1a1a; color: rgba(255,255,255,0.25); clip-path: none; border: 1px solid #333; }
        .rv-btn-submit:not(:disabled):hover { transform: translateY(-2px); box-shadow: 0 10px 20px rgba(255,77,0,0.3); }

        .rv-modal-bracket { position: absolute; width: 12px; height: 12px; border-color: ${ACCENT}; pointer-events: none; }
        .rv-modal-b-tl { top: -1px; left: -1px; border-top: 2px solid; border-left: 2px solid; }
        .rv-modal-b-tr { top: -1px; right: -1px; border-top: 2px solid; border-right: 2px solid; }
        .rv-modal-b-bl { bottom: -1px; left: -1px; border-bottom: 2px solid; border-left: 2px solid; }
        .rv-modal-b-br { bottom: -1px; right: -1px; border-bottom: 2px solid; border-right: 2px solid; }

        /* Mobile-only segmented toggle (hidden by default on desktop) */
        .rv-mobile-toggle { display: none; }

        .rv-mobile-seg { display: flex; flex: 1; border: 1px solid ${BORDER}; }
        .rv-mobile-seg button {
          flex: 1; height: 36px; background: transparent; border: none;
          color: ${MUTED}; font-family: ${MONO}; font-size: 11px;
          letter-spacing: 0.05em; cursor: pointer; text-transform: uppercase;
        }
        .rv-mobile-seg button.rv-active { background: ${ACCENT_DIM}; color: ${ACCENT}; }
        .rv-mobile-seg button + button { border-left: 1px solid ${BORDER}; }
        .rv-mobile-cmp {
          background: transparent; border: 1px solid ${BORDER}; color: ${MUTED};
          width: 36px; height: 36px; display: flex; align-items: center; justify-content: center; cursor: pointer;
        }
        .rv-mobile-cmp:hover { color: ${TEXT}; border-color: ${BORDER_HI}; }

        @media (max-width: 900px) {
          .rv-header-top { height: 52px !important; padding: 0 14px !important; }
          .rv-header-project-title { font-size: 15px !important; }
          .rv-header-photographer { display: none !important; }
          .rv-header-reviewed-label { display: none !important; }
          .rv-header-sub { display: none !important; }
          .rv-deadline-badge { display: none !important; }
          .rv-workspace { flex-direction: column !important; }
          .rv-panel-left { display: none !important; }
          .rv-toolbar-desktop { display: none !important; }
          .rv-mobile-toggle { display: flex !important; }
          .rv-stage { padding: 10px !important; gap: 8px !important; }
          .rv-stage-meta-right { display: none !important; }
          .rv-bg-grid { background-image: none !important; }
          .rv-footer-meta { display: none !important; }
          .rv-footer { padding-bottom: env(safe-area-inset-bottom) !important; }
          .rv-btn-submit { height: 40px !important; padding: 0 18px !important; font-size: 12px !important; }
          .rv-action-bar { padding: 10px 12px !important; }
        }
      `}</style>

      <div
        className="rv-bg-grid"
        style={{
          background: BG_BASE, height: "100vh", display: "flex", flexDirection: "column",
          color: TEXT, overflow: "hidden",
          backgroundImage: `linear-gradient(#161616 1px, transparent 1px), linear-gradient(90deg, #161616 1px, transparent 1px)`,
          backgroundSize: "40px 40px",
        }}
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
      >
        {/* ── Header ── */}
        <header style={{ flexShrink: 0, borderBottom: `1px solid ${BORDER}`, background: "rgba(10,10,10,0.92)", backdropFilter: "blur(20px)", zIndex: 10 }}>
          {/* Row 1 */}
          <div className="rv-header-top" style={{ height: 80, padding: "0 24px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            {/* Left */}
            <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
              <Link href={`/c/${token}`} style={{ textDecoration: "none" }}>
                <div style={{ width: 32, height: 32, background: ACCENT, display: "flex", alignItems: "center", justifyContent: "center", color: "#000", fontFamily: "'Space Grotesk', sans-serif", fontWeight: 900, fontSize: 18, flexShrink: 0 }}>A</div>
              </Link>
              <div>
                <h1 className="rv-header-project-title" style={{ fontFamily: "'Space Grotesk', sans-serif", fontWeight: 900, fontSize: 20, letterSpacing: "-0.5px", lineHeight: 1, color: TEXT, margin: 0 }}>
                  {project.name}
                </h1>
                <p className="rv-header-sub" style={{ fontFamily: MONO, fontSize: 10, color: DIM, marginTop: 4, letterSpacing: "0.1em" }}>
                  REVIEW // 보정본 검토
                </p>
              </div>
            </div>

            {/* Right */}
            <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
              {photographer && (
                <>
                  <div className="rv-header-photographer" style={{ textAlign: "right" }}>
                    <p style={{ fontFamily: MONO, fontSize: 10, color: DIM, textTransform: "uppercase", letterSpacing: "0.08em", margin: 0 }}>Photography by</p>
                    <p style={{ fontWeight: 700, fontSize: 14, color: TEXT, marginTop: 2, fontFamily: "'Space Grotesk', sans-serif" }}>{photographer}</p>
                  </div>
                  <div className="rv-header-photographer" style={{ width: 1, height: 32, background: BORDER, flexShrink: 0 }} />
                </>
              )}
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                {reviewDeadlineDisplay && (
                  <div className="rv-deadline-badge" style={{
                    display: "flex", alignItems: "center", gap: 5,
                    padding: "3px 10px", borderRadius: 20,
                    background: "rgba(255,77,0,0.1)", border: "1px solid rgba(255,77,0,0.25)",
                  }}>
                    <span style={{ fontFamily: MONO, fontSize: 9, color: ACCENT }}>기한</span>
                    <span style={{ fontFamily: MONO, fontSize: 10, color: TEXT, fontWeight: 700 }}>{reviewDeadlineDisplay}</span>
                  </div>
                )}
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <span className="rv-header-reviewed-label" style={{ fontFamily: MONO, fontSize: 10, color: MUTED }}>검토</span>
                  <span style={{ fontFamily: "'Space Grotesk', sans-serif", fontWeight: 800, fontSize: 22, lineHeight: 1, color: TEXT }}>
                    {reviewedCount}<span style={{ fontFamily: MONO, fontSize: 12, color: DIM, fontWeight: 400 }}> / {total}</span>
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Toolbar (desktop) — 뷰 모드 + 풀스크린만 */}
          <div className="rv-toolbar-desktop" style={{ borderTop: `1px solid ${BORDER}`, background: "rgba(5,5,5,0.8)" }}>
            <div style={{ height: 46, padding: "0 20px", display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 16 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <div className="rv-tool-group">
                  <button type="button" className={`rv-btn-icon${viewMode === "single-original" ? " rv-active" : ""}`} onClick={() => setViewMode("single-original")} title="원본만 보기">
                    원본
                  </button>
                  <button type="button" className={`rv-btn-icon${viewMode === "side-by-side" ? " rv-active" : ""}`} onClick={() => setViewMode("side-by-side")} title="나란히 보기">
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="18" height="18" rx="1"/><line x1="12" y1="3" x2="12" y2="21"/></svg>
                    나란히
                  </button>
                  <button type="button" className={`rv-btn-icon${viewMode === "single-retouched" ? " rv-active" : ""}`} onClick={() => setViewMode("single-retouched")} title="보정본만 보기">
                    보정
                  </button>
                </div>
                <button type="button" className="rv-btn-icon" onClick={() => { setFullInitial("version"); setFullOpen(true); }} style={{ border: `1px solid ${BORDER}`, borderRadius: 8, padding: "5px 9px" }}>
                  <Maximize2 size={13} />
                </button>
              </div>
            </div>
          </div>

          {/* Row 2: Mobile-only toggle (원본 | 보정본 + 비교) */}
          <div
            className="rv-mobile-toggle"
            style={{
              borderTop: `1px solid #111`,
              background: "rgba(0,0,0,0.6)",
              padding: "8px 12px",
              alignItems: "center",
              gap: 8,
            }}
          >
            <div className="rv-mobile-seg" role="tablist" aria-label="이미지 보기 모드">
              <button
                type="button"
                role="tab"
                aria-selected={viewMode === "single-original"}
                className={viewMode === "single-original" ? "rv-active" : ""}
                onClick={() => setViewMode("single-original")}
              >
                원본
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={viewMode === "single-retouched"}
                className={viewMode === "single-retouched" ? "rv-active" : ""}
                onClick={() => setViewMode("single-retouched")}
              >
                보정본
              </button>
            </div>
            <button
              type="button"
              className="rv-mobile-cmp"
              aria-label="원본/보정본 비교 보기"
              onClick={() => {
                setFullInitial(viewMode === "single-original" ? "original" : "version");
                setFullOpen(true);
              }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="3" y="3" width="18" height="18" rx="1" />
                <line x1="12" y1="3" x2="12" y2="21" />
              </svg>
            </button>
          </div>
        </header>

        {/* ── Workspace ── */}
        <div className="rv-workspace">

          {/* Left panel: thumbnail gallery */}
          <div className="rv-panel-left" style={{ borderRight: `1px solid ${BORDER}`, display: sidebarOpen ? "flex" : "none", flexDirection: "column", background: "rgba(3,3,3,0.95)", position: "relative" }}>
            {/* 사이드바 닫기 버튼 — 우측 엣지 중앙 */}
            <button
              type="button"
              onClick={() => setSidebarOpen(false)}
              title="사이드바 닫기"
              style={{
                position: "absolute", top: "50%", right: 0, transform: "translateY(-50%)",
                zIndex: 20, background: "rgba(10,10,12,0.9)", border: `1px solid ${BORDER_HI}`,
                borderRight: "none", borderRadius: "6px 0 0 6px",
                color: MUTED, cursor: "pointer", padding: "10px 4px",
                display: "flex", alignItems: "center",
              }}
            >
              <ChevronLeft size={14} />
            </button>
            <div style={{ padding: "8px 14px", borderBottom: `1px solid ${BORDER}`, display: "flex", alignItems: "center", justifyContent: "space-between", flexShrink: 0 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <button type="button" onClick={goPrev} style={{ background: "none", border: "none", cursor: "pointer", color: MUTED, padding: 0, display: "flex", alignItems: "center" }}>
                  <ChevronLeft size={13} />
                </button>
                <span style={{ fontFamily: MONO, fontSize: 10, color: MUTED, minWidth: 36, textAlign: "center" }}>
                  {currentIndex + 1} / {total}
                </span>
                <button type="button" onClick={goNext} style={{ background: "none", border: "none", cursor: "pointer", color: MUTED, padding: 0, display: "flex", alignItems: "center" }}>
                  <ChevronRight size={13} />
                </button>
              </div>
            </div>
            <div style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: 12, display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 8, alignContent: "start" }}>
              {photos.map((p, i) => {
                const pReview     = getReview(p.id);
                const pStatus     = pReview?.status ?? "pending";
                const isActive    = p.id === activePhotoId;
                const pApproved   = pStatus === "approved";
                const pRevision   = pStatus === "revision_requested";
                const pillColor   = pApproved ? GREEN : pRevision ? ORANGE : undefined;
                const pillLabel   = pApproved ? "✓" : pRevision ? "↺" : null;
                const statusBarColor = pApproved ? GREEN : pRevision ? ORANGE : null;
                const thumbSrc    = p.versionThumbUrl ?? p.versionUrl ?? p.originalUrl;

                return (
                  <div
                    key={p.id}
                    className={`rv-thumb-card${isActive ? " rv-active" : ""}`}
                    onClick={() => navigate(p.id)}
                  >
                    {thumbSrc ? (
                      <img
                        src={thumbSrc}
                        alt=""
                        style={{
                          position: "absolute",
                          inset: 0,
                          width: "100%",
                          height: "100%",
                          objectFit: "cover",
                          opacity: isActive ? 1 : 0.6,
                          display: "block",
                        }}
                      />
                    ) : (
                      <div
                        style={{
                          position: "absolute",
                          inset: 0,
                          background: `radial-gradient(circle at center, #1a1a1a 0%, #0a0a0a 100%)`,
                        }}
                      />
                    )}

                    <div
                      style={{
                        position: "absolute",
                        inset: 0,
                        padding: 4,
                        display: "flex",
                        flexDirection: "column",
                        justifyContent: "space-between",
                      }}
                    >
                      {/* 하단 상태 바 */}
                      {statusBarColor && (
                        <div style={{
                          position: "absolute",
                          bottom: 0, left: 0, right: 0,
                          height: 3,
                          background: statusBarColor,
                          borderRadius: "0 0 2px 2px",
                        }} />
                      )}
                      <div style={{ display: "flex", justifyContent: "flex-end", alignItems: "flex-start" }}>
                        {pillLabel && (
                          <span
                            style={{
                              background: "rgba(0,0,0,0.85)",
                              border: `1px solid ${pillColor}40`,
                              color: pillColor,
                              padding: "2px 5px",
                              fontSize: 9,
                              fontFamily: MONO,
                              fontWeight: 700,
                              borderRadius: 2,
                            }}
                          >
                            {pillLabel}
                          </span>
                        )}
                      </div>
                      <span
                        style={{
                          fontFamily: MONO,
                          fontSize: 8,
                          color: MUTED,
                          background: "rgba(0,0,0,0.75)",
                          padding: "1px 3px",
                          alignSelf: "flex-start",
                        }}
                      >
                        {p.originalFilename?.split("/").pop()?.slice(0, 14) ?? `IMG_${String(i + 1).padStart(4, "0")}`}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Center panel: viewer + action bar */}
          <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", overflow: "hidden", position: "relative" }}>
            {/* 사이드바 열기 버튼 — 닫혔을 때만 표시 */}
            {!sidebarOpen && (
              <button
                type="button"
                onClick={() => setSidebarOpen(true)}
                title="사이드바 열기"
                style={{
                  position: "absolute", top: "50%", left: 0, transform: "translateY(-50%)",
                  zIndex: 20, background: "rgba(10,10,12,0.9)", border: `1px solid ${BORDER_HI}`,
                  borderLeft: "none", borderRadius: "0 6px 6px 0",
                  color: MUTED, cursor: "pointer", padding: "10px 4px",
                  display: "flex", alignItems: "center",
                  transition: "color 0.15s",
                }}
              >
                <ChevronRight size={14} />
              </button>
            )}
            {/* Image stage */}
            <div className="rv-stage" style={{ flex: 1, minHeight: 0, padding: 20, display: "flex", gap: 12, overflow: "hidden", position: "relative" }}>
              {showOriginal && (
                <div
                  style={{ flex: 1, border: `1px solid ${BORDER}`, background: "radial-gradient(circle at center,#1a1a1a 0%,#0a0a0a 100%)", position: "relative", cursor: "pointer", overflow: "hidden", borderRadius: 4 }}
                  onClick={() => { setFullInitial("original"); setFullOpen(true); }}
                >
                  <div style={{ position: "absolute", top: 0, left: 0, right: 0, padding: "8px 12px", display: "flex", justifyContent: "space-between", background: "linear-gradient(rgba(0,0,0,0.8),transparent)", zIndex: 2, pointerEvents: "none" }}>
                    <span style={{ background: BG_BASE, border: `1px solid ${BORDER}`, padding: "4px 8px", fontFamily: MONO, fontSize: 9, color: MUTED, letterSpacing: "0.05em", textTransform: "uppercase" }}>원본</span>
                  </div>
                  {current.originalUrl
                    ? <img src={current.originalUrl} alt="원본" style={{ position: "absolute", top: 0, left: 0, width: "100%", height: "100%", objectFit: "contain" }} />
                    : <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: MONO, fontSize: 10, color: DIM }}>NO_IMAGE</div>
                  }
                </div>
              )}
              {showRetouched && (
                <div
                  style={{ flex: 1, border: `1px solid ${isRevision ? "rgba(255,170,0,0.4)" : isApproved ? "rgba(0,255,102,0.35)" : BORDER_HI}`, background: "radial-gradient(circle at center,#1a1a1a 0%,#0a0a0a 100%)", position: "relative", cursor: "pointer", overflow: "hidden", borderRadius: 4, transition: "border-color 0.2s" }}
                  onClick={() => { setFullInitial("version"); setFullOpen(true); }}
                >
                  <div style={{ position: "absolute", top: 0, left: 0, right: 0, padding: "8px 12px", display: "flex", justifyContent: "space-between", background: "linear-gradient(rgba(0,0,0,0.8),transparent)", zIndex: 2, pointerEvents: "none" }}>
                    <span style={{ background: BG_BASE, border: `1px solid ${ACCENT}`, padding: "4px 8px", fontFamily: MONO, fontSize: 9, color: ACCENT, letterSpacing: "0.05em", textTransform: "uppercase" }}>{versionLabel}</span>
                  </div>
                  {current.versionUrl
                    ? <img src={current.versionUrl} alt="보정본" style={{ position: "absolute", top: 0, left: 0, width: "100%", height: "100%", objectFit: "contain" }} />
                    : <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: MONO, fontSize: 10, color: DIM }}>NO_IMAGE</div>
                  }
                </div>
              )}
            </div>

            {/* Action bar */}
            <div className="rv-action-bar" style={{ flexShrink: 0, borderTop: `1px solid ${BORDER}`, background: "rgba(5,5,5,0.95)" }}>

              {/* 재보정 코멘트 한 줄 인풋 (재보정 선택 시 자동 노출) */}
              {/* 코멘트 입력 — 항상 표시, 재보정 선택 시 강조 */}
              <div style={{ padding: "10px 20px 0", display: "flex", alignItems: "center", gap: 8 }}>
                {current.photographerMemo && isRevision && (
                  <span style={{ fontFamily: MONO, fontSize: 10, color: DIM, flexShrink: 0 }}>
                    📌 {current.photographerMemo.slice(0, 30)}{current.photographerMemo.length > 30 ? "…" : ""}
                  </span>
                )}
                <input
                  type="text"
                  value={revisionDraft}
                  onChange={(e) => {
                    const v = e.target.value.slice(0, 100);
                    setRevisionDraft(v);
                    // 타이핑 시작 시 재보정 모드 자동 전환
                    if (v && !isRevision && current) {
                      setReview(current.id, "revision_requested", v);
                    }
                  }}
                  onBlur={handleRevisionSave}
                  placeholder={isRevision ? "재보정 코멘트 (선택, 100자)" : "코멘트를 입력하면 재보정 요청으로 전환됩니다"}
                  maxLength={100}
                  style={{
                    flex: 1, height: 36,
                    background: BG_INPUT,
                    border: `1px solid ${isRevision ? "rgba(255,170,0,0.4)" : BORDER}`,
                    borderRadius: 8,
                    color: TEXT, padding: "0 12px",
                    fontFamily: "'Inter', -apple-system, sans-serif",
                    fontSize: 13, outline: "none", transition: "border-color 0.15s",
                    opacity: isApproved ? 0.4 : 1,
                  }}
                  disabled={isApproved}
                  onFocus={(e) => { if (!isApproved) e.currentTarget.style.borderColor = "rgba(255,170,0,0.5)"; }}
                  onBlurCapture={(e) => { e.currentTarget.style.borderColor = isRevision ? "rgba(255,170,0,0.4)" : BORDER; }}
                />
              </div>

              {/* 하단 버튼 행 */}
              <div style={{ padding: "8px 20px 4px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <div style={{ width: 7, height: 7, borderRadius: "50%", background: isApproved ? GREEN : isRevision ? ORANGE : DIM, flexShrink: 0 }} />
                  <span style={{ fontFamily: MONO, fontSize: 11, color: isApproved ? GREEN : isRevision ? ORANGE : MUTED }}>
                    {statusLabelKo}
                  </span>
                </div>
                <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
                  {canRequestRevision && (
                    <button type="button" onClick={openRevisionInline}
                      style={{
                        height: 40, padding: "0 18px", display: "flex", alignItems: "center", gap: 7,
                        fontFamily: MONO, fontSize: 12, fontWeight: 700, cursor: "pointer", border: "1px solid", borderRadius: 8,
                        transition: "all 0.15s",
                        background: isRevision ? "rgba(255,170,0,0.1)" : "transparent",
                        color: isRevision ? ORANGE : MUTED,
                        borderColor: isRevision ? "rgba(255,170,0,0.45)" : BORDER_HI,
                      }}>
                      <RefreshCw size={12} />
                      {isRevision ? "재보정 ✓" : "재보정"}
                    </button>
                  )}
                  <button type="button" onClick={handleApprove}
                    style={{
                      height: 40, padding: "0 18px", display: "flex", alignItems: "center", gap: 7,
                      fontFamily: MONO, fontSize: 12, fontWeight: 700, cursor: "pointer", border: "1px solid", borderRadius: 8,
                      transition: "all 0.15s",
                      background: isApproved ? "rgba(0,255,102,0.12)" : "transparent",
                      color: isApproved ? GREEN : MUTED,
                      borderColor: isApproved ? "rgba(0,255,102,0.4)" : BORDER_HI,
                    }}>
                    <Check size={12} />
                    {isApproved ? "확정됨" : "확정"}
                  </button>
                </div>
              </div>
              {/* 키보드 단축키 힌트 */}
              <div className="rv-header-photographer" style={{ padding: "2px 20px 8px", textAlign: "right" }}>
                <span style={{ fontFamily: MONO, fontSize: 9, color: DIM, letterSpacing: "0.05em" }}>
                  [Y] 확정 &nbsp; [R] 재보정 &nbsp; [←][→] 이동
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* ── Submit bottom bar ── */}
        <footer className="rv-footer" style={{ flexShrink: 0, background: "#000", borderTop: `1px solid rgba(255,77,0,0.3)`, backdropFilter: "blur(12px)" }}>
          <div style={{ height: 72, padding: "0 24px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 24 }}>
            <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 6 }}>
              <div style={{ display: "flex", justifyContent: "space-between", fontFamily: MONO, fontSize: 10, textTransform: "uppercase", letterSpacing: "0.08em" }}>
                <span style={{ color: MUTED }}>보정본 검토</span>
                <span style={{ color: ACCENT }}>{reviewedCount} / {total}장</span>
              </div>
              <div style={{ width: "100%", height: 3, background: "#111" }}>
                <div style={{ height: "100%", background: ACCENT, width: `${progressPct}%`, transition: "width 0.3s" }} />
              </div>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 20, flexShrink: 0 }}>
              <div className="rv-footer-meta" style={{ textAlign: "right" }}>
                <p style={{ fontFamily: MONO, fontSize: 11, fontWeight: 700, color: allReviewed ? ACCENT : "rgba(255,255,255,0.35)", margin: 0, whiteSpace: "nowrap" }}>
                  {allReviewed ? "검토 완료! 작가에게 전달해주세요" : `${pendingCount}장 미검토 남음`}
                </p>
              </div>
              <button type="button" className="rv-btn-submit" disabled={!allReviewed} onClick={() => allReviewed && setShowSubmitModal(true)}>
                <span>{allReviewed ? "작가에게 전달" : `${pendingCount}장 검토 후 전달`}</span>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={3}>
                  <line x1="5" y1="12" x2="19" y2="12" /><polyline points="12 5 19 12 12 19" />
                </svg>
              </button>
            </div>
          </div>
        </footer>

      </div>

      {/* ── Submit Modal ── */}
      {showSubmitModal && (
        <div
          style={{ position: "fixed", inset: 0, zIndex: 200, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(0,0,0,0.82)", backdropFilter: "blur(6px)", padding: 16 }}
          onClick={() => setShowSubmitModal(false)}
        >
          <div
            style={{ width: "100%", maxWidth: 440, background: BG_PANEL, border: `1px solid ${ACCENT}`, padding: 40, position: "relative" }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="rv-modal-bracket rv-modal-b-tl" />
            <div className="rv-modal-bracket rv-modal-b-tr" />
            <div className="rv-modal-bracket rv-modal-b-bl" />
            <div className="rv-modal-bracket rv-modal-b-br" />
            <h3 style={{ fontFamily: "'Space Grotesk', sans-serif", fontWeight: 800, fontSize: 22, letterSpacing: "-0.5px", marginBottom: 12, color: TEXT }}>
              검토 결과를 전달할까요?
            </h3>
            <p style={{ color: MUTED, fontSize: 13, lineHeight: 1.7, marginBottom: 28 }}>
              확정 <span style={{ color: GREEN, fontWeight: 700 }}>{approvedCount}장</span>,{" "}
              재보정 요청 <span style={{ color: ORANGE, fontWeight: 700 }}>{revisionCount}장</span>을 작가에게 전달합니다.
            </p>
            {submitError && <p style={{ color: "#ef4444", fontSize: 12, marginBottom: 16 }}>{submitError}</p>}
            <div style={{ display: "flex", gap: 12 }}>
              <button
                type="button"
                onClick={() => { setShowSubmitModal(false); setSubmitError(null); }}
                style={{ flex: 1, height: 48, border: `1px solid ${BORDER_HI}`, background: "none", color: MUTED, fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: MONO, transition: "all 0.2s" }}
                onMouseEnter={(e) => { e.currentTarget.style.background = TEXT; e.currentTarget.style.color = "#000"; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = "none"; e.currentTarget.style.color = MUTED; }}
              >
                취소
              </button>
              <button
                type="button"
                onClick={async () => { await handleSubmit(); }}
                style={{ flex: 1, height: 48, background: ACCENT, color: "#000", fontSize: 13, fontWeight: 900, textTransform: "uppercase", border: "none", cursor: "pointer", fontFamily: MONO }}
              >
                전달하기
              </button>
            </div>
          </div>
        </div>
      )}

      <FullScreenCompareModal
        open={fullOpen}
        initialSide={fullInitial}
        originalUrl={current.originalUrl}
        versionUrl={current.versionUrl}
        versionLabel={versionLabel}
        onClose={() => setFullOpen(false)}
      />
    </>
  );
}
