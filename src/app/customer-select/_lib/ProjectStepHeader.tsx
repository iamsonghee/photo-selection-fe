import Link from "next/link";
import s from "./ProjectStepHeader.module.css";

export type ProjectStep = "upload" | "select" | "send";

const STEPS: { key: ProjectStep; label: string; path: string }[] = [
  { key: "upload", label: "올리기", path: "upload" },
  { key: "select", label: "고르기", path: "select" },
  { key: "send", label: "보내기", path: "review" },
];

/**
 * 셀프 고객 프로젝트 화면의 공통 헤더 제목: 프로젝트명 · 올리기/고르기/보내기 단계.
 * 뒤로가기 화살표는 두지 않는다 — 로고와 프로젝트명(소유자)이 내 프로젝트 목록으로 간다.
 * `step`이 없으면(설정·완료 등) 단계는 모두 링크로 보인다.
 */
export function ProjectStepHeader({ projectId, name, step, isOwner = true }: {
  projectId: string;
  name: string;
  /** 지금 화면의 단계. 강조하고 링크는 두지 않는다. */
  step?: ProjectStep;
  /** 참여자는 목록으로 갈 수 없고 단계도 보지 않는다. */
  isOwner?: boolean;
}) {
  const title = name || "이름 없는 프로젝트";
  return (
    <div className={s.root}>
      <h1 className={s.title}>
        {isOwner ? <Link href="/customer-select" className={s.titleLink} title="내 프로젝트">{title}</Link> : title}
      </h1>
      {isOwner && (
        <nav className={s.steps} aria-label="진행 단계">
          {STEPS.map((item) => {
            const className = `${s.step} ${item.key === step ? s.current : ""}`;
            return item.key === step
              ? <span key={item.key} className={className} aria-current="step">{item.label}</span>
              : <Link key={item.key} className={className} href={`/customer-select/${projectId}/${item.path}`}>{item.label}</Link>;
          })}
        </nav>
      )}
    </div>
  );
}
