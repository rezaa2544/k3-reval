/* ═══════════════════════════════════════════════════════════════════════
   تستِ ۲.۱۰.۳ — بستنِ سه عذرِ نسخهٔ ۲.۱۰.۲
   ───────────────────────────────────────────────────────────────────────
   ۱) «ضریب‌ها کالیبره‌نشده‌اند» → با دادهٔ واقعیِ کاربر، ضریبِ آن درس عوض
      می‌شود و **عددِ برنامه** هم عوض می‌شود (نه فقط یک پیامِ دلگرم‌کننده).
   ۲) «۸ ساعت اعلامی محتوای واقعی ندارد» → هر روز یا پر می‌شود، یا در
      `day.fill` با عدد و دلیل می‌گوید چرا وقت آزاد ماند؛ و هیچ‌وقت از ساعتِ
      اعلامی بیشتر نمی‌شود.
   ۳) «دستیار آفلاین قاعده‌محور و انسان‌نما نیست» → حافظهٔ گفت‌وگو، تشخیصِ
      سؤال از دستور، کالیبراسیون از راهِ چت، و اعلامِ صریحِ حالت.
   اجرا: node test/calib-2103.js
   ═══════════════════════════════════════════════════════════════════════ */
const engine = require('../src/planner/engine.js');
const presets = require('../src/planner/presets.js');
const LM = require('../src/planner/learning-model.js');
const CAL = require('../src/planner/calibration.js');
const TOOLS = require('../src/planner/ai/tools.js');
const brain = require('../src/planner/ai/brain.js');

let pass = 0; let fail = 0;
const errors = [];
const ok = (c, msg, x) => {
  if (c) { pass += 1; return; }
  fail += 1; errors.push(msg + (x !== undefined ? ' → ' + x : ''));
  console.log('  ✗ ' + msg + (x !== undefined ? ' → ' + x : ''));
};

const TODAY = '2026-11-04';
const SUBJ = { math: 'ریاضی', chem: 'شیمی', bio: 'زیست', phys: 'فیزیک' };
const nameOf = (id) => SUBJ[id] || id;

function cfgFor(hours, extra) {
  const availability = {}; const startTimes = {};
  ['sat', 'sun', 'mon', 'tue', 'wed', 'thu', 'fri'].forEach((k) => {
    availability[k] = hours; startTimes[k] = hours >= 6 ? '08:00' : '16:00';
  });
  return Object.assign({
    student: { name: 'تست', grade: 'دوازدهم', field: 'tajrobi', chronotype: 'neutral' },
    startDate: TODAY, examDate: '2027-07-02',
    sleep: { bedtime: '23:30', wake: '07:00' },
    availability, startTimes, blockMinutes: 45, breakMinutes: 10,
    restDay: 5, weeklyMock: true, classes: [], exams: [],
    subjects: presets.subjectsFor('tajrobi').concat(presets.generalFor('دوازدهم')),
  }, extra || {});
}

/* ─────────── ۱) کالیبراسیون: عدد عوض می‌شود؟ ─────────── */
console.log('\n▌ ۱) کالیبراسیونِ ضریبِ زمان با دادهٔ واقعی');
{
  const base = LM.chapterProfile({ subjectId: 'math', grade: 'دهم', chapterInGrade: 4, chapter: 4, chapters: 7, type: 'problem' });
  ok(base.total > 0, 'پروفایلِ پایهٔ فصل ساخته می‌شود', base.total);

  /* کاربر می‌گوید ریاضی ۲۵٪ کندتر است */
  const slow = LM.chapterProfile({
    subjectId: 'math', grade: 'دهم', chapterInGrade: 4, chapter: 4, chapters: 7, type: 'problem',
    calib: { page: 1.25, concept: 1.25, exercise: 1.25, n: 3 },
  });
  ok(slow.total > base.total, 'ضریبِ کندتر ⇒ بودجهٔ فصل بیشتر می‌شود', slow.total + ' > ' + base.total);
  const ratio = slow.total / base.total;
  ok(ratio > 1.15 && ratio < 1.35, 'افزایش با ضریب هم‌خوان است (نه ضربِ دلبخواه)', Math.round(ratio * 100) / 100);

  const fast = LM.chapterProfile({
    subjectId: 'math', grade: 'دهم', chapterInGrade: 4, chapter: 4, chapters: 7, type: 'problem',
    calib: { page: 0.85, concept: 0.85, exercise: 0.85, n: 3 },
  });
  ok(fast.total < base.total, 'ضریبِ سریع‌تر ⇒ بودجهٔ فصل کمتر می‌شود', fast.total + ' < ' + base.total);

  /* ثبتِ دادهٔ واقعی: برآورد ۲۰۰ دقیقه، واقعی ۲۶۰ ⇒ ۱٫۳ */
  let st = CAL.empty();
  st = CAL.record(st, { subjectId: 'math', chapterId: 'math.c4', estimatedMinutes: 200, actualMinutes: 260, source: 'timer', at: new Date().toISOString() });
  const row = CAL.rows(st, nameOf)[0];
  ok(row && row.scale > 1.1, 'ثبتِ «۲۶۰ دقیقه واقعی به‌جای ۲۰۰» ضریب را بالا می‌برد', row && row.scale);
  ok(row && row.n === 1 && row.confidence !== 'full', 'با یک نمونه، اطمینان «کامل» اعلام نمی‌شود', row && row.confidence);

  const cf = CAL.toConfig(st);
  ok(cf && cf.math && cf.math.page > 1, 'toConfig ضریب را برای موتور می‌دهد', JSON.stringify(cf.math));

  /* سه نمونهٔ واقعی ⇒ کالیبراسیونِ کامل */
  let st3 = st;
  for (let i = 0; i < 3; i += 1) {
    st3 = CAL.record(st3, { subjectId: 'math', chapterId: 'math.c' + (i + 1), estimatedMinutes: 180, actualMinutes: 234, source: 'timer', at: new Date().toISOString() });
  }
  const row3 = CAL.rows(st3, nameOf).find((r) => r.subjectId === 'math');
  ok(row3.confidence >= 100, 'با ≥۳ نمونه، اطمینانِ کامل (۱۰۰٪) اعلام می‌شود', row3.confidence);
  ok(CAL.summary(st3).measured >= 1, 'خلاصهٔ کالیبراسیون درسِ اندازه‌گیری‌شده را می‌شمارد', CAL.summary(st3).measured);

  /* دروازهٔ ایمنی: ضریبِ دستی از محدوده بیرون نمی‌زند */
  const wide = CAL.setScale(CAL.empty(), 'chem', 3.5);
  const wideRow = CAL.rows(wide, nameOf)[0];
  ok(wideRow.scale <= 1.8, 'ضریبِ دستی به سقفِ ایمن محدود می‌شود', wideRow.scale);

  /* اثرِ واقعی روی برنامه: پلن با کالیبراسیونِ کندتر برای ریاضی، فصل‌های کمتری می‌پوشاند
     (یا برای همان فصل دقیقهٔ بیشتری می‌دهد) */
  const plain = engine.createPlan(cfgFor(4));
  const slowPlan = engine.createPlan(cfgFor(4, { calibration: { math: { page: 1.4, concept: 1.4, exercise: 1.4, n: 3 } } }));
  const mathMin = (p) => p.days.reduce((a, d) => a + (d.blocks || []).filter((b) => b.subjectId === 'math').reduce((x, b) => x + b.minutes, 0), 0);
  const covMathPlain = (plain.summary.coverage || 0);
  ok(plain.summary && slowPlan.summary, 'هر دو برنامه ساخته شدند');
  ok(mathMin(slowPlan) !== mathMin(plain) || slowPlan.summary.coverage !== covMathPlain,
    'کالیبراسیون عددِ برنامه را عوض می‌کند (نه فقط پیام)',
    'ریاضی ' + mathMin(plain) + '→' + mathMin(slowPlan) + ' دقیقه · پوشش ' + covMathPlain + '→' + slowPlan.summary.coverage);
}

/* ─────────── ۲) ساعتِ اعلامی: محتوای واقعی یا دلیلِ صادقانه ─────────── */
console.log('\n▌ ۲) ساعتِ اعلامی = محتوای واقعی یا دلیلِ روشن');
{
  [4, 6, 8, 10].forEach((h) => {
    const plan = engine.createPlan(cfgFor(h));
    const days = plan.days.filter((d) => d.studyMinutes > 0);
    const withFill = days.filter((d) => d.fill);
    ok(withFill.length >= days.length - 1, 'هر روزِ فعال فیلدِ `fill` دارد (' + h + ' ساعت)', withFill.length + '/' + days.length);

    const over = days.filter((d) => d.capMinutes > 0 && d.studyMinutes > d.capMinutes + 1);
    ok(over.length === 0, 'هیچ روزی از ساعتِ اعلامی بیشتر نمی‌شود (' + h + ' ساعت)', over.length);

    const avg = days.reduce((a, d) => a + d.fill.pct, 0) / Math.max(1, days.length);
    ok(avg >= 70, 'میانگینِ پرشدگی با محتوای واقعی ≥۷۰٪ (' + h + ' ساعت)', Math.round(avg) + '٪');

    /* ۲.۱۰.۳: اگر ساعتِ اعلامی از ظرفیتِ واقعیِ مطالعه بیشتر است، دلیلش صریح گفته می‌شود */
    const wide = days.filter((d) => d.fill.declaredMinutes > d.fill.usableMinutes + 15);
    ok(wide.length === 0 || wide.every((d) => d.fill.capNote && d.fill.capNote.length > 20),
      'فاصلهٔ «ساعت اعلامی» و «ظرفیتِ خالص» توضیح داده می‌شود (' + h + ' ساعت)', wide.length);

    const bad = days.filter((d) => d.fill.freeMinutes >= 30 && !d.fill.why);
    ok(bad.length === 0, 'هر وقتِ آزادِ ≥۳۰ دقیقه دلیل دارد (' + h + ' ساعت)', bad.length);
    ok(days.every((d) => d.fill.reason && d.fill.pct <= 100), 'درصد هیچ‌وقت از ۱۰۰ بیشتر نمی‌شود (' + h + ' ساعت)');
  });

  /* دلیلِ «روزِ استراحت» و «روزِ آزمون» هم واقعی است */
  const p = engine.createPlan(cfgFor(6));
  const rest = p.days.filter((d) => d.isRestDay && d.fill);
  ok(rest.every((d) => d.fill.reason === 'rest'), 'روزِ استراحت دلیلِ `rest` می‌گیرد', rest.length);
}

/* ─────────── ۳) دستیار: حافظه، سؤال≠دستور، کالیبراسیون، حالت ─────────── */
console.log('\n▌ ۳) دستیارِ آفلاین: حافظه، تفکیکِ سؤال/دستور، کالیبراسیون');
{
  const cfg = cfgFor(6);
  const plan = engine.createPlan(cfg);
  const mem = { subjectId: null, chapter: null, topic: null, lastIntent: null, turns: 0 };
  const calibCalls = [];
  const ctx = {
    studentName: 'آرمین',
    memory: mem,
    readConfig: () => ({ avgDailyHours: 6, weeklyHours: 42, restDay: 5, blockMinutes: 45, timeMode: 'fixed', examDate: cfg.examDate }),
    readPlan: () => ({ blocks: [{ start: '08:00', end: '08:45', subjectName: 'ریاضی', topicLabel: 'فصل ۴ — مشتق', minutes: 45 }] }),
    readReport: () => ({ coverage: 62, hours: 400, daysLeft: 240, konkurProjected: 55, finalsProjected: 61, todayCount: 8, todayMinutes: 360, weak: 'شیمی فصل ۲', warnings: [] }),
    chapterStat: (sid, ch) => null,
    readDayMeta: () => ({
      blockCount: 8, plannedMinutes: 300, capMinutes: 360, isRestDay: false, isLightDay: false,
      fill: { why: 'ظرفیتِ باقی‌مانده به یادگیریِ باقی‌مانده تعلق دارد، اما با سقفِ ۲ جلسه از یک کتاب جا نشد.' },
      blocks: [{ start: '08:00', end: '08:45', kindLabel: 'یادگیری', topic: 'ریاضی فصل ۴', minutes: 45 }],
    }),
    calibrate: (spec) => { calibCalls.push(spec); return { ok: true, message: 'ریاضی کالیبره شد: ضریب ۱٫۲۵× (+۲۵٪).', data: { subjectId: spec.subjectId, scale: 1.25, deltaPct: 25 } }; },
    readCalibration: () => ({ text: 'ریاضی: ۲ نمونه، +۱۸٪', rows: [] }),
    applyTool: (name, args) => TOOLS.run(name, args, ctx),
  };

  const r1 = brain.respond('فصل ۴ ریاضی برام سخته', ctx);
  ok(r1 && r1.text, '۱) پاسخ به «فصل ۴ ریاضی سخته»', r1 && r1.text.slice(0, 30));
  ok(mem.subjectId === 'math' && mem.chapter === 4, 'حافظه: درس و فصلِ گفته‌شده یادش می‌ماند', mem.subjectId + '/' + mem.chapter);

  const rQ = brain.respond('چرا امروز این‌قدر سنگینه؟', ctx);
  ok(rQ && (!rQ.actions || rQ.actions.length === 0), 'سؤال، برنامه را عوض نمی‌کند (بدونِ اقدام)', rQ && rQ.actions && rQ.actions.length);
  ok(rQ && rQ.text.indexOf('عوض نکردم') !== -1 || (rQ && rQ.intent === 'explain_day'),
    'سؤالِ «چرا سنگین است؟» جوابِ توضیحی می‌گیرد (نه اجرای ابزار)', rQ && rQ.intent);

  const rCal = brain.respond('ریاضی برای من ۲۰٪ کندتر است', ctx);
  ok(calibCalls.length === 1, 'دستورِ «کندتر است» کالیبراسیون را واقعاً اجرا می‌کند', calibCalls.length);
  ok(calibCalls[0] && calibCalls[0].subjectId === 'math', 'کالیبراسیون به همان درسِ در دستِ بحث اعمال می‌شود', calibCalls[0] && calibCalls[0].subjectId);
  ok(calibCalls[0] && Math.abs(calibCalls[0].scale - 1.2) < 0.001, 'درصد به ضریب تبدیل می‌شود (۲۰٪ ⇒ ۱٫۲)', calibCalls[0] && calibCalls[0].scale);
  ok(rCal && rCal.actions && rCal.actions.length === 1, 'پاسخ کالیبراسیون اقدامِ انجام‌شده را نشان می‌دهد');

  const rSlow = brain.respond('شیمی سریع‌تر از اینی که گفتی', ctx);
  ok(calibCalls.length === 2 && calibCalls[1].scale < 1, '«سریع‌تر» ضریب را پایین می‌آورد', calibCalls[1] && calibCalls[1].scale);

  const rHours = brain.respond('فصل ۲ شیمی ۵ ساعت طول کشید', ctx);
  ok(calibCalls.length === 3 && calibCalls[2].actualMinutes === 300, '«۵ ساعت طول کشید» به دقیقهٔ واقعی تبدیل می‌شود', calibCalls[2] && calibCalls[2].actualMinutes);

  const rF = brain.respond('همون رو بذار برنامه امروز', ctx);
  ok(rF && rF.intent === 'followup_focus', '«همون رو بذار» ادامهٔ گفت‌وگو را می‌فهمد (حافظه)', rF && rF.intent);

  ok(brain.respond('سلام', ctx).text.length > 5, 'احوال‌پرسی با زمینهٔ زمانی جواب می‌گیرد');
}

/* ─────────── ۴) ابزارهای کالیبراسیون در فهرستِ دستیار ─────────── */
console.log('\n▌ ۴) ابزارهای کالیبراسیون در دستیار');
{
  const names = TOOLS.TOOLS.map((t) => t.name);
  ok(names.indexOf('calibrate_subject') !== -1, 'ابزار calibrate_subject ثبت شده است');
  ok(names.indexOf('get_calibration') !== -1, 'ابزار get_calibration ثبت شده است');
  ok(TOOLS.forLLM().some((t) => t.function.name === 'calibrate_subject'), 'ابزار به مدلِ زبانی هم ارائه می‌شود (function calling)');
  ok(TOOLS.helpText().indexOf('آمادگی') !== -1, 'متنِ راهنما برای کاربر هست');
}

console.log('\n' + (fail === 0
  ? '✅ ' + pass + ' بررسیِ «کالیبراسیون + ساعتِ واقعی + دستیار» پاس شد'
  : '❌ ' + fail + ' بررسی ناموفق از ' + (pass + fail)));
if (fail) { errors.forEach((e) => console.log(' - ' + e)); process.exit(1); }
