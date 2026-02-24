import Link from "next/link";
import { format, differenceInDays } from "date-fns";
import { PlusCircle } from "lucide-react";
import { Button, Card, Badge, ProgressBar } from "@/components/ui";
import { mockProjects } from "@/lib/mock-data";

export default function ProjectsPage() {
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
        <h1 className="text-2xl font-semibold text-white">프로젝트</h1>
        <Link href="/photographer/projects/new">
          <Button variant="primary" className="flex items-center gap-2">
            <PlusCircle className="h-5 w-5" />
            새 프로젝트
          </Button>
        </Link>
      </div>

      <div className="space-y-6">
        {mockProjects.map((p) => {
          const y = getY(p);
          return (
            <Link key={p.id} href={`/photographer/projects/${p.id}/settings`}>
              <Card className="transition-colors hover:border-zinc-700">
                <div className="flex flex-wrap items-center justify-between gap-4">
                  <div>
                    <p className="font-medium text-white">{p.name}</p>
                    <p className="text-sm text-zinc-400">{p.customerName} · 기한 {format(new Date(p.deadline), "yyyy-MM-dd")}</p>
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
    </div>
  );
}
