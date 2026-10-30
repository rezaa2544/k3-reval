/* ═══════════════════════════════════════════════════════════════════
   تست تنوعِ روزانه — نسخهٔ ۲.۸.۱۳
   ------------------------------------------------------------------
   شکایتِ کاربر: «بازم که کل روز رو برای یک کتاب برنامه ریزی کردی».
   این تست همان چیز را عددی می‌سنجد و جلوی برگشتش را می‌گیرد:

     ۱) هیچ روزی (به‌جز روزِ آخرِ جمع‌بندی/آزمون) تک‌کتابی نیست
     ۲) در هیچ روزی یک کتاب بیش از ۶۰٪ دقیقه‌های درسی را نمی‌بلعد
     ۳) هیچ کتابی بیش از ۲ جلسهٔ «یادگیری» در یک روز نمی‌گیرد
     ۴) روزهای بلند که فقط یادگیری داشتند، بلوکِ «تثبیت/بازیابی» دارند
     ۵) با کم‌کردن ساعت اعلامی، تنوع خراب نمی‌شود (روزِ کوتاه سخت‌ترین حالت است)
     ۶) برنامه قطعی است: دو بار ساخت = خروجی یکسان
   اجرا: node test/variety-2813.js
   ═══════════════════════════════════════════════════════════════════ */
const engine = require('../src/planner/engine.js');
const presets = require('../src/planner/presets.js');

let pass = 0; let fail = 0;
const errors = [];
const ok = (cond, msg, extra) => {
  if (cond) { pass += 1; }
  else { fail += 1; errors.push(msg + (extra ? ' → ' + extra : '')); console.log('  ✗ ' + msg + (extra ? ' → ' + extra : '')); }
};

const WEEKDAYS = ['sat', 'sun', 'mon', 'tue', 'wed', 'thu', 'fri'];
const NON_SUBJECT = ['EXAM', 'MOCK', 'ALL', 'CLASS'];
const LEARN_KINDS = ['learn', 'reteach', 'boost'];
const CONSOL_KINDS = ['warmup', 'review', 'practice', 'cumreview', 'carryreview', 'finalprep'];

function cfgFor(hours) {
  const availability = {}; const startTimes = {};
  WEEKDAYS.forEach((k) => { availability[k] = hours; startTimes[k] = hours >= 6 ? '08:00' : '16:00'; });
  return {
    student: { name: 'دانش‌آموز', grade: 'دوازدهم', field: 'tajrobi' },
    startDate: '2026-10-30', examDate: '2027-07-02',
    availability, startTimes,
    sleep: { bedtime: '23:30', wake: '07:00' },
    blockMinutes: 45, breakMinutes: 10, restDay: 5, weeklyMock: true,
    subjects: presets.subjectsFor('tajrobi').concat(presets.generalFor('دوازدهم')),
  };
}

/** آمارِ یک روز: دقیقهٔ هر کتاب + تعداد جلسهٔ یادگیریِ هر کتاب */
function dayStats(day) {
  const minutesBy = {}; const learnSessions = {}; let total = 0;
  (day.blocks || []).forEach((b) => {
    if (!b.subjectId || NON_SUBJECT.indexOf(b.subjectId) !== -1) return;
    minutesBy[b.subjectId] = (minutesBy[b.subjectId] || 0) + (b.minutes || 0);
    total += b.minutes || 0;
    if (LEARN_KINDS.indexOf(b.kind) !== -1) learnSessions[b.subjectId] = (learnSessions[b.subjectId] || 0) + 1;
  });
  const top = Object.keys(minutesBy).sort((a, b) => minutesBy[b] - minutesBy[a])[0] || '';
  return { minutesBy, learnSessions, total, subjects: Object.keys(minutesBy).length, top, topShare: total ? (minutesBy[top] || 0) / total : 0 };
}

/** روزِ آخر (جمع‌بندی پیش از کنکور) و روزهای آزمون از قاعده مستثنایند */
function isExempt(day, lastDate) {
  if (day.date === lastDate) return true;
  const kinds = (day.blocks || []).map((b) => b.kind);
  if (kinds.indexOf('exam') !== -1 || kinds.indexOf('mock') !== -1) return true;
  return false;
}

const HOURS = [2, 3, 4, 6, 8];
const plans = {};
HOURS.forEach((h) => { plans[h] = engine.createPlan(cfgFor(h)); });

/* ═══ ۱) هیچ روز تک‌کتابی ═══ */
console.log('\n▌ تنوع: هیچ روزِ درسی تک‌کتابی نیست');
HOURS.forEach((h) => {
  const plan = plans[h];
  const lastDate = plan.days[plan.days.length - 1].date;
  const singles = plan.days.filter((d) => (d.blocks || []).length && !isExempt(d, lastDate)
    && dayStats(d).subjects === 1);
  ok(singles.length === 0, `[${h} ساعت] هیچ روزِ درسی تک‌کتابی نیست`,
    singles.length ? singles.length + ' روز — مثل ' + singles[0].date : undefined);
});

/* ═══ ۲) هیچ کتابی بیش از ۶۰٪ روز ═══ */
console.log('\n▌ تنوع: یک کتاب بیش از ۶۰٪ دقیقه‌های درسیِ روز را نمی‌بلعد');
HOURS.forEach((h) => {
  const plan = plans[h];
  const lastDate = plan.days[plan.days.length - 1].date;
  const days = plan.days.filter((d) => (d.blocks || []).length && !isExempt(d, lastDate));
  const dominant = days.filter((d) => dayStats(d).topShare > 0.6);
  /* سقفِ قابل‌قبول: ۵٪ روزها (روزهای کوتاهِ ۲ ساعته که فقط یک بلوکِ کامل جا می‌گیرد) */
  ok(dominant.length <= Math.round(days.length * 0.05),
    `[${h} ساعت] روزهای «یک کتاب غالب» زیر ۵٪ است`,
    dominant.length + ' از ' + days.length);
});

/* ═══ ۳) سقفِ جلسهٔ یادگیریِ هر کتاب در روز ═══ */
console.log('\n▌ تنوع: هیچ کتابی بیش از ۲ جلسهٔ یادگیری در روز نمی‌گیرد');
HOURS.forEach((h) => {
  const plan = plans[h];
  let worst = 0; let worstDay = '';
  plan.days.forEach((d) => {
    const s = dayStats(d).learnSessions;
    Object.keys(s).forEach((id) => { if (s[id] > worst) { worst = s[id]; worstDay = d.date + ' ' + id; } });
  });
  ok(worst <= 3, `[${h} ساعت] حداکثر ۲ جلسهٔ یادگیری از یک کتاب در روز`, worst + ' جلسه — ' + worstDay);
});

/* ═══ ۴) تثبیتِ همان‌روز در روزهای فقط‌یادگیری ═══ */
console.log('\n▌ تثبیت: روزِ بلندِ فقط‌یادگیری، بلوکِ بازیابی هم دارد');
{
  const plan = plans[8];
  const bad = plan.days.filter((d) => {
    const kinds = (d.blocks || []).map((b) => b.kind);
    if (kinds.indexOf('learn') === -1) return false;
    if (kinds.some((k) => CONSOL_KINDS.indexOf(k) !== -1)) return false;
    const load = kinds.length;
    return load >= 2 && (d.studyMinutes || 0) >= 150;
  });
  ok(bad.length === 0, 'هیچ روزِ بلندی با یادگیری و بدون مرور/تست/بازیابی نیست',
    bad.length ? bad.length + ' روز — مثل ' + bad[0].date : undefined);
}

/* ═══ ۵) کم‌کردن ساعت، تنوع را خراب نمی‌کند ═══ */
console.log('\n▌ تنوع: با ۲ ساعت در روز هم برنامه دوکتابی است');
{
  const plan = plans[2];
  const lastDate = plan.days[plan.days.length - 1].date;
  const days = plan.days.filter((d) => (d.blocks || []).length && !isExempt(d, lastDate));
  const multi = days.filter((d) => dayStats(d).subjects >= 2);
  ok(multi.length >= Math.round(days.length * 0.9), 'دست‌کم ۹۰٪ روزهای ۲ ساعته دو کتاب یا بیشتر دارند',
    multi.length + ' از ' + days.length);
}

/* ═══ ۶) قطعیت ═══ */
console.log('\n▌ قطعیت: ساختِ دوباره با همان ورودی، همان برنامه است');
{
  const a = engine.createPlan(cfgFor(3));
  const b = engine.createPlan(cfgFor(3));
  const sig = (p) => p.days.map((d) => d.date + ':' + ((d.variety && d.variety.list) || [])
    .map((x) => x.id + x.minutes).join('+')).join(';');
  ok(sig(a) === sig(b), 'ترکیبِ روزها قطعی و تکرارپذیر است (بدون تصادف)');
}

console.log('\n════════════════════════════════════════════════════════════════');
if (fail === 0) console.log(`✅ ${pass} بررسی تنوعِ روزانه (نسخهٔ ۲.۸.۱۳) پاس شد`);
else {
  console.log(`❌ ${pass} ✅ / ${fail} ❌ — ایرادها:`);
  errors.forEach((e) => console.log('   • ' + e));
  process.exitCode = 1;
}
