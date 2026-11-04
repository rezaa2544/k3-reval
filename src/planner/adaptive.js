/*!
 * adaptive.js — هستهٔ هوشِ خودتطبیق (۲.۱۰.۰)
 * ------------------------------------------------------------------
 * این ماژول «حافظهٔ تجربه»ی برنامه است. سه کار می‌کند:
 *
 *   ۱) سطح‌سنجی: با چند پرسشِ کوتاه (یا به‌طورِ خودکار از دادهٔ واقعی) سطحِ
 *      استعداد/تاب‌آوریِ دانش‌آموز را تخمین می‌زند (۰..۶).
 *   ۲) یادگیری از واقعیت: هر بلوکِ انجام‌شده (زمانِ برنامه‌ریزی‌شده در برابر
 *      زمانِ واقعی) یک نمونهٔ تجربه است. اگر اختلاف از ۳۵٪ بیشتر بود،
 *      «چرا؟» می‌پرسد و پاسخِ کاربر را به ضریبِ سرعت و سختیِ همان درس تبدیل می‌کند.
 *   ۳) فشارِ یک‌پله‌بالاتر: هدف همیشه یک پله بالاتر از سطحِ فعلی است؛ اگر
 *      دانش‌آموز جواب داد یک پله بالا می‌رود، اگر نداد یک پله پایین می‌آید.
 *
 * همچنین گزارشِ تجربه می‌سازد: هم متنِ فارسی برای ارسال به مخزن، هم JSONِ
 * ماشینی با «پیشنهادِ تغییرِ پارامتر» تا در آپدیتِ بعدیِ برنامه اعمال شود.
 *
 * ماژول کاملاً خالص است: نه DOM، نه شبکه، نه تصادف. همهٔ توابع ورودی را
 * تغییر نمی‌دهند (immutable) و خروجیِ تکرارپذیر می‌دهند.
 */

(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.RevalAdaptive = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const VERSION = 1;

  /* ---------------- ابزار ---------------- */

  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const round1 = (v) => Math.round(v * 10) / 10;
  const round2 = (v) => Math.round(v * 100) / 100;
  const isNum = (v) => typeof v === 'number' && Number.isFinite(v);

  function copy(o) { return JSON.parse(JSON.stringify(o)); }

  /* ---------------- سطح‌ها ---------------- */

  /* ۰..۶ — هر سطح: سقفِ فشار و رفتارِ موتور */
  const LEVELS = [
    { id: 0, name: 'شروعِ آرام', loadFactor: 0.78, sessionAdd: 0, stretch: 0, note: 'هفته‌های اول؛ هدف فقط ساختنِ عادت است.' },
    { id: 1, name: 'پایه', loadFactor: 0.84, sessionAdd: 0, stretch: 1, note: 'ثباتِ روزانه مهم‌تر از حجم است.' },
    { id: 2, name: 'رو به رشد', loadFactor: 0.89, sessionAdd: 3, stretch: 1, note: 'کم‌کم جلسه‌ها بلندتر می‌شوند.' },
    { id: 3, name: 'استاندارد', loadFactor: 0.93, sessionAdd: 5, stretch: 1, note: 'حالتِ پیش‌فرضِ یک دانش‌آموزِ منظم.' },
    { id: 4, name: 'پرفشار', loadFactor: 0.96, sessionAdd: 7, stretch: 2, note: 'بارِ بیشتر، ولی هنوز واقعی.' },
    { id: 5, name: 'پرقدرت', loadFactor: 0.99, sessionAdd: 9, stretch: 2, note: 'نزدیکِ سقفِ ساعتِ اعلامی.' },
    { id: 6, name: 'ترازِ کنکور', loadFactor: 1.0, sessionAdd: 10, stretch: 2, note: 'حداکثرِ ساعتِ اعلامی؛ فشار از راهِ کیفیتِ کار بالا می‌رود.' },
  ];

  function levelInfo(level) {
    const l = clamp(Math.round(isNum(level) ? level : 3), 0, 6);
    return LEVELS[l];
  }

  /* ---------------- وضعیتِ پیش‌فرض ---------------- */

  function defaultState() {
    return {
      version: VERSION,
      level: 3,
      levelSetBy: 'auto',          // auto | quiz | user
      quiz: null,                  // {at, answers:{qid:oid}, score, level}
      pace: {},                    // sid → ضریبِ سرعت (۱ = مطابقِ برآورد)
      paceN: {},                   // sid → تعدادِ نمونه
      difficulty: {},              // sid → ضریبِ سختیِ مشاهده‌شده (۱ = مطابقِ برآورد)
      obs: [],                     // نمونه‌های تجربه (حداکثر ۴۰۰)
      asks: [],                    // پرسش‌های «چرا» — باز یا پاسخ‌داده‌شده
      reasons: { hard: 0, slow: 0, attention: 0, estimate: 0, interrupt: 0, shallow: 0 },
      levelLog: [],                // تاریخِ تغییرِ سطح
      streakOk: 0,                 // بلوک‌های پیاپیِ «سرِ وقت یا زودتر»
      streakMiss: 0,               // بلوک‌های پیاپیِ «خیلی دیرتر»
      sessionBias: 0,              // اثرِ «حواس‌پرتی» روی طولِ جلسه (دقیقه)
      lastAskAt: null,
    };
  }

  function normalize(st) {
    const d = defaultState();
    const s = st && typeof st === 'object' ? copy(st) : {};
    ['pace', 'paceN', 'difficulty', 'reasons'].forEach((k) => {
      s[k] = Object.assign({}, d[k], s[k] && typeof s[k] === 'object' ? s[k] : {});
    });
    ['obs', 'asks', 'levelLog'].forEach((k) => {
      s[k] = Array.isArray(s[k]) ? s[k].slice(0, 400) : [];
    });
    s.level = clamp(Math.round(isNum(s.level) ? s.level : 3), 0, 6);
    s.levelSetBy = ['auto', 'quiz', 'user'].indexOf(s.levelSetBy) !== -1 ? s.levelSetBy : 'auto';
    s.streakOk = Math.max(0, Math.round(isNum(s.streakOk) ? s.streakOk : 0));
    s.streakMiss = Math.max(0, Math.round(isNum(s.streakMiss) ? s.streakMiss : 0));
    s.sessionBias = isNum(s.sessionBias) ? clamp(s.sessionBias, -15, 15) : 0;
    s.version = VERSION;
    return s;
  }

  /* ---------------- پرسش‌های سطح‌سنجی ---------------- */
  /* ۶ پرسش × ۴ گزینه؛ هر گزینه امتیازِ ۰..۳ دارد (۳ = توانِ بالاتر).
     مجموعِ امتیاز (۰..۱۸) به سطح (۰..۶) نگاشت می‌شود. */

  const QUIZ = [
    {
      id: 'q1',
      text: 'دفعهٔ قبل که برای یک امتحان مهم درس خواندی، نتیجه چطور شد؟',
      options: [
        { id: 'a', label: 'خیلی کمتر از آنچه می‌خواستم', score: 0 },
        { id: 'b', label: 'کمی کمتر', score: 1 },
        { id: 'c', label: 'همان‌قدر که می‌خواستم', score: 2 },
        { id: 'd', label: 'بهتر از انتظارم', score: 3 },
      ],
    },
    {
      id: 'q2',
      text: 'یک جلسهٔ درس‌خواندنِ بی‌وقفه چقدر می‌توانی ادامه بدهی؟',
      options: [
        { id: 'a', label: 'کمتر از ۲۰ دقیقه', score: 0 },
        { id: 'b', label: 'حدود ۳۰ دقیقه', score: 1 },
        { id: 'c', label: 'حدود ۴۵–۶۰ دقیقه', score: 2 },
        { id: 'd', label: 'بیش از یک ساعت', score: 3 },
      ],
    },
    {
      id: 'q3',
      text: 'وقتی تمرینی را نمی‌فهمی، معمولاً چه می‌کنی؟',
      options: [
        { id: 'a', label: 'رد می‌شوم و بعداً می‌بینم', score: 0 },
        { id: 'b', label: 'جواب را نگاه می‌کنم', score: 1 },
        { id: 'c', label: 'دوباره تلاش می‌کنم و راهنما می‌خوانم', score: 2 },
        { id: 'd', label: 'خودم حل می‌کنم، بعد جواب را چک می‌کنم', score: 3 },
      ],
    },
    {
      id: 'q4',
      text: 'درس‌هایی را که هفتهٔ قبل خواندی، الان چقدر یادت هست؟',
      options: [
        { id: 'a', label: 'تقریباً هیچ', score: 0 },
        { id: 'b', label: 'تکه‌تکه', score: 1 },
        { id: 'c', label: 'بیشترش را یادم است', score: 2 },
        { id: 'd', label: 'همه‌اش، حتی جزئیات', score: 3 },
      ],
    },
    {
      id: 'q5',
      text: 'اگر برنامه‌ای برایت بچینند، چقدر پایبند می‌مانی؟',
      options: [
        { id: 'a', label: 'کمتر از نصفِ روزها', score: 0 },
        { id: 'b', label: 'حدودِ نیمی از روزها', score: 1 },
        { id: 'c', label: 'بیشترِ روزها', score: 2 },
        { id: 'd', label: 'تقریباً همهٔ روزها', score: 3 },
      ],
    },
    {
      id: 'q6',
      text: 'در آزمون‌های آزمایشی، معمولاً نسبت به وقت چطور عمل می‌کنی؟',
      options: [
        { id: 'a', label: 'هیچ‌وقت نمی‌رسم', score: 0 },
        { id: 'b', label: 'بخشِ آخر را نمی‌رسم', score: 1 },
        { id: 'c', label: 'تقریباً می‌رسم', score: 2 },
        { id: 'd', label: 'می‌رسم و وقتِ بازبینی هم دارم', score: 3 },
      ],
    },
  ];

  function quizQuestions() { return copy(QUIZ); }

  /** پاسخ‌ها → سطح. answers = {q1:'c', ...}. حالتِ ناقص: بر پایهٔ پرسش‌های پاسخ‌داده‌شده میانگین می‌گیرد. */
  function applyQuiz(state, answers) {
    const s = normalize(state);
    const res = { state: s, score: 0, level: s.level, answered: 0, confidence: 0 };
    const a = answers && typeof answers === 'object' ? answers : {};
    let sum = 0;
    let n = 0;
    QUIZ.forEach((q) => {
      const opt = q.options.filter((o) => o.id === a[q.id])[0];
      if (!opt) return;
      sum += opt.score;
      n += 1;
    });
    if (!n) return res;
    const mean = sum / n;                       // ۰..۳
    const level = clamp(Math.round((mean / 3) * 6), 0, 6);
    s.quiz = { at: new Date().toISOString(), answers: copy(a), score: sum, level, answered: n };
    s.level = level;
    s.levelSetBy = 'quiz';
    s.levelLog.push({ at: s.quiz.at, from: null, to: level, why: 'quiz' });
    res.state = s;
    res.score = sum;
    res.level = level;
    res.answered = n;
    res.confidence = round1(n / QUIZ.length);   // ۰..۱
    return res;
  }

  /* ---------------- مشاهدهٔ واقعیت ---------------- */

  const REASONS = [
    { id: 'hard', label: 'فصل از آنچه فکر می‌کردم سخت‌تر بود', effect: 'سختیِ این درس بالا می‌رود' },
    { id: 'slow', label: 'خودم کند پیش رفتم / تمرکز نداشتم', effect: 'ضریبِ سرعتِ من در این درس بالا می‌رود' },
    { id: 'attention', label: 'حواسم پرت شد و زمان تلف شد', effect: 'جلسه‌ها کمی کوتاه‌تر و با استراحتِ بیشتر می‌شوند' },
    { id: 'estimate', label: 'برنامه زمانِ زیادی برای این فصل گذاشته بود', effect: 'برآوردِ موتور برای این درس پایین می‌آید' },
    { id: 'interrupt', label: 'وسطِ کار قطع شدم (مهمان/تماس/کارِ دیگر)', effect: 'این نمونه در یادگیری حساب نمی‌شود' },
    { id: 'shallow', label: 'سریع رد شدم؛ کامل نخواندم', effect: 'برای این فصل تمرین و سنجشِ بیشتر گذاشته می‌شود' },
  ];

  function reasonList() { return copy(REASONS); }

  const ASK_HIGH = 1.35;   // ۳۵٪ بیشتر از برنامه
  const ASK_LOW = 0.6;     // ۴۰٪ کمتر از برنامه

  /**
   * ثبتِ یک مشاهده.
   * @param {object} state
   * @param {{subjectId:string, topicId?:string, chapter?:number, planned:number,
   *          actual:number, done?:boolean, kind?:string, date?:string}} ev
   * @returns {{state:object, ratio:number, mismatch:boolean, ask:object|null, learned:boolean}}
   */
  function observe(state, ev) {
    const s = normalize(state);
    const e = ev || {};
    const planned = Math.max(1, Math.round(isNum(e.planned) ? e.planned : 0));
    const actual = Math.max(0, Math.round(isNum(e.actual) ? e.actual : 0));
    const sid = String(e.subjectId || '-');
    const ratio = actual > 0 ? round2(actual / planned) : 1;
    const out = { state: s, ratio, mismatch: false, ask: null, learned: false };
    if (!actual) return out;                       // بدونِ زمانِ واقعی چیزی یاد نمی‌گیریم

    const rec = {
      at: e.date || new Date().toISOString().slice(0, 10),
      sid,
      topic: e.topicId || null,
      chapter: isNum(e.chapter) ? e.chapter : null,
      kind: e.kind || 'learn',
      planned,
      actual,
      ratio,
      done: e.done !== false,
    };
    s.obs.push(rec);
    if (s.obs.length > 400) s.obs = s.obs.slice(-400);

    /* یادگیریِ خام: ضریبِ سرعت با میانگینِ متحرکِ وزنی (EWMA) به‌روز می‌شود.
       نمونه‌های تازه وزنِ بیشتری دارند و ضریب هرگز از ۰٫۶..۱٫۸ بیرون نمی‌زند. */
    const n = (s.paceN[sid] || 0) + 1;
    const cur = isNum(s.pace[sid]) ? s.pace[sid] : 1;
    const w = Math.min(0.5, 1 / Math.max(2, n));   // نمونه‌های اول سریع یاد می‌گیرند
    s.pace[sid] = round2(clamp(cur * (1 - w) + ratio * w, 0.6, 1.8));
    s.paceN[sid] = n;
    out.learned = true;

    /* استریکِ فشار */
    if (ratio <= 1.05) { s.streakOk += 1; s.streakMiss = 0; }
    else if (ratio >= ASK_HIGH) { s.streakMiss += 1; s.streakOk = 0; }
    else { s.streakOk = Math.max(0, s.streakOk - 1); s.streakMiss = Math.max(0, s.streakMiss - 1); }

    /* پرسشِ «چرا؟» — فقط وقتی اختلاف چشمگیر است و برای همان بلوک قبلاً نپرسیده‌ایم */
    const needAsk = ratio >= ASK_HIGH || ratio <= ASK_LOW;
    if (needAsk) {
      const already = s.asks.some((q) => !q.answeredAt && q.topic === rec.topic && q.planned === planned);
      if (!already) {
        const ask = {
          id: 'Q' + (s.asks.length + 1),
          at: new Date().toISOString(),
          sid,
          topic: rec.topic,
          chapter: rec.chapter,
          kind: rec.kind,
          planned,
          actual,
          ratio,
          direction: ratio >= ASK_HIGH ? 'long' : 'short',
          answeredAt: null,
          reason: null,
          note: '',
        };
        s.asks.push(ask);
        s.lastAskAt = ask.at;
        out.ask = ask;
      }
      out.mismatch = true;
    }

    out.state = s;
    return out;
  }

  /**
   * پاسخ به پرسشِ «چرا». پاسخ روی ضریبِ سرعت، سختیِ درس و طولِ جلسه اثر می‌گذارد.
   */
  function answerQuestion(state, askId, reasonId, note) {
    const s = normalize(state);
    const q = s.asks.filter((x) => x.id === askId)[0];
    if (!q) return { state: s, ok: false, message: 'این پرسش پیدا نشد.' };
    const r = REASONS.filter((x) => x.id === reasonId)[0];
    if (!r) return { state: s, ok: false, message: 'دلیل نامعتبر است.' };
    q.answeredAt = new Date().toISOString();
    q.reason = reasonId;
    q.note = String(note || '').slice(0, 300);
    s.reasons[reasonId] = (s.reasons[reasonId] || 0) + 1;
    const sid = q.sid;
    const long = q.direction === 'long';

    if (reasonId === 'hard') {
      /* فصل سخت‌تر بود ⇒ سختیِ آن درس بالا و ضریبِ سرعت هم کمی بالا می‌رود */
      const d = isNum(s.difficulty[sid]) ? s.difficulty[sid] : 1;
      s.difficulty[sid] = round2(clamp(d * 1.08, 0.8, 1.6));
      s.pace[sid] = round2(clamp((isNum(s.pace[sid]) ? s.pace[sid] : 1) * 1.02, 0.6, 1.8));
      s.streakOk = Math.max(0, s.streakOk - 1);
    } else if (reasonId === 'slow') {
      s.pace[sid] = round2(clamp((isNum(s.pace[sid]) ? s.pace[sid] : 1) * 1.05, 0.6, 1.8));
    } else if (reasonId === 'attention') {
      s.sessionBias = clamp(s.sessionBias - 3, -15, 15);
      s.streakMiss = Math.max(0, s.streakMiss - 1);   // تقصیرِ سختی نبود
    } else if (reasonId === 'estimate') {
      s.pace[sid] = round2(clamp((isNum(s.pace[sid]) ? s.pace[sid] : 1) * 0.95, 0.6, 1.8));
    } else if (reasonId === 'interrupt') {
      /* نمونهٔ آلوده: از آمار بیرون می‌رود */
      s.obs = s.obs.filter((o) => !(o.sid === sid && o.planned === q.planned && o.actual === q.actual));
      const n = Math.max(1, s.paceN[sid] || 1);
      const cur = isNum(s.pace[sid]) ? s.pace[sid] : 1;
      s.pace[sid] = round2(clamp(cur + (1 - cur) / n, 0.6, 1.8));   // برگشتِ نرم به ۱
      s.paceN[sid] = Math.max(1, (s.paceN[sid] || 1) - 1);
      s.streakMiss = Math.max(0, s.streakMiss - 1);
      s.streakOk = Math.max(0, s.streakOk - 1);
    } else if (reasonId === 'shallow') {
      s.difficulty[sid] = round2(clamp((isNum(s.difficulty[sid]) ? s.difficulty[sid] : 1) * 1.06, 0.8, 1.6));
      if (!long) s.pace[sid] = round2(clamp((isNum(s.pace[sid]) ? s.pace[sid] : 1) * 1.06, 0.6, 1.8));
    }
    return { state: s, ok: true, message: 'یاد گرفتم — ' + r.effect + '.' };
  }

  /* پرسش‌های باز (برای نمایش در رابط) */
  function openQuestions(state) {
    const s = normalize(state);
    return s.asks.filter((q) => !q.answeredAt);
  }

  /* ---------------- تصمیمِ سطح (فشارِ یک پله بالاتر) ---------------- */

  const LEVEL_WINDOW = 6;      // چند نمونهٔ آخر ملاک است

  /**
   * تصمیم‌گیری دربارهٔ سطح بر پایهٔ نمونه‌های اخیر.
   * قاعده: اگر میانگینِ نسبت ≤ ۰٫۹۲ و نرخِ تکمیل ≥ ۸۰٪ ⇒ یک پله بالا.
   *        اگر میانگین ≥ ۱٫۲۵ یا نرخِ تکمیل < ۵۵٪ ⇒ یک پله پایین.
   */
  function levelDecision(state) {
    const s = normalize(state);
    const last = s.obs.slice(-LEVEL_WINDOW);
    const res = { level: s.level, change: 0, why: 'دادهٔ کافی نیست', avgRatio: null, completion: null, ready: false };
    if (last.length < LEVEL_WINDOW) {
      res.ready = false;
      return res;
    }
    const avg = last.reduce((a, o) => a + o.ratio, 0) / last.length;
    const comp = last.filter((o) => o.done).length / last.length;
    res.avgRatio = round2(avg);
    res.completion = round2(comp);
    res.ready = true;
    if (avg <= 0.92 && comp >= 0.8) {
      res.change = 1;
      res.why = 'مصرفِ زمان زیرِ برآورد بود و کار را تمام کردی';
    } else if (avg >= 1.25 || comp < 0.55) {
      res.change = -1;
      res.why = 'زمانِ واقعی بالا بود یا کارِ روز کامل نشد';
    } else {
      res.why = 'در همین سطح بمان';
    }
    res.level = clamp(s.level + res.change, 0, 6);
    return res;
  }

  /** تصمیم را اعمال می‌کند (اگر تغییری لازم بود). */
  function applyLevelDecision(state) {
    const s = normalize(state);
    const d = levelDecision(s);
    if (!d.ready || !d.change) return { state: s, change: 0, message: d.why, decision: d };
    if (s.levelSetBy === 'user') return { state: s, change: 0, message: 'سطح را خودت انتخاب کرده‌ای؛ تغییر نمی‌دهم.', decision: d };
    const from = s.level;
    s.level = d.level;
    s.levelLog.push({ at: new Date().toISOString(), from, to: d.level, why: d.why });
    return {
      state: s,
      change: d.change,
      message: d.change > 0 ? 'یک پله بالاتر رفتیم — ' + levelInfo(s.level).note : 'یک پله پایین آمدیم — ' + levelInfo(s.level).note,
      decision: d,
    };
  }

  function setLevel(state, level, by) {
    const s = normalize(state);
    const lv = clamp(Math.round(isNum(level) ? level : 3), 0, 6);
    const prev = s.level;
    s.level = lv;
    s.levelSetBy = by === 'user' ? 'user' : s.levelSetBy;
    s.levelLog.push({ at: new Date().toISOString(), from: prev, to: lv, why: by === 'user' ? 'user' : 'manual' });
    return s;
  }

  /* ---------------- تبدیل به پارامترهای موتور ---------------- */

  /** ضریبِ ساعتِ روز (هرگز از ساعتِ اعلامی بیشتر نمی‌شود — موتور خودش سقف دارد). */
  function loadFactor(state) { return levelInfo(normalize(state).level).loadFactor; }

  /** چند دقیقه به هر جلسه اضافه شود (فشارِ یک‌پله‌بالاتر بدونِ شکستنِ سقفِ ساعت). */
  function sessionAdd(state) {
    const s = normalize(state);
    return levelInfo(s.level).sessionAdd + Math.round(s.sessionBias / 3);
  }

  /** ضریبِ زمان برای یک درس: ترکیبِ سرعتِ مشاهده‌شده و سختیِ مشاهده‌شده. */
  function paceFor(state, sid) {
    const s = normalize(state);
    const p = isNum(s.pace[sid]) ? s.pace[sid] : 1;
    const d = isNum(s.difficulty[sid]) ? s.difficulty[sid] : 1;
    return round2(clamp(p * d, 0.6, 1.9));
  }

  /** این شیء را موتور به‌عنوانِ cfg.adaptive مصرف می‌کند. */
  function engineConfig(state) {
    const s = normalize(state);
    const pace = {};
    Object.keys(s.pace).forEach((sid) => {
      const v = paceFor(s, sid);
      if (Math.abs(v - 1) >= 0.02) pace[sid] = v;
    });
    return {
      level: s.level,
      levelName: levelInfo(s.level).name,
      loadFactor: loadFactor(s),
      sessionAdd: sessionAdd(s),
      stretch: levelInfo(s.level).stretch,
      pace,
      samples: Object.keys(s.paceN).reduce((a, k) => a + (s.paceN[k] || 0), 0),
    };
  }

  /* ---------------- گزارشِ تجربه ---------------- */

  function subjectRows(s) {
    const by = {};
    s.obs.forEach((o) => {
      const k = o.sid;
      if (!by[k]) by[k] = { sid: k, n: 0, planned: 0, actual: 0, minRatio: 9, maxRatio: 0 };
      by[k].n += 1;
      by[k].planned += o.planned;
      by[k].actual += o.actual;
      by[k].minRatio = Math.min(by[k].minRatio, o.ratio);
      by[k].maxRatio = Math.max(by[k].maxRatio, o.ratio);
    });
    return Object.keys(by).sort().map((k) => {
      const r = by[k];
      return {
        sid: k,
        n: r.n,
        planned: r.planned,
        actual: r.actual,
        avgRatio: round2(r.actual / Math.max(1, r.planned)),
        pace: isNum(s.pace[k]) ? s.pace[k] : 1,
        difficulty: isNum(s.difficulty[k]) ? s.difficulty[k] : 1,
        minRatio: round2(r.minRatio),
        maxRatio: round2(r.maxRatio),
      };
    });
  }

  /** پیشنهادِ تغییرِ پارامتر برای آپدیتِ بعدیِ برنامه (JSONِ ماشینی). */
  function suggestParamDeltas(state) {
    const s = normalize(state);
    const rows = subjectRows(s).filter((r) => r.n >= 3);
    const out = { generatedAt: new Date().toISOString(), enoughData: rows.length > 0, subjects: {}, global: {} };
    rows.forEach((r) => {
      const d = {};
      if (Math.abs(r.avgRatio - 1) >= 0.1) d.timeMultiplier = round2(r.avgRatio);
      if (r.n >= 5 && Math.abs(r.avgRatio - 1) >= 0.15) d.confidence = 'بالا';
      if (Object.keys(d).length) out.subjects[r.sid] = d;
    });
    const n = s.obs.length;
    if (n >= 10) {
      const avg = s.obs.reduce((a, o) => a + o.ratio, 0) / n;
      if (Math.abs(avg - 1) >= 0.08) out.global.timeMultiplier = round2(avg);
    }
    const rt = s.reasons;
    const tot = Object.keys(rt).reduce((a, k) => a + rt[k], 0);
    if (tot >= 5) {
      out.global.reasonMix = {};
      Object.keys(rt).forEach((k) => { if (rt[k]) out.global.reasonMix[k] = round2(rt[k] / tot); });
      if ((rt.estimate || 0) / tot >= 0.35) out.global.hint = 'برآوردِ موتور برای این دانش‌آموز محافظه‌کارانه است؛ زمانِ فازها را کمی کم کن.';
      else if ((rt.hard || 0) / tot >= 0.35) out.global.hint = 'سختیِ فصل‌ها دست‌کم گرفته شده؛ ضریبِ سختی/تمرین را بالا ببر.';
      else if ((rt.attention || 0) / tot >= 0.35) out.global.hint = 'طولِ جلسه برای این دانش‌آموز زیاد است؛ جلسه‌های کوتاه‌تر با استراحتِ بیشتر.';
    }
    return out;
  }

  /**
   * گزارشِ تجربه: متنِ فارسیِ آماده برای ارسال به مخزن (Issue/Discussion)
   * + بلوکِ JSONِ ماشینی در انتها.
   */
  function experienceReport(state, meta) {
    const s = normalize(state);
    const m = meta || {};
    const rows = subjectRows(s);
    const deltas = suggestParamDeltas(s);
    const L = [];
    L.push('# گزارشِ تجربهٔ هستهٔ هوشِ خودتطبیق — Reval');
    L.push('');
    L.push('> این گزارش را برنامه خودش از روی دادهٔ واقعیِ همین دستگاه ساخته است.');
    L.push('> هیچ نام و اطلاعاتِ شناسایی‌کننده‌ای در آن نیست.');
    L.push('');
    L.push('| | |');
    L.push('|---|---|');
    L.push('| **نسخهٔ برنامه** | ' + (m.appVersion || '—') + ' |');
    L.push('| **تاریخِ ساختِ گزارش** | ' + new Date().toISOString().slice(0, 10) + ' |');
    L.push('| **سطحِ فعلی** | ' + s.level + ' — ' + levelInfo(s.level).name + ' (' + s.levelSetBy + ') |');
    L.push('| **تعدادِ نمونه** | ' + s.obs.length + ' |');
    L.push('| **پایه/رشته** | ' + (m.grade || '—') + ' · ' + (m.field || '—') + ' |');
    L.push('| **ساعتِ اعلامی** | ' + (m.hours || '—') + ' |');
    L.push('');
    L.push('## ۱) زمانِ واقعی در برابرِ برآوردِ موتور');
    L.push('');
    if (!rows.length) L.push('_هنوز نمونه‌ای ثبت نشده است._');
    else {
      L.push('| درس | نمونه | برنامه (دقیقه) | واقعی (دقیقه) | نسبت | ضریبِ سرعت | ضریبِ سختی |');
      L.push('|---|---|---|---|---|---|---|');
      rows.forEach((r) => {
        L.push('| ' + r.sid + ' | ' + r.n + ' | ' + r.planned + ' | ' + r.actual + ' | ' + r.avgRatio + ' | ' + r.pace + ' | ' + r.difficulty + ' |');
      });
    }
    L.push('');
    L.push('## ۲) دلیلِ اختلاف‌ها (پاسخِ خودِ دانش‌آموز)');
    L.push('');
    const rt = s.reasons;
    const tot = Object.keys(rt).reduce((a, k) => a + rt[k], 0);
    if (!tot) L.push('_هنوز پرسشی پاسخ داده نشده است._');
    else {
      L.push('| دلیل | تعداد | سهم |');
      L.push('|---|---|---|');
      REASONS.forEach((r) => {
        if (!rt[r.id]) return;
        L.push('| ' + r.label + ' | ' + rt[r.id] + ' | ' + Math.round((rt[r.id] / tot) * 100) + '٪ |');
      });
    }
    L.push('');
    L.push('## ۳) تاریخِ تغییرِ سطحِ فشار');
    L.push('');
    if (!s.levelLog.length) L.push('_بدونِ تغییر._');
    else {
      s.levelLog.slice(-20).forEach((e) => {
        L.push('- ' + String(e.at).slice(0, 10) + ': ' + (e.from == null ? '—' : e.from) + ' → ' + e.to + ' · ' + (e.why || ''));
      });
    }
    L.push('');
    L.push('## ۴) پیشنهادِ تغییرِ پارامتر (برای آپدیتِ بعدی)');
    L.push('');
    if (!deltas.enoughData) L.push('_برای پیشنهاد، حداقل ۳ نمونه در یک درس لازم است._');
    else {
      Object.keys(deltas.subjects).forEach((sid) => {
        const d = deltas.subjects[sid];
        L.push('- **' + sid + '**: ضریبِ زمان ' + d.timeMultiplier + (d.confidence ? ' (اطمینان: ' + d.confidence + ')' : ''));
      });
      if (deltas.global.timeMultiplier) L.push('- **کلی**: ضریبِ زمان ' + deltas.global.timeMultiplier);
      if (deltas.global.hint) L.push('- **راهنما**: ' + deltas.global.hint);
    }
    L.push('');
    L.push('## ۵) دادهٔ ماشینی');
    L.push('');
    L.push('```json');
    L.push(JSON.stringify({ deltas, level: s.level, samples: s.obs.length, rows }, null, 2));
    L.push('```');
    L.push('');
    return L.join('\n');
  }

  /* ---------------- خلاصهٔ کوتاه برای رابط ---------------- */

  function summary(state) {
    const s = normalize(state);
    const rows = subjectRows(s);
    const worst = rows.slice().sort((a, b) => Math.abs(b.avgRatio - 1) - Math.abs(a.avgRatio - 1))[0] || null;
    const info = levelInfo(s.level);
    return {
      level: s.level,
      levelName: info.name,
      loadFactor: info.loadFactor,
      sessionAdd: info.sessionAdd,
      samples: s.obs.length,
      subjects: rows.length,
      openQuestions: openQuestions(s).length,
      reasonTotals: s.reasons,
      worst: worst ? { sid: worst.sid, avgRatio: worst.avgRatio, n: worst.n } : null,
      pace: Object.assign({}, s.pace),
      line: s.obs.length
        ? 'سطح ' + s.level + ' (' + info.name + ') · ' + s.obs.length + ' نمونهٔ واقعی' +
          (worst ? ' · بیشترین اختلاف: ' + worst.sid + ' ×' + worst.avgRatio : '')
        : 'سطح ' + s.level + ' (' + info.name + ') · هنوز نمونه‌ای ثبت نشده',
    };
  }

  return {
    VERSION,
    LEVELS,
    levelInfo,
    defaultState,
    normalize,
    quizQuestions,
    applyQuiz,
    reasonList,
    REASONS,
    observe,
    answerQuestion,
    openQuestions,
    levelDecision,
    applyLevelDecision,
    setLevel,
    loadFactor,
    sessionAdd,
    paceFor,
    engineConfig,
    subjectRows,
    suggestParamDeltas,
    experienceReport,
    summary,
    ASK_HIGH,
    ASK_LOW,
  };
});
