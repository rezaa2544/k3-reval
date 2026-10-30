/* ═══════════════════════════════════════════════════════════════════
   تست «دستیار اجرایی» — نسخهٔ ۲.۸.۱۴
   ------------------------------------------------------------------
   شکایت کاربر: «مشاوره هوشمند در عمل هیچ کاری انجام نمیده و فقط ادعا است».
   این تست دقیقاً همان جملهٔ کاربر را می‌دهد و بررسی می‌کند که برنامه واقعاً
   عوض شود، نه اینکه فقط متن تولید شود:

     ۱) نیتِ «این تایم را به کتاب دیگر بده» درست فهمیده می‌شود
     ۲) ابزار swap_today_time واقعاً صدا زده می‌شود
     ۳) بلوکِ کتابِ مقصد با همان فصلِ خواسته‌شده در برنامهٔ امروز ظاهر می‌شود
     ۴) کتابِ مبدأ از امروز کنار می‌رود (ولی فصل‌هایش حذف نمی‌شوند)
     ۵) پاسخِ دستیار «قبل/بعد» واقعی نشان می‌دهد (نه ادعا)
     ۶) «حذف کن» → skip، «فقط این فصل را بگذار» → focus
     ۷) «برگردان» → تغییرها برمی‌گردند و برنامه به حالت اول می‌رسد
   اجرا: node test/ai-actions.js
   ═══════════════════════════════════════════════════════════════════ */
const engine = require('../src/planner/engine.js');
const presets = require('../src/planner/presets.js');
const NLU = require('../src/planner/ai/nlu.js');
const TOOLS = require('../src/planner/ai/tools.js');
const brain = require('../src/planner/ai/brain.js');

let pass = 0; let fail = 0;
const errors = [];
const ok = (cond, msg, extra) => {
  if (cond) { pass += 1; }
  else { fail += 1; errors.push(msg + (extra ? ' → ' + extra : '')); console.log('  ✗ ' + msg + (extra ? ' → ' + extra : '')); }
};

/* ─────────── دنیای کوچکِ اپ: تنظیمات + برنامه + ctx ─────────── */
const TODAY = '2026-10-30';
const subjects = presets.subjectsFor('tajrobi').concat(presets.generalFor('دوازدهم'));

function baseCfg() {
  const availability = {}; const startTimes = {};
  ['sat', 'sun', 'mon', 'tue', 'wed', 'thu', 'fri'].forEach((k) => { availability[k] = 4; startTimes[k] = '16:00'; });
  return {
    student: { name: 'آزمون', grade: 'دوازدهم', field: 'tajrobi' },
    startDate: TODAY, examDate: '2027-07-02',
    availability, startTimes,
    sleep: { bedtime: '23:30', wake: '07:00' },
    blockMinutes: 45, breakMinutes: 10, restDay: 5, weeklyMock: true,
    subjects,
  };
}

function makeCtx() {
  const st = { cfg: baseCfg(), plan: null, overrides: [] };
  const rebuild = () => {
    st.cfg.dayOverrides = st.overrides.slice();
    st.plan = engine.createPlan(st.cfg);
  };
  rebuild();
  const dayOf = (date) => (st.plan.days || []).find((d) => d.date === date) || null;
  const blocksOf = (date) => ((dayOf(date) || {}).blocks || []).filter((b) => b.kind !== 'routine');
  const ctx = {
    studentName: 'آزمون',
    get overrides() { return st.overrides; },
    get plan() { return st.plan; },
    readConfig() { return { avgDailyHours: 4, restDay: 5, blockMinutes: 45, timeMode: 'fixed' }; },
    readReport() {
      const c = st.plan.summary.coverage;
      return { coverage: c.coverageRatio, covered: c.coveredChapters, total: c.totalChapters, hours: st.plan.summary.totalHours,
        daysLeft: 245, konkurProjected: 70, finalsProjected: 75, todayCount: blocksOf(TODAY).length,
        todayMinutes: blocksOf(TODAY).reduce((a, b) => a + b.minutes, 0), weak: '', warnings: [] };
    },
    readPlan(scope) {
      if (scope && scope !== 'today') return null;
      const blocks = blocksOf(TODAY);
      return { label: 'امروز', date: TODAY, blocks, count: blocks.length,
        totalMinutes: blocks.reduce((a, b) => a + b.minutes, 0) };
    },
    readChapters() { return { items: [] }; },
    applyDayOverride(spec) {
      const o = Object.assign({}, spec, { date: spec.date || TODAY });
      st.overrides = st.overrides.filter((x) => !(x.date === o.date && x.action === o.action
        && (x.subjectId || null) === (o.subjectId || o.toSubjectId || null)
        && (x.fromSubjectId || null) === (o.fromSubjectId || null)));
      st.overrides.push(o);
      rebuild();
      return { ok: true, message: 'اعمال شد.' };
    },
    clearDayOverrides(date) {
      const d = date || TODAY;
      const had = st.overrides.filter((x) => x.date === d).length;
      if (!had) return { ok: false, message: 'چیزی نبود.' };
      st.overrides = st.overrides.filter((x) => x.date !== d);
      rebuild();
      return { ok: true, message: 'برگشت داده شد.' };
    },
    applyTool(name, args) { return TOOLS.run(name, args, ctx); },
  };
  return ctx;
}

const minutesOf = (blocks, sid) => blocks.filter((b) => b.subjectId === sid).reduce((a, b) => a + (b.minutes || 0), 0);
const hasChapter = (blocks, sid, ch) => blocks.some((b) => b.subjectId === sid && String(b.topicId || '').indexOf('c' + ch) !== -1);

/* ═══ ۱) فهمِ جملهٔ واقعیِ کاربر ═══ */
console.log('\n▌ فهمِ درخواست: «این تایم را به شیمی فصل ۲ اختصاص بده»');
const USER_MSG = 'الان زیست‌شناسی فصل ۴ از کتاب دهم — گردش مواد در بدن رو دارم. می‌خوام این تایم رو به شیمی فصل ۲ دهم اختصاص بدم. برنامه رو آپدیت کن';
{
  const sp = NLU.parseSwapPlan(USER_MSG);
  ok(sp.mode === 'swap', 'نیت = انتقالِ تایم (swap)', sp.mode);
  ok(sp.from && sp.from.subjectId === 'bio', 'درس مبدأ = زیست', sp.from && sp.from.subjectId);
  ok(sp.from && Number(sp.from.chapter) === 4, 'فصل مبدأ = ۴', sp.from && sp.from.chapter);
  ok(sp.to && sp.to.subjectId === 'chem', 'درس مقصد = شیمی', sp.to && sp.to.subjectId);
  ok(sp.to && Number(sp.to.chapter) === 2, 'فصل مقصد = ۲', sp.to && sp.to.chapter);
  ok(NLU.primary(USER_MSG) === 'swap_today', 'نیتِ اصلی swap_today است', NLU.primary(USER_MSG));
}

/* ═══ ۲) اجرای واقعی: برنامه عوض می‌شود ═══ */
console.log('\n▌ اجرا: برنامهٔ امروز واقعاً عوض می‌شود');
{
  const ctx = makeCtx();
  const before = ctx.readPlan('today').blocks;
  const bioBefore = minutesOf(before, 'bio');
  const chemBefore = minutesOf(before, 'chem');
  const res = brain.respond(USER_MSG, ctx);
  const after = ctx.readPlan('today').blocks;

  ok(res.actions.length > 0, 'دستیار ابزار اجرایی صدا زده است', res.actions.map((a) => a.name).join(','));
  ok(res.actions.some((a) => a.name === 'swap_today_time' && a.result && a.result.ok), 'ابزار swap_today_time با موفقیت اجرا شد');
  ok(ctx.overrides.length === 1 && ctx.overrides[0].action === 'swap', 'تغییر در وضعیتِ برنامه ثبت شد');
  ok(hasChapter(after, 'chem', 2), 'فصل ۲ شیمی الان در برنامهٔ امروز است');
  ok(minutesOf(after, 'bio') === 0, 'زیست امروز کنار رفت', minutesOf(after, 'bio'));
  ok(minutesOf(after, 'chem') >= chemBefore, 'شیمی وقتِ بیشتری گرفت',
    chemBefore + ' → ' + minutesOf(after, 'chem'));
  ok(bioBefore > 0, 'قبل از تغییر زیست وقت داشت (پیش‌شرط)');
  /* فصل‌ها حذف نشده‌اند: در برنامهٔ فردا باید برگردند */
  const tomorrow = (ctx.plan.days || []).find((d) => d.date === '2026-10-31');
  const bioTomorrow = ((tomorrow && tomorrow.blocks) || []).some((b) => b.subjectId === 'bio');
  ok(bioTomorrow, 'فصل‌های زیست حذف نشده‌اند و فردا برمی‌گردند');

  /* پاسخ باید «قبل/بعد» واقعی داشته باشد، نه ادعا */
  ok(/انجام شد/.test(res.text), 'پاسخ با تأییدِ انجام کار شروع می‌شود');
  ok(/قبل:/.test(res.text) && /بعد:/.test(res.text), 'پاسخ مقایسهٔ قبل/بعد را نشان می‌دهد');
  ok(res.text.indexOf('🆕') !== -1, 'بلوکِ تازه در فهرستِ بعد علامت خورده است');
  ok(res.text.indexOf('ردپای گازها') !== -1 || /فصل 2/.test(res.text), 'عنوانِ فصلِ تازه در پاسخ آمده است');
  ok(/برگردان/.test((res.chips || []).join(' ')), 'چیپِ بازگرداندن پیشنهاد می‌شود');
}

/* ═══ ۳) حذفِ یک درس از امروز ═══ */
console.log('\n▌ «زیست را امروز حذف کن» → حذفِ واقعیِ همان درس');
{
  const ctx = makeCtx();
  const res = brain.respond('زیست رو امروز حذف کن', ctx);
  const after = ctx.readPlan('today').blocks;
  ok(res.actions.some((a) => a.name === 'skip_today_subject'), 'ابزار skip_today_subject صدا زده شد');
  ok(minutesOf(after, 'bio') === 0, 'زیست از امروز حذف شد');
  ok(after.length > 0, 'بقیهٔ برنامه همچنان چیده شده است');
}

/* ═══ ۴) فقط یک فصل برای امروز ═══ */
console.log('\n▌ «شیمی فصل ۲ را امروز بگذار» → فصل در برنامه می‌آید');
{
  const ctx = makeCtx();
  const res = brain.respond('شیمی فصل ۲ رو امروز بذار', ctx);
  const after = ctx.readPlan('today').blocks;
  ok(res.actions.some((a) => /focus_today_chapter|swap_today_time/.test(a.name)), 'ابزار اجرایی صدا زده شد', res.actions.map((a) => a.name).join(','));
  ok(hasChapter(after, 'chem', 2), 'فصل ۲ شیمی در برنامهٔ امروز است');
}

/* ═══ ۵) بازگرداندن ═══ */
console.log('\n▌ «تغییر امروز را برگردان» → برنامه به حالت اول برمی‌گردد');
{
  const ctx = makeCtx();
  const sig = (blocks) => blocks.map((b) => b.kind + ':' + b.subjectId + ':' + b.minutes).join('|');
  const original = sig(ctx.readPlan('today').blocks);
  brain.respond(USER_MSG, ctx);
  const changed = sig(ctx.readPlan('today').blocks);
  ok(changed !== original, 'بعد از درخواست، برنامه تغییر کرده است');
  const res = brain.respond('تغییر امروز رو برگردان', ctx);
  ok(res.actions.some((a) => a.name === 'undo_today_changes'), 'ابزار undo صدا زده شد');
  ok(sig(ctx.readPlan('today').blocks) === original, 'برنامه دقیقاً به حالت اول برگشت');
}

/* ═══ ۶) ابزارها بدون دستیار هم کار می‌کنند (مسیر LLM) ═══ */
console.log('\n▌ ابزارها مستقل از متن هم کار می‌کنند (مسیر مدلِ زبانی)');
{
  const ctx = makeCtx();
  const out = TOOLS.run('swap_today_time', { fromSubjectId: 'bio', toSubjectId: 'chem', toChapter: 2, minutes: 45 }, ctx);
  ok(out.ok, 'swap_today_time از مسیر tool-calling موفق است', out.message);
  ok(hasChapter(ctx.readPlan('today').blocks, 'chem', 2), 'نتیجهٔ ابزار در برنامه دیده می‌شود');
  const llm = TOOLS.forLLM().map((t) => t.function.name);
  ['swap_today_time', 'focus_today_chapter', 'skip_today_subject', 'undo_today_changes'].forEach((n) => {
    ok(llm.indexOf(n) !== -1, 'ابزار ' + n + ' در فهرستِ مدلِ زبانی هست');
  });
}

/* ═══ ۷) هیچ «ادعای بدون اجرا» پذیرفته نیست ═══ */
console.log('\n▌ قاعدهٔ سخت: هر جملهٔ اجرایی باید ابزار صدا بزند');
{
  const cases = [
    'به جای زیست شیمی فصل ۲ بخونم',
    'زیست رو حذف کن شیمی فصل ۲ بذار',
    'این تایم رو به شیمی فصل ۲ اختصاص بده',
  ];
  cases.forEach((msg) => {
    const ctx = makeCtx();
    const sig = (bs) => bs.map((b) => b.kind + ':' + b.subjectId + ':' + (b.topicId || '') + ':' + b.minutes).join('|');
    const before = sig(ctx.readPlan('today').blocks);
    const res = brain.respond(msg, ctx);
    const after = sig(ctx.readPlan('today').blocks);
    ok(res.actions.length > 0 && before !== after, '«' + msg + '» واقعاً برنامه را عوض کرد');
  });
}

console.log('\n════════════════════════════════════════════════════════════════');
if (fail === 0) console.log(`✅ ${pass} بررسی «دستیار اجرایی» (نسخهٔ ۲.۸.۱۴) پاس شد`);
else {
  console.log(`❌ ${pass} ✅ / ${fail} ❌ — ایرادها:`);
  errors.forEach((e) => console.log('   • ' + e));
  process.exitCode = 1;
}
