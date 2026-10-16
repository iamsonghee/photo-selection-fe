import assert from "node:assert/strict";
import { filenameWithoutExtension } from "../src/lib/text-file-download.ts";

for (const [filename, expected] of [
  ["사진.JPG", "사진"],
  ["shoot.edit.CR3", "shoot.edit"],
  ["FRAME_0001", "FRAME_0001"],
  [".hidden", ".hidden"],
  ["photo.", "photo."],
  ["", ""],
]) {
  assert.equal(filenameWithoutExtension(filename), expected);
}
console.log("filename export checks passed");
