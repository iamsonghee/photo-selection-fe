/**
 * 업로드 전: 전송량 최적화를 위해 브라우저에서 해상도·용량을 줄입니다.
 * 디코드 실패·결과가 원본보다 크면 원본 File을 그대로 반환합니다.
 */

const DEFAULT_MAX_EDGE = 3200;
const DEFAULT_JPEG_QUALITY = 0.82;
/** 이보다 작은 파일은 디코딩·재인코딩 생략 */
const DEFAULT_SKIP_BELOW_BYTES = 600 * 1024;

export type UploadCompressOptions = {
  maxEdge?: number;
  jpegQuality?: number;
  /** 이 크기 이하면 압축 시도 안 함 */
  skipBelowBytes?: number;
};

let compressionWorker: Worker | null = null;
let compressionRequestId = 0;
const pendingWorkerRequests = new Map<number, (blob: Blob | null) => void>();

function getCompressionWorker(): Worker | null {
  if (typeof Worker === "undefined" || typeof OffscreenCanvas === "undefined") return null;
  if (compressionWorker) return compressionWorker;
  try {
    compressionWorker = new Worker(new URL("../workers/upload-compress.worker.ts", import.meta.url));
    compressionWorker.onmessage = (event: MessageEvent<{ id: number; blob: Blob | null }>) => {
      const resolve = pendingWorkerRequests.get(event.data.id);
      if (!resolve) return;
      pendingWorkerRequests.delete(event.data.id);
      resolve(event.data.blob);
    };
    compressionWorker.onerror = () => {
      compressionWorker?.terminate();
      compressionWorker = null;
      pendingWorkerRequests.forEach((resolve) => resolve(null));
      pendingWorkerRequests.clear();
    };
    return compressionWorker;
  } catch {
    return null;
  }
}

function baseNameFromFilename(name: string): string {
  const i = name.lastIndexOf(".");
  return i > 0 ? name.slice(0, i) : name;
}

async function decodeToDrawable(file: File): Promise<{ drawable: CanvasImageSource; cleanup: () => void }> {
  try {
    const bmp = await createImageBitmap(file);
    return {
      drawable: bmp,
      cleanup: () => {
        try {
          bmp.close();
        } catch {
          /* */
        }
      },
    };
  } catch {
    return await new Promise((resolve, reject) => {
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.decoding = "async";
      img.onload = () => {
        URL.revokeObjectURL(url);
        resolve({ drawable: img, cleanup: () => {} });
      };
      img.onerror = () => {
        URL.revokeObjectURL(url);
        reject(new Error("decode"));
      };
      img.src = url;
    });
  }
}

export async function compressImageForUpload(
  file: File,
  options?: UploadCompressOptions,
): Promise<File> {
  const maxEdge = options?.maxEdge ?? DEFAULT_MAX_EDGE;
  const jpegQuality = options?.jpegQuality ?? DEFAULT_JPEG_QUALITY;
  const skipBelowBytes = options?.skipBelowBytes ?? DEFAULT_SKIP_BELOW_BYTES;

  if (file.size <= skipBelowBytes) return file;

  const mime = (file.type || "").toLowerCase();
  if (!mime.startsWith("image/")) return file;

  const worker = getCompressionWorker();
  if (worker) {
    const id = ++compressionRequestId;
    const blob = await new Promise<Blob | null>((resolve) => {
      pendingWorkerRequests.set(id, resolve);
      worker.postMessage({ id, file, maxEdge, jpegQuality });
    });
    if (blob && blob.size > 0 && blob.size < file.size * 0.98) {
      return new File([blob], `${baseNameFromFilename(file.name) || "photo"}.jpg`, {
        type: "image/jpeg",
        lastModified: Date.now(),
      });
    }
    if (blob) return file;
  }

  let cleanup: (() => void) | undefined;
  try {
    const { drawable, cleanup: c } = await decodeToDrawable(file);
    cleanup = c;

    const w =
      drawable instanceof HTMLImageElement ? drawable.naturalWidth : (drawable as ImageBitmap).width;
    const h =
      drawable instanceof HTMLImageElement ? drawable.naturalHeight : (drawable as ImageBitmap).height;
    if (w <= 0 || h <= 0) return file;

    const scale = Math.min(1, maxEdge / Math.max(w, h));
    const cw = Math.max(1, Math.round(w * scale));
    const ch = Math.max(1, Math.round(h * scale));

    const canvas = document.createElement("canvas");
    canvas.width = cw;
    canvas.height = ch;
    const ctx = canvas.getContext("2d");
    if (!ctx) return file;
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(drawable, 0, 0, cw, ch);

    const blob: Blob | null = await new Promise((res) =>
      canvas.toBlob((b) => res(b), "image/jpeg", jpegQuality),
    );
    if (!blob || blob.size === 0) return file;

    if (blob.size >= file.size * 0.98) return file;

    const base = baseNameFromFilename(file.name) || "photo";
    return new File([blob], `${base}.jpg`, {
      type: "image/jpeg",
      lastModified: Date.now(),
    });
  } catch {
    return file;
  } finally {
    cleanup?.();
  }
}
