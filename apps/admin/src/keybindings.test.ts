import assert from "node:assert/strict";
import test from "node:test";

import {
  keyStringFromKeyboardEvent,
  matchesKeybindingEvent,
  normalizeKeyString
} from "./keybindings";

test("normalizeKeyString normalizes VS Code style shortcuts", () => {
  assert.equal(normalizeKeyString("Ctrl+Alt+M"), "Ctrl+Alt+M");
  assert.equal(normalizeKeyString("cmdorctrl+shift+s"), "CtrlOrMeta+Shift+S");
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
