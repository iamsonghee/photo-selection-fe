"use client";

import Link from "next/link";
import { useState } from "react";
import { useParams } from "next/navigation";
import { ArrowRight, Check, Sparkles } from "lucide-react";
import { PhotographerLightButton } from "@/components/photographer/PhotographerLightButton";
import { GuestMediaViewer, MediaThumb } from "@/components/guest-album/GuestAlbumParts";
import { countMedia, mediaSummary } from "@/lib/guest-album";
import { useGuestAlbum } from "../../_lib/album-store";

type Filter = "all" | "photo" | "video" | "selected";
const FILTERS: { value: Filter; label: string }[] = [
  { value: "all", label: "전체" },
  { value: "photo", label: "사진" },
  { value: "video", label: "영상" },
  { value: "selected", label: "고른 것" },
];

export default function GuestAlbumSelectPage() {
  const { albumId } = useParams<{ albumId: string }>();
  const { album, media, selected, toggle } = useGuestAlbum();
  const closed = album.closed;
  const [filter, setFilter] = useState<Filter>("all");
  const [openIndex, setOpenIndex] = useState<number | null>(null);
  const visible = media.filter((item) => filter === "all" || (filter === "selected" ? selected.has(item.id) : item.kind === filter));
  const selectedCounts = countMedia(media.filter((item) => selected.has(item.id)));
  const open = openIndex !== null ? visible[openIndex] : undefined;

  if (!closed) {
    return (
      <main className="mx-auto w-full max-w-[560px] px-5 py-16 text-center">
        <h1 className="text-[20px] font-bold">아직 셀렉을 시작하지 않았어요</h1>
        <p className="mt-2 text-[14px] text-muted-foreground">앨범 관리에서 셀렉을 시작하면 하객 업로드가 마감되고 고르기를 시작할 수 있어요.</p>
        <Link href={`/customer-select/guest/${albumId}`} className="mt-6 inline-flex h-11 items-center rounded-lg bg-foreground px-5 text-[14px] font-bold text-background">앨범 관리로 가기</Link>
      </main>
    );
  }

  return (
    <main className="mx-auto flex w-full max-w-[1200px] flex-col gap-5 px-5 pb-32 pt-6 md:px-8 md:pt-10">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-[24px] font-bold tracking-[-0.04em] md:text-[28px]">사진·영상 고르기</h1>
          <p className="mt-1 text-[14px] text-muted-foreground">마음에 드는 사진과 영상을 골라 주세요. 고른 것만 내려받을 수 있어요.</p>
          {/* TODO(2단계): 고른 결과 서버 저장 */}
          <p className="mt-1 text-[12px] font-semibold text-warning">고른 결과는 아직 저장되지 않아 새로고침하면 처음부터 골라야 해요.</p>
        </div>
        <Link href={`/customer-select/guest/${albumId}`} className="text-[13px] font-semibold text-muted-foreground underline underline-offset-4 hover:text-foreground">앨범 관리</Link>
      </header>

      <section className="flex flex-col gap-3 rounded-[20px] border border-border-subtle bg-surface p-4 sm:flex-row sm:items-center md:p-5" aria-label="AI 정리">
        <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-accent/10 text-accent"><Sparkles size={20} /></span>
        <div className="min-w-0 flex-1">
          <p className="text-[14px] font-bold">사진 AI 정리</p>
          <p className="mt-0.5 text-[13px] leading-5 text-muted-foreground">장면 나누기·비슷한 사진 묶기를 연결할 예정이에요. 영상은 AI 분석 없이 재생해 보고 직접 골라 주세요.</p>
        </div>
        {/* TODO(서버 연결): 촬영본 고르기의 AI 정리(장면·유사컷·흔들림)를 하객 사진에 연결 */}
        <PhotographerLightButton variant="outline" size="toolbar" disabled>AI로 정리하기 (준비 중)</PhotographerLightButton>
      </section>

      <div className="flex gap-1 self-start rounded-full bg-surface-raised p-1" role="group" aria-label="보기">
        {FILTERS.map((item) => (
          <button key={item.value} type="button" aria-pressed={filter === item.value} onClick={() => { setFilter(item.value); setOpenIndex(null); }}
            className={`h-9 rounded-full px-4 text-[13px] font-bold transition-colors ${filter === item.value ? "bg-surface text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}>
            {item.label}{item.value === "selected" ? ` ${selected.size}` : ""}
          </button>
        ))}
      </div>

      {visible.length === 0 ? (
        <p className="rounded-[20px] border border-border-subtle bg-surface px-6 py-14 text-center text-[14px] text-muted-foreground">{filter === "selected" ? "아직 고른 사진·영상이 없어요." : "해당하는 파일이 없어요."}</p>
      ) : (
        <ul className="grid grid-cols-3 gap-1.5 sm:grid-cols-4 md:grid-cols-6">
          {visible.map((item, index) => {
            const isSelected = selected.has(item.id);
            return (
              <li key={item.id} className="relative">
                <button type="button" onClick={() => setOpenIndex(index)} aria-label={`${item.fileName} 크게 보기`}
                  className={`block w-full overflow-hidden rounded-xl ring-inset focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50 ${isSelected ? "ring-[3px] ring-accent" : ""}`}>
                  <MediaThumb media={item} className="aspect-square" />
                </button>
                <button type="button" onClick={() => toggle(item.id)} aria-pressed={isSelected} aria-label={`${item.fileName} ${isSelected ? "선택 해제" : "선택"}`}
                  className={`absolute right-1 top-1 grid size-9 place-items-center rounded-full border-2 transition-colors ${isSelected ? "border-accent bg-accent text-white" : "border-white bg-black/25 text-transparent hover:bg-black/40"}`}>
                  <Check size={18} strokeWidth={3} />
                </button>
              </li>
            );
          })}
        </ul>
      )}

      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-border-subtle bg-surface pb-[env(safe-area-inset-bottom)] shadow-[0_-6px_18px_rgba(2,56,82,0.06)]">
        <div className="mx-auto flex max-w-[1200px] items-center gap-3 px-5 py-3 md:px-8">
          <p className="min-w-0 flex-1 text-[14px]"><strong className="font-bold">{selected.size}개 선택</strong><span className="ml-1.5 text-muted-foreground">{selected.size ? mediaSummary(selectedCounts) : ""}</span></p>
          {selected.size
            ? <Link href={`/customer-select/guest/${albumId}/download`} className="inline-flex h-12 items-center gap-1.5 rounded-lg bg-accent px-5 text-[14px] font-bold text-white hover:bg-[var(--accent-hover)]">선택본 다운로드<ArrowRight size={16} /></Link>
            : <PhotographerLightButton size="work-panel" disabled>선택본 다운로드</PhotographerLightButton>}
        </div>
      </div>

      {open && openIndex !== null ? (
        <GuestMediaViewer
          media={open}
          onClose={() => setOpenIndex(null)}
          onPrev={openIndex > 0 ? () => setOpenIndex(openIndex - 1) : undefined}
          onNext={openIndex < visible.length - 1 ? () => setOpenIndex(openIndex + 1) : undefined}
          actions={(
            <button type="button" onClick={() => toggle(open.id)} aria-pressed={selected.has(open.id)}
              className={`inline-flex h-12 shrink-0 items-center justify-center gap-1.5 rounded-lg px-6 text-[15px] font-bold ${selected.has(open.id) ? "bg-accent text-white" : "bg-white text-black"}`}>
              <Check size={18} strokeWidth={3} />{selected.has(open.id) ? "선택됨" : "선택"}
            </button>
          )}
        />
      ) : null}
    </main>
  );
}
