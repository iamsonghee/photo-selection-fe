"use client";

import Link from "next/link";
import { ChevronLeft, Download } from "lucide-react";
import { PhotographerLightButton } from "@/components/photographer/PhotographerLightButton";
import { MediaThumb } from "@/components/guest-album/GuestAlbumParts";
import { countMedia, formatWeddingDateTime, mediaSummary, retentionEndDate } from "@/lib/guest-album";
import { useGuestAlbum } from "../../_lib/album-store";

export default function GuestAlbumDownloadPage() {
  const { album, media, selected, limits } = useGuestAlbum();
  const picked = media.filter((item) => selected.has(item.id));
  const counts = countMedia(picked);
  const selectHref = `/customer-select/guest/${album.id}/select`;

  return (
    <main className="mx-auto flex w-full max-w-[840px] flex-col gap-5 px-5 pb-16 pt-6 md:px-8 md:pt-10">
      <Link href={selectHref} className="-ml-1 inline-flex items-center gap-1 self-start text-[14px] font-semibold text-muted-foreground hover:text-foreground"><ChevronLeft size={18} />고르기로 돌아가기</Link>
      <header>
        <h1 className="text-[24px] font-bold tracking-[-0.04em] md:text-[28px]">선택본 다운로드</h1>
        <p className="mt-1 text-[14px] text-muted-foreground">고른 사진과 영상만 하객이 보낸 그대로 내려받을 수 있어요.</p>
      </header>

      {picked.length === 0 ? (
        <section className="rounded-[24px] border border-border-subtle bg-surface px-6 py-14 text-center">
          <p className="text-[16px] font-bold">아직 고른 사진·영상이 없어요</p>
          <Link href={selectHref} className="mt-4 inline-flex h-11 items-center rounded-lg bg-foreground px-5 text-[14px] font-bold text-background">고르러 가기</Link>
        </section>
      ) : (
        <>
          <section className="rounded-[24px] border border-border-subtle bg-surface p-5 md:p-6" aria-label="내려받을 파일">
            <p className="text-[16px] font-bold">{mediaSummary(counts)}</p>
            <ul className="mt-4 divide-y divide-border-subtle">
              {picked.map((item) => (
                <li key={item.id} className="flex items-center gap-3 py-2.5">
                  <MediaThumb media={item} className="size-14 shrink-0 rounded-lg" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-mono text-[13px]">{item.fileName}</p>
                    <p className="truncate text-[12px] text-muted-foreground">{item.guestName} · {item.kind === "video" ? "영상" : item.isOriginal ? "사진 원본" : "줄인 사진"}</p>
                  </div>
                </li>
              ))}
            </ul>
          </section>
          <p className="text-[13px] text-muted-foreground">{formatWeddingDateTime(retentionEndDate(album.weddingDate, limits.retentionDays))}까지 내려받을 수 있어요.</p>
          {/* TODO(2단계): 선택본 묶음 다운로드 API */}
          <PhotographerLightButton size="confirmation" disabled><Download size={18} />다운로드 준비 중</PhotographerLightButton>
          <p className="text-center text-[13px] text-muted-foreground">다운로드는 다음 업데이트에서 열려요.</p>
        </>
      )}
    </main>
  );
}
