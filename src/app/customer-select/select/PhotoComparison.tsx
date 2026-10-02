"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { SelectImage as Image } from "../SelectImage";
import { Check, ChevronLeft, ChevronRight, Heart, X, ZoomIn } from "lucide-react";
import { MobileViewerPinchPhoto } from "@/components/MobileViewerPinchPhoto";
import { PhotoFilmstrip } from "@/components/customer/PhotoFilmstrip";
import { useCustomerSelectDraft } from "@/contexts/CustomerSelectDraftContext";
import type { SelectPhoto } from "@/lib/customer-select-sample";

export type ComparisonUnit = { id: string; scene: string; photos: SelectPhoto[] };
const button = "cs-secondary min-h-11 rounded-lg border border-[var(--customer-divider)] px-3 text-xs font-semibold disabled:opacity-35";
const desktopQuery = "(min-width: 768px)";
function subscribeDesktop(callback: () => void) {
  const query = window.matchMedia(desktopQuery);
  query.addEventListener("change", callback);
  return () => query.removeEventListener("change", callback);
}

function ComparisonPhoto({ photo, desktop, label, qualityAnalyzed, onSwipe, reviewMode, onToggleFinal }: {
  photo: SelectPhoto; desktop: boolean; label: string; qualityAnalyzed: boolean; onSwipe?: (direction: number) => void; reviewMode: boolean; onToggleFinal: () => void;
}) {
  const { finalIds, favorites, toggleFavorite, guests, activeActor, closed, opinions, setOpinion, notes, setNote } = useCustomerSelectDraft();
  const [zoomed, setZoomed] = useState(false);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [resetKey, setResetKey] = useState(0);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const src = photo.src + (attempt && !photo.src.startsWith("blob:") ? `?retry=${attempt}` : "");
  const stage = useRef<HTMLButtonElement>(null);
  const image = useRef<HTMLImageElement>(null);
  const drag = useRef<{ x: number; y: number; panX: number; panY: number; moved: boolean } | null>(null);
  const swipe = useRef<{ x: number; y: number } | null>(null);
  const zoomRef = useRef(false);
  const notifyZoom = useCallback((value: boolean) => { zoomRef.current = value; setZoomed(value); }, []);

  function clampPan(x: number, y: number) {
    const box = stage.current;
    const img = image.current;
    if (!box || !img?.naturalWidth) return { x: 0, y: 0 };
    const fit = Math.min(box.clientWidth / img.naturalWidth, box.clientHeight / img.naturalHeight);
    const maxX = Math.max(0, (img.naturalWidth * fit * 2 - box.clientWidth) / 2);
    const maxY = Math.max(0, (img.naturalHeight * fit * 2 - box.clientHeight) / 2);
    return { x: Math.max(-maxX, Math.min(maxX, x)), y: Math.max(-maxY, Math.min(maxY, y)) };
  }
  function resetZoom() {
    setZoomed(false); zoomRef.current = false; setPan({ x: 0, y: 0 }); setResetKey(key => key + 1);
  }
  function retry() { setFailed(false); setAttempt(attempt + 1); resetZoom(); }

  return <section aria-label={label} className="flex min-h-0 min-w-0 flex-1 flex-col">
    <div className="hidden h-9 shrink-0 items-center justify-between px-3 text-xs md:flex">
      <span className="font-semibold text-[var(--customer-ink-secondary)]">{label}</span>
      {failed ? <button className="min-h-11 px-2" onClick={retry}>다시 불러오기</button> : desktop
        ? <button className="min-h-11 px-2" onClick={() => zoomed ? resetZoom() : setZoomed(true)}>{zoomed ? "전체 구도" : <><ZoomIn size={13} className="mr-1 inline" />확대</>}</button>
        : zoomed && <button className="min-h-11 px-2" onClick={resetZoom}>전체 구도</button>}
    </div>
    <div className="flex min-h-0 flex-1 flex-col md:flex-row">
    {desktop ? <button ref={stage} aria-label={photo.filename + (zoomed ? " 확대된 사진" : " 확대")} aria-pressed={zoomed}
      className={`relative min-h-0 flex-1 touch-none cs-photo-stage overflow-hidden bg-[var(--select-surface)] ${zoomed ? "cursor-grab active:cursor-grabbing" : "cursor-zoom-in"}`}
      onPointerDown={event => {
        drag.current = { x: event.clientX, y: event.clientY, panX: pan.x, panY: pan.y, moved: false };
        if (zoomed) event.currentTarget.setPointerCapture(event.pointerId);
      }}
      onPointerMove={event => {
        if (!zoomed || !drag.current || !event.buttons) return;
        const dx = event.clientX - drag.current.x;
        const dy = event.clientY - drag.current.y;
        if (Math.hypot(dx, dy) > 4) drag.current.moved = true;
        setPan(clampPan(drag.current.panX + dx, drag.current.panY + dy));
      }}
      onPointerCancel={() => { drag.current = null; }}
      onClick={event => {
        if (failed) { retry(); return; }
        if (drag.current?.moved) { drag.current = null; return; }
        if (zoomed) { resetZoom(); return; }
        const rect = event.currentTarget.getBoundingClientRect();
        setPan(event.detail ? clampPan(rect.width / 2 - (event.clientX - rect.left), rect.height / 2 - (event.clientY - rect.top)) : { x: 0, y: 0 });
        setZoomed(true);
      }}
      onKeyDown={event => {
        if (!zoomed || !event.key.startsWith("Arrow")) return;
        event.preventDefault(); event.stopPropagation();
        setPan(clampPan(pan.x + (event.key === "ArrowLeft" ? 40 : event.key === "ArrowRight" ? -40 : 0), pan.y + (event.key === "ArrowUp" ? 40 : event.key === "ArrowDown" ? -40 : 0)));
      }}>
      <div className="absolute inset-0" style={{ transform: `translate(${pan.x}px,${pan.y}px) scale(${zoomed ? 2 : 1})` }}>
        <Image key={src + attempt} ref={image} src={src} alt={photo.filename} fill unoptimized={attempt > 0} sizes="(max-width: 767px) 100vw, 1200px" draggable={false} className="select-none object-contain" onError={() => setFailed(true)} />
      </div>
    </button> : <div className="relative min-h-0 flex-1 touch-none cs-photo-stage overflow-hidden bg-[var(--select-surface)]" aria-label={photo.filename + " 터치 사진"} onErrorCapture={() => setFailed(true)}
      onTouchStartCapture={event => {
        swipe.current = event.touches.length === 1 && !zoomRef.current ? { x: event.touches[0].clientX, y: event.touches[0].clientY } : null;
      }}
      onTouchMoveCapture={event => { if (event.touches.length > 1) swipe.current = null; }}
      onTouchCancel={() => { swipe.current = null; }}
      onTouchEndCapture={event => {
        const start = swipe.current;
        swipe.current = null;
        if (!start || zoomRef.current || event.touches.length || !event.changedTouches.length) return;
        const dx = event.changedTouches[0].clientX - start.x;
        const dy = event.changedTouches[0].clientY - start.y;
        if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) * 1.5) onSwipe?.(dx < 0 ? 1 : -1);
      }}>
      <MobileViewerPinchPhoto key={resetKey} src={src} alt={photo.filename} showBadge={false} onZoomStateChange={notifyZoom} />
      {zoomed && <button type="button" className="absolute right-3 top-3 z-10 min-h-11 rounded-lg bg-black/70 px-3 text-xs text-white" onClick={resetZoom}>전체 구도</button>}
      {failed && <button type="button" className="absolute left-3 top-3 z-10 min-h-11 rounded-lg bg-black/70 px-3 text-xs text-white" onClick={retry}>다시 불러오기</button>}
      {failed && <span role="status" className="absolute inset-0 grid place-items-center bg-[var(--select-line)] text-sm text-[var(--customer-ink-secondary)]">사진을 불러오지 못했어요.</span>}
    </div>}
    <div className="shrink-0 px-3 py-2 md:w-72 md:overflow-y-auto md:border-l md:border-[#3a3a42] md:p-4">
      {!reviewMode && <p className="mb-2 truncate text-[12px]">{photo.filename}</p>}
      <div className="flex items-center gap-2 md:flex-col-reverse md:items-stretch">
        {!reviewMode && <button className={button + " flex items-center justify-center gap-1 md:w-full"} disabled={closed} aria-label={photo.filename + " 찜"} aria-pressed={Boolean(favorites[activeActor]?.has(photo.id))} onClick={() => toggleFavorite(photo.id)}><Heart size={16} fill={favorites[activeActor]?.has(photo.id) ? "currentColor" : "none"} />{favorites[activeActor]?.has(photo.id) ? "찜함" : "찜하기"}</button>}
          {activeActor === "owner" && <button className={button + " cs-select-photo flex flex-1 items-center justify-center gap-1 md:w-full " + (finalIds.has(photo.id) ? "border-[var(--accent)] bg-[var(--accent)] text-white" : "")}
            disabled={closed} aria-label={photo.filename + (reviewMode ? " 선택 해제" : " 최종 선택")} aria-pressed={finalIds.has(photo.id)} onClick={onToggleFinal}>
            <Check size={16} aria-hidden="true" />{reviewMode ? "선택 해제" : finalIds.has(photo.id) ? "최종 선택됨" : "최종 선택"}
          </button>}
      </div>
      {activeActor === "owner" && <label className="mt-3 block text-[12px]">작가에게 요청할 내용<textarea aria-label={photo.filename + " 요청 사항"} disabled={closed} value={notes[photo.id] ?? ""} maxLength={1000} rows={2} placeholder="예: 피부 보정은 자연스럽게" className="mt-1 w-full resize-y rounded border border-[#52525b] bg-[#27282f] p-2 text-sm text-white" onChange={event => setNote(photo.id, event.target.value)} /></label>}
      {guests.length > 0 && <p className="mt-1 text-[12px] text-[var(--select-muted)]">{[{ id: "owner", name: "나" }, ...guests].filter(guest => favorites[guest.id]?.has(photo.id)).map(guest => guest.name).join(" · ") || "아직 찜한 사람이 없어요"}</p>}
      {qualityAnalyzed && photo.quality && <p className="mt-1 text-[12px] leading-4 text-[#886341]">{photo.quality} · 확대해서 직접 확인해 보세요.</p>}
      {guests.length > 0 && <details className="mt-1 text-xs"><summary className="cursor-pointer">의견 보기·쓰기</summary><div className="mt-2 space-y-1">{[{ id: "owner", name: "나" }, ...guests].map(guest => opinions[guest.id]?.[photo.id] && <p key={guest.id}><strong>{guest.name}:</strong> {opinions[guest.id][photo.id]}</p>)}<textarea aria-label="내 의견" disabled={closed} value={opinions[activeActor]?.[photo.id] ?? ""} onChange={event => setOpinion(photo.id, event.target.value)} rows={2} maxLength={500} className="w-full rounded border bg-white p-2 text-xs text-black" placeholder="이 사진에 대한 의견" /></div></details>}
    </div>
    </div>
  </section>;
}

export function PhotoComparison({ units, initialIndex, onClose, qualityAnalyzed, scenes, categories, people, sceneByPhotoId, reviewMode = false, onRemove }: {
  units: ComparisonUnit[]; initialIndex: number; onClose: () => void; qualityAnalyzed: boolean; scenes: string[]; categories: readonly string[]; people: readonly string[]; sceneByPhotoId: Record<string, number>; reviewMode?: boolean; onRemove?: (id: string) => void;
}) {
  const desktop = useSyncExternalStore(subscribeDesktop, () => window.matchMedia(desktopQuery).matches, () => false);
  const dialog = useRef<HTMLDialogElement>(null);
  const thumbnails = useRef<HTMLDivElement>(null);
  const { finalIds, toggleFinal, toggleFavorite, targetCount, setPhotoScene, setPhotoPerson, setPhotoComposition, setPhotoCategories, personByPhotoId, compositionByPhotoId, categoryByPhotoId, sceneByPhotoId: sceneEdits, activeActor } = useCustomerSelectDraft();
  const [index, setIndex] = useState(initialIndex);
  const [photoIndex, setPhotoIndex] = useState(0);
  const [expanded, setExpanded] = useState(units[initialIndex].photos.length > 1);
  const unit = units[index];
  const photo = unit.photos[photoIndex];
  const photoCategories = categoryByPhotoId[photo.id] ?? photo.categories ?? [];

  useEffect(() => {
    const element = dialog.current;
    const overflow = document.body.style.overflow;
    element?.showModal();
    document.body.style.overflow = "hidden";
    return () => { element?.close(); document.body.style.overflow = overflow; };
  }, []);
  useEffect(() => {
    thumbnails.current?.querySelector('[aria-pressed="true"]')?.scrollIntoView({ block: "nearest", inline: "center" });
  }, [photoIndex, expanded]);

  function move(next: number) {
    setIndex(next); setPhotoIndex(0); setExpanded(units[next].photos.length > 1);
  }
  function choosePhoto(next: number) {
    setPhotoIndex(next);
  }
  function advance(direction: number) {
    const next = index + direction;
    if (next >= 0 && next < units.length) move(next);
  }
  function changeFinal() {
    toggleFinal(photo.id);
    if (reviewMode && finalIds.has(photo.id)) { onRemove?.(photo.id); onClose(); }
  }

  return <dialog ref={dialog} onCancel={onClose} aria-labelledby="comparison-title"
    className="cs-viewer fixed inset-0 m-auto h-[100dvh] max-h-none w-full max-w-none bg-white p-0 text-[var(--customer-control)] backdrop:bg-black/50 md:h-[96dvh] md:w-[96vw] md:max-w-[1600px] md:rounded-xl"
    onKeyDown={event => {
      if (event.target instanceof HTMLInputElement || event.target instanceof HTMLSelectElement || event.target instanceof HTMLTextAreaElement || event.ctrlKey || event.metaKey || event.altKey) return;
      if (event.key === "ArrowLeft" || event.key === "ArrowRight") { event.preventDefault(); advance(event.key === "ArrowLeft" ? -1 : 1); }
      if (event.code === "Space") { event.preventDefault(); if (!event.repeat) changeFinal(); }
      if (event.key.toLowerCase() === "f") { event.preventDefault(); if (!event.repeat) toggleFavorite(photo.id); }
    }}>
    <div className="flex h-full min-h-0 flex-col">
      <header className="flex shrink-0 items-center justify-between gap-2 border-b px-4 py-2">
        <div className="min-w-0 flex-1"><h2 id="comparison-title" className="truncate text-sm font-semibold">{photo.filename}</h2>
          <p className="mt-1 truncate text-xs text-[var(--select-muted)]">{unit.scene} · 전체 {finalIds.size}{targetCount !== null && ` / ${targetCount}`}장{unit.photos.length > 1 && ` · 유사컷 ${unit.photos.length}장`}</p></div>
        {activeActor === "owner" && !reviewMode && <details className="relative shrink-0 text-xs"><summary className="flex min-h-11 cursor-pointer items-center font-semibold">사진 정보 수정</summary><div className="absolute right-0 top-11 z-20 grid max-h-[60dvh] w-[min(90vw,440px)] gap-3 overflow-y-auto rounded-lg border border-[var(--customer-divider)] bg-white p-3 text-[var(--customer-control)] shadow-lg">
          {scenes.length > 0 && <label>촬영 구간<select aria-label="현재 사진 촬영 구간" value={sceneEdits[photo.id] ?? sceneByPhotoId[photo.id] ?? 0} onChange={event => setPhotoScene(photo.id, Number(event.target.value))} className="ml-2 min-h-9 rounded border border-[var(--customer-divider)] bg-white px-2 text-black">{scenes.map((name, sceneIndex) => <option key={name} value={sceneIndex}>{name}</option>)}</select></label>}
          <label>인물 관계<select aria-label="현재 사진 인물" value={personByPhotoId[photo.id] ?? photo.person} onChange={event => setPhotoPerson(photo.id, event.target.value)} className="ml-2 min-h-9 rounded border px-2"><option value="">미지정</option>{people.map(person => <option key={person} value={person}>{person}</option>)}</select></label>
          <label>구도<select aria-label="현재 사진 구도" value={compositionByPhotoId[photo.id] ?? photo.composition} onChange={event => setPhotoComposition(photo.id, event.target.value)} className="ml-2 min-h-9 rounded border px-2"><option value="">미지정</option>{["전신", "클로즈업", "가로"].map(value => <option key={value} value={value}>{value}</option>)}</select></label>
          <span>사진 종류 · 여러 개 선택 가능</span><div className="flex flex-wrap gap-2">{categories.map(category => <label key={category} className="flex min-h-9 items-center gap-1 whitespace-nowrap"><input type="checkbox" checked={photoCategories.includes(category)} onChange={event => setPhotoCategories(photo.id, event.target.checked ? [...photoCategories, category] : photoCategories.filter(item => item !== category))} />{category}</label>)}</div>
        </div></details>}
        <button autoFocus onClick={onClose} aria-label="상세보기 닫기" className={button}><X size={19} /></button>
      </header>
      {unit.photos.length > 1 && <div className="flex min-h-12 shrink-0 items-center px-3 py-1"><button className={button} aria-expanded={expanded} onClick={() => setExpanded(!expanded)}>유사컷 {unit.photos.length}장 {expanded ? "접기" : "보기"}</button></div>}
      <div className="flex min-h-0 flex-1 gap-1 md:gap-3">
        <ComparisonPhoto key={photo.id + desktop} photo={photo} label="사진" desktop={desktop} qualityAnalyzed={qualityAnalyzed} onSwipe={advance} reviewMode={reviewMode} onToggleFinal={changeFinal} />
      </div>
      {expanded && <div ref={thumbnails} className="flex shrink-0 gap-2 overflow-x-auto px-3 py-2" aria-label="묶음의 모든 사진">
        {unit.photos.map((item, i) => <button key={item.id} onClick={() => choosePhoto(i)} aria-label={`사진 ${i + 1} 보기`} aria-pressed={photoIndex === i}
          className={`cs-thumbnail relative h-16 w-14 shrink-0 overflow-hidden rounded border-2 ${photoIndex === i ? "border-[var(--customer-control)]" : "border-transparent"}`}>
          <Image src={item.src} alt="" fill sizes="56px" className="object-contain" />
          {finalIds.has(item.id) && <span className="absolute right-0 top-0 rounded bg-[var(--accent)] text-white"><Check size={14} /></span>}
          {qualityAnalyzed && item.quality && <span aria-label={item.quality} title={item.quality} className="absolute left-1 top-1 h-2 w-2 rounded-full bg-[#a8804c] ring-1 ring-white" />}
        </button>)}
      </div>}
      {desktop && !expanded && <div className="shrink-0 overflow-hidden bg-[var(--customer-control)] px-3 py-2" aria-label={reviewMode ? "선택한 사진 목록" : "장면 대표컷 목록"}>
        <PhotoFilmstrip items={units.slice(Math.max(0, index - 6), index + 7).map(item => ({ id: item.id, url: item.photos[0].src, label: item.photos[0].filename + (reviewMode ? " 보기" : " 대표컷 보기") }))}
          activeId={unit.id} onSelect={id => move(units.findIndex(item => item.id === id))}
          badge={reviewMode ? undefined : item => units.find(unit => unit.id === item.id)!.photos.some(photo => finalIds.has(photo.id)) ? <span className="absolute right-0 top-0 bg-[var(--accent)] text-white"><Check size={14} /></span> : null} />
      </div>}
      <footer className="flex shrink-0 items-center justify-between gap-2 border-t px-3 pb-[max(12px,env(safe-area-inset-bottom))] pt-2">
        <button aria-label="이전 대표컷" className={button} disabled={index === 0} onClick={() => advance(-1)}><ChevronLeft size={18} /></button>
        <div className="text-center text-[12px] text-[var(--select-muted)]">{reviewMode ? "선택한 사진" : "대표컷"} {index + 1} / {units.length}{expanded && <p className="mt-1">유사컷 {photoIndex + 1} / {unit.photos.length}</p>}</div>
        <button aria-label="다음 대표컷" className={button} disabled={index === units.length - 1} onClick={() => advance(1)}><ChevronRight size={18} /></button>
      </footer>
    </div>
  </dialog>;
}
