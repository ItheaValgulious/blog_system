import assert from "node:assert/strict";
import test from "node:test";

import {
  matchesSnippetScope,
  parseJsoncConfig,
  parseSnippetConfigValue,
  serializeKeybindingConfig,
  serializeSnippetConfig
} from "./editor-config.js";

test("parseSnippetConfigValue supports VS Code object snippets", () => {
  const raw = `{
    // comment
    "divide": {
      "prefix": [
        "/",
        "\\\\frac"
      ],
      "body": "\\\\dfrac{$1}{$2} $0",
    },
    "lim": {
      "prefix": "\\\\lim",
      "body": "\\\\lim_{$1 \\\\to $2} $0"
    }
  }`;

  const parsed = parseSnippetConfigValue(parseJsoncConfig(raw, "latexSnippets"));

  assert.equal(parsed.format, "object");
  assert.equal(parsed.snippets.length, 2);
  assert.equal(parsed.snippets[0].name, "divide");
  assert.deepEqual(parsed.snippets[0].prefix, ["/", "\\frac"]);
  assert.equal(parsed.snippets[1].name, "lim");
});

test("serializeSnippetConfig preserves object snippet shape", () => {
  const raw = serializeSnippetConfig(
    [
      {
        name: "divide",
        prefix: ["/", "\\frac"],
        body: "\\dfrac{$1}{$2} $0"
      }
    ],
    "object"
  );

  assert.match(raw, /"divide": \{/);
  assert.doesNotMatch(raw, /"name": "divide"/);
});

test("serializeKeybindingConfig emits canonical json array", () => {
  const raw = serializeKeybindingConfig([
    {
      key: "ctrl+p",
      command: "workbench.action.showCommands"
    }
  ]);

  assert.match(raw, /"workbench\.action\.showCommands"/);
  assert.match(raw, /^\[/);
});

test("matchesSnippetScope treats markdown and latex aliases as equivalent", () => {
  assert.equal(matchesSnippetScope({ scope: "latex,tex" }, "latex"), true);
  assert.equal(matchesSnippetScope({ scope: "markdown,quarto" }, "markdown"), true);
  assert.equal(matchesSnippetScope({ scope: "markdown" }, "latex"), false);
  assert.equal(matchesSnippetScope({ scope: undefined }, "latex"), true);
});
