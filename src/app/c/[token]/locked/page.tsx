"use client";

import { useParams, useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { format } from "date-fns";
import { ko } from "date-fns/locale";
import { Check, AlertTriangle, LayoutGrid, List } from "lucide-react";
import { useSelectionOptional } from "@/contexts/SelectionContext";
import type { ColorTag } from "@/types";
import { BrandLogoBar } from "@/components/BrandLogo";

const CUSTOMER_CANCEL_MAX = 3;

/* ── design tokens (review 페이지와 동일 가이드) ── */
const BG_BASE    = "#030303";
const BG_PANEL   = "#0a0a0a";
const BG_INPUT   = "#111111";
const BORDER     = "#222222";
const BORDER_HI  = "#333333";
const TEXT       = "#ffffff";
const MUTED      = "#888888";
const DIM        = "#555555";
const ACCENT     = "#ff4d00";
const ACCENT_DIM = "rgba(255,77,0,0.1)";
const GREEN      = "#00ff66";
const GREEN_DIM  = "rgba(0,255,102,0.1)";
const ORANGE     = "#ffaa00";
const ORANGE_DIM = "rgba(255,170,0,0.1)";
const RED        = "#ff4757";
const RED_DIM    = "rgba(255,71,87,0.1)";
const MONO       = "'JetBrains Mono', 'Space Mono', monospace";
const DISPLAY    = "'Space Grotesk', 'Pretendard Variable', sans-serif";
const BODY_FONT  = "'Pretendard Variable', -apple-system, sans-serif";

const GRID_BG: React.CSSProperties = {
  backgroundImage: `linear-gradient(#161616 1px, transparent 1px), linear-gradient(90deg, #161616 1px, transparent 1px)`,
  backgroundSize: "40px 40px",
};

const COLOR_HEX: Record<ColorTag, string> = {
  red:    "#ff4757",
  yellow: "#ffd32a",
  green:  "#2ed573",
  blue:   "#1e90ff",
  purple: "#5352ed",
};

function getTestImageUrl(photoId: string) {
  const seed = photoId.replace(/\D/g, "") || "1";
  return `https://picsum.photos/seed/${seed}/400/300`;
}

function modalBracketStyle(corner: "tl" | "tr" | "bl" | "br"): React.CSSProperties {
  const base: React.CSSProperties = {
    position: "absolute",
    width: 14,
    height: 14,
    pointerEvents: "none",
  };
  if (corner === "tl") return { ...base, top: -1, left: -1, borderTop: `2px solid ${ACCENT}`, borderLeft: `2px solid ${ACCENT}` };
  if (corner === "tr") return { ...base, top: -1, right: -1, borderTop: `2px solid ${ACCENT}`, borderRight: `2px solid ${ACCENT}` };
  if (corner === "bl") return { ...base, bottom: -1, left: -1, borderBottom: `2px solid ${ACCENT}`, borderLeft: `2px solid ${ACCENT}` };
  return { ...base, bottom: -1, right: -1, borderBottom: `2px solid ${ACCENT}`, borderRight: `2px solid ${ACCENT}` };
}

export default function LockedPage() {
  const params = useParams();
  const router = useRouter();
  const token  = (params?.token as string) ?? "";
  const ctx    = useSelectionOptional();
  const project = ctx?.project ?? null;
  const loading = ctx?.loading ?? true;

  const [mounted,         setMounted]         = useState(false);
  const [cancelModalOpen, setCancelModalOpen] = useState(false);
  const [cancelling,      setCancelling]      = useState(false);
  const [viewMode,        setViewMode]        = useState<"grid" | "list">("grid");

  useEffect(() => { setMounted(true); }, []);

  useEffect(() => {
    if (!project || !token) return;
    if (project.status === "selecting") router.replace(`/c/${token}/gallery`);
  }, [project, token, router]);

  const { photos, N, photoStates } = useMemo(() => {
    if (!project || !ctx?.photos?.length || !ctx?.selectedIds?.size) {
      return { photos: [] as import("@/types").Photo[], N: 0, photoStates: ctx?.photoStates ?? {} };
    }
    const idSet   = ctx.selectedIds;
    const filtered = ctx.photos.filter((p) => idSet.has(p.id));
    filtered.sort((a, b) => a.orderIndex - b.orderIndex);
    return { photos: filtered, N: filtered.length, photoStates: ctx.photoStates ?? {} };
  }, [project, ctx?.photos, ctx?.selectedIds, ctx?.photoStates]);

  const cancelCount      = project?.customerCancelCount ?? 0;
  const remainingCancels = Math.max(0, CUSTOMER_CANCEL_MAX - cancelCount);
  const atCancelLimit    = cancelCount >= CUSTOMER_CANCEL_MAX;
  const canCancel        = project?.status === "confirmed" && !atCancelLimit;

  const handleConfirmCancel = async () => {
    if (!project?.id || !token) return;
    setCancelling(true);
    try {
      const res = await fetch("/api/c/cancel-confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, project_id: project.id }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        console.error("[확정 취소]", (data as { error?: string }).error ?? res.statusText);
        setCancelling(false); return;
      }
      setCancelModalOpen(false);
      if (typeof window !== "undefined") window.location.replace(`/c/${token}/gallery`);
    } catch (e) {
      console.error(e);
    } finally {
      setCancelling(false);
    }
  };

  /* ── loading / guard ────────────────────────── */
  if (!mounted || loading) {
    return (
      <div style={{ display: "flex", minHeight: "100dvh", alignItems: "center", justifyContent: "center", background: BG_BASE, fontFamily: MONO, fontSize: 12, color: MUTED, letterSpacing: "0.05em" }}>
        불러오는 중...
      </div>
    );
  }
  if (!project) {
    return (
      <div style={{ display: "flex", minHeight: "100dvh", alignItems: "center", justifyContent: "center", background: BG_BASE, fontFamily: MONO, fontSize: 12, color: MUTED, letterSpacing: "0.05em" }}>
        존재하지 않는 초대 링크입니다.
      </div>
    );
  }
  if (project.status === "selecting") {
    return (
      <div style={{ display: "flex", minHeight: "100dvh", alignItems: "center", justifyContent: "center", background: BG_BASE, fontFamily: MONO, fontSize: 12, color: MUTED, letterSpacing: "0.05em" }}>
        이동 중...
      </div>
    );
  }

  const confirmedDate = project.confirmedAt
    ? format(new Date(project.confirmedAt), "yyyy년 M월 d일 HH:mm", { locale: ko })
    : "—";
  const confirmedDateShort = project.confirmedAt
    ? format(new Date(project.confirmedAt), "yyyy.MM.dd HH:mm")
    : "—";

  const isEditing  = project.status === "editing" || project.status === "editing_v2";
  const isConfirmed = project.status === "confirmed";

  return (
    <div style={{ background: BG_BASE, minHeight: "100dvh", display: "flex", flexDirection: "column", color: TEXT, fontFamily: BODY_FONT, ...GRID_BG }}>

      {/* ── Header ────────────────────────────── */}
      <header style={{
        minHeight: 48, flexShrink: 0,
        background: "rgba(10,10,10,0.92)", backdropFilter: "blur(12px)",
        borderBottom: `1px solid ${BORDER}`,
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "0 20px",
        paddingTop: "env(safe-area-inset-top, 0px)",
        position: "sticky", top: 0, zIndex: 50,
      }}>
        <BrandLogoBar size="sm" href={token ? `/c/${token}` : undefined} />
        <span style={{ fontFamily: MONO, fontSize: 11, color: MUTED, letterSpacing: "0.05em", textTransform: "uppercase", maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {project.name}
        </span>
      </header>

      {/* ── Confirm banner ────────────────────── */}
      <div style={{
        background: GREEN_DIM,
        borderBottom: `1px solid rgba(0,255,102,0.18)`,
        padding: "14px 20px",
        display: "flex", alignItems: "center", gap: 16, flexShrink: 0,
      }}>
        <div style={{
          width: 40, height: 40, flexShrink: 0,
          background: GREEN_DIM, border: `1px solid rgba(0,255,102,0.4)`,
          borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center",
        }}>
          <Check style={{ width: 18, height: 18, color: GREEN }} />
        </div>

        <div style={{ flex: 1 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 3, flexWrap: "wrap" }}>
            <span style={{ fontFamily: DISPLAY, fontSize: 16, fontWeight: 700, color: GREEN, letterSpacing: "-0.02em" }}>
              {N}장 확정 완료
            </span>
            <span style={{
              fontFamily: MONO,
              fontSize: 10, fontWeight: 700, padding: "2px 8px",
              background: ACCENT_DIM, border: `1px solid rgba(255,77,0,0.3)`,
              color: ACCENT, letterSpacing: "0.1em", textTransform: "uppercase",
            }}>READ ONLY</span>
          </div>
          <div style={{ fontSize: 12, color: MUTED, lineHeight: 1.5 }}>
            {isEditing
              ? "보정 작업이 진행 중입니다 · 완료 시 알림을 보내드립니다"
              : "작가가 보정을 진행 중입니다 · 보정 완료 시 알림을 보내드립니다"}
          </div>
        </div>

        <div className="hidden sm:flex" style={{ alignItems: "center", gap: 16, flexShrink: 0 }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 2, alignItems: "flex-end" }}>
            <span style={{ fontFamily: MONO, fontSize: 9, color: DIM, letterSpacing: "0.1em", textTransform: "uppercase" }}>CONFIRMED</span>
            <span style={{ fontFamily: MONO, fontSize: 12, color: MUTED, fontWeight: 500 }}>{confirmedDateShort}</span>
          </div>
          {isConfirmed && (
            <div style={{ display: "flex", flexDirection: "column", gap: 2, alignItems: "flex-end" }}>
              <span style={{ fontFamily: MONO, fontSize: 9, color: DIM, letterSpacing: "0.1em", textTransform: "uppercase" }}>CANCEL LEFT</span>
              <span style={{ fontFamily: MONO, fontSize: 12, fontWeight: 700, color: atCancelLimit ? MUTED : ACCENT }}>
                {atCancelLimit ? "불가" : `${remainingCancels}회 남음`}
              </span>
            </div>
          )}
        </div>
      </div>

      {/* ── Toolbar ───────────────────────────── */}
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "14px 20px 10px", flexShrink: 0,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontFamily: MONO, fontSize: 10, fontWeight: 700, color: MUTED, letterSpacing: "0.1em", textTransform: "uppercase" }}>
            SELECTED
          </span>
          <span style={{
            padding: "2px 10px",
            background: ACCENT_DIM, border: `1px solid rgba(255,77,0,0.3)`,
            fontFamily: MONO, fontSize: 11, color: ACCENT, fontWeight: 700, letterSpacing: "0.05em",
          }}>{N}장</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <div style={{
            display: "flex", background: BG_PANEL,
            border: `1px solid ${BORDER}`, overflow: "hidden",
          }}>
            <button type="button" onClick={() => setViewMode("grid")}
              style={{
                padding: "6px 12px", border: "none", cursor: "pointer",
                background: viewMode === "grid" ? ACCENT_DIM : "transparent",
                color: viewMode === "grid" ? ACCENT : MUTED,
                display: "flex", alignItems: "center", gap: 6,
                fontFamily: MONO, fontSize: 10, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase",
                transition: "background 0.15s, color 0.15s",
              }}>
              <LayoutGrid style={{ width: 12, height: 12 }} /> Grid
            </button>
            <button type="button" onClick={() => setViewMode("list")}
              style={{
                padding: "6px 12px", border: "none", cursor: "pointer",
                background: viewMode === "list" ? ACCENT_DIM : "transparent",
                color: viewMode === "list" ? ACCENT : MUTED,
                display: "flex", alignItems: "center", gap: 6,
                fontFamily: MONO, fontSize: 10, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase",
                transition: "background 0.15s, color 0.15s",
              }}>
              <List style={{ width: 12, height: 12 }} /> List
            </button>
          </div>
        </div>
      </div>

      {/* ── Gallery / List ────────────────────── */}
      <div style={{ flex: 1, padding: "0 16px 100px", overflowY: "auto" }}>
        {viewMode === "grid" ? (
          <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-6" style={{ gap: 6 }}>
            {photos.map((photo, idx) => {
              const state    = photoStates[photo.id] ?? photo.tag;
              const rating   = state?.rating ?? photo.tag?.star;
              const colorTags = state?.color ?? photo.tag?.color ?? [];
              const comment  = (photoStates[photo.id] as { comment?: string } | undefined)?.comment ?? photo.comment;
              const filename = photo.originalFilename ?? `photo_${photo.orderIndex}`;
              return (
                <div key={photo.id} style={{
                  background: BG_PANEL,
                  border: `1px solid ${BORDER}`,
                  overflow: "hidden", cursor: "default",
                }}>
                  <div style={{ aspectRatio: "1/1", position: "relative" }}>
                    <img
                      src={photo.url || getTestImageUrl(photo.id)}
                      alt=""
                      style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
                    />
                    <div style={{
                      position: "absolute", top: 5, left: 5,
                      width: 18, height: 18,
                      background: ACCENT, borderRadius: "50%",
                      display: "flex", alignItems: "center", justifyContent: "center",
                      border: "1.5px solid rgba(0,0,0,0.4)",
                    }}>
                      <Check style={{ width: 9, height: 9, color: "#000", strokeWidth: 3.5 }} />
                    </div>
                    <span style={{
                      position: "absolute", top: 4, right: 5,
                      fontFamily: MONO,
                      fontSize: 9, color: "rgba(255,255,255,0.7)", fontWeight: 700,
                      background: "rgba(0,0,0,0.55)", padding: "1px 5px",
                      letterSpacing: "0.05em",
                    }}>{idx + 1}</span>
                    {rating != null && rating > 0 && (
                      <div style={{ position: "absolute", bottom: 4, left: 4, display: "flex", gap: 1 }}>
                        {Array.from({ length: rating }).map((_, i) => (
                          <span key={i} style={{ fontSize: 10, color: ORANGE, textShadow: "0 1px 2px rgba(0,0,0,0.85)" }}>★</span>
                        ))}
                      </div>
                    )}
                    {colorTags.length > 0 && (
                      <div style={{ position: "absolute", bottom: 4, right: 4, display: "flex", gap: 1 }}>
                        {colorTags.map((tag) => (
                          <span key={tag} style={{
                            width: 9, height: 9, borderRadius: "50%",
                            background: COLOR_HEX[tag], border: "1.5px solid rgba(255,255,255,0.5)",
                            display: "inline-block",
                          }} />
                        ))}
                      </div>
                    )}
                  </div>
                  <div style={{ padding: "5px 7px 6px", borderTop: `1px solid ${BORDER}`, background: BG_INPUT }}>
                    <p style={{
                      fontFamily: MONO,
                      fontSize: 9, color: MUTED, margin: 0, letterSpacing: "0.02em",
                      overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                    }}>{filename}</p>
                    {comment && (
                      <p className="line-clamp-2" style={{
                        fontSize: 10, color: DIM, margin: "2px 0 0", lineHeight: 1.4,
                      }}>{comment}</p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            {photos.map((photo, idx) => {
              const state    = photoStates[photo.id] ?? photo.tag;
              const rating   = state?.rating ?? photo.tag?.star;
              const colorTags = state?.color ?? photo.tag?.color ?? [];
              const comment  = (photoStates[photo.id] as { comment?: string } | undefined)?.comment ?? photo.comment;
              return (
                <div key={photo.id} style={{
                  display: "flex", alignItems: "flex-start", gap: 10,
                  padding: "10px 12px",
                  background: BG_PANEL, border: `1px solid ${BORDER}`,
                }}>
                  <div style={{ width: 48, height: 48, overflow: "hidden", flexShrink: 0, background: BG_INPUT, border: `1px solid ${BORDER}` }}>
                    <img src={photo.url || getTestImageUrl(photo.id)} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontFamily: MONO, fontSize: 10, color: DIM, marginBottom: 2, letterSpacing: "0.05em" }}>#{String(idx + 1).padStart(3, "0")}</div>
                    <div style={{ fontFamily: MONO, fontSize: 12, color: TEXT, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", marginBottom: comment ? 3 : 0 }}>
                      {photo.originalFilename ?? `photo_${photo.orderIndex}`}
                    </div>
                    {comment && (
                      <div className="line-clamp-2" style={{ fontSize: 11, color: DIM, lineHeight: 1.4 }}>
                        {comment}
                      </div>
                    )}
                  </div>
                  {rating != null && rating > 0 && (
                    <div style={{ display: "flex", gap: 1, flexShrink: 0 }}>
                      {Array.from({ length: rating }).map((_, i) => (
                        <span key={i} style={{ fontSize: 11, color: ORANGE }}>★</span>
                      ))}
                    </div>
                  )}
                  {colorTags.length > 0 && (
                    <div style={{ display: "flex", gap: 1, flexShrink: 0, alignItems: "center" }}>
                      {colorTags.map((tag) => (
                        <span key={tag} style={{
                          width: 10, height: 10, borderRadius: "50%", flexShrink: 0,
                          background: COLOR_HEX[tag], border: "1.5px solid rgba(255,255,255,0.4)", display: "inline-block",
                        }} />
                      ))}
                    </div>
                  )}
                  <div style={{
                    width: 22, height: 22, background: ACCENT, borderRadius: "50%", flexShrink: 0,
                    display: "flex", alignItems: "center", justifyContent: "center",
                  }}>
                    <Check style={{ width: 11, height: 11, color: "#000", strokeWidth: 3.5 }} />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ── Fixed bottom bar ──────────────────── */}
      <div style={{
        position: "fixed", bottom: 0, left: 0, right: 0,
        background: "rgba(10,10,10,0.94)",
        borderTop: `1px solid rgba(255,77,0,0.2)`,
        backdropFilter: "blur(12px)",
        padding: "10px 20px",
        paddingBottom: "calc(10px + env(safe-area-inset-bottom, 0px))",
        zIndex: 100,
        display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <div style={{
              width: 28, height: 28, background: GREEN_DIM,
              border: `1px solid rgba(0,255,102,0.4)`, borderRadius: "50%", flexShrink: 0,
              display: "flex", alignItems: "center", justifyContent: "center",
            }}>
              <Check style={{ width: 13, height: 13, color: GREEN }} />
            </div>
            <div>
              <div style={{ fontFamily: DISPLAY, fontSize: 13, fontWeight: 700, color: GREEN, letterSpacing: "-0.02em" }}>
                {N}장 확정 완료
              </div>
              <div style={{ fontFamily: MONO, fontSize: 10, color: MUTED, marginTop: 1, letterSpacing: "0.05em" }}>{confirmedDate}</div>
            </div>
          </div>
          <span style={{ width: 1, height: 28, background: BORDER, display: "inline-block", flexShrink: 0 }} />
          {isConfirmed && (
            <div style={{ fontFamily: MONO, fontSize: 11, color: MUTED, letterSpacing: "0.05em" }}>
              취소 가능 <strong style={{ color: atCancelLimit ? MUTED : ACCENT, fontWeight: 700 }}>
                {atCancelLimit ? "불가" : `${remainingCancels}회`}
              </strong> 남음
            </div>
          )}
          {isEditing && (
            <div style={{ fontFamily: MONO, fontSize: 11, color: MUTED, letterSpacing: "0.05em", textTransform: "uppercase" }}>
              EDITING IN PROGRESS
            </div>
          )}
        </div>

        {isConfirmed && (
          <button
            type="button"
            disabled={!canCancel}
            onClick={() => canCancel && setCancelModalOpen(true)}
            className="locked-cancel-btn"
            style={{
              padding: "8px 16px", background: "transparent",
              border: `1px solid ${canCancel ? "rgba(255,71,87,0.4)" : BORDER}`,
              color: canCancel ? RED : DIM,
              fontFamily: MONO,
              fontSize: 11, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase",
              cursor: canCancel ? "pointer" : "not-allowed",
              display: "flex", alignItems: "center", gap: 5,
              transition: "all 0.15s", opacity: canCancel ? 1 : 0.5,
            }}>
            확정 취소
          </button>
        )}
      </div>

      {/* ── Cancel modal ──────────────────────── */}
      {cancelModalOpen && (
        <div
          style={{
            position: "fixed", inset: 0, background: "rgba(0,0,0,0.82)",
            backdropFilter: "blur(6px)", display: "flex",
            alignItems: "center", justifyContent: "center",
            zIndex: 200, padding: 16,
          }}
          onClick={(e) => { if (e.target === e.currentTarget) setCancelModalOpen(false); }}>
          <div style={{
            background: BG_PANEL, border: `1px solid ${ACCENT}`,
            padding: 32, maxWidth: 400, width: "100%", textAlign: "center",
            position: "relative",
          }}>
            <span style={modalBracketStyle("tl")} />
            <span style={modalBracketStyle("tr")} />
            <span style={modalBracketStyle("bl")} />
            <span style={modalBracketStyle("br")} />

            <div style={{
              width: 48, height: 48, background: RED_DIM,
              border: `1px solid rgba(255,71,87,0.4)`, borderRadius: "50%",
              margin: "0 auto 16px",
              display: "flex", alignItems: "center", justifyContent: "center",
            }}>
              <AlertTriangle style={{ width: 20, height: 20, color: RED }} />
            </div>
            <h3 style={{ fontFamily: DISPLAY, fontWeight: 900, fontSize: 22, fontStyle: "italic", textTransform: "uppercase", color: TEXT, marginBottom: 8, letterSpacing: "-0.02em" }}>
              Cancel Confirm
            </h3>
            <p style={{ fontSize: 13, color: MUTED, lineHeight: 1.7, marginBottom: 20 }}>
              확정을 취소하고 다시 사진을 선택할 수 있습니다.
            </p>
            <div style={{
              padding: "12px 14px", background: ORANGE_DIM,
              border: `1px solid rgba(255,170,0,0.3)`,
              fontFamily: MONO,
              fontSize: 11, color: ORANGE, marginBottom: 24, lineHeight: 1.6, textAlign: "left", letterSpacing: "0.02em",
            }}>
              취소 가능 횟수가 차감됩니다.<br />
              현재 <strong>{remainingCancels}회</strong> 남음 · 0회가 되면 취소 불가합니다.
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              <button type="button" onClick={() => setCancelModalOpen(false)}
                className="locked-modal-secondary"
                style={{
                  height: 46,
                  fontFamily: MONO, fontSize: 12, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase",
                  background: "transparent", border: `1px solid ${BORDER_HI}`, color: MUTED,
                  cursor: "pointer", transition: "all 0.15s",
                }}>
                유지하기
              </button>
              <button type="button" onClick={handleConfirmCancel} disabled={cancelling}
                style={{
                  height: 46,
                  fontFamily: MONO, fontSize: 12, fontWeight: 900, letterSpacing: "0.08em", textTransform: "uppercase",
                  background: ACCENT, border: "none", color: "#000",
                  cursor: cancelling ? "not-allowed" : "pointer",
                  opacity: cancelling ? 0.6 : 1,
                  transition: "all 0.15s",
                }}>
                {cancelling ? "처리 중..." : "취소하기"}
              </button>
            </div>
          </div>
        </div>
      )}

      <style jsx global>{`
        .locked-cancel-btn:hover:not(:disabled) {
          border-color: ${RED} !important;
          background: ${RED_DIM} !important;
        }
        .locked-modal-secondary:hover {
          background: ${TEXT} !important;
          color: #000 !important;
        }
      `}</style>
    </div>
  );
}
