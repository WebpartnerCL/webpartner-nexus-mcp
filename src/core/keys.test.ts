import { test } from "node:test";
import assert from "node:assert/strict";
import { hashApiKey, generateApiKey, generateReviewToken } from "./keys.js";

test("hashApiKey: SHA-256 hex (64), determinista", () => {
  const h = hashApiKey("abc");
  assert.match(h, /^[0-9a-f]{64}$/);
  assert.equal(h, hashApiKey("abc"));
  assert.notEqual(h, hashApiKey("abd"));
});

test("generateApiKey: prefijo wpn_ y hash que coincide con la key", () => {
  const { key, hash } = generateApiKey();
  assert.ok(key.startsWith("wpn_"));
  assert.equal(hash, hashApiKey(key));
});

test("generateApiKey: claves únicas en cada llamada", () => {
  assert.notEqual(generateApiKey().key, generateApiKey().key);
});

test("generateReviewToken: url-safe y suficientemente largo", () => {
  const t = generateReviewToken();
  assert.match(t, /^[A-Za-z0-9_-]+$/);
  assert.ok(t.length >= 16);
});
