import assert from "node:assert/strict";
import { redistributeSceneTargets, sceneTargetsWithEdits } from "../src/lib/scene-targets.ts";

const weights = [12, 24, 9, 10, 5];
assert.deepEqual(redistributeSceneTargets(weights, new Set(), 60), weights);
const redistributed = redistributeSceneTargets(weights, new Set([0, 4]), 60);
assert.equal(redistributed[0], 0);
assert.equal(redistributed[4], 0);
assert.equal(redistributed.reduce((sum, value) => sum + value, 0), 60);
const edited = sceneTargetsWithEdits(weights, new Set(), 60, { 0: 20, 1: 15 });
assert.equal(edited[0], 20);
assert.equal(edited[1], 15);
assert.equal(edited.reduce((sum, value) => sum + value, 0), 60);
assert.equal(sceneTargetsWithEdits(weights, new Set([0, 4]), 60, { 0: 20 })[0], 0);
console.log("scene targets: exclusions redistribute to the remaining scenes and preserve the total");
