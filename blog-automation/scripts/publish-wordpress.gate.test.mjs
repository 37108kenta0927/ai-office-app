import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = readFileSync(new URL("./publish-wordpress.ts", import.meta.url), "utf8");

function functionSource(name) {
  const start = source.indexOf(`function ${name}`) >= 0
    ? source.indexOf(`function ${name}`)
    : source.indexOf(`export function ${name}`);
  assert.notEqual(start, -1, `${name} must exist`);
  let depth = 0;
  let opened = false;
  for (let index = start; index < source.length; index += 1) {
    if (source[index] === "{") {
      depth += 1;
      opened = true;
    } else if (source[index] === "}" && opened && --depth === 0) {
      return source.slice(start, index + 1);
    }
  }
  throw new Error(`could not extract ${name}`);
}

const isStringArray = functionSource("isStringArray")
  .replace("value: unknown", "value")
  .replace(": value is string[]", "");
const isEligibleForAutoPublish = functionSource("isEligibleForAutoPublish")
  .replace("post: GeneratedPost", "post")
  .replace(": boolean", "");
const eligible = new Function(
  `const MIN_AUTO_PUBLISH_BODY_LENGTH = 800;\n${isStringArray}\n${isEligibleForAutoPublish}\nreturn isEligibleForAutoPublish;`
)();

function postWith(riskFlags, qualityIssues, bodyLength = 800) {
  return { bodyMarkdown: "x".repeat(bodyLength), riskFlags, qualityIssues };
}

assert.equal(eligible(postWith([], [])), true, "empty arrays pass");
assert.equal(
  eligible(postWith(["verified issue"], [])),
  false,
  "non-empty string arrays hold publication"
);
assert.equal(eligible(postWith("", [])), false, "strings fail closed");
assert.equal(eligible(postWith([], "")), false, "quality-issue strings fail closed");
assert.equal(eligible(postWith(undefined, [])), false, "missing values fail closed");
assert.equal(eligible(postWith([], undefined)), false, "missing quality issues fail closed");
assert.equal(eligible(postWith([" "], [])), false, "blank string elements fail closed");
assert.equal(eligible(postWith([], [], 799)), false, "799 characters hold publication");
assert.equal(eligible(postWith([], [], 800)), true, "800 characters pass");

console.log("publish-wordpress eligibility tests passed");
