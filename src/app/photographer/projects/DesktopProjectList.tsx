"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import type { MouseEvent } from "react";
import { ArrowRight, Plus, Search, MapPin } from "lucide-react";
import type { Project } from "@/types";
import { getDisplayStatusLabel } from "@/lib/project-status";
import { dday } from "@/lib/project-actor";
import { getActiveDeadline } from "@/lib/project-deadline";
import { ProjectIdText } from "@/components/photographer/ProjectIdText";
import { PhotographerLightButton } from "@/components/photographer/PhotographerLightButton";
import { getSixStepPosition, getDisabledSteps } from "@/components/photographer/ProjectStepper";
import styles from "./ProjectListTheme.module.css";

export type ListSort = "latest" | "updated" | "deadline" | "name" | "shoot_date";
export type ListStep = "all" | 1 | 2 | 3 | 4 | 5 | 6;
export type ListView = "all" | "mine" | "waiting" | "completed";
type Action = { kind: string; label?: string; href?: string };
type Props = {
  projects: Project[]; total: number; counts: Record<ListView, number>;
  view: ListView; onView: (view: ListView) => void;
  search: string; onSearch: (value: string) => void;
  step: ListStep; onStep: (value: ListStep) => void;
  from: string; to: string; onFrom: (value: string) => void; onTo: (value: string) => void;
  sort: ListSort; onSort: (value: ListSort) => void;
  onReset: () => void; onCreate: () => void; onRemember: () => void;
  getAction: (project: Project) => Action;
};
const dateLabel = (date: string) => date ? date.slice(0, 10).replaceAll("-", ".") : "미등록";
const steps = ["원본", "셀렉", "보정", "1차 수정", "2차 수정", "납품"];

/** 기존 6단계 매핑을 재사용한다. 고객 검토는 해당 보정 단계에 머무르고 허용되지 않은 수정은 건너뛴다. */
function CompactProjectProgress({ project }: { project: Project }) {
  const { step, actor } = getSixStepPosition(project.status, project.revisionRound);
  const disabled = getDisabledSteps(project.maxRevisionCount);
  return <div className={styles.progress} data-actor={actor}>
    <div className={styles.inlineState}><ProjectCurrentState project={project}/></div>
    <ol className={styles.progressSteps} aria-label={`전체 6단계 중 ${step}단계 ${steps[step-1]}`}>
      {steps.map((label, index) => {
        const number = index + 1;
        const skipped = disabled.includes(number);
        const current = number === step;
        const done = !skipped && number < step;
        return <li key={label} data-current={current} data-done={done} data-skipped={skipped} aria-current={current ? "step" : undefined} aria-label={`${number}. ${label}${skipped ? " · 해당 없음" : current ? " · 현재 단계" : done ? " · 완료" : " · 예정"}`} title={skipped ? `${label}: 이 프로젝트는 해당 없음` : label}>
          <span className={styles.progressSegment} aria-hidden/><span className={styles.stepName}>{label}</span>
        </li>;
      })}
    </ol>
  </div>;
}

/** 좁은 표에서는 같은 상태 정보를 진행 열에 합쳐 중복 노출을 피한다. */
function ProjectCurrentState({ project }: { project: Project }) {
  const { step, actor } = getSixStepPosition(project.status, project.revisionRound);
  return <div className={styles.currentState} data-actor={actor}><span className={styles.actorLabel}><i aria-hidden/>{actor === "photographer" ? "작가" : actor === "customer" ? "고객" : "완료"}</span><strong>{getDisplayStatusLabel(project.status, project.photoCount)}<span className={styles.compactPosition}> · {step}/6</span></strong></div>;
}

/** 목록은 현재 상황과 다음 작업에 집중한다. 상태 전환이나 업로드는 기존 목적지에서 수행한다. */
export function DesktopProjectList(props: Props) {
  const router = useRouter();
  const hasFilters = props.step !== "all" || !!props.from || !!props.to;
  // 행 안의 "다음 작업" 등 자체 목적지가 있는 링크는 그대로 두고, 그 외 영역(썸네일·이름·상태 등)을
  // 눌러도 상세로 이동한다 — 지금까지는 이름 텍스트만 정확히 클릭해야 이동할 수 있었다.
  const goToDetail = (project: Project) => (event: MouseEvent<HTMLTableRowElement>) => {
    if ((event.target as HTMLElement).closest("a")) return;
    props.onRemember();
    router.push(`/photographer/projects/${project.id}`);
  };
  return <section className={styles.desktopList} aria-label="PC 프로젝트 목록">
    <header className={styles.listHeading}><div><h1>프로젝트</h1><p>진행 상황을 확인하고 다음 작업을 이어가세요.</p></div><PhotographerLightButton onClick={props.onCreate}><Plus size={16} />새 프로젝트</PhotographerLightButton></header>
    <div className={styles.listViews} role="group" aria-label="PC 프로젝트 빠른 필터">{(["all", "mine", "waiting", "completed"] as const).map(view => <button key={view} type="button" aria-pressed={props.view === view} onClick={() => props.onView(view)}>{({all:"전체",mine:"내 작업",waiting:"고객 대기",completed:"완료"})[view]}<span>{props.counts[view]}</span></button>)}</div>
    {/* 입력은 같은 높이의 두 묶음으로 배치하고, 공간이 부족할 때 묶음 단위로 줄을 바꾼다. */}
    <div className={styles.listToolbar}>
      <div className={styles.searchGroup}>
        <span className={styles.listSearch}><Search size={17} aria-hidden /><input aria-label="PC 프로젝트 검색" placeholder="프로젝트명, 고객명, ID" value={props.search} onChange={e => props.onSearch(e.target.value)} /></span>
        <select aria-label="진행 단계" value={props.step} onChange={e => props.onStep(e.target.value === "all" ? "all" : Number(e.target.value) as ListStep)}><option value="all">전체 단계</option>{steps.map((label, i) => <option key={label} value={i+1}>{label}</option>)}</select>
      </div>
      <div className={styles.dateSortGroup}>
        <div className={styles.shootRange} role="group" aria-label="촬영일 범위"><span className={styles.rangeLabel}>촬영일</span><input aria-label="촬영 시작일" title="촬영 시작일" type="date" value={props.from} max={props.to || undefined} onChange={e => props.onFrom(e.target.value)} /><span aria-hidden>→</span><input aria-label="촬영 종료일" title="촬영 종료일" type="date" value={props.to} min={props.from || undefined} onChange={e => props.onTo(e.target.value)} /></div>
        <select aria-label="PC 프로젝트 정렬" value={props.sort} onChange={e => props.onSort(e.target.value as ListSort)}><option value="shoot_date">촬영일순</option><option value="updated">최근 변경순</option><option value="deadline">기한순</option><option value="latest">최근 생성순</option><option value="name">이름순</option></select>
      </div>
    </div>
    <div aria-live="polite">{(hasFilters || props.search || props.view !== "all") && <div className={styles.listSummary}><span>전체 {props.total}개 중 {props.projects.length}개</span><button type="button" onClick={props.onReset}>검색·필터 초기화</button></div>}</div>
    <table className={styles.projectTable}>
      <colgroup><col className={styles.identityColumn}/><col className={styles.shootColumn}/><col className={styles.statusColumn}/><col className={styles.currentColumn}/><col className={styles.deadlineColumn}/><col className={styles.actionColumn}/></colgroup>
      <thead><tr><th scope="col">프로젝트</th><th scope="col" className={styles.shootCell}>촬영일</th><th scope="col">진행 단계</th><th scope="col" className={styles.currentCell}>현재 상태</th><th scope="col">기한</th><th scope="col">다음 작업</th></tr></thead>
      <tbody>{props.projects.map(project => {
        const deadline = getActiveDeadline(project);
        const due = deadline ? dday(deadline.date) : null;
        const action = props.getAction(project);
        return <tr key={project.id} data-desktop-project-row onClick={goToDetail(project)}>
          <td><div className={styles.identity}><span className={styles.thumbnail}>{project.thumbnailUrl ? <img src={project.thumbnailUrl} alt="" loading="lazy" /> : <span>{project.name.slice(0,2)}</span>}</span><div className={styles.identityText}>
            {/* 표 안의 링크를 사용해 새 탭 열기·키보드 이동도 기본 브라우저 동작을 따른다. */}
            <Link href={`/photographer/projects/${project.id}`} prefetch={false} onClick={props.onRemember} className={styles.projectName} title={project.name}>{project.name}</Link>
            <div className={styles.projectMeta}><span className={styles.customerName} title={project.customerName}>{project.customerName || "고객 미등록"}</span>{project.location?.trim() && <span className={styles.location} title={project.location} tabIndex={0} aria-label={`촬영장소: ${project.location}`}><MapPin size={12} aria-hidden/><span>{project.location}</span><span className={styles.locationTooltip}>{project.location}</span></span>}</div><span className={styles.inlineShoot}>촬영 {dateLabel(project.shootDate)}</span><ProjectIdText project={project} className={styles.projectId}/>
          </div></div></td>
          <td className={styles.shootCell}>{dateLabel(project.shootDate)}</td>
          <td><CompactProjectProgress project={project}/></td>
          <td className={styles.currentCell}><ProjectCurrentState project={project}/></td>
          <td>{deadline ? <><small>{deadline.label}</small><span className={styles.deadlineLine}><span>{dateLabel(deadline.date)}</span>{due && due.level !== "ok" && <strong className={styles.dueLabel} data-level={due.level}>{due.text}</strong>}</span></> : project.deliveredAt ? <><small>완료일</small><span>{dateLabel(project.deliveredAt)}</span></> : <span className={styles.emptyDeadline}>—</span>}</td>
          <td>{action.href ? <Link href={action.href} prefetch={false} onClick={props.onRemember} className={styles.nextAction} data-primary={action.kind === "primary"}>{action.label}<ArrowRight size={14} aria-hidden/></Link> : <span className={styles.emptyDeadline}>—</span>}</td>
        </tr>;
      })}</tbody>
    </table>
    {props.projects.length === 0 && <div className={styles.listEmpty}><Search size={24}/><h2>조건에 맞는 프로젝트가 없어요.</h2><p>검색어나 필터를 변경해 보세요.</p><button type="button" onClick={props.onReset}>검색·필터 초기화</button></div>}
  </section>;
}
