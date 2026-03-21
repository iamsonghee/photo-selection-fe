"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { format, differenceInDays } from "date-fns";
import { PlusCircle } from "lucide-react";
import { Button, Card, Badge } from "@/components/ui";
import { ProjectProgressBar } from "@/components/ProjectProgressBar";
import { supabase } from "@/lib/supabase";
import { getPhotographerIdByAuthId, getProjectsByPhotographerId } from "@/lib/db";
import { getDisplayStatusLabel } from "@/lib/project-status";
import type { Project, ProjectStatus } from "@/types";

export default function ProjectsPage() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (!user?.id) {
        setLoading(false);
        return;
      }
      try {
        const photographerId = await getPhotographerIdByAuthId(user.id);
        if (!photographerId) {
          setLoading(false);
          return;
        }
        const list = await getProjectsByPhotographerId(photographerId);
        setProjects(list);
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    });
  }, []);

  const statusBadgeVariant = (status: ProjectStatus) => {
    if (status === "delivered") return "completed";
    if (status === "preparing") return "waiting";
    return "in_progress";
  };

  const daysLabel = (deadline: string) => {
    const d = differenceInDays(new Date(deadline), new Date());
    return d > 0 ? `D+${d}` : d === 0 ? "D-Day" : `D${d}`;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <p className="text-zinc-400">로딩 중...</p>
      </div>
    );
  }

  return (
    <div className="space-y-8 p-6">
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
        {projects.map((p) => (
          <Link key={p.id} href={`/photographer/projects/${p.id}`}>
            <Card className="transition-colors hover:border-zinc-700">
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div>
                  <p className="font-medium text-white">{p.name}</p>
                  <p className="text-sm text-zinc-400">
                    {p.customerName} · 기한 {format(new Date(p.deadline), "yyyy-MM-dd")}
                  </p>
                </div>
                <Badge variant={statusBadgeVariant(p.status)} className="shrink-0">
                  {getDisplayStatusLabel(p.status, p.photoCount)}
                </Badge>
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-3 text-sm">
                <ProjectProgressBar
                  status={p.status}
                  photoCount={p.photoCount}
                  requiredCount={p.requiredCount}
                  className="min-w-0 flex-1 flex-shrink-0"
                />
                <span className="text-zinc-500 shrink-0">{daysLabel(p.deadline)}</span>
              </div>
            </Card>
          </Link>
        ))}
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
