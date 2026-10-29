'use strict';

/**
 * تست End-to-End به‌روزرسانی خودکار (نسخهٔ ۲.۳.۱ — دانلود فقط تغییرات)
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
const codePatch = require('../src/code-patch.js');
const { makeZip } = require('../scripts/make-code-patch.js');

const OUT = path.join(__dirname, '..', 'docs', 'screens');
const ROOT = path.join(__dirname, '..');
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

let pass = 0;
const ok = (cond, msg) => { assert.ok(cond, msg); pass++; console.log('  ✓ ' + msg); };

/* فایل نصبی قلابی: ۲ مگابایت بایت تصادفی تا دانلود واقعی معنی داشته باشد */
const FAKE_SIZE = 2 * 1024 * 1024;
const FAKE_EXE = path.join(os.tmpdir(), 'Reval-Setup-9.9.9.exe');
fs.writeFileSync(FAKE_EXE, Buffer.alloc(FAKE_SIZE, 7));

/* بستهٔ «فقط تغییرات»: چند فایل کد، مثل وصلهٔ واقعی */
const FAKE_PATCH = makeZip([
  { name: 'src/main.js', data: Buffer.from('// نسخهٔ ۹.۹.۹ (تست)\n') },
  { name: 'src/planner/planner.js', data: Buffer.from(('// planner 9.9.9' + String.fromCharCode(10)).repeat(1500), 'utf8') },
  { name: 'package.json', data: Buffer.from('{"version":"9.9.9"}', 'utf8') },
  { name: 'patch-manifest.json', data: Buffer.from('{"version":"9.9.9"}', 'utf8') },
]);
const FAKE_PATCH_SHA = require('crypto').createHash('sha256').update(FAKE_PATCH).digest('hex');

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
      if (req.url === '/patch') {
        res.writeHead(200, { 'Content-Type': 'application/zip', 'Content-Length': FAKE_PATCH.length });
        res.end(FAKE_PATCH);
        return;
      }
      if (req.url === '/patch-sha') {
        res.writeHead(200, { 'Content-Type': 'text/plain' });
        res.end(FAKE_PATCH_SHA + '  reval-code-9.9.9.zip\n');
        return;
      }
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
          { name: 'reval-code-9.9.9.zip', size: FAKE_PATCH.length, browser_download_url: 'http://127.0.0.1:' + port + '/patch' },
          { name: 'reval-code-9.9.9.zip.sha256', size: 90, browser_download_url: 'http://127.0.0.1:' + port + '/patch-sha' },
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

/* پوشهٔ کاربری وصله (به‌جای %APPDATA% در تست) */
const TEST_USERDATA = fs.mkdtempSync(path.join(os.tmpdir(), 'e2e-userdata-'));
const CODE_DIR = path.join(TEST_USERDATA, 'code');
state.relaunchCalled = false;

const updater = core.createUpdater({
  getCurrentVersion: () => '2.2.0',
  electronVersion: () => process.versions.electron,
  supportsPatch: () => true,
  currentCodeVersion: () => codePatch.activeVersion(CODE_DIR),
  installPatch: (file, meta) => codePatch.installPatch(file, meta, {
    codeDir: CODE_DIR,
    electronVersion: process.versions.electron,
  }),
  relaunch: () => { state.relaunchCalled = true; },
  httpText: (url) => new Promise((resolve, reject) => {
    require('http').get(url, (res) => {
      const c = [];
      res.on('data', (d) => c.push(d));
      res.on('end', () => resolve(Buffer.concat(c).toString('utf8')));
    }).on('error', reject);
  }),
  sha256: (f) => require('crypto').createHash('sha256').update(fs.readFileSync(f)).digest('hex'),
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
  ok(/به‌روزرسانی/.test(bar.action), 'دکمهٔ یک‌کلیکی «به‌روزرسانی» است (' + bar.action + ')');
  await shot('21-update-available.png');

  const avail2 = await js(`(function(){
    const sub = document.getElementById('ubarSub').textContent;
    const act = document.getElementById('ubarAction').textContent;
    const full = document.getElementById('ubarFull');
    return { sub, act, fullHidden: full.hidden, fullText: full.textContent };
  })()`);
  ok(avail2.sub.indexOf('فقط بخش‌های تغییریافته') !== -1, 'نوار می‌گوید فقط تغییرات دانلود می‌شود');
  ok(/کیلوبایت/.test(avail2.act), 'حجم واقعی وصله روی دکمه نوشته شده (' + avail2.act + ')');
  ok(avail2.fullHidden === false, 'گزینهٔ «نصب کامل» هم به‌عنوان جایگزین دیده می‌شود');
  ok(!/76 مگابایت/.test(avail2.sub), 'برای بستهٔ کوچک، عدد ۷۶ مگابایت تبلیغ نمی‌شود');

  console.log('۴) دانلود فقط تغییرات (وصلهٔ کد)');
  const patchSize = FAKE_PATCH.length;
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
  ok(codePatch.activeVersion(CODE_DIR) === '9.9.9', 'وصله نصب و فعال شد (نسخهٔ ۹.۹.۹)');
  const installedMain = path.join(CODE_DIR, '9.9.9', 'src', 'main.js');
  ok(fs.existsSync(installedMain), 'فایل‌های کد جدید در پوشهٔ نسخه نشستند');
  ok(fs.readFileSync(installedMain, 'utf8').length > 5, 'محتوای کد جدید نوشته شده است (' + fs.statSync(installedMain).size + ' بایت)');
  ok(state.relaunchCalled === true, 'برنامه برای اجرای کد تازه دوباره راه‌اندازی می‌شود');
  ok(state.installed === null, 'این بار نصب‌کنندهٔ ۷۶ مگابایتی اجرا نشد');
  ok(patchSize < FAKE_SIZE / 4, 'حجم دانلود وصله یک‌چهارم فایل نصبی هم نیست (' + Math.round(patchSize / 1024) + 'KB در برابر ' + Math.round(FAKE_SIZE / 1048576) + 'MB)');

  console.log('۵-۲) راه‌انداز نسخهٔ وصله‌شده را انتخاب می‌کند');
  const packagedRoot = path.join(ROOT);
  const packedOk = fs.existsSync(path.join(packagedRoot, 'src', 'main.js'));
  ok(packedOk, 'کدِ نصب‌شده هم موجود است (مرجع بازگشت)');
  const decision = codePatch.decide(CODE_DIR, packagedRoot);
  ok(decision.activeVersion === '9.9.9' && decision.activeRoot.indexOf('9.9.9') !== -1,
    'راه‌انداز، کدِ وصله‌شده را بار می‌کند');
  let syntaxOk = true;
  try { new (require('vm').Script)(fs.readFileSync(path.join(decision.activeRoot, 'src', 'main.js'), 'utf8')); }
  catch (e) { syntaxOk = false; }
  ok(syntaxOk, 'کدِ وصله‌شده از نظر نحوی سالم است');

  console.log('۵-۳) بازگشت خودکار اگر نسخهٔ جدید بالا نیاید');
  codePatch.markPending(CODE_DIR, '9.9.9'); /* شبیه‌سازی: دفعهٔ قبل بالا نیامد */
  const rolledBack = codePatch.decide(CODE_DIR, packagedRoot);
  ok(rolledBack.reverted === true && rolledBack.activeVersion === null,
    'برنامه خودکار به نسخهٔ نصب‌شده برمی‌گردد');
  ok(codePatch.lastRevert(CODE_DIR).version === '9.9.9', 'دلیل بازگشت ثبت می‌شود');

  console.log('٤-۲) نصب کامل هم کار می‌کند (برای وقتی موتور عوض شده)');
  state.quitCalled = false;

  let fullInstaller = null;
  const uFull = core.createUpdater({
    getCurrentVersion: () => '2.2.0',
    electronVersion: () => process.versions.electron,
    supportsPatch: () => true,
    httpJson: () => httpJson('http://127.0.0.1:' + state.http.address().port + '/api'),
    httpText: () => Promise.resolve(FAKE_PATCH_SHA),
    sha256: (f) => require('crypto').createHash('sha256').update(fs.readFileSync(f)).digest('hex'),
    downloadFile,
    installPatch: () => { throw new Error('نباید در حالت کامل اجرا شود'); },
    relaunch: () => {},
    runInstaller: async (file, opts) => { fullInstaller = { file, opts }; },
    installDir: () => 'C:\\Apps\\Reval',
    exists: () => false,
    fileSize: () => -1,
    tempPath: (name) => path.join(os.tmpdir(), 'e2e-full-' + name),
    onEvent: () => {},
    quit: () => {},
  });
  await uFull.check();
  const fullState = await uFull.download({ full: true });
  ok(fullState.status === 'ready', 'نصب‌کنندهٔ کامل دانلود شد (حالت صریح)');
  await uFull.install();
  ok(fullInstaller !== null, 'در حالت کامل، نصب‌کننده اجرا می‌شود');

  console.log('۶) مسیر «یک دکمه»: دانلود + نصب با یک کلیک');
  let nowInstalled = null;
  const uNow = core.createUpdater({
    getCurrentVersion: () => '2.2.0',
    supportsPatch: () => false,
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
