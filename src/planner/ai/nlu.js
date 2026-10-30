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

  return { norm, parseNumber, parseWeekday, parseSubjects, parseClock, parseJalali,
    intents, primary, entities, WEEKDAYS, SUBJECT_WORDS, JMONTHS };
}));
