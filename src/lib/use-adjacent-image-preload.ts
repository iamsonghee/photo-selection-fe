"use client";

import { useEffect, useRef } from "react";

type ImageUrl = string | null | undefined;

export type AdjacentImagePreloadOptions = {
  enabled?: boolean;
  wrap?: boolean;
  desktopBefore?: number;
  desktopAfter?: number;
  mobileBefore?: number;
  mobileAfter?: number;
  desktopMaxDecoded?: number;
  mobileMaxDecoded?: number;
};

type NetworkAwareNavigator = Navigator & {
  connection?: { saveData?: boolean };
};

function normalizeUrls(urls: readonly ImageUrl[]): string[] {
  return [...new Set(urls.filter((url): url is string => Boolean(url?.trim())))];
}

function resolveIndex(index: number, total: number, wrap: boolean): number | null {
  if (total <= 0) return null;
  if (wrap) return (index + total) % total;
  return index >= 0 && index < total ? index : null;
}

/**
 * 현재 사진과 인접 사진의 표시용 이미지를 제한된 범위에서 미리 다운로드·decode한다.
 * URL 목록은 화면이 이미 보유한 메타데이터만 사용하며 별도 API 요청을 만들지 않는다.
 */
export function useAdjacentImagePreload(
  urlGroups: readonly (readonly ImageUrl[])[],
  activeIndex: number | null,
  options: AdjacentImagePreloadOptions = {},
) {
  const decodedRef = useRef<Map<string, HTMLImageElement>>(new Map());
  const {
    enabled = true,
    wrap = false,
    desktopBefore = 1,
    desktopAfter = 2,
    mobileBefore = 1,
    mobileAfter = 1,
    desktopMaxDecoded = 6,
    mobileMaxDecoded = 4,
  } = options;

  useEffect(() => {
    if (!enabled || activeIndex == null || urlGroups.length === 0) return;

    const mediaQuery = window.matchMedia?.("(max-width: 900px)") ?? null;
    const preload = () => {
      const isMobile = mediaQuery?.matches ?? false;
      const saveData = (navigator as NetworkAwareNavigator).connection?.saveData === true;
      const before = saveData
        ? 0
        : isMobile
          ? mobileBefore
          : desktopBefore;
      const after = saveData
        ? 0
        : isMobile
          ? mobileAfter
          : desktopAfter;
      const maxDecoded = isMobile
        ? mobileMaxDecoded
        : desktopMaxDecoded;

      const orderedIndexes: number[] = [];
      const pushIndex = (candidate: number) => {
        const resolved = resolveIndex(candidate, urlGroups.length, wrap);
        if (resolved != null && !orderedIndexes.includes(resolved)) orderedIndexes.push(resolved);
      };

      pushIndex(activeIndex);
      for (let distance = 1; distance <= Math.max(before, after); distance += 1) {
        if (distance <= after) pushIndex(activeIndex + distance);
        if (distance <= before) pushIndex(activeIndex - distance);
      }

      // 우선순위가 높은 현재 사진부터 잘라, 제한이 작아도 현재 이미지는 eviction되지 않게 한다.
      const orderedUrls = orderedIndexes
        .flatMap((index) => normalizeUrls(urlGroups[index] ?? []))
        .slice(0, maxDecoded);
      const cache = decodedRef.current;

      orderedUrls.forEach((url, priorityIndex) => {
        const existing = cache.get(url);
        if (existing) {
          cache.delete(url);
          cache.set(url, existing);
          return;
        }

        const image = new Image();
        image.decoding = "async";
        image.fetchPriority = priorityIndex === 0 ? "high" : "auto";
        image.src = url;
        cache.set(url, image);
        void image.decode().catch(() => {
          // decode() 미지원/실패 시에도 브라우저의 일반 이미지 로드는 계속된다.
        });
      });

      while (cache.size > maxDecoded) {
        const oldest = cache.keys().next().value as string | undefined;
        if (!oldest) break;
        cache.delete(oldest);
      }
    };

    preload();
    mediaQuery?.addEventListener?.("change", preload);
    return () => mediaQuery?.removeEventListener?.("change", preload);
  }, [
    activeIndex,
    desktopAfter,
    desktopBefore,
    desktopMaxDecoded,
    enabled,
    mobileAfter,
    mobileBefore,
    mobileMaxDecoded,
    urlGroups,
    wrap,
  ]);

  useEffect(() => {
    const cache = decodedRef.current;
    return () => cache.clear();
  }, []);
}
