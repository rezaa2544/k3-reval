/**
 * Reval AI — مغزِ آفلاین (بدون نیاز به کلید API)
 * ------------------------------------------------------------------
 * این موتور سه کار می‌کند:
 *   ۱) نیت کاربر را می‌فهمد (nlu)
 *   ۲) اگر کاری خواسته، با ابزارها همان کار را واقعاً انجام می‌دهد (tools)
 *   ۳) اگر پرسشی/دردی است، با دانشِ مشاور پاسخ می‌دهد (knowledge)
 *
 * خروجی: { text, actions[], chips[] }
 * وقتی کلید API هوش مصنوعی تنظیم شده باشد، llm.js این مغز را «دستیارِ اجرایی»
 * خودش می‌کند: مدلِ زبانی حرف می‌زند و همین ابزارها را صدا می‌زند.
 */
(function (root, factory) {
  const api = factory(
    typeof require === 'function' ? require('./nlu.js') : root.RevalAINLU,
    typeof require === 'function' ? require('./knowledge.js') : root.RevalAIKnowledge,
    typeof require === 'function' ? require('./tools.js') : root.RevalAITools,
  );
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.RevalAIBrain = api;
}(typeof window !== 'undefined' ? window : globalThis, function (NLU, KB, TOOLS) {
  'use strict';

  const NUM = '۰۱۲۳۴۵۶۷۸۹';
  const fa = (s) => String(s == null ? '' : s).replace(/\d/g, (d) => NUM[+d]);
  const DAY_FA = (TOOLS && TOOLS.DAY_FA) || {};

  const CHIPS_DEFAULT = ['برنامهٔ امروز', 'چقدر آماده‌ام؟', 'ساعت مطالعه‌ام را زیاد کن', 'از کجا شروع کنم؟'];

  function minutesText(m) {
    const n = Math.max(0, Math.round(Number(m) || 0));
    const h = Math.floor(n / 60);
    const r = n % 60;
    if (!h) return fa(r) + ' دقیقه';
    if (!r) return fa(h) + ' ساعت';
    return fa(h) + ' ساعت و ' + fa(r) + ' دقیقه';
  }

  function listBlocks(blocks, limit) {
    const arr = (blocks || []).filter((b) => b && b.kind !== 'routine').slice(0, limit || 8);
    if (!arr.length) return '—';
    return arr.map((b) => '• ' + fa(b.start) + '–' + fa(b.end) + ' · ' + (b.kindLabel || b.kind) +
      (b.topic ? ' · ' + b.topic : '') + ' (' + minutesText(b.minutes) + ')').join('\n');
  }

  /* ─────────── پاسخ‌های تخصصی ─────────── */

  function planAnswer(ctx, scope) {
    const d = ctx.readPlan(scope || 'today');
    if (!d) return 'هنوز برنامه‌ای نساخته‌ای. بگو «برنامه بساز» یا از دکمهٔ «ساخت برنامه» استفاده کن.';
    const head = scope === 'week'
      ? 'برنامهٔ این هفته:'
      : (scope === 'tomorrow' ? 'برنامهٔ فردا (' + fa(d.label || '') + '):' : 'برنامهٔ امروز (' + fa(d.label || '') + '):');
    const total = d.totalMinutes ? '\nجمع: ' + minutesText(d.totalMinutes) + ' · ' + fa(d.count) + ' بلوک' : '';
    return head + '\n' + listBlocks(d.blocks, 10) + total;
  }

  function reportAnswer(ctx) {
    const r = ctx.readReport();
    if (!r) return 'برای گزارش، اول یک برنامه بساز.';
    const lines = [
      'وضعیت فعلی:',
      '• پوشش فصل‌ها: ' + fa(r.coverage) + '٪ (' + fa(r.covered) + ' از ' + fa(r.total) + ' فصل)',
      '• آمادگی کنکور (برآورد پایان برنامه): ' + fa(r.konkurProjected) + '٪' + (r.konkurCurrent != null ? ' — الان ' + fa(r.konkurCurrent) + '٪' : ''),
      '• آمادگی امتحانات نهایی: ' + fa(r.finalsProjected) + '٪' + (r.finalsCurrent != null ? ' — الان ' + fa(r.finalsCurrent) + '٪' : ''),
      '• ساعت کل برنامه: ' + fa(Math.round(r.hours)) + ' ساعت تا ' + fa(r.examDateFa || ''),
    ];
    if (r.weak) lines.push('• ضعیف‌ترین فصل‌ها: ' + r.weak);
    if (r.warnings && r.warnings.length) {
      lines.push('', 'هشدارها:');
      r.warnings.slice(0, 3).forEach((w) => lines.push('• ' + w));
    }
    if (r.coverage < 90) {
      lines.push('', 'پوشش زیر ۹۰٪ است. راه‌حل عملی: روزی ۳۰ دقیقه به ساعت مطالعه اضافه کن یا یک روز استراحت را نیمه‌فعال کن — بگو «ساعت مطالعه‌ام را زیاد کن» تا خودم انجام دهم.');
    }
    return lines.join('\n');
  }

  function importanceAnswer(ctx, subjectId) {
    const data = ctx.readChapters({ subjectId, limit: 6, weakest: false });
    if (!data || !data.items || !data.items.length) return 'اطلاعات فصل‌ها در دسترس نیست.';
    const lines = ['مهم‌ترین فصل‌ها بر پایهٔ بودجه‌بندی واقعی کنکور (تعداد سؤال × بارم × سختی):'];
    data.items.forEach((c) => {
      lines.push('• ' + c.subjectName + ' — ' + c.label + ' · ' + fa(c.share) + '٪ از کتاب · رتبهٔ ' +
        fa(c.rank) + ' از ' + fa(c.total) + ' · اهمیت ' + fa(c.importance) + ' از ۵');
    });
    lines.push('', 'قاعده: فصل‌های رتبهٔ ۱ تا ۳ هر درس را «کامل و عمیق»، بقیه را «کامل ولی سطحی‌تر» بخوان.');
    return lines.join('\n');
  }

  function methodAnswer(text, ent) {
    const ms = KB.methodsFor(text);
    const faq = KB.faqFor(text);
    const parts = [];
    if (faq) parts.push(faq.a);
    if (ms.length) {
      ms.slice(0, 2).forEach((m) => parts.push('**' + m.name + '** — ' + m.idea + '\nپشتوانه: ' + m.evidence));
    }
    if (ent.subjects.length) {
      const sid = ent.subjects[0];
      const st = KB.strategyFor(sid);
      parts.push('راهبرد اختصاصی این درس:\n' + st.map((x) => '• ' + x).join('\n'));
    }
    if (!parts.length) {
      parts.push('سه ستون مطالعهٔ مؤثر: ۱) یادگیری فعال با نت‌برداری پرسشی، ۲) تست زمان‌دار و تحلیل خطا، ۳) مرور فاصله‌دار (۱-۳-۷-۱۶-۳۵ روز).');
      parts.push('بگو کدام درس را می‌خواهی، تا راهبرد همان درس را دقیق بدهم.');
    }
    return parts.join('\n\n');
  }

  function emotionalAnswer(intent) {
    const pool = KB.COACHING[intent] || KB.COACHING.motivated || [];
    const text = (pool && pool.length) ? pool.join(' ') : '';
    const extra = {
      tired: 'می‌خواهی امروز را سبک‌تر بچینم؟ بگو «امروز را سبک کن».',
      anxious: 'اگر بخواهی، می‌توانم بار امروز را کم کنم تا از «حالت گیر» بیرون بیایی.',
      unmotivated: 'بگو «شروع کن» تا اولین بلوک را برایت روشن کنم؛ فقط ۱۰ دقیقه.',
      missed: 'بگو «امروز را از نو بچین» تا کارهای جامانده را با اولویت بازتوزیع کنم.',
      behind: 'بگو «ساعت مطالعه‌ام را زیاد کن» یا «فصل‌های کم‌ضریب را عقب بینداز».',
    };
    return [text, extra[intent] || ''].filter(Boolean).join('\n\n');
  }

  /* ─────────── مسیریابی ─────────── */

  /**
   * @param {string} message
   * @param {object} ctx  { readPlan, readReport, readChapters, applyAvailability, ... , applyTool }
   * @returns {{text:string, actions:Array, chips:string[], intent:string}}
   */
  function respond(message, ctx) {
    const raw = String(message == null ? '' : message);
    const text = NLU.norm(raw);
    const ent = NLU.entities(raw);
    const ranked = NLU.intents(raw);
    const intent = ranked.length ? ranked[0].id : 'unknown';
    const actions = [];
    const chips = [];

    const call = (name, args) => {
      const res = (ctx.applyTool ? ctx.applyTool(name, args) : TOOLS.run(name, args, ctx));
      actions.push({ name, args, result: res });
      return res;
    };

    /* ۱) احوال‌پرسی */
    if (intent === 'greet' && text.length < 40) {
      const r = ctx.readReport();
      const who = (ctx.studentName && ctx.studentName !== 'دانش‌آموز') ? ' ' + ctx.studentName : '';
      let t = 'سلام' + who + ' 👋 من مشاور هوشمندِ روالت هستم — هم حرف می‌زنم، هم واقعاً برنامه‌ات را عوض می‌کنم.';
      if (r) {
        t += '\n\nالان: پوشش ' + fa(r.coverage) + '٪ · ' + fa(Math.round(r.hours)) + ' ساعت تا کنکور · ' +
          fa(r.daysLeft) + ' روز مانده.';
        t += '\nچه کاری برایت بکنم؟';
      } else {
        t += '\nهنوز برنامه‌ای نساخته‌ای — بگو «برنامه بساز» تا شروع کنیم.';
      }
      return { text: t, actions, chips: CHIPS_DEFAULT, intent };
    }

    /* ۲) ساعت مطالعه */
    if (intent === 'set_hours') {
      /* «چند ساعت بخونم؟» یک پرسش است، نه دستورِ تغییر */
      const isQuestion = /(چند\s*ساعت|چقدر\s*ساعت)/.test(text) && !/\d/.test(text);
      if (isQuestion) {
        const f = KB.faqFor('چند ساعت در روز بخونم') || null;
        return {
          text: (f ? f.a : '۸–۹ ساعت مؤثر برای پشت‌کنکوری و ۴–۵ ساعت برای دانش‌آموز مدرسه‌ای.') +
            '\n\nاگر بخواهی، بگو «روزهای عادی ۵ ساعت» تا همین حالا تنظیمش کنم.',
          actions, chips: ['روزهای عادی ۵ ساعت', 'روزهای عادی ۷ ساعت'], intent,
        };
      }
      const cfg = ctx.readConfig ? ctx.readConfig() : null;
      const current = cfg && cfg.avgDailyHours ? Number(cfg.avgDailyHours) : null;
      const wantsMore = /(بیشتر|زیاد|افزایش|بالا|برسان)/.test(text);
      const wantsLess = /(کمتر|کاهش|پایین|کم کن)/.test(text);
      const n = ent.number;
      let hours = n;
      if (hours == null && current != null) {
        if (wantsMore) hours = Math.round((current + 1) * 2) / 2;
        else if (wantsLess) hours = Math.round((current - 1) * 2) / 2;
      }
      if (hours == null) {
        return {
          text: 'ساعت مطالعه را چند ساعت بگذارم؟ مثلاً بگو «روزهای عادی ۵ ساعت».' +
            (current != null ? ' الان میانگین ' + fa(current) + ' ساعت در روز است.' : ''),
          actions, chips: ['۴ ساعت در روز', '۶ ساعت در روز', 'حالت خودکار'], intent,
        };
      }
      if (hours > 12) {
        return { text: 'بیش از ۱۲ ساعت در روز واقع‌بینانه نیست؛ بازدهی بعد از حدود ۹–۱۰ ساعت مؤثر به‌شدت افت می‌کند. عددی تا ۱۲ بگو تا بچینم.', actions, chips: [], intent };
      }
      hours = Math.max(1, Math.min(12, hours));
      const res = call('set_daily_study_hours', { hours, weekendHours: Math.min(12, hours + 1) });
      if (!res.ok) return { text: res.message, actions, chips: [], intent };
      const after = ctx.readReport ? ctx.readReport() : null;
      let t = 'انجام شد: ' + fa(hours) + ' ساعت برای روزهای عادی و ' + fa(Math.min(12, hours + 1)) + ' ساعت برای پنجشنبه/جمعه.';
      if (after) {
        t += '\n\nبعد از بازسازی: پوشش ' + fa(after.coverage) + '٪ · ' + fa(Math.round(after.hours)) + ' ساعت کل.';
        if (after.coverage < 90) {
          t += '\nهنوز پوشش کامل نشده؛ چون «مؤثر» حدود ۷۰٪ ساعت اعلامی است، برای رسیدن به ۱۰۰٪ ساعت بیشتری لازم است.';
        } else {
          t += '\nبا این ساعت‌ها به پوشش کامل می‌رسی.';
        }
      }
      return { text: t, actions, chips: ['برنامهٔ امروز', 'چقدر آماده‌ام؟'], intent };
    }

    /* ۳) روز استراحت */
    if (intent === 'set_rest' && ent.weekday) {
      const res = call('set_rest_day', { weekday: ent.weekday.key });
      const after = ctx.readReport ? ctx.readReport() : null;
      return {
        text: res.ok
          ? 'روز استراحت شد ' + DAY_FA[ent.weekday.key] + '.' + (after ? '\nپوشش فعلی: ' + fa(after.coverage) + '٪.' : '') +
            '\nنکته: استراحتِ کامل هفتگی یکی از عواملِ اصلی جلوگیری از فرسودگی است؛ حذفش نکن.'
          : res.message,
        actions, chips: ['برنامهٔ امروز'], intent,
      };
    }

    /* ۴) اندازهٔ بلوک */
    if (intent === 'set_block') {
      const m = ent.number;
      if (!m) return { text: 'بلوک‌ها را چند دقیقه بگذارم؟ (پیشنهاد: ۴۵ دقیقه)', actions, chips: ['۴۵ دقیقه', '۳۰ دقیقه', '۶۰ دقیقه'], intent };
      const res = call('set_block_minutes', { minutes: m });
      return { text: res.message, actions, chips: ['برنامهٔ امروز'], intent };
    }

    /* ۵) تاریخ کنکور */
    if (intent === 'set_exam_date') {
      if (!ent.date) return { text: 'تاریخ جدید کنکور را بگو؛ مثلاً «کنکور ۱۴۰۶/۰۴/۱۰».', actions, chips: [], intent };
      const j = ent.date;
      const jalali = j.y + '/' + String(j.m).padStart(2, '0') + '/' + String(j.d).padStart(2, '0');
      const res = call('set_exam_date', { jalali });
      return { text: res.ok ? (res.message || 'تاریخ کنکور تنظیم شد و برنامه بازسازی شد.') : res.message, actions, chips: ['چقدر آماده‌ام؟'], intent };
    }

    /* ۶) بازچینش امروز / شروع */
    if (intent === 'replan_today') {
      const res = call('replan_today', {});
      return { text: (res.ok ? (res.message || 'برنامهٔ امروز بازچیده شد.') : res.message) + '\nکلاس‌ها، وعده‌ها و آزمون‌ها سر جای خودشان ماندند.', actions, chips: ['برنامهٔ امروز', 'کار بعدی چیه؟'], intent };
    }
    if (intent === 'start_task') {
      const res = call('start_first_task', {});
      return { text: res.ok ? (res.message || 'شروع شد؛ تایمر روشن است.') : res.message, actions, chips: [], intent };
    }

    /* ۷) کار ضروری */
    if (intent === 'add_emergency' && ent.subjects.length && /\d|فصل|درس|بخونم/.test(text)) {
      const subjectId = ent.subjects[0];
      const chap = text.match(/فصل\s*(\d{1,2})/);
      const topic = chap ? ('فصل ' + chap[1]) : (ent.text.slice(0, 60));
      const res = call('add_urgent_item', { subjectId, topic, minutes: ent.number && ent.number <= 180 ? ent.number : 45 });
      return { text: res.ok ? (res.message || 'کار ضروری اضافه شد.') : res.message, actions, chips: ['برنامهٔ امروز'], intent };
    }

    /* ۸) گزارش / پرسش برنامه */
    if (intent === 'ask_report') {
      return { text: reportAnswer(ctx), actions, chips: ['برنامهٔ امروز', 'ضعیف‌ترین فصل‌هام کدامه؟'], intent };
    }
    if (intent === 'ask_plan') {
      const scope = /فردا/.test(text) ? 'tomorrow' : (/هفته/.test(text) ? 'week' : 'today');
      return { text: planAnswer(ctx, scope), actions, chips: [], intent };
    }
    if (intent === 'ask_importance') {
      return { text: importanceAnswer(ctx, ent.subjects[0] || null), actions, chips: ['برنامهٔ امروز'], intent };
    }

    /* ۹) تست بیشتر/کمتر */
    if (intent === 'more_tests' || intent === 'less_tests') {
      const r = ctx.readReport ? ctx.readReport() : null;
      const advice = intent === 'more_tests'
        ? 'تست بیشتر فقط با تحلیل خطا ارزش دارد: هر بلوک تست را با «دفتر اشتباهات» ببند.'
        : 'تست کمتر از ۳۰ تست در روز برای پشت‌کنکوری کم است؛ به‌جایش تست را زمان‌دار بزن و تحلیل را دقیق‌تر کن.';
      return {
        text: advice + (r ? '\n\nالان هدف تست روزانهٔ برنامه‌ات بر پایهٔ ظرفیت استاندارد تنظیم شده و در گزارش قابل دیدن است.' : ''),
        actions, chips: ['چقدر آماده‌ام؟'], intent,
      };
    }

    /* ۱۰) احساسات و انگیزه */
    if (['tired', 'anxious', 'unmotivated', 'missed'].indexOf(intent) !== -1) {
      const r = ctx.readReport ? ctx.readReport() : null;
      let t = emotionalAnswer(intent);
      if (r && intent !== 'missed') {
        t += '\n\nیادت باشد الان پوشش ' + fa(r.coverage) + '٪ و ' + fa(r.daysLeft) + ' روز وقت داری؛ عقب نیستی.';
      }
      return { text: t, actions, chips: intent === 'missed' ? ['امروز را از نو بچین', 'برنامهٔ امروز'] : ['برنامهٔ امروز', 'امروز را سبک کن'], intent };
    }

    /* ۱۱) روش مطالعه */
    if (intent === 'ask_method') {
      return { text: methodAnswer(text, ent), actions, chips: ['از کجا شروع کنم؟', 'برنامهٔ امروز'], intent };
    }

    /* ۱۲) کمک */
    if (intent === 'help' || intent === 'unknown') {
      const tip = KB.methodsFor(text);
      let extra = '';
      if (tip.length) extra = '\n\n(شاید منظورت این بود: ' + tip[0].name + ' — ' + tip[0].idea + ')';
      return { text: TOOLS.helpText() + extra, actions, chips: CHIPS_DEFAULT, intent: 'help' };
    }

    return { text: TOOLS.helpText(), actions, chips: CHIPS_DEFAULT, intent };
  }

  /**
   * پیشنهادهای آغازین بر اساس وضعیت برنامه
   */
  function opening(ctx) {
    const r = ctx && ctx.readReport ? ctx.readReport() : null;
    if (!r) {
      return {
        text: 'سلام 👋 من مشاور هوشمند روالم. هنوز برنامه‌ای نساخته‌ای.\nبگو «برنامه بساز» یا اطلاعاتت را بگو (پایه، رشته، ساعت مطالعه) تا همین حالا بچینم.',
        chips: ['برنامه بساز', 'روزهای عادی ۴ ساعت', 'از کجا شروع کنم؟'],
      };
    }
    const lines = ['سلام 👋 برنامه‌ات را دیدم:'];
    lines.push('• پوشش ' + fa(r.coverage) + '٪ · ' + fa(r.daysLeft) + ' روز تا کنکور');
    if (r.todayCount) {
      lines.push('• امروز ' + fa(r.todayCount) + ' بلوک و ' + minutesText(r.todayMinutes) +
        (r.nextBlock ? ' — بعدی: ' + fa(r.nextBlock.start) + ' ' + r.nextBlock.title : ''));
    }
    if (r.coverage < 90) lines.push('\nپوشش کامل نیست؛ با کمی ساعت بیشتر جبران می‌شود. بگو «ساعت مطالعه‌ام را زیاد کن».');
    return { text: lines.join('\n'), chips: CHIPS_DEFAULT };
  }

  return { respond, opening, planAnswer, reportAnswer, importanceAnswer, methodAnswer, minutesText, listBlocks };
}));
