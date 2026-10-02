import Link from "next/link";
import { loadSceneReviewList } from "@/lib/admin-scene-review";
import { formatAdminDate } from "@/lib/admin-format";
import { customerShootTypeLabel } from "@/lib/customer-shoot-scenes";
import { scoreScenes } from "@/lib/scene-label-score";

export const dynamic = "force-dynamic";

const pct = (value: number) => `${Math.round(value * 100)}%`;

/** 셀프 고객 장면 검수: 운영자가 AI 장면을 보고 정답을 남기고, AI가 얼마나 맞혔는지 본다. */
export default async function AdminScenesPage() {
  const { projects, labelTableMissing } = await loadSceneReviewList();
  const rows = projects.map((project) => ({
    ...project,
    score: project.label?.ai_scenes ? scoreScenes(project.label.scenes, project.label.ai_scenes) : null,
  }));
  // 촬영 종류별 평균(검수했고 AI 장면이 있던 프로젝트만)
  const byType = new Map<string, NonNullable<(typeof rows)[number]["score"]>[]>();
  rows.forEach((row) => { if (row.score) byType.set(row.shootType ?? "", [...(byType.get(row.shootType ?? "") ?? []), row.score]); });
  const avg = (scores: NonNullable<(typeof rows)[number]["score"]>[], key: "boundaryPrecision" | "boundaryRecall" | "nameAccuracy") => scores.reduce((sum, score) => sum + score[key], 0) / scores.length;

  return (
    <div>
      <h1 className="text-2xl font-semibold text-foreground">Scene Review</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        셀프 고객 프로젝트의 AI 장면을 보고 정답(경계·이름)을 남깁니다. 서비스 화면의 장면은 바뀌지 않아요.
      </p>
      {labelTableMissing && (
        <p className="mt-4 rounded-lg border border-danger/40 bg-danger/10 px-4 py-3 text-sm text-danger">
          정답 테이블이 없습니다. Supabase SQL Editor에서 <code>supabase/migrations/20261002000000_add_customer_scene_labels.sql</code>을 실행해 주세요.
        </p>
      )}

      {byType.size > 0 && (
        <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {[...byType.entries()].map(([type, scores]) => (
            <div key={type} className="rounded-xl border border-border bg-surface p-4 text-sm">
              <div className="font-medium text-foreground">{customerShootTypeLabel(type || null)} <span className="text-muted-foreground">· 검수 {scores.length}건</span></div>
              <div className="mt-2 text-muted-foreground">경계 정밀도 {pct(avg(scores, "boundaryPrecision"))} · 재현율 {pct(avg(scores, "boundaryRecall"))} · 이름 {pct(avg(scores, "nameAccuracy"))}</div>
            </div>
          ))}
        </div>
      )}

      <div className="mt-6 overflow-x-auto rounded-xl border border-border">
        <table className="w-full min-w-[820px] border-collapse text-sm">
          <thead>
            <tr className="border-b border-border bg-surface-raised text-left text-xs uppercase tracking-wide text-muted-foreground">
              <th className="px-4 py-3 font-medium">프로젝트</th>
              <th className="px-4 py-3 font-medium">촬영 종류</th>
              <th className="px-4 py-3 font-medium">사진 / AI 장면</th>
              <th className="px-4 py-3 font-medium">검수</th>
              <th className="px-4 py-3 font-medium">경계 정밀도 / 재현율</th>
              <th className="px-4 py-3 font-medium">이름</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id} className="border-b border-border last:border-b-0 hover:bg-surface-raised">
                <td className="px-4 py-3">
                  <Link href={`/admin/scenes/${row.id}`} className="font-medium text-foreground hover:text-primary">{row.name || "이름 없음"}</Link>
                  <div className="mt-0.5 text-xs text-muted-foreground">{formatAdminDate(row.createdAt)}</div>
                </td>
                <td className="px-4 py-3 text-muted-foreground">{customerShootTypeLabel(row.shootType)}</td>
                <td className="px-4 py-3 text-muted-foreground">{row.photoCount.toLocaleString()} / {row.aiSceneCount || "—"}</td>
                <td className="px-4 py-3 text-muted-foreground">{row.label ? <>완료 <span className="text-xs">({formatAdminDate(row.label.updated_at)})</span></> : "—"}</td>
                <td className="px-4 py-3 text-muted-foreground">{row.score ? `${pct(row.score.boundaryPrecision)} / ${pct(row.score.boundaryRecall)}` : "—"}</td>
                <td className="px-4 py-3 text-muted-foreground">{row.score ? pct(row.score.nameAccuracy) : "—"}</td>
              </tr>
            ))}
            {!rows.length && <tr><td colSpan={6} className="px-4 py-10 text-center text-muted-foreground">사진을 올린 셀프 고객 프로젝트가 없어요.</td></tr>}
          </tbody>
        </table>
      </div>
      <p className="mt-3 text-xs text-muted-foreground">경계는 ±3장 안이면 맞은 것으로 칩니다. 정밀도 = AI가 나눈 경계 중 맞은 비율, 재현율 = 정답 경계 중 AI가 찾은 비율, 이름 = 사진마다 AI 장면 이름이 정답과 같은 비율.</p>
    </div>
  );
}
