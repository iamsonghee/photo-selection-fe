"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { format } from "date-fns";
import { ko } from "date-fns/locale";
import { Aperture, Lock } from "lucide-react";
import { useSelectionOptional } from "@/contexts/SelectionContext";
import type { ColorTag } from "@/types";

const CUSTOMER_CANCEL_MAX = 3;

const COLOR_HEX: Record<ColorTag, string> = {
  red: "#ff4757",
  yellow: "#f5a623",
  green: "#2ed573",
  blue: "#4f7eff",
  purple: "#9c27b0",
};

function getTestImageUrl(photoId: string, size = "400/300") {
  const seed = photoId.replace(/\D/g, "") || "1";
  return `https://picsum.photos/seed/${seed}/${size}`;
}

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

export default function LockedPage() {
  const params = useParams();
  const router = useRouter();
  const token = (params?.token as string) ?? "";
  const ctx = useSelectionOptional();
  const project = ctx?.project ?? null;
  const loading = ctx?.loading ?? true;
  const [mounted, setMounted] = useState(false);
  const [cancelModalOpen, setCancelModalOpen] = useState(false);
  const [cancelling, setCancelling] = useState(false);

  useEffect(() => { setMounted(true); }, []);

  useEffect(() => {
    if (!project || !token) return;
    if (project.status === "selecting") {
      router.replace(`/c/${token}/gallery`);
    }
  }, [project?.status, token, router]);

  const { photos, N, photoStates } = useMemo(() => {
    if (!project || !ctx?.photos?.length || !ctx?.selectedIds?.size) {
      return { photos: [] as import("@/types").Photo[], N: 0, photoStates: ctx?.photoStates ?? {} };
    }
    const idSet = ctx.selectedIds;
    const filtered = ctx.photos.filter((p) => idSet.has(p.id));
    filtered.sort((a, b) => a.orderIndex - b.orderIndex);
    return { photos: filtered, N: filtered.length, photoStates: ctx.photoStates ?? {} };
  }, [project, ctx?.photos, ctx?.selectedIds, ctx?.photoStates]);

  const cancelCount = project?.customerCancelCount ?? 0;
  const remainingCancels = Math.max(0, CUSTOMER_CANCEL_MAX - cancelCount);
  const atCancelLimit = cancelCount >= CUSTOMER_CANCEL_MAX;
  const canCancel = project?.status === "confirmed" && !atCancelLimit;

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

  if (!mounted || loading) {
    return <div className="flex min-h-screen items-center justify-center bg-[#09090d]"><p className="text-sm text-[#5a5f78]">불러오는 중...</p></div>;
  }
  if (!project) {
    return <div className="flex min-h-screen items-center justify-center bg-[#09090d]"><p className="text-sm text-[#5a5f78]">존재하지 않는 초대 링크입니다.</p></div>;
  }
  if (project.status === "selecting") {
    return <div className="flex min-h-screen items-center justify-center bg-[#09090d]"><p className="text-sm text-[#5a5f78]">이동 중...</p></div>;
  }

  const M = project.photoCount;
  const confirmedDate = project.confirmedAt
    ? format(new Date(project.confirmedAt), "yyyy년 M월 d일 HH:mm", { locale: ko })
    : "—";

  const isEditing = project.status === "editing" || project.status === "editing_v2";
  const isConfirmed = project.status === "confirmed";

  return (
    <div className="min-h-screen bg-[#09090d] text-[#e8eaf0]">
      <PageHeader right={project.name} />

      {/* Lock banner */}
      <div className={`flex items-center gap-2 border-b px-4 py-2.5 text-[12px] ${isEditing ? "border-[#ff4757]/20 bg-[#ff4757]/8 text-[#ff4757]" : "border-[#1e2236] bg-[#111318]/95 text-[#8b90a8]"}`}>
        <Lock className="h-3.5 w-3.5 shrink-0" />
        {isEditing
          ? "보정 작업이 시작되어 선택을 변경할 수 없습니다."
          : isConfirmed
            ? "확정 완료 · 읽기 전용"
            : "현재 상태에서는 확정 취소를 사용할 수 없습니다."}
      </div>

      {/* Sub header: progress */}
      <div className="flex items-center justify-between border-b border-[#1e2236] bg-[#111318]/80 px-4 py-2.5">
        <div className="text-[12px] text-[#8b90a8]">선택한 사진 · 읽기 전용</div>
        <span className="font-mono text-[12px] font-semibold text-[#2ed573]">{N} / {M}</span>
      </div>

      {/* Photo grid */}
      <div className="grid grid-cols-2 gap-2 p-4 pb-32 sm:grid-cols-3 md:grid-cols-4">
        {photos.map((photo) => {
          const state = photoStates[photo.id] ?? photo.tag;
          const rating = state?.rating ?? photo.tag?.star;
          const colorTag = state?.color ?? photo.tag?.color;
          const hasTag = (rating != null && rating > 0) || colorTag != null;
          return (
            <div key={photo.id} className="relative aspect-[4/3] cursor-default overflow-hidden rounded-xl border-2 border-[#2ed573]/30 bg-[#1a1d24]">
              <img src={photo.url || getTestImageUrl(photo.id)} alt="" className="block h-full w-full object-cover" />
              <div className="absolute inset-0 cursor-not-allowed" aria-hidden />
              <div className="absolute right-1.5 top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-[#2ed573] text-[10px] text-white">
                ✓
              </div>
              {hasTag && (
                <div className="absolute bottom-1.5 left-1.5 flex items-center gap-1">
                  {rating != null && rating > 0 && (
                    <span className="rounded bg-black/65 px-1.5 py-0.5 text-[10px] text-[#f5a623]">{"★".repeat(rating)}</span>
                  )}
                  {colorTag && (
                    <span className="h-2.5 w-2.5 rounded-full border border-white/40" style={{ backgroundColor: COLOR_HEX[colorTag] }} />
                  )}
                </div>
              )}
              <div className="absolute bottom-1.5 right-1.5 rounded bg-black/60 px-1.5 py-0.5 font-mono text-[9px] text-[#8b90a8]">
                #{photo.orderIndex}
              </div>
            </div>
          );
        })}
      </div>

      {/* Fixed bottom bar */}
      <div className="fixed bottom-0 left-0 right-0 z-20 border-t border-[#1e2236] bg-[#09090d]/95 px-4 py-4 backdrop-blur">
        <div className="mx-auto max-w-[520px]">
          <div className="mb-2 flex items-center justify-between">
            <div>
              <div className="font-mono text-[13px] font-semibold text-[#2ed573]">{N}장 확정 완료</div>
              <div className="text-[11px] text-[#5a5f78]">{confirmedDate} 확정</div>
            </div>
            {project.status === "confirmed" && (
              <div className="text-right text-[11px] text-[#5a5f78]">남은 취소 {remainingCancels}회</div>
            )}
          </div>
          <div className="mb-3 h-1 overflow-hidden rounded-full bg-[#1e2236]">
            <div className="h-full rounded-full bg-[#2ed573]" style={{ width: M ? `${(N / M) * 100}%` : "100%" }} />
          </div>
          {project.status === "confirmed" && (
            <>
              {atCancelLimit && <p className="mb-2 text-center text-[11px] text-[#5a5f78]">확정 취소는 최대 3회까지 가능합니다</p>}
              <button
                type="button"
                disabled={!canCancel}
                onClick={() => canCancel && setCancelModalOpen(true)}
                className="flex h-11 w-full items-center justify-center rounded-xl border border-[#252b3d] text-[13px] text-[#8b90a8] transition-colors hover:border-[#ff4757] hover:text-[#ff4757] disabled:pointer-events-none disabled:opacity-40"
              >
                확정 취소
              </button>
            </>
          )}
          {isEditing && <div className="text-center text-[12px] text-[#5a5f78]">보정 진행 중</div>}
        </div>
      </div>

      <PageFooter />

      {/* Cancel modal */}
      {cancelModalOpen && (
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
