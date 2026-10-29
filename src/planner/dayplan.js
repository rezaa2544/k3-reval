/**
 * روال اجرای روز — تایمر بلوک‌ها، توقف/ادامه، شروع روز و انتقال کارهای جامانده
 * -------------------------------------------------------------------------
 * این ماژول «حافظهٔ اجرا» را نگه می‌دارد، نه برنامه‌ریزی را:
 *   • هر بلوک می‌تواند «در حال اجرا»، «متوقف (مکس)» یا «تمام‌شده» باشد.
 *   • زمانِ جمع‌شده انبار می‌شود؛ وقتی به مدت برنامه‌ریزی‌شده رسید، بلوک تمام است.
 *   • اگر بلوک نیمه‌کاره بماند (توقف طولانی/شب شدن)، باقی‌مانده با اولویت
 *     به امروز/فردا/روزهای بعد منتقل می‌شود و موتور برنامه را بازچینی می‌کند.
 *
 * همهٔ توابع خالص‌اند (ورودی → خروجی) تا در تست بدون رابط کاربری هم اجرا شوند.
 */

(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.RevalDayPlan = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const MIN = 60000;
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

  /* ---------- ساعت ---------- */

  function hmToMin(v) {
    const m = /^\s*(\d{1,2}):(\d{2})\s*$/.exec(String(v == null ? '' : v));
    if (!m) return null;
    const h = Number(m[1]); const mm = Number(m[2]);
    if (h > 23 || mm > 59) return null;
    return h * 60 + mm;
  }
  function minToHM(t) {
    const v = ((Math.round(t) % 1440) + 1440) % 1440;
    return String(Math.floor(v / 60)).padStart(2, '0') + ':' + String(v % 60).padStart(2, '0');
  }
  const FA = (n) => String(n).replace(/[0-9]/g, (d) => '۰۱۲۳۴۵۶۷۸۹'[+d]);

  /* ---------- وضعیت تایمر بلوک ---------- */

  /**
   * وضعیت اولیهٔ یک بلوک.
   * plannedMinutes: مدت برنامه‌ریزی‌شده · accumMs: زمان جمع‌شده · since: لحظهٔ شروع آخرین اجرا
   */
  function newSession(block) {
    const planned = Math.round(Number(block && block.minutes) ||
      Math.max(0, (hmToMin(block && block.end) || 0) - (hmToMin(block && block.start) || 0)));
    return {
      plannedMinutes: planned,
      accumMs: 0,
      since: null,
      status: 'idle',     // idle | running | paused | done
      finishedAt: null,
      pauses: 0,
    };
  }

  function elapsedMs(s, nowMs) {
    if (!s) return 0;
    const live = (s.status === 'running' && s.since != null) ? Math.max(0, T(nowMs) - s.since) : 0;
    return Math.max(0, (s.accumMs || 0) + live);
  }
  function elapsedMinutes(s, nowMs) {
    return Math.floor(elapsedMs(s, nowMs) / MIN);
  }
  function remainingMinutes(s, nowMs) {
    if (!s) return 0;
    return Math.max(0, Math.round((s.plannedMinutes || 0) - elapsedMs(s, nowMs) / MIN));
  }
  function progressPct(s, nowMs) {
    if (!s || !s.plannedMinutes) return 0;
    return clamp(Math.round((elapsedMs(s, nowMs) / MIN / s.plannedMinutes) * 100), 0, 100);
  }

  const T = (v) => (v == null ? Date.now() : v);

  function start(s, nowMs) {
    const t = T(nowMs);
    if (s.status === 'running' || s.status === 'done') return s;
    return Object.assign({}, s, { status: 'running', since: t });
  }
  function pause(s, nowMs) {
    if (s.status !== 'running') return s;
    const t = T(nowMs);
    const add = Math.max(0, t - (s.since == null ? t : s.since));
    const acc = (s.accumMs || 0) + add;
    const done = acc / MIN >= (s.plannedMinutes || 0) - 0.01;
    return Object.assign({}, s, {
      accumMs: acc, since: null, pauses: (s.pauses || 0) + 1,
      status: done ? 'done' : 'paused',
      finishedAt: done ? t : s.finishedAt,
    });
  }
  function resume(s, nowMs) {
    if (s.status !== 'paused') return s;
    return Object.assign({}, s, { status: 'running', since: T(nowMs) });
  }
  function finish(s, nowMs) {
    const t = T(nowMs);
    const acc = (s.accumMs || 0) + (s.status === 'running' && s.since != null ? Math.max(0, t - s.since) : 0);
    return Object.assign({}, s, { accumMs: acc, since: null, status: 'done', finishedAt: t });
  }
  /**
   * یک قدم کامل: idle→running، running→paused/awaiting.
   * وقتی زمان برنامه‌ریزی‌شده پر شد، بلوک «تمام‌شده» اعلام نمی‌شود؛
   * وارد حالت «منتظر پاسخ» می‌شود تا از کاربر بپرسیم هنوز مشغول است یا نه.
   */
  function tick(s, nowMs) {
    if (!s) return s;
    /* اگر کاربر گفته «هنوز می‌خوانم»، دیگر پرسش تکرار نمی‌شود؛ تا «پایان فصل» ادامه می‌دهد */
    if (s.overtime) return s;
    if (s.status === 'running' && remainingMinutes(s, nowMs) <= 0) return toAwaiting(s, nowMs);
    return s;
  }

  /** حداکثر زمانی که می‌توانیم به‌عنوان «درس می‌خواندم» به حساب بیاوریم (دقیقه) */
  const MAX_CREDIT_MIN = 120;

  /** زمان برنامه‌ریزی‌شده پر شده؟ */
  function plannedReached(s, nowMs) {
    if (!s || s.overtime) return false;
    return elapsedMs(s, nowMs) / MIN >= (s.plannedMinutes || 0) - 0.01;
  }

  /** چند دقیقه بیشتر از برنامه خوانده شده (اضافه‌کاری) */
  function overtimeMinutes(s, nowMs) {
    if (!s) return 0;
    return Math.max(0, Math.round(elapsedMs(s, nowMs) / MIN - (s.plannedMinutes || 0)));
  }

  /**
   * رسیدن به پایان زمان برنامه‌ریزی‌شده: تایمر «قفل» می‌شود و منتظر پاسخ کاربر می‌مانیم.
   * ضبط زمان متوقف می‌شود تا اگر کاربر رفته بود، زمانِ نبودنش به حساب نیاید.
   */
  function toAwaiting(s, nowMs) {
    const t = T(nowMs);
    const raw = (s.accumMs || 0) + (s.status === 'running' && s.since != null ? Math.max(0, t - s.since) : 0);
    /* زمان تا سقفِ برنامه‌ریزی‌شده حساب می‌شود؛ اضافه‌اش فقط با تأیید کاربر می‌نشیند */
    const cap = (s.plannedMinutes || 0) * MIN;
    const acc = cap > 0 ? Math.min(raw, cap) : raw;
    return Object.assign({}, s, {
      status: 'awaiting', accumMs: acc, since: null,
      awaitSince: t, awaitAsked: false,
    });
  }

  /**
   * پاسخ «بله، هنوز مشغولم»: زمانِ انتظار (تا سقف ۲ ساعت) به زمان مطالعه اضافه می‌شود
   * و تایمر ادامه پیدا می‌کند تا خودش بسته شود.
   */
  function answerStillStudying(s, nowMs) {
    const t = T(nowMs);
    const span = clamp(t - (s.awaitSince == null ? t : s.awaitSince), 0, MAX_CREDIT_MIN * MIN);
    return Object.assign({}, s, {
      status: 'running', since: t, awaitSince: null,
      accumMs: Math.max(0, (s.accumMs || 0) + span),
      overtime: true, overtimeCreditedMs: (s.overtimeCreditedMs || 0) + span,
    });
  }

  /**
   * پاسخ «نه، رفته بودم»: زمانِ انتظار دور ریخته می‌شود، تایمر متوقف می‌ماند
   * و بلوک به‌عنوان «تمام‌شده با زمان برنامه‌ریزی‌شده» بسته می‌شود (بقیه‌اش جامانده می‌شود).
   */
  function answerAway(s, nowMs) {
    const t = T(nowMs);
    const span = Math.max(0, t - (s.awaitSince == null ? t : s.awaitSince));
    return Object.assign({}, s, {
      status: 'done', since: null, awaitSince: null, finishedAt: t,
      missedMs: (s.missedMs || 0) + span, awayAnswered: true,
    });
  }

  /** بستن دستی بلوک با تأیید کاربر («پایان» → «مطمئنی؟» → بله) */
  function closeConfirmed(s, nowMs) {
    const t = T(nowMs);
    const acc = (s.accumMs || 0) + (s.status === 'running' && s.since != null ? Math.max(0, t - s.since) : 0);
    return Object.assign({}, s, {
      status: 'done', since: null, awaitSince: null, finishedAt: t,
      accumMs: acc, confirmed: true,
      earlyClose: acc / MIN < (s.plannedMinutes || 0) - 0.01,
    });
  }

  function statusFa(s) {
    if (!s) return '—';
    if (s.status === 'running') return (s.overtime ? 'در حال اجرا (اضافه‌کاری)' : 'در حال اجرا');
    if (s.status === 'paused') return 'متوقف (مکس)';
    if (s.status === 'awaiting') return 'منتظر پاسخ تو';
    if (s.status === 'done') return (s.earlyClose ? 'تمام‌شده (پیش از پایان زمان)' : 'تمام‌شده');
    return 'شروع نشده';
  }

  /* ---------- بلوک‌های ثابت ---------- */

  const FIXED_KINDS = ['exam', 'mock', 'emergency', 'routine', 'class'];

  /**
   * آیا این بلوک در بازچینش روز جابه‌جا نمی‌شود؟
   * کلاس‌ها و روال‌ها (وعده‌های غذایی) و آزمون‌ها و آیتم‌های اضطراری همیشه سر جایشان‌اند.
   */
  function isPinned(block) {
    if (!block) return false;
    if (block.fixed) return true;
    return FIXED_KINDS.indexOf(block.kind) !== -1;
  }

  /**
   * بازچینش یک روز از ساعت واقعیِ شروع («شروع روز»).
   *   • بلوک‌های ثابت (کلاس/روال/آزمون/اضطراری) دقیقاً سر جایشان می‌مانند.
   *   • بقیهٔ بلوک‌ها به ترتیب زمان، از ساعت واقعی شروع، پشت‌سرهم چیده می‌شوند و
   *     روی بلوک ثابت نمی‌افتند (با احترام به استراحتِ بین بلوک‌ها).
   *   • هر بلوکی که تا پایان پنجرهٔ روز جا نشود، به‌عنوان «جامانده» برگردانده می‌شود.
   *
   * @param {object} day   روز برنامه (blocks + events)
   * @param {number} startMin  دقیقهٔ شروع واقعی روز (مثلاً ۱۱:۰۰ ⇒ ۶۶۰)
   * @param {object} opts  { breakMinutes, windowEnd } — پایان پنجره پیش‌فرض ۲۳:۴۵
   * @returns {{blocks: Array, spill: Array, startMin: number, windowEnd: number}}
   */
  function relayout(day, startMin, opts) {
    const o = opts || {};
    const brk = o.breakMinutes == null ? 10 : Math.max(0, Number(o.breakMinutes) || 0);
    const blocks = (day && day.blocks ? day.blocks.slice() : []);
    const pinned = blocks.filter(isPinned).sort(byStart);
    const movable = blocks.filter((b) => !isPinned(b)).sort(byStart);

    /* پایان پنجره: آخرین بلوک یا ۲۳:۴۵، هرکدام دیرتر */
    const lastEnd = blocks.reduce((a, b) => Math.max(a, hmToMin(b.end) || 0), 0);
    const windowEnd = Math.max(o.windowEnd || 0, lastEnd, startMin + 60);

    /* اشغال‌های ثابت */
    const busy = pinned.map((b) => ({ start: hmToMin(b.start) || 0, end: hmToMin(b.end) || 0, b }));

    const out = [];
    let cursor = Math.max(0, Math.round(startMin));
    let prev = null;
    const spill = [];

    function freeSlot(from, need) {
      /* اولین جای خالی به اندازهٔ need از «from» به بعد، بدون برخورد با بلوک ثابت */
      let t = from;
      let guard = 0;
      while (guard++ < 200) {
        const hit = busy.find((x) => t < x.end && t + need > x.start);
        if (!hit) break;
        t = hit.end;                 // برو بعد از بلوک ثابت
      }
      return t;
    }

    movable.forEach((b) => {
      const dur = Math.max(5, (hmToMin(b.end) || 0) - (hmToMin(b.start) || 0) || b.minutes || 30);
      let st = cursor;
      if (prev) st = Math.max(st, cursor + brk);
      /* از ساعت واقعی شروع، هیچ بلوکی قبل از شروع روز چیده نمی‌شود */
      st = Math.max(st, startMin);
      st = freeSlot(st, dur);
      if (st + dur > windowEnd) {
        spill.push({
          date: day && day.date,
          subjectId: b.subjectId, subjectName: b.subjectName,
          topicLabel: b.topic, topicId: b.topicId || null,
          kind: b.kind, minutes: dur,
          priority: priorityOf(b),
          from: day && day.date,
        });
        return;
      }
      out.push(Object.assign({}, b, {
        start: minToHM(st), end: minToHM(st + dur), minutes: dur,
        moved: hmToMin(b.start) !== st,
        originalStart: b.start,
      }));
      cursor = st + dur;
      prev = b;
    });

    const fixedOut = pinned.map((b) => Object.assign({}, b, { pinned: true }));
    const all = fixedOut.concat(out).sort(byStart);
    return { blocks: all, spill, startMin, windowEnd };
  }

  function byStart(a, b) { return (hmToMin(a.start) || 0) - (hmToMin(b.start) || 0); }

  /* ---------- اولویت‌گذاری جامانده‌ها ---------- */

  const KIND_PRIORITY = {
    emergency: 900,
    exam: 800,
    mock: 760,
    analysis: 700,
    finalprep: 680,
    classfix: 640,
    deadlinecheck: 620,
    warmup: 560,
    review: 520,
    cumreview: 500,
    carry: 495,
    carryreview: 490,
    learn: 480,
    reteach: 470,
    boost: 460,
    practice: 440,
  };

  /**
   * اولویت انتقال: نوع کار + اهمیت فصل (اگر برنامه داده باشد) + نزدیکی به مهلت.
   * فصل پرتکرار/مهم یا مهلت‌دار، اول منتقل می‌شود.
   */
  function priorityOf(block, info) {
    const base = KIND_PRIORITY[block && block.kind] || 400;
    const ciMult = info && info.mult ? info.mult : 1;
    const ciBonus = (ciMult - 1) * 120;
    const deadlineBonus = info && info.deadlineIdx != null ? 60 : 0;
    return Math.round(base + ciBonus + deadlineBonus);
  }

  /** مرتب‌سازی جامانده‌ها برای انتقال: بالاترین اولویت اول */
  function sortSpill(list, infoOf) {
    return (list || []).slice().sort((a, b) => {
      const pa = priorityOf(a, infoOf ? infoOf(a) : null);
      const pb = priorityOf(b, infoOf ? infoOf(b) : null);
      if (pb !== pa) return pb - pa;
      return (b.minutes || 0) - (a.minutes || 0);
    });
  }

  /**
   * جامانده‌های امروز: بلوک‌هایی که «تمام نشده‌اند».
   * withAnyTime = بلوک‌هایی که اصلاً شروع نشده‌اند هم جامانده‌اند.
   */
  function unfinished(day, sessions, opts) {
    const o = opts || {};
    const onlyStarted = o.onlyStarted !== false;   // پیش‌فرض: همهٔ بلوک‌های انجام‌نشده
    const out = [];
    ((day && day.blocks) || []).forEach((b, i) => {
      if (isPinned(b) && b.kind !== 'emergency') return;   // کلاس/آزمون/روال قابل انتقال نیست
      const key = (day.date || '') + '#' + i;
      const s = sessions ? sessions[key] : null;
      const planned = s ? s.plannedMinutes : (b.minutes || 0);
      const rest = s ? remainingMinutes(s) : planned;
      if (s && s.status === 'done') return;
      if (rest <= 0) return;
      if (onlyStarted && s && s.status === 'idle' && o.skipUntouched) return;
      out.push({
        date: day.date, block: b, key, minutes: rest, plannedMinutes: planned,
        elapsedMinutes: planned - rest,
        started: Boolean(s && s.status !== 'idle'),
        subjectId: b.subjectId, subjectName: b.subjectName,
        topicLabel: b.topic, kind: b.kind,
        priority: priorityOf(b),
      });
    });
    return sortSpill(out);
  }

  /**
   * بستهٔ انتقال برای موتور: همان ساختاری که cfg.carryOver می‌خواهد.
   * فقط کارهایی که واقعاً قابل جبران‌اند (یادگیری/تست/مرور) منتقل می‌شوند.
   */
  function toCarryOver(list, opts) {
    const o = opts || {};
    const maxItems = o.maxItems || 40;
    const skipKinds = { exam: 1, mock: 1, routine: 1, class: 1, analysis: 1 };
    return sortSpill(list)
      .filter((x) => !skipKinds[x.kind])
      .slice(0, maxItems)
      .map((x) => ({
        subjectId: x.subjectId, subjectName: x.subjectName,
        topicLabel: x.topicLabel + ' (جامانده ' + FA(Math.round(x.minutes)) + ' دقیقه)',
        minutes: Math.max(10, Math.round(x.minutes)),
        kind: /review|warmup|cumreview/.test(x.kind || '') ? 'review' : 'learn',
        priority: priorityOf(x),
      }));
  }

  /** خلاصهٔ روز برای نمایش: چقدر انجام شد، چقدر ماند */
  function dayProgress(day, sessions, nowMs) {
    /* فقط بلوک‌های کاری: روال روز، کلاس و آزمون جزو «مطالعهٔ روز» حساب نمی‌شوند */
    const SKIP = { routine: 1, class: 1 };
    const blocks = ((day && day.blocks) || []).filter((b) => !SKIP[b.kind]);
    let planned = 0; let done = 0; let running = 0; let paused = 0;
    blocks.forEach((b, i) => {
      const key = (day.date || '') + '#' + i;
      const s = sessions ? sessions[key] : null;
      const p = s ? s.plannedMinutes : (b.minutes || 0);
      planned += p;
      if (!s) return;
      const e = Math.min(p, elapsedMs(s, nowMs) / MIN);
      done += e;
      if (s.status === 'running') running += 1;
      if (s.status === 'paused') paused += 1;
    });
    return {
      plannedMinutes: Math.round(planned),
      doneMinutes: Math.round(done),
      remainingMinutes: Math.max(0, Math.round(planned - done)),
      pct: planned ? clamp(Math.round((done / planned) * 100), 0, 100) : 0,
      running, paused,
      blocks: blocks.length,
    };
  }

  return {
    hmToMin, minToHM, FA,
    newSession, start, pause, resume, finish, tick,
    plannedReached, overtimeMinutes, toAwaiting, answerStillStudying, answerAway, closeConfirmed,
    MAX_CREDIT_MIN,
    elapsedMs, elapsedMinutes, remainingMinutes, progressPct, statusFa,
    isPinned, relayout, priorityOf, sortSpill, unfinished, toCarryOver, dayProgress,
    FIXED_KINDS, KIND_PRIORITY,
  };
});
