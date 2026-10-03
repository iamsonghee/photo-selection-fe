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
const SWIPE_HINT_KEY = "ps:self-select-swipe-hint";
// 아래로 끌어 닫기: 이만큼 끌었거나 빠르게 튕기면 닫고, 아니면 제자리로 돌아온다.
const DISMISS_DISTANCE = 120;
const DISMISS_FLICK = { distance: 50, ms: 220 };

export type Person = { id: ColorTag; name: string; hex: string };

/** 상세 보기 = "고민하는 곳". 큰 사진, 같은 묶음 비교, 찜한 사람, 작가 전달 메모, 최종 선택. */
export function PhotoDetail({
  photos, photoId, onPhotoChange, onClose, isOwner, myColor, people, selectedIds, likesOf, commentOf,
  similarOf, membersOf = noMembers, commentSaveStates, onToggleSelect, onToggleLike, onSaveComment,
  nextScene, prevScene, sceneNotice,
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
  nextScene?: { label: string; onGo: () => void } | null;
  prevScene?: { label: string; onGo: () => void } | null;
  sceneNotice?: string | null;
}) {
  const desktop = useDesktopViewport();
  // 칸(stop) = 갤러리에 보이는 순서의 한 자리. 접힌 묶음이면 지금 사진은 그 묶음 안의 한 장이다.
  const index = Math.max(0, photos.findIndex((item) => item.id === photoId || membersOf(item).some((member) => member.id === photoId)));
  const stop = photos[index];
  const members = useMemo(() => (stop ? membersOf(stop) : []), [membersOf, stop]);
  const memberIndex = members.findIndex((member) => member.id === photoId);
  const photo = memberIndex >= 0 ? members[memberIndex] : stop;
  // 큰 사진은 새 파일을 다 받은 뒤에만 바뀐다(그동안 이전 사진을 흐리게 유지, 실패하면 이전 사진 + 다시 시도).
  // 파일명·선택 상태·찜·메모·버튼은 "지금 화면에 보이는 사진"(view)을 따른다 — 사진과 정보가 늘 함께 바뀌어
  // 보이는 사진과 다른 사진을 고르거나 오해하지 않는다. 띠·넘기기는 가려는 사진(photoId)을 따른다.
  // 빨리 보이게: 작은 썸네일(대개 갤러리·띠에서 이미 받아 둠)이 먼저 오면 바로 띄우고, 큰 사진이 오면 선명하게 바꾼다.
  // 둘 다 오기 전에만 이전 사진을 흐리게 남긴다. 사진 저장소는 요청마다 0.4~0.9초 걸려 큰 사진만 기다리면 느리다.
  const src = photo ? photo.previewUrl || photo.url : "";
  const thumbSrc = photo?.url && photo.url !== src ? photo.url : "";
  const [shown, setShown] = useState<{ id: string; src: string; photo: Photo; full: boolean } | null>(null);
  const shownRef = useRef(shown);
  shownRef.current = shown;
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  const [retryKey, setRetryKey] = useState(0);
  const photoRef = useRef(photo);
  photoRef.current = photo;
  useEffect(() => {
    const current = shownRef.current;
    if (!src || (current?.id === photoId && current.full)) return;
    let alive = true;
    const show = (url: string, full: boolean) => {
      if (!alive || !photoRef.current) return;
      const now = shownRef.current;
      if (!full && now?.id === photoId) return; // 이미 이 사진(큰 사진)이 떠 있으면 썸네일로 되돌리지 않는다
      setShown({ id: photoId, src: url, photo: photoRef.current, full });
    };
    if (thumbSrc) { const thumb = new Image(); thumb.onload = () => show(thumbSrc, false); thumb.src = thumbSrc; }
    const image = new Image();
    image.onload = () => { show(src, true); if (alive) setFailedSrc(null); };
    image.onerror = () => { if (alive) setFailedSrc(src); };
    image.src = src;
    return () => { alive = false; };
  }, [photoId, retryKey, src, thumbSrc]);
  const loaded = !src || shown?.id === photoId; // 이 사진(썸네일 이상)이 보이면 정보·버튼이 함께 바뀐다
  const imageFailed = failedSrc === src;
  const view = shown && shown.id !== photoId ? shown.photo : photo;
  const viewId = view?.id ?? photoId;
  // 처음 열 때(아직 보이는 사진이 없을 때)만 버튼을 막는다. 넘기는 동안에는 보이는 사진에 대해 그대로 동작한다.
  const canAct = Boolean(shown) || !src;
  const liked = likesOf(viewId).includes(myColor);
  const selected = selectedIds.has(viewId);
  const [zoomed, setZoomed] = useState(false);
  // 크게 보기: 사진을 한 번 누르면 위쪽 줄·띠·버튼(PC는 오른쪽 패널)을 숨기고 사진만 꽉 채운다. 다시 누르면 돌아온다. 넘겨도 유지.
  const [immersive, setImmersive] = useState(false);
  const toggleImmersive = useCallback(() => setImmersive((value) => !value), []);
  // 흐림·눈 감음 칩은 눌러서 설명을 본다(터치 화면에서는 마우스를 올린 설명이 보이지 않는다).
  const [qualityOpen, setQualityOpen] = useState(false);
  // 모바일은 ‹ › 버튼이 없어, 기기마다 처음 한 번만 "밀어서 넘기기"를 알려준다.
  const [swipeHint, setSwipeHint] = useState(false);
  useEffect(() => {
    if (desktop || photos.length < 2) return;
    try {
      if (localStorage.getItem(SWIPE_HINT_KEY)) return;
      localStorage.setItem(SWIPE_HINT_KEY, "1");
    } catch { return; }
    setSwipeHint(true);
    const timer = window.setTimeout(() => setSwipeHint(false), 2600);
    return () => window.clearTimeout(timer);
  }, [desktop, photos.length]);
  const touchStartRef = useRef<{ x: number; y: number; at: number; axis: "x" | "y" | null } | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  // 끄는 동안은 매 움직임마다 다시 그리지 않고 스타일만 바꾼다(손가락을 바로 따라오게).
  const setDrag = useCallback((dy: number, animate: boolean) => {
    const stage = stageRef.current;
    const root = rootRef.current;
    if (!stage || !root) return;
    stage.style.transition = animate ? "transform 220ms ease" : "none";
    stage.style.transform = dy ? `translateY(${dy}px) scale(${1 - Math.min(dy, 400) / 2000})` : "";
    root.style.setProperty("--dismiss", String(1 - Math.min(dy / 400, 0.7)));
    if (dy && !animate) root.setAttribute("data-dragging", ""); else root.removeAttribute("data-dragging");
  }, []);
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
    else (step > 0 ? nextScene : prevScene)?.onGo();
  }, [index, nextScene, onPhotoChange, photos, prevScene]);
  const goMember = useCallback((step: number) => {
    const next = members[memberIndex + step];
    if (next) onPhotoChange(next.id);
  }, [memberIndex, members, onPhotoChange]);
  // 모바일 좌우 밀기: 묶음 안의 다음·이전 사진부터 보고, 끝에서 다음 칸으로 간다(뒤로 들어간 묶음은 마지막 사진부터).
  // PC는 ‹ › = 칸, ↑↓ = 묶음 안 — 키보드로 묶음을 빠르게 건너뛸 수 있게 그대로 둔다.
  const swipe = useCallback((step: number) => {
    const inGroup = memberIndex >= 0 ? members[memberIndex + step] : undefined;
    if (inGroup) { onPhotoChange(inGroup.id); return; }
    const before = step < 0 ? photos[index - 1] : undefined;
    const beforeGroup = before ? membersOf(before) : [];
    if (beforeGroup.length) { onPhotoChange(beforeGroup[beforeGroup.length - 1].id); return; }
    go(step);
  }, [go, index, memberIndex, members, membersOf, onPhotoChange, photos]);

  // 작가 전달 메모: 입력이 멈추면 자동 저장, 사진을 넘기거나 닫을 때도 남은 입력을 저장한다.
  const [draft, setDraft] = useState(() => commentOf(viewId));
  const draftRef = useRef({ photoId: viewId, text: draft, saved: draft });
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
    const text = commentOf(viewId);
    draftRef.current = { photoId: viewId, text, saved: text };
    setDraft(text);
    // 보이는 사진이 바뀔 때만 초기화한다 — 동기화로 들어온 같은 사진의 메모 변경은 입력 중 덮어쓰지 않는다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewId]);
  useEffect(() => () => flushMemo(), [flushMemo]);
  // 함께 고르는 사람이 같은 사진의 메모를 고치면, 내가 입력 중이 아니고 저장 안 된 내용이 없을 때만 반영한다.
  const remoteMemo = commentOf(viewId);
  const memoRef = useRef<HTMLTextAreaElement>(null);
  // 모바일은 사진을 크게 — 메모는 버튼을 눌렀을 때만 펼치고, 다른 사진으로 넘기면 접는다.
  const [memoOpen, setMemoOpen] = useState(false);
  useEffect(() => { setMemoOpen(false); setQualityOpen(false); }, [viewId]);

  // 모달: 열면 포커스를 안으로 옮기고, 닫으면 원래 자리로 돌려놓는다. Tab은 안에서만 돈다(아래 onKey).
  useEffect(() => {
    const before = document.activeElement as HTMLElement | null;
    rootRef.current?.focus();
    return () => { before?.focus?.(); };
  }, []);
  const showMemo = desktop || memoOpen;
  useEffect(() => {
    const current = draftRef.current;
    if (current.photoId !== viewId || current.text !== current.saved || remoteMemo === current.saved) return;
    if (document.activeElement === memoRef.current) return;
    draftRef.current = { photoId: viewId, text: remoteMemo, saved: remoteMemo };
    setDraft(remoteMemo);
  }, [viewId, remoteMemo]);

  // 앞뒤 두 칸, 묶음 안 앞뒤, 뒤로 들어갈 묶음의 마지막 사진을 미리 받아 넘김을 빠르게 한다.
  useEffect(() => {
    const before = photos[index - 1];
    const beforeGroup = before ? membersOf(before) : [];
    [photos[index - 2], before, photos[index + 1], photos[index + 2], members[memberIndex - 1], members[memberIndex + 1], beforeGroup[beforeGroup.length - 1]].forEach((neighbor) => {
      if (neighbor) new Image().src = neighbor.previewUrl || neighbor.url;
    });
  }, [index, memberIndex, members, membersOf, photos]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Tab" && rootRef.current) {
        const focusable = [...rootRef.current.querySelectorAll<HTMLElement>("button:not([disabled]), textarea, a[href], [tabindex]:not([tabindex='-1'])")].filter((element) => element.offsetParent !== null);
        if (!focusable.length) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        const active = document.activeElement;
        if (event.shiftKey && (active === first || active === rootRef.current)) { event.preventDefault(); last.focus(); }
        else if (!event.shiftKey && (active === last || !rootRef.current.contains(active))) { event.preventDefault(); first.focus(); }
        return;
      }
      const typing = event.target instanceof HTMLElement && ["TEXTAREA", "INPUT"].includes(event.target.tagName);
      // 메모 입력 중 Esc는 입력창에서만 빠진다(바로 닫지 않는다).
      if (event.key === "Escape") { event.preventDefault(); if (typing) (event.target as HTMLElement).blur(); else if (immersive) setImmersive(false); else onClose(); return; }
      if (typing || event.metaKey || event.ctrlKey || event.altKey || event.repeat) return;
      if (event.key === "ArrowLeft") go(-1);
      else if (event.key === "ArrowRight") go(1);
      else if ((event.key === "ArrowUp" || event.key === "ArrowDown") && members.length > 1) { event.preventDefault(); goMember(event.key === "ArrowUp" ? -1 : 1); }
      else if (event.key === " " && isOwner) { event.preventDefault(); if (canAct) onToggleSelect(viewId); }
      else if (event.key.toLowerCase() === "f" && canAct) onToggleLike(viewId);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [canAct, go, goMember, immersive, isOwner, members.length, onClose, onToggleLike, onToggleSelect, viewId]);

  if (!photo || !view) return null;
  const likers = people.filter((person) => likesOf(viewId).includes(person.id));
  const memoStatus = commentSaveStates[viewId];
  const quality = [view.isBlurry ? "흐림 의심" : null, view.faceDetected && view.eyesClosed ? "눈 감음 의심" : null].filter(Boolean).join(" · ");
  const viewName = getPhotoDisplayName(view);

  return (
    <div ref={rootRef} className={s.detail} data-immersive={immersive || undefined} tabIndex={-1} role="dialog" aria-modal="true" aria-label={`${viewName} 상세 보기`}>
      <div className={s.detailStage}>
        <div className={s.detailTop}>
          <button type="button" onClick={onClose} aria-label="목록으로"><ArrowLeft size={20} /></button>
          {/* 파일명은 고객에게 의미가 적어 작게. 위치 숫자(6 / 22)는 두지 않고, 비슷한 사진 묶음 안에서만 몇 번째인지 알린다. */}
          <span className={s.detailName}>{viewName}</span>
          {/* 고른 사진은 위쪽에도 표시 — 버튼 문구만으로 상태를 읽지 않게. */}
          {selected && <span className={s.detailPicked}><Check size={13} strokeWidth={3} aria-hidden />선택됨</span>}
          {/* AI 의심 표시는 사진을 가리지 않게 위쪽 작은 칩으로(갤러리 카드 칩과 같은 톤). */}
          {quality && <button type="button" className={s.detailQuality} aria-expanded={qualityOpen} onClick={() => setQualityOpen((open) => !open)}>{quality}</button>}
          {members.length > 1 && <span className={s.detailCount}>비슷한 사진 {memberIndex + 1}/{members.length}</span>}
          {qualityOpen && <p className={s.qualityTip} role="note">AI가 {[view.isBlurry ? "흐림(흔들림·초점)" : null, view.faceDetected && view.eyesClosed ? "눈 감음" : null].filter(Boolean).join("·")} 가능성을 표시했어요. 틀릴 수 있으니 사진을 직접 확인해 주세요.</p>}
        </div>
        <div
          ref={stageRef}
          className={s.detailImage}
          onClick={(event) => { if (immersive && event.target === event.currentTarget) setImmersive(false); }}
          data-loading={!loaded && !imageFailed ? "" : undefined}
          onTouchStart={(event) => { touchStartRef.current = event.touches.length === 1 ? { x: event.touches[0].clientX, y: event.touches[0].clientY, at: Date.now(), axis: null } : null; }}
          onTouchMove={(event) => {
            const start = touchStartRef.current;
            if (!start || zoomed || event.touches.length !== 1) return;
            const dx = event.touches[0].clientX - start.x;
            const dy = event.touches[0].clientY - start.y;
            // 처음 10px 움직인 방향으로 정한다: 아래로 → 끌어 닫기, 그 밖 → 좌우 넘기기.
            if (!start.axis && Math.hypot(dx, dy) > 10) start.axis = dy > 0 && dy > Math.abs(dx) * 1.2 ? "y" : "x";
            if (start.axis === "y") setDrag(Math.max(0, dy), false);
          }}
          onTouchCancel={() => { if (touchStartRef.current?.axis === "y") setDrag(0, true); touchStartRef.current = null; }}
          onTouchEnd={(event) => {
            const start = touchStartRef.current;
            touchStartRef.current = null;
            if (!start || zoomed) return;
            const dx = event.changedTouches[0].clientX - start.x;
            const dy = event.changedTouches[0].clientY - start.y;
            if (start.axis === "y") {
              const flick = dy > DISMISS_FLICK.distance && Date.now() - start.at < DISMISS_FLICK.ms;
              if (dy > DISMISS_DISTANCE || flick) {
                // 끈 방향으로 마저 내려보낸 뒤 닫는다.
                setDrag(window.innerHeight, true);
                window.setTimeout(onClose, 180);
              } else setDrag(0, true); // 덜 끌었으면 제자리로
              return;
            }
            if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) * 1.5) swipe(dx < 0 ? 1 : -1);
          }}
        >
          {shown && (desktop
            ? <img src={shown.src} alt={viewName} draggable={false} title={immersive ? "누르면 돌아가기" : "누르면 크게 보기"} onClick={toggleImmersive} />
            : <MobileViewerPinchPhoto key={shown.id} src={shown.src} alt={viewName} showBadge={false} onZoomStateChange={setZoomed} onSingleTap={toggleImmersive} />)}
          {!loaded && !imageFailed && <span className={s.detailSpinner} role="status" aria-label="다음 사진을 불러오는 중" />}
          {imageFailed && (
            <div className={s.detailError} role="alert">
              <span>{getPhotoDisplayName(photo)}을(를) 불러오지 못했어요</span>
              <button type="button" onClick={() => { setFailedSrc(null); setRetryKey((key) => key + 1); }}>다시 시도</button>
            </div>
          )}
          {immersive && selected && <span className={s.immersivePicked} aria-label="최종 선택됨"><Check size={14} strokeWidth={3} aria-hidden /></span>}
          {sceneNotice && <span className={s.detailSceneNotice} role="status">{sceneNotice}</span>}
          {swipeHint && !sceneNotice && <span className={s.detailSceneNotice} role="status">밀어서 넘기고 · 누르면 크게 · 내려서 닫기</span>}
          {(index > 0 || prevScene) && <PrevNextButton direction="prev" size="lg" align="edge" className={s.detailNav} ariaLabel={index > 0 ? "이전 사진" : `이전 장면 · ${prevScene?.label}`} onClick={() => go(-1)} />}
          {(index < photos.length - 1 || nextScene) && <PrevNextButton direction="next" size="lg" align="edge" className={s.detailNav} ariaLabel={index < photos.length - 1 ? "다음 사진" : `다음 장면 · ${nextScene?.label}`} onClick={() => go(1)} />}
        </div>
        {/* 필름 띠 = ‹ › 로 넘기는 순서 그대로. PC·모바일 모두 늘 같은 자리에 둔다 — 유사컷일 때만 띄우면 사진 크기가 들썩인다. */}
        {photos.length > 1 && (
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
                    {!run.collapsed && (member.isBlurry || (member.faceDetected && member.eyesClosed)) && <em title={member.isBlurry ? "흐림 의심" : "눈 감음 의심"} aria-label={member.isBlurry ? "흐림 의심" : "눈 감음 의심"}>!</em>}
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
        {desktop && people.length > 1 && <div>
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
            readOnly={!canAct}
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
            {memoStatus === "saving" ? "저장 중…" : memoStatus === "saved" ? "저장됨" : memoStatus === "error"
              ? <>저장하지 못했어요. 쓴 내용은 남아 있어요. <button type="button" className={s.memoRetry} onClick={() => onSaveComment(viewId, draftRef.current.text)}>다시 저장</button></>
              : "함께 고르는 모두가 보고 고칠 수 있어요"}
          </p>
        </div>}
        {/* 모바일: 찜한 사람은 색 점 대신 이름으로 한 줄(눌러야 보이는 팝오버보다 바로 읽힌다). */}
        {!desktop && !memoOpen && likers.length > 0 && (
          <p className={s.likerLine}><span className={s.likerDots} aria-hidden>{likers.map((person) => <i key={person.id} style={{ background: person.hex }} />)}</span>{likers.map((person) => person.id === myColor ? "나" : person.name).join("·")} 찜</p>
        )}
        {/* 모바일에서 메모를 펼치면 버튼 줄은 숨긴다(시트·버튼·키보드가 겹쳐 쌓이지 않게) — `완료`로 돌아온다. */}
        {(desktop || !memoOpen) && <div className={`${s.panelActions} ${isOwner ? "" : s.single}`}>
          {!desktop && (
            <PhotographerLightButton variant="outline" size="confirmation" className={s.memoButton} data-has-memo={draft.trim() ? "" : undefined} aria-label={draft.trim() ? "메모 보기" : "메모 쓰기"} aria-expanded={memoOpen} onClick={() => setMemoOpen((open) => !open)}>
              <MessageSquare size={18} />메모
            </PhotographerLightButton>
          )}
          <PhotographerLightButton variant="outline" size="confirmation" className={s.likeButton} aria-pressed={liked} disabled={!canAct} onClick={() => onToggleLike(viewId)}>
            <Heart size={18} fill={liked ? "currentColor" : "none"} />{isOwner ? "찜" : liked ? "찜했어요" : "찜하기"}
          </PhotographerLightButton>
          {isOwner && (
            // 상태를 보여주는 토글: 고른 사진은 주황 채움 `✓ 선택됨`(다시 누르면 해제), 아니면 테두리 `최종 선택`.
            <PhotographerLightButton variant={selected ? "primary" : "outline"} size="confirmation" className={selected ? "" : s.pickButton} aria-pressed={selected} aria-label={selected ? "최종 선택됨, 누르면 해제" : "최종 선택"} disabled={!canAct} onClick={() => onToggleSelect(viewId)}>
              <Check size={18} strokeWidth={3} />{selected ? <><span className={s.pickOn}>선택됨</span><span className={s.pickOff}>선택 해제</span></> : "최종 선택"}
            </PhotographerLightButton>
          )}
        </div>}
        <span className={s.shortcutHint}>← → 이동 · {members.length > 1 ? "↑ ↓ 비슷한 사진 · " : ""}{isOwner ? "Space 최종 선택 · " : ""}F 찜 · Esc 닫기</span>
      </aside>
    </div>
  );
}
