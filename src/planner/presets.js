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

  function subjectsFor(field) {
    const f = FIELDS[field] || FIELDS.tajrobi;
    return f.subjects.map((s) => Object.assign({}, s, { masteredChapters: 0, include: true, examPercent: null }));
  }

  /** تاریخ پیش‌فرض آزمون: تقریبی اوایل تیر ماه سال آینده */
  function defaultExamDate(now) {
    const d = now ? new Date(now) : new Date();
    const year = d.getMonth() > 6 ? d.getFullYear() + 1 : d.getFullYear(); // بعد از مهر → سال بعد
    return year + '-04-05';
  }

  return { FIELDS, subjectsFor, defaultExamDate };
});
