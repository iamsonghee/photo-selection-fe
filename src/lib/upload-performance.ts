import { z } from "zod";

const count = z.number().int().min(0).max(1_000_000);
const bytes = z.number().int().min(0).max(1_000_000_000_000);
const duration = z.number().int().min(0).max(2_678_400_000);
const nullableDuration = duration.nullable();

const originalConcurrency = z.object({
  initial: count,
  current: count,
  minimum: count,
  maximum: count,
  adjustments: count,
  measuredWindows: count,
}).strip().nullable();

const fileStageMs = z.object({
  queued: duration,
  preparing: duration,
  ready: duration,
  previewSending: duration,
  previewProcessing: duration,
  originalSending: duration,
  confirming: duration,
  retrying: duration,
  completed: duration,
  failed: duration,
}).strip();

const uploadPerformanceSchema = z.object({
  version: z.literal(3),
  previewBytes: bytes,
  device: z.enum(["pc", "mobile"]),
  includesOriginal: z.boolean(),
  fileCount: count,
  sourceBytes: bytes,
  transferredBytes: bytes,
  savedCount: count,
  failedCount: count,
  retryCount: count,
  outcome: z.enum(["completed", "incomplete", "stopped", "interrupted"]),
  elapsedMs: duration,
  firstOriginalMs: nullableDuration,
  firstSavedMs: nullableDuration,
  finalizeMs: duration,
  originalConcurrency,
  fileStageMs,
  uploadStrategy: z.enum(["preview_first", "parallel"]).nullable(),
}).strip();

export type UploadPerformanceInsert = ReturnType<typeof parseUploadPerformance>;

export function parseUploadPerformance(input: unknown) {
  const value = uploadPerformanceSchema.parse(input);
  return {
    device: value.device,
    includes_original: value.includesOriginal,
    file_count: value.fileCount,
    source_bytes: value.sourceBytes,
    transferred_bytes: value.transferredBytes,
    saved_count: value.savedCount,
    failed_count: value.failedCount,
    retry_count: value.retryCount,
    outcome: value.outcome,
    elapsed_ms: value.elapsedMs,
    first_original_ms: value.firstOriginalMs,
    first_saved_ms: value.firstSavedMs,
    finalize_ms: value.finalizeMs,
    original_concurrency: value.originalConcurrency,
    file_stage_ms: value.fileStageMs,
    upload_strategy: value.uploadStrategy,
  };
}
