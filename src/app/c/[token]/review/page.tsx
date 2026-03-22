"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { Aperture, Check, RotateCcw } from "lucide-react";
import { useSelection } from "@/contexts/SelectionContext";
import { useReview } from "@/contexts/ReviewContext";
import type { ReviewPhotoItem } from "@/lib/customer-api-server";

const REVISION_LIMIT = 2;

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

export default function ReviewGalleryPage() {
  const params = useParams();
  const token = (params?.token as string) ?? "";
  const { project, loading: selectionLoading } = useSelection();
  const { reviewPhotos, loadReviewPhotos, reviewPhotosLoading, reviewState, getReview, resetAll, setReview } = useReview();
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [showSubmitModal, setShowSubmitModal] = useState(false);

  useEffect(() => {
    if (!project?.id || !project?.status) return;
    loadReviewPhotos(token, project.id, project.status);
  }, [token, project?.id, project?.status, loadReviewPhotos]);

  const photos = reviewPhotos;
  const total = photos.length;

  const approvedCount = useMemo(() => photos.filter((p) => getReview(p.id)?.status === "approved").length, [photos, reviewState]);
  const revisionCount = useMemo(() => photos.filter((p) => getReview(p.id)?.status === "revision_requested").length, [photos, reviewState]);
  const pendingCount = total - approvedCount - revisionCount;
  const reviewedCount = approvedCount + revisionCount;
  const allReviewed = total > 0 && pendingCount === 0;

  const isV2 = project?.status === "reviewing_v2";
  const revisionRemaining = Math.max(0, REVISION_LIMIT - (isV2 ? 1 : 0));

  const handleSubmit = useCallback(async () => {
    if (!allReviewed || !token) return;
    setSubmitError(null);
    let finalStatus: string | null = null;
    const hasRealIds = photos.some((p) => (p as ReviewPhotoItem).photoVersionId?.length > 0);
    if (hasRealIds) {
      const reviews = photos.filter((p) => (p as ReviewPhotoItem).photoVersionId).map((p) => {
        const rev = getReview(p.id);
        return {
          photo_version_id: (p as ReviewPhotoItem).photoVersionId,
          photo_id: p.id,
          status: (rev?.status ?? "approved") as "approved" | "revision_requested",
          customer_comment: rev?.comment ?? null,
        };
      });
      const res = await fetch("/api/c/review/submit", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token, reviews }) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { const msg = (data && typeof data.error === "string" && data.error) || `서버 오류 (${res.status})`; console.error("[review/submit]", res.status, data); setSubmitError(msg); return; }
      finalStatus = typeof data?.status === "string" ? data.status : null;
    } else {
      const result = revisionCount > 0 ? "has_revision" : "all_approved";
      const res = await fetch("/api/c/review-submit", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token, result }) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { const msg = (data && typeof data.error === "string" && data.error) || `서버 오류 (${res.status})`; console.error("[review-submit]", res.status, data); setSubmitError(msg); return; }
      finalStatus = typeof data?.status === "string" ? data.status : null;
    }
    resetAll();
    if (finalStatus === "delivered") { window.location.replace(`/c/${token}/delivered`); return; }
    window.location.replace(`/c/${token}/confirmed`);
  }, [allReviewed, token, revisionCount, photos, getReview, resetAll]);

  const handleApproveAll = useCallback(() => {
    if (photos.length === 0) return;
    photos.forEach((p) => { setReview(p.id, "approved"); });
  }, [photos, setReview]);

  if (selectionLoading || reviewPhotosLoading || !project) {
    return <div className="flex min-h-screen items-center justify-center bg-[#09090d]"><p className="text-sm text-[#5a5f78]">{selectionLoading || reviewPhotosLoading ? "로딩 중…" : "존재하지 않는 초대 링크입니다."}</p></div>;
  }

  const canShowReview = project.status === "reviewing_v1" || project.status === "reviewing_v2";
  if (!canShowReview) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#09090d]">
        <div className="text-center">
          <p className="mb-4 text-sm text-[#5a5f78]">현재 검토 단계가 아닙니다.</p>
          <Link href={`/c/${token}/confirmed`} className="rounded-xl border border-[#252b3d] px-4 py-2 text-[13px] text-[#8b90a8] hover:border-[#4f7eff] hover:text-[#4f7eff]">확정 페이지로</Link>
        </div>
      </div>
    );
  }

  const progressPct = total > 0 ? Math.round((reviewedCount / total) * 100) : 0;

  return (
    <div className="min-h-screen bg-[#09090d] pb-28 text-[#e8eaf0]">
      <PageHeader right={project.name} />

      <div className="mx-auto max-w-[600px] px-4 py-4">
        {/* Title + actions */}
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h1 className="text-[17px] font-bold text-[#e8eaf0]">보정본 검토</h1>
            <p className="text-[11px] text-[#5a5f78]">사진을 클릭해서 원본과 비교하세요</p>
          </div>
          <div className="flex items-center gap-2">
            <button type="button" onClick={handleApproveAll} disabled={photos.length === 0}
              className="flex h-9 items-center gap-1.5 rounded-xl border border-[#2ed573] bg-[#0f2a1e] px-3 text-[11px] font-semibold text-[#2ed573] disabled:opacity-40 disabled:pointer-events-none">
              <Check className="h-3.5 w-3.5" /> 전체 확정
            </button>
            <div className="text-right">
              <div className="text-[14px] font-bold text-[#f5a623]">{revisionRemaining}회</div>
              <div className="text-[10px] text-[#5a5f78]">재보정</div>
            </div>
          </div>
        </div>

        {/* Progress */}
        <div className="mb-3 flex items-center gap-3 rounded-xl border border-[#1e2236] bg-[#111318] px-4 py-2.5">
          <span className="shrink-0 text-[11px] text-[#5a5f78]">검토 현황</span>
          <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-[#1e2236]">
            <div className="h-full rounded-full bg-[#2ed573] transition-all duration-300" style={{ width: `${progressPct}%` }} />
          </div>
          <span className="shrink-0 font-mono text-[12px] font-bold text-[#2ed573]">{reviewedCount}/{total}</span>
        </div>

        {/* Summary */}
        <div className="mb-4 grid grid-cols-3 gap-2">
          <div className="rounded-xl border border-[#2ed573]/40 bg-[#0f2a1e] py-3 text-center">
            <div className="text-[20px] font-bold text-[#2ed573]">{approvedCount}</div>
            <div className="text-[10px] text-[#5a5f78]">확정</div>
          </div>
          <div className="rounded-xl border border-[#f5a623]/40 bg-[#2a1408] py-3 text-center">
            <div className="text-[20px] font-bold text-[#f5a623]">{revisionCount}</div>
            <div className="text-[10px] text-[#5a5f78]">재보정</div>
          </div>
          <div className="rounded-xl border border-[#1e2236] bg-[#1a1d24] py-3 text-center">
            <div className="text-[20px] font-bold text-[#5a5f78]">{pendingCount}</div>
            <div className="text-[10px] text-[#5a5f78]">미검토</div>
          </div>
        </div>

        {/* Photo grid: 1col mobile card, 2col tablet, 3col desktop */}
        <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-3">
          {photos.map((p) => {
            const review = getReview(p.id);
            const status: "approved" | "revision_requested" | "pending" = review?.status ?? "pending";
            return (
              <div key={p.id} className={`overflow-hidden rounded-xl border-[1.5px] bg-[#111318] ${
                status === "approved" ? "border-[#2ed573]" :
                status === "revision_requested" ? "border-[#f5a623]" :
                "border-[#1e2236]"
              }`}>
                {/* Mobile: row layout */}
                <div className="flex sm:flex-col">
                  {/* Thumbnail */}
                  <Link href={`/c/${token}/review/${p.id}`} className="relative shrink-0 sm:w-full">
                    <div className="relative h-[80px] w-[80px] bg-[#1a1d24] sm:h-auto sm:w-full sm:aspect-[3/2]">
                      <img src={p.versionUrl} alt="" className="h-full w-full object-cover" />
                      <span className={`absolute right-1.5 top-1.5 inline-block rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                        status === "approved" ? "border border-[#2ed573] bg-[#0f2a1e] text-[#2ed573]" :
                        status === "revision_requested" ? "border border-[#f5a623] bg-[#2a1408] text-[#f5a623]" :
                        "border border-[#1e2236] bg-[#1a1d24] text-[#5a5f78]"
                      }`}>
                        {status === "approved" ? "확정" : status === "revision_requested" ? "재보정" : "미검토"}
                      </span>
                    </div>
                  </Link>

                  {/* Info + actions */}
                  <div className="flex flex-1 flex-col justify-between p-3 sm:p-2.5">
                    <div className="mb-2">
                      <p className="truncate text-[12px] font-medium text-[#e8eaf0]">{p.originalFilename}</p>
                      <Link href={`/c/${token}/review/${p.id}`} className="text-[11px] text-[#4f7eff] hover:underline">비교 보기 →</Link>
                    </div>
                    {/* Action buttons */}
                    <div className="flex gap-1.5">
                      <button type="button" onClick={() => setReview(p.id, "approved")}
                        className={`flex h-9 flex-1 items-center justify-center gap-1 rounded-lg text-[11px] font-semibold transition-colors ${
                          status === "approved" ? "border border-[#2ed573] bg-[#0f2a1e] text-[#2ed573]" : "border border-[#1e2236] bg-[#1a1d24] text-[#8b90a8] hover:border-[#2ed573] hover:text-[#2ed573]"
                        }`}>
                        <Check className="h-3 w-3" /> 확정
                      </button>
                      <button type="button" onClick={() => setReview(p.id, "revision_requested")}
                        className={`flex h-9 flex-1 items-center justify-center gap-1 rounded-lg text-[11px] font-semibold transition-colors ${
                          status === "revision_requested" ? "border border-[#f5a623] bg-[#2a1408] text-[#f5a623]" : "border border-[#1e2236] bg-[#1a1d24] text-[#8b90a8] hover:border-[#f5a623] hover:text-[#f5a623]"
                        }`}>
                        <RotateCcw className="h-3 w-3" /> 재보정
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <PageFooter />

      {/* Fixed bottom submit bar */}
      <div className="fixed bottom-0 left-0 right-0 z-20 border-t border-[#1e2236] bg-[#09090d]/95 px-4 py-4 backdrop-blur">
        <div className="mx-auto max-w-[600px]">
          <button type="button" onClick={() => { if (allReviewed) { setSubmitError(null); setShowSubmitModal(true); } }} disabled={!allReviewed}
            className={`flex h-12 w-full items-center justify-center rounded-xl text-[14px] font-semibold transition-all ${
              allReviewed ? "bg-[#4f7eff] text-white hover:opacity-90" : "cursor-not-allowed border border-[#1e2236] bg-transparent text-[#5a5f78] opacity-50"
            }`}>
            {allReviewed ? "최종 제출" : `최종 제출 — 미검토 ${pendingCount}장 남음`}
          </button>
          <p className="mt-1.5 text-center text-[11px] text-[#3a3f55]">모든 사진 검토 완료 후 한번에 작가에게 전달됩니다</p>
        </div>
      </div>

      {/* Submit modal */}
      {showSubmitModal && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 p-4 sm:items-center">
          <div className="w-full max-w-sm rounded-2xl border border-[#252b3d] bg-[#111318] p-6 shadow-xl">
            <h3 className="mb-2 text-[16px] font-bold text-[#e8eaf0]">최종 제출</h3>
            <p className="mb-6 text-[13px] leading-relaxed text-[#8b90a8]">
              확정 <span className="text-[#2ed573]">{approvedCount}장</span>, 재보정 요청{" "}
              <span className="text-[#f5a623]">{revisionCount}장</span>을 작가에게 전달하시겠습니까?
            </p>
            {submitError && <p className="mb-3 text-[12px] text-[#ff4757]" role="alert">{submitError}</p>}
            <div className="flex gap-2">
              <button type="button" onClick={() => { setShowSubmitModal(false); setSubmitError(null); }} className="flex h-11 flex-1 items-center justify-center rounded-xl border border-[#252b3d] text-[13px] text-[#8b90a8]">취소</button>
              <button type="button" onClick={async () => { await handleSubmit(); }} className="flex h-11 flex-1 items-center justify-center rounded-xl bg-[#4f7eff] text-[13px] font-semibold text-white">전달</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
