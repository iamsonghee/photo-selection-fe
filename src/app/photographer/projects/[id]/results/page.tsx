"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { format } from "date-fns";
import { ko } from "date-fns/locale";
import { Download, Edit3 } from "lucide-react";
import { Button, Card } from "@/components/ui";
import { getProjectById, getPhotosWithSelections } from "@/lib/db";
import type { Project, Photo, StarRating, ColorTag } from "@/types";
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

export default function ResultsPage() {
  const params = useParams();
  const id = params.id as string;
  const [project, setProject] = useState<Project | null>(null);
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [photoStates, setPhotoStates] = useState<Record<string, { rating?: number; color?: ColorTag; comment?: string }>>({});
  const [loading, setLoading] = useState(true);

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
        selected.sort((a, b) => a.orderIndex - b.orderIndex);
        setPhotos(selected);
        setPhotoStates(result.photoStates ?? {});
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [id]);

  const starCounts = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 } as Record<StarRating, number>;
  const colorCounts = { red: 0, yellow: 0, green: 0, blue: 0, purple: 0 } as Record<ColorTag, number>;
  photos.forEach((p) => {
    const state = photoStates[p.id];
    const star = (state?.rating ?? p.tag?.star) as StarRating | undefined;
    const color = state?.color ?? p.tag?.color;
    if (star && star >= 1 && star <= 5) starCounts[star]++;
    if (color) colorCounts[color]++;
  });
  const total = photos.length;
  const commentsWithPhoto = photos
    .filter((p) => photoStates[p.id]?.comment)
    .map((p) => ({ photoId: p.id, orderIndex: p.orderIndex, text: photoStates[p.id]!.comment! }));

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
        <ul className="space-y-3">
          {commentsWithPhoto.slice(0, 10).map((c) => (
            <li key={c.photoId} className="rounded-lg border border-zinc-800 p-3">
              <p className="font-mono text-xs text-zinc-500">사진 #{c.orderIndex}</p>
              <p className="text-sm text-zinc-300">{c.text}</p>
            </li>
          ))}
        </ul>
        {commentsWithPhoto.length === 0 && (
          <p className="text-sm text-zinc-500">코멘트가 없습니다.</p>
        )}
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
