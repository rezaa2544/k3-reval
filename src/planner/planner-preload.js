'use strict';

const { contextBridge, ipcRenderer } = require('electron');

/** پل امن پنجرهٔ «مشاور هوشمند» — فقط ذخیره/بازیابی و ذخیره‌ی فایل */
contextBridge.exposeInMainWorld('revalPlanner', {
  loadState: () => ipcRenderer.invoke('planner:load-state'),
  saveState: (state) => ipcRenderer.invoke('planner:save-state', state),
  saveFile: (payload) => ipcRenderer.invoke('planner:save-file', payload),
  close: () => ipcRenderer.invoke('planner:close'),
  info: () => ipcRenderer.invoke('reval:info'),
});
