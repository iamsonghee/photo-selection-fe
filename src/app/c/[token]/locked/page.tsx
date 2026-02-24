"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useMemo } from "react";
import { format } from "date-fns";
import { ko } from "date-fns/locale";
import { getProjectByToken, getPhotosByProject } from "@/lib/mock-data";
import { loadConfirmedData } from "@/lib/confirmed-storage";
import type { ColorTag } from "@/types";

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
  const token = (params?.token as string) ?? "";
  const project = getProjectByToken(token);

  const { photos, N, photoStates } = useMemo(() => {
    if (!project) return { photos: [], N: 0, photoStates: {} as Record<string, { rating?: number; color?: ColorTag }> };
    const allPhotos = getPhotosByProject(project.id);
    const stored = loadConfirmedData(token);
    if (stored?.selectedIds?.length) {
      const idSet = new Set(stored.selectedIds);
      const filtered = allPhotos.filter((p) => idSet.has(p.id));
      filtered.sort((a, b) => a.orderIndex - b.orderIndex);
      return {
        photos: filtered,
        N: filtered.length,
        photoStates: stored.photoStates ?? {},
      };
    }
    const fallback = allPhotos.filter((p) => p.selected);
    return {
      photos: fallback,
      N: fallback.length,
      photoStates: {} as Record<string, { rating?: number; color?: ColorTag }>,
    };
  }, [project, token]);

  if (!project) return null;

  const M = project.photoCount;
  const confirmedDate = project.confirmedAt
    ? format(new Date(project.confirmedAt), "yyyy년 M월 d일 HH:mm", { locale: ko })
    : "—";

  return (
    <div className="min-h-screen bg-[#0a0b0d] text-[#e8eaf0]">
      {/* 상단 고정 잠금 배너 */}
      <div className="sticky top-0 z-50 flex items-center gap-2 border-b border-danger/25 bg-danger/10 px-5 py-2.5 text-[13px] text-danger backdrop-blur">
        🔒 확정된 사진입니다. 선택을 변경할 수 없습니다.
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
                src={getTestImageUrl(photo.id)}
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

      {/* 하단 고정 바 — 돌아가기 버튼 없음 */}
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
        </div>
      </div>
    </div>
  );
}
