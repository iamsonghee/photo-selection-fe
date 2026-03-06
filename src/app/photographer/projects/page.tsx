"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { format, differenceInDays } from "date-fns";
import { PlusCircle } from "lucide-react";
import { Button, Card, Badge, ProgressBar } from "@/components/ui";
import { supabase } from "@/lib/supabase";
import { getProjectsByPhotographerId } from "@/lib/db";
import { getStatusLabel } from "@/lib/project-status";
import type { Project, ProjectStatus } from "@/types";

export default function ProjectsPage() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user?.id) {
        setLoading(false);
        return;
      }
      getProjectsByPhotographerId(user.id)
        .then(setProjects)
        .catch(console.error)
        .finally(() => setLoading(false));
    });
  }, []);

  const statusBadge = (status: ProjectStatus) => {
    if (status === "selecting" || status === "confirmed")
      return <Badge variant="in_progress">{getStatusLabel(status)}</Badge>;
    if (status === "preparing")
      return <Badge variant="waiting">{getStatusLabel(status)}</Badge>;
    if (status === "editing")
      return <Badge variant="completed">{getStatusLabel(status)}</Badge>;
    return <Badge>{getStatusLabel(status)}</Badge>;
  };

  const daysLabel = (deadline: string) => {
    const d = differenceInDays(new Date(deadline), new Date());
    return d > 0 ? `D+${d}` : d === 0 ? "D-Day" : `D${d}`;
  };

  const getY = (p: Project) => {
    if (p.status === "confirmed" || p.status === "editing") return p.requiredCount;
    if (p.status === "selecting") return 0;
    return 0;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <p className="text-zinc-400">로딩 중...</p>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-2xl font-semibold text-white">프로젝트</h1>
        <Link href="/photographer/projects/new">
          <Button variant="primary" className="flex items-center gap-2">
            <PlusCircle className="h-5 w-5" />
            새 프로젝트
          </Button>
        </Link>
      </div>

      <div className="space-y-6">
        {projects.map((p) => {
          const y = getY(p);
          return (
            <Link key={p.id} href={`/photographer/projects/${p.id}`}>
              <Card className="transition-colors hover:border-zinc-700">
                <div className="flex flex-wrap items-center justify-between gap-4">
                  <div>
                    <p className="font-medium text-white">{p.name}</p>
                    <p className="text-sm text-zinc-400">
                      {p.customerName} · 기한 {format(new Date(p.deadline), "yyyy-MM-dd")}
                    </p>
                  </div>
                  {statusBadge(p.status)}
                </div>
                <div className="mt-3 flex items-center gap-4 text-sm">
                  <span className="font-mono text-zinc-400">
                    선택 {y}/{p.requiredCount}
                  </span>
                  <ProgressBar value={y} max={p.requiredCount} className="max-w-[200px] flex-1" />
                  <span className="text-zinc-500">{daysLabel(p.deadline)}</span>
                </div>
              </Card>
            </Link>
          );
        })}
      </div>
      {projects.length === 0 && (
        <Card className="p-8 text-center">
          <p className="text-zinc-400">아직 프로젝트가 없습니다.</p>
          <Link href="/photographer/projects/new" className="mt-4 inline-block">
            <Button variant="primary">새 프로젝트 만들기</Button>
          </Link>
        </Card>
      )}
    </div>
  );
}
