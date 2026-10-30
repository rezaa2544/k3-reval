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
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(require('./jalali.js'), require('./chapter-weights.js'));
  } else root.RevalPlanner = factory(root.RevalJalali, root.RevalChapterWeights);
})(typeof self !== 'undefined' ? self : this, function (J, CW0) {
  'use strict';

  /* ---------------- اهمیت واقعی فصل‌به‌فصل (کنکور) و بارم (نهایی) ----------------
     ماژول دادهٔ مستقل؛ اگر نبود، همهٔ ضرایب ۱ می‌شوند و موتور مثل قبل کار می‌کند. */
  const CW = CW0 || {
    konkur: () => null,
    finals: () => null,
    chapterInfo: () => null,
    finalsChapterInfo: () => null,
    konkurFactors: () => ({ mult: 1, needMult: 1, testMult: 1, info: null }),
    konkurMethod: () => [],
    finalsMethod: () => [],
    konkurTable: () => [],
    finalsTable: () => [],
    tagOf: () => 'متوسط',
  };

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
    /* حداقل «اندازهٔ جلسه» برای هر نوع کار — هیچ بلوکی کوچک‌تر از این ساخته نمی‌شود.
       دلیل روان‌شناختی: بلوک‌های ریز، زمان راه‌اندازی ذهنی و هزینهٔ تعویض بافت را چند برابر می‌کنند
       و «پیشرفت واقعی» تولید نمی‌کنند (Leroy 2009؛ Sweller 1988). */
    /* حداقلِ زمانِ یادگیریِ واقعیِ یک فصل (دقیقه) */
    MIN_CHAPTER_LEARN_MIN: 90,
    MIN_CHUNK: {
      learn: 30, reteach: 30, practice: 30, boost: 30,
      review: 15, warmup: 10, cumreview: 30, carryreview: 15, carry: 20,
      finalprep: 25, deadlinecheck: 20, classfix: 20, analysis: 25,
      mock: 40, exam: 30, emergency: 20,
    },
    /* سقف تعداد جلسهٔ یادگیری هم‌درس در یک روز (رمزنگاری تنوع بین‌درسی) */
    MAX_LEARN_SESSIONS_PER_SUBJECT: 2,
    /* اگر مبحثی شروع شده، جلسهٔ بعدی‌اش حداکثر چند روز بعد باید بیاید (تداوم فصل) */
    CHAPTER_CONTINUITY_DAYS: 2,
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
  /* ---------------- ساعت خواب و پنجرهٔ آزاد ----------------
     باگ واقعی نسخهٔ ۲.۳.۱: دانش‌آموزی که ساعت خوابش بعد از نیمه‌شب است (۰۰:۳۰ یا ۰۱:۰۰)
     عدد ۰۰:۳۰ را «نیم‌ساعت بعد از شروع روز» می‌فهمیدیم، پس پایان پنجرهٔ مطالعه
     قبل از شروع آن می‌افتاد و کل برنامه صفر می‌شد (۰ ساعت، پوشش ۰٪، هشدارهای متناقض).
     حالا اگر ساعت خواب از ساعت بیداری کوچک‌تر یا مساوی باشد، یعنی روز بعد. */
  function sleepMinutes(cfg) {
    const bed = minutesSinceMidnight(cfg.sleep && cfg.sleep.bedtime);
    const wake = minutesSinceMidnight(cfg.sleep && cfg.sleep.wake);
    return bed <= wake ? bed + 1440 : bed;
  }
  function bedtimeCrossesMidnight(cfg) {
    const bed = minutesSinceMidnight(cfg.sleep && cfg.sleep.bedtime);
    const wake = minutesSinceMidnight(cfg.sleep && cfg.sleep.wake);
    return bed <= wake;
  }
  function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }
  function roundTo5(n) { return Math.round(n / 5) * 5; }
  function sum(arr) { return arr.reduce((a, b) => a + b, 0); }
  function toFa(n) { return String(n).replace(/[0-9]/g, (d) => '۰۱۲۳۴۵۶۷۸۹'[+d]); }

  /* ------------------------------------------------------------------ */
  /* نرمال‌سازی تنظیمات                                                  */
  /* ------------------------------------------------------------------ */

  /** هدف تست روزانه (استاندارد، نه عدد دلبخواه) — با ساعت‌های مؤثر روز سنجیده می‌شود. */
  function refreshTestTarget(cfg) {
    const totalAvailHours = sum(WEEKDAY_KEY.map((k) => cfg.availability[k]));
    const activeWeekdays = WEEKDAY_KEY.filter((k) => cfg.availability[k] > 0 && WEEKDAY_KEY.indexOf(k) !== cfg.restDay).length || 6;
    const manual = (cfg.testTarget && cfg.testTarget.manual) ? Number(cfg.testTarget.daily) : 0;
    const declaredDailyMinutes = (totalAvailHours * 60) / Math.max(1, activeWeekdays);
    /* زمان واقعیِ روز = ساعت اعلامی × رَمپ‌آپ × (۱ − بافر)؛ هدف تست باید با همین سنجیده شود */
    const effFactor = (cfg.RAMP_UP.start + cfg.RAMP_UP.step * 3) * (1 - (cfg.BUFFER_RATIO != null ? cfg.BUFFER_RATIO : 0.15));
    const effectiveDailyMinutes = declaredDailyMinutes * Math.min(1, effFactor);
    const feasibleDailyTests = Math.round((effectiveDailyMinutes * 0.45) / 2.0);  // ~۴۵٪ روز، ۲ دقیقه/تست
    cfg._feasibleDailyTests = clamp(feasibleDailyTests, 20, 220);
    const normByHours = clamp(Math.round(totalAvailHours * 2.2), 30, 200);      // نورم: ۲۲ تست به ازای هر ساعت هفتگی
    const autoDaily = clamp(Math.min(normByHours, cfg._feasibleDailyTests), 25, 200);
    cfg.testTarget = {
      daily: clamp(Number(manual) || autoDaily, 0, 250),
    };
    return cfg.testTarget;
  }

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

    /* ---------------- ساعت بیداری: فقط «پیش‌فرض» است ----------------
       روز واقعی وقتی شروع می‌شود که کاربر دکمهٔ «شروع روز» را بزند و ساعت واقعی را بدهد.
       cfg.dayStarts = { '2026-10-30': '11:00' }  ← بازچینش همان روز از ساعت واقعی. */
    const hm = (v) => {
      const m = /^\s*(\d{1,2}):(\d{2})\s*$/.exec(String(v || ''));
      if (!m) return null;
      const h = Number(m[1]); const mm = Number(m[2]);
      if (h > 23 || mm > 59) return null;
      return String(h).padStart(2, '0') + ':' + String(mm).padStart(2, '0');
    };
    cfg.wakeTime = hm(cfg.wakeTime) || hm(cfg.sleep.wake) || '07:00';
    cfg.sleep.wake = cfg.wakeTime;
    cfg.dayStarts = (function () {
      const out = {};
      const src = cfg.dayStarts || {};
      Object.keys(src).forEach((k) => { const v = hm(src[k]); if (v) out[k] = v; });
      return out;
    })();

    /* ---------------- روال‌های روز (وعده‌های غذایی، نماز، ورزش) ----------------
       این‌ها «رویداد ثابت» هستند و هیچ بازچینشی (شروع روز / جابه‌جایی) آن‌ها را جابه‌جا نمی‌کند.
       پیش‌فرض خاموش است تا ساعت مطالعهٔ اعلامی کاربر هدر نرود؛ در «زمان‌های تو» روشن می‌شود. */
    cfg.routinePinned = cfg.routinePinned === true;
    const rawRoutines = Array.isArray(cfg.routines) && cfg.routines.length
      ? cfg.routines
      : [
        { title: 'صبحانه', start: '08:00', minutes: 30 },
        { title: 'ناهار', start: '13:30', minutes: 45 },
        { title: 'شام', start: '20:00', minutes: 45 },
      ];
    cfg.routines = rawRoutines.map((r, i) => ({
      id: r.id || 'R' + (i + 1),
      title: String(r.title || 'روال ' + toFa(i + 1)).slice(0, 40),
      start: hm(r.start) || '13:00',
      minutes: clamp(Number(r.minutes) || 30, 5, 180),
      weekdays: Array.isArray(r.weekdays) && r.weekdays.length ? r.weekdays.map(Number) : [0, 1, 2, 3, 4, 5, 6],
      enabled: r.enabled !== false,
    }));

    /* ---------------- آیتم‌های اضطراری ----------------
       کاربر یک فصل/موضوع را «حتمی» می‌کند و می‌گوید کِی: امروز با ساعت مشخص یا این هفته.
       برنامهٔ بقیهٔ روز/هفته دور همین آیتم بازچینی می‌شود؛ ساعت کلاس‌ها ثابت می‌ماند. */
    cfg.emergency = (Array.isArray(cfg.emergency) ? cfg.emergency : [])
      .map((e, i) => {
        const scope = e.scope === 'week' ? 'week' : 'today';
        return {
          id: e.id || 'E' + (i + 1),
          title: String(e.title || '').slice(0, 80),
          subjectId: e.subjectId || null,
          chapter: e.chapter == null ? null : Number(e.chapter),
          scope,
          date: /^\d{4}-\d{2}-\d{2}$/.test(String(e.date || '')) ? String(e.date)
            : (scope === 'today' ? isoDay(start) : null),
          time: hm(e.time),
          minutes: clamp(Number(e.minutes) || 60, 20, 300),
          done: e.done === true,
        };
      })
      .filter((e) => !e.done && (e.title || e.subjectId));
    cfg.student = Object.assign({ name: 'دانش‌آموز', grade: 'دوازدهم', field: 'tajrobi', chronotype: 'neutral' }, cfg.student || {});
    cfg.blockMinutes = clamp(Number(cfg.blockMinutes) || 45, 20, 120);
    cfg.breakMinutes = clamp(Number(cfg.breakMinutes) || 10, 0, 30);
    cfg.restDay = clamp(Number(cfg.restDay), 0, 7);
    cfg.weeklyMock = cfg.weeklyMock !== false;

    /* ---------------- حالت زمان‌بندی ----------------
       fixed: کاربر ساعت هر روز را خودش می‌گوید (رفتار قبلی).
       auto : کاربر فقط «سقف» را می‌گوید و برنامه خودش بر اساس نیازِ واقعی
              (حجم فصل‌ها، ضریب، فاصلهٔ تسلط، مهلت‌ها) ساعت لازم را تعیین می‌کند. */
    cfg.timeMode = cfg.timeMode === 'auto' ? 'auto' : 'fixed';
    cfg.dailyCapHours = clamp(Number(cfg.dailyCapHours) || 10, 1, 16);
    cfg.dailyFloorHours = clamp(Number(cfg.dailyFloorHours) || 1, 0.5, 8);

    /* ---------------- آزمون‌های دوره‌ای (weekly mocks) ----------------
       مدل قدیمی فقط یک آزمون جمعه داشت. حالا هر روز هفته، هر N هفته،
       چند آزمون در یک روز (مثل زیستاز + آلفا) و با ساعت ثابت اختیاری. */
    const WDAY_INDEX = { 'شنبه': 0, 'یکشنبه': 1, 'دوشنبه': 2, 'سه‌شنبه': 3, 'چهارشنبه': 4, 'پنجشنبه': 5, 'جمعه': 6 };
    const rawMocks = Array.isArray(cfg.weeklyMocks) && cfg.weeklyMocks.length
      ? cfg.weeklyMocks
      : (cfg.weeklyMock ? [{ title: 'آزمون جامع هفتگی', day: cfg.WEEKLY_MOCK_DAY != null ? cfg.WEEKLY_MOCK_DAY : 5 }] : []);
    cfg.weeklyMocks = rawMocks.map((m, i) => {
      const dayRaw = m.day != null ? m.day : (m.weekday != null ? m.weekday : 5);
      const day = typeof dayRaw === 'string'
        ? (WDAY_INDEX[dayRaw] != null ? WDAY_INDEX[dayRaw] : WEEKDAY_KEY.indexOf(dayRaw))
        : Number(dayRaw);
      return {
        id: 'M' + (i + 1),
        title: String(m.title || 'آزمون دوره‌ای').slice(0, 60),
        day: clamp(Number.isFinite(day) ? day : 5, 0, 6),
        everyNWeeks: clamp(Number(m.everyNWeeks || m.every || 1), 1, 8),
        minutes: clamp(Number(m.minutes || 100), 30, 300),
        start: /^\d{1,2}:\d{2}$/.test(String(m.start || '')) ? String(m.start) : null,
        subjectIds: Array.isArray(m.subjectIds) ? m.subjectIds.filter((x) => typeof x === 'string') : [],
        enabled: m.enabled !== false,
      };
    }).filter((m) => m.enabled);
    /* اگر همه غیرفعال باشند، آزمون دوره‌ای ساخته نمی‌شود (weeklyMock=false) */
    if (!cfg.weeklyMocks.length) cfg.weeklyMock = false;

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

    /* ---------------- هدف تست روزانه (استاندارد، نه عدد دلبخواه) ----------------
       نورم واقعی: هر ساعت مطالعهٔ مؤثر ≈ ۱۲–۱۵ تست در دروس مفهومی و ۸–۱۰ در دروس محاسباتی.
       پس سقف عملی روز = ساعت اعلامی × ۱۲ (با میانگین ~۲ دقیقه برای هر تست).
       و کف موردنیاز = مجموع تست لازمِ فصل‌ها ÷ روزهای در دسترس.
       هدف = بین این دو؛ اگر «لازم» از «سقف عملی» بیشتر بود، هشدار صادقانه داده می‌شود. */
    refreshTestTarget(cfg);
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
        /* اهمیت واقعی همین فصل از بودجه‌بندی کنکور (تعداد سؤال، اهمیت، سختی) */
        const ci = CW.konkurFactors(s.id, i);
        const ciM = ci.needMult || 1;
        const read = data ? Boolean(row && row.read) : (i <= Math.floor(s.masteredChapters));
        const mastery = data
          ? (row && row.read ? row.mastery : 0)
          : (read ? 100 : 0);
        let mode;
        let need;
        /* ضریب اهمیت فصل روی «زمان لازم» اثر می‌گذارد: فصل پرسؤال‌تر و سخت‌تر
           برای یادگیری، تثبیت، مرور و تست زمان بیشتری می‌گیرد. */
        if (!read) {
          mode = 'learn';
          /* کفِ واقع‌گرایانه: هیچ فصلِ کتابِ درسی با کمتر از ۹۰ دقیقهٔ یادگیریِ فعال
             «خوانده‌شده» نیست (مطالعهٔ فعال + نت‌برداری + بازیابی، بدون تست).
             این کف جلوی فصل‌های ۴۳ دقیقه‌ای را می‌گیرد و تضمین می‌کند هر فصل
             دست‌کم دو جلسهٔ ۴۵ دقیقه‌ای داشته باشد. */
          /* کف: هیچ فصل زیر «حداقلِ یادگیریِ واقعی» نمی‌رود، ولی کف یک عددِ ثابت
             برای همه نیست: فصلِ پرسؤال‌تر/مهم‌تر همان بالا هم وقت بیشتری می‌گیرد
             (۰٫۸ تا ۱٫۲ برابرِ کف بر اساس ضریب فصل). */
          const floorMin = DEFAULTS.MIN_CHAPTER_LEARN_MIN;
          const rawNeed = base * s.difficulty * ciM;
          need = rawNeed >= floorMin
            ? rawNeed
            /* کفِ مطلق ۹۰ دقیقه: حتی فصلِ کم‌اهمیت هم دو جلسهٔ کامل می‌گیرد؛
               بالای کف، ضریب اهمیت می‌تواند تا ۱٫۲۵ برابر بیشتر بدهد. */
            : Math.max(floorMin, Math.round(floorMin * clamp(0.9 + 0.4 * Math.min(1.5, ciM) / 1.2, 0.9, 1.25)));
        } else if (mastery < DEFAULTS.RETEACH_BELOW) {
          mode = 'reteach';
          need = (20 + base * s.difficulty * DEFAULTS.RETEACH_FACTOR * ((DEFAULTS.BOOST_BELOW - mastery) / DEFAULTS.BOOST_BELOW)) * ciM;
        } else if (mastery < DEFAULTS.BOOST_BELOW) {
          mode = 'boost';
          need = (15 + base * s.difficulty * DEFAULTS.BOOST_FACTOR * ((DEFAULTS.BOOST_BELOW - mastery) / DEFAULTS.BOOST_BELOW)) * ciM;
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
          /* نیاز تست هر فصل (مبنای گزارش فصل‌به‌فصل) — پرسؤال‌ترها تست بیشتری می‌خواهند */
          testsNeed: Math.round((s.type === 'problem' ? 45 : s.type === 'memorization' ? 30 : 55) *
            s.difficulty * (ci.testMult || 1)),
          /* دادهٔ اهمیت واقعی فصل (برای نمایش و اولویت‌بندی) */
          ciMult: ci.mult || 1,
          ciNeed: ciM,
          ciTag: ci.info ? ci.info.tag : null,
          ciQuestions: ci.info ? ci.info.q : null,
          ciSharePct: ci.info ? ci.info.sharePct : null,
          ciImportance: ci.info ? ci.info.imp : null,
          ciDifficulty: ci.info ? ci.info.diff : null,
          ciSource: ci.info ? ci.info.source : null,
          /* ۲.۸.۱۲: اولویتِ محاسبه‌شده از بودجه‌بندی چندساله × ضریب درس */
          ciPriority: ci.info ? ci.info.priority : null,
          ciPriorityLocal: ci.info ? ci.info.priorityLocal : null,
          ciCoef: ci.info ? ci.info.coef : null,
          ciYears: ci.info ? ci.info.years : null,
          ciSeries: ci.info ? ci.info.series : null,
          ciTrend: ci.info ? ci.info.trend : null,
          ciDataDriven: ci.info ? Boolean(ci.info.dataDriven) : false,
          ciQTotal: ci.info ? ci.info.qTotal : null,
          ciSources: ci.info ? ci.info.dataSources : null,
          ciCols: ci.info ? ci.info.dataCols : null,
          ciExams: ci.info ? ci.info.exams : null,
          ciCoarse: ci.info ? Boolean(ci.info.coarse) : false,
          ciFrom: ci.info ? ci.info.yearFrom : null,
          ciTo: ci.info ? ci.info.yearTo : null,
          testsDone: 0,
          learnedOn: null,
          doneDate: null,
          reviewMinutes: 0,
          deadlineIdx: null,
          deadlineTitle: null,
          deadlineKind: null,
          /* هر فصلِ نخوانده حداقل یک جلسهٔ کامل (۳۰ دقیقه) می‌گیرد؛ نیازها همیشه عدد صحیح‌اند */
          needMinutes: need > 0 ? Math.max(30, Math.round(need)) : 0,
          initialNeedMinutes: need > 0 ? Math.max(30, Math.round(need)) : 0,
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
    /* ضریب اهمیت واقعی فصل: فصل پرتکرار/سخت زودتر و بیشتر خوانده می‌شود،
       نه فقط به ترتیب شمارهٔ فصل. */
    const ciFactor = t.ciMult || 1;
    return Math.max(0.01, t.weight * (0.15 + 0.85 * gap) * kindFactor * ciFactor);
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

    /* روال‌های روز (وعده‌های غذایی/نماز/ورزش) — رویداد ثابت و غیرقابل‌جابه‌جایی */
    if (cfg.routinePinned && cfg.routines) {
      cfg.routines.forEach((r) => {
        if (r.enabled === false) return;
        if (r.weekdays && r.weekdays.indexOf(wd) === -1) return;
        const st = minutesSinceMidnight(r.start);
        out.push({
          type: 'routine', id: r.id, title: r.title, subjectId: null, subjectName: '',
          start: st, end: st + r.minutes, fixed: true,
        });
      });
    }

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
    let windowStart = minutesSinceMidnight(cfg.startTimes[key]);
    /* «شروع روز»: اگر کاربر برای این روز ساعت واقعیِ شروع را داده باشد،
       پنجرهٔ آزاد از همان ساعت شروع می‌شود (نه از ساعت پیش‌فرض آن روز هفته). */
    if (cfg.dayStarts) {
      const ov = cfg.dayStarts[isoDay(date)];
      if (ov) windowStart = minutesSinceMidnight(ov);
    }
    /* هیچ‌وقت قبل از بیداری مطالعه نداریم؛ زودتر از ساعت بیداری، پنجره باز نمی‌شود. */
    const wakeMin = minutesSinceMidnight(cfg.wakeTime || (cfg.sleep && cfg.sleep.wake) || '07:00');
    if (windowStart < wakeMin) windowStart = wakeMin;
    /* پایان پنجرهٔ مطالعه: ۴۵ دقیقه قبل از خواب؛ خوابِ بعد از نیمه‌شب تا پایان همان روز کشیده می‌شود */
    const bedGuard = Math.min(1440, sleepMinutes(cfg) - (cfg.SLEEP_GUARD_MIN || DEFAULTS.SLEEP_GUARD_MIN));
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
  function scheduleTasks(cfg, tasks, segments, dayIndex) {
    if (!segments.length) return { blocks: [], unplacedMinutes: sum(tasks.map((t) => t.minutesLeft || 0)) };

    const maxSame = cfg.MAX_CONSECUTIVE_SAME != null ? cfg.MAX_CONSECUTIVE_SAME : DEFAULTS.MAX_CONSECUTIVE_SAME;
    const winStart = Math.min.apply(null, segments.map((s) => s.start));
    const winEnd = Math.max.apply(null, segments.map((s) => s.end));

    const state = segments.map((s) => ({ start: s.start, end: s.end, cursor: s.start, last: [] }));
    const blocks = [];
    const pool = tasks.filter((t) => (t.minutesLeft || 0) > 0);

    /* ── تنوعِ روزانه (نسخهٔ ۲.۸.۱۱) ──────────────────────────────
       شواهد: یک‌جانشینیِ طولانی با یک درس (massed practice) هم کسل‌کننده است و هم
       یادگیری را کم‌عمق می‌کند؛ «تمرین درهم» (Cepeda 2006، Rohrer 2007،
       Kornell & Bjork 2008) و «تغییرِ بافت» (Sweller) بازیابی را قوی‌تر می‌کند.
       پس: (۱) هیچ درسی بیش از نیمی از روز را نمی‌گیرد، (۲) وقتی چند درس در
       انتظارند، درسِ تازه‌کارکرده جریمه می‌شود، (۳) ترتیبِ شروع هر روز می‌چرخد. */
    const capMin = Math.max(1, sum(segments.map((x) => x.end - x.start)));
    const usedBySubject = {};
    const blocksBySubject = {};
    const dayNo = Number.isFinite(dayIndex) ? dayIndex : 0;
    /* درهم‌سازیِ قطعی (بدون تصادفِ واقعی): همان ورودی همیشه همان برنامه را می‌دهد */
    const jitterOf = (id) => {
      const str = String(dayNo) + '|' + String(id || '');
      let h = 2166136261;
      for (let i = 0; i < str.length; i += 1) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
      return (h >>> 0) % 97;
    };
    const subjectOrder = {};
    (function buildOrder() {
      const ids = [];
      pool.forEach((t) => { if (t.subjectId && ids.indexOf(t.subjectId) === -1) ids.push(t.subjectId); });
      /* ترتیب هر روز با «چرخش» عوض می‌شود تا درس اولِ روز همیشه یکی نباشد */
      ids.sort((a, b) => (jitterOf(a) - jitterOf(b)));
      ids.forEach((id, i) => { subjectOrder[id] = i; });
    })();
    const pendingSubjects = () => {
      const out = [];
      pool.forEach((t) => { if (t.minutesLeft > 0 && t.subjectId && out.indexOf(t.subjectId) === -1) out.push(t.subjectId); });
      return out;
    };

    /* ── قاعدهٔ سختِ تنوع (۲.۸.۱۳) ────────────────────────────────────────
       تا ۲.۸.۱۲ «سقفِ سهمِ روز» فقط یک جریمهٔ نرم بود؛ در روزهای کوتاه
       (۲ تا ۳ ساعت) جریمه با امتیازِ یادگیری خنثی می‌شد و نتیجه می‌شد
       «کلِ روز یک کتاب». حالا اگر درسِ دیگری واقعاً در صف باشد، سهمِ بیش از
       ۵۰٪ و بلوکِ سومِ پشتِ‌سرهم برای همان درس **اصلاً انتخاب نمی‌شود**
       (نه فقط جریمه). اگر هیچ جایگزینی نماند، قید شل می‌شود تا برنامه ناقص نماند. */
    const MAX_DAY_SHARE = 0.5;
    let plannedMin = 0;

    const scanForBest = (strict) => {
      let best = null;
      pool.forEach((task, ti) => {
        const atomic = task.kind === 'exam' || task.kind === 'mock';
        const minChunk = (DEFAULTS.MIN_CHUNK[task.kind] != null ? DEFAULTS.MIN_CHUNK[task.kind] : cfg.MIN_BLOCK);
        /* کاری که از حداقلِ نوعش کوتاه‌تر است، اصلاً چیده نمی‌شود؛ به روز بعد می‌رود */
        if (!atomic && task.minutesLeft < minChunk) return;
        const chunk = Math.min(atomic ? task.minutesLeft : cfg.blockMinutes, task.minutesLeft);
        state.forEach((seg, si) => {
          const pad0 = seg.cursor > seg.start ? cfg.breakMinutes : 0;
          const from = Math.max(seg.cursor + pad0, task.afterMin || 0);   // «تثبیت کلاس» بعد از کلاس
          const pad = from > seg.cursor ? 0 : pad0;
          const remaining = seg.end - from;
          if (remaining < Math.min(minChunk, chunk)) return;

          /* طول بلوک: عدد صحیح، و هرگز کوچک‌تر از حداقلِ نوعِ همان کار */
          let useLen = Math.round(Math.min(chunk, remaining));
          if (atomic && useLen < chunk) return; // آزمون نصفه چیده نمی‌شود
          if (!atomic && useLen < minChunk) return;
          if (!atomic && task.minutesLeft - useLen > 0 && task.minutesLeft - useLen < minChunk) {
            /* اگر بعد از این بلوک، باقی‌ماندهٔ ناچیزی می‌ماند که بلوک مستقل نمی‌شود،
               همین بلوک را کمی بلندتر می‌کنیم تا فصل تمیز بسته شود (نه با تکهٔ ۸ دقیقه‌ای). */
            const want = Math.round(Math.min(task.minutesLeft, remaining));
            if (want >= minChunk) useLen = want;
          }

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

          /* ── قیدهای تنوعِ بین‌درسی ──
             فقط برای کارهای درسیِ عادی اعمال می‌شود؛ آزمون/تثبیت کلاس/سوابق لنگرِ روزند
             و جابه‌جایشان برنامه را خراب می‌کند. */
          const VARIETY_KINDS = ['learn', 'reteach', 'boost', 'practice', 'review', 'warmup', 'cumreview', 'carry', 'carryreview'];
          if (VARIETY_KINDS.indexOf(task.kind) !== -1) {
            const others = pendingSubjects().filter((x) => x !== task.subjectId);
            if (others.length && strict) {
              /* آیا درسِ دیگری واقعاً کاری دارد که همین حالا جا می‌شود؟ */
              const altReady = others.some((id) => pool.some((t) => t.subjectId === id
                && t !== task && (t.minutesLeft || 0) >= minChunkOf(t.kind)));
              if (altReady) {
                /* بلوکِ پشتِ‌سرهمِ همان درس ممنوع */
                if (trailingRun(last, task.subjectId) >= maxSame) return;
                /* سقفِ سهمِ روز: بیش از نیمی از روز برای یک درس */
                if (plannedMin > 0 && (usedBySubject[task.subjectId] + useLen) / (plannedMin + useLen) > MAX_DAY_SHARE) return;
              }
            }
            if (others.length) {
              /* یادگیریِ فصل جدید هرگز پشتِ «تست/مرورِ درس دیگر» قربانی نمی‌شود؛
                 جریمهٔ تنوع برای یادگیری ملایم‌تر است تا فقط ترتیب عوض شود. */
              const isLearnKind = task.kind === 'learn' || task.kind === 'reteach' || task.kind === 'boost';
              const w = isLearnKind ? 0.02 : 1;
              const share = (usedBySubject[task.subjectId] || 0) / capMin;
              /* سقفِ سهم: هیچ درسی بیشتر از نیمی از روز را نگیرد */
              if (share >= 0.5) score -= 4000 * w;
              else if (share >= 0.36) score -= 900 * w;
              /* درسِ سوم به بعد در یک روز: تا وقتی درسِ کم‌کار در انتظار است، عقب بمان */
              const used = blocksBySubject[task.subjectId] || 0;
              const maxBlocks = Math.max(2, Math.ceil((blocks.length + 1) / 2));
              if (used >= maxBlocks) score -= 2500 * w;
              /* درسی که امروز اصلاً نوبت نگرفته، جلو می‌افتد (شروعِ درسِ تازه) */
              /* ⚠ درسِ تازه‌کار فقط در «هم‌نوع‌های خودش» جلو می‌افتد؛ هرگز از یادگیریِ فصل
                 جدید جلو نمی‌زند (وگرنه تست، جای یادگیری را می‌گرفت و پوشش فصل‌ها می‌افتاد). */
              if (!used) score += isLearnKind ? 80 : 0;
              /* چرخشِ روزانهٔ ترتیب: درسِ دیرتر در ترتیبِ امروز، کمی جلو می‌افتد */
              score += (subjectOrder[task.subjectId] || 0) * 0.6 * jitterOf(task.subjectId) / 100;
            }
          }
          if (!best || score > best.score) best = { score, task, ti, seg, si, useLen, start: from };
        });
      });
      return best;
    };

    let guard = 0;
    while (pool.length && guard++ < 500) {
      /* اول با قیدِ سخت؛ اگر هیچ گزینه‌ای نماند، همان قید را شل می‌کنیم */
      let best = scanForBest(true) || scanForBest(false);

      // اگر تنها گزینهٔ باقی‌مانده نقض interleaving است (مثلاً همهٔ تسک‌های مانده یک درس‌اند)،
      // برنامه را ناقص نمی‌گذاریم: آن را با پذیرش تکرار می‌چینیم.
      if (best && best.score < -50000) best = bestFallback(cfg, pool, state);
      if (!best) {
        /* ── چسباندنِ باقی‌مانده‌های ریز ──
           وقتی تکهٔ آخرِ چند کار از حداقلِ بلوک کوتاه‌تر است، به‌جای دور ریختن،
           تکه‌های هم‌درس و هم‌نوع را در یک کار جمع می‌کنیم تا یک بلوک واقعی شود.
           (پیش از این، این باقی‌مانده‌ها تا آخر سال «جا‌نشده» می‌ماندند.) */
        const MERGEABLE = new Set(['practice', 'review', 'warmup', 'cumreview', 'carryreview', 'finalprep', 'analysis']);
        const groups = {};
        pool.forEach((t) => {
          if (!MERGEABLE.has(t.kind)) return;
          const key = t.kind + '|' + t.subjectId;
          (groups[key] = groups[key] || []).push(t);
        });
        let merged = false;
        Object.keys(groups).forEach((k) => {
          const g = groups[k].filter((t) => pool.indexOf(t) !== -1);
          if (g.length < 2) return;
          const total = g.reduce((a, t) => a + (t.minutesLeft || 0), 0);
          const lim = (DEFAULTS.MIN_CHUNK[g[0].kind] != null ? DEFAULTS.MIN_CHUNK[g[0].kind] : cfg.MIN_BLOCK);
          if (total < lim || total > cfg.blockMinutes * 2) return;
          const host = g[0];
          host.minutesLeft = Math.round(total);
          host.practiceCount = g.reduce((a, t) => a + (t.practiceCount || 0), 0) || host.practiceCount;
          host.merged = g.reduce((a, t) => a + Math.max(0, Math.round(t.minutesLeft || 0)), 0);
          g.slice(1).forEach((t) => { const i = pool.indexOf(t); if (i !== -1) pool.splice(i, 1); });
          merged = true;
        });
        if (merged) continue;   // با کارهای چسبیده یک بار دیگر تلاش کن
        break;                  // دیگر هیچ تسکی در هیچ بازه‌ای جا نمی‌شود
      }

      const { task, seg, useLen, start } = best;
      const minChunkOk = (DEFAULTS.MIN_CHUNK[task.kind] != null ? DEFAULTS.MIN_CHUNK[task.kind] : cfg.MIN_BLOCK);
      if (useLen < minChunkOk && task.kind !== 'exam' && task.kind !== 'mock') { pool.splice(best.ti, 1); continue; }
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

      plannedMin += useLen;
      usedBySubject[task.subjectId] = (usedBySubject[task.subjectId] || 0) + useLen;
      blocksBySubject[task.subjectId] = (blocksBySubject[task.subjectId] || 0) + 1;
      seg.cursor = start + useLen;
      seg.last.push(task.subjectId);
      task.minutesLeft -= useLen;
      if (task.minutesLeft <= 0) pool.splice(best.ti, 1);
    }

    blocks.sort((a, b) => a.start - b.start);

    /* ── ۲.۸.۱۳: تثبیتِ همان‌روز در سطح بلوک ─────────────────────────────
       اگر روز چند بلوکِ یادگیری دارد ولی هیچ مرور/تست/بازیابی‌ای ندارد (مثلاً
       اوایل سال که هنوز فصلِ خوانده‌شده‌ای برای تست نیست، یا روزی که همهٔ
       مرورها در چیدن جا نشدند)، ۱۵ دقیقهٔ آخرِ آخرین بلوکِ یادگیری به یک بلوکِ
       «بازیابی از حافظه» تبدیل می‌شود: بخوان، بعد از خودت بپرس.
       شواهد: Roediger & Karpicke (2006) و Karpicke & Blunt (2011) — بازیابیِ
       فعال بیشتر از بازخوانی نگه‌داشت می‌سازد. این کار مرزِ بلوک‌ها را جابه‌جا
       نمی‌کند (از انتهای همان بلوک کم می‌شود) پس تداخلِ زمانی ایجاد نمی‌کند. */
    {
      const CONSOL = ['warmup', 'review', 'practice', 'cumreview', 'carryreview', 'finalprep', 'deadlinecheck'];
      const hasConsol = blocks.some((b) => CONSOL.indexOf(b.kind) !== -1);
      const learnBlocks = blocks.filter((b) => b.kind === 'learn' || b.kind === 'reteach' || b.kind === 'boost');
      if (!hasConsol && learnBlocks.length >= 2) {
        /* بلندترین بلوکِ یادگیری؛ نه لزوماً آخرین (آخرین ممکن است ۳۰ دقیقه باشد
           و با کسر ۱۵ دقیقه زیرِ حدِ بلوک برود). */
        const last = learnBlocks.slice().sort((a, b) => b.minutes - a.minutes)[0];
        const cut = 15;
        const floorMin = DEFAULTS.MIN_CHUNK[last.kind] != null ? DEFAULTS.MIN_CHUNK[last.kind] : cfg.MIN_BLOCK;
        if (last.minutes - cut >= floorMin) {
          const retrieval = Object.assign({}, last, {
            start: last.end - cut,
            end: last.end,
            minutes: cut,
            kind: 'warmup',
            /* خروجیِ روز نوع را از task می‌خواند؛ پس نسخهٔ کپی‌شدهٔ تسک هم باید
               نوعِ «بازیابی» داشته باشد. */
            task: Object.assign({}, last.task, { kind: 'warmup', sameDayRetrieval: true }),
            sameDayRetrieval: true,
            practiceCount: Math.max(3, Math.round(cut / 1.6)),
          });
          last.end -= cut;
          last.minutes -= cut;
          if (last.practiceCount) last.practiceCount = Math.max(3, Math.round(last.practiceCount * (last.minutes / (last.minutes + cut))));
          blocks.push(retrieval);
          blocks.sort((a, b) => a.start - b.start);
        }
      }
    }

    /* تسک‌هایی که (کامل یا قسمتی) جا نشدند — برای برگرداندن نیاز به فصل */
    const unplacedTasks = pool.map((t) => {
      const done = sum(blocks.filter((b) => b.task === t).map((b) => b.minutes));
      const left = Math.max(0, Math.round((t.minutesLeft || 0) - done));
      return Object.assign({}, t, { minutesLeft: left });
    }).filter((t) => t.minutesLeft > 0);
    return { blocks, unplacedMinutes: sum(pool.map((t) => t.minutesLeft || 0)), unplacedTasks };
  }

  /** کفِ زمانِ یک نوع کار — هیچ کاری کوتاه‌تر از این ساخته نمی‌شود،
      چون در چیدمان هرگز جا نمی‌گیرد و فقط «زمانِ مرده» تولید می‌کند. */
  function minChunkOf(kind) {
    return (DEFAULTS.MIN_CHUNK[kind] != null ? DEFAULTS.MIN_CHUNK[kind] : DEFAULTS.MIN_BLOCK);
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
      emergency: 'آیتم اضطراری',
      routine: 'روال ثابت روز',
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
      emergency: 'بلوک حتمیِ کاربر — اولویت مطلق روی بقیهٔ روز',
      routine: 'روال ثابت روز (غیرقابل جابه‌جایی)',
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
    if (t.kind === 'emergency') return 'آیتم اضطراری: همین موضوع را تا آخر تمام کن و بقیهٔ برنامه بعد از آن بازچینی می‌شود';
    if (t.kind === 'routine') return 'روال ثابت روز — برنامه دور آن چیده می‌شود و جابه‌جا نمی‌شود';
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
      emergency: 'آیتم اضطراری را خودت «حتمی» کرده‌ای؛ برنامه آن را در اولین فرصتِ واقعی می‌گذارد و بقیه را دور آن بازچینی می‌کند تا از ذهنت بیرون نرود.',
      routine: 'وعده‌های غذایی و روال روز، سوختِ تمرکزند؛ برنامه آن‌ها را ثابت نگه می‌دارد و فقط اطرافشان می‌چیند.',
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

  /* ------------------------------------------------------------------ */
  /* حالت خودکار: انتخاب ساعت روزانه با آزمون واقعی برنامه                */
  /* ------------------------------------------------------------------ */

  /**
   * در حالت «خودکار» کاربر فقط سقف روزانه را می‌دهد. تخمینِ صرفِ «نیاز ÷ روزها»
   * دقیق نیست (بلوک‌های ثابت روز، مرورها، رَمپ‌آپ و آزمون‌ها سهم می‌برند)، پس
   * برنامه را چند بار با ساعت‌های مختلف می‌سازیم و کم‌ترین ساعتی را برمی‌داریم
   * که پوشش فصل‌ها را به هدف برساند (یا اگر نشد، سقف کاربر).
   */
  function createPlan(rawConfig) {
    const raw = rawConfig || {};
    if (raw.timeMode !== 'auto') return buildPlan(raw);

    const cap = clamp(Number(raw.dailyCapHours) || 10, 1, 16);
    const floorH = clamp(Number(raw.dailyFloorHours) || 1, 0.5, 8);
    const TARGET = 98;
    const MAX_BUILDS = 8;
    const tried = [];
    const cache = {};
    const build = (hVal) => {
      if (cache[hVal]) return cache[hVal];
      const plan = buildPlan(Object.assign({}, raw, {
        timeMode: 'fixed', availability: nullModeAvailability(hVal, raw.restDay),
      }));
      cache[hVal] = plan;
      tried.push({ hours: hVal, coverage: plan.summary.coverage.coverageRatio });
      return plan;
    };
    const covOf = (hVal) => build(hVal).summary.coverage.coverageRatio;

    /* ۱) بالا رفتن از کف تا رسیدن به هدف یا سقف */
    let lo = floorH;          // «کافی نیست» (یا همان کف)
    let hi = null;            // «کافی است»
    let h = floorH;
    for (let i = 0; i < MAX_BUILDS; i += 1) {
      const cov = covOf(h);
      if (cov >= TARGET) { hi = h; break; }
      lo = h;
      if (h >= cap) break;
      const linear = h * (TARGET / Math.max(1, cov));
      h = Math.min(cap, Math.max(h + 0.5, Math.round(linear * 2) / 2));
    }
    /* ۲) ریز‌تنظیم: کم‌ترین ساعتی که کافی است (دقت ۰٫۵ ساعت) */
    if (hi != null) {
      while (tried.length < MAX_BUILDS && hi - lo > 0.5) {
        const mid = Math.round(((lo + hi) / 2) * 2) / 2;
        if (mid <= lo || mid >= hi) break;
        if (covOf(mid) >= TARGET) hi = mid; else lo = mid;
      }
    }
    const chosen = hi != null ? hi : h;
    const best = build(chosen);
    const cov = best.summary.coverage.coverageRatio;
    const failed = Array.isArray(raw.__failures) ? raw.__failures : [];

    const autoInfo = {
      mode: 'auto',
      chosenHours: chosen,
      capHours: cap,
      floorHours: floorH,
      coverage: cov,
      achieved: cov >= TARGET,
      cappedByUser: cov < TARGET && chosen >= cap,
      builds: tried.length,
      tried,
      needHours: best.summary.coverage.needMinutes ? Math.round((best.summary.coverage.needMinutes / 60) * 10) / 10 : null,
      studyDays: best.days.filter((d) => !d.isRestDay).length,
    };
    if (!autoInfo.achieved) {
      const autoDiag = {
        id: 'auto-capped',
        level: 'warn',
        step: 'step-2',
        field: 'dailyCap',
        title: 'با سقف ' + toFa(cap) + ' ساعت در روز پوشش کامل نشد (پوشش ' + toFa(cov) + '٪)',
        detail: 'برنامه تا سقفی که گذاشتی بالا رفت (' + toFa(chosen) + ' ساعت در روز) ولی برای پوشش کامل ' +
          'همهٔ فصل‌ها جا کم است.',
        fix: 'سقف را کمی بالا ببر، یا چند فصل کم‌ضریب را عقب بینداز، یا تعداد روزهای مطالعه را زیاد کن.',
      };
      best.summary.diagnostics = (best.summary.diagnostics || []).concat([autoDiag]);
      best.summary.warnings = (best.summary.warnings || []).concat([autoDiag.detail]);
      if (best.summary.coverage && best.summary.coverage.diagnostics) {
        best.summary.coverage.diagnostics = best.summary.coverage.diagnostics.concat([autoDiag]);
      }
    }
    best.summary.timeMode = 'auto';
    best.summary.autoInfo = autoInfo;
    if (best.meta.config) {
      best.meta.config.timeMode = 'auto';
      best.meta.config.dailyCapHours = cap;
      best.meta.config.dailyFloorHours = floorH;
      best.meta.config.autoHours = autoInfo.chosenHours;
    }
    /* یادداشت مربی: چرا این ساعت انتخاب شد */
    best.summary.coachNotes = ['حالت خودکار: برنامه خودش ساعت لازم را حساب کرد — ' +
      toFa(chosen) + ' ساعت در روز (سقف تو: ' + toFa(cap) + ' ساعت · پوشش ' + toFa(cov) + '٪).' +
      (autoInfo.cappedByUser
        ? ' با سقفی که گذاشتی پوشش کامل نشد؛ اگر می‌توانی سقف را بالا ببر یا چند فصل کم‌ضریب را عقب بینداز.'
        : ' هر روز هم همین ساعت را در «برنامهٔ من» می‌بینی.')].concat(best.summary.coachNotes || []);
    void failed;
    return best;
  }

  /** توزیع ساعت خودکار روی روزهای هفته (روز استراحت صفر) */
  function nullModeAvailability(hours, restDay) {
    const out = {};
    WEEKDAY_KEY.forEach((k, i) => { out[k] = (Number(restDay) === i) ? 0 : hours; });
    return out;
  }

  function buildPlan(rawConfig) {
    const cfg = normalizeConfig(rawConfig);
    /* ۲.۸.۱۲: اهمیتِ فصل‌ها با ضریبِ همان رشته محاسبه می‌شود
       (زیستِ تجربی ≠ زیست در رشتهٔ دیگر) */
    try { CW.setField(cfg.student && cfg.student.field); } catch (e) { /* بی‌صدا */ }
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
        /* بارم واقعیِ نهایی: درس‌هایی که بارم بین فصل‌هایشان نامتوازن است
           (مثل فیزیک ۳ با ۶٫۵ نمره در فصل نوسان) زمان بیشتری می‌خواهند. */
        const fb = CW.finals(c.id, c.grade) || null;
        const baram = fb && Array.isArray(fb.baram) && fb.baram.length ? fb.baram.slice() : null;
        const baramSum = baram ? sum(baram) : 0;
        const baramAvg = baram && baram.length ? baramSum / baram.length : 0;
        const concentration = baramAvg > 0 ? (Math.max.apply(null, baram) / baramAvg) : 1;
        const finalsMult = clamp(0.88 + 0.12 * concentration, 0.88, 1.25);
        const need = Math.round(Math.max(0, Math.round(
          Math.max(0, c.target - cur) * (DEFAULTS.FINALS_MIN_PER_POINT) * (c.influence / 3)) * finalsMult));
        return {
          id: 'fin.' + c.id, finalId: c.id, subjectId: 'fin.' + c.id, subjectName: c.name,
          label: 'نمونه‌سؤال و مرور ' + c.name,
          weight: c.influence, mastery: Math.round((cur / 20) * 100),
          current: cur, target20: c.target, assumed: c.assumed,
          needMinutes: need, initialNeedMinutes: Math.max(1, need),
          plannedMinutes: 0, mode: 'finals', reviews: [], read: true, chapter: 0,
          testsNeed: 0, testsDone: 0, learnedOn: null, doneDate: null,
          finalsBaram: baram, finalsBaramSum: baramSum, finalsUniform: fb ? Boolean(fb.uniform) : true,
          finalsSource: fb ? fb.source : null, finalsApprox: fb ? Boolean(fb.approx) : false,
          finalsMethod: CW.finalsMethod(c.id, c.grade),
          finalsChapters: CW.finalsTable(c.id, c.grade),
          finalsMult: Math.round(finalsMult * 100) / 100,
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
    /* هشدارهای ساخت‌یافته: هر مورد «چرا» + «چطور درستش کنم» + «کدام قدم» را دارد
       تا رابط کاربری بتواند کاربر را مستقیم به همان فیلد ببرد. */
    const diagnostics = [];
    const diag = (d) => {
      warnings.push(d.detail);
      diagnostics.push(Object.assign({ level: 'warn' }, d));
    };
    const notes = [];
    let learnedCount = 0;
    let unplacedTotal = 0;
    let yesterdayLearned = [];
    let capacityTotal = 0;
    const initialNeedTotal = sum(topics.map((t) => t.initialNeedMinutes));

    /* ---------------- حالت خودکار: برنامه خودش ساعت لازم را تعیین می‌کند ----------------
       کاربر فقط «سقف» را می‌دهد؛ اینجا از دل نیاز واقعی (فصل‌های خوانده‌نشده + جبران +
       ارتقا + سوابق + کار عقب‌افتاده) و روزهای واقعیِ در دسترس، ساعت روزانهٔ لازم
       حساب می‌شود و بین کف و سقفِ کاربر می‌نشیند. بعد از آن، کل موتور مثل حالت دستی
       کار می‌کند (روی پنجرهٔ آزاد هر روز و کلاس‌های ثابت). */
    if (cfg.timeMode === 'auto') {
      const restKey = cfg.restDay !== 7 ? WEEKDAY_KEY[cfg.restDay] : null;
      let studyDayCount = 0;
      for (let i = 0; i < totalDays; i += 1) {
        const dt = addDays(cfg._start, i);
        if (restKey && WEEKDAY_KEY[persianWeekday(dt)] === restKey) continue;
        const off = cfg.offDates.find((o) => o.date === isoDay(dt) && o.kind === 'halt');
        if (off) continue;
        studyDayCount += 1;
      }
      studyDayCount = Math.max(1, studyDayCount);
      const needMinutes = sum(topics.map((t) => Math.max(0, t.needMinutes))) +
        sum(finalTopics.map((t) => t.needMinutes)) + sum(carryTopics.map((t) => t.needMinutes));
      /* سهم مرور/تست/آزمون: ~۳۵٪ زمان اضافه لازم است تا فصل خوانده‌شده فراموش نشود */
      const REVIEW_OVERHEAD = 0.35;
      /* رَمپ‌آپ هفته‌های اول بار را کم می‌کند؛ برای برآورد واقع‌بینانه ~۱۲٪ بیشتر حساب می‌کنیم */
      const rampCompensation = 1.12;
      const perDayMinutes = (needMinutes * (1 + REVIEW_OVERHEAD) * rampCompensation) / studyDayCount;
      const rawHours = perDayMinutes / 60;
      const hours = clamp(Math.round(rawHours * 2) / 2, cfg.dailyFloorHours, cfg.dailyCapHours);
      WEEKDAY_KEY.forEach((k) => {
        cfg.availability[k] = (restKey && k === restKey) ? 0 : hours;
      });
      cfg._autoInfo = {
        mode: 'auto',
        needHours: Math.round((needMinutes / 60) * 10) / 10,
        studyDays: studyDayCount,
        rawHours: Math.round(rawHours * 10) / 10,
        hours,
        capHours: cfg.dailyCapHours,
        floorHours: cfg.dailyFloorHours,
        cappedByUser: rawHours > cfg.dailyCapHours,
        raisedToFloor: rawHours < cfg.dailyFloorHours,
      };
      refreshTestTarget(cfg);
    }
    let classFixBacklog = []; // تثبیت کلاس‌هایی که همان روز جا نشدند
    const emPlaced = new Set();   // آیتم‌های اضطراریِ چیده‌شده
    const emReport = [];
    let lastMissSweep = -1;

    /* فشار مهلت یک درس در یک روز: نسبت «دقیقهٔ لازم در روز» به ظرفیت واقعی */
    /** سهم لازم امروزِ هر درس از مهلتش: (کار ماندهٔ مهلت) ÷ (روزهای مانده)
        این عدد «کف تعهد روز» است؛ اگر برنامه کمتر از این به درس بدهد،
        مهلت با تأخیر تمام می‌شود (همان چیزی که در گزارش «دیر می‌شود» می‌داد). */
    function deadlineReserve(dayIndex) {
      const out = {};
      Object.keys(dlPerSubject).forEach((id) => {
        const d = dlPerSubject[id];
        const left = Math.max(0, d.idx - dayIndex + 1);
        let remain = 0;
        (learnBySubject[id] || []).forEach((t) => {
          if (t.deadlineIdx != null && t.deadlineIdx <= d.idx) remain += Math.max(0, t.needMinutes);
        });
        if (remain <= 0) return;
        /* هرچه به مهلت نزدیک‌تر، سهم روزانه بیشتر می‌شود (شتاب پایانی) */
        const urgency = left <= (cfg.PRE_EXAM_DAYS || DEFAULTS.PRE_EXAM_DAYS) * 2 ? 1.6 : 1;
        out[id] = Math.ceil((remain / Math.max(1, left)) * urgency);
      });
      return out;
    }

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
          variety: { subjects: 0, topShare: 0, list: [] },
          note: 'خارج از برنامه — تعطیل کامل' + (off.note ? ' (' + off.note + ')' : ''),
        });
        continue;
      }
      const isLightDay = !!(off && off.kind === 'light');
      const lightFactor = isLightDay ? (cfg.LIGHT_DAY_RATIO || DEFAULTS.LIGHT_DAY_RATIO) : 1;

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

      /* ---- ۰.۵) آیتم‌های اضطراری (کاربر گفته «این باید بشود») ----
         رویداد ثابت با اولویت مطلق: ساعت خواسته‌شده، و اگر با کلاس/روال ثابت برخورد داشت
         اولین فرصتِ آزادِ بعد از آن. برنامهٔ بقیهٔ روز دور همین بلوک بازچینی می‌شود. */
      cfg.emergency.forEach((em) => {
        if (emPlaced.has(em.id)) return;
        if (em.scope === 'today' && em.date !== iso) return;
        if (!segments.length) return;
        const want = em.time ? minutesSinceMidnight(em.time) : null;
        let pick = null;
        segments.forEach((sg) => {
          if (pick) return;
          const from = want != null ? Math.max(sg.start, want) : sg.start;
          if (sg.end - from >= Math.min(em.minutes, 30)) {
            pick = { start: from, end: Math.min(sg.end, from + em.minutes) };
          }
        });
        if (!pick) return;
        emPlaced.add(em.id);
        const subj = cfg.subjects.find((x) => x.id === em.subjectId) || null;
        const label = em.chapter ? ((subj ? subj.name + ' · ' : '') + 'فصل ' + toFa(em.chapter)) : (em.title || 'آیتم اضطراری');
        tasks.push({
          kind: 'emergency',
          subjectId: em.subjectId || 'EMERGENCY',
          subjectName: em.title || (subj ? subj.name : 'آیتم اضطراری'),
          topicLabel: label,
          minutesLeft: Math.max(20, pick.end - pick.start),
          priority: 900,
          emergencyId: em.id,
          fixed: { start: pick.start, end: pick.end },
        });
        emReport.push({
          id: em.id, title: label, scope: em.scope, date: iso,
          start: fmtHM(pick.start), end: fmtHM(pick.end), minutes: pick.end - pick.start,
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

      /* ---- ۴) آزمون‌های دوره‌ای (هر روز هفته، هر N هفته، چند آزمون در یک روز) ---- */
      const hasManualExamToday = busy.some((b) => b.type === 'exam');
      const weekNo = Math.floor(dayIndex / 7);
      /* ۲.۸.۹: روز استراحت هفتگی حق آزمون‌چیدن هم ندارد — قبلاً ۳۰ دقیقه آزمون + گرم‌کردن
         روی همان روز می‌نشست و «روز استراحت» را نقض می‌کرد. */
      const isRestToday = cfg.restDay !== 7 && wd === cfg.restDay;
      const todaysMocks = (!isFinalExam && dayIndex > 5 && daysLeft > 3 && !hasManualExamToday && !isRestToday)
        ? cfg.weeklyMocks.filter((m) => m.day === wd && (weekNo % m.everyNWeeks) === 0)
        : [];
      const isMockDay = todaysMocks.length > 0;
      let occupiedUntil = -1;   // آزمون‌های ثابت همان روز نباید روی هم بیفتند
      const orderedMocks = todaysMocks.slice().sort((a, b) =>
        (a.start ? minutesSinceMidnight(a.start) : 9999) - (b.start ? minutesSinceMidnight(b.start) : 9999));
      let mockMinutesUsed = 0;
      orderedMocks.forEach((m, mi) => {
        /* مجموع آزمون‌های یک روز از ۸۰٪ ظرفیت آن روز بیشتر نشود (بقیه باید بماند برای درس) */
        const room = Math.max(45, Math.round(load.minutes * 0.8) - mockMinutesUsed);
        const dur = Math.max(30, Math.min(m.minutes, room));
        mockMinutesUsed += dur;
        const subjects = m.subjectIds && m.subjectIds.length
          ? m.subjectIds.map((id) => (cfg.subjects.find((x) => x.id === id) || {}).name).filter(Boolean)
          : [];
        const task = {
          kind: 'mock', subjectId: 'MOCK', subjectName: m.title,
          topicLabel: subjects.length ? subjects.join('، ') : 'همه دروس',
          minutesLeft: dur, priority: 480 - mi,
          practiceCount: Math.round(dur * 0.8),
        };
        if (m.start) {
          let st = minutesSinceMidnight(m.start);
          if (st < occupiedUntil) st = occupiedUntil + 15;      // پشت سر هم، نه روی هم
          occupiedUntil = st + dur;
          task.fixed = { start: st, end: st + dur };
        }
        tasks.push(task);
      });
      if (isMockDay) {
        tasks.push({
          kind: 'analysis', subjectId: 'MOCK', subjectName: 'تحلیل آزمون ' + todaysMocks[0].title,
          topicLabel: 'دفتر اشتباهات',
          minutesLeft: Math.round(Math.max(minChunkOf('analysis'),
            Math.min(cfg.MOCK_ANALYSIS_MIN, Math.max(20, load.minutes * 0.3)))), priority: 470,
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
          minutesLeft: Math.round(Math.max(minChunkOf('cumreview'),
            Math.min(cfg.CUM_REVIEW_MIN || DEFAULTS.CUM_REVIEW_MIN,
              Math.max(20, Math.round(load.minutes * (learnBacklog > 60 ? 0.12 : 0.25)))))),
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
        /* round-robin: درس‌هایی که در بازهٔ نهایی کمتر دیده شده‌اند اول می‌آیند
           تا هر ۱۰ درس (نه ۸ درس) در خرداد جلسه بگیرند. */
        const served = (t) => (t.finalsServed || 0);
        finalTopics.filter((t) => t.needMinutes > 0)
          .sort((a, b) => (served(a) - served(b)) || (b.needMinutes - a.needMinutes) || (b.weight - a.weight))
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
            ft.finalsServed = (ft.finalsServed || 0) + 1;
          });
      }

      /* ---- ۵) تحلیل پس از آزمون آزمایشی ---- */
      if (hasManualExamToday) {
        const examEv = busy.find((b) => b.type === 'exam');
        tasks.push({
          kind: 'analysis', subjectId: 'EXAM', subjectName: 'تحلیل آزمون آزمایشی',
          topicLabel: 'دفتر اشتباهات',
          minutesLeft: Math.round(Math.max(minChunkOf('analysis'), Math.min(cfg.POST_EXAM_ANALYSIS_MIN, 40))), priority: 460,
          afterMin: (examEv ? examEv.end : 0) + (cfg.CLASS_GAP_MIN || DEFAULTS.CLASS_GAP_MIN),
        });
      }

      /* ---- ۶) یادگیری جدید ---- */
      const subjectUsedToday = {};
      /* ۲.۸.۱۳: شمارشِ «چند جلسهٔ یادگیری از هر کتاب امروز» — سقفِ سختِ
         MAX_LEARN_SESSIONS_PER_SUBJECT که با capRelax شل نمی‌شود و در فراخوانی‌های
         متعددِ addLearnChunks همان روز ریست نمی‌شود. شواهد: چهار جلسهٔ پشت‌سرهم
         از یک کتاب = یادگیریِ فشرده (massed) که در Rohrer & Taylor (2007) و
         Cepeda et al. (2006) بازدهٔ کمتری از تمرینِ توزیع‌شده دارد. */
      const sessionsToday = {};
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

      const addLearnChunks = (budget, opts) => {
        /* ۲.۸.۱۳: سقفِ جلسهٔ هر کتاب در روز ۲ است؛ اما در «پر کردنِ ظرفیتِ باقی‌مانده»
           اگر روز از قبل تنوعِ کافی دارد (۳ کتاب یا بیشتر در بلوک‌ها)، یک جلسهٔ سوم هم
           مجاز است تا وقتِ اعلامیِ دانش‌آموز هدر نرود. */
        const sessionCap = (opts && opts.relaxSessions)
          ? DEFAULTS.MAX_LEARN_SESSIONS_PER_SUBJECT + 1
          : DEFAULTS.MAX_LEARN_SESSIONS_PER_SUBJECT;
        /* ۲.۸.۱۱: سقف درسِ واحد در روز از ۵۰٪ به ۳۵٪ آمد. یک درس نباید نیمی از روز را
           ببلعد؛ شواهد «تمرین درهم» (Rohrer 2007؛ Kornell & Bjork 2008) می‌گوید
           چرخش بین درس‌ها هم بازده یادگیری را بالا می‌برد و هم از یکنواختی می‌کاهد. */
        const perSubjectCap = Math.max(cfg.blockMinutes, Math.round(load.minutes * (daysLeft <= 7 ? 0.3 : 0.35)));
        /* ۲.۸.۱۳: در روز کوتاه (کمتر از ~۱۰۰ دقیقهٔ بار) اگر بیش از یک درس مبحثِ
           نخوانده دارد، بلوکِ یادگیری نصفِ ظرفیت می‌شود تا روز دو کتاب بگیرد؛
           وگرنه یک بلوکِ ۴۵ دقیقه‌ای + یک مرورِ ۱۵ دقیقه‌ای، ۷۵٪ روز را یک‌کتابی می‌کرد. */
        const learnableSubjects = Object.keys(learnBySubject)
          .filter((id) => (learnBySubject[id] || []).some((t) => (!scope || scope.has(t.subjectId)) && t.needMinutes > 0));
        /* اگر بودجهٔ یادگیریِ امروز به دو بلوکِ کاملِ درسِ‌متعارف نمی‌رسد، بلوک‌ها
           نصف می‌شوند تا حداقل دو کتابِ متفاوت در روز دیده شود (تنوعِ بین‌کتابی). */
        const splitShortDay = learnableSubjects.length > 1
          && (tinyDay || (budget >= 2 * DEFAULTS.MIN_CHUNK.learn && budget < cfg.blockMinutes * 1.6));
        /* در روزِ کوتاه، بلوکِ یادگیری «نصفِ بودجه» می‌شود تا دو درس جا شوند */
        const learnBlock = splitShortDay
          ? Math.max(DEFAULTS.MIN_CHUNK.learn, Math.min(cfg.blockMinutes, Math.floor(budget / 2)))
          : cfg.blockMinutes;
        /* درس‌هایی که امروز «گرم‌کردن/مرور دیروز» گرفته‌اند — یادگیریِ تازه به درس دیگر برود */
        const warmupSubjects = new Set(tasks.filter((t) => t.kind === 'warmup' || t.kind === 'review').map((t) => t.subjectId));
        /* کف تعهد روزانهٔ هر درس بابت مهلت‌هایش */
        const reserve = deadlineReserve(dayIndex);
        let used = 0;
        let guard = 0;
        /* ۲.۸.۱۱: سقفِ سهمِ هر درس در روز، «ترجیح» است نه «قید مطلق».
           اگر همهٔ درس‌ها به سقف رسیدند ولی بودجهٔ یادگیری هنوز مانده، سقف شل می‌شود
           تا زمانِ یادگیری هدر نرود و پوشش فصل‌ها پایین نیاید. */
        let capRelax = 1;
        while (used < budget && guard++ < 40) {
          // درس را بر اساس کمترین نسبت «زمان داده‌شده ÷ سهم هدف» انتخاب کن
          let chosenId = null;
          let chosenDeficit = -Infinity;
          /* اولویت مطلق: درسی که امروز هنوز به کف تعهدِ مهلتش نرسیده */
          let dueId = null;
          let dueGap = 0;
          Object.keys(reserve).forEach((id) => {
            const q = (learnBySubject[id] || []).filter((t) => !scope || scope.has(t.subjectId));
            if (!q.length) return;
            const gap = reserve[id] - (subjectUsedToday[id] || 0);
            if (gap > 0 && gap > dueGap) { dueGap = gap; dueId = id; }
          });
          Object.keys(learnBySubject).forEach((id) => {
            const q = learnBySubject[id].filter((t) => !scope || scope.has(t.subjectId));
            if (!q.length) return;
            const take = Math.min(learnBlock, q[0].needMinutes);
            /* درس دارای مهلت نزدیک: سقف روزانه‌اش بازتر است */
            const capBoost = 1 + 0.6 * Math.min(1, deadlinePressure(id, dayIndex, load.minutes))
              + (dueId === id ? 1.2 : 0);
            if ((subjectUsedToday[id] || 0) + take > perSubjectCap * capBoost * capRelax) return;
            /* سقفِ سختِ تعداد جلسه از یک کتاب در یک روز (تنوعِ درون‌روزی) */
            if ((sessionsToday[id] || 0) >= sessionCap) return;
            /* فشار مهلت: درسی که باید تا تاریخ مشخصی تمام شود، سهم بیشتری می‌گیرد */
            const pressure = deadlinePressure(id, dayIndex, load.minutes);
            const target = Math.max(1, (stats[id] ? stats[id].share : 0) * learnNeedTotal * (1 + 1.8 * pressure));
            let ratio = (learnSpent[id] || 0) / target;
            /* تنوع: اگر این درس امروز جلسه گرفته و درسِ دیگری هم در انتظار است،
               نوبت به آن یکی می‌رسد (به‌جز روزهایی که مهلتش فوریت دارد). */
            const othersWaiting = Object.keys(learnBySubject).some((oid) => oid !== id
              && learnBySubject[oid].length
              && (!scope || learnBySubject[oid].some((t) => scope.has(t.subjectId)))
              && (subjectUsedToday[oid] || 0) < perSubjectCap);
            if (othersWaiting && (subjectUsedToday[id] || 0) > 0 && pressure < 0.5) ratio += 0.6;
            if (-ratio > chosenDeficit) { chosenDeficit = -ratio; chosenId = id; }
          });
          /* ۲.۸.۱۱: درسِ یادگیریِ امروز نباید همان درسِ «گرم‌کردن/مرور دیروز» باشد؛
             وگرنه کل روز حولِ یک کتاب می‌چرخد و یکنواخت می‌شود. */
          if (chosenId && warmupSubjects.has(chosenId)) {
            let alt = null; let altDeficit = -Infinity;
            Object.keys(learnBySubject).forEach((id) => {
              if (id === chosenId || warmupSubjects.has(id)) return;
              if (!learnBySubject[id].length) return;
              if (!scope || !learnBySubject[id].some((t) => scope.has(t.subjectId))) return;
              const t2 = Math.min(learnBlock, learnBySubject[id][0].needMinutes);
              if ((subjectUsedToday[id] || 0) + t2 > perSubjectCap * 1.6) return;
              if ((sessionsToday[id] || 0) >= DEFAULTS.MAX_LEARN_SESSIONS_PER_SUBJECT && Object.keys(learnBySubject)
                .some((oid) => oid !== id && (learnBySubject[oid] || []).length)) return;
              const p2 = deadlinePressure(id, dayIndex, load.minutes);
              const target2 = Math.max(1, (stats[id] ? stats[id].share : 0) * learnNeedTotal * (1 + 1.8 * p2));
              const d2 = -((learnSpent[id] || 0) / target2);
              if (d2 > altDeficit) { altDeficit = d2; alt = id; }
            });
            if (alt && deadlinePressure(chosenId, dayIndex, load.minutes) < 0.5) chosenId = alt;
          }
          if (!chosenId) {
            /* سقفِ تنوع، زمانِ یادگیری را نمی‌بلعد: یک پله شل کن و دوباره امتحان کن */
            if (capRelax < 2.6 && used < budget - minChunkOf('learn')) { capRelax *= 1.6; continue; }
            break;
          }
          /* اگر درسی به کف تعهد مهلتش نرسیده، همین حالا نوبتش است — ولی سقفِ
             سختِ تنوع (تعداد جلسه/دقیقهٔ همان کتاب در همین روز) با این استثنا
             نقض نمی‌شود؛ وگرنه یک کتاب سه‌چهار جلسهٔ روز را می‌بلعد. */
          if (dueId && learnBySubject[dueId] && learnBySubject[dueId].length) {
            const qd = learnBySubject[dueId].filter((t) => !scope || scope.has(t.subjectId));
            const takeDue = Math.min(learnBlock, qd.length ? qd[0].needMinutes : 0);
            const capDue = perSubjectCap * (1 + 0.6 * Math.min(1, deadlinePressure(dueId, dayIndex, load.minutes)) + 1.2) * capRelax;
            const otherReady = Object.keys(learnBySubject).some((oid) => oid !== dueId
              && (learnBySubject[oid] || []).length
              && (!scope || learnBySubject[oid].some((t) => scope.has(t.subjectId))));
            const sessOk = (sessionsToday[dueId] || 0) < sessionCap;
            if (sessOk && (subjectUsedToday[dueId] || 0) + takeDue <= capDue) chosenId = dueId;
          }
          const topic = learnBySubject[chosenId][0];

          /* ── اندازهٔ جلسه: عدد صحیح، دست‌کم ۳۰ دقیقه ──
             منطق: ۱) جلسهٔ یادگیری نباید از ۳۰ دقیقه کمتر باشد (کمتر = تکه‌تکه‌شدن و
             هزینهٔ تعویض بافت بدون پیشرفت واقعی). ۲) اگر بودجهٔ امروز کمتر از ۳۰ دقیقه
             مانده است، یادگیری را قطع می‌کنیم تا بقیهٔ وقت صرف مرور/تست شود.
             ۳) اگر از خودِ فصل کمتر از ۳۰ دقیقه مانده، آن را «باقی‌مانده» نگه می‌داریم
             تا فردا به‌صورت یک جلسهٔ کامل بیاید — نه یک بلوک ۸ دقیقه‌ای. */
          const minChunk = (DEFAULTS.MIN_CHUNK[topic.mode === 'reteach' ? 'reteach' : topic.mode === 'boost' ? 'boost' : 'learn'])
            || DEFAULTS.MIN_CHUNK.learn;
          const budgetLeft = Math.floor(budget - used);
          let remainingNeed = Math.round(topic.needMinutes);
          if (budgetLeft < minChunk) break;
          if (remainingNeed < minChunk) {
            /* باقی‌ماندهٔ ناچیز: فصل را همین‌جا کامل‌شده حساب می‌کنیم (نه بلوک ۱۳ دقیقه‌ای) */
            if (remainingNeed <= 12) {
              /* بستنِ فصل فقط وقتی «کامل» است که کفِ واقع‌گرایانه‌اش را گرفته باشد.
                 اگر جمعِ یادگیری کمتر از ۹۰ دقیقه شده (چون بودجهٔ روز جلسه‌ها را
                 کوتاه کرده)، یک جلسهٔ کوتاهِ کاملِ دیگر می‌گیرد تا فصل با ۷۸ از ۹۰
                 دقیقه «خوانده‌شده» حساب نشود. */
              const givenSoFar = Math.round((topic.initialNeedMinutes || 0) - remainingNeed);
              const floorMin = DEFAULTS.MIN_CHAPTER_LEARN_MIN || 90;
              if ((topic.learnStarted || givenSoFar > 0) && givenSoFar + remainingNeed < floorMin - 12) {
                topic.needMinutes = minChunk;
                break;
              }
              learnBySubject[chosenId].shift();
              topic.needMinutes = 0;
              topic.learnedOn = date;
              topic.shortTail = true;
              learnedCount++;
              const li0 = learnQueue.indexOf(topic);
              if (li0 !== -1) learnQueue.splice(li0, 1);
              scheduleReviews(topic, date);
              continue;
            }
            /* باقی‌ماندهٔ ۱۳ تا ۲۹ دقیقه: نه بلوکِ مستقل می‌شود، نه فصل را می‌بندیم.
               فصلِ شروع‌شده را به یک جلسهٔ کاملِ کوتاه (۳۰ دقیقه) می‌رسانیم تا جمعِ
               یادگیری‌اش از کفِ واقع‌گرایانه (۹۰ دقیقه) پایین‌تر نماند. */
            if (topic.learnStarted || (topic.testsDone || 0) > 0) {
              topic.needMinutes = minChunk;
              break;
            }
            /* فصلِ هرگز‌خوانده‌نشده‌ای که فقط ۱۴ دقیقه بودجه دارد، در واقع خوانده نشده است.
               پیش از این اینجا `break` می‌شد و صفِ کلِ آن درس تا آخر سال قفل می‌ماند.
               حالا فصل به یک جلسهٔ کاملِ واقعی برمی‌گردد. */
            topic.needMinutes = Math.max(minChunk, cfg.blockMinutes);
            remainingNeed = Math.round(topic.needMinutes);
          }
          let chunk = Math.min(learnBlock, remainingNeed, budgetLeft);
          chunk = Math.round(chunk);
          if (chunk < minChunk) break;
          tasks.push({
            kind: topic.mode === 'reteach' ? 'reteach' : topic.mode === 'boost' ? 'boost' : 'learn',
            subjectId: topic.subjectId, subjectName: topic.subjectName,
            topicLabel: topic.label, topic, minutesLeft: chunk,
            priority: topic.mode === 'reteach' ? 290 : topic.mode === 'boost' ? 270 : 250,
            practiceCount: topic.mode === 'boost' ? Math.max(10, roundTo5(chunk / 3)) : null,
          });
          used += chunk;
          subjectUsedToday[topic.subjectId] = (subjectUsedToday[topic.subjectId] || 0) + chunk;
          sessionsToday[topic.subjectId] = (sessionsToday[topic.subjectId] || 0) + 1;
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
      /* سهم تست = همان چیزی که برای رسیدن به هدف تستِ امروز لازم است،
         ولی هرگز بیشتر از ۴۰٪ روز (بقیه مال یادگیری است). */
      const targetTodayReserve = Math.round((cfg.testTarget.daily || 0) *
        clamp(load.minutes / 240, 0.4, 1.4) * 2.0);        // ~۲ دقیقه برای هر تست
      /* ۲.۸.۱۳: در روزِ بسیار کوتاه (کمتر از ~۱۰۰ دقیقه) کنارگذاشتنِ ۳۰ دقیقه
         «سهم تست» عملاً یعنی نصفِ روز؛ آن‌وقت فقط یک بلوکِ ۴۵ دقیقه‌ای جا می‌شود و
         روز یک‌کتابی می‌شود. در این روزها تست داخلِ همان بلوک‌های یادگیری می‌آید
         (تثبیت + تستِ همان فصل) و ظرفیت به دو درسِ متفاوت می‌رسد. */
      /* ۲.۸.۱۳: در روزِ کوتاه (کمتر از ~۱۰۰ دقیقه) کنارگذاشتنِ ۳۰ دقیقه «سهم تست»
         عملاً یعنی نصفِ روز؛ آن‌وقت فقط یک بلوکِ ۴۵ دقیقه‌ای جا می‌شود و روز
         یک‌کتابی می‌ماند. در این روزها تست داخلِ همان بلوک‌های یادگیری می‌آید
         (تثبیت + بازیابیِ همان فصل) و ظرفیت به دو درسِ متفاوت می‌رسد. */
      /* آستانه بر اساس «چند بلوکِ واقعی در روز جا می‌شود»: دو بلوک یادگیری به‌علاوهٔ
         یک بلوک تمرین/تست. کمتر از این، روز عملاً فقط یک کتاب می‌گیرد. */
      const tinyDay = load.minutes < 105;
      const testReserve = (isFinalExam || !cfg.testTarget.daily || tinyDay) ? 0
        : Math.round(Math.min(load.minutes * (inFinals ? 0.30 : finalPhase ? 0.32 : 0.40),
          Math.max(load.minutes * 0.18, targetTodayReserve)) *
          (backlogRatio > 0.7 ? 0.75 : 1));
      if (!isFinalExam && !noNewLearning) {
        /* بودجهٔ یادگیری هرگز از ظرفیتِ باقی‌ماندهٔ روز (پس از مرورها/کلاس‌ها) بیشتر
           نمی‌شود؛ وگرنه بلوکی ساخته می‌شود که جا نمی‌گیرد و به «زمانِ جا‌نگرفته»
           تبدیل می‌شود (سنجهٔ بسته‌بندی در شبیه‌سازی سال). */
        const spareBeforeLearn = Math.max(0, load.minutes - sum(tasks.map((t) => t.minutesLeft || 0)));
        const learnBudget = tinyDay
          ? Math.min(load.minutes, Math.max(2 * DEFAULTS.MIN_CHUNK.learn, Math.round(load.minutes * learnBudgetRatio)))
          : Math.max(45, load.minutes * learnBudgetRatio - testReserve);
        addLearnChunks(Math.max(0, Math.min(learnBudget, spareBeforeLearn)));
      }
      /* «مرور ۲۴ساعته» فقط برای فصل‌هایی که واقعاً امروز خوانده می‌شوند ساخته می‌شود.
         این فهرست پایین‌تر — بعد از چیده‌شدنِ بلوک‌ها — از بلوک‌های واقعی پر می‌شود.
         (پیش از این از تسک‌های «ساخته‌شده» پر می‌شد؛ اگر بلوک جا نمی‌شد، فردا از
         فصلی که هرگز خوانده نشده «مرور» می‌خواست.) */
      yesterdayLearned = [];

      /* ---- ۷) پر کردن ظرفیت باقی‌مانده با تمرین درهم ---- */
      const plannedSoFar = sum(tasks.map((t) => t.minutesLeft));
      let spare = load.minutes - plannedSoFar;
      /* تا وقتی مبحث نخوانده جدی مانده، تمرین فقط تا سقفِ سهمِ تست اضافه می‌شود؛
         وقتی یادگیری جلو افتاد، ظرفیت آزاد با تمرین پر می‌شود (روزهای پشت‌کنکوری). */
      const learnHeavy = peekLearnNeed() > load.minutes * Math.max(1, daysLeft) * 0.2;
      /* اما «تست» استاندارد حق خودش را دارد: تا رسیدن به هدف تستِ امروز،
         ظرفیت آزاد برای تمرین باز می‌ماند (سقف: ۵۰٪ روز). */
      const practiceAllowance = Math.min(load.minutes * 0.45, testReserve + 20);
      if (learnHeavy) spare = Math.min(spare, practiceAllowance);
      let practiceUsed = 0;
      if (spare >= 20 && !isFinalExam) {
        const ordered = cfg.subjects
          .filter((s) => !scope || scope.has(s.id))
          .slice()
          .sort((a, b) => (b.weight * (1 - b.mastery / 100)) - (a.weight * (1 - a.mastery / 100)));
        const todaySubjects = new Set(tasks.map((t) => t.subjectId));
        /* چرخش بین فصل‌های همان درس: هر فصل سهم تست خودش را می‌گیرد.
           قبلاً همهٔ تست‌ها روی «ضعیف‌ترین فصل» می‌نشست و بعد از پر شدنِ سهم آن،
           بقیهٔ تست‌ها به هیچ فصلی نسبت داده نمی‌شد (گزارش تست صفر می‌ماند). */
        const practiceCursor = {};
        /* فقط فصل‌هایی که «خوانده شده‌اند» تست می‌گیرند.
           پیش از این تست برای فصل‌های نخوانده هم چیده می‌شد و زمانِ یادگیری را می‌خورد. */
        const canPractice = (t) => t.read || t.learnedOn != null || t.learnStarted === true || t.needMinutes <= 0;
        const poolOf = (sid) => topics
          .filter((t) => t.subjectId === sid && canPractice(t) && (t.testsNeed || 0) - (t.testsDone || 0) > 0)
          .sort((a, b) => (a.mastery - b.mastery) || ((b.testsNeed - (b.testsDone || 0)) - (a.testsNeed - (a.testsDone || 0))));
        const weakestOf = (sid) => {
          const pool = poolOf(sid);
          if (!pool.length) {
            return topics.filter((t) => t.subjectId === sid && canPractice(t))
              .sort((a, b) => a.mastery - b.mastery)[0] || null;
          }
          const i = practiceCursor[sid] || 0;
          practiceCursor[sid] = i + 1;
          return pool[i % pool.length];
        };
        /* شروع چرخه از درسی متفاوت هر روز تا تست‌زنی روی یک درس قفل نشود */
        let i = ordered.length ? (dayIndex % ordered.length) : 0;
        const targetToday = Math.round((cfg.testTarget.daily || 0) * clamp(load.minutes / 240, 0.4, 1.4));
        const testsNow = () => sum(tasks.map((t) => t.practiceCount || 0));
        const maxPracticeBlocks = learnHeavy ? 7 : 12;   // در روزهای آزاد، ظرفیت با تمرین پر می‌شود
        while (spare >= 20 && i < maxPracticeBlocks && ordered.length) {
          /* به‌محض رسیدن به هدف تست روز، پر کردن متوقف می‌شود تا وقت یادگیری بماند */
          if (cfg.testTarget.daily > 0 && testsNow() >= targetToday) break;
          if (practiceUsed >= spare + 15) break;
          /* ── تنوعِ تست در روز (۲.۸.۱۱) ──
             قاعدهٔ آموزشی: «تستِ همان فصلِ امروز» تثبیتِ درست پس از یادگیری است و جای
             خودش را دارد؛ اما اگر تمامِ تست‌های روز هم به همان کتاب برسد، روز یک‌کتابی
             می‌شود. پس فقط از بلوکِ دومِ تست به بعد (یا در روزِ کوتاه که بلوکِ دومی
             نیست) به درسِ دیگری می‌رویم. شواهدِ «تمرین درهم»: Rohrer 2007،
             Kornell & Bjork 2008 — تنوعِ بافت بازیابی را قوی‌تر می‌کند.
             درسِ جانشین به‌صورت قطعی (hash روزانه) انتخاب می‌شود، نه تصادفی. */
          let s = ordered[i % ordered.length];
          const testMinutesSoFar = (id) => tasks.filter((t) => t.kind === 'practice' && t.subjectId === id)
            .reduce((a, t) => a + t.minutesLeft, 0);
          const practiceBlocksPlaced = tasks.filter((t) => t.kind === 'practice').length;
          const shortDay = load.minutes <= 180;
          const studySubjectsSoFar = {};
          tasks.forEach((t) => { if (t.kind === 'learn' || t.kind === 'reteach' || t.kind === 'boost' || t.kind === 'practice') studySubjectsSoFar[t.subjectId] = 1; });
          const onlyOneSubjectSoFar = Object.keys(studySubjectsSoFar).length <= 1 && studySubjectsSoFar[s.id];
          if ((practiceBlocksPlaced > 0 && testMinutesSoFar(s.id) > 0) || (shortDay && onlyOneSubjectSoFar)) {
            const freeAlt = ordered.filter((x) => testMinutesSoFar(x.id) === 0 && poolOf(x.id).length);
            if (freeAlt.length) {
              let hsh = 2166136261;
              const key = String(dayIndex) + '|p' + String(practiceBlocksPlaced);
              for (let ci = 0; ci < key.length; ci += 1) { hsh ^= key.charCodeAt(ci); hsh = Math.imul(hsh, 16777619); }
              const k = ((hsh >>> 0) + dayIndex * 7 + practiceBlocksPlaced * 3) % freeAlt.length;
              s = freeAlt[k];
            }
          }
          const w = weakestOf(s.id);
          /* ۲.۸.۱۳: بلوکِ تمرین از «باقی‌ماندهٔ» روز بزرگ‌تر نمی‌شود؛ پیش‌تر roundTo5
             رو به بالا گرد می‌کرد و ۴۰ دقیقهٔ باقی‌مانده به بلوکِ ۴۵ دقیقه‌ای تبدیل
             می‌شد (روز از ظرفیتِ اعلامی می‌گذشت و بلوک‌های دیگر قربانی می‌شدند). */
          const minutes = Math.min(cfg.blockMinutes, Math.floor(spare / 5) * 5);
          if (minutes < (DEFAULTS.MIN_CHUNK.practice || cfg.MIN_BLOCK)) break;

          /* ── ۲.۸.۱۳: «تمامِ روز یک کتاب» ───────────────────────────────────
             اگر تا اینجای روز همه‌چیز حولِ یک کتاب چرخیده، اولین بلوکِ تمرین به کتابِ
             دیگری می‌رود تا روز دوکتابی شود. (پیش‌تر همین‌جا بلوک ساخته نمی‌شد و
             ظرفیتِ باقی‌مانده رها می‌شد ⇒ ساعت‌های اعلامیِ دانش‌آموز هدر می‌رفت.)
             شواهد: تداومِ طولانی با یک موضوع (massed) بازده را کم می‌کند و تنوعِ
             موضوع توجه را بالا نگه می‌دارد (Cepeda 2006؛ Rohrer & Taylor 2007). */
          if (practiceBlocksPlaced === 0 && (onlyOneSubjectSoFar || tinyDay)) {
            /* کتابی که امروز کمترین زمان را گرفته، بهترین کاندیدای تنوع است */
            const minsToday = {};
            tasks.forEach((t) => { minsToday[t.subjectId] = (minsToday[t.subjectId] || 0) + (t.minutesLeft || 0); });
            const candidates = ordered.filter((x) => poolOf(x.id).length);
            if (candidates.length) {
              candidates.sort((x, y) => (minsToday[x.id] || 0) - (minsToday[y.id] || 0));
              s = candidates[0];
            } else {
              /* هیچ کتابِ دیگری فصلِ قابلِ‌تست ندارد: به‌جای بلوکِ تمرینِ همان کتاب
                 (که روز را تک‌کتابی می‌کند) جا را به یادگیریِ کتابِ دیگر بسپار. */
              break;
            }
          }
          tasks.push({
            kind: 'practice', subjectId: s.id, subjectName: s.name,
            topicLabel: w
              ? w.label + (todaySubjects.has(s.id) ? ' — تست هدفمند' : ' — تست هدفمند (فصل ضعیف)')
              : 'تست‌زنی زمان‌دار',
            minutesLeft: minutes, priority: 60, topic: w || null,
            /* استاندارد: در درس محاسباتی ~۲.۶ دقیقه و در مفهومی ~۱.۶ دقیقه برای هر تست */
            practiceCount: Math.max(5, Math.round(minutes / (s.type === 'problem' ? 2.6 : 1.6))),
          });
          spare -= minutes;
          practiceUsed += minutes;
          i++;
        }
      }

      /* ---- ۷.۴) مبنای حسابرسیِ روز ----
         هر کار چند دقیقه ساخته شده بود؟ هر دقیقه‌ای که تا پایان روز چیده نشود
         (چه کار کامل حذف شود، چه با «تراشیدنِ» سقف روز کوتاه شود) به نیازِ همان
         فصل برمی‌گردد. باگ نسخهٔ ۲.۶: این دقیقه‌ها بی‌صدا می‌سوختند و فصل با ۴۵ از
         ۹۴ دقیقه «خوانده‌شده» علامت می‌خورد. */
      const builtSnapshot = tasks
        .filter((t) => !t.fixed && t.kind !== 'exam' && t.kind !== 'mock')
        .map((t) => ({ task: t, built: Math.round(t.minutesLeft || 0) }));

      /* ---- ۷.۵) سقف روز: مجموع تسک‌ها از ساعت اعلامیِ خودِ دانش‌آموز بیشتر نشود ---- */
      (function trimToDailyLoad() {
        const movableTasks = tasks.filter((t) => !t.fixed);
        /* آزمون‌های ثابت (دستی/دوره‌ای) هم بخشی از ظرفیت روز هستند */
        const fixedMinutes = sum(tasks.filter((t) => t.fixed).map((t) => t.fixed.end - t.fixed.start));
        /* در روز آزمون، دست‌کم «تحلیل آزمون» باید جا داشته باشد */
        const floorMovable = (hasManualExamToday || todaysMocks.length)
          ? (cfg.POST_EXAM_ANALYSIS_MIN || 30) : 0;
        const availableForMovable = Math.max(floorMovable, load.minutes - fixedMinutes);
        let total = sum(movableTasks.map((t) => t.minutesLeft || 0));
        if (total <= availableForMovable) return;
        let excess = total - availableForMovable;
        movableTasks
          .slice()
          /* ابتدا مرور/آماده‌سازی کوتاه می‌شود؛ «تست روزانه» آخرین چیزی است که قربانی می‌شود */
          .sort((a, b) => {
            /* ترتیبِ قربانی: اول «تحلیل آزمون» و «جمع‌بندی» (قابل انتقال به روز بعد)،
               بعد تستِ روزانه، و در آخر مرورهای کوتاه و ارزشمند (۲۴ساعته/فاصله‌دار)
               که ستون فقراتِ حافظه‌اند. */
            /* ۲.۸.۱۳: ترتیبِ قربانی بازنویسی شد. پیش از این «یادگیری» رتبهٔ ۲ داشت و
               اولین چیزی بود که حذف می‌شد؛ نتیجه این بود که در روزِ کوتاه، بلوکِ درسِ
               دوم قربانی می‌شد و روز تک‌کتابی می‌ماند. یافته‌های حافظه (Roediger &
               Karpicke 2006؛ Cepeda 2006) می‌گویند خودِ یادگیری + بازیابی ارزشمندتر
               از یک مرورِ کوتاهِ همان روز است، پس یادگیری آخرین قربانی است. */
            /* ۲.۸.۱۳: ترتیبِ قربانی بازنویسی شد. پیش از این «یادگیری» رتبهٔ ۲ داشت و
               اولین چیزی بود که حذف می‌شد؛ نتیجه این بود که در روزِ کوتاه، بلوکِ درسِ
               دوم قربانی می‌شد و روز تک‌کتابی می‌ماند. پس یادگیری دیرتر قربانی می‌شود. */
            /* اولویتِ حفظ: آزمون و مرورهای کوتاه و یادگیری تقریباً دست‌نخورده می‌مانند؛
               ابتدا «تست درهم» و «تحلیل/جمع‌بندی» (که انتقال‌پذیرند) کم می‌شوند.
               هیچ آزمونی زیرِ ۴۰ دقیقه کوچک نمی‌شود و هیچ بلوکِ یادگیری زیرِ ۳۰ دقیقه. */
            const rank = (t) => (t.kind === 'exam' || t.kind === 'mock' || t.kind === 'analysis'
              || t.sameDayRetrieval) ? 12
              : (t.kind === 'reteach' || t.kind === 'boost' || t.kind === 'learn') ? 9
                : (t.kind === 'warmup' || t.kind === 'review' || t.kind === 'cumreview' || t.kind === 'carryreview') ? 8
                  : (t.kind === 'finalprep' || t.kind === 'classfix' || t.kind === 'carry' || t.kind === 'deadlinecheck') ? 7
                    : t.kind === 'practice' ? 6 : 5;
            const ra = rank(a);
            const rb = rank(b);
            if (ra !== rb) return ra - rb;
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
        /* ۲.۸.۱۳: از ۳۰ دقیقه (حداقلِ بلوکِ یادگیری) هم استفاده شود تا روزِ کوتاه
           به‌جای «یک کتاب تا آخر» دو کتاب بگیرد. */
        const distinctSoFar = new Set(tasks
          .filter((t) => t.kind !== 'exam' && t.kind !== 'mock' && t.subjectId && !['EXAM', 'MOCK', 'ALL', 'CLASS'].includes(t.subjectId))
          .map((t) => t.subjectId));
        if (rest >= 30) addLearnChunks(rest, { relaxSessions: distinctSoFar.size >= 2 });
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

      const placed = scheduleTasks(cfg, movable, examSegments.length ? examSegments : segments, dayIndex);
      /* فقط زمانی «از دست رفته» حساب می‌شود که راهِ بازگشتی نداشته باشد.
         تسک‌های یادگیری همین پایین به نیاز فصل برمی‌گردند و فردا جلسهٔ کامل می‌گیرند. */
      unplacedTotal += (placed.unplacedTasks || [])
        .filter((t) => !(t && (t.kind === 'learn' || t.kind === 'reteach' || t.kind === 'boost')))
        .reduce((a, t) => a + Math.max(0, Math.round((t && t.minutesLeft) || 0)), 0);

      /* ── سالم‌سازی نیاز: کارِ جا‌نشده نیازش را نمی‌سوزاند ──
         پیش از این، نیازِ فصل هنگام «ساخت تسک» کم می‌شد؛ اگر تسک جا نمی‌شد آن زمان
         بی‌صدا از دست می‌رفت و موتور خیال می‌کرد فصل خوانده شده است. حالا هر دقیقهٔ
         جا‌نشده به نیازِ همان فصل برمی‌گردد تا فردا به‌صورت جلسهٔ کامل بیاید. */
      /* کمبود = ساخته‌شده − چیده‌شده. با این کار حتی «کوتاه‌شدنِ» یک کار در
         trimToDailyLoad هم بی‌صدا زمانِ فصل را نمی‌بلعد (باگ نسخهٔ ۲.۶). */
      const deficits = [];
      builtSnapshot.forEach(({ task: t, built }) => {
        if (!t || !built) return;
        const placedMin = placed.blocks.reduce((a, b) => a + (b.task === t ? b.minutes : 0), 0);
        const left = Math.max(0, Math.round(built - placedMin));
        if (left > 0) deficits.push(Object.assign({}, t, { minutesLeft: left }));
      });

      deficits.forEach((t) => {
        if (!t) return;
        const left = Math.max(0, Math.round(t.minutesLeft || 0));
        if (!left) return;
        if (t.topic && t.topic.needMinutes != null && (t.kind === 'learn' || t.kind === 'reteach' || t.kind === 'boost')) {
          t.topic.needMinutes = Math.round(t.topic.needMinutes) + left;
          const sid = t.topic.subjectId;
          if (!learnBySubject[sid]) learnBySubject[sid] = [];
          if (learnBySubject[sid].indexOf(t.topic) === -1) learnBySubject[sid].unshift(t.topic);
          if (learnQueue.indexOf(t.topic) === -1) learnQueue.unshift(t.topic);
          t.topic.learnedOn = null;
          /* فصل هنوز واقعاً شروع نشده؛ وگرنه استخر تست آن را «خوانده» می‌بیند
             و پیش از یادگیری، تست برایش می‌چیند. */
          t.topic.learnStarted = false;
        } else if (t.kind === 'review' && t.topic) {
          dueReviews.push({ date: addDays(date, 1), topic: t.topic, gap: 1, minutes: left, shifted: true });
        }
      });
      /* تنها فصل‌هایی که بلوک یادگیری‌شان واقعاً در برنامه جا گرفته «شروع‌شده»اند.
         استخر تست فقط از همین‌ها انتخاب می‌کند تا هیچ فصلی پیش از خواندن، تست نگیرد. */
      placed.blocks.forEach((b) => {
        const t = b.task;
        if (t && t.topic && (t.kind === 'learn' || t.kind === 'reteach' || t.kind === 'boost')) {
          t.topic.learnStarted = true;
          if (yesterdayLearned.indexOf(t.topic) === -1) yesterdayLearned.push(t.topic);
        }
      });
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
        } else if (t.kind === 'learn' || t.kind === 'reteach' || t.kind === 'boost' || t.kind === 'carry') {
          tp.plannedMinutes += usedMin;
        } else {
          /* تست/مرورِ آزمون و سایر بلوک‌ها زمانِ «یادگیری» فصل نیستند */
          tp.extraMinutes = (tp.extraMinutes || 0) + usedMin;
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
        mocks: todaysMocks.map((m) => ({ title: m.title, minutes: m.minutes, subjects: m.subjectIds })),
        isExamDay: isFinalExam || hasManualExamToday,
        isRestDay: outBlocks.length === 0,
        isDeload: load.isDeload,
        studyMinutes: dayMinutes,
        plannedMinutes: dayMinutes,
        /* ۲.۸.۱۱: تنوعِ همان روز — چند درس و سهم هر کدام (برای نمایش و سنجش) */
        variety: (function () {
          const by = {};
          outBlocks.forEach((b) => {
            /* «CUM» درس نیست (جمع‌بندیِ چنددرس)؛ در شمردنِ تنوع حساب نمی‌شود */
            if (!b.subjectId || ['EXAM', 'MOCK', 'ALL', 'CLASS', 'CUM'].indexOf(b.subjectId) !== -1) return;
            by[b.subjectId] = (by[b.subjectId] || 0) + (b.minutes || 0);
          });
          const ids = Object.keys(by).sort((a, b) => by[b] - by[a]);
          return {
            subjects: ids.length,
            topShare: ids.length ? Math.round((by[ids[0]] / Math.max(1, dayMinutes)) * 100) : 0,
            list: ids.map((id) => ({
              id,
              name: (outBlocks.find((b) => b.subjectId === id) || {}).subjectName || id,
              minutes: by[id],
              percent: Math.round((by[id] / Math.max(1, dayMinutes)) * 100),
            })),
          };
        })(),
        blocks: outBlocks,
        isLightDay: isLightDay,
        note: dayNote({
          isFinalExam, hasManualExamToday, hasClassToday, preExam, reviewOnly, finalPhase,
          isDeload: load.isDeload, chronotype: cfg.student.chronotype, hasBlocks: outBlocks.length > 0,
          isLightDay: isLightDay, lightNote: (off && off.note) || '', lightRatio: lightFactor,
        }),
      });

      // ثبت تثبیت‌های جا نشده برای روز بعد
      movable.filter((t) => t.kind === 'classfix' && t.minutesLeft > 0).forEach((t) => {
        classFixBacklog.push({ kind: 'classfix', subjectId: t.subjectId, subjectName: t.subjectName, topicLabel: t.topicLabel + ' (ادامه)' });
      });
    }

    /* ---- جمع‌بندی ---- */
    if (sum(cfg.classes.map(() => 0)) === 0 && !cfg.classes.length) {
      notes.push('کلاسی ثبت نکردی؛ اگر کلاس آنلاین داری، در بخش «کلاس‌ها» اضافه کن تا برنامه دور آن‌ها چیده شود.');
    }
    if (!cfg.exams.length) {
      notes.push('آزمون آزمایشی ثبت نشده؛ برنامه فعلاً فقط آزمون جامع هفتگی داخلی دارد. با ثبت آزمون‌ها، روزهای پیش‌آزمون خودکار «فقط مرور» می‌شوند.');
    }

    const finalDay = days[days.length - 1];
    /* ۲.۸.۹: این مرور نباید ساعت ثابت ۰۷:۳۰ داشته باشد — کسی که ۰۸:۳۰ بیدار می‌شود
       یا روزش را ۱۰:۰۰ شروع می‌کند، بلوکِ داخل خواب نمی‌گیرد. از پنجرهٔ واقعیِ همان روز. */
    let finalReview = null;
    if (finalDay && finalDay.blocks.length === 0) {
      const fwd = persianWeekday(toDate(finalDay.date));
      const wakeMin = minutesSinceMidnight(cfg.wakeTime || (cfg.sleep && cfg.sleep.wake) || '07:00');
      const startMin = Math.max(wakeMin, minutesSinceMidnight((cfg.startTimes || {})[WEEKDAY_KEY[fwd]] || '07:30'));
      const bedGuard = Math.min(1440, sleepMinutes(cfg) - (cfg.SLEEP_GUARD_MIN || DEFAULTS.SLEEP_GUARD_MIN));
      if (bedGuard - startMin >= 20) {
        finalReview = { start: fmtHM(startMin), end: fmtHM(startMin + 30) };
      }
    }
    if (finalDay && finalReview) {
      const t = {
        kind: 'review', subjectId: 'ALL', subjectName: 'مرور نهایی', topicLabel: 'خلاصه‌ها و دفتر اشتباهات',
        practiceCount: null,
      };
      finalDay.blocks = [{
        start: finalReview.start, end: finalReview.end, minutes: 30, kind: 'review', kindLabel: 'مرور نهایی',
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
        /* اهمیت واقعی فصل (بودجه‌بندی کنکور) — مبنای نمایش و اولویت */
        ciTag: t.ciTag || null, ciQuestions: t.ciQuestions == null ? null : t.ciQuestions,
        ciSharePct: t.ciSharePct == null ? null : t.ciSharePct,
        ciImportance: t.ciImportance == null ? null : t.ciImportance,
        ciDifficulty: t.ciDifficulty == null ? null : t.ciDifficulty,
        ciMult: t.ciMult || 1, ciSource: t.ciSource || null,
        ciPriority: t.ciPriority == null ? null : t.ciPriority,
        ciPriorityLocal: t.ciPriorityLocal == null ? null : t.ciPriorityLocal,
        ciCoef: t.ciCoef == null ? null : t.ciCoef,
        ciYears: t.ciYears || null,
        ciSeries: t.ciSeries || null,
        ciTrend: t.ciTrend == null ? null : t.ciTrend,
        ciDataDriven: Boolean(t.ciDataDriven),
        ciQTotal: t.ciQTotal == null ? null : t.ciQTotal,
        ciSources: t.ciSources || null,
        ciCols: t.ciCols || null,
        ciExams: t.ciExams == null ? null : t.ciExams,
        ciCoarse: Boolean(t.ciCoarse),
        ciFrom: t.ciFrom == null ? null : t.ciFrom,
        ciTo: t.ciTo == null ? null : t.ciTo,
      };
    });
    const coveredCount = chapterStats.filter((c) => c.covered).length;
    /* «پوشش فصل‌ها» = فصل‌های اختصاصی (همان چیزی که در کنکور ضریب دارد).
       دروس عمومی جدا شمرده می‌شوند چون از مسیر سوابق تحصیلی مدیریت می‌شوند. */
    const coreChapters = chapterStats.filter((c) => !c.general);
    const coreCovered = coreChapters.filter((c) => c.covered).length;
    const coverageRatio = Math.round((coreCovered / Math.max(1, coreChapters.length)) * 100);
    const coverageRatioAll = Math.round((coveredCount / Math.max(1, chapterStats.length)) * 100);
    /* «تست» فقط تمرین واقعی است؛ نمونه‌سؤالِ سوابق و آزمون‌ها جدا شمرده می‌شوند */
    const testsPlanned = days.reduce((a, d) => a + sum(d.blocks.filter((b) => b.kind === 'practice')
      .map((b) => b.practiceCount || 0)), 0);
    const mockTests = days.reduce((a, d) => a + sum(d.blocks.filter((b) => b.kind === 'mock')
      .map((b) => b.practiceCount || 0)), 0);
    const finalsSampleTests = days.reduce((a, d) => a + sum(d.blocks.filter((b) => b.kind === 'finalprep')
      .map((b) => b.practiceCount || 0)), 0);
    const activeDays = days.filter((d) => !d.isRestDay && !d.isOff).length || 1;
    const testsPerDay = Math.round((testsPlanned / activeDays) * 10) / 10;
    const targetDaily = (cfg.testTarget && cfg.testTarget.daily) || 0;

    /* ---------- ظرفیت تست در برابر استاندارد ---------- */
    const testsNeedTotal = Math.round(sum(topics.map((t) => t.testsNeed || 0)));
    const requiredDailyTests = Math.round(testsNeedTotal / Math.max(1, activeDays));
    const feasibleDailyTests = Math.round(cfg._feasibleDailyTests || targetDaily);
    const testCoverageRatio = testsNeedTotal > 0 ? Math.round((testsPlanned / testsNeedTotal) * 100) / 100 : 1;
    const testsBySubject = cfg.subjects.map((sub) => {
      const rows = chapterStats.filter((c) => c.subjectId === sub.id);
      return {
        subjectId: sub.id, name: sub.name,
        need: Math.round(sum(rows.map((c) => c.testsNeed || 0))),
        done: Math.round(sum(rows.map((c) => c.testsDone || 0))),
        planned: Math.round(sum(rows.map((c) => c.testsDone || 0))),
      };
    });

    /* هدف تست هر روز متناسب با حجم همان روز سنجیده می‌شود (روز ۳ ساعته = هدف کمتر) */
    const dayTestTarget = (d) => targetDaily * clamp((d.plannedMinutes || 0) / 240, 0.5, 1.3);
    const testTargetMetRatio = targetDaily > 0
      ? Math.round((days.filter((d) => !d.isOff &&
        sum(d.blocks.map((b) => b.practiceCount || 0)) >= dayTestTarget(d) * 0.72).length / activeDays) * 100) / 100
      : 1;

    const unread = topics.filter((t) => t.mode === 'learn');
    const reteachList = topics.filter((t) => t.mode === 'reteach').sort((a, b) => topicPriority(b) - topicPriority(a));
    const boostList = topics.filter((t) => t.mode === 'boost').sort((a, b) => topicPriority(b) - topicPriority(a));
    const spareCapacity = Math.max(0, Math.round(capacityTotal - totalStudy));
    const remainingNeed = Math.round(sum(topics.map((t) => Math.max(0, t.needMinutes))));
    const willCover = remainingNeed <= spareCapacity;

    /* ---------- ساعت لازم در روز (هشدار صادقانه، بر پایهٔ خروجی واقعی برنامه) ----------
       کاربر می‌تواند ساعت را آزادانه بالا/پایین ببرد؛ چیزی سقف نمی‌زند.
       اگر با ساعتِ اعلامی (منهای کلاس/آزمون ثابت) پوشش کامل نشود،
       «حداقل ساعت لازم» با همان راندمان زمانِ فعلی تخمین زده و صریح گفته می‌شود. */
    const declaredDailyHours = Math.round((sum(WEEKDAY_KEY.map((k) => cfg.availability[k])) / 7) * 10) / 10;
    const fixedWeeklyMinutes = sum(cfg.classes.map((c) => Math.max(0, (c.end || 0) - (c.start || 0)))) +
      sum(cfg.exams.map((e) => Math.max(60, (e.end || 0) - (e.start || 0))));
    const capacityDailyMinutes = Math.round(capacityTotal / Math.max(1, days.filter((d) => !d.isRestDay).length));

    /* پنجرهٔ آزاد واقعی روز: از ساعت شروع تا ۴۵ دقیقه قبل خواب، منهای کلاس‌های ثابت.
       اگر کاربر بگوید «۱۲ ساعت می‌خوانم» ولی پنجرهٔ آزادش ۶ ساعت است،
       مشکل ساعت اعلامی نیست؛ باید ساعت شروع/خواب یا کلاس‌ها اصلاح شود. */
    let windowTotal = 0;
    let windowDays = 0;
    for (let i = 0; i < 7; i += 1) {
      const dt = addDays(cfg._start, i);
      const wdSample = persianWeekday(dt);
      if (cfg.restDay !== 7 && wdSample === cfg.restDay) continue;
      const busySample = busyEventsFor(cfg, dt, i);
      const segs = freeSegments(cfg, dt, busySample);
      windowTotal += sum(segs.map((x) => x.end - x.start));
      windowDays += 1;
    }
    const freeWindowMinutes = windowDays ? Math.round(windowTotal / windowDays) : 0;
    const freeWindowHours = Math.round((freeWindowMinutes / 60) * 10) / 10;
    /* اگر پوشش ۹۸٪ به بالا نیست، ساعت لازم ≈ ساعت فعلی × (۱۰۰ ÷ پوشش) */
    const covFactor = coverageRatio > 0 ? Math.min(2.5, 100 / coverageRatio) : 2.5;
    const effPerDeclared = declaredDailyHours > 0
      ? clamp((capacityDailyMinutes / 60) / declaredDailyHours, 0.3, 1) : 1;
    const wantsMoreThanWindow = declaredDailyHours * 60 > freeWindowMinutes * 1.1;
    let minDailyHoursNeeded = Math.round(((capacityDailyMinutes / 60) * covFactor / effPerDeclared) * 10) / 10;
    /* اگر گلوگاه «پنجرهٔ آزاد» است، عدد پیشنهادی نباید از پنجره بزرگ‌تر شود */
    if (wantsMoreThanWindow) minDailyHoursNeeded = Math.min(minDailyHoursNeeded, freeWindowHours);
    const shortfallMinutes = Math.max(0, Math.round((minDailyHoursNeeded * effPerDeclared * 60) - capacityDailyMinutes));
    const capacityAdvisory = {
      declaredDailyHours,
      fixedWeeklyMinutes,
      capacityDailyMinutes,
      minDailyHoursNeeded,
      shortfallMinutes,
      achievable: coverageRatio >= 98,
      freeWindowMinutes,
      freeWindowHours,
      limiter: coverageRatio >= 98 ? 'none' : (wantsMoreThanWindow ? 'window' : 'time'),
      coverageRatio,
      testCoverageRatio,
      testsNeedTotal,
      requiredDailyTests: Math.round(testsNeedTotal / Math.max(1, activeDays)),
      feasibleDailyTests: Math.round(cfg._feasibleDailyTests || 0),
      totalCapacityMinutes: Math.round(capacityTotal),
    };

    /* پنجرهٔ مطالعه بسته یا تقریباً بسته: ریشهٔ همهٔ صفرهای برنامه */
    if (freeWindowHours < 1) {
      diag({
        id: 'no-window',
        level: 'error',
        step: 'step-2',
        field: 'bedtime',
        title: 'پنجرهٔ مطالعه‌ات بسته است — به همین دلیل برنامه صفر شد',
        detail: 'بین «ساعت شروع مطالعه» و «ساعت خواب» منهای کلاس‌ها، روزی حدود ' + toFa(freeWindowHours) +
          ' ساعت جا داری؛ پس برنامه هیچ بلوکی برایت نچید. اگر ساعت خوابت بعد از نیمه‌شب است، آن را ' +
          'مثلاً ۰۰:۳۰ بنویس (برنامه خودش این را «بعد از نیمه‌شب» می‌فهمد).',
        fix: '۱) ساعت خواب را درست کن (مثلاً ۲۳:۳۰ یا ۰۰:۳۰). ۲) ساعت شروع مطالعه را جلوتر ببر. ' +
          '۳) اگر کلاسی روی این بازه افتاده، ساعت آن را اصلاح کن. بعد دوباره «ساخت برنامه» را بزن.',
      });
    }
    if (!capacityAdvisory.achievable && capacityAdvisory.limiter === 'window') {
      diag({
        id: 'cap-over-window',
        step: 'step-2',
        field: 'startTimes',
        title: 'ساعت اعلامی‌ات از پنجرهٔ آزادِ روز بزرگ‌تر است',
        detail: 'می‌گویی ' + toFa(declaredDailyHours) + ' ساعت در روز می‌خوانی، ولی بین ساعت شروع مطالعه و خواب ' +
          '(منهای کلاس/آزمون‌های ثابت) روزی ' + toFa(freeWindowHours) + ' ساعت جا داری؛ با همین پنجره پوشش فصل‌ها ' +
          toFa(coverageRatio) + '٪ می‌شود.',
        fix: 'ساعت شروع مطالعه را جلوتر ببر، ساعت خواب را عقب‌تر ببر، یا کلاس‌های ثابت را جابه‌جا کن. ' +
          'اگر نمی‌توانی، چند فصل کم‌ضریب را عقب بینداز.',
      });
    } else if (!capacityAdvisory.achievable) {
      diag({
        id: 'low-capacity',
        step: 'step-2',
        field: 'availability',
        title: 'ساعت‌های فعلی برای پوشش کامل کافی نیست (پوشش ' + toFa(coverageRatio) + '٪)',
        detail: 'با ' + toFa(declaredDailyHours) + ' ساعت اعلامی (حدود ' +
          toFa(Math.round(capacityDailyMinutes / 60 * 10) / 10) + ' ساعت مؤثر در روز' +
          (fixedWeeklyMinutes ? ' بعد از کلاس/آزمون‌های ثابت' : '') + ') پوشش فصل‌ها ' + toFa(coverageRatio) +
          '٪ می‌شود. برای پوشش کامل روزی حداقل ' + toFa(minDailyHoursNeeded) + ' ساعت لازم است (کمبود ~' +
          toFa(Math.round(shortfallMinutes / 60 * 10) / 10) + ' ساعت در روز).',
        fix: 'ساعت مطالعهٔ روزهایت را بالا ببر (یا حالت «خودکار» را روشن کن تا برنامه خودش ساعت لازم را بچیند)، ' +
          'یا چند فصل کم‌ضریب را عقب بینداز.',
      });
    }
    if (learnQueue.length && capacityAdvisory.achievable) {
      const missing = Math.max(0, Math.round(peekLearnNeed()));
      const low = cfg.subjects.filter((s) => s.weight < 3).sort((a, b) => a.weight - b.weight).slice(0, 2);
      diag({
        id: 'need-left',
        step: 'step-4',
        field: 'subjectsBox',
        title: 'حدود ' + toFa(Math.round(missing / 60)) + ' ساعت کار برای ' + toFa(learnQueue.length) + ' مبحث باقی‌مانده کم می‌آید',
        detail: 'زمان‌های فعلی (با احتساب کلاس‌ها و آزمون‌ها) برای پوشش کامل همهٔ مباحث کافی نیست؛ ' +
          'حدود ' + toFa(Math.round(missing / 60)) + ' ساعت کم می‌آید.',
        fix: low.length
          ? 'چند فصل کم‌ضریب (' + low.map((s) => s.name).join('، ') + ') را عقب بینداز، یا ساعت مطالعه را بالا ببر، یا حالت خودکار را روشن کن.'
          : 'یک ساعت به روزهای آزاد اضافه کن، یا تعداد فصل‌های خوانده‌نشده را واقعی‌تر کن.',
      });
    }
    if (testCoverageRatio < 0.85) {
      diag({
        id: 'test-capacity',
        step: 'step-2',
        field: 'availability',
        title: 'ظرفیت تست کمتر از استاندارد است (پوشش ' + toFa(Math.round(testCoverageRatio * 100)) + '٪)',
        detail: 'برای پوشش کامل تست‌ها روزی ~' + toFa(capacityAdvisory.requiredDailyTests) +
          ' تست لازم است؛ همین برنامه روزی ~' + toFa(Math.round(testsPerDay)) + ' تست می‌چیند (هدف ' +
          toFa(targetDaily) + ' تست در روز).',
        fix: 'ساعت مطالعه را بالا ببر (با ساعت شروع زودتر یا حالت خودکار) تا ظرفیت تست هم بالا برود؛ ' +
          'در غیر این صورت تست‌های کم‌ضریب را به بعد موکول کن.',
      });
    }
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
      /* بارم واقعی فصل‌به‌فصل + سهم زمانی هر فصل (کاربر می‌بیند کدام فصل وقت بیشتری گرفت) */
      uniform: t.finalsUniform,
      approx: t.finalsApprox,
      source: t.finalsSource,
      baramTotal: t.finalsBaramSum || null,
      method: t.finalsMethod || [],
      chapters: (t.finalsChapters || []).map((ch, i) => {
        const share = t.finalsBaram && t.finalsBaram.length
          ? t.finalsBaram[i] / (t.finalsBaramSum || 1) : 1 / Math.max(1, (t.finalsChapters || []).length);
        return {
          chapter: ch.chapter, name: ch.name, baram: ch.baram,
          minutes: Math.round(share * t.initialNeedMinutes),
          planned: Math.round(share * t.plannedMinutes),
        };
      }),
    }));
    const budgetRatio = finalsCourses.length
      ? sum(finalsCourses.map((c) => c.plannedMinutes / Math.max(1, c.needMinutes))) / finalsCourses.length : 0;
    const finalsProjectedScore = finalsCourses.length
      ? Math.round(sum(finalsCourses.map((c) => (c.projected / 100) * 20 * c.influence)) /
        (sum(finalsCourses.map((c) => c.influence)) || 1) * 10) / 10 : 0;

    /* ---------------- آمادگی کنکور و نهایی: دو عدد جداگانه ----------------
       کنکور با «ضریب × تسلط × پوشش فصل‌ها × تست» سنجیده می‌شود؛
       نهایی با «بارم × تسلط × نسبت کار انجام‌شده» — چون روش و معیارشان یکی نیست. */
    const konkurTestsNeedAll = sum(topics.map((t) => t.testsNeed || 0)) || 1;
    const konkurTestsDoneAll = sum(topics.map((t) => Math.min(t.testsNeed || 0, t.testsDone || 0)));
    const konkurTestRatio = clamp(konkurTestsDoneAll / konkurTestsNeedAll, 0, 1);
    const konkurCoverRatio = clamp((coverageRatio || 0) / 100, 0, 1);
    const konkurReviewRatio = clamp(
      sum(topics.map((t) => Math.min(1, (t.reviewMinutes || 0) / Math.max(30, (t.initialNeedMinutes || 0) * 0.25)))) /
        Math.max(1, topics.length), 0, 1);
    const konkurReadiness = {
      current: Math.round(readiness),
      projected: Math.round(projectedReadiness),
      coverage: Math.round(coverageRatio || 0),
      testsDone: konkurTestsDoneAll,
      testsNeed: Math.round(konkurTestsNeedAll),
      testRatio: Math.round(konkurTestRatio * 100),
      reviewRatio: Math.round(konkurReviewRatio * 100),
      minutes: Math.round(sum(topics.map((t) => t.plannedMinutes || 0))),
      remainingMinutes: Math.round(remainingNeed),
      basis: 'ضریب درس × تسلط فصل × پوشش × تست زمان‌دار',
      method: ['یادگیری مفهومی + تست زمان‌دار', 'مرور فاصله‌دار تا روز کنکور', 'آزمون جامع و تحلیل خطا',
        'اولویت بر پایهٔ بودجه‌بندی واقعی هر فصل'],
    };
    const finalsReadinessObj = {
      current: finalsReadiness,
      projected: finalsCourses.length ? Math.round(sum(finalsCourses.map((c) => c.projected * c.influence)) /
        (sum(finalsCourses.map((c) => c.influence)) || 1)) : 0,
      courses: finalsCourses.length,
      avgScore: Math.round(finalsCourses.length
        ? (sum(finalsCourses.map((c) => c.projected / 100 * 20)) / finalsCourses.length) * 10 : 0) / 10,
      budgetRatio: Math.round(budgetRatio * 100),
      minutes: sum(finalsCourses.map((c) => c.plannedMinutes)),
      remainingMinutes: sum(finalsCourses.map((c) => c.remainingMinutes)),
      share: DEFAULTS.FINALS_SHARE,
      basis: 'بارم رسمی هر فصل × تسلط ثبت‌شده × نمونه‌سؤال تشریحی',
      method: ['حل نمونه‌سؤال نهایی با زمان‌سنج', 'تصحیح با بارم‌بندی رسمی', 'پاسخ تشریحی با جمله‌بندی کتاب',
        'فصل پربارم = وقت بیشتر'],
    };

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

    /* مهلت‌های عقب‌افتاده: یک کارت واحد به‌جای پنج هشدار تکراری */
    const lateDeadlines = deadlineReport.filter((d) => d.status === 'late' || d.status === 'late-done');
    if (lateDeadlines.length) {
      diag({
        id: 'deadline-late',
        step: 'step-6',
        field: 'bookRows',
        title: lateDeadlines.length === 1
          ? 'مهلت «' + lateDeadlines[0].title + '» با ساعت‌های فعلی محقق نمی‌شود'
          : toFa(lateDeadlines.length) + ' مهلت با ساعت‌های فعلی محقق نمی‌شود',
        detail: 'مهلت‌ها با ساعت‌های فعلی محقق نمی‌شوند: ' + lateDeadlines.map((d) =>
          '«' + d.title + '» (' + jDate(d.date) + '): ' + toFa(Math.round(d.remainingMinutes / 60)) +
          ' ساعت کار مانده، روزی ' + toFa(d.needPerDay) + ' دقیقه لازم است').join(' · '),
        fix: 'یا تاریخ مهلت را واقعی‌تر کن، یا ساعت مطالعه را بالا ببر، یا فصل‌های کم‌ضریب را از مهلت بردار.',
        deadlines: lateDeadlines.map((d) => d.id),
      });
    }

    /* ---- برنامهٔ خالی: هیچ بلوکی چیده نشد ---- */
    if (!totalStudy || totalStudy < 60) {
      diag({
        id: 'empty-plan',
        level: 'error',
        step: 'step-2',
        field: 'bedtime',
        title: 'برنامه تقریباً خالی است (فقط ' + toFa(Math.round(totalStudy / 60 * 10) / 10) + ' ساعت در کل)',
        detail: 'با ساعت‌های فعلی هیچ بازهٔ مطالعهٔ معناداری در روز پیدا نشد. علت معمولاً یکی است: ' +
          'ساعت خواب یا ساعت شروع مطالعه اشتباه وارد شده، یا کلاس ثابتی تمام روز را گرفته است.',
        fix: '«ساعت‌های تو» را باز کن و ببین پنجرهٔ آزاد روزی چند ساعت است؛ ساعت خواب/شروع را اصلاح کن. ' +
          'اگر مطمئنی زمان‌ها درست است، حالت «خودکار» را روشن کن تا برنامه خودش جا را پیدا کند.',
      });
    }

    /* ---- حالت خودکار: سقف کاربر اجازهٔ پوشش کامل را نداد ---- */
    if (cfg._autoWarn) diagnostics.push(cfg._autoWarn);

    const coverage = {
      diagnostics,
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
      testsNeedTotal,
      testsBySubject,
      mockTests,
      finalsSampleTests,
      requiredDailyTests,
      feasibleDailyTests,
      testCoverageRatio,
      capacityAdvisory,
      weeklyMocks: cfg.weeklyMocks,
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
      konkurReadiness,
      finalsReadinessObj,
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
        version: '2.8.13', createdAt: new Date().toISOString(),
        studentName: cfg.student.name, field: cfg.student.field, grade: cfg.student.grade,
        chronotype: cfg.student.chronotype, startDate: cfg.startDate, examDate: cfg.examDate,
        totalDays, blockMinutes: cfg.blockMinutes,
        classesCount: cfg.classes.length, examsCount: cfg.exams.length,
        weeklyMocks: cfg.weeklyMocks,
        subjects: cfg.subjects.map((x) => ({ id: x.id, name: x.name })),
        config: configForStorage(cfg),
      },
      summary: {
        timeMode: cfg.timeMode,
        autoInfo: cfg._autoInfo || null,
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
        diagnostics,
        coachNotes: coachNotes(cfg, bySubject, warnings, notes, coverage),
        coverage,
        /* تفکیک صریح کنکور / نهایی: روش، برنامه و سطح آمادگی جدا */
        readinessSplit: {
          konkur: konkurReadiness,
          finals: finalsReadinessObj,
          separate: true,
          note: 'کنکور با تست زمان‌دار و بودجه‌بندی فصل‌به‌فصل سنجیده می‌شود؛ نهایی با بارم رسمی و پاسخ تشریحی — دو مسیر جدا، دو عدد جدا.',
        },
        /* آیتم‌های اضطراری چیده‌شده */
        emergency: emReport,
        priorities,
        weakChapters,
        chapterStats,
      },
      days,
    };
  }

  function dayNote(i) {
    if (i.isFinalExam) return 'روز کنکور — موفق باشی! خواب کافی شب قبل، مهم‌تر از هر مرور دیگری است.';
    /* ۲.۸.۱۰: «روز سبک» باید خودش را توضیح بدهد — قبلاً یادداشتش خالی بود و
       کاربر نمی‌دانست چرا امروز بارش نصف شده. */
    if (i.isLightDay) {
      const pct = Math.round((i.lightRatio || DEFAULTS.LIGHT_DAY_RATIO) * 100);
      return 'روز سبک' + (i.lightNote ? ' (' + i.lightNote + ')' : '') +
        ': بار امروز عمداً ' + toFa(pct) + '٪ روز عادی است و کارِ جامانده به روزهای بعد می‌رود.';
    }
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
    if (coverage && !(coverage.capacityMinutes > 0)) {
      out.push('برنامه‌ای چیده نشد چون ظرفیت زمانی صفر بود؛ اول «ساعت‌های تو» را درست کن، بعد دوباره بساز.');
      return out.concat(extra || []);
    }
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
    /* اگر برنامه خالی است، «۰ ساعت به فلان درس داده شد» بی‌معنی و گیج‌کننده است */
    if (first && first.hours > 0) {
      out.push('بیشترین زمان به «' + first.name + '» داده شد (' + first.hours + ' ساعت) — ترکیب ضریب، فاصلهٔ تسلط و حجم باقی‌مانده.');
    }
    const weakest = cfg.subjects.slice().sort((a, b) => a.mastery - b.mastery)[0];
    if (weakest && coverage && coverage.coverageRatio > 0) out.push('ضعیف‌ترین درس فعلی: «' + weakest.name + '» — مرورهایش زودتر و بیشتر تکرار می‌شود.');
    if (!coverage || coverage.coverageRatio > 0) {
      out.push('هر بلوک با ۵ دقیقه بازیابی فعال تمام می‌شود؛ در لحظه سخت‌تر است، یک هفته بعد نتیجه‌اش دیده می‌شود.');
    }
    (extra || []).forEach((n) => out.push(n));
    return out;
  }

  function configForStorage(cfg) {
    return {
      student: cfg.student, startDate: cfg.startDate, examDate: cfg.examDate, sleep: cfg.sleep,
      availability: cfg.availability, startTimes: cfg.startTimes, blockMinutes: cfg.blockMinutes,
      breakMinutes: cfg.breakMinutes, restDay: cfg.restDay, weeklyMock: cfg.weeklyMock,
      weeklyMocks: cfg.weeklyMocks,
      classes: cfg.classes, exams: cfg.exams, subjects: cfg.subjects,
      finals: cfg.finals, deadlines: cfg.deadlines, offDates: cfg.offDates,
      carryOver: cfg.carryOver,
      /* v2.5: ساعت بیداری پیش‌فرض، شروع روزهای واقعی، روال‌های ثابت، آیتم‌های اضطراری */
      wakeTime: cfg.wakeTime, dayStarts: cfg.dayStarts,
      routinePinned: cfg.routinePinned, routines: cfg.routines,
      emergency: cfg.emergency,
      /* هدف تست محاسبه‌شده ذخیره نمی‌شود؛ هر بار از ساعت‌های تازه ساخته می‌شود */
      timeMode: cfg.timeMode, dailyCapHours: cfg.dailyCapHours, dailyFloorHours: cfg.dailyFloorHours,
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
