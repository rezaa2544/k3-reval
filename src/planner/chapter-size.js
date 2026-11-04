/**
 * Reval 2.9.0 — حجمِ محتوای هر فصل (صفحه / مفهوم نو / تمرین)
 * ------------------------------------------------------------------
 * گزارش پژوهشی، «زمانِ لازم» را از سه متغیر می‌سازد:
 *   P  = تعداد صفحه (~۳۰۰ واژه، با شکل و جدول)
 *   N  = تعداد مفهوم/زیربخشِ نو
 *   N_ex = تعداد تمرینِ کتاب که باید حل شود
 *
 * ما به فایلِ کتاب دسترسی نداریم، پس حجم با یک مدلِ ساختاری برآورد می‌شود:
 *   ۱) هر کتاب یک «بودجهٔ صفحه» دارد (برآورد از کتاب‌های درسیِ رایج).
 *   ۲) سهمِ هر فصل از صفحه‌های کتاب از یک بردارِ مستند می‌آید (نه از اهمیتِ کنکور؛
 *      این دو باید مستقل بمانند وگرنه همان باگِ قبلی برمی‌گردد).
 *   ۳) از صفحه‌ها: تعدادِ مفهومِ نو و تعداد تمرین با «چگالیِ» هر درس برآورد می‌شود.
 *
 * همهٔ این اعداد **قابلِ کالیبراسیون**اند: وقتی دادهٔ واقعیِ «شروع/پایانِ مطالعه»
 * از کاربران جمع شد، فقط همین فایل عوض می‌شود و کلِ موتور با آن هم‌خوان می‌شود.
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.RevalChapterSize = api;
}(typeof window !== 'undefined' ? window : globalThis, function () {
  'use strict';

  /* ───────── پروفایلِ درس: quant (مسئله‌ای) · concept (مفهومی) · memory (حفظی) ───────── */
  const PROFILE = {
    math: 'quant', phys: 'quant', riazi_ensani: 'quant',
    bio: 'concept', chem: 'concept', geo: 'concept',
    adab: 'concept', arabi: 'concept', falsafe: 'concept', ejtemaei: 'concept',
    ravanshenasi: 'concept', eqtesad: 'concept', hoviat: 'concept',
    dini: 'memory', tarikh: 'memory', joghrafia: 'memory', salamat: 'memory',
    fa3: 'concept', ar3: 'concept', di3: 'memory', en3: 'concept', sal3: 'memory', hovi3: 'concept',
    zaban: 'concept',
  };

  /* ───────── چگالی‌ها: صفحه به ازای هر مفهومِ نو، و تمرین به ازای هر صفحه ───────── */
  const PAGES_PER_CONCEPT = { quant: 5, concept: 3, memory: 4 };
  const EXERCISES_PER_PAGE = {
    math: 1.5, phys: 1.6, riazi_ensani: 1.2,
    chem: 1.1, bio: 0.5, geo: 0.4,
    adab: 0.7, arabi: 0.9, falsafe: 0.5, ejtemaei: 0.5, ravanshenasi: 0.5, eqtesad: 0.5, hoviat: 0.5,
    dini: 0.4, tarikh: 0.4, joghrafia: 0.4, salamat: 0.4,
    fa3: 0.6, ar3: 0.8, di3: 0.4, en3: 1.0, sal3: 0.4, hovi3: 0.5, zaban: 0.9,
  };

  /* ───────── بودجهٔ صفحه و سهمِ فصل‌ها ─────────
     `shares` = سهمِ هر فصل از صفحه‌های آن کتاب؛ جمعِ هر کتاب = ۱.
     مبنای عددها: حجمِ نسبیِ فصل‌ها در کتاب‌های درسیِ ایران (برآوردِ ساختاری). */
  const BOOKS = {
    bio: [
      { grade: 'دهم', pages: 150, shares: [0.09, 0.16, 0.12, 0.17, 0.14, 0.14, 0.18] },
      { grade: 'یازدهم', pages: 190, shares: [0.14, 0.11, 0.11, 0.12, 0.12, 0.11, 0.12, 0.07, 0.10] },
      { grade: 'دوازدهم', pages: 155, shares: [0.11, 0.12, 0.12, 0.12, 0.17, 0.16, 0.08, 0.12] },
    ],
    chem: [
      { grade: 'دهم', pages: 160, shares: [0.30, 0.32, 0.38] },
      { grade: 'یازدهم', pages: 150, shares: [0.34, 0.33, 0.33] },
      { grade: 'دوازدهم', pages: 135, shares: [0.28, 0.26, 0.24, 0.22] },
    ],
    math: [
      { grade: 'دهم', pages: 190, shares: [0.13, 0.16, 0.14, 0.17, 0.16, 0.12, 0.12] },
      { grade: 'یازدهم', pages: 155, shares: [0.15, 0.12, 0.14, 0.12, 0.14, 0.16, 0.17] },
      { grade: 'دوازدهم', pages: 150, shares: [0.14, 0.11, 0.13, 0.20, 0.17, 0.13, 0.12] },
    ],
    phys: [
      { grade: 'دهم', pages: 130, shares: [0.18, 0.22, 0.30, 0.30] },
      { grade: 'یازدهم', pages: 140, shares: [0.35, 0.35, 0.30] },
      { grade: 'دوازدهم', pages: 160, shares: [0.26, 0.26, 0.28, 0.20] },
    ],
    geo: [
      { grade: 'یازدهم', pages: 115, shares: [0.15, 0.15, 0.15, 0.15, 0.13, 0.13, 0.14] },
    ],
    /* عمومی‌ها و درس‌های انسانی: بودجهٔ یکنواخت با تفکیکِ پایه */
    adab: [{ grade: '*', pages: 130, shares: null }],
    arabic: [{ grade: '*', pages: 110, shares: null }],
    dini: [{ grade: '*', pages: 120, shares: null }],
    tarikh: [{ grade: '*', pages: 130, shares: null }],
    joghrafia: [{ grade: '*', pages: 120, shares: null }],
    ejtemaei: [{ grade: '*', pages: 110, shares: null }],
    falsafe: [{ grade: '*', pages: 120, shares: null }],
    ravanshenasi: [{ grade: '*', pages: 100, shares: null }],
    riazi_ensani: [{ grade: '*', pages: 120, shares: null }],
    eqtesad: [{ grade: '*', pages: 100, shares: null }],
    fa3: [{ grade: '*', pages: 130, shares: null }],
    ar3: [{ grade: '*', pages: 90, shares: null }],
    di3: [{ grade: '*', pages: 120, shares: null }],
    en3: [{ grade: '*', pages: 90, shares: null }],
    sal3: [{ grade: '*', pages: 100, shares: null }],
    hovi3: [{ grade: '*', pages: 100, shares: null }],
    zaban: [{ grade: '*', pages: 90, shares: null }],
  };

  const DEFAULT_BOOK = { grade: '*', pages: 130, shares: null };

  function profileOf(subjectId, type) {
    if (PROFILE[subjectId]) return PROFILE[subjectId];
    if (type === 'problem') return 'quant';
    if (type === 'memorization') return 'memory';
    return 'concept';
  }

  /** کدام کتاب و کدام فصلِ داخلِ آن؟ (فصل‌ها به ترتیبِ پایه شماره‌گذاری شده‌اند) */
  function resolve(subjectId, chapter, totalChapters) {
    const books = BOOKS[subjectId] || [DEFAULT_BOOK];
    let idx = Math.max(1, Number(chapter) || 1);
    let acc = 0;
    for (let i = 0; i < books.length; i += 1) {
      const b = books[i];
      const n = b.shares ? b.shares.length : Math.max(1, Math.round((totalChapters || 10) / (books.length || 1)));
      if (idx <= acc + n || i === books.length - 1) return { book: b, localIndex: idx - acc, localCount: n };
      acc += n;
    }
    return { book: books[0], localIndex: 1, localCount: 1 };
  }

  /**
   * حجمِ یک فصل.
   * @returns {{pages:number, concepts:number, exercises:number, profile:string, grade:string}}
   */
  function sizeOf(subjectId, chapter, opts) {
    const o = opts || {};
    const prof = profileOf(subjectId, o.type);
    const { book, localIndex, localCount } = resolve(subjectId, chapter, o.chapters);
    const share = book.shares && book.shares.length
      ? book.shares[Math.min(book.shares.length - 1, Math.max(0, localIndex - 1))]
      : 1 / Math.max(1, localCount);
    const pages = Math.max(6, Math.round(book.pages * share));
    const density = o.pagesPerConcept || PAGES_PER_CONCEPT[prof] || 8;
    const exPerPage = o.exercisesPerPage != null ? o.exercisesPerPage
      : (EXERCISES_PER_PAGE[subjectId] != null ? EXERCISES_PER_PAGE[subjectId]
        : (prof === 'quant' ? 1.4 : prof === 'memory' ? 0.4 : 0.8));
    return {
      pages,
      concepts: Math.max(2, Math.round(pages / density)),
      exercises: Math.max(0, Math.round(pages * exPerPage)),
      profile: prof,
      grade: book.grade,
      bookPages: book.pages,
      share,
    };
  }

  return { PROFILE, BOOKS, PAGES_PER_CONCEPT, EXERCISES_PER_PAGE, profileOf, sizeOf, resolve };
}));
