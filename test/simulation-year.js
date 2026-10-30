#!/usr/bin/env node
/**
 * شبیه‌سازی سالِ کامل — «آیا این برنامه در واقعیت اجراشدنی است؟»
 *
 * این تست کلِ سال را روز‌به‌روز می‌سازد و با معیارهای واقعی (روان‌شناسی یادگیری،
 * فیزیک روز، مرزهای زمانی) قضاوت می‌کند — نه فقط «خطا نداد».
 *
 * اجرا:  node test/simulation-year.js [--verbose]
 */
'use strict';

const engine = require('../src/planner/engine.js');
const presets = require('../src/planner/presets.js');

const VERBOSE = process.argv.includes('--verbose');
const MIN_CHUNK = {
  learn: 30, reteach: 30, practice: 30, boost: 30, review: 15, warmup: 10,
  cumreview: 30, carryreview: 15, carry: 20, finalprep: 25, deadlinecheck: 20,
  classfix: 20, analysis: 25, mock: 40, exam: 30, emergency: 20,
};

let pass = 0; let fail = 0;
const failures = [];
function check(cond, label, extra) {
  if (cond) { pass += 1; return true; }
  fail += 1;
  failures.push(label + (extra ? ' → ' + extra : ''));
  return false;
}

/* ─────────────────────────── سناریوها ─────────────────────────── */
const BASE = {
  sleep: { bedtime: '23:30', wake: '07:00' },
  timeMode: 'auto',
  restDay: 3,
  weeklyMock: true,
  finalsSpread: true,
};

function scenario(o) {
  const field = o.field;
  return {
    name: o.name,
    cfg: {
      student: { name: 'شبیه‌سازی', grade: o.grade || 'دوازدهم', field },
      startDate: o.start || '2026-10-30',
      examDate: o.exam || '2027-07-02',
      availability: o.availability,
      startTimes: o.startTimes,
      sleep: BASE.sleep,
      blockMinutes: o.blockMinutes || 45,
      breakMinutes: 10,
      restDay: o.restDay == null ? BASE.restDay : o.restDay,
      weeklyMock: o.weeklyMock == null ? true : o.weeklyMock,
      subjects: presets.subjectsFor(field),
      finals: { enabled: o.finals !== false, courses: presets.finalsFor(field, o.grade || 'دوازدهم'), spread: true },
      timeMode: o.timeMode || 'auto',
      dailyCapHours: o.dailyCapHours || 10,
      deadlineExams: o.deadlineExams || [],
    },
  };
}

const WEEK = (w, t) => ({ sat: w, sun: w, mon: w, tue: w, wed: w, thu: t, fri: w });
const TIMES = { sat: '16:00', sun: '16:00', mon: '16:00', tue: '16:00', wed: '16:00', thu: '09:00', fri: '09:00' };

const SCENARIOS = [
  scenario({ name: 'تجربی · دوازدهم · سال کامل (۸.۶ ساعت اعلامی)', field: 'tajrobi', availability: WEEK(4, 6) }),
  scenario({ name: 'ریاضی · دوازدهم · سال کامل', field: 'riazi', availability: WEEK(4, 6) }),
  scenario({ name: 'انسانی · دوازدهم · سال کامل', field: 'ensani', availability: WEEK(3.5, 5) }),
  /* حالت «ساعت ثابت» با ۴ ساعت اعلامی: موتور نباید ساکت بماند، باید بگوید جا کم است */
  scenario({ name: 'تجربی · ثابت ۴ ساعت در روز — باید صادق باشد', field: 'tajrobi', availability: WEEK(4, 4), timeMode: 'fixed' }),
  scenario({ name: 'تجربی · ثابت ۶ ساعت در روز', field: 'tajrobi', availability: WEEK(6, 8), timeMode: 'fixed' }),
  scenario({ name: 'تجربی · فقط ۶۰ روز تا کنکور (فشار مهلت)', field: 'tajrobi', start: '2027-05-01', availability: WEEK(5, 7) }),
  scenario({ name: 'تجربی · بلوک ۶۰ دقیقه‌ای', field: 'tajrobi', availability: WEEK(4, 6), blockMinutes: 60 }),
];

/* ─────────────────────── بازرسیِ یک برنامه ─────────────────────── */
function inspect(s) {
  const plan = engine.createPlan(s.cfg);
  const days = plan.days || [];
  const S = plan.summary;
  const R = { name: s.name, days: days.length, hours: 0, issues: [], metrics: {} };

  const kindMin = {};
  let fractional = 0; let overlaps = 0; let subMin = 0; let overCap = 0;
  const learnByTopic = {};
  const practiceBeforeLearn = [];
  const seenRead = new Set();
  let emptyDays = 0; let maxDayMin = 0; let plannedDays = 0;
  const capMin = (s.cfg.dailyCapHours || 10) * 60;

  days.forEach((d) => {
    const blocks = (d.blocks || []).filter((b) => b.kind !== 'routine');
    let last = -1;
    let dayMin = 0;
    if (!blocks.length && !d.isRestDay && !d.isExamDay) emptyDays += 1;
    blocks.forEach((b) => {
      const m = b.minutes;
      if (!Number.isInteger(m)) fractional += 1;
      dayMin += m;
      kindMin[b.kind] = (kindMin[b.kind] || 0) + m;
      const lim = MIN_CHUNK[b.kind] == null ? 15 : MIN_CHUNK[b.kind];
      if (m < lim) { subMin += 1; R.issues.push(`${d.date} ${b.kind} ${m}min < ${lim}`); }
      const st = Number(String(b.start).slice(0, 2)) * 60 + Number(String(b.start).slice(3));
      if (st < last) overlaps += 1;
      last = st + m;
      if (b.topicId) {
        const t = learnByTopic[b.topicId] || (learnByTopic[b.topicId] = { learn: [], practice: 0, label: b.topic });
        if (b.kind === 'learn' || b.kind === 'reteach' || b.kind === 'boost') { t.learn.push(m); seenRead.add(b.topicId); }
        else if (b.kind === 'practice') {
          t.practice += m;
          if (!seenRead.has(b.topicId)) practiceBeforeLearn.push({ date: d.date, id: b.topicId, label: b.topic });
        }
      }
    });
    maxDayMin = Math.max(maxDayMin, dayMin);
    if (dayMin > capMin + 1) overCap += 1;
    if (dayMin > 0) plannedDays += 1;
    R.hours += dayMin / 60;
    if (VERBOSE && d.index % 30 === 0) {
      console.log(`   ${d.date} · ${dayMin} دقیقه · ${blocks.length} بلوک · ${blocks.map((b) => b.kind).join(',')}`);
    }
  });

  /* فصل‌هایی که برنامهٔ یادگیری دارند نباید پیش از خوانده‌شدن تست بگیرند.
     فصل‌های پایهٔ پایین‌تر (خوانده‌شده) می‌توانند مستقیم تست تشخیصی بگیرند. */
  const learnPlannedIds = new Set(Object.keys(learnByTopic).filter((k) => learnByTopic[k].learn.length));
  const premature = practiceBeforeLearn.filter((x) => learnPlannedIds.has(x.id));
  const chunks = Object.entries(learnByTopic);
  const singleSession = chunks.filter(([, t]) => t.learn.length === 1);
  const tinyLearn = chunks.filter(([, t]) => t.learn.length && Math.max(...t.learn) < 25);

  R.metrics = {
    hours: Math.round(R.hours),
    coverage: S.coverage ? S.coverage.coverageRatio : null,
    learned: S.learnedTopics,
    plannedDays, emptyDays, maxDayMin, subMin, fractional, overlaps, overCap,
    chapters: chunks.length,
    chaptersSingleSession: singleSession.length,
    practiceBeforeLearn: premature.length,
    unplacedMinutes: Math.round(S.unplacedMinutes || 0),
    kinds: Object.entries(kindMin).sort((a, b) => b[1] - a[1])
      .map(([k, v]) => `${k} ${Math.round(v / 60)}h`).join(' · '),
  };

  /* ── ادعاها ── */
  check(days.length > 30, `[${s.name}] برنامه ساخته شد`, `${days.length} روز`);
  check(fractional === 0, `[${s.name}] هیچ دقیقهٔ اعشاری وجود ندارد`, `${fractional} بلوک`);
  check(overlaps === 0, `[${s.name}] هیچ بلوکی روی بلوک دیگر نمی‌افتد`, `${overlaps} تداخل`);
  check(subMin === 0, `[${s.name}] هیچ بلوکی کوتاه‌تر از حدِ منطقی نیست`, `${subMin} بلوک`);
  check(overCap === 0, `[${s.name}] سقف ساعتی کاربر رعایت شده`, `${overCap} روز`);
  check(premature.length === 0,
    `[${s.name}] هیچ فصلی پیش از یادگیری، تست نمی‌گیرد`,
    premature.slice(0, 3).map((x) => `${x.date} ${x.label}`).join(' | '));
  check(tinyLearn.length === 0, `[${s.name}] هیچ فصلِ «یادگیری» چند دقیقه‌ای ثبت نشده`,
    tinyLearn.slice(0, 3).map(([k, t]) => `${t.label} ${t.learn.join('+')}د`).join(' | '));
  check(chunks.every(([, t]) => t.learn.reduce((a, b) => a + b, 0) >= 30 || !t.learn.length),
    `[${s.name}] هر فصل حداقل ۳۰ دقیقه یادگیری واقعی دارد`);

  /* پوشش: با ساعت کافی باید بالا باشد؛ با ساعت ناکافی باید صادقانه هشدار بدهد */
  const declaredWeekly = s.cfg.availability ? Object.values(s.cfg.availability).reduce((a, b) => a + b, 0) : 0;
  const spanDays = (new Date(s.cfg.examDate) - new Date(s.cfg.startDate)) / 86400000;
  const autoMode = (s.cfg.timeMode || 'auto') === 'auto';
  const enough = autoMode && declaredWeekly >= 22 && spanDays >= 120;
  if (enough) {
    check(S.coverage.coverageRatio >= 90, `[${s.name}] با ساعت کافی، پوشش فصل‌ها ≥ ۹۰٪`, `پوشش ${S.coverage.coverageRatio}%`);
  } else if (S.coverage.coverageRatio >= 90) {
    /* ساعتِ کمتر هم کافی بوده — هشداری لازم نیست */
    R.metrics.diagSample = '—';
  } else {
    /* کمبود واقعی: موتور باید صادق باشد و راه‌حل بدهد */
    const diag = (S.coverage.diagnostics || []).concat(S.diagnostics || [])
      .filter((x) => x && (x.fix || x.remedy) && /ساعت|پوشش|ظرفیت/.test((x.title || '') + (x.detail || '')));
    check(diag.length > 0, `[${s.name}] کمبود زمان صادقانه و با راه‌حل گزارش می‌شود`, `${diag.length} هشدار`);
    check(/[آ-ی]/.test((diag[0] && (diag[0].fix || diag[0].remedy)) || ''), `[${s.name}] هشدار متنِ راه‌حل دارد`);
    R.metrics.diagSample = diag[0] ? diag[0].title : null;
  }
  check(!S.coverage.diagnostics.some((x) => /NaN|undefined/.test((x.title || '') + (x.detail || ''))),
    `[${s.name}] هیچ هشداری متنِ ناقص (NaN/undefined) ندارد`);

  /* یادگیری باید سهم معناداری بگیرد، نه ۳٪ */
  const learnShare = (kindMin.learn || 0) / Math.max(1, Object.values(kindMin).reduce((a, b) => a + b, 0));
  check(learnShare >= 0.12, `[${s.name}] سهم یادگیری از کل برنامه ≥ ۱۲٪`, `${Math.round(learnShare * 100)}%`);

  /* مرور باید تا نزدیک کنکور ادامه داشته باشد */
  if (S.lastReviewDate) {
    const gap = (new Date(s.cfg.examDate) - new Date(S.lastReviewDate)) / 86400000;
    check(gap <= 14, `[${s.name}] مرور تا پایان دوره حفظ می‌شود`, `${Math.round(gap)} روز فاصله`);
  }

  check(R.metrics.emptyDays <= Math.max(5, plannedDays * 0.1),
    `[${s.name}] روزهای بی‌برنامه (غیرتعطیل) اندک است`, `${R.metrics.emptyDays} روز`);
  /* «زمانِ آزادِ بسته‌بندی»: چند دقیقه در روز که با بلوک‌های حداقلی و کلاس/غذا جور
     نمی‌شود. این وقت از دست نمی‌رود، فقط بلوک نمی‌گیرد؛ باید ناچیز بماند. */
  const wastePct = (S.unplacedMinutes / Math.max(1, R.hours * 60)) * 100;
  R.metrics.freeGapPct = Number(wastePct.toFixed(2));
  check(wastePct < 3, `[${s.name}] زمانِ آزادِ بسته‌بندی زیر ۳٪ کل برنامه است`,
    `${wastePct.toFixed(2)}% (${Math.round(S.unplacedMinutes)} دقیقه)`);

  return R;
}

/* ─────────────────────────── اجرا ─────────────────────────── */
console.log('\n══════════ شبیه‌سازی سالِ کامل (v2.7.0) ══════════\n');
const results = SCENARIOS.map((s) => {
  const r = inspect(s);
  console.log(`▸ ${r.name}`);
  console.log(`   ساعت کل ${r.metrics.hours}h · پوشش ${r.metrics.coverage}% · فصل‌های خوانده‌شده ${r.metrics.learned}` +
    ` · فصل‌های دارای بلوک ${r.metrics.chapters} · روزِ فعال ${r.metrics.plannedDays}/${r.days}`);
  console.log(`   ترکیب: ${r.metrics.kinds}`);
  console.log(`   بیشینهٔ روز ${r.metrics.maxDayMin}د · زیر حد ${r.metrics.subMin} · اعشاری ${r.metrics.fractional}` +
    ` · جا‌نگرفته ${r.metrics.unplacedMinutes}د · تک‌جلسه‌ای ${r.metrics.chaptersSingleSession}\n`);
  if (VERBOSE && r.issues.length) console.log('   نمونه اشکالات:', r.issues.slice(0, 5).join(' | '), '\n');
  return r;
});

/* گزارش نهایی */
console.log('══════════ نتیجه ══════════');
if (failures.length) {
  console.log(`❌ ${fail} ادعا شکست خورد:\n` + failures.map((f) => '   • ' + f).join('\n'));
} else {
  console.log('✅ همهٔ ادعاها درست‌اند.');
}
console.log(`\nمجموع: ${pass} ✅  /  ${fail} ❌\n`);

/* میانگین‌های کلان — برای «آیا با واقعیت می‌خواند؟» */
const tot = results.reduce((a, r) => a + r.metrics.hours, 0);
const cov = results.map((r) => r.metrics.coverage);
console.log(`میانگین ساعت سالانه: ${Math.round(tot / results.length)}h · پوشش: ${Math.min(...cov)}–${Math.max(...cov)}%`);
process.exit(fail ? 1 : 0);
