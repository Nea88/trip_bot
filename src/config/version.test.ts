import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// The add-on version lives in config.yaml (what Home Assistant shows); keep
// package.json in lockstep so the two never drift apart again.
test("package.json version matches config.yaml", () => {
  const pkg = JSON.parse(readFileSync("package.json", "utf8")) as { version: string };
  const addonVersion = /^version:\s*"([^"]+)"/m.exec(readFileSync("config.yaml", "utf8"))?.[1];
  assert.equal(pkg.version, addonVersion);
});
