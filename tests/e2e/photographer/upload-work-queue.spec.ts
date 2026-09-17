import { expect, test } from "@playwright/test";
import { AdaptiveUploadConcurrency, MobilePreviewPriorityGate, UploadWorkQueue, uploadDeferred } from "../../../src/lib/upload-work-queue";
import { UploadTelemetry, describeUpload } from "../../../src/lib/upload-telemetry";

test("request slots cap concurrency and recover capacity after rejection", async () => {
  const queue = new UploadWorkQueue(2);
  const gates = [uploadDeferred<void>(), uploadDeferred<void>(), uploadDeferred<void>()];
  const started: number[] = [];
  let active = 0, peak = 0;
  const tasks = gates.map((gate, index) => queue.run(async () => {
    started.push(index); active++; peak = Math.max(peak, active);
    await gate.promise; active--;
    if (index === 0) throw new Error("network failure");
  }));
  const settled = Promise.allSettled(tasks);
  await Promise.resolve();
  expect(started).toEqual([0, 1]);
  gates[0].resolve();
  await expect.poll(() => started.length).toBe(3);
  gates[1].resolve(); gates[2].resolve();
  expect((await settled)[0].status).toBe("rejected");
  expect(peak).toBe(2);
});

test("mobile allows one original per five registered previews, then releases the remainder", async () => {
  const gate = new MobilePreviewPriorityGate(5);
  let started = 0;
  const first = gate.waitForOriginal().then(() => started++);
  for (let i = 0; i < 4; i++) gate.recordPreview();
  await Promise.resolve();
  expect(started).toBe(0);
  gate.recordPreview();
  await first;
  expect(started).toBe(1);

  const second = gate.waitForOriginal().then(() => started++);
  gate.recordPreview();
  await Promise.resolve();
  expect(started).toBe(1);
  gate.finishPreviews();
  await second;
  expect(started).toBe(2);
});

test("preview preparation cannot overwrite simultaneous original progress or premature completion", () => {
  let now = 0;
  const tracker = new UploadTelemetry([1000], true, "pc", () => now);
  tracker.originalStage(0, "originalSending");
  tracker.stage(0, "preparing");
  tracker.progress(0, 300);
  now = 100;
  tracker.stage(0, "previewSending");
  expect(describeUpload(tracker.snapshot(), true).label).toBe("원본 전송 중 · 30%");
  expect(tracker.snapshot().counts.completed).toBe(0);
  now = 200;
  tracker.originalStage(0, null);
  tracker.stage(0, "previewProcessing");
  expect(tracker.snapshot().counts.previewProcessing).toBe(1);
  now = 300;
  tracker.originalStage(0, "confirming");
  now = 400;
  tracker.originalStage(0, null);
  tracker.stage(0, "completed");
  tracker.finish("completed");
  expect(tracker.report().fileStageMs.originalSending).toBe(200);
  expect(tracker.report().fileStageMs.preparing).toBe(100);
  expect(tracker.report().firstSavedMs).toBe(400);
});

test("queue concurrency can grow and shrink without cancelling active work", async () => {
  const queue = new UploadWorkQueue(1);
  const gates = [uploadDeferred<void>(), uploadDeferred<void>(), uploadDeferred<void>()];
  const started: number[] = [];
  const tasks = gates.map((gate, index) => queue.run(async () => {
    started.push(index);
    await gate.promise;
  }));
  await expect.poll(() => started).toEqual([0]);
  queue.setConcurrency(2);
  await expect.poll(() => started).toEqual([0, 1]);
  queue.setConcurrency(1);
  gates[0].resolve();
  await Promise.resolve();
  expect(started).toEqual([0, 1]);
  gates[1].resolve();
  await expect.poll(() => started).toEqual([0, 1, 2]);
  gates[2].resolve();
  await Promise.all(tasks);
});

test("measured original throughput probes upward and backs off when aggregate rate falls", () => {
  const changes: number[] = [];
  const adaptive = new AdaptiveUploadConcurrency(2, 1, 4, value => changes.push(value));
  for (let i = 0; i < 4; i++) adaptive.record(1024 * 1024, 1000, true);
  expect(adaptive.report().current).toBe(3);
  for (let i = 0; i < 6; i++) adaptive.record(1024 * 1024, 1000, true);
  expect(adaptive.report().current).toBe(4);
  for (let i = 0; i < 8; i++) adaptive.record(1024 * 1024, 4000, true);
  expect(adaptive.report().current).toBe(3);
  adaptive.record(1024 * 1024, 1000, false);
  expect(adaptive.report()).toMatchObject({ initial: 2, current: 2, minimum: 1, maximum: 4, adjustments: 4, measuredWindows: 3 });
  expect(changes).toEqual([3, 4, 3, 2]);
});
