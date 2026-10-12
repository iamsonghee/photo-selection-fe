"use client";

import { useCallback, useEffect, useState } from "react";
import { GuestRetentionWarning } from "@/components/guest-album/GuestRetentionWarning";
import Link from "next/link";
import { ChevronLeft, Download } from "lucide-react";
import { PhotographerLightButton } from "@/components/photographer/PhotographerLightButton";
import { MediaThumb } from "@/components/guest-album/GuestAlbumParts";
import { countMedia, formatWeddingDateTime, mediaSummary, retentionEndDate } from "@/lib/guest-album";
import { useGuestAlbum } from "../../_lib/album-store";

type Part = { id: string; part_number: number; status: string; processed_bytes: number; total_bytes: number; url: string | null };
export default function GuestAlbumDownloadPage() {
  const { album, media, selected, limits, saving, saveError } = useGuestAlbum();
  const picked = media.filter((item) => selected.has(item.id));
  const counts = countMedia(picked);
  const selectHref = `/customer-select/guest/${album.id}/select`;

  const [parts, setParts] = useState<Part[]>([]);
  const [archiveId, setArchiveId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [starting, setStarting] = useState(false);
  const endpoint = `/api/customer-select/guest-albums/${album.id}/archives`;
  const refresh = useCallback(async (id?: string | null) => {
    const response = await fetch(`${endpoint}${id ? `?archiveId=${id}` : ""}`, { cache: "no-store" });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error);
    setParts(data.parts);
    setArchiveId(data.archiveId);
  }, [endpoint]);
  useEffect(() => {
    let alive = true;
    async function poll() {
      try { if (alive) await refresh(archiveId); } catch (e) { if (alive) setError(e instanceof Error ? e.message : "상태를 읽지 못했어요."); }
    }
    void poll();
    const timer = setInterval(() => { void poll(); }, 5000);
    return () => { alive = false; clearInterval(timer); };
  }, [refresh, archiveId]);
  async function start() {
    setStarting(true); setError("");
    try {
      const response = await fetch(endpoint, { method: "POST" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      await refresh(data.archiveId);
    } catch (e) { setError(e instanceof Error ? e.message : "준비하지 못했어요. 다시 시도해 주세요."); }
    finally { setStarting(false); }
  }
  const processing = parts.some((part) => part.status === "pending" || part.status === "processing");

  return (
    <main className="mx-auto flex w-full max-w-[840px] flex-col gap-5 px-5 pb-16 pt-6 md:px-8 md:pt-10">
      <Link href={selectHref} className="-ml-1 inline-flex items-center gap-1 self-start text-[14px] font-semibold text-muted-foreground hover:text-foreground"><ChevronLeft size={18} />고르기로 돌아가기</Link>
      <header>
        <h1 className="text-[24px] font-bold tracking-[-0.04em] md:text-[28px]">선택본 다운로드</h1>
        <p className="mt-1 text-[14px] text-muted-foreground">고른 사진과 영상만 하객이 보낸 그대로 내려받을 수 있어요.</p>
      </header>

      <GuestRetentionWarning weddingDate={album.weddingDate} days={limits.retentionDays} />
      {picked.length === 0 ? (
        <section className="rounded-2xl border border-border-subtle bg-surface px-6 py-14 text-center">
          <p className="text-[16px] font-bold">아직 고른 사진·영상이 없어요</p>
          <Link href={selectHref} className="mt-4 inline-flex h-11 items-center rounded-lg bg-foreground px-5 text-[14px] font-bold text-background">고르러 가기</Link>
        </section>
      ) : (
        <>
          <section className="rounded-2xl border border-border-subtle bg-surface p-5 md:p-6" aria-label="내려받을 파일">
            <p className="text-[16px] font-bold">{mediaSummary(counts)}</p>
            <ul className="mt-4 divide-y divide-border-subtle">
              {picked.map((item) => (
                <li key={item.id} className="flex items-center gap-3 py-2.5">
                  <MediaThumb media={item} className="size-14 shrink-0 rounded-lg" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-mono text-[13px]">{item.fileName}</p>
                    <p className="truncate text-[12px] text-muted-foreground">{item.guestName} · {item.kind === "video" ? "영상 원본" : item.isOriginal ? "사진 원본" : "줄인 사진"}</p>
                  </div>
                </li>
              ))}
            </ul>
          </section>
          <p className="text-[13px] text-muted-foreground">{formatWeddingDateTime(retentionEndDate(album.weddingDate, limits.retentionDays))}까지 내려받을 수 있어요.</p>
          <PhotographerLightButton size="confirmation" disabled={starting || saving || Boolean(saveError) || processing} onClick={start}><Download size={18} />{starting || processing ? "ZIP 준비 중…" : "현재 선택으로 ZIP 만들기"}</PhotographerLightButton>
          <p className="text-[13px] text-muted-foreground">ZIP은 만들기를 누른 시점의 선택으로 준비해요. 선택을 바꿨다면 다시 만들어 주세요. 큰 묶음은 여러 파트로 나눠요.</p>
        </>
      )}
      {error || saveError ? <p role="alert" className="text-[14px] text-danger">{error || saveError}</p> : null}
      {parts.length > 0 ? <section aria-label="ZIP 준비 현황" className="space-y-3">
        {parts.map((part) => <div key={part.id} className="rounded-xl border border-border-subtle p-4 text-[14px]">
          <p role="status">파트 {part.part_number} · {part.status === "ready" ? "준비 완료" : part.status === "failed" ? "만들지 못했어요. ZIP 만들기를 다시 눌러 주세요." : `${Math.min(99, Math.round(part.processed_bytes / Math.max(1, part.total_bytes) * 100))}% 준비 중`}</p>
          {part.status !== "ready" && part.status !== "failed" ? <progress className="mt-2 w-full" aria-label={`파트 ${part.part_number} 준비 진행률`} max={part.total_bytes} value={part.processed_bytes} /> : null}
          {part.url ? <a href={part.url} className="mt-2 inline-flex min-h-11 items-center font-semibold text-accent underline">파트 {part.part_number} 내려받기</a> : null}
        </div>)}
      </section> : null}
    </main>
  );
}
