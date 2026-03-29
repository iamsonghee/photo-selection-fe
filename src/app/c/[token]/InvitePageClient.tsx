"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { Aperture, Camera, User, Calendar, ImageIcon } from "lucide-react";
import { format } from "date-fns";
import { ko } from "date-fns/locale";
import { useSelectionOptional } from "@/contexts/SelectionContext";
import { getProfileImageUrl } from "@/lib/photographer";
import { getReviewMockData } from "@/lib/mock-data";

type PhotographerInfo = { name: string | null; profile_image_url: string | null } | null;
const REVISION_LIMIT = 2;

const playfair: React.CSSProperties = { fontFamily: "'Playfair Display', Georgia, serif" };
const headerBg: React.CSSProperties = { background: "rgba(13,30,40,0.9)", backdropFilter: "blur(12px)" };
const gridBg: React.CSSProperties = {
  backgroundImage:
    "linear-gradient(rgba(102,155,188,0.04) 1px, transparent 1px), linear-gradient(90deg, rgba(102,155,188,0.04) 1px, transparent 1px)",
  backgroundSize: "48px 48px",
};

function PageHeader({ right }: { right?: React.ReactNode }) {
  return (
    <header
      className="sticky top-0 z-50 flex h-12 items-center justify-between border-b border-[#1e2236] px-4"
      style={headerBg}
    >
      <div className="flex items-center gap-2">
        <Aperture className="h-4 w-4 text-[#4f7eff]" />
        <span className="text-[15px] font-bold text-[#e8eaf0]" style={playfair}>A컷</span>
      </div>
      {right && <div className="text-[12px] text-[#8b90a8]">{right}</div>}
    </header>
  );
}

function PageFooter() {
  return (
    <footer className="py-5 text-center text-[11px] text-[#3a3f55]">
      © 2026 A컷 · Acut
    </footer>
  );
}

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
    const deadlineStr = format(new Date(project.deadline), "yyyy.MM.dd", { locale: ko });

    return (
      <div className="min-h-screen bg-[#09090d] text-[#e8eaf0]" style={gridBg}>
        <PageHeader right={project.name} />
        <div className="flex min-h-[calc(100vh-48px)] flex-col items-center justify-center px-4 py-8">
          <div className="w-full max-w-[440px] rounded-2xl border border-[#1e2236] bg-[#111318]/95 p-6 md:p-8" style={{ backdropFilter: "blur(8px)" }}>
            <div className="mb-6 flex justify-center">
              <div className="flex items-center gap-2">
                <Aperture className="h-6 w-6 text-[#4f7eff]" />
                <span className="text-[20px] font-bold text-[#e8eaf0]" style={playfair}>A컷</span>
              </div>
            </div>
            <h1 className="mb-1 text-center text-[22px] font-bold text-[#e8eaf0]" style={playfair}>
              보정본이 도착했습니다
            </h1>
            <p className="mb-6 text-center text-[13px] text-[#8b90a8]">
              {photographer?.name ?? "작가"}님이 보정본을 업로드했습니다
            </p>
            <div className="mb-6 space-y-3">
              {[
                { icon: <Camera className="h-4 w-4 text-[#4f7eff]" />, label: project.name },
                { icon: <User className="h-4 w-4 text-[#4f7eff]" />, label: photographer?.name ?? "—" },
                { icon: <Calendar className="h-4 w-4 text-[#4f7eff]" />, label: `검토 기한 ${deadlineStr}` },
                { icon: <ImageIcon className="h-4 w-4 text-[#4f7eff]" />, label: `${total}장 · 재보정 ${revisionRemaining}회 남음 (${isV2 ? "v2" : "v1"})` },
              ].map((row, i) => (
                <div key={i} className="flex items-center gap-3 text-[13px] text-[#e8eaf0]">
                  {row.icon}<span>{row.label}</span>
                </div>
              ))}
            </div>
            <div className="mb-5 border-t border-[#1e2236]" />
            <Link href={`/c/${token}/review`}>
              <button type="button" className="flex h-12 w-full items-center justify-center rounded-xl bg-[#4f7eff] text-[14px] font-semibold text-white transition-opacity hover:opacity-90 active:opacity-80">
                보정본 검토하기
              </button>
            </Link>
            {photographer && (
              <div className="mt-4 flex items-center gap-3 rounded-xl border border-[#1e2236] bg-[#1a1d24] p-3">
                <img src={getProfileImageUrl(photographer.profile_image_url)} alt="" className="h-9 w-9 shrink-0 rounded-full object-cover" />
                <div>
                  <div className="text-[12px] font-semibold text-[#e8eaf0]">{photographer.name || "담당 작가"}</div>
                  <div className="text-[11px] text-[#5a5f78]">담당 작가</div>
                </div>
              </div>
            )}
          </div>
          <PageFooter />
        </div>
      </div>
    );
  }

  /* ── selecting / preparing ── */
  const M = project.photoCount;
  const N = project.requiredCount;
  const ready = project.status === "selecting";
  const deadlineStr = format(new Date(project.deadline), "yyyy.MM.dd", { locale: ko });

  return (
    <div className="min-h-screen bg-[#09090d] text-[#e8eaf0]" style={gridBg}>
      <PageHeader right={project.name} />
      <div className="flex min-h-[calc(100vh-48px)] flex-col items-center justify-center px-4 py-8">
        <div className="w-full max-w-[440px] rounded-2xl border border-[#1e2236] bg-[#111318]/95 p-6 md:p-8" style={{ backdropFilter: "blur(8px)" }}>
          <div className="mb-6 flex justify-center">
            <div className="flex items-center gap-2">
              <Aperture className="h-6 w-6 text-[#4f7eff]" />
              <span className="text-[20px] font-bold text-[#e8eaf0]" style={playfair}>A컷</span>
            </div>
          </div>
          <h1 className="mb-5 text-center text-[22px] font-bold leading-tight text-[#e8eaf0]" style={playfair}>
            {project.customerName ? `${project.customerName}님,` : ""}
            {project.customerName ? <br /> : null}
            사진이 준비됐어요!
          </h1>
          <div className="mb-6 space-y-3">
            {[
              { icon: <Camera className="h-4 w-4 text-[#4f7eff]" />, label: project.name },
              { icon: <User className="h-4 w-4 text-[#4f7eff]" />, label: photographer?.name ?? "담당 작가" },
              { icon: <Calendar className="h-4 w-4 text-[#4f7eff]" />, label: `셀렉 기한 ${deadlineStr}` },
              { icon: <ImageIcon className="h-4 w-4 text-[#4f7eff]" />, label: `${M}장 중 ${N}장을 선택해주세요` },
            ].map((row, i) => (
              <div key={i} className="flex items-center gap-3 text-[13px] text-[#e8eaf0]">
                {row.icon}<span>{row.label}</span>
              </div>
            ))}
          </div>
          <div className={`mb-5 rounded-xl border px-4 py-2.5 text-[12px] font-medium ${ready ? "border-[#2ed573]/30 bg-[#0f2a1e] text-[#2ed573]" : "border-[#f5a623]/30 bg-[#2a1a08] text-[#f5a623]"}`}>
            {ready ? "사진이 모두 준비되었습니다" : "작가가 아직 사진을 준비 중입니다"}
          </div>
          <div className="mb-5 border-t border-[#1e2236]" />
          <Link href={ready ? `/c/${token}/gallery` : "#"}>
            <button type="button" disabled={!ready} className="flex h-12 w-full items-center justify-center rounded-xl bg-[#4f7eff] text-[14px] font-semibold text-white transition-opacity hover:opacity-90 active:opacity-80 disabled:cursor-not-allowed disabled:opacity-40">
              갤러리 보기 시작 →
            </button>
          </Link>
          <p className="mt-3 text-center text-[12px] text-[#5a5f78]">마음에 드는 사진 {N}장을 선택해주세요</p>
          {photographer && (
            <div className="mt-5 flex items-center gap-3 rounded-xl border border-[#1e2236] bg-[#1a1d24] p-3">
              <img src={getProfileImageUrl(photographer.profile_image_url)} alt="" className="h-9 w-9 shrink-0 rounded-full object-cover" />
              <div>
                <div className="text-[12px] font-semibold text-[#e8eaf0]">{photographer.name || "담당 작가"}</div>
                <div className="text-[11px] text-[#5a5f78]">담당 작가</div>
              </div>
            </div>
          )}
        </div>
        <PageFooter />
      </div>
    </div>
  );
}
