import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = readFileSync(new URL("./review-oldest-draft.ts", import.meta.url), "utf8");
assert.match(source, /START_AT_JST/, "must enforce the requested start date");
assert.match(source, /hasPublishedSince/, "must enforce one post per brand/JST day");
assert.match(source, /MIN_TEXT_LENGTH = 800/, "must retain the minimum-copy gate");
assert.match(source, /booking CTA/, "must retain the booking CTA gate");
assert.match(source, /const verified = await getPost/, "must verify the post after publication");
assert.match(source, /decision\.decision === "hold".*continue/s, "held items must not block a later safe candidate");
assert.match(source, /current\.status === "publish".*continue/s, "already-published items must be reconciled then skipped");
console.log("daily queue safety gates are present");
