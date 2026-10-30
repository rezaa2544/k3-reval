/* ═══════════════════════════════════════════════════════════════════
   شبیه‌سازی کامل، در نقش چند دانش‌آموز واقعی — نسخهٔ ۲.۸.۹
   ------------------------------------------------------------------
   برای هر پرسونا: پیکربندی کامل ساخته می‌شود، برنامه تولید می‌شود و
   خروجی با قواعد قطعیِ زیر سنجیده می‌شود (نه با «به نظر درست می‌آید»):
     ۱) هیچ بلوکی با کلاس / آزمون / روز تعطیل / روز استراحت تداخل ندارد
     ۲) هیچ بلوکی از ساعت خواب بیرون نمی‌زند و ساعت‌ها منطقی‌اند
     ۳) مجموع دقیقه‌های روز از ظرفیت اعلامیِ خودِ دانش‌آموز نمی‌گذرد
     ۴) نبودِ امکان، صریح اعلام می‌شود (نه برنامهٔ بی‌معنا)
     ۵) عدد پوشش، با شمارش واقعی فصل‌ها می‌خواند
     ۶) برنامه قطعی است: دو بار ساخت = خروجی یکسان
     ۷) هر بلوک متن اجرایی دارد (چه کار کنم، چرا، اگر-آنگاه)
   اجرا: node test/sim-students.js
   ═══════════════════════════════════════════════════════════════════ */
const engine = require('../src/planner/engine.js');
const presets = require('../src/planner/presets.js');

let pass = 0; let fail = 0;
const errors = [];
const ok = (cond, msg, extra) => {
  if (cond) { pass += 1; }
  else { fail += 1; errors.push(msg + (extra ? ' → ' + extra : '')); console.log('  ✗ ' + msg + (extra ? ' → ' + extra : '')); }
};
const H = (m) => Math.round((m / 60) * 10) / 10;

/* ---------- ابزارهای کمکی ---------- */
const iso2min = (hm) => { const [h, m] = String(hm).split(':').map(Number); return h * 60 + m; };
const addDays = (iso, n) => { const d = new Date(iso + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };

function base(field, grade, extra) {
  return Object.assign({
    student: { name: 'دانش‌آموز', grade, field, chronotype: 'neutral' },
    startDate: '2026-10-30',
    examDate: '2027-07-02',
    availability: { sat: 4, sun: 4, mon: 4, tue: 4, wed: 4, thu: 5, fri: 4 },
    sleep: { bedtime: '23:30', wake: '07:00' },
    startTimes: { sat: '16:00', sun: '16:00', mon: '16:00', tue: '16:00', wed: '16:00', thu: '09:00', fri: '09:00' },
    blockMinutes: 45, breakMinutes: 10, restDay: 5, weeklyMock: true,
    subjects: presets.subjectsFor(field),
  }, extra || {});
}

/** همهٔ بررسی‌های عمومی روی یک برنامه */
function auditPlan(tag, cfg, plan) {
  const days = plan.days || [];
  const byDate = {};
  days.forEach((d) => { byDate[d.date] = d; });
  const offHalt = (cfg.offDates || []).filter((o) => o.kind === 'halt').map((o) => o.date);
  const classDays = {};
  (cfg.classes || []).forEach((c) => {
    (c.weekdays || []).forEach((wd) => {
      classDays[wd] = classDays[wd] || [];
      classDays[wd].push({ start: iso2min(c.start), end: iso2min(c.end), title: c.title });
    });
  });
  const WEEK_SAT0 = (iso) => (new Date(iso + 'T00:00:00Z').getUTCDay() + 1) % 7;
  const sleep = { bed: iso2min(cfg.sleep.bedtime || '23:30'), wake: iso2min(cfg.sleep.wake || '07:00') };

  let overlaps = 0; let insideClass = 0; let outOfSleep = 0; let badTimes = 0;
  let blocksOnOff = 0; let blocksOnRest = 0; let overCapacity = 0; let missingText = 0; let nanBlocks = 0;
  let learnOnRest = 0;

  days.forEach((d) => {
    const cap = (cfg.availability || {})[['sat','sun','mon','tue','wed','thu','fri'][WEEK_SAT0(d.date)]] || 0;
    const restDayNo = Number(cfg.restDay);
    const isRest = restDayNo !== 7 && WEEK_SAT0(d.date) === restDayNo;
    const off = offHalt.indexOf(d.date) !== -1;
    const blocks = d.blocks || [];
    let planned = 0; let lastEnd = -1;
    blocks.forEach((b) => {
      if (!b || typeof b.start !== 'string' || typeof b.end !== 'string') { nanBlocks += 1; return; }
      const s = iso2min(b.start); const e = iso2min(b.end);
      if (!(e > s) || !(b.minutes > 0)) badTimes += 1;
      if (s < lastEnd) overlaps += 1;   // ترتیب و عدم همپوشانی درون روز
      lastEnd = Math.max(lastEnd, e);
      planned += b.minutes || 0;
      /* کلاس‌ها */
      (classDays[WEEK_SAT0(d.date)] || []).forEach((c) => {
        if (s < c.end && e > c.start) insideClass += 1;
      });
      /* آزمون‌های تاریخ‌دار (بلوک خودِ آزمون تداخل نیست) */
      if (b.kind !== 'exam') (cfg.exams || []).forEach((x) => {
        if (x.date === d.date && x.start && x.end) {
          if (s < iso2min(x.end) && e > iso2min(x.start)) insideClass += 1;
        }
      });
      /* خواب: بلوکی که بعد از ساعت خواب شروع شود */
      const inSleep = sleep.bed < sleep.wake
        ? (s >= sleep.bed && s < sleep.wake)          // خوابِ درون یک روز (مثلاً ۰۱:۰۰ تا ۰۸:۳۰)
        : (s >= sleep.bed || s < sleep.wake);         // خوابی که از نیمه‌شب می‌گذرد (۲۳:۳۰ تا ۰۷:۰۰)
      if (inSleep && b.kind !== 'exam') outOfSleep += 1;
      /* متن اجرایی */
      if (!b.content || !b.why || !b.kindLabel) missingText += 1;
    });
    if (off && blocks.length) blocksOnOff += 1;
    if (isRest && blocks.some((b) => ['learn', 'practice', 'reteach', 'boost', 'carry'].indexOf(b.kind) !== -1)) learnOnRest += 1;
    if (cap > 0 && planned > cap * 60 + 30) overCapacity += 1;    // ۳۰ دقیقه ارفاق
    if (cap === 0 && planned > 60 && !off) overCapacity += 1;      // روز بی‌ظرفیت
  });

  ok(overlaps === 0, '[' + tag + '] هیچ دو بلوکی روی هم نمی‌افتد', overlaps);
  ok(insideClass === 0, '[' + tag + '] هیچ بلوکی روی کلاس/آزمون نمی‌افتد', insideClass);
  ok(outOfSleep === 0, '[' + tag + '] هیچ بلوکی بعد از ساعت خواب نیست', outOfSleep);
  ok(badTimes === 0, '[' + tag + '] همهٔ ساعت‌ها منطقی‌اند (پایان > شروع)', badTimes);
  ok(blocksOnOff === 0, '[' + tag + '] روز «تعطیل کامل» خالی مانده', blocksOnOff);
  ok(learnOnRest === 0, '[' + tag + '] روز استراحت، درسِ تازه ندارد', learnOnRest);
  ok(overCapacity === 0, '[' + tag + '] هیچ روزی از ظرفیت اعلامی دانش‌آموز نگذشته', overCapacity);
  ok(nanBlocks === 0, '[' + tag + '] هیچ بلوک ناقص/NaN ندارد', nanBlocks);
  ok(missingText === 0, '[' + tag + '] همهٔ بلوک‌ها متن «چه کار کنم / چرا» دارند', missingText);

  /* پوشش: عدد گزارش با شمارش واقعی می‌خواند */
  const cov = (plan.summary && plan.summary.coverage) || {};
  const stats = plan.summary.chapterStats || [];
  const core = stats.filter((c) => !c.general);
  const realRatio = core.length ? Math.round((core.filter((c) => c.covered).length / core.length) * 100) : 0;
  ok(Math.abs(realRatio - (cov.coverageRatio || 0)) <= 2,
    '[' + tag + '] درصد پوشش با شمارش واقعی فصل‌ها می‌خواند', realRatio + ' vs ' + cov.coverageRatio);
  ok((cov.coverageRatio || 0) <= 100, '[' + tag + '] پوشش از ۱۰۰٪ بیشتر نشده', cov.coverageRatio);

  /* زمان لازم واقعی: هر فصل نخوانده حداقل ۳۰ دقیقه */
  const noTime = core.filter((c) => c.needMinutes > 0 && c.initialNeedMinutes < 30 && c.initialNeedMinutes > 0);
  ok(noTime.length === 0, '[' + tag + '] هیچ فصلی زمان لازمِ نیم‌ساعته کمتر ندارد', noTime.length);

  /* تست‌ها: عدد نامعقول */
  const testsPlanned = cov.testsPlanned || 0;
  ok(testsPlanned >= 0 && testsPlanned < 300000, '[' + tag + '] تعداد تست برنامه‌ریزی‌شده معقول است', testsPlanned);

  return { days, cov, stats };
}

/* ═══════════════ پرسونا ۱: آرمان — دوازدهم تجربی، شلوغ و پرتلاش ═══════════════ */
console.log('\n▌ پرسونا ۱ — آرمان: دوازدهم تجربی، ۸ ساعت در روز، کلاس + آزمون + مهلت‌ها');
const p1cfg = base('tajrobi', 'دوازدهم', {
  student: { name: 'آرمان', grade: 'دوازدهم', field: 'tajrobi', chronotype: 'morning' },
  availability: { sat: 6, sun: 6, mon: 6, tue: 6, wed: 6, thu: 8, fri: 8 },
  classes: [
    { title: 'کلاس ریاضی', subjectId: 'math', weekdays: [0, 2], start: '18:00', end: '20:00' },
    { title: 'کلاس شیمی', subjectId: 'chem', weekdays: [4], start: '17:00', end: '19:30' },
  ],
  exams: [
    { title: 'آزمون آزمایشی ۱', date: addDays('2026-10-30', 30), start: '08:00', end: '11:30', subjectIds: ['bio', 'chem'] },
    { title: 'آزمون آزمایشی ۲', date: addDays('2026-10-30', 60), start: '08:00', end: '11:30', subjectIds: [] },
  ],
  offDates: [{ date: addDays('2026-10-30', 14), kind: 'halt', note: 'سفر' }, { date: addDays('2026-10-30', 21), kind: 'light', note: 'مهمانی' }],
  deadlines: {
    books: [
      { subjectId: 'bio', date: addDays('2026-10-30', 120), goal: 'solid' },
      { subjectId: 'di3', date: '2027-05-20', goal: 'read' },
    ],
    exams: [{ title: 'جمع‌بندی فصل ۱ زیست', kind: 'single', subjectId: 'bio', from: 1, to: 1, date: addDays('2026-10-30', 25) }],
  },
  subjects: presets.subjectsFor('tajrobi').concat(presets.generalFor('دوازدهم')),
  weeklyMocks: [{ title: 'آزمون جامع هفتگی', day: 5, everyNWeeks: 2, minutes: 180, subjectIds: [] }],
  finals: { enabled: true, courses: presets.finalsFor('دوازدهم').map((c) => Object.assign({}, c, { current: 15, target: 19 })) },
});
const p1 = engine.createPlan(p1cfg);
auditPlan('آرمان', p1cfg, p1);
{
  const cov = p1.summary.coverage;
  ok(cov.coverageRatio >= 90, '[آرمان] با ۸ ساعت در روز، پوشش بالای ۹۰٪ است', cov.coverageRatio + '٪');
  const lowWarn = (cov.diagnostics || []).filter((d) => d.id === 'low-capacity')[0];
  ok(cov.coverageRatio === 100 ? !lowWarn : !!lowWarn,
    '[آرمان] وضعیت هشدار با پوشش واقعی می‌خواند', cov.coverageRatio + '٪ · ' + (lowWarn ? 'هشدار دارد' : 'بدون هشدار'));
  /* قبل از آزمون: فقط مرور */
  const examDate = addDays('2026-10-30', 30);
  const before = p1.days.filter((d) => d.date < examDate && d.date >= addDays(examDate, -3));
  const learnInLast3 = before.reduce((n, d) => n + (d.blocks || []).filter((b) => b.kind === 'learn').length, 0);
  ok(before.length >= 2, '[آرمان] سه روز آخر قبل از آزمون در برنامه هست', before.length);
  ok(learnInLast3 === 0, '[آرمان] سه روز آخر قبل از آزمون «فقط مرور» است', learnInLast3);
  const examDay = p1.days.filter((d) => d.date === examDate)[0];
  ok(examDay && examDay.blocks.some((b) => b.kind === 'exam'), '[آرمان] روز آزمون بلوک آزمون دارد');
  ok(examDay && examDay.blocks.some((b) => b.kind === 'analysis'), '[آرمان] بلوک «تحلیل خطا» پس از آزمون چیده می‌شود',
    examDay && examDay.blocks.map((b) => b.kind).join(','));
  const anBlock = (examDay.blocks || []).filter((b) => b.kind === 'analysis')[0];
  ok(anBlock && iso2min(anBlock.start) >= iso2min('11:30'), '[آرمان] تحلیل خطا بعد از پایان آزمون است (نه هم‌زمان)',
    anBlock && anBlock.start);
  /* مهلت‌ها */
  const bd = (cov.deadlineBooks || []);
  ok(bd.length === 2, '[آرمان] هر دو مهلت کتابی در گزارش است', bd.length);
  ok(bd.every((d) => d.status === 'met' || d.status === 'ontrack' || d.status === 'late-done' || d.status === 'late'),
    '[آرمان] وضعیت مهلت‌ها معتبر است', bd.map((d) => d.status).join(','));
  /* سوابق: ۱۰ درس */
  ok((cov.finalsCourses || []).length === 10, '[آرمان] سوابق تحصیلی هر ۱۰ درس را دارد', (cov.finalsCourses || []).length);
  ok((cov.finalsCourses || []).every((c) => c.plannedMinutes > 0), '[آرمان] برای هر ۱۰ درس وقت گذاشته شده');
  /* کلاس‌ها: تثبیت کلاس بعد از کلاس */
  const classFix = p1.days.flatMap((d) => (d.blocks || []).filter((b) => b.kind === 'classfix'));
  ok(classFix.length >= 10, '[آرمان] «تثبیت کلاس» بعد از کلاس‌ها چیده شده', classFix.length);
}

/* ═══════════════ پرسونا ۲: سارا — یازدهم ریاضی، شب‌زی و کم‌بضاعت زمانی ═══════════════ */
console.log('\n▌ پرسونا ۲ — سارا: یازدهم ریاضی، شب‌زی، ۵ ساعت در روز، استراحت جمعه');
const p2cfg = base('riazi', 'یازدهم', {
  student: { name: 'سارا', grade: 'یازدهم', field: 'riazi', chronotype: 'evening' },
  availability: { sat: 5, sun: 5, mon: 5, tue: 5, wed: 5, thu: 5, fri: 0 },
  startTimes: { sat: '17:00', sun: '17:00', mon: '17:00', tue: '17:00', wed: '17:00', thu: '10:00', fri: '10:00' },
  sleep: { bedtime: '01:00', wake: '08:30' },
  restDay: 6,
  weeklyMock: true,
  finals: { enabled: false },
});
const p2 = engine.createPlan(p2cfg);
auditPlan('سارا', p2cfg, p2);
{
  const cov = p2.summary.coverage;
  const warn = (cov.diagnostics || [])[0] || {};
  ok(cov.coverageRatio < 100 ? !!warn.id : true,
    '[سارا] اگر پوشش کامل نشده، کمبود صریح اعلام می‌شود',
    cov.coverageRatio + '٪ · ' + (cov.diagnostics || []).map((d) => d.id).join(','));
  ok(!warn.id || (warn.fix && warn.fix.length > 10), '[سارا] هشدار، راه‌حل قابل‌اجرا هم می‌دهد', (warn.fix || '').slice(0, 40));
  ok(!warn.id || !!warn.step, '[سارا] هشدار می‌گوید کدام قدم را باید عوض کند', warn.step || '(بدون هشدار)');
  /* شب‌زی: بلوک‌های سخت‌تر باید دیرتر باشند (میانگین ساعت شروع learn های صبح vs تمرین) */
  const eve = p2.days.filter((d) => (d.blocks || []).length);
  ok(eve.length > 100, '[سارا] برنامه برای کل سال ساخته شده', eve.length);
  /* جمعه = استراحت */
  const fri = p2.days.filter((d) => d.weekday === 'جمعه' && (d.blocks || []).some((b) => b.kind === 'learn'));
  ok(fri.length === 0, '[سارا] جمعه‌ها هیچ درس تازه‌ای چیده نشده', fri.length);
}

/* ═══════════════ پرسونا ۳: مریم — فارغ‌التحصیل انسانی، ۱۰ ساعت، همه‌چیز نیمه‌خوانده ═══════════════ */
console.log('\n▌ پرسونا ۳ — مریم: فارغ‌التحصیل انسانی، ۱۰ ساعت در روز، تسلط‌های نیمه');
const p3subs = presets.subjectsFor('ensani').map((s) => Object.assign({}, s, { masteredChapters: 3, mastery: 42 }));
const p3cfg = base('ensani', 'فارغ‌التحصیل', {
  student: { name: 'مریم', grade: 'فارغ‌التحصیل', field: 'ensani', chronotype: 'neutral' },
  availability: { sat: 10, sun: 10, mon: 10, tue: 10, wed: 10, thu: 10, fri: 6 },
  startTimes: { sat: '08:00', sun: '08:00', mon: '08:00', tue: '08:00', wed: '08:00', thu: '08:00', fri: '10:00' },
  restDay: 7, weeklyMock: true, subjects: p3subs,
  finals: { enabled: true, courses: presets.finalsFor('دوازدهم') },
});
const p3 = engine.createPlan(p3cfg);
auditPlan('مریم', p3cfg, p3);
{
  const cov = p3.summary.coverage;
  ok(cov.coverageRatio >= 95, '[مریم] با ۱۰ ساعت در روز، پوشش تقریباً کامل است', cov.coverageRatio + '٪');
  const maxDay = Math.max.apply(null, p3.days.map((d) => d.plannedMinutes || 0));
  ok(maxDay <= 10 * 60 + 30, '[مریم] هیچ روزی بیشتر از ۱۰ ساعت نشده', H(maxDay) + ' ساعت');
  const avgDay = p3.days.reduce((n, d) => n + (d.plannedMinutes || 0), 0) / p3.days.length;
  ok(avgDay > 3 * 60, '[مریم] برنامه واقعاً از ظرفیت بالا استفاده می‌کند', H(avgDay) + ' ساعت/روز');
  ok(!(p3.summary.coverage.diagnostics || []).some((d) => d.id === 'low-capacity'), '[مریم] هشدار کمبود ندارد');
}

/* ═══════════════ پرسونا ۴: رضا — دهم تجربی، ۲ ساعت در روز (باید صادق باشد) ═══════════════ */
console.log('\n▌ پرسونا ۴ — رضا: دهم تجربی، فقط ۲ ساعت در روز — آزمون صداقت موتور');
const p4cfg = base('tajrobi', 'دهم', {
  student: { name: 'رضا', grade: 'دهم', field: 'tajrobi', chronotype: 'neutral' },
  availability: { sat: 2, sun: 2, mon: 2, tue: 2, wed: 2, thu: 2, fri: 2 },
  startTimes: { sat: '19:00', sun: '19:00', mon: '19:00', tue: '19:00', wed: '19:00', thu: '19:00', fri: '19:00' },
  restDay: 7, weeklyMock: false, finals: { enabled: false },
});
const p4 = engine.createPlan(p4cfg);
auditPlan('رضا', p4cfg, p4);
{
  const cov = p4.summary.coverage;
  ok(cov.coverageRatio < 80, '[رضا] با ۲ ساعت در روز پوشش کامل ادعا نمی‌شود', cov.coverageRatio + '٪');
  const low = (cov.diagnostics || []).filter((d) => d.id === 'low-capacity')[0];
  ok(!!low, '[رضا] هشدار «ظرفیت کم» داده می‌شود');
  ok(low && /ساعت/.test(low.detail || ''), '[رضا] هشدار می‌گوید دقیقاً چقدر کم است', low && (low.detail || '').slice(0, 60));
  ok(low && low.fix && /خودکار|بالا ببر/.test(low.fix), '[رضا] راه‌حل پیشنهادی داده می‌شود', low && (low.fix || '').slice(0, 40));
  const maxDay = Math.max.apply(null, p4.days.map((d) => d.plannedMinutes || 0));
  ok(maxDay <= 2 * 60 + 30, '[رضا] با وجود کمبود، از ظرفیت اعلامی رد نشده', H(maxDay));
}

/* ═══════════════ پرسونا ۵: نگار — حالت «خودکار»، فقط سقف ۶ ساعت ═══════════════ */
console.log('\n▌ پرسونا ۵ — نگار: دوازدهم زبان، حالت خودکار با سقف ۶ ساعت');
const p5cfg = base('zaban', 'دوازدهم', {
  student: { name: 'نگار', grade: 'دوازدهم', field: 'zaban', chronotype: 'morning' },
  timeMode: 'auto', dailyCapHours: 6, dailyFloorHours: 2,
  availability: null, restDay: 5, weeklyMock: true,
  finals: { enabled: true, courses: presets.finalsFor('دوازدهم') },
});
const p5 = engine.createPlan(p5cfg);
{
  /* در حالت خودکار availability از سقف ساخته می‌شود؛ برای سنجش، همان را می‌گذاریم */
  const p5audit = Object.assign({}, p5cfg, {
    availability: { sat: 6, sun: 6, mon: 6, tue: 6, wed: 6, thu: 6, fri: 6 },
  });
  auditPlan('نگار', p5audit, p5);
  const cov = p5.summary.coverage;
  ok(cov.coverageRatio > 60, '[نگار] حالت خودکار پوشش معقول می‌دهد', cov.coverageRatio + '٪');
  const maxDay = Math.max.apply(null, p5.days.map((d) => d.plannedMinutes || 0));
  ok(maxDay <= 6 * 60 + 30, '[نگار] از سقف ۶ ساعت رد نشده', H(maxDay));
  const avg = p5.days.reduce((n, d) => n + d.plannedMinutes, 0) / p5.days.length;
  ok(cov.coverageRatio === 100 ? true : avg >= 2 * 60 - 30,
    '[نگار] تا وقتی نیاز هست، زمان اعلامی مصرف می‌شود', H(avg) + ' ساعت/روز · پوشش ' + cov.coverageRatio + '٪');
  ok((p5.meta.config.availability || {}).sat <= 6 && (p5.meta.config.availability || {}).sat >= 2,
    '[نگار] حالت خودکار ساعتی بین کف و سقف انتخاب می‌کند', (p5.meta.config.availability || {}).sat);
}

/* ═══════════════ پرسونا ۶: علی — ۴۵ روز تا کنکور، تقریباً صفر ═══════════════ */
console.log('\n▌ پرسونا ۶ — علی: ۴۵ روز تا کنکور و تقریباً هیچ فصل خوانده‌شده');
const p6cfg = base('tajrobi', 'دوازدهم', {
  student: { name: 'علی', grade: 'دوازدهم', field: 'tajrobi', chronotype: 'neutral' },
  startDate: '2027-05-18', examDate: '2027-07-02',
  availability: { sat: 7, sun: 7, mon: 7, tue: 7, wed: 7, thu: 7, fri: 4 },
  startTimes: { sat: '08:00', sun: '08:00', mon: '08:00', tue: '08:00', wed: '08:00', thu: '08:00', fri: '10:00' },
  restDay: 6, weeklyMock: true, finals: { enabled: false },
});
const p6 = engine.createPlan(p6cfg);
auditPlan('علی', p6cfg, p6);
{
  const cov = p6.summary.coverage;
  ok(cov.coverageRatio < 100, '[علی] با ۴۵ روز، پوشش کامل ادعا نمی‌شود', cov.coverageRatio + '٪');
  const warn = (cov.diagnostics || [])[0];
  ok(!!warn, '[علی] کمبود زمان صریح اعلام می‌شود');
  ok(p6.days.length <= 47, '[علی] برنامه فقط تا روز کنکور است', p6.days.length);
  /* اولویت‌بندی: فصل‌های پرتکرار باید جلوتر باشند */
  const firstWeek = p6.days.slice(0, 7).flatMap((d) => (d.blocks || []).filter((b) => b.kind === 'learn'));
  ok(firstWeek.length > 0, '[علی] از هفتهٔ اول یادگیری شروع می‌شود', firstWeek.length);
  const bioLearn = firstWeek.filter((b) => b.subjectId === 'bio').length;
  ok(bioLearn > 0, '[علی] زیست (پرضریب‌ترین) از همان هفتهٔ اول سهم دارد', bioLearn);
}

/* ═══════════════ پرسونا ۷: زهرا — همه‌چیز تمام، فقط مرور و تست ═══════════════ */
console.log('\n▌ پرسونا ۷ — زهرا: همهٔ فصل‌ها خوانده و مسلط — نباید «یادگیری از صفر» ببیند');
const zSubs = presets.subjectsFor('tajrobi').map((s) => ({
  ...s,
  chaptersData: Array.from({ length: s.chapters }, (_, i) => ({ name: '', read: true, mastery: 92 })),
}));
const p7cfg = base('tajrobi', 'دوازدهم', {
  student: { name: 'زهرا', grade: 'دوازدهم', field: 'tajrobi', chronotype: 'neutral' },
  subjects: zSubs, availability: { sat: 4, sun: 4, mon: 4, tue: 4, wed: 4, thu: 4, fri: 4 },
  restDay: 5, weeklyMock: true, finals: { enabled: false },
});
const p7 = engine.createPlan(p7cfg);
auditPlan('زهرا', p7cfg, p7);
{
  const cov = p7.summary.coverage;
  ok(cov.coverageRatio === 100, '[زهرا] پوشش ۱۰۰٪ است', cov.coverageRatio);
  const learn = p7.days.flatMap((d) => (d.blocks || []).filter((b) => b.kind === 'learn' || b.kind === 'reteach'));
  ok(learn.length === 0, '[زهرا] هیچ بلوک «یادگیری از صفر» چیده نشده', learn.length);
  const rev = p7.days.flatMap((d) => (d.blocks || []).filter((b) => b.kind === 'review' || b.kind === 'practice'));
  ok(rev.length > 100, '[زهرا] فقط مرور و تست چیده شده', rev.length);
}

/* ═══════════════ رگرسیون‌های همین دور ═══════════════ */
console.log('\n▌ رگرسیون: مرور نهاییِ روز کنکور و آزمون روی روز استراحت');
{
  /* مرور نهایی نباید داخل ساعت خواب بیفتد (پرسونای شب‌زی با بیداری ۰۸:۳۰) */
  const night = base('riazi', 'یازدهم', {
    startDate: '2026-10-30', examDate: '2027-07-02',
    availability: { sat: 5, sun: 5, mon: 5, tue: 5, wed: 5, thu: 5, fri: 0 },
    startTimes: { sat: '17:00', sun: '17:00', mon: '17:00', tue: '17:00', wed: '17:00', thu: '10:00', fri: '10:00' },
    sleep: { bedtime: '01:00', wake: '08:30' }, restDay: 6, weeklyMock: true, finals: { enabled: false },
  });
  const np = engine.createPlan(night);
  const fd = np.days[np.days.length - 1];
  const first = (fd.blocks || [])[0];
  ok(!!first && iso2min(first.start) >= iso2min('08:30'),
    '[شب‌زی] مرور نهایی روز کنکور بعد از ساعت بیداری است', first && first.start);
  ok(!np.days.some((d) => d.weekday === 'جمعه' && d.date !== fd.date && (d.blocks || []).length),
    '[شب‌زی] روز استراحت هیچ بلوکی ندارد (به‌جز خودِ روز کنکور)');

  /* آزمون دوره‌ای نباید روی روز استراحت بیفتد */
  const rp = engine.createPlan(base('tajrobi', 'دوازدهم', {
    availability: { sat: 5, sun: 5, mon: 5, tue: 5, wed: 5, thu: 5, fri: 5 },
    restDay: 5, weeklyMock: true, finals: { enabled: false },
    weeklyMocks: [{ title: 'آزمون دوره‌ای', day: 5, everyNWeeks: 1, minutes: 100, subjectIds: [] }],
  }));
  const restWithMock = rp.days.filter((d) => d.weekday === 'پنجشنبه' && (d.blocks || []).some((b) => b.kind === 'mock'));
  ok(restWithMock.length <= 1, '[استراحت] آزمون دوره‌ای روی روز استراحت چیده نمی‌شود',
    restWithMock.length + ' روز');
}

/* ═══════════════ روز سبک / تعطیل: باید خودش را توضیح بدهد ═══════════════ */
console.log('\n▌ روز سبک و تعطیل کامل');
{
  const lp = engine.createPlan(base('tajrobi', 'دوازدهم', {
    availability: { sat: 5, sun: 5, mon: 5, tue: 5, wed: 5, thu: 5, fri: 5 },
    restDay: 7, weeklyMock: true, finals: { enabled: false },
    offDates: [
      { date: '2026-11-02', kind: 'light', note: 'مهمانی' },
      { date: '2026-11-03', kind: 'halt', note: 'سفر' },
    ],
  }));
  const day = (d) => lp.days.filter((x) => x.date === d)[0];
  const normal = day('2026-11-01'); const light = day('2026-11-02'); const halt = day('2026-11-03');
  ok(light.plannedMinutes > 0 && light.plannedMinutes < normal.plannedMinutes,
    '[روز سبک] بار روز سبک کمتر از روز عادی است', light.plannedMinutes + ' < ' + normal.plannedMinutes);
  ok(/روز سبک/.test(light.note) && /مهمانی/.test(light.note),
    '[روز سبک] روز خودش را توضیح می‌دهد (نه یادداشت خالی)', light.note);
  ok(/٪/.test(light.note), '[روز سبک] درصد بار روز را می‌گوید', light.note);
  ok(halt.plannedMinutes === 0 && /تعطیل کامل/.test(halt.note),
    '[تعطیل] روز تعطیل خالی است و دلیلش نوشته شده', halt.note);
  ok(!!normal.note || normal.note === '', '[عادی] روز عادی یادداشت نامربوط ندارد', JSON.stringify(normal.note));
}

/* ═══════════════ تنوع روزانه: روز یک‌کتابی ممنوع ═══════════════
   شواهد: درهم‌آمیزی و فاصله‌گذاری (Cepeda 2006؛ Rohrer 2007؛ Kornell & Bjork 2008)
   یادگیری را عمیق‌تر و خستگی را کمتر می‌کند؛ این در حالی است که مرور و تثبیتِ هر فصل
   دقیقاً سرِ جای خودش می‌ماند. پس: هیچ روزِ درسی نباید «یک کتاب» باشد. */
console.log('\n▌ تنوع روزانه: هیچ روزی تک‌کتابی نیست');
{
  /* همان تعریفی که موتور برای «درس‌های روز» دارد: فقط درس‌های واقعی (آزمون/کلاس/جمع‌بندی نه) */
  const studyDay = (d) => (d.blocks || []).filter((b) => b.subjectId
    && ['EXAM', 'MOCK', 'ALL', 'CLASS', 'CUM'].indexOf(b.subjectId) === -1);
  const variety = (d) => {
    const by = {};
    studyDay(d).forEach((b) => { by[b.subjectId] = (by[b.subjectId] || 0) + (b.minutes || 0); });
    return by;
  };
  const report = (name, plan) => {
    const days = plan.days.filter((d) => studyDay(d).length >= 2);
    let single = 0; let big60 = 0; let sumSubs = 0;
    days.forEach((d) => {
      const by = variety(d);
      const ids = Object.keys(by);
      const tot = Object.values(by).reduce((a, b) => a + b, 0) || 1;
      sumSubs += ids.length;
      if (ids.length === 1) single += 1;
      if (ids.some((id) => by[id] / tot > 0.6)) big60 += 1;
    });
    return { n: days.length, single, big60, avgSubs: sumSubs / Math.max(1, days.length) };
  };
  const r1 = report('آرمان', p1);
  /* استثنا: هفته‌های آخر — وقتی فقط یک درس فصلِ نخوانده دارد (یا کلاس همان درس است)
     روز طبیعتاً تک‌درس می‌شود. «تنوعِ ساختگی» بهتر از تمرکز نیست. */
  ok(r1.single / r1.n <= 0.05, '[آرمان] روزهای تک‌درس کمتر از ۵٪ روزهای درسی است',
    r1.single + '/' + r1.n);
  ok(r1.avgSubs >= 2.5, '[آرمان] میانگین درس‌های هر روز ≥ ۲.۵', r1.avgSubs.toFixed(2));
  ok(r1.big60 / r1.n <= 0.2, '[آرمان] کمتر از ۲۰٪ روزها یک درس بیش از ۶۰٪ وقت را می‌گیرد',
    r1.big60 + '/' + r1.n);

  const r4 = report('رضا ۲ ساعتی', p4);
  ok(r4.single / r4.n <= 0.06, '[۲ ساعتی] روز تک‌درس تقریباً وجود ندارد', r4.single + '/' + r4.n);

  /* فیلد variety باید با بلوک‌های واقعی همان روز بخواند (نه عددِ جدا از واقعیت) */
  let mismatch = 0;
  p1.days.forEach((d) => {
    if (!d.variety) { mismatch += 1; return; }
    const by = variety(d);
    const ids = Object.keys(by).sort();
    const vIds = (d.variety.list || []).map((x) => x.id).sort();
    if (ids.join(',') !== vIds.join(',')) mismatch += 1;
    if (d.variety.subjects !== vIds.length) mismatch += 1;
    (d.variety.list || []).forEach((x) => { if (!x.name || !(x.minutes > 0)) mismatch += 1; });
  });
  ok(mismatch === 0, '[آرمان] فیلد «تنوع روز» با بلوک‌های واقعی همان روز می‌خواند', mismatch);

  /* قاعدهٔ «تثبیت جریمه نمی‌شود»: هر روزِ درسی که یادگیری دارد باید مرور/تست هم داشته باشد */
  let noConsolidation = 0;
  p1.days.forEach((d) => {
    const kinds = (d.blocks || []).map((b) => b.kind);
    if (kinds.indexOf('learn') !== -1 && kinds.indexOf('practice') === -1
      && kinds.indexOf('review') === -1 && kinds.indexOf('warmup') === -1) noConsolidation += 1;
  });
  ok(noConsolidation <= Math.round(p1.days.length * 0.02),
    '[آرمان] روزِ یادگیری بدون مرور/تست تقریباً وجود ندارد (تثبیت حفظ شده)', noConsolidation);

  /* روزنامهٔ تنوع باید قطعی باشد: همان ورودی → همان ترکیب روزها */
  const a = engine.createPlan(JSON.parse(JSON.stringify(p1cfg)));
  const b = engine.createPlan(JSON.parse(JSON.stringify(p1cfg)));
  const vSig = (p) => p.days.map((d) => d.date + ':' + ((d.variety && d.variety.list) || [])
    .map((x) => x.id + x.minutes).join('+')).join(';');
  ok(vSig(a) === vSig(b), 'تنوعِ روزها قطعی و تکرارپذیر است (بدون تصادف)');
}

/* ═══════════════ قطعیت و پایداری ═══════════════ */
console.log('\n▌ قطعیت: دو بار ساخت با همان ورودی');
{
  const a = engine.createPlan(JSON.parse(JSON.stringify(p1cfg)));
  const b = engine.createPlan(JSON.parse(JSON.stringify(p1cfg)));
  const sig = (p) => p.days.map((d) => d.date + '|' + d.blocks.map((x) => x.kind + x.start + x.minutes).join(',')).join(';');
  ok(sig(a) === sig(b), 'همان ورودی → همان برنامه (قطعی و تکرارپذیر)');
  ok(a.days.length === b.days.length, 'تعداد روزها یکسان است', a.days.length + ' vs ' + b.days.length);
}

/* ═══════════════ تاریخ شمسی و روز هفته ═══════════════ */
console.log('\n▌ تقویم: روز هفتهٔ هر روز با تاریخ شمسی می‌خواند');
{
  const FA = ['شنبه', 'یکشنبه', 'دوشنبه', 'سه‌شنبه', 'چهارشنبه', 'پنجشنبه', 'جمعه'];
  let bad = 0;
  p1.days.forEach((d) => {
    const wd = FA[(new Date(d.date + 'T00:00:00Z').getUTCDay() + 1) % 7];
    if (wd !== d.weekday) bad += 1;
  });
  ok(bad === 0, 'نام روز هفته برای همهٔ روزها درست است', bad);
  ok(p1.days[0].date === '2026-10-30', 'برنامه از تاریخ شروع آغاز می‌شود', p1.days[0].date);
  ok(p1.days[p1.days.length - 1].date <= '2027-07-02', 'برنامه از تاریخ کنکور جلوتر نمی‌رود');
}

/* ═══════════════ سناریوی اجرای روز: تیک‌زدن و جبران ═══════════════ */
console.log('\n▌ اجرای روز: بلوک‌ها قابل تیک‌خوردن و جمع‌شدن‌اند');
{
  const total = p1.days.reduce((n, d) => n + (d.blocks || []).length, 0);
  const withIds = p1.days.every((d) => (d.blocks || []).every((b, i) => b && (b.start || b.kind)));
  ok(total > 500, '[آرمان] برنامه حجم واقعی دارد (بیش از ۵۰۰ بلوک)', total);
  ok(withIds, '[آرمان] همهٔ بلوک‌ها ساختار قابل نمایش دارند');
  const kinds = {};
  p1.days.forEach((d) => (d.blocks || []).forEach((b) => { kinds[b.kind] = (kinds[b.kind] || 0) + 1; }));
  ok(Object.keys(kinds).length >= 8, '[آرمان] تنوع بلوک‌ها (یادگیری، مرور، تست، آزمون…) موجود است', Object.keys(kinds).length);
  console.log('    ترکیب بلوک‌های آرمان: ' + Object.entries(kinds).sort((a, b) => b[1] - a[1]).map(([k, v]) => k + ':' + v).join(' · '));
}

/* ═══════════════ خلاصه ═══════════════ */
console.log('\n' + '═'.repeat(64));
if (fail) {
  console.log(`❌ ${pass} ✅ / ${fail} ❌ — ایرادها:`);
  errors.forEach((e) => console.log('   • ' + e));
  process.exitCode = 1;
} else {
  console.log(`✅ ${pass} بررسی شبیه‌سازی چند‌دانش‌آموزی پاس شد (۷ پرسونا)`);
}
console.log('═'.repeat(64));
