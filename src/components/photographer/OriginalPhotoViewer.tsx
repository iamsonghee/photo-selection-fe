"use client";

import { useCallback, useEffect, useId, useMemo, useRef, useState, type ReactNode } from "react";
import { useDesktopViewport } from "@/hooks/useDesktopViewport";
import { useDialogAccessibility } from "@/hooks/useDialogAccessibility";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { BrandLogoBar } from "@/components/BrandLogo";
import { MobileViewerPinchPhoto } from "@/components/MobileViewerPinchPhoto";
import { PrevNextButton } from "@/components/PrevNextButton";
import { ViewerCommentPanel } from "@/components/photographer/ViewerCommentPanel";
import { getPhotoDisplayFilename } from "@/lib/photo-display-filename";
import { useAdjacentImagePreload } from "@/lib/use-adjacent-image-preload";
import { viewerImageUrl } from "@/lib/viewer-image-url";
import { hasShortcutModifier } from "@/lib/keyboard-shortcut-guard";
import { useHoldPreview } from "@/hooks/useHoldPreview";
import type { Photo } from "@/types";
import styles from "./OriginalPhotoViewer.module.css";

type OriginalPhotoViewerProps = {
  photos: Photo[];
  activeIndex: number;
  onActiveIndexChange: (index: number) => void;
  onClose: () => void;
  onPrevious?: () => void;
  onNext?: () => void;
  reviewMode?: boolean;
  reviewBar?: ReactNode;
  headerControls?: ReactNode;
  comparisonPhotos?: Photo[];
  holdPreviewPhotos?: Photo[];
  holdPreviewLabel?: string;
  activeImageLabel?: string;
  activeStatusLabel?: string;
  comparisonImageLabel?: string;
  inspector?: ReactNode;
  mobileView?: { mode: "original" | "retouched" | "compare"; onChange: (mode: "original" | "retouched" | "compare") => void; missingRetouched: boolean };
  mobileDetailLayout?: boolean;
  mobileComments?: { label: string; text: string }[];
  mobileCommentsHeading?: string;
  mobileMissingRetouched?: boolean[];
  showGroupShortcut?: boolean;
  canToggleGroup?: boolean;
  onToggleGroup?: () => void;
  renderThumbnailOverlay?: (photo: Photo, index: number, active: boolean) => ReactNode;
  getThumbnailAriaLabel?: (photo: Photo, index: number, active: boolean) => string;
  onThumbnailClick?: (photo: Photo, index: number) => void;
};

function filename(photo: Photo, index: number) {
  return getPhotoDisplayFilename(photo, index);
}

export function OriginalPhotoViewer({
  photos,
  activeIndex,
  onActiveIndexChange,
  onClose,
  onPrevious,
  onNext,
  reviewMode = false,
  reviewBar,
  headerControls,
  comparisonPhotos,
  holdPreviewPhotos,
  holdPreviewLabel = "원본 미리보기",
  activeImageLabel,
  activeStatusLabel,
  comparisonImageLabel,
  inspector,
  mobileView,
  mobileDetailLayout = false,
  mobileComments = [],
  mobileCommentsHeading = "고객 코멘트",
  mobileMissingRetouched = [],
  showGroupShortcut = false,
  canToggleGroup = false,
  onToggleGroup,
  renderThumbnailOverlay,
  getThumbnailAriaLabel,
  onThumbnailClick,
}: OriginalPhotoViewerProps) {
  const desktop = useDesktopViewport();
  const [keyboardNavigation, setKeyboardNavigation] = useState(true);
  const [focused, setFocused] = useState(false);
  const stageRef = useRef<HTMLDivElement>(null);
  const usesMobileDetailLayout = Boolean(mobileView || mobileDetailLayout);
  const mobileEnabled = Boolean(usesMobileDetailLayout && !desktop);
  const [helpOpen, setHelpOpen] = useState(false);
  const zoomedRef = useRef(false);
  const onZoomChange = useCallback((zoomed: boolean) => { zoomedRef.current = zoomed; }, []);
  const swipeRef = useRef<{ x: number; y: number; blocked: boolean } | null>(null);
  const [showShortcutHint, setShowShortcutHint] = useState(false);
  const filmstripRef = useRef<HTMLDivElement>(null);
  const helpId = useId();
  const activePhoto = photos[activeIndex];
  const showMissingRetouched = mobileEnabled && mobileView?.mode !== "original" && mobileView?.missingRetouched;
  const comparisonPhoto = mobileEnabled || focused ? undefined : comparisonPhotos?.[activeIndex];
  const holdPreviewPhoto = holdPreviewPhotos?.[activeIndex];
  const canHoldPreview = Boolean(holdPreviewPhoto && !comparisonPhoto);
  const [previewReady, setPreviewReady] = useState<string | null>(null);
  const [hasCompared, setHasCompared] = useState(false);
  const previewUrl = holdPreviewPhoto ? viewerImageUrl(holdPreviewPhoto) : undefined;
  const {
    previewActive: holdingPreview,
    consumedRef: consumedHold,
    isConsumed,
    beginHold,
    moveHold,
    endHold,
    cancelHold,
    showPreview,
    hidePreview,
  } = useHoldPreview({
    enabled: Boolean(canHoldPreview && previewReady === previewUrl && !showMissingRetouched),
    resetKey: `${activePhoto?.id ?? ""}:${previewUrl ?? ""}`,
    /* 실제 이미지가 click target으로 남아야 V1/V2에서도 집중 보기를 열 수 있다. */
    captureTarget: "eventTarget",
    onActivated: () => setHasCompared(true),
  });
  const suppressTap = isConsumed;
  const toggleFocus = useCallback(() => { if (!isConsumed()) setFocused((value) => !value); }, [isConsumed]);
  const previewVisible = holdingPreview && canHoldPreview && previewReady === previewUrl;
  useEffect(() => {
    if (!previewUrl) return;
    let cancelled = false;
    const image = new Image();
    image.src = previewUrl;
    image.decode().then(() => { if (!cancelled) setPreviewReady(previewUrl); }).catch(() => {});
    return () => { cancelled = true; cancelHold(); };
  }, [previewUrl, activePhoto?.id, cancelHold]);
  // 사진 옆 여백에 버튼이 들어갈 수 있으면 여백 중앙에 두고,
  // 여백이 버튼보다 좁을 때만 사진 가장자리 위로 겹친다.
  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;
    const measure = () => {
      const img = stage.querySelector("img");
      if (!img?.naturalWidth || !img.naturalHeight) return;
      const width = stage.clientWidth - 16;
      const height = stage.clientHeight - 16;
      const photoWidth = comparisonPhoto ? width : Math.min(width, height * img.naturalWidth / img.naturalHeight);
      const sideGutter = Math.max(0, (stage.clientWidth - photoWidth) / 2);
      const buttonSize = window.innerWidth < 768 ? 44 : 74;
      const hasOutsideRoom = sideGutter >= buttonSize + 12;
      const buttonInset = hasOutsideRoom
        ? Math.max(8, (sideGutter - buttonSize) / 2)
        : Math.max(8, sideGutter + 8);
      stage.dataset.navigationOverlay = hasOutsideRoom ? "false" : "true";
      stage.style.setProperty("--viewer-photo-inset", `${buttonInset}px`);
    };
    const observer = new ResizeObserver(measure);
    observer.observe(stage);
    stage.addEventListener("load", measure, true);
    measure();
    return () => { observer.disconnect(); stage.removeEventListener("load", measure, true); };
  }, [activePhoto?.id, focused, comparisonPhoto]);
  const imageGroups = useMemo(
    () => photos.map((photo, index) => [
      viewerImageUrl(photo),
      ...(comparisonPhotos?.[index] ? [viewerImageUrl(comparisonPhotos[index])] : []),
      ...(holdPreviewPhotos?.[index] ? [viewerImageUrl(holdPreviewPhotos[index])] : []),
    ]),
    [comparisonPhotos, holdPreviewPhotos, photos],
  );

  useAdjacentImagePreload(imageGroups, activeIndex, {
    wrap: true,
    desktopBefore: 1,
    desktopAfter: 2,
    desktopMaxDecoded: 6,
    mobileMaxDecoded: 3,
  });

  const previous = () => {
    if (onPrevious) onPrevious();
    else onActiveIndexChange(activeIndex > 0 ? activeIndex - 1 : photos.length - 1);
  };
  const next = () => {
    if (onNext) onNext();
    else onActiveIndexChange(activeIndex < photos.length - 1 ? activeIndex + 1 : 0);
  };

  useEffect(() => {
    if (!activePhoto) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.isContentEditable || target?.matches("input, textarea, select")) return;
      if (!dialogRef.current?.contains(document.activeElement)) return;
      /* Cmd/Ctrl+G(다음 찾기), 윈도우 Alt+←/→(뒤로/앞으로 가기)와 겹치지 않게 막는다 */
      if (hasShortcutModifier(event)) return;
      if (event.key === "ArrowLeft") {
        event.preventDefault();
        previous();
      } else if (event.key === "ArrowRight") {
        event.preventDefault();
        next();
      } else if (event.code === "KeyG" && onToggleGroup && (reviewMode || canToggleGroup)) {
        event.preventDefault();
        onToggleGroup();
      } else if (event.code === "Backslash" && canHoldPreview) {
        event.preventDefault();
        showPreview();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  });

  useEffect(() => {
    const handleKeyUp = (event: KeyboardEvent) => {
      if (event.code !== "Backslash") return;
      hidePreview();
    };
    window.addEventListener("keyup", handleKeyUp);
    return () => {
      window.removeEventListener("keyup", handleKeyUp);
    };
  }, [hidePreview]);

  useEffect(() => {
    if (!activePhoto) return;
    const storageKey = "acut-photo-viewer-shortcuts-seen-v2";
    let alreadySeen = false;
    try { alreadySeen = window.sessionStorage.getItem(storageKey) === "true"; } catch {}
    if (alreadySeen) return;
    try { window.sessionStorage.setItem(storageKey, "true"); } catch {}
    const showTimer = window.setTimeout(() => setShowShortcutHint(true), 0);
    const hideTimer = window.setTimeout(() => setShowShortcutHint(false), 3000);
    return () => {
      window.clearTimeout(showTimer);
      window.clearTimeout(hideTimer);
    };
  }, [activePhoto]);

  useEffect(() => {
    const active = filmstripRef.current?.querySelector<HTMLElement>('[data-active="true"]');
    active?.scrollIntoView({ block: "nearest", inline: "center", behavior: "smooth" });
  }, [activeIndex, photos]);

  useEffect(() => {
    const scrollRegion = document.querySelector<HTMLElement>(
      '[data-original-photo-viewer] [data-inspector-scroll="true"]',
    );
    if (scrollRegion) scrollRegion.scrollTop = 0;
  }, [activePhoto?.id, inspector]);

  const dialogRef = useRef<HTMLDivElement>(null);
  useDialogAccessibility({ open: Boolean(activePhoto), rootRef: dialogRef, onClose: () => {
    if (focused) setFocused(false);
    else if (helpOpen) setHelpOpen(false);
    else if (reviewMode && onToggleGroup) onToggleGroup();
    else onClose();
  } });

  if (!activePhoto || typeof document === "undefined" || !document.body) return null;

  const activeFilename = filename(activePhoto, activeIndex);
  const renderedPhoto = activePhoto;
  return createPortal(
    <div ref={dialogRef} tabIndex={-1} role="dialog" aria-modal="true" aria-label={`${activeFilename} 상세 보기`} className={styles.root} data-keyboard-navigation={keyboardNavigation} onPointerDownCapture={() => setKeyboardNavigation(false)} onKeyDownCapture={() => setKeyboardNavigation(true)} onClick={() => focused ? setFocused(false) : onClose()} data-focused={focused ? "true" : undefined} data-mobile-focus={mobileEnabled && focused ? "true" : undefined} data-mobile-details={usesMobileDetailLayout ? "true" : undefined} data-original-photo-viewer>
      <header className={styles.header} onClick={(event) => event.stopPropagation()}>
        <button type="button" onClick={onClose} className={styles.close} aria-label="사진 상세 보기 닫기">
          <X size={15} strokeWidth={1.7} aria-hidden />
        </button>
        <div className={styles.filename} title={activeFilename}>{activeFilename}</div>
        {headerControls ? <div className={styles.headerControls}>{headerControls}</div> : null}
        <div className={styles.counter} aria-label={`${photos.length}장 중 ${activeIndex + 1}번째 사진`}>
          <strong>{(activeIndex + 1).toLocaleString()}</strong><span>/</span><span>{photos.length.toLocaleString()}</span>
        </div>
        <button
          type="button"
          className={styles.helpButton}
          aria-label="사진 뷰어 단축키"
          aria-expanded={helpOpen}
          aria-controls={helpId}
          onClick={() => { setShowShortcutHint(false); setHelpOpen((open) => !open); }}
        >
          단축키
        </button>
      </header>



      {helpOpen ? (
        <aside id={helpId} className={styles.shortcutPopover} onClick={(event) => event.stopPropagation()}>
          <strong>키보드 단축키</strong>
          <dl className={styles.shortcutList}>
            <div><dt><kbd>←</kbd><kbd>→</kbd></dt><dd>{reviewMode ? "유사컷 이동" : "사진 이동"}</dd></div>
            {canHoldPreview ? <div><dt><kbd>{"\\"}</kbd></dt><dd>누르는 동안 원본</dd></div> : null}
            {showGroupShortcut ? <div><dt><kbd>G</kbd></dt><dd>{reviewMode ? "전체 사진" : "유사컷 보기"}</dd></div> : null}
            <div><dt><kbd>ESC</kbd></dt><dd>{reviewMode ? "전체 사진" : "뷰어 닫기"}</dd></div>
          </dl>
        </aside>
      ) : null}

      <div className={`${styles.workspace} ${inspector ? styles.workspaceWithInspector : ""}`}>
        <div ref={stageRef} className={styles.stage} data-viewer-stage
          onTouchStartCapture={(event) => {
            if (!mobileEnabled || (event.target as HTMLElement).closest("button")) return;
            if (event.touches.length !== 1) { cancelHold(); if (swipeRef.current) swipeRef.current.blocked = true; return; }
            swipeRef.current = { x: event.touches[0].clientX, y: event.touches[0].clientY, blocked: zoomedRef.current };
          }}
          onTouchCancelCapture={() => { swipeRef.current = null; }}
          onTouchEndCapture={(event) => {
            const start = swipeRef.current;
            if (event.touches.length) return;
            swipeRef.current = null;
            if (!start || start.blocked || consumedHold.current || zoomedRef.current || !event.changedTouches.length) return;
            const dx = event.changedTouches[0].clientX - start.x;
            const dy = event.changedTouches[0].clientY - start.y;
            if (Math.abs(dx) >= 48 && Math.abs(dx) > Math.abs(dy) * 1.5) { if (dx < 0) next(); else previous(); }
          }}>
          {!focused ? <PrevNextButton direction="prev" size="xl" align="edge" className={`${styles.nav} ${styles.navPrev}`} style={{ zIndex: 2 }} onClick={(event) => { event.stopPropagation(); previous(); }} /> : null}
          <div className={`${styles.imageFrame} ${comparisonPhoto ? styles.imageFrameComparison : ""}`}
            onContextMenu={(event) => { if (canHoldPreview) event.preventDefault(); }}
            onDragStart={(event) => event.preventDefault()}
            onPointerDown={(event) => {
              if (zoomedRef.current) { cancelHold(); return; }
              beginHold(event);
            }}
            onPointerUp={() => endHold(false)}
            onPointerCancel={cancelHold}
            onPointerMove={moveHold}
            onClick={(event) => {
              event.stopPropagation();
              /* 길게 눌러 원본을 본 뒤 생성되는 click은 확대/축소 동작으로 재해석하지 않는다. */
              if (isConsumed()) return;
              /* 원본 비교용 포인터 캡처 뒤에도 실제 사진 클릭이면 모든 회차에서 집중 보기를 연다. */
              if (!mobileEnabled && event.target instanceof Element && event.target.closest("img")) toggleFocus();
            }}>
            {showMissingRetouched ? <div className={styles.missingRetouched} role="status" data-retouched-empty>
              <BrandLogoBar size="sm" />
              <strong>아직 보정본이 업로드되지 않았습니다</strong>
              <p>업로드 후 이곳에서 확인할 수 있습니다.</p>
            </div> : comparisonPhoto ? (
              <>
                <figure className={styles.comparisonPane}>
                  {comparisonImageLabel ? <figcaption>{comparisonImageLabel}<span className={styles.comparisonFilename}>{filename(comparisonPhoto, activeIndex)}</span></figcaption> : null}
                  {mobileEnabled ? <div className={styles.zoomPhoto}><MobileViewerPinchPhoto key={comparisonPhoto.id} src={viewerImageUrl(comparisonPhoto)} alt={comparisonImageLabel ?? "비교 사진"} showBadge={false} onSingleTap={toggleFocus} /></div> : (
                  /* eslint-disable-next-line @next/next/no-img-element */
                  <img key={`${comparisonPhoto.id}:${viewerImageUrl(comparisonPhoto)}`} src={viewerImageUrl(comparisonPhoto)} alt={comparisonImageLabel ?? "비교 사진"} decoding="async" fetchPriority="high" className={styles.image} />
                )}
                </figure>
                <figure className={styles.comparisonPane}>
                  {activeImageLabel ? <figcaption>{activeImageLabel}<span className={styles.comparisonFilename}>{activeFilename}</span></figcaption> : null}
                  {mobileEnabled ? <div className={styles.zoomPhoto}><MobileViewerPinchPhoto key={activePhoto.id} src={viewerImageUrl(activePhoto)} alt={activeFilename} showBadge={false} onSingleTap={toggleFocus} /></div> : (
                  /* eslint-disable-next-line @next/next/no-img-element */
                  <img key={`${activePhoto.id}:${viewerImageUrl(activePhoto)}`} src={viewerImageUrl(activePhoto)} alt={activeFilename} decoding="async" fetchPriority="high" className={styles.image} />
                )}
                </figure>
              </>
            ) : (
              <>
                {previewVisible ? <span className={styles.holdPreviewBadge} role="status">원본 보는 중</span> : null}
                {mobileEnabled ? <ViewerMobileImage key={`${renderedPhoto.id}:${viewerImageUrl(renderedPhoto)}`} src={viewerImageUrl(renderedPhoto)} alt={activeFilename} previewSrc={previewUrl} previewVisible={previewVisible} suppressTap={suppressTap} onSingleTap={toggleFocus} onZoomStateChange={onZoomChange} /> : (
                  /* eslint-disable-next-line @next/next/no-img-element */
                  <img key={`${renderedPhoto.id}:${viewerImageUrl(renderedPhoto)}`} src={viewerImageUrl(renderedPhoto)} alt={holdingPreview ? holdPreviewLabel : activeFilename} decoding="async" fetchPriority="high" className={styles.image} />
                )}
                {!mobileEnabled && previewUrl ? <img src={previewUrl} alt={holdPreviewLabel} aria-hidden={!previewVisible} className={styles.originalOverlay} style={{ opacity: previewVisible ? 1 : 0 }} draggable={false} /> : null}
              </>
            )}
          </div>
          {!focused ? <PrevNextButton direction="next" size="xl" align="edge" className={`${styles.nav} ${styles.navNext}`} style={{ zIndex: 2 }} onClick={(event) => { event.stopPropagation(); next(); }} /> : null}
          <p className={styles.gestureHint} data-used={hasCompared} onClick={(event) => event.stopPropagation()}>
            {canHoldPreview && !showMissingRetouched ? "사진을 꾹 누르면 원본을 볼 수 있어요." : `${mobileEnabled ? "한 번 탭" : "사진 클릭"}하면 사진만 크게 볼 수 있어요.`}
          </p>
        </div>
        {inspector ? <aside className={styles.inspector} aria-label="사진 상세 정보" onClick={(event) => event.stopPropagation()}>{inspector}</aside> : null}
      </div>

      {mobileView && inspector ? <details className={styles.mobileInspector} onClick={(event) => event.stopPropagation()}>
        <summary>{activeImageLabel ?? "보정본"}{activeStatusLabel ? ` · ${activeStatusLabel}` : ""}<span className={styles.mobileInspectorHint}>요청·이력</span></summary>
        <div>{inspector}</div>
      </details> : null}
      {usesMobileDetailLayout && !mobileView && mobileComments.some((comment) => comment.text.trim()) ? <div className={styles.mobileDetailsBar} onClick={(event) => event.stopPropagation()}>
        <ViewerCommentPanel comments={mobileComments} heading={mobileCommentsHeading} />
      </div> : null}


      {showShortcutHint ? (
        <div role="status" className={styles.shortcutToast} data-review={reviewMode ? "true" : undefined} onClick={(event) => event.stopPropagation()}>
          <span><kbd>←</kbd><kbd>→</kbd>{reviewMode ? "유사컷 이동" : "사진 이동"}</span>
          {canHoldPreview ? <span><kbd>{"\\"}</kbd>누르는 동안 원본</span> : null}
          {showGroupShortcut ? <span><kbd>G</kbd>{reviewMode ? "전체 사진" : "유사컷 보기"}</span> : null}
          <span><kbd>ESC</kbd>{reviewMode ? "전체 사진" : "닫기"}</span>
        </div>
      ) : null}

      {reviewBar ? <div className={styles.reviewBar} onClick={(event) => event.stopPropagation()}>{reviewBar}</div> : null}

      <div ref={filmstripRef} className={styles.filmstrip} onClick={(event) => event.stopPropagation()} data-original-photo-filmstrip>
        {photos.map((photo, index) => {
          const active = index === activeIndex;
          return (
            <button
              key={photo.id}
              type="button"
              data-active={active ? "true" : undefined}
              className={styles.filmThumb}
              onClick={() => onThumbnailClick ? onThumbnailClick(photo, index) : onActiveIndexChange(index)}
              aria-label={getThumbnailAriaLabel?.(photo, index, active) ?? `${index + 1}번째 사진${active ? " (현재)" : ""}`}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={photo.url} alt="" loading="lazy" decoding="async" />
              {renderThumbnailOverlay?.(photo, index, active)}
              {mobileEnabled && mobileView?.mode !== "original" && mobileMissingRetouched[index] ? <span className={styles.missingBadge}>미업로드</span> : null}
            </button>
          );
        })}
      </div>
    </div>,
    document.body,
  );
}

function ViewerMobileImage({ src, alt, onSingleTap, onZoomStateChange, previewSrc, previewVisible, suppressTap }: { src: string; alt: string; onSingleTap: () => void; onZoomStateChange: (zoomed: boolean) => void; previewSrc?: string; previewVisible?: boolean; suppressTap?: () => boolean }) {
  const [status, setStatus] = useState<"loading" | "loaded" | "error">("loading");
  const [attempt, setAttempt] = useState(0);
  useEffect(() => () => onZoomStateChange(false), [onZoomStateChange]);
  return <div className={styles.zoomPhoto} data-viewer-image onLoadCapture={(event) => { if ((event.target as HTMLImageElement).getAttribute("src") === src) setStatus("loaded"); }} onErrorCapture={(event) => { if ((event.target as HTMLImageElement).getAttribute("src") === src) setStatus("error"); }}>
    <div className={styles.imageLoadFrame} style={{ visibility: status === "loaded" ? "visible" : "hidden" }}>
      <MobileViewerPinchPhoto key={attempt} src={src} alt={alt} showBadge={false} onSingleTap={onSingleTap} onZoomStateChange={onZoomStateChange} previewSrc={previewSrc} previewVisible={previewVisible} suppressTap={suppressTap} />
    </div>
    {status !== "loaded" ? <div className={styles.imageLoadStatus} role="status">{status === "loading" ? "사진을 불러오는 중입니다." : <><span>사진을 불러오지 못했습니다.</span><button type="button" onClick={() => { setStatus("loading"); setAttempt((value) => value + 1); }}>다시 시도</button></>}</div> : null}
  </div>;
}
