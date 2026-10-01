"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowLeft, Check, Heart } from "lucide-react";
import { PrevNextButton } from "@/components/PrevNextButton";
import { MobileViewerPinchPhoto } from "@/components/MobileViewerPinchPhoto";
import { PhotographerLightButton } from "@/components/photographer/PhotographerLightButton";
import { useDesktopViewport } from "@/hooks/useDesktopViewport";
import { getPhotoDisplayName } from "@/lib/gallery-filter";
import type { CommentSaveStatus } from "@/lib/comment-save-status";
import type { ColorTag, Photo } from "@/types";
import s from "./select.module.css";

const MEMO_SAVE_DELAY_MS = 600;

export type Person = { id: ColorTag; name: string; hex: string };

/** 상세 보기 = "고민하는 곳". 큰 사진, 같은 묶음 비교, 찜한 사람, 작가 전달 메모, 최종 선택. */
export function PhotoDetail({
  photos, photoId, onPhotoChange, onClose, isOwner, myColor, people, selectedIds, likesOf, commentOf,
  similarOf, commentSaveStates, onToggleSelect, onToggleLike, onSaveComment, selectedCount, target,
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
  commentSaveStates: Record<string, CommentSaveStatus>;
  onToggleSelect: (photoId: string) => void;
  onToggleLike: (photoId: string) => void;
  onSaveComment: (photoId: string, text: string) => void;
  selectedCount: number;
  target: number;
}) {
  const desktop = useDesktopViewport();
  const index = Math.max(0, photos.findIndex((photo) => photo.id === photoId));
  const photo = photos[index];
  const similar = photo ? similarOf(photo) : [];
  const liked = likesOf(photoId).includes(myColor);
  const selected = selectedIds.has(photoId);
  const [zoomed, setZoomed] = useState(false);
  const touchStartRef = useRef<{ x: number; y: number } | null>(null);

  const go = useCallback((step: number) => {
    const next = photos[index + step];
    if (next) onPhotoChange(next.id);
  }, [index, onPhotoChange, photos]);

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

  // 앞뒤 사진은 미리 받아 넘김을 빠르게 한다.
  useEffect(() => {
    [photos[index - 1], photos[index + 1]].forEach((neighbor) => {
      if (neighbor) new Image().src = neighbor.previewUrl || neighbor.url;
    });
  }, [index, photos]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const typing = event.target instanceof HTMLElement && ["TEXTAREA", "INPUT"].includes(event.target.tagName);
      if (event.key === "Escape") { event.preventDefault(); onClose(); return; }
      if (typing || event.metaKey || event.ctrlKey || event.altKey || event.repeat) return;
      if (event.key === "ArrowLeft") go(-1);
      else if (event.key === "ArrowRight") go(1);
      else if (event.key === " " && isOwner) { event.preventDefault(); onToggleSelect(photoId); }
      else if (event.key.toLowerCase() === "f") onToggleLike(photoId);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [go, isOwner, onClose, onToggleLike, onToggleSelect, photoId]);

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
          <span className={s.detailCount}>{index + 1} / {photos.length}{isOwner ? ` · 선택 ${selectedCount}${target ? `/${target}` : ""}장` : ""}</span>
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
        {similar.length > 1 && (
          <div className={s.strip}>
            <span>비슷한 사진 {similar.length}장</span>
            <div className={s.stripRow}>
              {similar.map((member) => (
                <button key={member.id} type="button" aria-current={member.id === photoId} aria-label={`${getPhotoDisplayName(member)} 보기`} onClick={() => onPhotoChange(member.id)}>
                  <img src={member.url} alt="" draggable={false} />
                  {selectedIds.has(member.id) && <i><Check size={11} strokeWidth={3} /></i>}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      <aside className={s.panel}>
        <div>
          <p className={s.panelLabel}>찜한 사람</p>
          {likers.length
            ? <div className={s.likers}>{likers.map((person) => <span key={person.id} className={s.liker}><i style={{ background: person.hex }} />{person.name}{person.id === myColor ? " (나)" : ""}</span>)}</div>
            : <span className={s.noLikes}>아직 찜한 사람이 없어요</span>}
        </div>
        <div>
          <p className={s.panelLabel}>작가님께 전달할 메모</p>
          <textarea
            className={s.memo}
            value={draft}
            maxLength={1000}
            placeholder="예: 피부톤 밝게, 배경 사람 지워주세요"
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
        </div>
        <div className={`${s.panelActions} ${isOwner ? "" : s.single}`}>
          <PhotographerLightButton variant="outline" size="confirmation" className={s.likeButton} aria-pressed={liked} onClick={() => onToggleLike(photoId)}>
            <Heart size={18} fill={liked ? "currentColor" : "none"} />{isOwner ? "" : liked ? "찜했어요" : "찜하기"}
          </PhotographerLightButton>
          {isOwner && (
            <PhotographerLightButton variant={selected ? "outline" : "primary"} size="confirmation" aria-pressed={selected} onClick={() => onToggleSelect(photoId)}>
              <Check size={18} strokeWidth={3} />{selected ? "보정 받을 사진에서 빼기" : "보정 받기"}
            </PhotographerLightButton>
          )}
        </div>
        <span className={s.shortcutHint}>← → 이동 · {isOwner ? "Space 보정 받기 · " : ""}F 찜 · Esc 닫기</span>
      </aside>
    </div>
  );
}
