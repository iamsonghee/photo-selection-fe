import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import ts from "typescript";

// Two final selections and thirteen retained candidate records, as in the reported project.
let selections = Array.from({ length: 15 }, (_, i) => ({
  project_id: "project",
  photo_id: `photo-${i}`,
  is_selected: i < 2,
  rating: i === 2 ? 4 : 0,
  color_tags: i === 2 ? ["red"] : [],
  comment: i === 2 ? "보존할 메모" : null,
}));
const photos = selections.map((row, number) => ({ id: row.photo_id, project_id: row.project_id, number }));
let selectionError = null;
const supabase = {
  from(table) {
    const conditions = [];
    let start = 0, end = Infinity;
    const query = {
      select() { return query; },
      eq(key, value) { conditions.push([key, value]); return query; },
      order() { return query; },
      range(first, last) { start = first; end = last; return query; },
      then(resolve) {
        const rows = table === "photos" ? photos : selections;
        return Promise.resolve({
          data: rows.filter(row => conditions.every(([key, value]) => row[key] === value)).slice(start, end + 1),
          error: table === "selections" ? selectionError : null,
        }).then(resolve);
      },
    };
    return query;
  },
};
const loadedModule = { exports: {} };
vm.runInNewContext(ts.transpileModule(fs.readFileSync("src/lib/db.ts", "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText, {
  module: loadedModule,
  exports: loadedModule.exports,
  require(name) { assert.equal(name, "@/lib/supabase"); return { supabase }; },
});
const { getPhotosWithSelections } = loadedModule.exports;
const result = await getPhotosWithSelections("project");
assert.deepEqual([...result.selectedIds], ["photo-0", "photo-1"]);
assert.equal(result.photos.filter(photo => photo.selected).length, 2);
assert.equal(result.photos.length, 15);
assert.equal(result.photos[2].selected, false);
assert.equal(result.photoStates["photo-2"].rating, 4);
assert.equal(result.photoStates["photo-2"].color.join(), "red");
assert.equal(result.photoStates["photo-2"].comment, "보존할 메모");
assert.equal(result.photos[2].comment, "보존할 메모");

selections = selections.map(row => ({ ...row, is_selected: false }));
assert.equal((await getPhotosWithSelections("project")).selectedIds.size, 0);
selections = [];
assert.equal((await getPhotosWithSelections("project")).selectedIds.size, 0);
selectionError = new Error("selection query failed");
await assert.rejects(getPhotosWithSelections("project"), /selection query failed/);
console.log("Photographer selection counts, retained feedback, empty selections and query errors passed.");
