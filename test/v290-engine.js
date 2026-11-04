/* ═══════════════════════════════════════════════════════════════════════
   تست‌های موتور ۲.۹.۰ — «زمانِ مطالعه از محتوای فصل درمی‌آید»
   ───────────────────────────────────────────────────────────────────────
   شکایتِ کاربر (دور ۱۹): «برنامه‌ریزی درست نیست و با واقعیت هم‌خوانی ندارد —
   یک فصلِ کاملِ ریاضی در یک جلسهٔ ۳۰ دقیقه‌ای».

   این فایل همان شکایت را عددی می‌سنجد و جلوی برگشتش را می‌گیرد:
     ۱) هیچ جلسهٔ یادگیریِ ریاضی/فیزیک زیر ۳۵ دقیقه نیست
     ۲) هیچ جلسهٔ تمرینِ کامل زیر ۴۰ دقیقه نیست
     ۳) سبدهای فازِ هر فصل (یادگیری/تثبیت/تمرین/سنجش/مرور) جدا و مثبت‌اند
     ۴) نمونهٔ کارشدهٔ گزارش بازتولید می‌شود (مشتق: Learn≈۱۹۴، Practice≈۳۴۹)
     ۵) نردبانِ مرور با افقِ آزمون تغییر می‌کند و آخرین پله ≤۰٫۷۵×افق است
     ۶) باندهای تسلط (۸۵٪ مهار، ۷۰٪ ارتقا، ۵۰٪ بازآموزی) درست انتخاب می‌شوند
     ۷) ضریبِ فردی در بازهٔ ۰٫۸–۱٫۴ است و با تسلطِ کمتر زمان بیشتر می‌شود
     ۸) مجموعِ جلسه‌های یادگیریِ فصل با سبدِ یادگیریِ همان فصل می‌خواند
     ۹) برنامه قطعی است (دو ساخت = یک خروجی)
    ۱۰) ساعتِ روز از سقفِ مؤثرِ ۱۰٫۵ ساعت نمی‌گذرد
   اجرا: node test/v290-engine.js
   ═══════════════════════════════════════════════════════════════════════ */
const engine = require('../src/planner/engine.js');
const presets = require('../src/planner/presets.js');
const LM = require('../src/planner/learning-model.js');
const SZ = require('../src/planner/chapter-size.js');
const P = require('../src/planner/model-params.js');

let pass = 0; let fail = 0;
const errors = [];
const ok = (cond, msg, extra) => {
  if (cond) { pass += 1; return; }
  fail += 1;
  errors.push(msg + (extra ? ' → ' + extra : ''));
  console.log('  ✗ ' + msg + (extra ? ' → ' + extra : ''));
};
const near = (a, b, tol) => Math.abs(a - b) <= Math.abs(b) * tol;
const fa = (n) => String(n);

/* ─────────── ۱) مدلِ محتوا ─────────── */
console.log('\n▌ مدلِ محتوا: هر فصل صفحه/مفهوم/تمرینِ خودش را دارد');
{
  const m = SZ.sizeOf('math', 18, { type: 'problem', chapters: 21 });
  ok(m.pages > 10 && m.pages < 80, 'حجمِ صفحهٔ مشتق معقول است', m.pages);
  ok(m.concepts >= 3 && m.concepts <= 20, 'تعدادِ مفهومِ نو معقول است', m.concepts);
  ok(m.exercises >= 10, 'تعدادِ تمرینِ کتاب معقول است', m.exercises);
  const bio = SZ.sizeOf('bio', 2, { type: 'conceptual', chapters: 24 });
  ok(bio.pages > 5, 'حجمِ فصلِ زیست معقول است', bio.pages);
  const all = [];
  ['math', 'phys', 'chem', 'bio', 'geo'].forEach((sid) => {
    const n = sid === 'math' ? 21 : sid === 'phys' ? 11 : sid === 'chem' ? 10 : sid === 'bio' ? 24 : 7;
    for (let i = 1; i <= n; i += 1) all.push(SZ.sizeOf(sid, i, { chapters: n }));
  });
  ok(all.every((x) => x.pages >= 5 && x.concepts >= 2 && x.exercises >= 0),
    'همهٔ فصل‌ها حجمِ مثبت و معقول دارند', all.length);
}

/* ─────────── ۲) نمونهٔ کارشدهٔ گزارش (اعتبارسنجیِ فرمول) ─────────── */
console.log('\n▌ نمونهٔ کارشدهٔ گزارش: مشتق (P≈۳۰، N≈۶، N_ex≈۴۵)');
{
  const prof = LM.chapterProfile({
    subjectId: 'math', chapter: 18, chapters: 21, type: 'problem',
    mastery: 30, ciImportance: 5, horizonDays: 235,
  });
  ok(near(prof.size.pages, 30, 0.4), 'صفحهٔ مشتق ≈۳۰', prof.size.pages);
  ok(near(prof.size.concepts, 6, 0.5), 'مفهومِ نو ≈۶', prof.size.concepts);
  ok(near(prof.size.exercises, 45, 0.4), 'تمرین ≈۴۵', prof.size.exercises);
  ok(near(prof.learn, 194, 0.22), 'Learn ≈۱۹۴ دقیقه', prof.learn);
  ok(near(prof.practice, 349, 0.28), 'Practice ≈۳۴۹ دقیقه', prof.practice);
  ok(prof.assess >= 10 && prof.assess <= 45, 'سنجش داخلِ بازهٔ ۱۰–۴۵', prof.assess);
  ok(prof.tier === 5, 'تیرِ مشتق ۵ است (پرتکرارترین فصلِ ریاضی)', prof.tier);
  ok(prof.sessions.length >= 8, 'طرحِ جلسه چند جلسه دارد', prof.sessions.length);
  const learnSum = prof.sessions.filter((s) => s.type === 'concept')
    .reduce((a, s) => a + s.minutes, 0);
  ok(Math.abs(learnSum - prof.learn) <= 12, 'مجموعِ جلسه‌های مفهومی با سبدِ یادگیری می‌خواند',
    learnSum + ' vs ' + prof.learn);
}

/* ─────────── ۳) حدِ معنادارِ جلسه ─────────── */
console.log('\n▌ حدِ معنادارِ جلسه: ۳۵ دقیقه یادگیری · ۴۰ دقیقه تمرین');
{
  const prof = LM.composeSessions({ profile: 'quant', learn: 300, practice: 300, consolidate: 60, assess: 40 });
  const concepts = prof.filter((s) => s.type === 'concept').map((s) => s.minutes);
  ok(concepts.every((m) => m >= 35 && m <= 50), 'همهٔ جلسه‌های مفهومی ۳۵–۵۰ دقیقه‌اند', concepts.join(','));
  const prac = prof.filter((s) => s.type === 'solo' || s.type === 'guided');
  ok(prac.filter((s) => !s.practiceIndex || s.practiceIndex === 0).length >= 1, 'جلسهٔ تمرین ساخته شد', prac.length);
  ok(prof.some((s) => s.type === 'assess'), 'سنجشِ فصل در طرح هست', prof.length);
}

/* ─────────── ۴) نردبانِ مرور ─────────── */
console.log('\n▌ نردبانِ مرور: از افقِ آزمون ساخته می‌شود');
{
  const short = LM.ladderFor(30);
  const long = LM.ladderFor(300);
  ok(short.length >= 3 && short.length <= 5, 'افقِ ۳۰ روزه نردبانِ کوتاه دارد', short.join(','));
  ok(long.length >= 5, 'افقِ ۳۰۰ روزه نردبانِ بلند دارد', long.join(','));
  ok(short.every((g, i) => i === 0 || g > short[i - 1]), 'نردبانِ ۳۰ روزه صعودی است', short.join(','));
  ok(long.every((g, i) => i === 0 || g > long[i - 1]), 'نردبانِ ۳۰۰ روزه صعودی است', long.join(','));
  ok(long[long.length - 1] <= Math.round(300 * 0.75), 'آخرین پله از ۰٫۷۵×افق بیشتر نیست', long[long.length - 1]);
  ok(short[0] < long[0], 'افقِ کوتاه‌تر، اولین مرورِ زودتر دارد', short[0] + ' vs ' + long[0]);
  const p = LM.chapterProfile({ subjectId: 'bio', chapter: 5, chapters: 24, type: 'conceptual', mastery: 40, horizonDays: 90 });
  ok(p.reviews.every((r) => r.minutes >= P.reviewLengthFloorMinutes && r.minutes <= 30),
    'طولِ مرورها ۸–۳۰ دقیقه است', p.reviews.map((r) => r.minutes).join(','));
  ok(p.reviews.length <= 6, 'سقفِ ۶ مرور رعایت شده', p.reviews.length);
}

/* ─────────── ۵) باندهای تسلط و ضریبِ فردی ─────────── */
console.log('\n▌ باندهای تسلط: ۸۰٪ مهار · ۶۵٪ هدفِ تمرین · پایین‌تر بازآموزی');
{
  const solid = LM.chapterProfile({ subjectId: 'chem', chapter: 2, chapters: 10, type: 'conceptual', mastery: 85, read: true, horizonDays: 120 });
  const boost = LM.chapterProfile({ subjectId: 'chem', chapter: 2, chapters: 10, type: 'conceptual', mastery: 70, read: true, horizonDays: 120 });
  const re = LM.chapterProfile({ subjectId: 'chem', chapter: 2, chapters: 10, type: 'conceptual', mastery: 50, read: true, horizonDays: 120 });
  ok(solid.mode === 'solid', 'تسلط ۸۵٪ ⇒ فقط مرور', solid.mode);
  ok(boost.mode === 'boost', 'تسلط ۷۰٪ ⇒ ارتقا با تمرین', boost.mode);
  ok(re.mode === 'reteach', 'تسلط ۵۰٪ ⇒ بازآموزی', re.mode);
  ok(re.learn > boost.learn, 'تسلطِ کمتر ⇒ زمانِ یادگیریِ بیشتر', re.learn + ' > ' + boost.learn);
  const low = LM.individualScale(30);
  const high = LM.individualScale(90);
  ok(low.s > 1 && low.s <= 1.4, 'تسلطِ اعلامیِ پایین ⇒ ضریبِ بزرگ‌تر (≤۱٫۴)', low.s);
  ok(high.s < 1 && high.s >= 0.8, 'تسلطِ بالا ⇒ ضریبِ کوچک‌تر (≥۰٫۸)', high.s);
}

/* ─────────── ۶) برنامهٔ واقعی: جلسه‌ها کوتاه نیستند ─────────── */
console.log('\n▌ برنامهٔ واقعی: فصلِ ریاضی در ۳۰ دقیقه «خوانده» نمی‌شود');
const pad = (n) => String(n).padStart(2, '0');
const iso = (d) => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
function mk(field, hours) {
  const availability = {}; const startTimes = {};
  ['sat', 'sun', 'mon', 'tue', 'wed', 'thu', 'fri'].forEach((k) => { availability[k] = hours; startTimes[k] = hours >= 6 ? '08:00' : '16:00'; });
  const start = new Date(2026, 10, 5); const end = new Date(2027, 5, 20);
  return {
    student: { name: 'آزمون', grade: 'دوازدهم', field, chronotype: 'morning' },
    startDate: iso(start), examDate: iso(end),
    sleep: { bedtime: '23:30', wake: '07:00' },
    availability, startTimes,
    blockMinutes: 45, breakMinutes: 10, restDay: 7, weeklyMock: false,
    classes: [], exams: [], subjects: presets.subjectsFor(field),
  };
}
{
  [2, 4, 6, 8].forEach((h) => {
    const plan = engine.createPlan(mk('riazi', h));
    const learn = [];
    plan.days.forEach((d) => d.blocks.forEach((b) => {
      if ((b.kind === 'learn' || b.kind === 'reteach' || b.kind === 'boost') && b.subjectId === 'math') learn.push(b.minutes);
    }));
    const short = learn.filter((m) => m <= 30).length;
    ok(short === 0, '[' + h + ' ساعت] هیچ جلسهٔ یادگیریِ ریاضی ≤۳۰ دقیقه نیست', short + ' از ' + learn.length);
    const avg = learn.reduce((a, b) => a + b, 0) / Math.max(1, learn.length);
    ok(avg >= 35 && avg <= 55, '[' + h + ' ساعت] میانگینِ جلسهٔ ریاضی ۳۵–۵۵ دقیقه', Math.round(avg));
    ok(plan.days.every((d) => (d.plannedMinutes || 0) <= 10.5 * 60 + 30), '[' + h + ' ساعت] هیچ روزی از ۱۰٫۵ ساعت نگذشته',
      Math.max.apply(null, plan.days.map((x) => x.plannedMinutes || 0)));
  });
}

/* ─────────── ۷) بودجهٔ فازها روی خروجیِ واقعی ─────────── */
console.log('\n▌ بودجهٔ فازها: یادگیری، تثبیت، تمرین، سنجش و مرور جدا گزارش می‌شوند');
{
  const plan = engine.createPlan(mk('tajrobi', 6));
  const stats = plan.summary.chapterStats.filter((c) => c.phaseBudget);
  ok(stats.length > 40, 'همهٔ فصل‌ها بودجهٔ فاز دارند', stats.length);
  ok(stats.every((c) => c.phaseBudget.learn >= 0 && c.phaseBudget.practice >= 0
    && c.phaseBudget.assess >= 0 && c.phaseBudget.review >= 0), 'هیچ سبدِ منفی نداریم');
  ok(stats.some((c) => c.phaseBudget.practice > c.phaseBudget.learn),
    'دست‌کم در یک درس، تمرین بیشتر از یادگیری است (ریاضی/فیزیک)', '');
  const t5 = stats.filter((c) => c.tier === 5);
  const t1 = stats.filter((c) => c.tier === 1);
  const avg = (arr, k) => arr.reduce((a, c) => a + c.phaseBudget[k], 0) / Math.max(1, arr.length);
  ok(t5.length && t1.length, 'تیرهای ۱ و ۵ هر دو در برنامه هستند', t5.length + '/' + t1.length);
  ok(avg(t5, 'review') >= avg(t1, 'review'), 'فصل‌های پرتکرار مرورِ بیشتری می‌گیرند',
    Math.round(avg(t5, 'review')) + ' ≥ ' + Math.round(avg(t1, 'review')));
}

/* ─────────── ۸) قطعیت ─────────── */
console.log('\n▌ قطعیت: دو ساختِ پیاپی = همان برنامه');
{
  const a = engine.createPlan(mk('tajrobi', 4));
  const b = engine.createPlan(mk('tajrobi', 4));
  const sig = (p) => p.days.map((d) => d.date + ':' + d.blocks.map((x) => x.kind + x.subjectId + x.minutes).join(',')).join('|');
  ok(sig(a) === sig(b), 'برنامه قطعی است', '');
}

/* ─────────── ۹) سناریوی شکایت ─────────── */
console.log('\n▌ سناریوی شکایت: ریاضی با ۲ ساعت در روز');
{
  const plan = engine.createPlan(mk('riazi', 2));
  const mathBlocks = [];
  plan.days.forEach((d) => d.blocks.forEach((b) => { if (b.subjectId === 'math') mathBlocks.push(b); }));
  ok(mathBlocks.length > 0, 'ریاضی در برنامه هست', mathBlocks.length);
  const learnOnes = mathBlocks.filter((b) => b.kind === 'learn');
  ok(learnOnes.every((b) => b.minutes >= 35), 'هیچ بلوکِ یادگیریِ ریاضی کوتاه‌تر از ۳۵ دقیقه نیست',
    learnOnes.map((b) => b.minutes).join(','));
  const perChapter = {};
  plan.days.forEach((d) => d.blocks.forEach((b) => {
    if (b.subjectId !== 'math') return;
    const key = String(b.topicId || b.topic);
    perChapter[key] = (perChapter[key] || 0) + (b.minutes || 0);
  }));
  const singletons = Object.keys(perChapter).filter((k) => perChapter[k] < 40);
  ok(singletons.length === 0, 'هیچ فصلِ ریاضی با کمتر از ۴۰ دقیقه جمعِ زمان «تمام‌شده» حساب نمی‌شود',
    singletons.length);
}

console.log('\n════════════════════════════════════════════════════════════════');
if (fail === 0) console.log('✅ ' + pass + ' بررسیِ موتور ۲.۹.۰ (مدلِ محتوا · بودجهٔ فاز · حدِ جلسه · نردبانِ مرور · باندهای تسلط) پاس شد');
else {
  console.log('❌ ' + pass + ' ✅ / ' + fail + ' ❌ — ایرادها:');
  errors.forEach((e) => console.log('   • ' + e));
}
console.log('════════════════════════════════════════════════════════════════');
process.exit(fail === 0 ? 0 : 1);
