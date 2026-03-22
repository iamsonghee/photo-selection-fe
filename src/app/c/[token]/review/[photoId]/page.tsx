"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useSelection } from "@/contexts/SelectionContext";
import { useReview } from "@/contexts/ReviewContext";
import FullScreenCompareModal from "@/components/FullScreenCompareModal";

export default function ReviewViewerPage() {
  const params = useParams();
  const router = useRouter();
  const token = (params?.token as string) ?? "";
  const photoId = params?.photoId as string;
  const { project, loading: selectionLoading } = useSelection();
  const { reviewPhotos, loadReviewPhotos, reviewPhotosLoading, setReview, getReview } = useReview();

  useEffect(() => {
    if (!project?.id || !project?.status) return;
    loadReviewPhotos(token, project.id, project.status);
  }, [token, project?.id, project?.status, loadReviewPhotos]);

  const photos = reviewPhotos;
  const currentIndex = useMemo(
    () => photos.findIndex((p) => p.id === photoId),
    [photos, photoId]
  );
  const current = currentIndex >= 0 ? photos[currentIndex] : null;
  const prevId = currentIndex > 0 ? photos[currentIndex - 1].id : photos[photos.length - 1]?.id;
  const nextId =
    currentIndex < photos.length - 1 && currentIndex >= 0
      ? photos[currentIndex + 1].id
      : photos[0]?.id;

  const review = current ? getReview(current.id) : null;
  const [revisionComment, setRevisionComment] = useState(review?.comment ?? "");
  const [savedFlash, setSavedFlash] = useState(false);
  const [showRevisionArea, setShowRevisionArea] = useState(review?.status === "revision_requested");
  const [fullOpen, setFullOpen] = useState(false);
  const [fullInitial, setFullInitial] = useState<"original" | "version">("original");

  useEffect(() => {
    if (current && review?.comment != null) setRevisionComment(review.comment ?? "");
  }, [current?.id, review?.comment]);

  useEffect(() => {
    setShowRevisionArea(review?.status === "revision_requested");
  }, [review?.status]);

  const goPrev = useCallback(() => {
    if (prevId) router.push(`/c/${token}/review/${prevId}`);
  }, [token, prevId, router]);

  const goNext = useCallback(() => {
    if (nextId) router.push(`/c/${token}/review/${nextId}`);
  }, [token, nextId, router]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "ArrowLeft") { e.preventDefault(); goPrev(); }
      else if (e.key === "ArrowRight") { e.preventDefault(); goNext(); }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [goPrev, goNext]);

  const handleApprove = useCallback(() => {
    if (!current) return;
    setReview(current.id, "approved");
    setRevisionComment("");
    setShowRevisionArea(false);
    setSavedFlash(true);
    setTimeout(() => setSavedFlash(false), 1500);
  }, [current, setReview]);

  const handleRevisionClick = useCallback(() => {
    setShowRevisionArea(true);
    setSavedFlash(false);
  }, []);

  const handleRevisionSave = useCallback(() => {
    if (!current) return;
    setReview(current.id, "revision_requested", revisionComment || undefined);
    setSavedFlash(true);
    setTimeout(() => setSavedFlash(false), 1500);
  }, [current, revisionComment, setReview]);

  if (selectionLoading || !project) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#09090d]">
        <p className="text-sm text-[#5a5f78]">
          {selectionLoading ? "로딩 중…" : "존재하지 않는 초대 링크입니다."}
        </p>
      </div>
    );
  }

  const canShowReview = project.status === "reviewing_v1" || project.status === "reviewing_v2";
  if (!canShowReview) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#09090d]">
        <Link
          href={`/c/${token}/confirmed`}
          className="rounded-xl border border-[#252b3d] px-4 py-2 text-[13px] text-[#8b90a8] hover:border-[#4f7eff] hover:text-[#4f7eff]"
        >
          확정 페이지로
        </Link>
      </div>
    );
  }

  if (!current) {
    if (reviewPhotosLoading || photos.length === 0) {
      return (
        <div className="flex min-h-screen items-center justify-center bg-[#09090d]">
          <p className="text-sm text-[#5a5f78]">불러오는 중...</p>
        </div>
      );
    }
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#09090d]">
        <div className="text-center">
          <p className="mb-4 text-sm text-[#5a5f78]">사진을 찾을 수 없습니다.</p>
          <Link
            href={`/c/${token}/review`}
            className="rounded-xl border border-[#252b3d] px-4 py-2 text-[13px] text-[#8b90a8]"
          >
            갤러리로
          </Link>
        </div>
      </div>
    );
  }

  const revisionRemaining = project.status === "reviewing_v2" ? 1 : 2;
  const versionLabel = `보정본 ${project.status === "reviewing_v2" ? "v2" : "v1"}`;
  const status = review?.status ?? "pending";

  return (
    <div className="min-h-screen bg-[#09090d] text-[#e8eaf0]">
      {/* Header */}
      <header className="sticky top-0 z-20 border-b border-[#1e2236] bg-[#111318]/95 px-4 py-3 backdrop-blur">
        <div className="mx-auto flex max-w-[520px] items-center justify-between">
          <div className="flex items-center gap-2">
            <Link
              href={`/c/${token}/review`}
              className="flex items-center gap-1 text-[#8b90a8] hover:text-[#e8eaf0] active:opacity-70"
            >
              <ChevronLeft className="h-4 w-4" />
              <span className="text-[13px]">목록</span>
            </Link>
            <div className="h-4 w-px bg-[#1e2236]" />
            <div>
              <div className="text-[13px] font-semibold">{current.originalFilename}</div>
              <div className="flex items-center gap-1.5 text-[11px] text-[#5a5f78]">
                <span>{currentIndex + 1} / {photos.length}</span>
                <span
                  className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                    status === "approved"
                      ? "border border-[#2ed573] bg-[#0f2a1e] text-[#2ed573]"
                      : status === "revision_requested"
                        ? "border border-[#f5a623] bg-[#2a1408] text-[#f5a623]"
                        : "border border-[#1e2236] bg-[#1a1d24] text-[#5a5f78]"
                  }`}
                >
                  {status === "approved" ? "확정" : status === "revision_requested" ? "재보정" : "미검토"}
                </span>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={goPrev}
              className="flex h-8 w-8 items-center justify-center rounded-full border border-[#1e2236] text-[#8b90a8] hover:border-[#252b3d] hover:text-[#e8eaf0]"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={goNext}
              className="flex h-8 w-8 items-center justify-center rounded-full border border-[#1e2236] text-[#8b90a8] hover:border-[#252b3d] hover:text-[#e8eaf0]"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-[520px] px-4 py-4">
        {/* Compare grid — stacked on mobile, 2-col on sm+ */}
        <div className="mb-2 grid grid-cols-1 gap-1 overflow-hidden rounded-xl border border-[#1e2236] sm:grid-cols-2">
          <div className="relative bg-[#1a1d24]">
            <div className="aspect-[4/3]">
              <img
                src={current.originalUrl}
                alt="원본"
                className="h-full w-full cursor-zoom-in object-contain"
                onClick={() => { setFullInitial("original"); setFullOpen(true); }}
              />
            </div>
            <span className="absolute left-2.5 top-2.5 rounded-md bg-black/60 px-2 py-0.5 text-[11px] font-bold text-[#aaa]">
              원본
            </span>
          </div>
          <div className="relative bg-[#1a2030]">
            <div className="aspect-[4/3]">
              <img
                src={current.versionUrl}
                alt={versionLabel}
                className="h-full w-full cursor-zoom-in object-contain"
                onClick={() => { setFullInitial("version"); setFullOpen(true); }}
              />
            </div>
            <span className="absolute left-2.5 top-2.5 rounded-md bg-[#4f7eff]/85 px-2 py-0.5 text-[11px] font-bold text-white">
              {versionLabel}
            </span>
          </div>
        </div>
        <p className="mb-4 text-center text-[11px] text-[#3a3f55]">
          💡 사진을 클릭하면 풀스크린으로 볼 수 있습니다
        </p>

        {/* Photographer memo */}
        {current.photographerMemo && (
          <div className="mb-3 rounded-xl border border-[#1e2236] bg-[#111318] px-3.5 py-2.5 text-[12px] text-[#8b90a8]">
            📝 작가 메모: {current.photographerMemo}
          </div>
        )}

        {/* Feedback card */}
        <div className="rounded-xl border border-[#1e2236] bg-[#111318] p-4">
          <div className="mb-2 text-[13px] font-semibold">이 사진에 대한 의견</div>

          {/* Info hint */}
          <div className="mb-3 rounded-xl border-l-[3px] border-l-[#4f7eff] bg-[#1a1d24] px-3 py-2 text-[11px] leading-relaxed text-[#5a5f78]">
            💡 선택 내용은 임시 저장됩니다. 모든 사진 검토 후 갤러리에서 한번에 전달돼요.
          </div>

          {/* Revision limit warning */}
          <div className="mb-3 flex items-center gap-1.5 text-[11px] text-[#f5a623]">
            ⚠️ 재보정은 최대 2회까지 가능합니다 (남은 횟수: {revisionRemaining}회)
          </div>

          {/* Action buttons */}
          <div className="mb-3 flex items-center gap-2">
            <button
              type="button"
              onClick={handleApprove}
              className="flex min-h-[44px] items-center gap-1.5 rounded-xl border border-[#2ed573] bg-[#0f2a1e] px-4 py-2 text-[13px] font-semibold text-[#2ed573] transition-opacity hover:opacity-80"
            >
              ✅ 확정
            </button>
            <button
              type="button"
              onClick={handleRevisionClick}
              className="flex min-h-[44px] items-center gap-1.5 rounded-xl border border-[#f5a623] bg-[#2a1a08] px-4 py-2 text-[13px] font-semibold text-[#f5a623] transition-opacity hover:opacity-80"
            >
              🔄 재보정 요청
            </button>
            {savedFlash && (
              <span className="text-[11px] text-[#2ed573]">✓ 임시 저장됨</span>
            )}
          </div>

          {/* Revision comment area */}
          {showRevisionArea && (
            <div>
              <textarea
                value={revisionComment}
                onChange={(e) => setRevisionComment(e.target.value)}
                placeholder={`어떤 부분을 수정하면 좋을지 입력해주세요\n예) 배경을 좀 더 밝게 해주세요`}
                className="h-20 w-full resize-none rounded-xl border border-[#252b3d] bg-[#1a1d24] px-3 py-2.5 text-[13px] text-[#e8eaf0] outline-none transition-colors placeholder:text-[#5a5f78] focus:border-[#f5a623]"
                rows={3}
              />
              <div className="mt-2 flex items-center justify-between">
                <span className="text-[11px] text-[#3a3f55]">입력 후 임시 저장 버튼을 눌러주세요</span>
                <button
                  type="button"
                  onClick={handleRevisionSave}
                  className="rounded-xl border border-[#252b3d] px-3 py-1.5 text-[12px] text-[#8b90a8] hover:border-[#f5a623] hover:text-[#f5a623]"
                >
                  임시 저장
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Bottom nav */}
        <div className="mt-4 flex items-center justify-between border-t border-[#1e2236] pt-4">
          <button
            type="button"
            onClick={goPrev}
            className="flex items-center gap-1.5 rounded-xl border border-[#1e2236] px-3 py-2 text-[12px] text-[#8b90a8] hover:border-[#252b3d] hover:text-[#e8eaf0]"
          >
            ← 이전 사진
          </button>
          <button
            type="button"
            onClick={goNext}
            className="flex items-center gap-1.5 rounded-xl border border-[#1e2236] px-3 py-2 text-[12px] text-[#8b90a8] hover:border-[#252b3d] hover:text-[#e8eaf0]"
          >
            다음 사진 →
          </button>
        </div>
      </div>

      <FullScreenCompareModal
        open={fullOpen}
        initialSide={fullInitial}
        originalUrl={current.originalUrl}
        versionUrl={current.versionUrl}
        versionLabel={versionLabel}
        onClose={() => setFullOpen(false)}
      />
    </div>
  );
}
