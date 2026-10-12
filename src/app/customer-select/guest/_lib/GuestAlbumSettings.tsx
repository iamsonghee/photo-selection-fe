"use client";
import { useState } from "react";
import { useGuestAlbum } from "./album-store";
import { useRouter } from "next/navigation";
import type { GuestAlbumInfo } from "@/lib/guest-album";
import { PhotographerLightButton } from "@/components/photographer/PhotographerLightButton";
import { PhotographerConfirmDialog } from "@/components/ui/PhotographerConfirmDialog";

export function GuestAlbumSettings({ album }: { album: GuestAlbumInfo }) {
  const router = useRouter();
  const { setWeddingDate } = useGuestAlbum();
  const [date, setDate] = useState(album.weddingDate);
  const [confirm, setConfirm] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  async function submit(remove: boolean) {
    setPending(true); setError(""); setSaved(false);
    try {
      const response = await fetch(`/api/customer-select/guest-albums/${album.id}`, {
        method: remove ? "DELETE" : "PATCH", headers: { "Content-Type": "application/json" },
        ...(!remove ? { body: JSON.stringify({ action: "date", date }) } : {}),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      if (remove) { router.replace("/customer-select"); router.refresh(); }
      else { setWeddingDate(date); setSaved(true); router.refresh(); }
    } catch (e) { setError(e instanceof Error ? e.message : "변경하지 못했어요. 다시 시도해 주세요."); }
    finally { setPending(false); }
  }
  return <section aria-label="앨범 설정" className="rounded-2xl border border-border-subtle bg-surface p-5">
    <h2 className="text-[16px] font-bold">앨범 설정</h2>
    <div className="mt-3 flex flex-wrap items-end gap-3">
      <label className="text-[14px]">결혼식 날짜<input type="date" value={date} disabled={album.uploadStarted || pending} onChange={(e) => setDate(e.target.value)} className="mt-1 block min-h-11 rounded-lg border border-border-subtle bg-surface px-3" /></label>
      <PhotographerLightButton variant="outline" disabled={album.uploadStarted || pending || !date || date === album.weddingDate} onClick={() => submit(false)}>날짜 저장</PhotographerLightButton>
      <PhotographerLightButton variant="danger" disabled={pending} onClick={() => { setError(""); setConfirm(true); }}>앨범 삭제</PhotographerLightButton>
    </div>
    <p className="mt-2 text-[13px] text-muted-foreground">{album.uploadStarted ? "하객이 보내기를 시작해서 날짜를 바꿀 수 없어요." : "하객이 보내기를 시작하기 전까지만 날짜를 바꿀 수 있어요."}</p>
    {saved ? <p role="status" className="mt-2 text-[14px]">날짜를 저장했어요.</p> : null}
    {error && !confirm ? <p role="alert" className="mt-2 text-[14px] text-danger">{error}</p> : null}
    <PhotographerConfirmDialog open={confirm} onClose={() => setConfirm(false)} onConfirm={() => submit(true)} pending={pending} error={error} title="하객 앨범을 삭제할까요?" description="사진·영상과 선택 결과를 모두 삭제해요. 복구할 수 없어요." detail="업로드와 앨범 접근은 바로 중단돼요. 이미 시작된 업로드를 기다린 뒤 파일을 순서대로 지워요." confirmLabel="앨범 삭제" pendingLabel="삭제 요청 중…" />
  </section>;
}
