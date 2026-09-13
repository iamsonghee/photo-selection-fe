import { expect, test } from "@playwright/test";
import fs from "fs";
import path from "path";
import ts from "typescript";

// Real browser worker and synthetic detail target, not a portrait quality study.
test("smaller intermediate retains source dimensions and final-size detail", async ({ page }, testInfo) => {
  const source = ts.transpile(fs.readFileSync(path.join(__dirname, "../../../src/workers/upload-compress.worker.ts"), "utf8"), { target: ts.ScriptTarget.ES2020 });
  const result = await page.evaluate(async source => {
    const canvas = new OffscreenCanvas(3600, 2400);
    const ctx = canvas.getContext("2d")!;
    const gradient = ctx.createLinearGradient(0, 0, 3600, 2400);
    gradient.addColorStop(0, "#ead0b4"); gradient.addColorStop(0.5, "#638cb2"); gradient.addColorStop(1, "#23463b");
    ctx.fillStyle = gradient; ctx.fillRect(0, 0, 3600, 2400);
    for (let y = 0; y < 2400; y += 18) {
      ctx.strokeStyle = `rgba(30,40,50,${(y % 90) / 180 + 0.1})`;
      ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(3600, y + 300); ctx.stroke();
    }
    ctx.fillStyle = "#fff"; ctx.font = "180px serif"; ctx.fillText("Photo detail 012345", 200, 1000);
    const raw = new File([await canvas.convertToBlob({ type: "image/png" })], "detail.png", { type: "image/png" });
    const url = URL.createObjectURL(new Blob([source], { type: "text/javascript" }));
    const worker = new Worker(url);
    const compress = (maxEdge: number) => new Promise<{ blob: Blob; sourceWidth: number; sourceHeight: number }>((resolve, reject) => {
      worker.onmessage = event => event.data.blob ? resolve(event.data) : reject(new Error("worker failed"));
      worker.onerror = reject;
      worker.postMessage({ id: maxEdge, file: raw, maxEdge, jpegQuality: 0.82 });
    });
    try {
      const old = await compress(3200), next = await compress(1600);
      const pixels = async (blob: Blob) => {
        const bitmap = await createImageBitmap(blob);
        const width = bitmap.width, height = bitmap.height;
        const preview = new OffscreenCanvas(1200, 800);
        const pc = preview.getContext("2d")!;
        pc.imageSmoothingQuality = "high"; pc.drawImage(bitmap, 0, 0, 1200, 800); bitmap.close();
        return { data: pc.getImageData(0, 0, 1200, 800).data, width, height };
      };
      const [a, b] = await Promise.all([pixels(old.blob), pixels(next.blob)]);
      let mse = 0;
      for (let i = 0; i < a.data.length; i++) if (i % 4 !== 3) mse += (a.data[i] - b.data[i]) ** 2;
      mse /= 1200 * 800 * 3;
      return { oldBytes: old.blob.size, newBytes: next.blob.size, width: b.width, height: b.height,
        sourceWidth: next.sourceWidth, sourceHeight: next.sourceHeight, psnrDb: 10 * Math.log10(255 ** 2 / mse) };
    } finally { worker.terminate(); URL.revokeObjectURL(url); }
  }, source);
  expect(result).toMatchObject({ width: 1600, height: 1067, sourceWidth: 3600, sourceHeight: 2400 });
  expect(result.newBytes).toBeLessThan(result.oldBytes);
  expect(result.psnrDb).toBeGreaterThan(28);
  await testInfo.attach("compression-comparison.json", { body: JSON.stringify(result, null, 2), contentType: "application/json" });
  console.log("compression comparison", result);
});
