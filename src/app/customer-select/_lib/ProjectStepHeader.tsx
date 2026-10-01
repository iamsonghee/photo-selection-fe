import Link from "next/link";
import type { MouseEvent } from "react";
import { ArrowLeft } from "lucide-react";
import s from "./ProjectStepHeader.module.css";

export type ProjectStep = "upload" | "select" | "send";

const STEPS: { key: ProjectStep; label: string; path: string }[] = [
  { key: "upload", label: "올리기", path: "upload" },
  { key: "select", label: "고르기", path: "select" },
  { key: "send", label: "보내기", path: "review" },
];

/** 셀프 고객 소유자 화면의 공통 헤더 제목: 뒤로가기 · 프로젝트명 · 올리기/고르기/보내기 단계. */
export function ProjectStepHeader({ projectId, name, step, showSteps = true, backHref, backLabel = "내 프로젝트로", onBack }: {
  projectId: string;
  name: string;
  step: ProjectStep;
  showSteps?: boolean;
  backHref?: string;
  backLabel?: string;
  onBack?: (event: MouseEvent<HTMLAnchorElement>) => void;
}) {
  return (
    <div className={s.root}>
      {backHref && <Link href={backHref} className={s.back} aria-label={backLabel} onClick={onBack}><ArrowLeft size={18} /></Link>}
      <h1 className={s.title}>{name || "이름 없는 프로젝트"}</h1>
      {showSteps && (
        <nav className={s.steps} aria-label="진행 단계">
          {STEPS.map((item) => item.key === step
            ? <span key={item.key} className={`${s.step} ${s.current}`} aria-current="step">{item.label}</span>
            : <Link key={item.key} className={s.step} href={`/customer-select/${projectId}/${item.path}`}>{item.label}</Link>)}
        </nav>
      )}
    </div>
  );
}
