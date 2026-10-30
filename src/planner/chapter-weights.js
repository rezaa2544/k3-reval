/**
 * اهمیت واقعیِ فصل‌به‌فصل + تفکیک کنکور / نهایی
 * ------------------------------------------------------------------
 * اعداد این فایل «ساختگی» نیستند؛ برای هر فصل سه چیز ثبت شده است:
 *   q     = میانگین تعداد سؤال/نمره‌ای که از آن فصل می‌آید (بودجه‌بندی)
 *   imp   = اهمیت راهبردی ۱..۵ (بر پایه بودجه + قدرت ترکیب با فصل‌های دیگر)
 *   diff  = سختی واقعی ۱..۵ (میانگین زمان حل و درصد پاسخ صحیح داوطلبان)
 *
 * منابع کنکور (بودجه‌بندی ۱۴۰۲–۱۴۰۴ تجربی):
 *   زیست  — medicalstus.ir / harfeakhar.com / tahsilbama.com  (میانگین ۴۵ سؤال)
 *   شیمی  — ariana.ac + harfeakhar.com (۱۴۰۴ تجربی: ۸+۱۴+۱۳) و medicalstus.ir
 *   ریاضی — medicalstus.ir (Math-budgeting-konkour-Tajrobi) + tahsilbama.com
 *   فیزیک — fullito.org + ino.school (۱۴۰۳ تجربی: ۸+۹+۱۳) + medicalstus.ir
 *   زمین  — ino.school + fullito.com (۱۴۰۳: ۱۵ سؤال)
 * منابع نهایی (بارم‌بندی آموزش‌وپرورش ۱۴۰۴–۱۴۰۵، پایه دوازدهم تجربی):
 *   شیمی ۳ — salamsch.org / medicalstus.ir (۶٫۵ + ۵ + ۴ + ۴٫۵)
 *   ریاضی ۳ — solalehschool.ir / pajoohandegan2.ir (۳+۳+۲+۵+۳+۲٫۵+۱٫۵)
 *   فیزیک ۳ — paytakhteketab.com / mag.gozine2.ir (۴٫۲۵+۴٫۵+۶٫۵+۴٫۷۵)
 *   زیست ۳ — paytakhteketab.com (هر ۸ فصل ۲٫۵ نمره — یکنواخت)
 *   فارسی ۳ — sadbist.com (تفکیک قلمروها)
 *
 * اعداد با گرد کردن به یک رقم اعشار ثبت شده‌اند؛ «تقریبی» بودنِ بودجه‌بندی
 * در فیلد note همان فصل آمده است تا کاربر بداند عدد قطعیِ سنجش نیست.
 */

(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(require('./exam-frequency.js'));
  } else {
    root.RevalChapterWeights = factory(root.RevalExamFrequency);
  }
})(typeof self !== 'undefined' ? self : this, function (EF) {
  'use strict';

  /* ------------------------------------------------------------------ */
  /* ۱) بودجه‌بندی کنکور — فصل‌به‌فصل                                     */
  /* ------------------------------------------------------------------ */
  /* ترتیب فصل‌ها دقیقاً همان ترتیب presets.CHAPTERS است (دهم → یازدهم → دوازدهم) */

  const KONKUR = {
    bio: {
      name: 'زیست‌شناسی',
      questions: 45,
      books: [7, 16, 14],          // دهم / یازدهم / دوازدهم (+۸ ترکیبی)
      source: 'medicalstus · harfeakhar · tahsilbama (کنکور ۱۴۰۲–۱۴۰۴)',
      chapters: [
        /* ── دهم ── */
        { q: 0.5, imp: 1, diff: 2, combo: 1 }, // ۱ دنیای زنده
        { q: 3.0, imp: 3, diff: 4, combo: 5 }, // ۲ گوارش و جذب مواد
        { q: 2.0, imp: 3, diff: 3, combo: 3 }, // ۳ تبادلات گازی
        { q: 3.0, imp: 3, diff: 4, combo: 5 }, // ۴ گردش مواد در بدن
        { q: 2.0, imp: 2, diff: 3, combo: 3 }, // ۵ تنظیم اسمزی و دفع مواد زائد
        { q: 1.5, imp: 2, diff: 2, combo: 2 }, // ۶ از یاخته تا گیاه
        { q: 1.5, imp: 2, diff: 2, combo: 3 }, // ۷ جذب و انتقال مواد در گیاهان
        /* ── یازدهم ── */
        { q: 3.0, imp: 4, diff: 4, combo: 4 }, // ۸ تنظیم عصبی
        { q: 2.5, imp: 3, diff: 3, combo: 3 }, // ۹ حواس
        { q: 2.5, imp: 3, diff: 3, combo: 3 }, // ۱۰ دستگاه حرکتی
        { q: 1.5, imp: 2, diff: 3, combo: 3 }, // ۱۱ تنظیم شیمیایی
        { q: 2.0, imp: 3, diff: 3, combo: 4 }, // ۱۲ ایمنی
        { q: 1.5, imp: 4, diff: 5, combo: 5 }, // ۱۳ تقسیم یاخته
        { q: 3.0, imp: 4, diff: 4, combo: 5 }, // ۱۴ تولیدمثل
        { q: 1.0, imp: 2, diff: 3, combo: 2 }, // ۱۵ تولیدمثل نهاندانگان
        { q: 1.0, imp: 1, diff: 2, combo: 2 }, // ۱۶ پاسخ گیاهان به محرک‌ها
        /* ── دوازدهم ── */
        { q: 2.5, imp: 5, diff: 5, combo: 5 }, // ۱۷ مولکول‌های اطلاعاتی
        { q: 3.0, imp: 5, diff: 4, combo: 5 }, // ۱۸ جریان اطلاعات در یاخته
        { q: 3.0, imp: 4, diff: 5, combo: 5 }, // ۱۹ انتقال اطلاعات در نسل‌ها
        { q: 2.0, imp: 4, diff: 4, combo: 4 }, // ۲۰ تغییر در اطلاعات وراثتی
        { q: 1.5, imp: 4, diff: 4, combo: 4 }, // ۲۱ از ماده به انرژی
        { q: 1.5, imp: 3, diff: 4, combo: 4 }, // ۲۲ از انرژی به ماده
        { q: 1.0, imp: 2, diff: 3, combo: 2 }, // ۲۳ فناوری‌های نوین زیستی
        { q: 1.5, imp: 2, diff: 2, combo: 2 }, // ۲۴ رفتارهای جانوران
      ],
    },

    chem: {
      name: 'شیمی',
      questions: 35,
      books: [8, 14, 13],
      source: 'ariana.ac · harfeakhar (۱۴۰۴ تجربی) + medicalstus',
      chapters: [
        { q: 3.0, imp: 3, diff: 3, combo: 3 }, // ۱ کیهان، زادگاه الفبای هستی (دهم)
        { q: 3.0, imp: 3, diff: 3, combo: 3 }, // ۲ ردپای گازها در زندگی (دهم)
        { q: 2.0, imp: 3, diff: 4, combo: 3 }, // ۳ آب، آهنگ زندگی (دهم)
        { q: 4.0, imp: 5, diff: 4, combo: 4 }, // ۴ قدر هدایای زمینی (یازدهم — جدول تناوبی)
        { q: 4.0, imp: 4, diff: 5, combo: 4 }, // ۵ در پی غذای سالم (یازدهم — ترمودینامیک)
        { q: 6.0, imp: 5, diff: 4, combo: 4 }, // ۶ پوشاک، نیازی پایان‌ناپذیر (یازدهم)
        { q: 3.0, imp: 4, diff: 3, combo: 4 }, // ۷ مولکول‌ها در خدمت تندرستی (دوازدهم)
        { q: 4.0, imp: 5, diff: 4, combo: 5 }, // ۸ آسایش و رفاه در سایه شیمی (الکتروشیمی)
        { q: 4.0, imp: 3, diff: 3, combo: 3 }, // ۹ شیمی، جلوه‌ای از هنر (دوازدهم)
        { q: 2.0, imp: 3, diff: 3, combo: 3 }, // ۱۰ شیمی، راهی به آینده روشن‌تر
      ],
    },

    math: {
      name: 'ریاضی',
      questions: 30,
      books: [8, 11, 9],
      source: 'medicalstus (Math-budgeting-konkour-Tajrobi) + tahsilbama (۱۴۰۲–۱۴۰۴)',
      chapters: [
        { q: 0.7, imp: 2, diff: 3, combo: 2 }, // ۱ الگو و دنباله (دهم)
        { q: 1.7, imp: 4, diff: 4, combo: 4 }, // ۲ مثلثات (دهم)
        { q: 0.7, imp: 2, diff: 2, combo: 2 }, // ۳ توان‌ها و عبارت‌های جبری (دهم)
        { q: 2.1, imp: 3, diff: 3, combo: 3 }, // ۴ معادله و نامعادله (دهم)
        { q: 1.4, imp: 4, diff: 3, combo: 5 }, // ۵ تابع (دهم)
        { q: 0.7, imp: 2, diff: 3, combo: 2 }, // ۶ شمارش، بدون شمردن (دهم)
        { q: 1.4, imp: 3, diff: 3, combo: 3 }, // ۷ آمار و احتمال (دهم)
        { q: 1.4, imp: 3, diff: 4, combo: 4 }, // ۸ هندسه تحلیلی و جبر (یازدهم)
        { q: 1.4, imp: 3, diff: 5, combo: 4 }, // ۹ هندسه (یازدهم)
        { q: 1.0, imp: 4, diff: 3, combo: 5 }, // ۱۰ تابع (یازدهم)
        { q: 1.9, imp: 4, diff: 4, combo: 4 }, // ۱۱ مثلثات (یازدهم)
        { q: 1.0, imp: 3, diff: 3, combo: 3 }, // ۱۲ توابع نمایی و لگاریتمی (یازدهم)
        { q: 2.9, imp: 4, diff: 3, combo: 5 }, // ۱۳ حد و پیوستگی (یازدهم)
        { q: 1.4, imp: 3, diff: 3, combo: 3 }, // ۱۴ آمار و احتمال (یازدهم)
        { q: 0.7, imp: 4, diff: 3, combo: 5 }, // ۱۵ تابع (دوازدهم)
        { q: 1.1, imp: 4, diff: 4, combo: 4 }, // ۱۶ مثلثات (دوازدهم)
        { q: 0.3, imp: 2, diff: 3, combo: 2 }, // ۱۷ حد بی‌نهایت (دوازدهم)
        { q: 2.8, imp: 5, diff: 4, combo: 5 }, // ۱۸ مشتق (دوازدهم)
        { q: 2.1, imp: 4, diff: 4, combo: 5 }, // ۱۹ کاربرد مشتق (دوازدهم)
        { q: 1.4, imp: 3, diff: 5, combo: 4 }, // ۲۰ هندسه (دوازدهم)
        { q: 1.0, imp: 3, diff: 3, combo: 3 }, // ۲۱ احتمال (دوازدهم)
      ],
    },

    phys: {
      name: 'فیزیک',
      questions: 30,
      books: [8, 9, 13],
      source: 'fullito.org · ino.school (۱۴۰۳ تجربی) + medicalstus',
      chapters: [
        { q: 1.0, imp: 1, diff: 1, combo: 1 }, // ۱ فیزیک و اندازه‌گیری (دهم)
        { q: 2.0, imp: 3, diff: 2, combo: 3 }, // ۲ ویژگی‌های فیزیکی مواد
        { q: 1.5, imp: 2, diff: 2, combo: 3 }, // ۳ کار، انرژی و توان
        { q: 3.0, imp: 4, diff: 3, combo: 4 }, // ۴ دما و گرما
        { q: 3.0, imp: 4, diff: 3, combo: 4 }, // ۵ الکتریسیته ساکن (یازدهم)
        { q: 3.0, imp: 4, diff: 4, combo: 4 }, // ۶ جریان الکتریکی و مدارها
        { q: 3.0, imp: 3, diff: 4, combo: 4 }, // ۷ مغناطیس و القا
        { q: 3.0, imp: 4, diff: 3, combo: 5 }, // ۸ حرکت بر خط راست (دوازدهم)
        { q: 3.0, imp: 5, diff: 5, combo: 5 }, // ۹ دینامیک و حرکت دایره‌ای
        { q: 4.0, imp: 5, diff: 4, combo: 5 }, // ۱۰ نوسان و موج
        { q: 3.0, imp: 3, diff: 3, combo: 3 }, // ۱۱ فیزیک اتمی و هسته‌ای
      ],
    },

    geo: {
      name: 'زمین‌شناسی',
      questions: 15,
      books: [15],
      source: 'ino.school · fullito.com (کنکور ۱۴۰۳ — ۱۵ سؤال)',
      chapters: [
        { q: 4.0, imp: 4, diff: 4, combo: 3 }, // ۱ آفرینش کیهان و تکوین زمین (یازدهم)
        { q: 2.0, imp: 3, diff: 3, combo: 2 }, // ۲ منابع معدنی و ذخایر انرژی
        { q: 2.0, imp: 3, diff: 3, combo: 2 }, // ۳ منابع آب و خاک
        { q: 2.0, imp: 3, diff: 3, combo: 2 }, // ۴ پویایی زمین
        { q: 2.0, imp: 3, diff: 2, combo: 2 }, // ۵ زمین‌شناسی و سلامت
        { q: 1.0, imp: 2, diff: 2, combo: 1 }, // ۶ زمین‌شناسی و سازه‌های مهندسی
        { q: 2.0, imp: 3, diff: 3, combo: 2 }, // ۷ زمین‌شناسی ایران
      ],
    },
  };

  /* ------------------------------------------------------------------ */
  /* ۲) بارم‌بندی نهایی (سوابق تحصیلی) — درس‌به‌درس و فصل‌به‌فصل            */
  /* ------------------------------------------------------------------ */
  /* uniform: true یعنی بارم همهٔ فصل‌ها/دروس عملاً یکسان است.               */

  const FINALS = {
    chem3: {
      name: 'شیمی ۳', total: 20, uniform: false,
      source: 'بارم‌بندی نهایی ۱۴۰۵ (salamsch.org · medicalstus)',
      baram: [6.5, 5, 4, 4.5],
      method: ['حل مثال‌های کتاب درسی خط‌به‌خط (منبع اصلی طراح)', 'مسائل را با «روش تشریحی» بنویس، نه فقط جواب آخر',
        'جدول‌ها و شکل‌های کتاب را جدا مرور کن — بیشتر سؤال‌ها از آن‌ها می‌آید', 'نمونه‌سؤال خرداد سال‌های قبل + تصحیح با بارم‌بندی'],
    },
    math3: {
      name: 'ریاضی ۳', total: 20, uniform: false,
      source: 'بارم‌بندی نهایی ۱۴۰۴–۱۴۰۵ تجربی (solalehschool)',
      baram: [3, 3, 2, 5, 3, 2.5, 1.5],
      method: ['تمرین‌های کتاب درسی و فعالیت‌ها را کامل حل کن', 'هر سؤال را با «مراحل» بنویس؛ نمرهٔ نهایی برای حل تشریحی است',
        'فصل‌های پربارم (فصل ۴) بیشترین وقت را بگیرند', 'نمونه‌سؤال نهایی با زمان‌بندی واقعی جلسهٔ آزمون'],
    },
    phys3: {
      name: 'فیزیک ۳', total: 20, uniform: false,
      source: 'بارم‌بندی نهایی ۱۴۰۵ تجربی (paytakhteketab · gozine2)',
      baram: [4.25, 4.5, 6.5, 4.75],
      method: ['فصل ۳ (نوسان و امواج) بیشترین بارم را دارد — وقت ویژه بگیر', 'نمودار و شکل‌ها را دقیق رسم/تشریح کن',
        'آزمایش‌های کتاب ۲–۳ نمره دارند؛ دست‌ورزی و توضیح روش را تمرین کن', 'نمونه‌سؤال خرداد با تصحیح بارم‌محور'],
    },
    bio3: {
      name: 'زیست‌شناسی ۳', total: 20, uniform: true,
      source: 'بارم‌بندی نهایی ۱۴۰۵ (paytakhteketab — هر ۸ فصل ۲٫۵ نمره)',
      baram: [2.5, 2.5, 2.5, 2.5, 2.5, 2.5, 2.5, 2.5],
      method: ['بارم همهٔ فصل‌ها یکسان است ⇒ هیچ فصلی را جا نگذار', 'کتاب درسی خط‌به‌خط، به‌ویژه جمله‌های «به‌چشم دیده می‌شود» و شکل‌ها',
        'پاسخ‌های تشریحی را با واژگان خودِ کتاب بنویس', 'نمونه‌سؤال نهایی + دفتر اشتباهات تشریحی'],
    },
    fa3: {
      name: 'فارسی ۳', total: 20, uniform: false,
      source: 'بارم‌بندی فارسی ۳ نهایی (sadbist.com)',
      baram: [4, 3, 1, 1, 4, 2, 2, 1, 2],
      baramTitle: ['دستور زبان', 'آرایه‌های ادبی', 'تاریخ ادبیات', 'حفظ شعر', 'درک مطلب', 'معنی و مفهوم نثر', 'معنی و مفهوم نظم', 'معنی واژه', 'املای واژه'],
      method: ['قلمرو زبانی و فکری بیشترین بارم را دارند — دستور و درک مطلب وقت ویژه بگیرند', 'معنی و مفهوم نثر/نظم را با جمله‌نویسی تمرین کن',
        'آرایه‌ها را در متن پیدا کن، نه فقط تعریف حفظ کن', 'نمونه‌سؤال نهایی فارسی با تصحیح بارم‌محور'],
    },
    ar3: {
      name: 'عربی ۳', total: 20, uniform: false,
      source: 'بارم‌بندی عربی ۳ نهایی ۱۴۰۴–۱۴۰۵ (محدودهٔ تقریبی قلمروها)',
      approx: true,
      baram: [4, 5, 4, 3, 4],
      baramTitle: ['ترجمه', 'قواعد', 'درک مطلب', 'تحلیل صرفی و اعراب', 'واژه‌شناسی'],
      method: ['ترجمه و قواعد روی هم ~۹ نمره — ستون فقرات کار', 'قواعد را با مثال ترجمه کن، نه حفظ قاعده',
        'متن‌های کتاب درسی را دوباره ترجمه کن', 'نمونه‌سؤال نهایی با تصحیح بارم‌محور'],
    },
    dini3: {
      name: 'دین و زندگی ۳', total: 20, uniform: true,
      source: 'بارم‌بندی نهایی ۱۴۰۴–۱۴۰۵ (یکنواخت بین دروس)',
      baram: [2, 2, 2, 2, 2, 2, 2, 2, 2, 2],
      method: ['بارم یکنواخت ⇒ پوشش کامل همهٔ دروس، نه چند درس محبوب', 'آیات و احادیث کلیدی هر درس را با معنا یاد بگیر',
        'پاسخ‌ها را با جمله‌بندی کتاب بنویس (نمرهٔ تشریحی)', 'نمونه‌سؤال نهایی + تمرین «چرا» و «چگونه»'],
    },
    en3: {
      name: 'زبان خارجی ۳', total: 20, uniform: true,
      source: 'بارم‌بندی نهایی ۱۴۰۴–۱۴۰۵ (یکنواخت بین بخش‌ها)',
      baram: [2, 2, 2, 2, 2, 2, 2, 2, 2, 2],
      method: ['لغت و گرامر هر درس را در جمله تمرین کن', 'Reading کتاب درسی را با صدا و ترجمهٔ دقیق مرور کن',
        'Writing را با الگوی کتاب تمرین کن', 'نمونه‌سؤال نهایی با زمان‌بندی واقعی'],
    },
    salamat3: {
      name: 'سلامت و بهداشت', total: 20, uniform: true,
      source: 'بارم‌بندی نهایی ۱۴۰۴–۱۴۰۵ (یکنواخت)',
      baram: [2, 2, 2, 2, 2, 2, 2, 2, 2, 2],
      method: ['متن کتاب با دقت و «جمله‌به‌جمله» خوانده شود؛ سؤال‌ها مستقیم از متن است',
        'جدول‌ها و آمارها را مرور کن', 'نمونه‌سؤال نهایی خرداد'],
    },
    hoviat3: {
      name: 'هویت اجتماعی', total: 20, uniform: true,
      source: 'بارم‌بندی نهایی ۱۴۰۴–۱۴۰۵ (یکنواخت)',
      baram: [2, 2, 2, 2, 2, 2, 2, 2, 2, 2],
      method: ['پاسخ‌های تشریحی با تعریف‌های دقیق کتاب', 'مقایسه‌ها و دسته‌بندی‌های کتاب را جدول کن',
        'نمونه‌سؤال نهایی خرداد'],
    },
  };

  /* نهایی یازدهم: همان درس‌ها با شناسهٔ -11 (بارم یکنواخت‌تر، تأثیر ۱۷٪ سوابق) */
  const FINALS_Y11 = {
    fa2: { name: 'فارسی ۲', baram: [4, 3, 1, 1, 4, 2, 2, 1, 2], baramTitle: FINALS.fa3.baramTitle, total: 20,
      source: 'قلمروهای فارسی (هم‌ساخت با فارسی ۳)', uniform: false, approx: true },
    ar2: { name: 'عربی ۲', baram: [4, 5, 4, 3, 4], baramTitle: FINALS.ar3.baramTitle, total: 20,
      source: 'قلمروهای عربی (هم‌ساخت با عربی ۳)', uniform: false, approx: true },
    dini2: { name: 'دین و زندگی ۲', baram: [2, 2, 2, 2, 2, 2, 2, 2, 2, 2], total: 20, uniform: true,
      source: 'بارم‌بندی نهایی یازدهم (یکنواخت)' },
    en2: { name: 'زبان خارجی ۲', baram: [2, 2, 2, 2, 2, 2, 2, 2, 2, 2], total: 20, uniform: true,
      source: 'بارم‌بندی نهایی یازدهم (یکنواخت)' },
    math2: { name: 'ریاضی ۲', baram: [3, 4, 3, 3, 4, 3], total: 20, uniform: false, approx: true,
      source: 'بارم‌بندی تقریبی ریاضی ۲ (۷ فصل کتاب، توزیع هم‌ساخت)' },
    bio2: { name: 'زیست‌شناسی ۲', baram: [2.5, 2.5, 2.5, 2.5, 2.5, 2.5, 2.5, 2.5], total: 20, uniform: true,
      source: 'بارم‌بندی نهایی یازدهم (یکنواخت)' },
  };

  /* روش مطالعهٔ کنکور (تست‌محور) — جدا از روش نهایی (تشریحی/بارم‌محور) */
  const KONKUR_METHOD = {
    bio: ['درسی‌خوانی خط‌به‌خط + ترکیب فصلی (سؤال‌های ترکیبی ~۸ سؤال از ۴۵)', 'تست زمان‌دار: ~۶۰ ثانیه برای هر تست',
      'مرور فاصله‌دار ۱-۳-۷-۱۶-۳۵ روز', 'دفتر اشتباهات + تحلیل «چرا غلط شد»'],
    chem: ['مفهوم + مسیر حل، بعد تست', 'مسائل را با ماشین‌حساب و زمان‌سنج تمرین کن (~۲ دقیقه برای هر مسئله)',
      'جدول تناوبی و روندها نموداری مرور شوند', 'تست ترکیبی دهم+یازدهم+دوازدهم در یک نشست'],
    math: ['یادگیری مفهوم → حل تمرین → تست زمان‌دار (~۹۰ ثانیه برای هر تست)', 'هندسه و مثلثات نیازمند تمرین نوشتاری زیاد',
      'مرور اشتباهات مهم‌تر از تست جدید است', 'آزمون کوچک هفتگی از فصل‌های خوانده‌شده'],
    phys: ['مسئله‌محور: هر فصل با فرمول‌ها و نمودارها', 'تست زمان‌دار (~۹۰ ثانیه برای هر تست)',
      'دینامیک و نوسان سنگین‌ترین بخش‌ها هستند — بلوک‌های بلندتر', 'مرور فاصله‌دار + بازحل تست‌های غلط'],
    geo: ['متن و شکل‌های کتاب + تست کم‌حجم', 'ضریب ۱ است: زمان کم، ولی صفر نگذار', 'مرور کوتاه هفتگی'],
  };

  /* ------------------------------------------------------------------ */
  /* ۳) توابع کاربردی                                                     */
  /* ------------------------------------------------------------------ */

  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  const r1 = (n) => Math.round(n * 10) / 10;
  const FA = (n) => String(n).replace(/[0-9]/g, (d) => '۰۱۲۳۴۵۶۷۸۹'[+d]);

  /** دادهٔ کنکور یک درس (یا null اگر درس عمومی/بی‌داده باشد) */
  function konkur(subjectId) {
    return KONKUR[String(subjectId || '').toLowerCase()] || null;
  }

  /** دادهٔ بارم نهایی یک درس (شناسه‌هایی مثل chem3 / bio2 / fa3) */
  function finals(courseId, grade) {
    const id = String(courseId || '');
    const base11 = /-11$/.test(id);
    const key = id.replace(/-(11|12)$/, '');
    if (grade === 'یازدهم' || base11) {
      const b = FINALS_Y11[key];
      if (b) return b;
    }
    return FINALS[key] || FINALS_Y11[key] || null;
  }

  /**
   * ضرایب خامِ هر درس، سپس «میانگین‌یک」 می‌شوند:
   * مجموع زمان لازمِ هر کتاب ثابت می‌ماند و فقط بین فصل‌ها بازتوزیع می‌شود
   * (فصل پرسؤال/سخت زمان بیشتری می‌گیرد، فصل کم‌هزینه کمتر — نه اینکه کل برنامه باد کند).
   */
  /* ── ۲.۸.۱۲: اهمیت از دادهٔ چندسالهٔ کنکور ────────────────────────────
     برای هر درسی که در exam-frequency دادهٔ سال‌به‌سال دارد، عددِ دستیِ «q»
     و رتبهٔ دستیِ «imp» با مقادیر محاسبه‌شده جایگزین می‌شود:
       q   ← میانگینِ وزن‌دارِ سؤال در سال‌های ثبت‌شده
       imp ← رتبهٔ ۱..۵ بر پایهٔ اولویتِ همان فصل در همان درس
       priority / priorityLocal / years / series / coef هم ذخیره می‌شوند.
     بقیهٔ درس‌ها (انسانی، زبان، …) با اعداد قبلی و برچسب «تقریبی» کار می‌کنند. */
  let ACTIVE_FIELD = 'tajrobi';
  function setField(field) {
    const f = String(field || 'tajrobi');
    const next = FIELD_ALIAS[f] || f;
    if (next === ACTIVE_FIELD) return;
    ACTIVE_FIELD = next;
    /* پاک‌کردن کش‌ها چون ضریب/نرمال‌سازی با رشته عوض می‌شود */
    Object.keys(NORM_CACHE).forEach((k) => { delete NORM_CACHE[k]; });
    applyExamData();
  }
  const FIELD_ALIAS = { experimental: 'tajrobi', math: 'riazi', humanities: 'ensani', english: 'zaban' };

  /* نسخهٔ دست‌نخوردهٔ اعداد تا با عوض‌شدن رشته، داده‌های رشتهٔ قبلی باقی نماند */
  const ORIGINAL = {};
  Object.keys(KONKUR).forEach((sid) => {
    ORIGINAL[sid] = KONKUR[sid].chapters.map((c) => ({ q: c.q, imp: c.imp }));
  });

  function applyExamData() {
    if (!EF || typeof EF.chapters !== 'function') return;
    Object.keys(KONKUR).forEach((sid) => {
      const d = KONKUR[sid];
      /* بازگردانی به عددِ دستی، بعد اعمالِ دادهٔ رشتهٔ فعال */
      ORIGINAL[sid].forEach((o, i) => {
        if (!d.chapters[i]) return;
        d.chapters[i].q = o.q;
        d.chapters[i].imp = o.imp;
        d.chapters[i].priority = null;
        d.chapters[i].priorityLocal = null;
        d.chapters[i].series = null;
        d.chapters[i].years = null;
        d.chapters[i].trend = null;
      });
      d.coef = null; d.coefVerified = false; d.dataDriven = false;
      d.years = null; d.cols = null; d.dataNote = ''; d.dataSources = null;
      d.coarse = false; d.exams = null; d.fromYear = null; d.toYear = null;
      d.qTotal = null;
      const res = EF.chapters(sid, ACTIVE_FIELD);
      if (!res || !res.items || res.items.length !== d.chapters.length) return;
      d.chapters.forEach((row, i) => {
        const it = res.items[i];
        if (!it) return;
        row.q = it.qAvg;                 // میانگین وزنی
        row.qPlain = it.qPlain;
        row.imp = it.imp;                // رتبهٔ اهمیت محاسبه‌شده
        row.priority = it.priority;      // ۰..۱۰۰ در کل رشته (با ضریب)
        row.priorityLocal = it.priorityLocal;
        row.series = it.series;
        row.years = it.years;
        row.trend = it.trend;
      });
      d.coef = res.coef;
      d.coefVerified = res.coefVerified;
      d.years = res.years;
      d.cols = res.data.cols;                 // برچسبِ هر آزمون + منبعش
      d.dataNote = res.data.note;
      d.dataSources = res.data.sources;
      d.dataDriven = true;
      d.qTotal = res.data.qTotal;
      d.coarse = Boolean(res.data.coarse);
      d.exams = res.data.exams;
      d.fromYear = res.data.from;
      d.toYear = res.data.to;
    });
  }
  applyExamData();

  const NORM_CACHE = {};
  function norms(subjectId) {
    const key = String(subjectId || '');
    if (NORM_CACHE[key]) return NORM_CACHE[key];
    const d = KONKUR[key];
    if (!d) return null;
    const qs = d.chapters.map((c) => c.q);
    const maxQ = Math.max.apply(null, qs) || 1;
    const sorted = qs.slice().sort((a, b) => b - a);
    const rawNeed = d.chapters.map((c) => {
      const qRel = clamp(c.q / maxQ, 0, 1);
      return 0.45 + 0.85 * qRel + 0.22 * (c.diff / 5) + 0.28 * (c.imp / 5);
    });
    const rawTest = d.chapters.map((c) => {
      const qRel = clamp(c.q / maxQ, 0, 1);
      return 0.40 + 0.95 * qRel + 0.35 * (c.imp / 5) + 0.15 * (c.diff / 5);
    });
    const mean = (arr) => arr.reduce((a, b) => a + b, 0) / (arr.length || 1);
    const mNeed = mean(rawNeed) || 1;
    const mTest = mean(rawTest) || 1;
    const out = {
      maxQ, sorted,
      need: rawNeed.map((x) => clamp(x / mNeed, 0.5, 1.8)),
      test: rawTest.map((x) => clamp(x / mTest, 0.45, 2.2)),
    };
    NORM_CACHE[key] = out;
    return out;
  }

  /**
   * اطلاعات یک فصل کنکوری: چند سؤال، چقدر مهم، چقدر سخت،
   * و ضریب‌هایی که موتور برنامه‌ریزی مستقیم روی زمان و اولویت می‌گذارد.
   */
  function chapterInfo(subjectId, chapterNo) {
    const d = konkur(subjectId);
    if (!d) return null;
    const i = Math.max(1, Math.round(Number(chapterNo) || 1)) - 1;
    const row = d.chapters[i];
    if (!row) return null;
    const nm = norms(subjectId);
    const qs = d.chapters.map((c) => c.q);
    const maxQ = nm.maxQ || 1;
    const meanQ = qs.reduce((a, b) => a + b, 0) / (qs.length || 1);
    const qRel = clamp(row.q / maxQ, 0, 1);
    /* سهم این فصل از کل درس (برای نمایش «چند درصد سؤال‌ها») */
    const share = row.q / (qs.reduce((a, b) => a + b, 0) || 1);
    /* ضریب اولویت: پرسؤال‌ترین + مهم‌ترین فصل‌ها جلو می‌افتند */
    /* ضریب اولویت: اگر دادهٔ چندساله هست، «اولویتِ وزنی با ضریب درس» مبناست
       (فصلِ پرتکرارِ ضریب‌بالا جلو می‌افتد)؛ وگرنه فرمول قبلی. */
    const prio = row.priority == null ? null : row.priority / 100;
    const mult = prio == null
      ? clamp(0.70 + 0.50 * qRel + 0.30 * (row.imp / 5) + 0.06 * (row.combo / 5), 0.6, 1.9)
      : clamp(0.62 + 0.70 * prio + 0.24 * (row.imp / 5) + 0.06 * (row.combo / 5), 0.55, 1.65);
    /* ضریب زمان (میانگین‌یک внутри درس): فصل سخت‌تر و پرسؤال‌تر زمان بیشتری
       برای یادگیری/تثبیت/مرور/تست می‌گیرد و فصل کم‌هزینه کمتر. */
    const needMult = nm.need[i];
    /* ضریب تعداد تست (میانگین‌یک) */
    const testMult = nm.test[i];
    return {
      subjectId, chapter: i + 1,
      q: row.q, imp: row.imp, diff: row.diff, combo: row.combo,
      priority: row.priority == null ? null : row.priority,
      priorityLocal: row.priorityLocal == null ? null : row.priorityLocal,
      series: row.series || null,
      years: row.years || d.years || null,
      coef: d.coef == null ? null : d.coef,
      coefVerified: Boolean(d.coefVerified),
      dataDriven: Boolean(d.dataDriven),
      dataNote: d.dataNote || '',
      dataSources: d.dataSources || null,
      dataCols: d.cols || null,
      coarse: Boolean(d.coarse),
      exams: d.exams || null,
      yearFrom: d.fromYear == null ? null : d.fromYear,
      yearTo: d.toYear == null ? null : d.toYear,
      qTotal: d.qTotal || d.questions || null,
      qAvg: row.q,
      qSeries: row.series ? row.series.slice() : null,
      trend: row.trend == null ? null : row.trend,
      share, sharePct: Math.round(share * 1000) / 10,
      qRel, relToMean: r1(row.q / (meanQ || 1)),
      mult: r1(mult * 100) / 100, needMult: r1(needMult * 100) / 100, testMult: r1(testMult * 100) / 100,
      tag: tagOf(row.imp, row.diff, qRel),
      source: d.source,
      bookQuestions: d.questions,
    };
  }

  function tagOf(imp, diff, qRel) {
    if (imp >= 5 && diff >= 4) return 'بحرانی';
    if (imp >= 5 || (imp >= 4 && qRel >= 0.6)) return 'پرتکرار';
    if (imp >= 3) return 'متوسط';
    return 'کم‌هزینه';
  }

  /**
   * ضریب فصلِ نهایی بر پایهٔ بارم واقعی:
   * نسبت بارم فصل به بارم میانگین ⇒ فصل پربارم زمان بیشتری می‌گیرد.
   */
  function finalsChapterInfo(courseId, chapterNo, grade) {
    const d = finals(courseId, grade);
    if (!d || !d.baram || !d.baram.length) return null;
    const n = d.baram.length;
    const i = Math.max(1, Math.round(Number(chapterNo) || 1)) - 1;
    const baram = d.baram[Math.min(i, n - 1)];
    const avg = d.baram.reduce((a, b) => a + b, 0) / n;
    const rel = avg > 0 ? baram / avg : 1;
    const needMult = clamp(0.60 + 0.45 * rel, 0.5, 1.8);
    return {
      courseId, chapter: i + 1, baram, avg: r1(avg), rel: r1(rel * 100) / 100,
      needMult: r1(needMult * 100) / 100,
      title: d.baramTitle ? d.baramTitle[Math.min(i, (d.baramTitle || []).length - 1)] : 'فصل ' + FA(i + 1),
      uniform: Boolean(d.uniform), approx: Boolean(d.approx), source: d.source, total: d.total || 20,
    };
  }

  /** ضریب اهمیت/نیاز یک فصل برای موتور (کنکور) — پیش‌فرض امن اگر داده نبود */
  function konkurFactors(subjectId, chapterNo) {
    const info = chapterInfo(subjectId, chapterNo);
    return info
      ? { mult: info.mult, needMult: info.needMult, testMult: info.testMult, info }
      : { mult: 1, needMult: 1, testMult: 1, info: null };
  }

  function konkurMethod(subjectId) {
    return KONKUR_METHOD[String(subjectId || '').toLowerCase()] || [
      'درسی‌خوانی + تست زمان‌دار', 'مرور فاصله‌دار ۱-۳-۷-۱۶-۳۵', 'دفتر اشتباهات',
    ];
  }

  function finalsMethod(courseId, grade) {
    const d = finals(courseId, grade);
    return (d && d.method) || ['متن کتاب درسی خط‌به‌خط', 'نمونه‌سؤال نهایی سال‌های قبل', 'تصحیح بارم‌محور'];
  }

  /** جدول خلاصهٔ کنکور یک درس برای نمایش در رابط کاربری */
  function konkurTable(subjectId, chapterNames) {
    const d = konkur(subjectId);
    if (!d) return [];
    return d.chapters.map((c, i) => {
      const info = chapterInfo(subjectId, i + 1);
      return {
        chapter: i + 1,
        name: (chapterNames && chapterNames[i]) || ('فصل ' + FA(i + 1)),
        q: c.q, imp: c.imp, diff: c.diff, sharePct: info.sharePct, tag: info.tag,
      };
    });
  }

  /** جدول خلاصهٔ نهایی یک درس */
  function finalsTable(courseId, grade) {
    const d = finals(courseId, grade);
    if (!d) return [];
    return d.baram.map((b, i) => ({
      chapter: i + 1,
      name: (d.baramTitle && d.baramTitle[i]) || ('فصل ' + FA(i + 1)),
      baram: b,
      title: d.baramTitle ? d.baramTitle[i] : null,
    }));
  }

  return {
    KONKUR, FINALS, FINALS_Y11, KONKUR_METHOD,
    konkur, finals, chapterInfo, finalsChapterInfo,
    konkurFactors, konkurMethod, finalsMethod, tagOf,
    konkurTable, finalsTable,
    setField, getField: () => ACTIVE_FIELD, EXAM: EF || null,
    FA,
  };
});
