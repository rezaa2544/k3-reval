/* تست ۲.۸.۶ — مهلت کتابی برای کتاب‌های عمومی
   پیش از این، فهرست «کتاب» در مهلت‌های کلی فقط دروس اختصاصی را نشان می‌داد؛
   حالا کتاب‌های عمومی (فارسی، دینی، عربی، زبان، سلامت، هویت) هم در فهرست‌اند
   و موتور مهلتشان را واقعاً می‌چیند. */
const assert = require('assert');
const engine = require('../src/planner/engine.js');
const presets = require('../src/planner/presets.js');

const START = '2026-10-29';
const EXAM = '2027-07-02';
const addIso = (s, n) => { const d = new Date(s + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
let n = 0;
const ok = (c, m, x) => { assert.ok(c, m + (x === undefined ? '' : ' → ' + x)); n += 1; console.log('✓ ' + m); };

const general = presets.generalFor('دوازدهم');
const subs = presets.subjectsFor('tajrobi').concat(general);
const base = (extra) => Object.assign({
  student: { name: 'سارا', grade: 'دوازدهم', field: 'tajrobi', chronotype: 'morning' },
  startDate: START, examDate: EXAM,
  availability: { sat: 4, sun: 4, mon: 4, tue: 4, wed: 4, thu: 6, fri: 5 },
  sleep: { bedtime: '23:30', wake: '07:00' },
  blockMinutes: 45, breakMinutes: 10, restDay: 5, weeklyMock: true,
  subjects: subs,
}, extra || {});

/* ۱) عمومی‌ها در ورودی موتور پذیرفته و نرمال می‌شوند */
const genIds = general.map((g) => g.id);
ok(genIds.indexOf('di3') !== -1 && genIds.indexOf('fa3') !== -1, 'کتاب‌های عمومی دوازدهم در فهرست هستند', genIds.join(','));

const cfg = engine._internal.normalizeConfig(base({
  deadlines: { books: [{ subjectId: 'di3', date: addIso(START, 90) }, { subjectId: 'fa3', date: addIso(START, 150) }] },
}));
ok(cfg.subjects.some((s) => s.id === 'di3' && s.general), 'درس عمومی در cfg.subjects هست');
ok(cfg.deadlines.books.length === 2, 'مهلت کتاب‌های عمومی پذیرفته می‌شود', String(cfg.deadlines.books.length));
ok(cfg.deadlines.books.some((b) => b.subjectId === 'di3'), 'مهلت «دین و زندگی ۳» حفظ می‌شود');

/* ۲) برنامه واقعاً آن را می‌چیند */
const plan = engine.createPlan(base({
  deadlines: { books: [{ subjectId: 'di3', date: addIso(START, 70) }] },
}));
const rep = ((plan.summary.coverage || {}).deadlineBooks || []).filter((d) => d.subjectId === 'di3')[0];
ok(!!rep, 'گزارش «مهلت‌های کتابی» یک سطر برای درس عمومی دارد');
ok(rep && rep.subjectName && rep.subjectName.indexOf('دین') !== -1, 'نام کتاب در گزارش درست است', rep && rep.subjectName);
ok(rep && rep.chapters >= 8, 'همهٔ درس‌های کتاب شمرده می‌شود', rep && String(rep.chapters));
ok(rep && rep.plannedMinutes > 0, 'زمان برای کتاب عمومی چیده شده است', rep && String(rep.plannedMinutes));
ok(rep && rep.status === 'met', 'وضعیت مهلت «انجام‌شده» است', rep && rep.status);
const learned = plan.summary.chapterStats.filter((c) => c.subjectId === 'di3' && c.learnedOn)
  .map((c) => new Date(c.learnedOn).getTime()).sort((a, b) => a - b);
const dueTs = new Date(addIso(START, 70) + 'T00:00:00Z').getTime();
ok(learned.length === 10 && learned[learned.length - 1] <= dueTs,
  'آخرین جلسهٔ کتاب عمومی پیش از مهلت است', String(new Date(learned[learned.length - 1]).toISOString().slice(0, 10)));

const blocksDi = [];
const learnDi = [];
(plan.days || []).forEach((d) => (d.blocks || []).forEach((b) => {
  if (!b || b.subjectId !== 'di3') return;
  blocksDi.push(d.date);
  if (b.kind === 'learn' || b.kind === 'warmup') learnDi.push(d.date);
}));
ok(blocksDi.length > 0, 'بلوک‌های مطالعهٔ درس عمومی در برنامه هست', String(blocksDi.length));
ok(learnDi.length >= 10, 'همهٔ ۱۰ درس کتاب جلسهٔ یادگیری گرفتند', String(learnDi.length));
ok(learnDi.every((x) => x <= addIso(START, 70)), 'یادگیری همهٔ درس‌ها پیش از مهلت تمام می‌شود');
ok(blocksDi.some((x) => x > addIso(START, 70)), 'مرور پس از مهلت هم ادامه دارد (طبق قاعدهٔ مرور فاصله‌دار)');

/* ۳) مهلت کتاب عمومیِ ناموجود حذف می‌شود، نه اینکه برنامه را بشکند */
const bad = engine._internal.normalizeConfig(base({
  deadlines: { books: [{ subjectId: 'zz9', date: addIso(START, 40) }] },
}));
ok(bad.deadlines.books.length === 0, 'مهلت کتاب ناشناس نادیده گرفته می‌شود');

/* ۴) پیشنهاد مهلت، برای عمومی‌ها اردیبهشت می‌گذارد */
const sug = presets.suggestedBookDeadlines(subs);
const genSug = sug.filter((x) => x.subjectId === 'di3')[0];
ok(!!genSug && genSug.date.slice(5) === '04-20', 'مهلت پیشنهادی کتاب عمومی پایان اردیبهشت است', genSug && genSug.date);
ok(sug.length === subs.length, 'برای همهٔ کتاب‌ها (اختصاصی + عمومی) پیشنهاد ساخته می‌شود', String(sug.length));

console.log(`\n✅ ${n} تست مهلت کتاب‌های عمومی پاس شد\n`);
