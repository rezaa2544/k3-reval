'use strict';

/**
 * Reval Desktop — Electron shell for https://revaledu.ir
 * ---------------------------------------------------------------
 * v1.1.0
 *  - ورود بدون صفحه‌ی ورود: مشخصات حساب یک‌بار ذخیره و خودکار اعمال می‌شود
 *  - حذف لنگرهای #login / #signup از مسیر اجرا
 *  - نشست پایدار (کوکی/لوکال‌استوری)، منوی فارسی، Tray، اسپلش، صفحه‌ی آفلاین
 *  - حفظ اندازه/موقعیت پنجره و سطح زوم
 */

const {
  app, BrowserWindow, Menu, Tray, shell, session, ipcMain, dialog,
  nativeImage, safeStorage,
} = require('electron');
const path = require('path');
const fs = require('fs');

const APP_NAME = 'روال | Reval';
const HOME_URL = 'https://revaledu.ir/?view=dashboard';
const ALLOWED_HOSTS = ['revaledu.ir', 'www.revaledu.ir'];

const ROOT = path.join(__dirname, '..');
const ICON_ICO = path.join(ROOT, 'assets', 'icon.ico');
const ICON_PNG = path.join(ROOT, 'assets', 'icon.png');
const ICON_TRAY = path.join(ROOT, 'assets', 'icon-512.png');
const PRELOAD = path.join(__dirname, 'preload.js');
const ACCOUNT_PRELOAD = path.join(__dirname, 'account-preload.js');
const ACCOUNT_HTML = path.join(__dirname, 'account.html');
const SPLASH_HTML = path.join(__dirname, 'splash.html');
const OFFLINE_HTML = path.join(__dirname, 'offline.html');
const GATE_SKIP_SRC = path.join(__dirname, 'inject', 'gate-skip.js');
const PLANNER_HTML = path.join(__dirname, 'planner', 'planner.html');
const PLANNER_PRELOAD = path.join(__dirname, 'planner', 'planner-preload.js');
const PLANNER_STATE = () => path.join(app.getPath('userData'), 'planner-state.json');

/** @type {BrowserWindow|null} */ let mainWindow = null;
/** @type {BrowserWindow|null} */ let splashWindow = null;
/** @type {BrowserWindow|null} */ let accountWindow = null;
/** @type {BrowserWindow|null} */ let plannerWindow = null;
/** @type {Tray|null} */ let tray = null;
/** @type {NodeJS.Timeout|null} */ let splashTimeout = null;

const STATE_FILE = () => path.join(app.getPath('userData'), 'window-state.json');
const CRED_FILE = () => path.join(app.getPath('userData'), 'account.bin');

/* ------------------------------------------------------------------ */
/* Window state                                                        */
/* ------------------------------------------------------------------ */

const defaultState = { width: 1280, height: 820, maximized: false, zoom: 0, onboarded: false };
let state = defaultState;

function readState() {
  try { return { ...defaultState, ...JSON.parse(fs.readFileSync(STATE_FILE(), 'utf8')) }; }
  catch { return { ...defaultState }; }
}
function writeState(next) {
  state = { ...state, ...next };
  try { fs.writeFileSync(STATE_FILE(), JSON.stringify(state, null, 2)); }
  catch (err) { console.warn('[reval] window state:', err.message); }
}

/* ------------------------------------------------------------------ */
/* Account (encrypted at rest with OS keychain / DPAPI)                */
/* ------------------------------------------------------------------ */

function readAccount() {
  try {
    const raw = fs.readFileSync(CRED_FILE());
    let json;
    if (safeStorage.isEncryptionAvailable()) {
      json = safeStorage.decryptString(raw);
    } else {
      // Fallback: base64 (still local-only). We warn the user in the UI.
      json = Buffer.from(raw.toString('utf8'), 'base64').toString('utf8');
    }
    const data = JSON.parse(json);
    return {
      identifier: data.identifier || '',
      password: data.password || '',
      autoLogin: data.autoLogin !== false,
    };
  } catch {
    return { identifier: '', password: '', autoLogin: true };
  }
}

function writeAccount({ identifier, password, autoLogin }) {
  const prev = readAccount();
  const payload = JSON.stringify({
    identifier: identifier || '',
    // رمز خالی در فرم = «رمز فعلی را نگه دار»
    password: password === undefined || password === null || password === '' ? prev.password : password,
    autoLogin: autoLogin !== false,
  });
  const out = safeStorage.isEncryptionAvailable()
    ? safeStorage.encryptString(payload)
    : Buffer.from(payload, 'utf8').toString('base64');
  fs.mkdirSync(path.dirname(CRED_FILE()), { recursive: true });
  fs.writeFileSync(CRED_FILE(), out, { mode: 0o600 });
}

function clearAccount() {
  try { fs.unlinkSync(CRED_FILE()); } catch { /* already gone */ }
}

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

function isInternalUrl(rawUrl) {
  try {
    const u = new URL(rawUrl);
    if (u.protocol === 'file:') return true;
    return ALLOWED_HOSTS.includes(u.hostname.toLowerCase());
  } catch { return false; }
}

function openExternal(rawUrl) {
  if (/^https?:/i.test(rawUrl)) shell.openExternal(rawUrl).catch(() => {});
}

/* ------------------------------------------------------------------ */
/* Gate-skip injection                                                 */
/* ------------------------------------------------------------------ */

let gateSkipTemplate = null;
function gateSkipSource() {
  if (gateSkipTemplate === null) {
    gateSkipTemplate = fs.readFileSync(GATE_SKIP_SRC, 'utf8');
  }
  const account = readAccount();
  const cfg = {
    hasCredentials: Boolean(account.identifier && account.password),
    credentials: account.autoLogin && account.identifier && account.password
      ? { identifier: account.identifier, password: account.password }
      : null,
  };
  return gateSkipTemplate.replace(/__REVAL_CONFIG__/g, JSON.stringify(cfg));
}

function applyGateSkip(win) {
  if (!win || win.isDestroyed()) return;
  win.webContents.executeJavaScript(gateSkipSource(), true).catch(() => {});
}

/* ------------------------------------------------------------------ */
/* Windows                                                             */
/* ------------------------------------------------------------------ */

function showSplash() {
  splashWindow = new BrowserWindow({
    width: 460, height: 320, frame: false, resizable: false,
    backgroundColor: '#0f172a', show: false, skipTaskbar: true, alwaysOnTop: true,
    icon: process.platform === 'win32' ? ICON_ICO : ICON_PNG,
    webPreferences: { contextIsolation: true, nodeIntegration: false },
  });
  splashWindow.loadFile(SPLASH_HTML);
  splashWindow.once('ready-to-show', () => splashWindow && splashWindow.show());
  splashTimeout = setTimeout(closeSplash, 15000);
}

function closeSplash() {
  if (splashTimeout) { clearTimeout(splashTimeout); splashTimeout = null; }
  if (splashWindow && !splashWindow.isDestroyed()) splashWindow.close();
  splashWindow = null;
  if (mainWindow && !mainWindow.isDestroyed() && !mainWindow.isVisible()) mainWindow.show();
}

function openAccountWindow() {
  if (accountWindow && !accountWindow.isDestroyed()) {
    accountWindow.show();
    accountWindow.focus();
    return accountWindow;
  }
  accountWindow = new BrowserWindow({
    width: 620, height: 520, resizable: false, minimizable: false, maximizable: false,
    title: 'تنظیمات حساب — روال',
    backgroundColor: '#0b1220',
    icon: process.platform === 'win32' ? ICON_ICO : ICON_PNG,
    parent: mainWindow || undefined,
    modal: false,
    show: false,
    autoHideMenuBar: true,
    webPreferences: {
      preload: ACCOUNT_PRELOAD,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  accountWindow.removeMenu();
  accountWindow.loadFile(ACCOUNT_HTML);
  accountWindow.once('ready-to-show', () => accountWindow && accountWindow.show());
  accountWindow.on('closed', () => { accountWindow = null; });
  return accountWindow;
}

function openPlannerWindow() {
  if (plannerWindow && !plannerWindow.isDestroyed()) {
    plannerWindow.show();
    plannerWindow.focus();
    return plannerWindow;
  }
  plannerWindow = new BrowserWindow({
    width: 1180,
    height: 860,
    minWidth: 900,
    minHeight: 640,
    title: 'مشاور هوشمند روال',
    backgroundColor: '#0a0f1a',
    icon: process.platform === 'win32' ? ICON_ICO : ICON_PNG,
    show: false,
    autoHideMenuBar: true,
    webPreferences: {
      preload: PLANNER_PRELOAD,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  plannerWindow.removeMenu();
  plannerWindow.loadFile(PLANNER_HTML);
  plannerWindow.once('ready-to-show', () => plannerWindow && plannerWindow.show());
  plannerWindow.on('closed', () => { plannerWindow = null; });
  return plannerWindow;
}

function loadHome(win) {
  if (!win) return;
  win.loadURL(HOME_URL);
}

function createMainWindow() {
  state = readState();

  mainWindow = new BrowserWindow({
    width: state.width, height: state.height,
    x: state.x, y: state.y,
    minWidth: 940, minHeight: 620,
    title: APP_NAME,
    backgroundColor: '#f6f7fb',
    icon: process.platform === 'win32' ? ICON_ICO : ICON_PNG,
    show: false,
    autoHideMenuBar: false,
    webPreferences: {
      preload: PRELOAD,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: true,
      webSecurity: true,
      backgroundThrottling: false,
    },
  });

  if (state.maximized) mainWindow.maximize();
  if (typeof state.zoom === 'number' && state.zoom !== 0) {
    mainWindow.webContents.on('did-finish-load', () => {
      mainWindow && mainWindow.webContents.setZoomLevel(state.zoom);
    });
  }

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
    closeSplash();
  });

  /* --- keep navigation inside the app --- */
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (isInternalUrl(url) && !url.startsWith('file:')) {
      return { action: 'allow', overrideBrowserWindowOptions: { autoHideMenuBar: false, icon: ICON_PNG } };
    }
    openExternal(url);
    return { action: 'deny' };
  });

  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (!isInternalUrl(url)) { event.preventDefault(); openExternal(url); }
  });

  mainWindow.webContents.on('did-create-window', (child) => child.removeMenu());

  /* --- ورود بدون صفحه‌ی ورود: تزریق در هر بار بارگذاری --- */
  mainWindow.webContents.on('did-finish-load', () => { closeSplash(); applyGateSkip(mainWindow); });
  mainWindow.webContents.on('did-navigate', () => applyGateSkip(mainWindow));
  mainWindow.webContents.on('did-navigate-in-page', () => applyGateSkip(mainWindow));
  mainWindow.webContents.on('dom-ready', () => applyGateSkip(mainWindow));

  /* --- offline --- */
  mainWindow.webContents.on('did-fail-load', (e, code, desc, url, isMainFrame) => {
    if (!isMainFrame || code === -3) return;
    closeSplash();
    mainWindow.loadFile(OFFLINE_HTML, { query: { code: String(code), url: url || HOME_URL } });
  });

  mainWindow.webContents.on('render-process-gone', () => {
    closeSplash();
    if (mainWindow) mainWindow.loadFile(OFFLINE_HTML, { query: { code: 'crash' } });
  });

  /* --- window state --- */
  const saveState = () => {
    if (!mainWindow || mainWindow.isDestroyed()) return;
    const b = mainWindow.getNormalBounds();
    writeState({
      width: b.width, height: b.height, x: b.x, y: b.y,
      maximized: mainWindow.isMaximized(),
      zoom: mainWindow.webContents.getZoomLevel(),
    });
  };
  ['resize', 'move', 'maximize', 'unmaximize'].forEach((ev) => mainWindow.on(ev, saveState));
  mainWindow.on('close', saveState);
  mainWindow.on('closed', () => { mainWindow = null; });

  loadHome(mainWindow);
  return mainWindow;
}

/* ------------------------------------------------------------------ */
/* Menu                                                                */
/* ------------------------------------------------------------------ */

function buildMenu() {
  const template = [
    {
      label: 'فایل',
      submenu: [
        { label: 'بارگذاری مجدد', accelerator: 'CmdOrCtrl+R', click: () => mainWindow && mainWindow.webContents.reload() },
        { label: 'بارگذاری بدون کش', accelerator: 'CmdOrCtrl+Shift+R', click: () => mainWindow && mainWindow.webContents.reloadIgnoringCache() },
        { type: 'separator' },
        { label: 'میزکار روال (داشبورد)', accelerator: 'CmdOrCtrl+H', click: () => mainWindow && loadHome(mainWindow) },
        { label: 'ورود خودکار: اعمال دوباره', accelerator: 'CmdOrCtrl+L', click: () => applyGateSkip(mainWindow) },
        { type: 'separator' },
        { label: '🧠  مشاور هوشمند (برنامه‌ریزی خودکار)', accelerator: 'CmdOrCtrl+Shift+P', click: () => openPlannerWindow() },
        { type: 'separator' },
        { label: 'چاپ صفحه', accelerator: 'CmdOrCtrl+P', click: () => mainWindow && mainWindow.webContents.print({}) },
        { type: 'separator' },
        { label: 'خروج', accelerator: 'Alt+F4', role: 'quit' },
      ],
    },
    {
      label: 'حساب کاربری',
      submenu: [
        { label: 'تنظیمات ورود خودکار…', accelerator: 'CmdOrCtrl+,', click: () => openAccountWindow() },
        { label: 'پاک کردن مشخصات ذخیره‌شده', click: () => {
          clearAccount();
          applyGateSkip(mainWindow);
          dialog.showMessageBox(mainWindow, {
            type: 'info', title: 'حساب کاربری', message: 'مشخصات ذخیره‌شده حذف شد.',
            detail: 'از این پس برنامه صفحه‌ی ورود سایت را نشان می‌دهد.', buttons: ['باشه'], noLink: true,
          });
        } },
        { type: 'separator' },
        { label: 'پشتیبانی روال (تلگرام)', click: () => openExternal('https://t.me/RevalSupport') },
      ],
    },
    {
      label: 'ویرایش',
      submenu: [
        { label: 'واگرد', role: 'undo' }, { label: 'ازنو', role: 'redo' }, { type: 'separator' },
        { label: 'برش', role: 'cut' }, { label: 'رونوشت', role: 'copy' },
        { label: 'چسباندن', role: 'paste' }, { label: 'انتخاب همه', role: 'selectAll' },
      ],
    },
    {
      label: 'نما',
      submenu: [
        { label: 'بزرگ‌نمایی', role: 'zoomIn' },
        { label: 'کوچک‌نمایی', role: 'zoomOut' },
        { label: 'اندازه عادی', role: 'resetZoom' },
        { type: 'separator' },
        { label: 'تمام‌صفحه', accelerator: 'F11', role: 'togglefullscreen' },
        { label: 'همیشه روی همه پنجره‌ها', type: 'checkbox', click: (item) => mainWindow && mainWindow.setAlwaysOnTop(item.checked) },
        { type: 'separator' },
        { label: 'ابزار توسعه‌دهنده', accelerator: 'CmdOrCtrl+Shift+I', role: 'toggleDevTools' },
      ],
    },
    {
      label: 'راهنما',
      submenu: [
        { label: 'اینستاگرام روال', click: () => openExternal('https://instagram.com/reval_academy_') },
        { type: 'separator' },
        { label: 'درباره برنامه', click: () => dialog.showMessageBox(mainWindow, {
          type: 'info', title: 'درباره روال', message: 'روال — نسخه دسکتاپ',
          detail: `نسخه ${app.getVersion()}\nElectron ${process.versions.electron} · Chromium ${process.versions.chrome}\n\n` +
                  `میزکار شخصیِ یادگیری — ${HOME_URL}`,
          buttons: ['باشه'], noLink: true,
        }) },
      ],
    },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

/* ------------------------------------------------------------------ */
/* Tray                                                                */
/* ------------------------------------------------------------------ */

function buildTray() {
  try {
    const img = nativeImage.createFromPath(ICON_TRAY).resize({ width: 32, height: 32 });
    tray = new Tray(img);
    tray.setToolTip(APP_NAME);
    tray.setContextMenu(Menu.buildFromTemplate([
      { label: 'باز کردن روال', click: () => {
        if (!mainWindow) return createMainWindow();
        if (mainWindow.isMinimized()) mainWindow.restore();
        mainWindow.show(); mainWindow.focus();
      } },
      { label: 'ورود خودکار: اعمال دوباره', click: () => applyGateSkip(mainWindow) },
      { label: 'تنظیمات حساب…', click: () => openAccountWindow() },
      { label: '🧠 مشاور هوشمند', click: () => openPlannerWindow() },
      { type: 'separator' },
      { label: 'خروج', click: () => { app.isQuitting = true; app.quit(); } },
    ]));
    tray.on('double-click', () => {
      if (!mainWindow) return createMainWindow();
      mainWindow.show(); mainWindow.focus();
    });
  } catch (err) { console.warn('[reval] tray:', err.message); }
}

/* ------------------------------------------------------------------ */
/* Session / permissions                                               */
/* ------------------------------------------------------------------ */

function configureSession() {
  const ses = session.defaultSession;
  ses.setPermissionRequestHandler((wc, permission, callback) => {
    callback(['notifications', 'clipboard-read', 'clipboard-sanitized-write', 'fullscreen', 'media'].includes(permission));
  });
  ses.on('will-download', (event, item) => {
    item.setSaveDialogOptions({
      title: 'ذخیره فایل',
      defaultPath: path.join(app.getPath('downloads'), item.getFilename()),
    });
  });
}

/* ------------------------------------------------------------------ */
/* Lifecycle + IPC                                                     */
/* ------------------------------------------------------------------ */

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow) { if (mainWindow.isMinimized()) mainWindow.restore(); mainWindow.show(); mainWindow.focus(); }
    else createMainWindow();
  });

  app.setAppUserModelId('ir.revaledu.desktop');

  app.whenReady().then(() => {
    state = readState();
    configureSession();
    buildMenu();
    showSplash();
    createMainWindow();
    buildTray();

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createMainWindow();
    });

    // هیچ فرم ورودی در مسیر اجرا نمایش داده نمی‌شود:
    // اپ مستقیم روی میزکار باز می‌شود و اگر سایت ورود خواست، فقط یک نوار کوچک
    // (داخل صفحه) امکان ثبت یک‌باره‌ی مشخصات را پیشنهاد می‌دهد.
    if (!state.onboarded) writeState({ onboarded: true });
  });

  app.on('before-quit', () => { app.isQuitting = true; });
  app.on('window-all-closed', () => app.quit());

  /* ---- IPC: صفحه/پنجره ---- */
  ipcMain.handle('reval:retry', () => {
    closeSplash();
    if (mainWindow) loadHome(mainWindow);
  });
  ipcMain.handle('reval:info', () => ({
    version: app.getVersion(),
    electron: process.versions.electron,
    chrome: process.versions.chrome,
    platform: process.platform,
    homeUrl: HOME_URL,
  }));
  ipcMain.handle('reval:open-external', (_e, url) => openExternal(url));

  /* ---- IPC: حساب کاربری ---- */
  ipcMain.handle('reval:open-account', () => openAccountWindow());

  ipcMain.handle('account:get', () => {
    const acc = readAccount();
    return {
      identifier: acc.identifier,
      autoLogin: acc.autoLogin,
      hasPassword: Boolean(acc.password),
      encrypted: safeStorage.isEncryptionAvailable(),
    };
  });

  ipcMain.handle('account:save', (_e, data) => {
    try {
      const identifier = String((data && data.identifier) || '').trim();
      if (!identifier) return { ok: false, error: 'نام کاربری خالی است.' };
      const prev = readAccount();
      const password = (data && typeof data.password === 'string' && data.password) || '';
      if (!password && !prev.password) return { ok: false, error: 'رمز عبور را وارد کنید.' };
      writeAccount({ identifier, password, autoLogin: !!(data && data.autoLogin) });
      // اعمال فوری در پنجره‌ی اصلی
      setTimeout(() => {
        if (mainWindow) { loadHome(mainWindow); }
      }, 250);
      return { ok: true };
    } catch (err) {
      return { ok: false, error: 'ذخیره ناموفق: ' + err.message };
    }
  });

  ipcMain.handle('account:clear', () => {
    clearAccount();
    if (mainWindow) setTimeout(() => loadHome(mainWindow), 250);
    return { ok: true };
  });

  /* ---- IPC: مشاور هوشمند ---- */
  ipcMain.handle('planner:load-state', () => {
    try {
      return JSON.parse(fs.readFileSync(PLANNER_STATE(), 'utf8'));
    } catch {
      return null;
    }
  });

  ipcMain.handle('planner:save-state', (_e, data) => {
    try {
      fs.mkdirSync(path.dirname(PLANNER_STATE()), { recursive: true });
      fs.writeFileSync(PLANNER_STATE(), JSON.stringify(data), 'utf8');
      return { ok: true };
    } catch (err) {
      return { ok: false, error: err.message };
    }
  });

  ipcMain.handle('planner:save-file', async (_e, payload) => {
    try {
      const name = String((payload && payload.name) || 'plan.md');
      const content = String((payload && payload.content) || '');
      const res = await dialog.showSaveDialog(plannerWindow || mainWindow, {
        title: 'ذخیرهٔ برنامه',
        defaultPath: path.join(app.getPath('documents'), name),
        filters: [{ name: 'همه فایل‌ها', extensions: [String((payload && payload.ext) || 'txt')] }],
      });
      if (res.canceled || !res.filePath) return { ok: false, canceled: true };
      fs.writeFileSync(res.filePath, content, 'utf8');
      return { ok: true, path: res.filePath };
    } catch (err) {
      return { ok: false, error: err.message };
    }
  });

  ipcMain.handle('planner:close', () => {
    if (plannerWindow && !plannerWindow.isDestroyed()) plannerWindow.close();
    return { ok: true };
  });

  ipcMain.handle('account:close', () => {
    if (accountWindow && !accountWindow.isDestroyed()) accountWindow.close();
    return { ok: true };
  });
}
