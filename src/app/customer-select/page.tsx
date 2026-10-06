import Link from "next/link";
import Image from "next/image";
import { redirect } from "next/navigation";
import { ArrowRight, FolderPlus, ImagePlus, MoreVertical, PenLine, Plus, QrCode, Send, Trash2, Upload, Users } from "lucide-react";
import { customerPhotoLimit, getCurrentCustomerAuthUser } from "@/lib/customer-select-server";
import { getAdminClient } from "@/lib/supabase-admin";
import { CustomerSelectShell } from "./_lib/CustomerSelectShell";
import { customerProjectAction, customerProjectDestination, customerProjectHome, customerProjectStatus, filterCustomerProjects, kstToday, selectionDeadlineBadge, type CustomerProjectFilter, type CustomerProjectSummary } from "./_lib/project-routing";
import { isCustomerShootType as isProjectShootType, customerShootTypeLabel as projectShootTypeLabel } from "@/lib/customer-shoot-scenes";
import { ProjectFilters } from "./_lib/ProjectFilters";
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
    .select("id, name, shoot_type, shoot_date, selection_deadline, studio_name, photographer_name, shoot_region, shoot_location, target_count, photo_count, exported, delivery_count, last_delivered_at, retouch_done, created_at")
    .eq("owner_id", ownerId)
    .order("created_at", { ascending: false });
  const projects = (data ?? []) as CustomerProjectSummary[];
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
            <h1 className="mt-1 flex items-baseline gap-2.5 text-[28px] font-bold tracking-[-0.04em] md:text-[34px]">
              내 프로젝트
              <span className="text-[16px] font-semibold tracking-normal text-subtle-foreground md:text-[18px]">{totalCount.toLocaleString()}</span>
            </h1>
          </div>

          {!error ? (
            <div className="flex items-center gap-3">
            <section className="flex flex-1 items-center gap-3 rounded-full border border-border-subtle bg-surface py-2 pl-4 pr-3 md:min-w-[320px]" aria-label="전체 사진 이용량">
              <p className="shrink-0 text-[13px] font-semibold text-muted-foreground">사진 <strong className="font-bold text-foreground">{accountPhotoCount.toLocaleString()}</strong> / {photoLimit === null ? "무제한" : `${photoLimit.toLocaleString()}장`}</p>
              {photoLimit !== null && remainingPhotoCount !== null ? (
                <>
                  <div className="h-1.5 min-w-12 flex-1 overflow-hidden rounded-full bg-surface-raised" role="progressbar" aria-label="전체 사진 이용량" aria-valuemin={0} aria-valuemax={photoLimit} aria-valuenow={Math.min(accountPhotoCount, photoLimit)}>
                    <div className="h-full min-w-1.5 rounded-full bg-accent" style={{ width: `${Math.min(100, accountPhotoCount / photoLimit * 100)}%` }} />
                  </div>
                  <p className="shrink-0 text-[12px] font-bold text-accent">{remainingPhotoCount.toLocaleString()}장 남음</p>
                </>
              ) : null}
            </section>
            {totalCount > 0 ? <Link href="/customer-select/new" className="hidden h-11 shrink-0 items-center gap-1.5 rounded-full bg-accent pl-4 pr-5 text-[14px] font-bold text-white transition-colors hover:bg-[var(--accent-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/35 md:inline-flex"><Plus size={18} strokeWidth={2.4} />새 프로젝트</Link> : null}
            </div>
          ) : null}
        </div>

        {error ? (
          <div className="mt-8 rounded-2xl border border-danger/20 bg-surface p-6 text-[14px] text-danger">프로젝트를 불러오지 못했어요. 잠시 후 다시 시도해 주세요.</div>
        ) : totalCount === 0 ? (
          <section className="mt-8 flex min-h-[480px] items-center justify-center rounded-[28px] border border-border-subtle bg-surface px-6 py-14">
            <div className="flex max-w-[640px] flex-col items-center text-center">
              <div className="grid size-16 place-items-center rounded-2xl bg-accent/10 text-accent"><FolderPlus size={29} strokeWidth={1.8} /></div>
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
              <Link href="/customer-select/new" className="mt-8 inline-flex items-center gap-1.5 rounded-full bg-accent px-6 py-3.5 text-[15px] font-bold text-white transition-colors hover:bg-[var(--accent-hover)]"><Plus size={18} strokeWidth={2.4} />새 프로젝트 만들기</Link>
            </div>
          </section>
        ) : (
          <>
          {filtersEnabled ? <ProjectFilters query={query} status={statusFilter} /> : null}
          {listItems.length > 0 ? <section className="mt-8 grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4" aria-label="프로젝트 목록">
            {listItems.map((item) => {
              if (item.type === "guest") return <GuestAlbumCard key={item.album.id} album={item.album} />;
              const { project } = item;
              const coverUrl = coverByProject.get(project.id);
              const selectedCount = selectedByProject.get(project.id);
              const status = customerProjectStatus(project, selectedCount);
              const projectMeta = [
                isProjectShootType(project.shoot_type) ? projectShootTypeLabel(project.shoot_type) : null,
                project.shoot_date?.replaceAll("-", "."),
                project.studio_name,
              ].filter(Boolean).join(" · ");
              const deadline = selectionDeadlineBadge(project.selection_deadline, today, project.retouch_done);
              const selectedPercent = typeof selectedCount === "number" && project.target_count > 0 ? Math.min(100, selectedCount / project.target_count * 100) : 0;
              const statusDot = project.retouch_done ? "bg-foreground" : project.photo_count === 0 || selectedCount === 0 ? "bg-subtle-foreground" : "bg-primary";
              return (
              <article key={project.id} className="group relative flex flex-col rounded-[24px] border border-border-subtle bg-surface transition-[transform,box-shadow,border-color] duration-300 has-[details[open]]:z-20 hover:-translate-y-1 hover:border-transparent hover:shadow-[0_20px_48px_-12px_rgba(2,56,82,0.18)] motion-reduce:transition-none motion-reduce:hover:translate-y-0">
              <Link href={customerProjectHome(project.id)} className="absolute inset-0 rounded-[24px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent/35" aria-label={`${project.name} 상세`} />
              {/* 카드 전체가 위 링크로 열리고, 더보기·행동 버튼만 그 위에서 따로 눌린다. */}
              <div className="pointer-events-none relative flex-1">
                <div className="relative m-2 mb-0 grid aspect-[4/3] place-items-center overflow-hidden rounded-[18px] bg-surface-raised">
                  {coverUrl
                    ? <Image src={coverUrl} alt="" fill unoptimized sizes="(min-width: 1536px) 25vw, (min-width: 1280px) 33vw, (min-width: 640px) 50vw, 100vw" className="object-cover object-center transition-transform duration-500 ease-out group-hover:scale-[1.04] motion-reduce:transition-none motion-reduce:group-hover:scale-100" />
                    : <div className="flex flex-col items-center gap-2 text-subtle-foreground"><ImagePlus size={30} strokeWidth={1.6} /><span className="text-[13px] font-semibold">아직 사진이 없어요</span></div>}
                  <div className="absolute left-3 top-3 flex flex-wrap gap-1.5">
                    {/* 프로젝트 유형 — customer_projects는 모두 촬영본 고르기다(하객 사진 모으기는 guest_albums, 아래 GuestAlbumCard). */}
                    <span className="inline-flex h-7 items-center rounded-full bg-foreground/75 px-2.5 text-[12px] font-bold text-white shadow-sm backdrop-blur-md">촬영본 고르기</span>
                    <span className="inline-flex h-7 items-center gap-1.5 rounded-full bg-white/80 px-2.5 text-[12px] font-bold text-foreground shadow-sm backdrop-blur-md"><span className={`size-1.5 rounded-full ${statusDot}`} aria-hidden="true" />{status}</span>
                    {deadline ? <span className={`inline-flex h-7 items-center rounded-full px-2.5 text-[12px] font-bold shadow-sm backdrop-blur-md ${deadline.urgent ? "bg-accent text-white" : "bg-white/80 text-foreground"}`}>{deadline.label}</span> : null}
                  </div>
                </div>
                <div className="px-5 pb-4 pt-3.5">
                  <div className="flex items-center gap-2">
                    <strong className="min-w-0 flex-1 truncate text-[17px] font-bold tracking-[-0.02em]">{project.name}</strong>
                  <details className="pointer-events-auto relative z-20 -mr-2 shrink-0">
                    <summary aria-label={`${project.name} 더보기`} className="grid size-9 cursor-pointer list-none place-items-center rounded-full text-muted-foreground transition-colors hover:bg-surface-raised hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/35 [&::-webkit-details-marker]:hidden"><MoreVertical size={18} /></summary>
                    <div className="absolute right-0 top-10 w-44 rounded-2xl border border-border-subtle bg-surface p-1.5 shadow-[0_16px_40px_rgba(2,56,82,0.14)]">
                      <Link href={`/customer-select/${project.id}/settings`} className="flex items-center gap-2 rounded-xl px-3 py-2.5 text-sm font-medium hover:bg-surface-raised"><PenLine size={15} />프로젝트 수정</Link>
                      <Link href={`/customer-select/${project.id}/settings?delete=1`} className="flex items-center gap-2 rounded-xl px-3 py-2.5 text-sm font-medium text-danger hover:bg-danger/8"><Trash2 size={15} />프로젝트 삭제</Link>
                    </div>
                  </details>
                  </div>
                  {projectMeta ? <p className="mt-1 truncate text-[13px] text-muted-foreground">{projectMeta}</p> : null}
                  {project.photo_count > 0 ? <div className="mt-4">
                    <div className="flex items-baseline justify-between text-[13px]">
                      <span className="text-muted-foreground">최종 선택</span>
                      <span className="font-semibold text-muted-foreground">
                        {typeof selectedCount === "number" ? <strong className="text-[15px] font-bold text-foreground">{selectedCount.toLocaleString()}</strong> : "확인 불가"}
                        {" "}/ {project.target_count.toLocaleString()}장
                      </span>
                    </div>
                    <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-surface-raised" role="progressbar" aria-label="최종 선택 진행" aria-valuemin={0} aria-valuemax={project.target_count} aria-valuenow={selectedCount ?? 0}>
                      <div className="h-full rounded-full bg-primary transition-[width] duration-500" style={{ width: `${selectedPercent}%` }} />
                    </div>
                    <p className="mt-2 text-[12px] text-subtle-foreground">전체 사진 {project.photo_count.toLocaleString()}장</p>
                  </div> : <p className="mt-4 text-[13px] text-muted-foreground">사진을 올리면 바로 고르기를 시작할 수 있어요.</p>}
                </div>
              </div>
              <div className="relative px-5 pb-5">
                <Link href={customerProjectDestination(project)} className="flex min-h-11 w-full items-center justify-center gap-1.5 rounded-full bg-accent/10 text-[14px] font-bold text-accent transition-colors hover:bg-accent hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/35">{customerProjectAction(project, selectedCount)}<ArrowRight size={16} strokeWidth={2.4} /></Link>
              </div>
              </article>
              );
            })}
          </section> : <section className="mt-8 rounded-[24px] border border-border-subtle bg-surface px-6 py-16 text-center"><h2 className="font-bold">조건에 맞는 프로젝트가 없어요</h2><Link href="/customer-select" className="mt-3 inline-flex text-sm font-semibold text-accent">전체 프로젝트 보기</Link></section>}
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
    <article className="group relative flex flex-col rounded-[24px] border border-border-subtle bg-surface transition-[transform,box-shadow,border-color] duration-300 hover:-translate-y-1 hover:border-transparent hover:shadow-[0_20px_48px_-12px_rgba(2,56,82,0.18)] motion-reduce:transition-none motion-reduce:hover:translate-y-0">
      <Link href={href} className="absolute inset-0 rounded-[24px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent/35" aria-label={`${album.name} 관리`} />
      <div className="pointer-events-none relative flex-1">
        <div className="relative m-2 mb-0 grid aspect-[4/3] place-items-center overflow-hidden rounded-[18px] bg-surface-raised">
          {album.coverUrl
            ? <Image src={album.coverUrl} alt="" fill unoptimized sizes="(min-width: 1536px) 25vw, (min-width: 1280px) 33vw, (min-width: 640px) 50vw, 100vw" className="object-cover object-center transition-transform duration-500 ease-out group-hover:scale-[1.04] motion-reduce:transition-none motion-reduce:group-hover:scale-100" />
            : <div className="flex flex-col items-center gap-2 text-subtle-foreground"><QrCode size={30} strokeWidth={1.6} /><span className="text-[13px] font-semibold">하객 사진을 기다리는 중</span></div>}
          <div className="absolute left-3 top-3 flex flex-wrap gap-1.5">
            <span className="inline-flex h-7 items-center rounded-full bg-accent px-2.5 text-[12px] font-bold text-white shadow-sm">하객 사진 모으기</span>
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
        <Link href={href} className="flex min-h-11 w-full items-center justify-center gap-1.5 rounded-full bg-accent/10 text-[14px] font-bold text-accent transition-colors hover:bg-accent hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/35">{album.closed ? "셀렉 계속하기" : "QR·업로드 현황 보기"}<ArrowRight size={16} strokeWidth={2.4} /></Link>
      </div>
    </article>
  );
}
