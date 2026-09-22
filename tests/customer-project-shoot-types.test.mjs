import assert from "node:assert/strict";
import { isProjectShootType, projectShootTypeLabel } from "../src/lib/project-shoot-types.ts";

for (const value of ["wedding", "family", "graduation", "profile", "etc"]) {
  assert.equal(isProjectShootType(value), true);
}
assert.equal(isProjectShootType(null), false);
assert.equal(isProjectShootType("unknown"), false);
assert.equal(projectShootTypeLabel("wedding"), "웨딩");
assert.equal(projectShootTypeLabel(null), "촬영 종류 미입력");
