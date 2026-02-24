"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { format } from "date-fns";
import { ko } from "date-fns/locale";
import { differenceInDays } from "date-fns";
import { MessageCircle, Mail } from "lucide-react";
import { Button, Card, Badge, ProgressBar } from "@/components/ui";
import { mockProjects, getActivityLogs } from "@/lib/mock-data";
import { ConfirmCancelButton } from "../ConfirmCancelButton";

export default function ProgressPage() {
  const params = useParams();
  const id = params.id as string;
  const project = mockProjects.find((p) => p.id === id);
  if (!project) return null;

  const Y =
    project.status === "selecting"
      ? Math.min(project.requiredCount, Math.floor(project.photoCount * 0.7))
      : project.requiredCount;
  const N = project.requiredCount;
  const daysLeft = differenceInDays(new Date(project.deadline), new Date());
  const logs = getActivityLogs(id);
  const isConfirmed = Y === N;

  return (
    <div className="mx-auto max-w-2xl space-y-8">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-white">고객 진행도</h1>
        <Link href={`/photographer/projects/${id}/settings`}>
          <Button variant="ghost">설정</Button>
        </Link>
      </div>

      <Card>
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="font-medium text-white">{project.customerName}</p>
            <Badge variant={isConfirmed ? "completed" : "in_progress"}>
              {isConfirmed ? "✅ 최종확정 완료" : "🟡 진행 중"}
            </Badge>
          </div>
          <div className="text-right text-sm">
            <p className="font-mono text-zinc-300">
              {Y}/{N}
            </p>
            <p className="text-zinc-500">기한까지 {daysLeft > 0 ? `${daysLeft}일` : "마감"}</p>
          </div>
        </div>
        <ProgressBar
          value={Y}
          max={N}
          variant={isConfirmed ? "success" : "default"}
          className="mt-3"
          showLabel
        />
        <p className="mt-2 text-xs text-zinc-500">
          최종확정: {isConfirmed ? "완료" : "대기 중"} · 마지막 활동: 5분 전
        </p>
        <div className="mt-4 flex gap-2">
          <Button
            variant="outline"
            size="sm"
            className="flex items-center gap-2"
            onClick={() => console.log("카카오톡 리마인더")}
          >
            <MessageCircle className="h-4 w-4" />
            카카오톡으로 리마인더 보내기
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="flex items-center gap-2"
            onClick={() => console.log("이메일 리마인더")}
          >
            <Mail className="h-4 w-4" />
            이메일로 리마인더 보내기
          </Button>
        </div>
        {isConfirmed && (
          <div className="mt-4 flex flex-wrap gap-2">
            <Link href={`/photographer/projects/${id}/results`}>
              <Button variant="primary">결과 검토하기</Button>
            </Link>
            <ConfirmCancelButton projectId={id} />
          </div>
        )}
      </Card>

      <Card>
        <h3 className="mb-4 text-base font-medium text-zinc-200">활동 로그</h3>
        <ul className="space-y-0">
          {logs.length === 0 ? (
            <li className="py-2 text-sm text-zinc-500">활동 없음</li>
          ) : (
            logs.map((log) => (
              <li
                key={log.id}
                className="flex items-center gap-4 border-b border-zinc-800 py-3 last:border-0"
              >
                <span className="w-24 font-mono text-xs text-zinc-500">
                  {format(new Date(log.createdAt), "MM/dd HH:mm", { locale: ko })}
                </span>
                <span className="text-sm text-zinc-300">{log.label}</span>
              </li>
            ))
          )}
        </ul>
      </Card>
    </div>
  );
}
