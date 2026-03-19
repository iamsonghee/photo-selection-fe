"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { Copy, Download, Loader2, MessageSquare, Upload } from "lucide-react";
import { Button, Card } from "@/components/ui";
import { createClient } from "@/lib/supabase/client";
import { getPhotosWithSelections, getProjectById, getVersionReviewsByProjectId } from "@/lib/db";
import { buildVersionMapping, remapSingleFile, type MappingResult } from "@/lib/version-mapping";
import type { Photo, Project } from "@/types";
import CompareViewerModal from "@/components/CompareViewerModal";

function getDisplayFilename(p: Photo): string {
  return (p.originalFilename ?? "").trim() || String(p.orderIndex);
}

function buildRevisionExportText(items: Array<{ filename: string; comment: string | null }>) {
  const lines: string[] = [];
  lines.push("=== 재보정 요청 목록 ===");
  items.forEach((it, idx) => {
    lines.push(`${idx + 1}. ${it.filename}`);
    lines.push(`   고객 코멘트: "${it.comment ?? ""}"`);
  });
  return lines.join("\n");
}

type V2Target = { id: string; photo: Photo; filename: string; comment: string | null };

export default function UploadVersionsV2Page() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;

  const multiInputRef = useRef<HTMLInputElement | null>(null);
  const perItemInputRef = useRef<HTMLInputElement | null>(null);

  const [perItemTargetId, setPerItemTargetId] = useState<string | null>(null);
  const [project, setProject] = useState<Project | null>(null);
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [reviews, setReviews] = useState<
    Array<{ photoId: string; status: "approved" | "revision_requested"; customerComment: string | null }>
  >([]);
  const [serverV1Map, setServerV1Map] = useState<Map<string, string>>(new Map());
  const [serverV2Map, setServerV2Map] = useState<Map<string, string>>(new Map());
  const [loading, setLoading] = useState(true);
  const [reviewLoading, setReviewLoading] = useState(false);
  const [uploadedFiles, setUploadedFiles] = useState<File[]>([]);
  const [mapping, setMapping] = useState<MappingResult<V2Target>[]>([]);
  const [dragOver, setDragOver] = useState(false);
  const [globalMemo, setGlobalMemo] = useState("");
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [showCommentsModal, setShowCommentsModal] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [compareOpen, setCompareOpen] = useState(false);
  const [compareInitialIndex, setCompareInitialIndex] = useState(0);

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
      .catch((e) => {
        if (!cancelled) {
          console.error(e);
          setError(e instanceof Error ? e.message : "로드 실패");
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [id]);

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    fetch(`/api/photographer/projects/${id}/versions`)
      .then((res) => res.json().catch(() => ({})))
      .then((data) => {
        if (cancelled) return;
        const list = Array.isArray(data?.versions) ? data.versions : [];
        const v1 = new Map<string, string>();
        const v2 = new Map<string, string>();
        list.forEach((it: { version?: number; photo_id?: string; r2_url?: string }) => {
          if (!it.photo_id || !it.r2_url) return;
          if (it.version === 1) v1.set(it.photo_id, it.r2_url);
          if (it.version === 2) v2.set(it.photo_id, it.r2_url);
        });
        setServerV1Map(v1);
        setServerV2Map(v2);
      })
      .catch(() => {
        if (!cancelled) {
          setServerV1Map(new Map());
          setServerV2Map(new Map());
        }
      });
    return () => {
      cancelled = true;
    };
  }, [id]);

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    setReviewLoading(true);
    getVersionReviewsByProjectId(id)
      .then((list) => {
        if (cancelled) return;
        setReviews(
          (list ?? []).map((r) => ({
            photoId: r.photoId,
            status: r.status,
            customerComment: r.customerComment,
          }))
        );
      })
      .catch(() => {
        if (!cancelled) setReviews([]);
      })
      .finally(() => {
        if (!cancelled) setReviewLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [id]);

  useEffect(() => {
    if (!project || !id) return;
    if (project.status === "editing_v2" || project.status === "reviewing_v2") return;
    router.replace(`/photographer/projects/${id}`);
  }, [project, id, router]);

  const isReadOnly = project?.status === "reviewing_v2";

  const reviewByPhotoId = useMemo(() => {
    const m = new Map<string, { status: "approved" | "revision_requested"; comment: string | null }>();
    reviews.forEach((r) => m.set(r.photoId, { status: r.status, comment: r.customerComment }));
    return m;
  }, [reviews]);

  const approvedPhotos = useMemo(
    () => photos.filter((p) => reviewByPhotoId.get(p.id)?.status === "approved"),
    [photos, reviewByPhotoId]
  );

  const revisionTargets = useMemo<V2Target[]>(() => {
    return photos
      .map((p) => {
        const rev = reviewByPhotoId.get(p.id);
        if (rev?.status !== "revision_requested") return null;
        return {
          id: p.id,
          photo: p,
          filename: getDisplayFilename(p),
          comment: rev.comment ?? null,
        };
      })
      .filter(Boolean) as V2Target[];
  }, [photos, reviewByPhotoId]);

  useEffect(() => {
    if (uploadedFiles.length === 0) {
      setMapping([]);
      return;
    }
    setMapping(buildVersionMapping(uploadedFiles, revisionTargets));
  }, [uploadedFiles, revisionTargets]);

  const localV2PreviewMap = useMemo(() => {
    const m = new Map<string, string>();
    mapping.forEach((item) => {
      if (item.file) m.set(item.target.id, URL.createObjectURL(item.file));
    });
    return m;
  }, [mapping]);

  useEffect(() => {
    return () => {
      localV2PreviewMap.forEach((url) => URL.revokeObjectURL(url));
    };
  }, [localV2PreviewMap]);

  const comparePhotos = useMemo(() => {
    return revisionTargets
      .map((t) => {
        const v1 = serverV1Map.get(t.id);
        const v2 = localV2PreviewMap.get(t.id) ?? serverV2Map.get(t.id);
        if (!v1 && !v2) return null;
        return {
          original: { url: t.photo.url, filename: t.filename },
          v1: v1 ? { url: v1, filename: t.filename } : undefined,
          v2: v2 ? { url: v2, filename: t.filename } : undefined,
        };
      })
      .filter(Boolean) as Array<{
      original: { url: string; filename: string };
      v1?: { url: string; filename: string };
      v2?: { url: string; filename: string };
    }>;
  }, [revisionTargets, serverV1Map, serverV2Map, localV2PreviewMap]);

  const openCompareByTarget = useCallback(
    (targetId: string) => {
      const idx = comparePhotos.findIndex((item) => {
        const t = revisionTargets.find((r) => r.id === targetId);
        return t ? item.original.filename === t.filename : false;
      });
      if (idx < 0) return;
      setCompareInitialIndex(idx);
      setCompareOpen(true);
    },
    [comparePhotos, revisionTargets]
  );

  const mappedCount = useMemo(() => mapping.filter((m) => m.file != null).length, [mapping]);

  const stats = useMemo(() => {
    let exact = 0;
    let order = 0;
    mapping.forEach((m) => {
      if (m.type === "exact") exact += 1;
      else if (m.type === "order") order += 1;
    });
    return { exact, order };
  }, [mapping]);

  const canDeliver = useMemo(() => {
    if (isReadOnly) return false;
    if (project?.status !== "editing_v2") return false;
    if (revisionTargets.length === 0) return false;
    return mapping.length === revisionTargets.length && mapping.every((m) => m.file != null);
  }, [isReadOnly, project?.status, revisionTargets.length, mapping]);

  const handleDropFiles = useCallback((files: File[]) => {
    const filtered = files.filter((f) => ["image/jpeg", "image/png", "image/webp"].includes(f.type));
    setUploadedFiles(filtered);
  }, []);

  const handleChangeOne = useCallback((targetId: string) => {
    setPerItemTargetId(targetId);
    setTimeout(() => perItemInputRef.current?.click(), 0);
  }, []);

  const handlePerItemSelect = useCallback(
    (fileList: FileList | null) => {
      if (!fileList?.length || !perItemTargetId) return;
      const file = Array.from(fileList).find((f) => ["image/jpeg", "image/png", "image/webp"].includes(f.type));
      if (!file) return;
      setMapping((prev) => remapSingleFile(prev, perItemTargetId, file));
      setPerItemTargetId(null);
    },
    [perItemTargetId]
  );

  const handleCopy = useCallback(async () => {
    const text = buildRevisionExportText(revisionTargets.map((r) => ({ filename: r.filename, comment: r.comment })));
    await navigator.clipboard.writeText(text);
  }, [revisionTargets]);

  const handleDownloadTxt = useCallback(() => {
    const text = buildRevisionExportText(revisionTargets.map((r) => ({ filename: r.filename, comment: r.comment })));
    const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `revision_requests_${id}.txt`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }, [revisionTargets, id]);

  const handleDeliver = useCallback(async () => {
    if (!project || !canDeliver) return;

    setSubmitting(true);
    setError(null);
    try {
      const supabase = createClient();
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();
      const token = session?.access_token;
      if (userError || !user) throw new Error("로그인 인증을 확인할 수 없습니다. 다시 로그인 후 시도해주세요.");
      if (!token) throw new Error("로그인이 필요합니다.");

      const ordered = mapping.filter((m) => m.file != null) as Array<MappingResult<V2Target> & { file: File }>;
      const form = new FormData();
      form.append("project_id", id);
      form.append("version", "2");
      form.append("photo_ids", ordered.map((m) => m.target.id).join(","));
      ordered.forEach((m) => form.append("files", m.file));
      form.append("global_memo", globalMemo);

      const uploadRes = await fetch("/api/photographer/upload-versions", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: form,
      });
      const uploadData = await uploadRes.json().catch(() => ({}));
      if (!uploadRes.ok) {
        const msg =
          uploadData.error ??
          (typeof uploadData.detail === "string"
            ? uploadData.detail
            : Array.isArray(uploadData.detail)
              ? uploadData.detail[0]?.msg ?? uploadData.detail[0]?.message
              : null);
        throw new Error(msg ?? "업로드 실패");
      }

      const patchRes = await fetch(`/api/photographer/projects/${id}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "reviewing_v2" }),
      });
      const patchData = await patchRes.json().catch(() => ({}));
      if (!patchRes.ok) throw new Error(patchData.error ?? "상태 변경 실패");

      router.push(`/photographer/projects/${id}`);
    } catch (e) {
      console.error(e);
      setError(e instanceof Error ? e.message : "전달 실패");
    } finally {
      setSubmitting(false);
      setShowConfirmModal(false);
    }
  }, [project, canDeliver, mapping, id, globalMemo, router]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <p className="text-zinc-400">로딩 중...</p>
      </div>
    );
  }

  if (!project) return null;

  const renderTargets = mapping.length > 0 ? mapping : buildVersionMapping([], revisionTargets);

  return (
    <div className="mx-auto max-w-6xl px-4 py-6 pb-28 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-white">v2 재보정 업로드</h1>
        <Link href={`/photographer/projects/${id}`}>
          <Button variant="ghost" size="sm">프로젝트로</Button>
        </Link>
      </div>

      {isReadOnly && (
        <Card className="border-[#4f7eff]/30 bg-[#4f7eff]/5">
          <p className="text-sm text-zinc-200">고객이 v2 보정본을 검토 중입니다</p>
          <p className="mt-1 text-xs text-zinc-400">현재는 보기 전용 모드입니다.</p>
        </Card>
      )}

      <Card>
        <div className="flex items-center justify-between gap-3">
          <div className="text-sm text-zinc-300">
            <span className="text-success">확정 {approvedPhotos.length}장</span>
            <span className="mx-2 text-zinc-600">·</span>
            <span className="text-warning">재보정 요청 {revisionTargets.length}장</span>
            {reviewLoading && <span className="ml-2 text-xs text-zinc-500">(불러오는 중...)</span>}
          </div>
          <Button variant="outline" size="sm" onClick={() => setShowCommentsModal(true)}>
            <MessageSquare className="h-4 w-4" />
            코멘트 보기
          </Button>
        </div>
      </Card>

      <Card>
        <h2 className="text-sm font-semibold text-zinc-200">v2 보정본 업로드 + 매핑</h2>
        <p className="mt-1 text-xs text-zinc-500">재보정 요청 {revisionTargets.length}장만 업로드해주세요.</p>

        {!isReadOnly && (
          <div
            onDrop={(e) => {
              e.preventDefault();
              setDragOver(false);
              handleDropFiles(Array.from(e.dataTransfer.files));
            }}
            onDragOver={(e) => {
              e.preventDefault();
              setDragOver(true);
            }}
            onDragLeave={(e) => {
              e.preventDefault();
              setDragOver(false);
            }}
            className={`mt-4 rounded-xl border-2 border-dashed px-4 py-6 text-center transition-colors ${
              dragOver ? "border-primary bg-primary/10" : "border-zinc-700 bg-zinc-800/30"
            }`}
          >
            {uploadedFiles.length === 0 ? (
              <>
                <p className="text-sm text-zinc-300">드래그&드롭 또는 클릭하여 여러 파일을 선택하세요</p>
                <p className="mt-1 text-xs text-zinc-500">JPEG/PNG/WebP</p>
                <div className="mt-3">
                  <Button variant="outline" onClick={() => multiInputRef.current?.click()} disabled={revisionTargets.length === 0}>
                    파일 선택
                  </Button>
                </div>
              </>
            ) : (
              <>
                <p className="text-sm text-zinc-200">{uploadedFiles.length}장 업로드됨</p>
                <div className="mt-3">
                  <Button variant="outline" onClick={() => multiInputRef.current?.click()}>
                    다시 선택
                  </Button>
                </div>
              </>
            )}
            <input
              ref={multiInputRef}
              type="file"
              multiple
              accept="image/jpeg,image/png,image/webp"
              className="hidden"
              onChange={(e) => handleDropFiles(Array.from(e.target.files ?? []))}
            />
            <input
              ref={perItemInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              className="hidden"
              onChange={(e) => handlePerItemSelect(e.target.files)}
            />
          </div>
        )}

        {mapping.length > 0 && (
          <div className="mt-4 rounded-lg border border-zinc-800 bg-zinc-900/30 px-4 py-3 text-sm text-zinc-300">
            매핑 통계: <span className="text-success">파일명 일치 {stats.exact}</span> ·{" "}
            <span className="text-warning">순서 매핑 {stats.order}</span>
          </div>
        )}

        <div className="mt-4 space-y-2">
          {renderTargets.map((m) => (
            <div
              key={m.target.id}
              className="rounded-lg border border-zinc-800 bg-zinc-900/30 p-3"
              onClick={() => openCompareByTarget(m.target.id)}
            >
              <div className="grid grid-cols-1 gap-2 md:grid-cols-[1fr_auto_1fr] md:items-center">
                <div className="min-w-0">
                  <div className="mb-2 flex items-center gap-2">
                    <div className="h-12 w-12 overflow-hidden rounded bg-zinc-800">
                      <img src={m.target.photo.url} alt="" className="h-full w-full object-cover" />
                    </div>
                    {serverV1Map.get(m.target.id) && (
                      <div className="h-12 w-12 overflow-hidden rounded bg-zinc-800">
                        <img src={serverV1Map.get(m.target.id)} alt="" className="h-full w-full object-cover" />
                      </div>
                    )}
                  </div>
                  <div className="truncate text-sm font-semibold text-zinc-200" title={m.target.filename}>{m.target.filename}</div>
                  <div className="mt-1 text-xs text-warning/90">고객 코멘트: {m.target.comment ?? "-"}</div>
                </div>
                <div className="hidden md:flex items-center justify-center text-zinc-500">→</div>
                <div className="min-w-0">
                  <div className="truncate text-sm text-zinc-200" title={m.file?.name ?? ""}>{m.file?.name ?? "업로드 필요"}</div>
                  {(m.file || serverV2Map.get(m.target.id)) && (
                    <div className="mt-1 flex items-center gap-2">
                      <div className="h-12 w-12 overflow-hidden rounded bg-zinc-800">
                        <img
                          src={m.file ? localV2PreviewMap.get(m.target.id) : serverV2Map.get(m.target.id)}
                          alt=""
                          className="h-full w-full cursor-zoom-in object-cover"
                        />
                      </div>
                      {m.file && (
                        <span className="text-xs text-zinc-500">{(m.file.size / 1024 / 1024).toFixed(2)} MB</span>
                      )}
                    </div>
                  )}
                  <div className="mt-1 flex items-center gap-2">
                    {m.type === "exact" && <span className="rounded bg-success/15 px-2 py-0.5 text-xs font-semibold text-success">✓ 파일명 일치</span>}
                    {m.type === "order" && <span className="rounded bg-warning/15 px-2 py-0.5 text-xs font-semibold text-warning">↕ 순서 매핑</span>}
                    {!isReadOnly && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleChangeOne(m.target.id);
                        }}
                      >
                        변경
                      </Button>
                    )}
                  </div>
                  {m.type === "order" && (
                    <div className="mt-1 text-xs text-warning/90">
                      파일명이 일치하지 않아 업로드 순서({m.orderIndex}번째)로 자동 매핑되었습니다.
                    </div>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      </Card>

      <Card>
        <label className="mb-2 block text-sm font-medium text-zinc-300">작가 메모 (선택)</label>
        <textarea
          value={globalMemo}
          onChange={(e) => setGlobalMemo(e.target.value)}
          placeholder="고객에게 전달됩니다"
          className="w-full rounded-lg border border-zinc-700 bg-zinc-800/50 px-3 py-2 text-sm text-zinc-200 placeholder-zinc-500 outline-none focus:border-primary"
          rows={3}
          disabled={isReadOnly}
        />
      </Card>

      {error && <p className="rounded-lg bg-danger/10 px-3 py-2 text-sm text-danger">{error}</p>}

      {!isReadOnly && (
        <div className="fixed bottom-0 left-0 right-0 z-30 border-t border-zinc-800 bg-zinc-950/90 backdrop-blur">
          <div className="mx-auto max-w-6xl px-4 py-3 flex items-center justify-between gap-4">
            <div className="flex-1 min-w-0">
              <div className="text-sm font-semibold text-zinc-200">
                업로드 현황 <span className="font-mono text-zinc-400">{mappedCount}</span> /{" "}
                <span className="font-mono text-zinc-400">{revisionTargets.length}</span>
              </div>
              <div className="mt-2 h-2 rounded-full bg-zinc-800 overflow-hidden">
                <div
                  className="h-full rounded-full bg-primary"
                  style={{
                    width:
                      revisionTargets.length > 0
                        ? `${Math.min(100, Math.round((mappedCount / revisionTargets.length) * 100))}%`
                        : "0%",
                  }}
                />
              </div>
            </div>
            <Button variant="primary" disabled={!canDeliver || submitting} onClick={() => setShowConfirmModal(true)}>
              고객에게 전달
            </Button>
          </div>
        </div>
      )}

      {showCommentsModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
          <Card className="w-full max-w-2xl">
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-lg font-semibold text-white">전체 리뷰 결과</h3>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={handleCopy}><Copy className="h-4 w-4" />복사</Button>
                <Button variant="outline" size="sm" onClick={handleDownloadTxt}><Download className="h-4 w-4" />TXT</Button>
              </div>
            </div>
            <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
              <div>
                <div className="text-sm font-semibold text-success">확정 ({approvedPhotos.length}장)</div>
                <ul className="mt-2 space-y-1 text-sm text-zinc-300">
                  {approvedPhotos.map((p) => <li key={p.id}>{getDisplayFilename(p)}</li>)}
                  {approvedPhotos.length === 0 && <li className="text-zinc-500">없음</li>}
                </ul>
              </div>
              <div>
                <div className="text-sm font-semibold text-warning">재보정 요청 ({revisionTargets.length}장)</div>
                <ul className="mt-2 space-y-2 text-sm text-zinc-300">
                  {revisionTargets.map((r) => (
                    <li key={r.id}>
                      <div>{r.filename}</div>
                      <div className="text-xs text-warning/90">코멘트: {r.comment ?? "-"}</div>
                    </li>
                  ))}
                  {revisionTargets.length === 0 && <li className="text-zinc-500">없음</li>}
                </ul>
              </div>
            </div>
            <div className="mt-4 flex justify-end">
              <Button variant="outline" onClick={() => setShowCommentsModal(false)}>닫기</Button>
            </div>
          </Card>
        </div>
      )}

      {showConfirmModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
          <Card className="w-full max-w-sm">
            <h3 className="text-lg font-semibold text-white">고객에게 전달</h3>
            <p className="mt-2 text-sm text-zinc-400">
              v2 보정본 {mappedCount}장을 고객에게 전달하시겠습니까?
              <br />전달 후 고객이 최종 검토를 진행합니다.
            </p>
            <div className="mt-6 flex gap-2">
              <Button variant="outline" className="flex-1" onClick={() => setShowConfirmModal(false)} disabled={submitting}>취소</Button>
              <Button variant="primary" className="flex-1" disabled={submitting || !canDeliver} onClick={handleDeliver}>
                {submitting ? <span className="inline-flex items-center gap-2"><Loader2 className="h-4 w-4 animate-spin" />처리 중...</span> : "전달"}
              </Button>
            </div>
          </Card>
        </div>
      )}
      <CompareViewerModal
        isOpen={compareOpen}
        onClose={() => setCompareOpen(false)}
        photos={comparePhotos}
        initialIndex={compareInitialIndex}
      />
    </div>
  );
}
