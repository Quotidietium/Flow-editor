'use strict';

/**
 * 预加载脚本：在 contextIsolation + sandbox 下，把桌面版独占能力以最小面
 * 暴露给页面（window.__FLOW_DESKTOP__）。页面据此判定「我在桌面版里」，
 * MCP 管理器才能读写 HTTP 服务配置。不暴露任何 Node/文件系统能力。
 */

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('__FLOW_DESKTOP__', {
  mcp: {
    getConfig: () => ipcRenderer.invoke('flow:mcp:get-config'),
    getStatus: () => ipcRenderer.invoke('flow:mcp:get-status'),
    setConfig: (config) => ipcRenderer.invoke('flow:mcp:set-config', config)
  }
});
