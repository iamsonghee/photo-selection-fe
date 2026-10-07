import assert from "node:assert/strict";
import { buildUnambiguousVersionMapping } from "../src/lib/version-mapping.ts";

const targets = [
  { id: "1", filename: "DSC_1024.JPG" },
  { id: "2", filename: "DSC_1031.JPG" },
];
const files = ["DSC_1024_edit.jpg", "DSC_1031_보정_v2.jpg"].map((name) => new File(["x"], name, { type: "image/jpeg" }));
assert.deepEqual(buildUnambiguousVersionMapping(files, targets).map((row) => row.file?.name), files.map((file) => file.name));
assert.equal(buildUnambiguousVersionMapping([new File(["x"], "final_01.jpg")], targets).filter((row) => row.file).length, 0);
assert.equal(buildUnambiguousVersionMapping([new File(["x"], "DSC_1024_edit.jpg")], [
  { id: "1", filename: "DSC_1024.JPG" }, { id: "2", filename: "DSC_1024.PNG" },
]).filter((row) => row.file).length, 0);
