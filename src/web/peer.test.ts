import { test } from "node:test";
import assert from "node:assert/strict";
import { peerAllowed } from "./peer.js";

test("panel: only Home Assistant's Ingress proxy and localhost connect", () => {
  for (const ok of ["172.30.32.2", "::ffff:172.30.32.2", "127.0.0.1", "::ffff:127.0.0.1", "::1"]) {
    assert.ok(peerAllowed(ok), ok);
  }
  for (const bad of [undefined, "", "172.30.32.1", "192.168.1.10", "::ffff:10.0.0.5"]) {
    assert.ok(!peerAllowed(bad), String(bad));
  }
});
