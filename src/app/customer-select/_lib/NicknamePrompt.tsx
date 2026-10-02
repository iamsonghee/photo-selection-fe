"use client";

import { useRef, useState } from "react";
import { X } from "lucide-react";
import { COLOR_LABELS } from "@/lib/gallery-filter";
import { useCustomerSelectStore } from "./real-store";
import ui from "./ui.module.css";

export function NicknamePrompt({ hex, isDone, online }: { hex: string; isDone: boolean; online: boolean }) {
  const { project, currentIdentity, setNickname } = useCustomerSelectStore();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const nickname = project.participantNicknames[currentIdentity]?.trim() ?? "";
  const [value, setValue] = useState(nickname);

  function open() {
    setValue(nickname);
    dialogRef.current?.showModal();
  }

  function save() {
    const next = value.trim();
    if (!next) return;
    setNickname(next);
    dialogRef.current?.close();
  }

  return (
    <>
      {/* 내 아바타 — 누르면 이름 설정. 이름이 없으면 "나"와 점선 테두리로 설정을 권한다. */}
      <button type="button" className={`${ui.avatar} ${online ? ui.avatarOnline : ""} ${nickname ? "" : ui.avatarMissing}`} style={{ background: hex }} onClick={open}
        title={nickname ? `${nickname} (나) · ${isDone ? "다 골랐어요" : "고르는 중"} · 이름 수정` : "내 이름 설정"} aria-label={nickname ? `내 이름 ${nickname} 수정` : "내 이름 설정"}>
        {nickname ? nickname.slice(0, 1) : "나"}
        {isDone ? <span className={ui.avatarDone} aria-hidden>✓</span> : null}
      </button>
      <dialog ref={dialogRef} className={ui.nicknameDialog} onClick={(event) => { if (event.target === event.currentTarget) event.currentTarget.close(); }}>
        <form method="dialog" onSubmit={(event) => { event.preventDefault(); save(); }}>
          <div className={ui.nicknameDialogHeader}>
            <div>
              <strong>{nickname ? "이름 수정" : "이름 설정"}</strong>
              <span>함께 고르는 사람에게 표시할 이름이에요.</span>
            </div>
            <button type="button" aria-label="닫기" onClick={() => dialogRef.current?.close()}><X size={18} /></button>
          </div>
          <div className={ui.nicknameColor} aria-label={`내 컬러 ${COLOR_LABELS[currentIdentity]}`}>
            <i style={{ background: hex }} />
            <span><strong>내 컬러</strong> · {COLOR_LABELS[currentIdentity]}</span>
            <small>변경할 수 없어요</small>
          </div>
          <label className={ui.nicknameField}>
            <span>닉네임</span>
            <input value={value} onChange={(event) => setValue(event.target.value)} placeholder="예: 신랑" maxLength={20} autoFocus />
          </label>
          <div className={ui.nicknameActions}>
            <button type="button" onClick={() => dialogRef.current?.close()}>취소</button>
            <button type="submit" disabled={!value.trim()}>저장</button>
          </div>
        </form>
      </dialog>
    </>
  );
}
