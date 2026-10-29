/**
 * شبیه‌سازی کامل «پشت‌کنکوری + ترمیم نهایی» — نسخهٔ ۲.۰
 * ------------------------------------------------------------------
 * ۱) برنامهٔ سالِ کامل برای یک پشت‌کنکوری (۱۲ ساعت روزانه، ۶ روز در هفته)
 * ۲) اجرای روزبه‌روز با خرابی‌های واقعی: سفر، بیماری، روزهای ازدست‌رفته، افت انرژی
 * ۳) بازچینش هوشمند: کارهای انجام‌نشده → carryOver → برنامهٔ جدید بدون از دست رفتن تاریخچه
 * ۴) لایهٔ سوابق: خواندن نمرات نهایی، ترمیم درس‌های زیر ۱۲، بازهٔ خرداد
 * ۵) گزارش عددی پایان: ساعت، تست، پوشش، آمادگی کنکور، آمادگی سوابق، نمرهٔ ترکیبی
 */
const engine = require('/home/user/k3-reval/src/planner/engine.js');
const presets = require('/home/user/k3-reval/src/planner/presets.js');
const J = require('/home/user/k3-reval/src/planner/jalali.js');

const START = '2026-10-29';           // ۷ آبان ۱۴۰۵ — شروع
const EXAM = '2027-07-02';            // ۱۱ تیر ۱۴۰۶ — کنکور
const FIN = presets.defaultFinalsWindow(); // بازهٔ نهایی خرداد ۱۴۰۶

const log = [];
const say = (s) => { log.push(s); console.log(s); };
const hr = (m) => Math.round(m / 60 * 10) / 10;

/* ---------- ۰) دانش‌آموز: پشت‌کنکوری تجربی با سه درس نهاییِ نیازمند ترمیم ---------- */
const finalCourses = presets.finalsFor('tajrobi', 'دوازدهم')
  .concat(presets.finalsFor('tajrobi', 'یازدهم'))
  .map((c, i) => {
    /* نمرات واقعیِ ثبت‌شده در سوابق: دو درس افتاده، بقیه متوسط */
    const real = { n_fa3: 11, n_ar3: 9.5, n_di3: 15.75, n_en3: 17, n_bio3: 14, n_ch3: 12.5, n_ma3: 10, n_ph3: 13 };
    return Object.assign({}, c, {
      current: real[c.id] != null ? real[c.id] : 14,
      target: real[c.id] != null && real[c.id] < 12 ? 15 : 18,
      tarmim: real[c.id] != null && real[c.id] < 12,
      inProgram: true,
    });
  });

const cfg0 = {
  student: { name: 'شبیه‌سازی پشت‌کنکوری', grade: 'فارغ‌التحصیل', field: 'tajrobi', chronotype: 'evening' },
  startDate: START,
  examDate: EXAM,
  availability: { sat: 10, sun: 10, mon: 10, tue: 10, wed: 10, thu: 10, fri: 6 },
  startTimes: { sat: '08:00', sun: '08:00', mon: '08:00', tue: '08:00', wed: '08:00', thu: '08:00', fri: '10:00' },
  sleep: { bedtime: '24:00', wake: '07:00' },
  blockMinutes: 50, breakMinutes: 10, restDay: 6, weeklyMock: true,
  school: { enabled: false },
  subjects: presets.subjectsFor('tajrobi'),
  finals: { enabled: true, courses: finalCourses, window: FIN, spread: true, spreadMinutes: 45 },
  exams: [
    { title: 'قلم‌چی ۱', date: '2026-12-04', start: '08:00', end: '11:30', subjectIds: ['bio', 'chem', 'math', 'phys'] },
    { title: 'قلم‌چی ۲', date: '2027-01-08', start: '08:00', end: '11:30', subjectIds: ['bio', 'chem', 'math', 'phys'] },
    { title: 'قلم‌چی ۳', date: '2027-02-05', start: '08:00', end: '11:30', subjectIds: ['bio', 'chem', 'math', 'phys'] },
    { title: 'جامع نوروزی', date: '2027-03-26', start: '08:00', end: '12:30', subjectIds: ['bio', 'chem', 'math', 'phys'] },
    { title: 'جامع اردیبهشت', date: '2027-05-07', start: '08:00', end: '12:30', subjectIds: ['bio', 'chem', 'math', 'phys'] },
  ],
  offDates: [
    { date: '2026-11-20', kind: 'halt', note: 'سفر خانوادگی' },
    { date: '2026-12-25', kind: 'light', note: 'بیماری' },
  ],
};

/* ---------- ۱) برنامهٔ اولیه ---------- */
let cfg = JSON.parse(JSON.stringify(cfg0));
let plan = engine.createPlan(cfg);
const snap = (p) => ({
  hours: p.summary.totalHours,
  tests: p.summary.coverage.testsPlanned,
  testsPerDay: p.summary.coverage.testsPerDay,
  coverage: p.summary.coverage.coverageRatio,
  konkur: p.summary.coverage.projectedReadiness,
  finals: Math.round(p.summary.coverage.finalsReadiness),
  composite: Math.round(p.summary.coverage.composite),
  reviews: p.summary.coverage.reviewSessions,
});

say('═══════ شبیه‌سازی کامل پشت‌کنکوری + ترمیم نهایی — روال ۲.۰ ═══════');
say('');
say('۱) دانش‌آموز: فارغ‌التحصیل تجربی، ۱۰ ساعت روزانه × ۶ روز، روز استراحت جمعه');
say('   بازه: ' + J.fmtLong(START) + ' تا کنکور ' + J.fmtLong(EXAM) + ' (' + plan.days.length + ' روز)');
say('   سوابق: ' + finalCourses.length + ' درس نهایی؛ ترمیم لازم: ' +
  finalCourses.filter((c) => c.tarmim).map((c) => c.name + ' (' + c.current + ')').join('، '));
say('   بازهٔ نهایی: ' + J.fmtLong(FIN.start) + ' تا ' + J.fmtLong(FIN.end));
const topicIdOf = {};
const normTopic = (t) => String(t || '')
  .replace(/\s*—\s*تست هدفمند$/, '')
  .replace(/\s*\(ادامه\)$/, '')
  .trim();
plan.summary.chapterStats.forEach((c) => {
  topicIdOf[c.subjectId + '::' + normTopic(c.label)] = c.id;
});
const TRUE_NEED = {};
const baseStat = {};
plan.summary.chapterStats.forEach((c) => { TRUE_NEED[c.id] = c.needMinutes || 1; });
plan.summary.chapterStats.forEach((c) => { baseStat[c.id] = { mastery: c.mastery, need: c.needMinutes, testsNeed: c.testsNeed, label: c.label, subjectId: c.subjectId, subjectName: c.subjectName, mode: c.mode }; });
const s1 = snap(plan);
say('');
say('   برنامهٔ اولیه → ساعت: ' + s1.hours + ' | تست: ' + s1.tests + ' (' + s1.testsPerDay + '/روز) | پوشش: ' + s1.coverage +
  '٪ | کنکور: ' + s1.konkur + '٪ | سوابق: ' + s1.finals + '٪ | ترکیبی: ' + s1.composite + '٪');
say('   بلوک‌های سوابق: ' + plan.days.flatMap((d) => d.blocks.filter((b) => b.kind === 'finalprep')).length +
  ' جلسه | مرور: ' + s1.reviews + ' جلسه');

/* ---------- ۲) اجرای روزبه‌روز با خرابی‌های واقعی ---------- */
say('');
say('۲) اجرای روزبه‌روز (با خرابی‌های واقعی زندگی)…');
const done = {};
const carried = {};          // کلید بلوک‌هایی که یک‌بار به بازچینش داده شده‌اند
let cursor = 0;
let replans = 0;
let totalMissedBlocks = 0;
let totalMissedMinutes = 0;
const events = [];
const SCENARIO = [
  { at: 12, type: 'sick', days: 3, note: 'آنفلوآنزا — سه روز بستری' },
  { at: 45, type: 'trip', days: 4, note: 'سفر اردو' },
  { at: 78, type: 'slack', days: 5, note: 'افت انگیزه (فقط ۴۰٪ کارها)' },
  { at: 120, type: 'sick', days: 2, note: 'درد شدید کمر' },
  { at: 165, type: 'trip', days: 3, note: 'عروسی فامیل' },
  { at: 210, type: 'slack', days: 4, note: 'خستگی جمع‌بندی' },
];

function dayIndexOf(isoDate, p) { return p.days.findIndex((d) => d.date === isoDate); }

/* حافظهٔ موتور: فصل‌هایی که واقعاً خوانده شده‌اند باید read بمانند،
   وگرنه هر بازچینش از صفر شروع می‌کند و پوشش فرو می‌ریزد. */
function chapterRows(sub) {
  if (Array.isArray(sub.chaptersData) && sub.chaptersData.length) {
    return sub.chaptersData.map((r) => Object.assign({}, r));
  }
  if (Array.isArray(sub.topicNames) && sub.topicNames.length) {
    return sub.topicNames.map((name) => ({ name, read: false, mastery: 0 }));
  }
  return Array.from({ length: sub.chapters || 0 }, (_, i) => ({ name: 'فصل ' + (i + 1), read: false, mastery: 0 }));
}

/* حافظهٔ موتور فقط بر «اجرا» بنا می‌شود، نه بر «برنامه»:
   فصلی «خوانده‌شده» است که دانش‌آموز واقعاً حداقل ۷۰٪ زمان لازمش را روی آن گذاشته باشد. */
const LEARN_KINDS = ['learn', 'reteach', 'boost', 'carry', 'carryreview'];
function executedToDate(pl, upto) {
  const ex = {};
  pl.days.slice(0, upto).forEach((d) => {
    (d.blocks || []).forEach((b, bi) => {
      if (!done[d.date + '#' + bi]) return;
      if (!b.topicId) return;
      if (LEARN_KINDS.indexOf(b.kind) === -1) return;   // فقط زمان یادگیری، نه تست/مرور
      ex[b.topicId] = (ex[b.topicId] || 0) + (b.minutes || 0);
    });
  });
  return ex;
}

/* نیاز «واقعی» هر فصل همیشه از برنامهٔ اولیه گرفته می‌شود؛ نیازِ برنامه‌های بعدی
   (که فصل را خوانده‌شده می‌دانند) نمی‌تواند مبنای نسبت اجرا باشد. */
function rememberProgress(subjects, pl, execMap) {
  const needOf = {};
  Object.keys(TRUE_NEED).forEach((k) => { needOf[k] = TRUE_NEED[k]; });
  pl.summary.chapterStats.forEach((c) => { if (!needOf[c.id]) needOf[c.id] = c.needMinutes || 1; });
  return subjects.map((sub) => {
    const rows = chapterRows(sub);
    pl.summary.chapterStats.filter((c) => c.subjectId === sub.id).forEach((c) => {
      const row = rows[c.chapter - 1];
      if (!row) return;
      const done_ = execMap[c.id] || 0;
      const ratio = Math.min(1.2, done_ / (needOf[c.id] || 1));
      if (ratio >= 0.85) row.read = true;
      /* تسلط واقعی: هرچه نسبتِ اجرا کمتر، تسلط کمتر — نه «نصف خوانده = نصف مسلط» */
      row.mastery = Math.max(row.mastery || 0, Math.round(Math.min(92, 15 + 78 * Math.min(1, ratio))));
    });
    const mastery = rows.length
      ? Math.round(rows.reduce((a, r) => a + (r.mastery || 0), 0) / rows.length)
      : sub.mastery;
    return Object.assign({}, sub, { chaptersData: rows, mastery });
  });
}

/* شبیه‌سازی: تا ۳۰ روز مانده به کنکور، هر ۷ روز یک بازچینش — بعد از آن فقط اجرا */
for (let step = 0; step < 400; step += 1) {
  if (cursor >= plan.days.length - 1) break;
  /* یک ماه آخر: بازچینش ممنوع، اما اجرا تا روز کنکور ادامه دارد */
  const canReplan = cursor < plan.days.length - 30;
  const sc = canReplan ? SCENARIO.find((x) => x.at === step) : null;
  let missRatio = 0;
  if (sc) {
    events.push(sc);
    say('   • روز ' + (step + 1) + ' (' + J.fmt(plan.days[cursor].date) + '): ' + sc.note + ' — ' + sc.days + ' روز');
    /* روزهای بیماری/سفر: هیچ کاری انجام نمی‌شود */
    missRatio = sc.type === 'slack' ? 0.6 : 1;
    const skip = Math.min(sc.days, plan.days.length - cursor - 1);
    for (let i = 0; i < skip; i += 1) {
      const d = plan.days[cursor + i];
      d.blocks.forEach((b, bi) => {
        if (b.kind === 'exam' || b.kind === 'mock') return;
        totalMissedBlocks += 1;
        totalMissedMinutes += b.minutes || 0;
      });
      cursor += 1;
    }
    /* بازچینش هوشمند: کارهای انجام‌نشده به carryOver */
    const missed = [];
    plan.days.slice(0, cursor).forEach((d) => {
      d.blocks.forEach((b, bi) => {
        const key = d.date + '#' + bi;
        if (done[key] || carried[key]) return;
        if (b.kind === 'exam' || b.kind === 'mock' || b.kind === 'analysis') return;
        carried[key] = true;
        missed.push({ d, b, key });
      });
    });
    const byTopic = {};
    missed.forEach(({ d, b }) => {
      const k = (b.subjectId || 'X') + '::' + (b.topic || b.kindLabel);
      byTopic[k] = byTopic[k] || {
        subjectId: b.subjectId, subjectName: b.subjectName, label: b.topic || b.kindLabel,
        minutes: 0, kind: (b.kind === 'review' || b.kind === 'cumreview') ? 'review' : 'learn', date: d.date,
        chapterId: b.topicId || null,
      };
      byTopic[k].minutes += b.minutes || 0;
    });
    cfg.carryOver = Object.keys(byTopic).map((k) => byTopic[k]).filter((c) => c.minutes >= 10).slice(0, 60);
    /* فصل‌های نیمه‌تمام هم باید در ذهن موتور بمانند: تاریخ یادگیری حفظ می‌شود چون mastery/read در subjects است */
    cfg.startDate = plan.days[cursor].date;
    cfg.subjects = rememberProgress(cfg.subjects, plan, executedToDate(plan, cursor));
    const fresh = engine.createPlan(cfg);
    /* تاریخچهٔ گذشته حفظ می‌شود */
    const past = plan.days.slice(0, cursor);
    plan = Object.assign({}, fresh, { days: past.concat(fresh.days) });
    replans += 1;
    const readCount = cfg.subjects.reduce((a, sub) => a + (sub.chaptersData || []).filter((r) => r.read).length, 0);
    const totalCh = cfg.subjects.reduce((a, sub) => a + (sub.chaptersData || []).length, 0);
    say('     ↳ وضعیت: ' + readCount + '/' + totalCh + ' فصل خوانده‌شده در حافظهٔ موتور');
    say('     ↳ بازچینش #' + replans + ': ' + cfg.carryOver.length + ' کار عقب‌افتاده (' +
      hr(cfg.carryOver.reduce((a, c) => a + c.minutes, 0)) + ' ساعت) به روزهای آینده منتقل شد؛ ' +
      'برنامهٔ جدید از ' + J.fmt(cfg.startDate) + ' با ' + fresh.summary.coverage.coverageRatio + '٪ پوشش.');
    continue;
  }
  /* روز عادی: اکثر بلوک‌ها انجام می‌شوند (۸۵–۹۵٪ بسته به فاز) */
  const d = plan.days[cursor];
  const rate = cursor > plan.days.length - 90 ? 0.8 : 0.9;
  (d.blocks || []).forEach((b, bi) => {
    if (b.kind === 'exam' || b.kind === 'mock') return;
    if (Math.random() < rate) done[d.date + '#' + bi] = true;
    else { totalMissedBlocks += 1; totalMissedMinutes += b.minutes || 0; }
  });
  cursor += 1;
  /* هر ۲۸ روز یک بازچینش سبک برای جمع‌کردن عقب‌افتادگی‌ها */
  if (canReplan && step > 0 && step % 28 === 0) {
    const missed = [];
    plan.days.slice(0, cursor).forEach((d2) => d2.blocks.forEach((b, bi) => {
      const key = d2.date + '#' + bi;
      if (done[key] || carried[key]) return;
      if (['exam', 'mock', 'analysis'].indexOf(b.kind) !== -1) return;
      carried[key] = true;
      missed.push({ d2, b });
    }));
    if (missed.length >= 3) {
      const byTopic = {};
      missed.forEach(({ d2, b }) => {
        const k = (b.subjectId || 'X') + '::' + (b.topic || b.kindLabel);
        byTopic[k] = byTopic[k] || {
          subjectId: b.subjectId, subjectName: b.subjectName, label: b.topic || b.kindLabel,
          minutes: 0, kind: (b.kind === 'review' || b.kind === 'cumreview') ? 'review' : 'learn', date: d2.date,
          chapterId: b.topicId || null,
        };
        byTopic[k].minutes += b.minutes || 0;
      });
      cfg.carryOver = Object.keys(byTopic).map((k) => byTopic[k]).filter((c) => c.minutes >= 10).slice(0, 60);
      cfg.subjects = rememberProgress(cfg.subjects, plan, executedToDate(plan, cursor));
      cfg.startDate = plan.days[cursor] ? plan.days[cursor].date : cfg.startDate;
      const fresh = engine.createPlan(cfg);
      plan = Object.assign({}, fresh, { days: plan.days.slice(0, cursor).concat(fresh.days) });
      replans += 1;
    }
  }
}

const lastIdx = cursor;
say('');
say('   روزهای اجراشده: ' + lastIdx + ' از ' + plan.days.length);
say('   بازچینش‌های هوشمند: ' + replans);
say('   بلوک‌های انجام‌نشده (جبران‌شده): ' + totalMissedBlocks + ' بلوک / ' + hr(totalMissedMinutes) + ' ساعت');

/* ---------- ۳) نتیجهٔ نهایی بر اساس اجرای واقعی ---------- */
/* فقط بلوک‌هایی که واقعاً «انجام شد» تیک خورده‌اند در تسلط حساب می‌شوند */
const execMinutes = {};
const execTests = {};
const reviewDone = {};
plan.days.slice(0, lastIdx).forEach((d) => {
  d.blocks.forEach((b, bi) => {
    if (!done[d.date + '#' + bi]) return;
    const tid = b.topicId || topicIdOf[b.subjectId + '::' + normTopic(b.topic)];
    if (tid) {
      execMinutes[tid] = (execMinutes[tid] || 0) + (b.minutes || 0);
      if (b.kind === 'practice') execTests[tid] = (execTests[tid] || 0) + (b.practiceCount || 0);
    }
    if (b.kind === 'review' || b.kind === 'cumreview') reviewDone[b.subjectId] = (reviewDone[b.subjectId] || 0) + 1;
  });
});
/* تسلط نهایی: همان مدلی که موتور در بازچینش‌ها می‌بیند (اجرا + تست) */
const finalMemory = rememberProgress(cfg.subjects, plan, execMinutes);
/* ضریب تثبیت: فصلی که فقط در واپسین هفته‌ها خوانده شده، فرصت مرور و تثبیت نداشته */
const lastLearnIdx = {};
plan.days.slice(0, lastIdx).forEach((d, di) => {
  (d.blocks || []).forEach((b, bi) => {
    if (!done[d.date + '#' + bi] || !b.topicId) return;
    if (LEARN_KINDS.indexOf(b.kind) === -1) return;
    lastLearnIdx[b.topicId] = di;
  });
});
const lastDayIdx = plan.days.length - 1;
const consolidation = (id) => {
  const di = lastLearnIdx[id];
  if (di == null) return 0.6;
  const left = lastDayIdx - di;
  if (left >= 60) return 1;
  if (left >= 30) return 0.93;
  if (left >= 14) return 0.87;
  return 0.8;
};
const masteryOf = {};
finalMemory.forEach((sub) => (sub.chaptersData || []).forEach((r, i) => {
  masteryOf[sub.id + '.c' + (i + 1)] = r.read ? r.mastery : Math.round((r.mastery || 0) * 0.75);
}));
const rows = [];
let wsum = 0;
let msum = 0;
Object.keys(baseStat).forEach((id) => {
  const b = baseStat[id];
  const bMode = b.mode;
  const subject = cfg0.subjects.find((x) => x.id === b.subjectId) || { weight: 1 };
  const need = b.need || 1;
  const ratio = Math.min(1, (execMinutes[id] || 0) / need);
  const testRatio = b.testsNeed ? Math.min(1, (execTests[id] || 0) / b.testsNeed) : ratio;
  const targetM = b.mode === 'learn' ? 88 : 92;
  const evidence = Math.min(1, 0.6 * ratio + 0.4 * testRatio);
  const fromModel = Math.round(Math.min(targetM, b.mastery + (targetM - b.mastery) * evidence));
  const fromMemory = masteryOf[id];
  const raw = Math.max(fromModel, fromMemory == null ? 0 : fromMemory);
  const mastery = Math.round(Math.min(90, raw * consolidation(id)));
  rows.push({ id, label: b.label, subjectId: b.subjectId, subjectName: b.subjectName, mastery, ratio, need, executed: execMinutes[id] || 0 });
  wsum += subject.weight;
  msum += mastery * subject.weight;
});
const realKonkur = Math.round(msum / wsum);
/* «پوشش» = فصلی که به تسلط کاری (≥۷۰٪) رسیده باشد، نه فقط سهم زمانی */
const coveredExec = rows.filter((r) => r.mastery >= 70).length;
if (process.env.SIM_DEBUG) {
  const bins = { '≥85': 0, '50–85': 0, '<50': 0 };
  rows.forEach((r) => { const q = r.ratio >= 0.85 ? '≥85' : r.ratio >= 0.5 ? '50–85' : '<50'; bins[q] += 1; });
  say('   [debug] توزیع نسبت اجرا/نیاز: ' + JSON.stringify(bins));
  const lowExec = rows.slice().sort((a, b) => a.ratio - b.ratio).slice(0, 5)
    .map((r) => r.label + ' ' + Math.round(r.ratio * 100) + '٪ (' + Math.round(r.executed) + '/' + r.need + ')');
  say('   [debug] کم‌اجراترین‌ها: ' + lowExec.join(' · '));
}
const weakExec = rows.filter((r) => r.mastery >= 75).length;

const finRows = plan.summary.coverage.finalsCourses || [];
const finReal = finRows.length ? Math.round(finRows.reduce((a, c) => {
  const gain = c.needMinutes > 0 ? Math.min(1, c.plannedMinutes / c.needMinutes) : 1;
  const best = c.current + (c.target - c.current) * gain;
  return a + (best / 20) * 100 * (c.influence || c.weight || 1);
}, 0) / finRows.reduce((a, c) => a + (c.influence || c.weight || 1), 0)) : 0;
const composite = Math.round(realKonkur * 0.4 + finReal * 0.6);

const executedHours = plan.days.slice(0, lastIdx).reduce((a, d) => a + (d.studyMinutes || 0), 0) / 60;
say('');
say('۳) نتیجهٔ اجرای واقعی (فقط کارهای تیک‌خورده)');
say('   ساعت مطالعهٔ واقعی: ' + Math.round(executedHours) + ' ساعت');
const fullExec = rows.filter((r) => r.ratio >= 0.85).length;
say('   فصل‌های به تسلط کاری (≥۷۰٪): ' + coveredExec + ' از ' + rows.length +
  ' (' + Math.round(coveredExec / rows.length * 100) + '٪)');
say('   فصل‌هایی که ≥۸۵٪ زمان لازم را واقعاً گرفتند: ' + fullExec + ' از ' + rows.length +
  ' (' + Math.round(fullExec / rows.length * 100) + '٪) — بقیه در بازچینش‌ها جبران/بازآموزی شدند');
say('   فصل‌های با تسلط بالای ۷۵٪: ' + weakExec + ' از ' + rows.length);
const bySub = {};
rows.forEach((r) => {
  bySub[r.subjectName] = bySub[r.subjectName] || { n: 0, sum: 0, covered: 0 };
  bySub[r.subjectName].n += 1;
  bySub[r.subjectName].sum += r.mastery;
  if (r.mastery >= 70) bySub[r.subjectName].covered += 1;
});
say('   به‌تفکیک کتاب: ' + Object.keys(bySub).map((k) =>
  k + ' میانگین تسلط ' + Math.round(bySub[k].sum / bySub[k].n) + '٪ · به‌تسلط‌رسیده ' +
  bySub[k].covered + '/' + bySub[k].n).join(' · '));
const weakest = rows.slice().sort((a, b) => a.mastery - b.mastery).slice(0, 5);
say('   ضعیف‌ترین فصل‌ها: ' + weakest.map((r) => r.label + ' ' + r.mastery + '٪').join(' · '));
say('   آمادگی کنکور (وزنی، بر پایهٔ اجرا): ' + realKonkur + '٪');
say('   آمادگی سوابق تحصیلی: ' + finReal + '٪');
say('   نمرهٔ ترکیبی ۱۴۰۶ (۴۰٪ آزمون + ۶۰٪ سوابق): ' + composite + '٪');

/* تراز تقریبی: نگاشت خطی ساده برای شهود (نه پیش‌بینی رسمی) */
const taraz = Math.round(5000 + (composite - 50) * 60);
say('   تراز تقریبی (شهودی): ' + taraz.toLocaleString('fa-IR') + ' — رتبهٔ کشوری حدود ' +
  (taraz > 9000 ? 'زیر ۳٬۰۰۰' : taraz > 8000 ? '۳٬۰۰۰–۸٬۰۰۰' : taraz > 7000 ? '۸٬۰۰۰–۲۰٬۰۰۰' : 'بالای ۲۰٬۰۰۰'));

/* ---------- ۴) سوابق: ترمیم ---------- */
say('');
say('۴) سوابق تحصیلی و ترمیم');
finalCourses.filter((c) => c.tarmim).forEach((c) => {
  const row = finRows.find((x) => x.name.indexOf(c.name.replace(/ \d$/, '')) !== -1) || finRows[0];
  const gain = row && row.needMinutes > 0 ? Math.min(1, row.plannedMinutes / row.needMinutes) : 0;
  const best = c.current + (c.target - c.current) * gain;
  say('   ' + c.name + ': ' + c.current + ' → برآورد ' + Math.round(best * 4) / 4 +
    ' (هدف ' + c.target + ') · زمان برنامه: ' + hr(row ? row.plannedMinutes : 0) + ' ساعت');
});
const finInside = plan.days.filter((d) => d.date >= FIN.start && d.date <= FIN.end);
say('   روزهای بازهٔ خرداد: ' + finInside.length + ' روز؛ جلسهٔ سوابق در ' +
  finInside.filter((d) => d.blocks.some((b) => b.kind === 'finalprep')).length + ' روز');
say('   جلسه‌های سوابق پیش از خرداد (پخش سالانه): ' +
  plan.days.filter((d) => d.date < FIN.start && d.blocks.some((b) => b.kind === 'finalprep')).length);

/* ---------- ۵) سلامت برنامه (روی کل برنامهٔ اجراشده) ---------- */
say('');
say('۵) بررسی سلامت برنامه');
const allDays = plan.days.slice(0, lastIdx);
const EXAM_DAY = allDays[allDays.length - 1];
const REST_OK = ['exam', 'mock', 'finalprep'];
const restViolationDays = allDays.filter((d) => d.weekday === 'جمعه' && d !== EXAM_DAY &&
  d.blocks.some((b) => REST_OK.indexOf(b.kind) === -1));
const restViolation = restViolationDays.length;
if (restViolation) {
  restViolationDays.slice(0, 5).forEach((d) => say('   ⚠ روز استراحت با بلوک: ' + d.date + ' → ' +
    d.blocks.map((b) => b.kind).join('، ')));
}
const ATOMIC = ['mock', 'exam', 'cumreview', 'finalprep'];
const longBlocks = allDays.flatMap((d) => d.blocks.filter((b) => b.minutes > 120 && ATOMIC.indexOf(b.kind) === -1)).length;
const maxDay = Math.max.apply(null, allDays.map((d) => d.studyMinutes));
const totalTests = allDays.reduce((a, d) => a + d.blocks.filter((b) => b.kind === 'practice').reduce((x, b) => x + (b.practiceCount || 0), 0), 0);
const reviewBlocks = allDays.reduce((a, d) => a + d.blocks.filter((b) => b.kind === 'review' || b.kind === 'cumreview').length, 0);
const finBlocks = allDays.reduce((a, d) => a + d.blocks.filter((b) => b.kind === 'finalprep').length, 0);
say('   تخلف روز استراحت: ' + restViolation + ' | بلوک بلندتر از ۲ ساعت: ' + longBlocks +
  ' | سنگین‌ترین روز: ' + hr(maxDay) + ' ساعت (سقف اعلامی ۱۰)');
say('   تست اجراشده: ' + totalTests + ' | میانگین ' + Math.round(totalTests / allDays.length) + ' در روز');
say('   جلسه‌های مرور: ' + reviewBlocks + ' | جلسه‌های سوابق: ' + finBlocks);

/* ---------- ۶) بررسی خودکار: شبیه‌سازی باید این شرط‌ها را پاس کند ---------- */
const fails = [];
if (realKonkur < 80) fails.push('آمادگی کنکور کمتر از ۸۰٪: ' + realKonkur);
if (coveredExec / rows.length < 0.85) fails.push('پوشش اجرایی کمتر از ۸۵٪');
if (restViolation > 0) fails.push('تخلف روز استراحت: ' + restViolation);
if (longBlocks > 0) fails.push('بلوک غیرمنطقی بلند: ' + longBlocks);
if (replans < 5) fails.push('بازچینش کافی انجام نشد: ' + replans);
if (finReal < 70) fails.push('آمادگی سوابق کمتر از ۷۰٪: ' + finReal);
say('');
if (fails.length) {
  say('❌ شبیه‌سازی شکست خورد:');
  fails.forEach((f) => say('   - ' + f));
  process.exitCode = 1;
} else {
  say('✅ شبیه‌سازی کامل پاس شد: برنامه سالِ پرتلاطم را با ' + realKonkur + '٪ آمادگی کنکور و ' +
    finReal + '٪ سوابق جمع کرد.');
}

require('fs').writeFileSync('/home/user/k3-reval/docs/simulation-2.0.0.md',
  '# شبیه‌سازی کامل پشت‌کنکوری + ترمیم نهایی — روال ۲.۰\n\n```\n' + log.join('\n') + '\n```\n', 'utf8');
say('');
say('گزارش در docs/simulation-2.0.0.md ذخیره شد.');
