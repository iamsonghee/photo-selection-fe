import Link from "next/link";
import s from "./ProjectStepHeader.module.css";

export type ProjectStep = "upload" | "select" | "send";

const STEPS: { key: ProjectStep; label: string; path: string }[] = [
  { key: "upload", label: "올리기", path: "upload" },
  { key: "select", label: "고르기", path: "select" },
  { key: "send", label: "보내기", path: "review" },
];

/**
 * 셀프 고객 화면의 공통 헤더 제목: 프로젝트명 · 올리기/고르기/보내기 단계.
 * 뒤로가기 화살표는 두지 않는다 — 로고가 내 프로젝트 목록으로, 프로젝트명(소유자)이 프로젝트 설정으로 간다.
 * 별도 프로젝트 상세 화면은 없다(`[projectId]/route.ts`), 촬영 정보·공유·삭제가 설정에 있다.
 */
export function ProjectStepHeader({ projectId, name, step, isOwner = true }: {
  projectId: string;
  name: string;
  step: ProjectStep;
  /** 참여자는 설정으로 갈 수 없고 단계도 보지 않는다. */
  isOwner?: boolean;
}) {
  const title = name || "이름 없는 프로젝트";
  const from = STEPS.find((item) => item.key === step)!.path;
  return (
    <div className={s.root}>
      <h1 className={s.title}>
        {isOwner ? <Link href={`/customer-select/${projectId}/settings?from=${from}`} className={s.titleLink} title="프로젝트 설정">{title}</Link> : title}
      </h1>
      {isOwner && (
        <nav className={s.steps} aria-label="진행 단계">
          {STEPS.map((item) => item.key === step
            ? <span key={item.key} className={`${s.step} ${s.current}`} aria-current="step">{item.label}</span>
            : <Link key={item.key} className={s.step} href={`/customer-select/${projectId}/${item.path}`}>{item.label}</Link>)}
        </nav>
      )}
    </div>
  );
}
