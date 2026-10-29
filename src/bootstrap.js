'use strict';

/**
 * Reval — راه‌انداز (Bootstrap)
 * ------------------------------------------------------------------
 * تنها کارش این است: کدِ برنامه از کجا بار شود؟
 *
 *   • کدِ نصب‌شده:   <نصب>/resources/app.asar/src   (همیشه هست)
 *   • کدِ وصله‌شده:  <userData>/code/<version>/src  (چند صد کیلوبایت)
 *
 * ایمنی: هنگام اجرای نسخهٔ وصله‌شده یک نشانگر `pending.json` ساخته می‌شود و
 * برنامه بعد از آماده شدن پاکش می‌کند؛ اگر اجرای بعدی نشانگر را دست‌نخورده
 * ببیند، خودکار به نسخهٔ نصب‌شده برمی‌گردد. دارایی‌ها (آیکن) همیشه از نسخهٔ
 * نصب‌شده خوانده می‌شوند.
 */

const path = require('path');
const fs = require('fs');
const codePatch = require('./code-patch.js');

function boot() {
  const { app } = require('electron');
  const packagedRoot = path.join(__dirname, '..');
  const codeDir = path.join(app.getPath('userData'), 'code');

  const decision = codePatch.decide(codeDir, packagedRoot);
  if (decision.markPending && decision.activeVersion) codePatch.markPending(codeDir, decision.activeVersion);

  process.env.REVAL_ASSETS_ROOT = packagedRoot;
  process.env.REVAL_PACKAGED_ROOT = packagedRoot;
  if (decision.activeVersion) process.env.REVAL_CODE_VERSION = decision.activeVersion;
  process.env.REVAL_CODE_DIR = codeDir;

  global.__REVAL_CODE_ROOT__ = decision.activeRoot;
  global.__REVAL_CODE_VERSION__ = decision.activeVersion;
  global.__REVAL_PATCH_REVERTED__ = decision.reverted;

  const patchedEntry = path.join(decision.activeRoot, 'src', 'main.js');
  const packagedEntry = path.join(packagedRoot, 'src', 'main.js');

  if (decision.activeRoot !== packagedRoot) {
    try {
      require(patchedEntry);
      return;
    } catch (err) {
      /* کد وصله بالا نیامد → بازگشت به نسخهٔ نصب‌شده */
      console.error('[reval] نسخهٔ به‌روزشدهٔ کد بالا نیامد؛ بازگشت به نسخهٔ نصب‌شده:', err && err.message);
      codePatch.revert(codeDir, 'require-failed');
      delete process.env.REVAL_CODE_VERSION;
      require(packagedEntry);
      return;
    }
  }
  require(packagedEntry);
}

if (require.main === module || process.env.REVAL_FORCE_BOOT === '1' || process.versions.electron) {
  boot();
}

module.exports = { boot };
