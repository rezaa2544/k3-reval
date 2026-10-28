'use strict';

const { contextBridge, ipcRenderer } = require('electron');

/** پل امن برای پنجره‌ی تنظیمات حساب (فقط همین چند متد) */
contextBridge.exposeInMainWorld('revalAccount', {
  get: () => ipcRenderer.invoke('account:get'),
  save: (data) => ipcRenderer.invoke('account:save', data),
  clear: () => ipcRenderer.invoke('account:clear'),
  close: () => ipcRenderer.invoke('account:close'),
  info: () => ipcRenderer.invoke('reval:info'),
});
