/* ═══════════════════════════════════════════════════════════════════════
   تستِ ۲.۱۰.۲ — «اعدادِ غیرواقعی» و «دستیارِ بی‌ربط»
   ───────────────────────────────────────────────────────────────────────
   شکایتِ کاربر (با اسکرین‌شات): «اصلاً جالب نیست، برنامه اصلِ هوشمند نیست —
   یعنی به نظرت دانش‌آموز می‌تونه یک فصلِ ریاضی رو در ۵۰ دقیقه بخونه؟ اعداد
   غیرواقعی هستن… در چت‌باکس هم اصلاً باهوش نیست و جوابِ پرت می‌ده.»

   این تست همان دو شکایت را عددی می‌سنجد:
     الف) فصل = چند جلسه: هر بلوکِ فصل «بخشِ i از n» دارد، فصل در یک جلسه تمام
          نمی‌شود، و بودجهٔ کلِ فصل با محتوا هم‌خوان است.
     ب) روز = ساعتِ اعلامی: روزِ معمولی نزدیکِ ساعتِ اعلامی پر می‌شود و روزِ سبک
          واقعاً سبک است ولی نه نیمه‌خالی.
     ج) پایه: فصلِ دوازدهم با حجمِ کتابِ دوازدهم برآورد می‌شود، نه دهم.
     د) دستیار: سؤال، سؤال است (برنامه را بی‌اجازه عوض نمی‌کند)، «این فصل چند
          ساعت است؟» جوابِ عددی می‌گیرد، و «دوستش ندارم» مشاوره می‌گیرد.
   اجرا: node test/realism-2102.js
   ═══════════════════════════════════════════════════════════════════════ */
const engine = require('../src/planner/engine.js');
const presets = require('../src/planner/presets.js');
const LM = require('../src/planner/learning-model.js');
const SZ = require('../src/planner/chapter-size.js');
const TOOLS = require('../src/planner/ai/tools.js');
const brain = require('../src/planner/ai/brain.js');

let pass = 0; let fail = 0;
const errors = [];
const ok = (c, msg, x) => {
  if (c) { pass += 1; return; }
  fail += 1; errors.push(msg + (x !== undefined ? ' → ' + x : ''));
  console.log('  ✗ ' + msg + (x !== undefined ? ' → ' + x : ''));
};

const pad = (n) => String(n).padStart(2, '0');
const iso = (d) => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
const TODAY = '2026-11-04';

const WORK = ['learn', 'reteach', 'boost', 'practice', 'consolidate', 'assess'];

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

const P4 = engine.createPlan(cfgFor(4));
const P8 = engine.createPlan(cfgFor(8));

/* ─────────── الف) «یک فصل در ۵۰ دقیقه» ─────────── */
console.log('\n▌ الف) فصل = چند جلسه، نه یک بلوک');
{
  const blocks = P4.days.flatMap((d) => (d.blocks || []).filter((b) => WORK.indexOf(b.kind) !== -1));
  const withPart = blocks.filter((b) => b.part && b.part.total >= 1);
  ok(withPart.length >= Math.round(blocks.length * 0.5),
    'بلوک‌های فصل «شمارهٔ بخش» دارند', withPart.length + '/' + blocks.length);

  ok(withPart.every((b) => b.part.index >= 1 && b.part.index <= b.part.total),
    'شمارهٔ بخش همیشه بین ۱ و تعدادِ بخش‌ها است');

  /* فصلِ ریاضی چهارم دهم: هیچ جلسه‌ای ادعا نمی‌کند کلِ فصل است */
  const mathCh4 = blocks.filter((b) => b.subjectId === 'math' && String(b.topicId || '') === 'math.c4');
  ok(mathCh4.length >= 3, 'فصل ۴ ریاضی در چند جلسه چیده می‌شود (نه یکی)', mathCh4.length);
  ok(mathCh4.every((b) => b.minutes <= 60),
    'هیچ جلسهٔ فصل بیش از یک ساعت نیست', Math.max.apply(null, mathCh4.map((b) => b.minutes)));
  const daysOfCh4 = new Set(P4.days.filter((d) => (d.blocks || []).some((b) => b.subjectId === 'math' && String(b.topicId || '') === 'math.c4')).map((d) => d.date));
  ok(daysOfCh4.size >= 2, 'فصل ۴ ریاضی روی چند روز پخش شده است', daysOfCh4.size);

  /* بودجهٔ فصل با محتوا هم‌خوان است: ۲۵ صفحه ۵ مفهوم ⇒ چند ساعت، نه ۵۰ دقیقه */
  const prof = LM.chapterProfile({ subjectId: 'math', grade: 'دهم', chapterInGrade: 4, chapter: 4, chapters: 7, type: 'problem' });
  const hours = prof.total / 60;
  ok(hours >= 6 && hours <= 25, 'بودجهٔ فصلِ ریاضی در بازهٔ واقع‌بینانهٔ ۶ تا ۲۵ ساعت است', Math.round(hours * 10) / 10);
  ok(prof.learn / 60 >= 1.5, 'فقط فازِ یادگیریِ همین فصل چند ساعت است', Math.round(prof.learn / 60 * 10) / 10);
  const sessions = Math.ceil(prof.total / 45);
  ok(sessions >= 6, 'یک فصل ≥۶ جلسهٔ ۴۵ دقیقه‌ای است', sessions);

  /* بخش‌ها روی هم همان بودجهٔ فصل را می‌دهند (هیچ دقیقه‌ای گم/دوباره نمی‌شود) */
  const byTopic = {};
  withPart.forEach((b) => {
    const k = b.subjectId + '#' + b.topicId;
    byTopic[k] = byTopic[k] || { planned: 0, budget: b.part.chapterMinutes };
    byTopic[k].planned += b.minutes;
  });
  const sane = Object.keys(byTopic).filter((k) => byTopic[k].budget > 0
    && byTopic[k].planned <= byTopic[k].budget * 1.35);
  ok(sane.length === Object.keys(byTopic).length,
    'جمعِ جلساتِ هر فصل از بودجهٔ همان فصل بیرون نمی‌زند',
    (Object.keys(byTopic).length - sane.length) + ' فصل');
}

/* ─────────── ب) روز = ساعتِ اعلامی ─────────── */
console.log('\n▌ ب) روز نزدیکِ ساعتِ اعلامی پر می‌شود و روزِ سبک نیمه‌خالی نیست');
{
  const declared4 = 4 * 60;
  const days4 = P4.days.filter((d) => (d.plannedMinutes || 0) > 0 && !d.isLightDay);
  const avg4 = days4.reduce((a, d) => a + d.plannedMinutes, 0) / days4.length;
  ok(avg4 >= declared4 * 0.75,
    '[۴ ساعت] میانگینِ روزِ معمولی ≥۷۵٪ ساعتِ اعلامی است', Math.round(avg4) + '/' + declared4);
  ok(days4.every((d) => d.plannedMinutes <= declared4 + 1),
    '[۴ ساعت] هیچ روزی از ساعتِ اعلامی بیشتر نمی‌شود',
    Math.max.apply(null, days4.map((d) => d.plannedMinutes)));

  const light4 = P4.days.filter((d) => d.isLightDay && (d.plannedMinutes || 0) > 0);
  const lightAvg = light4.reduce((a, d) => a + d.plannedMinutes, 0) / Math.max(1, light4.length);
  ok(light4.length >= 20, 'در سال دست‌کم ۲۰ روزِ سبک هست', light4.length);
  ok(lightAvg >= declared4 * 0.5, 'روزِ سبک زیر ۵۰٪ ساعتِ اعلامی نمی‌رود', Math.round(lightAvg));
  ok(lightAvg <= avg4 * 0.9, 'روزِ سبک واقعاً از روزِ معمولی سبک‌تر است', Math.round(lightAvg) + ' vs ' + Math.round(avg4));
  ok(light4.every((d) => (d.blocks || []).filter((b) => b.kind !== 'routine').length >= 2),
    'روزِ سبک دست‌کم دو بلوک دارد (نیمه‌خالی نیست)');

  const declared8 = 8 * 60;
  const days8 = P8.days.filter((d) => (d.plannedMinutes || 0) > 0 && !d.isLightDay);
  const avg8 = days8.reduce((a, d) => a + d.plannedMinutes, 0) / days8.length;
  /* ۸ ساعت اعلامی همیشه محتوای واقعی ندارد؛ موتور به‌جای پر کردنِ الکی،
     ظرفیتِ خالی را با «تمرینِ نگهدارنده» پر می‌کند و بقیه را آزاد می‌گذارد.
     سنجه: ≥۶۵٪ + هیچ روزی بالای سقف. */
  ok(avg8 >= declared8 * 0.65, '[۸ ساعت] میانگینِ روزِ معمولی ≥۶۵٪ ساعتِ اعلامی', Math.round(avg8) + '/' + declared8);
  ok(avg8 <= declared8 + 1, '[۸ ساعت] سقفِ ساعتِ اعلامی حفظ می‌شود', Math.round(avg8));

  /* سقفِ اعلامیِ هر روز روی خودِ روز هم هست (برای نمایش و توضیح) */
  ok(P4.days.filter((d) => d.capMinutes > 0).length >= P4.days.length - 70,
    'هر روز سقفِ ساعتِ اعلامیِ خودش را دارد', P4.days.filter((d) => d.capMinutes > 0).length + '/' + P4.days.length);
  ok(P4.days.every((d) => (d.plannedMinutes || 0) <= (d.capMinutes || 0) + 1),
    'هیچ روزی از سقفِ اعلامیِ خودش بیشتر نیست');
}

/* ─────────── ج) پایه‌ها با کتابِ خودشان ─────────── */
console.log('\n▌ ج) حجمِ فصل از کتابِ همان پایه می‌آید');
{
  const d10 = SZ.sizeOf('math', 1, { grade: 'دهم', chapters: 7, type: 'problem' });
  const d12 = SZ.sizeOf('math', 1, { grade: 'دوازدهم', chapters: 7, type: 'problem' });
  ok(d10.grade === 'دهم' && d12.grade === 'دوازدهم', 'کتابِ درست انتخاب می‌شود', d10.grade + '/' + d12.grade);
  ok(d10.bookPages !== d12.bookPages || d10.pages !== d12.pages,
    'حجمِ فصلِ ۱ دهم با فصلِ ۱ دوازدهم یکی نیست', d10.pages + '/' + d12.pages);
  const phys = LM.chapterProfile({ subjectId: 'phys', grade: 'دوازدهم', chapterInGrade: 3, chapter: 3, chapters: 4, type: 'problem' });
  ok(phys.size && phys.size.grade === 'دوازدهم', 'فیزیک دوازدهم از کتابِ دوازدهم خوانده می‌شود', phys.size && phys.size.grade);
}

/* ─────────── د) دستیار: سؤال ≠ دستور ─────────── */
console.log('\n▌ د) دستیار: سؤال را جواب می‌دهد، دستور را اجرا می‌کند');
{
  const ctx = (function make() {
    let overrides = [];
    let plan = P4;
    const rebuild = () => { plan = engine.createPlan(cfgFor(4, { dayOverrides: overrides.slice() })); };
    const day = () => (plan.days || []).find((d) => d.date === TODAY) || { blocks: [] };
    const blocks = () => (day().blocks || []).filter((b) => b.kind !== 'routine');
    const c = {
      studentName: 'تست',
      get plan() { return plan; },
      get overrides() { return overrides; },
      readConfig() { return { avgDailyHours: 4, restDay: 5, blockMinutes: 45, timeMode: 'fixed' }; },
      readReport() {
        const cov = plan.summary.coverage;
        return { coverage: cov.coverageRatio, covered: cov.coveredChapters, total: cov.totalChapters,
          hours: plan.summary.totalHours, daysLeft: 240, konkurProjected: 70, finalsProjected: 75,
          todayCount: blocks().length, todayMinutes: day().plannedMinutes, weak: '', warnings: [] };
      },
      readPlan(scope) {
        if (scope && scope !== 'today') return null;
        return { label: 'امروز', date: TODAY, blocks: blocks(), count: blocks().length, totalMinutes: day().plannedMinutes };
      },
      readDayMeta() {
        const bs = blocks();
        return { date: TODAY, isRestDay: !bs.length, isLightDay: Boolean(day().isLightDay),
          plannedMinutes: day().plannedMinutes, capMinutes: 240, blockCount: bs.length, blocks: bs };
      },
      readChapterPlan(subjectId, chapter) {
        const st = (plan.summary.chapterStats || []).find((x) => x.subjectId === subjectId
          && (chapter == null || Number(x.chapter) === Number(chapter)));
        if (!st) return null;
        const pb = st.phaseBudget || {};
        return { subjectId, subjectName: st.subjectName, chapter, topicName: st.label,
          learn: pb.learn || 0, consolidate: pb.consolidate || 0, practice: pb.practice || 0,
          assess: pb.assess || 0, total: pb.total || 0,
          pages: st.size && st.size.pages, concepts: st.size && st.size.concepts, exercises: st.size && st.size.exercises,
          sessions: [] };
      },
      applyDayOverride(spec) {
        overrides = overrides.filter((x) => !(x.date === (spec.date || TODAY) && x.action === spec.action
          && (x.subjectId || null) === (spec.subjectId || spec.toSubjectId || null)));
        overrides.push(Object.assign({}, spec, { date: spec.date || TODAY }));
        rebuild();
        return { ok: true, message: 'اعمال شد.' };
      },
      clearDayOverrides() { overrides = []; rebuild(); return { ok: true, message: 'برگشت داده شد.' }; },
      applyTool(name, args) { return TOOLS.run(name, args, c); },
    };
    return c;
  })();

  /* ۱) سؤال نباید برنامه را عوض کند */
  const q1 = brain.respond('چرا امروز فقط دو تا بلوک گذاشتی؟', ctx);
  ok((q1.actions || []).length === 0, '«چرا امروز کم است؟» هیچ ابزاری اجرا نمی‌کند', JSON.stringify((q1.actions || []).map((a) => a.name)));
  ok(/بلوک/.test(q1.text) && /دقیقه|ساعت/.test(q1.text), 'جوابِ سؤالِ «چرا کم است» با اعدادِ همان روز است');
  ok(!/طول بلوک باید بین/.test(q1.text), 'جوابِ بی‌ربطِ «طول بلوک باید بین ۲۵ و ۹۰» دیگر نمی‌آید');

  const q2 = brain.respond('چطوری می‌تونم فصل ۴ ریاضی رو تموم کنم؟', ctx);
  ok((q2.actions || []).length === 0, '«چطوری فصل را تمام کنم؟» فقط جواب می‌دهد، فصل را بی‌اجازه نمی‌گذارد');
  ok(/%|ساعت/.test(q2.text), 'جوابِ «چطور تمام کنم» عددی است');

  /* ۲) سؤالِ «این عدد غیرواقعی است» ⇒ بودجهٔ واقعیِ فصل */
  const q3 = brain.respond('این برنامه اصلا واقعی نیست، یک فصل ریاضی رو ۵۰ دقیقه زدی؟', ctx);
  ok((q3.actions || []).length === 0, 'شکایتِ «غیرواقعی» برنامه را عوض نمی‌کند');
  ok(/بودجهٔ|جمع/.test(q3.text), 'جواب، بودجهٔ فصل را می‌گوید');
  const hoursInAnswer = (q3.text.match(/([۰-۹]+[٫.][۰-۹]+|[۰-۹]+)\s*ساعت/) || [])[1];
  const hourNum = hoursInAnswer ? Number(hoursInAnswer.replace(/[۰-۹]/g, (c) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(c))).replace('٫', '.')) : 0;
  ok(hourNum >= 5, 'بودجهٔ اعلام‌شده برای فصل ریاضی چند ساعت است، نه ۵۰ دقیقه', hourNum);

  /* ۳) مشاوره، نه فهرستِ قابلیت‌ها */
  const q4 = brain.respond('ریاضی رو دوست ندارم، چی کار کنم؟', ctx);
  ok(!/می‌توانم این کارها را واقعاً/.test(q4.text), 'جوابِ «دوستش ندارم» فهرستِ قابلیت‌ها نیست');
  ok(/ضعیف|جلسهٔ کوتاه|۳۵ دقیقه|۵ تست/.test(q4.text), 'جوابِ «دوستش ندارم» مشاورهٔ عملی است');

  const q5 = brain.respond('خستم', ctx);
  ok(/خستگی|استراحت|سبک/.test(q5.text), 'جوابِ «خستم» یک تصمیمِ عملی می‌دهد');

  /* ۴) عددِ بی‌معنی نباید اجرا شود */
  const q6 = brain.respond('بلوک‌ها رو ۲ دقیقه کن', ctx);
  ok(!(q6.actions || []).some((a) => a.name === 'set_block_minutes' && a.args.minutes === 2),
    '«بلوک ۲ دقیقه» بی‌چون‌وچرا اجرا نمی‌شود');
  ok(/۲۵|۹۰|بازهٔ سالم/.test(q6.text), 'برای عددِ نامعقول، بازهٔ سالم را می‌گوید و دوباره می‌پرسد');

  /* ۵) دستورِ روشن باید اجرا شود (هوش = هم فهمیدن، هم انجام دادن) */
  const before = ctx.readPlan('today').blocks.length;
  const q7 = brain.respond('فصل ۴ ریاضی رو امروز بذار', ctx);
  ok((q7.actions || []).length >= 1, 'دستورِ روشن واقعاً اجرا می‌شود', (q7.actions || []).map((a) => a.name).join(','));
  const after = ctx.readPlan('today').blocks.some((b) => b.subjectId === 'math');
  ok(after, 'بعد از دستور، ریاضی در برنامهٔ امروز هست (یا از قبل بود)');
  ok(/انجام شد|گذاشته شد|برنامه/.test(q7.text), 'پاسخِ دستور، نتیجهٔ واقعی را می‌گوید');
}

console.log('\n════════════════════════════════════════════════════════════════════');
if (!fail) {
  console.log('✅ ' + pass + ' ✅ / 0 ❌ — «فصل چند جلسه است» و «دستیار سؤال را از دستور جدا می‌کند»');
} else {
  console.log('❌ ' + pass + ' ✅ / ' + fail + ' ❌ — ایرادها:');
  errors.forEach((e) => console.log('   • ' + e));
}
console.log('════════════════════════════════════════════════════════════════════');
process.exit(fail ? 1 : 0);
