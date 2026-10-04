import assert from "node:assert/strict";
import { getDesktopNextAction } from "../src/lib/project-next-action.ts";

const completed = getDesktopNextAction({ id: "p1", status: "delivered" });
assert.equal(completed.kind, "secondary");
assert.equal(completed.label, "최종본 보기");
assert.equal(completed.href, "/photographer/projects/p1/assets/final");
assert.equal(getDesktopNextAction({ id: "p1", status: "confirmed" }).href, "/photographer/projects/p1/assets/retouched");
assert.equal(getDesktopNextAction({ id: "p1", status: "selecting" }).kind, "waiting");
console.log("Completed project action opens final delivery; active actions preserved.");
