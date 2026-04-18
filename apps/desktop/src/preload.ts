import { contextBridge, ipcRenderer } from "electron";

const DESKTOP_SHORTCUT_CHANNEL = "blog-system:workbench-shortcut";

function dispatchWorkbenchShortcut(payload: {
  altKey: boolean;
  code: string;
  ctrlKey: boolean;
  key: string;
  metaKey: boolean;
  shiftKey: boolean;
}) {
  const eventInit: KeyboardEventInit = {
    altKey: payload.altKey,
    bubbles: true,
    cancelable: true,
    code: payload.code,
    ctrlKey: payload.ctrlKey,
    key: payload.key,
    metaKey: payload.metaKey,
    shiftKey: payload.shiftKey
  };

  const event = new KeyboardEvent("keydown", eventInit);
  document.dispatchEvent(event);
  window.dispatchEvent(new KeyboardEvent("keydown", eventInit));
}

window.addEventListener("DOMContentLoaded", () => {
  ipcRenderer.on(DESKTOP_SHORTCUT_CHANNEL, (_event, payload) => {
    dispatchWorkbenchShortcut(payload);
  });
});

contextBridge.exposeInMainWorld("blogSystemDesktop", {
  isElectron: true
});
