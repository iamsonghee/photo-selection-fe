import type { CSSProperties, DragEvent, MouseEvent } from "react";

/** 뷰어 이미지: 우클릭 저장·드래그 저장 완화(iOS 롱프레스 메뉴 등) */
export const viewerImageBlockDownloadStyle: CSSProperties = {
  WebkitUserSelect: "none",
  userSelect: "none",
  WebkitTouchCallout: "none",
  // @ts-expect-error WebKit 전용, React CSSProperties에 없음
  WebkitUserDrag: "none",
};

export const viewerImageBlockDownloadHandlers = {
  draggable: false as const,
  onContextMenu: (e: MouseEvent<HTMLImageElement>) => {
    e.preventDefault();
  },
  onDragStart: (e: DragEvent<HTMLImageElement>) => {
    e.preventDefault();
  },
};
