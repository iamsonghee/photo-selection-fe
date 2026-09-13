import { expect, test } from "@playwright/test";
import { UploadTelemetry, describeUpload } from "../../../src/lib/upload-telemetry";

// No network/storage mutations: exercise byte accounting and timing with a deterministic clock.
test("original bytes advance during a file, retries never double count, confirmation is separate", () => {
  let now = 0;
  const tracker = new UploadTelemetry([1000, 3000], true, "pc", () => now);
  tracker.stage(0, "originalSending");
  tracker.progress(0, 500);
  expect(tracker.snapshot().percent).toBe(12);
  tracker.stage(0, "retrying");
  tracker.progress(0, 100);
  expect(tracker.snapshot().bytes).toBe(500);
  expect(describeUpload(tracker.snapshot(), true).label).toContain("다시 시도");
  now = 2000;
  tracker.progress(0, 1000);
  tracker.stage(0, "confirming");
  expect(tracker.snapshot().counts.completed).toBe(0);
  tracker.stage(0, "completed");
  tracker.stage(1, "failed");
  expect(tracker.snapshot().counts.completed).toBe(1);
  expect(tracker.snapshot().percent).toBe(25);
  expect(describeUpload(tracker.snapshot(), true).details).toBe("1/2장 저장 완료 · 실패 1장");
});

test("ETA waits for samples, expires when stalled, and is hidden during retries", () => {
  let now = 0;
  const tracker = new UploadTelemetry([100_000], true, "mobile", () => now);
  tracker.stage(0, "originalSending");
  tracker.progress(0, 1000);
  expect(tracker.snapshot().etaSeconds).toBeNull();
  now = 4000;
  tracker.progress(0, 10_000);
  expect(tracker.snapshot().etaSeconds).toBeGreaterThan(0);
  now = 10_000;
  expect(tracker.snapshot().etaSeconds).toBeNull();
  tracker.stage(0, "retrying");
  tracker.progress(0, 12_000);
  expect(tracker.snapshot().etaSeconds).toBeNull();
});

test("100% transmitted does not mean saved; failed confirmation stays visible", () => {
  const tracker = new UploadTelemetry([2000], true, "mobile");
  tracker.progress(0, 2000);
  tracker.stage(0, "confirming");
  const copy = describeUpload(tracker.snapshot(), true);
  expect(copy.label).toBe("저장 확인 중");
  expect(copy.details).toBe("0/1장 저장 완료");
  tracker.stage(0, "failed");
  expect(describeUpload(tracker.snapshot(), true).eta).toBe("실패한 사진 확인 필요");
});

test("performance report retains outcome and timings without file identifiers", () => {
  let now = 0;
  const tracker = new UploadTelemetry([100], true, "pc", () => now);
  tracker.stage(0, "preparing");
  now = 300;
  tracker.stage(0, "previewSending");
  now = 500;
  tracker.stage(0, "previewProcessing");
  now = 800;
  tracker.stage(0, "originalSending");
  now = 1800;
  tracker.stage(0, "confirming");
  now = 2000;
  tracker.stage(0, "completed");
  tracker.finalize(50);
  tracker.setOriginalConcurrency({ initial: 2, current: 3, minimum: 1, maximum: 5, adjustments: 1, measuredWindows: 1 });
  now = 2050;
  tracker.finish("completed");
  tracker.finish("interrupted");
  expect(tracker.report()).toMatchObject({
    version: 3, outcome: "completed", elapsedMs: 2050, firstOriginalMs: 800, firstSavedMs: 2000,
    finalizeMs: 50, fileStageMs: { preparing: 300, previewSending: 200, previewProcessing: 300, originalSending: 1000, confirming: 200 },
    originalConcurrency: { initial: 2, current: 3, minimum: 1, maximum: 5, adjustments: 1, measuredWindows: 1 },
  });
  expect(JSON.stringify(tracker.report())).not.toMatch(/filename|source_key|job_id|url|token/i);
});

test("parallel mixed stages prioritize active transfer rather than generic server processing", () => {
  const tracker = new UploadTelemetry([100, 100], true, "pc");
  tracker.stage(0, "confirming");
  tracker.stage(1, "originalSending");
  expect(describeUpload(tracker.snapshot(), true).label).toContain("원본 전송 중");
  expect(describeUpload(tracker.snapshot(), true).checking).toBe(false);
});
