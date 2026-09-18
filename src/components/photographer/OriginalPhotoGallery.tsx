"use client";

import { RecommendationMark } from "@/components/RecommendationMark";
import { SimilarityGroupBadge } from "@/components/ui/SimilarityGroupBadge";

import { cloneElement, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { AlertTriangle, Check, ChevronRight, EyeOff, ImageIcon, Loader2 } from "lucide-react";
import { PhotoCardComment } from "@/components/photographer/PhotoCardComment";
import { PhotoAssetPreview, PHOTO_ASSET_MEDIA_ASPECT_RATIO } from "./PhotoAssetPreview";
import { TruncatedTextTooltip } from "@/components/ui/TruncatedTextTooltip";
import { getPhotoDisplayFilename } from "@/lib/photo-display-filename";
import { useQueuedThumbSrc, type ThumbLoadQueue } from "@/lib/thumb-load-queue";
import type { Photo, PhotoGroupInfo } from "@/types";
import styles from "./OriginalPhotoGallery.module.css";
import { selectGridPhotos, type SelectionRect } from "@/lib/drag-selection";

export const PHOTO_GRID_MIN_CELL = 218;
export const PHOTO_GRID_GAP = 12;
export const PHOTO_GRID_MOBILE_PADDING_X = 12;
export const PHOTO_GRID_DESKTOP_PADDING_X = 40;
export const PHOTO_GRID_DESKTOP_BREAKPOINT = 768;
export const PHOTO_GRID_MEDIA_ASPECT_RATIO = PHOTO_ASSET_MEDIA_ASPECT_RATIO;
const LIST_ROW_HEIGHT = 58;
const MOBILE_MAPPING_ROW_METADATA_HEIGHT = 64;
const MOBILE_MAPPING_ROW_HORIZONTAL_SPACE = 40;

export type OriginalPhotoGalleryProps = {
  scrollRef: React.RefObject<HTMLDivElement | null>;
  photos: Photo[];
  viewMode: "grid" | "list";
  thumbQueue: ThumbLoadQueue;
  onPhotoClick: (index: number) => void;
  /** Activity로 DOM을 보존한 패널이 다시 노출될 때 숨김 상태의 열 수를 재사용하지 않는다. */
  active?: boolean;
  readonly?: boolean;
  minCols?: number;
  /** 특정 모바일 workspace에서만 강제할 최소 열 수와 간격. Desktop 공통 geometry는 유지한다. */
  mobileMinCols?: number;
  mobileGridGap?: number;
  /** 모바일 grid의 사진 영역을 정사각형으로 표시한다. */
  mobileSquareMedia?: boolean;
  /** 모바일 grid에서도 PC와 같은 이미지 상단 파일명 행을 유지한다. */
  showMobileFilename?: boolean;
  compact?: boolean;
  leadingCell?: React.ReactNode;
  groupsById?: Map<string, PhotoGroupInfo>;
  showSimilarityGroups?: boolean;
  expandedGroups?: Set<string>;
  onGroupBadgeClick?: (event: React.MouseEvent, groupId: string) => void;
  compressingPhotoId?: string | null;
  selectedPhotoIds?: Set<string>;
  onToggleSelected?: (photoId: string, options?: { range?: boolean }) => void;
  /** PC 갤러리 빈 공간에서 시작하는 범위 선택. */
  onDragSelectionChange?: (photoIds: Set<string>) => void;
  /** PC에서 카드 hover 시 작업 대상을 고르는 체크박스를 발견 가능하게 표시한다. */
  selectionOnHover?: boolean;
  recommendedPhotoIds?: Set<string>;
  selectionDisabled?: boolean;
  /** 모바일 사진 관리 모드. 켜지면 사진 탭이 상세보기가 아닌 선택 토글로 동작한다. */
  mobileManageMode?: boolean;
  /** 모바일에서 관리 모드 진입 전에도 사진 선택 체크박스를 표시한다. */
  mobileSelectionVisible?: boolean;
  /** 모바일에서 사진을 길게 눌러 관리 모드에 진입한다. */
  onPhotoLongPress?: (photoId: string) => void;
  allVisibleSelected?: boolean;
  someVisibleSelected?: boolean;
  onToggleAllVisible?: () => void;
  /** 같은 사진 골격에서 화면 목적에 맞는 metadata만 바꾼다. */
  /** 눈감음·흔들림 경고 배지를 사진 위에 표시한다(Gemini Flash 품질 판정, `Photo`에 실려 온다) */
  showQualityBadges?: boolean;
  /** 원본 포함 업로드 화면에서 미전송·실패 원본을 사진별로 표시한다. */
  showOriginalUploadBadges?: boolean;
  variant?: "original" | "selection" | "retouched" | "final";
  getSecondaryText?: (photo: Photo) => string;
  readableComments?: boolean;
  getRetouchedFilename?: (photo: Photo) => string;
  getRetouchedPhoto?: (photo: Photo) => Photo | null;
  renderMissingRetouched?: (photo: Photo) => ReactNode;
  getRetouchedStatus?: (photo: Photo) => ReactNode;
  getSelectionId?: (photo: Photo) => string | null;
  /** 업로드 중 임시 사진과 저장 완료 사진이 같은 카드로 이어질 때 사용할 안정적인 key. */
  getPhotoKey?: (photo: Photo, index: number) => string;
};

function fileName(photo: Photo, index: number) {
  return getPhotoDisplayFilename(photo, index);
}

function fileSize(bytes?: number | null) {
  if (!bytes) return "정보 없음";
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${Math.max(1, Math.round(bytes / 1024)).toLocaleString()} KB`;
}

function resolution(photo: Photo) {
  if (!photo.sourceWidth || !photo.sourceHeight) return "정보 없음";
  return `${photo.sourceWidth.toLocaleString()} × ${photo.sourceHeight.toLocaleString()}`;
}

function QueuedImage({ photo, scrollRef, thumbQueue }: { photo: Photo; scrollRef: React.RefObject<HTMLElement | null>; thumbQueue: ThumbLoadQueue }) {
  const [preview, setPreview] = useState({
    displayedUrl: photo.url,
    loadedUrl: undefined as string | undefined,
    transitionUrl: null as string | null,
    transitionReady: false,
  });
  const transitionTimerRef = useRef<number | null>(null);
  const { displayedUrl, loadedUrl, transitionUrl, transitionReady } = preview;
  const displayedLoaded = loadedUrl === displayedUrl;

  if (photo.url !== displayedUrl && photo.url !== transitionUrl) {
    setPreview((current) => ({ ...current, transitionUrl: photo.url, transitionReady: false }));
  }

  useEffect(() => () => {
    if (transitionTimerRef.current !== null) window.clearTimeout(transitionTimerRef.current);
  }, []);

  const { cellRef, imgRef, shouldLoad, handleLoad, handleError } = useQueuedThumbSrc(displayedUrl, {
    queue: thumbQueue,
    rootRef: scrollRef,
    bypass: photo.isPending,
  });
  return (
    <div ref={cellRef} className="absolute inset-0">
      {!displayedLoaded && !transitionReady ? <span className={styles.placeholder}><ImageIcon size={13} /></span> : null}
      {shouldLoad ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          ref={imgRef}
          data-photo-displayed-image
          src={displayedUrl}
          alt=""
          loading={photo.isPending ? "eager" : "lazy"}
          decoding="async"
          onLoad={() => { setPreview((current) => ({ ...current, loadedUrl: displayedUrl })); handleLoad(); }}
          onError={handleError}
          className={styles.image}
          style={{ opacity: displayedLoaded && !transitionReady ? 1 : 0, transition: "opacity 180ms ease-out, transform 180ms ease-out" }}
        />
      ) : null}
      {transitionUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={transitionUrl}
          data-photo-transition-image
          alt=""
          loading="eager"
          decoding="async"
          className={styles.image}
          style={{ zIndex: 1, opacity: transitionReady ? 1 : 0, transition: "opacity 180ms ease-out, transform 180ms ease-out" }}
          onLoad={() => {
            if (transitionReady) return;
            setPreview((current) => ({ ...current, transitionReady: true }));
            transitionTimerRef.current = window.setTimeout(() => {
              setPreview((current) => current.transitionUrl === transitionUrl
                ? { ...current, displayedUrl: transitionUrl, loadedUrl: transitionUrl, transitionUrl: null, transitionReady: false }
                : current);
              transitionTimerRef.current = null;
            }, 180);
          }}
          onError={() => setPreview((current) => current.transitionUrl === transitionUrl
            ? { ...current, transitionUrl: null, transitionReady: false }
            : current)}
        />
      ) : null}
    </div>
  );
}

function GridPhoto({ photo, index, props }: { photo: Photo; index: number; props: OriginalPhotoGalleryProps }) {
  const group = photo.similarityGroupId ? props.groupsById?.get(photo.similarityGroupId) : undefined;
  const representative = group?.representativePhotoId === photo.id;
  const expanded = Boolean(props.showSimilarityGroups && group && props.expandedGroups?.has(group.id));
  const selected = props.selectedPhotoIds?.has(photo.id) ?? false;
  const name = fileName(photo, index);
  const selectionVariant = props.variant === "selection";
  const secondaryText = props.getSecondaryText?.(photo)?.trim() ?? "";
  const originalMissing = props.showOriginalUploadBadges && !photo.isPending
    && (photo.originalStatus == null || photo.originalStatus === "awaiting_upload" || photo.originalStatus === "failed");
  const longPressTimerRef = useRef<number | null>(null);
  const longPressStartRef = useRef<{ x: number; y: number } | null>(null);
  const didLongPressRef = useRef(false);

  useEffect(() => () => {
    if (longPressTimerRef.current !== null) window.clearTimeout(longPressTimerRef.current);
  }, []);

  const clearLongPress = () => {
    if (longPressTimerRef.current !== null) window.clearTimeout(longPressTimerRef.current);
    longPressTimerRef.current = null;
    longPressStartRef.current = null;
  };

  const handlePointerDown = (event: React.PointerEvent<HTMLButtonElement>) => {
    didLongPressRef.current = false;
    if (!props.onPhotoLongPress || props.mobileManageMode || photo.isPending || event.button !== 0) return;
    longPressStartRef.current = { x: event.clientX, y: event.clientY };
    longPressTimerRef.current = window.setTimeout(() => {
      didLongPressRef.current = true;
      longPressTimerRef.current = null;
      longPressStartRef.current = null;
      props.onPhotoLongPress?.(photo.id);
    }, 450);
  };

  const handlePointerMove = (event: React.PointerEvent<HTMLButtonElement>) => {
    const start = longPressStartRef.current;
    if (!start) return;
    if (Math.hypot(event.clientX - start.x, event.clientY - start.y) > 10) clearLongPress();
  };

  const handlePhotoClick = (event: React.MouseEvent<HTMLButtonElement>) => {
    clearLongPress();
    if (didLongPressRef.current) {
      didLongPressRef.current = false;
      return;
    }
    if (photo.isPending) return;
    if (props.mobileManageMode) props.onToggleSelected?.(photo.id);
    else if (props.selectionOnHover && (event.shiftKey || event.metaKey || event.ctrlKey)) {
      props.onToggleSelected?.(photo.id, { range: event.shiftKey });
    }
    else props.onPhotoClick(index);
  };

  return (
    <article data-original-photo-card className={`${styles.gridCell} ${selectionVariant ? styles.gridCellSelection : ""} ${props.showMobileFilename ? styles.gridCellMobileFilename : ""} ${props.mobileSquareMedia ? styles.gridCellMobileSquare : ""} ${props.mobileManageMode ? styles.gridCellMobileManage : ""} ${props.mobileSelectionVisible ? styles.gridCellMobileSelectable : ""} ${selected ? styles.gridCellSelected : ""} ${expanded ? styles.gridCellExpanded : ""}`}>
      <PhotoAssetPreview filename={name} active={selected}
        header={selectionVariant ? undefined : !props.compact ? (
        <div data-original-photo-filename-row className={styles.nameRow}>
          {!props.readonly ? (
            <button type="button" className={styles.selectButton} aria-label={`${name} ${selected ? "선택 해제" : "선택"}`} aria-pressed={selected} disabled={photo.isPending} onClick={() => !photo.isPending && props.onToggleSelected?.(photo.id)}>
              {selected ? <Check size={13} strokeWidth={3} /> : null}
            </button>
          ) : null}
          <TruncatedTextTooltip text={name} className={styles.photoFilename} />
        </div>
        ) : null}
        mediaProps={{ "data-original-photo-media": true, className: `${styles.mediaButton} ${props.selectionOnHover ? styles.selectionOnHover : ""} ${expanded ? styles.groupMedia : props.showSimilarityGroups && representative && group && group.photoCount > 1 ? styles.groupStack : ""}` } as React.HTMLAttributes<HTMLDivElement>}
      >
        <QueuedImage photo={photo} scrollRef={props.scrollRef} thumbQueue={props.thumbQueue} />
        <button
          type="button"
          className={styles.imageHitArea}
          disabled={photo.isPending}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={clearLongPress}
          onPointerCancel={clearLongPress}
          onPointerLeave={clearLongPress}
          onClick={handlePhotoClick}
          aria-label={props.mobileManageMode ? `${name} ${selected ? "선택 해제" : "선택"}` : `${name} 상세 보기`}
          aria-pressed={props.mobileManageMode ? selected : undefined}
        />
        {props.selectionOnHover && !photo.isPending ? (
          <button type="button" className={styles.hoverSelectButton}
            aria-label={`${name} ${selected ? "선택 해제" : "선택"}`}
            aria-pressed={selected}
            onClick={(event) => { event.stopPropagation(); props.onToggleSelected?.(photo.id, { range: event.shiftKey }); }}>
            <span className={styles.hoverSelectFace}>{selected ? <Check strokeWidth={3} /> : null}</span>
          </button>
        ) : null}
        {props.mobileSelectionVisible && !photo.isPending ? (
          <button
            type="button"
            data-mobile-selection-checkbox
            className={styles.mobileSelectionCheckbox}
            aria-label={`${name} ${selected ? "선택 해제" : "선택"}`}
            aria-pressed={selected}
            onClick={(event) => {
              event.stopPropagation();
              if (props.mobileManageMode) props.onToggleSelected?.(photo.id);
              else props.onPhotoLongPress?.(photo.id);
            }}
          >
            <span className={styles.mobileSelectionFace}>{selected ? <Check size={13} strokeWidth={3} /> : null}</span>
          </button>
        ) : null}
        {photo.isUploading || props.compressingPhotoId === photo.id ? <span className="absolute right-2 top-2 z-[6] text-accent"><Loader2 size={16} className="animate-spin" /></span> : null}
        {(props.recommendedPhotoIds?.has(photo.id) ?? photo.photographerRecommended) ? (
          <span className={styles.recommendBadge} aria-label="작가 추천"><RecommendationMark size={12} aria-hidden /><span>작가 추천</span></span>
        ) : null}
        {(originalMissing || (props.showQualityBadges && (photo.isBlurry === true || (photo.faceDetected === true && photo.eyesClosed === true)))) ? (
          <span className={styles.statusBadges}>
            {originalMissing ? (
              <span className={styles.originalMissingBadge} title="납품용 원본 파일이 업로드되지 않았습니다.">
                <AlertTriangle size={11} aria-hidden />원본 누락
              </span>
            ) : null}
            {/* 눈감음·흔들림 경고는 원인이 다르므로 둘 다 해당하면 나란히 표시한다. */}
            {props.showQualityBadges && (photo.isBlurry === true || (photo.faceDetected === true && photo.eyesClosed === true)) ? <span className={styles.qualityBadges} aria-hidden>
              {photo.isBlurry === true ? <span className={styles.qualityBadge} title="흐림 의심 (흔들림 또는 초점)"><AlertTriangle size={12} /></span> : null}
              {photo.faceDetected === true && photo.eyesClosed === true ? <span className={styles.qualityBadge} title="눈 감음 의심"><EyeOff size={12} /></span> : null}
            </span> : null}
          </span>
        ) : null}
        {props.showSimilarityGroups && (representative || expanded) && group && group.photoCount > 1 ? (
          <SimilarityGroupBadge count={group.photoCount} expanded={expanded}
            label={`묶음 ${Array.from(props.groupsById!.keys()).indexOf(group.id) + 1}`}
            onClick={(event) => { event.stopPropagation(); props.onGroupBadgeClick?.(event, group.id); }} />
        ) : null}
      </PhotoAssetPreview>
      {selectionVariant && secondaryText ? <PhotoCardComment comment={secondaryText} compact={!props.readableComments} showLabel={props.readableComments} label="보정 요청" readable={props.readableComments} /> : null}
    </article>
  );
}

function GridGallery(props: OriginalPhotoGalleryProps) {
  // A long press can remove the leading upload cell. Its synthetic click may
  // therefore target a different photo; suppress at the stable gallery boundary.
  const suppressReleaseClick = useRef(false);
  const gridProps = { ...props, onPhotoLongPress: props.onPhotoLongPress ? (photoId: string) => {
    suppressReleaseClick.current = true;
    props.onPhotoLongPress?.(photoId);
  } : undefined };
  const paddingTop = props.compact ? 12 : 16;
  const paddingBottom = props.compact ? 24 : 32;
  const containerRef = useRef<HTMLDivElement>(null);
  const [layout, setLayout] = useState({
    cols: 4,
    rowHeight: 190,
    paddingX: props.compact ? 12 : PHOTO_GRID_MOBILE_PADDING_X,
    gap: PHOTO_GRID_GAP,
  });
  useLayoutEffect(() => {
    const container = containerRef.current;
    if (!container || props.active === false) return;
    const update = () => {
      const isMobile = container.clientWidth < PHOTO_GRID_DESKTOP_BREAKPOINT;
      const paddingX = props.compact
        ? 12
        : isMobile
          ? props.mobileSquareMedia ? 12 : PHOTO_GRID_MOBILE_PADDING_X
          : PHOTO_GRID_DESKTOP_PADDING_X;
      const width = container.clientWidth - paddingX * 2;
      if (width <= 0) return;
      const gap = isMobile ? props.mobileGridGap ?? PHOTO_GRID_GAP : PHOTO_GRID_GAP;
      const minCols = isMobile ? props.mobileMinCols ?? props.minCols ?? 1 : props.minCols ?? 1;
      const cols = Math.max(minCols, Math.floor((width + gap) / (PHOTO_GRID_MIN_CELL + gap)));
      const cellWidth = (width - gap * (cols - 1)) / cols;
      const mediaAspectRatio = props.compact || (isMobile && props.mobileSquareMedia)
        ? 1
        : PHOTO_GRID_MEDIA_ASPECT_RATIO;
      const mobileSquareChrome = isMobile && props.mobileSquareMedia
        ? props.compact ? 6 : props.showMobileFilename ? 22 : 6
        : null;
      const mediaWidth = mobileSquareChrome === null ? cellWidth : Math.max(0, cellWidth - 4);
      const metadataHeight = mobileSquareChrome ?? (props.compact
        ? 0
        : props.variant === "selection"
          ? isMobile ? 23 : 27
          : isMobile && !props.showMobileFilename
            ? 0
            : 38);
      const rowHeight = Math.ceil(mediaWidth / mediaAspectRatio + metadataHeight) + gap;
      setLayout((current) => current.cols === cols && current.rowHeight === rowHeight && current.paddingX === paddingX && current.gap === gap
        ? current
        : { cols, rowHeight, paddingX, gap });
    };
    // React Activity가 hidden 패널의 DOM과 layout state를 보존하므로, 패널이 다시
    // visible이 되는 같은 프레임에는 clientWidth가 이전 값이거나 0일 수 있다.
    // 표시 직후 두 프레임과 사이드바 전환 종료 뒤 다시 측정해 모든 탭의 열 수를 맞춘다.
    update();
    let secondFrame = 0;
    const firstFrame = window.requestAnimationFrame(() => {
      update();
      secondFrame = window.requestAnimationFrame(update);
    });
    const transitionTimer = window.setTimeout(update, 340);
    const observer = new ResizeObserver(update);
    observer.observe(container);
    const shellMain = container.closest("main[data-app-theme]");
    const handleShellTransitionEnd = (event: Event) => {
      if (event instanceof TransitionEvent && event.propertyName !== "margin-left") return;
      update();
    };
    shellMain?.addEventListener("transitionend", handleShellTransitionEnd);
    return () => {
      observer.disconnect();
      shellMain?.removeEventListener("transitionend", handleShellTransitionEnd);
      window.cancelAnimationFrame(firstFrame);
      if (secondFrame) window.cancelAnimationFrame(secondFrame);
      window.clearTimeout(transitionTimer);
    };
  }, [props.active, props.compact, props.minCols, props.mobileGridGap, props.mobileMinCols, props.mobileSquareMedia, props.showMobileFilename, props.variant]);

  const hasLeadingCell = Boolean(props.leadingCell);
  const [selectionRect, setSelectionRect] = useState<SelectionRect | null>(null);
  const dragSelectionRef = useRef({ selected: props.selectedPhotoIds, change: props.onDragSelectionChange });
  useEffect(() => {
    dragSelectionRef.current = { selected: props.selectedPhotoIds, change: props.onDragSelectionChange };
  });
  const dragEnabled = Boolean(props.onDragSelectionChange);
  useEffect(() => {
    const container = containerRef.current;
    const scroll = props.scrollRef.current;
    if (!dragEnabled || !container || !scroll) return;
    let drag: { x: number; y: number; clientX: number; clientY: number; base: Set<string>; previous: Set<string>; additive: boolean; active: boolean } | null = null;
    let frame = 0;
    const update = () => {
      if (!drag) return;
      const bounds = container.getBoundingClientRect();
      const x = Math.max(0, Math.min(container.clientWidth, drag.clientX - bounds.left));
      const y = Math.max(0, Math.min(container.scrollHeight, drag.clientY - bounds.top));
      if (!drag.active && Math.hypot(x - drag.x, y - drag.y) < 5) return;
      drag.active = true;
      suppressReleaseClick.current = true;
      const rect = { left: Math.min(x, drag.x), top: Math.min(y, drag.y), width: Math.abs(x - drag.x), height: Math.abs(y - drag.y) };
      setSelectionRect(rect);
      const selected = selectGridPhotos(props.photos, rect, {
        width: container.clientWidth, ...layout, paddingTop, leading: hasLeadingCell,
      }, drag.additive ? drag.base : []);
      dragSelectionRef.current.change?.(selected);
    };
    const tick = () => {
      if (!drag) return;
      const bounds = scroll.getBoundingClientRect();
      const edge = 48;
      const speed = drag.clientY < bounds.top + edge ? -Math.min(18, (bounds.top + edge - drag.clientY) / 3)
        : drag.clientY > bounds.bottom - edge ? Math.min(18, (drag.clientY - bounds.bottom + edge) / 3) : 0;
      if (speed && drag.active) { scroll.scrollTop += speed; update(); }
      frame = requestAnimationFrame(tick);
    };
    const down = (event: PointerEvent) => {
      if (event.pointerType !== "mouse" || event.button !== 0 || !(event.target instanceof Element)
        || event.target.closest("article, button, input, select, a")) return;
      const bounds = container.getBoundingClientRect();
      const previous = new Set(dragSelectionRef.current.selected);
      drag = { x: event.clientX - bounds.left, y: event.clientY - bounds.top, clientX: event.clientX, clientY: event.clientY,
        base: previous, previous, additive: event.metaKey || event.ctrlKey || event.shiftKey, active: false };
      event.preventDefault();
      frame = requestAnimationFrame(tick);
    };
    const move = (event: PointerEvent) => {
      if (!drag) return;
      drag.clientX = event.clientX; drag.clientY = event.clientY;
      update();
    };
    const stop = (clearOnClick = true) => {
      if (clearOnClick && drag && !drag.active) dragSelectionRef.current.change?.(new Set());
      drag = null; cancelAnimationFrame(frame); setSelectionRect(null);
    };
    const cancel = () => { if (drag) dragSelectionRef.current.change?.(drag.previous); stop(false); };
    const key = (event: KeyboardEvent) => { if (event.key === "Escape" && drag) { event.preventDefault(); cancel(); } };
    container.addEventListener("pointerdown", down);
    window.addEventListener("pointermove", move);
    const up = () => stop();
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", cancel);
    window.addEventListener("blur", cancel);
    window.addEventListener("keydown", key);
    return () => {
      cancelAnimationFrame(frame);
      container.removeEventListener("pointerdown", down);
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", cancel);
      window.removeEventListener("blur", cancel);
      window.removeEventListener("keydown", key);
    };
  }, [dragEnabled, props.photos, props.scrollRef, layout, hasLeadingCell, paddingTop]);
  const cellCount = props.photos.length + (hasLeadingCell ? 1 : 0);
  const selectionRowLayoutKey = props.variant === "selection"
    ? props.photos
        .map((photo) => `${photo.id}:${props.getSecondaryText?.(photo)?.trim() ? "1" : "0"}`)
        .join("|")
    : "";
  const rowHasSelectionComment = (rowIndex: number) => {
    if (props.variant !== "selection") return false;
    const firstCellIndex = rowIndex * layout.cols;
    for (let column = 0; column < layout.cols; column++) {
      const cellIndex = firstCellIndex + column;
      if (cellIndex >= cellCount) break;
      if (hasLeadingCell && cellIndex === 0) continue;
      const photoIndex = hasLeadingCell ? cellIndex - 1 : cellIndex;
      const photo = props.photos[photoIndex];
      if (photo && props.getSecondaryText?.(photo)?.trim()) return true;
    }
    return false;
  };
  const virtualizer = useVirtualizer({
    count: Math.ceil(cellCount / layout.cols),
    getScrollElement: () => props.scrollRef.current,
    estimateSize: (rowIndex) => layout.rowHeight + (rowHasSelectionComment(rowIndex) ? props.readableComments ? 76 : 32 : 0),
    overscan: 2,
  });
  useEffect(() => {
    virtualizer.measure();
    // TanStack Virtual은 렌더마다 인스턴스 참조가 바뀔 수 있어 행 높이 변화만 추적한다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasLeadingCell, layout.cols, layout.rowHeight, props.readableComments, selectionRowLayoutKey]);

  return (
    <div
      ref={containerRef}
      onPointerDownCapture={() => { suppressReleaseClick.current = false; }}
      onClickCapture={(event) => {
        if (!suppressReleaseClick.current) return;
        suppressReleaseClick.current = false;
        event.preventDefault();
        event.stopPropagation();
      }}
      data-photo-gallery-variant={props.variant ?? "original"}
      data-selection-active={props.selectionOnHover && (props.selectedPhotoIds?.size ?? 0) > 0 ? "true" : undefined}
      className={`${styles.galleryGrid} ${props.variant === "selection" ? styles.selectionGrid : ""}`}
      style={{ position: "relative", minHeight: "100%", userSelect: dragEnabled ? "none" : undefined, width: "100%", padding: `${paddingTop}px ${layout.paddingX}px ${paddingBottom}px` }}
    >
      {selectionRect && dragEnabled ? <div aria-hidden style={{ position: "absolute", ...selectionRect, zIndex: 20, pointerEvents: "none", border: "1px solid var(--accent)", background: "rgba(var(--accent-rgb), .12)" }} /> : null}
      <div style={{ position: "relative", height: virtualizer.getTotalSize() }}>
        {virtualizer.getVirtualItems().map((row) => {
          const cells: React.ReactNode[] = [];
          for (let column = 0; column < layout.cols; column++) {
            const cellIndex = row.index * layout.cols + column;
            if (cellIndex >= cellCount) break;
            if (hasLeadingCell && cellIndex === 0) {
              cells.push(cloneElement(props.leadingCell as React.ReactElement, { key: "leading-cell" }));
              continue;
            }
            const photoIndex = hasLeadingCell ? cellIndex - 1 : cellIndex;
            const photo = props.photos[photoIndex];
            if (photo) cells.push(<GridPhoto key={props.getPhotoKey?.(photo, photoIndex) ?? photo.id} photo={photo} index={photoIndex} props={gridProps} />);
          }
          return <div key={row.key} data-original-photo-row style={{ position: "absolute", top: 0, left: 0, display: "grid", width: "100%", height: row.size, gridTemplateColumns: `repeat(${layout.cols}, minmax(0, 1fr))`, gap: layout.gap, transform: `translateY(${row.start}px)`, overflow: "hidden" }}>{cells}</div>;
        })}
      </div>
    </div>
  );
}

function ListGallery(props: OriginalPhotoGalleryProps) {
  const bodyRef = useRef<HTMLDivElement>(null);
  const [scrollMargin, setScrollMargin] = useState(0);
  const retouchedVariant = props.variant === "retouched";
  const [mobileRetouchedList, setMobileRetouchedList] = useState(false);
  const [mobileMediaHeight, setMobileMediaHeight] = useState(140 / PHOTO_GRID_MEDIA_ASPECT_RATIO);

  useEffect(() => {
    if (!retouchedVariant) return;
    const query = window.matchMedia("(max-width: 767px)");
    const sync = () => setMobileRetouchedList(query.matches);
    sync();
    query.addEventListener("change", sync);
    return () => query.removeEventListener("change", sync);
  }, [retouchedVariant]);

  useLayoutEffect(() => {
    const body = bodyRef.current;
    const scrollElement = props.scrollRef.current;
    if (!body || !scrollElement) return;
    const update = () => {
      // Two equal columns: row padding 12px each side and a 16px gap.
      if (body.clientWidth > 0) setMobileMediaHeight(Math.floor((body.clientWidth - MOBILE_MAPPING_ROW_HORIZONTAL_SPACE) / 2 / PHOTO_GRID_MEDIA_ASPECT_RATIO));
      const bodyTop = body.getBoundingClientRect().top;
      const scrollTop = scrollElement.getBoundingClientRect().top;
      const nextMargin = bodyTop - scrollTop + scrollElement.scrollTop;
      setScrollMargin((current) => Math.abs(current - nextMargin) < 0.5 ? current : nextMargin);
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(body);
    observer.observe(scrollElement);
    return () => observer.disconnect();
  }, [props.scrollRef]);

  const virtualizer = useVirtualizer({
    count: props.photos.length,
    getScrollElement: () => props.scrollRef.current,
    estimateSize: () => retouchedVariant && mobileRetouchedList ? mobileMediaHeight + MOBILE_MAPPING_ROW_METADATA_HEIGHT + 80 : LIST_ROW_HEIGHT,
    overscan: 8,
    scrollMargin,
  });
  useEffect(() => {
    virtualizer.measure();
    // A width change can reset cached sizes after WebKit's ResizeObserver fired.
    // Remeasure mounted rows immediately instead of waiting for another resize.
    if (mobileRetouchedList) {
      bodyRef.current?.querySelectorAll<HTMLElement>("[data-index]").forEach((element) => virtualizer.measureElement(element));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mobileMediaHeight, mobileRetouchedList, retouchedVariant, scrollMargin]);

  const readonlyClass = props.readonly && !props.selectionOnHover ? styles.listReadonly : "";
  const selectionVariant = props.variant === "selection";
  const finalVariant = props.variant === "final";
  const listVariantClass = selectionVariant
    ? styles.listSelection
    : retouchedVariant
      ? styles.listRetouched
      : finalVariant
        ? styles.listFinal
      : "";
  return (
    <div data-original-photo-list data-selection-active={props.selectionOnHover && (props.selectedPhotoIds?.size ?? 0) > 0 ? "true" : undefined} className={`${styles.listShell} ${selectionVariant ? styles.listShellSelection : ""} ${retouchedVariant ? styles.listShellRetouched : ""} ${props.mobileSelectionVisible ? styles.listShellMobileSelectable : ""}`}>
      <div className={styles.listTable} role="table" aria-label={selectionVariant ? "고객 셀렉 사진 목록" : finalVariant ? "최종본 사진 목록" : retouchedVariant ? "보정본 사진 목록" : "원본 사진 목록"}>
        <div className={`${styles.listHeader} ${readonlyClass} ${listVariantClass}`} role="row">
          {mobileRetouchedList ? <>
            <span role="columnheader">원본</span>
            <span role="columnheader" className={styles.mobileRetouchedColumnHeader}>
              {!props.readonly && props.onToggleAllVisible ? (
                <button
                  type="button"
                  role="checkbox"
                  aria-label="현재 목록 보정본 전체 선택"
                  aria-checked={props.allVisibleSelected ? true : props.someVisibleSelected ? "mixed" : false}
                  disabled={props.selectionDisabled}
                  className={styles.mobileColumnSelectAll}
                  onClick={props.onToggleAllVisible}
                >
                  <span>
                    {props.allVisibleSelected ? <Check size={12} strokeWidth={3} /> : props.someVisibleSelected ? <span className={styles.mobileColumnSelectMixed} /> : null}
                  </span>
                </button>
              ) : null}
              <span data-mobile-retouched-column-label>보정본</span>
            </span>
          </> : finalVariant ? <><span role="columnheader">사진</span><span role="columnheader">파일명</span></> : selectionVariant ? <><span role="columnheader">사진</span><span role="columnheader">파일명</span><span role="columnheader">고객 코멘트</span></> : <>
            {!props.readonly ? <button type="button" className={styles.selectButton} onClick={props.onToggleAllVisible} aria-label={props.allVisibleSelected ? "전체 선택 해제" : "전체 선택"} aria-pressed={props.allVisibleSelected} disabled={props.selectionDisabled}>{props.allVisibleSelected ? <Check size={13} strokeWidth={3} /> : null}</button> : props.selectionOnHover || props.mobileSelectionVisible ? <span aria-hidden /> : null}
            {retouchedVariant ? <><span role="columnheader">원본</span><span role="columnheader">보정본</span><span role="columnheader">상태</span><span role="columnheader">재보정 요청</span></> : <><span role="columnheader">파일명</span><span className={styles.listNumericHeader} role="columnheader">원본 용량</span><span className={styles.listNumericHeader} role="columnheader">해상도</span></>}
          </>}
        </div>
        <div ref={bodyRef} className={styles.listBody} style={{ height: virtualizer.getTotalSize() }}>
          {virtualizer.getVirtualItems().map((row) => {
            const photo = props.photos[row.index];
            const selectionId = props.getSelectionId ? props.getSelectionId(photo) : photo.id;
            const selected = selectionId ? (props.selectedPhotoIds?.has(selectionId) ?? false) : false;
            const name = fileName(photo, row.index);
            const group = photo.similarityGroupId ? props.groupsById?.get(photo.similarityGroupId) : undefined;
            const secondaryText = props.getSecondaryText?.(photo)?.trim() ?? "";
            const originalMissing = props.showOriginalUploadBadges && !photo.isPending
              && (photo.originalStatus == null || photo.originalStatus === "awaiting_upload" || photo.originalStatus === "failed");
            const retouchedPhoto = retouchedVariant ? props.getRetouchedPhoto?.(photo) : null;
            const finalPhoto = finalVariant ? props.getRetouchedPhoto?.(photo) : null;
            const retouchedFilename = retouchedVariant || finalVariant ? (props.getRetouchedFilename?.(photo) || "") : "";
            const photoKey = props.getPhotoKey?.(photo, row.index) ?? photo.id;
            if (mobileRetouchedList) return (
              <div key={photoKey} ref={virtualizer.measureElement} data-index={row.index} data-original-photo-list-row data-retouched-mapping-row="true" role="row" className={styles.mobileMappingRow}
                style={{ position: "absolute", top: 0, left: 0, width: "100%", transform: `translateY(${row.start - scrollMargin}px)`, "--mapping-media-height": `${mobileMediaHeight}px` } as React.CSSProperties}>
                <div role="cell" className={styles.mobileMappingCell}>
                  <PhotoAssetPreview filename={name} mediaProps={{ className: styles.mobileMappingMedia }}>
                  <button type="button" data-original-photo-list-thumbnail className={styles.mobileMappingImageButton} onClick={() => props.onPhotoClick(row.index)} aria-label={`${name} ${retouchedPhoto ? "원본·보정본 비교" : "상세 보기"}`}>
                    <QueuedImage photo={photo} scrollRef={props.scrollRef} thumbQueue={props.thumbQueue} />
                  </button>
                  </PhotoAssetPreview>
                </div>
                <div role="cell" className={styles.mobileMappingCell}>
                  <PhotoAssetPreview filename={retouchedFilename || "보정본을 추가해주세요"} active={selected} mediaProps={{ className: styles.mobileMappingMedia }}>
                    {retouchedPhoto ? <button type="button" data-original-photo-list-thumbnail onClick={() => props.onPhotoClick(row.index)} aria-label={`${retouchedFilename || "보정본"} 원본·보정본 비교`} className={styles.mobileMappingImageButton}>
                      <QueuedImage photo={retouchedPhoto} scrollRef={props.scrollRef} thumbQueue={props.thumbQueue} />
                    </button> : props.renderMissingRetouched?.(photo)}
                    {props.mobileManageMode && !props.readonly && selectionId ? <button type="button" className={styles.mobileMappingSelect} aria-label={`${retouchedFilename || name} ${selected ? "선택 해제" : "선택"}`} aria-pressed={selected} disabled={props.selectionDisabled} onClick={() => props.onToggleSelected?.(selectionId)}>
                      <span>{selected ? <Check size={14} /> : null}</span>
                    </button> : null}
                  </PhotoAssetPreview>
                </div>
                <ChevronRight data-mobile-mapping-arrow className={styles.mobileMappingArrow} size={16} strokeWidth={1.8} aria-hidden />
                {secondaryText ? <div role="cell" data-mobile-retouched-comments className={styles.mobileMappingComments}>
                  <PhotoCardComment comment={secondaryText} label="재보정 요청" truncate={false} />
                </div> : null}
              </div>
            );
            return (
              <div key={photoKey} style={{ position: "absolute", top: 0, left: 0, width: "100%", height: row.size, transform: `translateY(${row.start - scrollMargin}px)` }}>
                <div data-original-photo-list-row data-retouched-mapping-row={retouchedVariant ? "true" : undefined} className={`${styles.listRow} ${readonlyClass} ${listVariantClass} ${selected ? styles.listRowSelected : ""}`} role="row">
                  {finalVariant ? <>
                    <button data-original-photo-list-thumbnail type="button" className={styles.listThumbnail} onClick={() => props.onPhotoClick(row.index)} aria-label={`${retouchedFilename || name} 상세 보기`}>
                      <QueuedImage photo={finalPhoto ?? photo} scrollRef={props.scrollRef} thumbQueue={props.thumbQueue} />
                    </button>
                    <TruncatedTextTooltip text={retouchedFilename || name} className={styles.listFilename} />
                  </> : selectionVariant ? <>
                    <button data-original-photo-list-thumbnail type="button" className={styles.listThumbnail} onClick={() => props.onPhotoClick(row.index)} aria-label={`${name} 상세 보기`}><QueuedImage photo={photo} scrollRef={props.scrollRef} thumbQueue={props.thumbQueue} /></button>
                    <TruncatedTextTooltip text={name} className={styles.listFilename} />
                    {secondaryText ? <TruncatedTextTooltip text={secondaryText} className={`${styles.listComment} ${styles.listCommentActive}`} /> : <span className={styles.listComment} aria-hidden />}
                  </> : <>
                    {!props.readonly || props.selectionOnHover || props.mobileSelectionVisible ? <button type="button" className={`${styles.selectButton} ${props.selectionOnHover ? styles.hoverListSelectButton : ""}`} aria-label={`${name} ${selected ? "선택 해제" : "선택"}`} aria-pressed={selected} disabled={!selectionId} onClick={(event) => {
                      if (!selectionId) return;
                      if (props.mobileSelectionVisible && !props.mobileManageMode) props.onPhotoLongPress?.(selectionId);
                      else props.onToggleSelected?.(selectionId, { range: event.shiftKey });
                    }}>{selected ? <Check size={13} strokeWidth={3} /> : null}</button> : null}
                    <div className={styles.listFile} role="cell">
                      <button data-original-photo-list-thumbnail type="button" className={styles.listThumbnail} onClick={(event) => props.selectionOnHover && (event.shiftKey || event.metaKey || event.ctrlKey) ? props.onToggleSelected?.(photo.id, { range: event.shiftKey }) : props.onPhotoClick(row.index)} aria-label={`${name} 상세 보기`}><QueuedImage photo={photo} scrollRef={props.scrollRef} thumbQueue={props.thumbQueue} /></button>
                      <TruncatedTextTooltip text={name} className={styles.listFilename} />
                      {originalMissing ? <span className={styles.listOriginalMissingBadge}><AlertTriangle size={11} aria-hidden />원본 누락</span> : null}
                      {(props.recommendedPhotoIds?.has(photo.id) ?? photo.photographerRecommended) ? (
                        <span className={styles.listRecommendBadge}><RecommendationMark size={12} aria-hidden />작가 추천</span>
                      ) : null}
                      {props.showSimilarityGroups && group && group.photoCount > 1 ? <SimilarityGroupBadge inline count={group.photoCount} expanded={Boolean(props.expandedGroups?.has(group.id))} onClick={(event) => { event.stopPropagation(); props.onGroupBadgeClick?.(event, group.id); }} /> : null}
                    </div>
                    {retouchedVariant ? <>
                      <div className={styles.listFile} role="cell">
                        {retouchedPhoto ? (
                          <button data-original-photo-list-thumbnail type="button" className={styles.listThumbnail} onClick={() => props.onPhotoClick(row.index)} aria-label={`${retouchedFilename || "보정본"} 상세 보기`}>
                            <QueuedImage photo={retouchedPhoto} scrollRef={props.scrollRef} thumbQueue={props.thumbQueue} />
                          </button>
                        ) : mobileRetouchedList && props.renderMissingRetouched ? props.renderMissingRetouched(photo) : <span className={`${styles.listThumbnail} ${styles.listThumbnailEmpty}`} aria-hidden><ImageIcon size={13} /></span>}
                        {retouchedPhoto || !mobileRetouchedList || !props.renderMissingRetouched ? <TruncatedTextTooltip text={retouchedFilename || "—"} className={`${styles.listFilename} ${retouchedFilename ? "" : styles.listValueEmpty}`} /> : null}
                      </div>
                      <span className={styles.listStatus} role="cell">{props.getRetouchedStatus?.(photo)}</span>
                      {secondaryText ? <TruncatedTextTooltip text={secondaryText} className={`${styles.listComment} ${styles.listCommentActive}`} /> : <span className={styles.listComment}>—</span>}
                    </> : <>
                      <span className={`${styles.listValue} ${photo.sourceFileSize ? "" : styles.listValueEmpty}`} role="cell">{fileSize(photo.sourceFileSize)}</span>
                      <span className={`${styles.listValue} ${photo.sourceWidth && photo.sourceHeight ? "" : styles.listValueEmpty}`} role="cell">{resolution(photo)}</span>
                    </>}
                  </>}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

export function OriginalPhotoGallery(props: OriginalPhotoGalleryProps) {
  return props.viewMode === "grid" ? <GridGallery {...props} /> : <ListGallery {...props} />;
}

/** 업로드·원본·셀렉 결과가 공유하는 사진 gallery implementation. */
export const PhotographerPhotoGallery = OriginalPhotoGallery;
