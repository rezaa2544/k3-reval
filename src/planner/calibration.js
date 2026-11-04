/**
 * Reval 2.10.3 — کالیبراسیونِ واقعیِ ضریبِ زمان (minutesPerPage / minutesPerConcept / minutesPerExercise)
 * -------------------------------------------------------------------------------------------------
 * شکایت/ایرادِ درست: عددهای «دقیقه برای هر صفحه» و «دقیقه برای هر مفهوم» در گزارش،
 * **برآوردِ کارشناسی [ک]** بودند و هیچ‌جا با دادهٔ خودِ دانش‌آموز اصلاح نمی‌شدند.
 *
 * این ماژول همان کار را می‌کند، ولی صادقانه:
 *   ۱) هر مشاهدهٔ واقعی (بلوکِ انجام‌شده یا «این فصل را در N دقیقه تمام کردم») ثبت می‌شود.
 *   ۲) نسبتِ «واقعی ÷ برآورد» با میانگینِ متحرک جمع می‌شود (وزنِ نمونه‌های تازه بیشتر).
 *   ۳) سه ضریب (صفحه/مفهوم/تمرین) با هم حرکت می‌کنند، چون یک مشاهده فقط **کلِ** زمان را
 *      می‌دهد، نه سهمِ صفحات را از مفاهیم. وقتی دادهٔ جداگانه رسید (مثلاً «۴۰ صفحه را در
 *      ۹۰ دقیقه خواندم»)، ضریبِ صفحه تنها اصلاح می‌شود.
 *   ۴) اطمینان (confidence) = تعدادِ نمونه؛ زیر ۳ نمونه «در حالِ یادگیری» اعلام می‌شود و
 *      اثرش محدود به ±۱۵٪ است تا برنامه با دادهٔ کم خراب نشود.
 *
 * همه‌چیز آفلاین و روی همین دستگاه است.
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.RevalCalibration = api;
}(typeof window !== 'undefined' ? window : globalThis, function () {
  'use strict';

  const VERSION = 1;
  const MIN_SAMPLES_FOR_FULL = 3;     // زیر ۳ نمونه: اثرِ محدود
  const LIMIT_EARLY = 0.15;           // ±۱۵٪ با دادهٔ کم
  const LIMIT_FULL = 0.45;            // ±۴۵٪ با دادهٔ کافی
  const PACE_MIN = 0.6;
  const PACE_MAX = 1.8;
  /* پایهٔ گزارش: دقیقه به‌ازای هر صفحه برای سه نوع محتوا (گزارش ۲.۹.۰) */
  const BASE = {
    concept: { read: 2.5, active: 8.0, review: 1.5 },
    quant: { read: 3.5, active: 11.0, review: 2.0 },
    memory: { read: 2.0, active: 6.0, review: 1.2 },
  };

  const round3 = (v) => Math.round(v * 1000) / 1000;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const isNum = (v) => typeof v === 'number' && isFinite(v);

  function empty() {
    return { version: VERSION, subjects: {}, updatedAt: null };
  }

  function normalize(raw) {
    const st = empty();
    if (!raw || typeof raw !== 'object') return st;
    st.updatedAt = raw.updatedAt || null;
    const src = raw.subjects && typeof raw.subjects === 'object' ? raw.subjects : {};
    Object.keys(src).forEach((sid) => {
      const s = src[sid] || {};
      const n = clamp(Math.round(Number(s.n) || 0), 0, 999);
      if (!n) return;
      st.subjects[sid] = {
        n,
        ratio: isNum(s.ratio) ? clamp(s.ratio, PACE_MIN, PACE_MAX) : 1,
        pageScale: isNum(s.pageScale) ? clamp(s.pageScale, PACE_MIN, PACE_MAX) : 1,
        conceptScale: isNum(s.conceptScale) ? clamp(s.conceptScale, PACE_MIN, PACE_MAX) : 1,
        exerciseScale: isNum(s.exerciseScale) ? clamp(s.exerciseScale, PACE_MIN, PACE_MAX) : 1,
        estimatedMinutes: Math.max(0, Math.round(Number(s.estimatedMinutes) || 0)),
        actualMinutes: Math.max(0, Math.round(Number(s.actualMinutes) || 0)),
        lastAt: s.lastAt || null,
        source: s.source === 'manual' ? 'manual' : (s.source === 'both' ? 'both' : 'observed'),
        chapters: Array.isArray(s.chapters) ? s.chapters.slice(-30) : [],
      };
    });
    return st;
  }

  /** اطمینانِ فعلی برای یک درس: ۰..۱ */
  function confidence(state, sid) {
    const s = (state && state.subjects && state.subjects[sid]) || null;
    if (!s || !s.n) return 0;
    return clamp(s.n / MIN_SAMPLES_FOR_FULL, 0, 1);
  }

  /**
   * ثبتِ یک مشاهده.
   * @param {object} state
   * @param {object} obs { subjectId, chapterId, estimatedMinutes, actualMinutes, source, at }
   */
  function record(state, obs) {
    const st = normalize(state);
    const o = obs || {};
    const sid = String(o.subjectId || '').trim();
    const est = Number(o.estimatedMinutes);
    const act = Number(o.actualMinutes);
    if (!sid || !(est > 0) || !(act > 0)) return st;
    const ratio = clamp(act / est, PACE_MIN, PACE_MAX);
    const cur = st.subjects[sid] || {
      n: 0, ratio: 1, pageScale: 1, conceptScale: 1, exerciseScale: 1,
      estimatedMinutes: 0, actualMinutes: 0, lastAt: null, source: o.source === 'manual' ? 'manual' : 'observed', chapters: [],
    };
    const n = cur.n + 1;
    /* وزنِ نمونهٔ تازه: با دادهٔ کم سریع یاد می‌گیرد، با دادهٔ زیاد پایدار می‌شود */
    const w = 1 / Math.max(2, Math.min(6, n));
    const ratioNew = clamp(cur.ratio * (1 - w) + ratio * w, PACE_MIN, PACE_MAX);
    /* اثرِ مجاز بر اساسِ تعدادِ نمونه: با ۱ نمونه حداکثر ±۱۵٪ */
    const lim = n < MIN_SAMPLES_FOR_FULL ? LIMIT_EARLY : LIMIT_FULL;
    const bounded = clamp(ratioNew, 1 - lim, 1 + lim);
    cur.n = n;
    cur.ratio = round3(ratioNew);
    cur.pageScale = round3(bounded);
    cur.conceptScale = round3(bounded);
    cur.exerciseScale = round3(bounded);
    cur.estimatedMinutes += Math.round(est);
    cur.actualMinutes += Math.round(act);
    cur.lastAt = o.at || new Date().toISOString();
    cur.source = cur.source === 'manual' || o.source === 'manual' ? (n > 1 ? 'both' : 'manual') : 'observed';
    if (o.chapterId) {
      cur.chapters = (cur.chapters || []).concat([{ id: String(o.chapterId), est: Math.round(est), act: Math.round(act), at: cur.lastAt }]).slice(-30);
    }
    st.subjects[sid] = cur;
    st.updatedAt = cur.lastAt;
    return st;
  }

  /** تنظیمِ دستیِ ضریب (وقتی دانش‌آموز می‌گوید «ریاضی برای من ۳۰٪ کندتر است») */
  function setScale(state, sid, scale, at) {
    const st = normalize(state);
    const v = clamp(Number(scale) || 1, PACE_MIN, PACE_MAX);
    const cur = st.subjects[sid] || {
      n: 0, ratio: 1, pageScale: 1, conceptScale: 1, exerciseScale: 1,
      estimatedMinutes: 0, actualMinutes: 0, lastAt: null, source: 'manual', chapters: [],
    };
    cur.ratio = round3(v);
    cur.pageScale = round3(v);
    cur.conceptScale = round3(v);
    cur.exerciseScale = round3(v);
    cur.source = 'manual';
    cur.n = Math.max(cur.n, MIN_SAMPLES_FOR_FULL);
    cur.lastAt = at || new Date().toISOString();
    st.subjects[sid] = cur;
    st.updatedAt = cur.lastAt;
    return st;
  }

  /** ساختِ ورودیِ موتور: { sid: { page, concept, exercise } } */
  function toConfig(state) {
    const st = normalize(state);
    const out = {};
    Object.keys(st.subjects).forEach((sid) => {
      const s = st.subjects[sid];
      if (!s.n) return;
      out[sid] = {
        page: s.pageScale,
        concept: s.conceptScale,
        exercise: s.exerciseScale,
        n: s.n,
      };
    });
    return out;
  }

  /** دقیقهٔ اندازه‌گیری‌شده برای هر صفحه (برای نمایش در برابرِ پایهٔ گزارش) */
  function minutesPerPage(state, sid, profile) {
    const base = BASE[profile || 'concept'] || BASE.concept;
    const s = state && state.subjects ? state.subjects[sid] : null;
    const k = s && s.n ? s.pageScale : 1;
    return {
      read: round3(base.read * k),
      active: round3(base.active * k),
      review: round3(base.review * k),
      base: Object.assign({}, base),
      scale: k,
    };
  }

  /** ردیف‌های کارتِ رابط کاربری */
  function rows(state, nameOf) {
    const st = normalize(state);
    return Object.keys(st.subjects).map((sid) => {
      const s = st.subjects[sid];
      return {
        subjectId: sid,
        subjectName: (nameOf && nameOf(sid)) || sid,
        n: s.n,
        scale: s.pageScale,
        ratio: s.ratio,
        deltaPct: Math.round((s.pageScale - 1) * 100),
        estimatedMinutes: s.estimatedMinutes,
        actualMinutes: s.actualMinutes,
        confidence: Math.round(confidence(st, sid) * 100),
        source: s.source,
        lastAt: s.lastAt,
        limited: s.n < MIN_SAMPLES_FOR_FULL,
      };
    }).sort((a, b) => b.n - a.n);
  }

  function summary(state) {
    const st = normalize(state);
    const ids = Object.keys(st.subjects);
    const measured = ids.filter((sid) => st.subjects[sid].n > 0);
    return {
      subjects: ids.length,
      measured: measured.length,
      samples: measured.reduce((a, sid) => a + st.subjects[sid].n, 0),
      updatedAt: st.updatedAt,
    };
  }

  /** متنِ کوتاه برای دستیار و رابط */
  function describe(state, nameOf, sid) {
    const st = normalize(state);
    if (sid) {
      const s = st.subjects[sid];
      if (!s || !s.n) {
        return (nameOf ? nameOf(sid) : sid) + ': هنوز اندازه‌گیری نشده — برآوردِ پایهٔ گزارش استفاده می‌شود.';
      }
      const d = Math.round((s.pageScale - 1) * 100);
      return (nameOf ? nameOf(sid) : sid) + ': ' + (s.n) + ' نمونه · ضریب ' +
        (Math.round(s.pageScale * 100) / 100) + ' (' + (d >= 0 ? '+' : '') + d + '٪ نسبت به برآوردِ پایه)' +
        (s.n < MIN_SAMPLES_FOR_FULL ? ' · در حالِ یادگیری (اثر محدود)' : '');
    }
    const sm = summary(st);
    if (!sm.measured) return 'هنوز هیچ درسی اندازه‌گیری نشده؛ همهٔ زمان‌ها برآوردِ پایه است.';
    return sm.measured + ' درس اندازه‌گیری شده · ' + sm.samples + ' نمونه · آخرین به‌روزرسانی: ' + String(sm.updatedAt || '').slice(0, 10);
  }

  return {
    VERSION, BASE, MIN_SAMPLES_FOR_FULL, LIMIT_EARLY, LIMIT_FULL,
    empty, normalize, record, setScale, toConfig, minutesPerPage, rows, summary, describe, confidence,
  };
}));
