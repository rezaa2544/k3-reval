/**
 * Reval 2.9.0 — پارامترهای موتور، مستقیماً از گزارش پژوهشی
 * ------------------------------------------------------------------
 * این فایل تنها منبعِ اعدادِ برنامه‌ریزی است. هیچ عددِ برنامه‌ریزی‌ای نباید در
 * کدِ موتور سخت‌کد شود؛ همه از این‌جا می‌آید تا کالیبره‌کردن با دادهٔ واقعیِ
 * کاربران فقط یک فایل را عوض کند.
 *
 * منبع: docs/research-report-fa-2.9.0.md (۱۳ آبان ۱۴۰۵) + فایل‌های JSON همراه.
 * برچسبِ اطمینان هر بخش در `confidence` همان گزارش هست؛ بخشی از اعداد «برآوردِ
 * کارشناسی» است، نه نتیجهٔ آزمایش — و همان‌طور هم علامت خورده است.
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.RevalModelParams = api;
}(typeof window !== 'undefined' ? window : globalThis, function () {
  'use strict';

  /* ═════════ پارامترهای موتور (بدون تغییر، از گزارش) ═════════ */
  const params = {
  "version": "1.0",
  "source": "گزارش پژوهشی k3-reval — ۱۳ آبان ۱۴۰۵ — بخشی از پارامترها برآوردِ کارشناسی است (ستون confidence را ببینید)",
  "minutesPerPage": {
    "unit": "دقیقه برای هر صفحهٔ ~۳۰۰ واژه‌ای کتاب درسی (با شکل/جدول)، دانش‌آموز ۱۶–۱۸ ساله با پیش‌دانش متوسط",
    "concept": {
      "read": 2.5,
      "active": 8.0,
      "review": 1.5
    },
    "quant": {
      "read": 3.5,
      "active": 11.0,
      "review": 2.0
    },
    "memory": {
      "read": 2.0,
      "active": 6.0,
      "review": 1.2
    }
  },
  "minutesPerNewConcept": {
    "math": 20,
    "phys": 18,
    "chem": 12,
    "bio": 9
  },
  "minutesPerExercise": {
    "math": 4.5,
    "phys": 4.0,
    "chem": 2.5
  },
  "pageVsConceptWeights": {
    "concept": {
      "page": 0.6,
      "concept": 0.4
    },
    "quant": {
      "page": 0.3,
      "concept": 0.7
    }
  },
  "mixRatio": {
    "quant": {
      "learn": 0.3,
      "consolidate": 0.1,
      "practice": 0.45,
      "assess": 0.15
    },
    "concept": {
      "learn": 0.35,
      "consolidate": 0.15,
      "practice": 0.35,
      "assess": 0.15
    },
    "memory": {
      "learn": 0.4,
      "consolidate": 0.25,
      "practice": 0.2,
      "assess": 0.15
    }
  },
  "quantPracticeSplit": {
    "workedExamples": 0.4,
    "guided": 0.2,
    "independent": 0.4,
    "note": "سهم‌ها از مجموع learn+practice در فصل نو؛ نمونهٔ حل‌شده → تمرین تکمیلی/هدایت‌شده → مستقل"
  },
  "depthForHighFrequency": {
    "tierThreshold": 4,
    "practiceMultiplier": 1.2,
    "extraReviews": 1,
    "note": "مرور اضافه فقط وقتی تعداد پایه < ۶ باشد",
    "learnMultiplier": 1.0
  },
  "sessionBounds": {
    "concept": [
      35,
      50
    ],
    "problem": [
      45,
      90
    ],
    "memory": [
      20,
      35
    ],
    "retrieval": [
      10,
      25
    ],
    "review": [
      15,
      30
    ],
    "assess": [
      12,
      45
    ]
  },
  "minMeaningfulSession": {
    "newLearning": 35,
    "practice": 40,
    "retrievalOrReview": 10
  },
  "breaks": {
    "afterBlockMinutes": [
      5,
      10
    ],
    "blockLengthTriggerMinutes": [
      45,
      60
    ],
    "longBreakMinutes": [
      20,
      30
    ],
    "longBreakAfterFocusedMinutes": [
      150,
      180
    ],
    "mealBreakMinutes": [
      45,
      60
    ]
  },
  "interleaving": {
    "math": 0.4,
    "phys": 0.35,
    "chem": 0.25,
    "bio": 0.1,
    "earth": 0.05,
    "memory": 0.0,
    "startAfterPracticeSessions": 2
  },
  "reviewLadder": {
    "horizon30": [
      1,
      4,
      10,
      20
    ],
    "horizon90": [
      2,
      7,
      17,
      38,
      65
    ],
    "horizon180": [
      3,
      10,
      24,
      52,
      100,
      145
    ],
    "horizon300": [
      4,
      14,
      34,
      75,
      140,
      220
    ],
    "interpolation": "برای افقِ H بینِ دو ستون: درونیابی لگاریتمی؛ آخرین مرور باید ≤ ۰٫۷۵×H باشد",
    "finalExamHorizon60": [
      2,
      6,
      14,
      30
    ]
  },
  "reviewCount": {
    "horizon30": 4,
    "horizon90": 5,
    "horizon180": 6,
    "horizon300": 6
  },
  "reviewLengthFractionOfInitialTime": [
    0.06,
    0.05,
    0.04,
    0.03,
    0.025,
    0.02
  ],
  "reviewLengthFloorMinutes": 8,
  "reviewMode": {
    "firstTwoReviews": "blocked-by-chapter",
    "afterThat": "mixed-multi-chapter",
    "retrievalShare": 0.6
  },
  "masteryThreshold": 0.8,
  "masteryBands": {
    "advance": 0.8,
    "targetedPractice": 0.65,
    "relearn": 0.0,
    "maxRemedialLoops": 2,
    "retestDelayDays": [
      2,
      3
    ]
  },
  "assessLength": {
    "items": [
      10,
      12
    ],
    "minutes": [
      12,
      25
    ],
    "mixedPreviousChapterItems": 0.25,
    "mcShare": 0.7
  },
  "testPracticeMix": {
    "multipleChoice": 0.7,
    "constructedOrRecall": 0.3
  },
  "individualScale": {
    "strong": 0.8,
    "average": 1.0,
    "weak": 1.3,
    "bounds": [
      0.8,
      1.4
    ],
    "chapterFormula": "s = clamp(1 − 0.006·(m_eff − 50), 0.8, 1.4); m_eff = 0.5·mastery_self + 25 (پیشین)؛ پس از یک سنجش: m_eff = 0.5·quiz + 0.25·mastery_self + 12.5 + 12.5",
    "appliesTo": [
      "learn",
      "practice"
    ]
  },
  "dailyCapRule": "سقف مؤثر مطالعه ۱۰٫۵ ساعت (هرگز ۱۲ ساعت یا بیشتر؛ خواب ≥۷٫۵ ساعت محفوظ). بلوک‌های «یادگیری نو + مسئله‌حل‌کردن سخت» ≤ ۶۰٪ سقف و ≤ ۵ ساعت؛ باقی: بازیابی/مرور/سنجش. تعداد درس در روز: ۲ تا ۳ (روز ≤۴ ساعت: ۲ درس؛ ۵–۸ ساعت: ۳ درس؛ >۸ ساعت: ۴ درس)، هر درس حداقل یک بلوک ≥ حد پایین. هر روز ≤ ۱٫۱۵×میانگین هفته؛ حداقل یک روز سبک (۵۰–۶۰٪) در هر ۷ روز؛ بیش از ۳ روز سنگین پیاپی ممنوع. بار برنامه‌ریزی‌شده = ۰٫۸۵×ساعت اعلامی + ۱۵٪ حاشیه.",
  "shortTimePolicy": {
    "order": [
      "reduceDepthLowTier",
      "compressLowValueContent",
      "keepAllHighTierChapters"
    ],
    "lowTierDepthMultiplier": 0.5,
    "neverDrop": "فصل‌های tier ≥ ۳ در ضریب‌های بالا",
    "priority": "expectedWeightShare × (1 − mastery) / timeNeeded"
  },
  "adhdOrAnxietyAdjustments": {
    "blockMinutes": [
      20,
      30
    ],
    "breakMinutes": [
      5,
      10
    ],
    "assessStyle": "کوتاه، پرتکرار، کم‌ریسک؛ بدون زمان‌سنج در هفته‌های اول",
    "evidence": "برآوردِ کارشناسی"
  },
  "confidence": {
    "minutesPerPage": "پایین (برآوردِ کارشناسی بر پایهٔ سرعت خواندن؛ داده برای فارسی/دبیرستان پیدا نشد)",
    "minutesPerNewConcept": "پایین (برآوردِ کارشناسی)",
    "minutesPerExercise": "پایین (برآوردِ کارشناسی؛ بعد از اولین دادهٔ کاربران کالیبره شود)",
    "mixRatio": "پایین-متوسط (جهت از شواهد، اعداد کارشناسی)",
    "sessionBounds": "پایین",
    "breaks": "پایین-متوسط",
    "interleaving": "متوسط برای ریاضی/فیزیک (Brunmair & Richter)، پایین برای بقیه",
    "reviewLadder": "متوسط-بالا برای نسبتِ فاصله به افق (Cepeda 2008)، پایین برای تعداد پله‌ها",
    "reviewCount": "پایین-متوسط",
    "masteryThreshold": "پایین",
    "assessLength": "پایین",
    "individualScale": "پایین-متوسط (جهت قطعی، بازه کارشناسی)",
    "dailyCapRule": "پایین-متوسط",
    "testPracticeMix": "متوسط (اثر آزمون)"
  }
}
  /* ═════════ کاتالوگ فصل‌ها (اهمیت و تکرار در کنکور) ═════════ */
  const catalog = {
 "version": "1.0",
 "note": "کاتالوگ فصل‌ها و اهمیت آن‌ها در کنکور تجربی؛ qTypical = تعداد سؤال معمول در ۱ آزمون؛ priority/weightShare بر پایهٔ ضرایب ۱۴۰۲–۱۴۰۵ (زیست۱۲ شیمی۹ فیزیک۷ ریاضی۷ زمین۱). مقادیر آماری فقط از جدول‌های وبلاگی/آموزشگاهی گردآوری شده‌اند و رسمی نیستند.",
 "coefficients": {
  "bio": 12,
  "chem": 9,
  "phys": 7,
  "math": 7,
  "earth": 1
 },
 "questionsPerSubject": {
  "bio": 45,
  "chem": 35,
  "phys": 30,
  "math": 30,
  "earth": 15
 },
 "chapters": [
  {
   "id": "B10-1",
   "subject": "bio",
   "book": "زیست ۱ (دهم)",
   "title": "فصل ۱ دنیای زنده / زیست‌شناسی دیروز، امروز و فردا",
   "obs": [
    0,
    0,
    0,
    0
   ],
   "mean": 0,
   "min": 0,
   "max": 0,
   "nObs": 4,
   "coef": 12,
   "qTypical": 0.0,
   "weightShare": 0.0,
   "priority": 0,
   "tier": 1,
   "confidence": "متوسط (۳ آزمون هم‌خوان + ۱ منبع منفرد)"
  },
  {
   "id": "B10-2",
   "subject": "bio",
   "book": "زیست ۱ (دهم)",
   "title": "فصل ۲ گوارش و جذب مواد",
   "obs": [
    3,
    2,
    2,
    3
   ],
   "mean": 2.5,
   "min": 2,
   "max": 3,
   "nObs": 4,
   "coef": 12,
   "qTypical": 2.45,
   "weightShare": 2.28,
   "priority": 41,
   "tier": 5,
   "confidence": "متوسط (۳ آزمون هم‌خوان + ۱ منبع منفرد)"
  },
  {
   "id": "B10-3",
   "subject": "bio",
   "book": "زیست ۱ (دهم)",
   "title": "فصل ۳ تبادلات گازی",
   "obs": [
    2,
    3,
    2,
    2
   ],
   "mean": 2.25,
   "min": 2,
   "max": 3,
   "nObs": 4,
   "coef": 12,
   "qTypical": 2.21,
   "weightShare": 2.06,
   "priority": 37,
   "tier": 4,
   "confidence": "متوسط (۳ آزمون هم‌خوان + ۱ منبع منفرد)"
  },
  {
   "id": "B10-4",
   "subject": "bio",
   "book": "زیست ۱ (دهم)",
   "title": "فصل ۴ گردش مواد در بدن",
   "obs": [
    3,
    3,
    3,
    null
   ],
   "mean": 3,
   "min": 3,
   "max": 3,
   "nObs": 3,
   "coef": 12,
   "qTypical": 2.95,
   "weightShare": 2.74,
   "priority": 50,
   "tier": 5,
   "confidence": "متوسط (۳ آزمون هم‌خوان + ۱ منبع منفرد)"
  },
  {
   "id": "B10-5",
   "subject": "bio",
   "book": "زیست ۱ (دهم)",
   "title": "فصل ۵ تنظیم اسمزی و دفع مواد زائد",
   "obs": [
    2,
    2,
    3,
    null
   ],
   "mean": 2.33,
   "min": 2,
   "max": 3,
   "nObs": 3,
   "coef": 12,
   "qTypical": 2.29,
   "weightShare": 2.13,
   "priority": 39,
   "tier": 4,
   "confidence": "متوسط (۳ آزمون هم‌خوان + ۱ منبع منفرد)"
  },
  {
   "id": "B10-6",
   "subject": "bio",
   "book": "زیست ۱ (دهم)",
   "title": "فصل ۶ از یاخته تا گیاه",
   "obs": [
    1,
    1,
    1,
    2
   ],
   "mean": 1.25,
   "min": 1,
   "max": 2,
   "nObs": 4,
   "coef": 12,
   "qTypical": 1.23,
   "weightShare": 1.14,
   "priority": 21,
   "tier": 3,
   "confidence": "متوسط (۳ آزمون هم‌خوان + ۱ منبع منفرد)"
  },
  {
   "id": "B10-7",
   "subject": "bio",
   "book": "زیست ۱ (دهم)",
   "title": "فصل ۷ جذب و انتقال مواد در گیاهان",
   "obs": [
    1,
    1,
    1,
    1
   ],
   "mean": 1,
   "min": 1,
   "max": 1,
   "nObs": 4,
   "coef": 12,
   "qTypical": 0.98,
   "weightShare": 0.91,
   "priority": 17,
   "tier": 2,
   "confidence": "متوسط (۳ آزمون هم‌خوان + ۱ منبع منفرد)"
  },
  {
   "id": "B11-1",
   "subject": "bio",
   "book": "زیست ۲ (یازدهم)",
   "title": "فصل ۱ تنظیم عصبی",
   "obs": [
    3,
    3,
    4,
    2
   ],
   "mean": 3,
   "min": 2,
   "max": 4,
   "nObs": 4,
   "coef": 12,
   "qTypical": 2.95,
   "weightShare": 2.74,
   "priority": 50,
   "tier": 5,
   "confidence": "متوسط (۳ آزمون هم‌خوان + ۱ منبع منفرد)"
  },
  {
   "id": "B11-2",
   "subject": "bio",
   "book": "زیست ۲ (یازدهم)",
   "title": "فصل ۲ حواس",
   "obs": [
    3,
    3,
    3,
    3
   ],
   "mean": 3,
   "min": 3,
   "max": 3,
   "nObs": 4,
   "coef": 12,
   "qTypical": 2.95,
   "weightShare": 2.74,
   "priority": 50,
   "tier": 5,
   "confidence": "متوسط (۳ آزمون هم‌خوان + ۱ منبع منفرد)"
  },
  {
   "id": "B11-3",
   "subject": "bio",
   "book": "زیست ۲ (یازدهم)",
   "title": "فصل ۳ دستگاه حرکتی",
   "obs": [
    2,
    3,
    2,
    2
   ],
   "mean": 2.25,
   "min": 2,
   "max": 3,
   "nObs": 4,
   "coef": 12,
   "qTypical": 2.21,
   "weightShare": 2.06,
   "priority": 37,
   "tier": 4,
   "confidence": "متوسط (۳ آزمون هم‌خوان + ۱ منبع منفرد)"
  },
  {
   "id": "B11-4",
   "subject": "bio",
   "book": "زیست ۲ (یازدهم)",
   "title": "فصل ۴ تنظیم شیمیایی",
   "obs": [
    1,
    2,
    3,
    2
   ],
   "mean": 2,
   "min": 1,
   "max": 3,
   "nObs": 4,
   "coef": 12,
   "qTypical": 1.96,
   "weightShare": 1.82,
   "priority": 33,
   "tier": 4,
   "confidence": "متوسط (۳ آزمون هم‌خوان + ۱ منبع منفرد)"
  },
  {
   "id": "B11-5",
   "subject": "bio",
   "book": "زیست ۲ (یازدهم)",
   "title": "فصل ۵ ایمنی",
   "obs": [
    3,
    2,
    2,
    2
   ],
   "mean": 2.25,
   "min": 2,
   "max": 3,
   "nObs": 4,
   "coef": 12,
   "qTypical": 2.21,
   "weightShare": 2.06,
   "priority": 37,
   "tier": 4,
   "confidence": "متوسط (۳ آزمون هم‌خوان + ۱ منبع منفرد)"
  },
  {
   "id": "B11-6",
   "subject": "bio",
   "book": "زیست ۲ (یازدهم)",
   "title": "فصل ۶ تقسیم یاخته",
   "obs": [
    1,
    2,
    2,
    1
   ],
   "mean": 1.5,
   "min": 1,
   "max": 2,
   "nObs": 4,
   "coef": 12,
   "qTypical": 1.47,
   "weightShare": 1.37,
   "priority": 25,
   "tier": 3,
   "confidence": "متوسط (۳ آزمون هم‌خوان + ۱ منبع منفرد)"
  },
  {
   "id": "B11-7",
   "subject": "bio",
   "book": "زیست ۲ (یازدهم)",
   "title": "فصل ۷ تولیدمثل",
   "obs": [
    3,
    2,
    2,
    4
   ],
   "mean": 2.75,
   "min": 2,
   "max": 4,
   "nObs": 4,
   "coef": 12,
   "qTypical": 2.7,
   "weightShare": 2.51,
   "priority": 46,
   "tier": 5,
   "confidence": "متوسط (۳ آزمون هم‌خوان + ۱ منبع منفرد)"
  },
  {
   "id": "B11-8",
   "subject": "bio",
   "book": "زیست ۲ (یازدهم)",
   "title": "فصل ۸ تولیدمثل نهاندانگان",
   "obs": [
    1,
    1,
    1,
    1
   ],
   "mean": 1,
   "min": 1,
   "max": 1,
   "nObs": 4,
   "coef": 12,
   "qTypical": 0.98,
   "weightShare": 0.91,
   "priority": 17,
   "tier": 2,
   "confidence": "متوسط (۳ آزمون هم‌خوان + ۱ منبع منفرد)"
  },
  {
   "id": "B11-9",
   "subject": "bio",
   "book": "زیست ۲ (یازدهم)",
   "title": "فصل ۹ پاسخ گیاهان به محرک‌ها",
   "obs": [
    1,
    1,
    1,
    1
   ],
   "mean": 1,
   "min": 1,
   "max": 1,
   "nObs": 4,
   "coef": 12,
   "qTypical": 0.98,
   "weightShare": 0.91,
   "priority": 17,
   "tier": 2,
   "confidence": "متوسط (۳ آزمون هم‌خوان + ۱ منبع منفرد)"
  },
  {
   "id": "B12-1",
   "subject": "bio",
   "book": "زیست ۳ (دوازدهم)",
   "title": "فصل ۱ مولکول‌های اطلاعاتی",
   "obs": [
    2,
    2,
    2,
    2
   ],
   "mean": 2,
   "min": 2,
   "max": 2,
   "nObs": 4,
   "coef": 12,
   "qTypical": 1.96,
   "weightShare": 1.82,
   "priority": 33,
   "tier": 4,
   "confidence": "متوسط (۳ آزمون هم‌خوان + ۱ منبع منفرد)"
  },
  {
   "id": "B12-2",
   "subject": "bio",
   "book": "زیست ۳ (دوازدهم)",
   "title": "فصل ۲ جریان اطلاعات در یاخته",
   "obs": [
    3,
    3,
    2,
    4
   ],
   "mean": 3,
   "min": 2,
   "max": 4,
   "nObs": 4,
   "coef": 12,
   "qTypical": 2.95,
   "weightShare": 2.74,
   "priority": 50,
   "tier": 5,
   "confidence": "متوسط (۳ آزمون هم‌خوان + ۱ منبع منفرد)"
  },
  {
   "id": "B12-3",
   "subject": "bio",
   "book": "زیست ۳ (دوازدهم)",
   "title": "فصل ۳ انتقال اطلاعات در نسل‌ها",
   "obs": [
    3,
    2,
    2,
    4
   ],
   "mean": 2.75,
   "min": 2,
   "max": 4,
   "nObs": 4,
   "coef": 12,
   "qTypical": 2.7,
   "weightShare": 2.51,
   "priority": 46,
   "tier": 5,
   "confidence": "متوسط (۳ آزمون هم‌خوان + ۱ منبع منفرد)"
  },
  {
   "id": "B12-4",
   "subject": "bio",
   "book": "زیست ۳ (دوازدهم)",
   "title": "فصل ۴ تغییر در اطلاعات وراثتی",
   "obs": [
    2,
    2,
    2,
    3
   ],
   "mean": 2.25,
   "min": 2,
   "max": 3,
   "nObs": 4,
   "coef": 12,
   "qTypical": 2.21,
   "weightShare": 2.06,
   "priority": 37,
   "tier": 4,
   "confidence": "متوسط (۳ آزمون هم‌خوان + ۱ منبع منفرد)"
  },
  {
   "id": "B12-5",
   "subject": "bio",
   "book": "زیست ۳ (دوازدهم)",
   "title": "فصل ۵ از ماده به انرژی",
   "obs": [
    1,
    2,
    2,
    2
   ],
   "mean": 1.75,
   "min": 1,
   "max": 2,
   "nObs": 4,
   "coef": 12,
   "qTypical": 1.72,
   "weightShare": 1.6,
   "priority": 29,
   "tier": 3,
   "confidence": "متوسط (۳ آزمون هم‌خوان + ۱ منبع منفرد)"
  },
  {
   "id": "B12-6",
   "subject": "bio",
   "book": "زیست ۳ (دوازدهم)",
   "title": "فصل ۶ از انرژی به ماده",
   "obs": [
    2,
    1,
    1,
    0
   ],
   "mean": 1,
   "min": 0,
   "max": 2,
   "nObs": 4,
   "coef": 12,
   "qTypical": 0.98,
   "weightShare": 0.91,
   "priority": 17,
   "tier": 2,
   "confidence": "متوسط (۳ آزمون هم‌خوان + ۱ منبع منفرد)"
  },
  {
   "id": "B12-7",
   "subject": "bio",
   "book": "زیست ۳ (دوازدهم)",
   "title": "فصل ۷ فناوری‌های نوین زیستی",
   "obs": [
    1,
    1,
    1,
    1
   ],
   "mean": 1,
   "min": 1,
   "max": 1,
   "nObs": 4,
   "coef": 12,
   "qTypical": 0.98,
   "weightShare": 0.91,
   "priority": 17,
   "tier": 2,
   "confidence": "متوسط (۳ آزمون هم‌خوان + ۱ منبع منفرد)"
  },
  {
   "id": "B12-8",
   "subject": "bio",
   "book": "زیست ۳ (دوازدهم)",
   "title": "فصل ۸ رفتارهای جانوران",
   "obs": [
    1,
    1,
    1,
    1
   ],
   "mean": 1,
   "min": 1,
   "max": 1,
   "nObs": 4,
   "coef": 12,
   "qTypical": 0.98,
   "weightShare": 0.91,
   "priority": 17,
   "tier": 2,
   "confidence": "متوسط (۳ آزمون هم‌خوان + ۱ منبع منفرد)"
  },
  {
   "id": "C10-1",
   "subject": "chem",
   "book": "شیمی ۱ (دهم)",
   "title": "فصل ۱ کیهان، زادگاه الفبای هستی",
   "obs": [
    4,
    4,
    3,
    5
   ],
   "mean": 4,
   "min": 3,
   "max": 5,
   "nObs": 4,
   "coef": 9,
   "qTypical": 4.03,
   "weightShare": 2.81,
   "priority": 51,
   "tier": 4,
   "confidence": "پایین-متوسط (۴ آزمون ۱۳۹۸–۱۴۰۱؛ جدول‌های ۱۴۰۲+ ناهماهنگ)"
  },
  {
   "id": "C10-2",
   "subject": "chem",
   "book": "شیمی ۱ (دهم)",
   "title": "فصل ۲ ردپای گازها در زندگی",
   "obs": [
    2,
    3,
    3,
    1
   ],
   "mean": 2.25,
   "min": 1,
   "max": 3,
   "nObs": 4,
   "coef": 9,
   "qTypical": 2.27,
   "weightShare": 1.58,
   "priority": 29,
   "tier": 3,
   "confidence": "پایین-متوسط (۴ آزمون ۱۳۹۸–۱۴۰۱؛ جدول‌های ۱۴۰۲+ ناهماهنگ)"
  },
  {
   "id": "C10-3",
   "subject": "chem",
   "book": "شیمی ۱ (دهم)",
   "title": "فصل ۳ آب، آهنگ زندگی",
   "obs": [
    3,
    4,
    2,
    4
   ],
   "mean": 3.25,
   "min": 2,
   "max": 4,
   "nObs": 4,
   "coef": 9,
   "qTypical": 3.27,
   "weightShare": 2.28,
   "priority": 41,
   "tier": 4,
   "confidence": "پایین-متوسط (۴ آزمون ۱۳۹۸–۱۴۰۱؛ جدول‌های ۱۴۰۲+ ناهماهنگ)"
  },
  {
   "id": "C11-1",
   "subject": "chem",
   "book": "شیمی ۲ (یازدهم)",
   "title": "فصل ۱ قدر هدایای زمینی را بدانیم",
   "obs": [
    2,
    5,
    4,
    5
   ],
   "mean": 4,
   "min": 2,
   "max": 5,
   "nObs": 4,
   "coef": 9,
   "qTypical": 4.03,
   "weightShare": 2.81,
   "priority": 51,
   "tier": 4,
   "confidence": "پایین-متوسط (۴ آزمون ۱۳۹۸–۱۴۰۱؛ جدول‌های ۱۴۰۲+ ناهماهنگ)"
  },
  {
   "id": "C11-2",
   "subject": "chem",
   "book": "شیمی ۲ (یازدهم)",
   "title": "فصل ۲ در پی غذای سالم",
   "obs": [
    4,
    3,
    4,
    4
   ],
   "mean": 3.75,
   "min": 3,
   "max": 4,
   "nObs": 4,
   "coef": 9,
   "qTypical": 3.78,
   "weightShare": 2.64,
   "priority": 48,
   "tier": 4,
   "confidence": "پایین-متوسط (۴ آزمون ۱۳۹۸–۱۴۰۱؛ جدول‌های ۱۴۰۲+ ناهماهنگ)"
  },
  {
   "id": "C11-3",
   "subject": "chem",
   "book": "شیمی ۲ (یازدهم)",
   "title": "فصل ۳ پوشاک، نیازی پایان‌ناپذیر",
   "obs": [
    6,
    5,
    6,
    4
   ],
   "mean": 5.25,
   "min": 4,
   "max": 6,
   "nObs": 4,
   "coef": 9,
   "qTypical": 5.29,
   "weightShare": 3.69,
   "priority": 67,
   "tier": 5,
   "confidence": "پایین-متوسط (۴ آزمون ۱۳۹۸–۱۴۰۱؛ جدول‌های ۱۴۰۲+ ناهماهنگ)"
  },
  {
   "id": "C12-1",
   "subject": "chem",
   "book": "شیمی ۳ (دوازدهم)",
   "title": "فصل ۱ مولکول‌ها در خدمت تندرستی",
   "obs": [
    4,
    4,
    3,
    3
   ],
   "mean": 3.5,
   "min": 3,
   "max": 4,
   "nObs": 4,
   "coef": 9,
   "qTypical": 3.53,
   "weightShare": 2.46,
   "priority": 45,
   "tier": 4,
   "confidence": "پایین-متوسط (۴ آزمون ۱۳۹۸–۱۴۰۱؛ جدول‌های ۱۴۰۲+ ناهماهنگ)"
  },
  {
   "id": "C12-2",
   "subject": "chem",
   "book": "شیمی ۳ (دوازدهم)",
   "title": "فصل ۲ آسایش و رفاه در سایه شیمی",
   "obs": [
    3,
    4,
    4,
    3
   ],
   "mean": 3.5,
   "min": 3,
   "max": 4,
   "nObs": 4,
   "coef": 9,
   "qTypical": 3.53,
   "weightShare": 2.46,
   "priority": 45,
   "tier": 4,
   "confidence": "پایین-متوسط (۴ آزمون ۱۳۹۸–۱۴۰۱؛ جدول‌های ۱۴۰۲+ ناهماهنگ)"
  },
  {
   "id": "C12-3",
   "subject": "chem",
   "book": "شیمی ۳ (دوازدهم)",
   "title": "فصل ۳ شیمی، جلوه‌ای از هنر، زیبایی و ماندگاری",
   "obs": [
    4,
    2,
    4,
    2
   ],
   "mean": 3,
   "min": 2,
   "max": 4,
   "nObs": 4,
   "coef": 9,
   "qTypical": 3.02,
   "weightShare": 2.11,
   "priority": 38,
   "tier": 3,
   "confidence": "پایین-متوسط (۴ آزمون ۱۳۹۸–۱۴۰۱؛ جدول‌های ۱۴۰۲+ ناهماهنگ)"
  },
  {
   "id": "C12-4",
   "subject": "chem",
   "book": "شیمی ۳ (دوازدهم)",
   "title": "فصل ۴ شیمی، راهی به سوی آینده‌ای روشن‌تر",
   "obs": [
    3,
    1,
    2,
    3
   ],
   "mean": 2.25,
   "min": 1,
   "max": 3,
   "nObs": 4,
   "coef": 9,
   "qTypical": 2.27,
   "weightShare": 1.58,
   "priority": 29,
   "tier": 3,
   "confidence": "پایین-متوسط (۴ آزمون ۱۳۹۸–۱۴۰۱؛ جدول‌های ۱۴۰۲+ ناهماهنگ)"
  },
  {
   "id": "P10-1",
   "subject": "phys",
   "book": "فیزیک ۱ (دهم)",
   "title": "فصل ۱ فیزیک و اندازه‌گیری",
   "obs": null,
   "mean": 1,
   "min": 1,
   "max": 1,
   "nObs": null,
   "coef": 7,
   "qTypical": 1.0,
   "weightShare": 0.54,
   "priority": 10,
   "tier": 2,
   "confidence": "پایین-متوسط (بازه از چند منبع ناقص)"
  },
  {
   "id": "P10-2",
   "subject": "phys",
   "book": "فیزیک ۱ (دهم)",
   "title": "فصل ۲ کار، انرژی و توان",
   "obs": null,
   "mean": 2,
   "min": 2,
   "max": 2,
   "nObs": null,
   "coef": 7,
   "qTypical": 2.0,
   "weightShare": 1.09,
   "priority": 20,
   "tier": 3,
   "confidence": "پایین-متوسط (بازه از چند منبع ناقص)"
  },
  {
   "id": "P10-3",
   "subject": "phys",
   "book": "فیزیک ۱ (دهم)",
   "title": "فصل ۳ ویژگی‌های فیزیکی مواد",
   "obs": null,
   "mean": 2,
   "min": 1,
   "max": 3,
   "nObs": null,
   "coef": 7,
   "qTypical": 2.0,
   "weightShare": 1.09,
   "priority": 20,
   "tier": 3,
   "confidence": "پایین-متوسط (بازه از چند منبع ناقص)"
  },
  {
   "id": "P10-4",
   "subject": "phys",
   "book": "فیزیک ۱ (دهم)",
   "title": "فصل ۴ دما و گرما",
   "obs": null,
   "mean": 2.5,
   "min": 2,
   "max": 3,
   "nObs": null,
   "coef": 7,
   "qTypical": 2.5,
   "weightShare": 1.36,
   "priority": 25,
   "tier": 3,
   "confidence": "پایین-متوسط (بازه از چند منبع ناقص)"
  },
  {
   "id": "P11-1",
   "subject": "phys",
   "book": "فیزیک ۲ (یازدهم)",
   "title": "فصل ۱ الکتریسیته ساکن",
   "obs": null,
   "mean": 3,
   "min": 3,
   "max": 3,
   "nObs": null,
   "coef": 7,
   "qTypical": 3.0,
   "weightShare": 1.63,
   "priority": 29,
   "tier": 4,
   "confidence": "پایین-متوسط (بازه از چند منبع ناقص)"
  },
  {
   "id": "P11-2",
   "subject": "phys",
   "book": "فیزیک ۲ (یازدهم)",
   "title": "فصل ۲ جریان الکتریکی و مدارهای جریان مستقیم",
   "obs": null,
   "mean": 3.5,
   "min": 3,
   "max": 4,
   "nObs": null,
   "coef": 7,
   "qTypical": 3.5,
   "weightShare": 1.9,
   "priority": 34,
   "tier": 4,
   "confidence": "پایین-متوسط (بازه از چند منبع ناقص)"
  },
  {
   "id": "P11-3",
   "subject": "phys",
   "book": "فیزیک ۲ (یازدهم)",
   "title": "فصل ۳ مغناطیس و القای الکترومغناطیسی",
   "obs": null,
   "mean": 2.5,
   "min": 2,
   "max": 3,
   "nObs": null,
   "coef": 7,
   "qTypical": 2.5,
   "weightShare": 1.36,
   "priority": 25,
   "tier": 3,
   "confidence": "پایین-متوسط (بازه از چند منبع ناقص)"
  },
  {
   "id": "P12-1",
   "subject": "phys",
   "book": "فیزیک ۳ (دوازدهم)",
   "title": "فصل ۱ حرکت بر خط راست",
   "obs": null,
   "mean": 3,
   "min": 3,
   "max": 4,
   "nObs": null,
   "coef": 7,
   "qTypical": 3.0,
   "weightShare": 1.63,
   "priority": 29,
   "tier": 4,
   "confidence": "پایین-متوسط (بازه از چند منبع ناقص)"
  },
  {
   "id": "P12-2",
   "subject": "phys",
   "book": "فیزیک ۳ (دوازدهم)",
   "title": "فصل ۲ دینامیک",
   "obs": null,
   "mean": 3,
   "min": 2,
   "max": 3,
   "nObs": null,
   "coef": 7,
   "qTypical": 3.0,
   "weightShare": 1.63,
   "priority": 29,
   "tier": 4,
   "confidence": "پایین-متوسط (بازه از چند منبع ناقص)"
  },
  {
   "id": "P12-3",
   "subject": "phys",
   "book": "فیزیک ۳ (دوازدهم)",
   "title": "فصل ۳ نوسان و موج",
   "obs": null,
   "mean": 4.5,
   "min": 4,
   "max": 6,
   "nObs": null,
   "coef": 7,
   "qTypical": 4.5,
   "weightShare": 2.44,
   "priority": 44,
   "tier": 5,
   "confidence": "پایین-متوسط (بازه از چند منبع ناقص)"
  },
  {
   "id": "P12-4",
   "subject": "phys",
   "book": "فیزیک ۳ (دوازدهم)",
   "title": "فصل ۴ آشنایی با فیزیک اتمی و هسته‌ای",
   "obs": null,
   "mean": 3,
   "min": 2,
   "max": 4,
   "nObs": null,
   "coef": 7,
   "qTypical": 3.0,
   "weightShare": 1.63,
   "priority": 29,
   "tier": 4,
   "confidence": "پایین-متوسط (بازه از چند منبع ناقص)"
  },
  {
   "id": "E11-1",
   "subject": "earth",
   "book": "زمین‌شناسی (یازدهم)",
   "title": "فصل ۱ آفرینش کیهان و تکوین زمین",
   "obs": null,
   "mean": 2.14,
   "min": 1,
   "max": 4,
   "nObs": null,
   "coef": 1,
   "qTypical": 2.14,
   "weightShare": 0.17,
   "priority": 3,
   "tier": 5,
   "confidence": "پایین (منابع ناهماهنگ؛ ضریب ۱)"
  },
  {
   "id": "E11-2",
   "subject": "earth",
   "book": "زمین‌شناسی (یازدهم)",
   "title": "فصل ۲ منابع معدنی و ذخایر انرژی، زیربنای تمدن و توسعه",
   "obs": null,
   "mean": 2.14,
   "min": 1,
   "max": 4,
   "nObs": null,
   "coef": 1,
   "qTypical": 2.14,
   "weightShare": 0.17,
   "priority": 3,
   "tier": 5,
   "confidence": "پایین (منابع ناهماهنگ؛ ضریب ۱)"
  },
  {
   "id": "E11-3",
   "subject": "earth",
   "book": "زمین‌شناسی (یازدهم)",
   "title": "فصل ۳ منابع آب و خاک",
   "obs": null,
   "mean": 2.14,
   "min": 1,
   "max": 4,
   "nObs": null,
   "coef": 1,
   "qTypical": 2.14,
   "weightShare": 0.17,
   "priority": 3,
   "tier": 5,
   "confidence": "پایین (منابع ناهماهنگ؛ ضریب ۱)"
  },
  {
   "id": "E11-4",
   "subject": "earth",
   "book": "زمین‌شناسی (یازدهم)",
   "title": "فصل ۴ پویایی زمین",
   "obs": null,
   "mean": 2.14,
   "min": 1,
   "max": 4,
   "nObs": null,
   "coef": 1,
   "qTypical": 2.14,
   "weightShare": 0.17,
   "priority": 3,
   "tier": 5,
   "confidence": "پایین (منابع ناهماهنگ؛ ضریب ۱)"
  },
  {
   "id": "E11-5",
   "subject": "earth",
   "book": "زمین‌شناسی (یازدهم)",
   "title": "فصل ۵ زمین‌شناسی و سلامت",
   "obs": null,
   "mean": 2.14,
   "min": 1,
   "max": 4,
   "nObs": null,
   "coef": 1,
   "qTypical": 2.14,
   "weightShare": 0.17,
   "priority": 3,
   "tier": 5,
   "confidence": "پایین (منابع ناهماهنگ؛ ضریب ۱)"
  },
  {
   "id": "E11-6",
   "subject": "earth",
   "book": "زمین‌شناسی (یازدهم)",
   "title": "فصل ۶ زمین‌شناسی و سازه‌های مهندسی",
   "obs": null,
   "mean": 2.14,
   "min": 1,
   "max": 4,
   "nObs": null,
   "coef": 1,
   "qTypical": 2.14,
   "weightShare": 0.17,
   "priority": 3,
   "tier": 5,
   "confidence": "پایین (منابع ناهماهنگ؛ ضریب ۱)"
  },
  {
   "id": "E11-7",
   "subject": "earth",
   "book": "زمین‌شناسی (یازدهم)",
   "title": "فصل ۷ زمین‌شناسی ایران",
   "obs": null,
   "mean": 2.14,
   "min": 1,
   "max": 4,
   "nObs": null,
   "coef": 1,
   "qTypical": 2.14,
   "weightShare": 0.17,
   "priority": 3,
   "tier": 5,
   "confidence": "پایین (منابع ناهماهنگ؛ ضریب ۱)"
  },
  {
   "id": "M-der",
   "subject": "math",
   "book": "ریاضی (۱/۲/۳ تجربی)",
   "title": "مشتق (دوازدهم)",
   "obs": null,
   "mean": 3.5,
   "min": 3,
   "max": 4,
   "nObs": null,
   "coef": 7,
   "qTypical": 3.56,
   "weightShare": 1.93,
   "priority": 35,
   "tier": 2,
   "confidence": "پایین (جدول‌ها مبحثی‌اند)"
  },
  {
   "id": "M-appder",
   "subject": "math",
   "book": "ریاضی (۱/۲/۳ تجربی)",
   "title": "کاربرد مشتق (دوازدهم)",
   "obs": null,
   "mean": 1.5,
   "min": 1,
   "max": 2,
   "nObs": null,
   "coef": 7,
   "qTypical": 1.53,
   "weightShare": 0.83,
   "priority": 15,
   "tier": 1,
   "confidence": "پایین (جدول‌ها مبحثی‌اند)"
  },
  {
   "id": "M-limit",
   "subject": "math",
   "book": "ریاضی (۱/۲/۳ تجربی)",
   "title": "حد و پیوستگی / حد نامتناهی",
   "obs": null,
   "mean": 3,
   "min": 2,
   "max": 4,
   "nObs": null,
   "coef": 7,
   "qTypical": 3.05,
   "weightShare": 1.66,
   "priority": 30,
   "tier": 2,
   "confidence": "پایین (جدول‌ها مبحثی‌اند)"
  },
  {
   "id": "M-func",
   "subject": "math",
   "book": "ریاضی (۱/۲/۳ تجربی)",
   "title": "تابع (تمام پایه‌ها)",
   "obs": null,
   "mean": 2.5,
   "min": 2,
   "max": 3,
   "nObs": null,
   "coef": 7,
   "qTypical": 2.54,
   "weightShare": 1.38,
   "priority": 25,
   "tier": 2,
   "confidence": "پایین (جدول‌ها مبحثی‌اند)"
  },
  {
   "id": "M-eq",
   "subject": "math",
   "book": "ریاضی (۱/۲/۳ تجربی)",
   "title": "معادله و نامعادله",
   "obs": null,
   "mean": 2,
   "min": 1,
   "max": 3,
   "nObs": null,
   "coef": 7,
   "qTypical": 2.03,
   "weightShare": 1.1,
   "priority": 20,
   "tier": 1,
   "confidence": "پایین (جدول‌ها مبحثی‌اند)"
  },
  {
   "id": "M-stat",
   "subject": "math",
   "book": "ریاضی (۱/۲/۳ تجربی)",
   "title": "آمار و احتمال (شمارش)",
   "obs": null,
   "mean": 3,
   "min": 2,
   "max": 3,
   "nObs": null,
   "coef": 7,
   "qTypical": 3.05,
   "weightShare": 1.66,
   "priority": 30,
   "tier": 2,
   "confidence": "پایین (جدول‌ها مبحثی‌اند)"
  },
  {
   "id": "M-trig",
   "subject": "math",
   "book": "ریاضی (۱/۲/۳ تجربی)",
   "title": "مثلثات",
   "obs": null,
   "mean": 3,
   "min": 2,
   "max": 4,
   "nObs": null,
   "coef": 7,
   "qTypical": 3.05,
   "weightShare": 1.66,
   "priority": 30,
   "tier": 2,
   "confidence": "پایین (جدول‌ها مبحثی‌اند)"
  },
  {
   "id": "M-explog",
   "subject": "math",
   "book": "ریاضی (۱/۲/۳ تجربی)",
   "title": "تابع نمایی و لگاریتمی",
   "obs": null,
   "mean": 1,
   "min": 0,
   "max": 2,
   "nObs": null,
   "coef": 7,
   "qTypical": 1.02,
   "weightShare": 0.55,
   "priority": 10,
   "tier": 1,
   "confidence": "پایین (جدول‌ها مبحثی‌اند)"
  },
  {
   "id": "M-rest",
   "subject": "math",
   "book": "ریاضی (۱/۲/۳ تجربی)",
   "title": "سایر (مجموعه/الگو/دنباله، توان و عبارت جبری، هندسه، شمارش، هندسه تحلیلی)",
   "obs": null,
   "mean": 10,
   "min": 8,
   "max": 12,
   "nObs": null,
   "coef": 7,
   "qTypical": 10.17,
   "weightShare": 5.52,
   "priority": 100,
   "tier": 5,
   "confidence": "پایین (جدول‌ها مبحثی‌اند)"
  }
 ]
};

  const catalogBySubject = {};
  (catalog.chapters || []).forEach((c) => {
    (catalogBySubject[c.subject] = catalogBySubject[c.subject] || []).push(c);
  });

  /** نزدیک‌ترین فصلِ کاتالوگ برای یک درس/شماره — برای tier و سهمِ سؤال */
  function catalogEntry(subjectId, chapter) {
    const list = catalogBySubject[subjectId] || [];
    if (!list.length) return null;
    const grade = chapter <= 7 ? '1' : (chapter <= 16 ? '2' : '3');  // تفکیک درشتِ پایه
    const byIdx = list.filter((x) => /-(\d+)$/.test(x.id) && Number(x.id.split('-')[1]) === ((chapter - 1) % 7) + 1);
    const pool = byIdx.length ? byIdx : list;
    return pool.find((x) => x.book.indexOf(grade === '1' ? 'دهم' : grade === '2' ? 'یازدهم' : 'دوازدهم') !== -1) || pool[0];
  }

  return Object.assign({}, params, { catalog, catalogBySubject, catalogEntry });
}));
