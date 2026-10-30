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

  /* ─────────── «تغییرِ واقعیِ روز» ───────────
     این بخش قلبِ دستیارِ اجرایی است: حرفِ کاربر را به یک تغییرِ واقعی در برنامه
     تبدیل می‌کند و بعد «قبل/بعد» را نشان می‌دهد تا معلوم باشد واقعاً اعمال شده. */

  const SUBJECT_FA = {
    bio: 'زیست‌شناسی', chem: 'شیمی', math: 'ریاضی', phys: 'فیزیک', geo: 'زمین‌شناسی',
    adab: 'ادبیات', arabi: 'عربی', dini: 'دین و زندگی', zaban: 'زبان انگلیسی',
    hoviat: 'هویت اجتماعی', salamat: 'سلامت و بهداشت',
  };

  function subjectLabel(id, blocks) {
    const hit = (blocks || []).find((b) => b.subjectId === id);
    return (hit && hit.subjectName) || SUBJECT_FA[id] || id || '';
  }

  const blockKey = (b) => [b.start, b.end, b.subjectId, b.topic || '', b.kind].join('|');

  function dayDiff(before, after) {
    const beforeKeys = {};
    (before && before.blocks ? before.blocks : []).forEach((b) => { beforeKeys[blockKey(b)] = true; });
    const afterKeys = {};
    (after && after.blocks ? after.blocks : []).forEach((b) => { afterKeys[blockKey(b)] = true; });
    const added = (after && after.blocks ? after.blocks : []).filter((b) => !beforeKeys[blockKey(b)]);
    const removed = (before && before.blocks ? before.blocks : []).filter((b) => !afterKeys[blockKey(b)]);
    return {
      added,
      removed,
      lines: (after && after.blocks ? after.blocks : []).map((b) => (beforeKeys[blockKey(b)] ? '· ' : '🆕 ') +
        fa(b.start) + '–' + fa(b.end) + ' · ' + (b.kindLabel || b.kind) +
        (b.topic ? ' · ' + b.topic : '') + ' (' + minutesText(b.minutes) + ')'),
    };
  }

  function blockLine(b) {
    return fa(b.start) + '–' + fa(b.end) + ' · ' + (b.kindLabel || b.kind) +
      (b.topic ? ' · ' + b.topic : '') + ' (' + minutesText(b.minutes) + ')';
  }

  /** دقیقه‌های امروزِ یک درس (یادگیری/تمرین/مرور) */
  function minutesOfSubject(plan, subjectId) {
    return ((plan && plan.blocks) || [])
      .filter((b) => b.subjectId === subjectId && ['exam', 'mock'].indexOf(b.kind) === -1)
      .reduce((a, b) => a + (b.minutes || 0), 0);
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

    /* ۱.۴) کارهایی که «تغییرِ روز» نیستند، ولی باید واقعاً اجرا شوند:
       ثبتِ ارزیابیِ فصل، «انجام شد»، نامِ دانش‌آموز، بازساختِ کلِ برنامه، برگردان. */
    {
      /* ۱.۴.۰) برگرداندنِ تغییرهای امروز (هر جمله‌ای که همین را بخواهد) */
      if (/(برگردان|برگردون|بازگردان|لغو تغییر|همون قبلی|به حالت قبل)/.test(text) && ctx.clearDayOverrides) {
        const res = call('undo_today_changes', {});
        const after = ctx.readPlan ? ctx.readPlan('today') : null;
        return {
          text: res.ok
            ? 'برگشت داده شد ✅\n\nبرنامهٔ امروز دوباره همان حالتِ قبل است:' + (after ? '\n' + after.blocks.map((b) => '· ' + blockLine(b)).join('\n') : '')
            : (res.message || 'چیزی برای بازگرداندن نبود.'),
          actions, chips: ['برنامهٔ امروز'], intent: 'undo_today',
        };
      }

      /* ۱.۴.۱) ثبتِ ارزیابیِ فصل: «فصل ۳ زیست رو خوندم ۷۰٪» / «فصل ۲ شیمی را تمام کردم» */
      const rateAsk = /(خوندم|خواندم|تموم کردم|تمام کردم|بلدم|تسلط|درصد|٪)/.test(text);
      if (rateAsk && ent.subjects.length && !/(چطور|روش|برنامه|چی|چیه|کدوم|پیشنهاد)/.test(text) && ctx.applyChapterRating) {
        const sp1 = NLU.parseSwapPlan ? NLU.parseSwapPlan(raw) : null;
        const ch = (sp1 && sp1.to && sp1.to.chapter != null) ? sp1.to.chapter
          : (sp1 && sp1.from && sp1.from.chapter != null ? sp1.from.chapter
            : ((raw.match(/فصل\s*(\d{1,2})/) || [])[1] || null));
        if (ch == null) {
          return {
            text: 'ثبتش می‌کنم — کدام فصل؟ مثال: «فصل ۳ زیست رو خوندم ۷۰٪».',
            actions, chips: ['فصل ۳ زیست رو خوندم ۷۰٪', 'برنامهٔ امروز'], intent: 'rate_chapter',
          };
        }
        const pct = NLU.parsePercent ? NLU.parsePercent(raw) : null;
        const res = call('rate_chapter', { subjectId: ent.subjects[0], chapter: Number(ch), mastery: pct });
        const r2 = ctx.readReport ? ctx.readReport() : null;
        return {
          text: (res.ok ? res.message : res.message) +
            (res.ok && r2 ? '\n\nآمادگی فعلی: ' + fa(r2.konkurCurrent != null ? r2.konkurCurrent : r2.konkurProjected) + '٪ · پوشش فصل‌ها: ' + fa(r2.coverage) + '٪' : ''),
          actions, chips: ['چقدر آماده‌ام؟', 'برنامهٔ امروز'], intent: 'rate_chapter',
        };
      }

      /* ۱.۴.۲) «این کار را انجام دادم» */
      if (ent.subjects.length && /(زدم|انجام دادم|انجام شد|تموم شد|تمام شد|تیک|چک کردم)/.test(text)
        && !/(برنامه|چی|چیه|چرا)/.test(text) && ctx.finishBlock) {
        const res = call('finish_block', { subjectId: ent.subjects[0] });
        return { text: res.ok ? res.message : res.message, actions, chips: ['روز رو ببند', 'برنامهٔ امروز'], intent: 'finish_block' };
      }

      /* ۱.۴.۳) نامِ دانش‌آموز */
      const nm = raw.match(/(?:اسمم|اسم من|نام من|بچه‌ها به من می‌گن)\s+([\u0600-\u06FF]{2,20})/);
      if (nm && /(اسم|نام)/.test(text) && ctx.applyStudentName) {
        const res = call('set_student_name', { name: nm[1] });
        return { text: res.ok ? res.message : res.message, actions, chips: ['برنامهٔ امروز'], intent: 'set_name' };
      }

      /* ۱.۴.۴) بازساختِ کلِ برنامه */
      if (/(از نو|دوباره|مجدد).*(بساز|بچین|بسازه)|برنامه.*(از نو|دوباره).*(بساز|بچین)/.test(text)
        && !/امروز/.test(text) && ctx.rebuild) {
        const res = call('rebuild_plan', {});
        return { text: res.ok ? res.message : res.message, actions, chips: ['برنامهٔ امروز', 'چقدر آماده‌ام؟'], intent: 'rebuild' };
      }
    }

    /* ۱.۵) تغییرِ واقعیِ امروز: «این تایم را به کتابِ دیگر بده» / «فصلِ X را حذف کن» */
    /* این بلوک عمداً قبل از بقیهٔ نیت‌هاست: کاربر انتظار دارد جمله‌اش «اجرا» شود،
       نه اینکه فهرستِ برنامه برایش خوانده شود. */
    {
      const sp = (NLU.parseSwapPlan ? NLU.parseSwapPlan(raw) : null);
      const looksLikeChange = /(به ?جای|بجای|اختصاص|تخصیص|حذف|جابه ?جا|تبدیل|منتقل|آپدیت|عوض|کنار ?(بذار|بگذار|بنداز)|نخون)/.test(text);
      const undoAsk = /(برگردان|برگردون|بازگردان|لغو|همون قبلی|پشیمون|به حالت قبل|تغییر.*(پاک|حذف))/ .test(text)
        && /(تغییر|امروز|همه|روز)/.test(text);
      if (undoAsk && ctx.clearDayOverrides) {
        const res = call('undo_today_changes', {});
        const after = ctx.readPlan ? ctx.readPlan('today') : null;
        return {
          text: res.ok
            ? 'برگشت داده شد ✅\n\nبرنامهٔ امروز دوباره همان حالتِ قبل است:' + (after ? '\n' + after.blocks.map((b) => '· ' + blockLine(b)).join('\n') : '')
            : (res.message || 'چیزی برای بازگرداندن نبود.'),
          actions, chips: ['برنامهٔ امروز'], intent: 'undo_today',
        };
      }
      const executable = sp && sp.mode && (intent === 'swap_today' || looksLikeChange || (sp.mode === 'focus' && sp.to && sp.to.chapter != null));
      if (executable) {
        const before = ctx.readPlan ? ctx.readPlan('today') : null;
        if (!before) {
          return { text: 'هنوز برنامه‌ای برای امروز نساخته‌ای؛ اول بگو «برنامه بساز» تا بعد این تغییر را در همان اعمال کنم.', actions, chips: ['برنامه بساز'], intent };
        }
        const fromId = sp.from && sp.from.subjectId;
        const toId = sp.to && sp.to.subjectId;
        const fromName = fromId ? subjectLabel(fromId, before.blocks) : '';
        const toName = toId ? subjectLabel(toId, before.blocks) : '';

        if (sp.mode === 'swap' && fromId && toId) {
          const freed = minutesOfSubject(before, fromId) || 45;
          const res = call('swap_today_time', {
            fromSubjectId: fromId, fromChapter: sp.from.chapter,
            toSubjectId: toId, toChapter: sp.to.chapter,
            minutes: freed,
          });
          if (!res.ok) return { text: res.message, actions, chips: ['برنامهٔ امروز'], intent };
          const after = ctx.readPlan ? ctx.readPlan('today') : null;
          const d = dayDiff(before, after);
          const gained = minutesOfSubject(after, toId) - minutesOfSubject(before, toId);
          const lines = ['انجام شد ✅ — برنامهٔ امروز واقعاً عوض شد.', ''];
          lines.push('قبل: ' + minutesText(minutesOfSubject(before, fromId)) + ' ' + fromName + ' · ' + minutesText(minutesOfSubject(before, toId)) + ' ' + toName);
          lines.push('بعد: ' + minutesText(minutesOfSubject(after, fromId)) + ' ' + fromName + ' · ' + minutesText(minutesOfSubject(after, toId)) + ' ' + toName);
          if (gained > 0) lines.push('', '→ ' + minutesText(gained) + ' بیشتر به ' + toName + ' رسید.');
          if (freed === 0) {
            lines.push('', 'نکته: امروز از ' + fromName + ' بلوکی در برنامه نداشتی؛ پس چیزی از دست نرفت — ' +
              'خواستهٔ تو اعمال شد و ' + toName + ' همان فصل را گرفت.');
          }
          if (d.lines.length) lines.push('', 'برنامهٔ امروز بعد از تغییر:', d.lines.join('\n'));
          lines.push('', 'فصل‌های ' + fromName + ' حذف نشدند؛ فقط امروز کنار رفتند و از فردا سرِ جای خودشان برمی‌گردند.');
          if (sp.to.chapter != null) {
            lines.push('اگر می‌خواهی همین فصلِ ' + toName + ' امروز تثبیت هم بشود، بگو «' + toName + ' فصل ' + fa(sp.to.chapter) + ' تست بده».');
          }
          return { text: lines.join('\n'), actions, chips: ['تغییر امروز را برگردان', 'برنامهٔ امروز'], intent };
        }

        if (sp.mode === 'skip' && fromId) {
          const res = call('skip_today_subject', { subjectId: fromId });
          if (!res.ok) return { text: res.message, actions, chips: ['برنامهٔ امروز'], intent };
          const after = ctx.readPlan ? ctx.readPlan('today') : null;
          const d = dayDiff(before, after);
          return {
            text: 'انجام شد ✅ — ' + fromName + ' امروز از برنامه برداشته شد.\n\n' +
              'برنامهٔ امروز حالا:\n' + d.lines.join('\n') +
              '\n\nفصل‌هایش حذف نشدند؛ از فردا سرِ جای خودشان برمی‌گردند.',
            actions, chips: ['تغییر امروز را برگردان', 'برنامهٔ امروز'], intent,
          };
        }

        if (sp.mode === 'focus' && toId) {
          const res = call('focus_today_chapter', {
            subjectId: toId, chapter: sp.to.chapter,
            minutes: null,
          });
          if (!res.ok) return { text: res.message, actions, chips: ['برنامهٔ امروز'], intent };
          const after = ctx.readPlan ? ctx.readPlan('today') : null;
          const d = dayDiff(before, after);
          const chTitle = (d.added[0] && d.added[0].topic) || '';
          return {
            text: 'انجام شد ✅ — ' + toName + (sp.to.chapter != null ? ' فصل ' + fa(sp.to.chapter) : '') +
              (chTitle ? ' («' + chTitle + '»)' : '') + ' در برنامهٔ امروز گذاشته شد.' +
              '\n\nبرنامهٔ امروز:\n' + d.lines.join('\n'),
            actions, chips: ['تغییر امروز را برگردان', 'برنامهٔ امروز'], intent,
          };
        }

        /* اگر مبدأ/مقصد ناقص بود، یک پرسشِ دقیق بپرس (نه پاسخِ روتین) */
        return {
          text: 'برای اینکه همین حالا اعمال کنم، فقط این را بگو: «کدام تایم را به کدام کتاب بدهم؟»\n' +
            'مثال: «به جای زیست، شیمی فصل ۲» — یا اگر فقط می‌خواهی یک فصل امروز باشد: «شیمی فصل ۲ را امروز بگذار».',
          actions, chips: ['به جای زیست، شیمی فصل ۲', 'برنامهٔ امروز'], intent,
        };
      }
    }

    /* ۱.۶) دستورهای ساختاری: هر بخشِ برنامه که کاربر با دست هم می‌تواند عوض کند */
    /* این بلوک عمداً «قاعده‌محور» است و قبل از پاسخ‌های متنی اجرا می‌شود؛ چون اصلِ
       خواستهٔ کاربر این است: «هر چیزی که گفتم در برنامه اعمال شود». */

    /* ۱.۶.۱) آزمون جامعِ هفتگی روشن/خاموش */
    if (/(آزمون|جامع)/.test(text) && /(هفتگی|جامع)/.test(text) && /(خاموش|روشن|غیرفعال|نکن|نمی ?خوام|نمی ?خواهم|فعال|بکن)/.test(text)) {
      const off = /(خاموش|غیرفعال|نکن|نمی ?خوام|نمی ?خواهم)/.test(text);
      const res = call('set_weekly_mock', { enabled: !off });
      return { text: res.ok ? res.message : res.message, actions, chips: ['آزمون هفتگی رو روشن کن', 'برنامهٔ امروز'], intent };
    }

    /* ۱.۶.۲) بستنِ روز */
    if (/(روز|امروز)/.test(text) && /(ببند|بسته|پایان روز|بستن روز|روز تموم|روز تمام)/.test(text)) {
      const before = ctx.readPlan ? ctx.readPlan('today') : null;
      const res = call('close_day', {});
      const after = ctx.readPlan ? ctx.readPlan('today') : null;
      if (res.ok && before && after) {
        const d = dayDiff(before, after);
        return {
          text: res.message + '\n\nبرنامهٔ امروز بعد از بستن:\n' + (d.lines.length ? d.lines.join('\n') : '— امروز خالی شد.'),
          actions, chips: ['برنامهٔ فردا', 'چقدر آماده‌ام؟'], intent,
        };
      }
      return { text: res.message, actions, chips: ['برنامهٔ امروز'], intent };
    }

    /* ۱.۶.۴) آزمون به تقویم اضافه کن */
    if (/(آزمون|امتحان)/.test(text) && /(اضافه|بذار|بگذار|ثبت|بزن|دارم|هست)/.test(text)
      && !/(هفتگی|جامع هفتگی|خاموش|روشن)/.test(text)) {
      let iso = null;
      let spec = null;
      if (NLU.parseJalali) spec = NLU.parseJalali(raw);
      if (spec) iso = ctx.toIsoDate ? ctx.toIsoDate({ jalali: spec }) : null;
      if (!iso) {
        const loose = NLU.parseDateLoose ? NLU.parseDateLoose(raw) : null;
        if (loose) iso = ctx.toIsoDate ? ctx.toIsoDate(loose) : null;
      }
      if (!iso) {
        return {
          text: 'آزمون را اضافه می‌کنم — فقط تاریخش را بگو (مثلاً «آزمون ۱۵ آبان اضافه کن»).',
          actions, chips: ['آزمون ۱۵ آبان اضافه کن', 'برنامهٔ امروز'], intent,
        };
      }
      const clk = ent.clock;
      const res = call('add_exam', {
        date: iso,
        title: /جامع/.test(text) ? 'آزمون جامع' : 'آزمون آزمایشی',
        subjectIds: ent.subjects.slice(),
        start: clk ? (String(clk.h).padStart(2, '0') + ':' + String(clk.m || 0).padStart(2, '0')) : null,
      });
      return { text: res.ok ? res.message : res.message, actions, chips: ['برنامهٔ امروز', 'چقدر آماده‌ام؟'], intent };
    }

    /* ۱.۶.۵) روزِ تعطیل / روزِ سبک */
    if (/(تعطیل|مرخصی|مسافر|سفر|بیمار)/.test(text) && !/استراحت هفتگی/.test(text)
      && /(امروز|فردا|پس ?فردا|\d{1,2}\s*[آ-ی]+|شنبه|یکشنبه|دوشنبه|سه ?شنبه|چهارشنبه|پنجشنبه|جمعه)/.test(text)) {
      const loose = NLU.parseDateLoose ? NLU.parseDateLoose(raw) : null;
      const day = NLU.parseWeekday ? NLU.parseWeekday(raw) : null;
      const spec2 = loose || null;
      const res = call('add_off_day', {
        date: spec2 && (spec2.jalali || spec2.offset != null) ? (ctx.toIsoDate ? ctx.toIsoDate(spec2) : null) : null,
        weekday: (!spec2 && day) ? day.key : null,
        kind: /سبک/.test(text) ? 'light' : 'halt',
      });
      return { text: res.ok ? res.message : res.message, actions, chips: ['برنامهٔ امروز', 'چقدر آماده‌ام؟'], intent };
    }

    /* ۱.۶.۶) ساعت خواب و بیداری */
    if (/(می ?خوابم|خوابم|ساعت خواب|بیدار)/.test(text) && ent.clock) {
      const clk = ent.clock;
      const hm = String(clk.h).padStart(2, '0') + ':' + String(clk.m || 0).padStart(2, '0');
      const isWake = /(بیدار)/.test(text) && !/(می ?خوابم|خوابم)/.test(text);
      const res = call('set_sleep', isWake ? { wake: hm } : { bedtime: hm });
      return { text: res.ok ? res.message : res.message, actions, chips: ['برنامهٔ امروز'], intent };
    }

    /* ۱.۶.۷) استراحتِ بین بلوک‌ها */
    if (/(استراحت|فاصله|تنفس)/.test(text) && /(بلوک|بین)/.test(text)) {
      const n = ent.number != null ? ent.number : null;
      if (n == null) {
        return { text: 'چند دقیقه استراحت بین بلوک‌ها می‌خواهی؟ (مثلاً «استراحت بین بلوک‌ها ۱۵ دقیقه»)', actions, chips: ['استراحت بین بلوک‌ها ۱۵ دقیقه'], intent };
      }
      const res = call('set_break_minutes', { minutes: n });
      return { text: res.ok ? res.message : res.message, actions, chips: ['برنامهٔ امروز'], intent };
    }

    /* ۱.۶.۸) ساعت شروع مطالعه */
    if (/شروع/.test(text) && ent.clock && !/(شروع کن|شروعش|بریم)/.test(text)
      && /(از|ساعت)/.test(text) && !/(کنکور|آزمون)/.test(text)) {
      const clk = ent.clock;
      const hm = String(clk.h).padStart(2, '0') + ':' + String(clk.m || 0).padStart(2, '0');
      const wk = ent.weekday ? ent.weekday.key : null;
      const res = call('set_start_time', { time: hm, weekday: wk });
      return { text: res.ok ? res.message : res.message, actions, chips: ['برنامهٔ امروز'], intent };
    }

    /* ۱.۶.۱۰) «با X شروع کن» — یک کارِ مشخص، نه فقط اولین کار */
    if (ent.subjects.length && /(شروع کن|شروعش کن|بزن بریم|بریم)/.test(text)) {
      const res = call('start_block', { subjectId: ent.subjects[0] });
      return { text: res.ok ? res.message : res.message, actions, chips: ['برنامهٔ امروز'], intent: 'start_block' };
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

    /* ۷) کار ضروری / «امروز این فصل» */
    if ((intent === 'add_emergency' || intent === 'swap_today') && ent.subjects.length && /\d|فصل|درس|بخونم|بذار/.test(text)) {
      const subjectId = ent.subjects[0];
      const chap = text.match(/فصل\s*(\d{1,2})/);
      /* اگر شمارهٔ فصل معلوم است، از مسیرِ «فصلِ حتمی» می‌رویم: آن مسیر نیازِ همان
         فصل را واقعاً مصرف می‌کند و عنوانِ فصل هم در برنامه با نام می‌آید.
         آیتمِ اضطراری برای وقتی است که فصل/موضوعِ مشخصی در کتاب‌ها نیست. */
      if (chap) {
        const before = ctx.readPlan ? ctx.readPlan('today') : null;
        const res = call('focus_today_chapter', { subjectId, chapter: Number(chap[1]) });
        const after = ctx.readPlan ? ctx.readPlan('today') : null;
        if (res.ok) {
          const d = dayDiff(before, after);
          const added = d.added[0];
          return {
            text: 'انجام شد ✅ — «' + subjectLabel(subjectId, before ? before.blocks : []) + ' فصل ' + fa(chap[1]) + '»' +
              (added && added.topic ? ' («' + added.topic + '»)' : '') + ' در برنامهٔ امروز گذاشته شد.' +
              (after ? '\n\nبرنامهٔ امروز:\n' + d.lines.join('\n') : ''),
            actions, chips: ['تغییر امروز را برگردان', 'برنامهٔ امروز'], intent,
          };
        }
        return { text: res.message, actions, chips: ['برنامهٔ امروز'], intent };
      }
      const topic = ent.text.slice(0, 60);
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

    /* ۱۱.۵) تورِ ایمنی: جملهٔ اجراییِ ناشناخته نباید به «راهنما» تبدیل شود */
    /* اگر کاربر درس + فصل گفته و فعلِ خواستن دارد، حداقل کاری که می‌توانیم بکنیم
       این است که همان فصل را امروز در برنامه بگذاریم — نه اینکه فهرستِ راهنما بدهیم. */
    {
      const wantsSomething = /(بذار|بگذار|بخونم|بخوانم|میخوام|می‌خوام|لازم دارم|باید|اضافه|کن)/.test(text);
      const chap = text.match(/فصل\s*(\d{1,2})/);
      if (wantsSomething && chap && ent.subjects.length) {
        const before = ctx.readPlan ? ctx.readPlan('today') : null;
        if (before) {
          const res = call('focus_today_chapter', { subjectId: ent.subjects[0], chapter: Number(chap[1]) });
          if (res.ok) {
            const after = ctx.readPlan ? ctx.readPlan('today') : null;
            const d = dayDiff(before, after);
            return {
              text: 'انجام شد ✅ — «' + subjectLabel(ent.subjects[0], before.blocks) + ' فصل ' + fa(chap[1]) +
                '» در برنامهٔ امروز گذاشته شد.\n\nبرنامهٔ امروز:\n' + d.lines.join('\n'),
              actions, chips: ['تغییر امروز را برگردان', 'برنامهٔ امروز'], intent,
            };
          }
        }
      }
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
