import Link from "next/link";
import Image from "next/image";
import { redirect } from "next/navigation";
import { FolderPlus, Settings } from "lucide-react";
import { getCurrentCustomerAuthId } from "@/lib/customer-select-server";
import { getAdminClient } from "@/lib/supabase-admin";
import { CustomerSelectShell } from "./_lib/CustomerSelectShell";
import { customerProjectDestination, customerProjectStatus, type CustomerProjectSummary } from "./_lib/project-routing";
import { projectShootTypeLabel } from "@/lib/project-shoot-types";

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
        <h1 className="text-[26px] font-bold tracking-[-0.04em] md:text-[30px]">내 셀렉 프로젝트</h1>
        <p className="mt-2 text-[14px] text-muted-foreground">사진을 올리고 함께 고른 뒤, 선택한 결과를 작가에게 전달하세요.</p>

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
          <section className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3" aria-label="프로젝트 목록">
            {projects.map((project) => {
              const coverUrl = coverByProject.get(project.id);
              return (
              <article key={project.id} className="group relative overflow-hidden rounded-2xl border border-border-subtle bg-surface transition hover:-translate-y-0.5 hover:border-border-strong hover:shadow-[0_12px_32px_rgba(2,56,82,0.08)]">
              <Link href={`/customer-select/${project.id}`} className="block" aria-label={`${project.name} 프로젝트 현황`}>
                <div className="relative grid aspect-[16/8] place-items-center overflow-hidden bg-surface-raised">
                  {coverUrl
                    ? <Image src={coverUrl} alt="" fill unoptimized sizes="(min-width: 1280px) 33vw, (min-width: 640px) 50vw, 100vw" className="object-cover object-center" />
                    : <Image src="/brand/a-cut-mark.svg" alt="" width={64} height={64} className="rounded-xl" />}
                </div>
                <div className="p-5">
                  <div className="flex items-center justify-between gap-3">
                    <strong className="min-w-0 truncate text-[17px] font-bold">{project.name}</strong>
                    <span className="shrink-0 rounded-md bg-customer-soft px-2 py-1 text-[11px] font-bold text-primary">{customerProjectStatus(project)}</span>
                  </div>
                  <p className="mt-3 text-[13px] text-muted-foreground">{[project.studio_name, projectShootTypeLabel(project.shoot_type), project.shoot_date?.replaceAll("-", ".")].filter(Boolean).join(" · ")}</p>
                  <p className="mt-1 text-[13px] text-muted-foreground">사진 {project.photo_count.toLocaleString()}장 · {selectedByProject.get(project.id) === null ? "선택 수 확인 불가" : `${selectedByProject.get(project.id)}장 선택`} · 보정 예정 {project.target_count}장</p>
                </div>
              </Link>
              <div className="flex items-center justify-between border-t border-border-subtle px-5 py-3 text-sm font-semibold">
                <Link href={`/customer-select/${project.id}`} className="py-2 text-muted-foreground">프로젝트 현황</Link>
                <Link href={customerProjectDestination(project)} className="py-2 text-accent">{project.retouch_done ? "완료 내용 보기" : project.exported ? "전달 내용 보기" : project.photo_count ? "이어서 고르기" : "사진 올리기"} →</Link>
              </div>
              <Link href={`/customer-select/${project.id}/settings`} aria-label={`${project.name} 설정`} title="프로젝트 설정" className="absolute right-3 top-3 grid size-10 place-items-center rounded-full border border-white/70 bg-white/90 text-foreground shadow-sm backdrop-blur transition hover:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"><Settings size={17} strokeWidth={1.8} /></Link>
              </article>
              );
            })}
          </section>
        )}
      </main>
    </CustomerSelectShell>
  );
}
