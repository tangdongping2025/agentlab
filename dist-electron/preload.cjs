"use strict";
const electron = require("electron");
electron.contextBridge.exposeInMainWorld("electronAPI", {
  isElectron: true,
  sendAnthropicRequest: (path, method, headers, body) => electron.ipcRenderer.invoke("anthropic:request", path, method, headers, body),
  callAnySearch: (toolName, params) => electron.ipcRenderer.invoke("anysearch:call", toolName, params),
  getConfig: () => electron.ipcRenderer.invoke("config:get")
});
