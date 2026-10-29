/**
 * تست‌های نسخهٔ ۲.۱ — آزمون‌های دوره‌ای، ظرفیت تست استاندارد، هشدار ساعت لازم، پوشش همهٔ سوابق
 * ---------------------------------------------------------------------------------------------
 * هر تست یک شکاف واقعی را قفل می‌کند تا دوباره برنگردد.
 */
const assert = require('assert');
const engine = require('../src/planner/engine.js');
const presets = require('../src/planner/presets.js');
const J = require('../src/planner/jalali.js');

let passed = 0;
const ok = (cond, msg) => { assert.ok(cond, msg); passed += 1; };

const SUBJECTS = presets.subjectsFor('tajrobi');
const GENERAL = presets.generalFor(['دوازدهم']);

function base(extra) {
  return Object.assign({
    student: { name: 'تست', grade: 'فارغ‌التحصیل', field: 'tajrobi' },
    startDate: '2026-10-29',
    examDate: '2027-07-02',
    availability: { sat: 8, sun: 8, mon: 8, tue: 8, wed: 8, thu: 8, fri: 6 },
    blockMinutes: 45,
    restDay: 6,
    weeklyMock: true,
    subjects: SUBJECTS,
  }, extra || {});
}

/* ═══════════ ۱) آزمون‌های دوره‌ای ═══════════ */

/* ۱.۱ روز هفته و تکرار دو‌هفته‌ای */
const twoWeek = engine.createPlan(base({
  weeklyMocks: [
    { title: 'زیستاز', day: 'پنجشنبه', everyNWeeks: 2, minutes: 180, start: '08:00', subjectIds: ['bio'] },
    { title: 'آلفا', day: 'پنجشنبه', everyNWeeks: 2, minutes: 120, start: '08:00', subjectIds: [] },
  ],
}));
const thursdays = twoWeek.days.filter((d) => d.weekday === 'پنجشنبه');
const thursdayMocks = thursdays.filter((d) => (d.mocks || []).length);
ok(thursdayMocks.length > 0, 'آزمون دوره‌ای روی پنجشنبه‌ها چیده نشد');
ok(thursdayMocks.length < thursdays.length,
  'تکرار «هر ۲ هفته» رعایت نشد: ' + thursdayMocks.length + ' از ' + thursdays.length);

/* فاصلهٔ بین دو آزمونِ متوالی باید ۱۴ روز باشد */
const mockDates = thursdayMocks.map((d) => d.date);
ok(mockDates[1] && (new Date(mockDates[1]) - new Date(mockDates[0])) / 86400000 === 14,
  'فاصلهٔ آزمون‌های دو‌هفته‌ای ۱۴ روز نیست');

/* ۱.۲ دو آزمون در یک روز، هر دو با ساعت ثابت و بدون هم‌پوشانی */
const firstMockDay = thursdayMocks[0];
const mockBlocks = firstMockDay.blocks.filter((b) => b.kind === 'mock');
ok(mockBlocks.length === 2, 'دو آزمون در یک روز چیده نشد (' + mockBlocks.length + ')');
ok(mockBlocks[0].subjectName === 'زیستاز' && mockBlocks[1].subjectName === 'آلفا',
  'ترتیب/عنوان آزمون‌ها درست نیست');
const toMin = (hm) => Number(hm.split(':')[0]) * 60 + Number(hm.split(':')[1]);
ok(toMin(mockBlocks[1].start) >= toMin(mockBlocks[0].end),
  'آزمون دوم روی آزمون اول افتاده است (' + mockBlocks[0].end + ' ↔ ' + mockBlocks[1].start + ')');
ok(mockBlocks[0].start === '08:00', 'ساعت شروع ثابتِ آزمون رعایت نشد (' + mockBlocks[0].start + ')');

/* ۱.۳ بلوک تحلیل آزمون بلافاصله بعد از آزمون‌ها */
ok(firstMockDay.blocks.some((b) => b.kind === 'analysis'), 'بلوک تحلیل آزمون ساخته نشد');

/* ۱.۴ روز دیگر هفته هم قابل انتخاب است */
const monday = engine.createPlan(base({
  weeklyMocks: [{ title: 'آزمون دوشنبه', day: 'دوشنبه', everyNWeeks: 1, minutes: 90 }],
}));
const mon = monday.days.filter((d) => d.weekday === 'دوشنبه' && (d.mocks || []).length);
ok(mon.length >= 4, 'آزمون هفتگی دوشنبه چیده نشد (' + mon.length + ')');
ok(monday.days.filter((d) => d.weekday === 'پنجشنبه' && (d.mocks || []).length).length === 0,
  'آزمون روی روز اشتباه هم چیده شد');

/* ۱.۵ هر هفته = هر ۷ روز */
const weekly = engine.createPlan(base({
  weeklyMocks: [{ title: 'هفتگی', day: 5, everyNWeeks: 1, minutes: 60 }],
}));
const weeklyDays = weekly.days.filter((d) => (d.mocks || []).length);
const gaps = weeklyDays.slice(1).map((d, i) => (new Date(d.date) - new Date(weeklyDays[i].date)) / 86400000);
ok(gaps.length > 5 && gaps.every((g) => g === 7), 'آزمون هفتگی هر ۷ روز نیست');

/* ۱.۶ غیرفعال‌کردن = هیچ آزمون دوره‌ای */
const off = engine.createPlan(base({ weeklyMock: false, weeklyMocks: [] }));
ok(off.days.every((d) => (d.mocks || []).length === 0), 'با weeklyMock=false هنوز آزمون چیده می‌شود');

/* ۱.۷ دامنهٔ دروس در برچسب آزمون */
ok(firstMockDay.blocks.filter((b) => b.kind === 'mock')[0].topic.indexOf('زیست') !== -1,
  'درسِ آزمون در برچسب نمی‌آید');

/* ۱.۸ روز آزمون با آرایش ثابت، از ساعت اعلامی روز بیشتر نشود */
const heavyDay = engine.createPlan(base({
  weeklyMocks: [{ title: 'سنگین', day: 5, everyNWeeks: 1, minutes: 300, start: '08:00' }],
}));
const maxMinutes = Math.max.apply(null, heavyDay.days.map((d) => d.studyMinutes));
ok(maxMinutes <= 8 * 60 + 30, 'روز آزمون از سقف ساعت اعلامی رد شده: ' + Math.round(maxMinutes));

/* ═══════════ ۲) ظرفیت تست و استاندارد ═══════════ */

const school = engine.createPlan(base({
  availability: { sat: 4, sun: 4, mon: 4, tue: 4, wed: 4, thu: 6, fri: 5 },
  restDay: 5,
}));
const back = engine.createPlan(base({}));
const heavy = engine.createPlan(base({ availability: { sat: 12, sun: 12, mon: 12, tue: 12, wed: 12, thu: 12, fri: 8 } }));

ok(back.summary.coverage.testTargetDaily > school.summary.coverage.testTargetDaily,
  'هدف تست با ساعت اعلامی بالا نمی‌رود');
ok(heavy.summary.coverage.testTargetDaily >= back.summary.coverage.testTargetDaily,
  'هدف تست با ساعت ۱۲ ساعته بزرگ‌تر نمی‌شود');
ok(back.summary.coverage.testsPerDay > school.summary.coverage.testsPerDay,
  'تست روزانه با ساعت بیشتر افزایش نمی‌یابد');
ok(school.summary.coverage.testsNeedTotal > 0, 'مجموع نیاز تست محاسبه نشده');
ok(back.summary.coverage.testsPlanned > school.summary.coverage.testsPlanned,
  'تست چیده‌شده با ساعت بیشتر افزایش نمی‌یابد');

/* هر درس باید ردیف ظرفیت تست داشته باشد */
const bySub = back.summary.coverage.testsBySubject;
ok(bySub.length === SUBJECTS.length, 'ردیف ظرفیت تست برای همهٔ درس‌ها نیست');
ok(bySub.every((t) => t.need > 0), 'نیاز تست بعضی درس‌ها صفر است');
ok(bySub.find((t) => t.subjectId === 'math').need >= 2000,
  'نیاز تست ریاضی غیرواقعی است: ' + bySub.find((t) => t.subjectId === 'math').need);

/* ظرفیت تست: لازم/ممکن/پوشش */
const adv = school.summary.coverage.capacityAdvisory;
ok(adv && adv.requiredDailyTests > 0 && adv.feasibleDailyTests > 0, 'فیلدهای ظرفیت تست ناقص است');
ok(adv.declaredDailyHours > 0 && adv.minDailyHoursNeeded > 0, 'ساعت اعلامی/لازم در خروجی نیست');

/* هشدار ساعت لازم: با ۴ ساعت باید هشدار بدهد، با ۱۲ ساعت نباید «کمبود» بدهد */
const warnsOf = (pl, needle) => pl.summary.warnings.filter((w) => w.indexOf(needle) !== -1);
ok(warnsOf(school, 'حداقل').length > 0 || school.summary.coverage.coverageRatio >= 98,
  'برای ساعت کم، هشدار «حداقل ساعت لازم» داده نشد');
ok(heavy.summary.coverage.coverageRatio >= 90,
  'با ۱۲ ساعت مطالعه، پوشش بالای ۹۰٪ نمی‌شود: ' + heavy.summary.coverage.coverageRatio);

/* هشدارها با اعداد واقعی می‌آیند، نه جملهٔ کلی */
const capWarn = school.summary.warnings.find((w) => w.indexOf('حداقل') !== -1);
if (capWarn) {
  ok(/\d|۰|۱|۲|۳|۴|۵|۶|۷|۸|۹/.test(capWarn), 'هشدار ساعت، عدد ندارد');
  ok(capWarn.indexOf('ساعت') !== -1, 'هشدار ساعت، واحد ساعت ندارد');
}

/* ═══════════ ۳) سوابق: همهٔ درس‌ها در بازهٔ نهایی ═══════════ */
const finWindow = presets.defaultFinalsWindow();
const tenCourses = presets.finalsFor('tajrobi', 'دوازدهم')
  .map((c) => Object.assign({}, c, { current: 14, target: 18, inProgram: true }));

function finalsSessions(plan, win) {
  const seen = {};
  plan.days.filter((d) => d.date >= win.start && d.date <= win.end).forEach((d) => {
    d.blocks.filter((b) => b.kind === 'finalprep').forEach((b) => {
      seen[b.subjectName] = (seen[b.subjectName] || 0) + 1;
    });
  });
  return seen;
}

const withFinals = engine.createPlan(base({
  subjects: SUBJECTS.concat(GENERAL),
  availability: { sat: 4, sun: 4, mon: 4, tue: 4, wed: 4, thu: 6, fri: 5 },
  restDay: 5,
  finals: { enabled: true, courses: tenCourses, window: finWindow, spread: true, spreadMinutes: 45 },
}));
const seenAll = Object.keys(finalsSessions(withFinals, finWindow));
ok(seenAll.length === tenCourses.length,
  'در بازهٔ خرداد فقط ' + seenAll.length + ' از ' + tenCourses.length + ' درس جلسه گرفت');
ok(seenAll.every((n) => finalsSessions(withFinals, finWindow)[n] >= 2),
  'بعضی درس‌ها فقط یک جلسه در بازهٔ نهایی دارند');

/* پنجرهٔ کوتاه‌تر هم نباید درسی را جا بیندازد */
const shortWin = { start: '2027-06-01', end: '2027-06-26' };
const shortFinals = engine.createPlan(base({
  subjects: SUBJECTS.concat(GENERAL),
  availability: { sat: 4, sun: 4, mon: 4, tue: 4, wed: 4, thu: 6, fri: 5 },
  restDay: 5,
  finals: { enabled: true, courses: tenCourses, window: shortWin, spread: true, spreadMinutes: 45 },
}));
ok(Object.keys(finalsSessions(shortFinals, shortWin)).length === tenCourses.length,
  'در پنجرهٔ کوتاه، همهٔ درس‌ها جلسه نگرفتند');

/* ═══════════ ۴) تاریخ کنکور قابل تغییر است ═══════════ */
const early = engine.createPlan(base({ examDate: '2027-06-25' }));
ok(early.days[early.days.length - 1].date === '2027-06-25', 'تاریخ پایان با تاریخ آزمون هماهنگ نیست');
ok(early.days.length < back.days.length, 'با تاریخ زودتر، تعداد روزها کم نمی‌شود');
ok(J.fmt('2027-07-02').indexOf('۱۴۰۶') === 0, 'تاریخ شمسی کنکور درست تبدیل نمی‌شود (' + J.fmt('2027-07-02') + ')');

/* ═══════════ ۵) قطعی‌بودن و سازگاری عقب‌رو ═══════════ */
const a1 = engine.createPlan(base({}));
const a2 = engine.createPlan(base({}));
ok(a1.summary.coverage.coverageRatio === a2.summary.coverage.coverageRatio,
  'برنامهٔ یکسان، خروجی یکسان نمی‌دهد');
ok(a1.summary.coverage.testTargetDaily === a2.summary.coverage.testTargetDaily, 'هدف تست ناپایدار است');

/* بدون weeklyMocks (مثل نسخهٔ ۲.۰) باید یک آزمون هفتگی ساده بسازد */
const legacy = engine.createPlan(base({}));
ok(legacy.days.filter((d) => (d.mocks || []).length).length > 5, 'سازگاری عقب‌رو با weeklyMock ساده شکست');

/* ═══════════ ۶) شبیه‌سازی ساعت‌های مختلف: هیچ‌وقت برنامهٔ خالی/سرریز ═══════════ */
[2, 4, 6, 8, 10, 12].forEach((h) => {
  const pl = engine.createPlan(base({
    availability: { sat: h, sun: h, mon: h, tue: h, wed: h, thu: h, fri: Math.max(2, h - 2) },
    restDay: 6,
  }));
  const cap = pl.summary.coverage.capacityMinutes;
  ok(pl.summary.totalMinutes <= cap + 60,
    'ساعت ' + h + ': برنامه از ظرفیت رد شده (' + pl.summary.totalMinutes + ' > ' + cap + ')');
  ok(pl.summary.totalMinutes > 0, 'ساعت ' + h + ': برنامه خالی است');
  ok(pl.summary.coverage.coverageRatio >= 0, 'ساعت ' + h + ': پوشش منفی');
});

console.log('✅ ' + passed + ' تست ظرفیت/آزمون‌دوره‌ای/سوابق پاس شد');
