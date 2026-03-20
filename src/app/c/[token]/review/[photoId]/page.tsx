"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
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
  const [showRevisionArea, setShowRevisionArea] = useState(
    review?.status === "revision_requested"
  );
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
      if (e.key === "ArrowLeft") {
        e.preventDefault();
        goPrev();
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        goNext();
      }
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
      <div className="flex min-h-screen items-center justify-center bg-[#0a0b0d]">
        <p className="text-[#5a5f7a]">
          {selectionLoading ? "로딩 중…" : "존재하지 않는 초대 링크입니다."}
        </p>
      </div>
    );
  }

  const canShowReview =
    project.status === "reviewing_v1" || project.status === "reviewing_v2";
  if (!canShowReview) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#0a0b0d]">
        <Link
          href={`/c/${token}/confirmed`}
          className="inline-flex items-center gap-1.5 rounded-lg border border-[#2e3348] px-3 py-1.5 text-[12px] font-semibold text-[#8b8fa8]"
        >
          확정 페이지로
        </Link>
      </div>
    );
  }

  if (!current) {
    if (reviewPhotosLoading || photos.length === 0) {
      return (
        <div className="flex min-h-screen items-center justify-center bg-[#0a0b0d]">
          <p className="text-[#5a5f7a]">불러오는 중...</p>
        </div>
      );
    }
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#0a0b0d]">
        <div className="text-center">
          <p className="text-[#5a5f7a]">사진을 찾을 수 없습니다.</p>
          <Link
            href={`/c/${token}/review`}
            className="mt-4 inline-block rounded-lg border border-[#2e3348] px-3 py-1.5 text-[12px] font-semibold text-[#8b8fa8]"
          >
            갤러리로
          </Link>
        </div>
      </div>
    );
  }

  const revisionRemaining = project.status === "reviewing_v2" ? 1 : 2;
  const badgeLabel =
    review?.status === "approved"
      ? "확정"
      : review?.status === "revision_requested"
        ? "재보정"
        : "미검토";

  return (
    <div className="min-h-screen bg-[#0a0b0d] text-[#e8eaf0]">
      <div className="mx-auto max-w-[860px] px-5 py-7">
        {/* viewer-header (와이어프레임) */}
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-3">
            <Link
              href={`/c/${token}/review`}
              className="inline-flex items-center gap-1.5 rounded-lg border border-[#2e3348] px-3 py-1.5 text-[12px] font-semibold text-[#8b8fa8]"
            >
              ← 목록
            </Link>
            <div>
              <div className="text-[15px] font-bold text-[#e8eaf0]">
                {current.originalFilename}
              </div>
              <div className="text-[11px] text-[#5a5f7a]">
                {currentIndex + 1} / {photos.length}장 ·{" "}
                <span
                  className={`inline-block rounded-[20px] px-2 py-0.5 text-[10px] font-semibold ${
                    review?.status === "approved"
                      ? "bg-[#0f2a1e] text-[#2ed573] border border-[#2ed573]"
                      : review?.status === "revision_requested"
                        ? "bg-[#2a1408] text-[#f5a623] border border-[#f5a623]"
                        : "bg-[#1a1d28] text-[#5a5f7a] border border-[#2e3348]"
                  }`}
                >
                  {badgeLabel}
                </span>
              </div>
            </div>
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={goPrev}
              className="inline-flex items-center gap-1.5 rounded-lg border border-[#2e3348] px-3 py-1.5 text-[12px] font-semibold text-[#8b8fa8] bg-transparent"
            >
              ← 이전
            </button>
            <button
              type="button"
              onClick={goNext}
              className="inline-flex items-center gap-1.5 rounded-lg border border-[#2e3348] px-3 py-1.5 text-[12px] font-semibold text-[#8b8fa8] bg-transparent"
            >
              다음 →
            </button>
          </div>
        </div>

        {/* compare-grid (와이어프레임: 2열, gap 3px, border-radius 12px) */}
        <div className="grid grid-cols-2 gap-[3px] rounded-xl overflow-hidden border border-[#1e2028] mb-2.5">
          <div className="relative aspect-[4/3] bg-[#1a1d28] flex items-center justify-center">
            <img
              src={current.originalUrl}
              alt="원본"
              className="w-full h-full object-contain cursor-zoom-in"
              onClick={() => {
                setFullInitial("original");
                setFullOpen(true);
              }}
            />
            <span className="absolute top-2.5 left-2.5 rounded-md bg-black/55 px-2.5 py-1 text-[11px] font-bold text-[#aaa]">
              원본
            </span>
          </div>
          <div className="relative aspect-[4/3] bg-[#1a2030] flex items-center justify-center">
            <img
              src={current.versionUrl}
              alt="보정본"
              className="w-full h-full object-contain cursor-zoom-in"
              onClick={() => {
                setFullInitial("version");
                setFullOpen(true);
              }}
            />
            <span className="absolute top-2.5 left-2.5 rounded-md bg-[#4f7eff]/85 px-2.5 py-1 text-[11px] font-bold text-white">
              보정본 {project.status === "reviewing_v2" ? "v2" : "v1"}
            </span>
          </div>
        </div>
        <p className="text-center text-[11px] text-[#3a3f55] mb-4">
          💡 추후 슬라이더로 좌우 드래그 비교 가능
        </p>

        {/* memo-box (와이어프레임) */}
        <div className="rounded-lg border border-[#1a1d28] bg-[#0e0f14] px-3.5 py-2.5 text-[12px] text-[#8b8fa8] mb-3.5">
          📝 작가 메모:{" "}
          {current.photographerMemo ?? "없음"}
        </div>

        {/* feedback-card (와이어프레임) */}
        <div className="rounded-[10px] border border-[#1e2028] bg-[#0e0f14] p-4 mb-3.5">
          <div className="text-[13px] font-bold mb-1.5">이 사진에 대한 의견</div>
          <div className="text-[11px] text-[#3a3f55] mb-3 py-2 px-2.5 rounded-md bg-[#111318] border-l-[3px] border-l-[#4f7eff]">
            💡 선택 내용은 임시 저장됩니다. 모든 사진 검토 후 갤러리에서 한번에
            작가에게 전달돼요.
          </div>
          <div className="text-[11px] text-[#f5a623] flex items-center gap-1.5 mb-3">
            ⚠️ 재보정은 최대 2회까지 가능합니다 (남은 횟수: {revisionRemaining}회)
          </div>
          <div className="flex gap-2 items-center mb-3">
            <button
              type="button"
              onClick={handleApprove}
              className="inline-flex items-center gap-1.5 rounded-lg py-2 px-4 text-[13px] font-semibold bg-[#0f2a1e] border border-[#2ed573] text-[#2ed573]"
            >
              ✅ 확정
            </button>
            <button
              type="button"
              onClick={handleRevisionClick}
              className="inline-flex items-center gap-1.5 rounded-lg py-2 px-4 text-[13px] font-semibold bg-[#2a1a08] border border-[#f5a623] text-[#f5a623]"
            >
              🔄 재보정 요청
            </button>
            {savedFlash && (
              <span className="text-[11px] text-[#2ed573]">✓ 임시 저장됨</span>
            )}
          </div>

          {/* revision-area: 재보정 요청 클릭 시 또는 이미 재보정 상태일 때 표시 */}
          <div
            className={showRevisionArea ? "block" : "hidden"}
          >
            <textarea
              value={revisionComment}
              onChange={(e) => setRevisionComment(e.target.value)}
              placeholder={`어떤 부분을 수정하면 좋을지 입력해주세요\n예) 배경을 좀 더 밝게 해주세요, 피부톤을 더 자연스럽게...`}
              className="w-full rounded-lg border border-[#2e3348] bg-[#111318] px-3 py-2.5 text-[13px] text-[#e8eaf0] placeholder-[#5a5f7a] focus:border-[#f5a623] focus:outline-none resize-none h-20 font-[inherit]"
              rows={3}
            />
            <div className="flex items-center justify-between mt-2">
              <span className="text-[11px] text-[#3a3f55]">
                입력 후 임시 저장 버튼을 눌러주세요
              </span>
              <button
                type="button"
                onClick={handleRevisionSave}
                className="inline-flex items-center gap-1.5 rounded-lg border border-[#2e3348] px-3 py-1.5 text-[12px] font-semibold text-[#8b8fa8] bg-transparent"
              >
                임시 저장
              </button>
            </div>
          </div>
        </div>

        {/* viewer-nav (와이어프레임) */}
        <div className="flex items-center justify-between pt-4 border-t border-[#1e2028]">
          <div className="flex gap-2">
            <button
              type="button"
              onClick={goPrev}
              className="inline-flex items-center gap-1.5 rounded-lg border border-[#2e3348] px-3 py-1.5 text-[12px] font-semibold text-[#8b8fa8] bg-transparent"
            >
              ← 이전 사진
            </button>
            <button
              type="button"
              onClick={goNext}
              className="inline-flex items-center gap-1.5 rounded-lg border border-[#2e3348] px-3 py-1.5 text-[12px] font-semibold text-[#8b8fa8] bg-transparent"
            >
              다음 사진 →
            </button>
          </div>
        </div>
      </div>

      <FullScreenCompareModal
        open={fullOpen}
        initialSide={fullInitial}
        originalUrl={current.originalUrl}
        versionUrl={current.versionUrl}
        versionLabel={`보정본 ${project.status === "reviewing_v2" ? "v2" : "v1"}`}
        onClose={() => setFullOpen(false)}
      />
    </div>
  );
}
