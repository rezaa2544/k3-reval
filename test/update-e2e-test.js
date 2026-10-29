'use strict';

/**
 * تست End-to-End به‌روزرسانی خودکار (نسخهٔ ۲.۲)
 * ----------------------------------------------------------
 * زنجیرهٔ واقعی را می‌آزماید: سرور HTTP محلی (شبیه گیت‌هاب) →
 * هستهٔ updater.js → کانال‌های IPC → پل preload → دکمهٔ رابط کاربری.
 * فقط «اجرای نصب‌کننده» و «بستن برنامه» جایگزین (stub) می‌شوند.
 *
 * اجرا:  xvfb-run -a npx electron test/update-e2e-test.js
 */

const { app, BrowserWindow, ipcMain } = require('electron');
const http = require('http');
const fs = require('fs');
const os = require('os');
const path = require('path');
const assert = require('assert');

const core = require('../src/updater.js');

const OUT = path.join(__dirname, '..', 'docs', 'screens');
const ROOT = path.join(__dirname, '..');
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

let pass = 0;
const ok = (cond, msg) => { assert.ok(cond, msg); pass++; console.log('  ✓ ' + msg); };

/* فایل نصبی قلابی: ۲ مگابایت بایت تصادفی تا دانلود واقعی معنی داشته باشد */
const FAKE_SIZE = 2 * 1024 * 1024;
const FAKE_EXE = path.join(os.tmpdir(), 'Reval-Setup-9.9.9.exe');
fs.writeFileSync(FAKE_EXE, Buffer.alloc(FAKE_SIZE, 7));

const state = {
  http: null,
  installed: null,
  quitCalled: false,
  events: [],
  win: null,
};

function startFakeGitHub() {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      if (req.url === '/dl') {
        res.writeHead(200, { 'Content-Type': 'application/octet-stream', 'Content-Length': FAKE_SIZE });
        fs.createReadStream(FAKE_EXE).pipe(res);
        return;
      }
      /* /api → پاسخ Releases گیت‌هاب */
      const port = server.address().port;
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        tag_name: 'v9.9.9',
        name: 'v9.9.9 — تست',
        body: 'این یک نسخهٔ آزمایشی برای تست به‌روزرسانی خودکار است.',
        published_at: '2026-10-29T10:00:00Z',
        html_url: 'https://github.com/rezaa2544/k3-reval/releases/tag/v9.9.9',
        assets: [
          { name: 'SHA256.txt', size: 88, browser_download_url: 'http://127.0.0.1:' + port + '/dl' },
          { name: 'Reval-Setup-9.9.9.exe', size: FAKE_SIZE, browser_download_url: 'http://127.0.0.1:' + port + '/dl' },
        ],
      }));
    });
    server.listen(0, '127.0.0.1', () => resolve(server));
  });
}

/** همان تابع دانلود main.js اما با http/https عمومی */
function downloadFile(url, dest, onProgress, redirects) {
  const hop = redirects || 0;
  const mod = url.startsWith('https:') ? require('https') : http;
  return new Promise((resolve, reject) => {
    if (hop > 6) { reject(new Error('ریدایرکت بیش از حد')); return; }
    const req = mod.get(url, (res) => {
      const code = res.statusCode || 0;
      if (code >= 300 && code < 400 && res.headers.location) { res.resume(); resolve(downloadFile(res.headers.location, dest, onProgress, hop + 1)); return; }
      if (code !== 200) { res.resume(); reject(new Error('کد ' + code)); return; }
      const total = Number(res.headers['content-length'] || 0);
      let received = 0;
      const out = fs.createWriteStream(dest);
      res.on('data', (c) => { received += c.length; onProgress({ received, total, percent: total ? (received / total) * 100 : 0 }); });
      out.on('finish', () => resolve(dest));
      res.on('error', reject);
      out.on('error', reject);
      res.pipe(out);
    });
    req.on('error', reject);
  });
}

function httpJson(url) {
  const mod = url.startsWith('https:') ? require('https') : http;
  return new Promise((resolve, reject) => {
    const req = mod.get(url, { headers: { 'User-Agent': 'Reval-Desktop' } }, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => {
        let body = null;
        try { body = JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { body = null; }
        resolve({ status: res.statusCode || 0, body });
      });
    });
    req.on('error', reject);
  });
}

const updater = core.createUpdater({
  getCurrentVersion: () => '2.2.0',
  httpJson: (url, headers) => {
    /* آدرس API گیت‌هاب به سرور محلی هدایت می‌شود */
    const local = state.http ? 'http://127.0.0.1:' + state.http.address().port + '/api' : url;
    return httpJson(local, headers);
  },
  downloadFile,
  runInstaller: async (file, opts) => { state.installed = { file, opts }; },
  installDir: () => 'C:\\Users\\test\\AppData\\Local\\Programs\\Reval',
  exists: (p) => { try { return fs.existsSync(p); } catch { return false; } },
  fileSize: (p) => { try { return fs.statSync(p).size; } catch { return -1; } },
  tempPath: (name) => path.join(os.tmpdir(), 'e2e-' + name),
  onEvent: (ev) => {
    state.events.push(ev);
    if (state.win && !state.win.isDestroyed()) state.win.webContents.send('update:event', ev);
  },
  quit: () => { state.quitCalled = true; },
});

app.commandLine.appendSwitch('disable-gpu');
app.disableHardwareAcceleration();

app.whenReady().then(async () => {
  /* پاک کردن دانلودهای تست‌های قبلی تا کش، اجرای دانلود واقعی را پنهان نکند */
  try {
    fs.readdirSync(os.tmpdir())
      .filter((f) => f.indexOf('e2e-') === 0)
      .forEach((f) => { try { fs.unlinkSync(path.join(os.tmpdir(), f)); } catch (_) { /* بی‌صدا */ } });
  } catch (_) { /* بی‌صدا */ }

  state.http = await startFakeGitHub();

  /* ---- IPC مثل main.js ---- */
  ipcMain.handle('update:state', () => updater.snapshot());
  ipcMain.handle('update:check', async () => { await updater.check({ silent: false }); return updater.snapshot(); });
  ipcMain.handle('update:download', async () => { await updater.download(); return updater.snapshot(); });
  ipcMain.handle('update:install', async () => { await updater.install(); return updater.snapshot(); });
  ipcMain.handle('update:now', async () => { await updater.updateNow(); return updater.snapshot(); });
  ipcMain.handle('update:open-release', () => ({ ok: true }));
  ipcMain.handle('planner:load-state', () => ({ config: null }));
  ipcMain.handle('planner:save-state', () => ({ ok: true }));
  ipcMain.handle('reval:info', () => ({ version: '2.2.0', platform: process.platform }));

  state.win = new BrowserWindow({
    width: 1280, height: 900, show: false,
    webPreferences: {
      preload: path.join(ROOT, 'src', 'planner', 'planner-preload.js'),
      contextIsolation: true, nodeIntegration: false, offscreen: true,
    },
  });
  await state.win.loadFile(path.join(ROOT, 'src', 'planner', 'planner.html'));
  await state.win.webContents.executeJavaScript('localStorage.clear()');
  state.win.reload();
  await wait(1800);

  const shot = async (name) => {
    const img = await state.win.webContents.capturePage();
    fs.writeFileSync(path.join(OUT, name), img.toPNG());
    console.log('  shot →', name);
  };
  const js = (code) => state.win.webContents.executeJavaScript(code);

  console.log('۱) پل preload');
  const bridge = await js('typeof window.revalPlanner.updates === "object"');
  ok(bridge === true, 'window.revalPlanner.updates در صفحه موجود است');
  const stateInitial = await js('window.revalPlanner.updates.state()');
  ok(stateInitial && stateInitial.current === '2.2.0', 'نسخهٔ فعلی برنامه از main خوانده می‌شود (' + stateInitial.current + ')');

  console.log('۲) چیپ نسخه در رابط کاربری');
  const chipText = await js('document.getElementById("verText").textContent');
  ok(chipText.indexOf('۲.۲.۰') !== -1, 'شمارهٔ نسخه به فارسی نمایش داده می‌شود (' + chipText + ')');

  console.log('۳) کلیک روی چیپ → بررسی → نوار به‌روزرسانی');
  await js('document.getElementById("verChip").click(), true');
  await wait(1200);
  const bar = await js(`(function(){
    const b = document.getElementById('updateBar');
    return { hidden: b.hidden, title: document.getElementById('ubarTitle').textContent,
             sub: document.getElementById('ubarSub').textContent,
             action: document.getElementById('ubarAction').textContent };
  })()`);
  ok(bar.hidden === false, 'نوار به‌روزرسانی نمایش داده شد');
  ok(bar.title.indexOf('۹.۹.۹') !== -1, 'شمارهٔ نسخهٔ جدید در عنوان آمده (' + bar.title + ')');
  ok(bar.action === 'به‌روزرسانی', 'دکمهٔ یک‌کلیکی «به‌روزرسانی» است');
  await shot('21-update-available.png');

  console.log('۴) دانلود واقعی با نوار پیشرفت');
  await js('window.revalPlanner.updates.download(), true');
  await wait(2000);
  const after = await js(`(function(){
    const b = document.getElementById('updateBar');
    return { cls: b.className, title: document.getElementById('ubarTitle').textContent,
             sub: document.getElementById('ubarSub').textContent,
             action: document.getElementById('ubarAction').textContent,
             width: document.getElementById('ubarFill').style.width };
  })()`);
  ok(/done/.test(after.cls), 'نوار در وضعیت «آمادهٔ نصب» قرار گرفت');
  ok(after.title.indexOf('دانلود شد') !== -1, 'پیام «دانلود شد» نمایش داده می‌شود (' + after.title + ')');
  ok(after.action === 'نصب و راه‌اندازی مجدد', 'دکمه به «نصب و راه‌اندازی مجدد» تغییر کرد');
  ok(after.width === '100%', 'نوار پیشرفت ۱۰۰٪ شد');
  console.log('    رویدادها:', state.events.map((e) => e.type + ':' + (e.state && e.state.percent)).join(' | '));
  ok(state.events.some((e) => e.type === 'progress'), 'رویدادهای درصد پیشرفت به رابط رسیدند');
  await shot('22-update-ready.png');

  console.log('۵) کلیک روی دکمهٔ نصب');
  await js('document.getElementById("ubarAction").click(), true');
  await wait(1500);
  ok(state.installed !== null, 'نصب‌کننده اجرا شد');
  ok(state.installed && fs.existsSync(state.installed.file), 'فایل دانلودشده روی دیسک هست (' + path.basename(state.installed.file) + ')');
  ok(state.installed && fs.statSync(state.installed.file).size === FAKE_SIZE, 'حجم فایل دانلودشده دقیقاً همان حجم اعلامی است');
  ok(state.installed.opts.installDir.indexOf('Programs\\Reval') !== -1, 'مسیر نصب فعلی به نصب‌کننده داده شد');
  await wait(900);
  ok(state.quitCalled === true, 'پس از اجرای نصب، برنامه برای جایگزینی فایل بسته می‌شود');

  console.log('۶) مسیر «یک دکمه»: دانلود + نصب با یک کلیک');
  let nowInstalled = null;
  const uNow = core.createUpdater({
    getCurrentVersion: () => '2.2.0',
    httpJson: (url) => httpJson('http://127.0.0.1:' + state.http.address().port + '/api'),
    downloadFile,
    runInstaller: async (file, opts) => { nowInstalled = { file, opts }; },
    installDir: () => 'C:\\Apps\\Reval',
    exists: () => false,
    fileSize: () => -1,
    tempPath: (name) => path.join(os.tmpdir(), 'e2e-now-' + name),
    quit: () => {},
  });
  await uNow.check();
  const done = await uNow.updateNow();
  ok(nowInstalled !== null, 'با یک کلیک هم دانلود و هم نصب انجام شد');
  ok(done.status === 'installing' || done.status === 'ready', 'وضعیت نهایی «نصب» است (' + done.status + ')');
  ok(nowInstalled && fs.statSync(nowInstalled.file).size === FAKE_SIZE, 'فایل یک‌کلیکی کامل دانلود شد');

  console.log('\n✅ ' + pass + ' بررسی End-to-End به‌روزرسانی پاس شد');
  try { state.http.close(); } catch (_) { /* بی‌صدا */ }
  state.win.destroy();
  app.exit(0);
}).catch((err) => {
  console.error('\n❌ ' + (err && err.message ? err.message : err));
  app.exit(1);
});
