"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { Button } from "@/components/ui";
import { useSelection } from "@/contexts/SelectionContext";
import { useReview } from "@/contexts/ReviewContext";

const REVISION_LIMIT = 2;

export default function ReviewGalleryPage() {
  const params = useParams();
  const router = useRouter();
  const token = (params?.token as string) ?? "";
  const { project, loading: selectionLoading } = useSelection();
  const { reviewPhotos, loadReviewPhotos, reviewPhotosLoading, reviewState, getReview, resetAll, setReview } = useReview();
  const [submitError, setSubmitError] = useState<string | null>(null);

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
        const msg =
          (data && typeof data.error === "string" && data.error) ||
          `서버 오류 (${res.status} ${res.statusText})`;
        console.error("[review/submit]", res.status, res.statusText, data);
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
        const msg =
          (data && typeof data.error === "string" && data.error) ||
          `서버 오류 (${res.status} ${res.statusText})`;
        console.error("[review-submit]", res.status, res.statusText, data);
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
    photos.forEach((p) => {
      setReview(p.id, "approved");
    });
  }, [photos, setReview]);

  const [showSubmitModal, setShowSubmitModal] = useState(false);

  if (selectionLoading || reviewPhotosLoading || !project) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#0a0b0d]">
        <p className="text-[#5a5f7a]">
          {selectionLoading || reviewPhotosLoading ? "로딩 중…" : "존재하지 않는 초대 링크입니다."}
        </p>
      </div>
    );
  }

  const canShowReview =
    project.status === "reviewing_v1" || project.status === "reviewing_v2";
  if (!canShowReview) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#0a0b0d]">
        <div className="text-center">
          <p className="text-[#5a5f7a]">현재 검토 단계가 아닙니다.</p>
          <Link href={`/c/${token}/confirmed`} className="mt-4 inline-block">
            <Button variant="outline">확정 페이지로</Button>
          </Link>
        </div>
      </div>
    );
  }

  const progressPct = total > 0 ? Math.round((reviewedCount / total) * 100) : 0;

  return (
    <div className="min-h-screen bg-[#0a0b0d] text-[#e8eaf0]">
      <div className="mx-auto max-w-[860px] px-5 py-7">
        {/* ② 보정본 갤러리 (와이어프레임 화면2: notify/프로젝트정보 없음) */}
        {/* gallery-header */}
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="text-[18px] font-bold text-[#e8eaf0]">보정본 검토</h1>
            <p className="text-[12px] text-[#5a5f7a] mt-1">
              각 사진을 클릭해서 원본과 비교하고 의견을 남겨주세요
            </p>
          </div>
          <div className="flex items-center gap-2.5">
            <button
              type="button"
              onClick={handleApproveAll}
              disabled={photos.length === 0}
              className={`rounded-lg border px-3 py-1.5 text-[12px] font-semibold transition ${
                photos.length > 0
                  ? "border-[#2ed573] bg-[#0f2a1e] text-[#2ed573] hover:opacity-90"
                  : "border-[#2e3348] text-[#5a5f7a] opacity-40 cursor-not-allowed"
              }`}
            >
              전체확정 체크
            </button>
            <span className="text-[12px] text-[#5a5f7a]">남은 재보정</span>
            <span className="text-[15px] font-bold text-[#f5a623]">
              {revisionRemaining}회
            </span>
          </div>
        </div>

        {/* 진행 현황 (progress-wrap) */}
        <div className="rounded-[10px] border border-[#1e2028] bg-[#0e0f14] px-4 py-3 flex items-center gap-3.5 mb-3.5">
          <span className="text-[12px] text-[#5a5f7a] whitespace-nowrap">
            검토 현황
          </span>
          <div className="flex-1 h-1.5 bg-[#1e2028] rounded-sm overflow-hidden">
            <div
              className="h-full rounded-sm bg-[#2ed573] transition-all duration-300"
              style={{ width: `${progressPct}%` }}
            />
          </div>
          <span className="text-[13px] font-bold text-[#2ed573] whitespace-nowrap">
            {reviewedCount} / {total}장 검토 완료
          </span>
        </div>

        {/* 요약 (summary-row) */}
        <div className="grid grid-cols-3 gap-2.5 mb-4">
          <div className="rounded-lg border border-[#2ed573] bg-[#0f2a1e] py-2.5 px-2.5 text-center">
            <div className="text-[20px] font-bold text-[#2ed573]">{approvedCount}</div>
            <div className="text-[11px] text-[#5a5f7a] mt-0.5">확정</div>
          </div>
          <div className="rounded-lg border border-[#f5a623] bg-[#2a1408] py-2.5 px-2.5 text-center">
            <div className="text-[20px] font-bold text-[#f5a623]">{revisionCount}</div>
            <div className="text-[11px] text-[#5a5f7a] mt-0.5">재보정 요청</div>
          </div>
          <div className="rounded-lg border border-[#2e3348] bg-[#1a1d28] py-2.5 px-2.5 text-center">
            <div className="text-[20px] font-bold text-[#5a5f7a]">{pendingCount}</div>
            <div className="text-[11px] text-[#5a5f7a] mt-0.5">미검토</div>
          </div>
        </div>

        {/* 사진 그리드 (photo-grid: 3열, photo-card) */}
        <div className="grid grid-cols-3 gap-3 mb-4">
          {photos.map((p) => {
            const review = getReview(p.id);
            const status: "approved" | "revision_requested" | "pending" =
              review?.status ?? "pending";
            return (
              <Link
                key={p.id}
                href={`/c/${token}/review/${p.id}`}
                className={`rounded-[10px] overflow-hidden border-[1.5px] transition cursor-pointer hover:-translate-y-0.5 ${
                  status === "approved"
                    ? "border-[#2ed573] bg-[#0e0f14]"
                    : status === "revision_requested"
                      ? "border-[#f5a623] bg-[#0e0f14]"
                      : "border-[#1e2028] bg-[#0e0f14]"
                }`}
              >
                <div className="relative w-full aspect-[3/2] bg-[#1a1d28] flex items-center justify-center">
                  <img
                    src={p.versionUrl}
                    alt=""
                    className="w-full h-full object-cover"
                  />
                  <div
                    className="absolute bottom-0 left-0 right-0 py-1.5 px-2.5 text-[10px] text-white"
                    style={{
                      background: "linear-gradient(transparent, rgba(0,0,0,0.75))",
                    }}
                  >
                    {p.originalFilename}
                  </div>
                  <div className="absolute top-2 right-2">
                    <span
                      className={`inline-block rounded-[20px] px-2 py-0.5 text-[11px] font-semibold ${
                        status === "approved"
                          ? "bg-[#0f2a1e] text-[#2ed573] border border-[#2ed573]"
                          : status === "revision_requested"
                            ? "bg-[#2a1408] text-[#f5a623] border border-[#f5a623]"
                            : "bg-[#1a1d28] text-[#5a5f7a] border border-[#2e3348]"
                      }`}
                    >
                      {status === "approved"
                        ? "✅ 확정"
                        : status === "revision_requested"
                          ? "🔄 재보정"
                          : "미검토"}
                    </span>
                  </div>
                </div>
                <div className="flex items-center justify-between py-2 px-3">
                  <span
                    className="text-[11px] text-[#8b8fa8] overflow-hidden text-ellipsis whitespace-nowrap max-w-[110px]"
                    title={p.originalFilename}
                  >
                    {p.originalFilename}
                  </span>
                  <span className="text-[12px] text-[#8b8fa8] font-semibold">
                    비교
                  </span>
                </div>
              </Link>
            );
          })}
        </div>

        {/* 최종 제출 (submit-btn-wrap) */}
        <div className="text-center">
          <button
            type="button"
            onClick={() => {
              if (allReviewed) {
                setSubmitError(null);
                setShowSubmitModal(true);
              }
            }}
            disabled={!allReviewed}
            className={`w-full rounded-lg py-2 px-4 text-[13px] font-semibold flex items-center justify-center gap-1.5 border transition ${
              allReviewed
                ? "bg-[#4f7eff] border-[#4f7eff] text-white hover:opacity-90"
                : "bg-transparent border-[#2e3348] text-[#5a5f7a] opacity-40 cursor-not-allowed"
            }`}
          >
            {allReviewed
              ? "최종 제출"
              : `최종 제출 — 미검토 ${pendingCount}장 남음`}
          </button>
          <p className="text-[11px] text-[#3a3f55] mt-2">
            모든 사진 검토 완료 후 한번에 작가에게 전달됩니다
          </p>
        </div>

        {showSubmitModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
            <div className="w-full max-w-sm rounded-xl border border-[#1e2028] bg-[#111318] p-6">
              <h3 className="text-lg font-semibold text-white">최종 제출</h3>
              <p className="mt-2 text-sm text-[#8b8fa8]">
                확정 {approvedCount}장, 재보정 요청 {revisionCount}장을 작가에게
                전달하시겠습니까?
              </p>
              {submitError && (
                <p className="mt-3 text-sm text-red-400" role="alert">
                  {submitError}
                </p>
              )}
              <div className="mt-6 flex gap-2">
                <Button
                  variant="outline"
                  className="flex-1 border-[#2e3348] text-[#8b8fa8]"
                  onClick={() => {
                    setShowSubmitModal(false);
                    setSubmitError(null);
                  }}
                >
                  취소
                </Button>
                <Button
                  variant="primary"
                  className="flex-1 bg-[#4f7eff] border-[#4f7eff]"
                  onClick={async () => {
                    await handleSubmit();
                    // 모달은 제출 성공 시 handleSubmit 내부에서 router.push로 이탈하므로 여기서는 실패 시에만 유지
                  }}
                >
                  전달
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
