"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import QRCode from "qrcode";
import { ArrowRight, CheckCircle2, Download, ExternalLink, Lock, RefreshCw, Upload } from "lucide-react";
import { PhotographerLightButton } from "@/components/photographer/PhotographerLightButton";
import { PhotographerConfirmDialog } from "@/components/ui/PhotographerConfirmDialog";
import { GuestMediaGrid } from "@/components/guest-album/GuestAlbumParts";
import { countMedia, formatWeddingDateTime, guestUploadPath, mediaSummary, retentionEndDate, weddingMeta, type GuestMediaKind } from "@/lib/guest-album";
import { CustomerShareLinkField } from "../../_lib/CustomerShareLinkField";
import { useGuestAlbum } from "../_lib/album-store";

const FILTERS: { value: "all" | GuestMediaKind; label: string }[] = [
  { value: "all", label: "전체" },
  { value: "photo", label: "사진" },
  { value: "video", label: "영상" },
];

export default function GuestAlbumManagePage() {
  const router = useRouter();
  const params = useSearchParams();
  const { album, media, guests, limits, close } = useGuestAlbum();
  const [filter, setFilter] = useState<"all" | GuestMediaKind>("all");
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [closing, setClosing] = useState(false);
  const [closeError, setCloseError] = useState("");
  const [qr, setQr] = useState<string | null>(null);
  const counts = countMedia(media);
  const visible = filter === "all" ? media : media.filter((item) => item.kind === filter);
  const guestPath = guestUploadPath(album.uploadToken);
  const selectHref = `/customer-select/guest/${album.id}/select`;

  useEffect(() => {
    QRCode.toDataURL(`${window.location.origin}${guestPath}`, { width: 640, margin: 2, errorCorrectionLevel: "M" }).then(setQr).catch(() => setQr(null));
  }, [guestPath]);

  async function startSelect() {
    setClosing(true);
    setCloseError("");
    try {
      await close();
      router.push(selectHref);
    } catch (error) {
      setCloseError(error instanceof Error ? error.message : "셀렉을 시작하지 못했어요.");
      setClosing(false);
    }
  }

  return (
    <main className="mx-auto flex w-full max-w-[1200px] flex-col gap-6 px-5 pb-32 pt-6 md:px-8 md:pt-10">
      {params.get("created") ? (
        <p role="status" className="flex items-start gap-2 rounded-2xl bg-accent/10 px-4 py-3 text-[14px] font-semibold text-accent">
          <CheckCircle2 size={18} className="mt-0.5 shrink-0" />하객 앨범을 만들었어요. 아래 QR을 식장에 두거나 링크를 보내 주세요.
        </p>
      ) : null}

      <header>
        <span className="inline-flex h-7 items-center rounded-full bg-surface-raised px-2.5 text-[12px] font-bold text-muted-foreground">하객 사진 모으기</span>
        <h1 className="mt-2 text-[24px] font-bold tracking-[-0.04em] md:text-[30px]">{album.name}</h1>
        <p className="mt-1 text-[14px] text-muted-foreground">{weddingMeta(album)}</p>
        <p className={`mt-1 inline-flex items-center gap-1.5 text-[14px] font-semibold ${album.closed ? "text-muted-foreground" : "text-success"}`}>
          {album.closed ? <><Lock size={14} />업로드 마감 · 셀렉 중</> : <><span className="size-2 rounded-full bg-success" aria-hidden />하객 업로드 받는 중</>}
        </p>
      </header>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <section aria-labelledby="share-title" className="rounded-2xl border border-border-subtle bg-surface p-5 md:p-6">
          <h2 id="share-title" className="text-[16px] font-bold">QR·링크 공유</h2>
          <div className="mt-4 flex flex-col gap-5 sm:flex-row">
            <div className="grid aspect-square w-40 shrink-0 place-items-center self-center overflow-hidden rounded-2xl border border-border-subtle bg-white sm:self-start">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              {qr ? <img src={qr} alt="하객 업로드 QR 코드" className="size-full" /> : <span className="text-[12px] text-subtle-foreground">QR 만드는 중</span>}
            </div>
            <div className="flex min-w-0 flex-1 flex-col gap-3">
              <p className="text-[14px] leading-6 text-muted-foreground">하객이 QR을 찍으면 앱 설치 없이 바로 사진과 영상을 보내는 화면이 열려요.</p>
              <CustomerShareLinkField path={guestPath} allowShare shareTitle={`${album.name} — 사진을 보내 주세요`} />
              <div className="flex flex-wrap gap-2">
                {qr ? <a href={qr} download={`${album.name} QR.png`} className="inline-flex h-11 items-center gap-1.5 rounded-lg border border-border-subtle bg-surface px-4 text-[14px] font-semibold hover:bg-surface-raised"><Download size={16} />QR 이미지 저장</a> : null}
                <Link href={guestPath} target="_blank" className="inline-flex h-11 items-center gap-1.5 rounded-lg border border-border-subtle bg-surface px-4 text-[14px] font-semibold hover:bg-surface-raised"><ExternalLink size={16} />하객 화면 열기</Link>
              </div>
            </div>
          </div>
        </section>

        <section aria-labelledby="status-title" className="flex flex-col rounded-2xl border border-border-subtle bg-surface p-5 md:p-6">
          <div className="flex items-center justify-between gap-3">
            <h2 id="status-title" className="text-[16px] font-bold">업로드 현황</h2>
            <button type="button" onClick={() => router.refresh()} className="inline-flex h-9 items-center gap-1.5 rounded-lg px-2.5 text-[13px] font-semibold text-muted-foreground hover:bg-surface-raised hover:text-foreground"><RefreshCw size={14} />새로 보기</button>
          </div>
          <dl className="mt-4 grid grid-cols-3 gap-2">
            {([["사진", counts.photos, "장"], ["영상", counts.videos, "개"], ["참여 하객", guests, "명"]] as const).map(([label, value, unit]) => (
              <div key={label} className="rounded-2xl bg-surface-raised px-4 py-3">
                <dt className="text-[13px] font-semibold text-muted-foreground">{label}</dt>
                <dd className="mt-1 text-[22px] font-bold tracking-[-0.02em]">{value.toLocaleString()}<span className="ml-0.5 text-[14px] font-semibold text-muted-foreground">{unit}</span></dd>
              </div>
            ))}
          </dl>
          <p className="mt-4 text-[13px] leading-5 text-muted-foreground">
            결혼식 날짜부터 {limits.retentionDays}일 동안, {formatWeddingDateTime(retentionEndDate(album.weddingDate, limits.retentionDays))}까지 보관해요.
          </p>
        </section>
      </div>

      <section aria-labelledby="files-title">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 id="files-title" className="text-[18px] font-bold">올라온 사진·영상 <span className="text-[15px] font-semibold text-subtle-foreground">{media.length.toLocaleString()}</span></h2>
          {media.length > 0 ? (
            <div className="flex gap-1 rounded-full bg-surface-raised p-1" role="group" aria-label="파일 종류">
              {FILTERS.map((item) => (
                <button key={item.value} type="button" aria-pressed={filter === item.value} onClick={() => setFilter(item.value)}
                  className={`h-9 rounded-full px-4 text-[13px] font-bold transition-colors ${filter === item.value ? "bg-surface text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}>{item.label}</button>
              ))}
            </div>
          ) : null}
        </div>
        {media.length === 0 ? (
          <div className="mt-4 flex flex-col items-center rounded-2xl border border-border-subtle bg-surface px-6 py-14 text-center">
            <span className="grid size-14 place-items-center rounded-2xl bg-accent/10 text-accent"><Upload size={26} strokeWidth={1.8} /></span>
            <p className="mt-4 text-[16px] font-bold">아직 올라온 사진이 없어요</p>
            <p className="mt-1 text-[14px] text-muted-foreground">하객이 사진과 영상을 보내면 여기에 모여요.</p>
          </div>
        ) : (
          <div className="mt-4"><GuestMediaGrid key={filter} media={visible} className="grid-cols-3 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8" /></div>
        )}
      </section>

      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-border-subtle bg-surface pb-[env(safe-area-inset-bottom)] shadow-[0_-6px_18px_rgba(2,56,82,0.06)]">
        <div className="mx-auto flex max-w-[1200px] items-center gap-3 px-5 py-3 md:px-8">
          <p className="hidden min-w-0 flex-1 text-[14px] text-muted-foreground sm:block">
            {album.closed ? "업로드를 마감하고 셀렉 중이에요." : "식이 끝나고 사진이 다 모이면 셀렉을 시작해 주세요."}
          </p>
          {album.closed
            ? <Link href={selectHref} className="inline-flex h-12 flex-1 items-center justify-center gap-1.5 rounded-lg bg-accent px-5 text-[14px] font-bold text-white hover:bg-[var(--accent-hover)] sm:flex-none">셀렉 계속하기<ArrowRight size={16} /></Link>
            : <PhotographerLightButton size="work-panel" className="flex-1 sm:flex-none" disabled={media.length === 0} onClick={() => setConfirmOpen(true)}>셀렉 시작</PhotographerLightButton>}
        </div>
      </div>

      <PhotographerConfirmDialog
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        onConfirm={startSelect}
        pending={closing}
        pendingLabel="시작하는 중…"
        error={closeError || undefined}
        tone="primary"
        title="셀렉을 시작할까요?"
        description="시작하면 하객이 더 이상 사진과 영상을 보낼 수 없어요."
        detail={`지금까지 모인 파일: ${mediaSummary(counts)} · 하객 ${guests}명`}
        confirmLabel="셀렉 시작"
      />
    </main>
  );
}
