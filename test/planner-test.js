const assert = require('assert');
const engine = require('../src/planner/engine.js');
const presets = require('../src/planner/presets.js');

const today = new Date();
const start = new Date(today.getFullYear(), today.getMonth(), today.getDate());
const pad = n => String(n).padStart(2,'0');
const iso = d => `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
const exam = new Date(start); exam.setDate(exam.getDate() + 120);

const config = {
  student: { name: 'آرمان', grade: 'دوازدهم', field: 'tajrobi', chronotype: 'morning' },
  startDate: iso(start),
  examDate: iso(exam),
  sleep: { bedtime: '23:30', wake: '07:00' },
  availability: { sat: 4, sun: 4, mon: 4, tue: 4, wed: 4, thu: 6, fri: 5 },
  startTimes: { sat:'16:00', sun:'16:00', mon:'16:00', tue:'16:00', wed:'16:00', thu:'09:00', fri:'09:00' },
  blockMinutes: 45, breakMinutes: 10, restDay: 5, weeklyMock: true,
  subjects: presets.subjectsFor('tajrobi'),
};

const plan = engine.createPlan(config);
const days = plan.days;
console.log('days:', days.length, '| totalHours:', plan.summary.totalHours, '| avg/day:', plan.summary.avgHoursPerDay);

// 1) هیچ بلوکی داخل بازه خواب نباشد و آخرین بلوک ≥45 دقیقه قبل خواب
let sleepViolations = 0, guardViolations = 0;
days.forEach(d => d.blocks.forEach(b => {
  const [h,m] = b.end.split(':').map(Number);
  const endMin = h*60+m;
  if (endMin > 23*60+30) sleepViolations++;
  if (endMin > 23*60+30-45) guardViolations++;
}));
assert.strictEqual(sleepViolations, 0, 'بلوک داخل بازه خواب!');
assert.strictEqual(guardViolations, 0, 'بلوک نزدیک‌تر از ۴۵ دقیقه به خواب!');

// 2) بیش از ۲ بلوک متوالی از یک درس نباشد
let consec = 0;
days.forEach(d => { let run = 1; for (let i=1;i<d.blocks.length;i++){ if (d.blocks[i].subjectId===d.blocks[i-1].subjectId) run++; else run=1; if (run>2) consec++; } });
assert.strictEqual(consec, 0, 'سه بلوک متوالی از یک درس!');

// 3) مرورهای فاصله‌دار وجود دارد و روی روزهای مختلف پخش شده
const reviewBlocks = days.flatMap(d => d.blocks.filter(b => b.kind === 'review'));
assert.ok(reviewBlocks.length > 10, 'تعداد مرور کافی نیست: ' + reviewBlocks.length);

// 4) روز آزمون بلوک دارد
const examDay = days[days.length-1];
assert.ok(examDay.isExamDay && examDay.blocks.length > 0, 'روز آزمون خالی است');

// 5) هیچ روزی بیش از ظرفیتش بار ندارد
let overCapacity = 0;
days.forEach((d, i) => {
  // ظرفیت محاسبه‌شده با همان فرمول موتور
  const cap = engine._internal;
  const hours = config.availability[engine.WEEKDAY_KEY[engine._internal.persianWeekday(new Date(d.date))]] || 0;
  const maxMin = hours * 60;
  if (d.plannedMinutes > maxMin + 1) overCapacity++;
});
assert.strictEqual(overCapacity, 0, 'روز بیش از ساعت در دسترس!');

// 6) توزیع وزنی: زیست باید بیشترین زمان را بگیرد (ضریب ۱۲)
const byName = Object.fromEntries(plan.summary.bySubject.map(s => [s.name, s.hours]));
console.log('hours by subject:', byName);
assert.ok(byName['زیست‌شناسی'] > byName['شیمی'], 'زیست باید بیشتر از شیمی باشد');

// 7) توزیع مرور: فاصله‌ها صعودی
const gaps = engine._internal;
assert.ok(gaps.firstReviewGap(120) >= 3 && gaps.firstReviewGap(120) <= 21, 'firstGap خارج از بازه');
assert.ok(gaps.reviewInterval(3, null, 120) > 3, 'فاصله بعدی باید بیشتر شود');

// 8) خروجی‌ها کار می‌کنند
const md = engine.toMarkdown(plan);
const csv = engine.toCSV(plan);
const ics = engine.toICS(plan);
const tasks = engine.toTaskList(plan, days[1].date);
assert.ok(md.includes('# برنامهٔ مطالعه'), 'markdown');
assert.ok(csv.split('\r\n').length > 50, 'csv');
assert.ok(ics.includes('BEGIN:VCALENDAR') && ics.includes('DTSTART'), 'ics');
assert.ok(tasks.split('\n').length > 0, 'tasklist');

// 9) کارایی: ۳۶۵ روز برنامه سریع ساخته شود
const longExam = new Date(start); longExam.setDate(longExam.getDate() + 365);
const t0 = Date.now();
const bigPlan = engine.createPlan(Object.assign({}, config, { examDate: iso(longExam) }));
const elapsed = Date.now() - t0;
assert.ok(elapsed < 4000, 'ساخت برنامه کند است: ' + elapsed + 'ms');
console.log('365-day plan built in', elapsed, 'ms | hours:', bigPlan.summary.totalHours);

console.log('\n✅ همه تست‌های موتور برنامه‌ریز پاس شدند');
console.log('نمونه روز ۲:');
console.log(days[2].weekday, days[2].date);
days[2].blocks.slice(0,4).forEach(b => console.log(`  ${b.start}-${b.end} ${b.kindLabel} | ${b.subjectName} / ${b.topic}`));
console.log('\ncoach notes:'); plan.summary.coachNotes.forEach(n => console.log(' •', n));
console.log('\nwarnings:', plan.summary.warnings.length ? plan.summary.warnings : 'none');
