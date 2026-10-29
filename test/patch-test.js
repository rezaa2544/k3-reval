'use strict';

/**
 * تست به‌روزرسانی کوچک (وصلهٔ کد) — نسخهٔ ۲.۳.۱
 * ------------------------------------------------------------------
 * ۱) خواندن/نوشتن ZIP بدون وابستگی
 * ۲) نصب وصله، فعال‌سازی، بازگشت
 * ۳) بازگشت خودکار وقتی نسخهٔ وصله‌شده بالا نیامده باشد
 * ۴) هستهٔ به‌روزرسانی: تشخیص وصله از Release، دانلود وصله، تأیید چک‌سام،
 *    و افتادن به نصب کامل وقتی وصله در دسترس نیست
 * ۵) سیم‌کشی main/bootstrap/رابط کاربری
 */

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');

const zip = require('../src/zip.js');
const codePatch = require('../src/code-patch.js');
const updater = require('../src/updater.js');
const { makeZip, walk } = require('../scripts/make-code-patch.js');

const ROOT = path.join(__dirname, '..');
let pass = 0;
const ok = (cond, msg) => { assert.ok(cond, msg); pass++; console.log('  ✓ ' + msg); };
const tmp = (name) => fs.mkdtempSync(path.join(os.tmpdir(), 'reval-' + (name || 'x') + '-'));

/* ═══ ۱) ZIP ═══ */
console.log('۱) خواندن و نوشتن ZIP');
const files = [
  { name: 'src/main.js', data: Buffer.from('console.log("سلام روال");\n'.repeat(200), 'utf8') },
  { name: 'src/planner/engine.js', data: Buffer.from('module.exports = { v: "2.3.1" };\n'.repeat(100), 'utf8') },
  { name: 'assets/icon.png', data: crypto.randomBytes(4096) }, // دادهٔ دودویی (store یا deflate)
];
const buf = makeZip(files);
ok(buf.slice(0, 4).toString('hex') === '504b0304', 'ZIP ساخته‌شده امضای درست دارد');
const entries = zip.listEntries(buf);
ok(entries.length === 3, 'هر سه فایل در فهرست آرشیو هستند');
const back = zip.readEntry(buf, entries.find((e) => e.name === 'src/main.js'));
ok(back.equals(files[0].data), 'محتوای فایل متنی مو‌به‌مو برمی‌گردد (بی‌تغییر)');
const bin = zip.readEntry(buf, entries.find((e) => e.name === 'assets/icon.png'));
ok(bin.equals(files[2].data), 'دادهٔ دودویی هم سالم برمی‌گردد');
ok(zip.safeName('../evil.js') === null && zip.safeName('/etc/passwd') === null && zip.safeName('C:\\x.js') === null,
  'مسیرهای خطرناک (خروج از پوشه/درایو) رد می‌شوند');
ok(zip.safeName('src/ok.js') === 'src/ok.js', 'مسیر سالم پذیرفته می‌شود');

const outDir = tmp('unzip');
zip.extractToDir(buf, outDir);
ok(fs.readFileSync(path.join(outDir, 'src', 'planner', 'engine.js'), 'utf8').indexOf('2.3.1') !== -1,
  'فایل‌ها با ساختار پوشه‌ها بیرون کشیده می‌شوند');

/* ═══ ۲) نصب / بازگشت وصله ═══ */
console.log('۲) نصب و بازگشت وصلهٔ کد');
const codeDir = tmp('code');
const zipFile = path.join(tmp('zip'), 'reval-code-2.3.2.zip');
fs.writeFileSync(zipFile, makeZip([
  { name: 'src/main.js', data: Buffer.from('// code v2.3.2\n') },
  { name: 'src/planner/planner.js', data: Buffer.from('// planner v2.3.2\n') },
  { name: 'package.json', data: Buffer.from('{"version":"2.3.2"}') },
  { name: 'patch-manifest.json', data: Buffer.from('{"version":"2.3.2","electron":"31.7.7"}') },
]));

ok(codePatch.activeVersion(codeDir) === null, 'در ابتدا روی نسخهٔ نصب‌شده هستیم');
const res = codePatch.installPatch(zipFile, { version: '2.3.2', electron: '31.7.7' }, { codeDir, electronVersion: '31.7.7' });
ok(res.version === '2.3.2' && res.files === 4, 'وصله نصب شد (' + res.files + ' فایل)');
ok(codePatch.activeVersion(codeDir) === '2.3.2', 'نسخهٔ فعال به ۲.۳.۲ تغییر کرد');
ok(fs.existsSync(path.join(codeDir, '2.3.2', 'src', 'main.js')), 'کد جدید در پوشهٔ نسخه نشسته است');
ok(!fs.existsSync(path.join(codeDir, '.2.3.2.staging')), 'پوشهٔ موقت پاک شده است');

let threw = null;
try { codePatch.installPatch(zipFile, { version: '2.3.3', electron: '99.0.0' }, { codeDir, electronVersion: '31.7.7' }); }
catch (e) { threw = e; }
ok(threw && /موتور/.test(threw.message), 'وصلهٔ نامتناسب با موتور رد می‌شود');

threw = null;
const badZip = path.join(tmp('bad'), 'bad.zip');
fs.writeFileSync(badZip, Buffer.from('این فایل zip نیست'));
try { codePatch.installPatch(badZip, { version: '2.3.4' }, { codeDir, electronVersion: '31.7.7' }); } catch (e) { threw = e; }
ok(threw && /ZIP|باز کردن/.test(threw.message), 'فایل خراب باعث خطای روشن می‌شود، نه سکوت');
ok(codePatch.activeVersion(codeDir) === '2.3.2', 'نصب ناموفق، نسخهٔ فعال را خراب نمی‌کند');

/* ═══ ۳) تصمیم راه‌انداز و بازگشت خودکار ═══ */
console.log('۳) راه‌انداز و بازگشت خودکار');
const packaged = tmp('packaged');
fs.mkdirSync(path.join(packaged, 'src'), { recursive: true });
fs.writeFileSync(path.join(packaged, 'src', 'main.js'), '// packaged');

const d1 = codePatch.decide(codeDir, packaged);
ok(d1.activeVersion === '2.3.2' && d1.activeRoot.indexOf('2.3.2') !== -1, 'راه‌انداز، کدِ وصله‌شده را انتخاب می‌کند');
ok(d1.markPending === true, 'نشانگر «در حال اجرا» ثبت می‌شود');

/* اجرای موفق: برنامه نشانگر را پاک می‌کند */
codePatch.markPending(codeDir, '2.3.2');
codePatch.markBootOk(codeDir);
const d2 = codePatch.decide(codeDir, packaged);
ok(d2.activeVersion === '2.3.2' && d2.reverted === false, 'اجرای موفق، نسخهٔ وصله‌شده را نگه می‌دارد');

/* اجرای ناموفق: نشانگر باقی می‌ماند → بازگشت خودکار */
codePatch.markPending(codeDir, '2.3.2');
const d3 = codePatch.decide(codeDir, packaged);
ok(d3.reverted === true && d3.activeVersion === null, 'اگر نسخهٔ قبلی بالا نیامده باشد، خودکار به نسخهٔ نصب‌شده برمی‌گردد');
ok(codePatch.lastRevert(codeDir) && codePatch.lastRevert(codeDir).version === '2.3.2', 'علت بازگشت ثبت می‌شود');
ok(codePatch.activeVersion(codeDir) === null, 'پس از بازگشت، کدِ نصب‌شده فعال است');

const r = codePatch.revert(codeDir);
ok(r.reverted === false, 'بازگشت دستی وقتی وصله‌ای نیست، خطا نمی‌دهد');

/* ═══ ۴) هستهٔ به‌روزرسانی با وصله ═══ */
console.log('۴) هستهٔ به‌روزرسانی: دانلود فقط تغییرات');
(async () => {
  /* بستهٔ واقعی‌نما: ~۱۲۰ کیلوبایت کد تکراری تا حجم وصله معنی‌دار باشد */
  const patchBody = makeZip([
    { name: 'src/main.js', data: Buffer.from('// 2.4.0') },
    { name: 'src/planner/engine.js', data: Buffer.from(('// engine line' + String.fromCharCode(10)).repeat(8000), 'utf8') },
  ]);
  const patchSha = crypto.createHash('sha256').update(patchBody).digest('hex');
  const release = {
    tag_name: 'v2.4.0',
    body: 'notes',
    html_url: 'https://github.com/x/y/releases/tag/v2.4.0',
    assets: [
      { name: 'Reval-Setup-2.4.0.exe', size: 79738228, browser_download_url: 'https://exe' },
      { name: 'Reval-Setup-2.4.0.exe.blockmap', size: 83000, browser_download_url: 'https://map' },
      { name: 'reval-code-2.4.0.zip', size: patchBody.length, browser_download_url: 'https://patch' },
      { name: 'reval-code-2.4.0.zip.sha256', size: 90, browser_download_url: 'https://patch-sha' },
      { name: 'SHA256.txt', size: 88, browser_download_url: 'https://sha' },
    ],
  };

  const parsed = updater.parseRelease(release, '2.3.1');
  ok(parsed.patch && parsed.patch.name === 'reval-code-2.4.0.zip', 'وصلهٔ کد در دارایی‌های Release شناسایی می‌شود');
  ok(parsed.patch.shaUrl === 'https://patch-sha', 'فایل چک‌سام وصله هم پیدا می‌شود');
  ok(parsed.asset.name === 'Reval-Setup-2.4.0.exe', 'نصب‌کنندهٔ کامل هم به‌عنوان گزینه باقی می‌ماند');

  const noPatch = updater.parseRelease({ ...release, assets: release.assets.slice(0, 2) }, '2.3.1');
  ok(noPatch.patch === null, 'اگر وصله منتشر نشده باشد، فقط گزینهٔ نصب کامل هست');

  /* --- مسیر وصله --- */
  let downloadedUrl = null;
  let installedWith = null;
  let relaunched = false;
  const files = {};
  const u = updater.createUpdater({
    getCurrentVersion: () => '2.3.1',
    electronVersion: () => '31.7.7',
    supportsPatch: () => true,
    httpJson: async () => ({ status: 200, body: release }),
    httpText: async () => patchSha + '  reval-code-2.4.0.zip\n',
    downloadFile: async (url, dest, onProgress) => {
      downloadedUrl = url;
      for (let i = 1; i <= 3; i++) onProgress({ received: (patchBody.length / 3) * i, total: patchBody.length, percent: (100 / 3) * i });
      fs.writeFileSync(dest, patchBody);
      files[dest] = patchBody.length;
      return dest;
    },
    sha256: (f) => crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex'),
    installPatch: (file, meta) => { installedWith = { file, meta }; return { version: meta.version, files: 1 }; },
    relaunch: () => { relaunched = true; },
    runInstaller: async () => {},
    exists: (p) => Object.prototype.hasOwnProperty.call(files, p),
    fileSize: (p) => files[p] || -1,
    tempPath: (n) => path.join(os.tmpdir(), 'patchtest-' + n),
    onEvent: () => {},
    quit: () => {},
  });

  const s1 = await u.check();
  ok(s1.mode === 'patch' && s1.patchAvailable === true, 'وقتی وصله موجود است، حالت «فقط تغییرات» انتخاب می‌شود');
  ok(s1.patchKb > 0 && s1.patchKb < 2000, 'حجم وصله در گزارش کمتر از ۲ مگابایت است (' + s1.patchKb + 'KB)');

  const s2 = await u.download();
  ok(downloadedUrl === 'https://patch', 'به‌جای فایل ۷۶ مگابایتی، فایل وصله دانلود شد');
  ok(s2.status === 'ready' && s2.usedPatch === true, 'وصله دانلود و آمادهٔ نصب شد');
  ok(s2.savedMb >= 70, 'میزان صرفه‌جویی محاسبه می‌شود (' + s2.savedMb + ' مگابایت)');

  await u.install();
  ok(installedWith && installedWith.meta.version === '2.4.0', 'نصب وصله با شمارهٔ نسخهٔ تازه انجام شد');
  ok(relaunched === true, 'برنامه برای اجرای نسخهٔ تازه دوباره راه‌اندازی می‌شود');

  /* --- چک‌سام غلط → افتادن روی نصب کامل --- */
  let installerRan = false;
  let fullDownloaded = false;
  const u2 = updater.createUpdater({
    getCurrentVersion: () => '2.3.1',
    electronVersion: () => '31.7.7',
    supportsPatch: () => true,
    httpJson: async () => ({ status: 200, body: release }),
    httpText: async () => '0'.repeat(64),
    downloadFile: async (url, dest, onProgress) => {
      if (url === 'https://exe') fullDownloaded = true;
      if (onProgress) onProgress({ received: 10, total: 10, percent: 100 });
      fs.writeFileSync(dest, 'x');
      return dest;
    },
    sha256: () => 'ffff'.repeat(16),
    installPatch: () => { throw new Error('نباید اجرا شود'); },
    runInstaller: async () => { installerRan = true; },
    relaunch: () => {},
    exists: () => false,
    fileSize: () => -1,
    tempPath: (n) => path.join(os.tmpdir(), 'patchtest2-' + n),
    onEvent: () => {},
    quit: () => {},
  });
  const s3 = await u2.check();
  const s4 = await u2.download();
  ok(s3.mode === 'patch', 'در ابتدا وصله انتخاب می‌شود');
  ok(fullDownloaded === true, 'چک‌سام نامعتبر → خودکار روی دانلود نصب‌کنندهٔ کامل می‌رود');
  ok(s4 && s4.status === 'ready', 'نصب‌کنندهٔ کامل آمادهٔ نصب شد (کاربر گیر نمی‌کند)');

  /* --- حالت «نصب کامل» به‌خواست کاربر --- */
  let firstUrl = null;
  const u3 = updater.createUpdater({
    getCurrentVersion: () => '2.3.1',
    electronVersion: () => '31.7.7',
    supportsPatch: () => true,
    httpJson: async () => ({ status: 200, body: release }),
    httpText: async () => patchSha,
    downloadFile: async (url, dest) => { if (!firstUrl) firstUrl = url; fs.writeFileSync(dest, 'x'); return dest; },
    sha256: () => patchSha,
    installPatch: () => ({}),
    runInstaller: async () => {},
    relaunch: () => {},
    exists: () => false,
    fileSize: () => -1,
    tempPath: (n) => path.join(os.tmpdir(), 'patchtest3-' + n),
    onEvent: () => {},
    quit: () => {},
  });
  await u3.check();
  await u3.download({ full: true });
  ok(firstUrl === 'https://exe', 'با درخواست صریح، نصب‌کنندهٔ کامل دانلود می‌شود');

  /* ═══ ۵) سیم‌کشی ═══ */
  console.log('۵) سیم‌کشی برنامه');
  const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
  ok(pkg.main === 'src/bootstrap.js', 'نقطهٔ ورود، راه‌انداز (bootstrap) است');
  const bootstrap = fs.readFileSync(path.join(ROOT, 'src', 'bootstrap.js'), 'utf8');
  ok(/REVAL_ASSETS_ROOT/.test(bootstrap) && /codePatch\.decide/.test(bootstrap),
    'راه‌انداز، ریشهٔ دارایی‌ها را ثابت نگه می‌دارد و از منطق وصله استفاده می‌کند');
  const main = fs.readFileSync(path.join(ROOT, 'src', 'main.js'), 'utf8');
  ok(/installCodePatch/.test(main) && /update:revert-code/.test(main), 'main.js نصب/بازگشت وصله را در دسترس می‌گذارد');
  ok(/markBootOk\(\)/.test(main), 'main.js پس از آماده شدن، سلامت اجرا را علامت می‌زند');
  ok(/REVAL_CODE_VERSION/.test(main) && /APP_VERSION/.test(main), 'نسخهٔ نمایش‌داده‌شده از کدِ فعال می‌آید');
  const planner = fs.readFileSync(path.join(ROOT, 'src', 'planner', 'planner.js'), 'utf8');
  ok(/act\.hidden = false;/.test(planner), 'دکمهٔ «به‌روزرسانی» در هر حالت وضعیت، دوباره نمایان می‌شود');
  ok(/snap\.patchAvailable/.test(planner) && /ubarFull/.test(planner), 'رابط کاربری حجم وصله و گزینهٔ نصب کامل را نشان می‌دهد');
  const html = fs.readFileSync(path.join(ROOT, 'src', 'planner', 'planner.html'), 'utf8');
  ok(/id="ubarFull"/.test(html), 'دکمهٔ «نصب کامل» در HTML هست');
  ok(require('fs').existsSync(path.join(ROOT, 'scripts', 'make-code-patch.js')), 'اسکریپت ساخت وصله در مخزن هست');

  console.log('\n✅ ' + pass + ' تست به‌روزرسانی کوچک (وصلهٔ کد) پاس شد');
})().catch((err) => {
  console.error('\n❌ ' + (err && err.message ? err.message : err));
  process.exit(1);
});
