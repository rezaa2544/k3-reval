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
const os = require('os');
const https = require('https');
const { spawn } = require('child_process');
const updaterCore = require('./updater.js');
const zipCore = require('./zip.js');
const codePatchCore = require('./code-patch.js');
const aiLlm = require('./ai-llm.js');

const APP_NAME = 'روال | Reval';
const HOME_URL = 'https://revaledu.ir/?view=dashboard';
const ALLOWED_HOSTS = ['revaledu.ir', 'www.revaledu.ir'];

/* ریشهٔ دارایی‌ها همیشه نسخهٔ نصب‌شده است؛ کد می‌تواند از وصلهٔ کوچک بیاید */
const ROOT = process.env.REVAL_ASSETS_ROOT || path.join(__dirname, '..');
/* نسخهٔ فعال: اگر وصلهٔ کد نصب شده باشد، همان است */
const APP_VERSION = process.env.REVAL_CODE_VERSION || app.getVersion();
const CODE_ROOT = process.env.REVAL_CODE_ROOT || path.join(__dirname, '..');
const ICON_ICO = path.join(ROOT, 'assets', 'icon.ico');
const ICON_PNG = path.join(ROOT, 'assets', 'icon.png');
const ICON_TRAY = path.join(ROOT, 'assets', 'icon-512.png');
const PRELOAD = path.join(__dirname, 'preload.js');
const ACCOUNT_PRELOAD = path.join(__dirname, 'account-preload.js');
const ACCOUNT_HTML = path.join(__dirname, 'account.html');
const SPLASH_HTML = path.join(__dirname, 'splash.html');
const OFFLINE_HTML = path.join(__dirname, 'offline.html');
const GATE_SKIP_SRC = path.join(__dirname, 'inject', 'gate-skip.js');
const TOOLBAR_SRC = path.join(__dirname, 'inject', 'toolbar.js');
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

const defaultState = { width: 1280, height: 820, maximized: false, zoom: 0, onboarded: false, lastUrl: '', hintShown: false };
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

let toolbarTemplate = null;
function injectToolbar(win) {
  if (!win || win.isDestroyed()) return;
  try {
    const current = win.webContents.getURL() || '';
    if (/\.html?(\?|$)/.test(current) && current.startsWith('file:')) return; // صفحهٔ آفلاین/داخلی
    if (toolbarTemplate === null) toolbarTemplate = fs.readFileSync(TOOLBAR_SRC, 'utf8');
    const src = toolbarTemplate.replace(/__REVAL_VERSION__/g, JSON.stringify(APP_VERSION));
    win.webContents.executeJavaScript(src, true).catch(() => {});
  } catch (err) {
    console.warn('[reval] toolbar inject:', err.message);
  }
}

/** آخرین صفحهٔ داخلی را نگه می‌دارد تا اجرای بعدی همان‌جا باز شود (مثلاً داشبورد پس از ورود) */
function rememberUrl(url) {
  try {
    if (!url || url.startsWith('file:') || !isInternalUrl(url)) return;
    if (/[?&]view=/.test(url) || /#(login|signup)/.test(url) === false) {
      if (url !== state.lastUrl) writeState({ lastUrl: url });
    }
  } catch { /* noop */ }
}

function showFirstRunHint() {
  if (state.hintShown) return;
  writeState({ hintShown: true });
  setTimeout(() => injectWelcomeBanner(mainWindow), 1500);
}

/** بنر معرفی (غیرمودال، خودبسته‌شو) — جایگزین دیالوگ مودال که میانبرها را می‌بلعید */
function injectWelcomeBanner(win) {
  if (!win || win.isDestroyed()) return;
  const planShortcut = process.platform === 'darwin' ? '⌘ ⇧ P' : 'Ctrl + Shift + P';
  const js = `(function(){
    if (document.getElementById('reval-welcome')) return;
    if (!document.body) return;
    var box = document.createElement('div');
    box.id = 'reval-welcome';
    box.setAttribute('dir','rtl');
    box.style.cssText = 'position:fixed;top:14px;left:0;right:0;margin-left:auto;margin-right:auto;width:-webkit-fit-content;width:fit-content;max-width:min(620px,92vw);z-index:2147483600;display:flex;gap:10px;align-items:center;flex-wrap:wrap;justify-content:center;background:#ffffff;color:#16233a;border:1px solid #e3e9f2;border-radius:14px;padding:12px 16px;box-shadow:0 18px 44px rgba(15,23,42,.16);font:13px/1.9 "Segoe UI",Tahoma,sans-serif';
    var t = document.createElement('span');
    t.textContent = 'نسخهٔ دسکتاپ روال آماده است — برنامه‌ریزی خودکار: دکمهٔ پایین صفحه یا ${planShortcut}';
    var b = document.createElement('button');
    b.textContent = 'باز کردن برنامه‌ریز';
    b.style.cssText = 'border:0;border-radius:10px;padding:8px 14px;cursor:pointer;font:600 12.5px inherit;background:linear-gradient(135deg,#4f46e5,#0ea5e9);color:#fff';
    b.onclick = function(){ if (window.revalDesktop) window.revalDesktop.openPlanner(); box.remove(); };
    var x = document.createElement('button');
    x.textContent = '\u00d7';
    x.style.cssText = 'border:0;background:transparent;color:#94a3b8;font-size:18px;cursor:pointer;line-height:1';
    x.onclick = function(){ box.remove(); };
    box.appendChild(t); box.appendChild(b); box.appendChild(x);
    document.body.appendChild(box);
    setTimeout(function(){ if (box.parentNode) box.remove(); }, 20000);
  })();`;
  win.webContents.executeJavaScript(js, true).catch(() => {});
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
    backgroundColor: '#f5f8fd',
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
    backgroundColor: '#f6f8fc',
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

function startUrl() {
  if (process.env.REVAL_START_URL) return process.env.REVAL_START_URL;   // تست/دیباگ
  const last = state.lastUrl;
  if (last && isInternalUrl(last) && !last.startsWith('file:')) return last;
  return HOME_URL;
}

function loadHome(win) {
  if (!win) return;
  win.loadURL(startUrl());
}

function createMainWindow() {
  state = readState();

  mainWindow = new BrowserWindow({
    width: state.width, height: state.height,
    x: state.x, y: state.y,
    minWidth: 940, minHeight: 620,
    title: APP_NAME + ' ' + APP_VERSION,
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
  mainWindow.webContents.on('did-finish-load', () => {
    closeSplash();
    applyGateSkip(mainWindow);
    injectToolbar(mainWindow);
    showFirstRunHint();
  });
  mainWindow.webContents.on('did-navigate', (_e, url) => {
    rememberUrl(url);
    applyGateSkip(mainWindow);
    injectToolbar(mainWindow);
  });
  mainWindow.webContents.on('did-navigate-in-page', (_e, url, isMainFrame) => {
    if (isMainFrame) rememberUrl(url);
    applyGateSkip(mainWindow);
    injectToolbar(mainWindow);
  });
  mainWindow.webContents.on('dom-ready', () => { applyGateSkip(mainWindow); injectToolbar(mainWindow); });

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
        { label: 'مشاور هوشمند — برنامه‌ریزی خودکار', accelerator: 'CmdOrCtrl+Shift+P', click: () => openPlannerWindow() },
        { type: 'separator' },
        { label: 'چاپ صفحه', accelerator: 'CmdOrCtrl+P', click: () => mainWindow && mainWindow.webContents.print({}) },
        { type: 'separator' },
        { label: 'خروج', accelerator: 'Alt+F4', role: 'quit' },
      ],
    },
    {
      label: 'مشاور هوشمند (برنامه‌ریزی خودکار)',
      submenu: [
        { label: 'برنامه‌ریزی خودکار…', accelerator: 'CmdOrCtrl+Shift+P', click: () => openPlannerWindow() },
        { label: 'راهنمای سریع', click: () => dialog.showMessageBox(mainWindow, {
          type: 'info', title: 'راهنمای مشاور هوشمند',
          message: 'چطور برنامهٔ خودکار بسازم؟',
          detail:
            '۱) در پنجرهٔ برنامه‌ریز: نام، پایه، گروه آزمایشی و تیپ صبح‌زی/شب‌زی را پر کن.\n' +
            '۲) ساعت‌های آزاد هر روز، ساعت خواب و روز استراحت را بگذار.\n' +
            '۳) کلاس‌های آنلاین هفتگی (روز + ساعت) و آزمون‌های آزمایشی (تاریخ + درس‌ها) را اضافه کن.\n' +
            '۴) وضعیت دروس (ضریب، تعداد فصل، تسلط) را وارد کن و «ساخت برنامهٔ من» را بزن.\n\n' +
            'خروجی: نمای روزانه/هفتگی، Markdown، CSV، تقویم ICS و کپی تسک‌های امروز برای روال.',
          buttons: ['باشه'], noLink: true,
        }) },
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
        { label: 'بررسی به‌روزرسانی…', click: () => { checkUpdatesInteractive(); } },
        { label: 'بازگشت به نسخهٔ نصب‌شده', click: () => {
          const r = revertCodePatch();
          dialog.showMessageBox(mainWindow, {
            type: 'info', title: 'بازگشت نسخه',
            message: r.reverted ? 'به نسخهٔ نصب‌شده برمی‌گردیم (' + (r.version || '') + ' حذف شد).' : 'الان روی نسخهٔ نصب‌شده هستی.',
            buttons: ['باشه'], noLink: true,
          }).then(() => { if (r.reverted) { app.relaunch(); app.exit(0); } });
        } },
        { label: 'بازکردن صفحهٔ نسخه‌ها در گیت‌هاب', click: () => openExternal('https://github.com/rezaa2544/k3-reval/releases') },
        { type: 'separator' },
        { label: 'درباره برنامه', click: () => dialog.showMessageBox(mainWindow, {
          type: 'info', title: 'درباره روال', message: 'روال — نسخه دسکتاپ',
          detail: `نسخه ${APP_VERSION}\nElectron ${process.versions.electron} · Chromium ${process.versions.chrome}\n\n` +
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
      { label: 'مشاور هوشمند (برنامه‌ریزی خودکار)', click: () => openPlannerWindow() },
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
/* به‌روزرسانی خودکار (GitHub Releases)                                */
/* ------------------------------------------------------------------ */

/** درخواست JSON با پیگیری ریدایرکت */
function httpJson(url, headers) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, { headers: Object.assign({ 'User-Agent': 'Reval-Desktop' }, headers || {}) }, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => {
        let body = null;
        try { body = JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { body = null; }
        resolve({ status: res.statusCode || 0, body });
      });
    });
    req.on('error', reject);
    req.setTimeout(20000, () => { req.destroy(new Error('پایان زمان انتظار شبکه')); });
  });
}

/** خواندن متن کوچک (مثل فایل چک‌سام) با پیگیری ریدایرکت */
function httpText(url, redirects) {
  const hop = redirects || 0;
  return new Promise((resolve, reject) => {
    if (hop > 6) { reject(new Error('ریدایرکت بیش از حد')); return; }
    const req = https.get(url, { headers: { 'User-Agent': 'Reval-Desktop' } }, (res) => {
      const code = res.statusCode || 0;
      if (code >= 300 && code < 400 && res.headers.location) {
        res.resume();
        resolve(httpText(res.headers.location, hop + 1));
        return;
      }
      if (code !== 200) { res.resume(); reject(new Error('کد پاسخ ' + code)); return; }
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    });
    req.on('error', reject);
    req.setTimeout(20000, () => req.destroy(new Error('پایان زمان انتظار')));
  });
}

function sha256File(file) {
  return require('crypto').createHash('sha256').update(fs.readFileSync(file)).digest('hex');
}

/** آیا می‌توان فقط کد را آپدیت کرد؟ (وصلهٔ کوچک + موتور یکسان + نسخهٔ بالاتر) */
function supportsPatch(latest, patch) {
  if (!patch || !patch.url) return false;
  if (!app.isPackaged) return false;
  const active = activeCodeVersion() || app.getVersion();
  if (updaterCore.compareVersions(latest, active) <= 0) return false;
  return true;
}

/** دانلود فایل با درصد پیشرفت و پیگیری ریدایرکت */
function downloadFile(url, dest, onProgress, redirects) {
  const hop = redirects || 0;
  return new Promise((resolve, reject) => {
    if (hop > 6) { reject(new Error('ریدایرکت بیش از حد')); return; }
    const req = https.get(url, { headers: { 'User-Agent': 'Reval-Desktop', Accept: 'application/octet-stream' } }, (res) => {
      const code = res.statusCode || 0;
      if (code >= 300 && code < 400 && res.headers.location) {
        res.resume();
        resolve(downloadFile(res.headers.location, dest, onProgress, hop + 1));
        return;
      }
      if (code !== 200) { res.resume(); reject(new Error('کد پاسخ ' + code)); return; }
      const total = Number(res.headers['content-length'] || 0);
      let received = 0;
      const out = fs.createWriteStream(dest);
      let done = false;
      const fail = (err) => {
        if (done) return;
        done = true;
        try { out.destroy(); } catch (_) { /* بی‌صدا */ }
        try { fs.unlinkSync(dest); } catch (_) { /* بی‌صدا */ }
        reject(err);
      };
      res.on('data', (c) => {
        received += c.length;
        try { onProgress({ received, total, percent: total ? (received / total) * 100 : 0 }); } catch (_) { /* بی‌صدا */ }
      });
      res.on('error', fail);
      out.on('error', fail);
      out.on('finish', () => {
        if (done) return;
        done = true;
        if (total && received !== total) { reject(new Error('دانلود ناقص (' + received + ' از ' + total + ')')); return; }
        resolve(dest);
      });
      res.pipe(out);
    });
    req.on('error', reject);
    req.setTimeout(120000, () => req.destroy(new Error('پایان زمان انتظار دانلود')));
  });
}

const INSTALL_DIR = () => {
  try { return path.dirname(app.getPath('exe')); } catch { return ''; }
};

/** اجرای نصب‌کننده به‌صورت سایلنت و هم‌مسیر نسخهٔ فعلی */
function runInstaller(file, opts) {
  return new Promise((resolve, reject) => {
    const dir = (opts && opts.installDir) || INSTALL_DIR();
    const args = ['/S'];
    /* /D باید آخرین پارامتر و بدون کوتیشن باشد؛ اگر مسیر فاصله دارد
       از آن صرف‌نظر می‌کنیم و نصب‌کننده در مسیر پیش‌فرض خودش نصب می‌کند. */
    if (dir && dir.indexOf(' ') === -1) args.push('/D=' + dir);
    try {
      const child = spawn(file, args, { detached: true, stdio: 'ignore', windowsHide: true });
      child.on('error', reject);
      child.unref();
      setTimeout(resolve, 900); // مهلت کوتاه تا فایل قفل‌نشده باقی نماند
    } catch (err) { reject(err); }
  });
}

/* ------------------------------------------------------------------ */
/* وصلهٔ کد (به‌روزرسانی کوچک)                                        */
/* ------------------------------------------------------------------ */

const CODE_DIR = () => process.env.REVAL_CODE_DIR || path.join(app.getPath('userData'), 'code');

/** نسخهٔ کدِ فعال (اگر وصله نصب شده باشد) */
function activeCodeVersion() {
  return process.env.REVAL_CODE_VERSION || null;
}

/** نصب وصلهٔ کد: باز کردن ZIP و فعال‌سازی آن (بدون Electron داخل منطق) */
function installCodePatch(zipPath, meta) {
  return codePatchCore.installPatch(zipPath, meta, {
    codeDir: CODE_DIR(),
    electronVersion: process.versions.electron,
  });
}

/** بازگشت به کدِ نصب‌شده (حذف وصله) */
function revertCodePatch() {
  return codePatchCore.revert(CODE_DIR(), 'menu');
}

/** نشانهٔ «بالا آمد» — تا اجرای بعدی بداند وصله سالم است */
function markBootOk() {
  codePatchCore.markBootOk(CODE_DIR());
}

const updater = updaterCore.createUpdater({
  getCurrentVersion: () => APP_VERSION,
  httpJson,
  downloadFile,
  runInstaller,
  installDir: INSTALL_DIR,
  exists: (p) => { try { return fs.existsSync(p); } catch { return false; } },
  fileSize: (p) => { try { return fs.statSync(p).size; } catch { return -1; } },
  tempPath: (name) => path.join(os.tmpdir(), name || 'Reval-Setup.exe'),
  httpText,
  sha256: sha256File,
  supportsPatch,
  onEvent: (ev) => broadcastUpdate(ev),
  quit: () => { app.isQuitting = true; app.quit(); },
  /* ---- وصلهٔ کد ---- */
  currentCodeVersion: () => activeCodeVersion(),
  electronVersion: () => process.versions.electron,
  installPatch: (zipPath, meta) => installCodePatch(zipPath, meta),
  relaunch: () => {
    app.isQuitting = true;
    setTimeout(() => { app.relaunch(); app.exit(0); }, 400);
  },
});

function broadcastUpdate(ev) {
  [plannerWindow, mainWindow, accountWindow].forEach((w) => {
    if (w && !w.isDestroyed()) { try { w.webContents.send('update:event', ev); } catch (_) { /* بی‌صدا */ } }
  });
}

/** بررسی به‌روزرسانی از منوی برنامه (با پنجرهٔ نتیجه) */
async function checkUpdatesInteractive() {
  const owner = plannerWindow || mainWindow;
  try { openPlannerWindow(); } catch (_) { /* بی‌صدا */ }
  broadcastUpdate({ type: 'checking', state: updater.snapshot() });
  const snap = await updater.check({ silent: false });
  if (snap.status === 'available') {
    dialog.showMessageBox(owner || null, {
      type: 'info', title: 'نسخهٔ جدید موجود است',
      message: `نسخهٔ ${snap.latest} آماده است (نسخهٔ فعلی ${snap.current}).`,
      detail: 'در پنجرهٔ «مشاور هوشمند» روی دکمهٔ «به‌روزرسانی» بزن؛ خودش دانلود و نصب می‌کند و برنامه دوباره باز می‌شود.',
      buttons: ['باشه'], noLink: true,
    });
  } else if (snap.status === 'latest') {
    dialog.showMessageBox(owner || null, {
      type: 'info', title: 'به‌روز است', message: `شما آخرین نسخه را دارید (${snap.current}).`,
      buttons: ['باشه'], noLink: true,
    });
  } else if (snap.status === 'error') {
    dialog.showMessageBox(owner || null, {
      type: 'warning', title: 'بررسی به‌روزرسانی', message: 'بررسی انجام نشد.',
      detail: snap.error || 'اتصال اینترنت یا دسترسی به گیت‌هاب را بررسی کن.',
      buttons: ['باشه'], noLink: true,
    });
  }
  return snap;
}

let updateTimer = null;
function scheduleUpdateChecks() {
  if (updateTimer) clearInterval(updateTimer);
  const first = setTimeout(() => { updater.check({ silent: true }); }, 12000);
  if (first.unref) first.unref();
  updateTimer = setInterval(() => updater.check({ silent: true }), 4 * 60 * 60 * 1000);
  if (updateTimer.unref) updateTimer.unref();
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

    markBootOk();

    /* بررسی خودکار به‌روزرسانی: ۱۲ ثانیه بعد از باز شدن و هر ۴ ساعت */
    scheduleUpdateChecks();
  });

  app.on('before-quit', () => { app.isQuitting = true; });
  app.on('window-all-closed', () => app.quit());

  /* ---- IPC: صفحه/پنجره ---- */
  ipcMain.handle('reval:retry', () => {
    closeSplash();
    if (mainWindow) loadHome(mainWindow);
  });
  ipcMain.handle('reval:info', () => ({
    version: APP_VERSION,
    electron: process.versions.electron,
    chrome: process.versions.chrome,
    platform: process.platform,
    homeUrl: HOME_URL,
  }));
  ipcMain.handle('reval:open-external', (_e, url) => openExternal(url));

  /* ---- IPC: حساب کاربری ---- */
  ipcMain.handle('reval:open-account', () => openAccountWindow());
  ipcMain.handle('reval:open-planner', () => openPlannerWindow());
  ipcMain.handle('reval:apply-autologin', () => { applyGateSkip(mainWindow); return { ok: true }; });
  ipcMain.handle('reval:go-home', () => { if (mainWindow) mainWindow.loadURL(HOME_URL); return { ok: true }; });
  ipcMain.handle('reval:version', () => APP_VERSION);

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
  /* ---------------- هوش مصنوعی (گفت‌وگو با مشاور) ----------------
     کلید API فقط در فرایند اصلی خوانده/نوشته می‌شود و هرگز به صفحه برنمی‌گردد. */
  const AI_DIR = () => app.getPath('userData');

  ipcMain.handle('ai:config', () => ({
    ...aiLlm.publicConfig(AI_DIR()),
    providers: aiLlm.providersPublic(),
  }));

  ipcMain.handle('ai:save-config', (_e, patch) => {
    try {
      const p = Object.assign({}, patch || {});
      if (p.clearKey) { p.key = ''; delete p.clearKey; }
      aiLlm.writeConfig(AI_DIR(), p);
      return { ok: true, config: aiLlm.publicConfig(AI_DIR()) };
    } catch (err) {
      return { ok: false, error: err.message };
    }
  });

  ipcMain.handle('ai:test', async () => aiLlm.test(AI_DIR()));

  ipcMain.handle('ai:chat', async (_e, payload) => {
    const res = await aiLlm.chat(AI_DIR(), payload || {});
    return res;
  });

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

  /* ---- IPC: به‌روزرسانی ---- */
  ipcMain.handle('update:state', () => updater.snapshot());
  ipcMain.handle('update:check', async (_e, opts) => {
    await updater.check({ silent: false });
    return updater.snapshot();
  });
  ipcMain.handle('update:download', async () => { await updater.download(); return updater.snapshot(); });
  ipcMain.handle('update:install', async () => { await updater.install(); return updater.snapshot(); });
  ipcMain.handle('update:now', async () => { await updater.updateNow(); return updater.snapshot(); });
  ipcMain.handle('update:code-info', () => ({
    active: activeCodeVersion(),
    packaged: app.getVersion(),
    reverts: codePatchCore.lastRevert(CODE_DIR()),
  }));
  ipcMain.handle('update:revert-code', async () => {
    const res = revertCodePatch();
    if (res.reverted) setTimeout(() => { app.relaunch(); app.exit(0); }, 300);
    return res;
  });
  ipcMain.handle('update:open-release', async () => {
    const snap = updater.snapshot();
    if (snap.pageUrl) openExternal(snap.pageUrl);
    return { ok: true };
  });

  ipcMain.handle('account:close', () => {
    if (accountWindow && !accountWindow.isDestroyed()) accountWindow.close();
    return { ok: true };
  });
}
