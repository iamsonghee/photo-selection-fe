import type { HTMLAttributes } from "react";
import type { Project } from "@/types";

type ProjectIdentity = Pick<Project, "id" | "displayId">;

export function formatProjectDisplayId(project: ProjectIdentity): string {
  return project.displayId ?? project.id.slice(0, 8).toUpperCase();
}

type ProjectIdTextProps = Omit<HTMLAttributes<HTMLSpanElement>, "children"> & {
  project?: ProjectIdentity;
  value?: string;
};

/**
 * Photographer Light 화면의 공통 Project ID 표현.
 * ID는 이름/설명과 다른 식별 데이터이므로 제한적으로 Mono를 사용한다.
 */
export function ProjectIdText({ project, value, className = "", ...props }: ProjectIdTextProps) {
  const displayValue = value ?? (project ? formatProjectDisplayId(project) : "—");

  return (
    <span
      data-project-id={displayValue}
      className={`font-mono text-[11px] font-semibold leading-[16.5px] tracking-normal text-subtle-foreground ${className}`}
      {...props}
    >
      {displayValue}
    </span>
  );
}
