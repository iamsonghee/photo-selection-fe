"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useSelection } from "@/contexts/SelectionContext";
import { useReview } from "@/contexts/ReviewContext";
import type { ReviewPhotoItem } from "@/lib/customer-api-server";

const REVISION_LIMIT = 2;

export default function ReviewGalleryPage() {
  const params = useParams();
  const router = useRouter();
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

  const approvedCount = useMemo(() => {
    return photos.filter((p) => getReview(p.id)?.status === "approved").length;
  }, [photos, reviewState]);

  const revisionCount = useMemo(() => {
    return photos.filter((p) => getReview(p.id)?.status === "revision_requested").length;
  }, [photos, reviewState]);

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
      const reviews = photos
        .filter((p) => (p as ReviewPhotoItem).photoVersionId)
        .map((p) => {
          const rev = getReview(p.id);
          return {
            photo_version_id: (p as ReviewPhotoItem).photoVersionId,
            photo_id: p.id,
            status: (rev?.status ?? "approved") as "approved" | "revision_requested",
            customer_comment: rev?.comment ?? null,
          };
        });
      const res = await fetch("/api/c/review/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, reviews }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        const msg = (data && typeof data.error === "string" && data.error) || `서버 오류 (${res.status})`;
        console.error("[review/submit]", res.status, data);
        setSubmitError(msg);
        return;
      }
      finalStatus = typeof data?.status === "string" ? data.status : null;
    } else {
      const result = revisionCount > 0 ? "has_revision" : "all_approved";
      const res = await fetch("/api/c/review-submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, result }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        const msg = (data && typeof data.error === "string" && data.error) || `서버 오류 (${res.status})`;
        console.error("[review-submit]", res.status, data);
        setSubmitError(msg);
        return;
      }
      finalStatus = typeof data?.status === "string" ? data.status : null;
    }
    resetAll();
    if (finalStatus === "delivered") {
      window.location.replace(`/c/${token}/delivered`);
      return;
    }
    window.location.replace(`/c/${token}/confirmed`);
  }, [allReviewed, token, revisionCount, photos, getReview, resetAll]);

  const handleApproveAll = useCallback(() => {
    if (photos.length === 0) return;
    photos.forEach((p) => { setReview(p.id, "approved"); });
  }, [photos, setReview]);

  if (selectionLoading || reviewPhotosLoading || !project) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#09090d]">
        <p className="text-sm text-[#5a5f78]">
          {selectionLoading || reviewPhotosLoading ? "로딩 중…" : "존재하지 않는 초대 링크입니다."}
        </p>
      </div>
    );
  }

  const canShowReview = project.status === "reviewing_v1" || project.status === "reviewing_v2";
  if (!canShowReview) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#09090d]">
        <div className="text-center">
          <p className="mb-4 text-sm text-[#5a5f78]">현재 검토 단계가 아닙니다.</p>
          <Link
            href={`/c/${token}/confirmed`}
            className="rounded-xl border border-[#252b3d] px-4 py-2 text-[13px] text-[#8b90a8] hover:border-[#4f7eff] hover:text-[#4f7eff]"
          >
            확정 페이지로
          </Link>
        </div>
      </div>
    );
  }

  const progressPct = total > 0 ? Math.round((reviewedCount / total) * 100) : 0;

  return (
    <div className="min-h-screen bg-[#09090d] pb-28 text-[#e8eaf0]">
      {/* Header */}
      <header className="sticky top-0 z-20 border-b border-[#1e2236] bg-[#111318]/95 px-4 py-3 backdrop-blur">
        <div className="mx-auto max-w-[520px]">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-[16px] font-bold">보정본 검토</h1>
              <p className="text-[11px] text-[#5a5f78]">클릭해서 원본과 비교하고 의견을 남겨주세요</p>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleApproveAll}
                disabled={photos.length === 0}
                className="rounded-xl border border-[#2ed573] bg-[#0f2a1e] px-3 py-1.5 text-[11px] font-semibold text-[#2ed573] disabled:opacity-40 disabled:pointer-events-none"
              >
                전체 확정
              </button>
              <span className="text-[13px] font-bold text-[#f5a623]">{revisionRemaining}회</span>
              <span className="text-[11px] text-[#5a5f78]">남은 재보정</span>
            </div>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-[520px] px-4 py-4">
        {/* Progress */}
        <div className="mb-3 flex items-center gap-3 rounded-xl border border-[#1e2236] bg-[#111318] px-4 py-3">
          <span className="shrink-0 text-[11px] text-[#5a5f78]">검토 현황</span>
          <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-[#1e2236]">
            <div
              className="h-full rounded-full bg-[#2ed573] transition-all duration-300"
              style={{ width: `${progressPct}%` }}
            />
          </div>
          <span className="shrink-0 font-mono text-[12px] font-bold text-[#2ed573]">
            {reviewedCount}/{total}
          </span>
        </div>

        {/* Summary stats */}
        <div className="mb-4 grid grid-cols-3 gap-2">
          <div className="rounded-xl border border-[#2ed573]/40 bg-[#0f2a1e] py-3 text-center">
            <div className="text-[20px] font-bold text-[#2ed573]">{approvedCount}</div>
            <div className="text-[10px] text-[#5a5f78]">확정</div>
          </div>
          <div className="rounded-xl border border-[#f5a623]/40 bg-[#2a1408] py-3 text-center">
            <div className="text-[20px] font-bold text-[#f5a623]">{revisionCount}</div>
            <div className="text-[10px] text-[#5a5f78]">재보정 요청</div>
          </div>
          <div className="rounded-xl border border-[#1e2236] bg-[#1a1d24] py-3 text-center">
            <div className="text-[20px] font-bold text-[#5a5f78]">{pendingCount}</div>
            <div className="text-[10px] text-[#5a5f78]">미검토</div>
          </div>
        </div>

        {/* Photo grid */}
        <div className="mb-4 grid grid-cols-2 gap-2.5 sm:grid-cols-3">
          {photos.map((p) => {
            const review = getReview(p.id);
            const status: "approved" | "revision_requested" | "pending" = review?.status ?? "pending";
            return (
              <Link
                key={p.id}
                href={`/c/${token}/review/${p.id}`}
                className={`overflow-hidden rounded-xl border-[1.5px] transition-all hover:-translate-y-0.5 ${
                  status === "approved"
                    ? "border-[#2ed573] bg-[#111318]"
                    : status === "revision_requested"
                      ? "border-[#f5a623] bg-[#111318]"
                      : "border-[#1e2236] bg-[#111318]"
                }`}
              >
                <div className="relative aspect-[3/2] bg-[#1a1d24]">
                  <img src={p.versionUrl} alt="" className="h-full w-full object-cover" />
                  <div
                    className="absolute bottom-0 left-0 right-0 px-2 py-1.5 text-[10px] text-white"
                    style={{ background: "linear-gradient(transparent, rgba(0,0,0,0.75))" }}
                  >
                    {p.originalFilename}
                  </div>
                  <div className="absolute right-1.5 top-1.5">
                    <span
                      className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                        status === "approved"
                          ? "border border-[#2ed573] bg-[#0f2a1e] text-[#2ed573]"
                          : status === "revision_requested"
                            ? "border border-[#f5a623] bg-[#2a1408] text-[#f5a623]"
                            : "border border-[#1e2236] bg-[#1a1d24] text-[#5a5f78]"
                      }`}
                    >
                      {status === "approved" ? "✅ 확정" : status === "revision_requested" ? "🔄 재보정" : "미검토"}
                    </span>
                  </div>
                </div>
                <div className="flex items-center justify-between px-2.5 py-2">
                  <span className="max-w-[80px] truncate text-[10px] text-[#8b90a8]">{p.originalFilename}</span>
                  <span className="text-[11px] text-[#4f7eff]">비교 →</span>
                </div>
              </Link>
            );
          })}
        </div>
      </div>

      {/* Fixed bottom submit bar */}
      <div className="fixed bottom-0 left-0 right-0 z-20 border-t border-[#1e2236] bg-[#09090d]/95 px-4 py-4 backdrop-blur">
        <div className="mx-auto max-w-[520px]">
          <button
            type="button"
            onClick={() => {
              if (allReviewed) {
                setSubmitError(null);
                setShowSubmitModal(true);
              }
            }}
            disabled={!allReviewed}
            className={`w-full rounded-xl py-3.5 text-[14px] font-semibold transition-all ${
              allReviewed
                ? "bg-[#4f7eff] text-white hover:opacity-90"
                : "cursor-not-allowed border border-[#1e2236] bg-transparent text-[#5a5f78] opacity-50"
            }`}
          >
            {allReviewed ? "최종 제출" : `최종 제출 — 미검토 ${pendingCount}장 남음`}
          </button>
          <p className="mt-1.5 text-center text-[11px] text-[#3a3f55]">
            모든 사진 검토 완료 후 한번에 작가에게 전달됩니다
          </p>
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
            {submitError && (
              <p className="mb-3 text-[12px] text-[#ff4757]" role="alert">{submitError}</p>
            )}
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => { setShowSubmitModal(false); setSubmitError(null); }}
                className="flex-1 rounded-xl border border-[#252b3d] py-3 text-[13px] text-[#8b90a8]"
              >
                취소
              </button>
              <button
                type="button"
                onClick={async () => { await handleSubmit(); }}
                className="flex-1 rounded-xl bg-[#4f7eff] py-3 text-[13px] font-semibold text-white disabled:opacity-60"
              >
                전달
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
