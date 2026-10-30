/* تست‌های نسخهٔ ۲.۷
   محورها:
     ۱) بلوک‌های واقعی: هیچ «یادگیری جدید» زیر ۳۰ دقیقه، هیچ فصل زیر ۹۰ دقیقه، هیچ تکهٔ اعشاری
     ۲) صداقت: فصل نخوانده تست نمی‌گیرد؛ فصل نیمه‌کاره «تمام‌شده» حساب نمی‌شود
     ۳) زمانِ لازمِ هر فصل از بودجه‌بندی واقعی می‌آید و فصل مهم بیشتر وقت می‌گیرد
     ۴) شبیه‌سازی سال کامل: ۷ سناریو، اجراشدنی و بدون نقض قواعد
     ۵) نوار اسکرول سمت راست + پنجرهٔ «چه چیزی عوض شد» پس از هر به‌روزرسانی */
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const engine = require('../src/planner/engine.js');
const presets = require('../src/planner/presets.js');
const CL = require('../src/planner/changelog.js');

let n = 0;
const ok = (cond, msg) => { assert.ok(cond, msg); n += 1; console.log('✓ ' + msg); };
const eq = (a, b, msg) => { assert.strictEqual(a, b, msg + ' (' + a + ' ≠ ' + b + ')'); n += 1; console.log('✓ ' + msg); };

const ROOT = path.join(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');
const pkg = JSON.parse(read('package.json'));
/* مقایسهٔ نسخه‌ها: ۲.۸.۰ → ۲۰۰۸۰۰ */
const CLV = (v) => String(v).replace(/^v/i, '').split('.').map((x) => parseInt(x, 10) || 0).reduce((a, b) => a * 1000 + b, 0);

const baseCfg = (extra) => Object.assign({
  student: { name: 'سارا', grade: 'دوازدهم', field: 'tajrobi' },
  startDate: '2026-10-30', examDate: '2027-07-02',
  availability: { sat: 4, sun: 4, mon: 4, tue: 4, wed: 4, thu: 6, fri: 5 },
  startTimes: { sat: '16:00', sun: '16:00', mon: '16:00', tue: '16:00', wed: '16:00', thu: '09:00', fri: '09:00' },
  sleep: { bedtime: '23:30', wake: '07:00' },
  blockMinutes: 45, breakMinutes: 10, restDay: 3, weeklyMock: true,
  subjects: presets.subjectsFor('tajrobi'),
  finals: { enabled: true, courses: presets.finalsFor('tajrobi', 'دوازدهم'), spread: true },
  timeMode: 'fixed',
}, extra || {});

/* ═══ ۰) نسخه ═══ */
{
  ok(CLV(pkg.version) >= CLV('2.7.0'), 'نسخهٔ بسته ۲.۷.۰ یا بالاتر است');
  const plan = engine.createPlan(baseCfg({}));
  eq(plan.meta.version, pkg.version, 'نسخهٔ موتور با نسخهٔ بسته یکی است');
}

/* ═══ ۱) بلوک واقعی، نه تکهٔ ۱۳ دقیقه‌ای ═══ */
const plan = engine.createPlan(baseCfg({}));
const blocks = plan.days.flatMap((d) => (d.blocks || []).filter((b) => b.kind !== 'routine'));
const byKind = (k) => blocks.filter((b) => b.kind === k);

{
  const learn = byKind('learn');
  ok(learn.length > 20, 'بلوک‌های یادگیری وجود دارند (' + learn.length + ' بلوک)');
  ok(learn.every((b) => b.minutes >= 30), 'هیچ «یادگیری جدید» زیر ۳۰ دقیقه نیست');
  ok(Math.min.apply(null, learn.map((b) => b.minutes)) >= 30,
    'کوچک‌ترین بلوک یادگیری ۳۰ دقیقه است (چانک کامل یا باقی‌ماندهٔ کامل، نه ۱۳ دقیقه)');
  ok(blocks.every((b) => Number.isInteger(b.minutes)), 'هیچ دقیقهٔ اعشاری در بلوک‌ها نیست');
  ok(blocks.every((b) => b.minutes >= 10), 'هیچ بلوکی کوتاه‌تر از ۱۰ دقیقه نیست');
  ok(byKind('practice').every((b) => b.minutes >= 30), 'هیچ بلوک تست زیر ۳۰ دقیقه نیست');
  ok(byKind('mock').every((b) => b.minutes >= 40), 'آزمون جامع زیر ۴۰ دقیقه چیده نمی‌شود');

  /* هیچ فصل «چند دقیقه‌ای» خوانده نمی‌شود */
  const per = {};
  blocks.forEach((b) => {
    if (!b.topicId) return;
    if (['learn', 'reteach', 'boost'].indexOf(b.kind) === -1) return;
    per[b.topicId] = (per[b.topicId] || 0) + b.minutes;
  });
  ok(Object.keys(per).length > 10, 'فصل‌های یادگیری‌شده گزارش می‌شوند (' + Object.keys(per).length + ')');

  /* هر فصلی که «خوانده‌شده» علامت خورده باید کفِ واقع‌گرایانه را گرفته باشد.
     (بقیهٔ فصل‌ها باید صادقانه «نیمه‌کاره» بمانند، نه تمام‌شده.) */
  const statsAll = plan.summary.chapterStats;
  const closed = statsAll.filter((c) => c.learnedOn && (c.initialNeedMinutes || c.needMinutes) > 0 && c.needMinutes > 0);
  const closedIds = new Set(statsAll.filter((c) => c.learnedOn).map((c) => c.id));
  const learnedMinutes = Object.keys(per).filter((id) => closedIds.has(id)).map((id) => per[id]);
  ok(learnedMinutes.length > 10, 'فصل‌های تمام‌شده زمان یادگیری ثبت‌شده دارند (' + learnedMinutes.length + ')');
  ok(Math.min.apply(null, learnedMinutes) >= 78,
    'هر فصلِ تمام‌شده دست‌کم ۸۵٪ کفِ ۹۰ دقیقه را گرفته است (کمترین: ' + Math.min.apply(null, learnedMinutes) + ' دقیقه)');

  const halfDone = statsAll.filter((c) => c.learnedOn && c.plannedMinutes < (c.initialNeedMinutes || c.needMinutes) * 0.85);
  eq(halfDone.length, 0, 'هیچ فصلِ نیمه‌کاره‌ای «خوانده و تثبیت‌شده» علامت نخورده است');
  const open = statsAll.filter((c) => !c.learnedOn && c.remainingMinutes > 0);
  ok(open.every((c) => /نیمه‌کاره|باقی/.test(c.status) || c.progress < 100),
    'فصل‌های ناتمام وضعیت «نیمه‌کاره» دارند (' + open.length + ' فصل)');
}

/* ═══ ۲) صداقت موتور: نخوانده تست نمی‌گیرد ═══ */
{
  const firstLearn = {};
  const premature = [];
  plan.days.forEach((d) => {
    (d.blocks || []).forEach((b) => {
      if (!b.topicId) return;
      if (['learn', 'reteach', 'boost'].indexOf(b.kind) !== -1) {
        if (!firstLearn[b.topicId]) firstLearn[b.topicId] = d.date;
      } else if (b.kind === 'practice' && firstLearn[b.topicId] && d.date < firstLearn[b.topicId]) {
        premature.push(d.date + ' ' + b.topic);
      }
    });
  });
  eq(premature.length, 0, 'هیچ فصلی پیش از یادگیری تست نمی‌گیرد');

  /* فصل نیمه‌کاره «تمام» علامت نمی‌خورد */
  const stats = plan.summary.chapterStats;
  const fake = stats.filter((c) => c.needMinutes > 0 && c.learned === true && c.plannedMinutes < c.needMinutes - 5);
  eq(fake.length, 0, 'هیچ فصلی با زمان ناکافی «خوانده‌شده» علامت نخورده است');
}

/* ═══ ۳) زمان لازم از بودجه‌بندی واقعی ═══ */
{
  const stats = plan.summary.chapterStats;
  ok(stats.every((c) => c.needMinutes >= 90), 'زمان لازم هر فصل دست‌کم ۹۰ دقیقه است');
  const byId = {};
  stats.forEach((c) => { byId[c.subjectId] = byId[c.subjectId] || []; byId[c.subjectId].push(c); });
  const mix = Object.keys(byId).map((sid) => byId[sid].filter((c) => c.needMinutes > 0));
  ok(mix.every((arr) => arr.length === 0 || Math.max.apply(null, arr.map((c) => c.needMinutes)) > Math.min.apply(null, arr.map((c) => c.needMinutes))),
    'داخل هر درس، فصل‌ها زمانِ لازمِ متفاوت دارند (نه یک عدد برای همه)');

  /* ساعت اعلامی ناکافی ⇒ هشدار با راه‌حل (نه برنامهٔ الکی) */
  const low = engine.createPlan(baseCfg({ availability: { sat: 1, sun: 1, mon: 1, tue: 1, wed: 1, thu: 1, fri: 1 } }));
  const diag = low.summary.coverage.diagnostics || [];
  ok(diag.length > 0, 'وقتی ساعت کافی نیست، موتور هشدار می‌دهد');
  ok(diag.every((d) => d.fix && d.fix.length > 10), 'هر هشدار یک راه‌حل نوشته‌شده دارد');
  ok(low.summary.coverage.coverageRatio < 90, 'پوشش در حالت کم‌ساعت صادقانه پایین گزارش می‌شود (' + low.summary.coverage.coverageRatio + '٪)');
}

/* ═══ ۴) شبیه‌سازی سال کامل ═══ */
{
  let out = '';
  let code = 0;
  try {
    out = execFileSync(process.execPath, [path.join(__dirname, 'simulation-year.js')], { encoding: 'utf8' });
  } catch (e) {
    out = String((e && e.stdout) || '');
    code = e && typeof e.status === 'number' ? e.status : 1;
  }
  eq(code, 0, 'شبیه‌سازی کل سال بدون شکست اجرا می‌شود');
  ok(/همهٔ ادعاها درست‌اند/.test(out), 'همهٔ سنجه‌های سال کامل پاس می‌شوند');
  ok(/مجموع: \d+ ✅\s+\/\s+0 ❌/.test(out), 'شمارش سنجه‌ها بدون خطاست (همه پاس)');
}

/* ═══ ۵) تاریخچهٔ تغییرات ═══ */
{
  ok(CL.CHANGELOG.length >= 4, 'تاریخچهٔ تغییرات برای چند نسخه وجود دارد');
  eq(CL.latest().version, pkg.version, 'جدیدترین نسخه در تاریخچه با بسته یکی است');
  ok(CL.latest().items.length >= 5, 'تغییرات نسخهٔ جدید فهرست شده‌اند');
  eq(CL.since('2.6.0').map((e) => e.version).join(','), CL.CHANGELOG.filter((e) => CL.compare(e.version, '2.6.0') > 0).map((e) => e.version).join(','), 'پس از به‌روزرسانی از ۲.۶، همهٔ نسخه‌های پس از آن نشان داده می‌شوند');
  eq(CL.since('2.5.0').map((e) => e.version).join(','), CL.CHANGELOG.filter((e) => CL.compare(e.version, '2.5.0') > 0).map((e) => e.version).join(','), 'اگر چند نسخه رد شود، همه نشان داده می‌شوند');
  eq(CL.since(pkg.version).length, 0, 'اگر نسخه دیده شده باشد، پنجره باز نمی‌شود');
  ok(CL.compare('2.7.0', '2.6.9') > 0, 'مقایسهٔ نسخه‌ها عددی است، نه رشته‌ای');
  ok(CL.compare('v2.7.0', '2.7.0') === 0, 'پیشوند v بی‌اثر است');
  ok(CL.CHANGELOG.every((e) => e.kind && e.date && e.title && Array.isArray(e.items) && e.items.length),
    'هر ورودی تاریخچه عنوان، تاریخ، دسته و فهرست تغییرات دارد');
  ok(CL.CHANGELOG.every((e) => /^[۰-۹]/.test(e.date)), 'تاریخ‌ها شمسی‌اند');
}

/* ═══ ۶) رابط کاربری ═══ */
{
  const html = read('src/planner/planner.html');
  const js = read('src/planner/planner.js');

  ok(/<script src="changelog.js"><\/script>/.test(html), 'ماژول تاریخچه در صفحه بارگذاری می‌شود');
  ok(/id="clModal"/.test(html), 'پنجرهٔ «چه چیزی عوض شد» در صفحه هست');
  ok(/id="clOk"/.test(html), 'دکمهٔ بستن پنجرهٔ تغییرات هست');
  ok(/id="clBody"/.test(html), 'بدنهٔ پنجرهٔ تغییرات هست');

  ok(/main, aside, \.modal-card, \.mbox, \.view\{direction:ltr\}/.test(html),
    'ظرف‌های اسکرول به حالت LTR رفته‌اند تا نوار سمت راست بنشیند');
  ok(/main > \*, aside > \*, \.modal-card > \*, \.mbox > \*, \.view > \*\{direction:rtl\}/.test(html),
    'محتوا راست‌به‌چپ می‌ماند (فقط نوار جابه‌جا شده)');
  ok(/::-webkit-scrollbar\{width:11px/.test(html), 'نوار اسکرول باریک و سفارشی است');
  ok(/::-webkit-scrollbar-thumb\{[\s\S]{0,200}border-radius:999px/.test(html), 'نوار اسکرول گرد و نرم است');

  ok(/function showChangelog\(/.test(js), 'تابع نمایش پنجرهٔ تغییرات وجود دارد');
  ok(/function maybeShowChangelog\(/.test(js), 'بررسی خودکار پس از راه‌اندازی وجود دارد');
  ok(/maybeShowChangelog\(\)/.test(js), 'بررسی تغییرات پس از restore صدا زده می‌شود');
  ok(/CL\.since\(seen\)/.test(js), 'نسخه‌های دیده‌نشده محاسبه می‌شوند');
  ok(/seenVersion/.test(js) && /seenVersion: state\.seenVersion/.test(js), 'نسخهٔ دیده‌شده ذخیره می‌شود');
  ok(/installed|applied|restart/.test(js), 'رویداد پایان به‌روزرسانی به پنجرهٔ تغییرات وصل است');
  ok(/clOk/.test(js) && /clPersistSeen/.test(js), 'بستن پنجره، «دیده شد» را ثبت می‌کند');

  /* عنوان‌ها و متن‌ها فارسی‌اند */
  ok(/برنامه به‌روزرسانی شد/.test(js), 'عنوان پنجرهٔ تغییرات فارسی است');
  ok(/خواندم، ببند/.test(html), 'دکمهٔ بستن فارسی است');
}

/* ═══ ۷) فایل‌های لازم برای به‌روزرسانی کوچک ═══ */
{
  const html = read('src/planner/planner.html');
  ok(fs.existsSync(path.join(ROOT, 'src/planner/changelog.js')), 'فایل تاریخچه در بستهٔ کد هست');
  ok(!/2\.6\.0/.test(read('src/planner/engine.js')), 'شمارهٔ نسخهٔ موتور به ۲.۷.۰ ارتقا یافته');
  /* مسیر اسکریپت‌ها نسبی است تا در بستهٔ نصب و وصلهٔ کد کار کند */
  ok(/<script src="changelog.js">/.test(html), 'مسیر اسکریپت تاریخچه نسبی است');
}

console.log('\n✅ ' + n + ' تست نسخهٔ ۲.۷ (بلوک واقعی · زمان لازم واقعی · صداقت موتور · شبیه‌سازی سال · نوار اسکرول راست · پنجرهٔ تغییرات) پاس شد\n');
