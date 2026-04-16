import assert from "node:assert/strict";
import test from "node:test";

import {
  evaluateWhenClause,
  getActiveKeybinding,
  keyStringFromKeyboardEvent,
  matchesKeybindingEvent,
  normalizeKeyString
} from "./keybindings";

test("normalizeKeyString normalizes VS Code style shortcuts", () => {
  assert.equal(normalizeKeyString("Ctrl+Alt+M"), "Ctrl+Alt+M");
  assert.equal(normalizeKeyString("cmdorctrl+shift+s"), "CtrlOrMeta+Shift+S");
  assert.equal(normalizeKeyString("shift+alt+down"), "Shift+Alt+ArrowDown");
});

test("keyStringFromKeyboardEvent maps browser events to editor keys", () => {
  assert.equal(
    keyStringFromKeyboardEvent({
      ctrlKey: true,
      metaKey: false,
      shiftKey: false,
      altKey: false,
      code: "KeyS",
      key: "s"
    } as KeyboardEvent),
    "Ctrl+S"
  );
});

test("matchesKeybindingEvent matches configured shortcuts", () => {
  const keyboardEvent = {
    ctrlKey: true,
    metaKey: false,
    shiftKey: false,
    altKey: true,
    code: "KeyM",
    key: "m"
  } as KeyboardEvent;

  assert.equal(matchesKeybindingEvent("Ctrl+Alt+M", keyboardEvent), true);
  assert.equal(matchesKeybindingEvent("Ctrl+S", keyboardEvent), false);
});

test("evaluateWhenClause supports equality, regex, and nested fields", () => {
  const context = {
    editorLangId: "latex",
    editorTextFocus: true,
    suggestWidgetVisible: false,
    editor: {
      hasSelection: false
    }
  };

  assert.equal(evaluateWhenClause("editorLangId=='latex'", context), true);
  assert.equal(evaluateWhenClause("editorLangId =~ /^markdown$|^latex$/", context), true);
  assert.equal(evaluateWhenClause("editorTextFocus && !editor.hasSelection", context), true);
  assert.equal(evaluateWhenClause("suggestWidgetVisible", context), false);
});

test("getActiveKeybinding returns the last enabled matching binding", () => {
  const context = {
    editorLangId: "latex",
    editorTextFocus: true
  };
  const keyboardEvent = {
    ctrlKey: true,
    metaKey: false,
    shiftKey: false,
    altKey: false,
    code: "KeyP",
    key: "p"
  } as KeyboardEvent;

  const binding = getActiveKeybinding(
    [
      { key: "Ctrl+P", command: "-workbench.action.quickOpen" },
      { key: "Ctrl+P", command: "workbench.action.showCommands" }
    ],
    keyboardEvent,
    context
  );

  assert.equal(binding?.command, "workbench.action.showCommands");
});

test("getActiveKeybinding respects later removal entries", () => {
  const context = {
    editorTextFocus: true
  };
  const keyboardEvent = {
    ctrlKey: true,
    metaKey: false,
    shiftKey: false,
    altKey: false,
    code: "KeyS",
    key: "s"
  } as KeyboardEvent;

  const binding = getActiveKeybinding(
    [
      { key: "Ctrl+S", command: "workbench.saveActiveDocument" },
      { key: "Ctrl+S", command: "-workbench.saveActiveDocument" }
    ],
    keyboardEvent,
    context
  );

  assert.equal(binding, null);
});
