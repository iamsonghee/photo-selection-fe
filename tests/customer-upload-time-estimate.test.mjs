import assert from "node:assert/strict";
import { estimateUploadRemainingSeconds, formatUploadRemainingTime } from "../src/lib/upload-time-estimate.ts";

assert.equal(estimateUploadRemainingSeconds([], 100), null);
assert.equal(estimateUploadRemainingSeconds([{ milliseconds: 20_000, photoCount: 20 }], 40), 40);
assert.equal(estimateUploadRemainingSeconds([
  { milliseconds: 20_000, photoCount: 20 },
  { milliseconds: 40_000, photoCount: 20 },
], 20), 30);
assert.equal(formatUploadRemainingTime(40), "1분 미만 남음");
assert.equal(formatUploadRemainingTime(60), "약 1분 남음");
assert.equal(formatUploadRemainingTime(121), "약 3분 남음");
assert.equal(formatUploadRemainingTime(3_601), "약 1시간 1분 남음");
