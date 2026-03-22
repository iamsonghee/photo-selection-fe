"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useState, useEffect } from "react";
import { format } from "date-fns";
import { ko } from "date-fns/locale";
import { Aperture, CheckCircle2, Lock, Image as ImageIcon, Clock, Package } from "lucide-react";
import { useSelectionOptional } from "@/contexts/SelectionContext";
import { getProfileImageUrl } from "@/lib/photographer";

const CUSTOMER_CANCEL_MAX = 3;

type PhotographerInfo = {
  name: string | null;
  profile_image_url: string | null;
  bio: string | null;
  instagram_url: string | null;
  portfolio_url: string | null;
} | null;

const playfair: React.CSSProperties = { fontFamily: "'Playfair Display', Georgia, serif" };
const headerBg: React.CSSProperties = { background: "rgba(13,30,40,0.9)", backdropFilter: "blur(12px)" };

function PageHeader({ right }: { right?: React.ReactNode }) {
  return (
    <header className="sticky top-0 z-50 flex h-12 items-center justify-between border-b border-[#1e2236] px-4" style={headerBg}>
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

export default function ConfirmedPage() {
  const params = useParams();
  const router = useRouter();
  const token = (params?.token as string) ?? "";
  const ctx = useSelectionOptional();
  const project = ctx?.project ?? null;
  const loading = ctx?.loading ?? true;
  const [mounted, setMounted] = useState(false);
  const [photographer, setPhotographer] = useState<PhotographerInfo>(null);
  const [cancelModalOpen, setCancelModalOpen] = useState(false);
  const [cancelling, setCancelling] = useState(false);

  useEffect(() => { setMounted(true); }, []);

  useEffect(() => {
    if (!token) return;
    fetch(`/api/c/photographer?token=${encodeURIComponent(token)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => data && setPhotographer({
        name: data.name ?? null,
        profile_image_url: data.profile_image_url ?? null,
        bio: data.bio ?? null,
        instagram_url: data.instagram_url ?? null,
        portfolio_url: data.portfolio_url ?? null,
      }))
      .catch(() => {});
  }, [token]);

  useEffect(() => {
    if (!project || !token) return;
    if (project.status === "selecting") { router.replace(`/c/${token}/gallery`); return; }
    if (project.status === "reviewing_v1" || project.status === "reviewing_v2") {
      router.replace(`/c/${token}`);
    }
  }, [project?.status, token, router]);

  if (!mounted || loading) {
    return <div className="flex min-h-screen items-center justify-center bg-[#09090d]"><p className="text-sm text-[#5a5f78]">불러오는 중...</p></div>;
  }
  if (!project) {
    return <div className="flex min-h-screen items-center justify-center bg-[#09090d]"><p className="text-sm text-[#5a5f78]">존재하지 않는 초대 링크입니다.</p></div>;
  }
  if (project.status === "selecting" || project.status === "reviewing_v1" || project.status === "reviewing_v2") {
    return <div className="flex min-h-screen items-center justify-center bg-[#09090d]"><p className="text-sm text-[#5a5f78]">이동 중...</p></div>;
  }

  const N = project.requiredCount ?? 0;
  const M = project.photoCount;
  const cancelCount = project.customerCancelCount ?? 0;
  const atCancelLimit = cancelCount >= CUSTOMER_CANCEL_MAX;
  const remainingCancels = Math.max(0, CUSTOMER_CANCEL_MAX - cancelCount);
  const confirmedDate = project.confirmedAt
    ? format(new Date(project.confirmedAt), "yyyy년 M월 d일 HH:mm", { locale: ko })
    : "—";

  const handleConfirmCancel = async () => {
    if (!project?.id || !token) return;
    setCancelling(true);
    try {
      const res = await fetch("/api/c/cancel-confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, project_id: project.id }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        console.error("[확정 취소]", (data as { error?: string }).error ?? res.statusText);
        setCancelling(false); return;
      }
      setCancelModalOpen(false);
      if (typeof window !== "undefined") window.location.replace(`/c/${token}/gallery`);
    } catch (e) {
      console.error(e);
    } finally {
      setCancelling(false);
    }
  };

  const steps = [
    { icon: <CheckCircle2 className="h-4 w-4" />, label: "사진 셀렉 완료", desc: `${N}장의 사진을 최종 확정했습니다`, badge: "완료", badgeColor: "#2ed573", badgeBg: "#0f2a1e", done: true },
    { icon: <ImageIcon className="h-4 w-4" />, label: "보정 작업", desc: "작가님이 선택하신 사진을 보정합니다. 예상 기간 5~7일", badge: "진행 중", badgeColor: "#4f7eff", badgeBg: "#0d1535", done: false },
    { icon: <Package className="h-4 w-4" />, label: "결과물 납품", desc: "보정 완료된 사진을 고해상도로 전달드립니다", badge: "대기 중", badgeColor: "#5a5f78", badgeBg: "#1a1d24", done: false },
    { icon: <CheckCircle2 className="h-4 w-4" />, label: "완료", desc: "모든 작업이 마무리됩니다", badge: "대기 중", badgeColor: "#5a5f78", badgeBg: "#1a1d24", done: false },
  ];

  return (
    <div className="min-h-screen bg-[#09090d] text-[#e8eaf0]">
      <PageHeader right={project.name} />

      <div className="mx-auto max-w-[520px] px-4 pt-8 pb-16">
        {/* Hero */}
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full border-2 border-[#2ed573] bg-[#0f2a1e]">
            <CheckCircle2 className="h-8 w-8 text-[#2ed573]" />
          </div>
          <h1 className="mb-1 text-[22px] font-bold text-[#e8eaf0]" style={playfair}>확정이 완료됐습니다!</h1>
          <p className="mb-1 text-[13px] text-[#8b90a8]">작가가 보정을 시작합니다</p>
          <p className="text-[12px] text-[#5a5f78]">{confirmedDate}</p>
        </div>

        {/* Summary */}
        <section className="mb-3 rounded-2xl border border-[#1e2236] bg-[#111318] p-5">
          <h2 className="mb-4 text-[11px] font-semibold uppercase tracking-wider text-[#5a5f78]">선택 요약</h2>
          <div className="mb-3 flex items-center justify-center gap-2">
            <span className="font-mono text-[40px] font-bold text-[#2ed573]">{N}</span>
            <span className="font-mono text-[28px] text-[#3a3f55]">/</span>
            <span className="font-mono text-[28px] font-bold text-[#5a5f78]">{M}</span>
          </div>
          <div className="mb-4 flex justify-center gap-4 text-[11px] text-[#8b90a8]">
            <span className="text-[#2ed573]">선택한 사진</span>
            <span className="text-[#3a3f55]">|</span>
            <span>전체 사진</span>
          </div>
          <Link
            href={`/c/${token}/locked`}
            className="flex h-11 w-full items-center justify-center gap-2 rounded-xl border border-[#252b3d] bg-[#1a1d24] text-[13px] text-[#8b90a8] transition-colors hover:border-[#4f7eff] hover:text-[#4f7eff]"
          >
            <Lock className="h-3.5 w-3.5" />
            선택한 사진 보기 (읽기 전용)
          </Link>
        </section>

        {/* Timeline */}
        <section className="mb-3 rounded-2xl border border-[#1e2236] bg-[#111318] p-5">
          <h2 className="mb-4 text-[11px] font-semibold uppercase tracking-wider text-[#5a5f78]">다음 진행 과정</h2>
          <div>
            {steps.map((step, i) => (
              <div key={step.label} className="flex gap-3">
                <div className="flex flex-col items-center">
                  <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full border-2 ${step.done ? "border-[#2ed573] bg-[#0f2a1e] text-[#2ed573]" : "border-[#252b3d] bg-[#1a1d24] text-[#5a5f78]"}`}>
                    {step.icon}
                  </div>
                  {i < steps.length - 1 && <div className="my-1 w-0.5 flex-1 min-h-[16px] bg-[#1e2236]" />}
                </div>
                <div className="pb-5 pt-1 flex-1 last:pb-1">
                  <div className="text-[13px] font-semibold mb-0.5">{step.label}</div>
                  <div className="text-[11px] text-[#8b90a8] leading-relaxed">{step.desc}</div>
                  <span className="mt-1.5 inline-block rounded-full px-2 py-0.5 text-[10px]" style={{ color: step.badgeColor, background: step.badgeBg }}>
                    {step.badge}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Photographer */}
        <section className="rounded-2xl border border-[#1e2236] bg-[#111318] p-5">
          <h2 className="mb-4 text-[11px] font-semibold uppercase tracking-wider text-[#5a5f78]">담당 작가</h2>
          <div className="flex items-center gap-3 mb-3">
            <img src={getProfileImageUrl(photographer?.profile_image_url)} alt="" className="h-12 w-12 shrink-0 rounded-full object-cover" />
            <div>
              <div className="text-[15px] font-bold">{photographer?.name || "담당 작가"}</div>
              <div className="text-[11px] text-[#8b90a8]">선택하신 사진을 꼼꼼히 보정해 드립니다</div>
            </div>
          </div>
          {(photographer?.instagram_url || photographer?.portfolio_url) && (
            <div className="mb-3 flex flex-wrap gap-2">
              {photographer?.instagram_url && (
                <a href={photographer.instagram_url} target="_blank" rel="noopener noreferrer" className="rounded-full border border-[#252b3d] bg-[#1a1d24] px-3 py-1.5 text-[11px] text-[#8b90a8] hover:border-[#4f7eff] hover:text-[#4f7eff]">
                  인스타그램
                </a>
              )}
              {photographer?.portfolio_url && (
                <a href={photographer.portfolio_url} target="_blank" rel="noopener noreferrer" className="rounded-full border border-[#252b3d] bg-[#1a1d24] px-3 py-1.5 text-[11px] text-[#8b90a8] hover:border-[#4f7eff] hover:text-[#4f7eff]">
                  포트폴리오
                </a>
              )}
            </div>
          )}
          <div className="rounded-xl border-l-[3px] border-l-[#4f7eff] bg-[#1a1d24] p-3.5 text-[12px] text-[#8b90a8] leading-relaxed">
            {photographer?.bio?.trim() || "소중한 순간을 함께할 수 있어 영광입니다. 남겨주신 코멘트 꼼꼼히 반영해서 예쁘게 보정해 드릴게요"}
          </div>

          {project.status === "confirmed" && (
            <div className="mt-5 border-t border-[#1e2236] pt-5 space-y-2">
              <p className="text-center text-[11px] text-[#8b90a8]">
                확정 취소 남은 횟수 <span className="font-mono text-[#e8eaf0]">{remainingCancels}회</span>
              </p>
              {atCancelLimit && (
                <p className="text-center text-[11px] text-[#5a5f78]">확정 취소는 최대 3회까지 가능합니다</p>
              )}
              <button
                type="button"
                disabled={atCancelLimit}
                onClick={() => !atCancelLimit && setCancelModalOpen(true)}
                className="flex h-11 w-full items-center justify-center rounded-xl border border-[#252b3d] text-[13px] text-[#8b90a8] transition-colors hover:border-[#ff4757] hover:text-[#ff4757] disabled:opacity-40 disabled:pointer-events-none"
              >
                확정 취소
              </button>
            </div>
          )}
        </section>
      </div>

      <PageFooter />

      {/* Cancel modal */}
      {cancelModalOpen && project.status === "confirmed" && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-4 sm:items-center">
          <div className="w-full max-w-sm rounded-2xl border border-[#252b3d] bg-[#111318] p-6 shadow-xl">
            <h3 className="mb-2 text-[16px] font-bold text-[#e8eaf0]">확정 취소</h3>
            <p className="mb-6 text-[13px] leading-relaxed text-[#8b90a8]">
              확정을 취소하고 다시 선택하시겠습니까?<br />
              남은 횟수 <span className="font-medium text-[#e8eaf0]">{remainingCancels}회</span>
            </p>
            <div className="flex gap-2">
              <button type="button" onClick={() => setCancelModalOpen(false)} className="flex h-11 flex-1 items-center justify-center rounded-xl border border-[#252b3d] text-[13px] text-[#8b90a8]">
                취소
              </button>
              <button type="button" onClick={handleConfirmCancel} disabled={cancelling} className="flex h-11 flex-1 items-center justify-center rounded-xl bg-[#4f7eff] text-[13px] font-semibold text-white disabled:opacity-60">
                {cancelling ? "처리 중..." : "예, 다시 선택할게요"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
