import type { CSSProperties, DragEvent, MouseEvent } from "react";

/**
 * `true`이면 프리뷰 이미지에 우클릭·드래그 저장 완화 스타일/핸들러 적용.
 * 베타 등 다운로드 허용 시에는 설정하지 않거나 `false` (기본).
 * 상용에서 다시 막을 때: NEXT_PUBLIC_BLOCK_VIEWER_IMAGE_DOWNLOAD=true
 */
export const viewerImageDownloadBlocked =
  process.env.NEXT_PUBLIC_BLOCK_VIEWER_IMAGE_DOWNLOAD === "true";

/** 뷰어 이미지: 우클릭 저장·드래그 저장 완화(iOS 롱프레스 메뉴 등) — 차단 모드일 때만 */
export const viewerImageBlockDownloadStyle: CSSProperties = viewerImageDownloadBlocked
  ? {
      WebkitUserSelect: "none",
      userSelect: "none",
      WebkitTouchCallout: "none",
      // @ts-expect-error WebKit 전용, React CSSProperties에 없음
      WebkitUserDrag: "none",
    }
  : {};

export const viewerImageBlockDownloadHandlers = viewerImageDownloadBlocked
  ? {
      draggable: false as const,
      onContextMenu: (e: MouseEvent<HTMLImageElement>) => {
        e.preventDefault();
      },
      onDragStart: (e: DragEvent<HTMLImageElement>) => {
        e.preventDefault();
      },
    }
  : {};
