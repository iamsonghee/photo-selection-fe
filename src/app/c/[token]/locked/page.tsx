"use client";

import { useParams, useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { format } from "date-fns";
import { ko } from "date-fns/locale";
import { Check, AlertTriangle, LayoutGrid, List } from "lucide-react";
import { useSelectionOptional } from "@/contexts/SelectionContext";
import type { ColorTag } from "@/types";
import { PHOTOGRAPHER_THEME as T, PS_DISPLAY } from "@/lib/photographer-theme";
import { BrandLogoBar } from "@/components/BrandLogo";

const CUSTOMER_CANCEL_MAX = 3;

/* ── design tokens ──────────────────────────── */
const INK = T.ink;
const SURFACE = T.surface;
const SURFACE2 = T.surface2;
const SURFACE3 = T.surface3;
const STEEL = T.steel;
const GREEN = T.green;
const GREEN_DIM = T.greenDim;
const ORANGE = T.orange;
const ORANGE_DIM = T.orangeDim;
const RED = T.red;
const RED_DIM = T.redDim;
const DIM = T.dim;
const MUTED = T.muted;
const TEXT = T.text;
const BORDER = T.border;
const BORDER_MD = T.borderMd;

const COLOR_HEX: Record<ColorTag, string> = {
  red:    "#ff4757",
  yellow: "#ffd32a",
  green:  "#2ed573",
  blue:   "#1e90ff",
  purple: "#5352ed",
};

const playfair: React.CSSProperties = { fontFamily: PS_DISPLAY };

function getTestImageUrl(photoId: string) {
  const seed = photoId.replace(/\D/g, "") || "1";
  return `https://picsum.photos/seed/${seed}/400/300`;
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
  }, [project?.status, token, router]);

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
      <div style={{ display: "flex", minHeight: "100vh", alignItems: "center", justifyContent: "center", background: INK }}>
        <p style={{ fontSize: 13, color: MUTED }}>불러오는 중...</p>
      </div>
    );
  }
  if (!project) {
    return (
      <div style={{ display: "flex", minHeight: "100vh", alignItems: "center", justifyContent: "center", background: INK }}>
        <p style={{ fontSize: 13, color: MUTED }}>존재하지 않는 초대 링크입니다.</p>
      </div>
    );
  }
  if (project.status === "selecting") {
    return (
      <div style={{ display: "flex", minHeight: "100vh", alignItems: "center", justifyContent: "center", background: INK }}>
        <p style={{ fontSize: 13, color: MUTED }}>이동 중...</p>
      </div>
    );
  }

  const M = project.photoCount;
  const confirmedDate = project.confirmedAt
    ? format(new Date(project.confirmedAt), "yyyy년 M월 d일 HH:mm", { locale: ko })
    : "—";
  const confirmedDateShort = project.confirmedAt
    ? format(new Date(project.confirmedAt), "yyyy-MM-dd HH:mm")
    : "—";

  const isEditing  = project.status === "editing" || project.status === "editing_v2";
  const isConfirmed = project.status === "confirmed";

  return (
    <div style={{ background: INK, minHeight: "100vh", display: "flex", flexDirection: "column", color: TEXT }}>

      {/* ── Header ────────────────────────────── */}
      <header style={{
        height: 48, flexShrink: 0,
        background: "rgba(13,30,40,0.95)", backdropFilter: "blur(12px)",
        borderBottom: `1px solid ${BORDER}`,
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "0 20px", position: "sticky", top: 0, zIndex: 50,
      }}>
        <BrandLogoBar size="sm" href={token ? `/c/${token}` : undefined} />
        <span style={{ fontSize: 12, color: MUTED }}>{project.name}</span>
      </header>

      {/* ── Confirm banner ────────────────────── */}
      <div style={{
        background: "rgba(46,213,115,0.06)",
        borderBottom: "1px solid rgba(46,213,115,0.15)",
        padding: "14px 20px",
        display: "flex", alignItems: "center", gap: 16, flexShrink: 0,
      }}>
        {/* Icon */}
        <div style={{
          width: 40, height: 40, flexShrink: 0,
          background: GREEN_DIM, border: "1px solid rgba(46,213,115,0.3)",
          borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center",
        }}>
          <Check style={{ width: 18, height: 18, color: GREEN }} />
        </div>

        {/* Info */}
        <div style={{ flex: 1 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 3 }}>
            <span style={{ fontSize: 15, fontWeight: 600, color: GREEN }}>{N}장 확정 완료</span>
            <span style={{
              fontSize: 10, fontWeight: 500, padding: "2px 8px", borderRadius: 10,
              background: "rgba(46,213,115,0.1)", border: "1px solid rgba(46,213,115,0.2)", color: GREEN,
            }}>읽기 전용</span>
          </div>
          <div style={{ fontSize: 12, color: MUTED, lineHeight: 1.5 }}>
            {isEditing
              ? "보정 작업이 진행 중입니다 · 완료 시 알림을 보내드립니다"
              : "작가가 보정을 진행 중입니다 · 보정 완료 시 알림을 보내드립니다"}
          </div>
        </div>

        {/* Meta */}
        <div style={{ display: "flex", alignItems: "center", gap: 12, fontSize: 11, color: DIM, flexShrink: 0, textAlign: "right" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 2, alignItems: "flex-end" }}>
            <span style={{ fontSize: 10, color: DIM }}>확정 일시</span>
            <span style={{ fontSize: 12, color: MUTED, fontWeight: 500 }}>{confirmedDateShort}</span>
          </div>
          {isConfirmed && (
            <div style={{ display: "flex", flexDirection: "column", gap: 2, alignItems: "flex-end" }}>
              <span style={{ fontSize: 10, color: DIM }}>취소 가능</span>
              <span style={{ fontSize: 12, fontWeight: 500, color: atCancelLimit ? MUTED : ORANGE }}>
                {atCancelLimit ? "불가" : `${remainingCancels}회 남음`}
              </span>
            </div>
          )}
        </div>
      </div>

      {/* ── Toolbar ───────────────────────────── */}
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "12px 20px 8px", flexShrink: 0,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 13, fontWeight: 500, color: MUTED }}>선택한 사진</span>
          <span style={{
            padding: "2px 8px", borderRadius: 20,
            background: "rgba(79,126,255,0.1)", border: "1px solid rgba(79,126,255,0.2)",
            fontSize: 11, color: STEEL, fontWeight: 500,
          }}>{N}장</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <div style={{
            display: "flex", background: SURFACE,
            border: `1px solid ${BORDER}`, borderRadius: 7, overflow: "hidden",
          }}>
            <button type="button" onClick={() => setViewMode("grid")}
              style={{
                padding: "5px 10px", border: "none", cursor: "pointer",
                background: viewMode === "grid" ? SURFACE2 : "transparent",
                color: viewMode === "grid" ? TEXT : MUTED,
                display: "flex", alignItems: "center", gap: 4, fontSize: 11,
                fontFamily: "inherit",
              }}>
              <LayoutGrid style={{ width: 12, height: 12 }} /> 갤러리
            </button>
            <button type="button" onClick={() => setViewMode("list")}
              style={{
                padding: "5px 10px", border: "none", cursor: "pointer",
                background: viewMode === "list" ? SURFACE2 : "transparent",
                color: viewMode === "list" ? TEXT : MUTED,
                display: "flex", alignItems: "center", gap: 4, fontSize: 11,
                fontFamily: "inherit",
              }}>
              <List style={{ width: 12, height: 12 }} /> 목록
            </button>
          </div>
        </div>
      </div>

      {/* ── Gallery / List ────────────────────── */}
      <div style={{ flex: 1, padding: "0 16px 100px", overflowY: "auto" }}>
        {viewMode === "grid" ? (
          /* Grid view */
          <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-6" style={{ gap: 6 }}>
            {photos.map((photo, idx) => {
              const state    = photoStates[photo.id] ?? photo.tag;
              const rating   = state?.rating ?? photo.tag?.star;
              const colorTags = state?.color ?? photo.tag?.color ?? [];
              const comment  = (photoStates[photo.id] as { comment?: string } | undefined)?.comment ?? photo.comment;
              const filename = photo.originalFilename ?? `photo_${photo.orderIndex}`;
              return (
                <div key={photo.id} style={{
                  background: SURFACE2,
                  border: "2px solid rgba(79,126,255,0.4)",
                  borderRadius: 8, overflow: "hidden", cursor: "default",
                }}>
                  {/* Image — 1:1 */}
                  <div style={{ aspectRatio: "1/1", position: "relative" }}>
                    <img
                      src={photo.url || getTestImageUrl(photo.id)}
                      alt=""
                      style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
                    />
                    {/* Check badge — top left */}
                    <div style={{
                      position: "absolute", top: 5, left: 5,
                      width: 18, height: 18,
                      background: STEEL, borderRadius: "50%",
                      display: "flex", alignItems: "center", justifyContent: "center",
                      border: "1.5px solid rgba(255,255,255,0.3)",
                    }}>
                      <Check style={{ width: 9, height: 9, color: "white", strokeWidth: 3 }} />
                    </div>
                    {/* Number — top right */}
                    <span style={{
                      position: "absolute", top: 4, right: 5,
                      fontSize: 9, color: "rgba(255,255,255,0.5)",
                      background: "rgba(0,0,0,0.35)", padding: "1px 4px", borderRadius: 3,
                    }}>{idx + 1}</span>
                    {/* Stars — bottom left */}
                    {rating != null && rating > 0 && (
                      <div style={{ position: "absolute", bottom: 4, left: 4, display: "flex", gap: 1 }}>
                        {Array.from({ length: rating }).map((_, i) => (
                          <span key={i} style={{ fontSize: 9, color: ORANGE, textShadow: "0 1px 2px rgba(0,0,0,0.8)" }}>★</span>
                        ))}
                      </div>
                    )}
                    {/* Color dots — bottom right */}
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
                  {/* Text strip — filename + comment */}
                  <div style={{ padding: "4px 6px 5px", borderTop: `1px solid ${BORDER}`, background: "rgba(0,0,0,0.25)" }}>
                    <p style={{
                      fontSize: 9, color: MUTED, margin: 0,
                      overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                    }}>{filename}</p>
                    {comment && (
                      <p className="line-clamp-2" style={{
                        fontSize: 9, color: DIM, margin: "2px 0 0", lineHeight: 1.4,
                      }}>{comment}</p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          /* List view */
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            {photos.map((photo, idx) => {
              const state    = photoStates[photo.id] ?? photo.tag;
              const rating   = state?.rating ?? photo.tag?.star;
              const colorTags = state?.color ?? photo.tag?.color ?? [];
              const comment  = (photoStates[photo.id] as { comment?: string } | undefined)?.comment ?? photo.comment;
              return (
                <div key={photo.id} style={{
                  display: "flex", alignItems: "flex-start", gap: 10,
                  padding: "8px 10px",
                  background: SURFACE, border: `1px solid ${BORDER}`, borderRadius: 8,
                }}>
                  {/* Thumb */}
                  <div style={{ width: 44, height: 44, borderRadius: 5, overflow: "hidden", flexShrink: 0, background: SURFACE2 }}>
                    <img src={photo.url || getTestImageUrl(photo.id)} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                  </div>
                  {/* Number + filename + comment */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 11, color: DIM, marginBottom: 2 }}>#{idx + 1}</div>
                    <div style={{ fontSize: 12, color: TEXT, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", marginBottom: comment ? 3 : 0 }}>
                      {photo.originalFilename ?? `photo_${photo.orderIndex}`}
                    </div>
                    {comment && (
                      <div className="line-clamp-2" style={{ fontSize: 11, color: DIM, lineHeight: 1.4 }}>
                        {comment}
                      </div>
                    )}
                  </div>
                  {/* Stars */}
                  {rating != null && rating > 0 && (
                    <div style={{ display: "flex", gap: 1, flexShrink: 0 }}>
                      {Array.from({ length: rating }).map((_, i) => (
                        <span key={i} style={{ fontSize: 11, color: ORANGE }}>★</span>
                      ))}
                    </div>
                  )}
                  {/* Color dots */}
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
                  {/* Check */}
                  <div style={{
                    width: 20, height: 20, background: STEEL, borderRadius: "50%", flexShrink: 0,
                    display: "flex", alignItems: "center", justifyContent: "center",
                  }}>
                    <Check style={{ width: 10, height: 10, color: "white", strokeWidth: 3 }} />
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
        background: T.modalScrim, borderTop: "1px solid rgba(79,126,255,0.15)",
        backdropFilter: "blur(12px)",
        padding: "10px 20px", zIndex: 100,
        display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12,
      }}>
        {/* Left */}
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          {/* Confirmed info */}
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <div style={{
              width: 28, height: 28, background: GREEN_DIM,
              border: "1px solid rgba(46,213,115,0.3)", borderRadius: "50%", flexShrink: 0,
              display: "flex", alignItems: "center", justifyContent: "center",
            }}>
              <Check style={{ width: 13, height: 13, color: GREEN }} />
            </div>
            <div>
              <div style={{ fontSize: 13, fontWeight: 500, color: GREEN }}>{N}장 확정 완료</div>
              <div style={{ fontSize: 11, color: MUTED, marginTop: 1 }}>{confirmedDate} 확정</div>
            </div>
          </div>
          {/* Divider */}
          <span style={{ width: 1, height: 28, background: BORDER, display: "inline-block", flexShrink: 0 }} />
          {/* Cancel count */}
          {isConfirmed && (
            <div style={{ fontSize: 12, color: MUTED }}>
              취소 가능 <strong style={{ color: atCancelLimit ? MUTED : ORANGE }}>
                {atCancelLimit ? "불가" : `${remainingCancels}회`}
              </strong> 남음
            </div>
          )}
          {isEditing && (
            <div style={{ fontSize: 12, color: MUTED }}>보정 진행 중</div>
          )}
        </div>

        {/* Right: cancel button */}
        {isConfirmed && (
          <button
            type="button"
            disabled={!canCancel}
            onClick={() => canCancel && setCancelModalOpen(true)}
            style={{
              padding: "8px 16px", background: "transparent",
              border: `1px solid ${canCancel ? "rgba(255,71,87,0.25)" : BORDER}`,
              borderRadius: 8,
              color: canCancel ? RED : DIM,
              fontSize: 12, fontWeight: 500, cursor: canCancel ? "pointer" : "not-allowed",
              display: "flex", alignItems: "center", gap: 5,
              transition: "all 0.15s", opacity: canCancel ? 1 : 0.5,
              fontFamily: "inherit",
            }}>
            확정 취소
          </button>
        )}
      </div>

      {/* ── Cancel modal ──────────────────────── */}
      {cancelModalOpen && (
        <div
          style={{
            position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)",
            backdropFilter: "blur(4px)", display: "flex",
            alignItems: "center", justifyContent: "center",
            zIndex: 200, padding: 16,
          }}
          onClick={(e) => { if (e.target === e.currentTarget) setCancelModalOpen(false); }}>
          <div style={{
            background: SURFACE, border: `1px solid ${BORDER_MD}`,
            borderRadius: 16, padding: 28, maxWidth: 380, width: "90%", textAlign: "center",
          }}>
            {/* Icon */}
            <div style={{
              width: 48, height: 48, background: RED_DIM,
              border: "1px solid rgba(255,71,87,0.3)", borderRadius: "50%",
              margin: "0 auto 16px",
              display: "flex", alignItems: "center", justifyContent: "center",
            }}>
              <AlertTriangle style={{ width: 20, height: 20, color: RED }} />
            </div>
            <h3 style={{ ...playfair, fontSize: 18, color: TEXT, marginBottom: 8 }}>확정을 취소하시겠습니까?</h3>
            <p style={{ fontSize: 13, color: MUTED, lineHeight: 1.6, marginBottom: 20 }}>
              취소 후 다시 사진을 선택하고 확정할 수 있습니다.
            </p>
            {/* Warning */}
            <div style={{
              padding: "10px 14px", background: ORANGE_DIM,
              border: "1px solid rgba(245,166,35,0.2)", borderRadius: 8,
              fontSize: 12, color: ORANGE, marginBottom: 20, lineHeight: 1.5, textAlign: "left",
            }}>
              취소 가능 횟수가 차감됩니다.<br />
              현재 {remainingCancels}회 남음 · 0회가 되면 취소 불가합니다.
            </div>
            {/* Buttons */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
              <button type="button" onClick={() => setCancelModalOpen(false)}
                style={{
                  height: 42, borderRadius: 9, fontSize: 13, fontWeight: 500,
                  background: "transparent", border: `1px solid ${BORDER}`, color: MUTED,
                  cursor: "pointer", transition: "all 0.15s", fontFamily: "inherit",
                }}>
                유지하기
              </button>
              <button type="button" onClick={handleConfirmCancel} disabled={cancelling}
                style={{
                  height: 42, borderRadius: 9, fontSize: 13, fontWeight: 500,
                  background: RED_DIM, border: "1px solid rgba(255,71,87,0.3)", color: RED,
                  cursor: cancelling ? "not-allowed" : "pointer",
                  opacity: cancelling ? 0.6 : 1,
                  transition: "all 0.15s", fontFamily: "inherit",
                }}>
                {cancelling ? "처리 중..." : "취소하기"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
