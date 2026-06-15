/**
 * Unit tests for `parseFenceParams` — the helper that reads
 * `width=...`, `scale=...`, `align=...` (and any other key=value pair) off the
 * info-string of a commutative fence.
 */
import assert from "node:assert/strict";
import test from "node:test";

import { parseFenceParams } from "./fence-params.js";

test("parseFenceParams returns sensible defaults for empty input", () => {
  const params = parseFenceParams("");
  assert.equal(params.width, "");
  assert.equal(params.scale, 1);
  assert.equal(params.align, "center");
  assert.deepEqual(params.raw, {});
});

test("parseFenceParams reads bare width / scale / align values", () => {
  const params = parseFenceParams(" width=80% scale=1.5 align=left");
  assert.equal(params.width, "80%");
  assert.equal(params.scale, 1.5);
  assert.equal(params.align, "left");
});

test("parseFenceParams accepts quoted values and whitespace variations", () => {
  const params = parseFenceParams('width="100%"  scale=0.5 align="right"');
  assert.equal(params.width, "100%");
  assert.equal(params.scale, 0.5);
  assert.equal(params.align, "right");
});

test("parseFenceParams ignores invalid scale + align values", () => {
  const params = parseFenceParams("scale=oops align=middle");
  assert.equal(params.scale, 1);
  assert.equal(params.align, "center");
  assert.equal(params.raw.scale, "oops");
  assert.equal(params.raw.align, "middle");
});

test("parseFenceParams keeps unknown keys under raw for forward compatibility", () => {
  const params = parseFenceParams("width=100% theme=dark caption='Pullback'");
  assert.equal(params.raw.theme, "dark");
  assert.equal(params.raw.caption, "Pullback");
});
