'use strict';

/**
 * تست به‌روزرسانی خودکار (نسخهٔ ۲.۲)
 * هستهٔ updater.js بدون Electron تست می‌شود + سیم‌کشی رابط کاربری و main.js.
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const upd = require('../src/updater.js');

let pass = 0;
const ok = (cond, msg) => { assert.ok(cond, msg); pass++; console.log('  ✓ ' + msg); };

const ROOT = path.join(__dirname, '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

/* ═══ ۱) مقایسهٔ نسخه ═══ */
console.log('۱) مقایسهٔ نسخه');
ok(upd.compareVersions('2.2.0', '2.1.0') === 1, '۲.۲.۰ جدیدتر از ۲.۱.۰ است');
ok(upd.compareVersions('2.1.0', '2.2.0') === -1, '۲.۱.۰ قدیمی‌تر از ۲.۲.۰ است');
ok(upd.compareVersions('v2.1.0', '2.1.0') === 0, 'پیشوند v نادیده گرفته می‌شود');
ok(upd.compareVersions('2.10.0', '2.9.9') === 1, 'مقایسهٔ عددی درست است (۱۰ > ۹)');
ok(upd.compareVersions('3.0.0', '2.99.99') === 1, 'نسخهٔ major بالاتر برنده است');
ok(upd.compareVersions('2.2.0-beta.1', '2.2.0') === -1, 'پیش‌انتشار از نسخهٔ نهایی قدیمی‌تر است');
ok(upd.compareVersions('نامعتبر', '2.0.0') === 0, 'نسخهٔ نامعتبر باعث خطا نمی‌شود');

/* ═══ ۲) انتخاب فایل نصبی از دارایی‌های Release ═══ */
console.log('۲) انتخاب فایل نصبی');
const assets = [
  { name: 'SHA256.txt', size: 88, browser_download_url: 'u1' },
  { name: 'Reval-Setup-2.2.0.exe', size: 79725461, browser_download_url: 'u2' },
  { name: 'Reval-Setup-2.2.0.exe.blockmap', size: 70000, browser_download_url: 'u3' },
  { name: 'notes.md', size: 1200, browser_download_url: 'u4' },
];
const picked = upd.pickAsset(assets);
ok(picked && picked.name === 'Reval-Setup-2.2.0.exe', 'فقط فایل Reval-Setup-*.exe انتخاب می‌شود (' + (picked && picked.name) + ')');
ok(upd.pickAsset([{ name: 'a.zip', size: 1 }]) === null, 'اگر فایل نصبی نباشد null برمی‌گردد');
ok(upd.pickAsset([]) === null, 'آرایهٔ خالی → null');

/* ═══ ۳) خواندن پاسخ گیت‌هاب ═══ */
console.log('۳) تفسیر پاسخ Release');
const rel = {
  tag_name: 'v2.3.0',
  body: 'یادداشت‌های نسخه',
  published_at: '2026-11-01T10:00:00Z',
  html_url: 'https://github.com/rezaa2544/k3-reval/releases/tag/v2.3.0',
  assets: assets,
};
const p1 = upd.parseRelease(rel, '2.2.0');
ok(p1.ok && p1.hasUpdate, 'نسخهٔ ۲.۳.۰ نسبت به ۲.۲.۰ به‌روزرسانی است');
ok(p1.latest === '2.3.0', 'شمارهٔ نسخه از tag برداشته می‌شود');
ok(p1.asset && p1.asset.url === 'u2', 'لینک دانلود مستقیم فایل نصبی درست است');
ok(p1.notes === 'یادداشت‌های نسخه' && p1.pageUrl.indexOf('v2.3.0') !== -1, 'یادداشت‌ها و صفحهٔ نسخه همراه پاسخ هستند');

const p2 = upd.parseRelease(Object.assign({}, rel, { tag_name: 'v2.2.0' }), '2.2.0');
ok(p2.ok && !p2.hasUpdate, 'همان نسخه → به‌روزرسانی لازم نیست');

const p3 = upd.parseRelease(Object.assign({}, rel, { assets: [{ name: 'notes.md', size: 10 }] }), '2.2.0');
ok(p3.missingAsset === true, 'نسخهٔ تازه بدون فایل نصبی به‌درستی تشخیص داده می‌شود');

const p4 = upd.parseRelease(null, '2.2.0');
ok(!p4.ok && !p4.hasUpdate, 'پاسخ خالی → خطای کنترل‌شده');

/* ═══ ۴) چرخهٔ کامل با تزریق وابستگی (شبیه‌سازی گیت‌هاب) ═══ */
console.log('۴) چرخهٔ بررسی → دانلود → نصب');
const events = [];
let downloaded = 0;
let installedWith = null;
let quitCalled = false;
const files = {};

const u = upd.createUpdater({
  getCurrentVersion: () => '2.2.0',
  httpJson: async () => ({ status: 200, body: rel }),
  downloadFile: async (url, dest, onProgress) => {
    for (let i = 1; i <= 4; i++) onProgress({ received: i * 25, total: 100, percent: i * 25 });
    downloaded++;
    files[dest] = 79725461; /* همان حجم اعلامی دارایی گیت‌هاب */
    return dest;
  },
  runInstaller: async (file, opts) => { installedWith = { file, opts }; },
  exists: (p) => Object.prototype.hasOwnProperty.call(files, p),
  fileSize: (p) => files[p] || -1,
  tempPath: (n) => '/tmp/' + n,
  installDir: () => 'C:\\Users\\x\\AppData\\Local\\Programs\\Reval',
  onEvent: (ev) => events.push(ev),
  quit: () => { quitCalled = true; },
});

(async () => {
  const s1 = await u.check();
  ok(s1.status === 'available' && s1.hasUpdate, 'بررسی، نسخهٔ جدید را پیدا می‌کند');
  ok(s1.current === '2.2.0' && s1.latest === '2.3.0', 'نسخهٔ فعلی و تازه گزارش می‌شوند');
  ok(events.some((e) => e.type === 'available'), 'رویداد «موجود است» به رابط کاربری فرستاده می‌شود');

  const s2 = await u.download();
  ok(s2.status === 'ready' && s2.percent === 100, 'دانلود کامل → آمادهٔ نصب');
  ok(downloaded === 1, 'فایل یک‌بار دانلود می‌شود');
  ok(events.filter((e) => e.type === 'progress').length === 4, 'درصد پیشرفت دانلود گزارش می‌شود');

  await u.install();
  ok(installedWith && /Reval-Setup-.*\.exe$/.test(installedWith.file), 'همان فایل نصبی دانلودشده اجرا می‌شود (' + (installedWith && installedWith.file) + ')');
  ok(installedWith.opts.installDir.indexOf('Programs\\Reval') !== -1, 'نصب در همان مسیر نسخهٔ فعلی انجام می‌شود');
  await new Promise((r) => setTimeout(r, 800));
  ok(quitCalled === true, 'پس از شروع نصب، برنامه بسته می‌شود تا فایل‌ها آزاد شوند');

  /* دانلود دوباره انجام نمی‌شود (کش) */
  downloaded = 0;
  const s3 = await u.download();
  ok(s3.status === 'ready' && downloaded === 0, 'فایل دانلودشده دوباره دانلود نمی‌شود');

  /* خطای شبکه */
  const u2 = upd.createUpdater({
    getCurrentVersion: () => '2.2.0',
    httpJson: async () => { throw new Error('offline'); },
    downloadFile: async () => { throw new Error('x'); },
    runInstaller: async () => {},
    exists: () => false,
    tempPath: (n) => '/tmp/' + n,
  });
  const e1 = await u2.check();
  ok(e1.status === 'error' && /offline/.test(e1.error), 'قطع اینترنت → وضعیت خطا با پیام روشن');

  const u3 = upd.createUpdater({
    getCurrentVersion: () => '2.2.0',
    httpJson: async () => ({ status: 200, body: Object.assign({}, rel, { tag_name: 'v2.2.0' }) }),
    downloadFile: async () => '/tmp/x.exe',
    runInstaller: async () => {},
    exists: () => false,
    tempPath: (n) => '/tmp/' + n,
  });
  const e2 = await u3.check();
  ok(e2.status === 'latest' && !e2.hasUpdate, 'وقتی نسخهٔ تازه‌ای نیست وضعیت «آخرین نسخه» برمی‌گردد');

  const u4 = upd.createUpdater({
    getCurrentVersion: () => '2.2.0',
    httpJson: async () => ({ status: 403, body: { message: 'rate limit' } }),
    downloadFile: async () => '/tmp/x.exe',
    runInstaller: async () => {},
    exists: () => false,
    tempPath: (n) => '/tmp/' + n,
  });
  const e3 = await u4.check();
  ok(e3.status === 'error' && /محدودیت/.test(e3.error), 'محدودیت نرخ گیت‌هاب پیام مخصوص خودش را دارد');

  /* ═══ ۵) سیم‌کشی برنامه ═══ */
  console.log('۵) سیم‌کشی main / preload / رابط کاربری');
  const main = read('src/main.js');
  ok(/require\('\.\/updater\.js'\)/.test(main), 'main.js هستهٔ به‌روزرسانی را بار می‌کند');
  ok(/update:check/.test(main) && /update:download/.test(main) && /update:install/.test(main) && /update:now/.test(main),
    'کانال‌های IPC بررسی/دانلود/نصب موجودند');
  ok(/setInterval\(\(\) => updater\.check/.test(main), 'بررسی خودکار دوره‌ای زمان‌بندی شده است');
  ok(/'\/S'/.test(main), 'نصب‌کننده به‌صورت سایلنت اجرا می‌شود');
  ok(/\/D=/.test(main), 'مسیر نصب فعلی به نصب‌کننده داده می‌شود');
  ok(/broadcastUpdate/.test(main), 'وضعیت به پنجره‌ها فرستاده می‌شود');

  const preload = read('src/planner/planner-preload.js');
  ok(/updates:\s*\{/.test(preload) && /update:now/.test(preload), 'پل preload برای به‌روزرسانی باز است');

  const mainPreload = read('src/preload.js');
  ok(/updates:\s*\{/.test(mainPreload), 'پنجرهٔ اصلی هم پل به‌روزرسانی دارد');

  const toolbar = read('src/inject/toolbar.js');
  ok(/reval-update-pill/.test(toolbar) && /updates\.now\(\)/.test(toolbar),
    'نشان «نسخهٔ جدید» روی صفحهٔ اصلی برنامه با یک کلیک به‌روزرسانی می‌کند');

  const html = read('src/planner/planner.html');
  ok(/id="updateBar"/.test(html) && /id="ubarAction"/.test(html) && /id="verChip"/.test(html),
    'نوار به‌روزرسانی و دکمهٔ یک‌کلیکی در رابط کاربری هست');
  ok(/\.ubar\{/.test(html) && /\.ver-chip\{/.test(html), 'استایل نوار و چیپ نسخه تعریف شده است');

  const ui = read('src/planner/planner.js');
  ok(/initUpdates\(\)/.test(ui), 'رابط کاربری در شروع، به‌روزرسانی را راه می‌اندازد');
  ok(/upd\.now\(\)/.test(ui), 'دکمه، دانلود و نصب را یک‌جا انجام می‌دهد');
  ok(/'نسخهٔ جدید موجود است: '/.test(ui) && /'نصب و راه‌اندازی مجدد'/.test(ui),
    'متن‌های فارسی وضعیت‌ها موجودند');
  ok(!/style\.width = [^;]*٪/.test(ui), 'عرض نوار پیشرفت با درصد CSS معتبر است');

  /* نسخهٔ بسته */
  const pkg = JSON.parse(read('package.json'));
  ok(/^2\.\d+\.\d+$/.test(pkg.version) && pkg.version !== '2.1.0', 'نسخهٔ بسته به‌روز شده است (' + pkg.version + ')');

  console.log('\n✅ ' + pass + ' تست به‌روزرسانی خودکار پاس شد');
})().catch((err) => {
  console.error('\n❌ ' + (err && err.message ? err.message : err));
  process.exit(1);
});
