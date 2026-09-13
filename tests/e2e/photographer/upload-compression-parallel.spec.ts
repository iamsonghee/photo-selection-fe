import { expect, test } from "@playwright/test";
import fs from "fs";
import path from "path";
import ts from "typescript";

test("compression pool uses multiple PC workers while preserving file order", async ({ page }) => {
  const moduleSource = fs.readFileSync(
    path.join(__dirname, "../../../src/lib/upload-client-compress.ts"),
    "utf8",
  ).replace(
    'new URL("../workers/upload-compress.worker.ts", import.meta.url)',
    '"mock-upload-worker.js"',
  );
  const source = ts.transpile(moduleSource, {
    target: ts.ScriptTarget.ES2020,
    module: ts.ModuleKind.ES2020,
  }).replaceAll("export ", "");

  const result = await page.evaluate(async source => {
    let active = 0;
    let peak = 0;
    class MockWorker {
      private listeners = new Map<string, Set<(event: unknown) => void>>();
      addEventListener(type: string, listener: (event: unknown) => void) {
        const listeners = this.listeners.get(type) ?? new Set();
        listeners.add(listener);
        this.listeners.set(type, listeners);
      }
      removeEventListener(type: string, listener: (event: unknown) => void) {
        this.listeners.get(type)?.delete(listener);
      }
      postMessage(message: { id: number; file: File }) {
        active++;
        peak = Math.max(peak, active);
        setTimeout(() => {
          active--;
          const event = {
            data: {
              id: message.id,
              blob: new Blob([new Uint8Array(128 * 1024)], { type: "image/jpeg" }),
              sourceWidth: 4000,
              sourceHeight: 3000,
            },
          };
          this.listeners.get("message")?.forEach(listener => listener(event));
        }, message.file.name === "second.jpg" ? 5 : 15);
      }
      terminate() { /* no-op test worker */ }
    }
    Object.defineProperty(globalThis, "Worker", { configurable: true, value: MockWorker });
    Object.defineProperty(globalThis, "OffscreenCanvas", { configurable: true, value: class MockCanvas {} });
    const compressImagesInParallel = new Function(`${source}; return compressImagesInParallel;`)() as (
      files: File[], signal: AbortSignal, poolSize: number, options?: unknown, onDone?: unknown,
      metadata?: Array<{ width: number | null; height: number | null }>,
    ) => Promise<File[]>;
    const files = ["first.jpg", "second.jpg", "third.jpg"].map(name =>
      new File([new Uint8Array(700 * 1024)], name, { type: "image/jpeg" }));
    const metadata: Array<{ width: number | null; height: number | null }> = [];
    const output = await compressImagesInParallel(files, new AbortController().signal, 3, undefined, undefined, metadata);
    return { peak, names: output.map(file => file.name), metadata };
  }, source);

  expect(result.peak).toBe(3);
  expect(result.names).toEqual(["first.jpg", "second.jpg", "third.jpg"]);
  expect(result.metadata).toEqual(result.names.map(() => ({ width: 4000, height: 3000 })));
});
