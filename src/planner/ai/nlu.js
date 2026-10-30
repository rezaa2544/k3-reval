/**
 * Reval AI — درکِ زبان فارسی (NLU)
 * ------------------------------------------------------------------
 * بدون هیچ سرویس بیرونی: نرمال‌سازی، تشخیص نیت و استخراج عدد/روز/درس/تاریخ.
 * این لایه تضمین می‌کند دستیار حتی بدون کلید API هم «بفهمد» و «کار کند».
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.RevalAINLU = api;
}(typeof window !== 'undefined' ? window : globalThis, function () {
  'use strict';

  const FA_DIGITS = '۰۱۲۳۴۵۶۷۸۹';
  const AR_DIGITS = '٠١٢٣٤٥٦٧٨٩';

  /** نرمال‌سازی: رقم فارسی/عربی → لاتین، یکسان‌سازی ی/ک، حذف فاصله‌های اضافه */
  function norm(input) {
    let s = String(input == null ? '' : input);
    s = s.replace(/[۰-۹]/g, (d) => String(FA_DIGITS.indexOf(d)))
      .replace(/[٠-٩]/g, (d) => String(AR_DIGITS.indexOf(d)))
      .replace(/[يى]/g, 'ی').replace(/ك/g, 'ک')
      .replace(/[ٔأإ]/g, 'ا').replace(/[ۀ]/g, 'ه')
      .replace(/[\u200c\u200f\u200e]/g, ' ')
      .replace(/[،؛,]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .toLowerCase();
    return s;
  }

  const WORD_NUM = {
    'یک': 1, 'دو': 2, 'سه': 3, 'چهار': 4, 'پنج': 5, 'شش': 6, 'شیش': 6, 'هفت': 7, 'هشت': 8, 'نه': 9, 'ده': 10,
    'یازده': 11, 'دوازده': 12, 'سیزده': 13, 'چهارده': 14, 'پانزده': 15, 'شانزده': 16, 'هفده': 17, 'هجده': 18, 'نوزده': 19, 'بیست': 20,
    'نیم': 0.5, 'یک و نیم': 1.5, 'دو و نیم': 2.5,
  };

  const WEEKDAYS = [
    { key: 'sat', fa: 'شنبه', alt: ['شنبه'] },
    { key: 'sun', fa: 'یکشنبه', alt: ['یکشنبه', 'یک شنبه'] },
    { key: 'mon', fa: 'دوشنبه', alt: ['دوشنبه', 'دو شنبه'] },
    { key: 'tue', fa: 'سه‌شنبه', alt: ['سه شنبه', 'سشنبه'] },
    { key: 'wed', fa: 'چهارشنبه', alt: ['چهارشنبه', 'چهار شنبه'] },
    { key: 'thu', fa: 'پنجشنبه', alt: ['پنجشنبه', 'پنج شنبه'] },
    { key: 'fri', fa: 'جمعه', alt: ['جمعه'] },
  ];

  const SUBJECT_WORDS = [
    { id: 'bio', words: ['زیست', 'زیست شناسی', 'زیست‌شناسی', 'biology'] },
    { id: 'chem', words: ['شیمی', 'شيمی'] },
    { id: 'math', words: ['ریاضی', 'رياضي', 'حسابان', 'هندسه', 'گسسته', 'امار و احتمال', 'آمار'] },
    { id: 'phys', words: ['فیزیک', 'فيزيك'] },
    { id: 'geo', words: ['زمین', 'زمین شناسی', 'زمین‌شناسی', 'geology'] },
    { id: 'adab', words: ['ادبیات', 'فارسی', 'ادبيات'] },
    { id: 'arabi', words: ['عربی', 'عربي'] },
    { id: 'dini', words: ['دین', 'دینی', 'دین و زندگی', 'قرآن'] },
    { id: 'zaban', words: ['زبان', 'انگلیسی', 'english'] },
    { id: 'salamat', words: ['سلامت', 'بهداشت'] },
    { id: 'hoviat', words: ['هویت', 'اجتماعی'] },
  ];

  /** پارس عدد فارسی/لاتین؛ «۸/۵» و «۸.۵» و «هشت و نیم» را می‌فهمد */
  function parseNumber(text) {
    const s = norm(text);
    const m = s.match(/(\d+(?:[.,/]\d+)?)/);
    if (m) {
      const v = Number(m[1].replace(',', '.').replace('/', '.'));
      return Number.isFinite(v) ? v : null;
    }
    for (const k of Object.keys(WORD_NUM)) {
      if (new RegExp('(^|\\s)' + k + '(\\s|$)').test(s)) return WORD_NUM[k];
    }
    return null;
  }

  /** روز هفته از متن */
  function parseWeekday(text) {
    const s = norm(text);
    /* بلندترین نام را اول تطبیق می‌دهیم؛ وگرنه «سه‌شنبه» با «شنبه» اشتباه می‌شود. */
    let best = null;
    let bestLen = 0;
    WEEKDAYS.forEach((w) => {
      w.alt.forEach((a) => {
        const na = norm(a);
        if (na.length > bestLen && s.indexOf(na) !== -1) { best = w; bestLen = na.length; }
      });
    });
    return best;
  }

  function parseSubjects(text) {
    const s = norm(text);
    const out = [];
    SUBJECT_WORDS.forEach((sp) => {
      if (sp.words.some((w) => s.indexOf(norm(w)) !== -1)) out.push(sp.id);
    });
    return out;
  }

  /** ساعت «۱۶:۰۰»، «ساعت ۵ عصر»، «۸ صبح» */
  function parseClock(text) {
    const s = norm(text);
    const hm = s.match(/(\d{1,2})\s*:\s*(\d{2})/);
    if (hm) return { h: Number(hm[1]), m: Number(hm[2]) };
    const m = s.match(/(\d{1,2})\s*(صبح|عصر|شب|ظهر|بعد از ظهر)?/);
    if (!m) return null;
    let h = Number(m[1]);
    const part = m[2] || '';
    if (/عصر|شب|بعد از ظهر/.test(part) && h < 12) h += 12;
    if (h > 23) return null;
    return { h, m: 0 };
  }

  /** تاریخ شمسی «۱۴۰۶/۰۴/۱۰» یا «۱۰ تیر ۱۴۰۶» */
  const JMONTHS = ['فروردین', 'اردیبهشت', 'خرداد', 'تیر', 'مرداد', 'شهریور', 'مهر', 'آبان', 'آذر', 'دی', 'بهمن', 'اسفند'];
  function parseJalali(text) {
    const s = norm(text);
    const ymd = s.match(/(1[34]\d{2})\s*[\/\-.]\s*(\d{1,2})\s*[\/\-.]\s*(\d{1,2})/);
    if (ymd) return { y: +ymd[1], m: +ymd[2], d: +ymd[3] };
    const dm = s.match(/(\d{1,2})\s*([آ-ی]+)\s*(1[34]\d{2})?/);
    if (dm) {
      const mi = JMONTHS.findIndex((x) => norm(x) === dm[2]);
      if (mi >= 0) return { y: dm[3] ? +dm[3] : null, m: mi + 1, d: +dm[1] };
    }
    return null;
  }

  /** درصد تسلط: «۷۰٪»، «۷۰ درصد»، «هفتاد» */
  function parsePercent(text) {
    const s = norm(text);
    const m = s.match(/(\d{1,3})\s*(٪|%|درصد)/) || s.match(/(٪|%)\s*(\d{1,3})/);
    if (m) {
      const v = Number(m[1] && /\d/.test(m[1]) ? m[1] : m[2]);
      return Number.isFinite(v) ? Math.max(0, Math.min(100, v)) : null;
    }
    const w = s.match(/(صفر|ده|بیست|سی|چهل|پنجاه|شصت|هفتاد|هشتاد|نود|صد)\s*(درصد|٪)?/);
    if (w) {
      const map = { 'صفر': 0, 'ده': 10, 'بیست': 20, 'سی': 30, 'چهل': 40, 'پنجاه': 50, 'شصت': 60, 'هفتاد': 70, 'هشتاد': 80, 'نود': 90, 'صد': 100 };
      if (map[w[1]] != null) return map[w[1]];
    }
    return null;
  }

  /** تاریخ نسبی: «امروز / فردا / پس‌فردا / ۱۰ آبان / ۱۴۰۵/۰۸/۱۰» → {y,m,d} یا {offset} */
  function parseDateLoose(text) {
    const s = norm(text);
    const j = parseJalali(text);
    if (j) return { jalali: j };
    if (/پس ?فردا/.test(s)) return { offset: 2 };
    if (/فردا/.test(s)) return { offset: 1 };
    if (/امروز|امشب/.test(s)) return { offset: 0 };
    return null;
  }

  /* ─────────── نیت‌ها ───────────
     هر نیت: regex برای «مطمئن» + کلمات کلیدی برای امتیازدهی. */
  const INTENTS = [
    {
      id: 'greet',
      re: /^(سلام|درود|hey|hi|hello|چطوری|خوبی)\b/,
      words: ['سلام', 'درود', 'hello'],
    },
    {
      id: 'set_hours',
      re: /(ساعت|ساعتم|ساعتام|ساعت‌ها|ساعتهای|زمان|روزهای عادی).*(بیشتر|بیشترش|کمتر|کم|برسان|کن|بکن|بشه|باشه|شود|بذار|بگذار|بگذارم)|(بیشتر|کمتر)\s*(بخونم|بخوانم|درس بخونم)|(چند ساعت|چندساعت)|(\d+(?:[.,\/]\d+)?)\s*ساعت/,
      words: ['ساعت', 'بیشتر', 'کمتر', 'افزایش', 'کاهش', 'روزهای عادی'],
    },
    {
      id: 'set_rest',
      re: /(روز|روزِ|روز).*(استراحت|تعطیل|آزاد)|(استراحت).*(روز|روزها)/,
      words: ['استراحت', 'تعطیل', 'آزاد'],
    },
    {
      id: 'set_block',
      re: /(بلوک|جلسه|بازه).*(\d+|\bیک\b|\bدو\b)|(طول).*(بلوک|جلسه)/,
      words: ['بلوک', 'جلسه', 'طول'],
    },
    {
      id: 'set_exam_date',
      re: /(کنکور|آزمون سراسری|امتحان).*(تاریخ|روز|کی|چه|عوض|تغییر|بکن|بذار|بگذار)|تاریخ\s*(کنکور|آزمون)/,
      words: ['کنکور', 'تاریخ'],
    },
    {
      id: 'replan_today',
      re: /(امروز|همین امروز).*(بچین|بچینش|از نو|دوباره|عوض|تنظیم|شروع|جا موندم|جاموندم|دیر)|(برنامه).*(امروز).*(عوض|بچین|دوباره)/,
      words: ['امروز', 'بچین', 'دوباره', 'از نو'],
    },
    {
      id: 'start_task',
      re: /(شروع|بزن بریم|بریم|بشروع|شروع کن)/,
      words: ['شروع', 'بریم'],
    },
    {
      /* ۲.۸.۱۴: «این تایم را به کتابِ دیگر بده» — اجرایی‌ترین درخواستِ کاربر */
      id: 'swap_today',
      re: /(به ?جای|بجای|به ?جاش|جایش|اختصاص|تخصیص|تبدیل|جابه ?جا|انتقال).*(بدم|بدهم|بده|بذار|بگذار|کن|بخونم|بخوانم|کنم)|(این ?(تایم|زمان|ساعت|بلوک|وقت)).*(به|برای).*(بدم|بدهم|بده|اختصاص)|(آپدیت|به ?روز).*(کن|بشه)|(حذف|کنار).*(بذار|بگذار|کن)/,
      words: ['به جای', 'اختصاص', 'جابه جا', 'تایم', 'آپدیت', 'منتقل'],
    },
    {
      id: 'ask_plan',
      re: /(برنامه|پلن|امروز چ|فردا چ|این هفته چ|چه کار|چیکار).*(چی|چیه|چطوره|بگو|نشون|ببینم)|(برنامه ام|برنامه‌ام|برنامه امروز|برنامه فردا)/,
      words: ['برنامه', 'امروز', 'فردا', 'هفته'],
    },
    {
      id: 'ask_report',
      re: /(گزارش|وضعیت|آمادگی|پیشرفت|چقدر|چند درصد|رتبه|پوشش)/,
      words: ['گزارش', 'وضعیت', 'آمادگی', 'پیشرفت', 'پوشش'],
    },
    {
      id: 'ask_importance',
      re: /(اهمیت|مهم|ضریب|سهم).*(فصل|درس|کتاب)|(کدوم فصل|کدام فصل|چی بخونم|از کجا شروع)/,
      words: ['اهمیت', 'مهم', 'ضریب', 'فصل'],
    },
    {
      id: 'ask_method',
      re: /(چطور|چگونه|روش|راه).*(بخونم|بخوانم|یاد بگیرم|حفظ|مرور|تست)|(چیه روش|بهترین روش)/,
      words: ['چطور', 'روش', 'بخونم', 'یاد'],
    },
    {
      id: 'tired',
      re: /(خسته|انرژی ندارم|حالم خوب نیست|بی حال|خوابم میاد|خوابم می‌آد|کم آوردم)/,
      words: ['خسته', 'انرژی', 'بی حال', 'خواب'],
    },
    {
      id: 'anxious',
      re: /(استرس|اضطراب|نگران|می ترسم|می‌ترسم|میترسم|دلشوره|پنیک)/,
      words: ['استرس', 'اضطراب', 'نگران', 'ترس'],
    },
    {
      id: 'unmotivated',
      re: /(انگیزه|بی انگیزه|حوصله|بی حوصله|دلسرد|نمی کشم|نمی‌کشم|بیخیال|حس درس ندارم)/,
      words: ['انگیزه', 'حوصله', 'دلسرد', 'بیخیال'],
    },
    {
      id: 'missed',
      re: /(جا موندم|جاموندم|عقب افتادم|عقبم|نرسیدم|نتونستم|یه روز|چند روز)/,
      words: ['جا موندم', 'عقب', 'نرسیدم', 'نتونستم'],
    },
    {
      id: 'add_emergency',
      re: /(اضافه کن|اضافه کن یه|بذار|بگذار|باید بخونم|امروز حتما|امروز حتماً|ضروری)/,
      words: ['اضافه', 'بذار', 'بگذار', 'ضروری', 'حتما'],
    },
    {
      id: 'more_tests',
      re: /(تست).*(بیشتر|زیاد|افزایش|بالا)|(بیشتر).*(تست)/,
      words: ['تست', 'بیشتر'],
    },
    {
      id: 'less_tests',
      re: /(تست).*(کمتر|کاهش|پایین)|(کمتر).*(تست)/,
      words: ['تست', 'کمتر'],
    },
    {
      /* ۲.۸.۱۵: ثبت ارزیابی فصل */
      id: 'rate_chapter',
      re: /(فصل\s*\d{1,2}).*(خوندم|خواندم|تموم|تمام|زدم|بلدم|تسلط|درصد)|(خوندم|خواندم|تموم کردم|تمام کردم|زدم).*(فصل\s*\d{1,2})/,
      words: ['خوندم', 'خواندم', 'تموم', 'تمام', 'تسلط', 'زدم'],
    },
    {
      id: 'add_exam',
      re: /(آزمون|امتحان|جامع).*(اضافه|بذار|بگذار|ثبت|بزن|دارم)|(اضافه|بذار|ثبت).*(آزمون|امتحان)/,
      words: ['آزمون', 'امتحان', 'اضافه'],
    },
    {
      id: 'add_off',
      re: /(تعطیل|مرخصی|مسافرت|سفر|بیمار).*(باشه|بشه|هستم|هستم|ام)|(امروز|فردا|پس فردا|\d{1,2}\s*[آ-ی]+).*(تعطیل|مرخصی)/,
      words: ['تعطیل', 'مرخصی', 'سفر'],
    },
    {
      id: 'set_start_time',
      re: /(از|ساعت|شروع).*(شروع|بیدار شوم|بیدار شم|میروم مدرسه)|ساعت شروع/,
      words: ['شروع', 'ساعت شروع', 'از ساعت'],
    },
    {
      id: 'set_sleep',
      re: /(می ?خوابم|می ?خوابم|خوابم|بیدار|ساعت خواب|ساعت بیداری)/,
      words: ['خواب', 'بیدار', 'خوابم'],
    },
    {
      id: 'set_break',
      re: /(استراحت|فاصله|تنفس).*(بلوک|بین|دقیقه)/,
      words: ['استراحت', 'فاصله', 'بلوک'],
    },
    {
      id: 'set_weekly_mock',
      re: /(آزمون).*(هفتگی|جامع).*(خاموش|روشن|نکن|نمی ?خوام|نمی ?خواهم|بکن|فعال|غیرفعال)|(خاموش|روشن|غیرفعال|فعال).*(آزمون)/,
      words: ['آزمون هفتگی', 'جامع', 'خاموش', 'روشن'],
    },
    {
      id: 'finish_block',
      re: /(زدم|انجام شد|تموم شد|تمام شد|انجام دادم|تیک|چک کردم|رد کردم)/,
      words: ['زدم', 'انجام شد', 'تموم شد', 'تیک'],
    },
    {
      id: 'start_block',
      re: /(شروع کن|شروعش کن|شروع می ?کنم).*(زیست|شیمی|ریاضی|فیزیک|زمین|ادبیات|عربی|دین|زبان)/,
      words: ['شروع کن', 'شروعش'],
    },
    {
      id: 'close_day',
      re: /(روز|امروز).*(ببند|بسته|تموم|تمام|پایان)|(بستن|پایان)\s*روز/,
      words: ['ببند', 'بستن روز', 'پایان روز'],
    },
    {
      id: 'help',
      re: /(کمک|راهنما|چیکار می ?تونی|چی می ?تونی|چه کاری می ?تونی|help)/,
      words: ['کمک', 'راهنما', 'می تونی'],
    },
  ];

  /** تشخیص نیت اصلی + نیت‌های ثانویه */
  function intents(text) {
    const s = norm(text);
    const scored = INTENTS.map((it) => {
      let score = 0;
      if (it.re && it.re.test(s)) score += 3;
      const hits = (it.words || []).filter((w) => s.indexOf(norm(w)) !== -1).length;
      score += hits;
      return { id: it.id, score };
    }).filter((x) => x.score > 0).sort((a, b) => b.score - a.score);
    return scored;
  }

  function primary(text) {
    const list = intents(text);
    return list.length ? list[0].id : 'unknown';
  }

  /* ─────────── پارسِ «این تایم را به کتابِ دیگر بده» ───────────
     ورودی‌های واقعیِ کاربر:
       «الان زیست فصل ۴ را دارم، می‌خوام این تایم رو به شیمی فصل ۲ بدم»
       «به جای زیست، شیمی فصل ۲ بخونم»
       «زیست رو حذف کن، شیمی فصل ۲ بذار»
       «این تایم رو به شیمی فصل ۲ اختصاص بده»
     خروجی: { from:{subjectId,chapter}, to:{subjectId,chapter}, mode:'swap'|'focus'|null }
     اگر فقط یک درس/فصل گفته شده باشد و صحبتِ «به جای/اختصاص» نباشد، mode='focus'. */
  function parseSwapPlan(text) {
    const s = norm(text);
    const subjHits = [];
    SUBJECT_WORDS.forEach((sp) => {
      sp.words.forEach((w) => {
        const nw = norm(w);
        let at = s.indexOf(nw);
        while (at !== -1) { subjHits.push({ id: sp.id, at, len: nw.length }); at = s.indexOf(nw, at + 1); }
      });
    });
    subjHits.sort((a, b) => a.at - b.at);
    /* درس‌های تکراریِ پشتِ‌سرهم (مثل «زیست شناسی» = «زیست» + «شناسی») یکی می‌شوند */
    const subjects = [];
    subjHits.forEach((h) => {
      const last = subjects[subjects.length - 1];
      if (last && last.id === h.id && h.at - (last.at + last.len) <= 2) { last.len = (h.at + h.len) - last.at; return; }
      subjects.push({ id: h.id, at: h.at, len: h.len });
    });

    const chHits = [];
    const re = /فصل\s*(\d{1,2})/g;
    let m;
    while ((m = re.exec(s)) !== null) chHits.push({ at: m.index, chapter: Number(m[1]) });

    /* هر «فصل N» به نزدیک‌ترین درسِ قبل از خودش (وگرنه بعدش) می‌چسبد */
    const withChapter = {};
    chHits.forEach((c) => {
      let best = null;
      subjects.forEach((sj) => {
        const after = sj.at <= c.at;
        const dist = after ? (c.at - (sj.at + sj.len)) : (sj.at - c.at);
        if (!best || dist < best.dist) best = { id: sj.id, dist, after };
      });
      if (best && (withChapter[best.id] == null)) withChapter[best.id] = c.chapter;
    });

    const ids = subjects.map((x) => x.id).filter((v, i, a) => a.indexOf(v) === i);
    /* سه نوع «محور» در جمله:
       ۱) «به جای X»  → X مبدأ است (اولین درسِ بعد از محور)
       ۲) «X را حذف کن» → X مبدأ است (آخرین درسِ قبل از محور)
       ۳) «... را به Y اختصاص بده» → Y مقصد است (اولین درسِ بعد از محور) */
    const pivotReplace = s.search(/به ?جای|بجای|به ?جاش|جایش/);
    const pivotRemove = s.search(/حذف|کنار ?(بذار|بگذار|بنداز)|نخون/);
    const pivotTo = s.search(/اختصاص|تخصیص|تبدیل|جابه ?جا|انتقال/);

    let fromId = null; let toId = null;
    const firstAfter = (pos) => { const x = subjects.filter((y) => y.at >= pos); return x.length ? x[0].id : null; };
    const lastBefore = (pos) => { const x = subjects.filter((y) => y.at < pos); return x.length ? x[x.length - 1].id : null; };
    /* نزدیک‌ترین درس به یک نقطهٔ جمله (با ترجیحِ بعد از محور) — برای جمله‌هایی که
       نامِ درس دقیقاً قبل از فعلِ «اختصاص بدم» آمده است. */
    const nearest = (pos) => {
      let best = null;
      subjects.forEach((y) => {
        const dist = y.at >= pos ? (y.at - pos) : (pos - (y.at + y.len));
        const score = dist * (y.at >= pos ? 1 : 1.4);
        if (!best || score < best.score) best = { id: y.id, score };
      });
      return best ? best.id : null;
    };

    if (ids.length >= 2) {
      if (pivotRemove !== -1) {
        fromId = lastBefore(pivotRemove) || ids[0];
        toId = firstAfter(pivotRemove) || ids.filter((id) => id !== fromId)[0] || null;
      } else if (pivotReplace !== -1) {
        fromId = firstAfter(pivotReplace) || ids[0];
        toId = ids.filter((id) => id !== fromId)[0] || null;
      } else if (pivotTo !== -1) {
        toId = nearest(pivotTo) || ids[ids.length - 1];
        fromId = ids.filter((id) => id !== toId)[0] || null;
      } else {
        fromId = ids[0]; toId = ids[1];
      }
      if (fromId === toId) toId = ids.filter((id) => id !== fromId)[0] || null;
    } else if (ids.length === 1) {
      toId = ids[0];
      if (pivotRemove !== -1 && pivotReplace === -1) { fromId = ids[0]; toId = null; }
    }

    const wantsSwap = /(به ?جای|بجای|به ?جاش|اختصاص|تخصیص|تبدیل|جابه ?جا|انتقال|حذف|کنار)/.test(s);
    let mode = null;
    if (fromId && toId && fromId !== toId && wantsSwap) mode = 'swap';
    else if (fromId && !toId) mode = 'skip';
    else if (toId) mode = 'focus';

    return {
      from: fromId ? { subjectId: fromId, chapter: withChapter[fromId] != null ? withChapter[fromId] : null } : null,
      to: toId ? { subjectId: toId, chapter: withChapter[toId] != null ? withChapter[toId] : null } : null,
      mode,
      subjects: ids,
    };
  }

  /** استخراج همهٔ موجودیت‌ها یک‌جا */
  function entities(text) {
    return {
      number: parseNumber(text),
      weekday: parseWeekday(text),
      subjects: parseSubjects(text),
      clock: parseClock(text),
      date: parseJalali(text),
      text: String(text || ''),
      norm: norm(text),
    };
  }

  return { norm, parseNumber, parseWeekday, parseSubjects, parseClock, parseJalali, parsePercent, parseDateLoose,
    parseSwapPlan, intents, primary, entities, WEEKDAYS, SUBJECT_WORDS, JMONTHS };
}));
