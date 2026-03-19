"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { AlertTriangle } from "lucide-react";
import { Button, Card } from "@/components/ui";
import { getProjectById } from "@/lib/db";
import { getStatusLabel } from "@/lib/project-status";
import type { Project } from "@/types";

export default function EditStartPage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;
  const [project, setProject] = useState<Project | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    getProjectById(id)
      .then((p) => {
        setProject(p);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [id]);

  const handleStartEditing = async () => {
    if (!project || project.status !== "confirmed") return;
    setSubmitting(true);
    try {
      const res = await fetch(`/api/photographer/projects/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "editing" }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error((data as { error?: string }).error ?? "상태 변경 실패");
      }
      await fetch("/api/photographer/project-logs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ project_id: id, action: "editing" }),
      }).catch(() => {});
      router.push(`/photographer/projects/${id}/edit/progress`);
    } catch (e) {
      console.error(e);
    } finally {
      setSubmitting(false);
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

  const canStartEditing = project.status === "confirmed";

  return (
    <div className="mx-auto max-w-[440px] space-y-8">
      {!canStartEditing && (
        <div className="rounded-lg border border-amber-500/50 bg-amber-500/10 px-4 py-3 text-amber-400 text-sm">
          보정을 시작하려면 프로젝트가 &quot;셀렉 완료&quot; 상태여야 합니다. (현재: {getStatusLabel(project.status)})
        </div>
      )}
      <div className="flex items-center gap-2 rounded-lg border border-danger/50 bg-danger/10 px-4 py-3 text-danger">
        <AlertTriangle className="h-5 w-5 shrink-0" />
        <span className="font-semibold">🚨 보정 시작 전 반드시 확인하세요</span>
      </div>

      <Card>
        <ol className="list-decimal space-y-3 pl-5 text-sm text-zinc-300">
          <li>보정 시작 후 고객은 &quot;최종확정&quot;을 취소할 수 없습니다</li>
          <li>선택된 사진이 고정됩니다 (추가/삭제 불가)</li>
          <li>고객은 읽기 전용 모드로 전환됩니다</li>
        </ol>
      </Card>

      <div className="flex gap-3">
        <Link href={`/photographer/projects/${id}/results`} className="flex-1">
          <Button variant="outline" fullWidth>
            취소
          </Button>
        </Link>
        <Button
          variant="danger"
          fullWidth
          className="flex-1"
          onClick={handleStartEditing}
          disabled={submitting || !canStartEditing}
        >
          {submitting ? "처리 중..." : "보정 시작 확인"}
        </Button>
      </div>
    </div>
  );
}
