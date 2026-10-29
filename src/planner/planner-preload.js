'use strict';

const { contextBridge, ipcRenderer } = require('electron');

/** پل امن پنجرهٔ «مشاور هوشمند» — فقط ذخیره/بازیابی و ذخیره‌ی فایل */
contextBridge.exposeInMainWorld('revalPlanner', {
  loadState: () => ipcRenderer.invoke('planner:load-state'),
  saveState: (state) => ipcRenderer.invoke('planner:save-state', state),
  saveFile: (payload) => ipcRenderer.invoke('planner:save-file', payload),
  close: () => ipcRenderer.invoke('planner:close'),
  info: () => ipcRenderer.invoke('reval:info'),

  /* ---- به‌روزرسانی خودکار ---- */
  updates: {
    state: () => ipcRenderer.invoke('update:state'),
    check: () => ipcRenderer.invoke('update:check'),
    download: () => ipcRenderer.invoke('update:download'),
    install: () => ipcRenderer.invoke('update:install'),
    now: () => ipcRenderer.invoke('update:now'),
    openRelease: () => ipcRenderer.invoke('update:open-release'),
    onEvent: (cb) => {
      const handler = (_e, payload) => { try { cb(payload); } catch (_) { /* بی‌صدا */ } };
      ipcRenderer.on('update:event', handler);
      return () => ipcRenderer.removeListener('update:event', handler);
    },
  },
});
