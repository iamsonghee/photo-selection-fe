"use client";

import { useMemo, useState } from "react";
import { format } from "date-fns";
import { ko } from "date-fns/locale";
import { CalendarDays } from "lucide-react";
import { CustomerEntryHeader, CustomerEntryShell } from "@/components/customer/CustomerEntryShell";
import { CustomerInviteIntro } from "@/components/customer/CustomerInviteIntro";
import { SelectionConfirmDialog } from "@/components/customer/SelectionConfirmDialog";
import { PhotographerLightButton } from "@/components/photographer/PhotographerLightButton";
import { Badge } from "@/components/ui/Badge";
import { customerDDay } from "@/lib/customer-dday";
import { COLOR_LABELS } from "@/lib/gallery-filter";
import type { ColorTag } from "@/types";
import entry from "@/app/c/[token]/customer-entry.module.css";
import { Sheet } from "../[projectId]/select/Sheets";
import { COLOR_PALETTE, likedBy, useCustomerSelectStore } from "./real-store";
import s from "./ParticipantJoinScreen.module.css";

const OWNER_COLOR: ColorTag = "red";

/**
 * 초대 링크로 처음 들어온 참여자. 작가 고객 초대 화면(`CustomerInviteIntro`)과 같은 구성 — 대표 사진 + 초대 문구 + 시작 버튼.
 * 이름은 시작 버튼을 누른 뒤 시트에서 받는다(입장 패널은 높이가 고정이라 입력칸을 두면 모바일 키보드에 가린다).
 * 이름만 적으면 남은 색을 자동으로 받는다.
 * 이미 참여한 사람이 초대 링크로 다시 오면 같은 화면에서 `OO님으로 이어서 고르기`(작가 고객 초대의 "이어서 선택하기"와 같은 흐름).
 * `onEnter`: 입장(새로 참여·이어서 하기·이어서 고르기)을 마치면 부른다 — 고르기 화면이 초대 화면을 닫는다.
 */
export function ParticipantJoinScreen({ onEnter }: { onEnter?: () => void }) {
  const { project, participantReady, currentIdentity, joinParticipant, resumeParticipant } = useCustomerSelectStore();
  const returning = participantReady && currentIdentity !== OWNER_COLOR ? project.participantNicknames[currentIdentity]?.trim() : undefined;
  const myLikes = returning ? likedBy(project, currentIdentity).length : 0;
  const available = useMemo(() => COLOR_PALETTE.filter(({ id }) => !(id in project.participantNicknames)), [project.participantNicknames]);
  const existing = useMemo(() => COLOR_PALETTE.flatMap((item) => {
    const name = project.participantNicknames[item.id]?.trim();
    return item.id !== OWNER_COLOR && name ? [{ ...item, name }] : [];
  }), [project.participantNicknames]);
  const [sheet, setSheet] = useState<"name" | "resume" | null>(null);
  const [nickname, setNickname] = useState("");
  const [color, setColor] = useState<ColorTag | null>(null);
  const [colorsOpen, setColorsOpen] = useState(false);
  const [resumeColor, setResumeColor] = useState<ColorTag | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  // 다른 사람이 먼저 색을 가져가도 남은 색 중 하나로 자연스럽게 넘어간다.
  const myColor = available.find(({ id }) => id === color) ?? available[0];
  const ownerName = project.participantNicknames[OWNER_COLOR]?.trim();
  const ownerLabel = ownerName ? `${ownerName}님` : "프로젝트를 만든 분";
  // 대표 사진: 첫 장면 가운데 컷(장면 전이면 첫 사진) — 첫 컷은 디테일·준비 컷인 경우가 많다.
  const firstScene = project.aiScenes?.find((scene) => scene.photoIds.length);
  const cover = (firstScene && project.photos.find((photo) => photo.id === firstScene.photoIds[Math.floor(firstScene.photoIds.length / 2)])) ?? project.photos[0];
  const deadline = project.selectionDeadline ? new Date(`${project.selectionDeadline.slice(0, 10)}T00:00:00`) : null;
  const dday = deadline ? customerDDay(deadline) : null;

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!nickname.trim() || !myColor) return;
    setSaving(true);
    const failed = await joinParticipant(nickname.trim(), myColor.id);
    setError(failed);
    setSaving(false);
    if (!failed) onEnter?.();
  }

  return <>
    <CustomerInviteIntro
      href="/"
      variant="selection"
      heroUrl={cover ? cover.previewUrl || cover.url : null}
      heroAlt={`${project.name} 대표 사진`}
      photographerLabel={ownerName ? `${ownerLabel}의 초대` : "사진 고르기 초대"}
      photographerAvatarUrl=""
      actions={returning ? <>
        <button type="button" className={entry.entryPrimary} onClick={() => onEnter?.()}>{returning}님으로 이어서 고르기</button>
        <button type="button" className={entry.entrySecondary} onClick={() => setSheet("resume")}>{returning}님이 아니에요</button>
      </> : myColor ? <>
        <button type="button" className={entry.entryPrimary} onClick={() => { setError(null); setSheet("name"); }}>함께 고르기 시작</button>
        {existing.length > 0 && <button type="button" className={entry.entrySecondary} onClick={() => setSheet("resume")}>전에 참여했나요? 이어서 하기</button>}
      </> : <>
        <button type="button" className={entry.entryPrimary} disabled>참여 인원이 모두 찼어요</button>
        {existing.length > 0 && <button type="button" className={entry.entrySecondary} onClick={() => setSheet("resume")}>전에 참여했나요? 이어서 하기</button>}
      </>}
    >
      <div className={entry.introTextGroup}>
        <p className={entry.projectLabel}>{project.name || "사진 셀렉"}</p>
        <h1 className={`${entry.entryTitle} ${entry.introTitle}`}>{ownerName ? <>{ownerLabel}이<br />함께 고르자고 초대했어요</> : <>함께 사진을<br />골라 주세요</>}</h1>
        <p className={entry.entryDescription}>
          {returning
            ? <>{returning}님, 지금까지 <strong className={entry.introAccent}>♥ {myLikes.toLocaleString()}장</strong>을 찜했어요. 이어서 골라 보세요.</>
            : myColor
            ? <>사진 <strong className={entry.introAccent}>{project.photoCount.toLocaleString()}장</strong> 중 마음에 드는 사진에 찜과 메모를 남겨 주세요. 최종 선택은 {ownerLabel}이 해요.</>
            : <>최대 5명까지 함께 고를 수 있어요. {ownerLabel}에게 확인해 주세요.</>}
        </p>
      </div>
      {deadline ? (
        <div className={entry.deadlineRow} aria-label={`셀렉 마감일 ${format(deadline, "yyyy년 M월 d일 EEEE", { locale: ko })}${dday ? `, ${dday.label}` : ""}`}>
          <CalendarDays className={entry.deadlineIcon} aria-hidden="true" strokeWidth={1.6} />
          <span className={entry.deadlineLabel}>셀렉 마감</span>
          <span className={entry.deadlineDate}>{format(deadline, "yyyy.MM.dd (EEE)", { locale: ko })}</span>
          {dday && <Badge tone={dday.tone} theme="customerLight" className="font-mono">{dday.label}</Badge>}
        </div>
      ) : null}
    </CustomerInviteIntro>

    {sheet === "name" && myColor && (
      <Sheet title="이름을 알려주세요" onClose={() => setSheet(null)}>
        <form className={s.form} onSubmit={submit}>
          <p>함께 고르는 사람에게 이 이름으로 보여요.</p>
          <label className={s.field}>
            <span>이름</span>
            <input value={nickname} onChange={(event) => setNickname(event.target.value.slice(0, 20))} placeholder="예: 엄마, 신랑, 지우" maxLength={20} autoFocus enterKeyHint="go" />
          </label>
          <div className={s.colorRow}>
            <span>내 색</span>
            <i style={{ background: myColor.hex }} aria-hidden />
            <strong>{COLOR_LABELS[myColor.id]}</strong>
            <button type="button" className={s.textButton} aria-expanded={colorsOpen} onClick={() => setColorsOpen((open) => !open)}>{colorsOpen ? "접기" : "바꾸기"}</button>
          </div>
          {colorsOpen && (
            <div className={s.colors} role="radiogroup" aria-label="내 색">
              {available.map((item) => (
                <button key={item.id} type="button" role="radio" aria-checked={myColor.id === item.id} aria-label={COLOR_LABELS[item.id]} onClick={() => { setColor(item.id); setColorsOpen(false); }}>
                  <i style={{ background: item.hex }} />
                </button>
              ))}
            </div>
          )}
          {error && <p className={s.error} role="alert">{error}</p>}
          <PhotographerLightButton type="submit" size="confirmation" disabled={!nickname.trim() || saving} pending={saving} pendingLabel="들어가는 중…">시작하기</PhotographerLightButton>
        </form>
      </Sheet>
    )}

    {sheet === "resume" && (
      <Sheet title="누구로 이어서 할까요?" onClose={() => setSheet(null)}>
        <p>이 기기에서도 남겨둔 찜과 메모를 그대로 이어서 볼 수 있어요.{myColor ? " 처음이면 새로 참여해 주세요." : ""}</p>
        <div className={s.resumeList}>
          {existing.map((person) => (
            <button key={person.id} type="button" onClick={() => setResumeColor(person.id)}>
              <i style={{ background: person.hex }} />{person.name}
            </button>
          ))}
        </div>
        {myColor ? <button type="button" className={s.textButton} onClick={() => { setError(null); setSheet("name"); }}>처음이에요 · 새로 참여하기</button> : null}
      </Sheet>
    )}

    {resumeColor && <SelectionConfirmDialog
      title={`${project.participantNicknames[resumeColor]}님으로 이어서 할까요?`}
      description="본인 이름이 맞는지 확인해 주세요."
      confirmLabel="이어서 하기"
      busyLabel="처리 중…"
      confirming={false}
      onCancel={() => setResumeColor(null)}
      onConfirm={() => { resumeParticipant(resumeColor); onEnter?.(); }}
    />}
  </>;
}

/** 중지됐거나 바뀐 초대 링크 — 작가 고객 화면의 "사용할 수 없는 링크"와 같은 구성. */
export function ParticipantAccessEndedScreen() {
  return (
    <CustomerEntryShell className={entry.invalidCanvas}>
      <CustomerEntryHeader href="/" />
      <div className={entry.entryCopy}>
        <h1 className={entry.entryTitle}>이 초대 링크는 더 이상 사용할 수 없어요</h1>
        <p className={entry.entryDescription}>
          초대한 분이 공유를 멈췄거나 새 링크를 만들었어요.<br />
          새로운 초대 링크를 요청해 주세요.
        </p>
      </div>
      <div className={entry.invalidIllustrationWrap} aria-hidden="true">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img className={entry.invalidIllustration} src="/customer/entry/invalid-link.png" alt="" width={245} height={367} />
      </div>
    </CustomerEntryShell>
  );
}
