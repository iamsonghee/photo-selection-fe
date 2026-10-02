import Link from "next/link";
import { customerProjectHome } from "./project-routing";
import s from "./ProjectStepHeader.module.css";

export type ProjectStep = "upload" | "select" | "send";

const STEPS: { key: ProjectStep; label: string; path: string }[] = [
  { key: "upload", label: "올리기", path: "upload" },
  { key: "select", label: "고르기", path: "select" },
  { key: "send", label: "보내기", path: "review" },
];

/**
 * 셀프 고객 화면의 공통 헤더 제목: 프로젝트명 · 올리기/고르기/보내기 단계.
 * 뒤로가기 화살표는 두지 않는다 — 로고가 내 프로젝트 목록으로, 프로젝트명(소유자)이 프로젝트 상세로 간다.
 * 상세 화면 자체에서는 `step`이 없고 프로젝트명은 링크가 아니다.
 */
export function ProjectStepHeader({ projectId, name, step, done = [], next, isOwner = true }: {
  projectId: string;
  name: string;
  /** 없으면 프로젝트 상세 — 단계는 모두 링크로 보인다. */
  step?: ProjectStep;
  /** 끝난 단계(✓ 표시). */
  done?: ProjectStep[];
  /** 상세처럼 `step`이 없을 때 지금 할 단계를 강조한다(링크는 그대로). */
  next?: ProjectStep;
  /** 참여자는 설정으로 갈 수 없고 단계도 보지 않는다. */
  isOwner?: boolean;
}) {
  const title = name || "이름 없는 프로젝트";
  return (
    <div className={s.root}>
      <h1 className={s.title}>
        {isOwner && step ? <Link href={customerProjectHome(projectId)} className={s.titleLink} title="프로젝트 상세">{title}</Link> : title}
      </h1>
      {isOwner && (
        <nav className={s.steps} aria-label="진행 단계">
          {STEPS.map((item) => {
            const className = `${s.step} ${item.key === step || item.key === next ? s.current : done.includes(item.key) ? s.done : ""}`;
            return item.key === step
              ? <span key={item.key} className={className} aria-current="step">{item.label}</span>
              : <Link key={item.key} className={className} href={`/customer-select/${projectId}/${item.path}`}>{item.label}{done.includes(item.key) ? <span className="sr-only"> (완료)</span> : null}</Link>;
          })}
        </nav>
      )}
    </div>
  );
}
