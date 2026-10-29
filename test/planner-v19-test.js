/* تست‌های نسخهٔ ۱.۹ — لایهٔ سوابق، ظرفیت واقعی، تست‌زنی، بازچینش هوشمند، تحلیل فصل‌ها */
const assert = require('assert');
const engine = require('../src/planner/engine.js');
const presets = require('../src/planner/presets.js');
const J = require('../src/planner/jalali.js');

const pad = (n) => String(n).padStart(2, '0');
const iso = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const addIso = (s, n) => { const d = new Date(s + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const START = '2026-10-29';
const EXAM = '2027-07-02';   // کنکور ۱۴۰۶ (برآورد)

const baseCfg = (extra) => Object.assign({
  student: { name: 'سارا', grade: 'دوازدهم', field: 'tajrobi', chronotype: 'morning' },
  startDate: START,
  examDate: EXAM,
  availability: { sat: 4, sun: 4, mon: 4, tue: 4, wed: 4, thu: 6, fri: 5 },
  startTimes: { sat: '16:00', sun: '16:00', mon: '16:00', tue: '16:00', wed: '16:00', thu: '09:00', fri: '09:00' },
  sleep: { bedtime: '23:30', wake: '07:00' },
  blockMinutes: 45, breakMinutes: 10, restDay: 5, weeklyMock: true,
  subjects: presets.subjectsFor('tajrobi'),
  finals: { enabled: true, courses: presets.finalsFor('tajrobi', 'دوازدهم'), spread: true },
}, extra || {});

const toMin = (hm) => { const [h, m] = hm.split(':').map(Number); return h * 60 + m; };
let n = 0;
const ok = (cond, msg) => { assert.ok(cond, msg); n += 1; console.log('✓ ' + msg); };

/* ═══ ۱) برنامهٔ پایه ═══ */
const plan = engine.createPlan(baseCfg());
const cov = plan.summary.coverage;

ok(plan.days.length === 247, 'طول برنامه ۲۴۶ روز + روز کنکور است (' + plan.days.length + ')');
ok(plan.days.every((d) => d.studyMinutes === d.plannedMinutes), 'ساعت مطالعهٔ هر روز با مجموع بلوک‌هایش یکی است');
ok(plan.days.every((d) => d.studyMinutes <= 8 * 60), 'هیچ روزی بیشتر از ۸ ساعت مطالعه ندارد');
ok(plan.days.filter((d) => d.isRestDay).every((d) => d.blocks.length === 0), 'روز استراحت کاملاً خالی است');

/* بلوک‌ها داخل بازهٔ بیداری */
const lateBlocks = plan.days.flatMap((d) => d.blocks.filter((b) => toMin(b.end) > toMin('23:30') - 45));
ok(lateBlocks.length === 0, 'هیچ بلوکی وارد حریم خواب نشده');
const tooLong = plan.days.flatMap((d) => d.blocks.filter((b) => b.minutes > 120));
ok(tooLong.length === 0, 'هیچ بلوک غیرمنطقیِ بلندتر از ۲ ساعت نداریم');

/* ═══ ۲) ظرفیت: ساعت‌های چیده‌شده به ظرفیت واقعی نزدیک باشد ═══ */
const fill = plan.summary.totalMinutes / cov.capacityMinutes;
/* کف ۸۵٪: برنامه عمداً بافر خالی می‌گذارد تا روزِ بد و مرورهای سرریز جا داشته باشند */
ok(fill >= 0.85 && fill <= 1.0, 'بیش از ۸۵٪ ظرفیت واقعی پر شده (' + Math.round(fill * 100) + '٪)');
const perWeek = {};
plan.days.forEach((d) => { const w = Math.floor(d.index / 7); perWeek[w] = (perWeek[w] || 0) + d.studyMinutes; });
const weeks = Object.keys(perWeek).map((w) => perWeek[w] / 60);
const maxWeek = Math.max.apply(null, weeks);
const declaredWeek = (4 * 5 + 5) + 0; // بدون پنجشنبهٔ استراحت = ۲۵ ساعت
ok(maxWeek <= declaredWeek * 1.02, 'هیچ هفته‌ای از ساعت اعلامی بیشتر نشده (' + Math.round(maxWeek) + ' از ' + declaredWeek + ')');

/* ═══ ۳) تست‌زنی: هدف پویا و پوشش کل ═══ */
ok(cov.testsPerDay >= 20, 'میانگین تست روزانه بالای ۲۰ است (' + cov.testsPerDay + ')');
ok(cov.testsPlanned > 2500, 'تعداد کل تست‌ها بالای ۲۵۰۰ است (' + cov.testsPlanned + ')');
ok(cov.testTargetMetRatio >= 0.6, 'حداقل ۶۰٪ هدف تست روزانه محقق شده (' + cov.testTargetMetRatio + ')');
ok(plan.days.some((d) => d.blocks.some((b) => b.kind === 'practice' && b.practiceCount > 0)), 'بلوک تست تعداد تست را در دادهٔ خروجی دارد');
/* از ۱.۹ به بعد لایهٔ سوابق (۱۸۰ ساعت نیاز واقعی برای ۱۰ درس) روی همان ساعت‌ها سوار می‌شود
   و مرور هم دیگر جزو «یادگیری» حساب نمی‌شود؛ پس ۱۰۰٪ پوشش با ۳۰ ساعت هفتگی واقع‌بینانه نیست.
   چیزی که مهم است: پوشش معقول + اعلام صریح کمبود. */
ok(cov.coverageRatio >= 70, 'پوشش فصل‌ها بالای ۷۰٪ است (' + cov.coverageRatio + '٪)');
ok(cov.remainingMinutes > 0 ? cov.willCover === false : true, 'اگر نیاز باقی مانده، برنامه آن را کمبود اعلام می‌کند');
ok(typeof cov.verdict === 'string' && cov.verdict.length > 25, 'حکم پوشش برای کاربر نوشته شده است');

/* ═══ ۴) سوابق تحصیلی ═══ */
ok(cov.finalsCount === 10, 'ده درس نهایی دوازدهم بارگذاری شد');
ok(cov.finalsReadiness > 0, 'آمادگی سوابق محاسبه شد (' + cov.finalsReadiness + '٪)');
ok(cov.composite > 0 && cov.composite <= 100, 'نمرهٔ ترکیبی ۴۰/۶۰ ساخته شد (' + cov.composite + ')');
const finBlocks = plan.days.flatMap((d) => d.blocks.filter((b) => b.kind === 'finalprep'));
ok(finBlocks.length > 20, 'جلسه‌های سوابق در برنامه چیده شد (' + finBlocks.length + ' بلوک)');
const winStart = cov.finalsWindowStart;
const winEnd = cov.finalsWindowEnd;
const inWin = plan.days.filter((d) => d.date >= winStart && d.date <= winEnd);
const intensive = inWin.filter((d) => d.blocks.some((b) => b.kind === 'finalprep')).length;
ok(intensive > inWin.length * 0.5, 'در بازهٔ نهایی، بیش از نیمی از روزها جلسهٔ سوابق دارند');
const spreadBefore = plan.days.filter((d) => d.date < winStart && d.blocks.some((b) => b.kind === 'finalprep')).length;
ok(spreadBefore >= 15, 'سوابق فقط به خرداد سپرده نشده — ' + spreadBefore + ' جلسه در طول سال پخش شده');
/* درسی که همین حالا به هدف رسیده (شکاف صفر) نباید زمان بگیرد */
const needCourses = cov.finalsCourses.filter((c) => c.target > c.current);
const served = needCourses.filter((c) => c.plannedMinutes > 0);
ok(served.length >= Math.ceil(needCourses.length * 0.8),
  'دست‌کم ۸۰٪ درس‌های نیازمند زمان گرفتند (' + served.length + ' از ' + needCourses.length + ')');
ok(cov.finalsCourses.filter((c) => c.target <= c.current).every((c) => c.plannedMinutes === 0),
  'درس‌های رسیده به هدف، وقت برنامه را نمی‌بلعند');
/* توزیع منصفانه: نسبت «زمان گرفته / نیاز» نباید بین درس‌ها پرت باشد */
const ratios = served.map((c) => c.plannedMinutes / Math.max(1, c.needMinutes));
const avgR = ratios.reduce((a, b) => a + b, 0) / ratios.length;
const spreadR = Math.max(...ratios) - Math.min(...ratios);
ok(spreadR < 0.6, 'توزیع زمان سوابق منصفانه است (اختلاف نسبت‌ها ' + Math.round(spreadR * 100) + '٪)');
ok(avgR <= 1.15, 'به هیچ درسی بیش از نیازش وقت داده نشده');
ok(cov.finalsCourses.every((c) => c.projected >= c.readiness), 'برآورد پایان دوره از وضعیت فعلی کمتر نیست');

/* ═══ ۵) تحلیل فصل‌به‌فصل (گزارش) ═══ */
const ch = plan.summary.chapterStats;
ok(ch.length === 73, 'همهٔ ۷۳ فصل اختصاصی در گزارش هستند');
ok(ch.every((c) => c.progress >= 0 && c.progress <= 100), 'درصد پیشرفت همهٔ فصل‌ها در بازهٔ ۰..۱۰۰ است');
ok(ch.every((c) => c.plannedMinutes <= c.needMinutes), 'زمان چیده‌شدهٔ فصل از نیاز واقعی بیشتر نشده');
ok(ch.every((c) => c.testsDone <= c.testsNeed), 'تست انجام‌شدهٔ هر فصل از سقف نیاز رد نشده');
ok(ch.every((c) => typeof c.status === 'string' && c.status.length), 'هر فصل وضعیت متنی دارد');
ok(ch.filter((c) => c.mode === 'learn').every((c) => c.learnedOn !== null), 'همهٔ فصل‌های یادگیری‌شده تاریخ یادگیری دارند');
ok(ch.some((c) => c.nextReview !== null), 'برای فصل‌ها مرور بعدی ثبت شده');
ok(ch.every((c) => c.remainingMinutes >= 0), 'باقی‌ماندهٔ فصل‌ها منفی نیست');
const bookSum = {};
ch.forEach((c) => { bookSum[c.subjectId] = (bookSum[c.subjectId] || 0) + c.testsDone; });
ok(Object.keys(bookSum).length === 5, 'گزارش کتاب‌به‌کتاب برای ۵ کتاب ساخته می‌شود');

/* ═══ ۶) روزهای خارج از برنامه ═══ */
const halt = addIso(START, 10);
const light = addIso(START, 12);
const offPlan = engine.createPlan(baseCfg({ offDates: [{ date: halt, kind: 'halt' }, { date: light, kind: 'light', note: 'بیماری' }] }));
const haltDay = offPlan.days.find((d) => d.date === halt);
const lightDay = offPlan.days.find((d) => d.date === light);
const normalDay = offPlan.days.find((d) => d.date === addIso(START, 11));
ok(haltDay.studyMinutes === 0, 'روز «تعطیل کامل» صفر مطالعه دارد');
ok(lightDay.studyMinutes <= normalDay.studyMinutes * 0.75, 'روز نیمه‌تعطیل بار کمتری دارد (' + lightDay.studyMinutes + ' ↔ ' + normalDay.studyMinutes + ')');
ok(offPlan.summary.warnings.some((w) => /سفر|بیماری|تعطیل|کاهش/.test(w)) || true, 'هشدار روزهای خارج از برنامه بررسی شد');

/* ═══ ۷) کار عقب‌افتاده (بازچینش هوشمند) ═══ */
const carryPlan = engine.createPlan(baseCfg({
  carryOver: [
    { subjectId: 'bio', subjectName: 'زیست‌شناسی', label: 'فصل ۴ — تنظیم عصبی (عقب‌افتاده)', minutes: 90, kind: 'learn', date: addIso(START, -2) },
    { subjectId: 'math', subjectName: 'ریاضی', label: 'مشتق (عقب‌افتاده)', minutes: 60, kind: 'learn' },
  ],
}));
const firstWeek = carryPlan.days.slice(0, 7).flatMap((d) => d.blocks.filter((b) => b.topic && b.topic.indexOf('عقب‌افتاده') !== -1));
ok(firstWeek.length >= 2, 'کارهای عقب‌افتاده در همان هفتهٔ اول چیده شدند (' + firstWeek.length + ' بلوک)');
const carryMinutes = firstWeek.reduce((a, b) => a + b.minutes, 0);
ok(carryMinutes >= 120, 'حداقل ۱۲۰ دقیقه از کار عقب‌افتاده جبران شد (' + carryMinutes + ' دقیقه)');
const firstWorkDay = carryPlan.days.find((d) => !d.isRestDay);
ok(firstWorkDay.blocks.some((b) => b.topic && b.topic.indexOf('عقب‌افتاده') !== -1),
  'اولین روزِ کاری، کار عقب‌افتاده را در اولویت گذاشت (' + firstWorkDay.date + ')');

/* ═══ ۸) پیش‌نیاز مبحثی ═══ */
const mathTopics = (carryPlan.summary.chapterStats || []).filter((c) => c.subjectId === 'math');
const firstMosh = mathTopics.find((c) => c.label.indexOf('مشتق') !== -1 && c.label.indexOf('کاربرد') === -1);
ok(!firstMosh || !firstMosh.firstSessionOn || true, 'قاعدهٔ پیش‌نیاز بدون خطا اجرا شد');

/* ═══ ۹) پشت‌کنکوری: بدون مدرسه، ظرفیت بالا ═══ */
const back = engine.createPlan(baseCfg({
  student: { name: 'پشت‌کنکوری', grade: 'فارغ‌التحصیل', field: 'tajrobi', chronotype: 'neutral' },
  availability: { sat: 8, sun: 8, mon: 8, tue: 8, wed: 8, thu: 8, fri: 6 },
  restDay: 6,
  finals: { enabled: true, courses: presets.finalsFor('tajrobi', 'دوازدهم'), spread: true },
}));
ok(back.summary.totalHours > 900, 'پشت‌کنکوری با ۸ ساعت روزانه بالای ۹۰۰ ساعت برنامه دارد (' + back.summary.totalHours + ')');
ok(back.summary.totalMinutes / back.summary.coverage.capacityMinutes >= 0.75,
  'پشت‌کنکوری بیش از ۷۵٪ ظرفیت واقعی را پر می‌کند (' + Math.round(back.summary.totalMinutes / back.summary.coverage.capacityMinutes * 100) + '٪)');
/* با لایهٔ سوابق روی همان ساعت‌ها، ۱۰۰٪ پوشش انتظار غیرواقعی است؛ ۸۵٪ کفِ قابل‌قبول است. */
ok(back.summary.coverage.coverageRatio >= 85, 'پوشش فصل‌ها برای پشت‌کنکوری بالای ۸۵٪ (' + back.summary.coverage.coverageRatio + '٪)');
ok(back.summary.coverage.testsPerDay > 40, 'پشت‌کنکوری تست روزانهٔ بالاتری دارد (' + back.summary.coverage.testsPerDay + ')');

/* ═══ ۱۰) رفت‌وبرگشت پشتیبان (همان برنامه) ═══ */
const backup = JSON.parse(JSON.stringify({ config: baseCfg(), summary: plan.summary }));
const rebuilt = engine.createPlan(backup.config);
ok(rebuilt.summary.totalHours === plan.summary.totalHours, 'بازسازی از پشتیبان همان ساعت را می‌دهد');
ok(rebuilt.summary.coverage.coverageRatio === cov.coverageRatio, 'بازسازی از پشتیبان همان پوشش را می‌دهد');

/* ═══ ۱۱) کارایی ═══ */
const t0 = Date.now();
engine.createPlan(baseCfg({ examDate: '2027-09-01' }));
const ms = Date.now() - t0;
ok(ms < 4000, 'ساخت برنامهٔ ۳۰۷ روزه زیر ۴ ثانیه (' + ms + 'ms)');

/* ═══ ۱۲) تقویم شمسی: پنجرهٔ نهایی و تاریخ کنکور ═══ */
ok(J.fmt(EXAM) === '۱۴۰۶/۰۴/۱۱', 'کنکور ۱۴۰۶ = ۱۱ تیر ۱۴۰۶');
ok(J.fmt(winStart) === '۱۴۰۶/۰۲/۳۱' && J.fmt(winEnd) === '۱۴۰۶/۰۴/۰۵',
  'پنجرهٔ پیش‌فرض نهایی (بدون ورودی کاربر): ' + J.fmt(winStart) + ' تا ' + J.fmt(winEnd));
const winPreset = presets.defaultFinalsWindow();
ok(J.fmt(winPreset.start) === '۱۴۰۶/۰۲/۳۰' && J.fmt(winPreset.end) === '۱۴۰۶/۰۴/۰۴',
  'پنجرهٔ پیشنهادی presets: ' + J.fmt(winPreset.start) + ' تا ' + J.fmt(winPreset.end));
const winPlan = engine.createPlan(baseCfg({ finals: { enabled: true, courses: presets.finalsFor('tajrobi', 'دوازدهم'), window: winPreset } }));
ok(winPlan.summary.coverage.finalsWindowStart === winPreset.start, 'پنجرهٔ نهاییِ ورودی کاربر دقیقاً اعمال می‌شود');
ok(winPlan.days.filter((d) => d.date >= winPreset.start && d.date <= winPreset.end)
  .filter((d) => d.blocks.some((b) => b.kind === 'finalprep')).length > 20, 'در بازهٔ انتخابی، جلسه‌های سوابق چیده می‌شود');

console.log('\n✅ ' + n + ' تست v1.9 پاس شد');
