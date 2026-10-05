"use client";

import { useState } from "react";
import { Camera } from "lucide-react";
import { PhotographerLightLinkButton } from "@/components/photographer/PhotographerLightButton";
import { getDisplayStatusLabel } from "@/lib/project-status";
import { projectShootTypeLabel } from "@/lib/project-shoot-types";
import type { CustomerHistoryProject } from "@/lib/photographer-customers";

export function CustomerProjectHistory({ projects }: { projects: CustomerHistoryProject[] }) {
  const [filter, setFilter] = useState<"all" | "active" | "completed">("all");
  const completed = projects.filter(project => project.status === "delivered").length;
  const counts = { all: projects.length, active: projects.length - completed, completed };
  const visible = projects.filter(project => filter === "all" || (filter === "completed" ? project.status === "delivered" : project.status !== "delivered"));

  return <section aria-label="촬영 이력">
    <h3 className="text-base font-bold">촬영 이력 <span className="text-muted-foreground">{projects.length}건</span></h3>
    <div role="group" aria-label="촬영 이력 필터" className="my-4 flex flex-wrap gap-2">
      {(["all", "active", "completed"] as const).map(value => <button key={value} type="button" aria-pressed={filter === value} onClick={() => setFilter(value)} className={`min-h-11 rounded-lg border px-3 text-xs font-semibold ${filter === value ? "border-foreground bg-foreground text-surface" : "border-border-subtle bg-surface text-muted-foreground"}`}>
        {{ all: "전체", active: "진행 중", completed: "완료" }[value]} {counts[value]}
      </button>)}
    </div>
    {visible.length === 0 ? <p className="rounded-lg bg-surface-raised px-4 py-8 text-center text-sm text-muted-foreground">{projects.length === 0 ? "아직 촬영 이력이 없어요." : "해당하는 촬영 이력이 없어요."}</p> : <ul className="divide-y divide-border-subtle">
      {visible.map(project => <li key={project.id} className="py-5 first:pt-0">
        <div className="flex items-start gap-3">
          <div className="grid h-16 w-16 shrink-0 place-items-center overflow-hidden rounded-lg bg-surface-raised">
            {/* Project thumbnails use the same public URLs as the project list. */}
            {project.thumbnailUrl ? <img src={project.thumbnailUrl} alt="" loading="lazy" className="h-full w-full object-cover" /> : <Camera size={21} className="text-subtle-foreground" aria-hidden />}
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-xs text-muted-foreground">{project.shootDate.replaceAll("-", ".")} · {projectShootTypeLabel(project.shootType)}</p>
            <p className="mt-1 break-words text-sm font-semibold">{project.name}</p>
            <p className="mt-1 text-xs text-muted-foreground">{getDisplayStatusLabel(project.status, project.photoCount)}{project.location ? ` · ${project.location}` : ""}</p>
          </div>
        </div>
        <div className="mt-3 flex flex-wrap justify-end gap-2">
          <PhotographerLightLinkButton href={`/photographer/projects/${project.id}`} variant="outline">프로젝트 보기</PhotographerLightLinkButton>
          {project.status === "delivered" && <PhotographerLightLinkButton href={`/photographer/projects/${project.id}/assets/final`} variant="secondary">최종 보정본 보기</PhotographerLightLinkButton>}
        </div>
      </li>)}
    </ul>}
  </section>;
}
