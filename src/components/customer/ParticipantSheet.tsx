"use client";

import { useEffect, useState } from "react";
import { Check } from "lucide-react";
import { COLOR_LABELS, COLOR_OPTIONS } from "@/lib/gallery-filter";
import type { Participant, ParticipantRoster } from "@/lib/customer-participant";
import type { ColorTag } from "@/types";

type Props = {
  /** 프로젝트에서 이미 쓰이고 있는 색 = 다른 참가자가 사용 중 */
  usedColors: ColorTag[];
  /** 서버에 저장된 (색 → 표시 이름). 기기를 바꿔 들어온 사람이 자기 슬롯을 알아볼 단서가 된다. */
  roster?: ParticipantRoster;
  /** 이 기기에 저장된 기존 선택(있으면 초기값) */
  current: Participant | null;
  onConfirm: (participant: Participant) => void;
  onClose: () => void;
};

/**
 * 참가자(색·이름) 시트. 첫 "찜" 시점에 처음 뜨고, 이후에는 찜 알약의 내 표시 구획으로 다시 열어
 * 이름이나 색을 고칠 수 있다. 다크한 뷰어 위에 올라가지만 코멘트 시트와 같은 white sheet 톤을 따른다.
 */
export function ParticipantSheet({ usedColors, roster = {}, current, onConfirm, onClose }: Props) {
  const [color, setColor] = useState<ColorTag | null>(current?.color ?? null);
  const [initial, setInitial] = useState(current?.initial ?? "");

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const takenByOther = (key: ColorTag) => usedColors.includes(key) && key !== current?.color;
  /** 이미 신원이 있는 상태로 열렸으면 "처음 정하기"가 아니라 "고치기"다. */
  const editing = current != null;
  /* 색을 옮기면 지금까지 찍은 찜은 옛 색에 남아 남의 것처럼 보인다 — 1단계에서는 이관하지 않고 알린다. */
  const movingColor = editing && color != null && color !== current.color;

  return (
    <>
      <button type="button" className="cps-backdrop" aria-label="닫기" onClick={onClose} />
      <div className="cps-sheet" role="dialog" aria-modal="true" aria-labelledby="cps-title">
        <h2 id="cps-title" className="cps-title">{editing ? "내 표시 바꾸기" : "누구세요?"}</h2>
        <p className="cps-desc">
          {editing
            ? "이름은 함께 보는 사람 화면에도 바로 반영돼요."
            : "함께 보는 사람과 겹치지 않는 색을 고르세요 — 내가 찜한 사진을 구분해드려요."}
        </p>

        {/* 세로 카드 목록 대신 원 한 줄로 — 색 고르기는 가벼운 동작인데 5줄짜리 카드는 스크롤만
         * 늘렸다. 이름·"사용 중" 표시는 원 아래 캡션으로 옮겨 정보는 그대로 유지한다. */}
        <div className="cps-colors" role="radiogroup" aria-label="내 색 고르기">
          {COLOR_OPTIONS.map((option) => {
            const active = color === option.key;
            const taken = takenByOther(option.key);
            return (
              <button
                key={option.key}
                type="button"
                role="radio"
                aria-checked={active}
                className={`cps-color${active ? " cps-color-active" : ""}${taken ? " cps-color-taken" : ""}`}
                onClick={() => {
                  setColor(option.key);
                  /* 이미 이름이 있는 슬롯이면 되찾는 경우가 많아 그 이름을 채워둔다 */
                  const saved = roster[option.key];
                  if (saved && !initial.trim()) setInitial(saved.slice(0, 2));
                }}
              >
                <span className="cps-color-dot" style={{ background: option.hex }}>
                  {active && <Check size={18} strokeWidth={3} aria-hidden />}
                </span>
                <span className="cps-color-caption">
                  {taken ? (roster[option.key] ?? "사용 중") : COLOR_LABELS[option.key]}
                </span>
              </button>
            );
          })}
        </div>

        <label className="cps-field">
          <span className="cps-field-label">이니셜 (선택) · 함께 보는 사람에게도 보여요</span>
          <input
            type="text"
            value={initial}
            maxLength={2}
            placeholder="예: 민"
            onChange={(event) => setInitial(event.target.value.slice(0, 2))}
            aria-label="내 이니셜"
          />
        </label>

        {movingColor && (
          <p className="cps-warn" role="status">
            색을 바꾸면 지금까지 찜한 표시는 이전 색({COLOR_LABELS[current.color]})에 그대로 남아요.
          </p>
        )}

        <button
          type="button"
          className="cps-confirm"
          disabled={!color}
          onClick={() => color && onConfirm({ color, initial: initial.trim() })}
        >
          {editing ? "저장" : color ? "이 색으로 시작하기" : "색을 선택해주세요"}
        </button>

        <style>{`
          .cps-backdrop {
            position: fixed; inset: 0; z-index: 90;
            border: 0; padding: 0;
            background: rgba(0,0,0,.5);
          }
          .cps-sheet {
            position: fixed; left: 50%; bottom: 0; z-index: 91;
            width: min(100%, 420px); transform: translateX(-50%);
            box-sizing: border-box;
            background: #fff; color: #191918;
            border-radius: 16px 16px 0 0;
            box-shadow: 0 -4px 16px rgba(0,0,0,.18);
            padding: 20px 20px calc(20px + env(safe-area-inset-bottom));
            font-family: Pretendard, 'Noto Sans KR', sans-serif;
          }
          .cps-title { margin: 0; font-size: 18px; line-height: 26px; font-weight: 700; letter-spacing: -.3px; }
          .cps-desc { margin: 6px 0 0; font-size: 13px; line-height: 19px; color: #5f5e5b; }
          .cps-colors { margin-top: 16px; display: flex; justify-content: space-between; gap: 4px; }
          .cps-color {
            display: flex; flex-direction: column; align-items: center; gap: 6px;
            flex: 1; min-width: 0; padding: 4px 0;
            border: 0; background: transparent;
            font: 500 12px/16px Pretendard, sans-serif; color: #5f5e5b; text-align: center;
          }
          .cps-color-dot {
            width: 44px; height: 44px; flex: 0 0 44px; border-radius: 50%;
            display: grid; place-items: center; color: #fff;
            box-shadow: 0 0 0 1px rgba(0,0,0,.12);
            transition: box-shadow 0.15s;
          }
          .cps-color-active .cps-color-dot { box-shadow: 0 0 0 2px #fff, 0 0 0 4px #ff4d00; }
          .cps-color-active { color: #191918; font-weight: 700; }
          .cps-color-taken .cps-color-dot { opacity: .35; }
          .cps-color-caption { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 100%; }
          .cps-field { margin-top: 20px; display: flex; flex-direction: column; gap: 6px; }
          .cps-field-label { font: 600 12px/16px Pretendard, sans-serif; color: #3a3a37; }
          .cps-field input {
            height: 48px; box-sizing: border-box; padding: 0 14px;
            border: 1px solid #dde1e4; border-radius: 10px; outline: 0;
            font: 400 15px/22px Pretendard, sans-serif; color: #191918; background: #fff;
          }
          .cps-field input:focus { border-color: #ff4d00; }
          .cps-warn {
            margin: 14px 0 0; padding: 10px 12px;
            border-radius: 8px; background: #fff5f0;
            color: #8a4520; font: 500 12px/18px Pretendard, sans-serif;
          }
          .cps-confirm {
            margin-top: 18px; width: 100%; height: 52px;
            border: 0; border-radius: 10px;
            background: #26282c; color: #fff;
            font: 700 15px/22px Pretendard, sans-serif;
          }
          .cps-confirm:disabled { background: #dde1e4; color: #aab0b8; }
        `}</style>
      </div>
    </>
  );
}
