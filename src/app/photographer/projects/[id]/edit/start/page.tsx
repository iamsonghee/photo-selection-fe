import Link from "next/link";
import { AlertTriangle } from "lucide-react";
import { Button, Card } from "@/components/ui";
import { mockProjects } from "@/lib/mock-data";

export default async function EditStartPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const project = mockProjects.find((p) => p.id === id);
  if (!project) return null;

  return (
    <div className="mx-auto max-w-[440px] space-y-8">
      <div className="flex items-center gap-2 rounded-lg border border-danger/50 bg-danger/10 px-4 py-3 text-danger">
        <AlertTriangle className="h-5 w-5 shrink-0" />
        <span className="font-semibold">🚨 보정 시작 전 반드시 확인하세요</span>
      </div>

      <Card>
        <ol className="list-decimal space-y-3 pl-5 text-sm text-zinc-300">
          <li>보정 시작 후 고객은 &quot;최종확정&quot;을 취소할 수 없습니다</li>
          <li>선택된 사진이 고정됩니다 (추가/삭제 불가)</li>
          <li>고객은 읽기 전용 모드로 전환됩니다</li>
        </ol>
      </Card>

      <div className="flex gap-3">
        <Link href={`/photographer/projects/${id}/results`} className="flex-1">
          <Button variant="outline" fullWidth>
            취소
          </Button>
        </Link>
        <Link href={`/photographer/projects/${id}/edit/progress`} className="flex-1">
          <Button variant="danger" fullWidth>
            보정 시작 확인
          </Button>
        </Link>
      </div>
    </div>
  );
}
