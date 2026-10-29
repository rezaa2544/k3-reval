/* تست‌های «دو مدل مهلت» — ۱.۹.۰
   مدل الف: مهلت کتابی (کل کتاب تا تاریخ مشخص خوانده و تثبیت شود)
   مدل ب: مهلت بازه‌های کوتاه (آزمون تک‌درس با فصل مشخص + آزمون جامع) */
const assert = require('assert');
const engine = require('../src/planner/engine.js');
const presets = require('../src/planner/presets.js');
const J = require('../src/planner/jalali.js');

const START = '2026-10-29';
const EXAM = '2027-07-02';
const addIso = (s, n) => {
  const d = new Date(s + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

let n = 0;
const ok = (cond, msg) => { assert.ok(cond, msg); n += 1; console.log('✓ ' + msg); };

const base = (extra) => Object.assign({
  student: { name: 'سارا', grade: 'دوازدهم', field: 'tajrobi', chronotype: 'morning' },
  startDate: START,
  examDate: EXAM,
  availability: { sat: 4, sun: 4, mon: 4, tue: 4, wed: 4, thu: 6, fri: 5 },
  sleep: { bedtime: '23:30', wake: '07:00' },
  blockMinutes: 45, breakMinutes: 10, restDay: 5, weeklyMock: true,
  subjects: presets.subjectsFor('tajrobi'),
}, extra || {});

/* ═══════ ۱) نرمال‌سازی ورودی‌ها ═══════ */
const cfgRaw = base({
  deadlines: {
    books: [
      { subjectId: 'bio', date: '2027-03-20' },
      { subjectId: 'math', date: '2027-04-20', chaptersTo: 12 },
      { subjectId: 'نامعتبر', date: '2027-04-20' },
    ],
    exams: [
      { title: 'آزمون فصل ۱ زیست', kind: 'single', subjectId: 'bio', from: 1, to: 1, date: '2026-12-03' },
      { title: 'جامع دی', kind: 'comprehensive', date: '2027-01-08' },
      { title: 'بدون درس', kind: 'single', date: '2027-02-01' },
    ],
  },
});
const cfg = engine._internal.normalizeConfig(cfgRaw);
ok(cfg.deadlines.books.length === 2, 'مهلت کتابی نامعتبر حذف می‌شود (' + cfg.deadlines.books.length + ')');
ok(cfg.deadlines.exams.length === 2, 'آزمون تک‌درس بدون درس حذف می‌شود (' + cfg.deadlines.exams.length + ')');
ok(cfg.deadlines.books[0].date < cfg.deadlines.books[1].date, 'مهلت‌ها بر اساس تاریخ مرتب می‌شوند');
ok(cfg.deadlines.books[1].chaptersTo === 12, 'سقف فصلِ مهلت کتابی حفظ می‌شود');

/* ═══════ ۲) مهلت کتابی در برنامه لحاظ می‌شود ═══════ */
const tight = engine.createPlan(base({
  deadlines: {
    books: [
      { subjectId: 'bio', date: addIso(START, 60) },     // مهلت تنگ
      { subjectId: 'chem', date: addIso(START, 200) },   // مهلت گشاد
    ],
  },
}));
const chBio = tight.summary.chapterStats.filter((c) => c.subjectId === 'bio');
const chChem = tight.summary.chapterStats.filter((c) => c.subjectId === 'chem');
ok(chBio.every((c) => c.deadlineTitle === 'پایان زیست‌شناسی'), 'مهلت کتابی روی همهٔ فصل‌های همان کتاب می‌نشیند');
ok(chChem.every((c) => c.deadlineTitle === 'پایان شیمی'), 'هر کتاب مهلت خودش را دارد');
const bioCoveredEarly = chBio.filter((c) => c.covered).length;
const chemCovered = chChem.filter((c) => c.covered).length;
ok(bioCoveredEarly >= Math.ceil(chBio.length * 0.6),
  'کتاب با مهلت نزدیک‌تر زودتر پوشش می‌گیرد (زیست ' + bioCoveredEarly + '/' + chBio.length + ')');
const dRep = tight.summary.coverage.deadlines;
const bioD = dRep.find((d) => d.subjectId === 'bio');
/* شاهد: همان برنامه بدون هیچ مهلتی — زیست باید با مهلت جلوتر تمام شود */
const free = engine.createPlan(base());
const lastDone = (pl, sid) => {
  const dates = pl.summary.chapterStats.filter((c) => c.subjectId === sid)
    .map((c) => c.completedOn).filter(Boolean).sort();
  return dates.length ? dates[dates.length - 1] : null;
};
const freeFinish = lastDone(free, 'bio');
ok(!!bioD.finishDate, 'تاریخ اتمام واقعی کتاب گزارش می‌شود (' + bioD.finishDate + ')');
ok(!!freeFinish, 'برنامهٔ شاهد (بدون مهلت) تاریخ اتمام زیست را می‌دهد (' + freeFinish + ')');
ok(bioD.finishDate < freeFinish,
  'با مهلت، کتاب زودتر تمام می‌شود (' + bioD.finishDate + ' < ' + freeFinish + ')');
ok(free.summary.coverage.deadlines.length === 0, 'برنامهٔ بدون مهلت، ردیف مهلت ندارد');

/* فصل‌های مهلت‌دار جلوتر از فصل‌های بی‌مهلت در برنامه می‌آیند */
const firstBioDay = tight.days.findIndex((d) => d.blocks.some((b) => b.subjectId === 'bio'));
const firstGeoDay = tight.days.findIndex((d) => d.blocks.some((b) => b.subjectId === 'geo'));
ok(firstBioDay <= firstGeoDay, 'درس دارای مهلت جلوتر شروع می‌شود (زیست روز ' + firstBioDay + '، زمین روز ' + firstGeoDay + ')');

/* ═══════ ۳) گزارش مهلت‌ها ═══════ */
const rep = tight.summary.coverage.deadlines;
ok(rep.length === 2, 'گزارش مهلت‌ها دو ردیف دارد');
const b0 = rep[0];
['title', 'date', 'status', 'needMinutes', 'plannedMinutes', 'remainingMinutes', 'daysToDeadline']
  .forEach((k) => ok(b0[k] !== undefined, 'گزارش مهلت فیلد «' + k + '» را دارد'));
ok(['met', 'ontrack', 'late', 'late-done'].indexOf(b0.status) !== -1,
  'وضعیت مهلت یکی از حالت‌های معتبر است (' + b0.status + ')');
ok(J.fmt(b0.date).indexOf('۱۴۰۵') === 0 || J.fmt(b0.date).indexOf('۱۴۰۶') === 0,
  'تاریخ مهلت به شمسی نمایش داده می‌شود (' + J.fmt(b0.date) + ')');

/* ═══════ ۴) مهلتِ غیرممکن، صادقانه اعلام می‌شود ═══════ */
const impossible = engine.createPlan(base({
  examDate: addIso(START, 45),
  deadlines: {
    books: [{ subjectId: 'bio', date: addIso(START, 8) }],
    exams: [{ title: 'جامع زود', kind: 'comprehensive', date: addIso(START, 9) }],
  },
}));
const imp = impossible.summary.coverage.deadlines.find((d) => d.subjectId === 'bio');
ok(imp.status === 'late' || imp.status === 'late-done',
  'مهلت غیرممکن «دیر» علامت می‌خورد (' + imp.status + ')');
ok(impossible.summary.warnings.some((w) => w.indexOf('مهلت') !== -1),
  'برای مهلت غیرممکن هشدار صریح ساخته می‌شود');
ok(imp.status === 'late' ? imp.needPerDay > 0 : Boolean(imp.finishDate && imp.finishDate > imp.date),
  'برای مهلت دیرشده، «دقیقهٔ لازم در روز» یا تاریخ اتمام واقعی گزارش می‌شود');

/* ═══════ ۵) آزمون تک‌درس: بلوک آماده‌سازی قبل از تاریخ ═══════ */
const examDate = addIso(START, 40);
const single = engine.createPlan(base({
  deadlines: { exams: [{ title: 'آزمون فصل ۲ زیست', kind: 'single', subjectId: 'bio', from: 2, to: 2, date: examDate }] },
}));
const prep = single.days.flatMap((d) => d.blocks.filter((b) => b.kind === 'deadlinecheck')
  .map((b) => ({ date: d.date, subjectId: b.subjectId, topic: b.topic })));
ok(prep.length > 0, 'بلوک آماده‌سازی مهلت چیده شد (' + prep.length + ' بلوک)');
ok(prep.every((p) => p.subjectId === 'bio'), 'آماده‌سازی تک‌درس فقط از همان درس است');
ok(prep.every((p) => p.date <= examDate), 'بلوک‌های آماده‌سازی قبل از تاریخ آزمون‌اند');
const twoDaysBefore = prep.filter((p) => p.date >= addIso(examDate, -2));
ok(twoDaysBefore.length > 0, 'آماده‌سازی در دو روز آخر قبل از آزمون هم هست');
ok(prep.every((p) => p.topic.indexOf('آزمون فصل ۲ زیست') !== -1), 'برچسب بلوک، نام آزمون را نشان می‌دهد');

/* ═══════ ۶) آزمون جامع: آماده‌سازی از چند درس ═══════ */
const comp = engine.createPlan(base({
  deadlines: { exams: [{ title: 'جامع آذر', kind: 'comprehensive', date: addIso(START, 45) }] },
}));
const compPrep = comp.days.flatMap((d) => d.blocks.filter((b) => b.kind === 'deadlinecheck'));
ok(compPrep.length > 0, 'آماده‌سازی آزمون جامع چیده شد (' + compPrep.length + ')');
const compSubjects = new Set(compPrep.map((b) => b.subjectId));
ok(compSubjects.size >= 2, 'آزمون جامع از بیش از یک درس آماده‌سازی می‌گیرد (' + compSubjects.size + ')');
ok(compPrep.every((b) => b.topic.indexOf('جامع آذر') !== -1), 'برچسب آماده‌سازی جامع درست است');

/* ═══════ ۷) هر دو مدل با هم ═══════ */
const both = engine.createPlan(base({
  finals: { enabled: true, courses: presets.finalsFor('tajrobi', 'دوازدهم') },
  deadlines: {
    books: [{ subjectId: 'bio', date: addIso(START, 120) }, { subjectId: 'math', date: addIso(START, 150) }],
    exams: [
      { title: 'تک‌درس شیمی ۱', kind: 'single', subjectId: 'chem', from: 1, to: 2, date: addIso(START, 30) },
      { title: 'جامع اسفند', kind: 'comprehensive', date: addIso(START, 130) },
    ],
  },
}));
const cov = both.summary.coverage;
ok(cov.deadlineBooks.length === 2 && cov.deadlineExams.length === 2, 'هر دو مدل مهلت در گزارش جدا آمده‌اند');
ok(cov.deadlines.every((d, i, arr) => i === 0 || arr[i - 1].date <= d.date), 'گزارش مهلت‌ها بر اساس تاریخ مرتب است');
ok(cov.finalsCount === 10 && cov.deadlines.length === 4, 'لایهٔ سوابق و لایهٔ مهلت‌ها با هم کار می‌کنند');
ok(both.days.every((d) => d.studyMinutes <= 8 * 60), 'هیچ روزی بیش از ۸ ساعت نمی‌شود');
ok(both.days.every((d) => d.studyMinutes === d.plannedMinutes), 'آمار روز با بلوک‌هایش هم‌خوان است');

/* ═══════ ۸) قطعی‌بودن (deterministic) ═══════ */
const again = engine.createPlan(base({
  deadlines: { books: [{ subjectId: 'bio', date: addIso(START, 120) }] },
}));
const again2 = engine.createPlan(base({
  deadlines: { books: [{ subjectId: 'bio', date: addIso(START, 120) }] },
}));
ok(again.summary.coverage.deadlines[0].plannedMinutes === again2.summary.coverage.deadlines[0].plannedMinutes,
  'خروجی مهلت‌ها تکرارپذیر است');

/* ═══════ ۹) بدون مهلت: هیچ‌چیز خراب نمی‌شود ═══════ */
const none = engine.createPlan(base());
ok(Array.isArray(none.summary.coverage.deadlines) && none.summary.coverage.deadlines.length === 0,
  'برنامهٔ بدون مهلت، گزارش مهلت خالی دارد');

console.log('\n✅ ' + n + ' تست مهلت‌ها پاس شد');
