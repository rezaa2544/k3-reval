const assert = require('assert');
const engine = require('../src/planner/engine.js');
const presets = require('../src/planner/presets.js');

const now = new Date();
const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
const pad = (n) => String(n).padStart(2, '0');
const iso = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const exam = new Date(start); exam.setDate(exam.getDate() + 120);
const exam2 = new Date(start); exam2.setDate(exam2.getDate() + 20);
const exam3 = new Date(start); exam3.setDate(exam3.getDate() + 34);

const config = {
  student: { name: 'آرمان', grade: 'دوازدهم', field: 'tajrobi', chronotype: 'morning' },
  startDate: iso(start),
  examDate: iso(exam),
  sleep: { bedtime: '23:30', wake: '07:00' },
  availability: { sat: 4, sun: 4, mon: 4, tue: 4, wed: 4, thu: 6, fri: 5 },
  startTimes: { sat: '16:00', sun: '16:00', mon: '16:00', tue: '16:00', wed: '16:00', thu: '09:00', fri: '09:00' },
  blockMinutes: 45, breakMinutes: 10, restDay: 5, weeklyMock: true,
  classes: [
    { title: 'کلاس زیست', subjectId: 'bio', weekdays: [1, 3], start: '18:00', end: '20:00' },   // یکشنبه/سه‌شنبه
    { title: 'کلاس شیمی', subjectId: 'chem', weekdays: [2], start: '17:00', end: '19:00' },      // دوشنبه
    { title: 'کلاس ریاضی', subjectId: 'math', weekdays: [0], start: '09:00', end: '11:30' },     // شنبه
  ],
  exams: [
    { title: 'آزمون قلم‌چی ۱', date: iso(exam2), start: '08:00', end: '11:30', subjectIds: ['bio', 'chem', 'math'] },
    { title: 'آزمون قلم‌چی ۲', date: iso(exam3), start: '08:00', end: '11:30', subjectIds: ['bio', 'phys'] },
  ],
  subjects: presets.subjectsFor('tajrobi'),
};

const plan = engine.createPlan(config);
const days = plan.days;
console.log('days:', days.length, '| hours:', plan.summary.totalHours, '| classFix:', plan.summary.classFixBlocks, '| exams:', plan.summary.examDays);

/* ۱) هیچ بلوک مطالعاتی روی کلاس‌ها/آزمون‌ها نیفتد */
const overlaps = [];
days.forEach((d) => {
  const busy = d.events.map((e) => ({ s: toMin(e.start), e: toMin(e.end), title: e.title }));
  d.blocks.filter((b) => b.kind !== 'exam').forEach((b) => {
    busy.forEach((x) => {
      if (toMin(b.start) < x.e && toMin(b.end) > x.s) overlaps.push(`${d.date} ${b.start}-${b.end} ↔ ${x.title}`);
    });
  });
});
function toMin(hm) { const [h, m] = hm.split(':').map(Number); return h * 60 + m; }
assert.strictEqual(overlaps.length, 0, 'تداخل با کلاس/آزمون: ' + overlaps.slice(0, 3).join(' | '));

/* ۲) مرز خواب رعایت شود */
let guardViolations = 0;
days.forEach((d) => d.blocks.forEach((b) => { if (toMin(b.end) > 23 * 60 + 30 - 45) guardViolations++; }));
assert.strictEqual(guardViolations, 0, 'بلوک نزدیک خواب');

/* ۳) حداکثر ۲ بلوک متوالی از یک درس — در یک «جلسهٔ پیوسته»
   (وقفهٔ کلاس/آزمون یا استراحت بلند، توالی را می‌شکند) */
let consec = 0;
const gapBreaks = (d, a, b) => {
  const between = d.events.some((e) => toMin(e.start) >= toMin(a.end) && toMin(e.end) <= toMin(b.start));
  return between || (toMin(b.start) - toMin(a.end)) > 25;
};
/* قاعده: بیش از ۲ بلوک هم‌درس پشت‌سرهم مجاز نیست، مگر اینکه در آن جلسه
   دیگر هیچ درس دیگری برای چیدن باقی نمانده باشد (تمام بلوک‌های بعدیِ همان جلسه، همان درس باشند). */
days.forEach((d) => {
  const bl = d.blocks.filter((b) => b.kind !== 'exam' && ['MOCK', 'EXAM', 'CLASS', 'ALL'].indexOf(b.subjectId) === -1);
  let run = 1;
  let startIdx = 0;
  const runs = [];
  for (let i = 1; i <= bl.length; i++) {
    const same = i < bl.length && !gapBreaks(d, bl[i - 1], bl[i]) && bl[i].subjectId === bl[i - 1].subjectId;
    if (same) { run++; continue; }
    runs.push({ from: startIdx, to: i - 1, subject: bl[startIdx].subjectId, len: run });
    startIdx = i; run = 1;
  }
  runs.forEach((r, idx) => {
    if (r.len <= 2) return;
    const isLastRun = idx === runs.length - 1;
    if (!isLastRun) consec++;
  });
});
assert.strictEqual(consec, 0, 'سه بلوک متوالی از یک درس');

/* ۴) روز آزمون: رویداد آزمون ثبت شده و بلوک تحلیل دارد */
const examDay = days.find((d) => d.date === iso(exam2));
assert.ok(examDay && examDay.events.some((e) => e.type === 'exam'), 'رویداد آزمون ثبت نشد');
assert.ok(examDay.blocks.some((b) => b.kind === 'analysis'), 'بلوک تحلیل بعد از آزمون نیست');

/* ۵) روزهای پیش‌آزمون: بدون یادگیری جدید */
const preDays = [1, 2, 3].map((n) => { const d = new Date(exam2); d.setDate(d.getDate() - n); return iso(d); });
let learnInPre = 0;
preDays.forEach((ds) => {
  const d = days.find((x) => x.date === ds);
  if (!d) return;
  // فقط روزهای سطح ۱/۲ (۱ تا ۳ روز مانده). روز ۳ = سطح ۱
  if (d.note && /پیش‌آزمون|مرور نهایی/.test(d.note)) {
    learnInPre += d.blocks.filter((b) => b.kind === 'learn').length;
  }
});
assert.strictEqual(learnInPre, 0, 'در روزهای پیش‌آزمون یادگیری جدید وجود دارد');

/* ۶) بلوک تثبیت کلاس برای روزهای کلاس */
const classSunday = days.find((d) => d.weekday === 'یکشنبه' && d.events.some((e) => e.type === 'class'));
assert.ok(classSunday.blocks.some((b) => b.kind === 'classfix'), 'بلوک تثبیت کلاس نیست');
console.log('classFix total:', plan.summary.classFixBlocks, '| pre-exam days:', plan.summary.preExamDays);

/* ۷) توزیع وزنی درس‌ها */
const byName = Object.fromEntries(plan.summary.bySubject.map((s) => [s.name, s.hours]));
console.log('hours by subject:', byName);
assert.ok(byName['زیست‌شناسی'] > byName['شیمی'], 'زیست باید بیش از شیمی باشد');

/* ۸) خروجی‌ها */
assert.ok(engine.toMarkdown(plan).includes('# برنامهٔ مطالعه'));
assert.ok(engine.toCSV(plan).split('\r\n').length > 60);
const ics = engine.toICS(plan);
assert.ok(ics.includes('BEGIN:VCALENDAR'));
const tasks = engine.toTaskList(plan, days[2].date);
assert.ok(tasks.length > 0, 'tasklist خالی');

/* ۹) کارایی روی ۳۶۵ روز */
const longExam = new Date(start); longExam.setDate(longExam.getDate() + 365);
const t0 = Date.now();
const big = engine.createPlan(Object.assign({}, config, { examDate: iso(longExam) }));
const ms = Date.now() - t0;
assert.ok(ms < 6000, 'کندی: ' + ms + 'ms');
console.log('365-day plan:', ms, 'ms | hours:', big.summary.totalHours);

/* ۱۰) بدون کلاس/آزمون هم کار کند (سازگاری) */
const plain = engine.createPlan(Object.assign({}, config, { classes: [], exams: [] }));
assert.ok(plain.summary.totalHours > 100 && plain.summary.classFixBlocks === 0);
console.log('plain plan hours:', plain.summary.totalHours, '| weekly mock days:', plain.days.filter((d) => d.isMockDay).length);

/* ۱۱) دروس عمومی: باید در برنامهٔ روزانه سهم و بلوک واقعی داشته باشند */
const presetsMod = require('../src/planner/presets.js');
presetsMod.GENERAL['دهم'].concat(presetsMod.GENERAL['دوازدهم']).forEach((g) => {
  assert.ok(g.chapters >= 4, 'تعداد فصل/درس عمومی نامعتبر: ' + g.name);
  assert.ok(g.general === true, 'پرچم general ندارد: ' + g.name);
});
assert.deepStrictEqual(presetsMod.generalFor('دوازدهم').map((x) => x.id), ['fa3', 'ar3', 'di3', 'en3']);
assert.deepStrictEqual(presetsMod.generalFor('دهم').map((x) => x.chapters), [8, 8, 12, 4]);
assert.deepStrictEqual(presetsMod.generalFor('یازدهم').map((x) => x.chapters), [8, 7, 12, 4]);

const genCfg = Object.assign({}, config, {
  subjects: presetsMod.subjectsFor('tajrobi').concat(presetsMod.generalFor('دوازدهم')),
});
const genPlan = engine.createPlan(genCfg);
const genNames = presetsMod.generalFor('دوازدهم').map((x) => x.name);
const genMinutes = {};
genPlan.days.forEach((d) => d.blocks.forEach((b) => {
  if (genNames.indexOf(b.subjectName) !== -1) genMinutes[b.subjectName] = (genMinutes[b.subjectName] || 0) + b.minutes;
}));
genNames.forEach((n) => {
  assert.ok((genMinutes[n] || 0) >= 90, 'درس عمومی بلوک کافی نگرفت: ' + n + ' = ' + (genMinutes[n] || 0) + ' دقیقه');
});
/* نام فصل‌های فارسی از کتاب درسی می‌آید، نه «فصل ۱» */
const faBlock = genPlan.days.flatMap((d) => d.blocks).find((b) => b.subjectName === 'فارسی ۳');
assert.ok(faBlock && faBlock.topic !== 'فصل ۱', 'نام فصل فارسی از عنوان کتاب نیامد: ' + (faBlock && faBlock.topic));
/* روزی باید هم اختصاصی و هم عمومی داشته باشد */
const mixed = genPlan.days.find((d) => {
  const names = d.blocks.map((b) => b.subjectName);
  return names.some((n) => genNames.indexOf(n) !== -1) && names.some((n) => genNames.indexOf(n) === -1);
});
assert.ok(mixed, 'هیچ روزی ترکیب اختصاصی + عمومی ندارد');
assert.ok(genPlan.summary.learnedTopics >= genCfg.subjects.reduce((a, s) => a + s.chapters, 0) * 0.9,
  'مباحث کافی پوشش داده نشد: ' + genPlan.summary.learnedTopics);
console.log('عمومی — دقیقه به‌ازای هر درس:', genMinutes, '| مباحث پوشش‌داده‌شده:', genPlan.summary.learnedTopics);

console.log('\n✅ همه تست‌های موتور v2 پاس شدند');
const smp = days.find((d) => d.events.length && d.blocks.length);
console.log('\nنمونه روز —', smp.weekday, smp.date);
smp.events.forEach((e) => console.log('  📌', e.start + '-' + e.end, e.type === 'exam' ? 'آزمون' : 'کلاس', e.title));
smp.blocks.forEach((b) => console.log(`  ${b.start}-${b.end} ${b.kindLabel} | ${b.subjectName} / ${b.topic}`));
