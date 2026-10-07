import Link from "next/link";
import { redirect } from "next/navigation";
import Image from "next/image";
import { ArrowRight, FolderPlus, Plus, QrCode, Send, Upload, Users } from "lucide-react";
import { customerPhotoLimit, getCurrentCustomerAuthUser } from "@/lib/customer-select-server";
import { getAdminClient } from "@/lib/supabase-admin";
import { CustomerSelectShell } from "../_lib/CustomerSelectShell";
import { filterCustomerProjects, kstToday, type CustomerProjectFilter } from "../_lib/project-routing";
import { ProjectCard, type ProjectCardProject } from "../_lib/ProjectCard";
import type { ProjectCardParticipant } from "../_lib/ProjectCardPeople";
import { ProjectFilters } from "../_lib/ProjectFilters";
import { listOwnerGuestAlbums, type GuestAlbumSummary } from "@/lib/guest-album-server";
import { formatWeddingDateTime } from "@/lib/guest-album";

export default async function CustomerSelectHomePage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const user = await getCurrentCustomerAuthUser();
  if (!user) redirect("/customer-select/login");
  const ownerId = user.id;
  const params = await searchParams;

  const admin = getAdminClient();
  const { data, error } = await admin
    .from("customer_projects")
    .select("id, name, shoot_type, shoot_date, selection_deadline, studio_name, photographer_name, shoot_region, shoot_location, target_count, photo_count, exported, delivery_count, last_delivered_at, retouch_done, created_at, share_token, sharing_enabled")
    .eq("owner_id", ownerId)
    .order("created_at", { ascending: false });
  const projects = (data ?? []) as ProjectCardProject[];
  const guestAlbums = await listOwnerGuestAlbums(ownerId);
  const accountPhotoCount = projects.reduce((sum, project) => sum + Math.max(0, project.photo_count), 0);
  const photoLimit = customerPhotoLimit(user.email);
  const remainingPhotoCount = photoLimit === null ? null : Math.max(0, photoLimit - accountPhotoCount);
  const projectIdsWithPhotos = projects.filter((project) => project.photo_count > 0).map((project) => project.id);
  const selectedCounts = await Promise.all(projects.map((project) => admin.from("customer_selections")
    .select("photo_id", { count: "exact", head: true }).eq("project_id", project.id).eq("is_selected", true)));
  const selectedByProject = new Map(projects.map((project, index) => [project.id, selectedCounts[index].error ? null : selectedCounts[index].count ?? 0]));
  const filtersEnabled = projects.length >= 8;
  const query = filtersEnabled && typeof params.q === "string" ? params.q : "";
  const statusFilter: CustomerProjectFilter = filtersEnabled && typeof params.status === "string" && ["active", "done"].includes(params.status)
    ? params.status as CustomerProjectFilter : "all";
  const filteredProjects = filterCustomerProjects(projects, query, statusFilter);
  // 하객 앨범은 이름 검색만 적용하고, '보정 완료' 상태 필터에서는 뺀다.
  const filteredGuestAlbums = statusFilter === "done" ? [] : guestAlbums.filter((album) => !query.trim() || album.name.toLowerCase().includes(query.trim().toLowerCase()));
  const listItems = [
    ...filteredProjects.map((project) => ({ type: "project" as const, createdAt: project.created_at, project })),
    ...filteredGuestAlbums.map((album) => ({ type: "guest" as const, createdAt: album.createdAt, album })),
  ].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const totalCount = projects.length + guestAlbums.length;
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
  const displayName = String(user.user_metadata?.full_name ?? user.user_metadata?.name ?? user.email?.split("@")[0] ?? "사용자");
  const avatarUrl = user.user_metadata?.avatar_url ?? user.user_metadata?.picture;
  const today = kstToday();
  // 카드의 함께 고르기 줄(참여자 아바타·완료·초대) — 프로젝트 ID 묶음으로 한 번만 조회한다.
  const participantsByProject = new Map<string, ProjectCardParticipant[]>();
  if (projects.length > 0) {
    const { data: participantRows } = await admin.from("customer_project_participants")
      .select("project_id, color, nickname, done")
      .in("project_id", projects.map((project) => project.id));
    for (const row of participantRows ?? []) {
      const list = participantsByProject.get(row.project_id) ?? [];
      list.push({ color: row.color as ProjectCardParticipant["color"], nickname: row.nickname ?? "", done: Boolean(row.done) });
      participantsByProject.set(row.project_id, list);
    }
  }

  return (
    <CustomerSelectShell
      navigation={false}
      account={{
        displayName,
        email: user.email ?? "",
        avatarUrl: typeof avatarUrl === "string" ? avatarUrl : null,
        provider: typeof user.app_metadata?.provider === "string" ? user.app_metadata.provider : null,
        photoCount: accountPhotoCount,
        photoLimit,
      }}
    >
      <main className="mx-auto w-full max-w-[1504px] px-5 pb-28 pt-8 md:px-8 md:pb-16 md:pt-12">
        <div className="flex flex-col gap-5 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="text-[14px] font-semibold text-muted-foreground">{displayName}님, 안녕하세요</p>
            <h1 className="mt-1 flex items-baseline gap-2.5 whitespace-nowrap text-[24px] font-bold tracking-[-0.04em] md:text-[28px]">
              내 프로젝트
              <span className="text-[16px] font-semibold tracking-normal text-subtle-foreground md:text-[18px]">{totalCount.toLocaleString()}</span>
            </h1>
          </div>

          {!error ? (
            <div className="flex flex-wrap items-center gap-3 md:justify-end">
            {/* 태블릿 폭(768~1023px)에서는 이용량·새 프로젝트가 한 줄에 다 안 들어가 제목을 밀어 줄바꿈시키므로 오른쪽 묶음이 줄바꿈한다. */}
            <section className="flex flex-1 items-center gap-3 rounded-lg border border-border-subtle bg-surface py-2 pl-4 pr-3 md:min-w-[240px] lg:min-w-[320px]" aria-label="전체 사진 이용량">
              <p className="shrink-0 text-[13px] font-semibold text-muted-foreground">사진 <strong className="font-bold text-foreground">{accountPhotoCount.toLocaleString()}</strong> / {photoLimit === null ? "무제한" : `${photoLimit.toLocaleString()}장`}</p>
              {photoLimit !== null && remainingPhotoCount !== null ? (
                <>
                  <div className="h-1.5 min-w-12 flex-1 overflow-hidden rounded-full bg-surface-raised" role="progressbar" aria-label="전체 사진 이용량" aria-valuemin={0} aria-valuemax={photoLimit} aria-valuenow={Math.min(accountPhotoCount, photoLimit)}>
                    <div className={`h-full min-w-1.5 rounded-full ${accountPhotoCount >= photoLimit ? "bg-danger" : accountPhotoCount / photoLimit >= 0.8 ? "bg-accent" : "bg-foreground/60"}`} style={{ width: `${Math.min(100, accountPhotoCount / photoLimit * 100)}%` }} />
                  </div>
                  <p className={`shrink-0 text-[12px] font-bold ${accountPhotoCount >= photoLimit ? "text-danger" : accountPhotoCount / photoLimit >= 0.8 ? "text-accent" : "text-muted-foreground"}`}>{remainingPhotoCount.toLocaleString()}장 남음</p>
                </>
              ) : null}
            </section>
            {totalCount > 0 ? <Link href="/customer-select/new" className="hidden h-11 shrink-0 items-center gap-1.5 rounded-lg bg-accent pl-4 pr-5 text-[14px] font-bold text-white transition-colors hover:bg-[var(--accent-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/35 md:inline-flex"><Plus size={18} strokeWidth={2.4} />새 프로젝트</Link> : null}
            </div>
          ) : null}
        </div>

        {error ? (
          <div className="mt-8 rounded-2xl border border-danger/20 bg-surface p-6 text-[14px] text-danger">프로젝트를 불러오지 못했어요. 잠시 후 다시 시도해 주세요.</div>
        ) : totalCount === 0 ? (
          <section className="mt-8 flex min-h-[480px] items-center justify-center rounded-2xl border border-border-subtle bg-surface px-6 py-14">
            <div className="flex max-w-[640px] flex-col items-center text-center">
              <div className="grid size-16 place-items-center rounded-2xl bg-surface-raised text-muted-foreground"><FolderPlus size={29} strokeWidth={1.8} /></div>
              <h2 className="mt-6 text-[24px] font-bold tracking-[-0.04em] md:text-[28px]">첫 프로젝트를 만들어보세요</h2>
              <p className="mt-3 text-[15px] leading-6 text-muted-foreground">촬영본을 올리고 함께 고른 뒤, 파일명과 보정 요청을 작가에게 전달할 수 있어요.</p>
              <ol className="mt-8 grid w-full grid-cols-1 gap-2 text-left sm:grid-cols-3">
                {[[Upload, "사진 올리기", "받은 원본을 한 번에"], [Users, "함께 고르기", "링크로 같이 보며 선택"], [Send, "작가에게 전달", "파일명·보정 요청 정리"]].map(([Icon, title, desc], index) => {
                  const StepIcon = Icon as typeof Upload;
                  return <li key={index} className="flex items-center gap-3 rounded-2xl bg-surface-raised px-4 py-3.5 sm:flex-col sm:items-start sm:gap-2.5">
                    <span className="grid size-9 shrink-0 place-items-center rounded-full bg-surface text-primary"><StepIcon size={17} strokeWidth={2} /></span>
                    <span><strong className="block text-[14px] font-bold">{index + 1}. {title as string}</strong><span className="text-[13px] text-muted-foreground">{desc as string}</span></span>
                  </li>;
                })}
              </ol>
              <Link href="/customer-select/new" className="mt-8 inline-flex items-center gap-1.5 rounded-lg bg-accent px-6 py-3.5 text-[15px] font-bold text-white transition-colors hover:bg-[var(--accent-hover)]"><Plus size={18} strokeWidth={2.4} />새 프로젝트 만들기</Link>
            </div>
          </section>
        ) : (
          <>
          {filtersEnabled ? <ProjectFilters query={query} status={statusFilter} /> : null}
          {listItems.length > 0 ? <section className="mt-8 grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4" aria-label="프로젝트 목록">
            {listItems.map((item) => item.type === "guest"
              ? <GuestAlbumCard key={item.album.id} album={item.album} />
              : <ProjectCard key={item.project.id} project={item.project} coverUrl={coverByProject.get(item.project.id)} selectedCount={selectedByProject.get(item.project.id)} today={today} participants={participantsByProject.get(item.project.id) ?? []} />
            )}
          </section> : <section className="mt-8 rounded-2xl border border-border-subtle bg-surface px-6 py-16 text-center"><h2 className="font-bold">조건에 맞는 프로젝트가 없어요</h2><Link href="/customer-select" className="mt-3 inline-flex text-sm font-semibold text-accent">전체 프로젝트 보기</Link></section>}
          </>
        )}
      </main>
      {!error && totalCount > 0 ? <Link href="/customer-select/new" aria-label="새 프로젝트" className="fixed bottom-[calc(20px+env(safe-area-inset-bottom))] right-5 z-40 inline-flex h-14 items-center gap-1.5 rounded-full bg-accent pl-5 pr-6 text-[15px] font-bold text-white shadow-[0_12px_28px_rgba(255,77,0,0.32)] transition-[transform,background-color] active:scale-95 hover:bg-[var(--accent-hover)] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-accent/25 md:hidden">
        <Plus size={22} strokeWidth={2.4} />새 프로젝트
      </Link> : null}
    </CustomerSelectShell>
  );
}

function GuestAlbumCard({ album }: { album: GuestAlbumSummary }) {
  const href = `/customer-select/guest/${album.id}`;
  return (
    <article className="group relative flex flex-col rounded-2xl border border-border-subtle bg-surface transition-[transform,box-shadow,border-color] duration-300 hover:-translate-y-1 hover:border-transparent hover:shadow-[0_20px_48px_-12px_rgba(2,56,82,0.18)] motion-reduce:transition-none motion-reduce:hover:translate-y-0">
      <Link href={href} className="absolute inset-0 rounded-2xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent/35" aria-label={`${album.name} 관리`} />
      <div className="pointer-events-none relative flex-1">
        <div className="relative m-2 mb-0 grid aspect-[4/3] place-items-center overflow-hidden rounded-xl bg-surface-raised">
          {album.coverUrl
            ? <Image src={album.coverUrl} alt="" fill unoptimized sizes="(min-width: 1536px) 25vw, (min-width: 1280px) 33vw, (min-width: 640px) 50vw, 100vw" className="object-cover object-center transition-transform duration-500 ease-out group-hover:scale-[1.04] motion-reduce:transition-none motion-reduce:group-hover:scale-100" />
            : <div className="flex flex-col items-center gap-2 text-subtle-foreground"><QrCode size={30} strokeWidth={1.6} /><span className="text-[13px] font-semibold">하객 사진을 기다리는 중</span></div>}
          <div className="absolute left-3 top-3 flex flex-wrap gap-1.5">
            <span className="inline-flex h-7 items-center rounded-full bg-foreground/75 px-2.5 text-[12px] font-bold text-white shadow-sm backdrop-blur-md">하객 사진 모으기</span>
            <span className="inline-flex h-7 items-center gap-1.5 rounded-full bg-white/80 px-2.5 text-[12px] font-bold text-foreground shadow-sm backdrop-blur-md"><span className={`size-1.5 rounded-full ${album.closed ? "bg-primary" : "bg-success"}`} aria-hidden="true" />{album.closed ? "셀렉 중" : "업로드 받는 중"}</span>
          </div>
        </div>
        <div className="px-5 pb-4 pt-3.5">
          <strong className="block truncate text-[17px] font-bold tracking-[-0.02em]">{album.name}</strong>
          <p className="mt-1 truncate text-[13px] text-muted-foreground">{formatWeddingDateTime(album.weddingDate)}</p>
          <p className="mt-4 text-[13px] text-muted-foreground">올라온 사진·영상 <strong className="text-[15px] font-bold text-foreground">{album.mediaCount.toLocaleString()}</strong>개</p>
        </div>
      </div>
      <div className="relative px-5 pb-5">
        <Link href={href} className="flex min-h-11 w-full items-center justify-center gap-1.5 rounded-lg border border-border-subtle bg-surface-raised text-[14px] font-semibold text-foreground transition-colors hover:bg-border-subtle focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-strong/50">{album.closed ? "셀렉 계속하기" : "QR·업로드 현황 보기"}<ArrowRight size={16} strokeWidth={2.4} /></Link>
      </div>
    </article>
  );
}
