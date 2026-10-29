/* تست رابط کاربری (headless با jsdom): ساخت برنامه، تب گزارش، بازچینش، پشتیبان */
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('/tmp/node_modules/jsdom');

const dir = '/home/user/k3-reval/src/planner';
const html = fs.readFileSync(path.join(dir, 'planner.html'), 'utf8');

const dom = new JSDOM(html, {
  runScripts: 'outside-only',
  pretendToBeVisual: true,
  url: 'http://localhost/planner.html',
});
const { window } = dom;
window.HTMLElement.prototype.scrollIntoView = () => {};
// jsdom: URL.createObjectURL و clipboard
window.URL.createObjectURL = () => 'blob:x';
window.URL.revokeObjectURL = () => {};
window.prompt = () => null;

function loadScript(file) {
  const code = fs.readFileSync(path.join(dir, file), 'utf8');
  const s = new window.Function(code);
  s.call(window);
}

const errors = [];
window.addEventListener('error', (e) => errors.push('window error: ' + e.message));
const origError = console.error;

['jalali.js', 'engine.js', 'presets.js', 'planner.js'].forEach((f) => {
  try {
    loadScript(f);
  } catch (err) {
    errors.push(f + ': ' + err.message + '\n' + err.stack.split('\n').slice(0, 4).join('\n'));
  }
});

const $ = (id) => window.document.getElementById(id);
const check = (cond, msg) => { if (!cond) errors.push('ASSERT: ' + msg); else console.log('✓ ' + msg); };

check(!errors.length, 'بارگذاری اسکریپت‌ها بدون خطا');
check(String(window.document.body.innerHTML).indexOf('سوابق تحصیلی') !== -1, 'بخش سوابق تحصیلی در UI هست');
check(String(window.document.body.innerHTML).indexOf('گزارش و آنالیز') !== -1, 'تب گزارش در UI هست');
check(!!$('finalsTable') && $('finalsTable').innerHTML.indexOf('فارسی ۳') !== -1, 'جدول دروس نهایی پر شد');
check(!!$('startTimes') && $('startTimes').querySelectorAll('[data-start]').length === 7, 'ساعت شروع ۷ روز ساخته شد');
check(!!$('offRows'), 'بخش روزهای خارج از برنامه ساخته شد');

// ساخت برنامه
$('build').click();

setTimeout(() => {
  try {
    const s = window.document.querySelector('#stats');
    check(s && s.innerHTML.length > 20, 'کارت آمار برنامه پر شد');
    check($('planBody').style.display !== 'none', 'بدنهٔ برنامه نمایش داده شد');

    // تب گزارش
    window.document.querySelector('.tab[data-view="report"]').click();
    check($('reportBody').style.display !== 'none', 'تب گزارش رندر شد');
    check($('bookTable').innerHTML.indexOf('زیست') !== -1, 'جدول کتاب‌به‌کتاب زیستی دارد');
    check($('chapterTable').innerHTML.indexOf('پیشرفت') !== -1, 'جدول فصل‌به‌فصل پیشرفت دارد');
    check($('reportStats').innerHTML.length > 30, 'کارت‌های آماری گزارش پر شد');
    check($('finalsReport').innerHTML.indexOf('فارسی') !== -1, 'گزارش سوابق تحصیلی پر شد');

    // فیلتر فصل‌ها
    $('reportFilter').value = 'open';
    $('reportFilter').dispatchEvent(new window.Event('change'));
    check(true, 'فیلتر «پوشش‌نداده‌ها» بدون خطا اجرا شد');

    // بازچینش هوشمند: یک بلوک گذشته را تیک نزنیم
    const plan = window.localStorage ? null : null;
    $('smartReplan').click();
    check(true, 'دکمهٔ بازچینش بدون خطا اجرا شد (' + ($('carryCount').textContent || '') + ')');

    // تیک امروز
    $('markTodayDone').click();
    check(true, 'تیک کارهای امروز اجرا شد');

    // خروجی گزارش
    let downloaded = null;
    const origClick = window.HTMLAnchorElement.prototype.click;
    window.HTMLAnchorElement.prototype.click = function () { downloaded = this.download; };
    window.document.querySelector('[data-export="report-md"]').click();
    setTimeout(() => {
      check(downloaded === 'گزارش-روال.md', 'خروجی گزارش Markdown تولید شد (' + downloaded + ')');
      window.HTMLAnchorElement.prototype.click = origClick;
      finish();
    }, 120);
  } catch (err) {
    errors.push('runtime: ' + err.message + '\n' + err.stack.split('\n').slice(0, 5).join('\n'));
    finish();
  }
}, 400);

function finish() {
  if (errors.length) {
    console.log('\n❌ خطاها:\n' + errors.join('\n'));
    process.exit(1);
  }
  console.log('\n✅ تست رابط کاربری v1.9 پاس شد');
  process.exit(0);
}
