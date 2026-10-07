import Link from "next/link";
import Image from "next/image";
import { ArrowRight, ImagePlus, Link2, MoreVertical, PenLine, Trash2 } from "lucide-react";
import { customerShootTypeLabel, isCustomerShootType } from "@/lib/customer-shoot-scenes";
import { customerProjectAction, customerProjectDestination, customerProjectSent, customerProjectStatus, selectionDeadlineBadge, type CustomerProjectSummary } from "./project-routing";
import { ProjectCardPeople, type ProjectCardParticipant } from "./ProjectCardPeople";

export type ProjectCardProject = CustomerProjectSummary & { share_token: string; sharing_enabled: boolean };

// hover 대상인 카드 자체는 움직이지 않는다 — 위로 띄우면 하단 가장자리에서 hover가 붙었다 떨어지며 떨린다.
const CARD_CLASS = "group relative flex flex-col rounded-2xl border border-border-subtle bg-surface transition-[box-shadow,border-color] duration-200 ease-[cubic-bezier(0.2,0,0,1)] has-[details[open]]:z-20 hover:border-border hover:shadow-[0_12px_28px_-10px_rgba(2,56,82,0.16)] motion-reduce:transition-none";
const MENU_ITEM = "flex items-center gap-2 rounded-xl px-3 py-2.5 text-sm font-medium hover:bg-surface-raised";

/**
 * 내 프로젝트 카드 — 별도 상세(허브) 화면 없이 한 카드에 담는다(2026-10-06).
 * 대표 사진 위 상태·마감 칩, 이름·촬영 정보, 최종 선택 진행, 함께 고르기(참여자·초대), 지금 할 단계로 가는 버튼.
 * 본문과 아래 행동 버튼 모두 현재 단계로 바로 간다. 모바일(1열)과 PC(2~4열) 모두 같은 세로 배치다.
 */
export function ProjectCard({ project, coverUrl, selectedCount, today, participants = [] }: {
  project: ProjectCardProject;
  coverUrl?: string;
  /** 최종 선택 수. 조회 실패면 null. */
  selectedCount?: number | null;
  /** KST 오늘(YYYY-MM-DD) — 마감 칩 계산. */
  today: string;
  participants?: ProjectCardParticipant[];
}) {
  const sent = customerProjectSent(project);
  const status = customerProjectStatus(project, selectedCount, sent);
  const href = customerProjectDestination(project, sent);
  const action = customerProjectAction(project, selectedCount, sent);
  const deadline = selectionDeadlineBadge(project.selection_deadline, today, project.retouch_done);
  const selectedPercent = typeof selectedCount === "number" && project.target_count > 0 ? Math.min(100, selectedCount / project.target_count * 100) : 0;
  const statusDot = project.retouch_done ? "bg-foreground" : project.photo_count === 0 || selectedCount === 0 ? "bg-subtle-foreground" : "bg-primary";
  // 만들 때 입력한 값만(빈 값은 숨긴다).
  const meta = [
    isCustomerShootType(project.shoot_type) ? customerShootTypeLabel(project.shoot_type) : null,
    project.shoot_date?.replaceAll("-", "."),
    project.studio_name,
  ].filter(Boolean).join(" · ");

  return (
    <article className={CARD_CLASS}>
      {/* 카드 전체가 이 링크로 열리고, 더보기·초대·행동 버튼만 그 위에서 따로 눌린다. */}
      <Link href={href} className="absolute inset-0 rounded-2xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent/35" aria-label={`${project.name} 열기`} />
      <div className="pointer-events-none relative flex-1">
        <div className="relative m-2 mb-0 grid aspect-[4/3] place-items-center overflow-hidden rounded-xl bg-surface-raised">
          {coverUrl
            ? <Image src={coverUrl} alt="" fill unoptimized sizes="(min-width: 1536px) 25vw, (min-width: 1280px) 33vw, (min-width: 640px) 50vw, 100vw" className="object-cover object-center transition-transform duration-200 ease-[cubic-bezier(0.2,0,0,1)] group-hover:scale-[1.025] motion-reduce:transition-none motion-reduce:group-hover:scale-100" />
            : <div className="flex flex-col items-center gap-2 text-subtle-foreground"><ImagePlus size={30} strokeWidth={1.6} /><span className="text-[13px] font-semibold">아직 사진이 없어요</span></div>}
          <div className="absolute left-3 top-3 flex flex-wrap gap-1.5">
            {/* 프로젝트 유형 — customer_projects는 모두 촬영본 고르기다(하객 사진 모으기는 guest_albums, 목록의 GuestAlbumCard). */}
            <span className="inline-flex h-7 items-center rounded-full bg-foreground/75 px-2.5 text-[12px] font-bold text-white shadow-sm backdrop-blur-md">촬영본 고르기</span>
            <span className="inline-flex h-7 items-center gap-1.5 rounded-full bg-white/80 px-2.5 text-[12px] font-bold text-foreground shadow-sm backdrop-blur-md"><span className={`size-1.5 rounded-full ${statusDot}`} aria-hidden="true" />{status}</span>
            {deadline ? <span className={`inline-flex h-7 items-center rounded-full px-2.5 text-[12px] font-bold shadow-sm backdrop-blur-md ${deadline.label === "마감 지남" ? "bg-danger text-white" : deadline.urgent ? "bg-white/80 text-danger" : "bg-white/80 text-foreground"}`}>{deadline.label}</span> : null}
          </div>
        </div>
        <div className="px-5 pb-4 pt-3.5">
          <div className="flex items-center gap-2">
            <strong className="min-w-0 flex-1 truncate text-[17px] font-bold tracking-[-0.02em]">{project.name}</strong>
            <details className="pointer-events-auto relative z-20 -mr-2 shrink-0">
              <summary aria-label={`${project.name} 더보기`} className="grid size-9 cursor-pointer list-none place-items-center rounded-full text-muted-foreground transition-colors hover:bg-surface-raised hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/35 [&::-webkit-details-marker]:hidden"><MoreVertical size={18} /></summary>
              <div className="absolute right-0 top-10 w-44 rounded-2xl border border-border-subtle bg-surface p-1.5 shadow-[0_16px_40px_rgba(2,56,82,0.14)]">
                <Link href={`/customer-select/${project.id}/settings`} className={MENU_ITEM}><PenLine size={15} />프로젝트 수정</Link>
                <Link href={`/customer-select/${project.id}/settings#sharing`} className={MENU_ITEM}><Link2 size={15} />링크 관리</Link>
                <Link href={`/customer-select/${project.id}/settings?delete=1`} className={`${MENU_ITEM} text-danger hover:bg-danger/8`}><Trash2 size={15} />프로젝트 삭제</Link>
              </div>
            </details>
          </div>
          {meta ? <p className="mt-1 truncate text-[13px] text-muted-foreground">{meta}</p> : null}
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
          {/* 함께 고르기: 상세 화면이 없으므로 카드에서 바로 초대한다. */}
          <div className="mt-4 flex items-center gap-3 border-t border-border-subtle pt-4">
            <ProjectCardPeople projectId={project.id} participants={participants} shareToken={project.share_token} shareEnabled={project.sharing_enabled} />
          </div>
        </div>
      </div>
      <div className="relative px-5 pb-5">
        <Link href={href} className="flex min-h-11 w-full items-center justify-center gap-1.5 rounded-lg border border-border-subtle bg-surface-raised text-[14px] font-semibold text-foreground transition-colors hover:bg-border-subtle focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-strong/50">{action}<ArrowRight size={16} strokeWidth={2.4} /></Link>
      </div>
    </article>
  );
}
