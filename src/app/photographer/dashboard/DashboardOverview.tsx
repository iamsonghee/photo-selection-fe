"use client";

import Link from "next/link";
import { ArrowRight, BriefcaseBusiness, Clock, FolderOpen, MapPin, Plus, Users } from "lucide-react";
import type { PhotographerQuota } from "@/app/api/photographer/quota/route";
import { PhotographerLightButton } from "@/components/photographer/PhotographerLightButton";
import { ProjectIdText } from "@/components/photographer/ProjectIdText";
import type { ProjectLogItem } from "@/lib/db";
import { getActiveDeadline } from "@/lib/project-deadline";
import { dday, getFocusRankedProjects, getProjectActor } from "@/lib/project-actor";
import { getDesktopNextAction } from "@/lib/project-next-action";
import { getDisplayStatusLabel } from "@/lib/project-status";
import type { Project } from "@/types";
import styles from "./DashboardTheme.module.css";

const logLabels: Record<string, string> = {
  created: "프로젝트를 생성했어요",
  uploaded: "원본 사진을 업로드했어요",
  editing: "보정 작업을 시작했어요",
  reviewing_v1: "보정본을 고객에게 전달했어요",
  reviewing_v2: "재보정본을 고객에게 전달했어요",
  confirmed: "사진 확정을 완료했어요",
  selecting: "셀렉을 다시 진행하고 있어요",
  delivered: "납품을 완료했어요",
};

const dateText = (value: string) => value.slice(0, 10).replaceAll("-", ".");

/** 활성 기한의 날짜와 남은 날짜를 대시보드 전반에서 같은 형식으로 보여준다. */
function DeadlineMeta({ deadline, compact = false }: {
  deadline: NonNullable<ReturnType<typeof getActiveDeadline>>;
  compact?: boolean;
}) {
  const due = dday(deadline.date);
  return <span className={`${styles.deadlineMeta} ${compact ? styles.deadlineMetaCompact : ""}`}>
    <span>{deadline.label} {dateText(deadline.date)}</span>
    {due.level !== "ok" && <strong className={styles.deadlineBadge} data-level={due.level}>{due.text}</strong>}
  </span>;
}

function ProjectThumbnail({ project, className = "" }: { project: Project; className?: string }) {
  return project.thumbnailUrl
    ? <img className={className} src={project.thumbnailUrl} alt="" loading="lazy"/>
    : <span className={`${styles.placeholder} ${className}`}>{project.name.slice(0, 2)}</span>;
}

function ProjectMeta({ project }: { project: Project }) {
  return <span className={styles.meta}>
    {project.customerName || "고객 미등록"}
    {project.location && <span title={project.location}><MapPin size={12} aria-hidden/>{project.location}</span>}
  </span>;
}

function Identity({ project }: { project: Project }) {
  return <div className={styles.identity}>
    <ProjectThumbnail project={project}/>
    <div>
      <Link href={`/photographer/projects/${project.id}`} prefetch={false} className={styles.name} title={project.name}>{project.name}</Link>
      <ProjectMeta project={project}/>
    </div>
  </div>;
}

/** 목록과 대표 카드가 같은 실제 상태를 설명하도록 문구를 한곳에서 만든다. */
function getAttentionReason(project: Project): string {
  const actor = getProjectActor(project.status);
  if (actor === "customer") return "기한이 지나 고객 응답을 확인해야 해요.";
  if (project.status === "editing_v2") return "재보정 요청 내용을 확인하고 반영해 주세요.";
  if (project.status === "confirmed") return "고객이 사진 선택을 확정했어요.";
  return getDisplayStatusLabel(project.status, project.photoCount);
}

function getAction(project: Project) {
  const action = getDesktopNextAction(project);
  return {
    href: "href" in action ? action.href : `/photographer/projects/${project.id}`,
    label: "label" in action ? action.label : "진행 확인",
  };
}

function FeaturedTask({ project }: { project: Project }) {
  const actor = getProjectActor(project.status);
  const deadline = getActiveDeadline(project);
  const action = getAction(project);
  return <article className={styles.featuredTask} data-actor={actor}>
    <Link className={styles.featuredMedia} href={`/photographer/projects/${project.id}`} prefetch={false} aria-label={`${project.name} 프로젝트 보기`}>
      <ProjectThumbnail project={project}/>
    </Link>
    <div className={styles.featuredBody}>
      <div className={styles.featuredTopline}>
        <span className={styles.actor} data-actor={actor}><i/>{actor === "customer" ? "고객 확인" : "작가 작업"}</span>
        <span>가장 먼저 확인</span>
      </div>
      <Link href={`/photographer/projects/${project.id}`} prefetch={false} className={styles.featuredName}>{project.name}</Link>
      <ProjectMeta project={project}/>
      <p className={styles.featuredReason}>{getAttentionReason(project)}</p>
      <div className={styles.featuredBottom}>
        {deadline ? <DeadlineMeta deadline={deadline}/> : <small>{getDisplayStatusLabel(project.status, project.photoCount)}</small>}
        <Link className={styles.primaryAction} href={action.href} prefetch={false}>{action.label}<ArrowRight size={14}/></Link>
      </div>
    </div>
  </article>;
}

function UsagePanel({ quota, usage, usagePercent, remaining }: {
  quota: PhotographerQuota | null;
  usage: number | undefined;
  usagePercent: number;
  remaining: number | null;
}) {
  return <section className={styles.usagePanel} aria-labelledby="dashboard-usage-title">
    <div className={styles.panelHeading}><div><FolderOpen size={17}/><h2 id="dashboard-usage-title">프로젝트 사용량</h2></div>{quota?.tier === "beta" && <span>베타</span>}</div>
    <div
      className={styles.usageDonut}
      role={quota?.max != null ? "progressbar" : undefined}
      aria-label={quota?.max != null ? `프로젝트 사용량, ${usage ?? 0}개 사용, 전체 ${quota.max}개` : undefined}
      aria-valuenow={quota?.max != null ? Math.min(usage ?? 0, quota.max) : undefined}
      aria-valuemin={quota?.max != null ? 0 : undefined}
      aria-valuemax={quota?.max ?? undefined}
    >
      <svg viewBox="0 0 80 80" aria-hidden="true">
        <circle className={styles.usageDonutTrack} cx="40" cy="40" r="34" pathLength="100"/>
        {quota?.max != null && <circle className={styles.usageDonutValue} cx="40" cy="40" r="34" pathLength="100" strokeDasharray={`${usagePercent} 100`}/>} 
      </svg>
      <strong>{quota?.max == null && quota ? "∞" : usage ?? "—"}</strong>
      <span>{quota?.max == null && quota ? `${usage ?? 0}개 사용` : "사용"}</span>
    </div>
    <div className={styles.usageNumbers}><strong>{usage ?? "—"}</strong><span>/ {quota ? quota.max ?? "무제한" : "—"}</span></div>
    <p>{quota ? remaining == null ? "프로젝트 수 제한 없이 이용할 수 있어요." : remaining > 0 ? `${remaining}개 프로젝트를 더 만들 수 있어요.` : "프로젝트 사용 한도에 도달했어요." : "사용량 정보를 확인하고 있어요."}</p>
  </section>;
}

/** 기존 우선순위와 실제 작업 경로를 유지하고, 정보 성격에 따라 화면 위계만 재구성한다. */
export function DashboardOverview({ projects, logs, logsError, onRetryLogs, onCreate, userName, banner, quota }: {
  projects: Project[];
  logs: ProjectLogItem[];
  logsError: boolean;
  onRetryLogs: () => void;
  onCreate: () => void;
  userName: string;
  banner: React.ReactNode;
  quota: PhotographerQuota | null;
}) {
  const focus = getFocusRankedProjects(projects);
  const recent = [...projects]
    .sort((a, b) => (Date.parse(b.updatedAt) || 0) - (Date.parse(a.updatedAt) || 0))
    .slice(0, 3);
  const mine = projects.filter(project => getProjectActor(project.status) === "photographer").length;
  const overdueCustomer = focus.filter(project => getProjectActor(project.status) === "customer").length;
  const usage = quota?.tier === "admin" ? projects.length : quota?.current;
  const usagePercent = quota?.max ? Math.min(100, ((usage ?? 0) / quota.max) * 100) : 0;
  const remaining = quota?.max == null ? null : Math.max(0, quota.max - (usage ?? 0));

  return <div className={styles.frame}>
    <header className={styles.heading}>
      <div><h1>대시보드</h1><p>{userName} 작가님, 프로젝트 흐름과 다음 작업을 확인하세요.</p></div>
      <PhotographerLightButton onClick={onCreate}><Plus size={16}/>새 프로젝트</PhotographerLightButton>
    </header>
    {banner}

    <section className={styles.overview} aria-label="업무 현황">
      <div className={styles.overviewIntro}>
        <span>오늘의 업무</span>
        <div><strong>{focus.length}</strong><h2>지금 확인할 프로젝트</h2></div>
        <p>작가 차례인 작업과 기한이 지난 고객 대기를 모았어요.</p>
      </div>
      <div className={styles.turnStats}>
        <div data-actor="photographer"><BriefcaseBusiness size={18}/><span>작가 차례</span><strong>{mine}<small>개</small></strong></div>
        <div data-actor="customer"><Users size={18}/><span>기한 지난 고객</span><strong>{overdueCustomer}<small>개</small></strong></div>
      </div>
    </section>

    <div className={styles.layout}>
      <main className={styles.main}>
        <section aria-label="지금 확인할 프로젝트">
          {focus.length ? <FeaturedTask project={focus[0]}/> : <p className={styles.empty}>현재 확인이 필요한 프로젝트가 없어요.</p>}
          {focus.length > 1 && <div className={styles.followingTasks}>
            <div className={styles.sectionHeading}><div className={styles.sectionTitleGroup}><h2>이어서 확인할 프로젝트</h2><p>다음 작업 순서대로 정리했어요.</p></div><Link href="/photographer/projects">전체 프로젝트<ArrowRight size={13}/></Link></div>
            <div className={styles.workList}>{focus.slice(1, 5).map(project => {
              const actor = getProjectActor(project.status);
              const deadline = getActiveDeadline(project);
              const action = getAction(project);
              return <article className={styles.workRow} key={project.id}>
                <Identity project={project}/>
                <div className={styles.reason}><span className={styles.actor} data-actor={actor}><i/>{actor === "customer" ? "고객" : "작가"}</span><p>{getAttentionReason(project)}</p>{deadline && <DeadlineMeta deadline={deadline} compact/>}</div>
                <Link className={styles.action} href={action.href} prefetch={false}>{action.label}<ArrowRight size={13}/></Link>
              </article>;
            })}</div>
            {focus.length > 5 && <Link className={styles.more} href="/photographer/projects">외 {focus.length - 5}개 프로젝트 확인<ArrowRight size={13}/></Link>}
          </div>}
        </section>

        <section aria-label="최근 변경 프로젝트">
          <div className={styles.sectionHeading}><div className={styles.sectionTitleGroup}><h2>최근 변경 프로젝트</h2><p>사진으로 프로젝트를 빠르게 찾아보세요.</p></div><Link href="/photographer/projects">전체 보기<ArrowRight size={13}/></Link></div>
          <div className={styles.recentGrid}>{recent.slice(0, 3).map(project => <Link href={`/photographer/projects/${project.id}`} prefetch={false} key={project.id} className={styles.recentCard}>
            <div className={styles.recentMedia}><ProjectThumbnail project={project}/><span className={styles.actor} data-actor={getProjectActor(project.status)}><i/>{getDisplayStatusLabel(project.status, project.photoCount)}</span></div>
            <div className={styles.recentBody}><strong>{project.name}</strong><ProjectMeta project={project}/><small>{dateText(project.updatedAt)} 변경</small></div>
          </Link>)}</div>
        </section>
      </main>

      <aside className={styles.sideRail} aria-label="대시보드 보조 정보">
        <UsagePanel quota={quota} usage={usage} usagePercent={usagePercent} remaining={remaining}/>
        <section className={styles.activity} aria-label="최근 활동">
          <div className={styles.panelHeading}><div><Clock size={17} aria-hidden/><h2>최근 활동</h2></div></div>
          {logsError ? <div className={styles.empty}><p>활동을 불러오지 못했어요.</p><button onClick={onRetryLogs}>다시 시도</button></div> : logs.length ? <ul className={styles.timeline}>{logs.slice(0, 6).map(log => {
            const actor = log.action === "confirmed" || log.action === "selecting" ? "customer" : "photographer";
            const project = projects.find(item => item.id === log.projectId);
            return <li key={log.id} data-actor={actor}><Link href={`/photographer/projects/${log.projectId}`} prefetch={false}>
              <i className={styles.logDot} aria-hidden/>
              <time dateTime={log.createdAt}>{new Date(log.createdAt).toLocaleString("ko-KR", { timeZone: "Asia/Seoul", month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" })}</time>
              <p className={styles.logSentence}><strong>{log.projectName}</strong> {logLabels[log.action] || "프로젝트를 업데이트했어요"}</p>
              <div className={styles.logMeta}>{log.customerName || project?.customerName || "고객 미등록"}{project && <><span>·</span><ProjectIdText project={project}/></>}</div>
            </Link></li>;
          })}</ul> : <p className={styles.empty}>아직 활동이 없어요.</p>}
        </section>
      </aside>
    </div>
  </div>;
}
