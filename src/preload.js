'use strict';

const { contextBridge, ipcRenderer } = require('electron');

/**
 * پل امن و حداقلی به سایت. صفحه‌ی وب دسترسی به Node ندارد.
 * از این APIها هم فقط صفحه‌ی آفلاین و اسکریپت «ورود خودکار» استفاده می‌کنند.
 */
contextBridge.exposeInMainWorld('revalDesktop', {
  isDesktop: true,
  platform: process.platform,
  versions: {
    electron: process.versions.electron,
    chrome: process.versions.chrome,
  },
  retry: () => ipcRenderer.invoke('reval:retry'),
  info: () => ipcRenderer.invoke('reval:info'),
  openExternal: (url) => ipcRenderer.invoke('reval:open-external', url),
  openAccount: () => ipcRenderer.invoke('reval:open-account'),
});
