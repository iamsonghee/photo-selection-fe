"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { Check } from "lucide-react";
import { Button, Card, ProgressBar } from "@/components/ui";
import { getProjectById, getPhotosWithSelections } from "@/lib/db";
import { addDays, format } from "date-fns";
import type { Project, Photo } from "@/types";
import { EditProgressActions } from "./EditProgressActions";

export default function EditProgressPage() {
  const params = useParams();
  const id = params.id as string;
  const [project, setProject] = useState<Project | null>(null);
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [photoStates, setPhotoStates] = useState<Record<string, { rating?: number; color?: string; comment?: string }>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getProjectById(id)
      .then((p) => {
        setProject(p);
        if (!p?.id) return;
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

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <p className="text-zinc-400">로딩 중...</p>
      </div>
    );
  }
  if (!project) return null;

  const completedCount = Math.floor(photos.length * 0.3);
  const nextPhoto = photos.find((p) => photoStates[p.id]?.comment);

  return (
    <div className="mx-auto max-w-2xl space-y-8">
      <h1 className="text-2xl font-semibold text-white">보정 진행도</h1>

      <Card>
        <h3 className="mb-3 text-base font-medium text-zinc-200">보정 진행 현황</h3>
        <p className="font-mono text-2xl text-white">
          완료 {completedCount}/{photos.length}장 (
          {photos.length ? Math.round((completedCount / photos.length) * 100) : 0}%)
        </p>
        <ProgressBar
          value={completedCount}
          max={photos.length || 1}
          variant="success"
          className="mt-3"
          showLabel
        />
        <p className="mt-2 text-sm text-zinc-400">
          예상 완료일: {format(addDays(new Date(), 14), "yyyy-MM-dd")}
        </p>
      </Card>

      {nextPhoto && (
        <Card>
          <h3 className="mb-4 text-base font-medium text-zinc-200">다음 보정 사진</h3>
          <div className="flex gap-4">
            <div className="aspect-square w-32 shrink-0 overflow-hidden rounded-lg bg-zinc-800">
              <img src={nextPhoto.url} alt="" className="h-full w-full object-cover" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm text-zinc-400">
                별점 {photoStates[nextPhoto.id]?.rating ?? nextPhoto.tag?.star ?? "-"} ·{" "}
                {photoStates[nextPhoto.id]?.color ?? nextPhoto.tag?.color ?? "태그 없음"}
              </p>
              {(photoStates[nextPhoto.id]?.comment || nextPhoto.comment) && (
                <p className="mt-1 text-sm text-zinc-300">
                  고객: {photoStates[nextPhoto.id]?.comment ?? nextPhoto.comment}
                </p>
              )}
              <div className="mt-4 flex gap-2">
                <Button variant="primary" size="sm" className="flex items-center gap-1">
                  <Check className="h-4 w-4" />
                  ✅ 보정 완료
                </Button>
                <Button variant="outline" size="sm" className="flex items-center gap-1">
                  다음 사진 →
                </Button>
              </div>
            </div>
          </div>
        </Card>
      )}

      <Card>
        <h3 className="mb-4 text-base font-medium text-zinc-200">결과 내보내기</h3>
        <div className="space-y-2">
          <EditProgressActions />
        </div>
      </Card>
    </div>
  );
}
