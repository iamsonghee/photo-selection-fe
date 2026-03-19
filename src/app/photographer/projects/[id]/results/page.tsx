"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { format } from "date-fns";
import { ko } from "date-fns/locale";
import { AlertTriangle } from "lucide-react";
import { Clipboard, Download } from "lucide-react";
import { Button, Card } from "@/components/ui";
import { getProjectById, getPhotosWithSelections } from "@/lib/db";
import type { Project, Photo, ColorTag } from "@/types";
import { ConfirmCancelButton } from "../ConfirmCancelButton";

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

export default function ResultsPage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;
  const [project, setProject] = useState<Project | null>(null);
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [photoStates, setPhotoStates] = useState<Record<string, { rating?: number; color?: ColorTag; comment?: string }>>({});
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showEditStartModal, setShowEditStartModal] = useState(false);
  const [editStartSubmitting, setEditStartSubmitting] = useState(false);

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
        selected.sort((a, b) => getDisplayFilename(a).localeCompare(getDisplayFilename(b), undefined, { sensitivity: "base" }));
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

  const handleCopyClipboard = async () => {
    try {
      const text = fileNames.join("\n");
      await navigator.clipboard.writeText(text);
      setToast("클립보드에 복사했습니다");
    } catch (e) {
      console.error(e);
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
      console.error(e);
      setError(e instanceof Error ? e.message : "상태 변경 실패");
    } finally {
      setEditStartSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <p className="text-zinc-400">로딩 중...</p>
      </div>
    );
  }
  if (!project) return null;

  return (
    <div className="mx-auto max-w-4xl space-y-8">
      <Card>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <p className="text-success font-medium">✅ 고객이 최종확정했습니다</p>
            {confirmedText && (
              <p className="mt-1 text-sm text-zinc-400">확정일시: {confirmedText}</p>
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            {project.status === "editing" && (
              <Link href={`/photographer/projects/${id}/upload-versions`}>
                <Button variant="primary" className="flex items-center gap-2">
                  <span aria-hidden>📤</span>
                  보정본 업로드
                </Button>
              </Link>
            )}
            {project.status === "confirmed" && (
              <Button
                variant="primary"
                className="flex items-center gap-2"
                onClick={() => setShowEditStartModal(true)}
              >
                <span aria-hidden>🎨</span>
                보정 시작
              </Button>
            )}
            {project.status === "confirmed" && (
              <ConfirmCancelButton
                projectId={id}
                onSuccess={() => {
                  setProject((prev) => (prev ? { ...prev, status: "selecting" } : prev));
                  router.push(`/photographer/projects/${id}`);
                }}
              />
            )}
          </div>
        </div>
      </Card>

      <Card>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <h3 className="text-lg font-medium text-white">선택된 사진 + 코멘트 ({photos.length}장)</h3>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" className="flex items-center gap-2" onClick={handleCopyClipboard}>
              <Clipboard className="h-4 w-4" />
              클립보드 복사
            </Button>
            <Button variant="outline" className="flex items-center gap-2" onClick={handleDownloadCsv}>
              <Download className="h-4 w-4" />
              CSV 다운로드
            </Button>
            <Button variant="outline" className="flex items-center gap-2" onClick={handleDownloadTxt}>
              <Download className="h-4 w-4" />
              TXT 다운로드
            </Button>
          </div>
        </div>

        {error && (
          <p className="mt-3 rounded-md bg-danger/10 px-3 py-2 text-sm text-danger">{error}</p>
        )}

        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[720px] border-separate border-spacing-0">
            <thead>
              <tr className="text-left text-xs text-zinc-500">
                <th className="px-3 py-2">썸네일</th>
                <th className="px-3 py-2">파일명</th>
                <th className="px-3 py-2">코멘트</th>
              </tr>
            </thead>
            <tbody className="text-sm">
              {photos.map((p) => {
                const filename = getDisplayFilename(p);
                const comment = (photoStates[p.id]?.comment ?? "").trim();
                return (
                  <tr key={p.id} className="border-t border-zinc-800/80">
                    <td className="px-3 py-2">
                      <div className="h-[60px] w-[60px] overflow-hidden rounded-lg bg-zinc-800">
                        <img src={p.url} alt="" className="h-full w-full object-cover" />
                      </div>
                    </td>
                    <td className="px-3 py-2 align-top">
                      <div className="max-w-[220px] truncate text-zinc-200" title={filename}>
                        {filename}
                      </div>
                    </td>
                    <td className="px-3 py-2 align-top">
                      <div className="max-w-[320px] whitespace-pre-wrap break-words text-zinc-300">
                        {comment || "-"}
                      </div>
                    </td>
                  </tr>
                );
              })}
              {photos.length === 0 && (
                <tr>
                  <td colSpan={3} className="px-3 py-6 text-center text-zinc-500">
                    선택된 사진이 없습니다.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>

      <Card className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="text-sm text-zinc-400">
          보정을 시작하면 고객의 갤러리가 잠깁니다
        </div>
        <div className="flex flex-wrap gap-2">
          {project.status === "editing" && (
            <Link href={`/photographer/projects/${id}/upload-versions`}>
              <Button variant="primary" className="flex items-center gap-2">
                <span aria-hidden>📤</span>
                보정본 업로드
              </Button>
            </Link>
          )}
          {project.status === "confirmed" && (
            <Button
              variant="primary"
              className="flex items-center gap-2"
              onClick={() => setShowEditStartModal(true)}
            >
              <span aria-hidden>🎨</span>
              보정 시작
            </Button>
          )}
        </div>
      </Card>

      {showEditStartModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
          <div className="w-full max-w-[440px] space-y-6 rounded-xl border border-zinc-700 bg-zinc-900 p-6 shadow-xl">
            <div className="flex items-center gap-2 rounded-lg border border-danger/50 bg-danger/10 px-4 py-3 text-danger">
              <AlertTriangle className="h-5 w-5 shrink-0" />
              <span className="font-semibold">🚨 보정 시작 전 반드시 확인하세요</span>
            </div>
            <ol className="list-decimal space-y-3 pl-5 text-sm text-zinc-300">
              <li>보정 시작 후 고객은 &quot;최종확정&quot;을 취소할 수 없습니다</li>
              <li>선택된 사진이 고정됩니다 (추가/삭제 불가)</li>
              <li>고객은 읽기 전용 모드로 전환됩니다</li>
            </ol>
            <div className="flex gap-3">
              <Button
                variant="outline"
                className="flex-1"
                onClick={() => setShowEditStartModal(false)}
                disabled={editStartSubmitting}
              >
                취소
              </Button>
              <Button
                variant="danger"
                className="flex-1"
                onClick={handleEditStartConfirm}
                disabled={editStartSubmitting}
              >
                {editStartSubmitting ? "처리 중..." : "보정 시작 확인"}
              </Button>
            </div>
          </div>
        </div>
      )}

      {toast && (
        <div
          className="fixed bottom-6 left-1/2 z-50 -translate-x-1/2 rounded-lg bg-zinc-800 px-4 py-2 text-sm font-medium text-white shadow-lg ring-1 ring-zinc-700"
          role="status"
        >
          {toast}
        </div>
      )}
    </div>
  );
}
