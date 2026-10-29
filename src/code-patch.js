'use strict';

/**
 * Reval — وصلهٔ کد (به‌روزرسانی کوچک)
 * ------------------------------------------------------------------
 * منطق خالص (بدون Electron) تا کاملاً تست‌پذیر باشد:
 *   • نصب وصله: باز کردن ZIP در <userData>/code/<version>/ و فعال‌سازی
 *   • نسخهٔ فعال: خواندن current.json
 *   • بازگشت: حذف فعال‌سازی و برگشت به کدِ نصب‌شده
 *   • کشف «بالا نیامدن» نسخهٔ قبلی (نشانگر pending)
 */

const fs = require('fs');
const path = require('path');
const zip = require('./zip.js');

const CURRENT = 'current.json';
const PENDING = 'pending.json';
const REVERTED = 'reverted.json';
const VERSION_RE = /^\d+\.\d+\.\d+/;

function readJson(file) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch (_) { return null; }
}

function writeJson(file, data) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(data, null, 2), 'utf8');
}

/** نسخهٔ کدِ فعال (یا null اگر روی نسخهٔ نصب‌شده هستیم) */
function activeVersion(codeDir) {
  const cur = readJson(path.join(codeDir, CURRENT));
  if (!cur || !cur.version) return null;
  if (!fs.existsSync(path.join(codeDir, cur.version, 'src', 'main.js'))) return null;
  return cur.version;
}

/** نصب وصله از فایل ZIP */
function installPatch(zipPath, meta, opts) {
  const codeDir = opts.codeDir;
  const electronVersion = opts.electronVersion || null;
  const version = String((meta && meta.version) || '').replace(/^v/i, '');
  if (!VERSION_RE.test(version)) throw new Error('شمارهٔ نسخهٔ وصله نامعتبر است');
  if (meta && meta.electron && electronVersion && meta.electron !== electronVersion) {
    throw new Error('این وصله برای نسخهٔ دیگری از موتور ساخته شده است');
  }

  const target = path.join(codeDir, version);
  const staging = path.join(codeDir, '.' + version + '.staging');
  fs.rmSync(staging, { recursive: true, force: true });
  fs.mkdirSync(staging, { recursive: true });

  let written;
  try {
    written = zip.extractFile(zipPath, staging, {
      filter: (rel) => /^src\//.test(rel) || rel === 'package.json' || rel === 'patch-manifest.json',
    });
  } catch (err) {
    fs.rmSync(staging, { recursive: true, force: true });
    throw new Error('باز کردن وصله ناموفق بود: ' + (err && err.message ? err.message : 'خطای ZIP'));
  }
  if (!written.some((r) => r === 'src/main.js')) {
    fs.rmSync(staging, { recursive: true, force: true });
    throw new Error('وصله فایل اصلی برنامه را ندارد');
  }

  fs.rmSync(target, { recursive: true, force: true });
  fs.renameSync(staging, target);

  const previous = activeVersion(codeDir);
  writeJson(path.join(codeDir, CURRENT), {
    version,
    previous,
    electron: electronVersion,
    installedAt: new Date().toISOString(),
    files: written.length,
  });
  try { fs.unlinkSync(path.join(codeDir, PENDING)); } catch (_) { /* بی‌صدا */ }
  try { fs.unlinkSync(path.join(codeDir, REVERTED)); } catch (_) { /* بی‌صدا */ }
  return { version, dir: target, files: written.length, previous };
}

/** بازگشت به نسخهٔ نصب‌شده */
function revert(codeDir, reason) {
  const cur = readJson(path.join(codeDir, CURRENT));
  try { fs.unlinkSync(path.join(codeDir, CURRENT)); } catch (_) { /* بی‌صدا */ }
  try { fs.unlinkSync(path.join(codeDir, PENDING)); } catch (_) { /* بی‌صدا */ }
  if (cur && cur.version) {
    try { writeJson(path.join(codeDir, REVERTED), { version: cur.version, reason: reason || 'manual', at: new Date().toISOString() }); }
    catch (_) { /* بی‌صدا */ }
  }
  return { reverted: Boolean(cur && cur.version), version: cur ? cur.version : null };
}

/**
 * تصمیم راه‌انداز: کد از کجا بار شود؟
 * @returns {{activeRoot:string, activeVersion:string|null, reverted:boolean, markPending:boolean}}
 */
function decide(codeDir, packagedRoot) {
  const cur = readJson(path.join(codeDir, CURRENT));
  const pending = readJson(path.join(codeDir, PENDING));

  if (cur && cur.version) {
    const candidate = path.join(codeDir, cur.version);
    const hasMain = fs.existsSync(path.join(candidate, 'src', 'main.js'));
    const wasPending = Boolean(pending && pending.version === cur.version);

    if (wasPending) {
      /* دفعهٔ قبل نسخهٔ وصله‌شده بالا نیامده است → بازگشت خودکار */
      revert(codeDir, 'boot-failed');
      return { activeRoot: packagedRoot, activeVersion: null, reverted: true, markPending: false };
    }
    if (hasMain) {
      return { activeRoot: candidate, activeVersion: cur.version, reverted: false, markPending: true };
    }
    revert(codeDir, 'missing-files');
    return { activeRoot: packagedRoot, activeVersion: null, reverted: true, markPending: false };
  }
  return { activeRoot: packagedRoot, activeVersion: null, reverted: false, markPending: false };
}

function markPending(codeDir, version) {
  writeJson(path.join(codeDir, PENDING), { version, at: Date.now() });
}

function markBootOk(codeDir) {
  try { fs.unlinkSync(path.join(codeDir, PENDING)); } catch (_) { /* بی‌صدا */ }
}

function lastRevert(codeDir) {
  return readJson(path.join(codeDir, REVERTED));
}

module.exports = {
  CURRENT, PENDING, REVERTED,
  activeVersion, installPatch, revert, decide, markPending, markBootOk, lastRevert,
};
