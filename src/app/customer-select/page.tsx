import Link from "next/link";
import Image from "next/image";
import { redirect } from "next/navigation";
import { FolderPlus } from "lucide-react";
import { getCurrentCustomerAuthId } from "@/lib/customer-select-server";
import { getAdminClient } from "@/lib/supabase-admin";
import { CustomerSelectShell } from "./_lib/CustomerSelectShell";
import { customerProjectAction, customerProjectDestination, customerProjectStatus, filterCustomerProjects, type CustomerProjectFilter, type CustomerProjectSummary } from "./_lib/project-routing";
import { isProjectShootType, projectShootTypeLabel } from "@/lib/project-shoot-types";
import { CUSTOMER_PHOTO_LIMIT } from "./_lib/upload-limit";

export default async function CustomerSelectHomePage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const ownerId = await getCurrentCustomerAuthId();
  if (!ownerId) redirect("/customer-select/login");
  const params = await searchParams;

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
  const filtersEnabled = projects.length >= 8;
  const query = filtersEnabled && typeof params.q === "string" ? params.q : "";
  const statusFilter: CustomerProjectFilter = filtersEnabled && typeof params.status === "string" && ["active", "delivered", "done"].includes(params.status)
    ? params.status as CustomerProjectFilter : "all";
  const filteredProjects = filterCustomerProjects(projects, query, statusFilter);
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
    <CustomerSelectShell navigation={!error && projects.length > 0}>
      <main className="mx-auto w-full max-w-[1504px] px-5 py-8 md:px-8 md:py-10">
        <div className="lg:flex lg:items-center lg:justify-between lg:gap-10">
          <div className="flex items-center gap-3">
            <h1 className="text-[26px] font-bold tracking-[-0.04em] md:text-[30px]">내 프로젝트</h1>
            <span className="text-[15px] font-semibold text-muted-foreground" aria-label={`${projects.length.toLocaleString()}개 프로젝트`}>{projects.length.toLocaleString()}</span>
          </div>

          {!error ? (
            <section className="mt-5 rounded-2xl border border-border-subtle bg-surface px-4 py-3 shadow-[0_8px_24px_rgba(2,56,82,0.05)] lg:mt-0 lg:w-80 lg:shrink-0" aria-label="전체 사진 이용량">
              <div className="flex items-center justify-between gap-4">
                <div className="min-w-0">
                  <p className="text-[11px] font-semibold text-muted-foreground">전체 사진 · 모든 프로젝트 합산</p>
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
          <>
          {filtersEnabled ? <form className="mt-6 flex flex-col gap-2 rounded-xl border border-border-subtle bg-surface p-3 sm:flex-row" action="/customer-select">
            <label className="min-w-0 flex-1">
              <span className="sr-only">프로젝트 검색</span>
              <input name="q" defaultValue={query} placeholder="프로젝트명, 업체, 작가 검색" className="h-10 w-full rounded-lg border border-border-subtle bg-background px-3 text-sm outline-none focus:border-accent" />
            </label>
            <label>
              <span className="sr-only">진행 상태</span>
              <select name="status" defaultValue={statusFilter} className="h-10 w-full rounded-lg border border-border-subtle bg-background px-3 text-sm outline-none focus:border-accent sm:w-32">
                <option value="all">전체 상태</option>
                <option value="active">진행 중</option>
                <option value="delivered">전달 완료</option>
                <option value="done">보정 완료</option>
              </select>
            </label>
            <button type="submit" className="h-10 rounded-lg border border-border-subtle px-4 text-sm font-semibold hover:border-border-strong">찾기</button>
            {query || statusFilter !== "all" ? <Link href="/customer-select" className="grid h-10 place-items-center px-2 text-sm text-muted-foreground">초기화</Link> : null}
          </form> : null}
          {filteredProjects.length > 0 ? <section className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3" aria-label="프로젝트 목록">
            {filteredProjects.map((project) => {
              const coverUrl = coverByProject.get(project.id);
              const selectedCount = selectedByProject.get(project.id);
              const status = customerProjectStatus(project, selectedCount);
              const projectMeta = [
                isProjectShootType(project.shoot_type) ? projectShootTypeLabel(project.shoot_type) : null,
                project.shoot_date?.replaceAll("-", "."),
                project.studio_name,
              ].filter(Boolean).join(" · ");
              return (
              <article key={project.id} className="group relative overflow-hidden rounded-2xl border border-border-subtle bg-surface transition-[transform,box-shadow] hover:-translate-y-0.5 hover:shadow-[0_12px_32px_rgba(2,56,82,0.08)]">
              <Link href={`/customer-select/${project.id}`} className="block focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent/35" aria-label={`${project.name} 프로젝트 현황`}>
                <div className="relative grid aspect-[4/3] place-items-center overflow-hidden bg-surface-raised">
                  {coverUrl
                    ? <Image src={coverUrl} alt="" fill unoptimized sizes="(min-width: 1280px) 33vw, (min-width: 640px) 50vw, 100vw" className="object-cover object-center" />
                    : <Image src="/brand/a-cut-mark.svg" alt="" width={64} height={64} className="rounded-xl" />}
                </div>
                <div className="px-5 pb-2 pt-4">
                  <div className="flex items-center justify-between gap-3">
                    <strong className="min-w-0 truncate text-[17px] font-bold">{project.name}</strong>
                    <span className="flex shrink-0 items-center gap-1.5 text-[12px] font-bold text-primary"><span className={`size-1.5 rounded-full ${project.photo_count === 0 ? "bg-muted-foreground" : "bg-primary"}`} aria-hidden="true" />{status}</span>
                  </div>
                  {projectMeta ? <p className="mt-2 truncate text-[14px] text-muted-foreground">{projectMeta}</p> : null}
                  <p className="mt-3 text-[14px] text-muted-foreground">
                    <span className="font-semibold text-foreground">사진 {project.photo_count.toLocaleString()}장</span>
                    <span aria-hidden="true"> · </span>
                    {typeof selectedCount === "number" ? `선택 ${selectedCount.toLocaleString()}장` : "선택 수 확인 불가"}
                    <span aria-hidden="true"> · </span>
                    보정 목표 {project.target_count.toLocaleString()}장
                  </p>
                </div>
              </Link>
              <div className="flex justify-end px-5 pb-4 pt-2">
                <Link href={customerProjectDestination(project)} className="inline-flex min-h-9 items-center rounded-lg border border-accent/20 bg-customer-soft px-3.5 text-[13px] font-bold text-accent transition-colors hover:border-accent hover:bg-accent hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/35">{customerProjectAction(project, selectedCount)} →</Link>
              </div>
              </article>
              );
            })}
          </section> : <section className="mt-6 rounded-2xl border border-border-subtle bg-surface px-6 py-16 text-center"><h2 className="font-bold">조건에 맞는 프로젝트가 없어요</h2><Link href="/customer-select" className="mt-3 inline-flex text-sm font-semibold text-accent">전체 프로젝트 보기</Link></section>}
          </>
        )}
      </main>
    </CustomerSelectShell>
  );
}
