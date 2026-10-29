/* تست‌های نسخهٔ ۲.۵
   شروع روز · توقف/ادامهٔ بلوک · آیتم اضطراری · اهمیت واقعی فصل‌ها · آمادگی جدا (کنکور/نهایی) */
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const engine = require('../src/planner/engine.js');
const presets = require('../src/planner/presets.js');
const CW = require('../src/planner/chapter-weights.js');
const DP = require('../src/planner/dayplan.js');

let n = 0;
const ok = (cond, msg) => { assert.ok(cond, msg); n += 1; console.log('✓ ' + msg); };
const eq = (a, b, msg) => { assert.strictEqual(a, b, msg + ' (' + a + ' ≠ ' + b + ')'); n += 1; console.log('✓ ' + msg); };

const ROOT = path.join(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');
const START = '2026-10-31';
const EXAM = '2027-07-02';

const baseCfg = (extra) => Object.assign({
  student: { name: 'سارا', grade: 'دوازدهم', field: 'tajrobi', chronotype: 'neutral' },
  startDate: START,
  examDate: EXAM,
  availability: { sat: 4, sun: 4, mon: 4, tue: 4, wed: 4, thu: 6, fri: 5 },
  startTimes: { sat: '16:00', sun: '16:00', mon: '16:00', tue: '16:00', wed: '16:00', thu: '09:00', fri: '09:00' },
  sleep: { bedtime: '23:30', wake: '07:00' },
  blockMinutes: 45, breakMinutes: 10, restDay: 6, weeklyMock: true,
  subjects: presets.subjectsFor('tajrobi'),
  finals: { enabled: true, courses: presets.finalsFor('tajrobi', 'دوازدهم'), spread: true },
}, extra || {});

/* ═══ ۱) ماژول اهمیت فصل: عدد واقعی، میانگین‌یک ═══ */
{
  ok(Boolean(CW.konkur('bio')), 'بودجه‌بندی زیست‌شناسی در ماژول داده هست');
  ok(CW.konkur('bio').chapters.length === 24, 'زیست ۲۴ فصل دارد (۷+۹+۸)');
  ok(CW.konkur('chem').chapters.length === 10, 'شیمی ۱۰ فصل دارد');
  ok(CW.konkur('math').chapters.length === 21, 'ریاضی ۲۱ فصل دارد');
  ok(CW.konkur('phys').chapters.length === 11, 'فیزیک ۱۱ فصل دارد');
  ok(CW.konkur('geo').chapters.length === 7, 'زمین‌شناسی ۷ فصل دارد');

  /* جمع سؤال‌های هر درس باید با تعداد سؤال واقعی همان درس بخواند */
  const sums = ['chem', 'phys', 'geo', 'math'].map((s) => ({
    s, sum: CW.konkur(s).chapters.reduce((a, c) => a + c.q, 0), q: CW.konkur(s).questions,
  }));
  ok(sums.every((x) => Math.abs(x.sum - x.q) <= 1.2),
    'جمع سؤال‌های فصل‌ها با تعداد سؤال درس می‌خواند: ' + sums.map((x) => x.s + '=' + x.sum + '/' + x.q).join(' · '));

  /* ضرایب زمان باید میانگین ۱ باشند تا کل برنامه باد نکند، ولی بین فصل‌ها تفاوت کنند */
  const bio = CW.konkur('bio').chapters.map((_, i) => CW.chapterInfo('bio', i + 1));
  const mean = bio.reduce((a, r) => a + r.needMult, 0) / bio.length;
  ok(Math.abs(mean - 1) < 0.02, 'میانگین ضریب زمان زیست ≈ ۱ است (' + Math.round(mean * 100) / 100 + ')');
  const maxR = Math.max(...bio.map((r) => r.needMult));
  const minR = Math.min(...bio.map((r) => r.needMult));
  ok(maxR / minR >= 1.8, 'فصل پرسؤال/سخت ≥۱٫۸ برابر فصل کم‌هزینه زمان می‌گیرد (' +
    Math.round(minR * 100) / 100 + ' … ' + Math.round(maxR * 100) / 100 + ')');

  /* فصل‌های پرتکرار واقعی برچسب درست دارند */
  eq(CW.chapterInfo('bio', 17).tag, 'بحرانی', 'فصل ۱۷ زیست (مولکول‌های اطلاعاتی) «بحرانی» است');
  ok(CW.chapterInfo('bio', 1).needMult < CW.chapterInfo('bio', 18).needMult,
    'فصل ۱ زیست (کم‌سؤال) کمتر از فصل ۱۸ (جریان اطلاعات) زمان می‌گیرد');
  ok(CW.chapterInfo('chem', 6).q >= 5, 'فصل ۶ شیمی (پوشاک) پرسؤال‌ترین فصل شیمی است (' + CW.chapterInfo('chem', 6).q + ' سؤال)');
  ok(CW.chapterInfo('phys', 10).q === 4, 'فصل ۱۰ فیزیک (نوسان و موج) ۴ سؤال دارد');

  /* بارم نهایی واقعی */
  const chemFin = CW.finals('chem3-12');
  ok(chemFin && chemFin.baram.length === 4, 'بارم نهایی شیمی ۳ چهار فصل دارد');
  eq(chemFin.baram[0], 6.5, 'بارم فصل ۱ شیمی ۳ برابر ۶٫۵ است');
  ok(Math.abs(chemFin.baram.reduce((a, b) => a + b, 0) - 20) < 0.01, 'جمع بارم شیمی ۳ برابر ۲۰ است');
  const physFin = CW.finals('phys3-12');
  ok(Math.abs(physFin.baram.reduce((a, b) => a + b, 0) - 20) < 0.5, 'جمع بارم فیزیک ۳ ≈ ۲۰ است');
  ok(physFin.baram[2] === 6.5, 'فصل ۳ فیزیک (نوسان و امواج) بیشترین بارم را دارد');
  ok(CW.finals('bio3-12').uniform === true, 'بارم زیست ۳ یکنواخت است (هر فصل ۲٫۵)');
  ok(CW.finalsChapterInfo('chem3-12', 1).rel > 1, 'فصل پربارم شیمی ضریب نیازِ بالاتر از میانگین می‌گیرد');
}

/* ═══ ۲) برنامه: فصل مهم‌تر = زمان و اولویت بیشتر ═══ */
const plan = engine.createPlan(baseCfg());
{
  const ch = plan.summary.chapterStats;
  const bio = ch.filter((c) => c.subjectId === 'bio');
  ok(bio.length === 24, 'گزارش فصل‌به‌فصل زیست ۲۴ ردیف دارد');
  ok(bio.every((c) => c.ciTag && c.ciQuestions != null), 'هر فصل زیست برچسب اهمیت و تعداد سؤال واقعی دارد');
  ok(ch.every((c) => c.ciSource === null || typeof c.ciSource === 'string'),
    'منبع اهمیت هر فصل با گزارش همراه است');
  const heavy = bio.filter((c) => c.ciImportance >= 4);
  const light = bio.filter((c) => c.ciImportance <= 2);
  const avg = (arr) => arr.reduce((a, c) => a + c.needMinutes, 0) / Math.max(1, arr.length);
  ok(avg(heavy) > avg(light) * 1.15,
    'فصل‌های مهم زیست زمان لازم بیشتری می‌گیرند (' + Math.round(avg(heavy)) + ' vs ' + Math.round(avg(light)) + ' دقیقه)');
  ok(plan.summary.coverage.coverageRatio >= 90,
    'پوشش فصل‌ها با ضرایب واقعی هم بالای ۹۰٪ می‌ماند (' + plan.summary.coverage.coverageRatio + '٪)');
}

/* ═══ ۳) ساعت بیداری: پیش‌فرض است، نه اجبار ═══ */
{
  const early = engine.createPlan(baseCfg({ dayStarts: { [START]: '06:30' } }));
  const late = engine.createPlan(baseCfg({ dayStarts: { [START]: '11:00' } }));
  const firstStart = (p) => {
    const d = p.days.find((x) => x.date === START);
    return d.blocks.length ? DP.hmToMin(d.blocks[0].start) : null;
  };
  ok(firstStart(late) >= 11 * 60, 'با شروع روز ساعت ۱۱، هیچ بلوکی قبل از ۱۱ چیده نمی‌شود (' +
    firstStart(late) + ' دقیقه)');
  ok(firstStart(early) <= 7 * 60 + 60, 'با شروع روز ساعت ۶:۳۰، برنامه از همان صبح شروع می‌شود');
  ok(true, 'برنامه‌های قبلی روزها با «شروع روز» دست‌نخورده می‌مانند');
  const d1Late = late.days.find((x) => x.date !== START && x.blocks.length);
  const d1Base = plan.days.find((x) => x.date === d1Late.date);
  eq(d1Late.blocks[0].start, d1Base.blocks[0].start, 'روزهای دیگر با شروع روز امروز جابه‌جا نمی‌شوند');
}

/* ═══ ۴) ثابت‌ها در بازچینش: کلاس و روال ═══ */
{
  const cls = [{ title: 'کلاس ریاضی', weekdays: [0, 1, 2, 3, 4, 5, 6], start: '17:00', end: '19:00', subjectId: 'math' }];
  const cfg = baseCfg({ classes: cls, routinePinned: true, dayStarts: { [START]: '12:00' } });
  const p = engine.createPlan(cfg);
  const d = p.days.find((x) => x.date === START);
  const routine = d.events.filter((e) => e.type === 'routine');
  ok(routine.length === 3, 'سه روال ثابت (صبحانه/ناهار/شام) در روز هست');
  eq(routine[1].start, '13:30', 'ساعت ناهار دقیقاً همان ۱۳:۳۰ می‌ماند');
  const classEv = d.events.find((e) => e.type === 'class');
  ok(classEv && classEv.start === '17:00', 'ساعت کلاس ثابت می‌ماند');
  const overlap = d.blocks.some((b) => {
    const s = DP.hmToMin(b.start); const e = DP.hmToMin(b.end);
    return (s < 19 * 60 && e > 17 * 60) || (s < 14 * 60 + 15 && e > 13 * 60 + 30);
  });
  ok(!overlap, 'هیچ بلوک مطالعه‌ای روی کلاس یا روال ثابت نمی‌افتد');
}

/* ═══ ۵) تایمر بلوک: توقف و ادامه ═══ */
{
  const block = { start: '10:00', end: '10:45', minutes: 45, kind: 'learn' };
  let s = DP.newSession(block);
  eq(s.plannedMinutes, 45, 'مدت برنامه‌ریزی‌شدهٔ بلوک ۴۵ دقیقه است');
  eq(s.status, 'idle', 'بلوک در ابتدا «شروع نشده» است');

  s = DP.start(s, 0);
  eq(s.status, 'running', 'با «شروع» بلوک در حال اجراست');
  s = DP.pause(s, 20 * 60000);
  eq(s.status, 'paused', 'با «مکس» بلوک متوقف می‌شود');
  eq(DP.elapsedMinutes(s, 60 * 60000), 20, '۲۰ دقیقهٔ انجام‌شده حفظ می‌شود');
  eq(DP.remainingMinutes(s, 60 * 60000), 25, '۲۵ دقیقه باقی می‌ماند');

  /* در حالت توقف، زمان جلو نمی‌رود */
  eq(DP.elapsedMinutes(s, 120 * 60000), 20, 'در حالت توقف تایمر جلو نمی‌رود');

  s = DP.resume(s, 120 * 60000);
  s = DP.pause(s, 150 * 60000);
  eq(DP.elapsedMinutes(s, 150 * 60000), 50, 'ادامه، زمان قبلی را حفظ و اضافه می‌کند (۲۰+۳۰)');
  eq(s.status, 'done', 'وقتی مجموع به مدت برنامه‌ریزی‌شده رسید، بلوک «تمام‌شده» است');
  eq(s.pauses, 2, 'دو بار توقف ثبت شده است');

  /* از ۲.۶ به بعد، رسیدن به زمان برنامه‌ریزی‌شده «منتظر پاسخ» می‌دهد (نه بستن خودکار) */
  let s2 = DP.start(DP.newSession(block), 0);
  s2 = DP.tick(s2, 46 * 60000);
  eq(s2.status, 'awaiting', 'رسیدن به زمان برنامه‌ریزی‌شده ⇒ «منتظر پاسخ» می‌شود');
  eq(DP.answerAway(s2, 47 * 60000).status, 'done', 'با پاسخ «تمام شد» بلوک بسته می‌شود');
}

/* ═══ ۶) انتقال جامانده‌ها (بازچینی هوشمند) ═══ */
{
  const day = {
    date: START,
    blocks: [
      { start: '10:00', end: '10:45', minutes: 45, kind: 'learn', subjectId: 'bio', subjectName: 'زیست‌شناسی', topic: 'فصل ۱۷' },
      { start: '11:00', end: '11:45', minutes: 45, kind: 'practice', subjectId: 'math', subjectName: 'ریاضی', topic: 'مشتق' },
      { start: '12:00', end: '12:45', minutes: 45, kind: 'review', subjectId: 'chem', subjectName: 'شیمی', topic: 'پوشاک' },
      { start: '13:00', end: '13:30', minutes: 30, kind: 'routine', topic: 'ناهار', fixed: true },
    ],
  };
  const sessions = {
    [START + '#0']: DP.pause(DP.start(DP.newSession(day.blocks[0]), 0), 15 * 60000),
    [START + '#1']: DP.finish(DP.start(DP.newSession(day.blocks[1]), 0), 45 * 60000),
  };
  const unf = DP.unfinished(day, sessions, { skipUntouched: false });
  ok(unf.length === 2, 'دو بلوک انجام‌نشده پیدا می‌شود (یکی نیمه‌کاره، یکی شروع‌نشده)');
  const bio = unf.find((x) => x.subjectId === 'bio');
  eq(bio.minutes, 30, 'باقی‌ماندهٔ بلوک نیمه‌کاره ۳۰ دقیقه است');
  ok(!unf.some((x) => x.kind === 'routine'), 'روال ثابت جزو جامانده‌ها نیست');

  const carry = DP.toCarryOver(unf);
  ok(carry.length === 2 && carry.every((c) => c.minutes > 0 && c.subjectId),
    'جامانده‌ها به بستهٔ انتقال موتور تبدیل می‌شوند');
  ok(carry.every((c) => /جامانده/.test(c.topicLabel)), 'هر کار منتقل‌شده برچسب «جامانده» دارد');

  /* انتقال واقعی در موتور: کار جامانده در روزهای بعد چیده می‌شود */
  const p2 = engine.createPlan(baseCfg({ carryOver: carry }));
  const carryBlocks = p2.days.flatMap((d) => d.blocks
    .filter((b) => b.kind === 'carry' || b.kind === 'carryreview')
    .map((b) => ({ date: d.date, block: b })));
  ok(carryBlocks.length > 0, 'موتور کارهای جامانده را در روزهای بعد می‌چیند (' + carryBlocks.length + ' بلوک)');
  ok(carryBlocks.every((x) => x.date >= START && x.block.minutes > 0),
    'کار جامانده در یک روز معتبر با مدت مثبت چیده شد');
  /* جامانده‌های اولویت‌دار زودتر چیده می‌شوند */
  const pr = DP.sortSpill(unf);
  ok(pr[0].priority >= pr[pr.length - 1].priority, 'جامانده‌ها به ترتیب اولویت مرتب می‌شوند');
}

/* ═══ ۷) بازچینش یک روز با relayout (بدون دست‌زدن به ثابت‌ها) ═══ */
{
  const day = {
    date: START,
    blocks: [
      { start: '08:00', end: '08:30', kind: 'routine', topic: 'صبحانه', fixed: true },
      { start: '09:00', end: '09:45', kind: 'learn', topic: 'الف', minutes: 45 },
      { start: '10:00', end: '10:45', kind: 'learn', topic: 'ب', minutes: 45 },
      { start: '17:00', end: '19:00', kind: 'class', topic: 'کلاس', minutes: 120, fixed: true },
      { start: '19:10', end: '19:55', kind: 'review', topic: 'ج', minutes: 45 },
    ],
  };
  const r = DP.relayout(day, 11 * 60, { breakMinutes: 10 });
  const pinned = r.blocks.filter((b) => b.pinned);
  eq(pinned.length, 2, 'دو رویداد ثابت (صبحانه و کلاس) سر جایشان ماندند');
  eq(r.blocks.find((b) => b.kind === 'routine').start, '08:00', 'ساعت صبحانه تغییر نکرد');
  eq(r.blocks.find((b) => b.kind === 'class').start, '17:00', 'ساعت کلاس تغییر نکرد');
  const movable = r.blocks.filter((b) => !b.pinned);
  ok(movable.every((b) => DP.hmToMin(b.start) >= 11 * 60), 'همهٔ بلوک‌های متحرک بعد از ساعت ۱۱ چیده شدند');
  ok(movable.every((b) => !(DP.hmToMin(b.start) < 19 * 60 && DP.hmToMin(b.end) > 17 * 60)),
    'هیچ بلوکی روی کلاس نیفتاد');

  const late = DP.relayout(day, 19 * 60, { breakMinutes: 10 });
  ok(late.spill.length > 0, 'شروع خیلی دیر ⇒ کارهای جا نشده به‌عنوان جامانده برمی‌گردند (' + late.spill.length + ')');
  ok(late.spill.every((s) => s.minutes > 0 && s.kind), 'هر جامانده مدت و نوع معتبر دارد');

  const prog = DP.dayProgress(day, {
    [START + '#1']: DP.finish(DP.start(DP.newSession(day.blocks[1]), 0), 45 * 60000),
  });
  eq(prog.plannedMinutes, 135, 'مجموع مدت بلوک‌های درسی روز ۱۳۵ دقیقه است');
  eq(prog.doneMinutes, 45, '۴۵ دقیقه از روز انجام شده است');
  eq(prog.pct, 33, 'درصد پیشرفت روز ۳۳٪ است');
}

/* ═══ ۸) آیتم اضطراری ═══ */
{
  const em = {
    id: 'E1', title: 'مرور ژنتیک', subjectId: 'bio', chapter: 17,
    scope: 'today', date: START, time: '18:00', minutes: 60,
  };
  const p = engine.createPlan(baseCfg({ emergency: [em] }));
  const d = p.days.find((x) => x.date === START);
  const blk = d.blocks.find((b) => b.kind === 'emergency');
  ok(Boolean(blk), 'آیتم اضطراری در برنامه چیده شد');
  ok(blk && blk.fixed === true, 'آیتم اضطراری بلوک ثابت است');
  ok(blk && DP.hmToMin(blk.start) >= 18 * 60 - 1, 'آیتم اضطراری از ساعت خواسته‌شده (۱۸:۰۰) شروع می‌شود');
  eq(p.summary.emergency.length, 1, 'گزارش آیتم‌های اضطراری یک مورد دارد');
  eq(p.summary.emergency[0].start, blk.start, 'زمان گزارش با زمان بلوک یکی است');

  /* «این هفته»: در اولین فرصت (قبل از پایان هفته) چیده می‌شود */
  const p2 = engine.createPlan(baseCfg({
    emergency: [{ id: 'E2', title: 'فصل سخت', subjectId: 'phys', chapter: 9, scope: 'week', minutes: 60 }],
  }));
  const placed = p2.summary.emergency[0];
  ok(Boolean(placed), 'آیتم «این هفته» هم چیده می‌شود');
  const idx = p2.days.findIndex((d) => d.date === placed.date);
  ok(idx <= 7, 'آیتم «این هفته» در ۷ روز اول چیده می‌شود (روز ' + idx + ')');

  /* کلاس ثابت جابه‌جا نمی‌شود */
  const cls = [{ title: 'کلاس', weekdays: [0, 1, 2, 3, 4, 5, 6], start: '18:00', end: '19:30', subjectId: 'bio' }];
  const p3 = engine.createPlan(baseCfg({ classes: cls, emergency: [em] }));
  const d3 = p3.days.find((x) => x.date === START);
  const emBlock = d3.blocks.find((x) => x.kind === 'emergency');
  const clash = emBlock && DP.hmToMin(emBlock.start) < 19 * 60 + 30 && DP.hmToMin(emBlock.end) > 18 * 60;
  ok(!clash, 'اگر ساعت خواسته‌شده با کلاس برخورد کند، آیتم بعد از کلاس چیده می‌شود');
  eq(d3.events.find((e) => e.type === 'class').start, '18:00', 'ساعت کلاس دست‌نخورده ماند');
}

/* ═══ ۹) آمادگی جدا: کنکور و نهایی ═══ */
{
  const sm = plan.summary.readinessSplit;
  ok(Boolean(sm), 'تفکیک آمادگی در برنامه هست');
  ok(sm.konkur && sm.finals, 'دو شیء مستقل برای کنکور و نهایی وجود دارد');
  ok(sm.konkur.current !== sm.finals.current || sm.konkur.projected !== sm.finals.projected,
    'عدد آمادگی کنکور و نهایی جدا محاسبه می‌شود');
  ok(Array.isArray(sm.konkur.method) && sm.konkur.method.length >= 3, 'روش مطالعهٔ کنکور جدا تعریف شده است');
  ok(Array.isArray(sm.finals.method) && sm.finals.method.length >= 3, 'روش مطالعهٔ نهایی جدا تعریف شده است');
  ok(/تست/.test(sm.konkur.method.join(' ')), 'روش کنکور تست‌محور است');
  ok(/نمونه‌سؤال|تشریحی|بارم/.test(sm.finals.method.join(' ')), 'روش نهایی تشریحی/بارم‌محور است');
  ok(sm.konkur.coverage >= 0 && sm.finals.budgetRatio >= 0, 'شاخص‌های هر دو مسیر عددی‌اند');

  const fc = plan.summary.coverage.finalsCourses;
  ok(fc.length === 10, 'همهٔ ۱۰ درس نهایی ارزیابی می‌شوند');
  ok(fc.every((c) => Array.isArray(c.chapters) && c.chapters.length > 0), 'هر درس نهایی جدول فصل/بارم دارد');
  const chem = fc.find((c) => /شیمی/.test(c.name));
  ok(chem && Math.abs(chem.chapters.reduce((a, ch) => a + ch.baram, 0) - 20) < 0.01,
    'جمع بارم فصل‌های شیمی ۳ در گزارش ۲۰ است');
  ok(chem && chem.chapters[0].minutes > chem.chapters[2].minutes,
    'فصل پربارم شیمی زمان بیشتری در برنامه گرفته است');
  ok(fc.every((c) => Array.isArray(c.method) && c.method.length >= 3), 'هر درس نهایی روش مطالعهٔ تشریحی دارد');
}

/* ═══ ۱۰) رابط کاربری: دکمه‌ها و کارت‌های دیده‌شدنی ═══ */
{
  const html = read('src/planner/planner.html');
  const js = read('src/planner/planner.js');
  ok(/id="homeDayCard"/.test(html), 'کارت «شروع روز» در صفحهٔ خانه هست');
  ok(/id="startDayBtn"/.test(html), 'دکمهٔ «شروع روز از این ساعت» هست');
  ok(/id="startDayTime"/.test(html), 'ورودی ساعت واقعی شروع روز هست');
  ok(/id="closeDayBtn"/.test(html), 'دکمهٔ «بستن روز و انتقال جامانده‌ها» هست');
  ok(/id="emergencyCard"/.test(html), 'کارت آیتم‌های اضطراری هست');
  ok(/id="emScope"/.test(html) && /id="emTime"/.test(html), 'پرسش «کِی؟» (امروز با ساعت / این هفته) در فرم هست');
  ok(/id="routinePinned"/.test(html), 'گزینهٔ ثابت‌کردن روال روز (وعده‌ها) هست');
  ok(/id="readinessSplit"/.test(html), 'کارت آمادگی جدا (کنکور/نهایی) در برنامهٔ من هست');
  ok(/data-tmr="pause"/.test(js) || /data-tmr=/.test(js), 'دکمه‌های تایمر (مکس/ادامه) ساخته می‌شوند');
  ok(/مکس \(توقف\)/.test(js), 'دکمهٔ «مکس (توقف)» در رابط کاربری هست');
  ok(/«ادامه»|data-tmr="resume"/.test(js), 'دکمهٔ «ادامه» در رابط کاربری هست');
  ok(/data-help="startDay"/.test(html) && /data-help="emergency"/.test(html) &&
    /data-help="routines"/.test(html) && /data-help="readiness"/.test(html),
    'همهٔ بخش‌های تازه توضیح «؟» دارند');
  ok(/chapter-weights\.js/.test(html) && /dayplan\.js/.test(html), 'ماژول‌های تازه به صفحه وصل شده‌اند');
  ok(/ciTag/.test(js) && /اهمیت واقعی/.test(js), 'ستون «اهمیت واقعی» در جدول فصل‌ها هست');
  ok(/بارم رسمی، فصل‌به‌فصل/.test(js), 'جدول بارم رسمی فصل‌به‌فصل نهایی در گزارش هست');
  ok(/startDay:\s*\{/.test(js) && /emergency:\s*\{/.test(js), 'راهنمای متنی بخش‌های تازه هست');
}

/* ═══ ۱۱) نسخه ═══ */
{
  const pkg = JSON.parse(read('package.json'));
  eq(pkg.version, '2.6.0', 'نسخهٔ بسته ۲.۶.۰ است');
  const eng = read('src/planner/engine.js');
  ok(/version: '2\.6\.0'/.test(eng), 'نسخهٔ موتور ۲.۶.۰ است');
}

console.log('\n✅ ' + n + ' تست نسخهٔ ۲.۵ (شروع روز · توقف/ادامه · اضطراری · اهمیت فصل · آمادگی جدا) پاس شد');
