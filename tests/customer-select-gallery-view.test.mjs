import assert from "node:assert/strict";
import { collapseSimilarityGroups } from "../src/app/customer-select/_lib/gallery-view.ts";

const photos = [
  { id: "a", similarityGroupId: "group-1" },
  { id: "b", similarityGroupId: "group-1" },
  { id: "c", similarityGroupId: null },
];

assert.deepEqual(collapseSimilarityGroups(photos, new Set()).map((photo) => photo.id), ["a", "c"]);
assert.deepEqual(collapseSimilarityGroups(photos, new Set(["group-1"])).map((photo) => photo.id), ["a", "b", "c"]);
