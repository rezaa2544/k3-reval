/**
 * موتور برنامه‌ریزی هوشمند روال (Reval Smart Planner Engine) — نسخه ۲
 * ------------------------------------------------------------------
 * تازه در v2:
 *   • کلاس‌های آنلاین هفتگی (رویدادهای ثابت) به‌عنوان «بلوک‌های اشغال‌شده»
 *   • آزمون‌های آزمایشی با تاریخ و بازهٔ ساعتی؛ برنامه حول آن‌ها چیده می‌شود
 *   • زمان‌بندی روی «بازه‌های آزاد واقعی» روز (نه ساعت خام)
 *   • بلوک «تثبیت کلاس» در ۲۴ ساعت طلایی بعد از هر کلاس
 *   • رژیم پیش‌آزمون: ۳ روز آخر فقط مرور (بدون یادگیری جدید) + مرور نهایی روز قبل + تحلیل بعد از آزمون
 *
 * مبانی علمی (docs/research-study-methods.md):
 *   تخصیص زمان ∝ ضریب × (۱−تسلط) · مرور فاصله‌دار (Cepeda) · بازیابی فعال (Roediger & Karpicke)
 *   تمرین درهم (Rohrer) · پنجرهٔ اوج شبانه‌روزی + قفل خواب (Rasch & Born) · نیت‌های اجرایی (Gollwitzer)
 */

(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.RevalPlanner = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const DEFAULTS = {
    blockMinutes: 45,
    breakMinutes: 10,
    REVIEW_LADDER: [1, 3, 7, 16, 35],
    FIRST_GAP_RATIO: 0.15,
    MAX_REVIEWS_PER_TOPIC: 5,
    INTERVAL_PERF_K: 0.8,
    RETRIEVAL_TAIL_MIN: 5,
    NEXT_DAY_REVIEW_MIN: 15,
    MAX_CONSECUTIVE_SAME: 2,
    SLEEP_GUARD_MIN: 45,
    BUFFER_RATIO: 0.15,
    DELOAD_EVERY: 4,
    DELOAD_RATIO: 0.75,
    RAMP_UP: { start: 0.75, step: 0.1 },
    CLASS_FIX_MIN: 25,        // تثبیت کلاس
    CLASS_GAP_MIN: 10,        // فاصله لازم بعد از کلاس قبل از بلوک بعدی
    PRE_EXAM_DAYS: 3,         // از این تعداد روز مانده به آزمون: فقط مرور
    PRE_EXAM_CAP: 0.75,       // کاهش بار در روزهای پیش‌آزمون
    EVE_CAP: 0.45,            // روز قبل آزمون
    POST_EXAM_ANALYSIS_MIN: 30,
    WEEKLY_MOCK_DAY: 5,
    WEEKLY_MOCK_MIN: 100,
    MOCK_ANALYSIS_MIN: 35,
    MIN_BLOCK: 20,
  };

  const WEEKDAY_FA = ['شنبه', 'یکشنبه', 'دوشنبه', 'سه‌شنبه', 'چهارشنبه', 'پنجشنبه', 'جمعه'];
  const WEEKDAY_KEY = ['sat', 'sun', 'mon', 'tue', 'wed', 'thu', 'fri'];

  const SUBJECT_TYPE_FA = {
    memorization: 'حفظی–مفهومی',
    conceptual: 'مفهومی',
    problem: 'محاسباتی/مسئله‌ای',
  };

  /* ------------------------------------------------------------------ */
  /* ابزار تاریخ/زمان                                                    */
  /* ------------------------------------------------------------------ */

  function toDate(value) {
    if (value instanceof Date) return new Date(value.getTime());
    const s = String(value).trim();
    const m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (m) return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
    const d = new Date(s);
    if (isNaN(d.getTime())) throw new Error('تاریخ نامعتبر: ' + value);
    return new Date(d.getFullYear(), d.getMonth(), d.getDate());
  }
  function addDays(date, n) { const d = new Date(date.getTime()); d.setDate(d.getDate() + n); return d; }
  function dayDiff(a, b) {
    const A = new Date(a.getFullYear(), a.getMonth(), a.getDate());
    const B = new Date(b.getFullYear(), b.getMonth(), b.getDate());
    return Math.round((B - A) / 86400000);
  }
  function isoDay(date) {
    const p = (n) => String(n).padStart(2, '0');
    return date.getFullYear() + '-' + p(date.getMonth() + 1) + '-' + p(date.getDate());
  }
  function persianWeekday(date) { return (date.getDay() + 1) % 7; }

  function parseHM(hm) {
    const m = String(hm || '').match(/^(\d{1,2}):(\d{2})$/);
    if (!m) return { h: 23, m: 30 };
    return { h: Number(m[1]) % 24, m: Number(m[2]) % 60 };
  }
  function minutesSinceMidnight(hm) { const t = parseHM(hm); return t.h * 60 + t.m; }
  function fmtHM(total) {
    const t = ((Math.round(total) % 1440) + 1440) % 1440;
    return String(Math.floor(t / 60)).padStart(2, '0') + ':' + String(t % 60).padStart(2, '0');
  }
  function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }
  function roundTo5(n) { return Math.round(n / 5) * 5; }
  function sum(arr) { return arr.reduce((a, b) => a + b, 0); }
  function toFa(n) { return String(n).replace(/[0-9]/g, (d) => '۰۱۲۳۴۵۶۷۸۹'[+d]); }

  /* ------------------------------------------------------------------ */
  /* نرمال‌سازی تنظیمات                                                  */
  /* ------------------------------------------------------------------ */

  function normalizeConfig(input) {
    const cfg = Object.assign({}, DEFAULTS, input || {});
    const start = toDate(cfg.startDate || new Date());
    const exam = toDate(cfg.examDate || addDays(start, 120));
    cfg.startDate = isoDay(start);
    cfg.examDate = isoDay(exam);
    cfg._start = start;
    cfg._exam = exam;

    const avail = Object.assign({ sat: 4, sun: 4, mon: 4, tue: 4, wed: 4, thu: 6, fri: 5 }, cfg.availability || {});
    cfg.availability = {};
    WEEKDAY_KEY.forEach((k) => { cfg.availability[k] = clamp(Number(avail[k]) || 0, 0, 16); });

    const starts = Object.assign(
      { sat: '16:00', sun: '16:00', mon: '16:00', tue: '16:00', wed: '16:00', thu: '09:00', fri: '09:00' },
      cfg.startTimes || {}
    );
    cfg.startTimes = starts;
    cfg.sleep = Object.assign({ bedtime: '23:30', wake: '07:00' }, cfg.sleep || {});
    cfg.student = Object.assign({ name: 'دانش‌آموز', grade: 'دوازدهم', field: 'tajrobi', chronotype: 'neutral' }, cfg.student || {});
    cfg.blockMinutes = clamp(Number(cfg.blockMinutes) || 45, 20, 120);
    cfg.breakMinutes = clamp(Number(cfg.breakMinutes) || 10, 0, 30);
    cfg.restDay = clamp(Number(cfg.restDay), 0, 7);
    cfg.weeklyMock = cfg.weeklyMock !== false;

    cfg.subjects = (cfg.subjects || []).map((s, i) => ({
      id: s.id || 'S' + (i + 1),
      name: s.name || 'درس ' + (i + 1),
      weight: Math.max(0.2, Number(s.weight) || 1),
      chapters: clamp(Number(s.chapters) || 1, 1, 100),
      masteredChapters: clamp(Number(s.masteredChapters) || 0, 0, 100),
      mastery: clamp(Number(s.mastery) || 0, 0, 100),
      difficulty: clamp(Number(s.difficulty) || 2, 1, 3),
      type: s.type || 'conceptual',
      examPercent: s.examPercent == null ? null : clamp(Number(s.examPercent), -33, 100),
      include: s.include !== false,
    })).filter((s) => s.include);
    if (!cfg.subjects.length) throw new Error('حداقل یک درس لازم است.');

    const subjectIds = new Set(cfg.subjects.map((s) => s.id));

    /* --- کلاس‌های آنلاین هفتگی (رویداد ثابت) --- */
    cfg.classes = (cfg.classes || []).map((c, i) => {
      const from = String(c.start || '18:00');
      let to = String(c.end || '20:00');
      if (minutesSinceMidnight(to) <= minutesSinceMidnight(from)) {
        to = fmtHM(minutesSinceMidnight(from) + 120);
      }
      return {
        id: c.id || 'C' + (i + 1),
        title: (c.title || 'کلاس آنلاین').trim(),
        subjectId: subjectIds.has(c.subjectId) ? c.subjectId : null,
        weekdays: (Array.isArray(c.weekdays) ? c.weekdays : [c.weekday])
          .map((d) => clamp(Number(d), 0, 6))
          .filter((d, idx, arr) => Number.isFinite(d) && arr.indexOf(d) === idx),
        start: from,
        end: to,
        active: c.active !== false,
      };
    }).filter((c) => c.active && c.weekdays.length);

    /* --- آزمون‌های آزمایشی --- */
    cfg.exams = (cfg.exams || []).map((e, i) => {
      let date;
      try { date = isoDay(toDate(e.date)); } catch { return null; }
      const from = String(e.start || '08:00');
      let to = String(e.end || '12:00');
      if (minutesSinceMidnight(to) <= minutesSinceMidnight(from)) to = fmtHM(minutesSinceMidnight(from) + 180);
      return {
        id: e.id || 'E' + (i + 1),
        title: (e.title || 'آزمون آزمایشی').trim(),
        date,
        start: from,
        end: to,
        subjectIds: (e.subjectIds || []).filter((id) => subjectIds.has(id)),
      };
    }).filter(Boolean).sort((a, b) => (a.date < b.date ? -1 : 1));

    return cfg;
  }

  /* ------------------------------------------------------------------ */
  /* مدل مباحث و اولویت                                                  */
  /* ------------------------------------------------------------------ */

  function buildTopics(cfg) {
    const topics = [];
    cfg.subjects.forEach((s) => {
      const base = s.type === 'memorization' ? 60 : s.type === 'problem' ? 120 : 85;
      for (let i = 1; i <= s.chapters; i++) {
        const isMastered = i <= Math.floor(s.masteredChapters);
        const mastered = isMastered ? 100 : s.mastery;
        const need = base * s.difficulty * ((100 - mastered) / 100);
        topics.push({
          id: s.id + '.c' + i,
          subjectId: s.id,
          subjectName: s.name,
          chapter: i,
          label: 'فصل ' + toFa(i),
          mastery: mastered,
          needMinutes: Math.max(0, roundTo5(need)),
          learnedOn: null,
          reviews: [],
        });
      }
    });
    return topics;
  }

  function scoreSubjects(cfg) {
    const active = cfg.subjects;
    const weightSum = sum(active.map((s) => s.weight)) || 1;
    const stats = {};
    active.forEach((s) => {
      const wNorm = s.weight / weightSum;
      const gap = 1 - s.mastery / 100;
      const demand = s.difficulty / 3;
      const examPenalty = s.examPercent == null ? 1 : clamp(1.2 - s.examPercent / 100, 0.55, 1.25);
      const raw = Math.pow(wNorm, 0.85) * (0.25 + 0.75 * gap) * (0.75 + 0.5 * demand) * examPenalty;
      stats[s.id] = { weight: s.weight, wNorm, gap, demand, raw, minutes: 0, blocks: 0, share: 0 };
    });
    const total = sum(Object.values(stats).map((x) => x.raw)) || 1;
    Object.keys(stats).forEach((k) => { stats[k].share = stats[k].raw / total; });
    return stats;
  }

  function firstReviewGap(daysLeft) {
    const ratio = DEFAULTS.FIRST_GAP_RATIO;
    const g = Math.round((daysLeft || 60) * ratio);
    if (daysLeft > 90) return clamp(g, 3, 21);
    if (daysLeft > 30) return clamp(g, 2, 10);
    return clamp(g, 1, 5);
  }

  function reviewInterval(prevGap, perf, daysLeft) {
    const k = DEFAULTS.INTERVAL_PERF_K;
    const perfFactor = perf == null ? 1 : 0.6 + k * (perf / 100) * 1.25;
    const next = Math.round(prevGap * 1.9 * perfFactor);
    const ceiling = Math.max(2, Math.round((daysLeft || 60) * 0.45));
    return clamp(next, prevGap + 1, ceiling);
  }

  /* ------------------------------------------------------------------ */
  /* تایم‌لاین روز: رویدادهای ثابت → بازه‌های آزاد                         */
  /* ------------------------------------------------------------------ */

  /** رویدادهای ثابت یک تاریخ (کلاس‌های هفتگی + آزمون‌ها) */
  function busyEventsFor(cfg, date, dayIndex) {
    const wd = persianWeekday(date);
    const iso = isoDay(date);
    const out = [];

    cfg.classes.forEach((c) => {
      if (!c.weekdays.includes(wd)) return;
      out.push({
        type: 'class',
        id: c.id,
        title: c.title,
        subjectId: c.subjectId,
        subjectName: c.subjectId ? (cfg.subjects.find((s) => s.id === c.subjectId) || {}).name : '',
        start: minutesSinceMidnight(c.start),
        end: minutesSinceMidnight(c.end),
      });
    });

    cfg.exams.forEach((e) => {
      if (e.date !== iso) return;
      out.push({
        type: 'exam',
        id: e.id,
        title: e.title,
        subjectIds: e.subjectIds,
        subjectNames: e.subjectIds.map((id) => (cfg.subjects.find((s) => s.id === id) || {}).name).filter(Boolean),
        start: minutesSinceMidnight(e.start),
        end: minutesSinceMidnight(e.end),
      });
    });

    return out.sort((a, b) => a.start - b.start);
  }

  /** بازه‌های آزادِ قابل مطالعه در یک روز */
  function freeSegments(cfg, date, busy) {
    const wd = persianWeekday(date);
    const key = WEEKDAY_KEY[wd];
    const windowStart = minutesSinceMidnight(cfg.startTimes[key]);
    const bedGuard = minutesSinceMidnight(cfg.sleep.bedtime) - (cfg.SLEEP_GUARD_MIN || DEFAULTS.SLEEP_GUARD_MIN);
    if (bedGuard <= windowStart) return [];

    // ادغام رویدادهای هم‌پوشان
    const busySorted = busy
      .map((b) => ({ start: b.start, end: b.end }))
      .sort((a, b) => a.start - b.start);
    const merged = [];
    busySorted.forEach((b) => {
      const last = merged[merged.length - 1];
      if (last && b.start <= last.end) last.end = Math.max(last.end, b.end);
      else merged.push({ start: b.start, end: b.end });
    });

    const segs = [];
    let cursor = windowStart;
    merged.forEach((b) => {
      if (b.end <= cursor) return;
      if (b.start > cursor) segs.push({ start: cursor, end: Math.min(b.start, bedGuard) });
      cursor = Math.max(cursor, b.end + (cfg.CLASS_GAP_MIN || DEFAULTS.CLASS_GAP_MIN));
    });
    if (cursor < bedGuard) segs.push({ start: cursor, end: bedGuard });

    return segs.filter((s) => s.end - s.start >= 15);
  }

  /** بار روز: min(ساعت در دسترس کاربر، زمان آزاد واقعی) با تعدیل هفته/پیش‌آزمون */
  function dayLoad(cfg, date, dayIndex, totalDays, freeMinutes, preExam) {
    const wd = persianWeekday(date);
    const key = WEEKDAY_KEY[wd];
    let capHours = cfg.availability[key];
    if (cfg.restDay !== 7 && wd === cfg.restDay) capHours = 0;

    const week = Math.floor(dayIndex / 7);
    const ramp = clamp(cfg.RAMP_UP.start + cfg.RAMP_UP.step * week, cfg.RAMP_UP.start, 1);
    const isDeload = cfg.DELOAD_EVERY > 0 && week > 0 && week % cfg.DELOAD_EVERY === cfg.DELOAD_EVERY - 1;
    const deload = isDeload ? cfg.DELOAD_RATIO : 1;

    let factor = ramp * deload;
    if (preExam.level === 1) factor *= cfg.PRE_EXAM_CAP;
    if (preExam.level === 2) factor *= cfg.EVE_CAP;

    let minutes = Math.min(capHours * 60 * factor, freeMinutes * factor);
    minutes = Math.max(0, Math.floor(minutes * (1 - (cfg.BUFFER_RATIO != null ? cfg.BUFFER_RATIO : DEFAULTS.BUFFER_RATIO))));
    return { minutes, isDeload, week };
  }

  /* ------------------------------------------------------------------ */
  /* چیدن تسک‌ها در بازه‌های آزاد                                         */
  /* ------------------------------------------------------------------ */

  function demandOf(task) {
    if (task.kind === 'exam') return 4;
    if (task.kind === 'mock') return 3.5;
    if (task.kind === 'learn') return task.topic && task.topic.mastery < 50 ? 3 : 2.4;
    if (task.kind === 'practice') return 2.2;
    if (task.kind === 'analysis') return 1.6;
    if (task.kind === 'classfix') return 1.9;
    if (task.kind === 'review') return 1.5;
    return 1;
  }

  function peakScore(cfg, segment, windowStart, windowEnd) {
    const mid = (segment.start + segment.end) / 2;
    const t = windowEnd > windowStart ? (mid - windowStart) / (windowEnd - windowStart) : 0.5;
    const chrono = cfg.student.chronotype;
    if (chrono === 'morning') return 1 - t;
    if (chrono === 'evening') return t;
    return 1 - Math.abs(t - 0.42) * 1.6;
  }

  /**
   * تسک‌ها را در بازه‌های آزاد می‌چیند؛ هم‌زمان سه قید را رعایت می‌کند:
   *   ۱) اولویت (آزمون > تثبیت کلاس > مرور > یادگیری > تمرین)
   *   ۲) interleaving: حداکثر ۲ بلوک متوالی از یک درس در هر بازه
   *   ۳) synchrony: تسک سنگین‌تر در بازهٔ اوجِ کاربر
   * @returns {{blocks:Array, unplacedMinutes:number}}
   */
  function scheduleTasks(cfg, tasks, segments) {
    if (!segments.length) return { blocks: [], unplacedMinutes: sum(tasks.map((t) => t.minutesLeft || 0)) };

    const maxSame = cfg.MAX_CONSECUTIVE_SAME != null ? cfg.MAX_CONSECUTIVE_SAME : DEFAULTS.MAX_CONSECUTIVE_SAME;
    const winStart = Math.min.apply(null, segments.map((s) => s.start));
    const winEnd = Math.max.apply(null, segments.map((s) => s.end));

    const state = segments.map((s) => ({ start: s.start, end: s.end, cursor: s.start, last: [] }));
    const blocks = [];
    const pool = tasks.filter((t) => (t.minutesLeft || 0) > 0);

    let guard = 0;
    while (pool.length && guard++ < 500) {
      let best = null;

      pool.forEach((task, ti) => {
        const atomic = task.kind === 'exam' || task.kind === 'mock';
        const chunk = Math.min(atomic ? task.minutesLeft : cfg.blockMinutes, task.minutesLeft);
        state.forEach((seg, si) => {
          const pad0 = seg.cursor > seg.start ? cfg.breakMinutes : 0;
          const from = Math.max(seg.cursor + pad0, task.afterMin || 0);   // «تثبیت کلاس» بعد از کلاس
          const pad = from > seg.cursor ? 0 : pad0;
          const remaining = seg.end - from;
          if (remaining < Math.min(cfg.MIN_BLOCK, chunk)) return;

          const useLen = Math.min(chunk, remaining);
          if (atomic && useLen < chunk) return; // آزمون نصفه چیده نمی‌شود
          if (useLen < Math.min(cfg.MIN_BLOCK, chunk)) return;

          const peak = peakScore(cfg, seg, winStart, winEnd);
          let score = task.priority || 0;
          score += peak * demandOf(task) * 40;         // تسک سنگین‌تر در اوج
          if (useLen === chunk) score += 20;            // بلوک کامل بهتر از تکه‌تکه است

          const last = seg.last;
          if (last.length) {
            const run = trailingRun(last, task.subjectId);
            if (run >= maxSame) score -= 100000;        // نقض interleaving
            else if (run > 0) score -= 220;             // ترجیح تنوع
          }
          if (!best || score > best.score) best = { score, task, ti, seg, si, useLen, start: from };
        });
      });

      // اگر تنها گزینهٔ باقی‌مانده نقض interleaving است (مثلاً همهٔ تسک‌های مانده یک درس‌اند)،
      // برنامه را ناقص نمی‌گذاریم: آن را با پذیرش تکرار می‌چینیم.
      if (best && best.score < -50000) best = bestFallback(cfg, pool, state);
      if (!best) break; // دیگر هیچ تسکی در هیچ بازه‌ای جا نمی‌شود

      const { task, seg, useLen, start } = best;
      const frac = useLen / (task.minutesLeft || useLen);
      blocks.push({
        start,
        end: start + useLen,
        minutes: useLen,
        kind: task.kind,
        task,
        subjectId: task.subjectId,
        subjectName: task.subjectName,
        topicLabel: task.topicLabel,
        practiceCount: task.practiceCount ? Math.max(3, Math.round(task.practiceCount * frac)) : null,
        examId: task.examId || null,
      });

      seg.cursor = start + useLen;
      seg.last.push(task.subjectId);
      task.minutesLeft -= useLen;
      if (task.minutesLeft <= 0) pool.splice(best.ti, 1);
    }

    blocks.sort((a, b) => a.start - b.start);
    return { blocks, unplacedMinutes: sum(pool.map((t) => t.minutesLeft || 0)) };
  }

  /** انتخاب تسک بدون اعمال جریمهٔ سخت interleaving (برای وقتی گزینهٔ دیگری نیست) */
  function bestFallback(cfg, pool, state) {
    let best = null;
    pool.forEach((task, ti) => {
      const chunk = Math.min(cfg.blockMinutes, task.minutesLeft);
      state.forEach((seg, si) => {
        const pad = seg.cursor > seg.start ? cfg.breakMinutes : 0;
        const remaining = seg.end - seg.cursor - pad;
        const useLen = Math.min(chunk, remaining);
        if (useLen < Math.min(cfg.MIN_BLOCK, chunk)) return;
        const score = (task.priority || 0) + (useLen === chunk ? 20 : 0);
        if (!best || score > best.score) best = { score, task, ti, seg, si, useLen, start: seg.cursor + pad };
      });
    });
    return best;
  }

  function trailingRun(list, subjectId) {
    let run = 0;
    for (let i = list.length - 1; i >= 0 && list[i] === subjectId; i--) run++;
    return run;
  }

  /* ------------------------------------------------------------------ */
  /* متن‌ها                                                              */
  /* ------------------------------------------------------------------ */

  function kindLabel(kind) {
    return {
      learn: 'یادگیری جدید',
      review: 'مرور فاصله‌دار',
      practice: 'تمرین/تست',
      mock: 'آزمون جامع',
      exam: 'آزمون آزمایشی',
      analysis: 'تحلیل خطا',
      warmup: 'مرور ۲۴ساعته',
      classfix: 'تثبیت کلاس',
      rest: 'استراحت',
    }[kind] || kind;
  }

  function techniqueFor(kind) {
    return {
      learn: 'یادگیری + خودتوضیحی + بازیابی ۵ دقیقه‌ای',
      review: 'بازیابی فعال (Active Recall)',
      practice: 'تمرین درهم (Interleaving)',
      mock: 'آزمون‌محوری (Testing Effect)',
      exam: 'شبیه‌سازی شرایط آزمون',
      analysis: 'فراشناخت / دفتر اشتباهات',
      warmup: 'مرور ۲۴ساعته (Spacing)',
      classfix: 'تثبیت بعد از کلاس (۲۴ ساعت طلایی)',
    }[kind] || '';
  }

  function contentFor(t, block) {
    if (t.kind === 'learn') return 'مطالعهٔ فعال + نت‌برداریِ پرسشی (سؤال‌هایی که بعداً از خودت می‌پرسی)';
    if (t.kind === 'review') return 'بازیابی بدون کتاب: تعریف‌ها/فرمول‌ها را از حافظه بنویس، بعد چک کن';
    if (t.kind === 'practice') return (block.practiceCount || 10) + ' تست زمان‌دار از مبحث‌های قبلی (درهم)';
    if (t.kind === 'warmup') return 'نوشتن هر چه از دیروز یادت مانده، بدون نگاه کردن';
    if (t.kind === 'classfix') return 'همان شبِ کلاس: خلاصهٔ کلاس را از حافظه بازنویسی کن و سؤال‌های بی‌جواب را علامت بزن';
    if (t.kind === 'mock') return 'آزمون کامل در شرایط واقعی';
    if (t.kind === 'exam') return 'آزمون آزمایشی — با آرامش و مدیریت زمان';
    if (t.kind === 'analysis') return 'دسته‌بندی غلط‌ها: بی‌دقتی / نبودِ مفهوم / کمبودِ سرعت — و ساخت «کارت اشتباه»';
    return '';
  }

  function whyFor(kind) {
    return {
      warmup: 'مرور ۲۴ساعته: یادآوریِ مبحث دیروز درست پیش از فراموشی، حافظه را تثبیت می‌کند (اصل فاصله‌گذاری).',
      classfix: 'کلاس، رمزگذاریِ تازه ساخته؛ کوتاه‌ترین بازیابی در ۲۴ ساعت اول بیشترین اثر را روی ماندگاری دارد.',
      learn: 'یادگیری اولیه در پنجره اوجِ توجه؛ پایان بلوک با ۵ دقیقه بازیابی فعال بدون نگاه کردن به جزوه.',
      review: 'مرور فاصله‌دار: فاصله طوری انتخاب شده که بازیابی کمی سخت باشد — همین سختی حافظه را می‌سازد.',
      practice: 'تمرین درهم: تشخیص «کدام روش/فرمول؟» همان مهارتی است که در آزمون سنجیده می‌شود.',
      mock: 'آزمون خودش یادگیری است، نه فقط اندازه‌گیری (اثر آزمون).',
      exam: 'آزمون واقعی؛ بعد از آن بلافاصله تحلیل خطا مهم‌تر از خودِ نمره است.',
      analysis: 'هر غلط به یک «کارت اشتباه» تبدیل می‌شود و در مرورهای بعدی اولویت می‌گیرد.',
    }[kind] || '';
  }

  function ifThenFor(kind, startMin, subjectName, topicLabel, practiceCount) {
    const time = fmtHM(startMin);
    const base = {
      learn: 'اگر ساعت ' + time + ' شد، آنگاه گوشی را بی‌صدا می‌کنم و فقط ' + subjectName + ' — ' + topicLabel + ' را شروع می‌کنم.',
      review: 'اگر ساعت ' + time + ' شد، آنگاه اول ۵ سؤال از ' + subjectName + ' را بدون کتاب جواب می‌دهم، بعد چک می‌کنم.',
      practice: 'اگر ساعت ' + time + ' شد، آنگاه ' + (practiceCount || 10) + ' تستِ ' + subjectName + ' را زمان‌دار می‌زنم.',
      exam: 'اگر ساعت ' + time + ' شد، آنگاه گوشی را خاموش می‌کنم و آزمون را مثل کنکور مدیریت می‌کنم.',
      mock: 'اگر ساعت ' + time + ' شد، آنگاه آزمون را در شرایط واقعی (بدون وقفه، با زمان‌سنج) می‌دهم.',
      analysis: 'اگر ساعت ' + time + ' شد، آنگاه سه غلط اصلی را در دفتر اشتباهات ثبت می‌کنم.',
      warmup: 'اگر ساعت ' + time + ' شد، آنگاه بدون باز کردن جزوه، هرچه از دیروز یادم مانده را می‌نویسم.',
      classfix: 'اگر کلاس ' + subjectName + ' تمام شد، آنگاه تا قبل از خواب ۱۵ دقیقه بی‌نگاه‌کردن به جزوه، همه‌چیز را بازگو می‌کنم.',
    }[kind];
    return base || '';
  }

  /* ------------------------------------------------------------------ */
  /* موتور اصلی                                                          */
  /* ------------------------------------------------------------------ */

  function createPlan(rawConfig) {
    const cfg = normalizeConfig(rawConfig);
    const topics = buildTopics(cfg);
    const stats = scoreSubjects(cfg);
    const totalDays = dayDiff(cfg._start, cfg._exam);
    if (totalDays <= 0) throw new Error('تاریخ آزمون باید بعد از تاریخ شروع باشد.');

    const learnQueue = topics
      .filter((t) => t.needMinutes > 0)
      .map((t) => ({ t, score: stats[t.subjectId].share * (t.needMinutes / 100) }))
      .sort((a, b) => b.score - a.score)
      .map((x) => x.t);

    const dueReviews = [];
    const days = [];
    const warnings = [];
    const notes = [];
    let learnedCount = 0;
    let unplacedTotal = 0;
    let yesterdayLearned = [];
    let classFixBacklog = []; // تثبیت کلاس‌هایی که همان روز جا نشدند

    const examDates = cfg.exams.map((e) => e.date);
    const nextExamOn = (iso) => cfg.exams.find((e) => e.date === iso) || null;
    const daysToNextExam = (date) => {
      const future = cfg.exams
        .map((e) => dayDiff(date, toDate(e.date)))
        .filter((d) => d >= 0)
        .sort((a, b) => a - b);
      return future.length ? future[0] : null;
    };

    for (let dayIndex = 0; dayIndex <= totalDays; dayIndex++) {
      const date = addDays(cfg._start, dayIndex);
      const wd = persianWeekday(date);
      const iso = isoDay(date);
      const daysLeft = totalDays - dayIndex;
      const isFinalExam = daysLeft === 0;

      const busy = busyEventsFor(cfg, date, dayIndex);
      const segments = freeSegments(cfg, date, busy);

      const dNext = daysToNextExam(date);
      const preExam = {
        level: isFinalExam ? 0 : dNext === null ? 0 : dNext === 0 ? 0 : dNext === 1 ? 2 : dNext <= (cfg.PRE_EXAM_DAYS || DEFAULTS.PRE_EXAM_DAYS) ? 1 : 0,
        days: dNext,
        exam: dNext !== null ? cfg.exams.find((e) => dayDiff(date, toDate(e.date)) === dNext) : null,
      };
      const reviewOnly = preExam.level >= 1;
      const scope = preExam.exam && preExam.exam.subjectIds.length ? new Set(preExam.exam.subjectIds) : null;

      const freeMinutes = sum(segments.map((s) => s.end - s.start));
      const load = isFinalExam ? { minutes: 30, isDeload: false } : dayLoad(cfg, date, dayIndex, totalDays, freeMinutes, preExam);
      const tasks = [];

      /* ---- ۰) خودِ آزمون‌های آزمایشیِ امروز (رویداد ثابت) ---- */
      busy.filter((b) => b.type === 'exam').forEach((b) => {
        tasks.push({
          kind: 'exam',
          subjectId: 'EXAM',
          subjectName: b.title,
          topicLabel: b.subjectNames.join('، ') || 'همه دروس',
          minutesLeft: b.end - b.start,
          priority: 500,
          examId: b.id,
          fixed: { start: b.start, end: b.end }, // رویداد ثابت — نباید جابه‌جا شود
        });
      });

      /* ---- ۱) مرورهای سررسید ---- */
      dueReviews
        .filter((r) => dayDiff(cfg._start, r.date) === dayIndex)
        .sort((a, b) => a.topic.mastery - b.topic.mastery)
        .forEach((r) => {
          if (scope && !scope.has(r.topic.subjectId)) return;
          tasks.push({
            kind: 'review',
            subjectId: r.topic.subjectId,
            subjectName: r.topic.subjectName,
            topicLabel: r.topic.label,
            topic: r.topic,
            minutesLeft: r.minutes,
            priority: 300 + (100 - r.topic.mastery),
          });
        });

      /* ---- ۲) تثبیت کلاس‌های امروز و دیروز ---- */
      const classesToday = busy.filter((b) => b.type === 'class');
      classesToday.forEach((c) => {
        tasks.push({
          kind: 'classfix',
          subjectId: c.subjectId || 'CLASS',
          subjectName: c.subjectName || c.title,
          topicLabel: 'تثبیت کلاس ' + c.title,
          minutesLeft: Math.min(cfg.CLASS_FIX_MIN || DEFAULTS.CLASS_FIX_MIN, 25),
          priority: 420,
          afterMin: c.end + (cfg.CLASS_GAP_MIN || DEFAULTS.CLASS_GAP_MIN),  // بعد از کلاس، نه قبلش
        });
      });
      classFixBacklog.forEach((cf) => {
        tasks.push(Object.assign({}, cf, { priority: 410, minutesLeft: Math.min(cf.minutesLeft, 20) }));
      });
      classFixBacklog = [];

      /* ---- ۳) مرور ۲۴ساعته مباحث دیروز ---- */
      if (!reviewOnly) {
        const seen = new Set();
        const pick = yesterdayLearned
          .filter((t) => (seen.has(t.id) ? false : (seen.add(t.id), true)))
          .slice(0, 2);
        pick.forEach((t) => {
          tasks.push({
            kind: 'warmup', subjectId: t.subjectId, subjectName: t.subjectName,
            topicLabel: t.label, topic: t, minutesLeft: Math.min(cfg.NEXT_DAY_REVIEW_MIN, 15), priority: 350,
          });
        });
      }

      /* ---- ۴) آزمون جامع هفتگی (اگر کاربر آزمون دستی نداده) ---- */
      const hasManualExamToday = busy.some((b) => b.type === 'exam');
      const isMockDay = cfg.weeklyMock && cfg.exams.length === 0 && !isFinalExam &&
        wd === cfg.WEEKLY_MOCK_DAY && dayIndex > 5 && daysLeft > 3;
      if (isMockDay && !hasManualExamToday) {
        tasks.push({
          kind: 'mock', subjectId: 'MOCK', subjectName: 'آزمون جامع هفتگی', topicLabel: 'همه دروس',
          minutesLeft: Math.min(cfg.WEEKLY_MOCK_MIN, Math.max(60, load.minutes * 0.6)), priority: 480,
        });
        tasks.push({
          kind: 'analysis', subjectId: 'MOCK', subjectName: 'تحلیل آزمون', topicLabel: 'دفتر اشتباهات',
          minutesLeft: Math.min(cfg.MOCK_ANALYSIS_MIN, Math.max(20, load.minutes * 0.3)), priority: 470,
        });
      }

      /* ---- ۵) تحلیل پس از آزمون آزمایشی ---- */
      if (hasManualExamToday) {
        const examEv = busy.find((b) => b.type === 'exam');
        tasks.push({
          kind: 'analysis', subjectId: 'EXAM', subjectName: 'تحلیل آزمون آزمایشی',
          topicLabel: 'دفتر اشتباهات', minutesLeft: Math.min(cfg.POST_EXAM_ANALYSIS_MIN, 40), priority: 460,
          afterMin: (examEv ? examEv.end : 0) + (cfg.CLASS_GAP_MIN || DEFAULTS.CLASS_GAP_MIN),
        });
      }

      /* ---- ۶) یادگیری جدید ---- */
      const subjectUsedToday = {};
      const scheduleReviews = (topic, fromDate) => {
        const sub = cfg.subjects.find((s) => s.id === topic.subjectId);
        let gap = firstReviewGap(daysLeft);
        let cursorDate = addDays(fromDate, gap);
        for (let r = 0; r < (cfg.MAX_REVIEWS_PER_TOPIC || DEFAULTS.MAX_REVIEWS_PER_TOPIC); r++) {
          if (dayDiff(cfg._start, cursorDate) > totalDays - 1) break;
          dueReviews.push({ date: cursorDate, topic, gap, minutes: sub && sub.type === 'problem' ? 20 : 15 });
          gap = reviewInterval(gap, null, daysLeft);
          cursorDate = addDays(cursorDate, gap);
        }
      };

      const addLearnChunks = (budget) => {
        const perSubjectCap = Math.max(cfg.blockMinutes, Math.round(load.minutes * (daysLeft <= 7 ? 0.3 : 0.5)));
        let used = 0;
        let guard = 0;
        while (learnQueue.length && used < budget && guard++ < 40) {
          const idx = learnQueue.findIndex((t) => {
            if (scope && !scope.has(t.subjectId)) return false;
            const take = Math.min(cfg.blockMinutes, t.needMinutes);
            return (subjectUsedToday[t.subjectId] || 0) + take <= perSubjectCap;
          });
          if (idx === -1) break;
          const topic = learnQueue[idx];
          const chunk = Math.min(cfg.blockMinutes, topic.needMinutes, budget - used);
          if (chunk < 10) break;
          tasks.push({
            kind: 'learn', subjectId: topic.subjectId, subjectName: topic.subjectName,
            topicLabel: topic.label, topic, minutesLeft: chunk, priority: 250,
          });
          used += chunk;
          subjectUsedToday[topic.subjectId] = (subjectUsedToday[topic.subjectId] || 0) + chunk;
          topic.needMinutes -= chunk;
          if (topic.needMinutes <= 0) {
            learnQueue.splice(idx, 1);
            topic.learnedOn = date;
            learnedCount++;
            scheduleReviews(topic, date);
          }
        }
        return used;
      };

      if (!isFinalExam && !reviewOnly) {
        addLearnChunks(load.minutes * 0.85);
        yesterdayLearned = tasks.filter((t) => t.kind === 'learn').map((t) => t.topic);
      } else {
        yesterdayLearned = [];
      }

      /* ---- ۷) پر کردن ظرفیت باقی‌مانده با تمرین درهم ---- */
      const plannedSoFar = sum(tasks.map((t) => t.minutesLeft));
      let spare = load.minutes - plannedSoFar;
      if (spare >= 20 && !isFinalExam) {
        const ordered = cfg.subjects
          .filter((s) => !scope || scope.has(s.id))
          .slice()
          .sort((a, b) => (b.weight * (1 - b.mastery / 100)) - (a.weight * (1 - a.mastery / 100)));
        const todaySubjects = new Set(tasks.map((t) => t.subjectId));
        let i = 0;
        while (spare >= 20 && i < 5 && ordered.length) {
          const s = ordered[i % ordered.length];
          const minutes = Math.min(cfg.blockMinutes, roundTo5(spare));
          tasks.push({
            kind: 'practice', subjectId: s.id, subjectName: s.name,
            topicLabel: todaySubjects.has(s.id) ? 'تست‌زنی زمان‌دار' : 'تمرین درهم با مبحث قبلی',
            minutesLeft: minutes, priority: 60,
            practiceCount: Math.max(5, Math.round(minutes / (s.type === 'problem' ? 3.5 : 1.6))),
          });
          spare -= minutes;
          i++;
        }
      }

      /* ---- ۸) رویدادهای ثابتِ آزمون را با زمان قطعی جدا کن ---- */
      const fixedExamTasks = tasks.filter((t) => t.fixed);
      const movable = tasks.filter((t) => !t.fixed);
      const examBlocks = fixedExamTasks.map((t) => ({
        start: t.fixed.start, end: t.fixed.end, minutes: t.fixed.end - t.fixed.start,
        kind: t.kind, task: t, subjectId: t.subjectId, subjectName: t.subjectName,
        topicLabel: t.topicLabel, practiceCount: null, examId: t.examId, fixed: true,
      }));

      // بازه‌های آزاد را با رویدادهای آزمون هم تفکیک کن
      const examSegments = [];
      segments.forEach((s) => {
        let cur = s.start;
        examBlocks.forEach((eb) => {
          if (eb.end <= cur || eb.start >= s.end) return;
          if (eb.start > cur) examSegments.push({ start: cur, end: Math.min(eb.start, s.end) });
          cur = Math.max(cur, eb.end);
        });
        if (cur < s.end) examSegments.push({ start: cur, end: s.end });
      });

      const placed = scheduleTasks(cfg, movable, examSegments.length ? examSegments : segments);
      unplacedTotal += placed.unplacedMinutes;
      const allBlocks = placed.blocks.concat(examBlocks).sort((a, b) => a.start - b.start);

      /* ---- ۹) خروجی روز ---- */
      const outBlocks = allBlocks.map((b) => {
        const t = b.task;
        const tail = (t.kind === 'learn' || t.kind === 'practice') ? (cfg.RETRIEVAL_TAIL_MIN || DEFAULTS.RETRIEVAL_TAIL_MIN) : 0;
        return {
          start: fmtHM(b.start), end: fmtHM(b.end), minutes: b.minutes,
          kind: t.kind, kindLabel: kindLabel(t.kind),
          subjectId: b.subjectId, subjectName: b.subjectName, topic: b.topicLabel,
          content: contentFor(t, b), technique: techniqueFor(t.kind), retrievalTail: tail,
          ifThen: ifThenFor(t.kind, b.start, b.subjectName, b.topicLabel, b.practiceCount),
          why: whyFor(t.kind),
          fixed: Boolean(b.fixed),
        };
      });

      const dayMinutes = sum(outBlocks.filter((b) => b.kind !== 'exam').map((b) => b.minutes));
      outBlocks.forEach((b) => {
        if (stats[b.subjectId]) { stats[b.subjectId].minutes += b.minutes; stats[b.subjectId].blocks += 1; }
      });

      const hasClassToday = classesToday.length > 0;
      days.push({
        index: dayIndex,
        date: iso,
        weekday: WEEKDAY_FA[wd],
        events: busy.map((b) => ({
          type: b.type, title: b.title,
          subjectName: b.subjectName || (b.subjectNames || []).join('، '),
          start: fmtHM(b.start), end: fmtHM(b.end),
        })),
        isMockDay: Boolean(isMockDay || hasManualExamToday),
        isExamDay: isFinalExam || hasManualExamToday,
        isRestDay: outBlocks.length === 0,
        isDeload: load.isDeload,
        studyMinutes: dayMinutes,
        plannedMinutes: dayMinutes,
        blocks: outBlocks,
        note: dayNote({ isFinalExam, hasManualExamToday, hasClassToday, preExam, reviewOnly, isDeload: load.isDeload, chronotype: cfg.student.chronotype, hasBlocks: outBlocks.length > 0 }),
      });

      // ثبت تثبیت‌های جا نشده برای روز بعد
      movable.filter((t) => t.kind === 'classfix' && t.minutesLeft > 0).forEach((t) => {
        classFixBacklog.push({ kind: 'classfix', subjectId: t.subjectId, subjectName: t.subjectName, topicLabel: t.topicLabel + ' (ادامه)' });
      });
    }

    /* ---- جمع‌بندی ---- */
    if (learnQueue.length) {
      const missing = sum(learnQueue.map((t) => t.needMinutes));
      const low = cfg.subjects.filter((s) => s.weight < 3).sort((a, b) => a.weight - b.weight).slice(0, 2);
      warnings.push(
        'با زمان‌های فعلی (با احتساب کلاس‌ها و آزمون‌ها) حدود ' + Math.round(missing / 60) + ' ساعت برای پوشش کاملِ ' +
        learnQueue.length + ' مبحث باقی‌مانده کم است. ' +
        (low.length ? 'پیشنهاد: فصل‌های کم‌ضریب (' + low.map((s) => s.name).join('، ') + ') را عقب بینداز یا یک بازهٔ اضافه در روزهای آزاد بساز.'
                    : 'پیشنهاد: ۱ ساعت به روزهای آزاد اضافه کن یا تعداد فصل‌ها را واقعی‌تر کن.')
      );
    }
    if (sum(cfg.classes.map(() => 0)) === 0 && !cfg.classes.length) {
      notes.push('کلاسی ثبت نکردی؛ اگر کلاس آنلاین داری، در بخش «کلاس‌ها» اضافه کن تا برنامه دور آن‌ها چیده شود.');
    }
    if (!cfg.exams.length) {
      notes.push('آزمون آزمایشی ثبت نشده؛ برنامه فعلاً فقط آزمون جامع هفتگی داخلی دارد. با ثبت آزمون‌ها، روزهای پیش‌آزمون خودکار «فقط مرور» می‌شوند.');
    }

    const finalDay = days[days.length - 1];
    if (finalDay && finalDay.blocks.length === 0) {
      const t = {
        kind: 'review', subjectId: 'ALL', subjectName: 'مرور نهایی', topicLabel: 'خلاصه‌ها و دفتر اشتباهات',
        practiceCount: null,
      };
      finalDay.blocks = [{
        start: '07:30', end: '08:00', minutes: 30, kind: 'review', kindLabel: 'مرور نهایی',
        subjectId: 'ALL', subjectName: 'مرور نهایی', topic: 'فقط خلاصه‌ها و دفتر اشتباهات',
        content: contentFor(t, { practiceCount: null }), technique: techniqueFor('review'), retrievalTail: 0,
        ifThen: '', why: whyFor('review'),
      }];
      finalDay.plannedMinutes = 30;
      finalDay.studyMinutes = 30;
      finalDay.isRestDay = false;
    }

    const totalStudy = sum(days.map((d) => d.studyMinutes));
    const bySubject = cfg.subjects.map((s) => ({
      id: s.id, name: s.name, weight: s.weight, mastery: s.mastery,
      minutes: stats[s.id].minutes,
      hours: Math.round((stats[s.id].minutes / 60) * 10) / 10,
      sharePlanned: totalStudy ? stats[s.id].minutes / totalStudy : 0,
      shareIdeal: stats[s.id].share,
    })).sort((a, b) => b.minutes - a.minutes);

    return {
      meta: {
        version: '2.0.0', createdAt: new Date().toISOString(),
        studentName: cfg.student.name, field: cfg.student.field, grade: cfg.student.grade,
        chronotype: cfg.student.chronotype, startDate: cfg.startDate, examDate: cfg.examDate,
        totalDays, blockMinutes: cfg.blockMinutes,
        classesCount: cfg.classes.length, examsCount: cfg.exams.length,
        config: configForStorage(cfg),
      },
      summary: {
        totalMinutes: totalStudy,
        totalHours: Math.round((totalStudy / 60) * 10) / 10,
        avgHoursPerDay: Math.round((totalStudy / 60 / Math.max(1, days.length)) * 10) / 10,
        learnedTopics: learnedCount,
        totalReviewEvents: days.reduce((a, d) => a + d.blocks.filter((b) => b.kind === 'review').length, 0),
        classFixBlocks: days.reduce((a, d) => a + d.blocks.filter((b) => b.kind === 'classfix').length, 0),
        examDays: days.filter((d) => d.events.some((e) => e.type === 'exam')).length,
        preExamDays: days.filter((d) => /پیش‌آزمون|مرور نهایی/.test(d.note || '')).length,
        unplacedMinutes: unplacedTotal,
        bySubject,
        warnings,
        coachNotes: coachNotes(cfg, bySubject, warnings, notes),
      },
      days,
    };
  }

  function dayNote(i) {
    if (i.isFinalExam) return 'روز کنکور — موفق باشی! خواب کافی شب قبل، مهم‌تر از هر مرور دیگری است.';
    if (i.hasManualExamToday) return 'روز آزمون آزمایشی: بعد از آزمون، بلوک تحلیل خطا را انجام بده — نمره بدون تحلیل، هدر رفته است.';
    if (i.preExam && i.preExam.days === 1) return 'مرور نهایی: امروز یادگیری جدید نداریم؛ فقط خلاصه‌ها، دفتر اشتباهات و خواب زودتر.';
    if (i.preExam && i.preExam.level === 1) return 'پیش‌آزمون' + (i.preExam.exam ? ' «' + i.preExam.exam.title + '»' : '') + ': فقط مرور مباحث آزمون، بدون مبحث جدید.';
    if (i.isRestDay) return 'روز استراحت: مغز بین جلسات همان‌جایی است که تثبیت انجام می‌شود.';
    if (i.hasClassToday) return 'روز کلاس: بلوک «تثبیت کلاس» همان شب کارِ اصلی است.';
    if (i.isDeload) return 'هفتهٔ سبک‌سازی (deload): بار کمتر تا فرسودگی نگیریم.';
    if (i.chronotype === 'morning') return 'سخت‌ترین کارها در بلوک‌های اول چیده شده (تیپ صبح‌زی).';
    if (i.chronotype === 'evening') return 'سخت‌ترین کارها در بلوک‌های انتهایی چیده شده (تیپ شب‌زی).';
    return '';
  }

  function coachNotes(cfg, bySubject, warnings, extra) {
    const out = [];
    if (cfg.classes.length) {
      out.push('برنامه دور ' + cfg.classes.length + ' کلاس هفتگی چیده شد: کلاس‌ها ثابت‌اند و مطالعه در بازه‌های آزاد بین آن‌ها قرار گرفته است.');
      out.push('بعد از هر کلاس، بلوک «تثبیت کلاس» گذاشته شده؛ همین ۲۰ دقیقه، ماندگاری کلاس را چند برابر می‌کند.');
    }
    if (cfg.exams.length) {
      out.push(cfg.exams.length + ' آزمون آزمایشی در برنامه لحاظ شد: ' + (cfg.PRE_EXAM_DAYS || DEFAULTS.PRE_EXAM_DAYS) +
        ' روز آخر قبل از هر آزمون «فقط مرور» است و روز بعد از آزمون، بلوک تحلیل خطا دارد.');
    }
    const first = bySubject[0];
    if (first) out.push('بیشترین زمان به «' + first.name + '» داده شد (' + first.hours + ' ساعت) — ترکیب ضریب، فاصلهٔ تسلط و حجم باقی‌مانده.');
    const weakest = cfg.subjects.slice().sort((a, b) => a.mastery - b.mastery)[0];
    if (weakest) out.push('ضعیف‌ترین درس فعلی: «' + weakest.name + '» — مرورهایش زودتر و بیشتر تکرار می‌شود.');
    out.push('هر بلوک با ۵ دقیقه بازیابی فعال تمام می‌شود؛ در لحظه سخت‌تر است، یک هفته بعد نتیجه‌اش دیده می‌شود.');
    (extra || []).forEach((n) => out.push(n));
    return out;
  }

  function configForStorage(cfg) {
    return {
      student: cfg.student, startDate: cfg.startDate, examDate: cfg.examDate, sleep: cfg.sleep,
      availability: cfg.availability, startTimes: cfg.startTimes, blockMinutes: cfg.blockMinutes,
      breakMinutes: cfg.breakMinutes, restDay: cfg.restDay, weeklyMock: cfg.weeklyMock,
      classes: cfg.classes, exams: cfg.exams, subjects: cfg.subjects,
    };
  }

  /* ------------------------------------------------------------------ */
  /* خروجی‌ها                                                            */
  /* ------------------------------------------------------------------ */

  function toMarkdown(plan) {
    const L = [];
    L.push('# برنامهٔ مطالعه — ' + plan.meta.studentName);
    L.push('');
    L.push('**بازه:** ' + plan.meta.startDate + ' تا ' + plan.meta.examDate +
      ' · **مجموع مطالعه:** ' + plan.summary.totalHours + ' ساعت · **میانگین روزانه:** ' + plan.summary.avgHoursPerDay + ' ساعت');
    L.push('');
    L.push('## چرا این برنامه؟');
    plan.summary.coachNotes.forEach((n) => L.push('- ' + n));
    L.push('');
    L.push('## توزیع زمان بر اساس درس');
    L.push('| درس | ضریب | تسلط | زمان (ساعت) | سهم |');
    L.push('|---|---|---|---|---|');
    plan.summary.bySubject.forEach((s) => {
      L.push('| ' + s.name + ' | ' + s.weight + ' | ' + s.mastery + '٪ | ' + s.hours + ' | ' + Math.round(s.sharePlanned * 100) + '٪ |');
    });
    L.push('');
    plan.days.forEach((d) => {
      if (!d.blocks.length && !d.events.length) return;
      L.push('### ' + d.date + ' — ' + d.weekday + (d.studyMinutes ? ' · ' + Math.round(d.studyMinutes / 60 * 10) / 10 + ' ساعت مطالعه' : ''));
      if (d.note) L.push('> ' + d.note);
      d.events.forEach((e) => L.push('- 📌 **' + e.start + '–' + e.end + '** · ' + (e.type === 'exam' ? 'آزمون' : 'کلاس') + ': ' + e.title + (e.subjectName ? ' (' + e.subjectName + ')' : '')));
      d.blocks.filter((b) => b.kind !== 'exam').forEach((b) => {
        L.push('- **' + b.start + '–' + b.end + '** · ' + b.kindLabel + ' — ' + b.subjectName + ' / ' + b.topic);
        L.push('  - ' + b.content + (b.retrievalTail ? ' (+' + b.retrievalTail + ' دقیقه بازیابی)' : ''));
        if (b.ifThen) L.push('  - ' + b.ifThen);
      });
      L.push('');
    });
    return L.join('\n');
  }

  function toCSV(plan) {
    const rows = [['تاریخ', 'روز', 'شروع', 'پایان', 'دقیقه', 'نوع', 'درس', 'مبحث', 'محتوا', 'تکنیک', 'اگر-آنگاه']];
    plan.days.forEach((d) => {
      d.events.forEach((e) => {
        rows.push([d.date, d.weekday, e.start, e.end, '', (e.type === 'exam' ? 'آزمون آزمایشی' : 'کلاس'), e.subjectName || e.title, e.title, 'رویداد ثابت', '', '']);
      });
      d.blocks.forEach((b) => {
        rows.push([d.date, d.weekday, b.start, b.end, b.minutes, b.kindLabel, b.subjectName, b.topic, b.content, b.technique, b.ifThen]);
      });
    });
    return rows.map((r) => r.map((c) => '"' + String(c).replace(/"/g, '""') + '"').join(',')).join('\r\n');
  }

  function toTaskList(plan, dateIso) {
    const out = [];
    plan.days
      .filter((d) => !dateIso || d.date === dateIso)
      .forEach((d) => {
        d.events.forEach((e) => out.push('📌 ' + e.title + ' · ' + e.start + '–' + e.end));
        d.blocks.filter((b) => b.kind !== 'exam').forEach((b) => {
          out.push(b.subjectName + ' — ' + b.topic + ' · ' + b.minutes + ' دقیقه · ' + b.kindLabel);
        });
      });
    return out.join('\n');
  }

  function toICS(plan) {
    const pad = (n) => String(n).padStart(2, '0');
    const stamp = (iso, hm) => {
      const [y, m, d] = iso.split('-');
      const [hh, mm] = hm.split(':');
      return y + m + d + 'T' + pad(hh) + pad(mm) + '00';
    };
    const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Reval//Smart Planner//FA', 'CALSCALE:GREGORIAN', 'X-WR-CALNAME:برنامه روال'];
    plan.days.forEach((d) => {
      d.blocks.forEach((b, i) => {
        lines.push('BEGIN:VEVENT');
        lines.push('UID:' + d.date.replace(/-/g, '') + '-' + i + '@revaledu.ir');
        lines.push('DTSTAMP:' + stamp(d.date, b.start) + 'Z');
        lines.push('DTSTART:' + stamp(d.date, b.start));
        lines.push('DTEND:' + stamp(d.date, b.end));
        lines.push('SUMMARY:' + esc(b.kindLabel + ' — ' + b.subjectName + ' / ' + b.topic));
        if (b.ifThen) lines.push('DESCRIPTION:' + esc(b.ifThen + '\n' + b.content));
        lines.push('END:VEVENT');
      });
    });
    lines.push('END:VCALENDAR');
    return lines.join('\r\n');
  }

  function esc(s) {
    return String(s || '').replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n');
  }

  function updateMastery(subject, score) {
    const k = 0.5;
    const s = clamp(Number(score) || 0, -33, 100);
    const target = clamp(s < 0 ? 0 : s, 0, 100);
    const next = clamp(subject.mastery + k * (target - subject.mastery), 0, 100);
    return Object.assign({}, subject, { mastery: Math.round(next) });
  }

  /** خلاصهٔ روز برای اجرای «امروز» */
  function todaySummary(plan, iso) {
    const d = plan.days.find((x) => x.date === iso);
    if (!d) return null;
    return {
      date: d.date,
      weekday: d.weekday,
      note: d.note,
      events: d.events,
      blocks: d.blocks,
      studyMinutes: d.studyMinutes,
    };
  }

  return {
    createPlan, updateMastery, todaySummary,
    toMarkdown, toCSV, toICS, toTaskList,
    DEFAULTS, WEEKDAY_FA, WEEKDAY_KEY, SUBJECT_TYPE_FA,
    _internal: { normalizeConfig, dayDiff, persianWeekday, firstReviewGap, reviewInterval, addDays, isoDay, freeSegments, busyEventsFor },
  };
});
