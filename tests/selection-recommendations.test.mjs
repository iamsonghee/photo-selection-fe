import assert from "node:assert/strict";
import { planRecommendationSelection } from "../src/lib/selection-recommendations.ts";

const existing = new Set(["customer", "shared"]);
assert.deepEqual(planRecommendationSelection(existing, ["shared", "recommended", "recommended"], 4), { additions: ["recommended"], fits: true });
assert.deepEqual([...existing], ["customer", "shared"]);
assert.equal(planRecommendationSelection(existing, ["a", "b"], 3).fits, false);
assert.equal(planRecommendationSelection(new Set(), ["a", "b", "c"], 3).fits, true);
assert.equal(planRecommendationSelection(new Set(), ["a", "b", "c", "d"], 3).fits, false);
assert.equal(planRecommendationSelection(new Set(), [], 0).fits, false);
console.log("Recommendation selection: preserves choices, deduplicates, handles below/equal/above target.");
