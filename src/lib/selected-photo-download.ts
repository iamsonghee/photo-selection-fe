"use client";

import { getDirectoryPicker, saveFilesToDirectory } from "@/lib/directory-download-client";

export type SelectedPhotoDownloadFile = {
  photoId: string;
  filename: string;
  byteSize: number;
  url: string;
};

type DownloadSelectedPhotosOptions = {
  projectId: string;
  includeOriginal: boolean;
  expectedCount: number;
  onDirectoryReady?: () => void;
  onProgress?: (completed: number, total: number) => void;
};

export type SelectedPhotoDownloadResult = {
  downloadKind: "original" | "preview";
  fileCount: number;
};

/**
 * 고객이 확정한 사진을 사용자가 고른 폴더에 한 장씩 저장한다.
 * 원본/프리뷰 대상 판정과 권한 검증은 selected-originals API가 최종 결정한다.
 */
export async function downloadSelectedPhotosToDirectory({
  projectId,
  includeOriginal,
  expectedCount,
  onDirectoryReady,
  onProgress,
}: DownloadSelectedPhotosOptions): Promise<SelectedPhotoDownloadResult | null> {
  const downloadLabel = includeOriginal ? "셀렉 원본" : "셀렉 프리뷰";
  const showDirectoryPicker = getDirectoryPicker();
  if (!showDirectoryPicker) {
    throw new Error(`${downloadLabel} 폴더 저장은 PC용 Chrome 또는 Edge에서 이용해 주세요.`);
  }

  let directory;
  try {
    directory = await showDirectoryPicker.call(window, {
      id: "acut-selected-originals",
      mode: "readwrite",
      startIn: "downloads",
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") return null;
    throw new Error("저장할 폴더를 열 수 없습니다. 다시 시도해 주세요.");
  }

  onDirectoryReady?.();
  onProgress?.(0, expectedCount);

  const response = await fetch(`/api/photographer/projects/${projectId}/selected-originals`, {
    method: "POST",
  });
  const data = await response.json().catch(() => ({})) as {
    error?: string;
    files?: SelectedPhotoDownloadFile[];
    downloadKind?: "original" | "preview";
  };
  if (!response.ok) {
    throw new Error(data.error || `${downloadLabel} 다운로드를 준비하지 못했습니다.`);
  }

  const files = data.files ?? [];
  if (files.length === 0) throw new Error(`다운로드할 ${downloadLabel}가 없습니다.`);

  onProgress?.(0, files.length);
  await saveFilesToDirectory(directory, files, onProgress);

  return {
    downloadKind: data.downloadKind ?? (includeOriginal ? "original" : "preview"),
    fileCount: files.length,
  };
}
