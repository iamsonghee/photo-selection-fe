"use client";

import { useMemo, useState } from "react";
import { BrandLogoBar } from "@/components/BrandLogo";
import { COLOR_LABELS } from "@/lib/gallery-filter";
import type { ColorTag } from "@/types";
import { COLOR_PALETTE, useCustomerSelectStore } from "./real-store";
import ui from "./ui.module.css";

export function ParticipantJoinScreen() {
  const { project, joinParticipant } = useCustomerSelectStore();
  const available = useMemo(() => COLOR_PALETTE.filter(({ id }) => !(id in project.participantNicknames)), [project.participantNicknames]);
  const [nickname, setNickname] = useState("");
  const [color, setColor] = useState<ColorTag>(available[0]?.id ?? "red");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const selectedColor = available.some(({ id }) => id === color) ? color : available[0]?.id ?? color;

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!nickname.trim() || !available.length) return;
    setSaving(true);
    setError(await joinParticipant(nickname.trim(), selectedColor));
    setSaving(false);
  }

  return <div className={ui.joinShell}>
    <header className={ui.joinBrand}><BrandLogoBar size="sm" href="/" variant="default" /></header>
    <main className={ui.joinMain}>
      <form className={ui.joinCard} onSubmit={submit}>
        <span className={ui.joinEyebrow}>사진 셀렉 초대</span>
        <h1>{project.name || "사진 셀렉"}에<br />함께 참여해 주세요</h1>
        <p>찜과 의견은 함께 고르는 사람에게 표시돼요. 최종 사진은 프로젝트를 만든 사람이 결정합니다.</p>

        {available.length ? <>
          <label className={ui.joinField}>
            <span>닉네임</span>
            <input value={nickname} onChange={(event) => setNickname(event.target.value.slice(0, 20))} placeholder="예: 신랑, 엄마" maxLength={20} autoFocus />
          </label>
          <fieldset className={ui.joinColors}>
            <legend>내 컬러</legend>
            <div>
              {COLOR_PALETTE.map((item) => {
                const usedBy = project.participantNicknames[item.id];
                const occupied = Object.prototype.hasOwnProperty.call(project.participantNicknames, item.id);
                return <button key={item.id} type="button" disabled={occupied} aria-pressed={!occupied && selectedColor === item.id} onClick={() => setColor(item.id)} title={occupied ? `${usedBy || "다른 참여자"}님이 사용 중` : COLOR_LABELS[item.id]}>
                  <i style={{ background: item.hex }} />
                  <span>{occupied ? (usedBy || "사용 중") : COLOR_LABELS[item.id]}</span>
                </button>;
              })}
            </div>
            <small>선택한 컬러는 찜과 의견을 구분하는 데 사용되며 나중에 변경할 수 없어요.</small>
          </fieldset>
          {error && <p className={ui.joinError} role="alert">{error}</p>}
          <button className={`${ui.btn} ${ui.btnPrimary}`} type="submit" disabled={!nickname.trim() || saving}>{saving ? "참여 중…" : "사진 고르기 시작"}</button>
        </> : <div className={ui.joinFull} role="alert"><strong>참여 인원이 모두 찼어요</strong><span>이 프로젝트는 최대 5명까지 함께 고를 수 있어요. 초대한 사람에게 확인해 주세요.</span></div>}
      </form>
    </main>
  </div>;
}
