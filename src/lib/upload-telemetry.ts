/** Session-local counters only: never retain File objects, names, keys, URLs or account IDs. */
export type UploadStage = "queued" | "preparing" | "ready" | "previewSending" | "previewProcessing" | "originalSending" | "confirming" | "retrying" | "completed" | "failed";
export type UploadOutcome = "completed" | "incomplete" | "stopped" | "interrupted";
export type OriginalConcurrencyReport = {
  initial: number; current: number; minimum: number; maximum: number;
  adjustments: number; measuredWindows: number;
};
const STAGES: UploadStage[] = ["queued", "preparing", "ready", "previewSending", "previewProcessing", "originalSending", "confirming", "retrying", "completed", "failed"];
export const UPLOAD_SAMPLE_MS = 500;
const ETA_WINDOW_MS = 15_000;
const ETA_MIN_SAMPLE_MS = 3_000;
const ETA_STALE_MS = 5_000;

export class UploadTelemetry {
  private readonly started: number;
  private readonly items: { size: number; loaded: number; stage: UploadStage; since: number }[];
  private readonly stageMs = Object.fromEntries(STAGES.map(stage => [stage, 0])) as Record<UploadStage, number>;
  private originalStages = new Map<number, { stage: UploadStage; since: number }>();
  private previewBytes = 0;
  private samples: { at: number; bytes: number }[] = [];
  private lastBytes = 0;
  private lastChange: number;
  private retries = 0;
  private finished: number | null = null;
  private outcome: UploadOutcome | null = null;
  private firstOriginalMs: number | null = null;
  private firstSavedMs: number | null = null;
  private finalizeMs = 0;
  private originalConcurrency: OriginalConcurrencyReport | null = null;
  finalizing = false;

  constructor(sizes: number[], readonly includesOriginal: boolean, readonly device: "pc" | "mobile", private readonly now = () => performance.now()) {
    this.started = this.lastChange = now();
    this.items = sizes.map(size => ({ size, loaded: 0, stage: "queued", since: this.started }));
    this.samples.push({ at: this.started, bytes: 0 });
  }

  stage(index: number, stage: UploadStage) {
    const item = this.items[index];
    if (!item || this.finished !== null || item.stage === stage || item.stage === "failed" || item.stage === "completed") return;
    const now = this.now();
    this.stageMs[item.stage] += now - item.since;
    item.stage = stage;
    item.since = now;
    if (stage === "retrying") {
      this.retries++;
      this.samples = []; // Do not carry the pre-failure speed into a new attempt.
    }
    if (stage === "originalSending" && this.firstOriginalMs === null) this.firstOriginalMs = now - this.started;
    if (stage === "completed" && this.firstSavedMs === null) this.firstSavedMs = now - this.started;
  }

  originalStage(index: number, stage: "originalSending" | "confirming" | "retrying" | null) {
    if (this.finished !== null) return;
    const previous = this.originalStages.get(index);
    if (previous?.stage === stage) return;
    const now = this.now();
    if (previous) this.stageMs[previous.stage] += now - previous.since;
    if (stage) this.originalStages.set(index, { stage, since: now });
    else this.originalStages.delete(index);
    if (stage === "originalSending" && this.firstOriginalMs === null) this.firstOriginalMs = now - this.started;
    if (stage === "retrying") { this.retries++; this.samples = []; }
  }

  addPreviewBytes(bytes: number) { this.previewBytes += bytes; }

  progress(index: number, loaded: number) {
    const item = this.items[index];
    // A retransmission must neither double count bytes nor send the displayed progress backwards.
    if (item && this.finished === null) item.loaded = Math.max(item.loaded, Math.min(item.size, Math.max(0, loaded)));
  }

  finalize(durationMs: number) { this.finalizeMs = durationMs; }
  setOriginalConcurrency(report: OriginalConcurrencyReport) { this.originalConcurrency = report; }

  finish(outcome: UploadOutcome) {
    if (this.finished !== null) return;
    for (const index of this.originalStages.keys()) this.originalStage(index, null);
    this.finished = this.now();
    this.outcome = outcome;
    for (const item of this.items) this.stageMs[item.stage] += this.finished - item.since;
  }

  snapshot() {
    const now = this.finished ?? this.now();
    const counts = Object.fromEntries(STAGES.map(stage => [stage, 0])) as Record<UploadStage, number>;
    let bytes = 0;
    let totalBytes = 0;
    for (const [index, item] of this.items.entries()) {
      const original = this.originalStages.get(index);
      const terminal = item.stage === "failed" || item.stage === "completed";
      counts[terminal || item.stage === "retrying" ? item.stage : original?.stage ?? item.stage]++;
      bytes += item.loaded;
      totalBytes += item.size;
    }
    if (bytes > this.lastBytes) { this.lastChange = now; this.lastBytes = bytes; }
    this.samples.push({ at: now, bytes });
    while (this.samples.length > 1 && this.samples[0].at < now - ETA_WINDOW_MS) this.samples.shift();
    const first = this.samples[0];
    const elapsed = now - first.at;
    const rate = elapsed >= ETA_MIN_SAMPLE_MS && now - this.lastChange < ETA_STALE_MS
      ? (bytes - first.bytes) / (elapsed / 1000) : 0;
    const remaining = totalBytes - bytes;
    const seconds = rate > 0 && remaining > 0 && counts.retrying === 0 && counts.failed === 0 ? remaining / rate : null;
    const percent = totalBytes > 0 ? Math.min(100, Math.floor(bytes / totalBytes * 100)) : 0;
    return { counts, bytes, totalBytes, percent, rate, etaSeconds: seconds, total: this.items.length, finalizing: this.finalizing };
  }

  report() {
    return {
      version: 3, previewBytes: this.previewBytes, device: this.device, includesOriginal: this.includesOriginal,
      fileCount: this.items.length, sourceBytes: this.items.reduce((sum, item) => sum + item.size, 0),
      savedCount: this.items.filter(item => item.stage === "completed").length,
      failedCount: this.items.filter(item => item.stage === "failed").length,
      transferredBytes: this.items.reduce((sum, item) => sum + item.loaded, 0),
      outcome: this.outcome, elapsedMs: Math.round((this.finished ?? this.now()) - this.started),
      retryCount: this.retries, firstOriginalMs: this.firstOriginalMs, firstSavedMs: this.firstSavedMs,
      finalizeMs: Math.round(this.finalizeMs),
      originalConcurrency: this.originalConcurrency,
      // Parallel file durations overlap. Do not sum these to infer session wall time.
      fileStageMs: Object.fromEntries(Object.entries(this.stageMs).map(([key, value]) => [key, Math.round(value)])),
    };
  }
}

export type UploadSnapshot = ReturnType<UploadTelemetry["snapshot"]>;

export function formatUploadBytes(bytes: number): string {
  if (bytes >= 1024 ** 3) return `${(bytes / 1024 ** 3).toFixed(1)}GB`;
  if (bytes >= 1024 ** 2) return `${(bytes / 1024 ** 2).toFixed(1)}MB`;
  if (bytes >= 1024) return `${Math.round(bytes / 1024)}KB`;
  return `${Math.round(bytes)}B`;
}

export function describeUpload(snapshot: UploadSnapshot, includesOriginal: boolean) {
  const { counts, percent, etaSeconds } = snapshot;
  const sending = counts.originalSending + counts.previewSending;
  const checking = counts.confirming + counts.previewProcessing;
  const label = counts.retrying > 0 ? `다시 시도 중 · ${counts.retrying}장`
    : sending > 0 ? (counts.originalSending > 0 ? `원본 전송 중 · ${percent}%` : "미리보기 전송 중")
    : snapshot.finalizing || checking > 0 ? "저장 확인 중"
    : counts.failed > 0 && counts.preparing + counts.queued + counts.ready === 0 ? "업로드 확인 필요"
    : "사진 준비 중";
  const eta = counts.failed > 0 ? "실패한 사진 확인 필요" : counts.retrying > 0 ? "연결 확인 후 다시 전송합니다" : etaSeconds === null ? (snapshot.bytes < snapshot.totalBytes ? "남은 시간 계산 중" : "저장 확인 중")
    : etaSeconds < 60 ? "전송 약 1분 미만 남음"
    : `전송 약 ${Math.max(1, Math.floor(etaSeconds * 0.8 / 60))}~${Math.ceil(etaSeconds * 1.2 / 60)}분 남음`;
  const details = `${counts.completed}/${snapshot.total}장 저장 완료${counts.failed ? ` · 실패 ${counts.failed}장` : ""}`;
  const transfer = includesOriginal ? `${formatUploadBytes(snapshot.bytes)} / ${formatUploadBytes(snapshot.totalBytes)} 전송` : `${percent}% 전송`;
  return { label, details, transfer, eta, checking: sending === 0 && counts.retrying === 0 && (checking > 0 || snapshot.finalizing) };
}
