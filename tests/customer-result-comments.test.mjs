import assert from "node:assert/strict";
import { hasCustomerResultComment } from "../src/lib/customer-result-comments.ts";

assert.equal(hasCustomerResultComment(), false);
assert.equal(hasCustomerResultComment("   "), false);
assert.equal(hasCustomerResultComment("표정을 자연스럽게 보정해주세요"), true);
