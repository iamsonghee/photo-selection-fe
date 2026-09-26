import Link from "next/link";
import Image from "next/image";
import { redirect } from "next/navigation";
import { FolderPlus } from "lucide-react";
import { getCurrentCustomerAuthId } from "@/lib/customer-select-server";
import { getAdminClient } from "@/lib/supabase-admin";
import { CustomerSelectShell } from "./_lib/CustomerSelectShell";
import { customerProjectDestination, customerProjectStatus, type CustomerProjectSummary } from "./_lib/project-routing";
import { isProjectShootType, projectShootTypeLabel } from "@/lib/project-shoot-types";
import { CUSTOMER_PHOTO_LIMIT } from "./_lib/upload-limit";

export default async function CustomerSelectHomePage() {
  const ownerId = await getCurrentCustomerAuthId();
  if (!ownerId) redirect("/customer-select/login");

  const admin = getAdminClient();
  const { data, error } = await admin
    .from("customer_projects")
    .select("id, name, shoot_type, shoot_date, selection_deadline, studio_name, photographer_name, shoot_region, shoot_location, target_count, photo_count, exported, delivery_count, last_delivered_at, retouch_done, created_at")
    .eq("owner_id", ownerId)
    .order("created_at", { ascending: false });
  const projects = (data ?? []) as CustomerProjectSummary[];
  const accountPhotoCount = projects.reduce((sum, project) => sum + Math.max(0, project.photo_count), 0);
  const remainingPhotoCount = Math.max(0, CUSTOMER_PHOTO_LIMIT - accountPhotoCount);
  const projectIdsWithPhotos = projects.filter((project) => project.photo_count > 0).map((project) => project.id);
  const selectedCounts = await Promise.all(projects.map((project) => admin.from("customer_selections")
    .select("photo_id", { count: "exact", head: true }).eq("project_id", project.id).eq("is_selected", true)));
  const selectedByProject = new Map(projects.map((project, index) => [project.id, selectedCounts[index].error ? null : selectedCounts[index].count ?? 0]));
  const firstPhotoResults = await Promise.all(projectIdsWithPhotos.map((projectId) => admin
    .from("customer_photos")
    .select("project_id, thumb_url, preview_url")
    .eq("project_id", projectId)
    .order("order_index", { ascending: true })
    .limit(1)
    .maybeSingle()));
  const coverByProject = new Map<string, string>();
  for (const { data: photo } of firstPhotoResults) {
    if (photo && (photo.preview_url || photo.thumb_url)) coverByProject.set(photo.project_id, photo.preview_url ?? photo.thumb_url!);
  }

  return (
    <CustomerSelectShell>
      <main className="mx-auto w-full max-w-[1504px] px-5 py-8 md:px-8 md:py-10">
        <div className="lg:flex lg:items-start lg:justify-between lg:gap-10">
          <div>
            <h1 className="text-[26px] font-bold tracking-[-0.04em] md:text-[30px]">내 셀렉 프로젝트</h1>
            <p className="mt-2 text-[14px] text-muted-foreground">사진을 올리고 함께 고른 뒤, 선택한 결과를 작가에게 전달하세요.</p>
          </div>

          {!error ? (
            <section className="mt-5 rounded-2xl border border-border-subtle bg-surface px-4 py-3.5 shadow-[0_8px_24px_rgba(2,56,82,0.05)] lg:mt-0 lg:w-80 lg:shrink-0" aria-label="전체 사진 이용량">
              <div className="flex items-center justify-between gap-4">
                <div className="min-w-0">
                  <p className="text-[12px] font-bold text-foreground">전체 사진 이용량</p>
                  <p className="mt-0.5 text-[10px] font-medium text-muted-foreground">모든 프로젝트 합산</p>
                  <p className="mt-1 text-[20px] font-bold tracking-[-0.03em] text-foreground">{accountPhotoCount.toLocaleString()} <span className="text-[13px] font-semibold text-muted-foreground">/ {CUSTOMER_PHOTO_LIMIT.toLocaleString()}장</span></p>
                </div>
                <p className="shrink-0 text-[12px] font-semibold text-accent">{remainingPhotoCount.toLocaleString()}장 남음</p>
              </div>
              <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-surface-raised" role="progressbar" aria-label="전체 사진 이용량" aria-valuemin={0} aria-valuemax={CUSTOMER_PHOTO_LIMIT} aria-valuenow={Math.min(accountPhotoCount, CUSTOMER_PHOTO_LIMIT)}>
                <div className="h-full min-w-1 rounded-full bg-accent transition-[width]" style={{ width: `${Math.min(100, accountPhotoCount / CUSTOMER_PHOTO_LIMIT * 100)}%` }} />
              </div>
            </section>
          ) : null}
        </div>

        {error ? (
          <div className="mt-8 rounded-xl border border-danger/20 bg-surface p-6 text-[14px] text-danger">프로젝트를 불러오지 못했어요. 잠시 후 다시 시도해 주세요.</div>
        ) : projects.length === 0 ? (
          <section className="mt-10 flex min-h-[520px] items-center justify-center rounded-2xl border border-border-subtle bg-surface px-6 py-14">
            <div className="flex max-w-[620px] flex-col items-center text-center">
              <div className="grid size-16 place-items-center rounded-2xl bg-surface-raised text-accent"><FolderPlus size={29} strokeWidth={1.8} /></div>
              <h2 className="mt-6 text-[24px] font-bold tracking-[-0.04em]">첫 프로젝트를 만들어보세요</h2>
              <p className="mt-3 text-[14px] leading-6 text-muted-foreground">촬영본을 올리고 함께 고른 뒤, 파일명과 보정 요청을 작가에게 전달할 수 있어요.</p>
              <Link href="/customer-select/new" className="mt-7 rounded-full bg-accent px-6 py-3.5 text-[15px] font-bold text-white hover:bg-[var(--accent-hover)]">사진 선택 시작하기</Link>
            </div>
          </section>
        ) : (
          <section className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3" aria-label="프로젝트 목록">
            {projects.map((project) => {
              const coverUrl = coverByProject.get(project.id);
              const selectedCount = selectedByProject.get(project.id);
              const projectMeta = [
                isProjectShootType(project.shoot_type) ? projectShootTypeLabel(project.shoot_type) : null,
                project.shoot_date?.replaceAll("-", "."),
                project.studio_name,
              ].filter(Boolean).join(" · ");
              return (
              <article key={project.id} className="group relative overflow-hidden rounded-2xl border border-border-subtle bg-surface transition-[transform,box-shadow] hover:-translate-y-0.5 hover:shadow-[0_12px_32px_rgba(2,56,82,0.08)] focus-within:ring-2 focus-within:ring-accent/25">
              <Link href={`/customer-select/${project.id}`} className="block focus-visible:outline-none" aria-label={`${project.name} 프로젝트 현황`}>
                <div className="relative grid aspect-[4/3] place-items-center overflow-hidden bg-surface-raised">
                  {coverUrl
                    ? <Image src={coverUrl} alt="" fill unoptimized sizes="(min-width: 1280px) 33vw, (min-width: 640px) 50vw, 100vw" className="object-cover object-center" />
                    : <Image src="/brand/a-cut-mark.svg" alt="" width={64} height={64} className="rounded-xl" />}
                </div>
                <div className="px-5 pb-4 pt-4">
                  <div className="flex items-center justify-between gap-3">
                    <strong className="min-w-0 truncate text-[17px] font-bold">{project.name}</strong>
                    <span className="shrink-0 rounded-full bg-customer-soft px-2.5 py-1.5 text-[12px] font-bold text-primary">{customerProjectStatus(project)}</span>
                  </div>
                  {projectMeta ? <p className="mt-2 truncate text-[13px] text-muted-foreground">{projectMeta}</p> : null}
                  <p className="mt-3 text-[13px] text-muted-foreground">
                    <span className="font-semibold text-foreground">사진 {project.photo_count.toLocaleString()}장</span>
                    <span aria-hidden="true"> · </span>
                    {typeof selectedCount === "number" ? `선택 ${selectedCount.toLocaleString()}장` : "선택 수 확인 불가"}
                    <span aria-hidden="true"> · </span>
                    보정 목표 {project.target_count.toLocaleString()}장
                  </p>
                </div>
              </Link>
              <div className="flex justify-end border-t border-border-subtle px-4 py-2.5">
                <Link href={customerProjectDestination(project)} className="inline-flex min-h-9 items-center rounded-lg bg-accent px-3.5 text-[13px] font-bold text-white transition-colors hover:bg-[var(--accent-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/35">{project.retouch_done ? "완료 내용 보기" : project.exported ? "전달 내용 보기" : project.photo_count ? "이어서 고르기" : "사진 올리기"} →</Link>
              </div>
              </article>
              );
            })}
          </section>
        )}
      </main>
    </CustomerSelectShell>
  );
}
