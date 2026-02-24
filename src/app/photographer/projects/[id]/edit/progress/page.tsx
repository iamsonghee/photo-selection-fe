import Link from "next/link";
import { Check, Download, Upload } from "lucide-react";
import { Button, Card, ProgressBar } from "@/components/ui";
import { mockProjects, getPhotosByProject } from "@/lib/mock-data";
import { addDays, format } from "date-fns";
import { EditProgressActions } from "./EditProgressActions";

export default async function EditProgressPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const project = mockProjects.find((p) => p.id === id);
  if (!project) return null;

  const photos = getPhotosByProject(id).filter((p) => p.selected);
  const completedCount = Math.floor(photos.length * 0.3);
  const nextPhoto = photos.find((p) => p.photographerMemo || p.comment);

  return (
    <div className="mx-auto max-w-2xl space-y-8">
      <h1 className="text-2xl font-semibold text-white">보정 진행도</h1>

      <Card>
        <h3 className="mb-3 text-base font-medium text-zinc-200">보정 진행 현황</h3>
        <p className="font-mono text-2xl text-white">
          완료 {completedCount}/{photos.length}장 (
          {Math.round((completedCount / photos.length) * 100)}%)
        </p>
        <ProgressBar
          value={completedCount}
          max={photos.length}
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
                별점 {nextPhoto.tag?.star ?? "-"} · {nextPhoto.tag?.color ?? "태그 없음"}
              </p>
              {nextPhoto.comment && (
                <p className="mt-1 text-sm text-zinc-300">고객: {nextPhoto.comment}</p>
              )}
              {nextPhoto.photographerMemo && (
                <p className="mt-1 text-sm text-primary">메모: {nextPhoto.photographerMemo}</p>
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
