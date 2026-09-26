import assert from "node:assert/strict";
import {
  customerResultCookieName,
  signCustomerResultToken,
  verifyCustomerResultToken,
} from "../src/lib/customer-select-result-auth.ts";

process.env.PIN_COOKIE_SECRET = "test-only-result-link-secret";

const projectId = "06b52039-2c14-4f1e-83bb-19eb2395b9b4";
const token = signCustomerResultToken(projectId);

assert.equal(customerResultCookieName(projectId), `customer_result_${projectId}`);
assert.equal(verifyCustomerResultToken(projectId, token), true);
assert.equal(verifyCustomerResultToken("16b52039-2c14-4f1e-83bb-19eb2395b9b4", token), false);
assert.equal(verifyCustomerResultToken(projectId, `${token.slice(0, -1)}x`), false);
