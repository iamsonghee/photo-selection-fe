import Link from "next/link";
import { notFound } from "next/navigation";
import { loadSceneReview } from "@/lib/admin-scene-review";
import { customerShootTypeLabel } from "@/lib/customer-shoot-scenes";
import { SceneLabeler } from "./SceneLabeler";
import { AdminAiTidyButton } from "./AdminAiTidyButton";
import { AdminSceneDownloadButton } from "./AdminSceneDownloadButton";

export const dynamic = "force-dynamic";

export default async function AdminSceneReviewPage({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  const review = await loadSceneReview(projectId);
  if (!review) notFound();

  return (
    <div>
      <Link href="/admin/scenes" className="text-sm text-muted-foreground hover:text-foreground">← Scene Review</Link>
      <h1 className="mt-2 text-2xl font-semibold text-foreground">{review.project.name || "이름 없음"}</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        {customerShootTypeLabel(review.project.shootType)} · 사진 {review.photos.length.toLocaleString()}장 · AI 장면 {review.aiScenes?.length ?? "없음"}
        {review.label ? ` · 마지막 검수 ${review.label.labeled_by}` : ""}
      </p>
      <div className="flex flex-wrap items-center gap-x-3">
        <AdminAiTidyButton projectId={review.project.id} photoCount={review.photos.length} />
        <AdminSceneDownloadButton photos={review.photos} />
      </div>
      {review.labelTableMissing && (
        <p className="mt-4 rounded-lg border border-danger/40 bg-danger/10 px-4 py-3 text-sm text-danger">
          정답 테이블이 없어 저장할 수 없어요. <code>supabase/migrations/20261002000000_add_customer_scene_labels.sql</code>을 먼저 실행해 주세요.
        </p>
      )}
      <SceneLabeler
        projectId={review.project.id}
        photos={review.photos}
        aiScenes={review.aiScenes}
        initialLabel={review.label ? { scenes: review.label.scenes, note: review.label.note } : null}
        catalog={review.catalog}
      />
    </div>
  );
}
