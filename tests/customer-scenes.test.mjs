import assert from "node:assert/strict";
import { formatSceneRange, sceneTargets, splitScenes } from "../src/lib/customer-scenes.ts";
import { exifTakenAtFromBytes } from "../src/lib/exif-taken-at.ts";

const pad = (n) => String(n).padStart(2, "0");
const at = (h, m, s = 0) => `2026-10-03T${pad(h)}:${pad(m)}:${pad(s)}`;
let order = 0;
const burst = (h, m, count) => Array.from({ length: count }, (_, i) => ({ id: `p${order}`, orderIndex: order++, takenAt: at(h, m, i % 60) }));

// 세 구간(11:00, 12:00, 13:30)이 30분 이상 떨어져 있으면 장면 3개.
const photos = [...burst(11, 0, 30), ...burst(12, 0, 40), ...burst(13, 30, 20)];
const scenes = splitScenes(photos);
assert.equal(scenes.length, 3);
assert.deepEqual(scenes.map((scene) => scene.photoIds.length), [30, 40, 20]);
assert.equal(formatSceneRange(scenes[0]), "오전 11:00");
assert.equal(formatSceneRange(scenes[2]), "오후 1:30");

// 업로드 순서가 섞여도 촬영 시각 순서로 장면을 만든다.
assert.deepEqual(splitScenes([...photos].reverse()).map((scene) => scene.photoIds.length), [30, 40, 20]);

// 10장 미만의 작은 구간은 앞 장면에 합친다.
order = 0;
const small = [...burst(10, 0, 25), ...burst(10, 40, 3), ...burst(11, 30, 25)];
assert.deepEqual(splitScenes(small).map((scene) => scene.photoIds.length), [28, 25]);

// 사진이 적거나 촬영 시각이 대부분 없으면 장면을 만들지 않는다.
assert.equal(splitScenes(burst(9, 0, 10)), null);
assert.equal(splitScenes(photos.map((photo, i) => (i % 2 ? photo : { ...photo, takenAt: null }))), null);

// 시각 없는 소수 사진은 마지막 "촬영 시각 없음" 장면으로 모은다.
const mostlyTimed = photos.map((photo, i) => (i < 5 ? { ...photo, takenAt: null } : photo));
const withUntimed = splitScenes(mostlyTimed);
assert.equal(withUntimed.at(-1).photoIds.length, 5);
assert.equal(formatSceneRange(withUntimed.at(-1)), "촬영 시각 없음");

// 목표 장수는 사진 비율로 나누고 합계가 정확히 맞는다.
assert.deepEqual(sceneTargets([30, 40, 20], 30), [10, 13, 7]);
assert.equal(sceneTargets([412, 870, 310, 255, 153], 30).reduce((a, b) => a + b, 0), 30);
assert.deepEqual(sceneTargets([10, 10], 0), [0, 0]);

// 최소 EXIF(빅엔디언 TIFF, IFD0 → ExifIFD → DateTimeOriginal) JPEG.
function jpegWithExif(date) {
  const ascii = [...date].map((c) => c.charCodeAt(0)).concat(0);
  const tiff = [
    0x4d, 0x4d, 0x00, 0x2a, 0, 0, 0, 8, // MM, IFD0 at 8
    0, 1, 0x87, 0x69, 0, 4, 0, 0, 0, 1, 0, 0, 0, 26, 0, 0, 0, 0, // IFD0: ExifIFD pointer → 26
    0, 1, 0x90, 0x03, 0, 2, 0, 0, 0, 20, 0, 0, 0, 44, 0, 0, 0, 0, // ExifIFD: DateTimeOriginal → 44
    ...ascii,
  ];
  const app1 = [..."Exif\0\0"].map((c) => c.charCodeAt(0)).concat(tiff);
  const length = app1.length + 2;
  return new Uint8Array([0xff, 0xd8, 0xff, 0xe1, length >> 8, length & 0xff, ...app1, 0xff, 0xd9]);
}
assert.equal(exifTakenAtFromBytes(jpegWithExif("2026:10:03 11:02:45")), "2026-10-03T11:02:45");
assert.equal(exifTakenAtFromBytes(new Uint8Array([0x89, 0x50, 0x4e, 0x47])), null);
assert.equal(exifTakenAtFromBytes(new Uint8Array([0xff, 0xd8, 0xff, 0xda, 0, 2])), null);

console.log("customer-scenes ok");
