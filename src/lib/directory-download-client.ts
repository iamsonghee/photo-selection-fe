export interface DirectoryDownloadFile {
  filename: string;
  url: string;
}

type WritableFileStream = WritableStream<Uint8Array> & {
  write(data: Blob): Promise<void>;
  close(): Promise<void>;
  abort(reason?: unknown): Promise<void>;
};

type WritableFileHandle = {
  createWritable(): Promise<WritableFileStream>;
};

export type WritableDirectoryHandle = {
  getFileHandle(name: string, options?: { create?: boolean }): Promise<WritableFileHandle>;
};

type DirectoryPickerWindow = Window & {
  showDirectoryPicker?: (options?: {
    id?: string;
    mode?: "read" | "readwrite";
    startIn?: string;
  }) => Promise<WritableDirectoryHandle>;
};

export function getDirectoryPicker() {
  if (typeof window === "undefined") return null;
  return (window as DirectoryPickerWindow).showDirectoryPicker ?? null;
}

function safeDownloadFilename(filename: string): string {
  return filename.replace(/[\\/:*?"<>|\u0000-\u001f]/g, "_").trim() || "photo";
}

async function getNonConflictingFileHandle(
  directory: WritableDirectoryHandle,
  filename: string,
): Promise<WritableFileHandle> {
  const safeName = safeDownloadFilename(filename);
  const dot = safeName.lastIndexOf(".");
  const base = dot > 0 ? safeName.slice(0, dot) : safeName;
  const extension = dot > 0 ? safeName.slice(dot) : "";

  for (let suffix = 0; suffix < 10_000; suffix++) {
    const candidate = suffix === 0 ? safeName : `${base} (${suffix + 1})${extension}`;
    try {
      await directory.getFileHandle(candidate);
    } catch (error) {
      if (error instanceof DOMException && error.name !== "NotFoundError") throw error;
      return directory.getFileHandle(candidate, { create: true });
    }
  }
  throw new Error("저장할 파일명을 만들 수 없습니다.");
}

/**
 * 파일을 하나씩 내려받아 사용자가 선택한 폴더에 바로 기록한다.
 * 응답 전체를 Blob으로 보관하지 않아 원본 묶음이 커져도 브라우저 메모리가 급증하지 않는다.
 */
export async function saveFilesToDirectory(
  directory: WritableDirectoryHandle,
  files: DirectoryDownloadFile[],
  onProgress?: (completed: number, total: number) => void,
) {
  for (let index = 0; index < files.length; index++) {
    const file = files[index];
    const response = await fetch(file.url);
    if (!response.ok) throw new Error(`${file.filename}을(를) 가져오지 못했습니다.`);
    const fileHandle = await getNonConflictingFileHandle(directory, file.filename);
    const writable = await fileHandle.createWritable();
    try {
      if (response.body) {
        await response.body.pipeTo(writable);
      } else {
        await writable.write(await response.blob());
        await writable.close();
      }
    } catch (error) {
      await writable.abort(error).catch(() => {});
      throw error;
    }
    onProgress?.(index + 1, files.length);
  }
}
