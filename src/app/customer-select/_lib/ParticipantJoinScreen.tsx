"use client";

import { useMemo, useState } from "react";
import { Heart, MessageSquare, UserCheck } from "lucide-react";
import { BrandLogoBar } from "@/components/BrandLogo";
import { SelectionConfirmDialog } from "@/components/customer/SelectionConfirmDialog";
import { PhotographerLightButton } from "@/components/photographer/PhotographerLightButton";
import { COLOR_LABELS } from "@/lib/gallery-filter";
import theme from "@/styles/AcutLightTheme.module.css";
import type { ColorTag } from "@/types";
import { COLOR_PALETTE, useCustomerSelectStore } from "./real-store";
import s from "./ParticipantJoinScreen.module.css";

const OWNER_COLOR: ColorTag = "red";

/** 초대 링크로 처음 들어온 참여자: 이름만 적으면 남은 색을 자동으로 받아 바로 시작한다. */
export function ParticipantJoinScreen() {
  const { project, joinParticipant, resumeParticipant } = useCustomerSelectStore();
  const available = useMemo(() => COLOR_PALETTE.filter(({ id }) => !(id in project.participantNicknames)), [project.participantNicknames]);
  const existing = useMemo(() => COLOR_PALETTE.flatMap((item) => {
    const name = project.participantNicknames[item.id]?.trim();
    return item.id !== OWNER_COLOR && name ? [{ ...item, name }] : [];
  }), [project.participantNicknames]);
  const [nickname, setNickname] = useState("");
  const [color, setColor] = useState<ColorTag | null>(null);
  const [colorsOpen, setColorsOpen] = useState(false);
  const [resumeOpen, setResumeOpen] = useState(false);
  const [resumeColor, setResumeColor] = useState<ColorTag | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  // 다른 사람이 먼저 색을 가져가도 남은 색 중 하나로 자연스럽게 넘어간다.
  const myColor = available.find(({ id }) => id === color) ?? available[0];
  const ownerName = project.participantNicknames[OWNER_COLOR]?.trim() || "프로젝트를 만든 분";
  const cover = project.photos[0];

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!nickname.trim() || !myColor) return;
    setSaving(true);
    setError(await joinParticipant(nickname.trim(), myColor.id));
    setSaving(false);
  }

  return <>
    <div className={`${theme.lightTheme} ${s.shell}`}>
      <header className={s.brand}><BrandLogoBar size="sm" href="/" /></header>
      <main className={s.main}>
        <form className={s.card} onSubmit={submit}>
          {cover && <div className={s.cover}>{/* eslint-disable-next-line @next/next/no-img-element */}<img src={cover.previewUrl || cover.url} alt="" /></div>}
          <div className={s.intro}>
            <span>{ownerName}님이 사진 고르기에 초대했어요</span>
            <h1>{project.name || "사진 셀렉"}</h1>
            <p>{project.photoCount.toLocaleString()}장</p>
          </div>

          <ul className={s.can}>
            <li><Heart size={16} />마음에 드는 사진에 찜해요</li>
            <li><MessageSquare size={16} />작가님께 전할 메모를 함께 써요</li>
            <li><UserCheck size={16} />보정 받을 사진은 {ownerName}님이 정해요</li>
          </ul>

          {myColor ? <>
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
          </> : <div className={s.full} role="alert"><strong>참여 인원이 모두 찼어요</strong><span>최대 5명까지 함께 고를 수 있어요. {ownerName}님에게 확인해 주세요.</span></div>}

          {existing.length > 0 && (
            <div className={s.resume}>
              <button type="button" className={s.textButton} aria-expanded={resumeOpen} onClick={() => setResumeOpen((open) => !open)}>전에 참여했나요? 이어서 하기</button>
              {resumeOpen && <div className={s.resumeList}>
                {existing.map((person) => (
                  <button key={person.id} type="button" onClick={() => setResumeColor(person.id)}>
                    <i style={{ background: person.hex }} />{person.name}
                  </button>
                ))}
              </div>}
            </div>
          )}
        </form>
      </main>
    </div>
    {resumeColor && <SelectionConfirmDialog
      title={`${project.participantNicknames[resumeColor]}님으로 이어서 할까요?`}
      description="이 기기에서도 남겨둔 찜과 메모를 그대로 이어서 볼 수 있어요. 본인 이름이 맞는지 확인해 주세요."
      confirmLabel="이어서 하기"
      busyLabel="처리 중…"
      confirming={false}
      onCancel={() => setResumeColor(null)}
      onConfirm={() => resumeParticipant(resumeColor)}
    />}
  </>;
}

export function ParticipantAccessEndedScreen() {
  return <div className={`${theme.lightTheme} ${s.shell}`}>
    <header className={s.brand}><BrandLogoBar size="sm" href="/" /></header>
    <main className={s.main}>
      <div className={s.card}>
        <div className={s.intro}>
          <span>사진 고르기 초대</span>
          <h1>이 초대 링크는 더 이상 사용할 수 없어요</h1>
          <p>초대한 분이 공유를 멈췄거나 새 링크를 만들었어요. 새로운 초대 링크를 요청해 주세요.</p>
        </div>
      </div>
    </main>
  </div>;
}
