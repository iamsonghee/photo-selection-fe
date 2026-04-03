/**
 * 모바일 업로드 전: 전송량·실패율 완화를 위해 브라우저에서 해상도·용량을 줄입니다.
 * PC 업로드는 호출하지 않는 것을 권장(원본 보존).
 */

const DEFAULT_MAX_EDGE = 2560;
const DEFAULT_JPEG_QUALITY = 0.82;
/** 이보다 작은 파일은 디코딩·재인코딩 생략 */
const DEFAULT_SKIP_BELOW_BYTES = 600 * 1024;

export type MobileUploadCompressOptions = {
  maxEdge?: number;
  jpegQuality?: number;
  /** 이 크기 이하면 압축 시도 안 함 */
  skipBelowBytes?: number;
};

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

/**
 * 휴대폰에서 선택한 이미지 1장을 최대 변 기준으로 줄이고 JPEG로 재인코딩합니다.
 * 디코드 실패·결과가 원본보다 크면 원본 File을 그대로 반환합니다.
 */
export async function compressImageFileForMobileIfNeeded(
  file: File,
  options?: MobileUploadCompressOptions,
): Promise<File> {
  const maxEdge = options?.maxEdge ?? DEFAULT_MAX_EDGE;
  const jpegQuality = options?.jpegQuality ?? DEFAULT_JPEG_QUALITY;
  const skipBelowBytes = options?.skipBelowBytes ?? DEFAULT_SKIP_BELOW_BYTES;

  if (file.size <= skipBelowBytes) return file;

  const mime = (file.type || "").toLowerCase();
  if (!mime.startsWith("image/")) return file;

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
