"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { Check, RefreshCw } from "lucide-react";
import { useSelection } from "@/contexts/SelectionContext";
import { useReview } from "@/contexts/ReviewContext";
import type { ReviewPhotoItem } from "@/lib/customer-api-server";

const ACCENT = "#FF4D00";
const GREEN  = "#00e676";
const RED    = "#ff4757";

export default function ReviewGalleryPage() {
  const params = useParams();
  const token  = (params?.token as string) ?? "";

  const { project, loading: selectionLoading } = useSelection();
  const { reviewPhotos, loadReviewPhotos, reviewPhotosLoading, reviewState, getReview, resetAll, setReview } = useReview();

  const [submitError,     setSubmitError]     = useState<string | null>(null);
  const [showSubmitModal, setShowSubmitModal] = useState(false);

  useEffect(() => {
    if (!project?.id || !project?.status) return;
    loadReviewPhotos(token, project.id, project.status);
  }, [token, project?.id, project?.status, loadReviewPhotos]);

  const photos  = reviewPhotos;
  const total   = photos.length;

  const approvedCount = useMemo(
    () => photos.filter((p) => getReview(p.id)?.status === "approved").length,
    [photos, reviewState],
  );
  const revisionCount = useMemo(
    () => photos.filter((p) => getReview(p.id)?.status === "revision_requested").length,
    [photos, reviewState],
  );
  const pendingCount  = total - approvedCount - revisionCount;
  const reviewedCount = approvedCount + revisionCount;
  const allReviewed   = total > 0 && pendingCount === 0;
  const progressPct   = total > 0 ? Math.round((reviewedCount / total) * 100) : 0;

  const handleSubmit = useCallback(async () => {
    if (!allReviewed || !token) return;
    setSubmitError(null);
    let finalStatus: string | null = null;
    const hasRealIds = photos.some((p) => (p as ReviewPhotoItem).photoVersionId?.length > 0);
    if (hasRealIds) {
      const reviews = photos
        .filter((p) => (p as ReviewPhotoItem).photoVersionId)
        .map((p) => {
          const rev = getReview(p.id);
          return {
            photo_version_id: (p as ReviewPhotoItem).photoVersionId,
            photo_id: p.id,
            status: (rev?.status ?? "approved") as "approved" | "revision_requested",
            customer_comment: rev?.comment ?? null,
          };
        });
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
    if (finalStatus === "delivered") { window.location.replace(`/c/${token}/delivered`); return; }
    window.location.replace(`/c/${token}/confirmed`);
  }, [allReviewed, token, revisionCount, photos, getReview, resetAll]);

  const handleApproveAll = useCallback(() => {
    if (photos.length === 0) return;
    photos.forEach((p) => setReview(p.id, "approved"));
  }, [photos, setReview]);

  /* ── loading / guard ── */
  if (selectionLoading || reviewPhotosLoading || !project) {
    return (
      <div style={{ display: "flex", minHeight: "100vh", alignItems: "center", justifyContent: "center", background: "#000" }}>
        <p style={{ fontFamily: "'Space Mono', 'Noto Sans KR', sans-serif", fontSize: 11, color: "#555", letterSpacing: "0.1em" }}>
          {selectionLoading || reviewPhotosLoading ? "LOADING_REVIEW..." : "INVALID_TOKEN"}
        </p>
      </div>
    );
  }

  const canShowReview = project.status === "reviewing_v1" || project.status === "reviewing_v2";
  if (!canShowReview) {
    return (
      <div style={{ display: "flex", minHeight: "100vh", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 16, background: "#000" }}>
        <p style={{ fontFamily: "'Space Mono', 'Noto Sans KR', sans-serif", fontSize: 11, color: "#555" }}>NOT_IN_REVIEW_PHASE</p>
        <Link href={`/c/${token}/confirmed`} style={{ fontFamily: "'Space Mono', 'Noto Sans KR', sans-serif", fontSize: 11, color: ACCENT, textDecoration: "none", border: "1px solid #1A1A1A", padding: "8px 16px" }}>
          ← BACK_TO_CONFIRMED
        </Link>
      </div>
    );
  }

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@700;900&family=Space+Mono:wght@400;700&display=swap');

        .rv-grid-bg {
          position: fixed; inset: 0;
          background-image: linear-gradient(#1A1A1A 1px, transparent 1px),
                            linear-gradient(90deg, #1A1A1A 1px, transparent 1px);
          background-size: 40px 40px;
          pointer-events: none; z-index: 0; opacity: 0.5;
        }

        .rv-photo-card {
          position: relative;
          aspect-ratio: 1 / 1;
          background: #111;
          border: 1px solid #1A1A1A;
          transition: all 0.3s cubic-bezier(0.16, 1, 0.3, 1);
          cursor: pointer; overflow: hidden;
          display: block; text-decoration: none;
        }
        .rv-photo-card img {
          width: 100%; height: 100%; object-fit: cover;
          transition: transform 0.6s ease; display: block;
        }
        .rv-photo-card:hover img { transform: scale(1.05); }
        .rv-photo-card.rv-approved { border-color: rgba(0,230,118,0.5); box-shadow: inset 0 0 0 1px rgba(0,230,118,0.25); }
        .rv-photo-card.rv-revision { border-color: rgba(255,71,87,0.45); box-shadow: inset 0 0 0 1px rgba(255,71,87,0.2); }

        .rv-bracket {
          position: absolute; width: 12px; height: 12px;
          border-color: ${ACCENT}; pointer-events: none; z-index: 10;
        }
        .rv-b-tl { top: -1px; left: -1px; border-top: 2px solid; border-left: 2px solid; }
        .rv-b-tr { top: -1px; right: -1px; border-top: 2px solid; border-right: 2px solid; }
        .rv-b-bl { bottom: -1px; left: -1px; border-bottom: 2px solid; border-left: 2px solid; }
        .rv-b-br { bottom: -1px; right: -1px; border-bottom: 2px solid; border-right: 2px solid; }

        .rv-card-overlay {
          position: absolute; inset: 0;
          background: linear-gradient(to top, rgba(0,0,0,0.88) 0%, rgba(0,0,0,0.25) 50%, transparent 75%);
          z-index: 15; pointer-events: none;
          padding: 8px; display: flex; flex-direction: column; justify-content: flex-end;
        }
        .rv-overlay-interactive {
          display: flex; gap: 4px;
          opacity: 0; pointer-events: none;
          transition: opacity 0.2s;
        }
        .rv-photo-card:hover .rv-overlay-interactive {
          opacity: 1; pointer-events: auto;
        }

        .rv-action-btn {
          flex: 1; height: 28px; font-size: 10px; font-weight: 700; letter-spacing: 0.04em;
          display: flex; align-items: center; justify-content: center; gap: 3px;
          cursor: pointer; border: 1px solid; transition: all 0.15s;
          font-family: 'Space Mono', 'Noto Sans KR', sans-serif;
        }

        .rv-filter-tab {
          position: relative; padding: 8px 14px;
          font-size: 12px; font-weight: 700; color: #555;
          transition: color 0.2s; background: none; border: none;
          cursor: pointer; white-space: nowrap; font-family: inherit;
        }
        .rv-filter-tab.rv-tab-active { color: ${ACCENT}; }
        .rv-filter-tab.rv-tab-active::after {
          content: ''; position: absolute; bottom: -1px; left: 0;
          width: 100%; height: 2px; background: ${ACCENT};
        }

        .rv-btn-submit {
          background: ${ACCENT}; color: #000; font-weight: 900;
          font-family: inherit; transition: all 0.3s ease;
          clip-path: polygon(0 0, 100% 0, 100% 65%, 88% 100%, 0 100%);
          border: none; cursor: pointer;
          display: flex; align-items: center; gap: 10px;
          padding: 0 28px; height: 48px; font-size: 14px;
        }
        .rv-btn-submit:disabled { opacity: 0.4; cursor: not-allowed; background: #555; }
        .rv-btn-submit:not(:disabled):hover {
          transform: translateY(-2px);
          box-shadow: 0 10px 20px rgba(255,77,0,0.3);
        }

        .rv-modal-bracket {
          position: absolute; width: 12px; height: 12px;
          border-color: ${ACCENT}; pointer-events: none;
        }
        .rv-modal-b-tl { top: -1px; left: -1px; border-top: 2px solid; border-left: 2px solid; }
        .rv-modal-b-tr { top: -1px; right: -1px; border-top: 2px solid; border-right: 2px solid; }
        .rv-modal-b-bl { bottom: -1px; left: -1px; border-bottom: 2px solid; border-left: 2px solid; }
        .rv-modal-b-br { bottom: -1px; right: -1px; border-bottom: 2px solid; border-right: 2px solid; }

        ::-webkit-scrollbar { width: 4px; height: 4px; }
        ::-webkit-scrollbar-track { background: #000; }
        ::-webkit-scrollbar-thumb { background: ${ACCENT}; }

        @media (max-width: 767px) {
          .rv-header-top { height: 56px !important; padding: 0 14px !important; }
          .rv-header-project-title { font-size: 15px !important; }
          .rv-header-deadline { display: none; }
          .rv-header-right-label { display: none; }
          .rv-header-count { font-size: 20px !important; }

          .rv-header-filter {
            height: 44px !important;
            padding: 0 10px !important;
            overflow-x: auto !important;
            overflow-y: hidden !important;
            flex-wrap: nowrap !important;
            gap: 8px !important;
          }
          .rv-stat-dot { display: none !important; }
          .rv-approve-all-btn { padding: 5px 10px !important; font-size: 9px !important; }

          .rv-page-wrapper { padding-top: 104px !important; padding-bottom: 72px !important; }
          .rv-grid-main { padding: 0 6px !important; }
          .rv-photo-grid { grid-template-columns: repeat(3, 1fr) !important; gap: 3px !important; }

          .rv-overlay-interactive { opacity: 1 !important; pointer-events: auto !important; }
          .rv-action-btn { height: 22px !important; font-size: 8px !important; }

          .rv-footer-inner { height: 60px !important; padding: 0 14px !important; gap: 12px !important; }
          .rv-footer-meta { display: none !important; }
          .rv-footer-progress-label { font-size: 9px !important; }
          .rv-btn-submit { height: 40px !important; padding: 0 18px !important; font-size: 12px !important; }
        }
      `}</style>

      <div className="rv-page-wrapper" style={{ background: "#000", minHeight: "100vh", paddingTop: 140, paddingBottom: 100 }}>
        <div className="rv-grid-bg" />

        {/* ── Header ── */}
        <header style={{ position: "fixed", top: 0, left: 0, right: 0, zIndex: 50, background: "rgba(0,0,0,0.92)", backdropFilter: "blur(20px)", borderBottom: "1px solid #222" }}>
          {/* Row 1: Logo + project name + review count */}
          <div className="rv-header-top" style={{ maxWidth: 1800, margin: "0 auto", height: 80, padding: "0 24px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
              <Link href={`/c/${token}`} style={{ textDecoration: "none" }}>
                <div style={{ width: 32, height: 32, background: ACCENT, display: "flex", alignItems: "center", justifyContent: "center", color: "#000", fontFamily: "'Space Grotesk', sans-serif", fontWeight: 900, fontSize: 18, flexShrink: 0 }}>A</div>
              </Link>
              <div>
                <h1 className="rv-header-project-title" style={{ fontFamily: "'Space Grotesk', sans-serif", fontWeight: 900, fontSize: 20, letterSpacing: "-0.5px", lineHeight: 1, color: "#fff", margin: 0 }}>
                  {project.name}
                </h1>
                <p className="rv-header-deadline" style={{ fontFamily: "'Space Mono', 'Noto Sans KR', sans-serif", fontSize: 10, color: "#555", marginTop: 4, letterSpacing: "0.1em" }}>
                  REVIEW // 보정본 검토
                </p>
              </div>
            </div>

            <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span className="rv-header-right-label" style={{ fontFamily: "'Space Mono', 'Noto Sans KR', sans-serif", fontSize: 11, color: ACCENT, fontWeight: 700 }}>REVIEWED</span>
                <span className="rv-header-count" style={{ fontFamily: "'Space Grotesk', sans-serif", fontWeight: 900, fontSize: 28, lineHeight: 1, color: "#fff" }}>
                  {reviewedCount}{" "}
                  <span style={{ fontFamily: "'Space Mono', 'Noto Sans KR', sans-serif", fontSize: 12, color: "#444", fontWeight: 400 }}>/ {total}</span>
                </span>
              </div>
            </div>
          </div>

          {/* Row 2: Progress bar + stats + 전체확정 */}
          <div style={{ borderTop: "1px solid #111", background: "rgba(0,0,0,0.5)" }}>
            <div className="rv-header-filter" style={{ maxWidth: 1800, margin: "0 auto", height: 56, padding: "0 24px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 20 }}>
              {/* Progress + legend */}
              <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 6 }}>
                <div style={{ width: "100%", height: 3, background: "#111", flexShrink: 0 }}>
                  <div style={{ height: "100%", background: ACCENT, width: `${progressPct}%`, transition: "width 0.3s" }} />
                </div>
                <div style={{ display: "flex", gap: 14, flexShrink: 0 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                    <span className="rv-stat-dot" style={{ width: 6, height: 6, borderRadius: "50%", background: GREEN, display: "inline-block", flexShrink: 0 }} />
                    <span style={{ fontFamily: "'Space Mono', sans-serif", fontSize: 10, color: GREEN, whiteSpace: "nowrap" }}>확정 {approvedCount}</span>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                    <span className="rv-stat-dot" style={{ width: 6, height: 6, borderRadius: "50%", background: RED, display: "inline-block", flexShrink: 0 }} />
                    <span style={{ fontFamily: "'Space Mono', sans-serif", fontSize: 10, color: RED, whiteSpace: "nowrap" }}>재보정 {revisionCount}</span>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                    <span className="rv-stat-dot" style={{ width: 6, height: 6, borderRadius: "50%", background: "#444", display: "inline-block", flexShrink: 0 }} />
                    <span style={{ fontFamily: "'Space Mono', sans-serif", fontSize: 10, color: "#555", whiteSpace: "nowrap" }}>미검토 {pendingCount}</span>
                  </div>
                </div>
              </div>

              {/* 전체 확정 button */}
              <button
                type="button"
                className="rv-approve-all-btn"
                onClick={handleApproveAll}
                disabled={photos.length === 0}
                style={{
                  fontFamily: "'Space Mono', 'Noto Sans KR', sans-serif", fontSize: 10,
                  color: GREEN, background: "rgba(0,230,118,0.08)",
                  border: "1px solid rgba(0,230,118,0.25)",
                  padding: "6px 14px", cursor: photos.length === 0 ? "not-allowed" : "pointer",
                  opacity: photos.length === 0 ? 0.4 : 1,
                  display: "flex", alignItems: "center", gap: 5, flexShrink: 0,
                  textTransform: "uppercase", letterSpacing: "0.05em",
                }}
              >
                <Check style={{ width: 11, height: 11 }} /> 전체 확정
              </button>
            </div>
          </div>
        </header>

        {/* ── Gallery Grid ── */}
        <main className="rv-grid-main" style={{ position: "relative", zIndex: 10, maxWidth: 1800, margin: "0 auto", padding: "0 24px" }}>
          <div className="rv-photo-grid" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(148px, 1fr))", gap: 12 }}>
            {photos.map((p) => {
              const review     = getReview(p.id);
              const status     = review?.status ?? "pending";
              const isApproved = status === "approved";
              const isRevision = status === "revision_requested";

              const cardClass    = `rv-photo-card${isApproved ? " rv-approved" : isRevision ? " rv-revision" : ""}`;
              const statusLabel  = isApproved ? "✓ 확정" : isRevision ? "↩ 재보정" : null;
              const statusColor  = isApproved ? GREEN : RED;
              const statusBg     = isApproved ? "rgba(0,230,118,0.18)" : "rgba(255,71,87,0.15)";
              const statusBorder = isApproved ? "rgba(0,230,118,0.4)" : "rgba(255,71,87,0.35)";

              return (
                <Link key={p.id} href={`/c/${token}/review/${p.id}`} className={cardClass}>
                  <div className="rv-bracket rv-b-tl" />
                  <div className="rv-bracket rv-b-tr" />
                  <div className="rv-bracket rv-b-bl" />
                  <div className="rv-bracket rv-b-br" />

                  <img src={p.versionUrl} alt={p.originalFilename ?? ""} loading="lazy" decoding="async" draggable={false} />

                  {statusLabel && (
                    <span style={{
                      position: "absolute", top: 8, right: 8, zIndex: 20,
                      padding: "2px 7px",
                      fontFamily: "'Space Mono', 'Noto Sans KR', sans-serif",
                      fontSize: 9, fontWeight: 700, letterSpacing: "0.04em",
                      color: statusColor, background: statusBg, border: `1px solid ${statusBorder}`,
                      pointerEvents: "none",
                    }}>
                      {statusLabel}
                    </span>
                  )}

                  <div className="rv-card-overlay">
                    <div className="rv-overlay-interactive">
                      <button
                        type="button"
                        className="rv-action-btn"
                        onClick={(e) => { e.preventDefault(); e.stopPropagation(); setReview(p.id, "approved"); }}
                        style={{
                          background: isApproved ? "rgba(0,230,118,0.18)" : "rgba(0,0,0,0.65)",
                          borderColor: isApproved ? GREEN : "rgba(0,230,118,0.45)",
                          color: GREEN,
                        }}
                      >
                        <Check style={{ width: 9, height: 9 }} /> 확정
                      </button>
                      <button
                        type="button"
                        className="rv-action-btn"
                        onClick={(e) => { e.preventDefault(); e.stopPropagation(); setReview(p.id, "revision_requested"); }}
                        style={{
                          background: isRevision ? "rgba(255,71,87,0.15)" : "rgba(0,0,0,0.65)",
                          borderColor: isRevision ? RED : "rgba(255,71,87,0.4)",
                          color: RED,
                        }}
                      >
                        <RefreshCw style={{ width: 9, height: 9 }} /> 재보정
                      </button>
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>

          {photos.length === 0 && !reviewPhotosLoading && (
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "80px 0", gap: 12 }}>
              <p style={{ fontFamily: "'Space Mono', 'Noto Sans KR', sans-serif", fontSize: 11, color: "#333", letterSpacing: "0.1em" }}>NO_PHOTOS_FOUND</p>
            </div>
          )}
        </main>

        {/* ── Bottom Bar ── */}
        <footer style={{ position: "fixed", bottom: 0, left: 0, right: 0, zIndex: 50, background: "#000", borderTop: "1px solid rgba(255,77,0,0.3)", backdropFilter: "blur(12px)" }}>
          <div className="rv-footer-inner" style={{ maxWidth: 1800, margin: "0 auto", height: 80, padding: "0 24px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div className="rv-footer-progress" style={{ flex: 1, display: "flex", flexDirection: "column", gap: 8 }}>
              <div className="rv-footer-progress-label" style={{ display: "flex", justifyContent: "space-between", fontFamily: "'Space Mono', 'Noto Sans KR', sans-serif", fontSize: 10, textTransform: "uppercase", letterSpacing: "0.08em" }}>
                <span style={{ color: "#888" }}>보정본 검토</span>
                <span style={{ color: ACCENT }}>{reviewedCount} / {total}장</span>
              </div>
              <div style={{ width: "100%", height: 3, background: "#111" }}>
                <div style={{ height: "100%", background: ACCENT, width: `${progressPct}%`, transition: "width 0.3s" }} />
              </div>
            </div>

            <div style={{ display: "flex", alignItems: "center", gap: 24, marginLeft: 32 }}>
              <div className="rv-footer-meta" style={{ textAlign: "right" }}>
                <p style={{ fontSize: 12, fontWeight: 700, color: allReviewed ? ACCENT : "rgba(255,255,255,0.45)", margin: 0 }}>
                  {allReviewed
                    ? "검토 완료! 작가에게 전달해주세요"
                    : `${pendingCount}장 미검토 남음`}
                </p>
              </div>
              <button
                type="button"
                className="rv-btn-submit"
                disabled={!allReviewed}
                onClick={() => allReviewed && setShowSubmitModal(true)}
              >
                <span>작가에게 전달</span>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={3}>
                  <line x1="5" y1="12" x2="19" y2="12" />
                  <polyline points="12 5 19 12 12 19" />
                </svg>
              </button>
            </div>
          </div>
        </footer>

        {/* ── Submit Modal ── */}
        {showSubmitModal && (
          <div
            style={{ position: "fixed", inset: 0, zIndex: 200, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(0,0,0,0.82)", backdropFilter: "blur(6px)", padding: 16 }}
            onClick={() => setShowSubmitModal(false)}
          >
            <div
              style={{ width: "100%", maxWidth: 440, background: "#0A0A0A", border: `1px solid ${ACCENT}`, padding: 40, position: "relative" }}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="rv-modal-bracket rv-modal-b-tl" />
              <div className="rv-modal-bracket rv-modal-b-tr" />
              <div className="rv-modal-bracket rv-modal-b-bl" />
              <div className="rv-modal-bracket rv-modal-b-br" />

              <h3 style={{ fontFamily: "'Space Grotesk', sans-serif", fontWeight: 900, fontSize: 28, textTransform: "uppercase", fontStyle: "italic", marginBottom: 16, color: "#fff" }}>
                Submit Review
              </h3>
              <p style={{ color: "#888", fontSize: 13, lineHeight: 1.7, marginBottom: 32 }}>
                확정 <span style={{ color: GREEN, fontWeight: 700 }}>{approvedCount}장</span>,{" "}
                재보정 요청 <span style={{ color: RED, fontWeight: 700 }}>{revisionCount}장</span>을
                작가에게 전달하시겠습니까?
              </p>

              {submitError && <p style={{ color: "#ef4444", fontSize: 12, marginBottom: 16 }}>{submitError}</p>}

              <div style={{ display: "flex", gap: 12 }}>
                <button
                  type="button"
                  onClick={() => { setShowSubmitModal(false); setSubmitError(null); }}
                  style={{ flex: 1, height: 48, border: "1px solid #222", background: "none", color: "#888", fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", transition: "all 0.2s" }}
                  onMouseEnter={(e) => { e.currentTarget.style.background = "#fff"; e.currentTarget.style.color = "#000"; }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = "none"; e.currentTarget.style.color = "#888"; }}
                >
                  취소
                </button>
                <button
                  type="button"
                  onClick={async () => { await handleSubmit(); }}
                  style={{ flex: 1, height: 48, background: ACCENT, color: "#000", fontSize: 13, fontWeight: 900, textTransform: "uppercase", border: "none", cursor: "pointer", fontFamily: "inherit" }}
                >
                  전달하기
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </>
  );
}
