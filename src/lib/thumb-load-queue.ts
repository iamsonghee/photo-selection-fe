"use client";

/**
 * 가상화된 사진 그리드용 썸네일 로딩 동시성 제한 + 취소.
 *
 * 셀이 뷰포트(또는 지정된 스크롤 컨테이너) 근처에 들어오면 큐에서 슬롯을 받은 뒤에만
 * <img>를 마운트하고, 화면 밖으로 스크롤되어 언마운트되면:
 *   - 아직 슬롯을 못 받고 대기 중이었다면 큐에서 제거
 *   - 이미 슬롯을 받아 다운로드 중이었다면 <img src>를 비워 브라우저가 진행 중인
 *     요청을 취소하도록 유도하고, 슬롯을 반환해 다음 대기 항목이 시작되게 한다.
 *
 * R2 썸네일 도메인(pub-*.r2.dev)에 CORS가 설정돼 있지 않아 fetch+AbortController+blob
 * 방식은 쓸 수 없다(CORS 없이 fetch하면 실패하기 전에 전체 바이트가 이미 전송되어
 * 오히려 트래픽이 2배가 됨) — 그래서 img.src="" 리셋 방식만 사용한다.
 */

import { useCallback, useEffect, useRef, useState } from "react";

export type ThumbLoadQueue = {
  /** 슬롯을 요청. 즉시 또는 나중에 onGranted가 호출된다. 아직 대기 중일 때만 취소 가능한 함수를 반환. */
  requestSlot(onGranted: () => void): () => void;
  releaseSlot(): void;
};

export function createThumbLoadQueue(maxConcurrent: number): ThumbLoadQueue {
  let active = 0;
  const queue: Array<() => void> = [];

  return {
    requestSlot(onGranted) {
      if (active < maxConcurrent) {
        active++;
        onGranted();
        return () => {};
      }
      const entry = () => onGranted();
      queue.push(entry);
      return () => {
        const idx = queue.indexOf(entry);
        if (idx !== -1) queue.splice(idx, 1);
      };
    },
    releaseSlot() {
      active = Math.max(0, active - 1);
      const next = queue.shift();
      if (next) {
        active++;
        next();
      }
    },
  };
}

export function useQueuedThumbSrc(
  url: string | undefined,
  opts: {
    queue: ThumbLoadQueue;
    /** IntersectionObserver root. 생략하면 뷰포트 기준(window virtualizer용). */
    rootRef?: React.RefObject<Element | null>;
    rootMargin?: string;
    /** 로컬 blob 미리보기 등 — IO/큐를 건너뛰고 즉시 로드 (네트워크 요청 없음). */
    bypass?: boolean;
  }
): {
  /** 바깥 셀 엘리먼트에 연결 — div, Link(anchor) 등 어떤 엘리먼트든 가능 (콜백 ref) */
  cellRef: (node: Element | null) => void;
  imgRef: React.RefObject<HTMLImageElement | null>;
  shouldLoad: boolean;
  handleLoad: () => void;
  handleError: () => void;
} {
  const { queue, rootRef, rootMargin = "100px", bypass = false } = opts;
  const cellElRef = useRef<Element | null>(null);
  const cellRef = useCallback((node: Element | null) => {
    cellElRef.current = node;
  }, []);
  const imgRef = useRef<HTMLImageElement>(null);
  // React가 관리하는 imgRef와 별개로, "마지막으로 실제 마운트됐던 <img>"를 직접 추적한다.
  // 언마운트 cleanup 시점에는 React가 imgRef.current를 이미 비웠을 수 있어 그대로 읽으면 안 된다.
  const lastMountedImgRef = useRef<HTMLImageElement | null>(null);
  const holdsSlotRef = useRef(false);
  const finishedRef = useRef(false);
  const [shouldLoad, setShouldLoad] = useState(bypass);

  const releaseSlotIfHeld = useCallback(() => {
    if (holdsSlotRef.current) {
      holdsSlotRef.current = false;
      queue.releaseSlot();
    }
  }, [queue]);

  // url이 바뀌면(재시도 등) 처음부터 다시 로드해야 한다 — 렌더 중 상태 조정(React 권장 패턴).
  // ref는 렌더 중에 건드릴 수 없으므로 finishedRef 리셋과 이전 슬롯 반환은 아래 이펙트에서 처리.
  const [tracked, setTracked] = useState({ url, bypass });
  if (tracked.url !== url || tracked.bypass !== bypass) {
    setTracked({ url, bypass });
    setShouldLoad(bypass);
  }

  // url/bypass가 바뀌어 새 로드 주기가 시작될 때: 이전 주기에서 슬롯을 들고 아직
  // 로딩 중이었다면 그 다운로드를 취소하고 슬롯을 반환한 뒤, 다음 주기를 위해 리셋한다.
  useEffect(() => {
    if (holdsSlotRef.current) {
      holdsSlotRef.current = false;
      if (!finishedRef.current && lastMountedImgRef.current) {
        lastMountedImgRef.current.src = "";
      }
      queue.releaseSlot();
    }
    finishedRef.current = false;
  }, [tracked, queue]);

  useEffect(() => {
    if (bypass || shouldLoad || !url) return;
    const el = cellElRef.current;
    if (!el) return;
    const root = rootRef?.current ?? null;
    if (rootRef && !root) return; // root ref가 지정됐는데 아직 안 붙었으면 다음 렌더에 재시도
    let cancelSlotRequest: (() => void) | null = null;
    const io = new IntersectionObserver(
      (entries) => {
        if (!entries.some((e) => e.isIntersecting)) return;
        io.disconnect();
        cancelSlotRequest = queue.requestSlot(() => {
          holdsSlotRef.current = true;
          setShouldLoad(true);
        });
      },
      { root, rootMargin, threshold: 0 }
    );
    io.observe(el);
    return () => {
      io.disconnect();
      cancelSlotRequest?.();
    };
  }, [bypass, shouldLoad, url, queue, rootRef, rootMargin]);

  // <img>는 shouldLoad가 true일 때만 마운트되므로, 그때마다 마지막으로 마운트된
  // 노드를 별도로 기록해둔다 (언마운트 cleanup 시점엔 React가 imgRef.current를
  // 이미 비웠을 수 있어 그대로 읽으면 안 되기 때문).
  useEffect(() => {
    lastMountedImgRef.current = imgRef.current;
  }, [shouldLoad]);

  // 화면 밖으로 스크롤되어 이 컴포넌트가 언마운트될 때만(= 이 이펙트는 재실행되지 않음):
  // 아직 로딩 중이었다면 <img src>를 비워 브라우저가 진행 중인 다운로드를 취소하게 하고,
  // 큐 슬롯을 반환한다.
  useEffect(() => {
    return () => {
      if (holdsSlotRef.current && !finishedRef.current && lastMountedImgRef.current) {
        lastMountedImgRef.current.src = "";
      }
      releaseSlotIfHeld();
    };
  }, [releaseSlotIfHeld]);

  const handleLoad = useCallback(() => {
    finishedRef.current = true;
    releaseSlotIfHeld();
  }, [releaseSlotIfHeld]);

  const handleError = useCallback(() => {
    finishedRef.current = true;
    releaseSlotIfHeld();
  }, [releaseSlotIfHeld]);

  return { cellRef, imgRef, shouldLoad: bypass || shouldLoad, handleLoad, handleError };
}
