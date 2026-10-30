/**
 * Reval AI — ابزارها (Tools)
 * ------------------------------------------------------------------
 * دستیار بدون «توان انجام کار» فقط یک چت‌بات است. این فایل فهرست کارهایی است که
 * هوش مصنوعی می‌تواند واقعاً در برنامه انجام دهد: ساعت مطالعه، روز استراحت، اندازهٔ
 * بلوک، تاریخ کنکور، بازچینش، آیتم اضطراری، و خواندنِ گزارش.
 *
 * هر ابزار: { name, title, description, parameters (JSON-Schema), run(args, ctx) }
 * ctx امکانات برنامه را می‌دهد (خواندنِ تنظیمات، اعمال تغییر، ساخت مجدد).
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.RevalAITools = api;
}(typeof window !== 'undefined' ? window : globalThis, function () {
  'use strict';

  const DAY_FA = { sat: 'شنبه', sun: 'یکشنبه', mon: 'دوشنبه', tue: 'سه‌شنبه', wed: 'چهارشنبه', thu: 'پنجشنبه', fri: 'جمعه' };
  const DAY_KEYS = ['sat', 'sun', 'mon', 'tue', 'wed', 'thu', 'fri'];
  const NUM = '۰۱۲۳۴۵۶۷۸۹';
  const fa = (s) => String(s).replace(/\d/g, (d) => NUM[+d]);

  const ok = (message, data) => ({ ok: true, message, data: data || null });
  const bad = (message) => ({ ok: false, message });

  /* ─────────────────────────── ابزارها ─────────────────────────── */

  const TOOLS = [
    {
      name: 'set_daily_study_hours',
      title: 'تنظیم ساعت مطالعهٔ روزانه',
      description: 'ساعت مطالعهٔ اعلامی دانش‌آموز را برای روزهای هفته تنظیم می‌کند و برنامه را از نو می‌سازد.',
      parameters: {
        type: 'object',
        properties: {
          hours: { type: 'number', description: 'ساعت مطالعه برای روزهای عادی (مثلاً 4)' },
          weekendHours: { type: 'number', description: 'ساعت مطالعه برای پنجشنبه/جمعه (اختیاری)' },
          days: { type: 'object', description: 'ساعت هر روز به‌صورت {sat:4,sun:5,...} (اختیاری)' },
        },
      },
      run(args, ctx) {
        const h = Number(args && args.hours);
        const wk = args && args.weekendHours != null ? Number(args.weekendHours) : null;
        const out = {};
        if (args && args.days && typeof args.days === 'object') {
          DAY_KEYS.forEach((k) => { if (args.days[k] != null) out[k] = Math.max(0, Math.min(14, Number(args.days[k]))); });
        } else {
          if (!Number.isFinite(h) || h <= 0) return bad('ساعت مطالعه مشخص نشد.');
          DAY_KEYS.forEach((k) => { out[k] = k === 'thu' || k === 'fri' ? (wk != null ? wk : h) : h; });
        }
        if (!Object.keys(out).length) return bad('ساعت مطالعه مشخص نشد.');
        const total = DAY_KEYS.reduce((a, k) => a + (out[k] != null ? out[k] : 0), 0);
        if (total < 3) return bad('با کمتر از ۳ ساعت در هفته برنامه‌ای ساخته نمی‌شود.');
        const res = ctx.applyAvailability(out);
        return ok(
          'ساعت مطالعه تنظیم شد: ' + DAY_KEYS.filter((k) => out[k] != null)
            .map((k) => DAY_FA[k] + ' ' + fa(out[k]) + ' ساعت').join(' · ') + '.',
          res,
        );
      },
    },
    {
      name: 'set_rest_day',
      title: 'روز استراحت هفتگی',
      description: 'روز استراحت هفتگی را تعیین می‌کند (روزی که هیچ بلوکی چیده نمی‌شود).',
      parameters: {
        type: 'object',
        properties: {
          weekday: { type: 'string', enum: DAY_KEYS, description: 'کد روز هفته' },
        },
        required: ['weekday'],
      },
      run(args, ctx) {
        const key = String((args && args.weekday) || '').toLowerCase();
        if (DAY_KEYS.indexOf(key) === -1) return bad('روز هفته نامعتبر است.');
        ctx.applyRestDay(key);
        return ok('روز استراحت شد ' + DAY_FA[key] + '. در این روز هیچ بلوکی چیده نمی‌شود و مرورها به روز بعد منتقل می‌شوند.');
      },
    },
    {
      name: 'set_block_minutes',
      title: 'طول هر بلوک مطالعه',
      description: 'طول بلوک‌های برنامه را تغییر می‌دهد (۴۵ دقیقه پیش‌فرض؛ ۳۰ برای تمرکز کوتاه، ۶۰ برای جلسات عمیق).',
      parameters: {
        type: 'object',
        properties: { minutes: { type: 'number', description: 'بین ۲۵ و ۹۰' } },
        required: ['minutes'],
      },
      run(args, ctx) {
        const m = Math.round(Number(args && args.minutes));
        if (!Number.isFinite(m) || m < 25 || m > 90) return bad('طول بلوک باید بین ۲۵ و ۹۰ دقیقه باشد.');
        ctx.applyBlockMinutes(m);
        return ok('طول هر بلوک شد ' + fa(m) + ' دقیقه. بلوک‌های یادگیری هرگز زیر ۳۰ دقیقه نمی‌روند.');
      },
    },
    {
      name: 'set_exam_date',
      title: 'تاریخ کنکور',
      description: 'تاریخ آزمون سراسری را تغییر می‌دهد. ورودی به شکل YYYY-MM-DD میلادی یا «1406/04/10» شمسی.',
      parameters: {
        type: 'object',
        properties: {
          iso: { type: 'string', description: 'تاریخ میلادی YYYY-MM-DD' },
          jalali: { type: 'string', description: 'تاریخ شمسی مثل 1406/04/10' },
        },
      },
      run(args, ctx) {
        const target = (args && (args.iso || args.jalali)) || '';
        const res = ctx.applyExamDate(String(target));
        if (!res || !res.ok) return bad((res && res.message) || 'تاریخ قابل تشخیص نبود.');
        return ok(res.message || ('تاریخ آزمون شد ' + fa(target) + '.'), res);
      },
    },
    {
      name: 'set_time_mode',
      title: 'حالت برنامه‌ریزی (دستی/خودکار)',
      description: 'حالت «خودکار» را روشن/خاموش می‌کند. در حالت خودکار فقط سقف ساعت داده می‌شود و برنامه کم‌ترین ساعتِ کافی را انتخاب می‌کند.',
      parameters: {
        type: 'object',
        properties: {
          mode: { type: 'string', enum: ['auto', 'fixed'] },
          capHours: { type: 'number', description: 'سقف روزانه در حالت خودکار' },
        },
        required: ['mode'],
      },
      run(args, ctx) {
        const req = String((args && args.mode) || '').toLowerCase();
        if (req !== 'auto' && req !== 'fixed' && req !== 'دستی' && req !== 'خودکار') {
          return bad('حالتِ زمان‌بندی را نشناختم؛ «خودکار» یا «دستی».');
        }
        const mode = (req === 'auto' || req === 'خودکار') ? 'auto' : 'fixed';
        const cap = args && args.capHours != null ? Number(args.capHours) : null;
        const res = ctx.applyTimeMode(mode, cap);
        if (mode === 'auto') {
          const chosen = res && res.autoHours;
          return ok('حالت خودکار روشن شد.' + (chosen ? ' برنامه خودش ' + fa(chosen) + ' ساعت در روز را کافی دید.' : ''), res);
        }
        return ok('حالت دستی روشن شد؛ ساعت‌هایی که خودت داده بودی ملاک است.', res);
      },
    },
    {
      name: 'rebuild_plan',
      title: 'ساخت دوبارهٔ برنامه',
      description: 'کل برنامه را با تنظیمات فعلی از نو می‌سازد.',
      parameters: { type: 'object', properties: {} },
      run(_args, ctx) {
        const res = ctx.rebuild();
        return ok(res && res.message ? res.message : 'برنامه از نو ساخته شد.', res);
      },
    },
    {
      name: 'replan_today',
      title: 'بازچینش امروز',
      description: 'فقط برنامهٔ امروز را از ساعت جاری بازمی‌چیند (کلاس‌ها و روال ثابت جابه‌جا نمی‌شوند).',
      parameters: { type: 'object', properties: {} },
      run(_args, ctx) {
        const res = ctx.replanToday();
        return ok((res && res.message) || 'برنامهٔ امروز از این ساعت بازچیده شد.', res);
      },
    },
    {
      name: 'start_first_task',
      title: 'شروع اولین کار',
      description: 'اولین کار انجام‌نشدهٔ امروز را شروع می‌کند (تایمر را روشن می‌کند).',
      parameters: { type: 'object', properties: {} },
      run(_args, ctx) {
        const res = ctx.startFirstTask();
        return ok((res && res.message) || 'اولین کار امروز شروع شد.', res);
      },
    },
    {
      name: 'add_urgent_item',
      title: 'افزودن کار ضروری',
      description: 'یک کار ضروری (مثلاً «امروز فصل ۴ زیست را بخوانم») به برنامه اضافه می‌کند.',
      parameters: {
        type: 'object',
        properties: {
          subjectId: { type: 'string', description: 'bio | chem | math | phys | geo | adab | arabi | dini | zaban' },
          topic: { type: 'string', description: 'عنوان فصل/موضوع' },
          minutes: { type: 'number', description: 'مدت (پیش‌فرض ۴۵)' },
          time: { type: 'string', description: 'ساعت شروع HH:MM (اختیاری)' },
          scope: { type: 'string', enum: ['today', 'week'] },
        },
        required: ['topic'],
      },
      run(args, ctx) {
        const a = args || {};
        if (!a.topic || !String(a.topic).trim()) return bad('موضوعِ کارِ ضروری مشخص نشد (مثلاً «فصل ۴ زیست»).');
        const res = ctx.addUrgent({
          subjectId: a.subjectId || null,
          topic: String(a.topic || '').slice(0, 120),
          minutes: Math.max(15, Math.min(180, Number(a.minutes) || 45)),
          time: a.time || null,
          scope: a.scope === 'week' ? 'week' : 'today',
        });
        return ok((res && res.message) || 'کار ضروری اضافه و برنامه بازچینی شد.', res);
      },
    },
    {
      name: 'swap_today_time',
      title: 'انتقال تایمِ امروز به کتاب دیگر',
      description: 'وقتی کاربر می‌گوید «این تایم را به فلان کتاب/فصل بده» یا «به جای زیست، شیمی بخوانم»، سهمِ امروزِ کتابِ مبدأ را آزاد می‌کند و همان وقت را به فصلِ خواسته‌شدهٔ کتابِ مقصد می‌دهد. فقط برنامهٔ همان روز عوض می‌شود؛ فصل‌ها حذف نمی‌شوند و فردا سرِ جایشان برمی‌گردند.',
      parameters: {
        type: 'object',
        properties: {
          fromSubjectId: { type: 'string', description: 'کد درسِ مبدأ (bio | chem | math | phys | geo | ...)' },
          fromChapter: { type: 'number', description: 'شمارهٔ فصلِ مبدأ (اختیاری)' },
          toSubjectId: { type: 'string', description: 'کد درسِ مقصد' },
          toChapter: { type: 'number', description: 'شمارهٔ فصلِ مقصد' },
          minutes: { type: 'number', description: 'دقیقه‌ای که باید به مقصد برسد (اگر خالی باشد، کلِ سهمِ امروزِ مبدأ)' },
          date: { type: 'string', description: 'تاریخ میلادی YYYY-MM-DD (پیش‌فرض: امروز)' },
        },
        required: ['fromSubjectId', 'toSubjectId'],
      },
      run(args, ctx) {
        const a = args || {};
        if (!a.fromSubjectId || !a.toSubjectId) return bad('درسِ مبدأ و مقصد مشخص نشد.');
        const res = ctx.applyDayOverride({
          action: 'swap',
          date: a.date || null,
          fromSubjectId: a.fromSubjectId,
          fromChapter: a.fromChapter != null ? Number(a.fromChapter) : null,
          toSubjectId: a.toSubjectId,
          toChapter: a.toChapter != null ? Number(a.toChapter) : null,
          minutes: a.minutes != null ? Number(a.minutes) : null,
        });
        if (!res || !res.ok) return bad((res && res.message) || 'اعمال نشد.');
        return ok(res.message, res);
      },
    },
    {
      name: 'focus_today_chapter',
      title: 'فصلِ حتمیِ امروز',
      description: 'یک فصلِ مشخص را امروز در برنامه می‌گذارد (اگر نخوانده باشد یادگیری، اگر خوانده باشد تست/تمرین همان فصل).',
      parameters: {
        type: 'object',
        properties: {
          subjectId: { type: 'string' },
          chapter: { type: 'number' },
          minutes: { type: 'number' },
          date: { type: 'string', description: 'YYYY-MM-DD (پیش‌فرض امروز)' },
        },
        required: ['subjectId'],
      },
      run(args, ctx) {
        const a = args || {};
        const res = ctx.applyDayOverride({
          action: 'pin',
          date: a.date || null,
          subjectId: a.subjectId,
          chapter: a.chapter != null ? Number(a.chapter) : null,
          minutes: a.minutes != null ? Number(a.minutes) : null,
        });
        if (!res || !res.ok) return bad((res && res.message) || 'اعمال نشد.');
        return ok(res.message, res);
      },
    },
    {
      name: 'skip_today_subject',
      title: 'حذفِ یک درس از امروز',
      description: 'یک درس را فقط برای امروز از برنامه بیرون می‌گذارد (فصل‌هایش حذف نمی‌شوند و فردا برمی‌گردند).',
      parameters: {
        type: 'object',
        properties: {
          subjectId: { type: 'string' },
          date: { type: 'string', description: 'YYYY-MM-DD (پیش‌فرض امروز)' },
        },
        required: ['subjectId'],
      },
      run(args, ctx) {
        const a = args || {};
        const res = ctx.applyDayOverride({ action: 'skip', date: a.date || null, subjectId: a.subjectId });
        if (!res || !res.ok) return bad((res && res.message) || 'اعمال نشد.');
        return ok(res.message, res);
      },
    },
    {
      name: 'undo_today_changes',
      title: 'بازگرداندنِ تغییرهای امروز',
      description: 'همهٔ تغییرهای دستیِ امروز (انتقال تایم، فصلِ حتمی، حذف درس) را برمی‌گرداند و برنامهٔ اصلی را بازسازی می‌کند.',
      parameters: {
        type: 'object',
        properties: { date: { type: 'string', description: 'YYYY-MM-DD (پیش‌فرض امروز)' } },
      },
      run(args, ctx) {
        const res = ctx.clearDayOverrides((args && args.date) || null);
        if (!res || !res.ok) return bad((res && res.message) || 'چیزی برای بازگرداندن نبود.');
        return ok(res.message, res);
      },
    },
    /* ── ۲.۸.۱۵: ابزارهایی که بقیهٔ بخش‌های برنامه را هم در اختیارِ دستیار می‌گذارند ── */
    {
      name: 'rate_chapter',
      title: 'ثبت ارزیابی فصل',
      description: 'وضعیت یک فصل را ثبت می‌کند: خوانده/نخوانده و درصد تسلط. مثال کاربر: «فصل ۳ زیست را خواندم، ۷۰٪» یا «فصل ۲ شیمی را تمام کردم».',
      parameters: {
        type: 'object',
        properties: {
          subjectId: { type: 'string', description: 'code درس (bio | chem | math | phys | geo | adab | arabi | dini | zaban)' },
          chapter: { type: 'number', description: 'شمارهٔ فصل' },
          mastery: { type: 'number', description: 'درصد تسلط ۰..۱۰۰ (اختیاری؛ پیش‌فرض ۸۰)' },
          read: { type: 'boolean', description: 'اگر false باشد فصل «نخوانده» ثبت می‌شود' },
        },
        required: ['subjectId'],
      },
      run(args, ctx) {
        const res = ctx.applyChapterRating({
          subjectId: (args && args.subjectId) || null,
          chapter: args && args.chapter != null ? Number(args.chapter) : 1,
          mastery: args && args.mastery != null ? Number(args.mastery) : null,
          read: args && args.read !== undefined ? Boolean(args.read) : undefined,
        });
        if (!res || !res.ok) return bad((res && res.message) || 'ثبت نشد.');
        return ok(res.message, res);
      },
    },
    {
      name: 'add_exam',
      title: 'افزودن آزمون به تقویم',
      description: 'یک آزمون/آزمونِ آزمایشی در یک تاریخ اضافه می‌کند و برنامه را از نو می‌سازد. مثال: «آزمون ۱۵ آبان اضافه کن».',
      parameters: {
        type: 'object',
        properties: {
          date: { type: 'string', description: 'تاریخ میلادی YYYY-MM-DD' },
          title: { type: 'string' },
          start: { type: 'string', description: 'HH:MM (پیش‌فرض 08:00)' },
          end: { type: 'string', description: 'HH:MM (پیش‌فرض 11:30)' },
          kind: { type: 'string', enum: ['exam', 'mock'] },
          subjectIds: { type: 'array', items: { type: 'string' } },
        },
        required: ['date'],
      },
      run(args, ctx) {
        const res = ctx.applyExam(args || {});
        if (!res || !res.ok) return bad((res && res.message) || 'ثبت نشد.');
        return ok(res.message, res);
      },
    },
    {
      name: 'add_off_day',
      title: 'روز تعطیل / روز سبک',
      description: 'یک تاریخ مشخص را تعطیل کامل یا روزِ سبک می‌کند و برنامه را از نو می‌سازد. مثال: «۱۵ آبان تعطیلم»، «پنجشنبه سبک باشه».',
      parameters: {
        type: 'object',
        properties: {
          date: { type: 'string', description: 'YYYY-MM-DD (اولویت دارد)' },
          weekday: { type: 'string', enum: DAY_KEYS, description: 'اگر تاریخ نبود، نزدیک‌ترین همان روزِ هفته' },
          kind: { type: 'string', enum: ['halt', 'light'], description: 'halt = تعطیل کامل، light = روز سبک' },
          note: { type: 'string' },
        },
      },
      run(args, ctx) {
        const res = ctx.applyOffDay(args || {});
        if (!res || !res.ok) return bad((res && res.message) || 'ثبت نشد.');
        return ok(res.message, res);
      },
    },
    {
      name: 'set_start_time',
      title: 'ساعت شروع مطالعه',
      description: 'ساعتِ شروعِ مطالعه را برای همهٔ روزها یا یک روزِ هفته تنظیم می‌کند. مثال: «از ساعت ۱۶ شروع می‌کنم».',
      parameters: {
        type: 'object',
        properties: {
          time: { type: 'string', description: 'HH:MM' },
          weekday: { type: 'string', enum: DAY_KEYS, description: 'اختیاری' },
        },
        required: ['time'],
      },
      run(args, ctx) {
        const res = ctx.applyStartTime({ time: args && args.time, weekday: (args && args.weekday) || null });
        if (!res || !res.ok) return bad((res && res.message) || 'ثبت نشد.');
        return ok(res.message, res);
      },
    },
    {
      name: 'set_sleep',
      title: 'ساعت خواب و بیداری',
      description: 'ساعت خواب و بیداری را تنظیم می‌کند (برنامه از آن‌ها برای چیدنِ روز استفاده می‌کند).',
      parameters: {
        type: 'object',
        properties: { bedtime: { type: 'string', description: 'HH:MM' }, wake: { type: 'string', description: 'HH:MM' } },
      },
      run(args, ctx) {
        const res = ctx.applySleep({ bedtime: args && args.bedtime, wake: args && args.wake });
        if (!res || !res.ok) return bad((res && res.message) || 'ثبت نشد.');
        return ok(res.message, res);
      },
    },
    {
      name: 'set_break_minutes',
      title: 'استراحت بین بلوک‌ها',
      description: 'مدتِ استراحتِ بین بلوک‌ها را تنظیم می‌کند (پیش‌فرض ۱۰ دقیقه).',
      parameters: { type: 'object', properties: { minutes: { type: 'number' } }, required: ['minutes'] },
      run(args, ctx) {
        const m = Number(args && args.minutes);
        if (!Number.isFinite(m) || m < 0 || m > 60) return bad('استراحت باید بین ۰ تا ۶۰ دقیقه باشد.');
        const res = ctx.applyBreakMinutes(m);
        if (!res || !res.ok) return bad((res && res.message) || 'ثبت نشد.');
        return ok(res.message, res);
      },
    },
    {
      name: 'set_weekly_mock',
      title: 'آزمون جامع هفتگی',
      description: 'آزمون جامعِ هفتگی را روشن یا خاموش می‌کند.',
      parameters: { type: 'object', properties: { enabled: { type: 'boolean' } }, required: ['enabled'] },
      run(args, ctx) {
        if (!args || typeof args.enabled !== 'boolean') return bad('مشخص کن روشن شود یا خاموش (enabled: true/false).');
        const res = ctx.applyWeeklyMock(args.enabled);
        if (!res || !res.ok) return bad((res && res.message) || 'ثبت نشد.');
        return ok(res.message, res);
      },
    },
    {
      name: 'set_student_name',
      title: 'نام دانش‌آموز',
      description: 'نامِ دانش‌آموز را در برنامه ثبت می‌کند.',
      parameters: { type: 'object', properties: { name: { type: 'string' } }, required: ['name'] },
      run(args, ctx) {
        const res = ctx.applyStudentName(args && args.name);
        if (!res || !res.ok) return bad((res && res.message) || 'ثبت نشد.');
        return ok(res.message, res);
      },
    },
    {
      name: 'start_block',
      title: 'شروع یک کارِ مشخص',
      description: 'تایمرِ یک بلوکِ مشخص امروز را روشن می‌کند (با کدِ درس یا شمارهٔ بلوک). مثال: «با شیمی شروع کن».',
      parameters: {
        type: 'object',
        properties: { subjectId: { type: 'string' }, index: { type: 'number' } },
      },
      run(args, ctx) {
        const res = ctx.startBlock({ subjectId: (args && args.subjectId) || null, index: args && args.index != null ? Number(args.index) : null });
        if (!res || !res.ok) return bad((res && res.message) || 'شروع نشد.');
        return ok(res.message, res);
      },
    },
    {
      name: 'finish_block',
      title: 'انجام‌شدن یک کار',
      description: 'یک بلوکِ امروز را «انجام شد» علامت می‌زند. مثال: «زیست را زدم».',
      parameters: {
        type: 'object',
        properties: { subjectId: { type: 'string' }, index: { type: 'number' } },
      },
      run(args, ctx) {
        const res = ctx.finishBlock({ subjectId: (args && args.subjectId) || null, index: args && args.index != null ? Number(args.index) : null });
        if (!res || !res.ok) return bad((res && res.message) || 'ثبت نشد.');
        return ok(res.message, res);
      },
    },
    {
      name: 'close_day',
      title: 'بستنِ روز',
      description: 'روز را می‌بندد و کارهای جامانده را با اولویت به روزهای بعد منتقل می‌کند.',
      parameters: { type: 'object', properties: {} },
      run(_args, ctx) {
        const res = ctx.closeDay();
        if (!res || !res.ok) return bad((res && res.message) || 'بسته نشد.');
        return ok(res.message, res);
      },
    },
    {
      name: 'get_plan',
      title: 'خواندن برنامه',
      description: 'برنامهٔ امروز/فردا/هفته را با بلوک‌ها، ساعت‌ها و فصل‌ها برمی‌گرداند.',
      parameters: {
        type: 'object',
        properties: { scope: { type: 'string', enum: ['today', 'tomorrow', 'tomorrow_plus', 'week'] } },
      },
      run(args, ctx) {
        const scope = (args && args.scope) || 'today';
        const data = ctx.readPlan(scope);
        if (!data) return bad('هنوز برنامه‌ای ساخته نشده است.');
        const head = scope === 'week' ? 'برنامهٔ هفته' : (scope === 'tomorrow' ? 'برنامهٔ فردا' : 'برنامهٔ امروز');
        return ok(head + ': ' + fa(data.count) + ' بلوک' + (data.date ? ' در ' + data.date : ''), data);
      },
    },
    {
      name: 'get_report',
      title: 'گزارش آمادگی',
      description: 'آمادگی کنکور/نهایی، پوشش فصل‌ها، ساعت کل و هشدارها را برمی‌گرداند.',
      parameters: { type: 'object', properties: {} },
      run(_args, ctx) {
        const data = ctx.readReport();
        if (!data) return bad('هنوز برنامه‌ای ساخته نشده است.');
        return ok('گزارش: پوشش ' + fa(data.coverage) + '٪ · کنکور ' + fa(data.konkurProjected) + '٪ · نهایی ' +
          fa(data.finalsProjected) + '٪ · ' + fa(Math.round(data.hours)) + ' ساعت', data);
      },
    },
    {
      name: 'top_chapters',
      title: 'مهم‌ترین فصل‌ها',
      description: 'فصل‌های با اهمیت بالا (بر پایهٔ بودجه‌بندی کنکور و ضریب درس) را برمی‌گرداند.',
      parameters: {
        type: 'object',
        properties: {
          subjectId: { type: 'string' },
          limit: { type: 'number' },
          weakest: { type: 'boolean', description: 'به‌جای مهم‌ترین، ضعیف‌ترین‌ها' },
        },
      },
      run(args, ctx) {
        const data = ctx.readChapters({
          subjectId: (args && args.subjectId) || null,
          limit: Math.max(1, Math.min(20, Number(args && args.limit) || 6)),
          weakest: Boolean(args && args.weakest),
        });
        if (!data) return bad('اطلاعات فصل‌ها در دسترس نیست.');
        return ok((args && args.weakest ? 'ضعیف‌ترین' : 'مهم‌ترین') + ' فصل‌ها: ' +
          data.items.map((c) => c.subjectName + ' · ' + c.label).join(' | '), data);
      },
    },
  ];

  const byName = {};
  TOOLS.forEach((t) => { byName[t.name] = t; });

  /** فهرست ابزارها به قالب OpenAI function-calling */
  function forLLM() {
    return TOOLS.map((t) => ({
      type: 'function',
      function: { name: t.name, description: t.description, parameters: t.parameters },
    }));
  }

  /** اجرای یک ابزار با خطای مهارشده */
  function run(name, args, ctx) {
    const tool = byName[name];
    if (!tool) return bad('ابزار «' + name + '» وجود ندارد.');
    try {
      const out = tool.run(args || {}, ctx || {});
      return out || bad('ابزار پاسخ نداد.');
    } catch (err) {
      return bad('اجرای «' + tool.title + '» ناموفق بود: ' + (err && err.message ? err.message : 'خطای نامشخص'));
    }
  }

  /** متنِ کمکی برای کاربر: چه کارهایی می‌توانم بکنم */
  function helpText() {
    return [
      'می‌توانم این کارها را واقعاً در برنامه‌ات انجام دهم:',
      '• ساعت مطالعه را زیاد/کم کنم («روزهای عادی ۵ ساعت»)',
      '• روز استراحت را عوض کنم («جمعه استراحت»)',
      '• اندازهٔ بلوک‌ها را تغییر دهم («بلوک‌ها ۳۰ دقیقه»)',
      '• تاریخ کنکور را عوض کنم',
      '• امروز را از این ساعت بازبچینم یا اولین کار را شروع کنم',
      '• یک کار ضروری اضافه کنم («امروز فصل ۴ زیست»)',
      '• تایمِ امروز را به کتاب دیگری بدهم («به جای زیست، شیمی فصل ۲»)',
      '• یک فصلِ مشخص را حتمیِ امروز کنم یا یک درس را امروز کنار بگذارم',
      '• تغییرهای امروز را برگردانم',
      '• ارزیابی یک فصل را ثبت کنم («فصل ۳ زیست را خواندم ۷۰٪»)',
      '• آزمون یا روزِ تعطیل به تقویم اضافه کنم و ساعتِ شروع/خواب/استراحت را عوض کنم',
      '• یک کارِ مشخص را شروع یا «انجام شد» کنم و روز را ببندم',
      '• بگویم مهم‌ترین فصل‌ها یا ضعیف‌ترین‌ها کدام‌اند',
      '• گزارش آمادگی و پوشش بدهم',
      'و دربارهٔ روش مطالعه، استرس، خستگی و برنامه‌ریزی حرف بزنم.',
    ].join('\n');
  }

  return { TOOLS, byName, forLLM, run, helpText, DAY_FA, DAY_KEYS, fa };
}));
