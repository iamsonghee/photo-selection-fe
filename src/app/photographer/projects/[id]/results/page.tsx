"use client";

import { useEffect, useMemo, useState, ReactNode } from "react";
import { useParams, useRouter } from "next/navigation";
import { format } from "date-fns";
import { ko } from "date-fns/locale";
import {
  ArrowLeft,
  CheckCircle2,
  LayoutGrid,
  List,
  MessageSquare,
  Clipboard,
  Download,
  ChevronRight,
  ChevronLeft,
  X,
  Image,
  AlertCircle,
  AlertTriangle,
} from "lucide-react";
import { getProjectById, getPhotosWithSelections } from "@/lib/db";
import type { Project, Photo, ColorTag } from "@/types";
import { PHOTOGRAPHER_THEME as C, photographerDock } from "@/lib/photographer-theme";
import { viewerImageUrl } from "@/lib/viewer-image-url";

// ---------- utils (preserved) ----------
function sanitizeFilenamePart(s: string) {
  return s.replace(/[\\/:*?"<>|]/g, "_").trim();
}

function csvEscape(value: string) {
  const v = value ?? "";
  if (/[",\n]/.test(v)) return `"${v.replace(/"/g, '""')}"`;
  return v;
}

function downloadTextFile(filename: string, text: string, mime: string) {
  const blob = new Blob([text], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function getDisplayFilename(p: Photo): string {
  return (p.originalFilename ?? "").trim() || String(p.orderIndex);
}

type ViewMode = "gallery" | "list";

// ---------- main page ----------
export default function ResultsPage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;

  const [project, setProject] = useState<Project | null>(null);
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [photoStates, setPhotoStates] = useState<
    Record<string, { rating?: number; color?: ColorTag; comment?: string }>
  >({});
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showEditStartModal, setShowEditStartModal] = useState(false);
  const [editStartSubmitting, setEditStartSubmitting] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>("gallery");
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);

  useEffect(() => {
    getProjectById(id)
      .then((p) => {
        if (!p) return;
        setProject(p);
        return getPhotosWithSelections(p.id);
      })
      .then((result) => {
        if (!result) return;
        const selected = result.photos.filter((p) => result.selectedIds.has(p.id));
        selected.sort((a, b) =>
          getDisplayFilename(a).localeCompare(getDisplayFilename(b), undefined, { sensitivity: "base" })
        );
        setPhotos(selected);
        setPhotoStates(result.photoStates ?? {});
      })
      .catch((e) => {
        console.error(e);
        setError(e instanceof Error ? e.message : "로드 실패");
      })
      .finally(() => setLoading(false));
  }, [id]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 2500);
    return () => clearTimeout(t);
  }, [toast]);

  const confirmedText = useMemo(() => {
    if (!project?.confirmedAt) return null;
    return format(new Date(project.confirmedAt), "yyyy-MM-dd HH:mm", { locale: ko });
  }, [project?.confirmedAt]);

  const exportBaseName = useMemo(() => {
    if (!project) return "selections";
    const p = sanitizeFilenamePart(project.name || "프로젝트");
    const c = sanitizeFilenamePart(project.customerName || "고객");
    return `${p}_${c}_selections`;
  }, [project]);

  const fileNames = useMemo(() => photos.map(getDisplayFilename), [photos]);

  const commentCount = useMemo(
    () => photos.filter((p) => (photoStates[p.id]?.comment ?? "").trim()).length,
    [photos, photoStates]
  );

  const handleCopyClipboard = async () => {
    try {
      await navigator.clipboard.writeText(fileNames.join("\n"));
      setToast("클립보드에 복사했습니다");
    } catch {
      setToast("복사 실패");
    }
  };

  const handleDownloadCsv = () => {
    const header = ["파일명", "코멘트"].join(",");
    const rows = photos.map((p) => {
      const filename = getDisplayFilename(p);
      const comment = (photoStates[p.id]?.comment ?? "").trim();
      return [csvEscape(filename), csvEscape(comment)].join(",");
    });
    downloadTextFile(`${exportBaseName}.csv`, [header, ...rows].join("\n"), "text/csv;charset=utf-8");
  };

  const handleDownloadTxt = () => {
    downloadTextFile(`${exportBaseName}.txt`, fileNames.join("\n"), "text/plain;charset=utf-8");
  };

  const handleEditStartConfirm = async () => {
    setEditStartSubmitting(true);
    setError(null);
    try {
      const res = await fetch(`/api/photographer/projects/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "editing" }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error((data as { error?: string }).error ?? "상태 변경 실패");
      setProject((prev) => (prev ? { ...prev, status: "editing" } : null));
      setShowEditStartModal(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "상태 변경 실패");
    } finally {
      setEditStartSubmitting(false);
    }
  };

  const isConfirmedOrBeyond =
    project &&
    ["confirmed", "editing", "reviewing_v1", "editing_v2", "reviewing_v2", "delivered"].includes(
      project.status
    );
  const isSelecting = project?.status === "selecting";
  const showActionBar = project && ["confirmed", "editing"].includes(project.status);

  if (loading) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", padding: "48px 0" }}>
        <span style={{ color: C.muted }}>로딩 중...</span>
      </div>
    );
  }
  if (!project) return null;

  return (
    <div style={{ display: "flex", flexDirection: "column", paddingBottom: showActionBar ? 70 : 0 }}>

      {/* ── Topbar ── */}
      <div style={{
        height: 52, ...photographerDock.bottomEdge,
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "0 24px",
        background: "rgba(13,30,40,0.85)", backdropFilter: "blur(12px)",
        position: "sticky", top: 0, zIndex: 50,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <button
            onClick={() => router.push(`/photographer/projects/${id}`)}
            style={{
              display: "flex", alignItems: "center", gap: 5,
              padding: "5px 10px", borderRadius: 7,
              border: `1px solid ${C.border}`, background: "transparent",
              color: C.muted, fontSize: 12, cursor: "pointer", fontFamily: "inherit",
            }}
          >
            <ArrowLeft size={13} />
            프로젝트 상세로
          </button>
          <span style={{ fontSize: 14, fontWeight: 500, color: C.text }}>셀렉 결과</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <ExportBtn icon={<Clipboard size={13} />} label="클립보드 복사" onClick={handleCopyClipboard} />
          <ExportBtn icon={<Download size={13} />} label="CSV" onClick={handleDownloadCsv} />
          <ExportBtn icon={<Download size={13} />} label="TXT" onClick={handleDownloadTxt} />
        </div>
      </div>

      {/* ── Confirmed banner ── */}
      {isConfirmedOrBeyond && (
        <div style={{
          margin: "16px 24px 0",
          background: "rgba(46,213,115,0.06)",
          border: "1px solid rgba(46,213,115,0.2)",
          borderRadius: 12, padding: "14px 20px",
          display: "flex", alignItems: "center", gap: 14,
        }}>
          <div style={{
            width: 36, height: 36,
            background: C.greenDim, border: "1px solid rgba(46,213,115,0.3)",
            borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center",
            flexShrink: 0,
          }}>
            <CheckCircle2 size={18} color={C.green} />
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 14, fontWeight: 600, color: C.green, marginBottom: 3 }}>
              고객이 최종 확정했습니다
            </div>
            <div style={{ fontSize: 12, color: C.muted }}>
              확정일시: {confirmedText ?? "—"} · 총 {photos.length}장 선택됨
            </div>
          </div>
          {project.status === "confirmed" && (
            <button
              onClick={() => setShowEditStartModal(true)}
              style={{
                display: "flex", alignItems: "center", gap: 5,
                padding: "8px 16px", background: C.steel,
                border: "none", borderRadius: 8, color: "white",
                fontSize: 12, fontWeight: 500, cursor: "pointer",
                fontFamily: "inherit", whiteSpace: "nowrap", flexShrink: 0,
              }}
            >
              보정 시작하기
              <ChevronRight size={13} />
            </button>
          )}
          {project.status === "editing" && (
            <button
              onClick={() => router.push(`/photographer/projects/${id}/upload-versions`)}
              style={{
                display: "flex", alignItems: "center", gap: 5,
                padding: "8px 16px",
                background: "rgba(79,126,255,0.15)",
                border: "1px solid rgba(79,126,255,0.3)",
                borderRadius: 8, color: C.steel,
                fontSize: 12, fontWeight: 500, cursor: "pointer",
                fontFamily: "inherit", whiteSpace: "nowrap", flexShrink: 0,
              }}
            >
              보정본 업로드
              <ChevronRight size={13} />
            </button>
          )}
        </div>
      )}

      {/* ── Selecting banner ── */}
      {isSelecting && (
        <div style={{
          margin: "16px 24px 0",
          background: "rgba(79,126,255,0.06)",
          border: "1px solid rgba(79,126,255,0.2)",
          borderRadius: 12, padding: "14px 20px",
          display: "flex", alignItems: "center", gap: 14,
        }}>
          <div style={{
            width: 36, height: 36,
            background: "rgba(79,126,255,0.1)", border: "1px solid rgba(79,126,255,0.3)",
            borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center",
            flexShrink: 0,
          }}>
            <MessageSquare size={18} color={C.steel} />
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 14, fontWeight: 600, color: C.steel, marginBottom: 3 }}>
              고객이 셀렉 진행 중입니다
            </div>
            <div style={{ fontSize: 12, color: C.muted }}>
              현재까지 {photos.length}장 선택됨
            </div>
          </div>
        </div>
      )}

      {/* ── Toolbar ── */}
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "16px 24px 12px",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ fontSize: 15, fontWeight: 600, color: C.text }}>선택된 사진</span>
          <span style={{
            padding: "3px 9px", borderRadius: 20,
            background: "rgba(79,126,255,0.12)", border: "1px solid rgba(79,126,255,0.2)",
            fontSize: 12, color: C.steel, fontWeight: 500,
          }}>
            {photos.length}장
          </span>
          {commentCount > 0 && (
            <span style={{
              fontSize: 11, color: C.orange,
              display: "flex", alignItems: "center", gap: 4,
            }}>
              <MessageSquare size={11} />
              코멘트 {commentCount}건
            </span>
          )}
        </div>
        <div style={{
          display: "flex",
          background: C.surface, border: `1px solid ${C.border}`,
          borderRadius: 8, overflow: "hidden",
        }}>
          <ViewBtn
            icon={<LayoutGrid size={13} />}
            label="갤러리"
            active={viewMode === "gallery"}
            onClick={() => setViewMode("gallery")}
          />
          <ViewBtn
            icon={<List size={13} />}
            label="목록"
            active={viewMode === "list"}
            onClick={() => setViewMode("list")}
          />
        </div>
      </div>

      {error && (
        <div style={{
          margin: "0 24px 12px", padding: "10px 14px",
          background: "rgba(255,71,87,0.1)", border: "1px solid rgba(255,71,87,0.2)",
          borderRadius: 8, fontSize: 13, color: C.red,
        }}>
          {error}
        </div>
      )}

      {/* ── Content ── */}
      <div style={{ padding: "0 24px 40px" }}>
        {photos.length === 0 && (
          <div style={{ padding: "48px 0", textAlign: "center", fontSize: 14, color: C.dim }}>
            선택된 사진이 없습니다.
          </div>
        )}

        {/* Gallery view */}
        {viewMode === "gallery" && photos.length > 0 && (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(6, 1fr)", gap: 10 }}>
            {photos.map((p, i) => (
              <GalleryItem
                key={p.id}
                num={i + 1}
                url={p.url}
                filename={getDisplayFilename(p)}
                comment={(photoStates[p.id]?.comment ?? "").trim()}
                onOpen={() => setLightboxIndex(i)}
              />
            ))}
          </div>
        )}

        {/* List view */}
        {viewMode === "list" && photos.length > 0 && (
          <div>
            <div style={{
              display: "grid", gridTemplateColumns: "48px 60px 1fr 2fr",
              gap: 12, padding: "8px 14px",
              fontSize: 10, color: C.dim, fontWeight: 600, letterSpacing: "0.5px",
              borderBottom: `1px solid ${C.border}`, marginBottom: 4,
            }}>
              <div>썸네일</div>
              <div>번호</div>
              <div>파일명</div>
              <div>코멘트</div>
            </div>
            {photos.map((p, i) => (
              <ListItem
                key={p.id}
                num={i + 1}
                url={p.url}
                filename={getDisplayFilename(p)}
                comment={(photoStates[p.id]?.comment ?? "").trim()}
                onOpen={() => setLightboxIndex(i)}
              />
            ))}
          </div>
        )}
      </div>

      {/* ── Bottom action bar ── */}
      {showActionBar && (
        <div style={{
          position: "fixed", bottom: 0, left: 220, right: 0,
          background: "rgba(0,48,73,0.95)",
          borderTop: "1px solid rgba(79,126,255,0.15)",
          backdropFilter: "blur(12px)",
          padding: "12px 24px",
          display: "flex", alignItems: "center", justifyContent: "space-between",
          zIndex: 100,
        }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
            <div style={{ fontSize: 13, fontWeight: 500, color: C.text }}>
              {project.status === "confirmed" ? "보정 준비 완료" : "보정 중"}
            </div>
            <div style={{ fontSize: 11, color: C.muted }}>
              {project.status === "confirmed"
                ? `${photos.length}장 확정${commentCount > 0 ? ` · 코멘트 ${commentCount}건 확인 후 보정을 시작해주세요` : " · 보정을 시작해주세요"}`
                : `${photos.length}장 보정 진행 중`}
            </div>
          </div>
          <div>
            {project.status === "confirmed" && (
              <button
                onClick={() => setShowEditStartModal(true)}
                style={{
                  display: "flex", alignItems: "center", gap: 6,
                  padding: "9px 20px", background: C.steel,
                  border: "none", borderRadius: 8, color: "white",
                  fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: "inherit",
                }}
              >
                보정 시작하기
                <ChevronRight size={14} />
              </button>
            )}
            {project.status === "editing" && (
              <button
                onClick={() => router.push(`/photographer/projects/${id}/upload-versions`)}
                style={{
                  display: "flex", alignItems: "center", gap: 6,
                  padding: "9px 20px", background: C.steel,
                  border: "none", borderRadius: 8, color: "white",
                  fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: "inherit",
                }}
              >
                보정본 업로드
                <ChevronRight size={14} />
              </button>
            )}
          </div>
        </div>
      )}

      {/* ── Edit start modal ── */}
      {showEditStartModal && (
        <div style={{
          position: "fixed", inset: 0, zIndex: 200,
          display: "flex", alignItems: "center", justifyContent: "center",
          background: "rgba(0,0,0,0.7)", padding: 16,
        }}>
          <div style={{
            background: C.surface, border: `1px solid ${C.borderMd}`,
            borderRadius: 14, padding: 24, width: "100%", maxWidth: 440,
          }}>
            <div style={{
              display: "flex", alignItems: "center", gap: 8,
              borderRadius: 8, border: "1px solid rgba(255,71,87,0.5)",
              background: "rgba(255,71,87,0.1)", padding: "10px 14px",
              marginBottom: 20, color: C.red,
            }}>
              <AlertTriangle size={18} style={{ flexShrink: 0 }} />
              <span style={{ fontSize: 14, fontWeight: 600 }}>보정 시작 전 반드시 확인하세요</span>
            </div>
            <ol style={{
              paddingLeft: 20, margin: "0 0 24px",
              display: "flex", flexDirection: "column", gap: 12,
              fontSize: 13, color: C.muted,
            }}>
              <li>보정 시작 후 고객은 &quot;최종확정&quot;을 취소할 수 없습니다</li>
              <li>선택된 사진이 고정됩니다 (추가/삭제 불가)</li>
              <li>고객은 읽기 전용 모드로 전환됩니다</li>
            </ol>
            {error && (
              <p style={{ marginBottom: 12, fontSize: 13, color: C.red }}>{error}</p>
            )}
            <div style={{ display: "flex", gap: 8 }}>
              <button
                onClick={() => setShowEditStartModal(false)}
                disabled={editStartSubmitting}
                style={{
                  flex: 1, padding: "10px 0", background: "transparent",
                  border: `1px solid ${C.border}`, borderRadius: 8,
                  color: C.muted, fontSize: 13, cursor: "pointer", fontFamily: "inherit",
                }}
              >
                취소
              </button>
              <button
                onClick={handleEditStartConfirm}
                disabled={editStartSubmitting}
                style={{
                  flex: 1, padding: "10px 0",
                  background: "rgba(255,71,87,0.15)",
                  border: "1px solid rgba(255,71,87,0.3)", borderRadius: 8,
                  color: C.red, fontSize: 13, fontWeight: 500,
                  cursor: editStartSubmitting ? "not-allowed" : "pointer", fontFamily: "inherit",
                }}
              >
                {editStartSubmitting ? "처리 중..." : "보정 시작 확인"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Lightbox ── */}
      {lightboxIndex !== null && (
        <Lightbox
          photos={photos}
          photoStates={photoStates}
          index={lightboxIndex}
          onClose={() => setLightboxIndex(null)}
          onPrev={() => setLightboxIndex((i) => (i! > 0 ? i! - 1 : photos.length - 1))}
          onNext={() => setLightboxIndex((i) => (i! < photos.length - 1 ? i! + 1 : 0))}
        />
      )}

      {/* ── Toast ── */}
      {toast && (
        <div style={{
          position: "fixed",
          bottom: showActionBar ? 80 : 24,
          left: "50%", transform: "translateX(-50%)",
          zIndex: 300,
          background: C.surface3, borderRadius: 8,
          padding: "8px 16px", fontSize: 13, fontWeight: 500, color: C.text,
          boxShadow: "0 4px 12px rgba(0,0,0,0.3)",
          border: `1px solid ${C.border}`,
          whiteSpace: "nowrap",
        }}>
          {toast}
        </div>
      )}
    </div>
  );
}

// ---------- sub-components ----------

function ExportBtn({ icon, label, onClick }: { icon: ReactNode; label: string; onClick: () => void }) {
  const [h, setH] = useState(false);
  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setH(true)}
      onMouseLeave={() => setH(false)}
      style={{
        display: "flex", alignItems: "center", gap: 5,
        padding: "6px 12px", borderRadius: 8,
        border: `1px solid ${h ? C.borderMd : C.border}`,
        background: "transparent",
        color: h ? C.text : C.muted,
        fontSize: 12, cursor: "pointer", fontFamily: "inherit",
        transition: "all 0.15s",
      }}
    >
      {icon}
      {label}
    </button>
  );
}

function ViewBtn({
  icon, label, active, onClick,
}: { icon: ReactNode; label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      style={{
        padding: "6px 12px", border: "none",
        background: active ? C.surface2 : "transparent",
        color: active ? C.text : C.muted,
        fontSize: 12, cursor: "pointer", fontFamily: "inherit",
        display: "flex", alignItems: "center", gap: 4,
        transition: "all 0.15s",
      }}
    >
      {icon}
      {label}
    </button>
  );
}

function GalleryItem({
  num, url, filename, comment, onOpen,
}: { num: number; url: string; filename: string; comment: string; onOpen: () => void }) {
  const [h, setH] = useState(false);
  const [imgErr, setImgErr] = useState(false);
  return (
    <div
      onMouseEnter={() => setH(true)}
      onMouseLeave={() => setH(false)}
      onClick={onOpen}
      style={{
        background: C.surface,
        border: `1px solid ${h ? C.borderMd : C.border}`,
        borderRadius: 10, overflow: "hidden", cursor: "pointer",
        transform: h ? "translateY(-2px)" : "none",
        transition: "all 0.18s",
      }}
    >
      <div style={{
        aspectRatio: "3/2", background: C.surface2,
        display: "flex", alignItems: "center", justifyContent: "center",
        position: "relative", overflow: "hidden",
      }}>
        {url && !imgErr ? (
          <img
            src={url} alt=""
            onError={() => setImgErr(true)}
            style={{ width: "100%", height: "100%", objectFit: "cover" }}
          />
        ) : (
          <Image size={24} color={C.dim} />
        )}
        <div style={{
          position: "absolute", top: 6, left: 6,
          background: "rgba(0,0,0,0.55)", color: "white",
          fontSize: 9, fontWeight: 600, padding: "2px 6px", borderRadius: 4,
        }}>
          {num}
        </div>
        {comment && (
          <div style={{
            position: "absolute", top: 6, right: 6,
            width: 18, height: 18,
            background: C.orange, borderRadius: "50%",
            display: "flex", alignItems: "center", justifyContent: "center",
          }}>
            <AlertCircle size={10} color="white" />
          </div>
        )}
      </div>
      <div style={{ padding: "8px 10px" }}>
        <div style={{
          fontSize: 10, color: C.muted,
          overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
          marginBottom: 4,
        }}>
          {filename}
        </div>
        <div style={{
          fontSize: 10, color: comment ? C.orange : C.dim,
          overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
          display: "flex", alignItems: "center", gap: 3,
        }}>
          {comment ? (
            <><MessageSquare size={9} />{comment}</>
          ) : (
            "코멘트 없음"
          )}
        </div>
      </div>
    </div>
  );
}

function ListItem({
  num, url, filename, comment, onOpen,
}: { num: number; url: string; filename: string; comment: string; onOpen: () => void }) {
  const [h, setH] = useState(false);
  const [imgErr, setImgErr] = useState(false);
  return (
    <div
      onMouseEnter={() => setH(true)}
      onMouseLeave={() => setH(false)}
      onClick={onOpen}
      style={{
        display: "grid", gridTemplateColumns: "48px 60px 1fr 2fr",
        gap: 12, alignItems: "center",
        padding: "10px 14px",
        background: h ? C.surface2 : C.surface,
        border: `1px solid ${h ? C.borderMd : C.border}`,
        borderRadius: 9, marginBottom: 5,
        cursor: "pointer", transition: "all 0.15s",
      }}
    >
      <div style={{
        width: 48, height: 36, background: C.surface2, borderRadius: 5,
        display: "flex", alignItems: "center", justifyContent: "center",
        border: `1px solid ${C.border}`, overflow: "hidden", flexShrink: 0,
      }}>
        {url && !imgErr ? (
          <img src={url} alt="" onError={() => setImgErr(true)}
            style={{ width: "100%", height: "100%", objectFit: "cover" }} />
        ) : (
          <Image size={16} color={C.dim} />
        )}
      </div>
      <div style={{ fontSize: 11, color: C.dim }}>{num}</div>
      <div style={{
        fontSize: 12, fontWeight: 500, color: C.text,
        overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
      }}>
        {filename}
      </div>
      <div style={{
        fontSize: 12, color: comment ? C.orange : C.dim,
        display: "flex", alignItems: "center", gap: 5,
        overflow: "hidden",
      }}>
        {comment ? (
          <>
            <MessageSquare size={12} style={{ flexShrink: 0 }} />
            <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {comment}
            </span>
          </>
        ) : "—"}
      </div>
    </div>
  );
}

// ---------- Lightbox ----------
function Lightbox({
  photos, photoStates, index, onClose, onPrev, onNext,
}: {
  photos: Photo[];
  photoStates: Record<string, { rating?: number; color?: ColorTag; comment?: string }>;
  index: number;
  onClose: () => void;
  onPrev: () => void;
  onNext: () => void;
}) {
  const photo = photos[index];
  const filename = getDisplayFilename(photo);
  const comment = (photoStates[photo.id]?.comment ?? "").trim();
  const total = photos.length;

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowLeft") onPrev();
      if (e.key === "ArrowRight") onNext();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose, onPrev, onNext]);

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed", inset: 0, zIndex: 500,
        background: "rgba(0,0,0,0.92)",
        display: "flex", flexDirection: "column",
        alignItems: "center", justifyContent: "center",
      }}
    >
      {/* Close */}
      <button
        onClick={onClose}
        style={{
          position: "absolute", top: 16, right: 16,
          width: 36, height: 36, borderRadius: "50%",
          background: "rgba(255,255,255,0.1)", border: "none",
          color: "white", cursor: "pointer",
          display: "flex", alignItems: "center", justifyContent: "center",
        }}
      >
        <X size={18} />
      </button>

      {/* Counter */}
      <div style={{
        position: "absolute", top: 20, left: "50%", transform: "translateX(-50%)",
        fontSize: 12, color: "rgba(255,255,255,0.5)",
      }}>
        {index + 1} / {total}
      </div>

      {/* Prev */}
      <button
        onClick={(e) => { e.stopPropagation(); onPrev(); }}
        style={{
          position: "absolute", left: 16, top: "50%", transform: "translateY(-50%)",
          width: 44, height: 44, borderRadius: "50%",
          background: "rgba(255,255,255,0.1)", border: "none",
          color: "white", cursor: "pointer",
          display: "flex", alignItems: "center", justifyContent: "center",
          transition: "background 0.15s",
        }}
        onMouseEnter={(e) => { e.currentTarget.style.background = "rgba(255,255,255,0.2)"; }}
        onMouseLeave={(e) => { e.currentTarget.style.background = "rgba(255,255,255,0.1)"; }}
      >
        <ChevronLeft size={22} />
      </button>

      {/* Image */}
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          display: "flex", flexDirection: "column", alignItems: "center",
          maxWidth: "90vw", width: "100%",
        }}
      >
        <img
          key={photo.id}
          src={viewerImageUrl(photo)}
          alt={filename}
          style={{
            maxHeight: "75vh", maxWidth: "90vw",
            objectFit: "contain", borderRadius: 6,
            display: "block",
          }}
        />

        {/* Info bar */}
        <div style={{
          marginTop: 14,
          background: C.modalScrim, border: "1px solid rgba(79,126,255,0.15)",
          borderRadius: 10, padding: "12px 18px",
          width: "100%", maxWidth: 560,
        }}>
          <div style={{ fontSize: 13, fontWeight: 500, color: C.text, marginBottom: comment ? 8 : 0 }}>
            {filename}
          </div>
          {comment && (
            <div style={{
              display: "flex", alignItems: "flex-start", gap: 6,
              padding: "8px 10px", borderRadius: 7,
              background: "rgba(245,166,35,0.08)", border: "1px solid rgba(245,166,35,0.2)",
            }}>
              <MessageSquare size={13} color={C.orange} style={{ flexShrink: 0, marginTop: 1 }} />
              <span style={{ fontSize: 13, color: C.orange, lineHeight: 1.5 }}>{comment}</span>
            </div>
          )}
        </div>
      </div>

      {/* Next */}
      <button
        onClick={(e) => { e.stopPropagation(); onNext(); }}
        style={{
          position: "absolute", right: 16, top: "50%", transform: "translateY(-50%)",
          width: 44, height: 44, borderRadius: "50%",
          background: "rgba(255,255,255,0.1)", border: "none",
          color: "white", cursor: "pointer",
          display: "flex", alignItems: "center", justifyContent: "center",
          transition: "background 0.15s",
        }}
        onMouseEnter={(e) => { e.currentTarget.style.background = "rgba(255,255,255,0.2)"; }}
        onMouseLeave={(e) => { e.currentTarget.style.background = "rgba(255,255,255,0.1)"; }}
      >
        <ChevronRight size={22} />
      </button>
    </div>
  );
}
