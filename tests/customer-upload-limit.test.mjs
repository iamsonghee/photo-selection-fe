import assert from "node:assert/strict";
import { CUSTOMER_PHOTO_LIMIT as LIMIT, uploadLimitError } from "../src/app/customer-select/_lib/upload-limit.ts";

assert.equal(LIMIT, 3000);
assert.equal(uploadLimitError(LIMIT - 1, 1), null);
assert.match(uploadLimitError(LIMIT - 1, 2), /다시 선택/);
assert.match(uploadLimitError(LIMIT - 1, 2), /셀프 고객 전체/);
assert.match(uploadLimitError(LIMIT, 1), /0장까지/);
assert.equal(uploadLimitError(0, LIMIT), null);
assert.match(uploadLimitError(0, LIMIT + 1), /업로드하지 않았습니다/);
// Deleting one photo restores one slot.
assert.equal(uploadLimitError(LIMIT - 1, 1), null);
