"use client";

import { PageLoader } from "@/components/ui/PageLoader";

import { useParams, useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { format } from "date-fns";
import { ko } from "date-fns/locale";
import { Check, AlertTriangle, RefreshCw, Clock, Lock } from "lucide-react";
import { useSelectionOptional } from "@/contexts/SelectionContext";
import { BrandLogoBar } from "@/components/BrandLogo";
import { CustomerHeader } from "@/components/customer/CustomerHeader";
import { CustomerFooter } from "@/components/customer/CustomerFooter";
import type { ReviewResultPhoto } from "@/app/api/c/review-result/route";

const CUSTOMER_CANCEL_MAX = 3;

/* ── status badge (워크플로우와 동일) ── */
function StatusBadge({ status }: { status: "approved" | "revision_requested" | "pending" | null }) {
  if (status === "approved") return (
    <span className="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
      <Check size={10} />확정
    </span>
  );
  if (status === "revision_requested") return (
    <span className="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] font-semibold bg-[#FF4D00]/10 text-[#FF4D00] border border-[#FF4D00]/20">
      <RefreshCw size={10} />재보정 요청
    </span>
  );
  return (
    <span className="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] font-semibold bg-amber-500/10 text-amber-500 border border-amber-500/20">
      <Clock size={10} />검토 대기
    </span>
  );
}

/* ── photo card ── */
function PhotoCard({ photo, index }: { photo: ReviewResultPhoto; index: number }) {
  const filename = photo.originalFilename?.split("/").pop() ?? `#${index + 1}`;
  const isRevision = photo.reviewStatus === "revision_requested";
  const isApproved = photo.reviewStatus === "approved";
  const ring = isApproved
    ? "border-emerald-500/40"
    : isRevision
      ? "border-[#FF4D00]/40"
      : "border-[#1a1a1e]";

  return (
    <div className={`bg-[#0a0a0c]/70 border ${ring} rounded-xl p-2 flex flex-col gap-2`}>
      {/* 썸네일 */}
      <div className="w-full aspect-[4/3] bg-[#080808] rounded-lg overflow-hidden border border-[#1a1a1e] relative">
        {photo.thumbUrl ? (
          <img src={photo.thumbUrl} alt={filename} className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-zinc-700 text-xs font-mono">NO IMG</div>
        )}
        <div className="absolute top-1.5 left-1.5 px-1.5 py-0.5 bg-black/70 rounded text-[9px] font-mono text-zinc-400 border border-[#333]">
          {String(index + 1).padStart(2, "0")}
        </div>
      </div>

      {/* 파일명 */}
      <p className="text-[11px] font-mono text-zinc-400 truncate" title={filename}>{filename}</p>

      {/* 상태 뱃지 */}
      <StatusBadge status={photo.reviewStatus} />

      {/* 코멘트 (재보정 요청 시) */}
      {isRevision && (
        <div className="bg-[#0a0a0c] border border-[#FF4D00]/25 border-l-2 border-l-[#FF4D00] rounded-lg p-2 text-[11px] text-zinc-300 leading-relaxed">
          <div className="text-[9px] text-[#FF4D00] font-semibold uppercase tracking-wide mb-1">재보정 요청</div>
          {photo.customerComment
            ? <>&ldquo;{photo.customerComment}&rdquo;</>
            : <span className="text-zinc-600 italic">코멘트 없음</span>
          }
        </div>
      )}
    </div>
  );
}

/* ── 선택 사진 카드 (검토 결과 없을 때) ── */
function SimplePhotoCard({ photo, index }: { photo: import("@/types").Photo; index: number }) {
  const filename = photo.originalFilename?.split("/").pop() ?? `#${photo.orderIndex}`;
  return (
    <div className="bg-[#0a0a0c]/70 border border-[#1a1a1e] rounded-xl p-2 flex flex-col gap-2">
      <div className="w-full aspect-[4/3] bg-[#080808] rounded-lg overflow-hidden border border-[#1a1a1e] relative">
        {photo.url ? (
          <img src={photo.url} alt={filename} className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-zinc-700 text-xs font-mono">NO IMG</div>
        )}
        <div className="absolute top-1.5 left-1.5 px-1.5 py-0.5 bg-black/70 rounded text-[9px] font-mono text-zinc-400 border border-[#333]">
          {String(index + 1).padStart(2, "0")}
        </div>
      </div>
      <p className="text-[11px] font-mono text-zinc-400 truncate" title={filename}>{filename}</p>
      <span className="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] font-semibold bg-[#FF4D00]/8 text-[#FF4D00] border border-[#FF4D00]/20">
        <Check size={10} />선택됨
      </span>
    </div>
  );
}

/* ── 비선택 원본 카드 (선택하지 않은 사진) ── */
function UnselectedPhotoCard({ photo, index }: { photo: import("@/types").Photo; index: number }) {
  const filename = photo.originalFilename?.split("/").pop() ?? `#${photo.orderIndex}`;
  return (
    <div className="bg-[#0a0a0c]/40 border border-[#1a1a1e] rounded-xl p-2 flex flex-col gap-2">
      <div className="w-full aspect-[4/3] bg-[#080808] rounded-lg overflow-hidden border border-[#1a1a1e] relative opacity-70 hover:opacity-100 transition-opacity">
        {photo.url ? (
          <img src={photo.url} alt={filename} className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-zinc-700 text-xs font-mono">NO IMG</div>
        )}
        <div className="absolute top-1.5 left-1.5 px-1.5 py-0.5 bg-black/70 rounded text-[9px] font-mono text-zinc-500 border border-[#333]">
          {String(index + 1).padStart(2, "0")}
        </div>
      </div>
      <p className="text-[11px] font-mono text-zinc-500 truncate" title={filename}>{filename}</p>
      <span className="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] font-medium bg-zinc-500/10 text-zinc-400 border border-zinc-500/20">
        선택 안 함
      </span>
    </div>
  );
}

/* ── 섹션 헤더 ── */
function SectionHeader({ label, count, tone }: { label: string; count: number; tone: "brand" | "muted" }) {
  const dot = tone === "brand" ? "bg-[#FF4D00]" : "bg-zinc-500";
  return (
    <div className="flex items-center gap-2 mb-2">
      <span className={`w-1.5 h-1.5 rounded-full ${dot}`} />
      <h3 className="text-[12px] font-semibold text-zinc-300 tracking-wide">{label}</h3>
      <span className="font-mono text-[11px] text-zinc-500">{count}장</span>
    </div>
  );
}

export default function LockedPage() {
  const params  = useParams();
  const router  = useRouter();
  const token   = (params?.token as string) ?? "";
  const ctx     = useSelectionOptional();
  const project = ctx?.project ?? null;
  const loading = ctx?.loading ?? true;

  const [mounted,         setMounted]         = useState(false);
  const [cancelModalOpen, setCancelModalOpen] = useState(false);
  const [cancelling,      setCancelling]      = useState(false);
  const [reviewResult,    setReviewResult]    = useState<ReviewResultPhoto[] | null>(null);

  useEffect(() => { setMounted(true); }, []);

  useEffect(() => {
    if (!project || !token) return;
    if (project.status === "selecting") router.replace(`/c/${token}/gallery`);
  }, [project, token, router]);

  useEffect(() => {
    if (!token || !project) return;
    if (!["editing_v2", "reviewing_v2", "delivered"].includes(project.status)) return;
    fetch(`/api/c/review-result?token=${encodeURIComponent(token)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => data?.photos && setReviewResult(data.photos))
      .catch(() => {});
  }, [token, project?.status]);

  const { photos, unselected, N } = useMemo(() => {
    type P = import("@/types").Photo;
    if (!project || !ctx?.photos?.length) {
      return { photos: [] as P[], unselected: [] as P[], N: 0 };
    }
    const sel: P[] = [];
    const unsel: P[] = [];
    const ids = ctx.selectedIds;
    for (const p of ctx.photos) {
      if (ids?.has(p.id)) sel.push(p);
      else unsel.push(p);
    }
    sel.sort((a, b) => a.orderIndex - b.orderIndex);
    unsel.sort((a, b) => a.orderIndex - b.orderIndex);
    return { photos: sel, unselected: unsel, N: sel.length };
  }, [project, ctx?.photos, ctx?.selectedIds]);

  const cancelCount      = project?.customerCancelCount ?? 0;
  const remainingCancels = Math.max(0, CUSTOMER_CANCEL_MAX - cancelCount);
  const atCancelLimit    = cancelCount >= CUSTOMER_CANCEL_MAX;
  const canCancel        = project?.status === "confirmed" && !atCancelLimit;

  const handleConfirmCancel = async () => {
    if (!project?.id || !token) return;
    setCancelling(true);
    try {
      const res = await fetch("/api/c/cancel-confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, project_id: project.id }),
      });
      if (!res.ok) { setCancelling(false); return; }
      setCancelModalOpen(false);
      if (typeof window !== "undefined") window.location.replace(`/c/${token}/gallery`);
    } catch { setCancelling(false); }
  };

  if (!mounted || loading) return <PageLoader variant="full" />;
  if (!project) return (
    <div className="flex min-h-dvh items-center justify-center bg-[#030303] text-zinc-600 font-mono text-sm">
      존재하지 않는 초대 링크입니다.
    </div>
  );
  if (project.status === "selecting") return <div className="min-h-dvh bg-[#030303]" />;

  const confirmedDate = project.confirmedAt
    ? format(new Date(project.confirmedAt), "yyyy.MM.dd HH:mm", { locale: ko })
    : null;

  const isEditing  = ["editing", "editing_v2"].includes(project.status);
  const isConfirmed = project.status === "confirmed";
  const hasReview  = reviewResult && reviewResult.length > 0;
  const showUnselected = isConfirmed && !hasReview && unselected.length > 0;

  const approved = hasReview ? reviewResult!.filter((p) => p.reviewStatus === "approved").length : 0;
  const revision = hasReview ? reviewResult!.filter((p) => p.reviewStatus === "revision_requested").length : 0;

  const statusText = (() => {
    switch (project.status) {
      case "confirmed":   return "작가가 보정을 준비하고 있습니다";
      case "editing":     return "작가가 보정을 진행 중입니다";
      case "editing_v2":  return "작가가 재보정을 진행 중입니다";
      case "reviewing_v2": return "재보정본 검토를 요청드립니다";
      case "delivered":   return "모든 보정이 완료되었습니다";
      default:            return "진행 중";
    }
  })();

  return (
    <div className="min-h-dvh bg-[#0a0a0c] text-white flex flex-col" style={{ fontFamily: "'Pretendard Variable',-apple-system,sans-serif" }}>

      {/* Header */}
      <CustomerHeader>
        <BrandLogoBar size="sm" href={token ? `/c/${token}` : undefined} />
        <span className="font-mono text-[11px] text-zinc-500 max-w-[180px] truncate">{project.name}</span>
      </CustomerHeader>

      {/* Status bar */}
      <div className="flex items-center justify-between px-5 py-3 bg-[#0f0f12] border-b border-[#1a1a1e]">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <div className={`w-2 h-2 rounded-full ${isEditing ? "bg-amber-400" : "bg-emerald-400"}`}
              style={{ boxShadow: isEditing ? "0 0 6px #fbbf24" : "0 0 6px #34d399" }} />
            <span className="text-sm font-medium text-white">{statusText}</span>
          </div>
          <div className="flex items-center gap-1.5 px-2 py-1 rounded-lg bg-[#FF4D00]/8 border border-[#FF4D00]/15">
            <Lock size={10} className="text-[#FF4D00]" />
            <span className="font-mono text-[10px] text-[#FF4D00]">읽기 전용</span>
          </div>
        </div>
        <div className="flex items-center gap-3 font-mono text-[11px] text-zinc-500">
          {hasReview && (
            <>
              {approved > 0 && <span className="text-emerald-400">확정 {approved}</span>}
              {revision > 0 && <span className="text-[#FF4D00]">재보정 {revision}</span>}
            </>
          )}
          {!hasReview && (
            <>
              <span>{N}장 선택</span>
              {showUnselected && <span className="text-zinc-600">· 비선택 {unselected.length}</span>}
            </>
          )}
          {confirmedDate && <span className="hidden sm:inline text-zinc-600">{confirmedDate}</span>}
        </div>
      </div>

      {/* Photo grid */}
      <div className="flex-1 p-4 pb-32 overflow-y-auto">
        {hasReview ? (
          <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-6 xl:grid-cols-7 gap-2">
            {reviewResult!.map((photo, i) => (
              <PhotoCard key={photo.photoId} photo={photo} index={i} />
            ))}
          </div>
        ) : photos.length > 0 ? (
          <div className="flex flex-col gap-6">
            <section>
              <SectionHeader label="선택된 원본" count={photos.length} tone="brand" />
              <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-6 xl:grid-cols-7 gap-2">
                {photos.map((photo, i) => (
                  <SimplePhotoCard key={photo.id} photo={photo} index={i} />
                ))}
              </div>
            </section>

            {showUnselected && (
              <section>
                <SectionHeader label="선택하지 않은 원본" count={unselected.length} tone="muted" />
                <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-6 xl:grid-cols-7 gap-2">
                  {unselected.map((photo, i) => (
                    <UnselectedPhotoCard key={photo.id} photo={photo} index={i} />
                  ))}
                </div>
              </section>
            )}
          </div>
        ) : (
          <div className="flex items-center justify-center h-48 text-zinc-600 font-mono text-sm">
            불러오는 중...
          </div>
        )}
      </div>

      {/* Bottom bar */}
      <CustomerFooter>
        <span className="font-mono text-[11px] text-zinc-500">
          {isConfirmed ? `확정 취소 ${remainingCancels}회 남음` : statusText}
        </span>
        {isConfirmed && (
          <button
            type="button"
            disabled={!canCancel}
            onClick={() => canCancel && setCancelModalOpen(true)}
            className={`px-4 py-2 rounded-xl font-mono text-[11px] font-semibold border transition-all ${
              canCancel
                ? "border-red-500/30 text-red-400 hover:bg-red-500/10"
                : "border-[#27272c] text-zinc-600 cursor-not-allowed opacity-50"
            }`}>
            확정 취소
          </button>
        )}
      </CustomerFooter>

      {/* Cancel modal */}
      {cancelModalOpen && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/80 backdrop-blur-sm p-5"
          onClick={(e) => { if (e.target === e.currentTarget) setCancelModalOpen(false); }}>
          <div className="w-full max-w-sm bg-[#121215] border border-[#27272c] rounded-2xl p-6 flex flex-col gap-5">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-full bg-red-500/10 border border-red-500/25 flex items-center justify-center shrink-0">
                <AlertTriangle size={16} className="text-red-400" />
              </div>
              <h3 className="text-base font-bold text-white">확정을 취소할까요?</h3>
            </div>
            <p className="text-sm text-zinc-400 leading-relaxed">
              갤러리로 돌아가 사진을 다시 선택할 수 있습니다.
            </p>
            <div className="bg-amber-500/6 border border-amber-500/20 rounded-xl px-4 py-3 font-mono text-[11px] text-amber-400 leading-relaxed">
              취소 횟수 차감 · 현재 <strong>{remainingCancels}회</strong> 남음
            </div>
            <div className="flex gap-3">
              <button type="button" onClick={() => setCancelModalOpen(false)}
                className="flex-1 h-11 rounded-xl border border-[#27272c] text-zinc-400 text-sm font-medium hover:border-zinc-500 transition-colors">
                유지하기
              </button>
              <button type="button" onClick={handleConfirmCancel} disabled={cancelling}
                className="flex-1 h-11 rounded-xl bg-[#FF4D00] text-black text-sm font-bold disabled:opacity-60 hover:bg-[#e64500] transition-colors">
                {cancelling ? "처리 중..." : "취소하기"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
