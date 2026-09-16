import assert from "node:assert/strict";
import { selectGridPhotos, selectPhotoRange } from "../src/lib/drag-selection.ts";

const photos = Array.from({ length: 500 }, (_, i) => ({ id: String(i), isPending: i === 1, isUploading: i === 2 }));
const grid = { width: 440, paddingX: 10, paddingTop: 10, gap: 10, cols: 4, rowHeight: 110, leading: false };
// Includes rows far beyond the rendered viewport, excluding in-flight uploads.
assert.equal(selectGridPhotos(photos, { left: 0, top: 0, width: 440, height: 20000 }, grid).size, 498);
assert.deepEqual([...selectGridPhotos(photos, { left: 10, top: 1110, width: 97, height: 100 }, grid)], ["40"]);
assert.deepEqual([...selectGridPhotos(photos, { left: 10, top: 110, width: 97, height: 10 }, grid)], []);
assert.deepEqual([...selectGridPhotos(photos, { left: 10, top: 10, width: 97, height: 100 }, grid, ["450"])], ["450", "0"]);
assert.equal(selectGridPhotos(photos, { left: 10, top: 10, width: 97, height: 100 }, { ...grid, leading: true }).size, 0);
assert.deepEqual([...selectPhotoRange(["a", "b", "c", "d"], "b", "d", ["x"])], ["x", "b", "c", "d"]);
console.log("drag selection: off-screen rows, gaps, pending photos, additive selection and leading cell passed");
