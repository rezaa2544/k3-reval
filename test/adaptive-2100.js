/* ═══════════════════════════════════════════════════════════════════════
   تست‌های هستهٔ هوشِ خودتطبیق — نسخهٔ ۲.۱۰.۰
   ───────────────────────────────────────────────────────────────────────
   درخواستِ کاربر (دور ۲۰):
     «هستهٔ هوش باید با شرایط خودتطبیق باشد و با مرورِ زمان بسته به عملکرد و
      بازخوردِ دانش‌آموز، هوشِ خودش را بالا ببرد و تجربه کسب کند؛ از کاربر در
      شرایطِ مختلف سؤال بپرسد (مثلاً فصلی که ۲ ساعت برآورد شد ۳ ساعت طول کشید —
      چرا؟)؛ سطحِ استعداد را بشناسد و همیشه یک پله بالاتر از سطحِ فعلی فشار
      بدهد؛ و تجربه‌هایش را به‌صورت گزارش به مخزن بدهد.»

   این فایل همان خواسته‌ها را عددی می‌سنجد:
     ۱) وضعیتِ پیش‌فرض خنثی است (سطح ۳، ضریب ۱) — بدونِ داده چیزی خراب نمی‌شود
     ۲) سطح‌سنجی: ۶ پرسش × ۴ گزینه → سطحِ ۰..۶
     ۳) مشاهدهٔ واقعیت: نسبتِ زمانِ واقعی به برآورد، ضریبِ سرعت را می‌سازد
     ۴) اختلافِ >۳۵٪ ⇒ پرسشِ «چرا؟» ساخته می‌شود (و برای همان بلوک تکرار نمی‌شود)
     ۵) پاسخِ «فصل سخت‌تر بود» ⇒ سختیِ همان درس بالا می‌رود
     ۶) پاسخِ «وسطِ کار قطع شدم» ⇒ نمونه از آمار خارج می‌شود (یادگیریِ آلوده نه)
     ۷) پاسخِ «حواس‌پرتی» ⇒ طولِ جلسه کم می‌شود، سختیِ درس بالا نمی‌رود
     ۸) فشارِ یک‌پله‌بالاتر: ۶ نمونهٔ سریع ⇒ سطح +۱ · ۶ نمونهٔ کند ⇒ سطح −۱
     ۹) سطحی که کاربر خودش انتخاب کرده، با داده عوض نمی‌شود
    ۱۰) موتور: ضریبِ سرعتِ ریاضی ۱٫۳ ⇒ زمانِ ریاضی در برنامه بیشتر می‌شود
    ۱۱) موتور: سطحِ ۶ ⇒ روزها پرتر، سطحِ ۰ ⇒ محافظه‌کارتر (هرگز از ساعتِ اعلامی بیشتر نه)
    ۱۲) برنامه با/بدونِ هسته قطعی است (دو ساخت = یک خروجی)
    ۱۳) گزارشِ تجربه: متنِ فارسی + بلوکِ JSON + پیشنهادِ تغییرِ پارامتر
    ۱۴) ورودیِ خراب/ناقص هرگز استثنا نمی‌دهد
   اجرا: node test/adaptive-2100.js
   ═══════════════════════════════════════════════════════════════════════ */
const AD = require('../src/planner/adaptive.js');
const engine = require('../src/planner/engine.js');
const presets = require('../src/planner/presets.js');

let pass = 0; let fail = 0;
const errors = [];
const ok = (cond, msg, extra) => {
  if (cond) { pass += 1; return; }
  fail += 1;
  errors.push(msg + (extra !== undefined ? ' → ' + extra : ''));
  console.log('  ✗ ' + msg + (extra !== undefined ? ' → ' + extra : ''));
};

/* ─────────── ۱) وضعیتِ خنثی ─────────── */
console.log('\n▌ وضعیتِ پیش‌فرض: هسته بدونِ داده هیچ‌چیز را عوض نمی‌کند');
{
  const s = AD.defaultState();
  ok(s.level === 3, 'سطحِ پیش‌فرض ۳ است', s.level);
  ok(Math.abs(AD.loadFactor(s) - 0.93) < 1e-9, 'ضریبِ بارِ پیش‌فرض ۰٫۹۳ است', AD.loadFactor(s));
  ok(AD.paceFor(s, 'math') === 1, 'بدونِ نمونه، ضریبِ درس ۱ است', AD.paceFor(s, 'math'));
  const cfg = AD.engineConfig(s);
  ok(Object.keys(cfg.pace).length === 0, 'بدونِ نمونه، هیچ ضریبِ درسی به موتور نمی‌رود');
  ok(cfg.samples === 0, 'تعدادِ نمونه ۰ است');
  ok(AD.openQuestions(s).length === 0, 'هیچ پرسشِ بازی نیست');
  ok(AD.summary(s).line.indexOf('هنوز نمونه') !== -1, 'خلاصه می‌گوید نمونه‌ای نیست', AD.summary(s).line);
}

/* ─────────── ۲) سطح‌سنجی ─────────── */
console.log('\n▌ سطح‌سنجی: ۶ پرسش، سطحِ ۰ تا ۶');
{
  const q = AD.quizQuestions();
  ok(q.length === 6, 'شش پرسش وجود دارد', q.length);
  ok(q.every((x) => x.options.length === 4), 'هر پرسش چهار گزینه دارد');
  ok(q.every((x) => x.options.every((o) => typeof o.score === 'number')), 'هر گزینه امتیاز دارد');

  const all = (oid) => { const a = {}; q.forEach((x) => { a[x.id] = oid; }); return a; };
  const best = AD.applyQuiz(AD.defaultState(), all('d'));
  ok(best.level === 6, 'همهٔ گزینه‌های «بهترین» ⇒ سطح ۶', best.level);
  const worst = AD.applyQuiz(AD.defaultState(), all('a'));
  ok(worst.level === 0, 'همهٔ گزینه‌های «ضعیف» ⇒ سطح ۰', worst.level);
  const mid = AD.applyQuiz(AD.defaultState(), all('c'));
  ok(mid.level >= 3 && mid.level <= 5, 'گزینهٔ «میانی» ⇒ سطحِ میانی', mid.level);
  ok(best.state.levelSetBy === 'quiz', 'منبعِ سطح «آزمون» ثبت می‌شود');
  ok(best.state.levelLog.length === 1, 'تغییرِ سطح در تاریخچه ثبت می‌شود');

  const partial = AD.applyQuiz(AD.defaultState(), { q1: 'd', q2: 'c' });
  ok(partial.answered === 2 && partial.confidence === Math.round((2 / 6) * 10) / 10,
    'پاسخِ ناقص: اطمینان کمتر از ۱', partial.confidence);
  ok(partial.level >= 3, 'دو پاسخِ خوب هم سطح را بالا می‌برد', partial.level);
  const none = AD.applyQuiz(AD.defaultState(), {});
  ok(none.answered === 0 && none.level === 3, 'بدونِ پاسخ، سطح دست‌نخورده می‌ماند');
}

/* ─────────── ۳) مشاهدهٔ واقعیت ─────────── */
console.log('\n▌ یادگیری از واقعیت: نسبتِ زمانِ واقعی به برآورد');
{
  let s = AD.defaultState();
  const r1 = AD.observe(s, { subjectId: 'math', topicId: 'm18', chapter: 18, planned: 45, actual: 90, done: true });
  ok(r1.ratio === 2, 'دقیقهٔ واقعی ۹۰ از ۴۵ ⇒ نسبت ۲', r1.ratio);
  ok(r1.mismatch === true, 'اختلافِ بزرگ ⇒ ناهم‌خوانی علامت می‌خورد');
  ok(r1.ask && r1.ask.direction === 'long', 'پرسش با جهتِ «بیشتر طول کشید» ساخته می‌شود');
  ok(r1.state.obs.length === 1, 'نمونه در حافظه ثبت می‌شود');
  ok(r1.state.pace.math > 1, 'ضریبِ سرعتِ ریاضی بالا می‌رود', r1.state.pace.math);

  /* همان بلوک دوباره ثبت شود ⇒ پرسشِ تکراری ساخته نمی‌شود */
  const r2 = AD.observe(r1.state, { subjectId: 'math', topicId: 'm18', chapter: 18, planned: 45, actual: 90, done: true });
  ok(AD.openQuestions(r2.state).length === 1, 'پرسشِ تکراری برای همان بلوک ساخته نمی‌شود', AD.openQuestions(r2.state).length);

  /* بلوکِ سرِ وقت: نه پرسش، نه تغییرِ شدید */
  const r3 = AD.observe(s, { subjectId: 'phys', planned: 45, actual: 46, done: true });
  ok(r3.mismatch === false && !r3.ask, 'بلوکِ سرِ وقت پرسشی نمی‌سازد');
  ok(Math.abs(r3.state.pace.phys - 1) < 0.1, 'ضریبِ درسِ سرِ وقت نزدیک ۱ می‌ماند', r3.state.pace.phys);

  /* بدونِ زمانِ واقعی هیچ یادگیری‌ای رخ نمی‌دهد */
  const r4 = AD.observe(s, { subjectId: 'chem', planned: 45, actual: 0 });
  ok(r4.learned === false && r4.state.obs.length === 0, 'بلوکِ انجام‌نشده یادگیری تولید نمی‌کند');

  /* سقفِ ضریب */
  let t = AD.defaultState();
  for (let i = 0; i < 40; i += 1) t = AD.observe(t, { subjectId: 'bio', planned: 30, actual: 300, done: true }).state;
  ok(t.pace.bio <= 1.8, 'ضریبِ سرعت هرگز از ۱٫۸ بیرون نمی‌زند', t.pace.bio);
  ok(AD.paceFor(t, 'bio') <= 1.9, 'ضریبِ نهاییِ موتور سقف دارد', AD.paceFor(t, 'bio'));
}

/* ─────────── ۴) پاسخ به «چرا؟» ─────────── */
console.log('\n▌ پاسخِ دانش‌آموز: هر دلیل یک اثرِ مشخص دارد');
{
  const base = AD.defaultState();
  const o = AD.observe(base, { subjectId: 'math', planned: 60, actual: 120, done: true });
  const qid = o.ask.id;

  const hard = AD.answerQuestion(o.state, qid, 'hard');
  ok(hard.ok === true, 'پاسخ پذیرفته می‌شود');
  ok(hard.state.difficulty.math > 1, '«سخت‌تر بود» ⇒ سختیِ ریاضی بالا می‌رود', hard.state.difficulty.math);
  ok(hard.state.reasons.hard === 1, 'شمارشِ دلیل ثبت می‌شود');
  ok(/سختی/.test(hard.message), 'پیام می‌گوید چه چیزی یاد گرفت', hard.message);
  ok(AD.openQuestions(hard.state).length === 0, 'پرسش بسته می‌شود');

  const o2 = AD.observe(base, { subjectId: 'math', planned: 60, actual: 120, done: true });
  const interrupt = AD.answerQuestion(o2.state, o2.ask.id, 'interrupt');
  ok(interrupt.state.obs.length === 0, '«قطع شدم» ⇒ نمونه از آمار حذف می‌شود', interrupt.state.obs.length);
  ok(Math.abs(interrupt.state.pace.math - 1) < 0.05, 'ضریب به حالتِ خنثی برمی‌گردد', interrupt.state.pace.math);

  const o3 = AD.observe(base, { subjectId: 'phys', planned: 60, actual: 100, done: true });
  const att = AD.answerQuestion(o3.state, o3.ask.id, 'attention');
  ok(att.state.sessionBias < 0, '«حواس‌پرتی» ⇒ جلسه‌ها کوتاه‌تر می‌شوند', att.state.sessionBias);
  ok(AD.sessionAdd(att.state) < AD.sessionAdd(AD.defaultState()), 'اثرِ حواس‌پرتی روی طولِ جلسه دیده می‌شود');

  const o4 = AD.observe(base, { subjectId: 'chem', planned: 60, actual: 150, done: true });
  const est = AD.answerQuestion(o4.state, o4.ask.id, 'estimate');
  ok(est.state.pace.chem < o4.state.pace.chem, '«برآورد زیاد بود» ⇒ ضریبِ درس پایین می‌آید',
    o4.state.pace.chem + ' → ' + est.state.pace.chem);

  const bad = AD.answerQuestion(o.state, 'QUX', 'hard');
  ok(bad.ok === false && /پیدا نشد/.test(bad.message), 'پرسشِ ناموجود ⇒ پیامِ روشن');
  const bad2 = AD.answerQuestion(o.state, qid, 'nonsense');
  ok(bad2.ok === false && /نامعتبر/.test(bad2.message), 'دلیلِ نامعتبر ⇒ پیامِ روشن');
  ok(hard.state.reasons.hard === 1, 'وضعیتِ قبلی دست‌نخورده می‌ماند (immutable)');
}

/* ─────────── ۵) فشارِ یک پله بالاتر ─────────── */
console.log('\n▌ فشار: همیشه یک پله بالاتر از سطحِ فعلی');
{
  let s = AD.defaultState();
  const d0 = AD.levelDecision(s);
  ok(d0.ready === false, 'با کمتر از ۶ نمونه تصمیمی گرفته نمی‌شود');

  for (let i = 0; i < 6; i += 1) {
    s = AD.observe(s, { subjectId: 'math', planned: 50, actual: 40, done: true }).state;
  }
  const up = AD.applyLevelDecision(s);
  ok(up.change === 1, '۶ نمونهٔ سریع و کامل ⇒ یک پله بالا', up.change);
  ok(up.state.level === 4, 'سطح از ۳ به ۴ می‌رود', up.state.level);
  ok(up.state.levelLog.length === 1, 'تغییر در تاریخچه ثبت می‌شود');
  ok(AD.loadFactor(up.state) > AD.loadFactor(s), 'سطحِ بالاتر ⇒ بارِ روزانه بیشتر');

  let t = AD.defaultState();
  for (let i = 0; i < 6; i += 1) {
    t = AD.observe(t, { subjectId: 'math', planned: 40, actual: 70, done: false }).state;
  }
  const down = AD.applyLevelDecision(t);
  ok(down.change === -1, '۶ نمونهٔ کند/ناتمام ⇒ یک پله پایین', down.change);
  ok(down.state.level === 2, 'سطح از ۳ به ۲ می‌رود', down.state.level);

  /* سطحِ دستیِ کاربر دست‌نخورده می‌ماند */
  const manual = AD.setLevel(t, 5, 'user');
  ok(manual.level === 5 && manual.levelSetBy === 'user', 'سطحِ انتخابیِ کاربر ثبت می‌شود');
  const keep = AD.applyLevelDecision(manual);
  ok(keep.change === 0 && keep.state.level === 5, 'با سطحِ دستی، هسته سطح را عوض نمی‌کند');

  /* جلسه‌های بلندتر با سطحِ بالاتر */
  const lv0 = AD.sessionAdd(AD.setLevel(AD.defaultState(), 0, 'user'));
  const lv6 = AD.sessionAdd(AD.setLevel(AD.defaultState(), 6, 'user'));
  ok(lv6 > lv0, 'سطحِ بالاتر ⇒ جلسه‌های بلندتر (فشارِ بیشتر بدونِ گذشتن از سقفِ ساعت)', lv0 + '→' + lv6);
}

/* ─────────── ۶) اتصال به موتور ─────────── */
console.log('\n▌ موتور: ضریبِ یادگرفته‌شده و سطح، در برنامه اثر می‌گذارد');
const pad = (n) => String(n).padStart(2, '0');
const iso = (d) => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
function mkPlan(extra) {
  const availability = {}; const startTimes = {};
  ['sat', 'sun', 'mon', 'tue', 'wed', 'thu', 'fri'].forEach((k) => { availability[k] = 4; startTimes[k] = '16:00'; });
  return engine.createPlan(Object.assign({
    student: { name: 'تست', grade: 'دوازدهم', field: 'tajrobi', chronotype: 'evening' },
    startDate: iso(new Date(2026, 10, 5)), examDate: iso(new Date(2027, 5, 20)),
    sleep: { bedtime: '23:30', wake: '07:00' },
    availability, startTimes, blockMinutes: 45, breakMinutes: 10, restDay: 7, weeklyMock: false,
    classes: [], exams: [], subjects: presets.subjectsFor('tajrobi'),
  }, extra || {}));
}
function mathMinutes(plan) {
  let m = 0;
  plan.days.forEach((d) => d.blocks.forEach((b) => { if (b.subjectId === 'math') m += b.minutes || 0; }));
  return m;
}
function avgDay(plan) {
  const tot = plan.days.reduce((a, d) => a + (d.plannedMinutes || 0), 0);
  return tot / Math.max(1, plan.days.length);
}
{
  const base = mkPlan();
  ok(base.summary.adaptive && base.summary.adaptive.active === false, 'بدونِ هسته، برنامه در حالتِ خنثی است');

  /* ضریبِ سرعت: ریاضی ۱٫۳ */
  let s = AD.defaultState();
  for (let i = 0; i < 5; i += 1) s = AD.observe(s, { subjectId: 'math', planned: 45, actual: 60, done: true }).state;
  const cfg = AD.engineConfig(s);
  ok(cfg.pace.math > 1.1, 'ضریبِ ریاضی از داده ساخته شده', cfg.pace.math);

  const paced = mkPlan({ adaptive: cfg });
  const m0 = mathMinutes(base); const m1 = mathMinutes(paced);
  ok(m1 > m0, 'ریاضیِ بیشتر از برآورد ⇒ زمانِ ریاضی در برنامه больше می‌شود', m0 + ' → ' + m1);
  ok(m1 >= Math.round(m0 * 1.08), 'افزایشِ زمانِ ریاضی معنادار است (≥۸٪)', Math.round((m1 / m0) * 100) / 100);
  ok(paced.summary.adaptive.active === true, 'برنامه اعلام می‌کند هسته فعال است');
  ok(paced.summary.adaptive.line.indexOf('×') !== -1, 'خلاصه، ضریبِ درسی را نشان می‌دهد', paced.summary.adaptive.line);
  ok(paced.summary.adaptive.samples === 5, 'تعدادِ نمونه در خلاصه هست', paced.summary.adaptive.samples);

  /* سطح: ۰ در برابر ۶ */
  const lowState = AD.setLevel(AD.defaultState(), 0, 'user');
  const highState = AD.setLevel(AD.defaultState(), 6, 'user');
  const low = mkPlan({ adaptive: AD.engineConfig(lowState) });
  const high = mkPlan({ adaptive: AD.engineConfig(highState) });
  ok(avgDay(high) > avgDay(low), 'سطحِ ۶ روزهای پرتر از سطحِ ۰ می‌سازد',
    Math.round(avgDay(low)) + ' → ' + Math.round(avgDay(high)));
  ok(low.days.every((d) => (d.plannedMinutes || 0) <= 4 * 60 + 30), 'سطحِ ۰ هم هرگز از ساعتِ اعلامی نمی‌گذرد');
  ok(high.days.every((d) => (d.plannedMinutes || 0) <= 4 * 60 + 30), 'سطحِ ۶ هم هرگز از ساعتِ اعلامی نمی‌گذرد');
  const learnHigh = high.days.filter((d) => d.blocks.some((b) => b.kind === 'learn')).length;
  ok(learnHigh > 0, 'سطحِ ۶ همچنان بلوکِ یادگیری دارد', learnHigh);

  /* قطعیت */
  const a = mkPlan({ adaptive: AD.engineConfig(s) });
  const b = mkPlan({ adaptive: AD.engineConfig(s) });
  ok(JSON.stringify(a.days) === JSON.stringify(b.days), 'دو ساخت با همان هسته = همان برنامه');

  /* ورودیِ خراب */
  const weird = mkPlan({ adaptive: { level: 'x', loadFactor: 99, sessionAdd: 'NaN', pace: { math: -5, phys: 'a' } } });
  ok(weird && weird.days.length > 0, 'پارامترِ خرابِ هسته ⇒ برنامه سالم ساخته می‌شود');
  const weird2 = mkPlan({ adaptive: null });
  ok(weird2.summary.adaptive.active === false, 'هستهٔ null ⇒ حالتِ خنثی');
}

/* ─────────── ۷) گزارشِ تجربه ─────────── */
console.log('\n▌ گزارشِ تجربه: تجربه‌ها به مخزن برمی‌گردند');
{
  let s = AD.defaultState();
  for (let i = 0; i < 4; i += 1) s = AD.observe(s, { subjectId: 'math', planned: 45, actual: 63, done: true }).state;
  for (let i = 0; i < 3; i += 1) s = AD.observe(s, { subjectId: 'bio', planned: 45, actual: 36, done: true }).state;
  const q = AD.openQuestions(s)[0];
  s = AD.answerQuestion(s, q.id, 'hard').state;

  const rows = AD.subjectRows(s);
  ok(rows.length === 2, 'گزارش به‌ازای هر درس یک ردیف دارد', rows.length);
  const mathRow = rows.filter((r) => r.sid === 'math')[0];
  ok(mathRow.n === 4 && Math.abs(mathRow.avgRatio - 1.4) < 0.05, 'نسبتِ میانگینِ ریاضی ۱٫۴ است', mathRow.avgRatio);

  const deltas = AD.suggestParamDeltas(s);
  ok(deltas.subjects.math && deltas.subjects.math.timeMultiplier === 1.4,
    'پیشنهادِ پارامتر برای ریاضی = ۱٫۴', JSON.stringify(deltas.subjects.math));
  ok(deltas.subjects.bio && deltas.subjects.bio.timeMultiplier < 1, 'زیست (زودتر تمام شد) ضریبِ کمتر از ۱ می‌گیرد');
  ok(s.reasons.hard === 1, 'شمارشِ دلیلِ «سخت‌تر بود» در حافظه هست', JSON.stringify(s.reasons));

  const md = AD.experienceReport(s, { appVersion: '2.10.0', grade: 'دوازدهم', field: 'tajrobi', hours: 6 });
  ok(md.indexOf('# گزارشِ تجربهٔ هستهٔ هوشِ خودتطبیق') !== -1, 'گزارش عنوان دارد');
  ok(md.indexOf('| درس | نمونه |') !== -1, 'جدولِ درس‌ها در گزارش هست');
  ok(md.indexOf('```json') !== -1, 'بلوکِ JSONِ ماشینی در گزارش هست');
  ok(md.indexOf('"timeMultiplier": 1.4') !== -1, 'پیشنهادِ پارامتر در بلوکِ JSON آمده');
  ok(md.indexOf('2.10.0') !== -1, 'نسخهٔ برنامه در گزارش ثبت می‌شود');
  ok(md.indexOf('نام') === -1 || md.indexOf('هیچ نام') !== -1, 'گزارش اعلام می‌کند اطلاعاتِ شناسایی ندارد');

  const empty = AD.experienceReport(AD.defaultState(), {});
  ok(empty.indexOf('هنوز نمونه‌ای') !== -1, 'گزارشِ خالی هم معتبر است');
  const sum = AD.summary(s);
  ok(sum.samples === 7 && sum.subjects === 2, 'خلاصه تعدادِ نمونه و درس‌ها را می‌گوید', sum.samples + '/' + sum.subjects);
  ok(sum.worst && sum.worst.sid === 'math', 'خلاصه بدترین اختلاف را نشان می‌دهد', sum.worst && sum.worst.sid);
  ok(sum.openQuestions === 0, 'پرسشِ پاسخ‌داده‌شده در شمارشِ بازها نیست');
}

/* ─────────── ۸) ورودیِ خراب ─────────── */
console.log('\n▌ ورودیِ خراب هرگز استثنا نمی‌دهد');
{
  [null, undefined, 0, 'x', [], { pace: 5 }, { level: 99, obs: 'no' }, { asks: [{}, 5] }].forEach((bad) => {
    let threw = false;
    try {
      const n = AD.normalize(bad);
      AD.summary(n);
      AD.engineConfig(n);
      AD.experienceReport(n, null);
      AD.levelDecision(n);
      AD.openQuestions(n);
    } catch (e) { threw = true; }
    ok(!threw, 'normalize/گزارش با ورودیِ ' + JSON.stringify(bad) + ' نمی‌شکند');
  });
  const n = AD.normalize({ level: 99, pace: { math: 'x' }, obs: new Array(500).fill({ ratio: 1 }) });
  ok(n.level === 6, 'سطحِ خارج از بازه به ۶ محدود می‌شود', n.level);
  ok(n.obs.length <= 400, 'حافظهٔ نمونه‌ها سقف دارد', n.obs.length);
}

console.log('\n════════════════════════════════════════════════════════════════════');
console.log((fail === 0 ? '✅ ' : '❌ ') + pass + ' ✅ / ' + fail + ' ❌' +
  (fail === 0 ? ' — هستهٔ هوشِ خودتطبیقِ ۲.۱۰.۰ پاس شد' : ' — ایرادها:'));
errors.forEach((e) => console.log('   • ' + e));
console.log('════════════════════════════════════════════════════════════════════');
process.exit(fail === 0 ? 0 : 1);
