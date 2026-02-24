"use client";

import { useEffect } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { format } from "date-fns";
import { Button, Card } from "@/components/ui";
import { getProjectByToken } from "@/lib/mock-data";

export default function InvitePageClient() {
  const router = useRouter();
  const params = useParams();
  const token = (params?.token as string) ?? "";
  const project = getProjectByToken(token);

  useEffect(() => {
    if (!project) return;
    if (project.status === "editing") {
      router.replace(`/c/${token}/locked`);
      return;
    }
    if (project.status === "confirmed") {
      router.replace(`/c/${token}/confirmed`);
      return;
    }
  }, [project, token, router]);

  if (!project) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-[#0a0b0d] px-4">
        <p className="text-zinc-400">존재하지 않는 초대 링크입니다.</p>
      </div>
    );
  }

  if (project.status === "editing" || project.status === "confirmed") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#0a0b0d]">
        <p className="text-zinc-400">이동 중...</p>
      </div>
    );
  }

  const M = project.photoCount;
  const N = project.requiredCount;
  const ready = M >= N;

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-[#0a0b0d] px-4 py-8">
      <Card className="w-full max-w-[440px] text-center">
        <h1 className="mb-6 text-2xl font-semibold text-white">
          🎉 초대를 받았습니다!
        </h1>
        <div className="space-y-2 text-left text-sm text-zinc-300">
          <p>프로젝트: <span className="font-medium text-white">{project.name}</span></p>
          <p>고객: {project.customerName || "(미입력)"}</p>
          <p>기한: {format(new Date(project.deadline), "yyyy-MM-dd")}</p>
          <p>선택할 사진 수: <span className="font-mono text-white">{N}장</span></p>
        </div>
        <div className="mt-6 rounded-lg border border-zinc-700 bg-zinc-800/50 p-4">
          {ready ? (
            <p className="text-success">✅ 사진이 모두 준비되었습니다</p>
          ) : (
            <p className="text-warning">⏳ 작가가 아직 사진을 준비 중입니다</p>
          )}
        </div>
        <p className="mt-4 text-xs text-zinc-500">작가 연락처: (목업)</p>
        <div className="mt-6">
          <Link href={ready ? `/c/${token}/gallery` : "#"}>
            <Button variant="primary" size="lg" fullWidth disabled={!ready}>
              선택 시작하기
            </Button>
          </Link>
        </div>
      </Card>
    </div>
  );
}
