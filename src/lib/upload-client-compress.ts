/**
 * 업로드 전: 전송량 최적화를 위해 브라우저에서 해상도·용량을 줄입니다.
 * 디코드 실패·결과가 원본보다 크면 원본 File을 그대로 반환합니다.
 *
 * 두 가지 진입점이 있다:
 * - `compressImageForUpload(file)`: 파일 1개 압축(싱글턴 워커 사용). 기존 호출부
 *   (설정 프로필 이미지, 보정본 업로드 등)가 그대로 쓰고 있어 동작을 절대 바꾸지 않는다.
 * - `compressImagesInParallel(files, signal, poolSize)`: 여러 파일을 워커 풀로 동시
 *   압축(원본 업로드 화면 전용). 실제 압축 로직은 `compressWithWorker()`를 공유한다.
 */

const DEFAULT_MAX_EDGE = 3200;
const DEFAULT_JPEG_QUALITY = 0.82;
/** 이보다 작은 파일은 디코딩·재인코딩 생략 */
const DEFAULT_SKIP_BELOW_BYTES = 600 * 1024;
/** 풀 크기 상한(메모리 안정성 우선 — 호출부가 실수로 큰 값을 넘겨도 이 이상은 안 만든다) */
const HARD_POOL_SIZE_CEILING = 4;

export type UploadCompressOptions = {
  maxEdge?: number;
  jpegQuality?: number;
  /** 이 크기 이하면 압축 시도 안 함 */
  skipBelowBytes?: number;
};

function workerSupported(): boolean {
  return typeof Worker !== "undefined" && typeof OffscreenCanvas !== "undefined";
}

function createWorkerInstance(): Worker {
  return new Worker(new URL("../workers/upload-compress.worker.ts", import.meta.url));
}

/** Worker 생성은 CSP·메모리 상황에서 실패할 수 있다. 호출부는 canvas 폴백으로 계속 진행한다. */
function tryCreateWorker(): Worker | null {
  try {
    return createWorkerInstance();
  } catch {
    return null;
  }
}

function baseNameFromFilename(name: string): string {
  const i = name.lastIndexOf(".");
  return i > 0 ? name.slice(0, i) : name;
}

// ── 싱글턴 워커(기존 compressImageForUpload 전용, 동작 변경 없음) ──────────────

let compressionWorker: Worker | null = null;

function getCompressionWorker(): Worker | null {
  if (!workerSupported()) return null;
  if (compressionWorker) return compressionWorker;
  try {
    compressionWorker = createWorkerInstance();
    const w = compressionWorker;
    w.addEventListener("error", () => {
      if (compressionWorker === w) {
        try {
          w.terminate();
        } catch {
          /* */
        }
        compressionWorker = null;
      }
    });
    return compressionWorker;
  } catch {
    return null;
  }
}

// ── 워커 1건 요청/응답(요청당 워커 1개, 동시에 여러 건 안 보냄) ────────────────

let requestIdCounter = 0;

function compressOnWorker(
  worker: Worker,
  file: File,
  maxEdge: number,
  jpegQuality: number,
  signal?: AbortSignal,
): Promise<Blob | null> {
  return new Promise((resolve, reject) => {
    const id = ++requestIdCounter;
    const cleanup = () => {
      worker.removeEventListener("message", onMessage);
      worker.removeEventListener("error", onError);
      signal?.removeEventListener("abort", onAbort);
    };
    const onMessage = (event: MessageEvent<{ id: number; blob: Blob | null }>) => {
      if (event.data.id !== id) return;
      cleanup();
      resolve(event.data.blob);
    };
    const onError = (err: unknown) => {
      cleanup();
      reject(err);
    };
    const onAbort = () => {
      cleanup();
      reject(new DOMException("Aborted", "AbortError"));
    };
    worker.addEventListener("message", onMessage as EventListener);
    worker.addEventListener("error", onError as EventListener);
    if (signal?.aborted) {
      onAbort();
      return;
    }
    signal?.addEventListener("abort", onAbort, { once: true });
    worker.postMessage({ id, file, maxEdge, jpegQuality });
  });
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

/** 워커 없이(또는 워커 실패 후) 메인 스레드 canvas로 압축 — 기존 폴백 로직 그대로. */
async function compressWithCanvasFallback(file: File, maxEdge: number, jpegQuality: number): Promise<File> {
  let cleanup: (() => void) | undefined;
  try {
    const { drawable, cleanup: c } = await decodeToDrawable(file);
    cleanup = c;

    const w = drawable instanceof HTMLImageElement ? drawable.naturalWidth : (drawable as ImageBitmap).width;
    const h = drawable instanceof HTMLImageElement ? drawable.naturalHeight : (drawable as ImageBitmap).height;
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

    const blob: Blob | null = await new Promise((res) => canvas.toBlob((b) => res(b), "image/jpeg", jpegQuality));
    if (!blob || blob.size === 0) return file;
    if (blob.size >= file.size * 0.98) return file;

    const base = baseNameFromFilename(file.name) || "photo";
    return new File([blob], `${base}.jpg`, { type: "image/jpeg", lastModified: Date.now() });
  } catch {
    return file;
  } finally {
    cleanup?.();
  }
}

/**
 * 파일 1개 압축의 실제 처리 — 주어진 worker(없으면 null)로 시도하고, 실패/미지원 시
 * canvas 폴백. `compressImageForUpload`(싱글턴 워커)와 워커 풀 양쪽에서 공유한다.
 */
async function compressWithWorker(
  worker: Worker | null,
  file: File,
  options?: UploadCompressOptions,
  signal?: AbortSignal,
): Promise<File> {
  const maxEdge = options?.maxEdge ?? DEFAULT_MAX_EDGE;
  const jpegQuality = options?.jpegQuality ?? DEFAULT_JPEG_QUALITY;
  const skipBelowBytes = options?.skipBelowBytes ?? DEFAULT_SKIP_BELOW_BYTES;

  if (file.size <= skipBelowBytes) return file;
  const mime = (file.type || "").toLowerCase();
  if (!mime.startsWith("image/")) return file;

  if (worker) {
    let blob: Blob | null = null;
    try {
      blob = await compressOnWorker(worker, file, maxEdge, jpegQuality, signal);
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") throw error;
      blob = null;
    }
    if (blob && blob.size > 0 && blob.size < file.size * 0.98) {
      return new File([blob], `${baseNameFromFilename(file.name) || "photo"}.jpg`, {
        type: "image/jpeg",
        lastModified: Date.now(),
      });
    }
    if (blob) return file;
  }

  if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
  return compressWithCanvasFallback(file, maxEdge, jpegQuality);
}

/** 기존 단일 파일 압축 API — 동작·시그니처 완전히 유지(싱글턴 워커 사용). */
export async function compressImageForUpload(file: File, options?: UploadCompressOptions): Promise<File> {
  return compressWithWorker(getCompressionWorker(), file, options);
}

// ── 워커 풀(compressImagesInParallel 전용) ─────────────────────────────────────

interface PoolSlot {
  worker: Worker | null;
  busy: boolean;
}

const pool: PoolSlot[] = [];

function ensurePool(size: number): PoolSlot[] {
  if (!workerSupported()) return [];
  const target = Math.max(1, Math.min(HARD_POOL_SIZE_CEILING, size));
  while (pool.length < target) {
    const worker = tryCreateWorker();
    if (!worker) break;
    pool.push({ worker, busy: false });
  }
  return pool.slice(0, target);
}

/**
 * 여러 파일을 워커 풀(acquire/release, 워커당 동시 작업 최대 1개)로 압축.
 *
 * - 정상 완료: 입력과 정확히 같은 길이의 File[]을 순서 보존해 반환.
 * - `signal`이 abort되면 부분 결과를 반환하지 않고 AbortError를 throw한다. 이미
 *   디스패치된(busy) 워커는 즉시 terminate 후 같은 풀 슬롯에 새 워커를 만들어,
 *   다음 세션이 이 압축이 끝나길 기다리지 않고 바로 idle 워커를 쓸 수 있게 한다.
 *   아직 큐에서 안 꺼낸 파일은 디스패치하지 않는다.
 * - 개별 파일의 압축 오류는 배치를 중단시키지 않는다(`compressWithWorker`의 폴백
 *   정책을 그대로 따름). 워커 자체가 죽은 것으로 보이면(worker error 이벤트) 그
 *   작업 처리 후 슬롯의 워커를 교체해 이후 큐 작업이 멈추지 않게 한다.
 * - 진행률은 `onFileDone` 콜백으로만 알리며, 호출부는 반드시 함수형 setState로
 *   받아야 동시 완료 시 카운트 누락이 없다.
 */
export async function compressImagesInParallel(
  files: File[],
  signal: AbortSignal,
  poolSize: number,
  options?: UploadCompressOptions,
  onFileDone?: () => void,
): Promise<File[]> {
  if (signal.aborted) throw new DOMException("Aborted", "AbortError");
  if (files.length === 0) return [];

  const slots = ensurePool(poolSize);
  const results: File[] = new Array(files.length);

  // 워커 미지원 환경 — 순차 canvas 폴백(풀 없이 compressWithWorker(null, ...) 재사용)
  if (slots.length === 0) {
    for (let i = 0; i < files.length; i++) {
      if (signal.aborted) throw new DOMException("Aborted", "AbortError");
      results[i] = await compressWithWorker(null, files[i], options);
      onFileDone?.();
    }
    return results;
  }

  let nextIndex = 0;
  let completed = 0;
  let aborted = false;

  await new Promise<void>((resolve, reject) => {
    const onAbort = () => {
      aborted = true;
      // 이 세션에서 busy 중인 워커는 즉시 교체 — 다음 세션이 곧바로 idle 워커를 쓸 수 있게.
      for (const slot of slots) {
        if (slot.busy) {
          try {
            slot.worker?.terminate();
          } catch {
            /* */
          }
          slot.worker = tryCreateWorker();
          slot.busy = false;
        }
      }
      reject(new DOMException("Aborted", "AbortError"));
    };
    signal.addEventListener("abort", onAbort, { once: true });

    const cleanupAndSettle = (fn: () => void) => {
      signal.removeEventListener("abort", onAbort);
      fn();
    };

    function pump(slot: PoolSlot) {
      if (aborted || nextIndex >= files.length) return;
      const idx = nextIndex++;
      slot.busy = true;
      let workerErrored = false;
      const healthListener = () => {
        workerErrored = true;
      };
      const worker = slot.worker;
      worker?.addEventListener("error", healthListener);

      const finishTask = (result: File, replaceWorker: boolean) => {
        worker?.removeEventListener("error", healthListener);
        slot.busy = false;
        if (replaceWorker || workerErrored) {
          try {
            worker?.terminate();
          } catch {
            /* */
          }
          slot.worker = tryCreateWorker();
        }
        if (aborted || signal.aborted) return;
        results[idx] = result;
        completed++;
        onFileDone?.();
        if (completed === files.length) {
          cleanupAndSettle(resolve);
          return;
        }
        pump(slot);
      };

      compressWithWorker(worker, files[idx], options, signal)
        .then((result) => finishTask(result, false))
        .catch((error) => {
          // abort는 상위 Promise가 이미 종료·워커 교체까지 마쳤다. 여기서 다시 교체하면
          // 새 워커를 덮어써 누수될 수 있으므로 후속 처리를 하지 않는다.
          if (error instanceof DOMException && error.name === "AbortError") return;
          finishTask(files[idx], true); // 예외적 실패 — 원본 파일로 안전망, 워커 교체
        });
    }

    for (const slot of slots) pump(slot);
  });

  return results;
}
