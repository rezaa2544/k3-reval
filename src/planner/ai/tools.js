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
        const mode = args && args.mode === 'auto' ? 'auto' : 'fixed';
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
        return ok('', data);
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
        return ok('', data);
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
        return ok('', data);
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
      '• بگویم مهم‌ترین فصل‌ها یا ضعیف‌ترین‌ها کدام‌اند',
      '• گزارش آمادگی و پوشش بدهم',
      'و دربارهٔ روش مطالعه، استرس، خستگی و برنامه‌ریزی حرف بزنم.',
    ].join('\n');
  }

  return { TOOLS, byName, forLLM, run, helpText, DAY_FA, DAY_KEYS, fa };
}));
