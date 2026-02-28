"use client";

import { useEffect, useState, useMemo } from "react";
import Link from "next/link";
import { differenceInDays, formatDistanceToNow } from "date-fns";
import { ko } from "date-fns/locale";
import {
  PlusCircle,
  Loader2,
  Search,
  X,
  Link2,
  BarChart3,
  CheckCircle2,
  Clock,
  Layers,
} from "lucide-react";
import { Button, Card, Badge, ProgressBar } from "@/components/ui";
import { supabase } from "@/lib/supabase";
import { getPhotographerIdByAuthId, getProjectsByPhotographerId } from "@/lib/db";
import type { ProjectLogApiItem } from "@/app/api/photographer/project-logs/route";
import {
  GROUP_WAITING,
  GROUP_IN_PROGRESS,
  GROUP_COMPLETED,
  getStatusLabel,
} from "@/lib/project-status";
import type { Project, ProjectStatus } from "@/types";

const ACTION_LABELS: Record<ProjectLogApiItem["action"], string> = {
  created: "프로젝트 생성",
  uploaded: "사진 업로드",
  selecting: "셀렉 진행",
  confirmed: "셀렉 완료",
  editing: "보정 시작",
};

const ACTION_ICONS: Record<ProjectLogApiItem["action"], string> = {
  created: "📁",
  uploaded: "📤",
  selecting: "🖼️",
  confirmed: "✅",
  editing: "🎨",
};

type FilterTab = "all" | "inProgress" | "waiting" | "completed";
type SortOption = "newest" | "deadline" | "customer";

export default function DashboardPage() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [logs, setLogs] = useState<ProjectLogApiItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [userId, setUserId] = useState<string | null>(null);
  const [photographerId, setPhotographerId] = useState<string | null>(null);
  const [userName, setUserName] = useState<string>("사용자");
  const [toast, setToast] = useState<string | null>(null);

  // Search / filter state
  const [search, setSearch] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [filterTab, setFilterTab] = useState<FilterTab>("all");
  const [sortBy, setSortBy] = useState<SortOption>("newest");

  useEffect(() => {
    async function load() {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      setUserId(user?.id ?? null);
      const name =
        (user?.user_metadata?.full_name as string) ??
        (user?.user_metadata?.name as string) ??
        user?.email?.split("@")[0] ??
        "사용자";
      setUserName(name);

      if (!user?.id) {
        setLoading(false);
        return;
      }
      try {
        const pid = await getPhotographerIdByAuthId(user.id);
        setPhotographerId(pid);
        if (!pid) {
          setLoading(false);
          return;
        }
        const [list, logRes] = await Promise.all([
          getProjectsByPhotographerId(pid),
          fetch("/api/photographer/project-logs").then((r) => (r.ok ? r.json() : [])),
        ]);
        setProjects(list);
        setLogs(Array.isArray(logRes) ? logRes : []);
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  useEffect(() => {
    if (toast) {
      const t = setTimeout(() => setToast(null), 2500);
      return () => clearTimeout(t);
    }
  }, [toast]);

  const waiting = useMemo(() => projects.filter((p) => GROUP_WAITING.includes(p.status)), [projects]);
  const inProgress = useMemo(() => projects.filter((p) => GROUP_IN_PROGRESS.includes(p.status)), [projects]);
  const completed = useMemo(() => projects.filter((p) => GROUP_COMPLETED.includes(p.status)), [projects]);

  const filteredAndSorted = useMemo(() => {
    let list = projects;

    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter(
        (p) =>
          p.name.toLowerCase().includes(q) || p.customerName.toLowerCase().includes(q)
      );
    }
    if (startDate) {
      list = list.filter((p) => p.shootDate >= startDate);
    }
    if (endDate) {
      list = list.filter((p) => p.shootDate <= endDate);
    }
    if (filterTab === "inProgress") list = list.filter((p) => GROUP_IN_PROGRESS.includes(p.status));
    else if (filterTab === "waiting") list = list.filter((p) => GROUP_WAITING.includes(p.status));
    else if (filterTab === "completed") list = list.filter((p) => GROUP_COMPLETED.includes(p.status));

    if (sortBy === "newest") {
      list = [...list].sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
    } else if (sortBy === "deadline") {
      list = [...list].sort((a, b) => new Date(a.deadline).getTime() - new Date(b.deadline).getTime());
    } else {
      list = [...list].sort((a, b) => a.customerName.localeCompare(b.customerName));
    }
    return list;
  }, [projects, search, startDate, endDate, filterTab, sortBy]);

  const resetFilters = () => {
    setSearch("");
    setStartDate("");
    setEndDate("");
    setFilterTab("all");
    setSortBy("newest");
  };

  const copyInviteLink = (p: Project) => {
    const url =
      typeof window !== "undefined"
        ? `${window.location.origin}/c/${p.accessToken}`
        : "";
    if (url && navigator.clipboard) {
      navigator.clipboard.writeText(url).then(() => setToast("초대 링크가 복사되었습니다."));
    }
  };

  const daysLabel = (deadline: string) => {
    const d = differenceInDays(new Date(deadline), new Date());
    return d > 0 ? `D+${d}` : d === 0 ? "D-Day" : `D${d}`;
  };

  const statusBadge = (status: ProjectStatus) => {
    if (GROUP_IN_PROGRESS.includes(status))
      return <Badge variant="in_progress">{getStatusLabel(status)}</Badge>;
    if (GROUP_WAITING.includes(status))
      return <Badge variant="waiting">{getStatusLabel(status)}</Badge>;
    if (GROUP_COMPLETED.includes(status))
      return <Badge variant="completed">{getStatusLabel(status)}</Badge>;
    return <Badge>{getStatusLabel(status)}</Badge>;
  };

  const getSelectedCount = (p: Project) => {
    if (GROUP_COMPLETED.includes(p.status)) return p.requiredCount;
    return 0;
  };

  const selectionProgressY = (p: Project) => {
    if (GROUP_COMPLETED.includes(p.status)) return p.requiredCount;
    return getSelectedCount(p);
  };

  const groupByStatus = (list: Project[]) => {
    const inP: Project[] = [];
    const wait: Project[] = [];
    const done: Project[] = [];
    list.forEach((p) => {
      if (GROUP_IN_PROGRESS.includes(p.status)) inP.push(p);
      else if (GROUP_WAITING.includes(p.status)) wait.push(p);
      else if (GROUP_COMPLETED.includes(p.status)) done.push(p);
    });
    return { inProgress: inP, waiting: wait, completed: done };
  };

  const grouped = useMemo(() => groupByStatus(filteredAndSorted), [filteredAndSorted]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-zinc-400" />
      </div>
    );
  }

  if (!userId || !photographerId) {
    return (
      <div className="space-y-8">
        <h1 className="text-2xl font-semibold text-white">작가 대시보드</h1>
        <Card className="p-8 text-center">
          <p className="text-zinc-400">로그인하면 프로젝트 목록을 볼 수 있습니다.</p>
          <Link href="/auth" className="mt-4 inline-block">
            <Button variant="primary">로그인</Button>
          </Link>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* 1. 헤더 */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-semibold text-white">
            안녕하세요, {userName} 님 👋
          </h1>
          <p className="mt-0.5 text-sm text-zinc-400">오늘도 좋은 하루 되세요</p>
        </div>
        <Link href="/photographer/projects/new">
          <Button variant="primary" className="flex items-center gap-2">
            <PlusCircle className="h-4 w-4" />
            새 프로젝트
          </Button>
        </Link>
      </div>

      {/* 2. 요약 카드 4개 */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Card className="flex items-center gap-3 p-4">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/20 text-primary">
            <BarChart3 className="h-5 w-5" />
          </div>
          <div>
            <p className="text-xs text-zinc-400">진행 중</p>
            <p className="text-lg font-bold text-white">{inProgress.length}</p>
          </div>
        </Card>
        <Card className="flex items-center gap-3 p-4">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-success/20 text-success">
            <CheckCircle2 className="h-5 w-5" />
          </div>
          <div>
            <p className="text-xs text-zinc-400">완료됨</p>
            <p className="text-lg font-bold text-white">{completed.length}</p>
          </div>
        </Card>
        <Card className="flex items-center gap-3 p-4">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-zinc-600/50 text-zinc-300">
            <Clock className="h-5 w-5" />
          </div>
          <div>
            <p className="text-xs text-zinc-400">대기 중</p>
            <p className="text-lg font-bold text-white">{waiting.length}</p>
          </div>
        </Card>
        <Card className="flex items-center gap-3 p-4">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-amber-500/20 text-amber-400">
            <Layers className="h-5 w-5" />
          </div>
          <div>
            <p className="text-xs text-zinc-400">전체</p>
            <p className="text-lg font-bold text-white">{projects.length}</p>
          </div>
        </Card>
      </div>

      {/* 3. 검색/필터 2줄 */}
      <Card className="p-4 space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" />
            <input
              type="text"
              placeholder="프로젝트명 / 고객명"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full rounded-lg border border-zinc-700 bg-zinc-900 py-2 pl-9 pr-3 text-sm text-white placeholder-zinc-500 focus:border-primary focus:outline-none"
            />
          </div>
          <input
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            className="rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-white"
          />
          <span className="text-zinc-500">~</span>
          <input
            type="date"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
            className="rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-white"
          />
          <Button variant="ghost" size="sm" onClick={resetFilters} className="text-zinc-400">
            <X className="h-4 w-4" />
          </Button>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex gap-1 rounded-lg border border-zinc-700 bg-zinc-900/50 p-1">
            {(["all", "inProgress", "waiting", "completed"] as const).map((tab) => (
              <button
                key={tab}
                type="button"
                onClick={() => setFilterTab(tab)}
                className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                  filterTab === tab ? "bg-zinc-700 text-white" : "text-zinc-400 hover:text-zinc-200"
                }`}
              >
                {tab === "all" && "전체"}
                {tab === "inProgress" && "진행중"}
                {tab === "waiting" && "대기중"}
                {tab === "completed" && "완료"}
              </button>
            ))}
          </div>
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as SortOption)}
            className="rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-white"
          >
            <option value="newest">최신순</option>
            <option value="deadline">마감임박순</option>
            <option value="customer">고객명순</option>
          </select>
        </div>
      </Card>

      {/* 4. 2컬럼: 프로젝트 목록 | 활동 로그 */}
      <div className="flex flex-col gap-6 lg:flex-row">
        <div className="min-w-0 flex-1 space-y-4">
          {grouped.inProgress.length > 0 && (
            <section>
              <h2 className="mb-2 text-sm font-medium text-zinc-400">
                진행 중 · {grouped.inProgress.length}
              </h2>
              <div className="space-y-3">
                {grouped.inProgress.map((p) => (
                  <ProjectCard
                    key={p.id}
                    project={p}
                    statusBadge={statusBadge}
                    selectionProgressY={selectionProgressY}
                    daysLabel={daysLabel}
                    onCopyInvite={copyInviteLink}
                  />
                ))}
              </div>
            </section>
          )}
          {grouped.waiting.length > 0 && (
            <section>
              <h2 className="mb-2 text-sm font-medium text-zinc-400">
                대기 중 · {grouped.waiting.length}
              </h2>
              <div className="space-y-3">
                {grouped.waiting.map((p) => (
                  <ProjectCard
                    key={p.id}
                    project={p}
                    statusBadge={statusBadge}
                    selectionProgressY={selectionProgressY}
                    daysLabel={daysLabel}
                    onCopyInvite={copyInviteLink}
                  />
                ))}
              </div>
            </section>
          )}
          {grouped.completed.length > 0 && (
            <section>
              <h2 className="mb-2 text-sm font-medium text-zinc-400">
                완료됨 · {grouped.completed.length}
              </h2>
              <div className="space-y-3">
                {grouped.completed.map((p) => (
                  <ProjectCard
                    key={p.id}
                    project={p}
                    statusBadge={statusBadge}
                    selectionProgressY={selectionProgressY}
                    daysLabel={daysLabel}
                    onCopyInvite={copyInviteLink}
                  />
                ))}
              </div>
            </section>
          )}
          {filteredAndSorted.length === 0 && (
            <Card className="p-8 text-center">
              <p className="text-zinc-400">조건에 맞는 프로젝트가 없습니다.</p>
              <Button variant="ghost" size="sm" className="mt-2" onClick={resetFilters}>
                필터 초기화
              </Button>
            </Card>
          )}
        </div>

        {/* 활동 로그 패널 */}
        <aside className="w-full shrink-0 lg:w-[280px]">
          <Card className="p-4">
            <h3 className="mb-3 text-sm font-medium text-zinc-300">활동 로그</h3>
            {logs.length === 0 ? (
              <p className="py-6 text-center text-sm text-zinc-500">최근 활동이 없습니다</p>
            ) : (
              <ul className="space-y-3">
                {logs.map((log) => (
                  <li key={log.id} className="flex gap-2 text-sm">
                    <span className="mt-0.5 shrink-0 text-base leading-none">
                      {ACTION_ICONS[log.action]}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-zinc-300">
                        {log.projectName}
                        {log.customerName ? ` - ${log.customerName} ` : " "}
                        {ACTION_LABELS[log.action]}
                      </p>
                      <p className="text-xs text-zinc-500">
                        {formatDistanceToNow(new Date(log.createdAt), { addSuffix: true, locale: ko })}
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </aside>
      </div>

      {projects.length === 0 && !search && !startDate && !endDate && (
        <Card className="p-8 text-center">
          <p className="text-zinc-400">아직 프로젝트가 없습니다.</p>
          <Link href="/photographer/projects/new" className="mt-4 inline-block">
            <Button variant="primary">새 프로젝트 만들기</Button>
          </Link>
        </Card>
      )}

      {toast && (
        <div
          className="fixed bottom-6 left-1/2 z-50 -translate-x-1/2 rounded-lg bg-zinc-800 px-4 py-2 text-sm font-medium text-white shadow-lg ring-1 ring-zinc-700"
          role="status"
        >
          {toast}
        </div>
      )}
    </div>
  );
}

function ProjectCard({
  project: p,
  statusBadge,
  selectionProgressY,
  daysLabel,
  onCopyInvite,
}: {
  project: Project;
  statusBadge: (s: ProjectStatus) => JSX.Element;
  selectionProgressY: (p: Project) => number;
  daysLabel: (d: string) => string;
  onCopyInvite: (p: Project) => void;
}) {
  const y = selectionProgressY(p);
  const [hover, setHover] = useState(false);

  return (
    <div
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      className="relative"
    >
      <Link href={`/photographer/projects/${p.id}`}>
        <Card className="transition-colors hover:border-zinc-700">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <p className="font-medium text-white">{p.name}</p>
              <p className="text-sm text-zinc-400">{p.customerName}</p>
            </div>
            {statusBadge(p.status)}
          </div>
          <div className="mt-3 flex items-center gap-4 text-sm">
            <span className="font-mono text-zinc-400">
              {y >= p.requiredCount ? "Y" : "N"} · {y}/{p.requiredCount}
            </span>
            <ProgressBar
              value={y}
              max={p.requiredCount}
              variant={GROUP_COMPLETED.includes(p.status) ? "success" : "default"}
              className="max-w-[200px] flex-1"
            />
            <span className="text-zinc-500">{daysLabel(p.deadline)}</span>
          </div>
        </Card>
      </Link>
      {hover && (
        <div className="absolute right-2 top-2 flex gap-1">
          <Button
            variant="secondary"
            size="sm"
            className="text-xs"
            onClick={(e) => {
              e.preventDefault();
              onCopyInvite(p);
            }}
          >
            🔗 초대링크 복사
          </Button>
          <Link href={`/photographer/projects/${p.id}`}>
            <Button variant="ghost" size="sm" className="text-xs">
              📊 상세
            </Button>
          </Link>
        </div>
      )}
    </div>
  );
}
