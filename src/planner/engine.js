/**
 * موتور برنامه‌ریزی هوشمند روال (Reval Smart Planner Engine)
 * ---------------------------------------------------------
 * نسخه ۱.۰ — پیاده‌سازیِ خالص و قابل‌تست (بدون DOM / بدون Electron)
 *
 * مبانی علمی (جزئیات در docs/research-study-methods.md):
 *   • تخصیص زمان ∝ ضریب × (۱ − تسلط)                     [ضرایب کنکور ۱۴۰۵ + مدل اولویت]
 *   • مرور فاصله‌دار با فاصله‌های فزاینده                  [Cepeda et al. 2006/2008]
 *   • هر بلوک با «دم بازیابی فعال» تمام می‌شود             [Roediger & Karpicke 2006]
 *   • مرور ۲۴ساعته صبح روز بعد                             [spacing + testing effect]
 *   • حداکثر ۲ بلوک متوالی از یک درس، حداقل ۲ درس در روز   [Rohrer & Taylor 2007]
 *   • بلوک سخت در پنجره اوجِ کاربر (صبح‌زی/شب‌زی)           [synchrony effect]
 *   • قفل بازه خواب + آخرین بلوک ≥ ۴۵ دقیقه قبل خواب       [Rasch & Born 2013]
 *   • هفته سبک هر ۴ هفته + افزایش تدریجی بار               [cognitive load theory]
 *   • هر تسک با «اگر…آنگاه…»                                [Gollwitzer & Sheeran 2006]
 */

(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.RevalPlanner = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  /* ------------------------------------------------------------------ */
  /* ثابت‌ها (قابل تنظیم)                                                */
  /* ------------------------------------------------------------------ */

  const DEFAULTS = {
    blockMinutes: 45,
    breakMinutes: 10,
    REVIEW_LADDER: [1, 3, 7, 16, 35],     // روز — Cepeda
    FIRST_GAP_RATIO: 0.15,                // فاصله اول ≈ ۱۵٪ زمان تا آزمون
    MAX_REVIEWS_PER_TOPIC: 5,
    INTERVAL_PERF_K: 0.8,                 // اصلاح فاصله با نتیجه آزمون (سبک‌شده FSRS)
    RETRIEVAL_TAIL_MIN: 5,                // دم بازیابی فعال در پایان هر بلوک
    NEXT_DAY_REVIEW_MIN: 15,              // مرور ۲۴ساعته
    MAX_CONSECUTIVE_SAME: 2,
    MIN_SUBJECTS_PER_DAY: 2,
    SLEEP_GUARD_MIN: 45,                  // آخرین بلوک ≥ این مقدار قبل از خواب
    BUFFER_RATIO: 0.15,                   // ظرفیت رزرو برای جبران عقب‌ماندگی
    DELOAD_EVERY: 4,                      // هر ۴ هفته
    DELOAD_RATIO: 0.75,
    RAMP_UP: { start: 0.65, step: 0.12 }, // افزایش تدریجی بار در هفته‌های اول
    WEEKLY_MOCK_DAY: 5,                   // جمعه (اندیس فارسی) — آزمون جامع
    WEEKLY_MOCK_MIN: 100,
    MOCK_ANALYSIS_MIN: 35,
    PRIORITY_EXP: 1.15,
  };

  const WEEKDAY_FA = ['شنبه', 'یکشنبه', 'دوشنبه', 'سه‌شنبه', 'چهارشنبه', 'پنجشنبه', 'جمعه'];
  const WEEKDAY_KEY = ['sat', 'sun', 'mon', 'tue', 'wed', 'thu', 'fri'];

  const SUBJECT_TYPE_FA = {
    memorization: 'حفظی–مفهومی',
    conceptual: 'مفهومی',
    problem: 'محاسباتی/مسئله‌ای',
  };

  /* ------------------------------------------------------------------ */
  /* ابزارهای تاریخ و زمان                                               */
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

  function addDays(date, n) {
    const d = new Date(date.getTime());
    d.setDate(d.getDate() + n);
    return d;
  }

  function dayDiff(a, b) {
    const A = new Date(a.getFullYear(), a.getMonth(), a.getDate());
    const B = new Date(b.getFullYear(), b.getMonth(), b.getDate());
    return Math.round((B - A) / 86400000);
  }

  function isoDay(date) {
    const p = (n) => String(n).padStart(2, '0');
    return date.getFullYear() + '-' + p(date.getMonth() + 1) + '-' + p(date.getDate());
  }

  /** شنبه = ۰ ... جمعه = ۶ */
  function persianWeekday(date) {
    return (date.getDay() + 1) % 7;
  }

  function parseHM(hm) {
    const m = String(hm || '').match(/^(\d{1,2}):(\d{2})$/);
    if (!m) return { h: 23, m: 30 };
    return { h: Number(m[1]) % 24, m: Number(m[2]) % 60 };
  }

  function minutesSinceMidnight(hm) {
    const t = parseHM(hm);
    return t.h * 60 + t.m;
  }

  function fmtHM(totalMinutes) {
    const t = ((Math.round(totalMinutes) % 1440) + 1440) % 1440;
    const h = Math.floor(t / 60);
    const m = t % 60;
    return String(h).padStart(2, '0') + ':' + String(m).padStart(2, '0');
  }

  function clamp(v, lo, hi) {
    return Math.max(lo, Math.min(hi, v));
  }

  function roundTo5(n) {
    return Math.round(n / 5) * 5;
  }

  function sum(arr) {
    return arr.reduce((a, b) => a + b, 0);
  }

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

    // ساعات در دسترس هر روز (۰..۱۲) — کلیدهای sat..fri
    const avail = Object.assign(
      { sat: 4, sun: 4, mon: 4, tue: 4, wed: 4, thu: 6, fri: 5 },
      cfg.availability || {}
    );
    cfg.availability = {};
    WEEKDAY_KEY.forEach((k) => {
      cfg.availability[k] = clamp(Number(avail[k]) || 0, 0, 14);
    });

    // ساعت شروع مطالعه هر روز (پیش‌فرض: روزهای مدرسه بعدازظهر، تعطیلات صبح)
    const starts = Object.assign(
      { sat: '16:00', sun: '16:00', mon: '16:00', tue: '16:00', wed: '16:00', thu: '09:00', fri: '09:00' },
      cfg.startTimes || {}
    );
    cfg.startTimes = starts;

    cfg.sleep = Object.assign({ bedtime: '23:30', wake: '07:00' }, cfg.sleep || {});
    cfg.student = Object.assign(
      { name: 'دانش‌آموز', grade: 'دوازدهم', field: 'tajrobi', chronotype: 'neutral' },
      cfg.student || {}
    );
    cfg.blockMinutes = clamp(Number(cfg.blockMinutes) || 45, 20, 120);
    cfg.breakMinutes = clamp(Number(cfg.breakMinutes) || 10, 0, 30);
    cfg.restDay = clamp(Number(cfg.restDay), 0, 7); // 7 = بدون روز استراحت
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
    return cfg;
  }

  /* ------------------------------------------------------------------ */
  /* مدل مباحث و اولویت                                                  */
  /* ------------------------------------------------------------------ */

  function buildTopics(cfg) {
    const topics = [];
    cfg.subjects.forEach((s) => {
      const b = Math.floor(s.masteredChapters);
      const frac = s.masteredChapters - b; // فصل نیمه‌خوانده‌شده
      for (let i = 1; i <= s.chapters; i++) {
        const mastered = i <= b ? 100 : i === Math.ceil(b + 0.0001) && frac > 0.05 ? Math.round(s.mastery + (100 - s.mastery) * frac) : s.mastery;
        // زمان لازم برای یادگیری اولیه بر اساس نوع درس و سختی
        const base = s.type === 'memorization' ? 60 : s.type === 'problem' ? 120 : 85;
        const need = base * s.difficulty * ((100 - mastered) / 100);
        topics.push({
          id: s.id + '.c' + i,
          subjectId: s.id,
          subjectName: s.name,
          chapter: i,
          label: 'فصل ' + toFaDigits(i),
          mastery: mastered,
          needMinutes: Math.max(0, roundTo5(need)),
          priority: 0,
          learnedOn: null,
          reviews: [],
        });
      }
    });
    return topics;
  }

  function scoreSubjects(cfg, topics) {
    const active = cfg.subjects;
    const weightSum = sum(active.map((s) => s.weight));
    const stats = {};
    active.forEach((s) => {
      const wNorm = s.weight / (weightSum || 1);
      const gap = 1 - s.mastery / 100;               // 1 = هیچ‌چیز نخوانده
      const demand = s.difficulty / 3;                // حجم/سختی نسبی
      const examPenalty = s.examPercent == null ? 1 : clamp(1.2 - s.examPercent / 100, 0.55, 1.25);
      const raw = Math.pow(wNorm, 0.85) * (0.25 + 0.75 * gap) * (0.75 + 0.5 * demand) * examPenalty;
      stats[s.id] = { weight: s.weight, wNorm, gap, demand, raw, minutes: 0, blocks: 0 };
    });
    const total = sum(Object.values(stats).map((s) => s.raw)) || 1;
    Object.keys(stats).forEach((k) => {
      stats[k].share = stats[k].raw / total; // سهم نسبی از زمان یادگیری
      stats[k].priorityScore = Math.pow(stats[k].share, 1 / DEFAULTS.PRIORITY_EXP);
    });
    return stats;
  }

  /** زمانِ باقی‌مانده تا آزمون برای تنظیم فاصله مرور */
  function firstReviewGap(daysLeft, cfg) {
    cfg = cfg || {};
    const ratio = cfg.FIRST_GAP_RATIO || DEFAULTS.FIRST_GAP_RATIO;
    const g = Math.round(daysLeft * ratio);
    if (daysLeft > 90) return clamp(g, 3, 21);
    if (daysLeft > 30) return clamp(g, 2, 10);
    return clamp(g, 1, 5);
  }

  function reviewInterval(prevGap, perf, daysLeft) {
    const k = DEFAULTS.INTERVAL_PERF_K;
    const perfFactor = perf == null ? 1 : 0.6 + k * (perf / 100) * 1.25; // 0.6 .. 1.6
    const next = Math.round(prevGap * 1.9 * perfFactor);
    const ceiling = Math.max(2, Math.round(daysLeft * 0.45));
    return clamp(next, prevGap + 1, ceiling);
  }

  /* ------------------------------------------------------------------ */
  /* ظرفیت روزانه                                                       */
  /* ------------------------------------------------------------------ */

  function dayCapacityMinutes(cfg, date, dayIndex, totalDays) {
    const wd = persianWeekday(date);
    const key = WEEKDAY_KEY[wd];
    let hours = cfg.availability[key];

    if (cfg.restDay !== 7 && wd === cfg.restDay) hours = 0; // روز استراحت کامل

    // افزایش تدریجی بار (هفته‌های اول سبک‌تر) — cognitive load theory
    const week = Math.floor(dayIndex / 7);
    const ramp = clamp(cfg.RAMP_UP.start + cfg.RAMP_UP.step * week, cfg.RAMP_UP.start, 1);
    const isDeload = cfg.DELOAD_EVERY > 0 && week > 0 && week % cfg.DELOAD_EVERY === cfg.DELOAD_EVERY - 1;
    const deload = isDeload ? cfg.DELOAD_RATIO : 1;

    // هفته آخر: تمرکز روی مرور و آزمون (زمان یادگیری جدید کم می‌شود)
    const daysLeft = totalDays - dayIndex;
    const taper = daysLeft <= 7 ? 0.85 : 1;

    let minutes = hours * 60 * ramp * deload * taper;
    minutes = Math.max(0, Math.floor(minutes));

    // رزرو ظرفیت برای جبران عقب‌ماندگی
    minutes = Math.floor(minutes * (1 - (cfg.BUFFER_RATIO != null ? cfg.BUFFER_RATIO : DEFAULTS.BUFFER_RATIO)));

    // قید بازه خواب: از ساعت شروع تا (خواب − نگهبان) چقدر جا هست؟
    const startMin = minutesSinceMidnight(cfg.startTimes[key]);
    const bedMin = minutesSinceMidnight(cfg.sleep.bedtime);
    const guard = cfg.SLEEP_GUARD_MIN != null ? cfg.SLEEP_GUARD_MIN : DEFAULTS.SLEEP_GUARD_MIN;
    let availableWindow = bedMin - guard - startMin;
    if (availableWindow <= 0) availableWindow = 0; // آغاز مطالعه بعد از شب‌قفل → بدون بلوک
    minutes = Math.min(minutes, availableWindow);

    return { minutes, isDeload, week, windowStart: startMin, windowEnd: startMin + minutes };
  }

  /* ------------------------------------------------------------------ */
  /* بسته‌بندی تسک‌ها در بلوک‌ها                                          */
  /* ------------------------------------------------------------------ */

  function packIntoBlocks(tasks, cfg, dayInfo) {
    const blockLen = cfg.blockMinutes;
    const blocks = [];
    const queue = tasks.slice();
    let used = 0;
    let guard = 0;

    while (queue.length && guard++ < 200) {
      const capLeft = dayInfo.minutes - used;
      if (capLeft < 10) break;

      const task = queue[0];
      const take = Math.min(capLeft, blockLen, task.minutesLeft);
      if (take < 5) { queue.shift(); continue; }

      blocks.push({
        task,
        minutes: take,
      });
      used += take;
      task.minutesLeft -= take;
      if (task.minutesLeft <= 0) queue.shift();
    }

    // زمان‌بندی ساعت شروع/پایان با استراحت‌ها
    let cursor = dayInfo.windowStart;
    blocks.forEach((b, i) => {
      b.start = cursor;
      b.end = cursor + b.minutes;
      cursor = b.end + (i === blocks.length - 1 ? 0 : cfg.breakMinutes);
    });

    return blocks;
  }

  /**
   * چیدمان نهایی بلوک‌ها: هم‌زمان دو قید را رعایت می‌کند
   *   ۱) interleaving: حداکثر ۲ بلوک متوالی از یک درس (Rohrer & Taylor 2007)
   *   ۲) synchrony: سخت‌ترین بلوک‌ها در پنجرهٔ اوجِ کاربر (صبح‌زی/شب‌زی/خنثی)
   * سپس زمان‌ها را با استراحت دوباره می‌چیند.
   */
  function arrangeBlocks(blocks, cfg, dayInfo) {
    const n = blocks.length;
    const reschedule = (arr) => {
      let cursor = dayInfo.windowStart;
      arr.forEach((b, i) => {
        b.start = cursor;
        b.end = cursor + b.minutes;
        cursor = b.end + (i === arr.length - 1 ? 0 : cfg.breakMinutes);
      });
      return arr;
    };

    if (n <= 2) return reschedule(blocks);

    const maxSame = cfg.MAX_CONSECUTIVE_SAME != null ? cfg.MAX_CONSECUTIVE_SAME : DEFAULTS.MAX_CONSECUTIVE_SAME;
    const chrono = cfg.student && cfg.student.chronotype;

    const demandOf = (b) => {
      const t = b.task;
      if (t.kind === 'mock') return 3.2;
      if (t.kind === 'learn') return t.topic && t.topic.mastery < 50 ? 3 : 2.4;
      if (t.kind === 'practice') return 2.2;
      if (t.kind === 'analysis') return 1.6;
      if (t.kind === 'review') return 1.5;
      return 1; // warmup / rest
    };

    const peakOf = (slot) => {
      const t = (slot + 0.5) / n;      // ۰ = ابتدای روز، ۱ = انتهای روز
      if (chrono === 'morning') return 1 - t;
      if (chrono === 'evening') return t;
      return 1 - Math.abs(t - 0.42) * 1.6;
    };

    const slotsByPeak = [];
    for (let i = 0; i < n; i++) slotsByPeak.push(i);
    slotsByPeak.sort((a, b) => peakOf(b) - peakOf(a));

    const items = blocks.slice().sort((a, b) => demandOf(b) - demandOf(a));
    const placed = new Array(n).fill(null);

    const runLengthAt = (idx, subjectId, arr) => {
      let run = 1;
      for (let j = idx - 1; j >= 0 && arr[j] && arr[j].task.subjectId === subjectId; j--) run++;
      for (let j = idx + 1; j < n && arr[j] && arr[j].task.subjectId === subjectId; j++) run++;
      return run;
    };

    items.forEach((blk) => {
      let slot = slotsByPeak.find(
        (s) => !placed[s] && runLengthAt(s, blk.task.subjectId, placed) <= maxSame
      );
      if (slot === undefined) slot = slotsByPeak.find((s) => !placed[s]);
      placed[slot] = blk;
    });

    // ترمیم: جابه‌جایی بلوک‌های ناسازگار با بلوکی از درس دیگر
    for (let pass = 0; pass < n * 3; pass++) {
      let fixed = false;
      for (let i = 0; i < n; i++) {
        if (!placed[i] || runLengthAt(i, placed[i].task.subjectId, placed) <= maxSame) continue;
        for (let j = 0; j < n; j++) {
          if (i === j || !placed[j]) continue;
          const a = placed[i], b = placed[j];
          if (a.task.subjectId === b.task.subjectId) continue;
          placed[i] = b; placed[j] = a;
          const okNow = runLengthAt(i, placed[i].task.subjectId, placed) <= maxSame &&
                        runLengthAt(j, placed[j].task.subjectId, placed) <= maxSame;
          if (okNow) { fixed = true; break; }
          placed[i] = a; placed[j] = b; // بازگرداندن
        }
        if (fixed) break;
      }
      if (!fixed) break;
    }

    return reschedule(placed.filter(Boolean));
  }

  /* ------------------------------------------------------------------ */
  /* دلیل و «اگر…آنگاه» برای هر بلوک                                     */
  /* ------------------------------------------------------------------ */

  function whyFor(kind, cfg) {
    const map = {
      warmup: 'مرور ۲۴ساعته: یادآوریِ مبحث دیروز درست پیش از فراموشی، حافظه را تثبیت می‌کند (اصل فاصله‌گذاری).',
      learn: 'یادگیری اولیه در پنجره اوجِ توجه؛ پایان بلوک با ۵ دقیقه بازیابی فعال بدون نگاه کردن به جزوه.',
      review: 'مرور فاصله‌دار: فاصله به‌گونه‌ای انتخاب شده که بازیابی کمی سخت باشد — همین سختی، حافظه را می‌سازد.',
      practice: 'تمرین درهم با مبحثی دیگر: تشخیص «کدام روش/فرمول؟» همان مهارتی است که در آزمون سنجیده می‌شود.',
      mock: 'آزمون جامع هفتگی: آزمون خودش یادگیری است، نه فقط اندازه‌گیری (اثر آزمون).',
      analysis: 'تحلیل خطا: هر غلط به یک «کارت اشتباه» تبدیل می‌شود و در مرورهای بعدی اولویت می‌گیرد.',
      rest: 'استراحت برنامه‌ریزی‌شده: بار شناختی بدون استراحت، بازده را نزولی می‌کند.',
    };
    return map[kind] || '';
  }

  function ifThenFor(task, cfg) {
    const hour = Math.floor(task.start / 60);
    const min = String(task.start % 60).padStart(2, '0');
    const time = String(hour).padStart(2, '0') + ':' + min;
    if (task.kind === 'learn') {
      return 'اگر ساعت ' + time + ' شد، آنگاه گوشی را در حالت بی‌صدا می‌گذارم و فقط ' + task.subjectName + ' — ' + task.topicLabel + ' را شروع می‌کنم.';
    }
    if (task.kind === 'review') {
      return 'اگر ساعت ' + time + ' شد، آنگاه اول ۵ سؤال از ' + task.subjectName + ' را بدون کتاب جواب می‌دهم، بعد چک می‌کنم.';
    }
    if (task.kind === 'practice') {
      return 'اگر ساعت ' + time + ' شد، آنگاه ' + task.practiceCount + ' تستِ ' + task.subjectName + ' را زمان‌دار می‌زنم.';
    }
    if (task.kind === 'mock') {
      return 'اگر ساعت ' + time + ' شد، آنگاه آزمون را در شرایط واقعی (بدون وقفه، با زمان‌سنج) می‌دهم.';
    }
    if (task.kind === 'analysis') {
      return 'اگر ساعت ' + time + ' شد، آنگاه سه غلط اصلیِ آزمون را در دفتر اشتباهات ثبت می‌کنم.';
    }
    if (task.kind === 'warmup') {
      return 'اگر ساعت ' + time + ' شد، آنگاه بدون باز کردن جزوه، هرچه از دیروز یادم مانده را می‌نویسم.';
    }
    return '';
  }

  /* ------------------------------------------------------------------ */
  /* موتور اصلی                                                          */
  /* ------------------------------------------------------------------ */

  function createPlan(rawConfig) {
    const cfg = normalizeConfig(rawConfig);
    const topics = buildTopics(cfg);
    const subjectStats = scoreSubjects(cfg, topics);

    const totalDays = dayDiff(cfg._start, cfg._exam);
    if (totalDays <= 0) throw new Error('تاریخ آزمون باید بعد از تاریخ شروع باشد.');

    // صف یادگیری: مباحث با نیاز زمانی، به‌ترتیب اولویت درس
    const learnQueue = topics
      .filter((t) => t.needMinutes > 0)
      .map((t) => ({ t, score: (subjectStats[t.subjectId].priorityScore || 0) * (t.needMinutes / 100) }))
      .sort((a, b) => b.score - a.score)
      .map((x) => x.t);

    const dueReviews = [];   // { date, topic, gap, kind }
    const days = [];
    const warnings = [];
    let learnedCount = 0;
    let totalLearnMinutes = 0;
    let unplaced = 0;
    let yesterdayLearned = [];

    const lastDay = totalDays; // روز آزمون هم در خروجی هست (مرور سبک)

    for (let dayIndex = 0; dayIndex <= lastDay; dayIndex++) {
      const date = addDays(cfg._start, dayIndex);
      const wd = persianWeekday(date);
      const daysLeft = totalDays - dayIndex;
      const cap = dayCapacityMinutes(cfg, date, dayIndex, totalDays);
      const isExamDay = daysLeft === 0;
      const tasks = [];

      /* ---- ۱) آزمون جامع هفتگی + تحلیل ---- */
      const isMockDay = cfg.weeklyMock && wd === cfg.WEEKLY_MOCK_DAY && !isExamDay && dayIndex > 5 && daysLeft > 3;

      /* ---- ۲) مرورهای سررسید ---- */
      const todaysReviews = dueReviews
        .filter((r) => dayDiff(cfg._start, r.date) === dayIndex)
        .sort((a, b) => a.topic.mastery - b.topic.mastery);

      todaysReviews.forEach((r) => {
        tasks.push({
          kind: 'review',
          subjectId: r.topic.subjectId,
          subjectName: r.topic.subjectName,
          topicLabel: r.topic.label,
          topic: r.topic,
          minutesLeft: r.minutes,
          priority: 100 + (100 - r.topic.mastery),
          reviewMeta: r,
        });
      });

      /* ---- ۳) مرور ۲۴ساعته مباحث دیروز ---- */
      if (!isExamDay && yesterdayLearned.length) {
        const seen = new Set();
        const pick = yesterdayLearned.filter((t) => (seen.has(t.id) ? false : (seen.add(t.id), true))).slice(0, 2);
        pick.forEach((t) => {
          tasks.push({
            kind: 'warmup',
            subjectId: t.subjectId,
            subjectName: t.subjectName,
            topicLabel: t.label,
            topic: t,
            minutesLeft: Math.min(cfg.NEXT_DAY_REVIEW_MIN, 15),
            priority: 120,
          });
        });
      }

      /* ---- ۴) یادگیری جدید (تا سقف ظرفیت) ---- */
      const subjectUsedToday = {};
      const topicReviewMinutes = (topicId) => {
        const sub = cfg.subjects.find((s) => s.id === topicId);
        return sub && sub.type === 'problem' ? 20 : 15;
      };
      const scheduleReviews = (topic, fromDate) => {
        let gap = firstReviewGap(daysLeft, cfg);
        let cursorDate = addDays(fromDate, gap);
        for (let r = 0; r < (cfg.MAX_REVIEWS_PER_TOPIC || DEFAULTS.MAX_REVIEWS_PER_TOPIC); r++) {
          if (dayDiff(cfg._start, cursorDate) > totalDays - 1) break;
          dueReviews.push({ date: cursorDate, topic, gap, minutes: topicReviewMinutes(topic.subjectId) });
          topic.reviews.push(isoDay(cursorDate));
          gap = reviewInterval(gap, null, daysLeft);
          cursorDate = addDays(cursorDate, gap);
        }
      };

      /** افزودن یک تکه یادگیری با رعایت سقف روزانهٔ هر درس (تنوع بین دروس) */
      const addLearnChunks = (budget) => {
        const perSubjectCap = Math.max(
          cfg.blockMinutes,
          Math.round(cap.minutes * (daysLeft <= 7 ? 0.3 : 0.5))
        );
        let used = 0;
        let guard = 0;
        while (learnQueue.length && used < budget && guard++ < 40) {
          const idx = learnQueue.findIndex((t) => {
            const take = Math.min(cfg.blockMinutes, t.needMinutes);
            return (subjectUsedToday[t.subjectId] || 0) + take <= perSubjectCap;
          });
          if (idx === -1) break;
          const topic = learnQueue[idx];
          const chunk = Math.min(cfg.blockMinutes, topic.needMinutes, budget - used);
          if (chunk < 10) break;
          tasks.push({
            kind: 'learn',
            subjectId: topic.subjectId,
            subjectName: topic.subjectName,
            topicLabel: topic.label,
            topic,
            minutesLeft: chunk,
            priority: 90,
          });
          used += chunk;
          totalLearnMinutes += chunk;
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

      if (!isExamDay) {
        const softCap = cap.minutes * (daysLeft <= 7 ? 0.35 : 0.85);
        addLearnChunks(softCap);
        yesterdayLearned = tasks.filter((t) => t.kind === 'learn').map((t) => t.topic);
      } else {
        yesterdayLearned = [];
      }

      /* ---- ۵) آزمون جامع ---- */
      if (isMockDay) {
        tasks.unshift({
          kind: 'mock',
          subjectId: 'MOCK',
          subjectName: 'آزمون جامع هفتگی',
          topicLabel: 'همه دروس',
          minutesLeft: Math.min(cfg.WEEKLY_MOCK_MIN || DEFAULTS.WEEKLY_MOCK_MIN, Math.max(60, cap.minutes * 0.5)),
          priority: 200,
        });
        tasks.push({
          kind: 'analysis',
          subjectId: 'MOCK',
          subjectName: 'تحلیل آزمون',
          topicLabel: 'دفتر اشتباهات',
          minutesLeft: Math.min(cfg.MOCK_ANALYSIS_MIN || DEFAULTS.MOCK_ANALYSIS_MIN, Math.max(20, cap.minutes * 0.25)),
          priority: 210,
        });
      }

      /* ---- ۶) پر کردن باقی ظرفیت با تمرین درهم ---- */
      tasks.sort((a, b) => b.priority - a.priority);
      const planned = sum(tasks.map((t) => t.minutesLeft));
      let spare = cap.minutes - planned;
      if (spare >= 20 && !isExamDay && learnQueue.length) {
        const extra = addLearnChunks(spare);
        spare -= extra;
        yesterdayLearned = tasks.filter((t) => t.kind === 'learn').map((t) => t.topic);
      }
      if (spare >= 20 && !isExamDay) {
        // درس‌هایی که کمترین سهم اجرایی را داشتند، برای تمرین انتخاب می‌شوند
        const orderedByNeed = cfg.subjects
          .slice()
          .sort((a, b) => (b.weight * (1 - b.mastery / 100)) - (a.weight * (1 - a.mastery / 100)));
        let i = 0;
        const todaySubjects = new Set(tasks.map((t) => t.subjectId));
        while (spare >= 20 && i < 6) {
          const s = orderedByNeed[i % orderedByNeed.length];
          // درهم‌آمیزی: ترجیحاً درسی که امروز نیست یا فقط یک بلوک دارد (تشخیص سخت‌تر)
          const prefer = !todaySubjects.has(s.id);
          const minutes = Math.min(cfg.blockMinutes, roundTo5(spare));
          tasks.push({
            kind: 'practice',
            subjectId: s.id,
            subjectName: s.name,
            topicLabel: prefer ? 'تمرین درهم با مبحث قبلی' : 'تست‌زنی زمان‌دار',
            minutesLeft: minutes,
            priority: 10 + (prefer ? 5 : 0),
            practiceCount: Math.max(5, Math.round(minutes / (s.type === 'problem' ? 3.5 : 1.6))),
          });
          spare -= minutes;
          i++;
        }
      }

      /* ---- ۷) بسته‌بندی در بلوک‌ها ---- */
      const capacityInfo = { minutes: cap.minutes, windowStart: cap.windowStart };
      const blocks = arrangeBlocks(packIntoBlocks(tasks, cfg, capacityInfo), cfg, capacityInfo);

      // دمِ بازیابی فعال: ۵ دقیقه انتهای هر بلوک یادگیری/تمرین (فقط در متن نمایش داده می‌شود)

      const outBlocks = blocks.map((b) => {
        const t = b.task;
        const tail = t.kind === 'learn' || t.kind === 'practice' ? (cfg.RETRIEVAL_TAIL_MIN || DEFAULTS.RETRIEVAL_TAIL_MIN) : 0;
        return {
          start: fmtHM(b.start),
          end: fmtHM(b.end),
          minutes: b.minutes,
          kind: t.kind,
          kindLabel: kindLabel(t.kind),
          subjectId: t.subjectId,
          subjectName: t.subjectName,
          topic: t.topicLabel,
          content: contentFor(t),
          technique: techniqueFor(t),
          retrievalTail: tail,
          ifThen: ifThenFor({ kind: t.kind, start: b.start, subjectName: t.subjectName, topicLabel: t.topicLabel, practiceCount: t.practiceCount }, cfg),
          why: whyFor(t.kind, cfg),
        };
      });

      const dayMinutes = sum(outBlocks.map((b) => b.minutes));
      days.push({
        index: dayIndex,
        date: isoDay(date),
        weekday: WEEKDAY_FA[wd],
        isMockDay: Boolean(isMockDay),
        isRestDay: dayMinutes === 0,
        isExamDay,
        isDeload: cap.isDeload,
        plannedMinutes: dayMinutes,
        blocks: outBlocks,
        note: dayNote({ isExamDay, isMockDay, isRestDay: dayMinutes === 0, isDeload: cap.isDeload, chronotype: cfg.student.chronotype }),
      });

      // آمار درس‌ها
      outBlocks.forEach((b) => {
        if (subjectStats[b.subjectId]) {
          subjectStats[b.subjectId].minutes += b.minutes;
          subjectStats[b.subjectId].blocks += 1;
        }
      });
    }

    /* ---- هشدارها و جمع‌بندی ---- */
    if (learnQueue.length) {
      const missing = sum(learnQueue.map((t) => t.needMinutes));
      const low = lowWeightSubjects(cfg);
      warnings.push(
        'با ساعت‌های فعلی حدود ' + Math.round(missing / 60) + ' ساعت برای پوشش کاملِ ' + learnQueue.length +
        ' مبحث باقی‌مانده کم است. ' +
        (low.length
          ? 'پیشنهاد: ۱ ساعت به روزهای آزاد اضافه کنید یا فصل‌های کم‌ضریب (' + low.map((s) => s.name).join('، ') + ') را عقب بیندازید.'
          : 'پیشنهاد: ساعت مطالعهٔ روزهای آزاد را ۱ تا ۱٫۵ ساعت افزایش دهید یا تعداد فصل‌های هدف را واقع‌بینانه‌تر کنید.')
      );
    }
    const examDay = days.find((d) => d.isExamDay);
    if (examDay && examDay.blocks.length === 0) {
      examDay.blocks = [{
        start: '07:30', end: '08:00', minutes: 30, kind: 'review', kindLabel: 'مرور نهایی',
        subjectId: 'ALL', subjectName: 'مرور نهایی', topic: 'فقط خلاصه‌ها و دفتر اشتباهات',
        content: 'مرور سریع خلاصه‌ها و دفتر اشتباهات — بدون مطالب جدید',
        technique: 'بازیابی کوتاه + آرام‌سازی',
        retrievalTail: 0, ifThen: '', why: 'مرور سبک صبح آزمون، بدون یادگیری جدید؛ خواب کافی شب قبل مهم‌تر از هر مرور دیگری است.',
      }];
      examDay.plannedMinutes = 30;
    }

    const totalPlanned = sum(days.map((d) => d.plannedMinutes));
    const bySubject = cfg.subjects.map((s) => {
      const st = subjectStats[s.id];
      return {
        id: s.id,
        name: s.name,
        weight: s.weight,
        mastery: s.mastery,
        minutes: st.minutes,
        hours: Math.round((st.minutes / 60) * 10) / 10,
        sharePlanned: totalPlanned ? st.minutes / totalPlanned : 0,
        shareIdeal: st.share,
      };
    }).sort((a, b) => b.minutes - a.minutes);

    return {
      meta: {
        version: '1.0.0',
        createdAt: new Date().toISOString(),
        studentName: cfg.student.name,
        field: cfg.student.field,
        grade: cfg.student.grade,
        chronotype: cfg.student.chronotype,
        startDate: cfg.startDate,
        examDate: cfg.examDate,
        totalDays,
        blockMinutes: cfg.blockMinutes,
        config: configForStorage(cfg),
      },
      summary: {
        totalMinutes: totalPlanned,
        totalHours: Math.round((totalPlanned / 60) * 10) / 10,
        avgHoursPerDay: Math.round((totalPlanned / 60 / Math.max(1, days.length)) * 10) / 10,
        learnedTopics: learnedCount,
        totalReviewEvents: days.reduce((a, d) => a + d.blocks.filter((b) => b.kind === 'review').length, 0),
        bySubject,
        warnings,
        coachNotes: coachNotes(cfg, bySubject, warnings),
      },
      days,
    };
  }

  function toFaDigits(n) {
    return String(n).replace(/[0-9]/g, (d) => '۰۱۲۳۴۵۶۷۸۹'[+d]);
  }

  function kindLabel(kind) {
    return {
      learn: 'یادگیری جدید',
      review: 'مرور فاصله‌دار',
      practice: 'تمرین/تست',
      mock: 'آزمون جامع',
      analysis: 'تحلیل خطا',
      warmup: 'مرور ۲۴ساعته',
      rest: 'استراحت',
    }[kind] || kind;
  }

  function contentFor(t) {
    if (t.kind === 'learn') return 'مطالعهٔ فعال + نت‌برداریِ پرسشی (سؤال‌هایی که بعداً از خودت می‌پرسی)';
    if (t.kind === 'review') return 'بازیابی بدون کتاب: تعریف‌ها/فرمول‌ها را از حافظه بنویس، بعد چک کن';
    if (t.kind === 'practice') return (t.practiceCount || 10) + ' تست زمان‌دار از مبحث‌های قبلی (درهم)';
    if (t.kind === 'warmup') return 'نوشتن هر چه از دیروز یادت مانده، بدون نگاه کردن';
    if (t.kind === 'mock') return 'آزمون کامل در شرایط واقعی';
    if (t.kind === 'analysis') return 'دسته‌بندی غلط‌ها: بی‌دقتی / نبودِ مفهوم / کمبودِ سرعت';
    return '';
  }

  function techniqueFor(t) {
    if (t.kind === 'learn') return 'یادگیری + خودتوضیحی + بازیابی ۵ دقیقه‌ای';
    if (t.kind === 'review') return 'بازیابی فعال (Active Recall)';
    if (t.kind === 'practice') return 'تمرین درهم (Interleaving)';
    if (t.kind === 'warmup') return 'مرور ۲۴ساعته (Spacing)';
    if (t.kind === 'mock') return 'آزمون‌محوری (Testing Effect)';
    if (t.kind === 'analysis') return 'فراشناخت / دفتر اشتباهات';
    return '';
  }

  function dayNote(info) {
    if (info.isExamDay) return 'روز آزمون — موفق باشی! بعد از آزمون، همین برنامه را برای مرحلهٔ بعد بازتنظیم کن.';
    if (info.isRestDay) return 'روز استراحت: مغز بین جلسات، همان‌جایی است که تثبیت انجام می‌شود.';
    if (info.isMockDay) return 'روز آزمون جامع: اول آزمون، بعد تحلیل — نه برعکس.';
    if (info.isDeload) return 'هفتهٔ سبک‌سازی (deload): بار کمتر تا فرسودگی نگیریم.';
    if (info.chronotype === 'morning') return 'سخت‌ترین کارها را در بلوک‌های اول گذاشتم (تیپ صبح‌زی).';
    if (info.chronotype === 'evening') return 'سخت‌ترین کارها را در بلوک‌های انتهایی گذاشتم (تیپ شب‌زی).';
    return '';
  }

  function lowWeightSubjects(cfg) {
    // فقط درس‌های واقعاً کم‌ضریب (ضریب زیر ۳) پیشنهاد می‌شوند؛ پیشنهاد حذف درس مهم، مشاورهٔ غلط است.
    return cfg.subjects.filter((s) => s.weight < 3).sort((a, b) => a.weight - b.weight).slice(0, 2);
  }

  function coachNotes(cfg, bySubject, warnings) {
    const notes = [];
    const first = bySubject[0];
    if (first) notes.push('بیشترین زمان به «' + first.name + '» داده شد (' + first.hours + ' ساعت) — ترکیبِ ضریب بالا، فاصلهٔ تسلط و حجمِ باقی‌ماندهٔ آن، بیشترین اثر را روی نتیجه دارد.');
    const weakest = cfg.subjects.slice().sort((a, b) => a.mastery - b.mastery)[0];
    if (weakest) notes.push('ضعیف‌ترین درس فعلی: «' + weakest.name + '» — مرورهایش زودتر و بیشتر تکرار می‌شود.');
    notes.push('هر بلوک با ۵ دقیقه بازیابی فعال تمام می‌شود؛ این کار در لحظه سخت‌تر است ولی یک هفته بعد نتیجه‌اش را می‌بینی.');
    notes.push('اگر بیش از ۳۰٪ تسک‌های یک هفته انجام نشد، برنامه را بازتنظیم کن (بار واقعی، نه آرمانی).');
    return notes;
  }

  function configForStorage(cfg) {
    return {
      student: cfg.student,
      startDate: cfg.startDate,
      examDate: cfg.examDate,
      sleep: cfg.sleep,
      availability: cfg.availability,
      startTimes: cfg.startTimes,
      blockMinutes: cfg.blockMinutes,
      breakMinutes: cfg.breakMinutes,
      restDay: cfg.restDay,
      weeklyMock: cfg.weeklyMock,
      subjects: cfg.subjects,
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
      ' · **مجموع:** ' + plan.summary.totalHours + ' ساعت · **میانگین روزانه:** ' + plan.summary.avgHoursPerDay + ' ساعت');
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
      if (!d.blocks.length) return;
      L.push('### ' + d.date + ' — ' + d.weekday + (d.isMockDay ? ' (آزمون جامع)' : '') + (d.plannedMinutes ? ' · ' + Math.round(d.plannedMinutes / 60 * 10) / 10 + ' ساعت' : ''));
      if (d.note) L.push('> ' + d.note);
      d.blocks.forEach((b) => {
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
      d.blocks.forEach((b) => {
        rows.push([d.date, d.weekday, b.start, b.end, b.minutes, b.kindLabel, b.subjectName, b.topic, b.content, b.technique, b.ifThen]);
      });
    });
    return rows.map((r) => r.map((c) => '"' + String(c).replace(/"/g, '""') + '"').join(',')).join('\r\n');
  }

  /** متن ساده برای چسباندن در اپ روال (تسک‌های یک روز یا کل برنامه) */
  function toTaskList(plan, dateIso) {
    const out = [];
    plan.days
      .filter((d) => !dateIso || d.date === dateIso)
      .forEach((d) => {
        d.blocks.forEach((b) => {
          out.push(b.subjectName + ' — ' + b.topic + ' · ' + b.minutes + ' دقیقه · ' + b.kindLabel);
        });
      });
    return out.join('\n');
  }

  /** تقویم ICS (قابل ایمپورت در گوگل/اوت‌لوک/اپل) */
  function toICS(plan) {
    const pad = (n) => String(n).padStart(2, '0');
    const stamp = (dateIso, hm) => {
      const [y, m, d] = dateIso.split('-');
      const [hh, mm] = hm.split(':');
      return y + m + d + 'T' + pad(hh) + pad(mm) + '00';
    };
    const lines = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//Reval//Smart Planner//FA',
      'CALSCALE:GREGORIAN',
      'X-WR-CALNAME:برنامه روال',
    ];
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

  /** ثبت نتیجهٔ آزمون یک درس و محاسبهٔ تسلط جدید (برای بازبرنامه‌ریزی) */
  function updateMastery(subject, score) {
    const k = 0.5;
    const s = clamp(Number(score) || 0, -33, 100);
    const target = clamp(s < 0 ? 0 : s, 0, 100);
    const next = clamp(subject.mastery + k * (target - subject.mastery), 0, 100);
    return Object.assign({}, subject, { mastery: Math.round(next) });
  }

  return {
    createPlan,
    updateMastery,
    toMarkdown,
    toCSV,
    toICS,
    toTaskList,
    DEFAULTS,
    WEEKDAY_FA,
    WEEKDAY_KEY,
    SUBJECT_TYPE_FA,
    _internal: { normalizeConfig, dayDiff, persianWeekday, firstReviewGap, reviewInterval, addDays, isoDay },
  };
});
