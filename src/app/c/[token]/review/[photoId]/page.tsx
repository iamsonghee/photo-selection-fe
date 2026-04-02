"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, ChevronLeft, ChevronRight, Check, RefreshCw, Maximize2 } from "lucide-react";
import { useSelection } from "@/contexts/SelectionContext";
import { useReview } from "@/contexts/ReviewContext";
import FullScreenCompareModal from "@/components/FullScreenCompareModal";
import { PHOTOGRAPHER_THEME as T, PS_DISPLAY } from "@/lib/photographer-theme";
import { BrandLogoBar } from "@/components/BrandLogo";

/* ── design tokens ──────────────────────────── */
const SURFACE = T.surface;
const SURFACE2 = T.surface2;
const SURFACE3 = T.surface3;
const STEEL = T.steel;
const GREEN = T.green;
const GREEN_DIM = T.greenDim;
const ORANGE = T.orange;
const DIM = T.dim;
const MUTED = T.muted;
const TEXT = T.text;
const BORDER = T.border;
const BORDER_MD = T.borderMd;

const playfair: React.CSSProperties = { fontFamily: PS_DISPLAY };
const panelLabel: React.CSSProperties = {
  fontSize: 10, fontWeight: 600, letterSpacing: 1,
  textTransform: "uppercase", color: DIM, marginBottom: 10,
};

export default function ReviewViewerPage() {
  const params  = useParams();
  const router  = useRouter();
  const token   = (params?.token as string) ?? "";
  const photoId = params?.photoId as string;
  const { project, loading: selectionLoading }                                                 = useSelection();
  const { reviewPhotos, loadReviewPhotos, reviewPhotosLoading, setReview, getReview }          = useReview();

  useEffect(() => {
    if (!project?.id || !project?.status) return;
    loadReviewPhotos(token, project.id, project.status);
  }, [token, project?.id, project?.status, loadReviewPhotos]);

  const photos       = reviewPhotos;
  const currentIndex = useMemo(() => photos.findIndex((p) => p.id === photoId), [photos, photoId]);
  const current      = currentIndex >= 0 ? photos[currentIndex] : null;
  const prevId       = currentIndex > 0 ? photos[currentIndex - 1].id : photos[photos.length - 1]?.id;
  const nextId       = currentIndex < photos.length - 1 && currentIndex >= 0 ? photos[currentIndex + 1].id : photos[0]?.id;

  const review = current ? getReview(current.id) : null;
  const [revisionComment, setRevisionComment] = useState(review?.comment ?? "");
  const [fullOpen,   setFullOpen]   = useState(false);
  const [fullInitial, setFullInitial] = useState<"original" | "version">("original");

  useEffect(() => {
    if (current) setRevisionComment(review?.comment ?? "");
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current?.id]);

  const goPrev = useCallback(() => { if (prevId) router.push(`/c/${token}/review/${prevId}`); }, [token, prevId, router]);
  const goNext = useCallback(() => { if (nextId) router.push(`/c/${token}/review/${nextId}`); }, [token, nextId, router]);

  /* touch swipe */
  let touchStartX = 0;
  const handleTouchStart = (e: React.TouchEvent) => { touchStartX = e.touches[0].clientX; };
  const handleTouchEnd   = (e: React.TouchEvent) => {
    const diff = touchStartX - e.changedTouches[0].clientX;
    if (Math.abs(diff) > 50) { diff > 0 ? goNext() : goPrev(); }
  };

  /* keyboard nav */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowLeft")  { e.preventDefault(); goPrev(); }
      if (e.key === "ArrowRight") { e.preventDefault(); goNext(); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [goPrev, goNext]);

  const handleApprove = useCallback(() => {
    if (!current) return;
    setReview(current.id, "approved");
  }, [current, setReview]);

  const handleRevisionToggle = useCallback(() => {
    if (!current) return;
    setReview(current.id, "revision_requested", revisionComment || undefined);
  }, [current, revisionComment, setReview]);

  const handleRevisionSave = useCallback(() => {
    if (!current) return;
    setReview(current.id, "revision_requested", revisionComment || undefined);
  }, [current, revisionComment, setReview]);

  /* ── guard states ───────────────────────────── */
  if (selectionLoading || !project) {
    return (
      <div style={{ display: "flex", minHeight: "100vh", alignItems: "center", justifyContent: "center", background: "#0a0a0a" }}>
        <p style={{ fontSize: 13, color: MUTED }}>{selectionLoading ? "로딩 중…" : "존재하지 않는 초대 링크입니다."}</p>
      </div>
    );
  }

  const canShowReview = project.status === "reviewing_v1" || project.status === "reviewing_v2";
  if (!canShowReview) {
    return (
      <div style={{ display: "flex", minHeight: "100vh", alignItems: "center", justifyContent: "center", background: "#0a0a0a" }}>
        <Link href={`/c/${token}/confirmed`} style={{ fontSize: 13, color: MUTED, border: `1px solid ${BORDER_MD}`, borderRadius: 10, padding: "8px 16px", textDecoration: "none" }}>확정 페이지로</Link>
      </div>
    );
  }

  if (!current) {
    if (reviewPhotosLoading || photos.length === 0) {
      return (
        <div style={{ display: "flex", minHeight: "100vh", alignItems: "center", justifyContent: "center", background: "#0a0a0a" }}>
          <p style={{ fontSize: 13, color: MUTED }}>불러오는 중...</p>
        </div>
      );
    }
    return (
      <div style={{ display: "flex", minHeight: "100vh", alignItems: "center", justifyContent: "center", background: "#0a0a0a" }}>
        <div style={{ textAlign: "center" }}>
          <p style={{ fontSize: 13, color: MUTED, marginBottom: 16 }}>사진을 찾을 수 없습니다.</p>
          <Link href={`/c/${token}/review`} style={{ fontSize: 13, color: MUTED, border: `1px solid ${BORDER_MD}`, borderRadius: 10, padding: "8px 16px", textDecoration: "none" }}>목록으로</Link>
        </div>
      </div>
    );
  }

  const revisionRemaining = project.status === "reviewing_v2" ? 1 : 2;
  const versionLabel      = `보정본 ${project.status === "reviewing_v2" ? "v2" : "v1"}`;
  const status     = review?.status ?? "pending";
  const isApproved = status === "approved";
  const isRevision = status === "revision_requested";

  return (
    <div
      style={{ background: "#0a0a0a", height: "100vh", overflow: "hidden", display: "flex", flexDirection: "column", color: TEXT }}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
    >
      {/* ══ Topbar ══════════════════════════════ */}
      <div style={{
        height: 48, flexShrink: 0,
        background: "rgba(13,30,40,0.95)", backdropFilter: "blur(12px)",
        borderBottom: `1px solid ${BORDER}`,
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "0 16px", zIndex: 50,
      }}>
        {/* Left: logo + divider + back */}
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <BrandLogoBar size="sm" href={token ? `/c/${token}` : undefined} />
          <span style={{ width: 1, height: 16, background: BORDER, display: "inline-block" }} />
          <Link href={`/c/${token}/review`}
            style={{
              display: "flex", alignItems: "center", gap: 4,
              padding: "4px 10px", borderRadius: 6,
              border: `1px solid ${BORDER}`, background: "transparent",
              color: MUTED, fontSize: 12, textDecoration: "none",
            }}>
            <ArrowLeft style={{ width: 12, height: 12 }} />
            검토 목록
          </Link>
        </div>

        {/* Center: counter + status badge */}
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 12, color: MUTED }}>{currentIndex + 1} / {photos.length}</span>
          {isApproved ? (
            <span style={{
              display: "inline-flex", alignItems: "center", gap: 4,
              padding: "3px 9px", borderRadius: 20, fontSize: 11, fontWeight: 500,
              background: GREEN_DIM, color: GREEN, border: "1px solid rgba(46,213,115,0.3)",
            }}>
              <Check style={{ width: 10, height: 10 }} /> 확정
            </span>
          ) : isRevision ? (
            <span style={{
              display: "inline-flex", alignItems: "center", gap: 4,
              padding: "3px 9px", borderRadius: 20, fontSize: 11, fontWeight: 500,
              background: "rgba(245,166,35,0.1)", color: ORANGE, border: "1px solid rgba(245,166,35,0.3)",
            }}>
              <RefreshCw style={{ width: 10, height: 10 }} /> 재보정
            </span>
          ) : (
            <span style={{
              display: "inline-block",
              padding: "3px 9px", borderRadius: 20, fontSize: 11, fontWeight: 500,
              background: SURFACE3, color: MUTED, border: `1px solid ${BORDER}`,
            }}>
              미검토
            </span>
          )}
        </div>

        {/* Right: prev / next */}
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <button type="button" onClick={goPrev}
            style={{
              width: 32, height: 32, borderRadius: 8,
              border: `1px solid ${BORDER}`, background: "transparent", color: MUTED,
              display: "flex", alignItems: "center", justifyContent: "center",
              cursor: "pointer", transition: "all 0.15s",
            }}>
            <ChevronLeft style={{ width: 16, height: 16 }} />
          </button>
          <button type="button" onClick={goNext}
            style={{
              width: 32, height: 32, borderRadius: 8,
              border: `1px solid ${BORDER}`, background: "transparent", color: MUTED,
              display: "flex", alignItems: "center", justifyContent: "center",
              cursor: "pointer", transition: "all 0.15s",
            }}>
            <ChevronRight style={{ width: 16, height: 16 }} />
          </button>
        </div>
      </div>

      {/* ══ Main body ═══════════════════════════ */}
      <div style={{ flex: 1, display: "grid", gridTemplateColumns: "1fr 300px", overflow: "hidden" }}>

        {/* Left: compare area */}
        <div style={{
          display: "grid", gridTemplateColumns: "1fr 1fr",
          gap: 1, background: BORDER,
          overflow: "hidden", position: "relative",
        }}>

          {/* Original */}
          <div style={{ background: "#0a0a0a", display: "flex", flexDirection: "column", overflow: "hidden", position: "relative" }}>
            <span style={{
              position: "absolute", top: 10, left: 10, zIndex: 2,
              padding: "4px 10px", borderRadius: 6, fontSize: 11, fontWeight: 600,
              backdropFilter: "blur(8px)",
              background: "rgba(0,0,0,0.6)", color: "rgba(255,255,255,0.7)", border: "1px solid rgba(255,255,255,0.12)",
            }}>원본</span>
            <div
              onClick={() => { setFullInitial("original"); setFullOpen(true); }}
              style={{
                flex: 1, display: "flex", alignItems: "center", justifyContent: "center",
                cursor: "pointer", background: "linear-gradient(135deg,#0f1a22,#080f14)",
                overflow: "hidden", transition: "opacity 0.15s",
              }}>
              {current.originalUrl
                ? <img src={current.originalUrl} alt="원본" style={{ maxWidth: "100%", maxHeight: "100%", objectFit: "contain" }} />
                : <span style={{ fontSize: 13, color: DIM }}>원본 없음</span>
              }
            </div>
            <button type="button" onClick={() => { setFullInitial("original"); setFullOpen(true); }}
              style={{
                position: "absolute", bottom: 10, right: 10, zIndex: 2,
                width: 28, height: 28, borderRadius: 6,
                background: "rgba(0,0,0,0.5)", border: "1px solid rgba(255,255,255,0.12)",
                color: "rgba(255,255,255,0.5)", cursor: "pointer",
                display: "flex", alignItems: "center", justifyContent: "center",
              }}>
              <Maximize2 style={{ width: 13, height: 13 }} />
            </button>
            <span style={{
              position: "absolute", bottom: 10, left: "50%", transform: "translateX(-50%)",
              fontSize: 10, color: "rgba(255,255,255,0.3)",
              background: "rgba(0,0,0,0.4)", padding: "3px 10px", borderRadius: 20,
              whiteSpace: "nowrap", pointerEvents: "none", zIndex: 1,
            }}>클릭하면 풀스크린</span>
          </div>

          {/* Retouched */}
          <div style={{ background: "#0a0a0a", display: "flex", flexDirection: "column", overflow: "hidden", position: "relative" }}>
            <span style={{
              position: "absolute", top: 10, left: 10, zIndex: 2,
              padding: "4px 10px", borderRadius: 6, fontSize: 11, fontWeight: 600,
              backdropFilter: "blur(8px)",
              background: "rgba(79,126,255,0.2)", color: STEEL, border: "1px solid rgba(79,126,255,0.3)",
            }}>{versionLabel}</span>
            <div
              onClick={() => { setFullInitial("version"); setFullOpen(true); }}
              style={{
                flex: 1, display: "flex", alignItems: "center", justifyContent: "center",
                cursor: "pointer", background: "linear-gradient(135deg,#0f1a22,#080f14)",
                overflow: "hidden", transition: "opacity 0.15s",
              }}>
              {current.versionUrl
                ? <img src={current.versionUrl} alt={versionLabel} style={{ maxWidth: "100%", maxHeight: "100%", objectFit: "contain" }} />
                : <span style={{ fontSize: 13, color: DIM }}>보정본 없음</span>
              }
            </div>
            <button type="button" onClick={() => { setFullInitial("version"); setFullOpen(true); }}
              style={{
                position: "absolute", bottom: 10, right: 10, zIndex: 2,
                width: 28, height: 28, borderRadius: 6,
                background: "rgba(0,0,0,0.5)", border: "1px solid rgba(255,255,255,0.12)",
                color: "rgba(255,255,255,0.5)", cursor: "pointer",
                display: "flex", alignItems: "center", justifyContent: "center",
              }}>
              <Maximize2 style={{ width: 13, height: 13 }} />
            </button>
            <span style={{
              position: "absolute", bottom: 10, left: "50%", transform: "translateX(-50%)",
              fontSize: 10, color: "rgba(255,255,255,0.3)",
              background: "rgba(0,0,0,0.4)", padding: "3px 10px", borderRadius: 20,
              whiteSpace: "nowrap", pointerEvents: "none", zIndex: 1,
            }}>클릭하면 풀스크린</span>
          </div>
        </div>

        {/* Right: action panel */}
        <div style={{
          background: SURFACE, borderLeft: `1px solid ${BORDER}`,
          display: "flex", flexDirection: "column", overflowY: "auto",
        }}>

          {/* File info */}
          <div style={{ padding: 16, borderBottom: `1px solid ${BORDER}` }}>
            <div style={panelLabel}>파일 정보</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
              <div style={{ fontSize: 13, fontWeight: 500, wordBreak: "break-all", lineHeight: 1.4, color: TEXT }}>{current.originalFilename}</div>
              <div style={{ fontSize: 11, color: DIM }}>원본 선택 사진 · {currentIndex + 1}번째</div>
            </div>
          </div>

          {/* Revision quota */}
          <div style={{ padding: 16, borderBottom: `1px solid ${BORDER}` }}>
            <div style={panelLabel}>재보정 횟수</div>
            <div style={{
              display: "flex", alignItems: "center", gap: 6,
              padding: "7px 10px", background: SURFACE2,
              border: `1px solid ${BORDER}`, borderRadius: 7,
              fontSize: 11, color: MUTED,
            }}>
              <div style={{ display: "flex", gap: 3 }}>
                {Array.from({ length: 2 }).map((_, i) => {
                  const used = i < (2 - revisionRemaining);
                  return (
                    <span key={i} style={{
                      width: 8, height: 8, borderRadius: "50%", display: "inline-block",
                      background: used ? ORANGE : SURFACE3,
                      border: used ? "none" : `1px solid ${BORDER}`,
                    }} />
                  );
                })}
              </div>
              <span>재보정 {revisionRemaining}회 남음 (최대 2회)</span>
            </div>
          </div>

          {/* Review opinion */}
          <div style={{ padding: 16, flex: 1 }}>
            <div style={panelLabel}>검토 의견</div>

            {/* Action buttons */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 10 }}>
              <button type="button" onClick={handleApprove}
                style={{
                  height: 42, borderRadius: 9, fontSize: 13, fontWeight: 500,
                  display: "flex", alignItems: "center", justifyContent: "center", gap: 5,
                  cursor: "pointer", border: "1px solid", transition: "all 0.15s",
                  background: isApproved ? GREEN_DIM : "rgba(46,213,115,0.08)",
                  borderColor: isApproved ? GREEN : "rgba(46,213,115,0.25)",
                  color: GREEN,
                }}>
                <Check style={{ width: 14, height: 14 }} /> 확정
              </button>
              <button type="button" onClick={handleRevisionToggle}
                style={{
                  height: 42, borderRadius: 9, fontSize: 13, fontWeight: 500,
                  display: "flex", alignItems: "center", justifyContent: "center", gap: 5,
                  cursor: "pointer", border: "1px solid", transition: "all 0.15s",
                  background: isRevision ? "rgba(245,166,35,0.1)" : "rgba(245,166,35,0.06)",
                  borderColor: isRevision ? ORANGE : "rgba(245,166,35,0.2)",
                  color: ORANGE,
                }}>
                <RefreshCw style={{ width: 13, height: 13 }} /> 재보정
              </button>
            </div>

            <p style={{ fontSize: 10, color: DIM, textAlign: "center" }}>선택 내용은 임시 저장됩니다</p>

            {/* Revision comment (shown when revision_requested) */}
            {isRevision && (
              <div style={{ marginTop: 10 }}>
                <textarea
                  value={revisionComment}
                  onChange={(e) => setRevisionComment(e.target.value)}
                  placeholder={"어떤 부분을 수정하면 좋을지 입력해주세요\n예) 배경을 좀 더 밝게 해주세요"}
                  style={{
                    width: "100%", padding: "10px 12px", boxSizing: "border-box",
                    background: SURFACE2, border: "1px solid rgba(245,166,35,0.2)",
                    borderRadius: 8, color: TEXT, fontSize: 12, fontFamily: "inherit",
                    resize: "none", height: 80, lineHeight: 1.5, outline: "none",
                  }}
                />
                <button type="button" onClick={handleRevisionSave}
                  style={{
                    marginTop: 6, width: "100%", height: 34,
                    borderRadius: 7, background: "transparent",
                    border: "1px solid rgba(245,166,35,0.2)",
                    color: ORANGE, fontSize: 11, cursor: "pointer", transition: "all 0.15s",
                  }}>
                  임시 저장
                </button>
              </div>
            )}

            {/* Photographer memo */}
            {current.photographerMemo && (
              <div style={{
                marginTop: 12, padding: "8px 10px",
                background: SURFACE2, border: `1px solid ${BORDER}`, borderRadius: 7,
                fontSize: 11, color: MUTED, lineHeight: 1.5,
              }}>
                작가 메모: {current.photographerMemo}
              </div>
            )}
          </div>

          {/* Panel nav */}
          <div style={{
            padding: "14px 16px",
            display: "flex", alignItems: "center", justifyContent: "space-between",
            borderTop: `1px solid ${BORDER}`,
          }}>
            <button type="button" onClick={goPrev}
              style={{
                display: "flex", alignItems: "center", gap: 5,
                padding: "7px 14px", borderRadius: 8,
                border: `1px solid ${BORDER}`, background: "transparent",
                color: MUTED, fontSize: 12, cursor: "pointer", transition: "all 0.15s",
              }}>
              <ChevronLeft style={{ width: 13, height: 13 }} /> 이전
            </button>
            <Link href={`/c/${token}/review`}
              style={{ fontSize: 11, color: DIM, textDecoration: "none" }}>
              목록으로
            </Link>
            <button type="button" onClick={goNext}
              style={{
                display: "flex", alignItems: "center", gap: 5,
                padding: "7px 14px", borderRadius: 8,
                border: `1px solid ${BORDER}`, background: "transparent",
                color: MUTED, fontSize: 12, cursor: "pointer", transition: "all 0.15s",
              }}>
              다음 <ChevronRight style={{ width: 13, height: 13 }} />
            </button>
          </div>
        </div>
      </div>

      <FullScreenCompareModal
        open={fullOpen}
        initialSide={fullInitial}
        originalUrl={current.originalUrl}
        versionUrl={current.versionUrl}
        versionLabel={versionLabel}
        onClose={() => setFullOpen(false)}
      />
    </div>
  );
}
