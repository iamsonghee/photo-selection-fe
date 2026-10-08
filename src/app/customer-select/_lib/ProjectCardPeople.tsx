"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import type { ColorTag } from "@/types";
import { InviteSheet } from "../[projectId]/select/Sheets";
import { COLOR_PALETTE } from "./real-store";

export type ProjectCardParticipant = { color: ColorTag; nickname: string; done: boolean };

/**
 * 목록 상세 보기의 함께 고르기 줄: 참여자 아바타 · 인원/완료 요약 · `초대`(공용 InviteSheet).
 * 목록은 실시간 동기화를 하지 않으므로 접속 중(온라인) 표시는 없다.
 */
export function ProjectCardPeople({ projectId, participants, shareToken, shareEnabled }: {
  projectId: string;
  participants: ProjectCardParticipant[];
  shareToken: string;
  shareEnabled: boolean;
}) {
  const [open, setOpen] = useState(false);
  // 색 슬롯 순서(red → purple)로 — 고르기 화면 헤더와 같은 순서.
  const order = (color: ColorTag) => COLOR_PALETTE.findIndex((item) => item.id === color);
  const people = [...participants].sort((a, b) => order(a.color) - order(b.color)).map((person) => ({
    id: person.color,
    name: person.nickname || "참가자",
    hex: COLOR_PALETTE.find((color) => color.id === person.color)?.hex ?? "#999",
  }));
  const doneCount = participants.filter((person) => person.done).length;
  const done = Object.fromEntries(participants.map((person) => [person.color, person.done])) as Record<string, boolean>;
  return (
    // z-index를 두지 않는다 — 두면 이 줄이 쌓임 맥락(stacking context)이 되어 안에서 여는 초대 시트(z-150)가
    // 이 층에 갇혀 플로팅 버튼·헤더(z-40) 아래로 깔린다. 카드 전체 링크보다 뒤에 오는 positioned 요소라 클릭은 그대로 받는다.
    <div className="pointer-events-auto relative flex min-w-0 flex-1 items-center gap-3">
      <span className="flex -space-x-2" aria-hidden>
        {people.slice(0, 4).map((person) => <span key={person.id} className="grid size-8 place-items-center rounded-full border-2 border-surface text-xs font-bold text-white" style={{ background: person.hex }}>{person.name.slice(0, 1)}</span>)}
        {people.length > 4 ? <span className="grid size-8 place-items-center rounded-full border-2 border-surface bg-surface-raised text-xs font-bold text-muted-foreground">+{people.length - 4}</span> : null}
      </span>
      <span className="min-w-0 flex-1 text-[13px]">
        <strong className="font-bold">함께 고르기 {people.length}명</strong>
        <span className="line-clamp-2 break-keep text-muted-foreground">{people.length > 1 ? doneCount ? `${doneCount}명 다 골랐어요` : "고르는 중이에요" : "가족·친구를 초대해 함께 골라보세요"}</span>
      </span>
      <button type="button" onClick={() => setOpen(true)} className="inline-flex h-9 shrink-0 items-center gap-1 rounded-lg border border-border px-3.5 text-[13px] font-bold transition-colors hover:border-border-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/35"><Plus size={14} />초대</button>
      {open && <InviteSheet projectId={projectId} shareToken={shareToken} shareEnabled={shareEnabled} people={people} online={new Set()} done={done} onClose={() => setOpen(false)} />}
    </div>
  );
}
