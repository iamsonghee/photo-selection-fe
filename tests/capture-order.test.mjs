import assert from "node:assert/strict";
import { captureOrder, filenameSequence } from "../src/lib/customer-scenes.ts";

// 파일명 연번 — clip-service `_filename_sequence`와 같은 규칙.
assert.deepEqual(filenameSequence(["IMG_1003.jpg", "IMG_1001.jpg", "IMG_1002.jpg"]), [1003, 1001, 1002]);
assert.deepEqual(filenameSequence(["0003_SJ8_1404.jpg", "0001_SJ7_3213.jpg", "0002_SJ7_3214.jpg"]), [3, 1, 2]); // 앞 연번 + 카메라 원래 이름
for (const ambiguous of [
  ["20261008_102030.jpg", "20261007_101010.jpg"], // 휴대폰 날짜 이름
  ["IMG_1002.jpg", "DSC_1001.jpg"], // 체계가 다름
  ["IMG_1001.jpg", "IMG_1001.jpg"], // 번호 중복
  ["IMG_9999.jpg", "IMG_0001.jpg"], // 범위가 너무 넓음
  ["IMG_2.jpg", "IMG_1.jpg"], // 짧은 번호
  ["0002_a.jpg", "00001_b.jpg"], // 앞 번호 자릿수가 다름
]) assert.equal(filenameSequence(ambiguous), null, ambiguous.join(","));

const photo = (filename, orderIndex, takenAt = null, takenAtSource = null) => ({ filename, orderIndex, takenAt, takenAtSource });
const names = (list) => list.map((p) => p.filename);
// 시각 없는 보정본: 역순으로 올라가도 파일명 연번 순서.
assert.deepEqual(names(captureOrder([photo("0003_A.jpg", 0, "2026-10-12T08:14:31", "file"), photo("0001_A.jpg", 1, "2026-10-12T08:14:31", "file"), photo("0002_A.jpg", 2, "2026-10-12T08:14:30", "file")], (p) => p)),
  ["0001_A.jpg", "0002_A.jpg", "0003_A.jpg"]);
// 연번이 아니면 업로드 순서(파일 수정 시각은 무시).
assert.deepEqual(names(captureOrder([photo("b.jpg", 1, "2026-10-12T08:00:00", "file"), photo("a.jpg", 0, "2026-10-12T09:00:00", "file")], (p) => p)), ["a.jpg", "b.jpg"]);
// EXIF 시각이 있으면 시각순, 시각 없는 사진(파일 수정 시각 포함)은 뒤에 업로드 순.
assert.deepEqual(names(captureOrder([
  photo("x.jpg", 0, "2026-10-12T08:00:00", "file"), photo("late.jpg", 1, "2026-10-03T12:00:00", "exif"),
  photo("early.jpg", 2, "2026-10-03T11:00:00", "exif"), photo("y.jpg", 3, null, null),
], (p) => p)), ["early.jpg", "late.jpg", "x.jpg", "y.jpg"]);
// 입력 배열은 바꾸지 않는다.
const input = [photo("0002_A.jpg", 0), photo("0001_A.jpg", 1)];
captureOrder(input, (p) => p);
assert.deepEqual(names(input), ["0002_A.jpg", "0001_A.jpg"]);
console.log("capture-order ok");
