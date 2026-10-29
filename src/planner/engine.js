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
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./jalali.js'));
  else root.RevalPlanner = factory(root.RevalJalali);
})(typeof self !== 'undefined' ? self : this, function (J) {
  'use strict';

  /* نمایش تاریخ: همیشه شمسی؛ اگر ماژول تقویم نبود، همان ISO */
  const jDate = (iso) => (J && J.fmt ? J.fmt(iso) : iso);
  const jDateLong = (iso) => (J && J.fmtLong ? J.fmtLong(iso) : iso);

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
    FINAL_PHASE_DAYS: 30,     // از این تعداد روز مانده: فاز جمع‌بندی (هیچ مبحث تازه‌ای)
    FINAL_NO_RETEACH_DAYS: 14,// آخرین ۲ هفته: فقط مرور و آزمون
    RETEACH_BELOW: 45,        // تسلط کمتر از این ⇒ «جبران» (بازآموزی)
    BOOST_BELOW: 75,          // بین این دو ⇒ «ارتقا» (تست هدفمند + رفع اشکال)
    RETEACH_FACTOR: 0.55,     // نسبت زمان بازآموزی به یادگیری از صفر
    BOOST_FACTOR: 0.3,        // نسبت زمان ارتقا
    RETEACH_PRIORITY: 1.35,   // ضریب اولویت فصل‌های ضعیف در صف
    CUM_REVIEW_MIN: 45,       // بلوک مرور تجمعی هفتگی
    CUM_REVIEW_EVERY: 7,      // هر چند روز یک‌بار
    FINALS_MIN_PER_POINT: 180, // دقیقهٔ کار مؤثر برای هر نمرهٔ نهایی (× ضریب/۳)
    FINALS_SHARE: 0.6,        // سهم سوابق در نمرهٔ ترکیبی ۱۴۰۶
    EXAM_PREP_DAYS: 2,        // از چند روز قبل، بلوک آماده‌سازی مهلت آزمون چیده شود
    DEADLINE_PRESSURE_MAX: 2.5, // حداکثر فشار مهلت روی سهم یک درس
    LIGHT_DAY_RATIO: 0.55,    // روز نیمه‌تعطیل: چند برابر بار عادی
    ASSUMED_PASS_FACTOR: 0.55, // فصل «فرضاً خوانده‌شده» یک پاس سریع واقعی می‌گیرد
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
    const h = Number(m[1]);
    const mi = Number(m[2]) % 60;
    /* ۲۴:۰۰ = پایان روز (۱۴۴۰ دقیقه)؛ %۲۴ کردنش آن را به ۰۰:۰۰ تبدیل می‌کرد
       و کل برنامه را خالی می‌ساخت */
    if (h >= 24) return { h: 24, m: 0 };
    return { h, m: mi };
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

    cfg.subjects = (cfg.subjects || []).map((s, i) => {
      const chapterCount = clamp(Number(s.chapters) || 1, 1, 120);
      /* ارزیابی فصل‌به‌فصل: [{name, read, mastery}] — اگر نبود، از masteredChapters/mastery عقب‌گرد می‌کنیم */
      let data = null;
      if (Array.isArray(s.chaptersData) && s.chaptersData.length) {
        data = [];
        for (let c = 0; c < chapterCount; c++) {
          const raw = s.chaptersData[c] || {};
          const read = raw.read === true || Number(raw.mastery) > 0;
          data.push({
            name: String(raw.name || (s.topicNames && s.topicNames[c]) || ('فصل ' + toFa(c + 1))).slice(0, 80),
            read,
            mastery: read ? clamp(Number(raw.mastery) || 0, 0, 100) : 0,
          });
        }
      }
      const readList = data ? data.filter((c) => c.read) : null;
      const avgMastery = data
        ? (data.length ? Math.round(sum(data.map((c) => (c.read ? c.mastery : 0))) / data.length) : 0)
        : clamp(Number(s.mastery) || 0, 0, 100);
      return {
        id: s.id || 'S' + (i + 1),
        name: s.name || 'درس ' + (i + 1),
        weight: Math.max(0.2, Number(s.weight) || 1),
        chapters: chapterCount,
        masteredChapters: readList
          ? readList.filter((c) => c.mastery >= DEFAULTS.BOOST_BELOW).length
          : clamp(Number(s.masteredChapters) || 0, 0, 120),
        mastery: avgMastery,
        difficulty: clamp(Number(s.difficulty) || 2, 1, 3),
        type: s.type || 'conceptual',
        examPercent: s.examPercent == null ? null : clamp(Number(s.examPercent), -33, 100),
        include: s.include !== false,
        general: !!s.general,
        topicLabel: s.topicLabel || null,
        topicNames: Array.isArray(s.topicNames) ? s.topicNames.slice(0, 120) : null,
        chaptersData: data,
      };
    }).filter((s) => s.include);
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

    /* ---------------- سوابق تحصیلی / امتحانات نهایی ---------------- */
    const fin = cfg.finals || {};
    const finCourses = (fin.courses || []).map((c, i) => {
      const cur = (c.current === '' || c.current == null || Number.isNaN(Number(c.current)))
        ? null : clamp(Number(c.current), 0, 20);
      return {
        id: c.id || 'F' + (i + 1),
        name: String(c.name || 'درس نهایی ' + (i + 1)).slice(0, 60),
        grade: c.grade || 'دوازدهم',
        influence: Math.max(0.5, Number(c.influence) || 3),
        current: cur,
        /* نمرهٔ فعلیِ ثبت‌نشده = فرضِ میانه (۱۲)؛ در گزارش شفاف اعلام می‌شود */
        assumed: cur === null,
        target: c.target === '' || c.target == null ? 18 : clamp(Number(c.target), 0, 20),
        inProgram: c.inProgram !== false,
      };
    }).filter((c) => c.inProgram);
    let winStart = null;
    let winEnd = null;
    const win = fin.window || {};
    try { if (win.start) winStart = isoDay(toDate(win.start)); } catch { winStart = null; }
    try { if (win.end) winEnd = isoDay(toDate(win.end)); } catch { winEnd = null; }
    if (!winStart || !winEnd) {
      /* پیش‌فرض: ۶ هفته پیش از کنکور (خرداد/تیر) */
      const examD = toDate(cfg.examDate);
      if (!winEnd) winEnd = isoDay(addDays(examD, -6));
      if (!winStart) winStart = isoDay(addDays(examD, -42));
    }
    if (winStart > winEnd) { const tmp = winStart; winStart = winEnd; winEnd = tmp; }
    cfg.finals = {
      enabled: fin.enabled !== false && finCourses.length > 0,
      courses: finCourses,
      windowStart: winStart,
      windowEnd: winEnd,
      /* پخش سالانه: سوابق ۶۰٪ نمره است و نمی‌شود همه را به چند هفتهٔ خرداد سپرد */
      spread: fin.spread !== false,
      spreadDay: clamp(Number(fin.spreadDay) || 4, 1, 7),
      spreadMinutes: clamp(Number(fin.spreadMinutes) || 45, 20, 120),
    };

    /* ---------------- مهلت‌ها: دو مدل ---------------- */
    const dl = cfg.deadlines || {};
    const dlBooks = (dl.books || []).map((b, i) => {
      if (!b || !subjectIds.has(b.subjectId)) return null;
      let date;
      try { date = isoDay(toDate(b.date)); } catch { return null; }
      return {
        id: b.id || 'B' + (i + 1),
        subjectId: b.subjectId,
        date,
        goal: b.goal === 'solid' ? 'solid' : 'read',
        chaptersTo: b.chaptersTo ? clamp(Number(b.chaptersTo), 1, 120) : null,
      };
    }).filter(Boolean).sort((a, b) => (a.date < b.date ? -1 : 1));
    const dlExams = (dl.exams || []).map((e, i) => {
      if (!e) return null;
      let date;
      try { date = isoDay(toDate(e.date)); } catch { return null; }
      const kind = e.kind === 'comprehensive' ? 'comprehensive' : 'single';
      if (kind === 'single' && !subjectIds.has(e.subjectId)) return null;
      return {
        id: e.id || 'X' + (i + 1),
        title: String(e.title || (kind === 'single' ? 'آزمون تک‌درس' : 'آزمون جامع')).slice(0, 60),
        kind,
        subjectId: kind === 'single' ? e.subjectId : null,
        from: e.from ? clamp(Number(e.from), 1, 120) : 1,
        to: e.to ? clamp(Number(e.to), 1, 120) : 120,
        date,
      };
    }).filter(Boolean).sort((a, b) => (a.date < b.date ? -1 : 1));
    cfg.deadlines = { books: dlBooks, exams: dlExams };

    /* ---------------- روزهای خارج از برنامه ---------------- */
    cfg.offDates = (cfg.offDates || []).map((o) => {
      if (!o) return null;
      let date;
      try { date = isoDay(toDate(o.date)); } catch { return null; }
      return { date, kind: o.kind === 'light' ? 'light' : 'halt', note: String(o.note || '').slice(0, 50) };
    }).filter(Boolean);

    /* ---------------- کار عقب‌افتاده (بازچینش هوشمند) ---------------- */
    /* سقف بدهی جبران: بیشتر از ۴۰ ساعت عقب‌افتادگی در یک بازچینش معنا ندارد؛
       بدهی کهنه اول حذف می‌شود (کارِ سه ماه پیش دیگر ارزش جبران ندارد، فصل مهم‌تر است). */
    const CARRY_CAP_MIN = 2400;
    const carryRaw = (cfg.carryOver || []).slice().sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')));
    let carryBudgetLeft = CARRY_CAP_MIN;
    cfg.carryOver = carryRaw.filter((c) => {
      const m = clamp(Number(c.minutes) || 45, 10, 240);
      if (carryBudgetLeft < 15) return false;
      carryBudgetLeft -= m;
      return true;
    });
    cfg.carryOver = cfg.carryOver.map((c, i) => ({
      id: 'C' + (i + 1),
      subjectId: subjectIds.has(c.subjectId) ? c.subjectId : null,
      subjectName: String(c.subjectName || 'کار عقب‌افتاده').slice(0, 40),
      label: String(c.label || 'جلسهٔ جامانده').slice(0, 90),
      minutes: clamp(Number(c.minutes) || 45, 10, 240),
      kind: c.kind === 'review' ? 'review' : 'learn',
      chapterId: c.chapterId ? String(c.chapterId) : null,   // فصل واقعیِ پشتِ این جبران
    }));

    /* ---------------- هدف تست روزانه ---------------- */
    const totalAvailHours = sum(WEEKDAY_KEY.map((k) => cfg.availability[k]));
    /* هدف تست روزانه: متناسب با ساعت اعلامی (۳۰ ساعت در هفته ≈ ۵۰ تست در روز).
       نورم حرفه‌ای برای دانش‌آموز پشت‌کنکوری ۱۰۰–۱۵۰ است، برای ۴ ساعت روزانه حدود ۵۰. */
    const autoDaily = clamp(Math.round(totalAvailHours * 1.5), 25, 150);
    cfg.testTarget = {
      daily: clamp(Number((cfg.testTarget || {}).daily) || autoDaily, 0, 250),
    };

    return cfg;
  }

  /* ------------------------------------------------------------------ */
  /* مدل مباحث و اولویت                                                  */
  /* ------------------------------------------------------------------ */

  /**
   * ساخت فهرست مباحث از ارزیابی فصل‌به‌فصل.
   * هر فصل یکی از سه حالت را می‌گیرد:
   *   learn   → خوانده نشده؛ یادگیری از صفر
   *   reteach → خوانده شده ولی تسلط < ۴۵٪؛ «جبران» با بازآموزی + تست هدفمند
   *   boost   → تسلط ۴۵–۷۵٪؛ «ارتقا» با تست هدفمند و رفع اشکال
   *   solid   → تسلط ≥ ۷۵٪؛ فقط مرور فاصله‌دار (زمان یادگیری صفر)
   */
  function buildTopics(cfg) {
    const topics = [];
    cfg.subjects.forEach((s) => {
      const base = s.type === 'memorization' ? 60 : s.type === 'problem' ? 120 : 85;
      const data = s.chaptersData;
      for (let i = 1; i <= s.chapters; i++) {
        const row = data ? data[i - 1] : null;
        const read = data ? Boolean(row && row.read) : (i <= Math.floor(s.masteredChapters));
        const mastery = data
          ? (row && row.read ? row.mastery : 0)
          : (read ? 100 : 0);
        let mode;
        let need;
        if (!read) {
          mode = 'learn';
          need = base * s.difficulty;
        } else if (mastery < DEFAULTS.RETEACH_BELOW) {
          mode = 'reteach';
          need = 20 + base * s.difficulty * DEFAULTS.RETEACH_FACTOR * ((DEFAULTS.BOOST_BELOW - mastery) / DEFAULTS.BOOST_BELOW);
        } else if (mastery < DEFAULTS.BOOST_BELOW) {
          mode = 'boost';
          need = 15 + base * s.difficulty * DEFAULTS.BOOST_FACTOR * ((DEFAULTS.BOOST_BELOW - mastery) / DEFAULTS.BOOST_BELOW);
        } else {
          mode = 'solid';
          need = 0;
        }
        topics.push({
          id: s.id + '.c' + i,
          subjectId: s.id,
          subjectName: s.name,
          weight: s.weight,
          chapter: i,
          label: (data && row && row.name)
            ? String(row.name)
            : (s.topicNames && s.topicNames[i - 1])
              ? String(s.topicNames[i - 1])
              : (s.topicLabel || 'فصل') + ' ' + toFa(i),
          general: !!s.general,
          read: Boolean(read),
          assumed: Boolean(row && row.assumed),
          mode,
          mastery: clamp(mastery, 0, 100),
          mastered: clamp(mastery, 0, 100) >= DEFAULTS.BOOST_BELOW,
          /* نیاز تست هر فصل (مبنای گزارش فصل‌به‌فصل) */
          testsNeed: Math.round((s.type === 'problem' ? 45 : s.type === 'memorization' ? 30 : 55) * s.difficulty),
          testsDone: 0,
          learnedOn: null,
          doneDate: null,
          reviewMinutes: 0,
          deadlineIdx: null,
          deadlineTitle: null,
          deadlineKind: null,
          needMinutes: Math.max(0, roundTo5(need)),
          initialNeedMinutes: Math.max(0, roundTo5(need)),
          plannedMinutes: 0,
          learnedOn: null,
          reviews: [],
        });
      }
    });
    return topics;
  }

  /** اولویت فصل برای صف یادگیری/جبران: ضریب × شکاف تسلط (فصل ضعیفِ پرضریب اول) */
  function topicPriority(t) {
    const gap = (100 - t.mastery) / 100;
    const kindFactor = t.mode === 'reteach' ? DEFAULTS.RETEACH_PRIORITY : t.mode === 'boost' ? 1.1 : 1;
    return Math.max(0.01, t.weight * (0.15 + 0.85 * gap) * kindFactor);
  }

  function scoreSubjects(cfg) {
    const active = cfg.subjects;
    const weightSum = sum(active.map((s) => s.weight)) || 1;
    const nActive = Math.max(1, active.length);
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

    /* سهم تضمین‌شده: هیچ درسی (خصوصاً دروس عمومی) کامل گرسنه نمی‌ماند.
       هر درس فعال حداقل ۵۵٪ سهمِ برابر را می‌گیرد، سپس همه دوباره نرمال می‌شوند. */
    const floor = 0.55 / nActive;
    const bumped = {};
    let bumpedTotal = 0;
    Object.keys(stats).forEach((k) => {
      bumped[k] = Math.max(stats[k].share, floor);
      bumpedTotal += bumped[k];
    });
    Object.keys(stats).forEach((k) => {
      stats[k].share = bumped[k] / (bumpedTotal || 1);
      stats[k].floored = bumped[k] > stats[k].raw / total + 1e-9;
    });
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
      reteach: 'جبران و بازآموزی',
      boost: 'ارتقای تسلط',
      cumreview: 'مرور تجمعی هفته',
      review: 'مرور فاصله‌دار',
      practice: 'تمرین/تست',
      mock: 'آزمون جامع',
      exam: 'آزمون آزمایشی',
      analysis: 'تحلیل خطا',
      warmup: 'مرور ۲۴ساعته',
      classfix: 'تثبیت کلاس',
      finalprep: 'سوابق تحصیلی (نهایی)',
      deadlinecheck: 'آماده‌سازی مهلت',
      carry: 'جبران عقب‌افتادگی',
      carryreview: 'مرور عقب‌افتادگی',
      rest: 'استراحت',
    }[kind] || kind;
  }

  function techniqueFor(kind) {
    return {
      learn: 'یادگیری + خودتوضیحی + بازیابی ۵ دقیقه‌ای',
      reteach: 'بازآموزی هدفمند + تست تشخیصی + دفتر اشتباهات',
      boost: 'تست هدفمند زمان‌دار + رفع اشکال (خطاهای تکراری)',
      cumreview: 'مرور تجمعی با بازیابی فعال + آزمون کوتاه',
      review: 'بازیابی فعال (Active Recall)',
      practice: 'تمرین درهم (Interleaving)',
      mock: 'آزمون‌محوری (Testing Effect)',
      exam: 'شبیه‌سازی شرایط آزمون',
      analysis: 'فراشناخت / دفتر اشتباهات',
      warmup: 'مرور ۲۴ساعته (Spacing)',
      classfix: 'تثبیت بعد از کلاس (۲۴ ساعت طلایی)',
      finalprep: 'نمونه‌سؤال نهایی + تصحیح با کلید رسمی + دفتر خطا',
      deadlinecheck: 'بازیابی فشردهٔ محدودهٔ مهلت + تست شبیه‌ساز',
      carry: 'بازچینش هوشمند: کار عقب‌افتاده در اولین فرصت',
      carryreview: 'مرور کوتاه کار عقب‌افتاده (جلوگیری از دوباره‌فراموشی)',
    }[kind] || '';
  }

  function contentFor(t, block) {
    if (t.kind === 'learn') return 'مطالعهٔ فعال + نت‌برداریِ پرسشی (سؤال‌هایی که بعداً از خودت می‌پرسی)';
    if (t.kind === 'reteach') return 'این فصل را «از نو و کوچک‌تر» بخوان: فقط بخش‌هایی که در تست غلط زدی؛ بعد ۱۰ تست همان فصل + ثبت ۳ خطای اصلی';
    if (t.kind === 'boost') return 'بدون خواندن دوبارهٔ کل فصل: ۱۵–۲۰ تست هدفمند از همین فصل، زمان‌دار، بعد تحلیل غلط‌ها';
    if (t.kind === 'cumreview') return 'مرور تجمعی: از فصل‌های ضعیف این هفته، بدون کتاب به سؤال‌ها جواب بده و فقط جاهایی که لنگ زدی را بازکن';
    if (t.kind === 'review') return 'بازیابی بدون کتاب: تعریف‌ها/فرمول‌ها را از حافظه بنویس، بعد چک کن';
    if (t.kind === 'practice') return (block.practiceCount || 10) + ' تست زمان‌دار از مبحث‌های قبلی (درهم)';
    if (t.kind === 'warmup') return 'نوشتن هر چه از دیروز یادت مانده، بدون نگاه کردن';
    if (t.kind === 'classfix') return 'همان شبِ کلاس: خلاصهٔ کلاس را از حافظه بازنویسی کن و سؤال‌های بی‌جواب را علامت بزن';
    if (t.kind === 'mock') return 'آزمون کامل در شرایط واقعی';
    if (t.kind === 'exam') return 'آزمون آزمایشی — با آرامش و مدیریت زمان';
    if (t.kind === 'analysis') return 'دسته‌بندی غلط‌ها: بی‌دقتی / نبودِ مفهوم / کمبودِ سرعت — و ساخت «کارت اشتباه»';
    if (t.kind === 'finalprep') return 'یک نوبتِ نمونه‌سؤال/آزمون همان درس، با زمان‌سنج؛ بعد تصحیح با بارم‌بندی رسمی و ثبت «چه چیزی نمره را خورد»';
    if (t.kind === 'deadlinecheck') return 'مرور فشردهٔ محدودهٔ مهلت: اول تست، بعد فقط نقاط ضعف را باز کن — نه خواندن از صفر';
    if (t.kind === 'carry') return 'کار عقب‌افتاده را کوچک و مشخص تمام کن: هدف این جلسه فقط همان تکهٔ جامانده است';
    if (t.kind === 'carryreview') return 'مرور کوتاه همان کار عقب‌افتاده تا دوباره فراموش نشود';
    return '';
  }

  function whyFor(kind) {
    return {
      warmup: 'مرور ۲۴ساعته: یادآوریِ مبحث دیروز درست پیش از فراموشی، حافظه را تثبیت می‌کند (اصل فاصله‌گذاری).',
      classfix: 'کلاس، رمزگذاریِ تازه ساخته؛ کوتاه‌ترین بازیابی در ۲۴ ساعت اول بیشترین اثر را روی ماندگاری دارد.',
      learn: 'یادگیری اولیه در پنجره اوجِ توجه؛ پایان بلوک با ۵ دقیقه بازیابی فعال بدون نگاه کردن به جزوه.',
      reteach: 'فصلی که خوانده‌ای ولی تسلطش کم است، با «یادگیری مجدد هدفمند» سریع‌تر از خواندن کل کتاب جبران می‌شود؛ نقطهٔ شروع، غلط‌های خودت است.',
      boost: 'در تسلط متوسط، خواندن دوباره کم‌بازده است؛ چیزی که درصد را بالا می‌برد تست هدفمند + تحلیل خطاست (اثر آزمون).',
      cumreview: 'مرور تجمعی هفتگی می‌گذارد مبحث‌های قدیمی از حافظه بیرون نروند و «حافظهٔ بلندمدت» تا روز کنکور زنده بماند.',
      review: 'مرور فاصله‌دار: فاصله طوری انتخاب شده که بازیابی کمی سخت باشد — همین سختی حافظه را می‌سازد.',
      practice: 'تمرین درهم: تشخیص «کدام روش/فرمول؟» همان مهارتی است که در آزمون سنجیده می‌شود.',
      mock: 'آزمون خودش یادگیری است، نه فقط اندازه‌گیری (اثر آزمون).',
      exam: 'آزمون واقعی؛ بعد از آن بلافاصله تحلیل خطا مهم‌تر از خودِ نمره است.',
      analysis: 'هر غلط به یک «کارت اشتباه» تبدیل می‌شود و در مرورهای بعدی اولویت می‌گیرد.',
      finalprep: 'سوابق تحصیلی ۶۰٪ نمرهٔ ۱۴۰۶ است؛ نمرهٔ نهایی از «حل نمونه‌سؤال با بارم‌بندی» ساخته می‌شود، نه از خواندن دوبارهٔ کتاب.',
      deadlinecheck: 'مهلت‌ها معکوس کار می‌کنند: دو روز آخرِ هر مهلت، بازیابی فشرده بازده بیشتری از یادگیری تازه دارد.',
      carry: 'کار عقب‌افتاده اگر همان هفته جبران نشود، به بدهیِ مرکب تبدیل می‌شود (اثر اهداف اجرایی/Gollwitzer).',
      carryreview: 'مرور کوتاه بعد از جبران، همان کاری است که «جبران» را از «دوباره فراموش‌شدن» جدا می‌کند.',
    }[kind] || '';
  }

  function ifThenFor(kind, startMin, subjectName, topicLabel, practiceCount) {
    const time = fmtHM(startMin);
    const base = {
      learn: 'اگر ساعت ' + time + ' شد، آنگاه گوشی را بی‌صدا می‌کنم و فقط ' + subjectName + ' — ' + topicLabel + ' را شروع می‌کنم.',
      reteach: 'اگر ساعت ' + time + ' شد، آنگاه فقط بخش‌های ضعیف ' + subjectName + ' (' + topicLabel + ') را بازآموزی می‌کنم و ۱۰ تست همان فصل می‌زنم.',
      boost: 'اگر ساعت ' + time + ' شد، آنگاه ' + (practiceCount || 15) + ' تست هدفمند از ' + subjectName + ' — ' + topicLabel + ' می‌زنم و غلط‌ها را دسته‌بندی می‌کنم.',
      cumreview: 'اگر ساعت ' + time + ' شد، آنگاه مرور تجمعی را بدون کتاب و با تست شروع می‌کنم و فقط ضعف‌ها را باز می‌کنم.',
      review: 'اگر ساعت ' + time + ' شد، آنگاه اول ۵ سؤال از ' + subjectName + ' را بدون کتاب جواب می‌دهم، بعد چک می‌کنم.',
      practice: 'اگر ساعت ' + time + ' شد، آنگاه ' + (practiceCount || 10) + ' تستِ ' + subjectName + ' را زمان‌دار می‌زنم.',
      exam: 'اگر ساعت ' + time + ' شد، آنگاه گوشی را خاموش می‌کنم و آزمون را مثل کنکور مدیریت می‌کنم.',
      mock: 'اگر ساعت ' + time + ' شد، آنگاه آزمون را در شرایط واقعی (بدون وقفه، با زمان‌سنج) می‌دهم.',
      analysis: 'اگر ساعت ' + time + ' شد، آنگاه سه غلط اصلی را در دفتر اشتباهات ثبت می‌کنم.',
      warmup: 'اگر ساعت ' + time + ' شد، آنگاه بدون باز کردن جزوه، هرچه از دیروز یادم مانده را می‌نویسم.',
      classfix: 'اگر کلاس ' + subjectName + ' تمام شد، آنگاه تا قبل از خواب ۱۵ دقیقه بی‌نگاه‌کردن به جزوه، همه‌چیز را بازگو می‌کنم.',
      finalprep: 'اگر ساعت ' + time + ' شد، آنگاه یک نوبت نمونه‌سؤال ' + subjectName + ' با زمان‌سنج می‌زنم و با بارم‌بندی تصحیح می‌کنم.',
      deadlinecheck: 'اگر ساعت ' + time + ' شد، آنگاه فقط محدودهٔ «' + topicLabel + '» را با تست بازیابی می‌کنم و ضعف‌ها را علامت می‌زنم.',
      carry: 'اگر ساعت ' + time + ' شد، آنگاه فقط کار عقب‌افتادهٔ «' + topicLabel + '» را تمام می‌کنم و چیز دیگری شروع نمی‌کنم.',
      carryreview: 'اگر ساعت ' + time + ' شد، آنگاه ۱۰ دقیقه مرور کار عقب‌افتادهٔ «' + topicLabel + '» را انجام می‌دهم.',
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

    /* صف یادگیری به‌ازای هر درس + تخصیص عادلانه بر اساس «سهم هدف منهای زمان داده‌شده».
       این کار تضمین می‌کند دروس عمومی هم مثل اختصاصی‌ها بلوک روزانه بگیرند. */
    /* ---------------- سوابق تحصیلی / امتحانات نهایی ---------------- */
    const finalTopics = cfg.finals.enabled
      ? cfg.finals.courses.map((c) => {
        const cur = c.current == null ? 12 : c.current;          // ثبت‌نشده → فرضِ میانه
        const need = Math.max(0, Math.round(
          Math.max(0, c.target - cur) * (DEFAULTS.FINALS_MIN_PER_POINT) * (c.influence / 3)));
        return {
          id: 'fin.' + c.id, finalId: c.id, subjectId: 'fin.' + c.id, subjectName: c.name,
          label: 'نمونه‌سؤال و مرور ' + c.name,
          weight: c.influence, mastery: Math.round((cur / 20) * 100),
          current: cur, target20: c.target, assumed: c.assumed,
          needMinutes: need, initialNeedMinutes: Math.max(1, need),
          plannedMinutes: 0, mode: 'finals', reviews: [], read: true, chapter: 0,
          testsNeed: 0, testsDone: 0, learnedOn: null, doneDate: null,
        };
      })
      : [];
    const finStartIdx = cfg.finals.enabled
      ? clamp(dayDiff(cfg._start, toDate(cfg.finals.windowStart)), 0, totalDays) : Infinity;
    const finEndIdx = cfg.finals.enabled
      ? clamp(dayDiff(cfg._start, toDate(cfg.finals.windowEnd)), 0, totalDays) : -1;

    /* ---------------- کارهای عقب‌افتاده (بازچینش هوشمند) ---------------- */
    const carryTopics = cfg.carryOver.map((c, i) => ({
      id: 'carry.' + i, subjectId: c.subjectId || 'CARRY', subjectName: c.subjectName,
      label: c.label, weight: 0.5, mastery: 40, needMinutes: c.minutes, initialNeedMinutes: c.minutes,
      plannedMinutes: 0, mode: c.kind === 'review' ? 'carryreview' : 'carry', read: true,
      reviews: [], testsNeed: 0, testsDone: 0, chapter: 0, learnedOn: null, doneDate: null,
      chapterId: c.chapterId || null,
      deadlineIdx: null, deadlineTitle: null, deadlineKind: null, reviewMinutes: 0,
    }));

    /* ---------------- مهلت‌ها: دو مدل ---------------- */
    const DL = { books: [], exams: [] };
    (function buildDeadlines() {
      const idxOf = (d) => clamp(dayDiff(cfg._start, toDate(d)), 0, totalDays);
      cfg.deadlines.books.forEach((b) => {
        const sub = cfg.subjects.find((x) => x.id === b.subjectId);
        if (!sub) return;
        const scope = topics.filter((t) => t.subjectId === b.subjectId &&
          (b.chaptersTo == null || t.chapter <= b.chaptersTo));
        DL.books.push({
          id: b.id, kind: 'book', title: 'پایان ' + sub.name, subjectId: sub.id, subjectName: sub.name,
          date: b.date, idx: idxOf(b.date), goal: b.goal, scope,
        });
      });
      cfg.deadlines.exams.forEach((e) => {
        const scope = e.kind === 'single'
          ? topics.filter((t) => t.subjectId === e.subjectId && t.chapter >= e.from && t.chapter <= e.to)
          : topics.slice();
        DL.exams.push({
          id: e.id, kind: e.kind, title: e.title, subjectId: e.subjectId,
          subjectName: e.subjectId ? (cfg.subjects.find((x) => x.id === e.subjectId) || {}).name || '' : 'همه دروس',
          from: e.from, to: e.to, date: e.date, idx: idxOf(e.date), scope,
        });
      });
      /* مهلت هر فصل = نزدیک‌ترین مهلتی که آن فصل را می‌پوشاند
         (آزمون جامع، مهلت تک‌فصل نیست؛ فقط جلسهٔ آماده‌سازی می‌سازد) */
      topics.forEach((t) => {
        let best = null;
        const take = (d) => { if (!best || d.idx < best.idx) best = d; };
        DL.books.forEach((d) => { if (d.scope.indexOf(t) !== -1) take(d); });
        DL.exams.forEach((d) => { if (d.kind === 'single' && d.scope.indexOf(t) !== -1) take(d); });
        if (best) { t.deadlineIdx = best.idx; t.deadlineTitle = best.title; t.deadlineKind = best.kind; }
      });
    })();

    /* فشار مهلت هر درس: چند دقیقه در روز لازم است تا مهلتش محقق شود */
    const dlPerSubject = {};
    DL.books.forEach((d) => {
      const cur = dlPerSubject[d.subjectId];
      if (!cur || d.idx < cur.idx) dlPerSubject[d.subjectId] = d;
    });
    DL.exams.filter((e) => e.kind === 'single' && e.subjectId).forEach((e) => {
      const cur = dlPerSubject[e.subjectId];
      if (!cur || e.idx < cur.idx) dlPerSubject[e.subjectId] = e;
    });

    const learnBySubject = {};
    let learnNeedTotal = 0;
    topics.filter((t) => t.needMinutes > 0).forEach((t) => {
      (learnBySubject[t.subjectId] = learnBySubject[t.subjectId] || []).push(t);
      learnNeedTotal += t.needMinutes;
    });
    Object.keys(learnBySubject).forEach((id) => {
      /* اولویت: فصل‌های دارای مهلت (نزدیک‌ترین اول) → سپس فصل‌های ضعیف و پرضریب → سپس حجم بزرگ‌تر */
      learnBySubject[id].sort((a, b) => {
        const ad = a.deadlineIdx == null ? Infinity : a.deadlineIdx;
        const bd = b.deadlineIdx == null ? Infinity : b.deadlineIdx;
        if (ad !== bd) return ad - bd;
        return (topicPriority(b) - topicPriority(a)) || (b.needMinutes - a.needMinutes);
      });
    });
    const learnSpent = {};
    const learnQueue = []; // فقط برای گزارش «مباحث باقی‌مانده»
    topics.filter((t) => t.needMinutes > 0).forEach((t) => learnQueue.push(t));

    function peekLearnNeed() {
      let total = 0;
      Object.keys(learnBySubject).forEach((id) => {
        learnBySubject[id].forEach((t) => { total += Math.max(0, t.needMinutes); });
      });
      return total;
    }

    const dueReviews = [];
    const days = [];
    const warnings = [];
    const notes = [];
    let learnedCount = 0;
    let unplacedTotal = 0;
    let yesterdayLearned = [];
    let capacityTotal = 0;
    const initialNeedTotal = sum(topics.map((t) => t.initialNeedMinutes));
    let classFixBacklog = []; // تثبیت کلاس‌هایی که همان روز جا نشدند
    let lastMissSweep = -1;

    /* فشار مهلت یک درس در یک روز: نسبت «دقیقهٔ لازم در روز» به ظرفیت واقعی */
    function deadlinePressure(id, dayIndex, dayMinutes) {
      const d = dlPerSubject[id];
      if (!d) return 0;
      const q = learnBySubject[id] || [];
      let remain = 0;
      q.forEach((t) => {
        if (t.deadlineIdx != null && t.deadlineIdx <= d.idx) remain += Math.max(0, t.needMinutes);
      });
      if (remain <= 0) return 0;
      const days = Math.max(1, d.idx - dayIndex + 1);
      const cap = Math.max(30, (dayMinutes || 240) * 0.45);
      return clamp((remain / days) / cap, 0, DEFAULTS.DEADLINE_PRESSURE_MAX);
    }

    /* ---- مرورهای اولیه: فصل‌های خوانده‌شده از امروز وارد چرخهٔ مرور می‌شوند ---- */
    (function seedInitialReviews() {
      topics.filter((t) => t.read).forEach((t, idx) => {
        /* فصل ضعیف‌تر زودتر مرور می‌شود؛ فصل مسلط دیرتر (ولی قبل از فراموشی) */
        const baseGap = t.mastery < DEFAULTS.RETEACH_BELOW ? 1 + (idx % 3)
          : t.mastery < DEFAULTS.BOOST_BELOW ? 3 + (idx % 4)
            : firstReviewGap(totalDays) + (idx % 5);
        let gap = clamp(baseGap, 1, Math.max(2, totalDays - 1));
        let cursor = addDays(cfg._start, gap);
        let prev = gap;
        for (let r = 0; r < 3; r++) {
          if (dayDiff(cfg._start, cursor) > totalDays - 1) break;
          dueReviews.push({ date: cursor, topic: t, gap: prev, minutes: t.mastery < DEFAULTS.RETEACH_BELOW ? 20 : 15 });
          prev = reviewInterval(prev, t.mastery, totalDays);
          cursor = addDays(cursor, prev);
        }
      });
    })();

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

      /* ---- روز خارج از برنامه: تعطیل کامل (سفر/بیماری) یا روز سبک ---- */
      const off = cfg.offDates.find((o) => o.date === iso);
      /* روز استراحت هفتگی بر «روز سبک» اولویت دارد: استراحت کامل، نه ۹۵ دقیقه درس */
      const isRestWeekday = cfg.restDay !== 7 && wd === cfg.restDay;
      if (off && (off.kind === 'halt' || isRestWeekday) && !isFinalExam) {
        /* مرورهای امروز به فردا منتقل می‌شوند تا از چرخه بیرون نیفتند */
        dueReviews.forEach((r) => { if (isoDay(r.date) === iso) r.date = addDays(r.date, 1); });
        days.push({
          index: dayIndex, date: iso, weekday: WEEKDAY_FA[wd], events: [],
          isMockDay: false, isExamDay: false, isRestDay: true, isDeload: false, isOff: true,
          offKind: 'halt', studyMinutes: 0, plannedMinutes: 0, blocks: [],
          note: 'خارج از برنامه — تعطیل کامل' + (off.note ? ' (' + off.note + ')' : ''),
        });
        continue;
      }
      const lightFactor = off && off.kind === 'light' ? (cfg.LIGHT_DAY_RATIO || DEFAULTS.LIGHT_DAY_RATIO) : 1;

      const busy = busyEventsFor(cfg, date, dayIndex);
      const segments = freeSegments(cfg, date, busy);

      const dNext = daysToNextExam(date);
      const preExam = {
        level: isFinalExam ? 0 : dNext === null ? 0 : dNext === 0 ? 0 : dNext === 1 ? 2 : dNext <= (cfg.PRE_EXAM_DAYS || DEFAULTS.PRE_EXAM_DAYS) ? 1 : 0,
        days: dNext,
        exam: dNext !== null ? cfg.exams.find((e) => dayDiff(date, toDate(e.date)) === dNext) : null,
      };
      const reviewOnly = preExam.level >= 1;
      /* بازهٔ امتحانات نهایی (سوابق تحصیلی) */
      const inFinals = cfg.finals.enabled && dayIndex >= finStartIdx && dayIndex <= finEndIdx;
      const finalPhase = daysLeft <= (cfg.FINAL_PHASE_DAYS || DEFAULTS.FINAL_PHASE_DAYS);
      const hardFinal = daysLeft <= (cfg.FINAL_NO_RETEACH_DAYS || DEFAULTS.FINAL_NO_RETEACH_DAYS);
      /* در فاز جمع‌بندی فقط وقتی یادگیری تعطیل می‌شود که چیزی باقی نمانده باشد؛
         اگر مبحث نخوانده مانده، با نصف بودجه ادامه می‌دهیم تا از کنکور عقب نمانیم. */
      const learnBacklog = peekLearnNeed();
      /* سهم یادگیری از روز، خودتنظیم است: هرچه عقب‌ماندگی بیشتر، سهم یادگیری بالاتر
         (و مرور/تمرین جای کمتری می‌گیرند) تا برنامه واقعاً بسته شود. */
      const backlogRatio = (function () {
        /* ظرفیت تقریبی باقی‌مانده: ساعت اعلامی روز × روزهای مانده */
        const todayLoad = sum(segments.map((x) => x.end - x.start));
        const capLeft = Math.max(1, todayLoad * Math.max(1, daysLeft));
        return clamp(learnBacklog / capLeft, 0, 1.5);
      })();
      const learnBudgetRatio = reviewOnly || isFinalExam ? 0
        : inFinals ? (learnBacklog > 0 ? 0.2 : 0)
          : finalPhase ? (learnBacklog > 0 ? 0.5 : 0) : (backlogRatio > 0.55 ? 0.93 : 0.85);
      const noNewLearning = learnBudgetRatio === 0;
      const scope = preExam.exam && preExam.exam.subjectIds.length ? new Set(preExam.exam.subjectIds) : null;

      const freeMinutes = sum(segments.map((s) => s.end - s.start));
      const baseLoad = isFinalExam ? { minutes: 30, isDeload: false } : dayLoad(cfg, date, dayIndex, totalDays, freeMinutes, preExam);
      const load = lightFactor === 1 ? baseLoad
        : { minutes: Math.max(20, Math.round(baseLoad.minutes * lightFactor)), isDeload: baseLoad.isDeload };
      /* ظرفیت = ساعت اعلامی خودِ دانش‌آموز (نه کل زمان بیداری) — مبنای «چقدر از وقتِ تعهدشده پر شد» */
      capacityTotal += load.minutes;
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
          practiceCount: Math.round((b.end - b.start) * 0.7),
          fixed: { start: b.start, end: b.end }, // رویداد ثابت — نباید جابه‌جا شود
        });
      });

      /* ---- ۱) مرورهای سررسید (با سقفِ سهم روز) ---- */
      /* وقتی هنوز مبحث نخوانده زیاد است، مرور نباید بیشتر از یک‌سومِ روز را بگیرد؛
         وگرنه برنامه «همیشه در حال مرور» می‌ماند و پیشرفت واقعی متوقف می‌شود. */
      let reviewUsed = 0;
      const reviewCap = load.minutes * (learnBacklog > 60 ? 0.32 : 0.5);
      dueReviews
        .filter((r) => dayDiff(cfg._start, r.date) === dayIndex)
        .sort((a, b) => a.topic.mastery - b.topic.mastery)
        .forEach((r) => {
          if (scope && !scope.has(r.topic.subjectId)) return;
          if (reviewUsed >= reviewCap) return;
          reviewUsed += r.minutes;
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
          .slice(0, learnBacklog > 60 ? 1 : 2);
        pick.forEach((t) => {
          tasks.push({
            kind: 'warmup', subjectId: t.subjectId, subjectName: t.subjectName,
            topicLabel: t.label, topic: t, minutesLeft: Math.min(cfg.NEXT_DAY_REVIEW_MIN, 15), priority: 350,
          });
        });
      }

      /* ---- ۳.۵) کارهای عقب‌افتاده: بازچینش هوشمند در اولین فرصت ---- */
      /* روز تعطیل/استراحت مقدس است؛ جبران فقط در روزهای درسی چیده می‌شود.
         سهم جبران هم سقف دارد (۳۰٪ روز): اگر ۲۰۰ ساعت عقب‌افتادگی همهٔ ظرفیت را بگیرد،
         هیچ مبحث تازه‌ای خوانده نمی‌شود و پوشش برنامه فرو می‌ریزد. */
      const restDayNow = load.minutes <= 0;
      const carryCapMinutes = Math.round(load.minutes * 0.3);
      let carryPlanned = 0;
      carryTopics.forEach((ct) => {
        if (ct.needMinutes <= 0 || restDayNow) return;
        if (carryPlanned >= carryCapMinutes) return;
        const per = Math.min(cfg.blockMinutes, ct.needMinutes, Math.max(15, carryCapMinutes - carryPlanned));
        carryPlanned += per;
        tasks.push({
          kind: ct.mode === 'carryreview' ? 'carryreview' : 'carry',
          subjectId: ct.subjectId, subjectName: ct.subjectName, topicLabel: ct.label, topic: ct,
          minutesLeft: per, priority: 495,   // کار عقب‌افتاده، بالاترین اولویت روز
        });
        /* کاهش نیاز فقط پس از «چیده‌شدن» انجام می‌شود (در حلقهٔ ثبت زمان) —
           وگرنه کارِ جا نشده بی‌صدا از بین می‌رود. */
      });

      /* ---- ۴) آزمون جامع هفتگی (اگر کاربر آزمون دستی نداده) ---- */
      const hasManualExamToday = busy.some((b) => b.type === 'exam');
      const isMockDay = cfg.weeklyMock && cfg.exams.length === 0 && !isFinalExam &&
        wd === cfg.WEEKLY_MOCK_DAY && dayIndex > 5 && daysLeft > 3;
      if (isMockDay && !hasManualExamToday) {
        tasks.push({
          kind: 'mock', subjectId: 'MOCK', subjectName: 'آزمون جامع هفتگی', topicLabel: 'همه دروس',
          minutesLeft: Math.min(cfg.WEEKLY_MOCK_MIN, Math.max(60, load.minutes * 0.6)), priority: 480,
          practiceCount: Math.round(Math.min(cfg.WEEKLY_MOCK_MIN, Math.max(60, load.minutes * 0.6)) * 0.8),
        });
        tasks.push({
          kind: 'analysis', subjectId: 'MOCK', subjectName: 'تحلیل آزمون', topicLabel: 'دفتر اشتباهات',
          minutesLeft: Math.min(cfg.MOCK_ANALYSIS_MIN, Math.max(20, load.minutes * 0.3)), priority: 470,
        });
      }

      /* ---- ۴.۵) مرور تجمعی هفتگی (ضد فراموشی تا روز کنکور) ---- */
      const cumEvery = cfg.CUM_REVIEW_EVERY || DEFAULTS.CUM_REVIEW_EVERY;
      const cumDay = dayIndex > 3 && dayIndex % cumEvery === Math.floor(cumEvery / 2) && !isFinalExam && !reviewOnly;
      if (cumDay) {
        const weakPool = topics
          .filter((t) => t.read && (!scope || scope.has(t.subjectId)))
          .sort((a, b) => (a.mastery * a.weight) - (b.mastery * b.weight))
          .slice(0, 3);
        const labels = weakPool.map((t) => t.subjectName + ' — ' + t.label);
        tasks.push({
          kind: 'cumreview', subjectId: 'CUM', subjectName: 'مرور تجمعی هفته',
          topicLabel: labels.length ? labels.join(' / ') : 'فصل‌های خوانده‌شدهٔ قبلی',
          minutesLeft: Math.min(cfg.CUM_REVIEW_MIN || DEFAULTS.CUM_REVIEW_MIN,
            Math.max(20, Math.round(load.minutes * (learnBacklog > 60 ? 0.12 : 0.25)))),
          priority: 340,
        });
      }

      /* ---- ۴.۶) مهلت‌ها: بلوک آماده‌سازی نزدیک سررسید (هر دو مدل) ---- */
      if (!isFinalExam && !reviewOnly) {
        const near = DL.exams.concat(DL.books)
          .filter((d) => d.idx - dayIndex >= 0 && d.idx - dayIndex <= (cfg.EXAM_PREP_DAYS || DEFAULTS.EXAM_PREP_DAYS))
          .sort((a, b) => a.idx - b.idx);
        near.forEach((d) => {
          const inScope = d.scope.filter((t) => !scope || scope.has(t.subjectId));
          const byWeak = (a, b) => (b.weight * (100 - b.mastery)) - (a.weight * (100 - a.mastery));
          let weak;
          if (d.kind === 'comprehensive') {
            /* آزمون جامع: از هر درسِ ضعیف یک فصل — نه دو فصل از یک درس */
            const subjWeak = {};
            inScope.forEach((t) => {
              const cur = subjWeak[t.subjectId];
              const score = t.weight * (100 - t.mastery);
              if (!cur || score > cur.score) subjWeak[t.subjectId] = { score, topic: t };
            });
            weak = Object.keys(subjWeak).map((k) => subjWeak[k])
              .sort((a, b) => b.score - a.score).slice(0, 3).map((x) => x.topic);
          } else {
            weak = inScope.slice().sort(byWeak).slice(0, 2);
          }
          weak.forEach((w) => {
            const minutes = Math.min(cfg.blockMinutes, d.idx === dayIndex ? 40 : 30);
            tasks.push({
              kind: 'deadlinecheck', subjectId: w.subjectId, subjectName: w.subjectName,
              topicLabel: 'آماده‌سازی «' + d.title + '» — ' + w.label, topic: w,
              minutesLeft: minutes, priority: 360,
            });
          });
        });
      }

      /* ---- ۴.۷) جلسهٔ هفتگی سوابق تحصیلی (پخش در کل سال) ---- */
      if (cfg.finals.enabled && !isFinalExam && cfg.finals.spread && finalTopics.length && !reviewOnly) {
        const isSpreadDay = (wd + 1) === cfg.finals.spreadDay;
        if (isSpreadDay && load.minutes >= cfg.finals.spreadMinutes + 30) {
          const rel = (t) => (t.needMinutes / Math.max(1, t.initialNeedMinutes)) * t.weight;
          const ft = finalTopics.filter((t) => t.needMinutes > 0)
            .sort((a, b) => (rel(b) - rel(a)) || ((a.lastServe || -1) - (b.lastServe || -1)))[0];
          if (ft) {
            ft.lastServe = dayIndex;
            tasks.push({
              kind: 'finalprep', subjectId: ft.subjectId, subjectName: ft.subjectName,
              topicLabel: 'سوابق تحصیلی — ' + ft.subjectName, topic: ft,
              minutesLeft: cfg.finals.spreadMinutes, priority: 355,
              practiceCount: Math.round(cfg.finals.spreadMinutes / 5),
            });
          }
        }
      }

      /* ---- ۴.۸) بازهٔ امتحانات نهایی: بخش اصلی روز برای سوابق ---- */
      if (inFinals && !isFinalExam && finalTopics.length) {
        const finBudget = load.minutes * 0.72;
        let usedFin = 0;
        const capPerCourse = Math.max(cfg.blockMinutes, finBudget * 0.55);
        finalTopics.filter((t) => t.needMinutes > 0)
          .sort((a, b) => (b.needMinutes - a.needMinutes) || (b.weight - a.weight))
          .forEach((ft) => {
            if (usedFin >= finBudget) return;
            const chunk = Math.min(cfg.blockMinutes * 2, ft.needMinutes, finBudget - usedFin, capPerCourse);
            if (chunk < 15) return;
            tasks.push({
              kind: 'finalprep', subjectId: ft.subjectId, subjectName: ft.subjectName,
              topicLabel: 'سوابق تحصیلی — ' + ft.subjectName, topic: ft,
              minutesLeft: chunk, priority: 380, practiceCount: Math.round(chunk / 3),
            });
            usedFin += chunk;
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
      /* فصل‌هایی که مهلتشان گذشته: به ابتدای صف برمی‌گردند (بازیابی مهلت) */
      if (dayIndex !== lastMissSweep) {
        lastMissSweep = dayIndex;
        Object.keys(learnBySubject).forEach((id) => {
          const q = learnBySubject[id];
          const missed = q.filter((t) => t.deadlineIdx != null && dayIndex > t.deadlineIdx && t.needMinutes > 0);
          if (!missed.length) return;
          missed.forEach((t) => { t.deadlineMissed = true; });
          learnBySubject[id] = missed.concat(q.filter((t) => missed.indexOf(t) === -1));
        });
      }
      const scheduleReviews = (topic, fromDate) => {
        const sub = cfg.subjects.find((s) => s.id === topic.subjectId);
        let gap = firstReviewGap(daysLeft);
        let cursorDate = addDays(fromDate, gap);
        /* تعداد مرورها طوری انتخاب می‌شود که مبحث تا نزدیک کنکور در چرخه بماند */
        const maxReviews = Math.max(
          cfg.MAX_REVIEWS_PER_TOPIC || DEFAULTS.MAX_REVIEWS_PER_TOPIC,
          Math.min(12, Math.ceil(Math.max(1, daysLeft) / 18))
        );
        for (let r = 0; r < maxReviews; r++) {
          if (dayDiff(cfg._start, cursorDate) > totalDays - 1) break;
          dueReviews.push({ date: cursorDate, topic, gap, minutes: sub && sub.type === 'problem' ? 20 : 15 });
          gap = reviewInterval(gap, null, daysLeft);
          cursorDate = addDays(cursorDate, gap);
        }
        /* مرور نگهدارنده: تا نزدیک کنکور هر ۳۰ روز یک بازیابی کوتاه (ضد فراموشی) */
        let guard3 = 0;
        while (dayDiff(cfg._start, cursorDate) <= totalDays - 8 && guard3++ < 20) {
          dueReviews.push({ date: cursorDate, topic, gap: 30, minutes: 10, maintenance: true });
          cursorDate = addDays(cursorDate, 30);
        }
      };

      const addLearnChunks = (budget) => {
        const perSubjectCap = Math.max(cfg.blockMinutes, Math.round(load.minutes * (daysLeft <= 7 ? 0.3 : 0.5)));
        let used = 0;
        let guard = 0;
        while (used < budget && guard++ < 40) {
          // درس را بر اساس کمترین نسبت «زمان داده‌شده ÷ سهم هدف» انتخاب کن
          let chosenId = null;
          let chosenDeficit = -Infinity;
          Object.keys(learnBySubject).forEach((id) => {
            const q = learnBySubject[id].filter((t) => !scope || scope.has(t.subjectId));
            if (!q.length) return;
            const take = Math.min(cfg.blockMinutes, q[0].needMinutes);
            const capBoost = 1 + 0.6 * Math.min(1, deadlinePressure(id, dayIndex, load.minutes));
            if ((subjectUsedToday[id] || 0) + take > perSubjectCap * capBoost) return;
            /* فشار مهلت: درسی که باید تا تاریخ مشخصی تمام شود، سهم بیشتری می‌گیرد */
            const pressure = deadlinePressure(id, dayIndex, load.minutes);
            const target = Math.max(1, (stats[id] ? stats[id].share : 0) * learnNeedTotal * (1 + 1.8 * pressure));
            const ratio = (learnSpent[id] || 0) / target;
            if (-ratio > chosenDeficit) { chosenDeficit = -ratio; chosenId = id; }
          });
          if (!chosenId) break;
          const topic = learnBySubject[chosenId][0];

          /* باقی‌ماندهٔ ناچیز (<۱۰ دقیقه): مبحث را بسته و بلوک کوچک نساز.
             این کار جلوی «قفل‌شدن» صف یادگیری توسط یک مبحث نیمه‌تمام را می‌گیرد. */
          if (topic.needMinutes < 10) {
            learnBySubject[chosenId].shift();
            topic.needMinutes = 0;
            topic.learnedOn = date;
            learnedCount++;
            const li0 = learnQueue.indexOf(topic);
            if (li0 !== -1) learnQueue.splice(li0, 1);
            scheduleReviews(topic, date);
            continue;
          }

          const chunk = Math.min(cfg.blockMinutes, topic.needMinutes, budget - used);
          if (chunk < 10) break;
          tasks.push({
            kind: topic.mode === 'reteach' ? 'reteach' : topic.mode === 'boost' ? 'boost' : 'learn',
            subjectId: topic.subjectId, subjectName: topic.subjectName,
            topicLabel: topic.label, topic, minutesLeft: chunk,
            priority: topic.mode === 'reteach' ? 290 : topic.mode === 'boost' ? 270 : 250,
            practiceCount: topic.mode === 'boost' ? Math.max(10, roundTo5(chunk / 3)) : null,
          });
          used += chunk;
          subjectUsedToday[topic.subjectId] = (subjectUsedToday[topic.subjectId] || 0) + chunk;
          learnSpent[topic.subjectId] = (learnSpent[topic.subjectId] || 0) + chunk;
          topic.needMinutes -= chunk;
          if (topic.needMinutes <= 0) {
            learnBySubject[chosenId].shift();
            const lq = learnQueue.indexOf(topic);
            if (lq !== -1) learnQueue.splice(lq, 1);
            topic.learnedOn = date;
            learnedCount++;
            scheduleReviews(topic, date);
          }
        }
        return used;
      };

      /* سهم تست از روز از قبل کنار گذاشته می‌شود؛ وگرنه یادگیری همهٔ وقت را می‌گیرد
         و هدف تست (نورم ~۵۰ تست در ۴ ساعت) هیچ‌وقت محقق نمی‌شود. */
      /* در برنامهٔ تنگ (عقب‌ماندگی زیاد) سهم تست نصف می‌شود تا پوشش فصل‌ها قربانی نشود */
      const testReserve = (isFinalExam || !cfg.testTarget.daily) ? 0
        : Math.round(load.minutes * (inFinals ? 0.3 : finalPhase ? 0.26 : 0.24) *
          (backlogRatio > 0.7 ? 0.5 : 1));
      if (!isFinalExam && !noNewLearning) {
        addLearnChunks(Math.max(45, load.minutes * learnBudgetRatio - testReserve));
        yesterdayLearned = tasks
          .filter((t) => t.kind === 'learn' || t.kind === 'reteach' || t.kind === 'boost')
          .map((t) => t.topic);
      } else {
        yesterdayLearned = [];
      }

      /* ---- ۷) پر کردن ظرفیت باقی‌مانده با تمرین درهم ---- */
      const plannedSoFar = sum(tasks.map((t) => t.minutesLeft));
      let spare = load.minutes - plannedSoFar;
      /* تا وقتی مبحث نخوانده جدی مانده، تمرین فقط تا سقفِ سهمِ تست اضافه می‌شود؛
         وقتی یادگیری جلو افتاد، ظرفیت آزاد با تمرین پر می‌شود (روزهای پشت‌کنکوری). */
      const learnHeavy = peekLearnNeed() > load.minutes * Math.max(1, daysLeft) * 0.2;
      if (learnHeavy) spare = Math.min(spare, Math.max(testReserve + 20, 0));
      let practiceUsed = 0;
      if (spare >= 20 && !isFinalExam) {
        const ordered = cfg.subjects
          .filter((s) => !scope || scope.has(s.id))
          .slice()
          .sort((a, b) => (b.weight * (1 - b.mastery / 100)) - (a.weight * (1 - a.mastery / 100)));
        const todaySubjects = new Set(tasks.map((t) => t.subjectId));
        const weakestOf = (sid) => topics
          .filter((t) => t.subjectId === sid && t.read)
          .sort((a, b) => a.mastery - b.mastery)[0] || topics
          .filter((t) => t.subjectId === sid)
          .sort((a, b) => topicPriority(b) - topicPriority(a))[0];
        let i = 0;
        const targetToday = Math.round((cfg.testTarget.daily || 0) * clamp(load.minutes / 240, 0.4, 1.4));
        const testsNow = () => sum(tasks.map((t) => t.practiceCount || 0));
        const maxPracticeBlocks = learnHeavy ? 5 : 12;   // در روزهای آزاد، ظرفیت با تمرین پر می‌شود
        while (spare >= 20 && i < maxPracticeBlocks && ordered.length) {
          /* به‌محض رسیدن به هدف تست روز، پر کردن متوقف می‌شود تا وقت یادگیری بماند */
          if (cfg.testTarget.daily > 0 && testsNow() >= targetToday) break;
          if (practiceUsed >= spare + 15) break;
          const s = ordered[i % ordered.length];
          const w = weakestOf(s.id);
          const minutes = Math.min(cfg.blockMinutes, roundTo5(spare));
          tasks.push({
            kind: 'practice', subjectId: s.id, subjectName: s.name,
            topicLabel: w
              ? w.label + (todaySubjects.has(s.id) ? ' — تست هدفمند' : ' — تست هدفمند (فصل ضعیف)')
              : 'تست‌زنی زمان‌دار',
            minutesLeft: minutes, priority: 60, topic: w || null, practiceCount: Math.max(5, Math.round(minutes / (s.type === 'problem' ? 3.5 : 1.6))),
          });
          spare -= minutes;
          practiceUsed += minutes;
          i++;
        }
      }

      /* ---- ۷.۵) سقف روز: مجموع تسک‌ها از ساعت اعلامیِ خودِ دانش‌آموز بیشتر نشود ---- */
      (function trimToDailyLoad() {
        const movableTasks = tasks.filter((t) => !t.fixed);
        let total = sum(movableTasks.map((t) => t.minutesLeft || 0));
        if (total <= load.minutes) return;
        let excess = total - load.minutes;
        movableTasks
          .slice()
          /* ابتدا مرور/آماده‌سازی کوتاه می‌شود؛ «تست روزانه» آخرین چیزی است که قربانی می‌شود */
          .sort((a, b) => {
            const pa = a.kind === 'practice' ? 1 : 0;
            const pb = b.kind === 'practice' ? 1 : 0;
            if (pa !== pb) return pa - pb;
            return (a.priority || 0) - (b.priority || 0);
          })
          .forEach((t) => {
            if (excess <= 0) return;
            const cut = Math.min(t.minutesLeft || 0, excess);
            t.minutesLeft = (t.minutesLeft || 0) - cut;
            excess -= cut;
            if (t.minutesLeft <= 0) {
              const i = tasks.indexOf(t);
              if (i !== -1) tasks.splice(i, 1);
            }
          });
      })();

      /* ---- ۷.۶) باقی ظرفیتِ روز به یادگیری برگردد (اگر مبحثی مانده) ---- */
      if (!isFinalExam && !noNewLearning && peekLearnNeed() > 0) {
        const usedSoFar = sum(tasks.map((t) => t.minutesLeft || 0));
        const rest = load.minutes - usedSoFar;
        if (rest >= 25) addLearnChunks(rest);
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
          topicId: (t.topic && (t.topic.chapterId || t.topic.id)) ? (t.topic.chapterId || t.topic.id) : (b.topicId || null),
          content: contentFor(t, b), technique: techniqueFor(t.kind), retrievalTail: tail,
          practiceCount: b.practiceCount || 0,
          ifThen: ifThenFor(t.kind, b.start, b.subjectName, b.topicLabel, b.practiceCount),
          why: whyFor(t.kind),
          fixed: Boolean(b.fixed),
        };
      });

      /* ثبت زمان واقعیِ هر فصل — مبنای گزارش «چه فصلی چقدر وقت گرفت» */
      movable.forEach((t) => {
        if (!t.topic) return;
        const placedB = placed.blocks.filter((b) => b.task === t);
        const usedMin = sum(placedB.map((b) => b.minutes));
        if (!usedMin) return;
        const tp = t.topic;
        if (t.kind === 'review' || t.kind === 'cumreview' || t.kind === 'warmup' ||
            t.kind === 'deadlinecheck' || t.kind === 'carryreview') {
          /* مرور، زمان «یادگیری» نیست و نباید پوشش فصل را باد کند */
          tp.reviewMinutes = (tp.reviewMinutes || 0) + usedMin;
        } else if (t.kind === 'finalprep') {
          tp.plannedMinutes += usedMin;
          tp.needMinutes = Math.max(0, tp.needMinutes - usedMin);
        } else {
          tp.plannedMinutes += usedMin;
        }
        if (t.practiceCount) {
          const tests = sum(placedB.map((b) => b.practiceCount || 0));
          if (tests && tp.testsNeed) {
            tp.testsDone = Math.min(tp.testsNeed, (tp.testsDone || 0) + tests);
          }
        }
        /* تاریخ اتمام = روزی که زمانِ یادگیریِ چیده‌شده به نیاز واقعی رسید
           (نه اولین بلوکی که بعد از اتمام روی همین فصل افتاده باشد) */
        const doneNow = (tp.initialNeedMinutes || 0) > 0
          ? tp.plannedMinutes >= (tp.initialNeedMinutes - 1)
          : true;
        if (doneNow && !tp.doneDate) tp.doneDate = iso;
        if (t.kind === 'carry' || t.kind === 'carryreview') {
          tp.needMinutes = Math.max(0, tp.needMinutes - usedMin);
        }
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
        note: dayNote({ isFinalExam, hasManualExamToday, hasClassToday, preExam, reviewOnly, finalPhase, isDeload: load.isDeload, chronotype: cfg.student.chronotype, hasBlocks: outBlocks.length > 0 }),
      });

      // ثبت تثبیت‌های جا نشده برای روز بعد
      movable.filter((t) => t.kind === 'classfix' && t.minutesLeft > 0).forEach((t) => {
        classFixBacklog.push({ kind: 'classfix', subjectId: t.subjectId, subjectName: t.subjectName, topicLabel: t.topicLabel + ' (ادامه)' });
      });
    }

    /* ---- جمع‌بندی ---- */
    if (learnQueue.length) {
      const missing = Math.max(0, Math.round(peekLearnNeed()));
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

    /* ---- آمادگی و پوشش فصل‌به‌فصل ---- */
    const weightAll = sum(topics.map((t) => t.weight)) || 1;
    const readiness = Math.round(sum(topics.map((t) => t.mastery * t.weight)) / weightAll);
    const projectedReadiness = Math.round(sum(topics.map((t) => {
      if (t.mode === 'solid') return t.mastery * t.weight;
      const ratio = t.initialNeedMinutes > 0 ? clamp(t.plannedMinutes / t.initialNeedMinutes, 0, 1.15) : 0;
      const goal = t.mode === 'learn' ? 88 : 92;
      return clamp(t.mastery + (goal - t.mastery) * Math.min(1, ratio), 0, 100) * t.weight;
    })) / weightAll);

    const nextReviewOf = (t) => {
      const list = dueReviews.filter((r) => r.topic === t)
        .map((r) => isoDay(r.date)).filter((d) => d >= cfg.startDate).sort();
      return list.length ? list[0] : null;
    };
    const STAT_FA = {
      solid: 'تسلط کامل — فقط مرور',
      covered: 'خوانده و تثبیت‌شده',
      partial: 'نیمه‌کاره — ادامه لازم است',
      open: 'هنوز خوانده نشده',
      weak: 'نیازمند جبران',
    };
    const chapterStats = topics.map((t) => {
      const need = Math.round(t.initialNeedMinutes || 0);
      const planned = Math.round(t.plannedMinutes || 0);
      const remaining = Math.round(Math.max(0, t.needMinutes || 0));
      const learnRatio = need > 0 ? clamp(planned / need, 0, 1) : 1;
      const testRatio = t.testsNeed > 0 ? clamp((t.testsDone || 0) / t.testsNeed, 0, 1) : 0;
      const progress = t.mode === 'solid' ? 100
        : Math.round(clamp(learnRatio * 0.82 + testRatio * 0.18, 0, 1) * 100);
      const covered = t.mode === 'solid' ? true
        : (planned >= need * 0.85) || (learnRatio >= 0.7 && testRatio >= 0.45);
      const status = t.mode === 'solid' ? STAT_FA.solid
        : covered ? STAT_FA.covered
          : planned === 0 ? (t.mode === 'reteach' || t.mode === 'boost' ? STAT_FA.weak : STAT_FA.open)
            : STAT_FA.partial;
      return {
        id: t.id, subjectId: t.subjectId, subjectName: t.subjectName, chapter: t.chapter,
        label: t.label, mode: t.mode, read: t.read, mastery: t.mastery,
        target: DEFAULTS.BOOST_BELOW, mastered: t.mastery >= DEFAULTS.BOOST_BELOW,
        needMinutes: need, plannedMinutes: Math.min(planned, need || planned),
        reviewMinutes: Math.round(t.reviewMinutes || 0),
        remainingMinutes: remaining,
        testsNeed: t.testsNeed, testsDone: t.testsDone || 0,
        learnedOn: t.learnedOn || null, completedOn: t.doneDate || null, nextReview: nextReviewOf(t),
        reviews: dueReviews.filter((r) => r.topic === t).length,
        progress, covered, status, general: Boolean(t.general),
        deadlineIdx: t.deadlineIdx, deadlineTitle: t.deadlineTitle, deadlineMissed: Boolean(t.deadlineMissed),
      };
    });
    const coveredCount = chapterStats.filter((c) => c.covered).length;
    /* «پوشش فصل‌ها» = فصل‌های اختصاصی (همان چیزی که در کنکور ضریب دارد).
       دروس عمومی جدا شمرده می‌شوند چون از مسیر سوابق تحصیلی مدیریت می‌شوند. */
    const coreChapters = chapterStats.filter((c) => !c.general);
    const coreCovered = coreChapters.filter((c) => c.covered).length;
    const coverageRatio = Math.round((coreCovered / Math.max(1, coreChapters.length)) * 100);
    const coverageRatioAll = Math.round((coveredCount / Math.max(1, chapterStats.length)) * 100);
    const testsPlanned = days.reduce((a, d) => a + sum(d.blocks.map((b) => b.practiceCount || 0)), 0);
    const activeDays = days.filter((d) => !d.isRestDay && !d.isOff).length || 1;
    const testsPerDay = Math.round((testsPlanned / activeDays) * 10) / 10;
    const targetDaily = (cfg.testTarget && cfg.testTarget.daily) || 0;
    /* هدف تست هر روز متناسب با حجم همان روز سنجیده می‌شود (روز ۳ ساعته = هدف کمتر) */
    const dayTestTarget = (d) => targetDaily * clamp((d.plannedMinutes || 0) / 240, 0.5, 1.3);
    const testTargetMetRatio = targetDaily > 0
      ? Math.round((days.filter((d) => !d.isOff &&
        sum(d.blocks.map((b) => b.practiceCount || 0)) >= dayTestTarget(d) * 0.72).length / activeDays) * 100) / 100
      : 1;

    const unread = topics.filter((t) => t.mode === 'learn');
    const reteachList = topics.filter((t) => t.mode === 'reteach').sort((a, b) => topicPriority(b) - topicPriority(a));
    const boostList = topics.filter((t) => t.mode === 'boost').sort((a, b) => topicPriority(b) - topicPriority(a));
    const remainingNeed = Math.round(sum(topics.map((t) => Math.max(0, t.needMinutes))));
    const spareCapacity = Math.max(0, Math.round(capacityTotal - totalStudy));
    const willCover = remainingNeed <= spareCapacity;
    const weakChapters = chapterStats
      .filter((c) => c.read && c.mastery < DEFAULTS.BOOST_BELOW)
      .sort((a, b) => {
        const wa = (cfg.subjects.find((x) => x.id === a.subjectId) || { weight: 1 }).weight;
        const wb = (cfg.subjects.find((x) => x.id === b.subjectId) || { weight: 1 }).weight;
        return (a.mastery * wa) - (b.mastery * wb);
      })
      .slice(0, 12);

    const reviewDays = days.filter((d) => d.blocks.some((b) => b.kind === 'review' || b.kind === 'cumreview'));
    const lastReviewDay = reviewDays.length ? reviewDays[reviewDays.length - 1].date : null;
    const finalPhaseDays = days.filter((d) => d.note && d.note.indexOf('فاز جمع‌بندی') === 0).length;

    /* ---------------- سوابق تحصیلی: جمع‌بندی ---------------- */
    const finWeightAll = sum(finalTopics.map((t) => t.weight)) || 1;
    const finalsReadiness = finalTopics.length
      ? Math.round(sum(finalTopics.map((t) => t.mastery * t.weight)) / finWeightAll) : 0;
    const finalsCourses = finalTopics.map((t) => ({
      id: t.finalId, name: t.subjectName, influence: t.weight, assumed: Boolean(t.assumed),
      current: Math.round((t.mastery / 100) * 20 * 10) / 10,
      target: t.target20,
      readiness: t.mastery,
      needMinutes: Math.round(t.initialNeedMinutes),
      plannedMinutes: Math.round(t.plannedMinutes),
      remainingMinutes: Math.round(Math.max(0, t.needMinutes)),
      progress: t.initialNeedMinutes > 0
        ? Math.min(100, Math.round((t.plannedMinutes / t.initialNeedMinutes) * 100)) : 100,
      projected: Math.round(clamp(t.mastery + (Math.round((t.target20 / 20) * 100) - t.mastery) *
        (t.initialNeedMinutes > 0 ? Math.min(1, t.plannedMinutes / t.initialNeedMinutes) : 0), 0, 100)),
    }));
    const budgetRatio = finalsCourses.length
      ? sum(finalsCourses.map((c) => c.plannedMinutes / Math.max(1, c.needMinutes))) / finalsCourses.length : 0;
    const finalsProjectedScore = finalsCourses.length
      ? Math.round(sum(finalsCourses.map((c) => (c.projected / 100) * 20 * c.influence)) /
        (sum(finalsCourses.map((c) => c.influence)) || 1) * 10) / 10 : 0;

    /* ---------------- مهلت‌ها: ارزیابی تحقق ---------------- */
    const totalWorkDays = Math.max(1, days.filter((d) => !d.isOff).length);
    function summarizeDeadline(d, model) {
      const scope = d.scope && d.scope.length ? d.scope : topics;
      const need = Math.round(sum(scope.map((t) => t.initialNeedMinutes || 0)));
      const planned = Math.round(sum(scope.map((t) => t.plannedMinutes || 0)));
      const remaining = Math.round(sum(scope.map((t) => Math.max(0, t.needMinutes || 0))));
      const doneChapters = scope.filter((t) => (t.needMinutes || 0) <= 0).length;
      const doneDates = scope.map((t) => t.doneDate).filter(Boolean).sort();
      const finishDate = (remaining === 0 && doneDates.length) ? doneDates[doneDates.length - 1] : null;
      /* سرعت واقعی برنامه برای همین محدوده: زمان چیده‌شده ÷ روزهای کاری */
      const pace = planned / totalWorkDays;
      const projectedDate = remaining === 0
        ? finishDate
        : (pace > 0 ? isoDay(addDays(cfg._start, Math.min(totalDays + 400, Math.round(planned / pace + remaining / pace)))) : null);
      const onTime = remaining === 0
        ? (!finishDate || finishDate <= d.date)
        : Boolean(projectedDate && projectedDate <= d.date);
      const status = remaining === 0
        ? (onTime ? 'met' : 'late-done')
        : (onTime ? 'ontrack' : 'late');
      const daysToDeadline = dayDiff(cfg._start, toDate(d.date));
      const needPerDay = daysToDeadline > 0 ? Math.round(remaining / Math.max(1, daysToDeadline)) : remaining;
      return {
        id: d.id, model, kind: d.kind, title: d.title, date: d.date,
        subjectId: d.subjectId || null, subjectName: d.subjectName || 'همه دروس',
        from: d.from || null, to: d.to || null,
        chapters: scope.length, doneChapters,
        needMinutes: need, plannedMinutes: planned, remainingMinutes: remaining,
        finishDate, projectedDate, daysToDeadline, needPerDay,
        status,
      };
    }
    const deadlineReport = DL.books.map((d) => summarizeDeadline(d, 'book'))
      .concat(DL.exams.map((d) => summarizeDeadline(d, 'exam')))
      .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));

    deadlineReport.forEach((d) => {
      if (d.status === 'late' || d.status === 'late-done') {
        warnings.push('مهلت «' + d.title + '» (' + jDate(d.date) + ') با ساعت‌های فعلی ' +
          (d.status === 'late-done' ? 'با تأخیر تمام می‌شود.' :
            'محقق نمی‌شود: ' + Math.round(d.remainingMinutes / 60) + ' ساعت کار مانده و روزی ' +
            d.needPerDay + ' دقیقه لازم است.'));
      }
    });

    const coverage = {
      totalChapters: topics.length,
      coveredChapters: coveredCount,
      coverageRatio,
      coverageRatioAll,
      coreChapters: coreChapters.length,
      coreCovered,
      testsPlanned,
      testsPerDay,
      testTargetDaily: targetDaily,
      testTargetMetRatio,
      finalsCount: finalTopics.length,
      finalsReadiness,
      finalsProjectedScore,
      finalsShare: DEFAULTS.FINALS_SHARE,
      konkurShare: 1 - DEFAULTS.FINALS_SHARE,
      composite: Math.round(projectedReadiness * (1 - DEFAULTS.FINALS_SHARE) + finalsReadiness * DEFAULTS.FINALS_SHARE),
      finalsCourses,
      finalsBudgetRatio: Math.round(budgetRatio * 100) / 100,
      finalsWindowStart: cfg.finals.enabled ? cfg.finals.windowStart : null,
      finalsWindowEnd: cfg.finals.enabled ? cfg.finals.windowEnd : null,
      deadlines: deadlineReport,
      deadlineBooks: deadlineReport.filter((d) => d.model === 'book'),
      deadlineExams: deadlineReport.filter((d) => d.model === 'exam'),
      deadlineAlerts: deadlineReport.filter((d) => d.status === 'late' || d.status === 'late-done').length,
      readChapters: topics.filter((t) => t.read).length,
      unreadChapters: unread.length,
      weakChapters: reteachList.length + boostList.length,
      reteachChapters: reteachList.length,
      boostChapters: boostList.length,
      solidChapters: topics.filter((t) => t.mode === 'solid').length,
      needMinutes: Math.round(initialNeedTotal),
      remainingMinutes: remainingNeed,
      plannedMinutes: Math.round(sum(topics.map((t) => t.plannedMinutes))),
      capacityMinutes: Math.round(capacityTotal),
      spareMinutes: spareCapacity,
      willCover,
      verdict: willCover
        ? 'ظرفیت زمانی تا کنکور برای پوشش همهٔ فصل‌های باقی‌مانده کافی است؛ اگر برنامه را کامل اجرا کنی به هدف می‌رسی.'
        : 'برای پوشش کاملِ ' + unread.length + ' فصلِ خوانده‌نشده و ' + (reteachList.length + boostList.length) +
          ' فصلِ ضعیف، حدود ' + Math.round(remainingNeed / 60) + ' ساعت کم داری؛ یا ساعت مطالعه را بالا ببر یا فصل‌های کم‌ضریب را عقب بینداز.',
      readiness,
      projectedReadiness,
      reviewSessions: days.reduce((a, d) => a + d.blocks.filter((b) => b.kind === 'review' || b.kind === 'cumreview').length, 0),
      reviewDays: reviewDays.length,
      lastReviewDate: lastReviewDay,
      finalPhaseDays,
      daysWithoutReview: (function () {
        /* طولانی‌ترین فاصلهٔ بدون مرور (روز) — نباید از ~۳۵ روز بیشتر شود */
        let run = 0; let worst = 0;
        days.forEach((d) => {
          const has = d.blocks.some((b) => b.kind === 'review' || b.kind === 'cumreview' || b.kind === 'warmup');
          run = has ? 0 : run + 1;
          worst = Math.max(worst, run);
        });
        return worst;
      })(),
    };

    /* ---- اولویت‌های هفته: از ضعیف‌ترین فصل‌ها ---- */
    const priorities = reteachList.concat(boostList, unread)
      .slice(0, 6)
      .map((t) => ({ subject: t.subjectName, chapter: t.label, mastery: Math.round(t.mastery), mode: t.mode }));
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
        coachNotes: coachNotes(cfg, bySubject, warnings, notes, coverage),
        coverage,
        priorities,
        weakChapters,
        chapterStats,
      },
      days,
    };
  }

  function dayNote(i) {
    if (i.isFinalExam) return 'روز کنکور — موفق باشی! خواب کافی شب قبل، مهم‌تر از هر مرور دیگری است.';
    if (i.hasManualExamToday) return 'روز آزمون آزمایشی: بعد از آزمون، بلوک تحلیل خطا را انجام بده — نمره بدون تحلیل، هدر رفته است.';
    if (i.preExam && i.preExam.days === 1) return 'مرور نهایی: امروز یادگیری جدید نداریم؛ فقط خلاصه‌ها، دفتر اشتباهات و خواب زودتر.';
    if (i.preExam && i.preExam.level === 1) return 'پیش‌آزمون' + (i.preExam.exam ? ' «' + i.preExam.exam.title + '»' : '') + ': فقط مرور مباحث آزمون، بدون مبحث جدید.';
    if (i.finalPhase) return 'فاز جمع‌بندی: مبحث تازه شروع نمی‌کنیم — فقط مرور، تست زمان‌دار و آزمون؛ هدف، تثبیت و سرعت است.';
    if (i.isRestDay) return 'روز استراحت: مغز بین جلسات همان‌جایی است که تثبیت انجام می‌شود.';
    if (i.hasClassToday) return 'روز کلاس: بلوک «تثبیت کلاس» همان شب کارِ اصلی است.';
    if (i.isDeload) return 'هفتهٔ سبک‌سازی (deload): بار کمتر تا فرسودگی نگیریم.';
    if (i.chronotype === 'morning') return 'سخت‌ترین کارها در بلوک‌های اول چیده شده (تیپ صبح‌زی).';
    if (i.chronotype === 'evening') return 'سخت‌ترین کارها در بلوک‌های انتهایی چیده شده (تیپ شب‌زی).';
    return '';
  }

  function coachNotes(cfg, bySubject, warnings, extra, coverage) {
    const out = [];
    if (coverage) {
      out.push('ارزیابی فصل‌به‌فصل خوانده شد: ' + coverage.readChapters + ' از ' + coverage.totalChapters +
        ' فصل خوانده شده؛ ' + coverage.reteachChapters + ' فصل «جبران» و ' + coverage.boostChapters +
        ' فصل «ارتقا» و ' + coverage.unreadChapters + ' فصل «یادگیری از صفر» در برنامه گذاشته شد.');
      out.push('آمادگی فعلی (میانگین وزنی تسلط فصل‌ها): ' + coverage.readiness + '٪ — اگر برنامه را کامل اجرا کنی، برآورد پایان دوره: ' +
        coverage.projectedReadiness + '٪.');
      out.push('ضد فراموشی: ' + coverage.reviewSessions + ' جلسهٔ مرور فاصله‌دار + مرور تجمعی هفتگی برنامه‌ریزی شد' +
        (coverage.lastReviewDate ? ' و آخرین مرور جامع ' + jDateLong(coverage.lastReviewDate) + ' است' : '') +
        '؛ بلندترین فاصلهٔ بدون مرور ' + coverage.daysWithoutReview + ' روز است (هدف: زیر ۳۵ روز).' +
        (coverage.finalPhaseDays ? ' ۳۰ روز آخر هم کامل «فاز جمع‌بندی» است: فقط مرور، تست زمان‌دار و آزمون.' : ''));
      out.push(coverage.willCover
        ? 'پیش‌بینی پوشش: با ' + Math.round(coverage.capacityMinutes / 60) + ' ساعت ظرفیت تا کنکور و ' +
          Math.round(coverage.remainingMinutes / 60) + ' ساعت نیاز باقی‌مانده، همهٔ فصل‌ها جا می‌شوند (' +
          Math.round(coverage.spareMinutes / 60) + ' ساعت ذخیره برای مرور و آزمون).'
        : 'هشدار پوشش: ' + Math.round(coverage.remainingMinutes / 60) + ' ساعت نیاز باقی‌مانده در برابر ' +
          Math.round(coverage.spareMinutes / 60) + ' ساعت ظرفیت آزاد — ساعت‌های مطالعه یا تعداد فصل‌ها را بازبینی کن.');
    }
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
      finals: cfg.finals, deadlines: cfg.deadlines, offDates: cfg.offDates,
      carryOver: cfg.carryOver, testTarget: cfg.testTarget,
    };
  }

  /* ------------------------------------------------------------------ */
  /* خروجی‌ها                                                            */
  /* ------------------------------------------------------------------ */

  function toMarkdown(plan) {
    const L = [];
    L.push('# برنامهٔ مطالعه — ' + plan.meta.studentName);
    L.push('');
    if (plan.summary && plan.summary.coverage) {
      const c = plan.summary.coverage;
      L.push('**آمادگی فعلی:** ' + toFa(c.readiness) + '٪ · برآورد پایان دوره: ' + toFa(c.projectedReadiness) + '٪');
      L.push('**فصل‌ها:** ' + toFa(c.readChapters) + ' از ' + toFa(c.totalChapters) + ' خوانده‌شده · ' +
        toFa(c.reteachChapters) + ' جبران · ' + toFa(c.boostChapters) + ' ارتقا · ' + toFa(c.unreadChapters) + ' یادگیری از صفر');
      L.push('');
    }
    L.push('**بازه:** ' + jDate(plan.meta.startDate) + ' تا ' + jDate(plan.meta.examDate) +
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
      L.push('### ' + jDate(d.date) + ' — ' + d.weekday + (d.studyMinutes ? ' · ' + Math.round(d.studyMinutes / 60 * 10) / 10 + ' ساعت مطالعه' : ''));
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
    const rows = [['تاریخ (شمسی)', 'روز', 'شروع', 'پایان', 'دقیقه', 'نوع', 'درس', 'مبحث', 'محتوا', 'تکنیک', 'اگر-آنگاه']];
    plan.days.forEach((d) => {
      d.events.forEach((e) => {
        rows.push([jDate(d.date), d.weekday, e.start, e.end, '', (e.type === 'exam' ? 'آزمون آزمایشی' : 'کلاس'), e.subjectName || e.title, e.title, 'رویداد ثابت', '', '']);
      });
      d.blocks.forEach((b) => {
        rows.push([jDate(d.date), d.weekday, b.start, b.end, b.minutes, b.kindLabel, b.subjectName, b.topic, b.content, b.technique, b.ifThen]);
      });
    });
    return rows.map((r) => r.map((c) => '"' + String(c).replace(/"/g, '""') + '"').join(',')).join('\r\n');
  }

  function toTaskList(plan, dateIso) {
    /* خروجی برای چسباندن در روال؛ تاریخ‌ها شمسی نمایش داده می‌شوند */
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
        /* تاریخ شمسی همراه رویداد (DTSTART بر اساس استاندارد ICS میلادی می‌ماند) */
        lines.push('X-REVAL-JALALI:' + esc(jDate(d.date) + ' ' + b.start));
        lines.push('DESCRIPTION:' + esc('تاریخ شمسی: ' + jDate(d.date) + ' (' + d.weekday + ')' +
          (b.ifThen ? '\n' + b.ifThen : '') + '\n' + b.content));
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

  /**
   * درصد آزمون → به‌روزرسانی تسلط «فصل‌به‌فصل».
   * هر فصلِ خوانده‌شده به‌سمت درصد آزمون نصفِ فاصله جابه‌جا می‌شود؛ فصل‌های
   * خوانده‌نشده دست‌نخورده می‌مانند (تا کاربر خودش «خوانده‌ام» را علامت بزند).
   */
  function applySubjectScore(subject, score) {
    const target = clamp(Number(score) || 0, 0, 100);
    if (!Array.isArray(subject.chaptersData) || !subject.chaptersData.length) {
      return updateMastery(subject, target);
    }
    const k = 0.5;
    const chaptersData = subject.chaptersData.map((c) => {
      if (!c.read) return c;
      return Object.assign({}, c, { mastery: Math.round(clamp(c.mastery + k * (target - c.mastery), 0, 100)) });
    });
    const readOnes = chaptersData.filter((c) => c.read);
    const mastery = readOnes.length
      ? Math.round(sum(readOnes.map((c) => c.mastery)) / chaptersData.length)
      : 0;
    return Object.assign({}, subject, { chaptersData, mastery });
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
    createPlan, updateMastery, applySubjectScore, todaySummary,
    toMarkdown, toCSV, toICS, toTaskList,
    DEFAULTS, WEEKDAY_FA, WEEKDAY_KEY, SUBJECT_TYPE_FA,
    _internal: { normalizeConfig, dayDiff, persianWeekday, firstReviewGap, reviewInterval, addDays, isoDay, freeSegments, busyEventsFor },
  };
});
