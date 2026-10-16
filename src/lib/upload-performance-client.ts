import type { UploadTelemetry } from "@/lib/upload-telemetry";

type UploadReport = ReturnType<UploadTelemetry["report"]>;

/** Best-effort telemetry only: neither serialization nor transport may fail the upload flow. */
export function sendUploadPerformance(
  report: UploadReport,
  uploadStrategy: "preview_first" | "parallel" | null,
) {
  try {
    const body = JSON.stringify({ ...report, uploadStrategy });
    if (typeof navigator.sendBeacon === "function") {
      const queued = navigator.sendBeacon(
        "/api/photographer/upload-performance",
        new Blob([body], { type: "application/json" }),
      );
      if (queued) return;
    }
    void fetch("/api/photographer/upload-performance", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
      keepalive: true,
    }).catch(() => {});
  } catch {
    // Measurement must never change the upload result.
  }
}
