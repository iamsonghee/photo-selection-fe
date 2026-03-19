"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { format } from "date-fns";
import { ko } from "date-fns/locale";
import { useSelectionOptional } from "@/contexts/SelectionContext";
import { Button } from "@/components/ui";
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

  useEffect(() => {
    setMounted(true);
  }, []);

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
    return {
      photos: filtered,
      N: filtered.length,
      photoStates: ctx.photoStates ?? {},
    };
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
        setCancelling(false);
        return;
      }
      setCancelModalOpen(false);
      if (typeof window !== "undefined") {
        window.location.replace(`/c/${token}/gallery`);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setCancelling(false);
    }
  };

  if (!mounted) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#0a0b0d]">
        <p className="text-zinc-400">불러오는 중...</p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#0a0b0d]">
        <p className="text-zinc-400">불러오는 중...</p>
      </div>
    );
  }

  if (!project) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#0a0b0d]">
        <p className="text-zinc-400">존재하지 않는 초대 링크입니다.</p>
      </div>
    );
  }

  if (project.status === "selecting") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#0a0b0d]">
        <p className="text-zinc-400">이동 중...</p>
      </div>
    );
  }

  const M = project.photoCount;
  const confirmedDate = project.confirmedAt
    ? format(new Date(project.confirmedAt), "yyyy년 M월 d일 HH:mm", { locale: ko })
    : "—";

  const isEditing = project.status === "editing";
  const isConfirmed = project.status === "confirmed";

  return (
    <div className="min-h-screen bg-[#0a0b0d] text-[#e8eaf0]">
      {/* 상단 고정 잠금 배너: 상태별 안내 문구 분기 */}
      <div
        className={
          isEditing
            ? "sticky top-0 z-50 flex items-center gap-2 border-b border-danger/25 bg-danger/10 px-5 py-2.5 text-[13px] text-danger backdrop-blur"
            : "sticky top-0 z-50 flex items-center gap-2 border-b border-[#252830] bg-[#13151a] px-5 py-2.5 text-[13px] text-[#8b90a0] backdrop-blur"
        }
      >
        {isEditing
          ? "🔒 보정 작업이 시작되어 선택을 변경할 수 없습니다."
          : isConfirmed
            ? "🔒 확정된 선택입니다. 다시 선택하려면 아래 확정 취소를 이용하세요."
            : "🔒 현재 상태에서는 확정 취소를 사용할 수 없습니다."}
      </div>

      {/* 헤더 */}
      <header className="flex items-center gap-3 border-b border-[#252830] bg-[#13151a] px-5 py-3.5">
        <Link
          href={`/c/${token}/confirmed`}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-[20px] text-[#e8eaf0] hover:bg-[#252830] active:opacity-80"
          aria-label="뒤로 가기"
        >
          ‹
        </Link>
        <div className="min-w-0 flex-1">
          <div className="text-[15px] font-semibold truncate">{project.name}</div>
          <div className="text-xs text-[#8b90a0] mt-0.5">선택한 사진 · 읽기 전용</div>
        </div>
        <span className="rounded-full bg-[#2ed573]/10 px-3 py-1 font-mono text-xs font-semibold text-[#2ed573]">
          {N} / {M}
        </span>
      </header>

      {/* 필터 바 (비활성) */}
      <div className="flex items-center gap-2 border-b border-[#252830] bg-[#13151a] px-5 py-2.5 opacity-40 pointer-events-none">
        <span className="rounded-full border border-[#2ed573] bg-[#2ed573]/10 px-3 py-1 text-[11px] text-[#2ed573]">
          선택됨 {N}
        </span>
        <span className="rounded-full border border-[#252830] bg-[#1a1d24] px-3 py-1 text-[11px] text-[#8b90a0]">
          ⭐5
        </span>
        <span className="rounded-full border border-[#252830] bg-[#1a1d24] px-3 py-1 text-[11px] text-[#8b90a0]">
          ⭐4
        </span>
        <span className="rounded-full border border-[#252830] bg-[#1a1d24] px-3 py-1 text-[11px] text-[#8b90a0]">
          🔴
        </span>
        <span className="rounded-full border border-[#252830] bg-[#1a1d24] px-3 py-1 text-[11px] text-[#8b90a0]">
          🟡
        </span>
        <span className="rounded-full border border-[#252830] bg-[#1a1d24] px-3 py-1 text-[11px] text-[#8b90a0]">
          🟢
        </span>
        <span className="ml-auto flex items-center gap-1 text-[11px] text-[#5a5f70]">
          🔒 읽기 전용
        </span>
      </div>

      {/* 갤러리 그리드 — 선택된 N장만, 인터랙션 비활성 */}
      <div className="grid grid-cols-4 gap-2.5 px-5 py-4 pb-28">
        {photos.map((photo) => {
          const state = photoStates[photo.id] ?? photo.tag;
          const rating = state?.rating ?? photo.tag?.star;
          const colorTag = state?.color ?? photo.tag?.color;
          const hasTag = (rating != null && rating > 0) || colorTag != null;
          return (
            <div
              key={photo.id}
              className="relative aspect-[4/3] overflow-hidden rounded-xl bg-[#1a1d24] border-2 border-[#2ed573]/35 cursor-default"
            >
              <img
                src={photo.url || getTestImageUrl(photo.id)}
                alt=""
                className="h-full w-full object-cover block"
              />
              {/* 읽기 전용 오버레이 — 클릭/호버 무시 */}
              <div className="absolute inset-0 cursor-not-allowed" aria-hidden />
              {/* 선택 체크 배지 */}
              <div className="absolute top-1.5 right-1.5 flex h-[22px] w-[22px] items-center justify-center rounded-full bg-[#2ed573] text-[11px] font-medium text-white">
                ✓
              </div>
              {/* 태그 오버레이 (하단 좌측) */}
              {hasTag && (
                <div className="absolute bottom-1.5 left-1.5 flex items-center gap-1">
                  {rating != null && rating > 0 && (
                    <span className="rounded bg-black/65 px-1.5 py-0.5 text-[11px] text-[#f5a623]">
                      {"★".repeat(rating)}
                    </span>
                  )}
                  {colorTag && (
                    <span
                      className="h-3 w-3 rounded-full border border-white/40"
                      style={{ backgroundColor: COLOR_HEX[colorTag] }}
                    />
                  )}
                </div>
              )}
              {/* 번호 (하단 우측) */}
              <div className="absolute bottom-1.5 right-1.5 rounded bg-black/60 px-1.5 py-0.5 font-mono text-[10px] text-[#8b90a0]">
                #{photo.orderIndex}
              </div>
            </div>
          );
        })}
      </div>

      {/* 하단 고정 바 — 확정 취소는 confirmed일 때만, editing이면 비활성화 */}
      <div className="fixed bottom-0 left-0 right-0 z-20 border-t border-[#252830] bg-[#0d0f14]/95 px-5 py-3.5 backdrop-blur">
        <div className="mx-auto flex max-w-2xl items-center justify-between gap-4">
          <div className="flex-1 min-w-0">
            <div className="font-mono text-sm font-semibold text-[#2ed573]">
              {N}장 확정 완료
            </div>
            <div className="text-xs text-[#8b90a0] mt-0.5">{confirmedDate} 확정</div>
            <div className="h-1 mt-2 rounded-full bg-[#1a1d24] overflow-hidden">
              <div
                className="h-full rounded-full bg-[#2ed573]"
                style={{ width: M ? `${(N / M) * 100}%` : "100%" }}
              />
            </div>
          </div>
          {project.status === "confirmed" && (
            <div className="shrink-0 flex flex-col items-end gap-1">
              <span className="text-[10px] text-[#5a5f70] text-right">
                남은 횟수 {remainingCancels}
              </span>
              {atCancelLimit ? (
                <span className="max-w-[140px] text-right text-[10px] text-[#8b90a0] leading-tight">
                  확정 취소는 최대 3회까지 가능합니다
                </span>
              ) : null}
              <Button
                variant="outline"
                className="border-[#252830] text-[#8b90a0] hover:border-[#ff4757] hover:text-[#ff4757] disabled:opacity-50"
                disabled={!canCancel}
                onClick={() => canCancel && setCancelModalOpen(true)}
              >
                확정 취소
              </Button>
            </div>
          )}
          {project.status === "editing" && (
            <span className="text-xs text-[#5a5f70] shrink-0">보정 진행 중</span>
          )}
          {project.status !== "confirmed" && project.status !== "editing" && (
            <span className="text-xs text-[#5a5f70] shrink-0">확정 취소 비활성 상태</span>
          )}
        </div>
      </div>

      {/* 확정 취소 확인 모달 */}
      {cancelModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-sm rounded-xl border border-[#252830] bg-[#13151a] p-6 shadow-xl">
            <p className="text-center text-[#e8eaf0]">
              확정을 취소하고 다시 선택하시겠습니까? (남은 횟수 {remainingCancels})
            </p>
            <div className="mt-6 flex gap-2">
              <Button
                variant="outline"
                className="flex-1"
                onClick={() => setCancelModalOpen(false)}
              >
                아니오
              </Button>
              <Button
                variant="primary"
                className="flex-1"
                onClick={handleConfirmCancel}
                disabled={cancelling}
              >
                {cancelling ? "처리 중..." : "예, 다시 선택할게요"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
