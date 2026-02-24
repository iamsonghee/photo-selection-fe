import Link from "next/link";
import { format, differenceInDays } from "date-fns";
import { ko } from "date-fns/locale";
import { PlusCircle } from "lucide-react";
import { Button, Card, Badge, ProgressBar } from "@/components/ui";
import { mockPhotographer, mockProjects, getDashboardStats } from "@/lib/mock-data";

export default function DashboardPage() {
  const stats = getDashboardStats();
  const inProgress = mockProjects.filter((p) => p.status === "selecting");
  const waiting = mockProjects.filter((p) => p.status === "preparing");
  const completed = mockProjects.filter((p) => p.status === "confirmed" || p.status === "editing");

  const statusBadge = (status: string) => {
    if (status === "selecting") return <Badge variant="in_progress">진행 중</Badge>;
    if (status === "preparing") return <Badge variant="waiting">대기 중</Badge>;
    if (status === "confirmed" || status === "editing") return <Badge variant="completed">완료됨</Badge>;
    return <Badge>{status}</Badge>;
  };

  const daysLabel = (deadline: string) => {
    const d = differenceInDays(new Date(deadline), new Date());
    return d > 0 ? `D+${d}` : d === 0 ? "D-Day" : `D${d}`;
  };

  const getY = (p: (typeof mockProjects)[0]) => {
    if (p.status === "confirmed" || p.status === "editing") return p.requiredCount;
    if (p.status === "selecting") return Math.min(p.requiredCount, Math.floor(p.photoCount * 0.7));
    return 0;
  };

  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-2xl font-semibold text-white">
          안녕하세요, {mockPhotographer.name} 님 👋
        </h1>
        <Link href="/photographer/projects/new">
          <Button variant="primary" className="flex items-center gap-2">
            <PlusCircle className="h-5 w-5" />
            새 프로젝트
          </Button>
        </Link>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <Card className="p-5">
          <p className="text-sm text-zinc-400">진행 중</p>
          <p className="mt-1 text-2xl font-bold text-white font-mono">{stats.inProgress}</p>
        </Card>
        <Card className="p-5">
          <p className="text-sm text-zinc-400">완료됨</p>
          <p className="mt-1 text-2xl font-bold text-white font-mono">{stats.completed}</p>
        </Card>
        <Card className="p-5">
          <p className="text-sm text-zinc-400">대기 중</p>
          <p className="mt-1 text-2xl font-bold text-white font-mono">{stats.waiting}</p>
        </Card>
      </div>

      {inProgress.length > 0 && (
        <section>
          <h2 className="mb-4 text-lg font-medium text-zinc-300">진행 중</h2>
          <div className="space-y-4">
            {inProgress.map((p) => {
              const y = getY(p);
              return (
                <Link key={p.id} href={`/photographer/projects/${p.id}/settings`}>
                  <Card className="transition-colors hover:border-zinc-700">
                    <div className="flex flex-wrap items-center justify-between gap-4">
                      <div>
                        <p className="font-medium text-white">{p.name}</p>
                        <p className="text-sm text-zinc-400">{p.customerName}</p>
                      </div>
                      {statusBadge(p.status)}
                    </div>
                    <div className="mt-3 flex items-center gap-4 text-sm">
                      <span className="font-mono text-zinc-400">선택 {y}/{p.requiredCount}</span>
                      <ProgressBar value={y} max={p.requiredCount} className="flex-1 max-w-[200px]" />
                      <span className="text-zinc-500">{daysLabel(p.deadline)}</span>
                    </div>
                  </Card>
                </Link>
              );
            })}
          </div>
        </section>
      )}

      {waiting.length > 0 && (
        <section>
          <h2 className="mb-4 text-lg font-medium text-zinc-300">대기 중</h2>
          <div className="space-y-4">
            {waiting.map((p) => (
              <Link key={p.id} href={`/photographer/projects/${p.id}/settings`}>
                <Card className="transition-colors hover:border-zinc-700">
                  <div className="flex flex-wrap items-center justify-between gap-4">
                    <div>
                      <p className="font-medium text-white">{p.name}</p>
                      <p className="text-sm text-zinc-400">{p.customerName}</p>
                    </div>
                    {statusBadge(p.status)}
                  </div>
                  <div className="mt-3 flex items-center gap-4 text-sm">
                    <span className="font-mono text-zinc-400">0/{p.requiredCount}</span>
                    <ProgressBar value={0} max={p.requiredCount} className="flex-1 max-w-[200px]" />
                    <span className="text-zinc-500">{daysLabel(p.deadline)}</span>
                  </div>
                </Card>
              </Link>
            ))}
          </div>
        </section>
      )}

      {completed.length > 0 && (
        <section>
          <h2 className="mb-4 text-lg font-medium text-zinc-300">완료됨</h2>
          <div className="space-y-4">
            {completed.map((p) => (
              <Link key={p.id} href={`/photographer/projects/${p.id}/settings`}>
                <Card className="transition-colors hover:border-zinc-700">
                  <div className="flex flex-wrap items-center justify-between gap-4">
                    <div>
                      <p className="font-medium text-white">{p.name}</p>
                      <p className="text-sm text-zinc-400">{p.customerName}</p>
                    </div>
                    {statusBadge(p.status)}
                  </div>
                  <div className="mt-3 flex items-center gap-4 text-sm">
                    <span className="font-mono text-zinc-400">{p.requiredCount}/{p.requiredCount}</span>
                    <ProgressBar value={p.requiredCount} max={p.requiredCount} variant="success" className="flex-1 max-w-[200px]" />
                    <span className="text-zinc-500">{p.confirmedAt ? format(new Date(p.confirmedAt), "yyyy-MM-dd", { locale: ko }) : "-"}</span>
                  </div>
                </Card>
              </Link>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
