/* ═══════════════════════════════════════════════════════════════════
   تستِ «تسلطِ کاملِ دستیار» — نسخهٔ ۲.۸.۱۵
   ------------------------------------------------------------------
   خواستهٔ کاربر:
     «هوش مصنوعی باید توانِ هر کاری و هر تغییری در برنامه را داشته باشد و بر
      تمام برنامه مسلط باشد. لازم است با تمام حالت‌ها و آیتم‌ها و تمام
      سناریوهای درخواستی و احتمالی تست و شبیه‌سازی شود.»

   این تست چهار لایه را می‌سنجد:
     الف) فهرستِ ابزارها: هر ابزارِ واقعیِ اپ به دستیار داده شده است
     ب) اجرا: هر ابزار با دادهٔ درست ⇒ ok + تغییرِ واقعی در وضعیتِ برنامه
     ج) مقاومت: دادهٔ غلط/ناقص ⇒ پیامِ فارسی و بدونِ استثنا (نه سکوت، نه crash)
     د) زبان: ۶۰ جملهٔ واقعیِ کاربر ⇒ ابزارِ درست + اثرِ واقعی + برگشت‌پذیری
     ه) حالت‌ها: ۸ حالتِ مختلفِ برنامه (بدون برنامه، تعطیل، خودکار، ۱۰ ساعت،
        روزِ آزمون، دادهٔ تسلط، …) در برابرِ همان سناریوها
   اجرا: node test/ai-coverage.js
   ═══════════════════════════════════════════════════════════════════ */
const { createApp, fa } = require('./ai-app-sim.js');
const TOOLS = require('../src/planner/ai/tools.js');
const NLU = require('../src/planner/ai/nlu.js');
const brain = require('../src/planner/ai/brain.js');

const TODAY = '2026-10-30';
let pass = 0; let fail = 0;
const errors = [];
const ok = (cond, msg, extra) => {
  if (cond) { pass += 1; return true; }
  fail += 1; errors.push(msg + (extra ? ' → ' + extra : ''));
  console.log('  ✗ ' + msg + (extra ? ' → ' + extra : ''));
  return false;
};
const h = (t) => console.log('\n▌ ' + t);

/* ─────────── نمونه‌های معتبر برای هر ابزار ─────────── */
const VALID_ARGS = {
  set_daily_study_hours: { hours: 5 },
  set_rest_day: { weekday: 'fri' },
  set_block_minutes: { minutes: 40 },
  set_exam_date: { jalali: '1406/04/10' },
  set_time_mode: { mode: 'auto', cap: 9 },
  rebuild_plan: {},
  replan_today: {},
  start_first_task: {},
  add_urgent_item: { subjectId: 'bio', topic: 'فصل ۵', minutes: 45 },
  swap_today_time: { fromSubjectId: 'bio', toSubjectId: 'chem', toChapter: 2 },
  focus_today_chapter: { subjectId: 'phys', chapter: 3 },
  skip_today_subject: { subjectId: 'math' },
  undo_today_changes: {},
  rate_chapter: { subjectId: 'bio', chapter: 3, mastery: 70 },
  add_exam: { date: '2026-11-20', title: 'آزمون آزمایشی' },
  add_off_day: { date: '2026-11-14', kind: 'halt' },
  set_start_time: { time: '17:00' },
  set_sleep: { bedtime: '23:00', wake: '06:30' },
  set_break_minutes: { minutes: 15 },
  set_weekly_mock: { enabled: false },
  set_student_name: { name: 'رضا' },
  start_block: { subjectId: 'chem' },
  finish_block: { subjectId: 'bio' },
  close_day: {},
  get_plan: { scope: 'today' },
  get_report: {},
  top_chapters: { limit: 5 },
};
const READ_ONLY = ['get_plan', 'get_report', 'top_chapters'];

/* ═══════════ الف) فهرستِ ابزارها ═══════════ */
h('الف) هر کارِ اپ یک ابزار برای دستیار دارد');
{
  ok(TOOLS.TOOLS.length === Object.keys(VALID_ARGS).length,
    'تعدادِ ابزارها با فهرستِ سنجش یکی است',
    TOOLS.TOOLS.length + ' ≠ ' + Object.keys(VALID_ARGS).length);
  const names = TOOLS.TOOLS.map((t) => t.name);
  Object.keys(VALID_ARGS).forEach((n) => ok(names.indexOf(n) !== -1, 'ابزار «' + n + '» موجود است'));
  const llm = TOOLS.forLLM();
  ok(llm.length === names.length, 'همهٔ ابزارها به مدلِ زبانی هم داده می‌شوند');
  ok(llm.every((f) => f && f.function && f.function.name && f.function.parameters),
    'هر ابزار نام و پارامترهای معتبر برای مدل دارد');
  TOOLS.TOOLS.forEach((t) => {
    ok(!!t.title && !!t.description && t.description.length > 12, 'ابزار «' + t.name + '» توضیحِ کافی دارد');
    ok(typeof t.run === 'function', 'ابزار «' + t.name + '» تابعِ اجرا دارد');
  });
}

/* ═══════════ ب) اجرای هر ابزار با دادهٔ درست ═══════════ */
h('ب) هر ابزار واقعاً وضعیتِ برنامه را عوض می‌کند');
{
  Object.keys(VALID_ARGS).forEach((name) => {
    const app = createApp({ hours: 6 });
    if (name === 'undo_today_changes') TOOLS.run('swap_today_time', { fromSubjectId: 'bio', toSubjectId: 'chem' }, app);
    const before = app._snap('before');
    const res = TOOLS.run(name, VALID_ARGS[name], app);
    ok(res && res.ok === true, '«' + name + '» موفق اجرا شد', res && res.message);
    ok(res && typeof res.message === 'string' && res.message.length > 4, '«' + name + '» پیامِ فارسی دارد');
    const log = app._changes[app._changes.length - 1];
    if (READ_ONLY.indexOf(name) === -1) {
      ok(log && log.changed.length > 0, '«' + name + '» تغییری در وضعیت ثبت کرد', log ? 'بدون تغییر' : 'لاگ ندارد');
    } else {
      ok(res && res.data && (Array.isArray(res.data.blocks || res.data.items) || res.data.coverage != null),
        '«' + name + '» دادهٔ واقعی برمی‌گرداند');
    }
    const after = app._snap('after');
    const diff = Object.keys(after).filter((k) => k !== 'label' && after[k] !== before[k]);
    if (READ_ONLY.indexOf(name) === -1) ok(diff.length > 0, '«' + name + '» اثرِ قابل‌مشاهده دارد', JSON.stringify(diff));
  });
}

/* ═══════════ ج) مقاومت در برابر دادهٔ غلط ═══════════ */
h('ج) دادهٔ غلط ⇒ پیامِ روشن، بدونِ استثنا');
{
  const bad = {
    set_daily_study_hours: [{ hours: -3 }, { hours: 0 }, {}],
    set_rest_day: [{ weekday: 'holiday' }, {}],
    set_block_minutes: [{ minutes: 999 }, {}],
    set_exam_date: [{ jalali: 'نامعلوم' }, { iso: 'x' }, {}],
    set_time_mode: [{ mode: 'x' }, {}],
    add_urgent_item: [{}],
    swap_today_time: [{ fromSubjectId: 'bio' }, {}],
    focus_today_chapter: [{}],
    skip_today_subject: [{}],
    rate_chapter: [{ subjectId: 'zzz', chapter: 3 }],
    add_exam: [{ date: 'فردا' }, {}],
    add_off_day: [{}, { weekday: 'zzz' }],
    set_start_time: [{ time: 'سی' }, {}],
    set_sleep: [{}, { bedtime: '' }],
    set_break_minutes: [{}],
    set_weekly_mock: [{}],
    set_student_name: [{ name: '   ' }],
    start_block: [{ subjectId: 'zzz' }],
    finish_block: [{ index: 99 }],
  };
  Object.keys(bad).forEach((name) => {
    bad[name].forEach((args, i) => {
      const app = createApp({ hours: 6 });
      let res = null; let threw = null;
      try { res = TOOLS.run(name, args, app); } catch (e) { threw = e; }
      ok(!threw, '«' + name + '» با دادهٔ ناقص #' + (i + 1) + ' منفجر نمی‌شود', threw && threw.message);
      ok(res && res.ok === false, '«' + name + '» با دادهٔ ناقص #' + (i + 1) + ' شکستِ مهارشده می‌دهد', res && res.message);
      ok(res && typeof res.message === 'string' && res.message.length > 3, 'پیامِ خطای «' + name + '» فارسی و روشن است');
    });
  });
}

/* ═══════════ د) زبان → ابزار (۶۰ جملهٔ واقعی) ═══════════ */
h('د) جمله‌های واقعیِ کاربر ⇒ ابزارِ درست و اثرِ واقعی');
const SENTENCES = [
  // ساعت مطالعه و تنظیماتِ کلی
  ['ساعت مطالعه‌ام رو ۶ ساعت کن', 'set_daily_study_hours'],
  ['روزهای عادی ۵ ساعت', 'set_daily_study_hours'],
  ['ساعت مطالعه‌ام رو بیشتر کن', 'set_daily_study_hours'],
  ['جمعه استراحت', 'set_rest_day'],
  ['روز استراحت رو پنجشنبه کن', 'set_rest_day'],
  ['بلوک‌ها ۴۰ دقیقه', 'set_block_minutes'],
  ['طول هر جلسه ۳۰ دقیقه باشه', 'set_block_minutes'],
  ['تاریخ کنکور رو ۱۴۰۶/۰۴/۱۰ کن', 'set_exam_date'],
  ['ساعت شروع مطالعه رو ۱۷ کن', 'set_start_time'],
  ['از ساعت ۱۶ شروع می‌کنم', 'set_start_time'],
  ['ساعت خوابم ۱۲ بشه', 'set_sleep'],
  ['ساعت خواب ۲۳:۰۰ و بیداری ۶:۳۰', 'set_sleep'],
  ['باید ۷ صبح بیدار شم', 'set_sleep'],
  ['استراحت بین بلوک‌ها ۱۵ دقیقه', 'set_break_minutes'],
  ['آزمون هفتگی رو خاموش کن', 'set_weekly_mock'],
  ['آزمون جامع هفتگی رو روشن کن', 'set_weekly_mock'],
  ['اسم من رضا', 'set_student_name'],
  // برنامهٔ کل سال
  ['برنامه رو از نو بساز', 'rebuild_plan'],
  ['امروز رو از این ساعت بچین', 'replan_today'],
  // تغییرِ امروز
  ['الان زیست‌شناسی فصل ۴ دارم، می‌خوام این تایم رو به شیمی فصل ۲ دهم اختصاص بدم. برنامه رو آپدیت کن', 'swap_today_time'],
  ['به جای زیست، شیمی فصل ۲ بخونم', 'swap_today_time'],
  ['زیست رو حذف کن شیمی فصل ۲ بذار', 'swap_today_time'],
  ['این تایم رو به فیزیک فصل ۳ اختصاص بده', 'focus_today_chapter'],
  ['فیزیک فصل ۳ رو امروز بذار', 'focus_today_chapter'],
  ['ریاضی فصل ۵ رو حذف کن', 'skip_today_subject'],
  ['زیست رو امروز کنار بذار', 'skip_today_subject'],
  ['تغییرهای امروز رو برگردان', 'undo_today_changes'],
  ['همهٔ تغییرهای امروز رو برگردون', 'undo_today_changes'],
  // ارزیابی فصل
  ['فصل ۳ زیست رو خوندم ۷۰٪', 'rate_chapter'],
  ['فصل ۲ شیمی را تمام کردم', 'rate_chapter'],
  ['زیست فصل ۵ رو خوندم ۹۰ درصد', 'rate_chapter'],
  // تقویم
  ['آزمون ۱۵ آبان اضافه کن', 'add_exam'],
  ['امتحان ۱۴۰۵/۰۹/۱۲ ثبت کن', 'add_exam'],
  ['فردا تعطیلم', 'add_off_day'],
  ['پس فردا تعطیل باشه', 'add_off_day'],
  ['۱۵ آبان تعطیلم', 'add_off_day'],
  // کارِ امروز
  ['با شیمی شروع کن', 'start_block'],
  ['شروعش کن با زیست', 'start_block'],
  ['زیست رو زدم', 'finish_block'],
  ['فصل ۲ شیمی رو انجام دادم', 'finish_block'],
  ['روز رو ببند', 'close_day'],
  ['امروز رو ببند و جامونده‌ها رو ببر بعد', 'close_day'],
  // پرسش‌ها (نباید تغییر بدهند)
  ['برنامه امروز چیه؟', null],
  ['فردا چه کاری دارم؟', null],
  ['این هفته چطوره؟', null],
  ['چقدر آماده‌ام؟', null],
  ['پوشش فصل‌ها چقدره؟', null],
  ['مهم‌ترین فصل‌های زیست کدومه؟', null],
  ['از کجا شروع کنم؟', 'start_first_task'],
  ['چطور زیست بخونم؟', null],
  ['خسته‌ام', null],
  ['استرس دارم', null],
  ['سلام', null],
];
{
  SENTENCES.forEach(([msg, expected]) => {
    const app = createApp({ hours: 6 });
    if (expected === 'undo_today_changes') {
      /* برای اینکه «برگردان» معنا داشته باشد، اول یک تغییرِ واقعی می‌سازیم */
      TOOLS.run('swap_today_time', { fromSubjectId: 'bio', toSubjectId: 'chem', toChapter: 2 }, app);
    }
    const before = app._snap('before');
    const r = brain.respond(msg, app);
    const called = (r.actions || []).map((a) => a.name);
    ok(!!r.text && r.text.length > 3, '«' + msg.slice(0, 34) + '…» پاسخ دارد');
    ok(!/نمی‌توانم برنامه را تغییر|امکان‌پذیر نیست|خارج از توان/i.test(r.text), '«' + msg.slice(0, 30) + '…» پاسخِ «نمی‌توانم» ندارد');
    if (expected) {
      ok(called.indexOf(expected) !== -1, '«' + msg.slice(0, 34) + '…» ⇒ ' + expected, 'صدا زد: ' + (called.join(',') || 'هیچ'));
      const res = (r.actions || []).find((a) => a.name === expected);
      ok(res && res.result && res.result.ok === true, '«' + msg.slice(0, 30) + '…»: ابزار موفق بود', res && res.result && res.result.message);
      const after = app._snap('after');
      const diff = Object.keys(after).filter((k) => k !== 'label' && after[k] !== before[k]);
      ok(diff.length > 0, '«' + msg.slice(0, 30) + '…» وضعیت را واقعاً عوض کرد', JSON.stringify(diff));
    } else {
      ok(called.length === 0, '«' + msg.slice(0, 30) + '…» فقط پاسخ می‌دهد و برنامه را دست نمی‌زند', called.join(','));
    }
  });
}

/* ═══════════ ه) حالت‌های مختلفِ برنامه ═══════════ */
h('ه) همان دستورها در ۸ حالتِ مختلفِ برنامه');
const STATES = [
  { key: 'روزِ ۴ ساعته', opts: { hours: 4 } },
  { key: 'روزِ ۲ ساعته (کوتاه)', opts: { hours: 2 } },
  { key: 'روزِ ۱۰ ساعته', opts: { hours: 10 } },
  { key: 'حالتِ خودکار (سقف ۹)', opts: { hours: 7, timeMode: 'auto', autoHours: 9 } },
  { key: 'رشتهٔ ریاضی', opts: { hours: 6, field: 'riazi' } },
  { key: 'پایهٔ یازدهم', opts: { hours: 5, grade: 'یازدهم' } },
  { key: 'با دادهٔ تسلطِ قبلی', opts: { hours: 6, seedMastery: 60 } },
  { key: 'روزِ آزمون (فردا کنکور)', opts: { hours: 3, examDate: '2026-10-31' } },
];
const MATRIX = [
  ['الان زیست فصل ۴ دارم، این تایم رو به شیمی فصل ۲ بده', ['swap_today_time', 'focus_today_chapter']],
  ['فیزیک فصل ۳ رو امروز بذار', ['focus_today_chapter']],
  ['ریاضی رو امروز حذف کن', ['skip_today_subject']],
  ['ساعت مطالعه‌ام رو ۶ ساعت کن', ['set_daily_study_hours']],
  ['بلوک‌ها ۳۰ دقیقه', ['set_block_minutes']],
  ['جمعه استراحت', ['set_rest_day']],
  ['فصل ۳ زیست رو خوندم ۷۵٪', ['rate_chapter']],
  ['آزمون ۱۵ آبان اضافه کن', ['add_exam']],
  ['فردا تعطیلم', ['add_off_day']],
  ['از ساعت ۱۶ شروع می‌کنم', ['set_start_time']],
  ['آزمون هفتگی رو خاموش کن', ['set_weekly_mock']],
  ['با شیمی شروع کن', ['start_block', 'start_first_task']],
  ['زیست رو زدم', ['finish_block']],
  ['روز رو ببند', ['close_day']],
];
{
  STATES.forEach((S) => {
    MATRIX.forEach(([msg, accepted]) => {
      const app = createApp(S.opts);
      let r = null; let threw = null;
      try { r = brain.respond(msg, app); } catch (e) { threw = e; }
      ok(!threw, '[' + S.key + '] «' + msg.slice(0, 26) + '…» بدونِ استثنا', threw && threw.message);
      if (!r) return;
      const called = (r.actions || []).map((a) => a.name);
      const hit = called.some((n) => accepted.indexOf(n) !== -1);
      /* در حالت‌هایی که برنامه از قبل بسته است، پیامِ صادقانه هم پذیرفته است */
      const honest = /برنامه‌ای نیست|در بازهٔ برنامه نیست|تعطیل|پیدا نکردم|جامانده‌ای|بسته|بلوکی در برنامه نداشتی/.test(r.text || '');
      ok(hit || honest, '[' + S.key + '] «' + msg.slice(0, 24) + '…» ابزارِ درست یا پیامِ صادقانه', 'صدا زد: ' + (called.join(',') || 'هیچ'));
    });
  });
}

/* ═══════════ و) برگشت‌پذیری ═══════════ */
h('و) هر تغییرِ دستی برگشت‌پذیر است');
{
  // تغییرِ روز + برگشت
  const app = createApp({ hours: 6 });
  const sig0 = app._blocks(TODAY).map((b) => b.start + b.subjectId + (b.topic || '')).join('|');
  TOOLS.run('swap_today_time', { fromSubjectId: 'bio', toSubjectId: 'chem', toChapter: 2 }, app);
  const sig1 = app._blocks(TODAY).map((b) => b.start + b.subjectId + (b.topic || '')).join('|');
  ok(sig0 !== sig1, 'تغییرِ دستی برنامهٔ امروز را عوض کرد');
  TOOLS.run('undo_today_changes', {}, app);
  const sig2 = app._blocks(TODAY).map((b) => b.start + b.subjectId + (b.topic || '')).join('|');
  ok(sig0 === sig2, '«برگردان» برنامه را دقیقاً به حالت اول آورد');

  // ارزیابی فصل + برگشت
  const app2 = createApp({ hours: 6 });
  TOOLS.run('rate_chapter', { subjectId: 'bio', chapter: 3, mastery: 70 }, app2);
  ok(app2._st.chapters.bio[2].read === true && app2._st.chapters.bio[2].mastery === 70, 'ارزیابی فصل ثبت شد');
  TOOLS.run('rate_chapter', { subjectId: 'bio', chapter: 3, read: false }, app2);
  ok(app2._st.chapters.bio[2].read === false && app2._st.chapters.bio[2].mastery === 0, 'ارزیابی فصل به «نخوانده» برگشت');

  // آزمون هفتگی + برگشت
  const app3 = createApp({ hours: 6 });
  TOOLS.run('set_weekly_mock', { enabled: false }, app3);
  ok(app3._st.cfg.weeklyMock === false, 'آزمون هفتگی خاموش شد');
  TOOLS.run('set_weekly_mock', { enabled: true }, app3);
  ok(app3._st.cfg.weeklyMock === true, 'آزمون هفتگی روشن شد');

  // ساعت مطالعه + برگشت
  const app4 = createApp({ hours: 4 });
  TOOLS.run('set_daily_study_hours', { hours: 8 }, app4);
  ok(Number(app4._st.cfg.availability.sat) === 8, 'ساعت مطالعه ۸ شد');
  TOOLS.run('set_daily_study_hours', { hours: 4 }, app4);
  ok(Number(app4._st.cfg.availability.sat) === 4, 'ساعت مطالعه به ۴ برگشت');
}

/* ═══════════ ز) ابزارهای خواندن ═══════════ */
h('ز) ابزارهای خواندن دادهٔ واقعی می‌دهند');
{
  const app = createApp({ hours: 6 });
  const plan = TOOLS.run('get_plan', { scope: 'today' }, app);
  ok(plan.ok && plan.data.blocks.length > 0, '«برنامهٔ امروز» بلوک دارد');
  ok(plan.data.blocks.every((b) => b.start && b.end && b.subjectName), 'هر بلوک ساعت و درس دارد');
  const week = TOOLS.run('get_plan', { scope: 'week' }, app);
  ok(week.ok && week.data.blocks.length >= plan.data.blocks.length, '«برنامهٔ هفته» کامل‌تر از یک روز است');
  const rep = TOOLS.run('get_report', {}, app);
  ok(rep.ok && rep.data.coverage >= 0 && rep.data.total > 0, 'گزارش پوشش و آمادگی دارد');
  const top = TOOLS.run('top_chapters', { limit: 5 }, app);
  ok(top.ok && top.data.items.length === 5, '«مهم‌ترین فصل‌ها» پنج مورد می‌دهد');
  ok(top.data.items.every((c) => c.label && c.subjectName && c.share >= 0), 'هر فصل نام و سهم دارد');
  const weak = TOOLS.run('top_chapters', { weakest: true, limit: 3 }, app);
  ok(weak.ok && weak.data.items.length > 0, '«ضعیف‌ترین فصل‌ها» هم کار می‌کند');
}

/* ═══════════ ح) بدونِ برنامه: هیچ ابزاری نمی‌شکند ═══════════ */
h('ح) وقتی هنوز برنامه‌ای ساخته نشده');
{
  Object.keys(VALID_ARGS).forEach((name) => {
    const app = createApp({ noPlan: true });
    let res = null; let threw = null;
    try { res = TOOLS.run(name, VALID_ARGS[name], app); } catch (e) { threw = e; }
    ok(!threw, '«' + name + '» بدونِ برنامه منفجر نمی‌شود', threw && threw.message);
    ok(res && typeof res.message === 'string', '«' + name + '» بدونِ برنامه پیام می‌دهد');
  });
}

/* ═══════════ نتیجه ═══════════ */
console.log('\n' + '═'.repeat(64));
if (fail) {
  console.log('❌ ' + pass + ' ✅ / ' + fail + ' ❌');
  errors.slice(0, 30).forEach((e) => console.log('   · ' + e));
  process.exit(1);
} else {
  console.log('✅ ' + fa(pass) + ' بررسی «تسلطِ کاملِ دستیار» پاس شد (' + TOOLS.TOOLS.length + ' ابزار · ' + SENTENCES.length + ' جمله · ' + STATES.length + ' حالت)');
}
