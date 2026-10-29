'use strict';

/**
 * تست نسخهٔ ۲.۴ — «برنامه‌ساز خودکار» و «خطاهای قابل‌رفع»
 * ------------------------------------------------------------------
 * ۱) باگ ساعت خواب بعد از نیمه‌شب (برنامهٔ صفر)
 * ۲) حالت خودکار: فقط سقف، انتخاب کم‌ترین ساعت کافی
 * ۳) کارت‌های خطا: عنوان + راه‌حل + مقصد پرش
 * ۴) ورودی ساعت ۲۴ ساعتهٔ فارسی (هندلر jsdom)
 * ۵) راهنمای هر فیلد (ⓘ) و سیم‌کشی رابط
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const engine = require('../src/planner/engine.js');
const presets = require('../src/planner/presets.js');

const ROOT = path.join(__dirname, '..');
let pass = 0;
const ok = (cond, msg) => { assert.ok(cond, msg); pass++; console.log('  ✓ ' + msg); };

const pad = (n) => String(n).padStart(2, '0');
const iso = (d) => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
const DAY = 86400000;
const start = new Date(2026, 9, 30);
const exam = new Date(start.getTime() + 244 * DAY);

function cfg(over) {
  return Object.assign({
    student: { name: 'کاربر', grade: 'دوازدهم', field: 'tajrobi', chronotype: 'neutral' },
    startDate: iso(start),
    examDate: iso(exam),
    sleep: { bedtime: '23:30', wake: '07:00' },
    availability: { sat: 4, sun: 4, mon: 4, tue: 4, wed: 4, thu: 6, fri: 5 },
    startTimes: { sat: '16:00', sun: '16:00', mon: '16:00', tue: '16:00', wed: '16:00', thu: '09:00', fri: '09:00' },
    blockMinutes: 45, breakMinutes: 10, restDay: 5, weeklyMock: true,
    classes: [], exams: [], subjects: presets.subjectsFor('tajrobi'),
  }, over || {});
}

/* ═══════ ۱) ساعت خواب بعد از نیمه‌شب ═══════ */
console.log('۱) برنامه با خواب بعد از نیمه‌شب (باگ گزارش‌شده کاربر)');
const normal = engine.createPlan(cfg());
ok(normal.summary.totalHours > 100, 'برنامهٔ پایه ساخته می‌شود (' + normal.summary.totalHours + ' ساعت)');

['00:30', '01:00', '00:15'].forEach((bed) => {
  const p = engine.createPlan(cfg({ sleep: { bedtime: bed, wake: '07:00' } }));
  ok(p.summary.totalHours > 100,
    'خواب ' + bed + ' برنامه را صفر نمی‌کند (' + p.summary.totalHours + ' ساعت)');
  ok(p.summary.coverage.coverageRatio > 80,
    'پوشش فصل‌ها با خواب ' + bed + ' منطقی است (' + p.summary.coverage.coverageRatio + '٪)');
});
const later = engine.createPlan(cfg({ sleep: { bedtime: '00:30', wake: '07:00' } }));
ok(later.summary.totalHours >= normal.summary.totalHours,
  'خواب دیرتر، پنجرهٔ بیشتری می‌دهد (نه کمتر)');

/* ═══════ ۲) حالت خودکار ═══════ */
console.log('۲) حالت خودکار: فقط سقف را می‌دهم');
const auto = engine.createPlan(cfg({
  timeMode: 'auto', dailyCapHours: 8,
  availability: { sat: 1, sun: 1, mon: 1, tue: 1, wed: 1, thu: 1, fri: 1 },
}));
const ai = auto.summary.autoInfo;
ok(auto.summary.timeMode === 'auto', 'برنامه حالت خودکار را گزارش می‌کند');
ok(ai && ai.chosenHours > 0 && ai.chosenHours <= 8, 'ساعت انتخابی داخل سقف است (' + ai.chosenHours + ')');
ok(auto.summary.coverage.coverageRatio >= 95,
  'با ساعتِ انتخابی، پوشش هدف محقق می‌شود (' + auto.summary.coverage.coverageRatio + '٪)');
ok(ai.achieved === true, 'پرچم «رسید به هدف» درست است');
ok(ai.builds >= 2, 'برای پیدا کردن ساعت، چند ساخت انجام شده (' + ai.builds + ')');

const tight = engine.createPlan(cfg({
  timeMode: 'auto', dailyCapHours: 2.5,
  availability: { sat: 1, sun: 1, mon: 1, tue: 1, wed: 1, thu: 1, fri: 1 },
}));
ok(tight.summary.autoInfo.chosenHours <= 2.5, 'هرگز از سقف کاربر رد نمی‌شود (' + tight.summary.autoInfo.chosenHours + ')');
ok(tight.summary.diagnostics.some((d) => d.id === 'auto-capped'),
  'وقتی سقف کافی نیست، خطای «سقف کم است» با راه‌حل ساخته می‌شود');
const capped = tight.summary.diagnostics.find((d) => d.id === 'auto-capped');
ok(capped.fix && capped.fix.length > 20, 'راه‌حل برای سقف کم نوشته شده');
ok(capped.step === 'step-2' && capped.field === 'dailyCap', 'کارت خطا به فیلد «سقف» اشاره می‌کند');

const wide = engine.createPlan(cfg({ timeMode: 'auto', dailyCapHours: 2, availability: null }));
ok(wide.summary.autoInfo.chosenHours <= 2, 'سقف ۲ ساعت رعایت می‌شود');

/* حالت خودکار نباید ساعت هر روز را از کاربر بخواهد */
ok(wide.days.some((d) => d.blocks.length > 0), 'در حالت خودکار هم بلوک مطالعه چیده می‌شود');

/* ═══════ ۳) خطاها: چرا + راه‌حل + مقصد ═══════ */
console.log('۳) کارت‌های خطا با راه‌حل و مقصد پرش');
const broken = engine.createPlan(cfg({
  sleep: { bedtime: '23:30', wake: '07:00' },
  startTimes: { sat: '23:00', sun: '23:00', mon: '23:00', tue: '23:00', wed: '23:00', thu: '23:00', fri: '23:00' },
  availability: { sat: 12, sun: 12, mon: 12, tue: 12, wed: 12, thu: 12, fri: 12 },
}));
ok(broken.summary.coverage.coverageRatio < 20, 'این تنظیم خراب، پوششِ خیلی کم می‌دهد (شبیه عکس کاربر)');
const diags = broken.summary.diagnostics;
ok(diags.length > 0, 'کارت خطا ساخته شد (' + diags.length + ')');
ok(diags.every((d) => d.title && d.title.length > 5), 'هر کارت عنوان دارد');
ok(diags.every((d) => typeof d.fix === 'string' && d.fix.length > 10), 'هر کارت راه‌حل دارد');
ok(diags.every((d) => /^step-[1-6]$/.test(d.step)), 'هر کارت به یک قدم مشخص اشاره می‌کند');
ok(diags.every((d) => d.level === 'warn' || d.level === 'error'), 'سطح کارت معتبر است');
ok(broken.summary.warnings.length === diags.length, 'هر خطا هم در فهرست متنی هست (سازگاری)');

/* برنامهٔ کامل و بدون مشکل نباید خطای کاذب بدهد */
const clean = engine.createPlan(cfg({ examDate: iso(new Date(start.getTime() + 200 * DAY)) }));
ok(clean.summary.diagnostics.every((d) => d.id !== 'no-window'), 'برنامهٔ سالم خطای «پنجرهٔ بسته» ندارد');
ok(clean.summary.diagnostics.every((d) => d.id !== 'empty-plan'), 'برنامهٔ سالم خطای «برنامهٔ خالی» ندارد');

/* ═══════ ۴) رابط کاربری ═══════ */
console.log('۴) رابط کاربری: راهنما، ساعت ۲۴ ساعته، پرش از خطا');
const js = fs.readFileSync(path.join(ROOT, 'src/planner/planner.js'), 'utf8');
const html = fs.readFileSync(path.join(ROOT, 'src/planner/planner.html'), 'utf8');

ok(/type="time"/.test(html) === false, 'ورودی ساعت وابسته به زبان ویندوز (type=time) در HTML نمانده');
ok(/type="time"/.test(js.replace(/\/\*[\s\S]*?\*\//g, '')) === false, 'ورودی ساعت وابسته به زبان ویندوز در JS نمانده');
ok(/function normTime/.test(js), 'نرمال‌ساز ساعت (۱۶:۳۰ / 00:30 / ۴ عصر…) وجود دارد');
ok(/const HELP = \{/.test(js), 'فهرست راهنمای فیلدها تعریف شده');
ok(/function installHelp/.test(js), 'آیکن راهنما (ⓘ) خودکار به فیلدها وصل می‌شود');
ok(/id="helpTip"/.test(html), 'جعبهٔ راهنمای شناور در صفحه هست');
ok(/function renderIssues/.test(js) && /function jumpToIssue/.test(js),
  'کارت خطا کلیک‌پذیر است و کاربر را به فیلد مربوطه می‌برد');
ok(/function renderHomeToday/.test(js), 'کارت «برنامهٔ امروز» در خانه ساخته می‌شود');
ok(/homeAhead/.test(html) && /homeAhead/.test(js), 'نوار روزهای آینده در خانه هست');
ok(/id="modeAuto"/.test(html) && /id="dailyCap"/.test(html), 'گزینهٔ «خودکار + سقف» در قدم ۲ هست');
ok(/id="autoBox"/.test(html) && /id="manualBox"/.test(html), 'دو حالت زمان‌بندی از هم جدا شده‌اند');
ok(/data-goto="plan"/.test(html), 'از خانه می‌توان به برنامهٔ کامل رفت');
ok(js.indexOf('jDateFull(x.date)') !== -1, 'روزهای آینده با تاریخ شمسی نمایش داده می‌شوند');

console.log('\n✅ ' + pass + ' تست نسخهٔ ۲.۴ (خودکار + خطاهای قابل‌رفع) پاس شد');
