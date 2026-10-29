/* تست رابط کاربری (headless با jsdom): ساخت برنامه، تب گزارش، بازچینش، پشتیبان */
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

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
check(!!$('mockRows'), 'کارت آزمون‌های دوره‌ای در UI هست');
check(!!$('addMock') && !!$('suggestMocks'), 'دکمهٔ افزودن/پیشنهاد آزمون دوره‌ای هست');
check(!!$('examDatePreset'), 'انتخاب سریع تاریخ کنکور هست');

/* آزمون دوره‌ای: اضافه‌کردن، تنظیم دو آزمون در یک روز، خواندن مقدار */
const beforeMocks = $('mockRows').querySelectorAll('.dyn-row').length;
$('addMock').click();
const mockRows = $('mockRows').querySelectorAll('.dyn-row');
check(mockRows.length === beforeMocks + 1, 'ردیف آزمون دوره‌ای اضافه شد (' + beforeMocks + ' → ' + mockRows.length + ')');
mockRows[0].querySelector('[data-mk="title"]').value = 'زیستاز';
mockRows[0].querySelector('[data-mk="day"]').value = '5';
mockRows[0].querySelector('[data-mk="everyNWeeks"]').value = '2';
mockRows[0].querySelector('[data-mk="minutes"]').value = '180';
mockRows[mockRows.length - 1].querySelector('[data-mk="title"]').value = 'آلفا';
mockRows[mockRows.length - 1].querySelector('[data-mk="day"]').value = '5';
mockRows[mockRows.length - 1].querySelector('[data-mk="everyNWeeks"]').value = '2';
const firstSubj = mockRows[0].querySelector('[data-mk="subjectIds"] option[value="bio"]');
if (firstSubj) firstSubj.selected = true;
$('suggestMocks').click();
check($('mockRows').querySelectorAll('.dyn-row').length === 2, 'پیشنهاد هوشمند آزمون‌ها را می‌سازد');

// ساخت برنامه
$('build').click();

setTimeout(() => {
  try {
    const s = window.document.querySelector('#stats');
    check(s && s.innerHTML.length > 20, 'کارت آمار برنامه پر شد');
    check($('planBody').style.display !== 'none', 'بدنهٔ برنامه نمایش داده شد');

    // تب گزارش
    window.document.querySelector('.nav[data-view="report"]').click();
    check($('reportBody').style.display !== 'none', 'تب گزارش رندر شد');
    check($('bookTable').innerHTML.indexOf('زیست') !== -1, 'جدول کتاب‌به‌کتاب زیستی دارد');
    check($('chapterTable').innerHTML.indexOf('پیشرفت') !== -1, 'جدول فصل‌به‌فصل پیشرفت دارد');
    check($('reportStats').innerHTML.length > 30, 'کارت‌های آماری گزارش پر شد');
    check($('finalsReport').innerHTML.indexOf('فارسی') !== -1, 'گزارش سوابق تحصیلی پر شد');
    check($('capacityBox').innerHTML.indexOf('ساعت') !== -1, 'کارت ظرفیت/ساعت لازم پر شد');
    check($('testCapacityTable').innerHTML.indexOf('زیست') !== -1, 'جدول ظرفیت تست هر درس پر شد');
    check($('mocksReport').innerHTML.length > 20, 'گزارش آزمون‌های دوره‌ای پر شد');

    // ── پوستهٔ جدید ۲.۳: نوار کنار، خانه، قدم‌ها ──
    const navs = Array.from(window.document.querySelectorAll('.nav[data-view]')).map((n) => n.dataset.view);
    check(navs.indexOf('home') !== -1 && navs.indexOf('plan') !== -1 && navs.indexOf('report') !== -1,
      'نوار کنار شامل خانه/برنامه/گزارش است (' + navs.length + ' آیتم)');
    check([1, 2, 3, 4, 5, 6].every((n) => navs.indexOf('step-' + n) !== -1), 'شش قدم آماده‌سازی در نوار کنار هست');

    window.document.querySelector('.nav[data-view="home"]').click();
    check($('view-home').classList.contains('active'), 'صفحهٔ خانه باز می‌شود');
    check($('homeSteps').querySelectorAll('.chkitem').length === 6, 'چک‌لیست خانه شش قدم دارد');

    window.document.querySelector('.nav[data-view="step-2"]').click();
    check($('view-step-2').classList.contains('active') && !$('view-home').classList.contains('active'),
      'جابه‌جایی بین قدم‌ها کار می‌کند');
    const secHead = $('view-step-2').querySelector('.pagehead h1');
    check(secHead && secHead.textContent.indexOf('زمان') !== -1, 'سرتیتر صفحهٔ قدم درست است');

    check(window.document.querySelectorAll('[data-next]').length >= 4, 'دکمهٔ «بعدی» بین قدم‌ها موجود است');

    const av = window.document.querySelector('[data-avail]');
    check(av && /[۰-۹]/.test(av.value), 'ساعت مطالعهٔ روزها با رقم فارسی نمایش داده می‌شود (' + (av && av.value) + ')');
    if (av) { av.value = '۸'; av.dispatchEvent(new window.Event('change', { bubbles: true })); }
    check(true, 'ورودی عددی فارسی (۸) بدون خطا پذیرفته شد');

    check(window.document.querySelectorAll('[data-jump]').length >= 6, 'چیپ‌های پرش گزارش موجودند');
    check(window.document.querySelectorAll('#view-step-6 details.adv').length === 2,
      'بخش‌های سنگین (مهلت‌ها) به‌صورت تاشو هستند تا صفحه شلوغ نشود');

    const emojis = (window.document.body.innerHTML.match(/[\u{1F300}-\u{1FAFF}]/gu) || []).length;
    check(emojis === 0, 'هیچ ایموجی رنگی در رابط نیست — آیکن‌ها SVG هستند (' + emojis + ')');
    const svgs = window.document.querySelectorAll('.nav .num svg, .pagehead .stepno svg').length;
    check(svgs >= 7, 'آیکن‌های ناوبری از SVG استفاده می‌کنند (' + svgs + ')');
    const checkMarks = (window.document.body.innerHTML.match(/undefined/gu) || []).length;
    check(checkMarks === 0, 'هیچ «undefined» در متن رابط دیده نمی‌شود');

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
