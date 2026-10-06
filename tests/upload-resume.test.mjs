import assert from "node:assert/strict";

// 브라우저 대신 쓸 최소한의 document/window/navigator — 모듈이 import 시점에 리스너를 단다.
const doc = new EventTarget();
doc.visibilityState = "visible";
const win = new EventTarget();
globalThis.document = doc;
globalThis.window = win;
Object.defineProperty(globalThis, "navigator", { value: { onLine: true }, configurable: true });
const hide = () => { doc.visibilityState = "hidden"; doc.dispatchEvent(new Event("visibilitychange")); };
const show = () => { doc.visibilityState = "visible"; doc.dispatchEvent(new Event("visibilitychange")); };

const { retryUpload, RetryableUploadError } = await import("../src/lib/upload-resume.ts");

// 1) 화면을 벗어난 사이 끊긴 요청은 재시도 횟수를 쓰지 않고, 화면이 다시 보이면 이어 보낸다.
{
  let calls = 0;
  const result = retryUpload(async () => {
    calls++;
    if (calls <= 5) { hide(); throw new TypeError("Load failed"); } // 매번 앱 전환으로 끊김
    return "ok";
  }, { maxAttempts: 2 });
  for (let i = 0; i < 5; i++) { await new Promise((r) => setTimeout(r, 5)); show(); }
  assert.equal(await result, "ok");
  assert.equal(calls, 6); // maxAttempts(2)보다 많이 다시 보냈다
}

// 2) 끊김 없는 일반 실패는 maxAttempts에서 멈춘다.
{
  let calls = 0;
  await assert.rejects(retryUpload(async () => { calls++; throw new RetryableUploadError("503"); }, { maxAttempts: 2 }), RetryableUploadError);
  assert.equal(calls, 2);
}

// 3) 재시도 대상이 아닌 오류는 바로 던진다.
{
  let calls = 0;
  await assert.rejects(retryUpload(async () => { calls++; throw new Error("400"); }), /400/);
  assert.equal(calls, 1);
}

// 4) 오프라인 동안 기다리다 중단하면 AbortError로 끝난다.
{
  navigator.onLine = false;
  win.dispatchEvent(new Event("offline"));
  const controller = new AbortController();
  const pending = retryUpload(async () => { throw new TypeError("offline"); }, { signal: controller.signal });
  setTimeout(() => controller.abort(), 5);
  await assert.rejects(pending, { name: "AbortError" });
  navigator.onLine = true;
}

console.log("upload-resume ok");
