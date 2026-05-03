import assert from "node:assert/strict";
import test from "node:test";

import {
  CommutativeError,
  createEmptyCommutativeDocument,
  decodeCommutativeBase64,
  encodeCommutativeBase64,
  parseCommutative,
  renderCommutativeStaticHtml,
  serializeCommutative
} from "./index.js";

test("empty commutative document is serializable", () => {
  const document = createEmptyCommutativeDocument();
  const serialized = serializeCommutative(document);
  assert.match(serialized, /"version": 1/);
  assert.match(serialized, /"cells": \[\]/);
});

test("parseCommutative accepts base64 raw source format", () => {
  const document = parseCommutative(
    JSON.stringify([
      0,
      2,
      [0, 0, "A"],
      [1, 0, "B"],
      [0, 1, "f"]
    ])
  );

  assert.equal(document.cells.length, 3);
  assert.equal(document.cells[0]?.kind, "vertex");
  assert.equal(document.cells[2]?.kind, "edge");
});

test("parseCommutative accepts normalized object format", () => {
  const document = parseCommutative(`{
  "version": 1,
  "cells": [
    { "kind": "vertex", "x": 0, "y": 0, "label": "X" },
    { "kind": "vertex", "x": 1, "y": 0, "label": "Y" },
    { "kind": "edge", "source": 0, "target": 1, "label": "f", "alignment": 1 }
  ]
}`);

  assert.equal(document.cells.length, 3);
});

test("commutative base64 helpers round-trip", () => {
  const original = parseCommutative(
    JSON.stringify([
      0,
      2,
      [0, 0, "A"],
      [1, 1, "B"],
      [0, 1, "g", 2, { curve: 2, style: { head: { name: "epi" } } }]
    ])
  );
  const encoded = encodeCommutativeBase64(original);
  const decoded = decodeCommutativeBase64(encoded);

  assert.deepEqual(decoded, original);
});

test("parseCommutative accepts encoded base64 payloads", () => {
  const original = parseCommutative(
    JSON.stringify([
      0,
      2,
      [0, 0, "A"],
      [1, 0, "B"],
      [0, 1, "f"]
    ])
  );
  const encoded = encodeCommutativeBase64(original);

  assert.deepEqual(parseCommutative(encoded), original);
});

test("renderCommutativeStaticHtml emits HTML and SVG", () => {
  const document = parseCommutative(
    JSON.stringify([
      0,
      2,
      [0, 0, "A"],
      [1, 0, "B"],
      [0, 1, "f"]
    ])
  );
  const rendered = renderCommutativeStaticHtml(document);

  assert.match(rendered.html, /<figure class="commutative"/);
  assert.match(rendered.html, /<svg/);
  assert.match(rendered.html, /foreignObject/);
  assert.ok(rendered.width >= 320);
  assert.ok(rendered.height >= 220);
});

test("renderCommutativeStaticHtml renders bullet vertices as points", () => {
  const document = parseCommutative(
    JSON.stringify([
      0,
      1,
      [0, 0, "bullet"]
    ])
  );
  const rendered = renderCommutativeStaticHtml(document);

  assert.match(rendered.html, /cg-node-point/);
  assert.doesNotMatch(rendered.html, />bullet</);
});

test("parseCommutative rejects malformed input", () => {
  assert.throws(
    () => parseCommutative("{"),
    (error: unknown) =>
      error instanceof CommutativeError && error.code === "invalid-json"
  );
});
