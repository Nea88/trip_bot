import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { COMMANDS, helpText, menuFor, type CommandSpec } from "./commandSpecs.js";

const names = COMMANDS.map((c) => c.command);
const menuNames = (scope: Parameters<typeof menuFor>[0]) => menuFor(scope).map((c) => c.command);

test("command names are unique", () => {
  assert.equal(new Set(names).size, names.length);
});

test("every command is documented in the README table", () => {
  const readme = readFileSync("README.md", "utf8");
  const missing = names.filter((name) => !readme.includes(`| \`/${name}`));
  assert.deepEqual(missing, []);
});

test("menus: members see only their commands, /help is last", () => {
  assert.deepEqual(menuNames("private"), ["me", "start", "help"]);
  assert.deepEqual(menuNames("group"), ["suggest", "list", "photo", "place", "history", "year", "me", "help"]);
  for (const scope of ["private", "group", "groupAdmin"] as const) {
    assert.equal(menuNames(scope).at(-1), "help", scope);
  }
});

test("admin menus cover every admin command available there", () => {
  const groupAdmin = menuNames("groupAdmin");
  const privateAdmin = menuNames("privateAdmin");
  const specs: readonly CommandSpec[] = COMMANDS;
  for (const c of specs) {
    if (c.audience !== "admin") continue;
    if (c.where !== "dm") assert.ok(groupAdmin.includes(c.command), `group admin menu lacks ${c.command}`);
    if (c.where !== "group") assert.ok(privateAdmin.includes(c.command), `private admin menu lacks ${c.command}`);
  }
  assert.ok(!privateAdmin.includes("close_poll"), "group-only commands stay out of DMs");
  assert.equal(privateAdmin.at(-1), "start");
});

test("menu descriptions fit Telegram's limits", () => {
  for (const c of COMMANDS) {
    assert.match(c.command, /^[a-z0-9_]{1,32}$/);
    assert.ok(c.menu.length >= 1 && c.menu.length <= 256, c.command);
  }
});

test("help: members don't see admin commands, admins see everything", () => {
  assert.doesNotMatch(helpText(false), /\/close_poll/);
  for (const name of names) assert.match(helpText(true), new RegExp(`/${name}\\b`));
});
