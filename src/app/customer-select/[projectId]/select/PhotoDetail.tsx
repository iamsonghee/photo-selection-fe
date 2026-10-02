"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, Check, Heart, MessageSquare } from "lucide-react";
import { PrevNextButton } from "@/components/PrevNextButton";
import { MobileViewerPinchPhoto } from "@/components/MobileViewerPinchPhoto";
import { PhotographerLightButton } from "@/components/photographer/PhotographerLightButton";
import { useDesktopViewport } from "@/hooks/useDesktopViewport";
import { getPhotoDisplayName } from "@/lib/gallery-filter";
import type { CommentSaveStatus } from "@/lib/comment-save-status";
import type { ColorTag, Photo } from "@/types";
import s from "./select.module.css";

const MEMO_SAVE_DELAY_MS = 600;
// 필름 띠는 ‹ › 순서 그대로, 지금 사진 앞뒤 이만큼만 그린다(장면·전체 목록이 수천 장일 수 있다).
const STRIP_RADIUS = 7;
const noMembers = () => [];

export type Person = { id: ColorTag; name: string; hex: string };

/** 상세 보기 = "고민하는 곳". 큰 사진, 같은 묶음 비교, 찜한 사람, 작가 전달 메모, 최종 선택. */
export function PhotoDetail({
  photos, photoId, onPhotoChange, onClose, isOwner, myColor, people, selectedIds, likesOf, commentOf,
  similarOf, membersOf = noMembers, commentSaveStates, onToggleSelect, onToggleLike, onSaveComment, selectedCount, target,
}: {
  photos: Photo[];
  photoId: string;
  onPhotoChange: (photoId: string) => void;
  onClose: () => void;
  isOwner: boolean;
  myColor: ColorTag;
  people: Person[];
  selectedIds: ReadonlySet<string>;
  likesOf: (photoId: string) => ColorTag[];
  commentOf: (photoId: string) => string;
  similarOf: (photo: Photo) => Photo[];
  /** 접힌 묶음 표지 한 칸에 든 사진들(없으면 빈 목록). ‹ › 는 칸 단위, ↑↓·띠는 묶음 안에서 움직인다. */
  membersOf?: (photo: Photo) => Photo[];
  commentSaveStates: Record<string, CommentSaveStatus>;
  onToggleSelect: (photoId: string) => void;
  onToggleLike: (photoId: string) => void;
  onSaveComment: (photoId: string, text: string) => void;
  selectedCount: number;
  target: number;
}) {
  const desktop = useDesktopViewport();
  // 칸(stop) = 갤러리에 보이는 순서의 한 자리. 접힌 묶음이면 지금 사진은 그 묶음 안의 한 장이다.
  const index = Math.max(0, photos.findIndex((item) => item.id === photoId || membersOf(item).some((member) => member.id === photoId)));
  const stop = photos[index];
  const members = useMemo(() => (stop ? membersOf(stop) : []), [membersOf, stop]);
  const memberIndex = members.findIndex((member) => member.id === photoId);
  const photo = memberIndex >= 0 ? members[memberIndex] : stop;
  const similar = photo ? similarOf(photo) : [];
  const liked = likesOf(photoId).includes(myColor);
  const selected = selectedIds.has(photoId);
  const [zoomed, setZoomed] = useState(false);
  const touchStartRef = useRef<{ x: number; y: number } | null>(null);
  const stripStart = Math.max(0, Math.min(index - STRIP_RADIUS, photos.length - (STRIP_RADIUS * 2 + 1)));
  // 띠에서 연달아 붙은 같은 유사컷은 한 덩어리로 묶어 보여준다.
  // 띠: 지금 칸의 묶음은 펼쳐 보이고, 다른 접힌 묶음은 겹친 썸네일 한 칸. 묶기를 끈 상태에서는 연달아 붙은 같은 유사컷을 괄호로 묶는다.
  type StripRun = { photos: Photo[]; size: number; collapsed: boolean };
  const stripRuns: StripRun[] = [];
  for (const item of photos.slice(stripStart, stripStart + STRIP_RADIUS * 2 + 1)) {
    const group = membersOf(item);
    if (group.length) { stripRuns.push(item === stop ? { photos: group, size: group.length, collapsed: false } : { photos: [item], size: group.length, collapsed: true }); continue; }
    const last = stripRuns.at(-1);
    if (last && !last.collapsed && item.similarityGroupId && last.photos[0].similarityGroupId === item.similarityGroupId && !membersOf(last.photos[0]).length) last.photos.push(item);
    else stripRuns.push({ photos: [item], size: 0, collapsed: false });
  }
  const currentThumbRef = useRef<HTMLButtonElement | null>(null);
  useEffect(() => { currentThumbRef.current?.scrollIntoView({ block: "nearest", inline: "center" }); }, [photoId]);

  const go = useCallback((step: number) => {
    const next = photos[index + step];
    if (next) onPhotoChange(next.id);
  }, [index, onPhotoChange, photos]);
  const goMember = useCallback((step: number) => {
    const next = members[memberIndex + step];
    if (next) onPhotoChange(next.id);
  }, [memberIndex, members, onPhotoChange]);

  // 작가 전달 메모: 입력이 멈추면 자동 저장, 사진을 넘기거나 닫을 때도 남은 입력을 저장한다.
  const [draft, setDraft] = useState(() => commentOf(photoId));
  const draftRef = useRef({ photoId, text: draft, saved: draft });
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const flushMemo = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = null;
    const current = draftRef.current;
    if (current.text.trim() !== current.saved.trim()) {
      onSaveComment(current.photoId, current.text);
      current.saved = current.text;
    }
  }, [onSaveComment]);
  useEffect(() => {
    flushMemo();
    const text = commentOf(photoId);
    draftRef.current = { photoId, text, saved: text };
    setDraft(text);
    // 사진이 바뀔 때만 초기화한다 — 동기화로 들어온 같은 사진의 메모 변경은 입력 중 덮어쓰지 않는다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [photoId]);
  useEffect(() => () => flushMemo(), [flushMemo]);
  // 함께 고르는 사람이 같은 사진의 메모를 고치면, 내가 입력 중이 아니고 저장 안 된 내용이 없을 때만 반영한다.
  const remoteMemo = commentOf(photoId);
  const memoRef = useRef<HTMLTextAreaElement>(null);
  // 모바일은 사진을 크게 — 메모는 버튼을 눌렀을 때만 펼치고, 다른 사진으로 넘기면 접는다.
  const [memoOpen, setMemoOpen] = useState(false);
  useEffect(() => { setMemoOpen(false); }, [photoId]);
  const showMemo = desktop || memoOpen;
  useEffect(() => {
    const current = draftRef.current;
    if (current.photoId !== photoId || current.text !== current.saved || remoteMemo === current.saved) return;
    if (document.activeElement === memoRef.current) return;
    draftRef.current = { photoId, text: remoteMemo, saved: remoteMemo };
    setDraft(remoteMemo);
  }, [photoId, remoteMemo]);

  // 앞뒤 사진은 미리 받아 넘김을 빠르게 한다.
  useEffect(() => {
    [photos[index - 1], photos[index + 1], members[memberIndex - 1], members[memberIndex + 1]].forEach((neighbor) => {
      if (neighbor) new Image().src = neighbor.previewUrl || neighbor.url;
    });
  }, [index, memberIndex, members, photos]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const typing = event.target instanceof HTMLElement && ["TEXTAREA", "INPUT"].includes(event.target.tagName);
      if (event.key === "Escape") { event.preventDefault(); onClose(); return; }
      if (typing || event.metaKey || event.ctrlKey || event.altKey || event.repeat) return;
      if (event.key === "ArrowLeft") go(-1);
      else if (event.key === "ArrowRight") go(1);
      else if ((event.key === "ArrowUp" || event.key === "ArrowDown") && members.length > 1) { event.preventDefault(); goMember(event.key === "ArrowUp" ? -1 : 1); }
      else if (event.key === " " && isOwner) { event.preventDefault(); onToggleSelect(photoId); }
      else if (event.key.toLowerCase() === "f") onToggleLike(photoId);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [go, goMember, isOwner, members.length, onClose, onToggleLike, onToggleSelect, photoId]);

  if (!photo) return null;
  const src = photo.previewUrl || photo.url;
  const likers = people.filter((person) => likesOf(photoId).includes(person.id));
  const memoStatus = commentSaveStates[photoId];
  const quality = [photo.isBlurry ? "흐림 의심" : null, photo.faceDetected && photo.eyesClosed ? "눈 감음 의심" : null].filter(Boolean).join(" · ");

  return (
    <div className={s.detail} role="dialog" aria-modal="true" aria-label={`${getPhotoDisplayName(photo)} 상세 보기`}>
      <div className={s.detailStage}>
        <div className={s.detailTop}>
          <button type="button" onClick={onClose} aria-label="목록으로"><ArrowLeft size={20} /></button>
          <span className={s.detailName}>{getPhotoDisplayName(photo)}</span>
          <span className={s.detailCount}>{index + 1} / {photos.length}{members.length > 1 ? ` · 비슷한 사진 ${memberIndex + 1}/${members.length}` : ""}{isOwner ? ` · 선택 ${selectedCount}${target ? `/${target}` : ""}장` : ""}</span>
        </div>
        <div
          className={s.detailImage}
          onTouchStart={(event) => { touchStartRef.current = event.touches.length === 1 ? { x: event.touches[0].clientX, y: event.touches[0].clientY } : null; }}
          onTouchEnd={(event) => {
            const start = touchStartRef.current;
            touchStartRef.current = null;
            if (!start || zoomed) return;
            const dx = event.changedTouches[0].clientX - start.x;
            const dy = event.changedTouches[0].clientY - start.y;
            if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) * 1.5) go(dx < 0 ? 1 : -1);
          }}
        >
          {desktop
            ? <img key={photo.id} src={src} alt={getPhotoDisplayName(photo)} draggable={false} />
            : <MobileViewerPinchPhoto key={photo.id} src={src} alt={getPhotoDisplayName(photo)} showBadge={false} onZoomStateChange={setZoomed} />}
          {index > 0 && <PrevNextButton direction="prev" size="lg" align="edge" className={s.detailNav} onClick={() => go(-1)} />}
          {index < photos.length - 1 && <PrevNextButton direction="next" size="lg" align="edge" className={s.detailNav} onClick={() => go(1)} />}
          {quality && <span className={s.quality}>⚠ {quality} · 직접 확인해 주세요</span>}
        </div>
        {/* 필름 띠 = ‹ › 로 넘기는 순서 그대로. PC는 항상, 모바일은 비슷한 사진을 볼 때만(세로 공간이 좁다). */}
        {photos.length > 1 && (desktop || members.length > 1 || similar.length > 1) && (
          <div className={s.strip}>
            <div className={s.stripRow}>
              {stripRuns.map((run) => {
                const thumbs = run.photos.map((member) => (
                  <button key={member.id} ref={member.id === photoId ? currentThumbRef : undefined} type="button" aria-current={member.id === photoId}
                    aria-label={run.collapsed ? `${getPhotoDisplayName(member)} 외 비슷한 사진 ${run.size - 1}장 보기` : `${getPhotoDisplayName(member)} 보기`}
                    data-stack={run.collapsed || undefined} onClick={() => onPhotoChange(member.id)}>
                    <img src={member.url} alt="" draggable={false} loading="lazy" />
                    {selectedIds.has(member.id) && <i><Check size={11} strokeWidth={3} /></i>}
                    {run.collapsed && <b>{run.size}</b>}
                    {(member.isBlurry || (member.faceDetected && member.eyesClosed)) && <em title={member.isBlurry ? "흐림 의심" : "눈 감음 의심"} aria-label={member.isBlurry ? "흐림 의심" : "눈 감음 의심"}>!</em>}
                  </button>
                ));
                if (run.collapsed || run.photos.length < 2) return thumbs;
                return (
                  <div key={run.photos[0].id} className={s.stripGroup} data-current={run.photos.some((member) => member.id === photoId)}>
                    <div>{thumbs}</div>
                    <span>비슷한 사진 {run.size || similarOf(run.photos[0]).length}장</span>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      <aside className={s.panel}>
        {desktop && <div>
          <p className={s.panelLabel}>찜한 사람</p>
          {likers.length
            ? <div className={s.likers}>{likers.map((person) => <span key={person.id} className={s.liker}><i style={{ background: person.hex }} />{person.name}{person.id === myColor ? " (나)" : ""}</span>)}</div>
            : <span className={s.noLikes}>아직 찜한 사람이 없어요</span>}
        </div>}
        {showMemo && <div>
          <div className={s.memoHead}>
            <p className={s.panelLabel}>작가님께 전달할 메모</p>
            {!desktop && <button type="button" className={s.memoDone} onClick={() => { flushMemo(); setMemoOpen(false); }}>완료</button>}
          </div>
          <textarea
            ref={memoRef}
            className={s.memo}
            aria-label="작가 전달 메모"
            value={draft}
            maxLength={1000}
            placeholder="예: 피부톤 밝게, 배경 사람 지워주세요"
            autoFocus={!desktop}
            onChange={(event) => {
              setDraft(event.target.value);
              draftRef.current.text = event.target.value;
              if (timerRef.current) clearTimeout(timerRef.current);
              timerRef.current = setTimeout(flushMemo, MEMO_SAVE_DELAY_MS);
            }}
            onBlur={flushMemo}
          />
          <p className={`${s.memoStatus} ${memoStatus === "error" ? s.error : ""}`} role="status">
            {memoStatus === "saving" ? "저장 중…" : memoStatus === "saved" ? "저장됨" : memoStatus === "error" ? "저장하지 못했어요. 다시 입력해 주세요." : "함께 고르는 모두가 보고 고칠 수 있어요"}
          </p>
        </div>}
        <div className={`${s.panelActions} ${isOwner ? "" : s.single}`}>
          {!desktop && (
            <PhotographerLightButton variant="outline" size="confirmation" className={s.memoButton} aria-label={draft.trim() ? "메모 보기" : "메모 쓰기"} aria-expanded={memoOpen} onClick={() => setMemoOpen((open) => !open)}>
              <MessageSquare size={18} />{draft.trim() && <i aria-hidden />}
            </PhotographerLightButton>
          )}
          <PhotographerLightButton variant="outline" size="confirmation" className={s.likeButton} aria-pressed={liked} onClick={() => onToggleLike(photoId)}>
            <Heart size={18} fill={liked ? "currentColor" : "none"} />{isOwner ? "" : liked ? "찜했어요" : "찜하기"}
            {!desktop && likers.length > 0 && <span className={s.likerDots} aria-label={`찜한 사람: ${likers.map((person) => person.name).join(", ")}`}>{likers.map((person) => <i key={person.id} style={{ background: person.hex }} />)}</span>}
          </PhotographerLightButton>
          {isOwner && (
            <PhotographerLightButton variant={selected ? "outline" : "primary"} size="confirmation" aria-pressed={selected} onClick={() => onToggleSelect(photoId)}>
              <Check size={18} strokeWidth={3} />{selected ? "보정 받을 사진에서 빼기" : "보정 받기"}
            </PhotographerLightButton>
          )}
        </div>
        <span className={s.shortcutHint}>← → 이동 · {members.length > 1 ? "↑ ↓ 비슷한 사진 · " : ""}{isOwner ? "Space 보정 받기 · " : ""}F 찜 · Esc 닫기</span>
      </aside>
    </div>
  );
}
