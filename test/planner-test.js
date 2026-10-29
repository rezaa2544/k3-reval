const assert = require('assert');
const engine = require('../src/planner/engine.js');
const presets = require('../src/planner/presets.js');

const subjectsWithoutBio = () => presets.subjectsFor('tajrobi').filter((s) => s.id !== 'bio');
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
assert.deepStrictEqual(presetsMod.generalFor('دوازدهم').map((x) => x.id),
  ['fa3', 'ar3', 'di3', 'en3', 'sal3', 'hovi3']);
assert.deepStrictEqual(presetsMod.generalFor('دهم').map((x) => x.chapters), [8, 8, 12, 4]);
assert.deepStrictEqual(presetsMod.generalFor('یازدهم').map((x) => x.chapters), [8, 7, 12, 4]);

/* سلامت و بهداشت (۱۴ درس) و هویت اجتماعی (۱۰ درس) باید در پایهٔ دوازدهم باشند */
const sal = presetsMod.generalFor('دوازدهم').find((x) => x.id === 'sal3');
const hovi = presetsMod.generalFor('دوازدهم').find((x) => x.id === 'hovi3');
assert.ok(sal && sal.chapters === 14 && sal.topicNames.length === 14, 'سلامت و بهداشت ۱۴ درس نیست');
assert.ok(hovi && hovi.chapters === 10 && hovi.topicNames.length === 10, 'هویت اجتماعی ۱۰ درس نیست');
assert.ok(sal.name.indexOf('سلامت') !== -1 && hovi.name.indexOf('هویت') !== -1, 'نام درس‌های تازه درست نیست');

/* انتخاب پایه: فقط دوازدهم / فقط دهم / همه */
assert.deepStrictEqual(presetsMod.generalFor(['دوازدهم']).map((x) => x.id),
  ['fa3', 'ar3', 'di3', 'en3', 'sal3', 'hovi3']);
assert.deepStrictEqual(presetsMod.generalFor(['دهم']).map((x) => x.id), ['fa1', 'ar1', 'di1', 'en1']);
assert.deepStrictEqual(presetsMod.generalFor(['دهم', 'دوازدهم']).length, 10);
assert.deepStrictEqual(presetsMod.normalizeGrades(['دوازدهم', 'دوازدهم']), ['دوازدهم']);
assert.deepStrictEqual(presetsMod.normalizeGrades([]), ['دوازدهم']);
assert.deepStrictEqual(presetsMod.normalizeGrades('فارغ‌التحصیل'), ['دوازدهم']);
assert.deepStrictEqual(presetsMod.grades(), ['دهم', 'یازدهم', 'دوازدهم']);

const genCfg = Object.assign({}, config, {
  generalGrades: ['دوازدهم'],
  subjects: presetsMod.subjectsFor('tajrobi').concat(presetsMod.generalFor(['دوازدهم'])),
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
const genTotalChapters = genCfg.subjects.reduce((a, s) => a + s.chapters, 0);
assert.ok(genPlan.summary.learnedTopics >= genTotalChapters * 0.6,
  'مباحث کافی پوشش داده نشد: ' + genPlan.summary.learnedTopics + ' از ' + genTotalChapters);
assert.ok(genPlan.summary.coverage && genPlan.summary.coverage.totalChapters === genTotalChapters,
  'گزارش پوشش فصل‌ها ساخته نشد');
console.log('عمومی — دقیقه به‌ازای هر درس:', genMinutes, '| مباحث پوشش‌داده‌شده:', genPlan.summary.learnedTopics);

/* ۱۲) حالت «فقط دوازدهم»: هیچ درس عمومی پایهٔ دهم/یازدهم نباید در برنامه بیاید */
const only12 = engine.createPlan(Object.assign({}, config, {
  generalGrades: ['دوازدهم'],
  subjects: presetsMod.subjectsFor('tajrobi').concat(presetsMod.generalFor(['دوازدهم'])),
}));
const only12Names = new Set(only12.days.flatMap((d) => d.blocks.map((b) => b.subjectName)));
['فارسی ۱', 'فارسی ۲', 'عربی ۱', 'دین و زندگی ۱', 'زبان انگلیسی ۲'].forEach((n) => {
  assert.ok(!only12Names.has(n), 'درس پایهٔ دیگر در حالت فقط‌دوازدهم آمد: ' + n);
});
['سلامت و بهداشت', 'هویت اجتماعی'].forEach((n) => {
  assert.ok(only12Names.has(n), 'درس عمومی دوازدهم در برنامه نیامد: ' + n);
});
const salMinutes = only12.days.reduce((a, d) => a + d.blocks.filter((b) => b.subjectName === 'سلامت و بهداشت').reduce((x, b) => x + b.minutes, 0), 0);
assert.ok(salMinutes >= 60, 'سلامت و بهداشت بلوک کافی نگرفت: ' + salMinutes);
console.log('فقط دوازدهم — سلامت و بهداشت:', salMinutes, 'دقیقه |', 'درس‌های عمومی حاضره:', ['سلامت و بهداشت', 'هویت اجتماعی'].join('، '));

/* ۱۳) تقویم شمسی: تبدیل، سال کبیسه، رفت‌وبرگشت و خروجی‌ها */
const J = require('../src/planner/jalali.js');
assert.strictEqual(J.fmt('2026-10-29'), '۱۴۰۵/۰۸/۰۷');
assert.strictEqual(J.fmt('2027-03-21'), '۱۴۰۶/۰۱/۰۱');
assert.strictEqual(J.fmt('2026-03-20'), '۱۴۰۴/۱۲/۲۹');
assert.strictEqual(J.fmt('2025-03-20'), '۱۴۰۳/۱۲/۳۰');
assert.strictEqual(J.fmtLong('2026-10-29'), '۷ آبان ۱۴۰۵');
assert.strictEqual(J.parse('۱۴۰۵/۰۸/۰۷'), '2026-10-29');
assert.strictEqual(J.parse('1405-8-7'), '2026-10-29');
assert.strictEqual(J.parse('۱۴۰۵/۱۳/۰۱'), null, 'ماه نامعتبر باید رد شود');
assert.ok(J.isLeapJalaliYear(1403) && !J.isLeapJalaliYear(1404) && J.isLeapJalaliYear(1408));
/* مرز سال: آخر اسفند + ۱ روز = ۱ فروردین */
for (let jy = 1395; jy < 1415; jy += 1) {
  const len = J.monthLength(jy, 12);
  assert.strictEqual(J.addDays(J.toISO(jy, 12, len), 1), J.toISO(jy + 1, 1, 1), 'مرز سال ' + jy);
  assert.strictEqual(J.monthLength(jy, 12) === 30, J.isLeapJalaliYear(jy), 'کبیسه ' + jy);
}
/* رفت‌وبرگشت ۷۰۰ روز */
let pIso = '2026-01-01';
for (let i = 0; i < 700; i += 1) {
  assert.strictEqual(J.parse(J.fmt(pIso)), pIso, 'رفت‌وبرگشت: ' + pIso);
  pIso = J.addDays(pIso, 1);
}
/* خروجی‌های موتور باید شمسی باشند و تاریخ میلادی لو ندهند */
const md = engine.toMarkdown(plan);
const csvOut = engine.toCSV(plan);
assert.ok(/۱۴۰۵\//.test(md), 'Markdown تاریخ شمسی ندارد');
assert.ok(!/۲۰۲\d-\d\d-\d\d/.test(md), 'Markdown تاریخ میلادی دارد');
assert.ok(csvOut.indexOf('تاریخ (شمسی)') !== -1, 'سرستون CSV شمسی نیست');
assert.ok(!/"(20\d\d)-\d\d-\d\d"/.test(csvOut), 'CSV تاریخ میلادی دارد');
assert.ok(engine.toICS(plan).indexOf('X-REVAL-JALALI:۱۴۰۵/') !== -1, 'ICS یادداشت شمسی ندارد');
console.log('تقویم شمسی: تبدیل‌ها، کبیسه‌ها، ۷۰۰ روز رفت‌وبرگشت و خروجی MD/CSV/ICS ✓');

/* ۱۴) ارزیابی فصل‌به‌فصل: تسلط هر فصل، جبران خودکار و پیش‌بینی پوشش */
const bioBase = presets.subjectsFor('tajrobi').find((s) => s.id === 'bio');
assert.strictEqual(bioBase.chapters, 24, 'زیست باید ۲۴ فصل (۷+۹+۸) باشد: ' + bioBase.chapters);
assert.ok(bioBase.topicNames[0].indexOf('دنیای زنده') !== -1, 'نام فصل اول زیست از کتاب نیامد: ' + bioBase.topicNames[0]);
const chemBase = presets.subjectsFor('tajrobi').find((s) => s.id === 'chem');
assert.strictEqual(chemBase.chapters, 10, 'شیمی باید ۱۰ فصل باشد');
const physBase = presets.subjectsFor('tajrobi').find((s) => s.id === 'phys');
assert.strictEqual(physBase.chapters, 11, 'فیزیک باید ۱۱ فصل باشد');
const mathBase = presets.subjectsFor('tajrobi').find((s) => s.id === 'math');
assert.strictEqual(mathBase.chapters, 21, 'ریاضی تجربی باید ۲۱ فصل باشد');

/* ارزیابی نمونه: ۵ فصل خوانده‌شده با تسلط‌های متفاوت + بقیه نخوانده */
const assessedBio = Object.assign({}, bioBase, {
  chaptersData: bioBase.topicNames.map((n, i) => ({ name: n, read: i < 5, mastery: i < 5 ? [90, 50, 20, 0, 70][i] : 0 })),
});
const assessCfg = Object.assign({}, config, {
  examDate: iso(new Date(start.getTime() + 240 * 86400000)),
  weeklyMock: false,
  subjects: [assessedBio].concat(presets.subjectsFor('tajrobi').filter((s) => s.id !== 'bio')),
});
const assessPlan = engine.createPlan(assessCfg);
const bioChapters = assessPlan.summary.chapterStats.filter((c) => c.subjectId === 'bio');
assert.strictEqual(bioChapters.length, 24, 'فصل‌های زیست در گزارش نیامد');
assert.strictEqual(bioChapters[0].mode, 'solid', 'فصل با تسلط ۹۰ باید فقط مرور بگیرد: ' + bioChapters[0].mode);
assert.strictEqual(bioChapters[1].mode, 'boost', 'فصل با تسلط ۵۰ باید «ارتقا» باشد: ' + bioChapters[1].mode);
assert.strictEqual(bioChapters[2].mode, 'reteach', 'فصل با تسلط ۲۰ باید «جبران» باشد: ' + bioChapters[2].mode);
assert.strictEqual(bioChapters[5].mode, 'learn', 'فصل نخوانده باید «یادگیری» باشد: ' + bioChapters[5].mode);
assert.strictEqual(bioChapters[0].mastery, 90, 'تسلط فصل از ارزیابی خوانده نشد');

/* فصل ضعیف باید بلوک جبران واقعی در برنامه بگیرد */
const bioBlocks = assessPlan.days.flatMap((d) => d.blocks).filter((b) => b.subjectName === 'زیست‌شناسی');
const reteachBlocks = bioBlocks.filter((b) => b.kind === 'reteach');
assert.ok(reteachBlocks.length >= 2, 'بلوک «جبران و بازآموزی» برای فصل ضعیف ساخته نشد: ' + reteachBlocks.length);
assert.ok(reteachBlocks.some((b) => b.topic === bioBase.topicNames[2]), 'بلوک جبران روی فصل ضعیف نیست');
assert.ok(!bioBlocks.some((b) => (b.kind === 'learn' || b.kind === 'reteach') && b.topic === bioBase.topicNames[0]),
  'فصل مسلط نباید بلوک یادگیری/جبران بگیرد');

/* هر فصل خوانده‌شده باید وارد چرخهٔ مرور فاصله‌دار شود */
bioChapters.slice(0, 5).forEach((c) => {
  assert.ok(c.reviews >= 2, 'فصل «' + c.label + '» مرور کافی نگرفت: ' + c.reviews);
});
assert.ok(assessPlan.summary.coverage.readChapters === 5 + (assessCfg.subjects.length - 1) * 0 ? true : assessPlan.summary.coverage.readChapters >= 5,
  'شمارش فصل‌های خوانده‌شده غلط است');
assert.ok(typeof assessPlan.summary.coverage.readiness === 'number' && assessPlan.summary.coverage.readiness >= 0);
assert.ok(assessPlan.summary.coverage.projectedReadiness >= assessPlan.summary.coverage.readiness,
  'برآورد پایان دوره از آمادگی فعلی کمتر است');
assert.ok(assessPlan.summary.weakChapters.length > 0, 'فهرست فصل‌های ضعیف خالی است');
assert.ok(assessPlan.summary.priorities.length > 0, 'اولویت‌های مشاور خالی است');
assert.ok(/آمادگی فعلی/.test(engine.toMarkdown(assessPlan)), 'خروجی Markdown آمادگی را نشان نمی‌دهد');

/* همه فصل‌ها مسلط ⇒ هیچ بلوک یادگیری/جبران نمانَد، فقط مرور */
const allSolid = Object.assign({}, bioBase, {
  chaptersData: bioBase.topicNames.map((n) => ({ name: n, read: true, mastery: 90 })),
});
const solidPlan = engine.createPlan(Object.assign({}, assessCfg, {
  subjects: [allSolid].concat(subjectsWithoutBio()),
}));
const solidBioBlocks = solidPlan.days.flatMap((d) => d.blocks).filter((b) => b.subjectName === 'زیست‌شناسی');
assert.strictEqual(solidBioBlocks.filter((b) => b.kind === 'learn' || b.kind === 'reteach' || b.kind === 'boost').length, 0,
  'فصل‌های مسلط نباید بلوک یادگیری بگیرند');
assert.ok(solidBioBlocks.filter((b) => b.kind === 'review').length > 0, 'فصل مسلط باید مرور بگیرد');

/* به‌روزرسانی تسلط با درصد آزمون، فصل‌به‌فصل */
const afterScore = engine.applySubjectScore(assessedBio, 80);
const chAfter = afterScore.chaptersData;
assert.ok(chAfter[2].mastery > 20 && chAfter[2].mastery < 80, 'فصل ضعیف باید به‌سمت درصد آزمون حرکت کند: ' + chAfter[2].mastery);
assert.ok(chAfter[0].mastery >= 85, 'فصل مسلط نباید افت کند: ' + chAfter[0].mastery);
assert.strictEqual(chAfter[8].read, false, 'فصل نخوانده نباید با درصد آزمون «خوانده» شود');

/* زمان کم ⇒ هشدار پوشش */
const tightPlan = engine.createPlan(Object.assign({}, assessCfg, {
  examDate: iso(new Date(start.getTime() + 21 * 86400000)),
  availability: { sat: 1, sun: 1, mon: 1, tue: 1, wed: 1, thu: 1, fri: 1 },
}));
assert.strictEqual(tightPlan.summary.coverage.willCover, false, 'با زمان کم باید هشدار پوشش بدهد');
assert.ok(/هشدار پوشش|کم داری/.test(tightPlan.summary.coachNotes.join(' ')), 'پیام هشدار پوشش در مشاور نیست');
console.log('ارزیابی فصل‌به‌فصل: حالت‌ها، جبران خودکار، مرور و پیش‌بینی پوشش ✓');

console.log('\n✅ همه تست‌های موتور v2 پاس شدند');
const smp = days.find((d) => d.events.length && d.blocks.length);
console.log('\nنمونه روز —', smp.weekday, smp.date);
smp.events.forEach((e) => console.log('  📌', e.start + '-' + e.end, e.type === 'exam' ? 'آزمون' : 'کلاس', e.title));
smp.blocks.forEach((b) => console.log(`  ${b.start}-${b.end} ${b.kindLabel} | ${b.subjectName} / ${b.topic}`));
