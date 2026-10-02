"use client";

import Link from "next/link";
import { CheckCircle2, Sparkles, UploadCloud } from "lucide-react";
import { PhotographerLightButton } from "@/components/photographer/PhotographerLightButton";
import { customerShootTypeLabel } from "@/lib/customer-shoot-scenes";
import { Sheet } from "../select/Sheets";

/**
 * 업로드를 마치면 띄우는 안내. 업로드 화면을 고르는 화면으로 착각하지 않도록 다음 단계를 분명히 보여준다.
 * 주 동작은 AI 정리(장면이 고르기의 뼈대) — 옵션 시트 없이 기본값으로 바로 시작한다(옵션은 고르기 화면 보기 옵션에 있다).
 */
export function UploadDoneSheet({ projectId, uploaded, shootType, untimedCount, scenesBlocked, aiAnalyzing, starting, error, onTidy, onSelect, onMore, onClose }: {
  projectId: string;
  uploaded: number;
  shootType: string;
  untimedCount: number;
  /** 촬영 시각 없는 사진이 많아 장면으로 나눌 수 없음 */
  scenesBlocked: boolean;
  /** 이미 AI 정리가 진행 중이면 다시 시작하지 않고 고르기로 보낸다 */
  aiAnalyzing: boolean;
  starting: boolean;
  error: string | null;
  onTidy: () => void;
  onSelect: () => void;
  onMore: () => void;
  onClose: () => void;
}) {
  return (
    <Sheet title="업로드 완료" onClose={onClose}>
      <p className="flex items-center gap-2 !text-[15px] !font-bold !text-foreground"><CheckCircle2 size={18} className="shrink-0 text-primary" aria-hidden />{uploaded.toLocaleString()}장 올렸어요</p>
      <p>
        {aiAnalyzing
          ? "AI가 사진을 정리하고 있어요. 기다리지 않고 바로 골라도 돼요."
          : "사진을 다 올렸다면 AI가 장면별로 나누고 비슷한 사진·흔들린 사진을 정리해 드려요."}
      </p>
      <p>
        촬영 종류 <strong className="font-semibold text-foreground">{customerShootTypeLabel(shootType || null)}</strong> · <Link href={`/customer-select/${projectId}/settings?from=upload`} className="font-semibold text-accent underline underline-offset-2">바꾸기</Link>
        {untimedCount > 0 ? <><br />{scenesBlocked
          ? `촬영 시각이 없는 사진이 많아(${untimedCount.toLocaleString()}장) 장면 없이 전체 사진으로 보여드려요.`
          : `${untimedCount.toLocaleString()}장은 촬영 시각이 없어 장면 정리 때 마지막에 따로 모여요.`}</> : null}
      </p>
      {error ? <p className="!font-semibold !text-danger" role="alert">{error}</p> : null}
      <div className="mt-1 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <PhotographerLightButton variant="outline" onClick={onMore} disabled={starting}><UploadCloud size={16} />사진 더 올리기</PhotographerLightButton>
        {aiAnalyzing
          ? <PhotographerLightButton onClick={onSelect}>사진 고르기 →</PhotographerLightButton>
          : <PhotographerLightButton onClick={onTidy} pending={starting} pendingLabel="시작하는 중…"><Sparkles size={16} />AI로 정리하고 고르기 →</PhotographerLightButton>}
      </div>
      {!aiAnalyzing ? <button type="button" onClick={onSelect} disabled={starting} className="self-center text-[13px] font-semibold text-muted-foreground underline underline-offset-2">정리 없이 바로 고르기</button> : null}
    </Sheet>
  );
}
