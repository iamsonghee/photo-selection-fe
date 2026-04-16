"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { Check, RefreshCw } from "lucide-react";
import { useSelection } from "@/contexts/SelectionContext";
import { useReview } from "@/contexts/ReviewContext";
import type { ReviewPhotoItem } from "@/lib/customer-api-server";
import hud from "../customer-acut-hud.module.css";

/* HUD — /about · /delivered */
const INK = "#030303";
const SURFACE = "rgba(10, 10, 10, 0.6)";
const SURFACE2 = "#151515";
const ACCENT = "#ff4d00";
const GREEN = "#00e676";
const RED = "#ff4757";
const DIM = "#555555";
const TEXT = "#ffffff";
const MUTED = "#8c8c8c";
const BORDER = "#2a2a2a";
const BORDER_MD = "#3a3a3a";


export default function ReviewGalleryPage() {
  const params = useParams();
  const token = (params?.token as string) ?? "";
  const { project, loading: selectionLoading } = useSelection();
  const { reviewPhotos, loadReviewPhotos, reviewPhotosLoading, reviewState, getReview, resetAll, setReview } = useReview();
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [showSubmitModal, setShowSubmitModal] = useState(false);
  const [commentDrafts, setCommentDrafts] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!project?.id || !project?.status) return;
    loadReviewPhotos(token, project.id, project.status);
  }, [token, project?.id, project?.status, loadReviewPhotos]);

  const photos = reviewPhotos;
  const total = photos.length;

  // Initialise comment drafts from persisted review state whenever photos load
  useEffect(() => {
    if (photos.length === 0) return;
    setCommentDrafts((prev) => {
      const next = { ...prev };
      photos.forEach((p) => {
        if (next[p.id] == null) {
          const existing = getReview(p.id)?.comment;
          if (existing) next[p.id] = existing;
        }
      });
      return next;
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [photos.length]);

  const approvedCount  = useMemo(() => photos.filter((p) => getReview(p.id)?.status === "approved").length,           [photos, reviewState]);
  const revisionCount  = useMemo(() => photos.filter((p) => getReview(p.id)?.status === "revision_requested").length, [photos, reviewState]);
  const pendingCount   = total - approvedCount - revisionCount;
  const reviewedCount  = approvedCount + revisionCount;
  const allReviewed    = total > 0 && pendingCount === 0;

  const handleSubmit = useCallback(async () => {
    if (!allReviewed || !token) return;
    setSubmitError(null);
    let finalStatus: string | null = null;
    const hasRealIds = photos.some((p) => (p as ReviewPhotoItem).photoVersionId?.length > 0);
    if (hasRealIds) {
      const reviews = photos.filter((p) => (p as ReviewPhotoItem).photoVersionId).map((p) => {
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

  /* ── loading / guard states ─────────────────── */
  if (selectionLoading || reviewPhotosLoading || !project) {
    return (
      <div className="flex min-h-screen items-center justify-center" style={{ background: INK, color: TEXT }}>
        <p style={{ fontSize: 13, color: MUTED }}>{selectionLoading || reviewPhotosLoading ? "로딩 중…" : "존재하지 않는 초대 링크입니다."}</p>
      </div>
    );
  }

  const canShowReview = project.status === "reviewing_v1" || project.status === "reviewing_v2";
  if (!canShowReview) {
    return (
      <div className="flex min-h-screen items-center justify-center" style={{ background: INK, color: TEXT }}>
        <div className="text-center">
          <p style={{ fontSize: 13, color: MUTED, marginBottom: 16 }}>현재 검토 단계가 아닙니다.</p>
          <Link href={`/c/${token}/confirmed`}
            style={{ fontSize: 13, color: MUTED, border: `1px solid ${BORDER_MD}`, borderRadius: 10, padding: "8px 16px" }}>
            확정 페이지로
          </Link>
        </div>
      </div>
    );
  }

  const progressPct = total > 0 ? Math.round((reviewedCount / total) * 100) : 0;

  const invitePath = token ? `/c/${token}` : "#";

  return (
    <div className={hud.root}>
      <div className={`${hud.viewportBracket} ${hud.bracketTl}`} aria-hidden />
      <div className={`${hud.viewportBracket} ${hud.bracketTr}`} aria-hidden />
      <div className={`${hud.viewportBracket} ${hud.bracketBl}`} aria-hidden />
      <div className={`${hud.viewportBracket} ${hud.bracketBr}`} aria-hidden />

      <header className={hud.topHeader} style={{ paddingTop: "max(32px, env(safe-area-inset-top))" }}>
        <div className={hud.headerSide}>
          <Link href={invitePath} className={hud.btnSub} scroll={false}>
            ← 돌아가기
          </Link>
        </div>
        <div className={hud.brandCluster}>
          <div className={hud.logoBox}>A</div>
          <div className={hud.brandName}>
            A컷 <span>Acut</span>
          </div>
        </div>
        <div className={`${hud.headerSide} ${hud.headerSideEnd}`}>
          <span className={hud.headerMeta} title={project.name}>{project.name}</span>
        </div>
      </header>

      <div className={hud.reviewBody} style={{ paddingBottom: 100, paddingLeft: 20, paddingRight: 20 }}>

      {/* ── Subheader ───────────────────────── */}
      <div style={{ padding: "8px 0 0" }}>
        <div className={hud.portalCmd} style={{ marginBottom: 12 }}>CMD :: SYS.REVIEW_GALLERY</div>
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 4 }}>
          <h1 style={{ fontSize: 20, fontWeight: 800, color: TEXT, margin: 0, letterSpacing: "-0.02em" }}>보정본 검토</h1>
          <button type="button" onClick={handleApproveAll} disabled={photos.length === 0}
            style={{
              fontSize: 11, color: GREEN, background: "rgba(0,230,118,0.08)",
              border: `1px solid rgba(0,230,118,0.25)`, borderRadius: 6,
              padding: "4px 10px", cursor: photos.length === 0 ? "not-allowed" : "pointer",
              opacity: photos.length === 0 ? 0.4 : 1,
              display: "flex", alignItems: "center", gap: 4,
            }}>
            <Check style={{ width: 11, height: 11 }} /> 전체 확정
          </button>
        </div>
        <p style={{ fontSize: 12, color: MUTED, margin: "0 0 14px" }}>사진을 클릭해서 원본과 비교하세요</p>

        {/* Progress block */}
        <div style={{ background: SURFACE, border: `1px solid ${BORDER}`, borderRadius: 10, padding: "12px 16px", marginBottom: 14 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
            <span style={{ fontSize: 12, fontWeight: 500, color: TEXT }}>검토 현황</span>
            <span style={{ fontSize: 12, color: MUTED }}>{reviewedCount} / {total}장</span>
          </div>
          <div style={{ height: 4, background: SURFACE2, borderRadius: 2, overflow: "hidden", marginBottom: 8 }}>
            <div style={{ height: "100%", borderRadius: 2, background: ACCENT, width: `${progressPct}%`, transition: "width 0.3s" }} />
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 11 }}>
              <span style={{ width: 6, height: 6, borderRadius: "50%", background: GREEN, display: "inline-block" }} />
              <span style={{ color: GREEN }}>확정 {approvedCount}</span>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 11 }}>
              <span style={{ width: 6, height: 6, borderRadius: "50%", background: RED, display: "inline-block" }} />
              <span style={{ color: RED }}>재보정 {revisionCount}</span>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 11 }}>
              <span style={{ width: 6, height: 6, borderRadius: "50%", background: DIM, display: "inline-block" }} />
              <span style={{ color: MUTED }}>미검토 {pendingCount}</span>
            </div>
          </div>
        </div>
      </div>

      {/* ── Photo grid ──────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4" style={{ gap: 10, padding: 0 }}>
        {photos.map((p) => {
          const review = getReview(p.id);
          const status: "approved" | "revision_requested" | "pending" = review?.status ?? "pending";
          const isApproved  = status === "approved";
          const isRevision  = status === "revision_requested";
          const draft = commentDrafts[p.id] ?? "";

          const cardBorder = isApproved ? "rgba(0,230,118,0.35)" : isRevision ? "rgba(255,71,87,0.25)" : BORDER;
          const cardBg     = isApproved ? "rgba(0,230,118,0.04)" : isRevision ? "rgba(255,71,87,0.02)" : SURFACE;

          const statusLabel = isApproved ? "✓ 확정" : isRevision ? "↩ 재보정" : "미검토";
          const statusColor = isApproved ? GREEN : isRevision ? RED : MUTED;
          const statusBg    = isApproved ? "rgba(0,230,118,0.14)" : isRevision ? "rgba(255,71,87,0.12)" : SURFACE2;
          const statusBorder = isApproved ? "rgba(0,230,118,0.35)" : isRevision ? "rgba(255,71,87,0.2)" : BORDER;

          const saveComment = () => {
            setReview(p.id, "revision_requested", draft || undefined);
          };

          return (
            <div key={p.id} style={{ background: cardBg, border: `1px solid ${cardBorder}`, borderRadius: 10, overflow: "hidden" }}>
              {/* Thumbnail */}
              <Link href={`/c/${token}/review/${p.id}`} style={{ display: "block", position: "relative", aspectRatio: "3/2", background: SURFACE2 }}>
                <img src={p.versionUrl} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
                {/* Status badge */}
                <span style={{
                  position: "absolute", top: 6, right: 6,
                  padding: "2px 8px", borderRadius: 20,
                  fontSize: 10, fontWeight: 500,
                  color: statusColor, background: statusBg, border: `1px solid ${statusBorder}`,
                }}>
                  {statusLabel}
                </span>
              </Link>

              {/* Card body */}
              <div style={{ padding: "10px 12px" }}>
                <p style={{ fontSize: 11, color: MUTED, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", marginBottom: 6 }}>
                  {p.originalFilename}
                </p>
                <Link href={`/c/${token}/review/${p.id}`}
                  style={{ fontSize: 11, color: ACCENT, display: "flex", alignItems: "center", gap: 3, marginBottom: 10, textDecoration: "none" }}>
                  원본과 비교 →
                </Link>

                {/* Action buttons */}
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
                  <button type="button" onClick={() => setReview(p.id, "approved")}
                    style={{
                      height: 34, borderRadius: 7, fontSize: 11, fontWeight: 500,
                      display: "flex", alignItems: "center", justifyContent: "center", gap: 4,
                      cursor: "pointer", border: "1px solid", transition: "all 0.15s",
                      background: isApproved ? "rgba(0,230,118,0.12)" : "rgba(46,213,115,0.06)",
                      borderColor: isApproved ? GREEN : "rgba(0,230,118,0.28)",
                      color: GREEN,
                    }}>
                    <Check style={{ width: 11, height: 11 }} /> 확정
                  </button>
                  <button type="button" onClick={() => {
                    setReview(p.id, "revision_requested", draft || undefined);
                  }}
                    style={{
                      height: 34, borderRadius: 7, fontSize: 11, fontWeight: 500,
                      display: "flex", alignItems: "center", justifyContent: "center", gap: 4,
                      cursor: "pointer", border: "1px solid", transition: "all 0.15s",
                      background: isRevision ? "rgba(255,71,87,0.1)" : "rgba(255,71,87,0.04)",
                      borderColor: isRevision ? RED : "rgba(255,71,87,0.2)",
                      color: RED,
                    }}>
                    <RefreshCw style={{ width: 11, height: 11 }} /> 재보정
                  </button>
                </div>

                {/* Inline revision comment */}
                {isRevision && (
                  <div style={{ marginTop: 8 }}>
                    <textarea
                      value={draft}
                      onChange={(e) => setCommentDrafts((prev) => ({ ...prev, [p.id]: e.target.value }))}
                      onBlur={saveComment}
                      placeholder="재보정 요청 내용을 입력해주세요"
                      rows={2}
                      style={{
                        width: "100%", padding: "8px 10px", boxSizing: "border-box",
                        background: SURFACE2, border: `1px solid rgba(255,71,87,0.2)`,
                        borderRadius: 7, color: TEXT, fontSize: 11, lineHeight: 1.5,
                        resize: "none", outline: "none", fontFamily: "inherit",
                      }}
                    />
                    <button type="button" onClick={saveComment}
                      style={{
                        marginTop: 4, width: "100%", padding: 5, borderRadius: 5,
                        background: "transparent", border: `1px solid rgba(255,71,87,0.2)`,
                        color: RED, fontSize: 10, cursor: "pointer",
                      }}>
                      코멘트 저장
                    </button>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
      </div>

      {/* ── Fixed bottom submit bar ──────────── */}
      <div style={{
        position: "fixed", bottom: 0, left: 0, right: 0,
        background: "rgba(3,3,3,0.97)", borderTop: `1px solid ${BORDER}`,
        backdropFilter: "blur(12px)", padding: "12px 20px", zIndex: 100,
        display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12,
      }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 13, fontWeight: 500, color: TEXT, marginBottom: 2 }}>최종 제출</div>
          <div style={{ fontSize: 11, color: MUTED }}>
            {allReviewed ? "모든 사진 검토 완료" : `미검토 ${pendingCount}장 남음`}
          </div>
        </div>
        <button type="button"
          onClick={() => { if (allReviewed) { setSubmitError(null); setShowSubmitModal(true); } }}
          disabled={!allReviewed}
          style={{
            height: 44, padding: "0 24px", border: "none", borderRadius: 10,
            fontSize: 13, fontWeight: 600, cursor: allReviewed ? "pointer" : "not-allowed",
            flexShrink: 0, transition: "all 0.15s",
            background: allReviewed ? ACCENT : SURFACE2,
            color: allReviewed ? "#000" : DIM,
          }}>
          작가에게 전달
        </button>
      </div>

      {/* ── Submit modal ─────────────────────── */}
      {showSubmitModal && (
        <div style={{
          position: "fixed", inset: 0, zIndex: 200,
          display: "flex", alignItems: "center", justifyContent: "center",
          background: "rgba(0,0,0,0.65)", padding: 16,
        }}>
          <div style={{
            width: "100%", maxWidth: 360,
            background: SURFACE, border: `1px solid ${BORDER_MD}`,
            borderRadius: 16, padding: 24, boxShadow: "0 8px 40px rgba(0,0,0,0.5)",
          }}>
            <h3 style={{ fontSize: 16, fontWeight: 700, color: TEXT, marginBottom: 8, letterSpacing: "-0.02em" }}>최종 제출</h3>
            <p style={{ fontSize: 13, lineHeight: 1.6, color: MUTED, marginBottom: 20 }}>
              확정 <span style={{ color: GREEN }}>{approvedCount}장</span>,{" "}
              재보정 요청 <span style={{ color: RED }}>{revisionCount}장</span>을 작가에게 전달하시겠습니까?
            </p>
            {submitError && <p style={{ fontSize: 12, color: RED, marginBottom: 12 }}>{submitError}</p>}
            <div style={{ display: "flex", gap: 8 }}>
              <button type="button"
                onClick={() => { setShowSubmitModal(false); setSubmitError(null); }}
                style={{
                  flex: 1, height: 44, border: `1px solid ${BORDER_MD}`, borderRadius: 10,
                  fontSize: 13, color: MUTED, background: "transparent", cursor: "pointer",
                }}>
                취소
              </button>
              <button type="button" onClick={async () => { await handleSubmit(); }}
                style={{
                  flex: 1, height: 44, border: "none", borderRadius: 10,
                  fontSize: 13, fontWeight: 700, color: "#000", background: ACCENT, cursor: "pointer",
                }}>
                전달
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
