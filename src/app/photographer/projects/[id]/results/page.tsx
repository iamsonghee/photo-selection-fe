import Link from "next/link";
import { format } from "date-fns";
import { ko } from "date-fns/locale";
import { Download, Edit3 } from "lucide-react";
import { Button, Card } from "@/components/ui";
import { mockProjects, getPhotosByProject, getCommentsByProject } from "@/lib/mock-data";
import type { StarRating, ColorTag } from "@/types";
import { ConfirmCancelButton } from "../ConfirmCancelButton";
import { ResultsActions } from "./ResultsActions";

const starLabels: Record<StarRating, string> = { 1: "⭐1", 2: "⭐2", 3: "⭐3", 4: "⭐4", 5: "⭐5" };
const colorLabels: Record<ColorTag, string> = {
  red: "🔴",
  yellow: "🟡",
  green: "🟢",
  blue: "🔵",
  purple: "🟣",
};

export default async function ResultsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const project = mockProjects.find((p) => p.id === id);
  if (!project) return null;

  const photos = getPhotosByProject(id).filter((p) => p.selected);
  const comments = getCommentsByProject(id);
  const starCounts = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 } as Record<StarRating, number>;
  const colorCounts = { red: 0, yellow: 0, green: 0, blue: 0, purple: 0 } as Record<ColorTag, number>;
  photos.forEach((p) => {
    if (p.tag?.star) starCounts[p.tag.star]++;
    if (p.tag?.color) colorCounts[p.tag.color]++;
  });
  const total = photos.length;

  return (
    <div className="mx-auto max-w-4xl space-y-8">
      <div className="rounded-lg border border-success/30 bg-success/10 px-4 py-3 text-success">
        ✅ 고객이 최종확정했습니다! —{" "}
        {project.confirmedAt &&
          format(new Date(project.confirmedAt), "yyyy-MM-dd HH:mm", { locale: ko })}
      </div>

      <div className="flex flex-wrap gap-4">
        <Link href={`/photographer/projects/${id}/edit/start`}>
          <Button variant="primary" className="flex items-center gap-2">
            <Edit3 className="h-4 w-4" />
            보정 시작
          </Button>
        </Link>
        <ResultsActions />
        <ConfirmCancelButton projectId={id} />
      </div>

      <Card>
        <h3 className="mb-4 text-lg font-medium text-white">선택된 사진 ({photos.length}장)</h3>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {photos.slice(0, 16).map((p) => (
            <div key={p.id} className="aspect-square overflow-hidden rounded-lg bg-zinc-800">
              <img src={p.url} alt="" className="h-full w-full object-cover" />
              <p className="p-1 text-center text-xs font-mono text-zinc-400">{p.orderIndex}</p>
            </div>
          ))}
        </div>
        {photos.length > 16 && (
          <p className="mt-2 text-sm text-zinc-500">외 {photos.length - 16}장</p>
        )}
      </Card>

      <Card>
        <h3 className="mb-4 text-lg font-medium text-white">태그 분포</h3>
        <div className="mb-6">
          <p className="mb-2 text-sm text-zinc-400">별점</p>
          <div className="space-y-2">
            {([1, 2, 3, 4, 5] as const).map((s) => (
              <div key={s} className="flex items-center gap-3">
                <span className="w-12 text-sm">{starLabels[s]}</span>
                <div className="h-4 flex-1 overflow-hidden rounded bg-zinc-800">
                  <div
                    className="h-full bg-primary"
                    style={{ width: `${total ? (starCounts[s] / total) * 100 : 0}%` }}
                  />
                </div>
                <span className="w-16 text-right font-mono text-sm text-zinc-400">
                  {starCounts[s]}장 ({total ? Math.round((starCounts[s] / total) * 100) : 0}%)
                </span>
              </div>
            ))}
          </div>
        </div>
        <div>
          <p className="mb-2 text-sm text-zinc-400">색상</p>
          <div className="flex flex-wrap gap-4">
            {(["red", "yellow", "green", "blue", "purple"] as const).map((c) => (
              <span key={c} className="text-sm">
                {colorLabels[c]} {colorCounts[c]}장 (
                {total ? Math.round((colorCounts[c] / total) * 100) : 0}%)
              </span>
            ))}
          </div>
        </div>
      </Card>

      <Card>
        <h3 className="mb-4 text-lg font-medium text-white">고객 코멘트</h3>
        <div className="mb-4 flex gap-2">
          {(["all", "retouch", "feedback", "question"] as const).map((tab) => (
            <button
              key={tab}
              className="rounded-lg bg-zinc-800 px-3 py-1.5 text-sm font-medium text-zinc-300"
            >
              {tab === "all"
                ? "모두"
                : tab === "retouch"
                  ? "보정요청"
                  : tab === "feedback"
                    ? "피드백"
                    : "질문"}
            </button>
          ))}
        </div>
        <ul className="space-y-3">
          {comments.slice(0, 5).map((c) => {
            const photo = photos.find((p) => p.id === c.photoId);
            return (
              <li key={c.id} className="rounded-lg border border-zinc-800 p-3">
                <p className="font-mono text-xs text-zinc-500">사진 #{photo?.orderIndex}</p>
                <p className="text-sm text-zinc-300">{c.text}</p>
              </li>
            );
          })}
        </ul>
      </Card>

      <Card>
        <h3 className="mb-4 text-lg font-medium text-white">작가 메모</h3>
        <p className="text-sm text-zinc-500">사진별 메모 입력 (예: Lightroom 밝기+2)</p>
        <div className="mt-3 flex gap-2">
          <input
            type="text"
            placeholder="메모 입력"
            className="flex-1 rounded-lg border border-zinc-700 bg-zinc-800 px-4 py-2 text-sm text-zinc-100 placeholder:text-zinc-500"
          />
          <Button variant="secondary" size="sm">
            저장
          </Button>
        </div>
      </Card>
    </div>
  );
}
