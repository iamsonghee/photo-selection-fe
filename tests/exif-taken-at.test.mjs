import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { readTakenAt } from "../src/lib/exif-taken-at.ts";

// HEIC(pillow-heif로 만든 32px, DateTimeOriginal 2025:11:09 14:03:27) — 브라우저 압축 전 원본에서 촬영 시각을 읽는다.
const heic = new File([readFileSync(new URL("./fixtures/taken-at.heic", import.meta.url))], "IMG_0001.HEIC", { type: "image/heic", lastModified: 0 });
assert.deepEqual(await readTakenAt(heic), { takenAt: "2025-11-09T14:03:27", source: "exif" });

// 이미지가 아닌 파일은 수정 시각으로 대체(장면 경계에는 안 씀).
const junk = new File([new Uint8Array(64)], "x.heic", { lastModified: Date.UTC(2026, 0, 1) });
assert.equal((await readTakenAt(junk)).source, "file");
