"use client";

import { PhotographerModal } from "@/components/ui/PhotographerModal";
import { PhotographerLightButton } from "./PhotographerLightButton";

type Props = {
  open: boolean;
  description: string;
  similar: boolean;
  quality: boolean;
  onSimilarChange: (value: boolean) => void;
  onQualityChange: (value: boolean) => void;
  onClose: () => void;
  onSkip: () => void;
  onStart: () => void;
  pending?: boolean;
  similarState?: string | null;
  qualityState?: string | null;
};

export function AiAnalysisPromptModal({ open, description, similar, quality, onSimilarChange, onQualityChange, onClose, onSkip, onStart, pending = false, similarState, qualityState }: Props) {
  const items = [
    { checked: similar, set: onSimilarChange, label: "유사컷 묶기", desc: "연속 촬영된 비슷한 사진을 자동으로 묶습니다", state: similarState },
    { checked: quality, set: onQualityChange, label: "눈감음·흐림 확인", desc: "골라내기 전에 확인할 사진을 미리 표시합니다", state: qualityState },
  ];
  return (
    <PhotographerModal open={open} onClose={onClose} maxWidth={412} variant="confirmation" title="AI가 정리를 도와드릴까요?" description={description}
      footer={<div className="flex gap-2">
        <PhotographerLightButton variant="secondary" onClick={onSkip} size="confirmation" className="flex-1">건너뛰기</PhotographerLightButton>
        <PhotographerLightButton disabled={!similar && !quality} pending={pending} pendingLabel="시작 중" onClick={onStart} size="confirmation" className="flex-1">분석 시작</PhotographerLightButton>
      </div>}>
      <div className="flex flex-col gap-2">
        {items.map((item) => <label key={item.label} className="flex cursor-pointer items-start gap-3 rounded-xl bg-surface-raised p-4">
          <input type="checkbox" checked={item.checked} onChange={(event) => item.set(event.target.checked)} className="mt-[2px] h-4 w-4 flex-none accent-[var(--accent)]" />
          <span className="min-w-0">
            <span className="flex items-center gap-2 text-[14px] font-semibold leading-[22px] tracking-[-0.35px] text-foreground">{item.label}{item.state ? <span className="rounded px-1.5 py-px text-[11px] font-medium leading-[16px] tracking-[-0.2px] text-subtle-foreground ring-1 ring-inset ring-border">{item.state}</span> : null}</span>
            <span className="block text-[13px] font-normal leading-[20px] tracking-[-0.3px] text-muted-foreground">{item.desc}</span>
          </span>
        </label>)}
        <p className="m-0 px-1 text-[12px] leading-[18px] tracking-[-0.25px] text-subtle-foreground">분석은 백그라운드에서 진행되며 다른 작업을 계속할 수 있어요.</p>
      </div>
    </PhotographerModal>
  );
}
