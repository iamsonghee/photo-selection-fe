"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { format } from "date-fns";
import { ko } from "date-fns/locale";
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
    if (project.status === "editing" || project.status === "editing_v2") {
      router.replace(`/c/${token}/locked`); return;
    }
    if (project.status === "confirmed") {
      router.replace(`/c/${token}/confirmed`); return;
    }
    if (project.status === "delivered") {
      router.replace(`/c/${token}/delivered`); return;
    }
  }, [project, token, router]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#09090d]">
        <p className="text-sm text-[#5a5f78]">로딩 중...</p>
      </div>
    );
  }

  if (!project) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#09090d]">
        <p className="text-sm text-[#5a5f78]">존재하지 않는 초대 링크입니다.</p>
      </div>
    );
  }

  if (["editing", "editing_v2", "confirmed", "delivered"].includes(project.status)) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#09090d]">
        <p className="text-sm text-[#5a5f78]">이동 중...</p>
      </div>
    );
  }

  /* ── reviewing_v1 / v2 ── */
  if (project.status === "reviewing_v1" || project.status === "reviewing_v2") {
    const total = reviewData?.photos.length ?? project.requiredCount ?? 0;
    const isV2 = project.status === "reviewing_v2";
    const revisionRemaining = Math.max(0, REVISION_LIMIT - (isV2 ? 1 : 0));

    return (
      <div className="min-h-screen bg-[#09090d] text-[#e8eaf0]">
        <div className="mx-auto max-w-[520px] px-4 py-8 pb-12">

          {/* Arrival hero */}
          <div className="mb-4 rounded-2xl border border-[#4f7eff]/40 bg-gradient-to-br from-[#0d1535] to-[#1a2a5e] px-6 py-8 text-center">
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-[#4f7eff]/15 border border-[#4f7eff]/30 text-[32px]">
              🎨
            </div>
            <h2 className="mb-2 text-[20px] font-bold text-white">보정본이 도착했습니다!</h2>
            <p className="mb-6 text-[13px] leading-relaxed text-[#8b8fa8]">
              {photographer?.name ?? "작가"}님이 보정본을 업로드했습니다.<br />
              사진을 확인하고 확정하거나 재보정을 요청해주세요.
            </p>

            {/* Stats */}
            <div className="mb-6 grid grid-cols-3 gap-2">
              {[
                { label: "선택된 사진", value: `${total}장`, color: "#4f7eff" },
                { label: "현재 버전", value: isV2 ? "v2" : "v1", color: "#e8eaf0" },
                { label: "재보정 가능", value: `${revisionRemaining}회`, color: "#f5a623" },
              ].map((s) => (
                <div key={s.label} className="rounded-xl border border-[#1e2236] bg-[#080a0e]/80 py-3 px-2">
                  <div className="mb-1 text-[10px] text-[#5a5f78]">{s.label}</div>
                  <div className="text-[18px] font-bold" style={{ color: s.color }}>{s.value}</div>
                </div>
              ))}
            </div>

            <Link href={`/c/${token}/review`}>
              <button
                type="button"
                className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-[#4f7eff] border border-[#4f7eff] px-6 py-3 text-[14px] font-semibold text-white active:opacity-80 w-full"
              >
                보정본 확인하기 →
              </button>
            </Link>
          </div>

          {/* Project info */}
          <div className="rounded-2xl border border-[#1e2236] bg-[#111318] p-5">
            <h3 className="mb-4 text-[11px] font-semibold uppercase tracking-wider text-[#5a5f78]">프로젝트 정보</h3>
            <div className="grid grid-cols-2 gap-2">
              {[
                { label: "프로젝트명", value: project.name },
                { label: "작가", value: photographer?.name ?? "—" },
                { label: "검토 기한", value: format(new Date(project.deadline), "yyyy-MM-dd") },
                { label: "작가 메모", value: reviewData?.globalPhotographerMemo ?? "—" },
              ].map((row) => (
                <div key={row.label} className="rounded-xl border border-[#1e2236] bg-[#1a1d24] p-3">
                  <div className="mb-1 text-[10px] text-[#5a5f78]">{row.label}</div>
                  <div className="text-[12px] font-medium text-[#e8eaf0]">{row.value}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  }

  /* ── selecting / preparing ── */
  const M = project.photoCount;
  const N = project.requiredCount;
  const ready = M >= N;
  const deadlineStr = format(new Date(project.deadline), "yyyy년 M월 d일", { locale: ko });

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-[#09090d] px-4 py-10">
      <div className="w-full max-w-[440px]">

        {/* Hero */}
        <div className="mb-5 text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-[#0f2a1e] border-2 border-[#2ed573] text-[32px]">
            🎉
          </div>
          <h1 className="mb-1 text-[22px] font-bold text-[#e8eaf0]">사진 셀렉 초대</h1>
          <p className="text-[13px] text-[#8b90a8]">
            {photographer?.name ?? "작가"}님이 사진 선택을 요청했습니다
          </p>
        </div>

        {/* Info card */}
        <div className="mb-3 rounded-2xl border border-[#1e2236] bg-[#111318] p-5">
          <h2 className="mb-4 text-[11px] font-semibold uppercase tracking-wider text-[#5a5f78]">프로젝트 정보</h2>
          <div className="space-y-2.5">
            {[
              { label: "프로젝트", value: project.name },
              { label: "고객명", value: project.customerName || "—" },
              { label: "선택할 사진 수", value: `${N}장` },
              { label: "기한", value: deadlineStr },
            ].map((row) => (
              <div key={row.label} className="flex items-center justify-between border-b border-[#1e2236] pb-2 last:border-0 last:pb-0">
                <span className="text-[12px] text-[#5a5f78]">{row.label}</span>
                <span className="text-[13px] font-medium text-[#e8eaf0]">{row.value}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Status card */}
        <div className={`mb-5 rounded-xl border px-4 py-3 ${ready ? "border-[#2ed573]/30 bg-[#0f2a1e]" : "border-[#f5a623]/30 bg-[#2a1a08]"}`}>
          <p className={`text-[13px] font-medium ${ready ? "text-[#2ed573]" : "text-[#f5a623]"}`}>
            {ready ? "✅ 사진이 모두 준비되었습니다" : "⏳ 작가가 아직 사진을 준비 중입니다"}
          </p>
        </div>

        {/* Photographer card */}
        {photographer && (
          <div className="mb-5 flex items-center gap-3 rounded-2xl border border-[#1e2236] bg-[#111318] px-4 py-3.5">
            <img
              src={getProfileImageUrl(photographer.profile_image_url)}
              alt=""
              className="h-11 w-11 shrink-0 rounded-full object-cover"
            />
            <div>
              <div className="text-[13px] font-semibold text-[#e8eaf0]">{photographer.name || "담당 작가"}</div>
              <div className="text-[11px] text-[#5a5f78]">담당 작가</div>
            </div>
          </div>
        )}

        {/* CTA */}
        <Link href={ready ? `/c/${token}/gallery` : "#"}>
          <button
            type="button"
            disabled={!ready}
            className={`w-full rounded-2xl py-4 text-[15px] font-semibold transition-opacity active:opacity-80 ${
              ready
                ? "bg-[#4f7eff] text-white"
                : "cursor-not-allowed bg-[#1e2236] text-[#5a5f78] opacity-60"
            }`}
          >
            {ready ? "선택 시작하기 →" : "사진 준비 중..."}
          </button>
        </Link>
      </div>
    </div>
  );
}
