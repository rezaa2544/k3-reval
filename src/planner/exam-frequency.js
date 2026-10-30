/**
 * اهمیت واقعیِ فصل‌ها بر پایهٔ بودجه‌بندی چندسالهٔ کنکور
 * ==================================================================
 * این فایل «جدول سؤال هر فصل در هر سال» را نگه می‌دارد؛ نه برآورد.
 * هر ستون یک آزمون واقعی است و منبعش کنارش ثبت شده است:
 *
 *   ۱۳۹۸ / ۱۳۹۹                → hoseinbanaei.ir (بودجه‌بندی ۵۰ سؤالی)
 *   ۱۴۰۰ / ۱۴۰۱                → ino.school و harfeakhar.com (تأیید متقابل)
 *   ۱۴۰۲ نوبت اول / نوبت دوم   → tahsilbama.com و ino.school
 *   ۱۴۰۳                       → tahsilbama.com و harfeakhar.com
 *   ۱۴۰۴ / ۱۴۰۵                → harfeakhar.com و classnew.ir
 *
 * قاعده‌های محاسبه (همه در همین فایل پیاده شده‌اند):
 *   ۱) سهم هر فصل «داخل همان آزمون» حساب می‌شود (q_i / جمعِ آن ستون)؛ پس
 *      سال‌هایی که تعداد سؤال درس عوض شده (مثلاً زمینِ ۲۵ سؤالی) نتیجه را
 *      خراب نمی‌کنند.
 *   ۲) سال‌های جدیدتر وزن بیشتری دارند: w = 1.14^(رتبهٔ زمانی).
 *   ۳) اگر دو ستون پشتِ‌سرهم کاملاً یکسان باشند (منبع، عددِ یک سال را برای
 *      سال‌های بعد تکرار کرده) فقط یک‌بار شمرده می‌شوند؛ وگرنه یک عدد سه‌بار
 *      وزن می‌گرفت. این موارد با «تکرار» علامت‌گذاری می‌شوند.
 *   ۴) تعداد سؤالِ فصل (میانگین وزنی) × ضریبِ درس در کنکور = وزن؛
 *      اولویت = ۱۰۰ × وزن / بیشینهٔ رشته. پس فصل پرتکرارِ کتابِ ضریب‌بالا
 *      از فصلِ هم‌پرتکرارِ کتابِ ضریب‌پایین همیشه جلو می‌افتد.
 *
 * صادقانه: هیچ منبع عمومی، تفکیکِ سؤال‌به‌سؤالِ ۱۵ سال را منتشر نکرده است.
 * چیزی که در دسترس است، جدول‌های بودجه‌بندیِ منتشرشده است؛ بنابراین این
 * ماژول «تحلیلِ تجمیعیِ آزمون‌های واقعی» است، نه نگاشتِ سؤال‌به‌فصل.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.RevalExamFrequency = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  /* ── ضریبِ درس‌ها در کنکور (آزمون اختصاصی ۱۴۰۵/۱۴۰۶) ───────────────── */
  const FIELD_COEF = {
    tajrobi: { bio: 12, chem: 9, phys: 7, math: 7, geo: 1 },
    riazi: { math: 12, phys: 9, chem: 7 },
    ensani: { math: 4, geo: 0 },
    zaban: {},
  };
  /* ضرایبی که با منبع مستقل تأیید شده‌اند (زیست/شیمی/فیزیک/ریاضی/زمین تجربی،
     ریاضی/فیزیک/شیمی ریاضی) — بقیه «غیررسمی» علامت می‌خورند. */
  const FIELD_VERIFIED = {
    tajrobi: { bio: true, chem: true, phys: true, math: true, geo: true },
    riazi: { math: true, phys: true, chem: true },
    ensani: { math: false, geo: false },
    zaban: {},
  };

  const SRC = {
    hb: 'hoseinbanaei.ir',
    ino: 'ino.school',
    hf: 'harfeakhar.com',
    tb: 'tahsilbama.com',
    cn: 'classnew.ir',
  };

  /* ── سری‌های زمانی ────────────────────────────────────────────────────
     q: ماتریس [فصل][آزمون] — به ترتیب فصل‌های presets/chapter-weights    */
  const DATA = {
    /* ═══════════════ زیست‌شناسی (۴۵ سؤال) ═══════════════ */
    bio: {
      name: 'زیست‌شناسی',
      qTotal: 45,
      cols: [
        { label: '۱۳۹۸', year: 1398, src: SRC.hb },
        { label: '۱۳۹۹', year: 1399, src: SRC.hb },
        { label: '۱۴۰۰', year: 1400, src: SRC.ino },
        { label: '۱۴۰۱', year: 1401, src: SRC.ino },
        { label: '۱۴۰۲ ن۱', year: 1402, src: SRC.tb },
        { label: '۱۴۰۲ ن۲', year: 1402, src: SRC.tb },
        { label: '۱۴۰۳', year: 1403, src: SRC.tb },
        { label: '۱۴۰۴', year: 1404, src: SRC.hf },
        { label: '۱۴۰۵', year: 1405, src: SRC.cn },
      ],
      q: [
        [0, 0, 0, 0, 0, 0, 0, 0, 0], // ۱ دنیای زنده
        [3, 3, 3, 2, 2, 2, 2, 2, 3], // ۲ گوارش و جذب مواد
        [2, 2, 2, 0, 3, 3, 2, 2, 2], // ۳ تبادلات گازی
        [3, 4, 3, 4, 3, 3, 3, 3, 3], // ۴ گردش مواد در بدن
        [3, 0, 3, 1, 2, 2, 3, 3, 2], // ۵ تنظیم اسمزی و دفع مواد زائد
        [3, 1, 3, 1, 1, 1, 1, 1, 1], // ۶ از یاخته تا گیاه
        [2, 0, 2, 2, 1, 1, 1, 1, 1], // ۷ جذب و انتقال مواد در گیاهان
        [3, 2, 3, 1, 3, 3, 4, 4, 3], // ۸ تنظیم عصبی
        [3, 2, 3, 1, 3, 3, 3, 3, 3], // ۹ حواس
        [2, 2, 2, 2, 2, 3, 2, 2, 2], // ۱۰ دستگاه حرکتی
        [0, 1, 0, 1, 1, 2, 3, 3, 1], // ۱۱ تنظیم شیمیایی
        [3, 1, 3, 1, 3, 2, 2, 2, 3], // ۱۲ ایمنی
        [1, 1, 1, 0, 1, 2, 2, 2, 1], // ۱۳ تقسیم یاخته
        [3, 2, 3, 3, 3, 2, 2, 2, 3], // ۱۴ تولیدمثل
        [2, 2, 2, 0, 1, 1, 1, 1, 1], // ۱۵ تولیدمثل نهاندانگان
        [1, 1, 1, 2, 1, 1, 1, 1, 1], // ۱۶ پاسخ گیاهان به محرک‌ها
        [2, 3, 2, 2, 2, 2, 2, 2, 1], // ۱۷ مولکول‌های اطلاعاتی
        [3, 2, 3, 3, 3, 3, 2, 2, 3], // ۱۸ جریان اطلاعات در یاخته
        [3, 4, 3, 5, 3, 2, 2, 2, 3], // ۱۹ انتقال اطلاعات در نسل‌ها
        [2, 2, 2, 2, 2, 2, 2, 2, 2], // ۲۰ تغییر در اطلاعات وراثتی
        [1, 2, 1, 2, 1, 2, 2, 2, 1], // ۲۱ از ماده به انرژی
        [2, 1, 2, 3, 2, 1, 1, 1, 2], // ۲۲ از انرژی به ماده
        [1, 0, 1, 1, 1, 1, 1, 1, 1], // ۲۳ فناوری‌های نوین زیستی
        [2, 0, 2, 1, 1, 1, 1, 1, 1], // ۲۴ رفتارهای جانوران
      ],
      note: 'زیست در ۱۳۹۸–۱۳۹۹ پنجاه سؤال داشت (شامل ترکیبی)؛ سهم‌ها داخل هر ستون نرمال شده‌اند. ' +
        'ستون ۱۴۰۳ و ۱۴۰۴ در بعضی منابع یکسان گزارش شده؛ اگر عیناً تکرار شده باشند یک‌بار شمرده می‌شوند.',
    },

    /* ═══════════════ شیمی (۳۵ سؤال) ═══════════════ */
    chem: {
      name: 'شیمی',
      qTotal: 35,
      cols: [
        { label: '۱۴۰۲', year: 1402, src: SRC.cn },
        { label: '۱۴۰۲ ن۲', year: 1402, src: SRC.tb },
        { label: '۱۴۰۳', year: 1403, src: SRC.tb },
        { label: '۱۴۰۴', year: 1404, src: SRC.cn },
        { label: '۱۴۰۵', year: 1405, src: SRC.cn },
      ],
      q: [
        [4, 3, 3, 3, 3], // ۱ کیهان، زادگاه الفبای هستی
        [2, 3, 3, 3, 3], // ۲ ردپای گازها در زندگی
        [4, 3, 2, 2, 2], // ۳ آب، آهنگ زندگی
        [5, 4, 4, 4, 4], // ۴ قدر هدایای زمینی را بدانیم
        [4, 4, 4, 4, 4], // ۵ در پی غذای سالم
        [2, 3, 6, 6, 6], // ۶ پوشاک، نیازی پایان‌ناپذیر
        [4, 3, 3, 3, 3], // ۷ مولکول‌ها در خدمت تندرستی
        [4, 4, 4, 4, 4], // ۸ آسایش و رفاه در سایهٔ شیمی
        [2, 3, 4, 4, 4], // ۹ شیمی، جلوه‌ای از هنر
        [4, 3, 2, 2, 2], // ۱۰ شیمی، راهی به سوی آیندهٔ روشن‌تر
      ],
      note: 'برای شیمی، جدول فصل‌به‌فصلِ ۱۳۹۸–۱۴۰۱ عمومی منتشر نشده (جدول‌های آن سال‌ها ' +
        'مبحثی است، نه فصلی)؛ پس سری شیمی از ۱۴۰۲ شروع می‌شود و کم‌عمق‌تر از زیست است.',
    },

    /* ═══════════════ فیزیک (۳۰ سؤال) ═══════════════ */
    phys: {
      name: 'فیزیک',
      qTotal: 30,
      cols: [
        { label: '۱۳۹۸', year: 1398, src: SRC.hb },
        { label: '۱۳۹۹', year: 1399, src: SRC.hb },
        { label: '۱۴۰۰', year: 1400, src: SRC.hb },
        { label: '۱۴۰۱', year: 1401, src: SRC.hb },
        { label: '۱۴۰۲ ن۱', year: 1402, src: SRC.tb },
        { label: '۱۴۰۲ ن۲', year: 1402, src: SRC.tb },
        { label: '۱۴۰۳', year: 1403, src: SRC.tb },
        { label: '۱۴۰۴–۱۴۰۵', year: 1405, src: SRC.cn },
      ],
      q: [
        [1, 1, 1, 1, 1, 1, 1, 1], // ۱ فیزیک و اندازه‌گیری
        [3, 3, 2, 2, 2, 2, 2, 2], // ۲ ویژگی‌های فیزیکی مواد
        [2, 1, 2, 1, 2, 3, 2, 2], // ۳ کار، انرژی و توان
        [3, 2, 3, 2, 3, 2, 3, 3], // ۴ دما و گرما
        [3, 3, 3, 4, 3, 3, 3, 3], // ۵ الکتریسیتهٔ ساکن
        [2, 4, 3, 4, 3, 3, 3, 3], // ۶ جریان الکتریکی و مدارها
        [3, 2, 3, 2, 3, 3, 3, 3], // ۷ مغناطیس و القای الکترومغناطیسی
        [3, 3, 3, 4, 3, 2, 3, 3], // ۸ حرکت بر خط راست
        [3, 2, 3, 3, 3, 3, 3, 3], // ۹ دینامیک
        [4, 7, 4, 4, 4, 4, 3, 4], // ۱۰ نوسان و موج
        [3, 2, 3, 4, 3, 4, 4, 3], // ۱۱ فیزیک اتمی و هسته‌ای
      ],
      note: 'فیزیک ۱۳۹۹ یک استثنا داشت (نوسان و موج ۷ سؤال)؛ وزنِ سال‌های جدیدتر ' +
        'اجازه نمی‌دهد یک سالِ پرت، ترتیب را به‌هم بزند.',
    },

    /* ═══════════════ ریاضی (۳۰ سؤال) ═══════════════
       جدول‌های منتشرشده «مبحثی» است (۱۲ مبحث) و باید به ۲۱ فصل نگاشت شود. */
    math: {
      name: 'ریاضی',
      qTotal: 30,
      cols: [
        { label: '۱۳۹۸', year: 1398, src: SRC.hb },
        { label: '۱۳۹۹', year: 1399, src: SRC.hb },
        { label: '۱۴۰۰', year: 1400, src: SRC.ino },
        { label: '۱۴۰۱', year: 1401, src: SRC.ino },
        { label: '۱۴۰۲', year: 1402, src: SRC.ino },
        { label: '۱۴۰۳', year: 1403, src: SRC.hf },
        { label: '۱۴۰۴–۱۴۰۵', year: 1405, src: SRC.cn },
      ],
      /* ۱۲ مبحث × ۷ آزمون */
      topics: [
        { name: 'مجموعه، الگو و دنباله', q: [1, 1, 1, 1, 1, 1, 1] },
        { name: 'مثلثات', q: [4, 4, 4, 4, 4, 4, 4] },
        { name: 'توان‌های گویا و عبارت‌های جبری', q: [0, 0, 1, 1, 1, 1, 1] },
        { name: 'معادله و نامعادله', q: [3, 3, 3, 2, 3, 3, 3] },
        { name: 'تابع', q: [2, 2, 2, 4, 2, 2, 2] },
        { name: 'شمارش بدون شمردن', q: [1, 1, 1, 1, 1, 1, 1] },
        { name: 'آمار و احتمال', q: [3, 3, 3, 2, 3, 3, 3] },
        { name: 'هندسه تحلیلی و هندسه', q: [4, 4, 4, 4, 3, 3, 3] },
        { name: 'توابع نمایی و لگاریتمی', q: [2, 2, 1, 2, 1, 1, 1] },
        { name: 'حد و پیوستگی', q: [4, 4, 4, 3, 4, 4, 4] },
        { name: 'مشتق', q: [2, 4, 4, 2, 4, 3, 3] },
        { name: 'کاربرد مشتق', q: [4, 2, 2, 3, 3, 3, 3] },
      ],
      /* نگاشت مبحث → فصل‌های presets (سهم هر فصل از سؤال‌های آن مبحث) */
      map: {
        0: [{ c: 1, s: 1 }],                                    // الگو و دنباله
        1: [{ c: 2, s: 0.34 }, { c: 11, s: 0.33 }, { c: 16, s: 0.33 }], // مثلثات
        2: [{ c: 3, s: 1 }],                                    // توان‌های گویا
        3: [{ c: 4, s: 1 }],                                    // معادله
        4: [{ c: 5, s: 0.34 }, { c: 10, s: 0.33 }, { c: 15, s: 0.33 }], // تابع
        5: [{ c: 6, s: 1 }],                                    // شمارش
        6: [{ c: 7, s: 0.34 }, { c: 14, s: 0.33 }, { c: 21, s: 0.33 }], // آمار
        7: [{ c: 8, s: 0.25 }, { c: 9, s: 0.25 }, { c: 20, s: 0.5 }],   // هندسه
        8: [{ c: 12, s: 1 }],                                   // لگاریتم
        9: [{ c: 13, s: 0.5 }, { c: 17, s: 0.5 }],              // حد
        10: [{ c: 18, s: 1 }],                                  // مشتق
        11: [{ c: 19, s: 1 }],                                  // کاربرد مشتق
      },
      note: 'ریاضی تجربی فصل‌به‌فصل منتشر نمی‌شود؛ جدول‌ها مبحثی‌اند و مبحث روی فصل‌های ' +
        'کتاب با سهم برابر پخش شده است (مثلثات بین سه فصل، حد بین دو فصل، هندسه بین سه فصل).',
    },

    /* ═══════════════ زمین‌شناسی (۱۵ سؤال) ═══════════════ */
    geo: {
      name: 'زمین‌شناسی',
      qTotal: 15,
      cols: [
        { label: '۱۳۹۸', year: 1398, src: SRC.hb },
        { label: '۱۳۹۹', year: 1399, src: SRC.hb },
        { label: '۱۴۰۰', year: 1400, src: SRC.hb },
        { label: '۱۴۰۱', year: 1401, src: SRC.hb },
        { label: '۱۴۰۲ ن۱', year: 1402, src: SRC.tb },
        { label: '۱۴۰۲ ن۲', year: 1402, src: SRC.tb },
        { label: '۱۴۰۳', year: 1403, src: SRC.tb },
        { label: '۱۴۰۴–۱۴۰۵', year: 1405, src: SRC.cn },
      ],
      q: [
        [4, 5, 5, 5, 4, 3, 4, 4], // ۱ آفرینش کیهان و تکوین زمین
        [5, 3, 3, 3, 2, 3, 2, 2], // ۲ منابع معدنی و ذخایر انرژی
        [5, 3, 4, 4, 2, 2, 2, 2], // ۳ منابع آب و خاک
        [4, 3, 3, 3, 2, 1, 2, 2], // ۴ پویایی زمین
        [2, 4, 4, 4, 2, 2, 2, 2], // ۵ زمین‌شناسی و سلامت
        [3, 4, 3, 3, 2, 2, 1, 2], // ۶ زمین‌شناسی و سازه‌های مهندسی
        [2, 3, 3, 3, 1, 2, 2, 1], // ۷ زمین‌شناسی ایران
      ],
      note: 'زمین تا ۱۴۰۱ بیست‌وپنج سؤال داشت و از ۱۴۰۲ پانزده سؤال؛ سهم‌ها داخل هر ' +
        'ستون نرمال شده‌اند تا این تغییر مقیاس، ترتیب فصل‌ها را خراب نکند.',
    },
  };

  const fa = (s) => String(s).replace(/[0-9]/g, (d) => '۰۱۲۳۴۵۶۷۸۹'[+d]);

  /* ── وزن سال‌ها: جدیدترها مهم‌ترند ───────────────────────────────── */
  const GROWTH = 1.14;
  const weightOf = (rank) => Math.pow(GROWTH, rank);

  const CACHE = {};

  /** ستون‌های «واقعاً مستقل»: ستونِ عیناً تکراری ادغام می‌شود. */
  function independentCols(d, q) {
    const keep = [];
    d.cols.forEach((c, i) => {
      const prev = keep[keep.length - 1];
      if (prev && q.every((row) => row[i] === row[prev.idx])) {
        prev.merged = (prev.merged || []).concat([c.label]);
        prev.year = Math.max(prev.year, c.year);
        return;
      }
      keep.push({ idx: i, label: c.label, year: c.year, src: c.src, merged: null });
    });
    return keep;
  }

  /** ماتریس فصل‌ها×ستون‌ها؛ ریاضی از مبحث‌ها ساخته می‌شود. */
  function chapterMatrix(d) {
    if (d.q) return d.q;
    if (!d.topics || !d.map) return [];
    const n = d.topics.length;
    const rows = [];
    const maxChapter = Object.keys(d.map).reduce(
      (m, k) => Math.max(m, ...d.map[k].map((x) => x.c)), 0);
    for (let c = 1; c <= maxChapter; c += 1) {
      const row = new Array(d.cols.length).fill(0);
      for (let t = 0; t < n; t += 1) {
        const parts = d.map[t] || [];
        const part = parts.find((p) => p.c === c);
        if (!part) continue;
        for (let k = 0; k < d.cols.length; k += 1) row[k] += (d.topics[t].q[k] || 0) * part.s;
      }
      rows.push(row);
    }
    return rows;
  }

  /**
   * تحلیل یک درس: میانگینِ وزنیِ سهم هر فصل + اولویت با ضریب درس.
   * @param {string} subjectId bio|chem|phys|math|geo
   * @returns {object|null}
   */
  function analyze(subjectId) {
    const key = String(subjectId || '');
    const d = DATA[key];
    if (!d) return null;
    if (CACHE[key]) return CACHE[key];

    const q = chapterMatrix(d);
    const cols = independentCols(d, q);
    const colSum = cols.map((c) => q.reduce((a, row) => a + (row[c.idx] || 0), 0));
    const wSum = cols.reduce((a, c, i) => a + weightOf(i), 0) || 1;

    const share = q.map((row) => {
      let acc = 0;
      cols.forEach((c, i) => {
        const s = colSum[i] || 0;
        if (s > 0) acc += weightOf(i) * ((row[c.idx] || 0) / s);
      });
      return acc / wSum;
    });

    const qAvg = share.map((s) => s * d.qTotal);
    /* سهم «دو آزمون آخر» جدا حساب می‌شود: فصل‌هایی مثل پوشاک که سؤالشان
       جهش کرده باید همین امسال هم پرتکرار دیده شوند. */
    const recentIdx = cols.length <= 2 ? cols.map((c, i) => i) : [cols.length - 2, cols.length - 1];
    const rW = recentIdx.map((i) => weightOf(i));
    const rWSum = rW.reduce((a, b) => a + b, 0) || 1;
    const shareRecent = q.map((row) => {
      let acc = 0;
      recentIdx.forEach((ci, k) => {
        const sum = colSum[ci] || 0;
        if (sum > 0) acc += rW[k] * ((row[cols[ci].idx] || 0) / sum);
      });
      return acc / rWSum;
    });
    const qRecent = shareRecent.map((v) => v * d.qTotal);
    const qPlain = q.map((row) => cols.reduce((a, c) => a + (row[c.idx] || 0), 0) / (cols.length || 1));

    /* روند: میانگین دو آزمون آخر منهای دو آزمون اول (به مقیاس سؤال درس) */
    const trend = q.map((row) => {
      if (cols.length < 3) return 0;
      const tailN = Math.min(2, cols.length);
      const tail = cols.slice(-tailN).map((c, i) => {
        const s = colSum[cols.length - tailN + i] || 1;
        return (row[c.idx] || 0) / s;
      });
      const head = cols.slice(0, 2).map((c, i) => {
        const s = colSum[i] || 1;
        return (row[c.idx] || 0) / s;
      });
      const mean = (a) => a.reduce((x, y) => x + y, 0) / (a.length || 1);
      const t = mean(tail) - mean(head);
      return Math.round(t * d.qTotal * 100) / 100;
    });

    const items = share.map((s, i) => ({
      chapter: i + 1,
      qAvg: Math.round(qAvg[i] * 100) / 100,
      qRecent: Math.round(qRecent[i] * 100) / 100,
      /* امتیاز رتبه‌بندی: ۶۰٪ کل دوره + ۴۰٪ دو آزمون آخر */
      qBlend: 0.6 * qAvg[i] + 0.4 * qRecent[i],
      qShare: s,
      qPlain: Math.round(qPlain[i] * 100) / 100,
      series: cols.map((c) => q[i][c.idx] || 0),
      trend: trend[i],
      years: cols.map((c) => c.year),
    }));

    const maxLocal = Math.max(...share, 0.0001);
    CACHE[key] = {
      data: {
        name: d.name, qTotal: d.qTotal, note: d.note,
        cols: cols.map((c) => ({ label: c.label, year: c.year, src: c.src, merged: c.merged })),
        sources: uniq(cols.map((c) => c.src)),
        exams: cols.length,
        from: Math.min(...cols.map((c) => c.year)),
        to: Math.max(...cols.map((c) => c.year)),
        coarse: cols.length < 4,
      },
      items,
      localMax: maxLocal,
    };
    return CACHE[key];
  }

  function uniq(a) {
    const out = [];
    a.forEach((x) => { if (out.indexOf(x) < 0) out.push(x); });
    return out;
  }

  function coefOf(subjectId, field) {
    const f = FIELD_COEF[field || 'tajrobi'] || {};
    return f[subjectId] == null ? null : f[subjectId];
  }

  function coefVerified(subjectId, field) {
    const f = FIELD_VERIFIED[field || 'tajrobi'] || {};
    return Boolean(f[subjectId]);
  }

  /** بیشینهٔ وزن در کل رشته (برای اینکه زمین هیچ‌وقت هم‌ترازِ زیست نشود). */
  function fieldMax(field) {
    const f = FIELD_COEF[field || 'tajrobi'] || {};
    let mx = 0.0001;
    Object.keys(DATA).forEach((sid) => {
      const a = analyze(sid);
      const coef = f[sid];
      if (!a || coef == null) return;
      const coefRel = coef / 12;
      a.items.forEach((it) => {
        /* قاعدهٔ کاربر: تعداد سؤال × ضریب درس */
        mx = Math.max(mx, it.qAvg * coefRel);
      });
    });
    return mx;
  }
  const FMAX = {};
  const fMax = (field) => {
    const k = String(field || 'tajrobi');
    if (!FMAX[k]) FMAX[k] = fieldMax(k);
    return FMAX[k];
  };


  /**
   * @returns {{items:Array, coef:number|null, coefVerified:boolean,
   *            years:number[], data:object}|null}
   */
  function chapters(subjectId, field) {
    const a = analyze(subjectId);
    if (!a) return null;
    const f = field || 'tajrobi';
    const coef = coefOf(subjectId, f);
    /* درسی که در این رشته ضریب رسمی ندارد (مثل زیست در انسانی) تعمیم داده نمی‌شود */
    if (coef == null) return null;
    const coefRel = coef / 12;
    const maxField = fMax(f);
    /* اولویت = تعداد سؤالِ هر سال × ضریب درس؛ پس فصلِ پرتکرارِ کتابِ
       ضریب‌بالا همیشه از فصلِ به‌همان‌اندازه‌پرتکرارِ کتابِ ضریب‌پایین جلو می‌زند. */
    const weighted = a.items.map((it) => it.qAvg * coefRel);
    const localPrio = a.items.map((it) => 100 * (it.qShare / (a.localMax || 1)));
    const items = a.items.map((it, i) => {
      const pLocal = Math.round(localPrio[i]);
      /* درجهٔ ۱..۵ با آستانهٔ ثابت روی «نسبت به پرسؤال‌ترین فصلِ همان درس».
         آستانهٔ ثابت (نه صدک) لازم است تا برچسب با عددِ اولویت که کاربر
         کنارش می‌بیند متناقض نباشد. */
      const imp = pLocal >= 80 ? 5 : pLocal >= 60 ? 4 : pLocal >= 40 ? 3 : pLocal >= 20 ? 2 : 1;
      return {
        chapter: it.chapter,
        qAvg: it.qAvg,
        qRecent: it.qRecent,
        qPlain: it.qPlain,
        qShare: it.qShare,
        series: it.series,
        years: it.years,
        trend: it.trend,
        priority: Math.round(100 * (weighted[i] / (maxField || 1))),
        priorityLocal: pLocal,
        imp,
      };
    });
    return {
      subjectId, field: f,
      coef, coefRel, coefVerified: coefVerified(subjectId, f),
      items,
      years: a.data.cols.map((c) => c.year),
      data: a.data,
    };
  }

  function hasData(subjectId, field) {
    return Boolean(chapters(subjectId, field));
  }

  function subjectMeta(subjectId) {
    const a = analyze(subjectId);
    if (!a) return null;
    return a.data;
  }

  /** «۱۴۰۲ ن۱: ۳ · ۱۴۰۳: ۲ …» برای tooltip */
  function seriesText(subjectId, chapterNo, field) {
    const r = chapters(subjectId, field);
    if (!r) return '';
    const it = r.items[Math.max(1, chapterNo) - 1];
    if (!it) return '';
    return r.data.cols.map((c, i) => c.label +
      (c.merged && c.merged.length ? '، ' + c.merged.join('، ') : '') +
      ': ' + fa(it.series[i])).join(' · ');
  }

  return {
    FIELD_COEF, FIELD_VERIFIED, DATA, GROWTH,
    chapters, hasData, subjectMeta, seriesText, analyze,
    coefOf, fieldMax: fMax, fa,
    version: '2.8.13',
  };
});
