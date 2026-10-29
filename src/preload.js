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
  openPlanner: () => ipcRenderer.invoke('reval:open-planner'),
  applyAutoLogin: () => ipcRenderer.invoke('reval:apply-autologin'),
  goHome: () => ipcRenderer.invoke('reval:go-home'),
  version: () => ipcRenderer.invoke('reval:version'),

  /* ---- به‌روزرسانی خودکار ---- */
  updates: {
    state: () => ipcRenderer.invoke('update:state'),
    check: () => ipcRenderer.invoke('update:check'),
    download: () => ipcRenderer.invoke('update:download'),
    install: () => ipcRenderer.invoke('update:install'),
    now: () => ipcRenderer.invoke('update:now'),
    onEvent: (cb) => {
      const handler = (_e, payload) => { try { cb(payload); } catch (_) { /* بی‌صدا */ } };
      ipcRenderer.on('update:event', handler);
      return () => ipcRenderer.removeListener('update:event', handler);
    },
  },
});
