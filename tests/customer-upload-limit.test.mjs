import assert from "node:assert/strict";
import { uploadLimitError } from "../src/app/customer-select/_lib/upload-limit.ts";

assert.equal(uploadLimitError(1999, 1), null);
assert.match(uploadLimitError(1999, 2), /다시 선택/);
assert.match(uploadLimitError(2000, 1), /0장까지/);
assert.equal(uploadLimitError(0, 2000), null);
assert.match(uploadLimitError(0, 2001), /업로드하지 않았습니다/);
// Deleting one photo restores one slot.
assert.equal(uploadLimitError(2000 - 1, 1), null);
