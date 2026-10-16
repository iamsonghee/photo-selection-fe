import { retentionEndDate } from "@/lib/guest-album";

export function GuestRetentionWarning({ weddingDate, days }: { weddingDate: string; days: number }) {
  const end = retentionEndDate(weddingDate, days);
  const today = new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Seoul" }).format(new Date());
  const left = Math.round((Date.parse(end) - Date.parse(today)) / 86400000);
  if (left > 7) return null;
  return <p role="alert" className="rounded-xl border border-danger/25 bg-danger/8 p-4 text-[14px] text-danger">
    {left < 0 ? "보관 기간이 끝났어요. 사진과 영상을 삭제하고 있어요." : `${left === 0 ? "오늘" : `${left}일 뒤`} 보관이 끝나요 (${end}). 사진과 영상이 자동 삭제되니 미리 내려받아 주세요.`}
  </p>;
}
