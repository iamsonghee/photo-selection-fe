"use client";

import { useState } from "react";
import { getDirectoryPicker, saveFilesToDirectory, type DirectoryDownloadFile } from "@/lib/directory-download-client";
import type { ReviewPhoto } from "@/lib/admin-scene-review";

const DOWNLOAD_CONCURRENCY = 6;

type State =
  | { kind: "idle" }
  | { kind: "saving"; completed: number; total: number }
  | { kind: "saved"; total: number }
  | { kind: "error"; message: string };

/**
 * 장면 검수 사진을 고른 폴더에 저장한다(6장씩 동시에). 셀프 고객 사진은 원본을 보관하지 않아
 * 미리보기(긴 변 1200px JPEG)를 받고, 미리보기가 없을 때만 썸네일을 받는다.
 * 파일명은 화면과 같은 촬영 순 번호를 앞에 붙여 폴더에서도 순서가 유지되게 한다.
 */
export function AdminSceneDownloadButton({ photos }: { photos: ReviewPhoto[] }) {
  const [state, setState] = useState<State>({ kind: "idle" });

  async function download() {
    const showDirectoryPicker = getDirectoryPicker();
    if (!showDirectoryPicker) {
      setState({ kind: "error", message: "폴더 저장은 PC용 Chrome 또는 Edge에서 이용해 주세요." });
      return;
    }
    let directory;
    try {
      directory = await showDirectoryPicker.call(window, { id: "acut-admin-scenes", mode: "readwrite", startIn: "downloads" });
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      setState({ kind: "error", message: "저장할 폴더를 열 수 없어요. 다시 시도해 주세요." });
      return;
    }

    const width = Math.max(4, String(photos.length).length);
    const files = photos.flatMap((photo, index): DirectoryDownloadFile[] => {
      const url = photo.previewUrl ?? photo.thumbUrl;
      if (!url) return [];
      // 미리보기는 항상 JPEG라 원래 확장자(.HEIC, .CR3 등)를 떼고 .jpg를 붙인다.
      const base = photo.filename.replace(/\.[^.]+$/, "") || photo.id;
      return [{ filename: `${String(index + 1).padStart(width, "0")}_${base}.jpg`, url }];
    });

    setState({ kind: "saving", completed: 0, total: files.length });
    try {
      // 사진 저장소가 요청마다 0.4~0.9초라 한 장씩이면 1,000장에 15분 넘게 걸린다. 번호를 붙여 이름이 겹치지 않으므로 동시에 받는다.
      await saveFilesToDirectory(directory, files, (completed, total) => setState({ kind: "saving", completed, total }), { concurrency: DOWNLOAD_CONCURRENCY });
      setState({ kind: "saved", total: files.length });
    } catch (error) {
      setState({ kind: "error", message: error instanceof Error ? error.message : "저장하지 못했어요. 다시 시도해 주세요." });
    }
  }

  return (
    <div className="mt-3 flex flex-wrap items-center gap-3 text-sm">
      <button
        type="button"
        onClick={() => void download()}
        disabled={state.kind === "saving" || photos.length === 0}
        className="h-9 rounded-md border border-border px-4 text-foreground hover:bg-surface-raised disabled:opacity-50"
      >
        {state.kind === "saving" ? `저장 중 ${state.completed.toLocaleString()} / ${state.total.toLocaleString()}장` : "전체 다운로드"}
      </button>
      {state.kind === "saved" && <span className="text-primary">{state.total.toLocaleString()}장 저장했어요</span>}
      {state.kind === "error" && <span className="text-danger">{state.message}</span>}
    </div>
  );
}
