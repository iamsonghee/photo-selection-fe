import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getCurrentCustomerAuthId } from "@/lib/customer-select-server";
import { getAdminClient } from "@/lib/supabase-admin";
import { CustomerSelectShell } from "../_lib/CustomerSelectShell";
import { PhotographerPageActionBar } from "@/components/photographer/PhotographerFormActionBar";
import { CUSTOMER_PHOTO_LIMIT } from "../_lib/upload-limit";
import { customerProjectDestination, customerProjectStatus, type CustomerProjectSummary } from "../_lib/project-routing";
import { projectShootTypeLabel } from "@/lib/project-shoot-types";

export default async function CustomerProjectOverview({ params }: { params: Promise<{ projectId: string }> }) {
  const ownerId = await getCurrentCustomerAuthId();
  if (!ownerId) redirect("/customer-select/login");
  const { projectId } = await params;
  const admin = getAdminClient();
  const { data, error } = await admin.from("customer_projects")
    .select("id, name, shoot_type, shoot_date, selection_deadline, studio_name, photographer_name, shoot_region, shoot_location, target_count, photo_count, sharing_enabled, exported, retouch_done, created_at")
    .eq("id", projectId).eq("owner_id", ownerId).maybeSingle();
  if (error) throw new Error("프로젝트 현황을 불러오지 못했어요.");
  if (!data) notFound();
  const project = data as CustomerProjectSummary;
  const { count, error: selectionError } = await admin.from("customer_selections")
    .select("photo_id", { count: "exact", head: true }).eq("project_id", projectId).eq("is_selected", true);
  const action = project.retouch_done ? "완료 내용 보기" : project.exported ? "보정본 검토 이어가기" : project.photo_count ? "이어서 고르기" : "사진 올리기";
  const info = [["촬영 종류", projectShootTypeLabel(project.shoot_type)], ["촬영일", project.shoot_date], ["선택 마감일", project.selection_deadline], ["스튜디오·업체", project.studio_name], ["담당 작가", project.photographer_name], ["촬영 지역", project.shoot_region], ["촬영 장소", project.shoot_location]];

  return <CustomerSelectShell>
    <main className="mx-auto w-full max-w-[1120px] flex-1 px-5 py-8 md:px-8 md:py-10">
      <Link href="/customer-select" className="text-sm text-muted-foreground">← 내 프로젝트</Link>
      <div className="mt-5 flex items-start justify-between gap-4">
        <h1 className="min-w-0 break-words text-2xl font-bold md:text-3xl">{project.name}</h1>
        <Link href={`/customer-select/${projectId}/settings`} className="shrink-0 rounded-lg border border-border-subtle bg-surface px-4 py-3 text-sm font-semibold">설정</Link>
      </div>
      <section className="mt-6 rounded-2xl border border-border-subtle bg-surface p-6 md:p-8" aria-label="프로젝트 진행 현황">
        <p className="font-semibold text-accent">{customerProjectStatus(project)}</p>
        <p className="mt-3 text-xl font-bold">{project.photo_count.toLocaleString()}장 중 {selectionError ? "선택 수 확인 불가" : `${(count ?? 0).toLocaleString()}장 선택`}</p>
        <p className="mt-2 text-sm text-muted-foreground">작가님과 약속한 보정 장수 {project.target_count}장 · 선택 장수가 달라도 전달할 수 있어요.</p>
        <p className="mt-4 text-sm text-muted-foreground">업로드 {project.photo_count.toLocaleString()} / {CUSTOMER_PHOTO_LIMIT.toLocaleString()}장 · {Math.max(0, CUSTOMER_PHOTO_LIMIT - project.photo_count).toLocaleString()}장 추가 가능</p>
      </section>
      <div className="mt-5 flex flex-wrap gap-3">
        <Link href={`/customer-select/${projectId}/upload`} className="rounded-xl border border-border-subtle bg-surface px-5 py-3 text-sm font-semibold">사진 관리</Link>
        {project.photo_count > 0 && <Link href={`/customer-select/${projectId}/select`} className="rounded-xl border border-border-subtle bg-surface px-5 py-3 text-sm font-semibold">사진 고르기</Link>}
        <Link href={`/customer-select/${projectId}/settings#sharing`} className="rounded-xl border border-border-subtle bg-surface px-5 py-3 text-sm font-semibold">초대 링크 {data.sharing_enabled ? "관리" : "만들기"}</Link>
        {project.exported && <Link href={`/customer-select/${projectId}/export`} className="rounded-xl border border-border-subtle bg-surface px-5 py-3 text-sm font-semibold">현재 전달 내용</Link>}
      </div>
      <dl className="mt-8 grid gap-5 text-sm sm:grid-cols-2 lg:grid-cols-4">
        {info.map(([label, value]) => <div key={label}><dt className="text-muted-foreground">{label}</dt><dd className="mt-1 break-words font-semibold">{value || "미입력"}</dd></div>)}
      </dl>
    </main>
    <PhotographerPageActionBar maxWidth={1120} mobileFixed actions={<Link href={customerProjectDestination(project)} className="block w-full rounded-xl bg-accent px-6 py-3.5 text-center font-bold text-white sm:w-auto">{action}</Link>} />
  </CustomerSelectShell>;
}
