/**
 * 모바일 웹 업로드는 앱 전환·화면 잠금·오프라인이면 요청이 끊긴다(백그라운드 업로드는 웹으로 불가).
 * 그런 끊김은 재시도 횟수를 쓰지 않고, 화면이 다시 보이고 인터넷이 연결될 때까지 기다렸다가 이어 올린다.
 * 일반 오류(서버 5xx 등)만 재시도 횟수를 쓴다.
 */

let interruptions = 0;
if (typeof document !== "undefined") {
  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "hidden") interruptions++; });
  window.addEventListener("offline", () => { interruptions++; });
}

/** 지금까지 화면 이탈·오프라인이 일어난 횟수. 요청 시작 때 기록해 두고 실패 시 `waitIfInterrupted`에 넘긴다. */
export function uploadInterruptions(): number {
  return interruptions;
}

function canUpload(): boolean {
  return document.visibilityState === "visible" && navigator.onLine;
}

/** 화면이 보이고 인터넷이 연결될 때까지 기다린다. */
export function waitForUploadResume(signal?: AbortSignal): Promise<void> {
  if (canUpload()) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const cleanup = () => {
      document.removeEventListener("visibilitychange", check);
      window.removeEventListener("online", check);
      signal?.removeEventListener("abort", onAbort);
    };
    const check = () => { if (canUpload()) { cleanup(); resolve(); } };
    const onAbort = () => { cleanup(); reject(new DOMException("Aborted", "AbortError")); };
    if (signal?.aborted) return onAbort();
    document.addEventListener("visibilitychange", check);
    window.addEventListener("online", check);
    signal?.addEventListener("abort", onAbort);
  });
}

/** 끊김이 너무 잦으면(예: 계속 앱을 오가는 경우) 무한 대기 대신 일반 실패로 넘긴다. */
export const MAX_INTERRUPTION_RETRIES = 20;

/**
 * 요청 시작(`since`) 이후 화면 이탈·오프라인이 있었거나 지금 그 상태면, 다시 올릴 수 있을 때까지
 * 기다리고 true(=재시도 횟수를 쓰지 않는 재시도)를 돌려준다.
 */
export async function waitIfInterrupted(since: number, signal?: AbortSignal): Promise<boolean> {
  if (interruptions === since && canUpload()) return false;
  await waitForUploadResume(signal);
  return true;
}

export class RetryableUploadError extends Error {}

/** 재시도해도 안전한(멱등) 업로드 요청용. 네트워크 오류·`RetryableUploadError`만 재시도한다. */
export async function retryUpload<T>(
  attempt: () => Promise<T>,
  { maxAttempts = 4, signal }: { maxAttempts?: number; signal?: AbortSignal } = {},
): Promise<T> {
  let failures = 0;
  let resumes = 0;
  for (;;) {
    const since = uploadInterruptions();
    try {
      return await attempt();
    } catch (error) {
      const retryable = error instanceof TypeError || error instanceof RetryableUploadError;
      if (!retryable || signal?.aborted) throw error;
      if (resumes < MAX_INTERRUPTION_RETRIES && await waitIfInterrupted(since, signal)) { resumes++; continue; }
      if (++failures >= maxAttempts) throw error;
      await new Promise((resolve) => setTimeout(resolve, Math.min(500 * 2 ** (failures - 1), 4_000)));
    }
  }
}

/** 재시도할 만한 HTTP 상태(일시적 서버·네트워크 문제). */
export function isRetryableStatus(status: number): boolean {
  return [408, 429, 500, 502, 503, 504].includes(status);
}
