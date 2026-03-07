"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { format } from "date-fns";
import { Button, Card } from "@/components/ui";
import { useSelectionOptional } from "@/contexts/SelectionContext";
import { getProfileImageUrl } from "@/lib/photographer";
import { getReviewMockData } from "@/lib/mock-data";

type PhotographerInfo = { name: string | null; profile_image_url: string | null } | null;

const REVISION_LIMIT = 2;

export default function InvitePageClient() {
  const router = useRouter();
  const params = useParams();
  const token = (params?.token as string) ?? "";
  const ctx = useSelectionOptional();
  const project = ctx?.project ?? null;
  const loading = ctx?.loading ?? true;
  const [photographer, setPhotographer] = useState<PhotographerInfo>(null);

  const reviewData = useMemo(() => {
    if (!project?.id) return null;
    return getReviewMockData(project.id);
  }, [project?.id]);

  useEffect(() => {
    if (!token) return;
    fetch(`/api/c/photographer?token=${encodeURIComponent(token)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => data && setPhotographer({ name: data.name ?? null, profile_image_url: data.profile_image_url ?? null }))
      .catch(() => {});
  }, [token]);

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

  if (loading) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-[#0a0b0d] px-4">
        <p className="text-zinc-400">로딩 중...</p>
      </div>
    );
  }

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

  // 보정본 검토 단계: 와이어프레임 ① 보정본 도착 페이지
  if (project.status === "reviewing_v1" || project.status === "reviewing_v2") {
    const total = reviewData?.photos.length ?? project.requiredCount ?? 0;
    const isV2 = project.status === "reviewing_v2";
    const revisionRemaining = Math.max(0, REVISION_LIMIT - (isV2 ? 1 : 0));

    return (
      <div className="min-h-screen bg-[#0a0b0d] text-[#e8eaf0]">
        <div className="mx-auto max-w-[860px] px-5 py-7">
          {/* notify-wrap (와이어프레임 ① 보정본 도착) */}
          <div
            className="rounded-[14px] border border-[#4f7eff] px-8 py-8 text-center mb-4"
            style={{
              background: "linear-gradient(135deg, #0d1535, #1a2a5e)",
            }}
          >
            <div className="text-[44px] mb-3">🎨</div>
            <h2 className="text-[22px] font-bold text-white mb-2">
              보정본이 도착했습니다!
            </h2>
            <p className="text-[13px] text-[#8b8fa8] leading-relaxed mb-6">
              {photographer?.name ?? "작가"}님이 보정본을 업로드했습니다.
              <br />
              사진을 확인하고 확정하거나 재보정을 요청해주세요.
            </p>
            <div className="flex justify-center gap-3 mb-6">
              <div className="rounded-[10px] border border-[#1e2028] bg-[#080a0e] px-6 py-3 text-center">
                <div className="text-[11px] text-[#5a5f7a] mb-1">선택된 사진</div>
                <div className="text-[20px] font-bold text-[#4f7eff]">{total}장</div>
              </div>
              <div className="rounded-[10px] border border-[#1e2028] bg-[#080a0e] px-6 py-3 text-center">
                <div className="text-[11px] text-[#5a5f7a] mb-1">현재 버전</div>
                <div className="text-[20px] font-bold text-[#e8eaf0]">
                  {isV2 ? "v2" : "v1"}
                </div>
              </div>
              <div className="rounded-[10px] border border-[#1e2028] bg-[#080a0e] px-6 py-3 text-center">
                <div className="text-[11px] text-[#5a5f7a] mb-1">재보정 가능</div>
                <div className="text-[20px] font-bold text-[#f5a623]">
                  {revisionRemaining}회
                </div>
              </div>
            </div>
            <Link href={`/c/${token}/review`}>
              <button
                type="button"
                className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-[#4f7eff] border border-[#4f7eff] text-white py-2 px-4 text-[13px] font-semibold"
              >
                보정본 확인하기 →
              </button>
            </Link>
          </div>

          {/* 프로젝트 정보 카드 */}
          <div className="rounded-xl border border-[#1e2028] bg-[#111318] p-5">
            <h3 className="text-[14px] font-bold mb-3.5">📋 프로젝트 정보</h3>
            <div className="grid grid-cols-2 gap-2.5">
              <div className="rounded-lg border border-[#1a1d28] bg-[#0e0f14] p-3">
                <div className="text-[11px] text-[#5a5f7a] mb-1">프로젝트명</div>
                <div className="text-[13px] font-semibold text-[#e8eaf0]">
                  {project.name}
                </div>
              </div>
              <div className="rounded-lg border border-[#1a1d28] bg-[#0e0f14] p-3">
                <div className="text-[11px] text-[#5a5f7a] mb-1">작가</div>
                <div className="text-[13px] font-semibold text-[#e8eaf0]">
                  {photographer?.name ?? "—"}
                </div>
              </div>
              <div className="rounded-lg border border-[#1a1d28] bg-[#0e0f14] p-3">
                <div className="text-[11px] text-[#5a5f7a] mb-1">검토 기한</div>
                <div className="text-[13px] font-semibold text-[#e8eaf0]">
                  {format(new Date(project.deadline), "yyyy-MM-dd")}
                </div>
              </div>
              <div className="rounded-lg border border-[#1a1d28] bg-[#0e0f14] p-3">
                <div className="text-[11px] text-[#5a5f7a] mb-1">작가 보정 메모</div>
                <div className="text-[13px] text-[#8b8fa8] font-normal">
                  {reviewData?.globalPhotographerMemo ?? "—"}
                </div>
              </div>
            </div>
          </div>
        </div>
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
        {photographer && (
          <div className="mt-4 flex items-center gap-3 rounded-lg border border-zinc-700 bg-zinc-800/50 p-3">
            <img
              src={getProfileImageUrl(photographer.profile_image_url)}
              alt=""
              className="h-10 w-10 shrink-0 rounded-full object-cover"
            />
            <span className="text-sm text-zinc-300">
              담당 작가: <span className="font-medium text-white">{photographer.name || "작가"}</span>
            </span>
          </div>
        )}
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
