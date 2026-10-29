/**
 * پیش‌فرض‌های دروس و ضرایب کنکور (قابل ویرایش در رابط کاربری)
 * ------------------------------------------------------------
 * ضرایب آزمون اختصاصی تجربی ۱۴۰۵: زیست ۱۲، شیمی ۹، ریاضی ۷، فیزیک ۷، زمین ۱
 * (منبع: جدول ضرایب آزمون اختصاصی ۱۴۰۵ — بخش ۹ سند پژوهشی)
 * سایر گروه‌ها پیش‌فرضِ تقریبی‌اند و کاربر می‌تواند هر عدد را تغییر دهد.
 */

(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.RevalPresets = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const FIELDS = {
    tajrobi: {
      label: 'علوم تجربی',
      subjects: [
        { id: 'bio', name: 'زیست‌شناسی', weight: 12, chapters: 8, type: 'conceptual', difficulty: 2, mastery: 45 },
        { id: 'chem', name: 'شیمی', weight: 9, chapters: 6, type: 'conceptual', difficulty: 2, mastery: 40 },
        { id: 'math', name: 'ریاضی', weight: 7, chapters: 7, type: 'problem', difficulty: 3, mastery: 30 },
        { id: 'phys', name: 'فیزیک', weight: 7, chapters: 6, type: 'problem', difficulty: 3, mastery: 30 },
        { id: 'geo', name: 'زمین‌شناسی', weight: 1, chapters: 5, type: 'memorization', difficulty: 1, mastery: 20 },
      ],
    },
    riazi: {
      label: 'علوم ریاضی',
      subjects: [
        { id: 'math', name: 'ریاضیات', weight: 12, chapters: 9, type: 'problem', difficulty: 3, mastery: 35 },
        { id: 'phys', name: 'فیزیک', weight: 9, chapters: 7, type: 'problem', difficulty: 3, mastery: 35 },
        { id: 'chem', name: 'شیمی', weight: 7, chapters: 6, type: 'conceptual', difficulty: 2, mastery: 40 },
      ],
    },
    ensani: {
      label: 'علوم انسانی',
      subjects: [
        { id: 'adab', name: 'علوم و فنون ادبی', weight: 4, chapters: 9, type: 'conceptual', difficulty: 2, mastery: 40 },
        { id: 'arabic', name: 'عربی تخصصی', weight: 2, chapters: 7, type: 'conceptual', difficulty: 2, mastery: 35 },
        { id: 'dini', name: 'دین و زندگی', weight: 3, chapters: 8, type: 'memorization', difficulty: 1, mastery: 50 },
        { id: 'tarikh', name: 'تاریخ', weight: 2, chapters: 10, type: 'memorization', difficulty: 1, mastery: 30 },
        { id: 'joghrafia', name: 'جغرافیا', weight: 3, chapters: 9, type: 'memorization', difficulty: 1, mastery: 30 },
        { id: 'ejtemaei', name: 'جامعه‌شناسی', weight: 3, chapters: 8, type: 'conceptual', difficulty: 2, mastery: 35 },
        { id: 'falsafe', name: 'فلسفه و منطق', weight: 4, chapters: 6, type: 'conceptual', difficulty: 3, mastery: 25 },
        { id: 'ravanshenasi', name: 'روان‌شناسی', weight: 2, chapters: 5, type: 'conceptual', difficulty: 2, mastery: 40 },
        { id: 'riazi_ensani', name: 'ریاضی و آمار', weight: 4, chapters: 5, type: 'problem', difficulty: 2, mastery: 30 },
        { id: 'eqtesad', name: 'اقتصاد', weight: 2, chapters: 4, type: 'conceptual', difficulty: 2, mastery: 30 },
      ],
    },
    zaban: {
      label: 'زبان‌های خارجی',
      subjects: [
        { id: 'english', name: 'زبان انگلیسی', weight: 12, chapters: 10, type: 'conceptual', difficulty: 2, mastery: 45 },
      ],
    },
    honar: {
      label: 'هنر',
      subjects: [
        { id: 'dars_A', name: 'درک عمومی هنر', weight: 4, chapters: 8, type: 'conceptual', difficulty: 2, mastery: 35 },
        { id: 'dars_B', name: 'درک عمومی ریاضی و فیزیک', weight: 3, chapters: 6, type: 'problem', difficulty: 3, mastery: 25 },
        { id: 'dars_C', name: 'خلاقیت تصویری و تجسمی', weight: 4, chapters: 6, type: 'conceptual', difficulty: 2, mastery: 30 },
        { id: 'dars_D', name: 'خواص مواد', weight: 2, chapters: 4, type: 'memorization', difficulty: 1, mastery: 25 },
      ],
    },
  };

  /* ------------------------------------------------------------------ */
  /* دروس عمومی — فصل‌بندی بر اساس کتاب‌های درسی رسمی                    */
  /* (فارسی ۸ فصل، عربی دهم ۸ / یازدهم ۷ / دوازدهم ۴ درس،               */
  /*  دین و زندگی ۱۲ / ۱۲ / ۱۰ درس، زبان انگلیسی ۴ درس،                  */
  /*  سلامت و بهداشت ۱۴ درس و هویت اجتماعی ۱۰ درس در پایهٔ دوازدهم)       */
  /* ------------------------------------------------------------------ */

  const FARSI_FASL = ['ادبیات تعلیمی', 'ادبیات پایداری', 'ادبیات غنایی', 'ادبیات سفر و زندگی',
    'ادبیات انقلاب اسلامی', 'ادبیات حماسی', 'ادبیات داستانی', 'ادبیات جهان'];

  function faBook(grade, n) {
    return {
      id: 'fa' + n, name: 'فارسی ' + String(n).replace(/\d/g, (d) => '۰۱۲۳۴۵۶۷۸۹'[d]),
      weight: 3, chapters: 8, topicLabel: 'فصل', topicNames: FARSI_FASL.slice(),
      type: 'conceptual', difficulty: 2, mastery: 50, general: true, grade,
    };
  }
  const SALAMAT_DARS = ['سلامت چیست؟', 'سبک زندگی سالم', 'برنامهٔ غذایی سالم', 'کنترل وزن و تناسب اندام',
    'بهداشت و ایمنی مواد غذایی', 'بیماری‌های غیرواگیر', 'بیماری‌های واگیر', 'بهداشت فردی',
    'بهداشت ازدواج و فرزندآوری', 'بهداشت روان', 'مصرف دخانیات و الکل', 'اعتیاد به مواد مخدر و عوارض آن',
    'پیشگیری از اختلالات اسکلتی-عضلانی', 'پیشگیری از حوادث خانگی'];

  const HOVIAT_DARS = ['کنش‌های ما', 'پدیده‌های اجتماعی', 'جامعه و فرهنگ (جهان اجتماعی)', 'ارزیابی فرهنگ‌ها',
    'هویت فردی و اجتماعی', 'بازتولید هویت اجتماعی', 'تحولات هویتی جامعه', 'بعد فرهنگی هویت ایران',
    'بعد سیاسی هویت ایران', 'ابعاد جمعیتی و اقتصادی هویت ایران'];

  function book(id, name, chapters, opts, grade) {
    return Object.assign({ id, name, weight: 2, chapters, topicLabel: 'درس', type: 'conceptual', difficulty: 2, mastery: 45, general: true, grade }, opts || {});
  }

  const GENERAL = {
    'دهم': [
      faBook('دهم', 1),
      book('ar1', 'عربی ۱', 8, { weight: 2, difficulty: 2, mastery: 40 }, 'دهم'),
      book('di1', 'دین و زندگی ۱', 12, { weight: 3, type: 'memorization', difficulty: 1, mastery: 55 }, 'دهم'),
      book('en1', 'زبان انگلیسی ۱', 4, { weight: 2, mastery: 50 }, 'دهم'),
    ],
    'یازدهم': [
      faBook('یازدهم', 2),
      book('ar2', 'عربی ۲', 7, { weight: 2, mastery: 40 }, 'یازدهم'),
      book('di2', 'دین و زندگی ۲', 12, { weight: 3, type: 'memorization', difficulty: 1, mastery: 50 }, 'یازدهم'),
      book('en2', 'زبان انگلیسی ۲', 4, { weight: 2, mastery: 50 }, 'یازدهم'),
    ],
    'دوازدهم': [
      faBook('دوازدهم', 3),
      book('ar3', 'عربی ۳', 4, { weight: 2, mastery: 40 }, 'دوازدهم'),
      book('di3', 'دین و زندگی ۳', 10, { weight: 3, type: 'memorization', difficulty: 1, mastery: 50 }, 'دوازدهم'),
      book('en3', 'زبان انگلیسی ۳', 4, { weight: 2, mastery: 50 }, 'دوازدهم'),
      book('sal3', 'سلامت و بهداشت', 14, { weight: 2, type: 'memorization', difficulty: 1, mastery: 40, topicNames: SALAMAT_DARS }, 'دوازدهم'),
      book('hovi3', 'هویت اجتماعی', 10, { weight: 2, type: 'conceptual', difficulty: 2, mastery: 40, topicNames: HOVIAT_DARS }, 'دوازدهم'),
    ],
  };
  GENERAL['فارغ‌التحصیل'] = GENERAL['دوازدهم'];

  const GRADE_KEYS = ['دهم', 'یازدهم', 'دوازدهم'];

  /** پایه‌های موجود برای دروس عمومی */
  function grades() { return GRADE_KEYS.slice(); }

  /** نرمال‌سازی ورودی: رشته یا آرایهٔ پایه‌ها → آرایهٔ یکتا و معتبر */
  function normalizeGrades(input) {
    const list = Array.isArray(input) ? input : (input == null ? [] : [input]);
    const out = [];
    list.forEach((g) => {
      const key = g === 'فارغ‌التحصیل' ? 'دوازدهم' : g;
      if (GRADE_KEYS.indexOf(key) !== -1 && out.indexOf(key) === -1) out.push(key);
    });
    return out.length ? out : ['دوازدهم'];
  }

  /**
   * دروس عمومی یک یا چند پایه.
   * generalFor('دوازدهم') یا generalFor(['دهم','دوازدهم'])
   */
  function generalFor(gradeOrGrades) {
    const list = [];
    const seen = {};
    normalizeGrades(gradeOrGrades).forEach((g) => {
      (GENERAL[g] || []).forEach((s) => {
        if (seen[s.id]) return;
        seen[s.id] = true;
        list.push(Object.assign({}, s, {
          masteredChapters: 0, include: true, examPercent: null,
          topicNames: s.topicNames ? s.topicNames.slice() : null,
        }));
      });
    });
    return list;
  }


  /* ------------------------------------------------------------------ */
  /* فهرست فصل‌های کتاب‌های درسی (کنکور تجربی) — مبنای ارزیابی فصل‌به‌فصل   */
  /* (منبع: فهرست رسمی کتاب‌های درسی چاپ ۱۴۰۴–۱۴۰۵)                        */
  /* ------------------------------------------------------------------ */

  const CHAPTERS = {
    bio: {
      'دهم': ['دنیای زنده', 'گوارش و جذب مواد', 'تبادلات گازی', 'گردش مواد در بدن',
        'تنظیم اسمزی و دفع مواد زائد', 'از یاخته تا گیاه', 'جذب و انتقال مواد در گیاهان'],
      'یازدهم': ['تنظیم عصبی', 'حواس', 'دستگاه حرکتی', 'تنظیم شیمیایی', 'ایمنی', 'تقسیم یاخته',
        'تولیدمثل', 'تولیدمثل نهاندانگان', 'پاسخ گیاهان به محرک‌ها'],
      'دوازدهم': ['مولکول‌های اطلاعاتی', 'جریان اطلاعات در یاخته', 'انتقال اطلاعات در نسل‌ها',
        'تغییر در اطلاعات وراثتی', 'از ماده به انرژی', 'از انرژی به ماده',
        'فناوری‌های نوین زیستی', 'رفتارهای جانوران'],
    },
    chem: {
      'دهم': ['کیهان، زادگاه الفبای هستی', 'ردپای گازها در زندگی', 'آب، آهنگ زندگی'],
      'یازدهم': ['قدر هدایای زمینی را بدانیم', 'در پی غذای سالم', 'پوشاک، نیازی پایان‌ناپذیر'],
      'دوازدهم': ['مولکول‌ها در خدمت تندرستی', 'آسایش و رفاه در سایهٔ شیمی',
        'شیمی، جلوه‌ای از هنر، زیبایی و ماندگاری', 'شیمی، راهی به سوی آیندهٔ روشن‌تر'],
    },
    math: {
      'دهم': ['الگو و دنباله', 'مثلثات', 'توان‌ها و عبارت‌های جبری', 'معادله و نامعادله', 'تابع',
        'شمارش، بدون شمردن', 'آمار و احتمال'],
      'یازدهم': ['هندسهٔ تحلیلی و جبر', 'هندسه', 'تابع', 'مثلثات', 'توابع نمایی و لگاریتمی',
        'حد و پیوستگی', 'آمار و احتمال'],
      'دوازدهم': ['تابع', 'مثلثات', 'حد بی‌نهایت و حد در بی‌نهایت', 'مشتق', 'کاربرد مشتق', 'هندسه', 'احتمال'],
    },
    phys: {
      'دهم': ['فیزیک و اندازه‌گیری', 'ویژگی‌های فیزیکی مواد', 'کار، انرژی و توان', 'دما و گرما'],
      'یازدهم': ['الکتریسیتهٔ ساکن', 'جریان الکتریکی و مدارهای جریان مستقیم',
        'مغناطیس و القای الکترومغناطیسی'],
      'دوازدهم': ['حرکت بر خط راست', 'دینامیک و حرکت دایره‌ای', 'نوسان و موج',
        'آشنایی با فیزیک اتمی و هسته‌ای'],
    },
    geo: {
      'یازدهم': ['آفرینش کیهان و تکوین زمین', 'منابع معدنی و ذخایر انرژی', 'منابع آب و خاک',
        'پویایی زمین', 'زمین‌شناسی و سلامت', 'زمین‌شناسی و سازه‌های مهندسی', 'زمین‌شناسی ایران'],
    },
  };

  /** فهرست فصل‌های یک درس به‌صورت [{grade, name}] — پایهٔ ارزیابی فصل‌به‌فصل */
  function chaptersFor(subjectId) {
    const map = CHAPTERS[subjectId];
    if (!map) return null;
    const out = [];
    ['دهم', 'یازدهم', 'دوازدهم'].forEach((g) => {
      (map[g] || []).forEach((name) => out.push({ grade: g, name }));
    });
    return out.length ? out : null;
  }

  /** برچسب ترکیبی فصل: «دهم · دنیای زنده» */
  function chapterLabel(c) {
    return c.grade && c.grade !== '—' ? c.grade + ' · ' + c.name : c.name;
  }

  function subjectsFor(field) {
    const f = FIELDS[field] || FIELDS.tajrobi;
    return f.subjects.map((s) => {
      const chs = chaptersFor(s.id);
      const out = Object.assign({}, s, { masteredChapters: 0, include: true, examPercent: null });
      if (chs) {
        /* فصل‌های واقعی کتاب درسی جای «فصل ۱..n» عمومی را می‌گیرند */
        out.chapters = chs.length;
        out.topicLabel = 'فصل';
        out.topicNames = chs.map(chapterLabel);
        out.chapterGrades = chs.map((c) => c.grade);
        out.chapterShort = chs.map((c) => c.name);
      }
      return out;
    });
  }

  /** تاریخ پیش‌فرض آزمون: تقریبی اوایل تیر ماه سال آینده */
  function defaultExamDate(now) {
    const d = now ? new Date(now) : new Date();
    const year = d.getMonth() > 6 ? d.getFullYear() + 1 : d.getFullYear(); // بعد از مهر → سال بعد
    return year + '-04-05';
  }

  /** فهرست درس‌های یک کتاب عمومی (برای ارزیابی درس‌به‌درس عمومی‌ها) */
  function generalChaptersFor(id) {
    let found = null;
    Object.keys(GENERAL).forEach((g) => (GENERAL[g] || []).forEach((s) => {
      if (s.id === id && !found) {
        const names = s.topicNames && s.topicNames.length === s.chapters
          ? s.topicNames.slice()
          : Array.from({ length: s.chapters }, (_, i) =>
            (s.topicLabel || 'درس') + ' ' + String(i + 1).replace(/[0-9]/g, (d) => '۰۱۲۳۴۵۶۷۸۹'[+d]));
        found = { grade: g, names };
      }
    }));
    return found;
  }

  return {
    FIELDS, GENERAL, GRADE_KEYS, grades, normalizeGrades, subjectsFor, generalFor, defaultExamDate,
    CHAPTERS, chaptersFor, chapterLabel, generalChaptersFor,
  };
});
