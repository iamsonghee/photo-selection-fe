"use client";

import { useCallback, useEffect, useMemo, useRef, useState, CSSProperties } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  ArrowLeft,
  CheckCircle2,
  Upload,
  FolderOpen,
  Image,
  ArrowRight,
  Check,
  ArrowUpDown,
  AlertCircle,
  RefreshCw,
  Pencil,
  FileText,
  Send,
  X,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { getPhotosWithSelections, getProjectById } from "@/lib/db";
import { buildVersionMapping, remapSingleFile, type MappingResult } from "@/lib/version-mapping";
import type { Photo, Project } from "@/types";
import CompareViewerModal from "@/components/CompareViewerModal";

// ---------- color tokens ----------
const C = {
  surface:   "#0f2030",
  surface2:  "#152a3a",
  surface3:  "#1a3347",
  steel:     "#669bbc",
  border:    "rgba(102,155,188,0.12)",
  borderMd:  "rgba(102,155,188,0.22)",
  text:      "#e8eef2",
  muted:     "#7a9ab0",
  dim:       "#3a5a6e",
  green:     "#2ed573",
  greenDim:  "#0f2a1e",
  orange:    "#f5a623",
  orangeDim: "#2a1a08",
  red:       "#ff4757",
  redDim:    "#2a0f12",
};

function getDisplayFilename(p: Photo): string {
  return (p.originalFilename ?? "").trim() || String(p.orderIndex);
}

type V1Target = { id: string; photo: Photo; filename: string };

// ---------- main page ----------
export default function UploadVersionsPage() {
  const params  = useParams();
  const router  = useRouter();
  const id      = params.id as string;

  const multiInputRef   = useRef<HTMLInputElement | null>(null);
  const perItemInputRef = useRef<HTMLInputElement | null>(null);

  const [perItemTargetId, setPerItemTargetId] = useState<string | null>(null);
  const [project,         setProject]         = useState<Project | null>(null);
  const [photos,          setPhotos]          = useState<Photo[]>([]);
  const [loading,         setLoading]         = useState(true);
  const [uploadedFiles,   setUploadedFiles]   = useState<File[]>([]);
  const [mapping,         setMapping]         = useState<MappingResult<V1Target>[]>([]);
  const [uploadedV1Info,  setUploadedV1Info]  = useState<Map<string, string>>(new Map());
  const [dragOver,        setDragOver]        = useState(false);
  const [globalMemo,      setGlobalMemo]      = useState("");
  const [showConfirm,     setShowConfirm]     = useState(false);
  const [submitting,      setSubmitting]      = useState(false);
  const [error,           setError]           = useState<string | null>(null);
  const [compareOpen,     setCompareOpen]     = useState(false);
  const [compareInitIdx,  setCompareInitIdx]  = useState(0);
  const [lightboxItems,   setLightboxItems]   = useState<Array<{ url: string; label: string; sublabel?: string | null }>>([]);
  const [lightboxIndex,   setLightboxIndex]   = useState<number | null>(null);

  // ── load project + selected photos ──
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    getProjectById(id)
      .then((p) => {
        if (cancelled) return;
        setProject(p);
        if (!p) return;
        return getPhotosWithSelections(p.id).then((result) => {
          if (cancelled || !result) return;
          const selected = result.photos.filter((ph) => result.selectedIds.has(ph.id));
          selected.sort((a, b) =>
            getDisplayFilename(a).localeCompare(getDisplayFilename(b), undefined, { sensitivity: "base" })
          );
          setPhotos(selected);
        });
      })
      .catch((e) => { if (!cancelled) { console.error(e); setError(e instanceof Error ? e.message : "로드 실패"); } })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [id]);

  // ── route guard ──
  useEffect(() => {
    if (!project || !id) return;
    if (project.status === "editing" || project.status === "reviewing_v1") return;
    if (project.status === "editing_v2" || project.status === "reviewing_v2") {
      router.replace(`/photographer/projects/${id}/upload-versions/v2`); return;
    }
    router.replace(`/photographer/projects/${id}`);
  }, [project, id, router]);

  const isReadOnly = project?.status === "reviewing_v1";

  const targets = useMemo<V1Target[]>(
    () => photos.map((photo) => ({ id: photo.id, photo, filename: getDisplayFilename(photo) })),
    [photos]
  );

  // ── rebuild mapping when files change ──
  useEffect(() => {
    if (uploadedFiles.length === 0) { setMapping([]); return; }
    setMapping(buildVersionMapping(uploadedFiles, targets));
  }, [uploadedFiles, targets]);

  // ── load server-side v1 info when read-only ──
  useEffect(() => {
    if (!id || !isReadOnly) return;
    let cancelled = false;
    fetch(`/api/photographer/projects/${id}/versions`)
      .then((res) => res.json().catch(() => ({})))
      .then((data) => {
        if (cancelled) return;
        const list = Array.isArray(data?.versions) ? data.versions : [];
        const info = new Map<string, string>();
        list.forEach((v: { version?: number; photo_id?: string; r2_url?: string }) => {
          if (v.version === 1 && v.photo_id && v.r2_url) info.set(v.photo_id, v.r2_url);
        });
        setUploadedV1Info(info);
      })
      .catch(() => { if (!cancelled) setUploadedV1Info(new Map()); });
    return () => { cancelled = true; };
  }, [id, isReadOnly]);

  const mappedCount = useMemo(() => {
    if (isReadOnly) return uploadedV1Info.size;
    return mapping.filter((m) => m.file != null).length;
  }, [isReadOnly, uploadedV1Info, mapping]);

  const localPreviewMap = useMemo(() => {
    const m = new Map<string, string>();
    mapping.forEach((item) => { if (item.file) m.set(item.target.id, URL.createObjectURL(item.file)); });
    return m;
  }, [mapping]);

  useEffect(() => () => { localPreviewMap.forEach((url) => URL.revokeObjectURL(url)); }, [localPreviewMap]);

  const comparePhotos = useMemo(() => {
    return targets
      .map((t) => {
        const retouchedUrl = localPreviewMap.get(t.id) ?? uploadedV1Info.get(t.id) ?? "";
        if (!retouchedUrl) return null;
        return {
          original: { url: t.photo.url, filename: t.filename },
          retouched: { url: retouchedUrl, filename: t.filename },
        };
      })
      .filter(Boolean) as Array<{ original: { url: string; filename: string }; retouched: { url: string; filename: string } }>;
  }, [targets, localPreviewMap, uploadedV1Info]);

  const openLightbox = useCallback((items: Array<{ url: string; label: string; sublabel?: string | null }>, index: number) => {
    setLightboxItems(items);
    setLightboxIndex(index);
  }, []);

  const openCompareByTarget = useCallback((targetId: string) => {
    const matched = targets.find((t) => t.id === targetId);
    const idx = comparePhotos.findIndex((p) => matched ? p.original.filename === matched.filename : false);
    if (idx < 0) return;
    setCompareInitIdx(idx);
    setCompareOpen(true);
  }, [comparePhotos, targets]);

  const stats = useMemo(() => {
    let exact = 0, order = 0;
    mapping.forEach((m) => { if (m.type === "exact") exact++; else if (m.type === "order") order++; });
    return { exact, order };
  }, [mapping]);

  const canDeliver = useMemo(() => {
    if (isReadOnly || project?.status !== "editing" || targets.length === 0) return false;
    return mapping.length === targets.length && mapping.every((m) => m.file != null);
  }, [isReadOnly, project?.status, targets.length, mapping]);

  const handleDropFiles = useCallback((files: File[]) => {
    setUploadedFiles(files.filter((f) => ["image/jpeg", "image/png", "image/webp"].includes(f.type)));
  }, []);

  const handleChangeOne = useCallback((targetId: string) => {
    setPerItemTargetId(targetId);
    setTimeout(() => perItemInputRef.current?.click(), 0);
  }, []);

  const handlePerItemSelect = useCallback((fileList: FileList | null) => {
    if (!fileList?.length || !perItemTargetId) return;
    const file = Array.from(fileList).find((f) => ["image/jpeg", "image/png", "image/webp"].includes(f.type));
    if (!file) return;
    setMapping((prev) => remapSingleFile(prev, perItemTargetId, file));
    setPerItemTargetId(null);
  }, [perItemTargetId]);

  const handleDeliver = useCallback(async () => {
    if (!project || !canDeliver) return;
    setSubmitting(true); setError(null);
    try {
      const supabase = createClient();
      const { data: { session } } = await supabase.auth.getSession();
      const { data: { user }, error: userError } = await supabase.auth.getUser();
      const token = session?.access_token;
      if (userError || !user) throw new Error("로그인 인증을 확인할 수 없습니다.");
      if (!token) throw new Error("로그인이 필요합니다.");

      const ordered = mapping.filter((m) => m.file != null) as Array<MappingResult<V1Target> & { file: File }>;
      const form = new FormData();
      form.append("project_id", id);
      form.append("version", "1");
      form.append("photo_ids", ordered.map((m) => m.target.id).join(","));
      ordered.forEach((m) => form.append("files", m.file));
      form.append("global_memo", globalMemo);

      const uploadRes = await fetch("/api/photographer/upload-versions", {
        method: "POST", headers: { Authorization: `Bearer ${token}` }, body: form,
      });
      const uploadData = await uploadRes.json().catch(() => ({}));
      if (!uploadRes.ok) {
        const msg = uploadData.error ?? (typeof uploadData.detail === "string"
          ? uploadData.detail : Array.isArray(uploadData.detail)
            ? uploadData.detail[0]?.msg ?? uploadData.detail[0]?.message : null);
        throw new Error(msg ?? "업로드 실패");
      }

      const patchRes = await fetch(`/api/photographer/projects/${id}/status`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "reviewing_v1" }),
      });
      const patchData = await patchRes.json().catch(() => ({}));
      if (!patchRes.ok) throw new Error(patchData.error ?? "상태 변경 실패");
      router.push(`/photographer/projects/${id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "전달 실패");
    } finally {
      setSubmitting(false); setShowConfirm(false);
    }
  }, [project, canDeliver, mapping, id, globalMemo, router]);

  // ── derived display ──
  const displayMapping = mapping.length > 0 ? mapping : buildVersionMapping([], targets);
  const emptyCount = mapping.length > 0 ? mapping.filter((m) => m.file == null).length : 0;

  const readOnlyItems = isReadOnly
    ? targets.map((t) => ({
        target: t,
        type: (uploadedV1Info.has(t.id) ? "exact" : "none") as "exact" | "none",
        serverUrl: uploadedV1Info.get(t.id),
      }))
    : [];

  const lightboxTargetItems = useMemo(
    () => targets.map((t) => ({ url: t.photo.url, label: t.filename })),
    [targets]
  );

  if (loading) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", padding: "48px 0" }}>
        <span style={{ color: C.muted }}>로딩 중...</span>
      </div>
    );
  }
  if (!project) return null;

  return (
    <div style={{ display: "flex", flexDirection: "column" }}>

      {/* ── Topbar ── */}
      <div style={{
        height: 52, borderBottom: `1px solid ${C.border}`,
        display: "flex", alignItems: "center", padding: "0 24px",
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
          <div>
            <div style={{ fontSize: 14, fontWeight: 500, color: C.text }}>v1 보정본 업로드</div>
            <div style={{ fontSize: 11, color: C.dim }}>
              {project.name} · {project.customerName} · {targets.length}장 선택됨
            </div>
          </div>
        </div>
      </div>

      {/* ── Reviewing banner ── */}
      {isReadOnly && (
        <div style={{
          margin: "16px 24px 0",
          background: "rgba(102,155,188,0.06)", border: "1px solid rgba(102,155,188,0.2)",
          borderRadius: 12, padding: "14px 20px",
          display: "flex", alignItems: "center", gap: 12,
        }}>
          <CheckCircle2 size={18} color={C.steel} />
          <div>
            <div style={{ fontSize: 13, fontWeight: 600, color: C.steel }}>고객이 v1 보정본을 검토 중입니다</div>
            <div style={{ fontSize: 11, color: C.muted, marginTop: 2 }}>현재는 보기 전용 모드입니다.</div>
          </div>
        </div>
      )}

      {/* ── 2-column grid ── */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 320px", minHeight: "calc(100vh - 52px)" }}>

        {/* ── Left col ── */}
        <div style={{ padding: "20px 20px 100px 24px", borderRight: `1px solid ${C.border}` }}>

          {/* Selected photos */}
          <div style={{ marginBottom: 18 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 10 }}>
              <span style={{ fontSize: 11, fontWeight: 600, letterSpacing: 1, textTransform: "uppercase", color: C.dim }}>
                고객 선택 사진
              </span>
              <span style={{
                background: C.surface2, border: `1px solid ${C.border}`,
                borderRadius: 10, padding: "1px 7px",
                fontSize: 10, color: C.muted,
              }}>
                {targets.length}장
              </span>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(6, 1fr)", gap: 6 }}>
              {targets.map((t, i) => (
                <SelectedThumb
                  key={t.id}
                  target={t}
                  num={i + 1}
                  onClick={() => t.photo.url && openLightbox(lightboxTargetItems, i)}
                />
              ))}
              {targets.length === 0 && (
                <div style={{ gridColumn: "1/-1", textAlign: "center", padding: "20px 0", fontSize: 13, color: C.dim }}>
                  선택된 사진이 없습니다.
                </div>
              )}
            </div>
          </div>

          {/* Dropzone */}
          {!isReadOnly && (
            <div style={{ marginBottom: 14 }}>
              <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: 1, textTransform: "uppercase", color: C.dim, marginBottom: 10 }}>
                보정본 업로드
              </div>
              <div
                onDrop={(e) => { e.preventDefault(); setDragOver(false); handleDropFiles(Array.from(e.dataTransfer.files)); }}
                onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                onDragLeave={(e) => { e.preventDefault(); setDragOver(false); }}
                onClick={() => uploadedFiles.length === 0 && multiInputRef.current?.click()}
                style={{
                  border: `2px dashed ${uploadedFiles.length > 0 ? "rgba(46,213,115,0.4)" : dragOver ? C.steel : C.borderMd}`,
                  borderRadius: 12, padding: "22px 20px", textAlign: "center",
                  cursor: uploadedFiles.length === 0 ? "pointer" : "default",
                  background: uploadedFiles.length > 0 ? "rgba(46,213,115,0.02)" : dragOver ? "rgba(102,155,188,0.05)" : "rgba(102,155,188,0.02)",
                  transition: "all 0.2s",
                }}
              >
                {uploadedFiles.length === 0 ? (
                  <>
                    <div style={{ marginBottom: 8, display: "flex", justifyContent: "center" }}>
                      <FolderOpen size={24} color={C.dim} />
                    </div>
                    <div style={{ fontSize: 13, fontWeight: 500, color: C.text, marginBottom: 4 }}>
                      드래그&드롭 또는 파일을 선택하세요
                    </div>
                    <div style={{ fontSize: 11, color: C.muted, marginBottom: 12 }}>JPEG / PNG / WebP</div>
                    <button
                      onClick={(e) => { e.stopPropagation(); multiInputRef.current?.click(); }}
                      disabled={targets.length === 0}
                      style={{
                        display: "inline-flex", alignItems: "center", gap: 5,
                        padding: "7px 16px", background: C.steel, color: "white",
                        border: "none", borderRadius: 7, fontSize: 12, fontWeight: 500,
                        cursor: targets.length === 0 ? "not-allowed" : "pointer", fontFamily: "inherit",
                      }}
                    >
                      <Upload size={13} />
                      파일 선택
                    </button>
                  </>
                ) : (
                  <>
                    <div style={{ marginBottom: 8, display: "flex", justifyContent: "center" }}>
                      <CheckCircle2 size={24} color={C.green} />
                    </div>
                    <div style={{ fontSize: 13, fontWeight: 500, color: C.text, marginBottom: 4 }}>
                      {uploadedFiles.length}장 업로드됨
                    </div>
                    <div style={{ fontSize: 11, color: C.muted, marginBottom: 12 }}>
                      파일명 자동 매핑 완료 · 아래에서 확인해주세요
                    </div>
                    <button
                      onClick={(e) => { e.stopPropagation(); multiInputRef.current?.click(); }}
                      style={{
                        display: "inline-flex", alignItems: "center", gap: 5,
                        padding: "7px 16px", background: C.surface3, color: C.muted,
                        border: `1px solid ${C.border}`, borderRadius: 7, fontSize: 12, fontWeight: 500,
                        cursor: "pointer", fontFamily: "inherit",
                      }}
                    >
                      <RefreshCw size={13} />
                      다시 선택
                    </button>
                  </>
                )}
                <div style={{ marginTop: 10, fontSize: 10, color: C.dim }}>
                  파일명 일치 시 자동 매핑 · 불일치 시 순서대로 매핑
                </div>
              </div>
            </div>
          )}

          {/* Mapping section */}
          {(displayMapping.length > 0 || isReadOnly) && (
            <>
              {/* Divider */}
              <div style={{ display: "flex", alignItems: "center", gap: 10, margin: "14px 0" }}>
                <div style={{ flex: 1, height: 1, background: C.border }} />
                <div style={{ fontSize: 11, color: C.dim, whiteSpace: "nowrap", display: "flex", alignItems: "center", gap: 8 }}>
                  매핑 결과
                  {mapping.length > 0 && (
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      {stats.exact > 0 && (
                        <div style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 11 }}>
                          <div style={{ width: 6, height: 6, borderRadius: "50%", background: C.green }} />
                          <span style={{ color: C.green }}>파일명 일치 {stats.exact}장</span>
                        </div>
                      )}
                      {stats.order > 0 && (
                        <div style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 11 }}>
                          <div style={{ width: 6, height: 6, borderRadius: "50%", background: C.orange }} />
                          <span style={{ color: C.orange }}>순서 매핑 {stats.order}장</span>
                        </div>
                      )}
                    </div>
                  )}
                </div>
                <div style={{ flex: 1, height: 1, background: C.border }} />
              </div>

              {/* Cards */}
              {isReadOnly
                ? readOnlyItems.map((item) => (
                    <MappingCard
                      key={item.target.id}
                      target={item.target}
                      file={null}
                      type={item.type}
                      orderIndex={undefined}
                      previewUrl={item.serverUrl}
                      isReadOnly
                      onChangeOne={handleChangeOne}
                      onCompare={openCompareByTarget}
                      onOpenLightbox={openLightbox}
                    />
                  ))
                : displayMapping.map((m) => (
                    <MappingCard
                      key={m.target.id}
                      target={m.target}
                      file={m.file}
                      type={m.type}
                      orderIndex={m.orderIndex}
                      previewUrl={localPreviewMap.get(m.target.id)}
                      isReadOnly={false}
                      onChangeOne={handleChangeOne}
                      onCompare={openCompareByTarget}
                      onOpenLightbox={openLightbox}
                    />
                  ))}
            </>
          )}

          {error && (
            <div style={{
              marginTop: 12, padding: "10px 14px",
              background: "rgba(255,71,87,0.1)", border: "1px solid rgba(255,71,87,0.2)",
              borderRadius: 8, fontSize: 13, color: C.red,
            }}>
              {error}
            </div>
          )}
        </div>

        {/* ── Right col ── */}
        <div style={{ padding: "20px 20px 100px", background: "rgba(0,0,0,0.1)" }}>

          {/* Project info */}
          <div style={{
            background: C.surface, border: `1px solid ${C.border}`,
            borderRadius: 12, padding: "14px 16px", marginBottom: 12,
          }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: C.muted, marginBottom: 10, letterSpacing: "0.5px", textTransform: "uppercase" }}>
              프로젝트 정보
            </div>
            {([
              { key: "프로젝트",   val: project.name,              style: {} },
              { key: "고객",       val: project.customerName || "—", style: {} },
              { key: "선택 사진",  val: `${targets.length}장`,      style: { color: C.steel } },
              { key: "업로드 현황",val: `${mappedCount} / ${targets.length}장`,
                style: { color: mappedCount < targets.length ? C.orange : C.green } as CSSProperties },
            ] as { key: string; val: string; style: CSSProperties }[]).map((row, i, arr) => (
              <div key={row.key} style={{
                display: "flex", alignItems: "center", justifyContent: "space-between",
                padding: "6px 0", borderBottom: i < arr.length - 1 ? `1px solid ${C.border}` : "none",
              }}>
                <span style={{ fontSize: 11, color: C.dim }}>{row.key}</span>
                <span style={{ fontSize: 12, fontWeight: 500, color: C.text, ...row.style }}>{row.val}</span>
              </div>
            ))}
          </div>

          {/* Memo */}
          <div style={{
            background: C.surface, border: `1px solid ${C.border}`,
            borderRadius: 12, padding: "14px 16px",
          }}>
            <div style={{
              fontSize: 11, fontWeight: 600, color: C.muted, marginBottom: 10,
              letterSpacing: "0.5px", textTransform: "uppercase",
              display: "flex", alignItems: "center", gap: 5,
            }}>
              <FileText size={12} />
              전체 작가 메모
            </div>
            <textarea
              value={globalMemo}
              onChange={(e) => setGlobalMemo(e.target.value)}
              placeholder="고객에게 전달할 메모 (선택사항)"
              disabled={isReadOnly}
              style={{
                width: "100%", padding: "10px 12px",
                background: C.surface2, border: `1px solid ${C.border}`,
                borderRadius: 8, color: C.text,
                fontSize: 12, fontFamily: "inherit",
                resize: "none", height: 72, lineHeight: 1.5, outline: "none",
              }}
            />
            <div style={{ fontSize: 10, color: C.dim, marginTop: 4 }}>
              고객 검토 화면에 표시됩니다
            </div>
          </div>
        </div>
      </div>

      {/* ── Bottom action bar ── */}
      {!isReadOnly && (
        <div style={{
          position: "fixed", bottom: 0, left: 220, right: 0,
          background: "rgba(0,48,73,0.95)",
          borderTop: "1px solid rgba(102,155,188,0.15)",
          backdropFilter: "blur(12px)",
          padding: "12px 24px",
          display: "flex", alignItems: "center", justifyContent: "space-between",
          zIndex: 100,
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
            <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
              <div style={{ fontSize: 13, fontWeight: 500, color: C.text }}>v1 보정본 업로드 현황</div>
              <div style={{ fontSize: 11, color: emptyCount > 0 ? C.orange : C.muted }}>
                {emptyCount > 0 ? `미업로드 ${emptyCount}장 · 매핑 확인 후 전달해주세요` : "매핑 확인 후 전달해주세요"}
              </div>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <div style={{ width: 100, height: 3, background: "rgba(255,255,255,0.1)", borderRadius: 2, overflow: "hidden" }}>
                <div style={{
                  height: "100%", borderRadius: 2, background: C.steel, transition: "width 0.3s",
                  width: targets.length > 0 ? `${Math.min(100, Math.round((mappedCount / targets.length) * 100))}%` : "0%",
                }} />
              </div>
              <span style={{ fontSize: 11, color: C.muted }}>{mappedCount} / {targets.length}장 업로드</span>
            </div>
          </div>
          <button
            disabled={!canDeliver || submitting}
            onClick={() => setShowConfirm(true)}
            style={{
              display: "flex", alignItems: "center", gap: 6,
              padding: "9px 22px",
              background: canDeliver ? C.steel : C.surface3,
              border: "none", borderRadius: 9,
              color: canDeliver ? "white" : C.dim,
              fontSize: 13, fontWeight: 600,
              cursor: canDeliver ? "pointer" : "not-allowed",
              fontFamily: "inherit",
            }}
          >
            고객에게 전달
            <Send size={14} />
          </button>
        </div>
      )}

      {/* ── Confirm modal ── */}
      {showConfirm && (
        <div style={{
          position: "fixed", inset: 0, zIndex: 200,
          display: "flex", alignItems: "center", justifyContent: "center",
          background: "rgba(0,0,0,0.7)", padding: 16,
        }}>
          <div style={{
            background: C.surface, border: `1px solid ${C.borderMd}`,
            borderRadius: 14, padding: 24, width: "100%", maxWidth: 380,
          }}>
            <h3 style={{ fontSize: 16, fontWeight: 600, color: C.text, marginBottom: 8 }}>고객에게 전달</h3>
            <p style={{ fontSize: 14, color: C.muted, lineHeight: 1.6, marginBottom: 24 }}>
              v1 보정본 {mappedCount}장을 고객에게 전달하시겠습니까?
              <br />전달 후 고객이 v1 검토를 진행합니다.
            </p>
            {error && <p style={{ marginBottom: 12, fontSize: 13, color: C.red }}>{error}</p>}
            <div style={{ display: "flex", gap: 8 }}>
              <button
                onClick={() => setShowConfirm(false)} disabled={submitting}
                style={{
                  flex: 1, padding: "10px 0", background: "transparent",
                  border: `1px solid ${C.border}`, borderRadius: 8,
                  color: C.muted, fontSize: 13, cursor: "pointer", fontFamily: "inherit",
                }}
              >
                취소
              </button>
              <button
                onClick={handleDeliver} disabled={submitting || !canDeliver}
                style={{
                  flex: 1, padding: "10px 0",
                  background: "rgba(102,155,188,0.15)",
                  border: "1px solid rgba(102,155,188,0.3)", borderRadius: 8,
                  color: C.steel, fontSize: 13, fontWeight: 500,
                  cursor: submitting ? "not-allowed" : "pointer", fontFamily: "inherit",
                  display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
                }}
              >
                {submitting ? "처리 중..." : "전달하기"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Hidden file inputs ── */}
      <input ref={multiInputRef} type="file" multiple accept="image/jpeg,image/png,image/webp"
        style={{ display: "none" }} onChange={(e) => handleDropFiles(Array.from(e.target.files ?? []))} />
      <input ref={perItemInputRef} type="file" accept="image/jpeg,image/png,image/webp"
        style={{ display: "none" }} onChange={(e) => handlePerItemSelect(e.target.files)} />

      {lightboxIndex !== null && lightboxItems.length > 0 && (
        <Lightbox
          items={lightboxItems}
          index={lightboxIndex}
          onClose={() => setLightboxIndex(null)}
          onPrev={() => setLightboxIndex((i) => i !== null ? (i - 1 + lightboxItems.length) % lightboxItems.length : null)}
          onNext={() => setLightboxIndex((i) => i !== null ? (i + 1) % lightboxItems.length : null)}
        />
      )}

      <CompareViewerModal
        isOpen={compareOpen}
        onClose={() => setCompareOpen(false)}
        photos={comparePhotos}
        initialIndex={compareInitIdx}
      />
    </div>
  );
}

// ---------- sub-components ----------

function SelectedThumb({ target, num, onClick }: { target: V1Target; num: number; onClick?: () => void }) {
  const [err, setErr] = useState(false);
  return (
    <div
      onClick={onClick}
      style={{
        background: C.surface, border: `1px solid ${C.border}`,
        borderRadius: 8, overflow: "hidden",
        cursor: onClick ? "zoom-in" : "default",
      }}
    >
      <div style={{ aspectRatio: "3/2", background: C.surface2, display: "flex", alignItems: "center", justifyContent: "center", position: "relative", overflow: "hidden" }}>
        {target.photo.url && !err ? (
          <img src={target.photo.url} alt="" onError={() => setErr(true)} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
        ) : (
          <Image size={16} color={C.dim} />
        )}
        <div style={{
          position: "absolute", bottom: 3, left: 4,
          fontSize: 9, color: "rgba(255,255,255,0.6)",
          background: "rgba(0,0,0,0.4)", padding: "1px 4px", borderRadius: 3,
        }}>
          {num}
        </div>
      </div>
      <div style={{ padding: "4px 6px", fontSize: 9, color: C.muted, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
        {target.filename}
      </div>
    </div>
  );
}

function MappingCard({
  target, file, type, orderIndex, previewUrl, isReadOnly, onChangeOne, onCompare, onOpenLightbox,
}: {
  target: V1Target;
  file: File | null;
  type: "exact" | "order" | "none";
  orderIndex?: number;
  previewUrl?: string;
  isReadOnly: boolean;
  onChangeOne: (id: string) => void;
  onCompare: (id: string) => void;
  onOpenLightbox: (items: Array<{ url: string; label: string; sublabel?: string | null }>, index: number) => void;
}) {
  const [origErr, setOrigErr]     = useState(false);
  const [retouchErr, setRetouchErr] = useState(false);
  const state = isReadOnly ? (previewUrl ? "matched" : "empty") : type === "exact" ? "matched" : type === "order" ? "ordered" : "empty";
  const borderColor = state === "matched" ? "rgba(46,213,115,0.2)" : state === "ordered" ? "rgba(245,166,35,0.2)" : "rgba(255,71,87,0.2)";
  const fileSizeStr = file ? `${(file.size / 1024 / 1024).toFixed(1)}MB` : "";

  return (
    <div style={{ background: C.surface2, border: `1px solid ${borderColor}`, borderRadius: 10, overflow: "hidden", marginBottom: 7 }}>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 32px 1fr auto", alignItems: "center", padding: "10px 14px" }}>

        {/* Original */}
        <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
          <div
            onClick={() => target.photo.url && onOpenLightbox([{ url: target.photo.url, label: target.filename, sublabel: "원본 선택 사진" }], 0)}
            style={{ width: 52, height: 38, background: C.surface3, borderRadius: 5, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, border: `1px solid ${C.border}`, overflow: "hidden", cursor: target.photo.url ? "zoom-in" : "default" }}
          >
            {target.photo.url && !origErr ? (
              <img src={target.photo.url} alt="" onError={() => setOrigErr(true)} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
            ) : <Image size={16} color={C.dim} />}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 11, fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", marginBottom: 2, color: C.text }}>{target.filename}</div>
            <div style={{ fontSize: 10, color: C.muted }}>원본 선택 사진</div>
          </div>
        </div>

        {/* Arrow */}
        <div style={{ display: "flex", justifyContent: "center", color: C.dim }}><ArrowRight size={13} /></div>

        {/* Retouched */}
        {state === "empty" ? (
          <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
            <div style={{ width: 52, height: 38, background: "transparent", borderRadius: 5, border: `2px dashed ${C.border}`, flexShrink: 0 }} />
            <div style={{ fontSize: 11, color: C.dim, fontStyle: "italic" }}>보정본 없음</div>
          </div>
        ) : (
          <div
            style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0, cursor: previewUrl ? "zoom-in" : "default" }}
            onClick={() => previewUrl && onCompare(target.id)}
          >
            <div style={{ width: 52, height: 38, background: "#1a2535", borderRadius: 5, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, border: `1px solid ${C.border}`, overflow: "hidden" }}>
              {previewUrl && !retouchErr ? (
                <img src={previewUrl} alt="" onError={() => setRetouchErr(true)} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
              ) : <Image size={16} color={C.dim} />}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 11, fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", marginBottom: 2, color: C.text }}>
                {file?.name ?? (isReadOnly ? "업로드 완료" : "")}
              </div>
              {fileSizeStr && <div style={{ fontSize: 10, color: C.muted }}>{fileSizeStr}</div>}
            </div>
          </div>
        )}

        {/* Actions */}
        <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0, paddingLeft: 8 }}>
          {state === "matched" && (
            <span style={{ padding: "2px 8px", borderRadius: 20, fontSize: 10, fontWeight: 500, whiteSpace: "nowrap", color: C.green, background: C.greenDim, border: "1px solid rgba(46,213,115,0.3)", display: "flex", alignItems: "center", gap: 3 }}>
              <Check size={9} />파일명 일치
            </span>
          )}
          {state === "ordered" && (
            <span style={{ padding: "2px 8px", borderRadius: 20, fontSize: 10, fontWeight: 500, whiteSpace: "nowrap", color: C.orange, background: C.orangeDim, border: "1px solid rgba(245,166,35,0.3)", display: "flex", alignItems: "center", gap: 3 }}>
              <ArrowUpDown size={9} />순서 매핑
            </span>
          )}
          {state === "empty" && (
            <span style={{ padding: "2px 8px", borderRadius: 20, fontSize: 10, fontWeight: 500, whiteSpace: "nowrap", color: C.red, background: C.redDim, border: "1px solid rgba(255,71,87,0.3)", display: "flex", alignItems: "center", gap: 3 }}>
              <AlertCircle size={9} />미업로드
            </span>
          )}
          {!isReadOnly && (
            <button
              onClick={() => onChangeOne(target.id)}
              style={{
                padding: "3px 8px", borderRadius: 5,
                border: `1px solid ${state === "empty" ? "rgba(102,155,188,0.3)" : C.border}`,
                background: "transparent",
                color: state === "empty" ? C.steel : C.dim,
                fontSize: 10, cursor: "pointer", fontFamily: "inherit",
                display: "flex", alignItems: "center", gap: 3,
                transition: "all 0.15s",
              }}
            >
              {state === "empty" ? "선택" : <><Pencil size={9} />변경</>}
            </button>
          )}
        </div>
      </div>

      {/* Ordered warning */}
      {state === "ordered" && !isReadOnly && (
        <div style={{
          padding: "5px 14px",
          borderTop: "1px solid rgba(245,166,35,0.12)",
          background: "rgba(245,166,35,0.04)",
          fontSize: 10, color: C.orange,
        }}>
          파일명 불일치 · 업로드 순서({(orderIndex ?? 0) + 1}번째)로 자동 매핑됐습니다. 다른 사진이면 [변경]을 눌러주세요.
        </div>
      )}
    </div>
  );
}

// ---------- Lightbox ----------

function Lightbox({
  items, index, onClose, onPrev, onNext,
}: {
  items: Array<{ url: string; label: string; sublabel?: string | null }>;
  index: number;
  onClose: () => void;
  onPrev: () => void;
  onNext: () => void;
}) {
  const item = items[index];
  const multi = items.length > 1;

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowLeft" && multi) onPrev();
      if (e.key === "ArrowRight" && multi) onNext();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose, onPrev, onNext, multi]);

  if (!item) return null;

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed", inset: 0, zIndex: 500,
        background: "rgba(0,0,0,0.9)",
        display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
      }}
    >
      {/* Close */}
      <button
        onClick={onClose}
        style={{
          position: "absolute", top: 16, right: 16,
          background: "rgba(255,255,255,0.08)", border: "none", borderRadius: "50%",
          width: 36, height: 36, display: "flex", alignItems: "center", justifyContent: "center",
          cursor: "pointer", color: C.text,
        }}
      >
        <X size={18} />
      </button>

      {/* Counter */}
      {multi && (
        <div style={{
          position: "absolute", top: 20, left: "50%", transform: "translateX(-50%)",
          fontSize: 12, color: C.muted,
        }}>
          {index + 1} / {items.length}
        </div>
      )}

      {/* Prev */}
      {multi && (
        <button
          onClick={(e) => { e.stopPropagation(); onPrev(); }}
          style={{
            position: "absolute", left: 16, top: "50%", transform: "translateY(-50%)",
            background: "rgba(255,255,255,0.08)", border: "none", borderRadius: "50%",
            width: 40, height: 40, display: "flex", alignItems: "center", justifyContent: "center",
            cursor: "pointer", color: C.text,
          }}
        >
          <ChevronLeft size={20} />
        </button>
      )}

      {/* Image */}
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          maxWidth: "calc(100vw - 120px)", maxHeight: "calc(100vh - 120px)",
          display: "flex", alignItems: "center", justifyContent: "center",
        }}
      >
        <img
          src={item.url}
          alt={item.label}
          style={{ maxWidth: "100%", maxHeight: "calc(100vh - 120px)", objectFit: "contain", borderRadius: 6 }}
        />
      </div>

      {/* Next */}
      {multi && (
        <button
          onClick={(e) => { e.stopPropagation(); onNext(); }}
          style={{
            position: "absolute", right: 16, top: "50%", transform: "translateY(-50%)",
            background: "rgba(255,255,255,0.08)", border: "none", borderRadius: "50%",
            width: 40, height: 40, display: "flex", alignItems: "center", justifyContent: "center",
            cursor: "pointer", color: C.text,
          }}
        >
          <ChevronRight size={20} />
        </button>
      )}

      {/* Info bar */}
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          position: "absolute", bottom: 0, left: 0, right: 0,
          padding: "14px 24px",
          background: "linear-gradient(transparent, rgba(0,0,0,0.7))",
          display: "flex", flexDirection: "column", alignItems: "center", gap: 4,
        }}
      >
        <div style={{ fontSize: 13, fontWeight: 500, color: C.text }}>{item.label}</div>
        {item.sublabel && (
          <div style={{
            fontSize: 11, color: C.muted,
            background: "rgba(102,155,188,0.12)", border: "1px solid rgba(102,155,188,0.25)",
            borderRadius: 6, padding: "3px 10px",
          }}>
            {item.sublabel}
          </div>
        )}
      </div>
    </div>
  );
}
