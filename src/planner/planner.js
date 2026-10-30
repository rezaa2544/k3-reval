/* رابط کاربری مشاور هوشمند روال */
(function () {
  'use strict';

  const engine = window.RevalPlanner;
  const presets = window.RevalPresets;
  const dayplan = window.RevalDayPlan || null;      // تایمر/توقف/ادامه + شروع روز
  const cw = window.RevalChapterWeights || null;    // اهمیت واقعی فصل‌ها
  const J = window.RevalJalali;   // تقویم شمسی
  const api = window.revalPlanner || null;

  const WEEKDAY_FA = engine.WEEKDAY_FA;
  const WEEKDAY_KEY = engine.WEEKDAY_KEY;
  const KIND_CLASS = {
    learn: 'b-learn', review: 'b-review', practice: 'b-practice',
    mock: 'b-mock', analysis: 'b-analysis', warmup: 'b-warmup',
    reteach: 'b-reteach', boost: 'b-boost', cumreview: 'b-cum', classfix: 'b-classfix',
    finalprep: 'b-final', deadlinecheck: 'b-deadline', carry: 'b-carry', carryreview: 'b-carry',
  };

  const WEEKDAYS_FA = ['شنبه', 'یکشنبه', 'دوشنبه', 'سه‌شنبه', 'چهارشنبه', 'پنجشنبه', 'جمعه'];

  const DL_STATUS = {
    met: { fa: 'سر وقت تمام شد', cls: 'ok' },
    ontrack: { fa: 'روی مسیر', cls: 'ok' },
    late: { fa: 'دیر می‌شود', cls: 'bad' },
    'late-done': { fa: 'با تأخیر تمام شد', cls: 'warn' },
  };

  const $ = (id) => document.getElementById(id);
  const pad = (n) => String(n).padStart(2, '0');
  const iso = (d) => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());

  let state = {
    config: null,
    plan: null,
    week: 0,
    selectedDay: null,
    scores: {},
    done: {},
    general: null,
    gradeSel: ['دوازدهم'],   // پایه‌های انتخابی برای دروس عمومی
    generalEdits: {},        // ویرایش‌های کاربر روی هر درس عمومی (با id)
    chapters: {},            // ارزیابی فصل‌به‌فصل: sid → [{name, read, mastery}]
    coreSubjects: [],        // آخرین فهرست دروس اختصاصی نمایش‌داده‌شده
    assessOpen: {},          // کدام درس‌ها در بخش ارزیابی باز است
    finals: {},              // سوابق: id → {current, target, inProgram, influence}
    deadlineBooks: [],       // مهلت‌های کتابی (مدل اول)
    deadlineExams: [],       // مهلت‌های کوتاه: تک‌درس/جامع (مدل دوم)
    offDates: [],            // روزهای خارج از برنامه
    visited: {},             // قدم‌هایی که کاربر باز کرده (تیک مسیر آماده‌سازی)
    startTimes: null,        // ساعت شروع هر روز
    timeMode: 'fixed',       // دستی یا خودکار (فقط سقف)
    lastCarry: [],           // کارهای جامانده‌ای که بازچینش شدند
    sessions: {},            // v2.5: تایمر هر بلوک — 'date#i' → {plannedMinutes, accumMs, since, status}
    dayStarts: {},           // v2.5: شروع واقعی روزها — 'iso' → 'HH:MM'
    emergency: [],           // v2.5: آیتم‌های اضطراری
    routines: null,          // v2.5: روال‌های ثابت روز
    routinePinned: false,
    wakeTime: '07:00',
  };
  const sessions = () => (state.sessions = state.sessions || {});
  const nowMs = () => Date.now();

  /* ---------------- ابزار ---------------- */

  function toast(msg) {
    const el = $('toast');
    el.textContent = msg;
    el.classList.add('show');
    clearTimeout(toast._t);
    toast._t = setTimeout(() => el.classList.remove('show'), 2600);
  }

  const EN_DIGITS = { '۰': '0', '۱': '1', '۲': '2', '۳': '3', '۴': '4', '۵': '5', '۶': '6', '۷': '7', '۸': '8', '۹': '9', '٠': '0', '١': '1', '٢': '2', '٣': '3', '٤': '4', '٥': '5', '٦': '6', '٧': '7', '٨': '8', '٩': '9', '٫': '.', ',': '.' };
  function numVal(el) {
    if (!el) return 0;
    const raw = String(el.value == null ? '' : el.value).replace(/[۰-۹٠-٩٫,]/g, (c) => EN_DIGITS[c] || c);
    const n = parseFloat(raw);
    return isFinite(n) ? n : 0;
  }
  function faDigits(v) {
    return String(v == null ? '' : v).replace(/\d/g, (d) => '۰۱۲۳۴۵۶۷۸۹'[d]).replace(/\./g, '٫');
  }

  /* ---------- ساعت: همیشه ۲۴ ساعته، با رقم فارسی ----------
     ورودی <input type="time"> به زبان ویندوز وابسته است و در فارسی
     «04:00 PM» نشان می‌دهد؛ پس ورودی متنیِ خودمان را داریم. */
  function normTime(raw) {
    let v = String(raw == null ? '' : raw).trim()
      .replace(/[۰-۹٠-٩]/g, (c) => EN_DIGITS[c] || c)
      .replace(/\s+/g, '')
      .replace(/[٫،.]/g, ':')
      .replace(/[^\d:]/g, '');
    if (!v) return '';
    if (v.indexOf(':') === -1) {
      if (v.length === 1 || v.length === 2) v += ':00';
      else if (v.length === 3) v = '0' + v[0] + ':' + v.slice(1);
      else if (v.length === 4) v = v.slice(0, 2) + ':' + v.slice(2);
      else return '';
    }
    const m = v.match(/^(\d{1,2}):(\d{1,2})$/);
    if (!m) return '';
    let h = Number(m[1]);
    let mi = Number(m[2]);
    if (h === 24 && mi === 0) return '24:00';
    if (!(h >= 0 && h <= 23) || !(mi >= 0 && mi <= 59)) return '';
    return String(h).padStart(2, '0') + ':' + String(mi).padStart(2, '0');
  }
  function timeFa(v) {
    const t = normTime(v);
    return t ? faDigits(t) : (v ? faDigits(String(v)) : '');
  }
  function readTime(el, fallback) {
    if (!el) return fallback;
    const t = normTime(el.value);
    if (!t) {
      el.classList.add('bad');
      el.title = 'ساعت را به شکل ۲۴ ساعته بنویس، مثلاً ۱۶:۳۰ یا ۰۰:۳۰';
      return fallback;
    }
    el.classList.remove('bad');
    return t;
  }
  /** رشتهٔ HTML یک ورودی ساعت (متنی، ۲۴ ساعته) */
  function timeInput(attr, value, def) {
    return '<input class="tin" ' + attr + ' value="' + timeFa(value || def || '') + '" ' +
      'placeholder="' + timeFa(def || '00:00') + '" inputmode="numeric" autocomplete="off" />';
  }

  /* ---------- انتخاب ساعت به‌صورت منوی کشویی استاندارد ---------- */

  const HOURS24 = Array.from({ length: 24 }, (_, i) => String(i).padStart(2, '0'));
  const MIN_STEPS = ['00', '05', '10', '15', '20', '25', '30', '35', '40', '45', '50', '55'];

  function splitHM(v) {
    const m = String(v == null ? '' : v)
      .replace(/[۰-۹]/g, (c) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(c)))
      .replace(/[٠-٩]/g, (c) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(c)));
    const parts = m.split(':');
    if (parts.length < 2) return { h: '07', m: '00' };
    const h = Math.max(0, Math.min(23, parseInt(parts[0], 10) || 0));
    const mi = Math.max(0, Math.min(59, parseInt(parts[1], 10) || 0));
    return { h: String(h).padStart(2, '0'), m: String(mi).padStart(2, '0') };
  }

  /**
   * هر ورودی ساعت (`input.tin` با مقدار HH:MM) را به دو منوی کشویی «ساعت : دقیقه» تبدیل می‌کند.
   * خودِ input مخفی می‌ماند تا همهٔ کدهای قبلی که el.value را می‌خوانند بی‌تغییر کار کنند.
   */
  function upgradeTimeInputs(root) {
    const scope = root || document;
    const list = scope.querySelectorAll ? scope.querySelectorAll('input.tin:not([data-tp])') : [];
    list.forEach((inp) => {
      const isTime = /^\s*\d{1,2}:\d{2}\s*$/.test(
        String(inp.value || '').replace(/[۰-۹]/g, (c) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(c)))) ||
        Boolean(inp.dataset.start);
      if (!isTime) return;
      inp.dataset.tp = '1';
      const { h, m } = splitHM(inp.value);
      const wrap = document.createElement('span');
      wrap.className = 'tpick';
      const mins = MIN_STEPS.indexOf(m) === -1 ? MIN_STEPS.concat([m]).sort() : MIN_STEPS;
      wrap.innerHTML =
        '<select class="tpick-s" aria-label="ساعت" data-role="h">' +
          HOURS24.map((x) => '<option value="' + x + '"' + (x === h ? ' selected' : '') + '>' + x + '</option>').join('') +
        '</select><span class="tpick-c">:</span>' +
        '<select class="tpick-s" aria-label="دقیقه" data-role="m">' +
          mins.map((x) => '<option value="' + x + '"' + (x === m ? ' selected' : '') + '>' + x + '</option>').join('') +
        '</select>';
      inp.style.display = 'none';
      inp.parentNode.insertBefore(wrap, inp);
      const selH = wrap.querySelector('[data-role="h"]');
      const selM = wrap.querySelector('[data-role="m"]');
      const sync = () => {
        inp.value = selH.value + ':' + selM.value;
        inp.classList.remove('bad');
        inp.dispatchEvent(new Event('input', { bubbles: true }));
        inp.dispatchEvent(new Event('change', { bubbles: true }));
      };
      selH.addEventListener('change', sync);
      selM.addEventListener('change', sync);
      sync();
    });
  }

  function faNum(n) {
    // گرد کردن به یک رقم اعشار تا اعداد اعشاریِ شناور (مثل ۲۷٫۳۴۹۹۹۹) نمایش داده نشوند
    const num = Number(n);
    const val = isFinite(num) ? Math.round(num * 10) / 10 : n;
    return String(val)
      .replace(/\./g, '٫')
      .replace(/\d/g, (d) => '۰۱۲۳۴۵۶۷۸۹'[d]);
  }

  /* جداسازی جهت‌نویسی برای بازه‌های زمانی/تاریخ در متن راست‌به‌چپ */
  function bidi(txt) {
    return '<span dir="ltr" style="unicode-bidi:isolate">' + String(txt) + '</span>';
  }

  /**
   * «این بلوک دقیقاً چه می‌خواهد؟» — انتظارهای روشن از پایان همین تایم،
   * به‌همراه نام صریح مبحثی که باید خوانده یا مرور شود.
   */
  function blockGoals(block) {
    const kind = block.kind;
    const m = chapterMetaOf(block);
    const chapTitle = m
      ? ('فصل ' + faNum(m.bookNo) + ' کتاب ' + m.grade + (m.name ? ' — ' + m.name : ''))
      : String(block.topic || '').replace(/\s*—\s*تست هدفمند\s*$/, '');
    const tests = Number(block.practiceCount) || 0;
    const out = [];
    if (kind === 'warmup' || kind === 'review' || kind === 'cumreview' || kind === 'carryreview') {
      out.push('مرور روی: ' + (m ? chapTitle : String(block.topic || 'مبحث دیروز').replace(/\s*—\s*تست هدفمند\s*$/, '')));
      out.push('بازیابی از حافظه: مفاهیم اصلی را بدون نگاه به کتاب بنویس، بعد با کتاب چک کن.');
      out.push('هر چیزی که یادت نیامد را علامت بزن تا در مرور بعدی اول همان را ببینی.');
    } else if (kind === 'practice' || kind === 'boost') {
      out.push('مبحث: ' + (m ? chapTitle : (block.topic || '')));
      out.push('هدف: ' + (tests ? faNum(tests) + ' تست هدفمند' : 'تست هدفمند') + ' از همین مبحث، با زمان‌سنج.');
      out.push('در پایان باید بگویی هر غلط «چرا» غلط شد: مفهوم، بی‌دقتی یا کمبود وقت.');
    } else if (kind === 'reteach' || kind === 'classfix' || kind === 'carry') {
      out.push('مبحث: ' + (m ? chapTitle : (block.topic || '')));
      out.push('هدف: بستن حفره‌های همین مبحث — از مفاهیمی که غلط زدی شروع کن.');
      out.push('در پایان باید بتوانی همان سؤال‌ها را درست و با توضیح حل کنی.');
    } else if (kind === 'finalprep' || kind === 'deadlinecheck') {
      out.push('مبحث: ' + (m ? chapTitle : (block.topic || '')));
      out.push('هدف: پوشش بارم‌محورِ همین فصل برای امتحان نهایی (متن کتاب + نمونه‌سؤال).');
      out.push('در پایان باید سؤال‌های نهایی همین فصل را در زمان استاندارد بزنی.');
    } else if (kind === 'mock' || kind === 'analysis') {
      out.push('هدف: سنجش واقعی در شرایط آزمون، بدون توقف.');
      out.push('در پایان، تحلیل خطاها مهم‌تر از نمره است: دسته‌بندی خطا + یک اقدام برای هر دسته.');
      return out;
    } else {
      out.push('این فصل: ' + (m ? chapTitle : String(block.topic || '').replace(/\s*—\s*تست هدفمند\s*$/, '')));
      out.push('در پایان این تایم باید بتوانی مفاهیم اصلی همین فصل را با جملهٔ خودت توضیح دهی و ۳ سؤال منتخب را بدون کتاب جواب دهی.');
      out.push('یک نقشهٔ ذهنی از سرفصل‌های فصل بکش و جای هر مفهوم را روی آن پیدا کن.');
    }
    return out;
  }

  /** نمایش اهداف داخل کارت بلوک */
  function goalsHtml(block) {
    const g = blockGoals(block);
    if (!g.length) return '';
    const how = KIND_HOW[block.kind] || '';
    return '<div class="goals"><div class="goal-h">این بلوک از تو چه می‌خواهد؟</div><ul>' +
      g.map((x) => '<li>' + esc(x) + '</li>').join('') + '</ul>' +
      (how ? '<div class="goal-how">' + esc(how) + '</div>' : '') + '</div>';
  }

  /** خط «این فصل چیست»: شمارهٔ فصل + نام + پایه */
  function chapterLine(block) {
    const m = chapterMetaOf(block);
    if (!m) return '';
    return '<span class="chap">فصل ' + faNum(m.bookNo) + ' از کتاب ' + esc(m.grade) +
      (m.name ? ' · ' + esc(m.name) : '') + '</span>';
  }

  /* ---------- نمایش ساعت: همیشه دورقمی، با اعداد فارسی و فونتِ جدولی ---------- */

  function padHM(v) {
    const raw = String(v == null ? '' : v).trim();
    if (!raw) return '';
    /* ساعت همیشه با رقم لاتین و دورقمی: 09:00 */
    const m = raw.replace(/[۰-۹]/g, (c) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(c)))
      .replace(/[٠-٩]/g, (c) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(c)));
    const parts = m.split(':');
    if (parts.length < 2) return m;
    const hh = String(Math.max(0, Math.min(23, parseInt(parts[0], 10) || 0))).padStart(2, '0');
    const mm = String(Math.max(0, Math.min(59, parseInt(parts[1], 10) || 0))).padStart(2, '0');
    return hh + ':' + mm;
  }

  /** نسخهٔ فشرده برای کارت‌های آمار: «۰۹:۰۰–۱۳:۳۹» */
  function timeRangeShort(a, b) {
    if (!a && !b) return '—';
    if (!b) return '<span class="tr short"><span class="tt" dir="ltr">' + padHM(a) + '</span></span>';
    return '<span class="tr short"><span class="tt" dir="ltr">' + padHM(a) + '</span>' +
      '<span class="sep">–</span><span class="to" dir="ltr">' + padHM(b) + '</span></span>';
  }

  /** «۰۹:۰۰ تا ۰۹:۴۵» — خوانا و درست‌جهت */
  function timeRange(a, b) {
    if (!a && !b) return '—';
    if (!b) return '<span class="tr"><span class="tt" dir="ltr">' + padHM(a) + '</span></span>';
    return '<span class="tr"><span class="tt" dir="ltr">' + padHM(a) + '</span>' +
      '<span class="sep">تا</span><span class="to" dir="ltr">' + padHM(b) + '</span></span>';
  }

  /** «یک ساعت و ۳۰ دقیقه» برای بازه‌های طولانی */
  function durationFa(min) {
    const m = Math.max(0, Math.round(Number(min) || 0));
    if (m < 60) return faNum(m) + ' دقیقه';
    const h = Math.floor(m / 60);
    const r = m % 60;
    return faNum(h) + ' ساعت' + (r ? ' و ' + faNum(r) + ' دقیقه' : '');
  }

  /* ---------- اهمیت فصل: یادآوری همیشگی سطح اهمیت مبحث ---------- */

  const IMP_WORDS = { 5: 'بحرانی', 4: 'خیلی مهم', 3: 'مهم', 2: 'کم‌اهمیت', 1: 'حاشیه‌ای' };

  /* روش اجرای هر نوع بلوک (زیرخط اهداف، برای شفافیت بیشتر) */
  const KIND_HOW = {
    learn: 'روش: مطالعهٔ فعال + نت‌برداری پرسشی، و ۵ دقیقهٔ آخر بازیابی بدون کتاب.',
    reteach: 'روش: از غلط‌های ثبت‌شده شروع کن، هر مفهوم را با مثال خودت بازگو کن.',
    practice: 'روش: تست زمان‌دار، بعد تحلیل خطا و ثبت در دفتر اشتباهات.',
    boost: 'روش: تمرین هدفمند روی ضعیف‌ترین بخش همین فصل.',
    review: 'روش: بازیابی فعال (بدون کتاب) → چک کردن → علامت‌زدن مبهم‌ها.',
    warmup: 'روش: مرور کوتاه و فعال؛ هدف یادگیری تازه نیست، تثبیت است.',
    cumreview: 'روش: مرور تجمعی از فصل‌های قدیمی‌تر با تست ترکیبی.',
    carryreview: 'روش: مرور کار جامانده + بازیابی سریع.',
    carry: 'روش: ادامهٔ کار نیمه‌تمام از همان جایی که ماند.',
    finalprep: 'روش: بارم‌محور بخوان: متن کتاب، سپس نمونه‌سؤال نهایی همان فصل.',
    deadlinecheck: 'روش: چک‌لیست مهلت + رفع آخرین حفره‌ها.',
    classfix: 'روش: هم‌گام‌شدن با کلاس؛ ابتدا نکات کلاس، بعد تمرین.',
    mock: 'روش: شرایط واقعی آزمون؛ بدون توقف و بدون کتاب.',
    analysis: 'روش: دسته‌بندی خطاها و نوشتن یک اقدام مشخص برای هر دسته.',
  };

  /** شمارهٔ فصل را از شناسهٔ مبحث («bio.c18») درمی‌آورد */
  function chapterNoOf(block) {
    if (!block) return 0;
    if (Number(block.chapterNo)) return Number(block.chapterNo);
    const id = String(block.topicId || '');
    const m = id.match(/\.c(\d+)\s*$/);
    return m ? Number(m[1]) : 0;
  }

  /** اطلاعات اهمیت فصل از دادهٔ پژوهشی؛ اگر نبود، null */
  function chapterInfoOf(block) {
    if (!block || !cw || typeof cw.chapterInfo !== 'function') return null;
    const n = chapterNoOf(block);
    if (!n) return null;
    try { return cw.chapterInfo(block.subjectId, n); } catch (e) { return null; }
  }

  /** فهرست فصل‌های یک درس از منابع برنامه (نام کتاب + پایه + تعداد فصل) */
  function subjectMeta(subjectId) {
    let fromCfg = null;
    const subs = (state.config && state.config.subjects) || [];
    fromCfg = subs.find((x) => x && x.id === subjectId) || null;
    let fromPreset = null;
    try {
      const field = (state.config && state.config.student && state.config.student.field) || 'tajrobi';
      fromPreset = presets.subjectsFor(field).find((x) => x && x.id === subjectId) || null;
    } catch (e) { /* بی‌صدا */ }
    if (fromCfg && fromPreset) {
      /* نام‌های فصل و پایهٔ هر فصل فقط در دادهٔ پیش‌فرض هست؛ با تنظیمات کاربر ادغام می‌شود */
      return Object.assign({}, fromPreset, fromCfg, {
        chapterShort: fromPreset.chapterShort, chapterGrades: fromPreset.chapterGrades,
        topicNames: fromPreset.topicNames, chapters: fromCfg.chapters || fromPreset.chapters,
      });
    }
    return fromCfg || fromPreset || null;
  }

  /**
   * همهٔ چیزی که برای «این فصل چیست و چقدر مهم است» لازم است:
   * شمارهٔ فصل، نام مبحث، پایه، تعداد کل فصل‌های کتاب، درصد از کل سؤال‌های کتاب،
   * رتبهٔ اهمیت در همان کتاب، تعداد سؤال کنکور و سختی.
   */
  function chapterMetaOf(block) {
    if (!block) return null;
    const no = chapterNoOf(block);
    if (!no) return null;
    const info = chapterInfoOf(block);
    const sm = subjectMeta(block.subjectId);
    const total = sm ? (Number(sm.chapters) || (sm.topicNames ? sm.topicNames.length : 0)) : 0;
    const name = (sm && sm.chapterShort && sm.chapterShort[no - 1]) ||
      (block.topic ? String(block.topic).split('·').pop().trim() : '');
    let grade = (sm && sm.chapterGrades && sm.chapterGrades[no - 1]) || '';
    if (!grade && block.topic) {
      const g = String(block.topic).match(/^\s*(دهم|یازدهم|دوازدهم)/);
      if (g) grade = g[1];
    }
    /* رتبهٔ اهمیت: بر اساس تعداد سؤال واقعی همان فصل در کنکور */
    let rank = 0;
    let ranked = 0;
    const k = cw && cw.konkur ? cw.konkur(block.subjectId) : null;
    if (k && k.chapters && k.chapters[no - 1]) {
      const mine = k.chapters[no - 1].q;
      const qs = k.chapters.map((c) => c.q);
      const sorted = qs.slice().sort((a, b) => b - a);
      rank = sorted.indexOf(mine) + 1;
      ranked = qs.length;
    }
    /* شمارهٔ فصل در کتابِ همان پایه (همان چیزی که دانش‌آموز در کتاب می‌بیند) */
    let bookNo = no;
    if (sm && sm.chapterGrades && sm.chapterGrades[no - 1]) {
      const g = sm.chapterGrades[no - 1];
      let before = 0;
      for (let i = 0; i < no - 1; i += 1) if (sm.chapterGrades[i] === g) before += 1;
      bookNo = before + 1;
    }
    let bookTotal = 0;
    if (sm && sm.chapterGrades) {
      const g = sm.chapterGrades[no - 1];
      bookTotal = sm.chapterGrades.filter((x) => x === g).length;
    }
    return {
      no, total, bookNo, bookTotal, name, grade, rank, ranked,
      sharePct: info ? info.sharePct : 0,
      q: info ? info.q : 0,
      imp: info ? info.imp : 0,
      diff: info ? info.diff : 0,
      subjectName: block.subjectName || (sm && sm.name) || '',
    };
  }

  /**
   * نشان اهمیت فصل — بر پایهٔ «درصد از کل کتاب» و «رتبهٔ اهمیت در همان کتاب»،
   * نه یک عدد کلی: «۹٫۶٪ از کتاب زیست · رتبهٔ ۳ از ۲۴»
   */
  function chapterBadge(block, opts) {
    const m = chapterMetaOf(block);
    const o = opts || {};
    if (!m) {
      if (!block || !block.importance) return '';
      const imp = Math.max(1, Math.min(5, Math.round(Number(block.importance) || 3)));
      return '<span class="imp imp' + imp + '" data-help="imp">اهمیت ' + faNum(imp) + ' از ۵</span>';
    }
    const strong = m.sharePct >= 6 || (m.rank && m.rank <= Math.max(3, Math.round(m.ranked * 0.2)));
    const cls = 'imp ' + (strong ? 'imp-hot' : 'imp-mid');
    const title = m.subjectName + ' · فصل ' + faNum(m.bookNo) + ' از ' + faNum(m.bookTotal) + ' کتاب ' + m.grade +
      (m.name ? ' — ' + m.name : '') +
      '\nسهم از سؤال‌های این درس در کنکور: ' + faNum(m.sharePct) + '٪ از کل کتاب' +
      '\nرتبهٔ اهمیت در کتاب: ' + faNum(m.rank) + ' از ' + faNum(m.ranked) +
      '\nتعداد سؤال کنکور: ≈' + faNum(Math.round(m.q)) +
      '\nسختی: ' + faNum(m.diff) + ' از ۵' +
      '\nمنبع: بودجه‌بندی کنکور ۱۴۰۲–۱۴۰۴';
    if (o.short) {
      return '<span class="' + cls + '" title="' + esc(title) + '" data-help="imp">' +
        faNum(m.sharePct) + '٪ · رتبهٔ ' + faNum(m.rank) + '</span>';
    }
    return '<span class="' + cls + '" title="' + esc(title) + '" data-help="imp">' +
      '<b>' + faNum(m.sharePct) + '٪</b> از کتاب ' + esc(m.subjectName) +
      ' <span class="impsep">·</span> رتبهٔ ' + faNum(m.rank) + ' از ' + faNum(m.ranked) + '</span>';
  }

  /* ---------------- تاریخ شمسی ---------------- */

  /** رشتهٔ شمسیِ فیلد تاریخ را به ISO میلادی تبدیل می‌کند (برای ذخیرهٔ داخلی) */
  function readJDate(id) {
    const el = $(id);
    if (!el) return null;
    if (el.dataset.iso) return el.dataset.iso;
    const parsed = J ? J.parse(el.value) : null;
    return parsed;
  }

  function writeJDate(id, iso) {
    const el = $(id);
    if (!el) return;
    el.dataset.iso = iso || '';
    el.value = iso && J ? J.fmt(iso) : '';
    if (J) J.attachPicker(el);
  }

  /** «۷ آبان» برای قرص‌های روز هفته */
  function jDayMonth(iso) {
    if (!J) return '';
    const j = J.fromISO(iso);
    return j ? faNum(j.jd) + ' ' + J.MONTHS[j.jm - 1] : '';
  }

  /** نمایش شمسی یک تاریخ ISO (بدون نام روز — روز هفته در بالای همان کارت) */
  function jDateFull(iso) {
    return J ? J.fmt(iso) : faNum(iso);
  }

  function weekOf(plan, dayIndex) {
    return Math.floor(dayIndex / 7);
  }

  /* ---------------- ساعت شروع هر روز ---------------- */

  const DEFAULT_START_TIMES = {
    sat: '16:00', sun: '16:00', mon: '16:00', tue: '16:00', wed: '16:00', thu: '09:00', fri: '09:00',
  };

  function renderStartTimes(values) {
    const box = $('startTimes');
    if (!box) return;
    const v = Object.assign({}, DEFAULT_START_TIMES, values || {});
    box.innerHTML = WEEKDAY_FA.map((w, i) =>
      '<div><label>' + w + '</label>' + timeInput('data-start="' + WEEKDAY_KEY[i] + '"', v[WEEKDAY_KEY[i]], '16:00') + '</div>').join('');
  }

  function readStartTimes() {
    const out = {};
    document.querySelectorAll('[data-start]').forEach((inp) => { out[inp.dataset.start] = readTime(inp, '16:00'); });
    return Object.keys(out).length ? out : Object.assign({}, DEFAULT_START_TIMES);
  }

  /* ---------------- روزهای خارج از برنامه ---------------- */

  function renderOffRows(rows) {
    const box = $('offRows');
    if (!box) return;
    box.innerHTML = '';
    (rows || []).forEach((o) => {
      const div = document.createElement('div');
      div.className = 'dyn-row off';
      div.innerHTML =
        '<div><label>تاریخ (شمسی)</label><input data-of="date" data-jdate data-iso="' + esc(o.date || '') + '" /></div>' +
        '<div><label>نوع</label><select data-of="kind">' +
          '<option value="halt"' + (o.kind !== 'light' ? ' selected' : '') + '>تعطیل کامل</option>' +
          '<option value="light"' + (o.kind === 'light' ? ' selected' : '') + '>روز سبک</option>' +
        '</select></div>' +
        '<div><label>یادداشت</label><input data-of="note" value="' + esc(o.note || '') + '" placeholder="سفر / بیماری / مهمانی" /></div>' +
        '<button class="del" title="حذف">✕</button>';
      div.querySelector('.del').addEventListener('click', () => div.remove());
      box.appendChild(div);
    });
    if (!box.children.length) box.innerHTML = '<div class="muted" style="font-size:11.5px">روزی ثبت نشده — همهٔ روزها عادی‌اند.</div>';
    else if (J) J.attachAll(box);
  }

  function readOffRows() {
    const out = [];
    $('offRows').querySelectorAll('.dyn-row').forEach((row) => {
      const d = row.querySelector('[data-of="date"]');
      const date = d.dataset.iso || (J ? J.parse(d.value) : null);
      if (!date) return;
      out.push({
        date,
        kind: row.querySelector('[data-of="kind"]').value,
        note: row.querySelector('[data-of="note"]').value.trim(),
      });
    });
    return out;
  }

  $('addOff').addEventListener('click', () => {
    const rows = readOffRows();
    const d = new Date(); d.setDate(d.getDate() + 3);
    rows.push({ date: J ? J.dateToISO(d) : iso(d), kind: 'halt', note: '' });
    renderOffRows(rows);
  });

  /* ---------------- مدل ۱: مهلت کتابی ---------------- */

  function coreSubjectOptions(selected) {
    const list = state.coreSubjects && state.coreSubjects.length ? state.coreSubjects : presets.subjectsFor($('field').value || 'tajrobi');
    return list.map((x) => '<option value="' + esc(x.id) + '"' + (x.id === selected ? ' selected' : '') + '>' + esc(x.name) + '</option>').join('');
  }

  /** درس‌های عمومیِ فعال (همان‌هایی که در «دروس عمومی» تیک دارند) */
  function activeGeneralSubjects() {
    return (state.general || []).filter((x) => x.include !== false);
  }

  /** نام هر درس/کتاب از هر دو فهرست — برای مهلت‌های ذخیره‌شدهٔ قدیمی */
  function bookNameOf(id) {
    const pools = [
      state.coreSubjects || [],
      state.general || [],
      (state.config && state.config.subjects) || [],
      presets.subjectsFor($('field').value || 'tajrobi'),
      presets.generalFor(state.gradeSel || ['دوازدهم']),
    ];
    for (let i = 0; i < pools.length; i += 1) {
      const hit = (pools[i] || []).filter((x) => x && x.id === id)[0];
      if (hit && hit.name) return hit.name;
    }
    return id;
  }

  /**
   * فهرست «کتاب» در مهلت‌های کلی — هم اختصاصی، هم عمومی.
   * پیش از این فقط دروس اختصاصی می‌آمد و کتاب‌های عمومی (فارسی، دینی، عربی،
   * زبان، سلامت، هویت) اصلاً در فهرست نبودند؛ در حالی که سوابق تحصیلی از همین‌هاست.
   */
  function bookSubjectOptions(selected) {
    const core = (state.coreSubjects && state.coreSubjects.length ? state.coreSubjects : presets.subjectsFor($('field').value || 'tajrobi'));
    const gen = activeGeneralSubjects();
    const opt = (x) => '<option value="' + esc(x.id) + '"' + (x.id === selected ? ' selected' : '') + '>' + esc(x.name) + '</option>';
    const known = core.some((x) => x.id === selected) || gen.some((x) => x.id === selected);
    const stray = (selected && !known)
      ? '<option value="' + esc(selected) + '" selected>' + esc(bookNameOf(selected)) + '</option>'
      : '';
    if (!gen.length) return stray + core.map(opt).join('');
    return stray +
      '<optgroup label="اختصاصی">' + core.map(opt).join('') + '</optgroup>' +
      '<optgroup label="عمومی">' + gen.map(opt).join('') + '</optgroup>';
  }

  function renderBookDeadlineRows(rows) {
    const box = $('bookDeadlineRows');
    if (!box) return;
    box.innerHTML = '';
    (rows || []).forEach((r) => {
      const div = document.createElement('div');
      div.className = 'dyn-row dlbook';
      div.innerHTML =
        '<div><label>کتاب (اختصاصی و عمومی)</label><select data-bd="subjectId" title="همهٔ کتاب‌ها: اختصاصی و عمومی">' + bookSubjectOptions(r.subjectId) + '</select></div>' +
        '<div><label>تا تاریخ (شمسی)</label><input data-bd="date" data-jdate data-iso="' + esc(r.date || '') + '" /></div>' +
        '<div><label>هدف</label><select data-bd="goal">' +
          '<option value="read"' + (r.goal !== 'solid' ? ' selected' : '') + '>خوانده + تثبیت شود</option>' +
          '<option value="solid"' + (r.goal === 'solid' ? ' selected' : '') + '>تسلط کامل (فقط مرور بماند)</option>' +
        '</select></div>' +
        '<button class="del" title="حذف">✕</button>';
      div.querySelector('.del').addEventListener('click', () => div.remove());
      box.appendChild(div);
    });
    const cnt = $('bookDeadlineCount');
    if (cnt) cnt.textContent = faNum(box.children.length);
    if (!box.children.length) box.innerHTML = '<div class="muted" style="font-size:11.5px">مهلت کتابی ثبت نشده — برنامه فقط بر پایهٔ کنکور چیده می‌شود.</div>';
    else if (J) J.attachAll(box);
  }

  function readBookDeadlines() {
    const out = [];
    $('bookDeadlineRows').querySelectorAll('.dyn-row').forEach((row) => {
      const d = row.querySelector('[data-bd="date"]');
      const date = d.dataset.iso || (J ? J.parse(d.value) : null);
      if (!date) return;
      out.push({
        subjectId: row.querySelector('[data-bd="subjectId"]').value,
        date,
        goal: row.querySelector('[data-bd="goal"]').value,
      });
    });
    return out;
  }

  $('addBookDeadline').addEventListener('click', () => {
    const rows = readBookDeadlines();
    const d = new Date(); d.setMonth(d.getMonth() + 4);
    rows.push({ subjectId: (state.coreSubjects[0] || {}).id || 'bio', date: J ? J.dateToISO(d) : iso(d), goal: 'read' });
    renderBookDeadlineRows(rows);
  });

  $('suggestBookDeadlines').addEventListener('click', () => {
    const coreForSuggest = state.coreSubjects && state.coreSubjects.length ? state.coreSubjects : presets.subjectsFor($('field').value || 'tajrobi');
    state.deadlineBooks = presets.suggestedBookDeadlines
      ? presets.suggestedBookDeadlines(coreForSuggest.concat(activeGeneralSubjects()))
      : [];
    renderBookDeadlineRows(state.deadlineBooks);
    toast('مهلت پیشنهادی ساخته شد — هر تاریخ را می‌توانی عوض کنی.');
  });

  /* ---------------- آزمون‌های دوره‌ای (هر روز هفته، هر N هفته) ---------------- */

  /** فهرست دروس (اختصاصی فعال + عمومی فعال) برای انتخاب در آزمون‌ها */
  function allSubjectsForPick() {
    const core = (state.coreSubjects && state.coreSubjects.length)
      ? state.coreSubjects
      : presets.subjectsFor($('field').value || 'tajrobi');
    const gen = (state.general || []).filter((x) => x.include !== false);
    const seen = {};
    return core.concat(gen).filter((x) => {
      if (!x || !x.id || seen[x.id]) return false;
      seen[x.id] = true;
      return true;
    });
  }

  /**
   * انتخاب درس‌ها با تیک — جای <select multiple> که کاربر مجبور بود
   * Ctrl+کلیک کند (روی ویندوز تقریباً غیرقابل‌استفاده بود).
   * هر درس یک چیپِ تیک‌دار است؛ «همه/هیچ» هم دارد.
   */
  function subjectChecksHtml(attr, selected) {
    const list = allSubjectsForPick();
    const sel = Array.isArray(selected) ? selected : [];
    const chips = list.map((x) =>
      '<label class="sc" title="' + esc(x.name) + '">' +
        '<input type="checkbox" value="' + esc(x.id) + '"' + (sel.indexOf(x.id) !== -1 ? ' checked' : '') + '>' +
        '<span>' + esc(x.name) + '</span>' +
      '</label>').join('');
    return '<div class="subj-checks" data-subj-checks="' + esc(attr) + '">' +
      '<div class="sc-bar">' +
        '<button type="button" class="mini" data-sc-all="1">همه</button>' +
        '<button type="button" class="mini" data-sc-all="0">هیچ</button>' +
        '<span class="sc-hint">خالی = همهٔ درس‌ها</span>' +
      '</div>' +
      '<div class="sc-grid" data-sc-grid="' + esc(attr) + '">' + chips + '</div>' +
    '</div>';
  }

  /** درس‌های تیک‌خوردهٔ یک ردیف */
  function readSubjectChecks(row) {
    if (!row) return [];
    return Array.prototype.map.call(row.querySelectorAll('.subj-checks input[type=checkbox]:checked'), (i) => i.value);
  }

  /** دکمه‌های «همه/هیچ» و بازرسمی‌کردن تیک‌ها؛ یک‌بار برای کل سند */
  function wireSubjectChecks() {
    document.addEventListener('click', (ev) => {
      const btn = ev.target.closest && ev.target.closest('[data-sc-all]');
      if (!btn) return;
      ev.preventDefault();
      const wrap = btn.closest('.subj-checks');
      if (!wrap) return;
      const on = btn.getAttribute('data-sc-all') === '1';
      wrap.querySelectorAll('input[type=checkbox]').forEach((i) => { i.checked = on; });
      wrap.classList.toggle('has-any', on);
    });
    document.addEventListener('change', (ev) => {
      const cb = ev.target;
      if (!cb || cb.type !== 'checkbox') return;
      const wrap = cb.closest && cb.closest('.subj-checks');
      if (!wrap) return;
      wrap.classList.toggle('has-any', !!wrap.querySelector('input:checked'));
    });
  }

  function subjectOptionsAll(selected) {
    const list = (state.coreSubjects && state.coreSubjects.length ? state.coreSubjects : presets.subjectsFor($('field').value || 'tajrobi'));
    return list.map((s) => '<option value="' + s.id + '"' +
      ((selected || []).indexOf(s.id) !== -1 ? ' selected' : '') + '>' + esc(s.name) + '</option>').join('');
  }

  function renderMockRows(rows) {
    const box = $('mockRows');
    if (!box) return;
    box.innerHTML = '';
    (rows || []).forEach((m) => {
      const div = document.createElement('div');
      div.className = 'dyn-row mock';
      div.innerHTML =
        '<div><label>عنوان آزمون</label><input data-mk="title" value="' + esc(m.title || '') + '" placeholder="زیستاز / آلفا / قلم‌چی" /></div>' +
        '<div><label>روز هفته</label><select data-mk="day">' +
          WEEKDAYS_FA.map((d, i) => '<option value="' + i + '"' + (Number(m.day) === i ? ' selected' : '') + '>' + d + '</option>').join('') +
        '</select></div>' +
        '<div><label>تکرار</label><select data-mk="everyNWeeks">' +
          [[1, 'هر هفته'], [2, 'هر ۲ هفته'], [3, 'هر ۳ هفته'], [4, 'هر ۴ هفته']]
            .map(([v, t]) => '<option value="' + v + '"' + (Number(m.everyNWeeks || 1) === v ? ' selected' : '') + '>' + t + '</option>').join('') +
        '</select></div>' +
        '<div><label>ساعت شروع (اختیاری)</label>' + timeInput('data-mk="start"', m.start || '', '۰۹:۰۰') + '</div>' +
        '<div><label>مدت (دقیقه)</label><select data-mk="minutes">' +
          [60, 90, 100, 120, 150, 180, 210]
            .map((v) => '<option value="' + v + '"' + (Number(m.minutes || 100) === v ? ' selected' : '') + '>' + faNum(v) + '</option>').join('') +
        '</select></div>' +
        '<div class="mock-subjects wide"><label>دروس آزمون (با تیک انتخاب کن — خالی = همه)</label>' +
          subjectChecksHtml('mk', m.subjectIds || []) + '</div>' +
        '<button class="del mock-del" title="حذف">✕</button>';
      div.querySelector('.del').addEventListener('click', () => div.remove());
      box.appendChild(div);
    });
    if (!box.children.length) {
      box.innerHTML = '<div class="muted" style="font-size:11.5px">آزمون دوره‌ای ثبت نشده — یک آزمون جامع هفتگی ساده چیده می‌شود.</div>';
    }
  }

  function readMocks() {
    const out = [];
    const box = $('mockRows');
    if (!box) return out;
    box.querySelectorAll('.dyn-row').forEach((row) => {
      const title = (row.querySelector('[data-mk="title"]').value || '').trim();
      const day = Number(row.querySelector('[data-mk="day"]').value);
      const every = Number(row.querySelector('[data-mk="everyNWeeks"]').value) || 1;
      const start = normTime(row.querySelector('[data-mk="start"]').value) || null;
      const minutes = Number(row.querySelector('[data-mk="minutes"]').value) || 100;
      const subjectIds = readSubjectChecks(row);
      if (!title && !subjectIds.length) return;
      out.push({ title: title || 'آزمون دوره‌ای', day, everyNWeeks: every, start, minutes, subjectIds });
    });
    return out;
  }

  $('addMock') && $('addMock').addEventListener('click', () => {
    state.weeklyMocks = readMocks().concat([{
      title: 'آزمون دوره‌ای', day: 5, everyNWeeks: 1, minutes: 100, subjectIds: [],
    }]);
    renderMockRows(state.weeklyMocks);
  });

  $('suggestMocks') && $('suggestMocks').addEventListener('click', () => {
    /* پیشنهاد حرفه‌ای: آزمون آزمایشی هر ۲ هفته + آزمون تک‌درس هفتگی */
    state.weeklyMocks = [
      { title: 'آزمون جامع آزمایشی', day: 5, everyNWeeks: 2, minutes: 180, subjectIds: [] },
      { title: 'آزمون تک‌درس هفته', day: 5, everyNWeeks: 2, minutes: 100, subjectIds: [] },
    ];
    renderMockRows(state.weeklyMocks);
    toast('دو آزمون دوره‌ای پیشنهاد شد (پنجشنبه‌ها، یکی‌درمیان).');
  });

  $('examDatePreset') && $('examDatePreset').addEventListener('change', (e) => {
    const v = e.target.value;
    if (!v) return;
    const inp = $('examDate');
    const d = new Date(v + 'T00:00:00');
    inp.value = J ? J.fmt(v) : v;
    inp.dataset.iso = v;
    if (J && J.setIso) J.setIso(inp, v);
    toast('تاریخ آزمون هدف: ' + (J ? J.fmt(v) : v));
    e.target.value = '';
  });

  /* ---------------- مدل ۲: آزمون تک‌درس / جامع ---------------- */

  function renderShortDeadlineRows(rows) {
    const box = $('shortDeadlineRows');
    if (!box) return;
    box.innerHTML = '';
    const cnt = $('shortDeadlineCount');
    if (cnt) cnt.textContent = faNum((rows || []).length);
    (rows || []).forEach((r) => {
      const isSingle = r.kind !== 'comprehensive';
      const sub = state.coreSubjects.find((x) => x.id === r.subjectId) || state.coreSubjects[0] || { chapters: 24 };
      const chapters = sub.chapters || 24;
      const fromOpts = Array.from({ length: chapters }, (_, i) => i + 1)
        .map((n) => '<option value="' + n + '"' + ((r.from || 1) === n ? ' selected' : '') + '>' + faNum(n) + '</option>').join('');
      const toOpts = Array.from({ length: chapters }, (_, i) => i + 1)
        .map((n) => '<option value="' + n + '"' + ((r.to || chapters) === n ? ' selected' : '') + '>' + faNum(n) + '</option>').join('');
      const div = document.createElement('div');
      div.className = 'dyn-row dlexam';
      div.innerHTML =
        '<div><label>عنوان</label><input data-sd="title" value="' + esc(r.title || '') + '" placeholder="آزمون فصل ۲ زیست" /></div>' +
        '<div><label>نوع</label><select data-sd="kind">' +
          '<option value="single"' + (isSingle ? ' selected' : '') + '>تک‌درس</option>' +
          '<option value="comprehensive"' + (!isSingle ? ' selected' : '') + '>جامع</option>' +
        '</select></div>' +
        '<div><label>درس</label><select data-sd="subjectId">' + coreSubjectOptions(r.subjectId) + '</select></div>' +
        '<div><label>از فصل</label><select data-sd="from">' + fromOpts + '</select></div>' +
        '<div><label>تا فصل</label><select data-sd="to">' + toOpts + '</select></div>' +
        '<div><label>تاریخ (شمسی)</label><input data-sd="date" data-jdate data-iso="' + esc(r.date || '') + '" /></div>' +
        '<button class="del" title="حذف">✕</button>';
      div.querySelector('.del').addEventListener('click', () => div.remove());
      box.appendChild(div);
    });
    if (!box.children.length) box.innerHTML = '<div class="muted" style="font-size:11.5px">آزمونی ثبت نشده.</div>';
    else if (J) J.attachAll(box);
  }

  function readShortDeadlines() {
    const out = [];
    $('shortDeadlineRows').querySelectorAll('.dyn-row').forEach((row) => {
      const get = (f) => row.querySelector('[data-sd="' + f + '"]');
      const d = get('date');
      const date = d.dataset.iso || (J ? J.parse(d.value) : null);
      if (!date) return;
      const kind = get('kind').value === 'comprehensive' ? 'comprehensive' : 'single';
      out.push({
        title: get('title').value.trim() || (kind === 'single' ? 'آزمون تک‌درس' : 'آزمون جامع'),
        kind,
        subjectId: kind === 'single' ? get('subjectId').value : null,
        from: Number(get('from').value) || 1,
        to: Number(get('to').value) || 120,
        date,
      });
    });
    return out;
  }

  $('addShortDeadline').addEventListener('click', () => {
    const rows = readShortDeadlines();
    const d = new Date(); d.setDate(d.getDate() + 21);
    rows.push({
      title: '', kind: 'single', subjectId: (state.coreSubjects[0] || {}).id || 'bio',
      from: 1, to: 1, date: J ? J.dateToISO(d) : iso(d),
    });
    renderShortDeadlineRows(rows);
  });

  /* ---------------- سوابق تحصیلی ---------------- */

  function finalsDefaults(field, grade) {
    return presets.finalsFor ? presets.finalsFor(field || 'tajrobi', grade || 'دوازدهم') : [];
  }

  function renderFinalsTable() {
    const box = $('finalsTable');
    if (!box) return;
    const courses = state.finalsList || [];
    if (!courses.length) { box.innerHTML = '<tr><td class="muted">درسی بارگذاری نشده.</td></tr>'; return; }
    box.innerHTML =
      '<thead><tr><th>درس</th><th>ضریب</th><th>نمرهٔ فعلی (۰–۲۰)</th><th>هدف</th><th>در برنامه</th></tr></thead><tbody>' +
      courses.map((c, i) => {
        const st = state.finals[c.id] || {};
        const cur = st.current == null ? '' : st.current;
        return '<tr data-fin-id="' + esc(c.id) + '">' +
          '<td><b>' + esc(c.name) + '</b></td>' +
          '<td>' + faNum(c.influence) + '</td>' +
          '<td><input data-fin-cur="' + i + '" value="' + (cur === '' ? '' : faNum(cur)) + '" placeholder="۱۲ (فرض)" style="max-width:90px" /></td>' +
          '<td><input data-fin-tgt="' + i + '" value="' + faNum(st.target == null ? c.target : st.target) + '" style="max-width:70px" /></td>' +
          '<td><input type="checkbox" data-fin-in="' + i + '"' + (st.inProgram === false ? '' : ' checked') + ' /></td>' +
        '</tr>';
      }).join('') + '</tbody>';

    box.querySelectorAll('[data-fin-cur]').forEach((inp) => {
      inp.addEventListener('input', () => {
        const c = state.finalsList[Number(inp.dataset.finCur || inp.getAttribute('data-fin-cur'))];
        if (!c) return;
        state.finals[c.id] = state.finals[c.id] || {};
        state.finals[c.id].current = inp.value.trim() === '' ? null : faToEn(inp.value);
      });
    });
    box.querySelectorAll('[data-fin-tgt]').forEach((inp) => {
      inp.addEventListener('input', () => {
        const c = state.finalsList[Number(inp.getAttribute('data-fin-tgt'))];
        if (!c) return;
        state.finals[c.id] = state.finals[c.id] || {};
        state.finals[c.id].target = faToEn(inp.value);
      });
    });
    box.querySelectorAll('[data-fin-in]').forEach((inp) => {
      inp.addEventListener('change', () => {
        const c = state.finalsList[Number(inp.getAttribute('data-fin-in'))];
        if (!c) return;
        state.finals[c.id] = state.finals[c.id] || {};
        state.finals[c.id].inProgram = inp.checked;
      });
    });
  }

  function readFinals() {
    return (state.finalsList || []).map((c) => {
      const st = state.finals[c.id] || {};
      const cur = st.current;
      return {
        id: c.id, name: c.name, grade: c.grade, influence: c.influence,
        current: cur === '' || cur == null ? null : Number(faToEn(String(cur))),
        target: st.target == null || st.target === '' ? c.target : Number(faToEn(String(st.target))),
        inProgram: st.inProgram !== false,
      };
    });
  }

  function loadFinalsFor(grade) {
    const list = finalsDefaults($('field').value, grade);
    state.finalsList = list;
    list.forEach((c) => {
      if (!state.finals[c.id]) state.finals[c.id] = { current: null, target: c.target, inProgram: true };
    });
    renderFinalsTable();
  }

  $('finalsGrade').addEventListener('change', () => {
    loadFinalsFor($('finalsGrade').value);
    toast('درس‌های نهایی پایهٔ ' + $('finalsGrade').value + ' بارگذاری شد.');
  });

  $('finalsDefaults').addEventListener('click', () => {
    state.finals = {};
    loadFinalsFor($('finalsGrade').value);
    toast('درس‌های نهایی و نمره‌ها بازگردانی شد.');
  });

  /* ---------------- ناوبری (نوار کنار) ---------------- */

  const NAVS = () => Array.from(document.querySelectorAll('.nav[data-view]'));

  /* ---------- ارتقای خودکار همهٔ ورودی‌های ساعت ---------- */
  let tpTimer = null;
  function scheduleTimeUpgrade() {
    clearTimeout(tpTimer);
    tpTimer = setTimeout(() => { try { upgradeTimeInputs(document); } catch (e) { /* بی‌صدا */ } }, 60);
  }
  try {
    const mo = new MutationObserver(() => scheduleTimeUpgrade());
    document.addEventListener('DOMContentLoaded', () => {
      upgradeTimeInputs(document);
      mo.observe(document.body, { childList: true, subtree: true });
    });
    if (document.readyState !== 'loading') { upgradeTimeInputs(document); mo.observe(document.body, { childList: true, subtree: true }); }
  } catch (e) { /* بی‌صدا */ }

  /* ---------- منوی موبایل ---------- */
  function closeNav() {
    const a = document.querySelector('aside');
    if (a) a.classList.remove('open');
    const b = $('navBackdrop');
    if (b) b.classList.remove('show');
  }
  if ($('navToggle')) $('navToggle').addEventListener('click', () => {
    const a = document.querySelector('aside');
    if (!a) return;
    const open = !a.classList.contains('open');
    a.classList.toggle('open', open);
    const b = $('navBackdrop');
    if (b) b.classList.toggle('show', open);
  });
  if ($('navBackdrop')) $('navBackdrop').addEventListener('click', closeNav);

  function gotoView(name) {
    const nav = NAVS().find((n) => n.dataset.view === name);
    if (!nav) return;
    NAVS().forEach((t) => t.classList.remove('active'));
    document.querySelectorAll('.view').forEach((v) => v.classList.remove('active'));
    nav.classList.add('active');
    const view = $('view-' + name);
    if (view) view.classList.add('active');
    const scroller = $('mainScroll');
    if (scroller) scroller.scrollTop = 0;
    document.querySelector('aside') && document.querySelector('aside').classList.remove('open');
    if (name === 'report') renderReport();
    if (String(name).indexOf('step-') === 0) {
      state.visited = state.visited || {};
      state.visited[name] = true;
      try { persist(); } catch (e) { /* بی‌صدا */ }
      renderHome();
    }
    if (name === 'home') renderHome();
    try { window.__revalView = name; } catch (e) { /* بی‌صدا */ }
  }

  NAVS().forEach((nav) => nav.addEventListener('click', () => gotoView(nav.dataset.view)));
  /* سازگاری با نسخهٔ قبل (کلاس .tab) */
  document.querySelectorAll('.tab[data-view]').forEach((tab) => {
    tab.addEventListener('click', () => gotoView(tab.dataset.view));
  });

  /* ---------------- خانه: نمای کلی ---------------- */

  function readAvailabilityTotal() {
    let total = 0;
    document.querySelectorAll('[data-avail]').forEach((el) => { total += Math.max(0, numVal(el)); });
    return total;
  }
  function readChaptersRead() {
    let read = 0, all = 0;
    document.querySelectorAll('[data-cf="read"]').forEach((el) => { all += 1; if (el.checked) read += 1; });
    return { read, all };
  }
  function readMocksCount() {
    return document.querySelectorAll('#mockRows .dyn-row').length;
  }
  function readDeadlinesCount() {
    return document.querySelectorAll('#bookDeadlineRows .dyn-row, #shortDeadlineRows .dyn-row').length;
  }
  function readFinalsCount() {
    return document.querySelectorAll('#finalsTable [data-fin-cur]').length;
  }

  const STEPS_META = [
    { n: 1, view: 'step-1', title: 'دربارهٔ تو', hint: 'پایه، رشته، تاریخ کنکور' },
    { n: 2, view: 'step-2', title: 'زمان‌های تو', hint: 'ساعت مطالعه و شروع' },
    { n: 3, view: 'step-3', title: 'کلاس‌ها و رویدادها', hint: 'کلاس، آزمون، سفر', optional: true },
    { n: 4, view: 'step-4', title: 'دروس و تسلط', hint: 'ارزیابی فصل‌به‌فصل' },
    { n: 5, view: 'step-5', title: 'سوابق تحصیلی', hint: 'نمرات نهایی' },
    { n: 6, view: 'step-6', title: 'مهلت‌ها و آزمون‌ها', hint: 'اختیاری — برنامه پیش‌فرض هم خوب است', optional: true },
  ];

  function stepValid() {
    const avail = readAvailabilityTotal();
    const ch = readChaptersRead();
    const finalsOn = $('finalsEnabled') ? $('finalsEnabled').value === '1' : false;
    const nameOk = Boolean(($('name') && $('name').value.trim()) || ($('grade') && $('grade').value));
    return {
      1: Boolean(nameOk),
      2: avail > 0,
      3: document.querySelectorAll('#classRows .dyn-row, #examRows .dyn-row, #offRows .dyn-row').length > 0,
      4: ch.read > 0,
      5: finalsOn && readFinalsCount() > 0,
      6: readMocksCount() > 0 || readDeadlinesCount() > 0,
    };
  }

  /* یک قدم «تکمیل‌شده» است که هم کاربر بازش کرده باشد و هم داده‌اش معتبر باشد */
  function stepStatus() {
    const valid = stepValid();
    const out = {};
    [1, 2, 3, 4, 5, 6].forEach((n) => {
      const seen = state.visited && state.visited['step-' + n];
      out[n] = Boolean(seen && valid[n]);
    });
    return out;
  }

  /* ══════════════════════════════════════════════════════════════════
     v2.5 — شروع روز · توقف/ادامهٔ بلوک · آیتم اضطراری · آمادگی جدا
     ══════════════════════════════════════════════════════════════════ */

  const DP = dayplan || null;

  function todayIso() {
    return (J && J.dateToISO) ? J.dateToISO(new Date()) : iso(new Date());
  }
  function findDay(plan, dateIso) {
    if (!plan || !plan.days) return null;
    return plan.days.find((d) => d.date === dateIso) || null;
  }
  function findBlock(plan, key) {
    const parts = String(key).split('#');
    const d = findDay(plan, parts[0]);
    if (!d) return { day: null, block: null, idx: -1 };
    const idx = Number(parts[1]);
    return { day: d, block: (d.blocks || [])[idx] || null, idx };
  }

  /* ---------- تایمر هر بلوک: شروع / توقف (مکس) / ادامه / پایان ---------- */

  function sessionOf(day, idx, block) {
    const key = day.date + '#' + idx;
    const all = sessions();
    const planned = DP ? DP.newSession(block).plannedMinutes
      : (Number(block.minutes) || Math.max(0, (Number(block.end) || 0) - (Number(block.start) || 0)));
    if (!all[key]) all[key] = { plannedMinutes: planned, accumMs: 0, since: null, status: 'idle', pauses: 0 };
    return all[key];
  }

  /** وضعیت نمایشی تایمر یک بلوک: دقیقه‌های گذشته، باقی‌مانده، درصد */
  function sessionView(day, idx, block) {
    const s = sessionOf(day, idx, block);
    if (!DP) return { s: s, elapsed: 0, remain: s.plannedMinutes, pct: 0, label: 'شروع نشده' };
    return {
      s: s,
      elapsed: DP.elapsedMinutes(s, nowMs()),
      remain: DP.remainingMinutes(s, nowMs()),
      pct: DP.progressPct(s, nowMs()),
      over: DP.overtimeMinutes(s, nowMs()),
      label: DP.statusFa(s),
    };
  }

  function timerHtml(day, block, idx) {
    if (!DP) return '';
    if (block.kind === 'routine') return '';
    const v = sessionView(day, idx, block);
    const key = day.date + '#' + idx;
    const st = v.s.status;
    const over = Boolean(v.s.overtime);
    const btns = [];
    if (st === 'idle') {
      btns.push('<button class="btn small" data-tmr="start" data-key="' + key + '">▶ شروع</button>');
      btns.push('<button class="btn ghost small" data-tmr="close" data-key="' + key + '">✓ پایان فصل</button>');
    }
    if (st === 'running') {
      btns.push('<button class="btn small warn" data-tmr="pause" data-key="' + key + '">⏸ مکس (توقف)</button>');
      btns.push('<button class="btn ghost small" data-tmr="close" data-key="' + key + '">✓ پایان فصل</button>');
    }
    if (st === 'paused') {
      btns.push('<button class="btn small primary" data-tmr="resume" data-key="' + key + '">▶ ادامه</button>');
      btns.push('<button class="btn ghost small" data-tmr="close" data-key="' + key + '">✓ پایان فصل</button>');
    }
    if (st === 'awaiting') {
      btns.push('<button class="btn small primary" data-tmr="awaitYes" data-key="' + key + '">هنوز می‌خوانم</button>');
      btns.push('<button class="btn ghost small" data-tmr="awaitNo" data-key="' + key + '">تمام شد</button>');
    }
    if (st === 'done') btns.push('<button class="btn ghost small" data-tmr="reset" data-key="' + key + '">از نو</button>');

    const cls = 'tmr' + (over ? ' overtime' : '') + (st === 'awaiting' ? ' awaiting' : '');
    const statCls = st === 'running' ? (over ? ' over' : ' on')
      : st === 'done' ? ' done' : st === 'awaiting' ? ' wait' : '';
    const extra = st === 'paused' ? ' · ' + faNum(v.remain) + ' دقیقه مانده'
      : st === 'awaiting' ? ' · زمان برنامه‌ریزی‌شده پر شد'
        : (over && v.over > 0) ? ' · ' + faNum(v.over) + ' دقیقه اضافه‌کاری' : '';
    return '<div class="' + cls + '" data-tmrbox="' + key + '">' +
      '<div class="tmrbar"><i data-tmrbar style="width:' + v.pct + '%"></i></div>' +
      '<div class="row" style="gap:6px;align-items:center;margin-top:5px">' +
        '<span class="tmrstat' + statCls + '" data-tmrstat>' + esc(v.label) + '</span>' +
        '<span class="muted" style="font-size:11px" data-tmrtxt>' +
          faNum(v.elapsed) + ' از ' + faNum(v.s.plannedMinutes) + ' دقیقه' + extra + '</span>' +
        '<span style="margin-inline-start:auto"></span>' + btns.join('') +
      '</div></div>';
  }

  /**
   * کلاس‌های وضعیت هر بلوک:
   *  live  → تایمر همین بلوک در حال کار است (سبز، زنده)
   *  next  → بلوکِ رزروِ بعدی (زرد)
   *  isdone→ انجام‌شده
   */
  function blockStateClass(day, idx) {
    const key = day.date + '#' + idx;
    const st = (state.sessions || {})[key];
    const status = st ? st.status : 'idle';
    const out = ['block'];
    if (status === 'done' || state.done[key]) out.push('isdone');
    else if (status === 'running' || status === 'paused') out.push('live');
    else if (status === 'awaiting') out.push('needans');
    else if (nextBlockKey(day) === key) out.push('next');
    else out.push('queued');
    if (DP && DP.isPinned && DP.isPinned(day.blocks[idx])) out.push('pinned');
    return out.join(' ');
  }

  /** تیک سبز گوشهٔ بلوکِ تمام‌شده */
  function doneTick(day, idx) {
    const key = day.date + '#' + idx;
    const st = (state.sessions || {})[key];
    const done = (st && st.status === 'done') || state.done[key];
    if (!done) return '';
    return '<span class="doneTick" title="این بلوک کامل شد"><svg viewBox="0 0 24 24" width="13" height="13" fill="none" ' +
      'stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M4 12.5 9.5 18 20 6.5"/></svg></span>';
  }

  /** کلید بلوک رزروِ بعدی: اولین بلوکی که نه تمام شده و نه در حال اجراست */
  function nextBlockKey(day) {
    if (!day) return null;
    const blocks = day.blocks || [];
    let afterRunning = -1;
    for (let i = 0; i < blocks.length; i += 1) {
      const st = (state.sessions || {})[day.date + '#' + i];
      if (st && (st.status === 'running' || st.status === 'paused' || st.status === 'awaiting')) afterRunning = i;
    }
    const okIdx = (i) => {
      const b = blocks[i];
      if (!b || b.kind === 'routine') return false;
      const st = (state.sessions || {})[day.date + '#' + i];
      if (st && (st.status === 'done' || st.status === 'running')) return false;
      if (state.done[day.date + '#' + i]) return false;
      return true;
    };
    for (let i = afterRunning + 1; i < blocks.length; i += 1) if (okIdx(i)) return day.date + '#' + i;
    for (let i = 0; i < blocks.length; i += 1) if (okIdx(i)) return day.date + '#' + i;
    return null;
  }

  /** فقط متن/نوار تایمر را تازه می‌کند (بدون ساخت دوبارهٔ دکمه‌ها) */
  function refreshTimerBox(day, block, idx) {
    const key = day.date + '#' + idx;
    const box = document.querySelector('[data-tmrbox="' + key + '"]');
    if (!box) return;
    const v = sessionView(day, idx, block);
    const bar = box.querySelector('[data-tmrbar]');
    if (bar) bar.style.width = v.pct + '%';
    const stat = box.querySelector('[data-tmrstat]');
    if (stat) {
      const over = Boolean(v.s.overtime);
      stat.textContent = v.label;
      stat.className = 'tmrstat' + (v.s.status === 'running' ? (over ? ' over' : ' on')
        : v.s.status === 'done' ? ' done' : v.s.status === 'awaiting' ? ' wait' : '');
    }
    const txt = box.querySelector('[data-tmrtxt]');
    if (txt) {
      const extra = v.s.status === 'paused' ? ' · ' + faNum(v.remain) + ' دقیقه مانده'
        : v.s.status === 'awaiting' ? ' · زمان برنامه‌ریزی‌شده پر شد'
          : (v.over > 0 ? ' · ' + faNum(v.over) + ' دقیقه اضافه‌کاری' : '');
      txt.textContent = faNum(v.elapsed) + ' از ' + faNum(v.s.plannedMinutes) + ' دقیقه' + extra;
    }
    box.classList.toggle('overtime', Boolean(v.s.overtime));
    box.classList.toggle('awaiting', v.s.status === 'awaiting');
  }

  /* ---------------- آلارم صوتی پایان زمان برنامه‌ریزی‌شده ---------------- */

  let audioCtx = null;
  function alarmBeep(times) {
    const n = times == null ? 3 : times;
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return false;
      if (!audioCtx) audioCtx = new AC();
      if (audioCtx.state === 'suspended' && audioCtx.resume) audioCtx.resume();
      for (let i = 0; i < n; i += 1) {
        const t0 = audioCtx.currentTime + i * 0.55;
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(880, t0);
        osc.frequency.setValueAtTime(660, t0 + 0.18);
        gain.gain.setValueAtTime(0.0001, t0);
        gain.gain.exponentialRampToValueAtTime(0.28, t0 + 0.03);
        gain.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.34);
        osc.connect(gain); gain.connect(audioCtx.destination);
        osc.start(t0); osc.stop(t0 + 0.36);
      }
      return true;
    } catch (e) { return false; }
  }

  /* ---------------- منوی شناور (تأیید / پرسش) ---------------- */

  let modalResolve = null;
  function openModal(opts) {
    const box = $('modal');
    if (!box) return Promise.resolve(false);
    const o = opts || {};
    $('modalTitle').textContent = o.title || '';
    $('modalBody').innerHTML = o.body || '';
    const ok = $('modalOk');
    const cancel = $('modalCancel');
    ok.textContent = o.okText || 'تأیید';
    cancel.textContent = o.cancelText || 'انصراف';
    ok.className = 'btn ' + (o.danger ? 'danger' : 'primary');
    cancel.style.display = o.hideCancel ? 'none' : '';
    box.classList.add('show');
    box.setAttribute('aria-hidden', 'false');
    return new Promise((resolve) => {
      modalResolve = (val) => {
        box.classList.remove('show');
        box.setAttribute('aria-hidden', 'true');
        modalResolve = null;
        resolve(val);
      };
      ok.onclick = () => modalResolve(true);
      cancel.onclick = () => modalResolve(false);
    });
  }
  function closeModal(val) { if (modalResolve) modalResolve(Boolean(val)); }

  /* دکمهٔ پایان فصل: تأیید می‌گیرد، بعد بلوک را «تمام‌شده» می‌کند */
  async function closeChapter(key) {
    if (!DP || !state.plan) return;
    const f = findBlock(state.plan, key);
    if (!f.block) return;
    const cur = sessionOf(f.day, f.idx, f.block);
    const done = DP.elapsedMinutes(cur, nowMs());
    const planned = cur.plannedMinutes;
    const body = '<div class="modal-note">' +
      '<b>' + esc(f.block.subjectName || '') + ' · ' + esc(f.block.topic || '') + '</b><br>' +
      'زمان این بلوک: ' + faNum(planned) + ' دقیقه · تا حالا: ' + faNum(done) + ' دقیقه' +
      (done < planned ? '<br><span class="modal-err">' + faNum(planned - done) + ' دقیقه از زمان برنامه‌ریزی‌شده باقی مانده است.</span>' : '') +
      '</div><div style="font-size:12.5px">آیا مطمئنی این بخش را تمام کردی؟ بعد از تأیید، این فصل «تمام‌شده» ثبت می‌شود.</div>';
    const yes = await openModal({ title: 'پایان فصل — تأیید', body: body, okText: 'بله، تمام شد', cancelText: 'نه، ادامه می‌دهم' });
    if (!yes) return;
    const next = DP.closeConfirmed(cur, nowMs());
    sessions()[key] = next;
    state.done[key] = true;
    persist();
    try { renderHomeToday(); } catch (e) { /* بی‌صدا */ }
    try { if ($('dayView') && state.selectedDay != null) renderDay(state.selectedDay); } catch (e) { /* بی‌صدا */ }
    toast('فصل «' + (f.block.topic || '') + '» تمام‌شده ثبت شد ✓');
  }

  /* وقتی زمان برنامه‌ریزی‌شده پر شد: آلارم + پرسش «هنوز مشغولم؟» */
  async function askOvertime(key) {
    if (!DP || !state.plan) return;
    const f = findBlock(state.plan, key);
    if (!f.block) return;
    const cur = sessionOf(f.day, f.idx, f.block);
    if (cur.status !== 'awaiting' || cur.awaitAsked) return;
    sessions()[key] = Object.assign({}, cur, { awaitAsked: true });
    alarmBeep(3);
    const yes = await openModal({
      title: '⏰ زمان برنامه‌ریزی‌شدهٔ این فصل تمام شد',
      body: '<div class="modal-note"><b>' + esc(f.block.subjectName || '') + ' · ' + esc(f.block.topic || '') + '</b><br>' +
        'زمانی که موتور برای این فصل لازم دیده بود: ' + faNum(cur.plannedMinutes) + ' دقیقه — پر شد.<br>' +
        'اگر هنوز مشغول همین بخشی، بگو تا تایمر ادامه پیدا کند و خودش بعداً بسته شود.</div>' +
        '<div style="font-size:12.5px">هنوز مشغول درس‌خواندنِ همین بخش هستی؟</div>',
      okText: 'بله، هنوز می‌خوانم',
      cancelText: 'نه، تمام شد',
    });
    if (yes) {
      sessions()[key] = DP.answerStillStudying(sessions()[key], nowMs());
      toast('تایمر ادامه پیدا کرد — هر وقت تمام شد «پایان فصل» را بزن.');
    } else {
      sessions()[key] = DP.answerAway(sessions()[key], nowMs());
      state.done[key] = true;
      toast('این فصل با زمان برنامه‌ریزی‌شده بسته شد.');
    }
    persist();
    try { renderHomeToday(); } catch (e) { /* بی‌صدا */ }
    try { if ($('dayView') && state.selectedDay != null) renderDay(state.selectedDay); } catch (e) { /* بی‌صدا */ }
  }

  /* وقتی کاربر به برنامه برگشت و بلوکِ منتظر جواب داشتیم: بپرس در این مدت می‌خواند یا نه */
  async function askUnattended() {
    if (!DP) return;
    const pend = awaitingSessions();
    if (!pend.length) return;
    const key = pend[0].key;
    const f = pend[0];
    const cur = sessions()[key];
    const waitedMin = Math.max(1, Math.round((nowMs() - (cur.awaitSince || nowMs())) / 60000));
    const yes = await openModal({
      title: 'به برنامه برگشتی — یک سؤال',
      body: '<div class="modal-note"><b>' + esc(f.block.subjectName || '') + ' · ' + esc(f.block.topic || '') + '</b><br>' +
        'تایمر از ' + faNum(waitedMin) + ' دقیقه پیش منتظر جواب ماند (زمان برنامه‌ریزی‌شده پر شده بود).<br>' +
        'در این مدت مشغول همین درس بودی یا برنامه را رها کردی و رفتی؟</div>',
      okText: 'بله، درس می‌خواندم',
      cancelText: 'نه، رفته بودم',
    });
    if (yes) {
      sessions()[key] = DP.answerStillStudying(sessions()[key], nowMs());
      toast('این ' + faNum(Math.min(waitedMin, DP.MAX_CREDIT_MIN)) + ' دقیقه به زمان مطالعه اضافه شد.');
    } else {
      sessions()[key] = DP.answerAway(sessions()[key], nowMs());
      state.done[key] = true;
      toast('زمانِ نبودنت حساب نشد. بقیهٔ کارهای امروز را می‌توانی با «بستن روز» جبران کنی.');
    }
    persist();
    try { renderHomeToday(); } catch (e) { /* بی‌صدا */ }
  }

  /** بلوک‌هایی که «منتظر پاسخ»اند */
  function awaitingSessions() {
    const out = [];
    const plan = state.plan;
    if (!plan) return out;
    Object.keys(state.sessions || {}).forEach((key) => {
      const s = state.sessions[key];
      if (!s || s.status !== 'awaiting') return;
      const f = findBlock(plan, key);
      if (f.block) out.push({ key: key, block: f.block, session: s });
    });
    return out;
  }

  function applyTimerAction(key, action) {
    if (!DP || !state.plan) return;
    const f = findBlock(state.plan, key);
    if (!f.block) return;
    if (action === 'close') { closeChapter(key); return; }
    const cur = sessionOf(f.day, f.idx, f.block);
    let next = cur;
    if (action === 'start') next = DP.start(cur, nowMs());
    else if (action === 'pause') next = DP.pause(cur, nowMs());
    else if (action === 'resume') next = DP.resume(cur, nowMs());
    else if (action === 'awaitYes') next = DP.answerStillStudying(cur, nowMs());
    else if (action === 'awaitNo') next = DP.answerAway(cur, nowMs());
    else if (action === 'finish') next = DP.finish(cur, nowMs());
    else if (action === 'reset') next = DP.newSession(f.block);
    sessions()[key] = next;
    if (next.status === 'done') state.done[key] = true;
    if (next.status !== 'done' && state.done[key]) delete state.done[key];
    persist();
    try { renderHomeToday(); } catch (e) { /* بی‌صدا */ }
    try { renderDayStartUI(); } catch (e) { /* بی‌صدا */ }
    try { if ($('dayView') && state.selectedDay != null) renderDay(state.selectedDay); } catch (e) { /* بی‌صدا */ }
    if (action === 'start' || action === 'resume') {
      const info = chapterInfoOf(f.block);
      const imp = info ? Math.max(1, Math.min(5, Math.round(info.imp))) : 0;
      toast((action === 'resume' ? 'ادامهٔ ' : 'شروع شد: ') + (f.block.subjectName || '') +
        (imp ? ' · اهمیت فصل ' + faNum(imp) + ' از ۵' + (info.q ? ' · ≈' + faNum(Math.round(info.q)) + ' سؤال کنکور' : '') : ''));
    }
    if (action === 'pause') toast('تایمر متوقف شد — هر وقت خواستی «ادامه» را بزن.');
    if (action === 'resume') toast('ادامهٔ همان بلوک — زمان قبلی حفظ شده است.');
    if (action === 'awaitYes') toast('تایمر ادامه پیدا کرد.');
    if (action === 'awaitNo') toast('بلوک با زمان برنامه‌ریزی‌شده بسته شد.');
  }

  document.addEventListener('click', (ev) => {
    const b = ev.target.closest ? ev.target.closest('[data-tmr]') : null;
    if (!b) return;
    ev.preventDefault();
    applyTimerAction(b.dataset.key, b.dataset.tmr);
  });

  /* ---------------- حلقهٔ یک‌ثانیه‌ای تایمرها ---------------- */

  let lastTickAt = 0;
  function tickTimers() {
    const plan = state.plan;
    if (!plan) return;
    const t = todayIso();
    const day = findDay(plan, t);
    if (!day) return;
    const now = nowMs();
    const keys = Object.keys(state.sessions || {});
    let needRerender = false;
    keys.forEach((key) => {
      if (key.indexOf(day.date + '#') !== 0) return;
      const idx = Number(key.split('#')[1]);
      const block = (day.blocks || [])[idx];
      if (!block) return;
      let s = state.sessions[key];
      if (!s) return;
      /* وقتِ تمام‌شدنِ زمان برنامه‌ریزی‌شده */
      if (s.status === 'running' && DP && DP.plannedReached(s, now)) {
        state.sessions[key] = DP.toAwaiting(s, now);
        needRerender = true;
        alarmBeep(3);
        askOvertime(key);
        return;
      }
      if (s.status === 'running' || s.status === 'paused' || s.status === 'awaiting') {
        refreshTimerBox(day, block, idx);
      }
    });
    if (needRerender) {
      try { renderHomeToday(); } catch (e) { /* بی‌صدا */ }
    }
    /* هر ۳۰ ثانیه یک‌بار ذخیره، تا با بستن ناگهانی چیزی از دست نرود */
    if (now - lastTickAt > 30000) {
      lastTickAt = now;
      try { persist(); } catch (e) { /* بی‌صدا */ }
    }
  }
  setInterval(() => { try { tickTimers(); } catch (e) { /* بی‌صدا */ } }, 1000);

  /* قلاب تست خودکار رابط کاربری (در UI دیده نمی‌شود) */
  try {
    window.__revalTest = {
      sessions: () => state.sessions,
      plan: () => state.plan,
      awaiting: awaitingSessions,
      tick: tickTimers,
      reconcile: reconcileSessions,
      askOvertime: askOvertime,
      askUnattended: askUnattended,
      renderHomeToday: renderHomeToday,
      /* شروع را به عقب می‌برد تا تایمر از سقف برنامه‌ریزی‌شده بگذرد */
      rewind: (key, minutesAgo) => {
        const st = state.sessions[key];
        if (!st) return false;
        state.sessions[key] = Object.assign({}, st, {
          status: 'running', since: nowMs() - minutesAgo * 60000, accumMs: 0, awaitSince: null, awaitAsked: false,
        });
        return true;
      },
      /* شبیه‌سازی: آلارم در نبودِ کاربر اجرا شده و او جواب نداده */
      silentAwaiting: (key) => {
        const st = state.sessions[key];
        if (!st) return false;
        state.sessions[key] = Object.assign({}, DP.toAwaiting(st, nowMs()), { awaitAsked: true });
        return true;
      },
      /* ۲.۸.۱۱: باز کردن «برنامهٔ من» روی یک روزِ مشخص (برای تست و اسکرین‌شات) */
      openDayIndex: (idx) => {
        const plan = state.plan;
        if (!plan || !plan.days[idx]) return false;
        state.week = Math.floor(idx / 7);
        state.selectedDay = idx;
        renderWeek();
        return true;
      },
      /* نمای «برنامهٔ من» را روی امروز باز می‌کند (برای اسکرین‌شات) */
      openToday: () => {
        const plan = state.plan;
        if (!plan) return false;
        const t = todayIso();
        let idx = plan.days.findIndex((d) => d.date === t);
        if (idx < 0) idx = 0;
        state.week = Math.floor(idx / 7);
        state.selectedDay = idx;
        renderWeek();
        return true;
      },
      firstKey: () => {
        const t = todayIso();
        const day = findDay(state.plan, t);
        if (!day) return null;
        const i = firstTaskIndex(day);
        return (i == null || i < 0) ? null : day.date + '#' + i;
      },
      /* v2.8.6: خواندن درس‌های تیک‌خوردهٔ ردیف آزمون (برای تست) */
      readExamsDemo: () => JSON.stringify((readExams() || []).map((e) => (e.subjectIds || []).join(',')).filter(Boolean).join('|').split(',')),
      /* v2.8.6: خواندن مهلت‌های کتابی (برای تست) */
      readBookDeadlinesDemo: () => JSON.stringify(readBookDeadlines()),
      /* v2.8.3: شبیه‌سازی دادهٔ قدیمی — درس‌ها بدون topicNames و بدون سطر ارزیابی.
         برای تست اینکه عنوان‌های کتاب از منبع رسمی پر می‌شوند. */
      oldDataDemo: () => {
        (state.coreSubjects || []).forEach((x) => { x.topicNames = null; x.chapterShort = null; x.chapterGrades = null; });
        (state.general || []).forEach((x) => { x.topicNames = null; x.chapterShort = null; x.chapterGrades = null; });
        Object.keys(state.chapters || {}).forEach((k) => { delete state.chapters[k]; });
        renderAssessment();
        const rows = (state.chapters || {})[((state.coreSubjects || [])[0] || {}).id] || [];
        return JSON.stringify({ subjects: assessSubjects().map((x) => ({ id: x.id, n: (x.topicNames || []).length })),
          first: rows.slice(0, 3).map((r) => r.name) });
      },
      /* عنوان‌هایی که در ارزیابی رندر شده‌اند (برای تست) */
      assessRows: (sid) => {
        const card = document.querySelector('[data-sid="' + sid + '"]');
        if (!card) return '[]';
        const trs = [...card.querySelectorAll('tbody tr')];
        return JSON.stringify(trs.slice(0, 4).map((tr) => ({
          badge: (tr.querySelector('.cn-badge') || {}).textContent || '',
          value: (tr.querySelector('input[data-cf=name]') || {}).value || '',
          ph: (tr.querySelector('input[data-cf=name]') || {}).placeholder || '',
        })));
      },
      /* v2.8.2: بازسازی سطرهای بدون عنوان با عنوان واقعی کتاب (برای تست) */
      repairDemo: () => {
        const sub = { id: 'x', general: false, grade: 'دوازدهم',
          topicNames: ['دهم · الگو و دنباله', 'دهم · مثلثات', 'دهم · توان‌ها و عبارت‌های جبری'] };
        const rows = [{ name: '', read: false, mastery: 0 },
          { name: 'فصل ۲', read: true, mastery: 50 },
          { read: false, mastery: 0 }];
        const before = rows.map((r) => String(r.name || ''));
        repairChapterRows(sub, rows, sub.topicNames);
        return JSON.stringify({ before, after: rows.map((r) => String(r.name || '')) });
      },
      /* v2.7: نمایش پنجرهٔ تغییرات برای اسکرین‌شات/تست */
      showChangelog: (fromVersion) => showChangelog(CL.since(fromVersion || '2.6.0'), { title: 'برنامه به‌روزرسانی شد' }),
      changelogEntries: (fromVersion) => CL.since(fromVersion || null).map((e) => e.version),
      seenVersion: () => state.seenVersion || null,
      /* ارتفاعِ محتوای صفحه و جای نوارِ اسکرول (برای تستِ «نوار سمت راست») */
      scrollSide: () => {
        const el = $('mainScroll');
        if (!el) return null;
        const r = el.getBoundingClientRect();
        const sbw = el.offsetWidth - el.clientWidth;      // پهنای نوار اسکرول
        const cs = getComputedStyle(el);
        return { dir: cs.direction, scrollbarWidth: sbw, canScroll: el.scrollHeight > el.clientHeight + 2,
          right: Math.round(window.innerWidth - r.right), gutterOnRight: sbw > 0 };
      },
    };
  } catch (e) { /* بی‌صدا */ }

  /**
   * آشتی‌سازی وضعیت تایمرها هنگام باز شدن برنامه:
   * اگر برنامه بسته بوده و تایمر «در حال اجرا» مانده، زمان تا سقف برنامه‌ریزی‌شده حساب می‌شود
   * و بلوک وارد «منتظر پاسخ» می‌شود تا در اولین فعالیت کاربر از او بپرسیم.
   */
  function reconcileSessions() {
    if (!DP || !state.plan) return;
    const now = nowMs();
    Object.keys(state.sessions || {}).forEach((key) => {
      const s = state.sessions[key];
      if (!s || s.status !== 'running') return;
      const f = findBlock(state.plan, key);
      if (!f.block) return;
      const planned = DP.newSession(f.block).plannedMinutes || s.plannedMinutes || 0;
      const elapsed = DP.elapsedMinutes(s, now);
      if (elapsed <= planned) return;
      state.sessions[key] = Object.assign({}, s, {
        status: 'awaiting',
        accumMs: Math.min(planned, elapsed) * 60000,
        since: null,
        awaitSince: now,
        awaitAsked: false,
        plannedMinutes: planned || s.plannedMinutes,
      });
    });
  }

  /* اولین فعالیت کاربر بعد از بازگشت: اگر بلوکی منتظر جواب است، بپرس */
  let activityArmed = true;
  function onUserActivity() {
    if (!activityArmed) return;
    const pend = awaitingSessions();
    if (!pend.length) return;
    const s = sessions()[pend[0].key] || {};
    if (s && s.awaitAsked) return;
    activityArmed = false;
    setTimeout(() => { activityArmed = true; }, 8000);
    askUnattended();
  }
  ['pointerdown', 'keydown'].forEach((evt) => document.addEventListener(evt, onUserActivity, true));
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) onUserActivity();
  });
  window.addEventListener('focus', onUserActivity);

  /* ---------- شروع روز (یک دکمه) ---------- */

  function nowHM() {
    const d = new Date();
    return pad(d.getHours()) + ':' + pad(d.getMinutes());
  }

  /** اولین تسک قابل‌اجرای امروز (بلوک درسی که نه تمام شده و نه ثابت است) */
  function firstTaskIndex(day) {
    if (!day) return -1;
    const blocks = day.blocks || [];
    for (let i = 0; i < blocks.length; i += 1) {
      const b = blocks[i];
      if (!b || b.kind === 'routine' || b.kind === 'exam') continue;
      if (DP && DP.isPinned(b) && b.kind !== 'emergency') continue;
      const key = day.date + '#' + i;
      const st = (state.sessions || {})[key];
      if (st && st.status === 'done') continue;
      return i;
    }
    return -1;
  }

  function renderDayStartUI() {
    const card = $('homeDayCard');
    if (!card) return;
    const plan = state.plan;
    if (!plan) { card.style.display = 'none'; return; }
    card.style.display = 'block';
    const t = todayIso();
    const ov = (state.dayStarts || {})[t] || null;
    if ($('homeDayState')) {
      $('homeDayState').textContent = 'ساعت پیش‌فرض بیداری: ' + faNum(state.wakeTime || '۰۷:۰۰') +
        (ov ? ' · امروز از ' + faNum(ov) + ' شروع شده' : '');
    }
    const inp = $('startDayTime');
    if (inp && document.activeElement !== inp) inp.value = faNum(ov || state.wakeTime || '۰۷:۰۰');
    const note = $('dayStateNote');
    const day = findDay(plan, t);
    if (note) {
      if (!day) {
        note.textContent = 'امروز خارج از بازهٔ برنامه است. با «ساخت برنامه» بازه را به‌روز کن.';
      } else if (ov) {
        const idx = firstTaskIndex(day);
        const nxt = idx >= 0 ? day.blocks[idx] : null;
        note.innerHTML = '✓ امروز از ساعت <b>' + faNum(ov) + '</b> شروع شد و برنامهٔ همین روز بازچیده شد. ' +
          (nxt ? 'تسک جاری: <b>' + esc(nxt.subjectName) + ' · ' + esc(nxt.topic) + '</b> (ساعت ' + faNum(nxt.start) + ').'
            : (day.rest ? 'امروز روز استراحت است؛ تسکی برای شروع نمانده.'
              : 'همهٔ تسک‌های امروز انجام شده‌اند؛ چیزی برای شروع نمانده.')) +
          ' کلاس‌ها، روال ثابت و آزمون‌ها جابه‌جا نشدند.';
      } else {
        note.textContent = '';
      }
    }
  }

  /** بازساخت برنامه با تغییرات اجرایی (شروع روز / اضطراری / انتقال جامانده‌ها) */
  function rebuildWith(mutate, msg) {
    let cfg;
    try { cfg = collectConfig(); } catch (e) { cfg = JSON.parse(JSON.stringify(state.config || {})); }
    cfg = Object.assign({}, cfg, {
      dayStarts: Object.assign({}, state.dayStarts || {}),
      emergency: (state.emergency || []).slice(),
      routinePinned: state.routinePinned === true,
      routines: (state.routines || cfg.routines || []).slice(),
      wakeTime: state.wakeTime || cfg.wakeTime,
    });
    if (mutate) mutate(cfg);
    try {
      state.plan = engine.createPlan(cfg);
      state.config = cfg;
      state.week = 0;
      state.selectedDay = null;
      renderPlan();
      renderReport();
      renderHome();
      persist();
      if (msg) toast(msg);
      return true;
    } catch (err) {
      toast('خطا در بازچینی: ' + err.message);
      return false;
    }
  }

  /**
   * «بیدار شدم — شروع روز»: ساعت واقعی همین لحظه، بازچینی فقط امروز،
   * و بعد شروع خودکار اولین تسک.
   */
  function startDayNow(atTime) {
    if (!state.plan) return toast('اول برنامه را بساز.');
    const t = todayIso();
    const v = normTime(atTime || nowHM()) || nowHM();
    state.dayStarts = state.dayStarts || {};
    state.dayStarts[t] = v;
    const ok = rebuildWith((cfg) => {
      if (cfg.startDate > t) cfg.startDate = t;
      /* ساعت مطالعهٔ امروز = از همین حالا تا پایان پنجرهٔ آزاد */
      cfg.dayStarts = Object.assign({}, cfg.dayStarts, { [t]: v });
    }, null);
    if (!ok) return;
    const day = findDay(state.plan, t);
    if (!day) return toast('امروز در بازهٔ برنامه نیست.');
    const idx = firstTaskIndex(day);
    if (idx < 0) return toast('روز از ساعت ' + faNum(v) + ' چیده شد؛ تسک بازی نمانده است.');
    const block = day.blocks[idx];
    const key = day.date + '#' + idx;
    const cur = sessionOf(day, idx, block);
    sessions()[key] = DP ? DP.start(cur, nowMs()) : cur;
    persist();
    try { renderHomeToday(); } catch (e) { /* بی‌صدا */ }
    try { renderDayStartUI(); } catch (e) { /* بی‌صدا */ }
    toast('روز از ساعت ' + faNum(v) + ' شروع شد — «' + (block.subjectName || '') + '» شروع شد ✓');
    return true;
  }

  if ($('startDayBtn')) $('startDayBtn').addEventListener('click', () => {
    startDayNow(nowHM());
  });

  if ($('startDayAdjust')) $('startDayAdjust').addEventListener('click', () => {
    const row = $('startDayExact');
    if (!row) return;
    row.style.display = row.style.display === 'none' ? 'flex' : 'none';
    if (row.style.display !== 'none' && $('startDayTime')) { $('startDayTime').focus(); $('startDayTime').select && $('startDayTime').select(); }
  });

  if ($('startDayAt')) $('startDayAt').addEventListener('click', () => {
    startDayNow(normTime(($('startDayTime') && $('startDayTime').value) || '') || nowHM());
  });

  if ($('resetDayBtn')) $('resetDayBtn').addEventListener('click', () => {
    if (!state.plan) return toast('اول برنامه را بساز.');
    const t = todayIso();
    if (state.dayStarts) delete state.dayStarts[t];
    rebuildWith(null, 'امروز به ساعت پیش‌فرض برگشت.');
  });

  if ($('closeDayBtn')) $('closeDayBtn').addEventListener('click', () => {
    if (!state.plan) return toast('اول برنامه را بساز.');
    const t = todayIso();
    const day = findDay(state.plan, t);
    if (!day) return toast('امروز در بازهٔ برنامه نیست.');
    const unf = DP ? DP.unfinished(day, state.sessions || {}, { skipUntouched: false }) : [];
    if (!unf.length) return toast('کار جامانده‌ای امروز نیست — عالی.');
    const carry = DP ? DP.toCarryOver(unf) : [];
    if (!carry.length) return toast('چیزی برای انتقال نیست.');
    unf.forEach((x) => { if (state.sessions) delete state.sessions[x.key]; });
    rebuildWith((cfg) => {
      cfg.carryOver = (cfg.carryOver || []).concat(carry);
      if (cfg.startDate > t) cfg.startDate = t;
    }, faNum(carry.length) + ' کار جامانده با اولویت به روزهای بعد منتقل شد ✓');
    if ($('dayStateNote')) {
      $('dayStateNote').textContent = faNum(carry.length) + ' کار جامانده (مجموع ' +
        faNum(Math.round(carry.reduce((a, c) => a + c.minutes, 0) / 60 * 10) / 10) + ' ساعت) به روزهای بعد منتقل شد.';
    }
  });

  /* ---------- آیتم‌های اضطراری ---------- */

  function emergencySubjects() {
    const plan = state.plan;
    const list = [];
    if (plan && plan.summary && plan.summary.bySubject) {
      plan.summary.bySubject.forEach((s) => list.push({ id: s.id, name: s.name, chapters: null }));
    } else {
      (state.coreSubjects || []).forEach((s) => list.push({ id: s.id, name: s.name, chapters: s.chapters }));
    }
    return list;
  }

  function renderEmergencyUI() {
    const card = $('emergencyCard');
    if (!card) return;
    if (!state.plan) { card.style.display = 'none'; return; }
    card.style.display = 'block';

    const box = $('emList');
    if (!box) return;
    const items = state.emergency || [];
    if (!items.length) {
      box.innerHTML = '<div class="muted" style="font-size:11.5px">هنوز آیتمی ثبت نشده. ' +
        'روی «+ ثبت آیتم اضطراری» بزن تا فرم باز شود.</div>';
      return;
    }
    const placed = {};
    ((state.plan.summary && state.plan.summary.emergency) || []).forEach((e) => { placed[e.id] = e; });
    box.innerHTML = items.map((e) => {
      const p = placed[e.id];
      return '<div class="issue ' + (p ? 'info' : 'warn') + '" style="cursor:default">' +
        '<span class="mark">' + (p ? '✓' : '!') + '</span>' +
        '<div class="body"><div class="ttl">' + esc(e.title || (e.subjectName || 'آیتم اضطراری')) +
        (e.scope === 'week' ? ' · این هفته (اولین فرصت)' : ' · امروز ' + faNum(e.time || '')) + '</div>' +
        '<div class="det">' + (p
          ? 'چیده شد: ' + faNum(J ? J.fmt(p.date) : p.date) + ' · ساعت ' + padHM(p.start) + ' تا ' + padHM(p.end) +
            ' (' + faNum(p.minutes) + ' دقیقه)'
          : 'هنوز در برنامه جا نگرفته — یا بازهٔ برنامهٔ فعلی تمام شده، یا آن روز جای کافی نبود.') + '</div></div>' +
        '<button class="btn ghost small" data-em-del="' + esc(e.id) + '">حذف</button></div>';
    }).join('');
    box.querySelectorAll('[data-em-del]').forEach((b) => {
      b.addEventListener('click', () => {
        state.emergency = (state.emergency || []).filter((x) => x.id !== b.dataset.emDel);
        rebuildWith(null, 'آیتم اضطراری حذف شد.');
      });
    });
  }

  function renderEmergencyChapters() {
    const sel = $('emChapter');
    if (!sel) return;
    const sub = ($('emSubject') && $('emSubject').value) || '';
    const plan = state.plan;
    const stat = plan && plan.summary && plan.summary.chapterStats ? plan.summary.chapterStats : [];
    const rows = stat.filter((c) => c.subjectId === sub);
    if (!rows.length) {
      sel.innerHTML = '<option value="">کل درس</option>';
      return;
    }
    sel.innerHTML = rows.map((c) =>
      '<option value="' + c.chapter + '">' + esc(c.label) +
      (c.ciTag ? ' · ' + esc(c.ciTag) : '') + '</option>').join('');
  }

  if ($('emSubject')) $('emSubject').addEventListener('change', renderEmergencyChapters);

  function openEmergencyModal() {
    if (!state.plan) return toast('اول برنامه را بساز.');
    const sel = $('emSubject');
    if (sel) {
      const subs = emergencySubjects();
      sel.innerHTML = subs.map((s) => '<option value="' + esc(s.id) + '">' + esc(s.name) + '</option>').join('');
    }
    renderEmergencyChapters();
    const t = $('emTime');
    if (t) t.value = padHM(nowHM());
    const box = $('emModal');
    if (box) { box.classList.add('show'); box.setAttribute('aria-hidden', 'false'); }
    if (sel && sel.focus) sel.focus();
  }
  function closeEmergencyModal() {
    const box = $('emModal');
    if (box) { box.classList.remove('show'); box.setAttribute('aria-hidden', 'true'); }
  }

  if ($('emAdd')) $('emAdd').addEventListener('click', openEmergencyModal);
  if ($('emCancel')) $('emCancel').addEventListener('click', closeEmergencyModal);
  if ($('emModal')) $('emModal').addEventListener('click', (ev) => {
    if (ev.target === $('emModal')) closeEmergencyModal();
  });

  function submitEmergency() {
    if (!state.plan) { closeEmergencyModal(); return toast('اول برنامه را بساز.'); }
    const sid = ($('emSubject') && $('emSubject').value) || '';
    const chapter = ($('emChapter') && $('emChapter').value) || '';
    const scope = ($('emScope') && $('emScope').value) === 'week' ? 'week' : 'today';
    const time = normTime(($('emTime') && $('emTime').value) || '') || nowHM();
    const minutes = clampNum(Number(numVal($('emMinutes'))) || 60, 20, 300);
    if (!sid) return toast('اول یک درس انتخاب کن.');
    const sub = emergencySubjects().find((s) => s.id === sid);
    const stat = (state.plan.summary.chapterStats || [])
      .find((c) => c.subjectId === sid && String(c.chapter) === String(chapter));
    const t = todayIso();
    const title = (sub ? sub.name : 'درس') + (stat ? ' · ' + stat.label : '');
    state.emergency = (state.emergency || []).concat([{
      id: 'E' + Date.now().toString(36),
      title: title,
      subjectId: sid,
      chapter: chapter === '' ? null : Number(chapter),
      scope: scope,
      date: t,
      time: time,
      minutes: minutes,
      done: false,
    }]);
    closeEmergencyModal();
    rebuildWith((cfg) => { if (cfg.startDate > t) cfg.startDate = t; },
      'آیتم اضطراری ثبت شد و برنامه دور آن بازچینی شد ✓');
  }

  if ($('emSubmit')) $('emSubmit').addEventListener('click', submitEmergency);

  /* ---------- آمادگی جدا: کنکور در برابر نهایی ---------- */

  function gaugeRow(label, value, color, hint) {
    const pct = clampNum(Math.round(value || 0), 0, 100);
    return '<div style="margin-bottom:10px">' +
      '<div class="row" style="justify-content:space-between;margin-bottom:4px">' +
        '<span style="font-size:11.5px">' + esc(label) + '</span>' +
        '<b style="font-size:12px">' + faNum(pct) + '٪</b></div>' +
      '<div class="acard-bar" style="height:8px"><i style="width:' + pct + '%;background:' + color + '"></i></div>' +
      (hint ? '<div class="muted" style="font-size:10.5px;margin-top:3px">' + esc(hint) + '</div>' : '') +
    '</div>';
  }

  function renderReadinessSplit(plan) {
    const box = $('readinessSplit');
    if (!box) return;
    const sm = plan && plan.summary ? plan.summary.readinessSplit : null;
    if (!sm) { box.innerHTML = '<div class="muted" style="font-size:12px">برنامه‌ای نیست.</div>'; return; }
    const k = sm.konkur || {};
    const f = sm.finals || {};
    const konkurCard =
      '<div class="card" style="margin:0;background:var(--panel2)">' +
        '<div class="row" style="justify-content:space-between;margin-bottom:8px">' +
          '<b style="font-size:13px">آمادگی کنکور</b>' +
          '<span class="chip">' + faNum(k.projected || 0) + '٪ برآورد پایان</span></div>' +
        gaugeRow('آمادگی فعلی (ضریب × تسلط فصل)', k.current || 0, '#4f46e5') +
        gaugeRow('پوشش فصل‌ها', k.coverage || 0, '#0ea5e9') +
        gaugeRow('پیشرفت تست زمان‌دار', k.testRatio || 0, '#10b981',
          faNum(k.testsDone || 0) + ' از ' + faNum(k.testsNeed || 0) + ' تست چیده‌شده') +
        '<div class="muted" style="font-size:10.5px;margin-top:6px">مبنای سنجش: ' + esc(k.basis || '') + '</div>' +
        '<ul class="notes" style="margin-top:6px">' +
          (k.method || []).map((m) => '<li>' + esc(m) + '</li>').join('') + '</ul>' +
      '</div>';
    const finalsCard =
      '<div class="card" style="margin:0;background:var(--panel2)">' +
        '<div class="row" style="justify-content:space-between;margin-bottom:8px">' +
          '<b style="font-size:13px">آمادگی امتحان نهایی</b>' +
          '<span class="chip">' + faNum(f.projected || 0) + '٪ برآورد پایان</span></div>' +
        gaugeRow('آمادگی فعلی (بارم × تسلط)', f.current || 0, '#d97706') +
        gaugeRow('پیشرفت کار برنامه', f.budgetRatio || 0, '#f59e0b',
          faNum(Math.round((f.minutes || 0) / 60 * 10) / 10) + ' ساعت چیده‌شده') +
        '<div class="muted" style="font-size:10.5px">میانگین نمرهٔ برآوردی درس‌ها: ' +
          faNum(Math.round((f.avgScore || 0) * 10) / 10) + ' از ۲۰</div>' +
        '<div class="muted" style="font-size:10.5px;margin-top:6px">مبنای سنجش: ' + esc(f.basis || '') + '</div>' +
        '<ul class="notes" style="margin-top:6px">' +
          (f.method || []).map((m) => '<li>' + esc(m) + '</li>').join('') + '</ul>' +
      '</div>';
    box.innerHTML = '<div class="grid g2" style="align-items:start">' + konkurCard + finalsCard + '</div>' +
      '<div class="muted" style="font-size:11px;margin-top:8px">' + esc(sm.note || '') + '</div>';
  }

  /* ---------- روال‌های ثابت روز ---------- */

  function routineDefaults() {
    return [
      { title: 'صبحانه', start: '08:00', minutes: 30 },
      { title: 'ناهار', start: '13:30', minutes: 45 },
      { title: 'شام', start: '20:00', minutes: 45 },
    ];
  }

  function renderRoutineRows(rows) {
    const box = $('routineRows');
    if (!box) return;
    const list = (rows && rows.length ? rows : state.routines || routineDefaults()).slice(0, 4);
    box.innerHTML = list.map((r, i) =>
      '<div><label>' + esc(r.title || ('روال ' + faNum(i + 1))) + '</label>' +
        '<div class="row" style="gap:6px">' +
          '<input class="tin" data-routine-time="' + i + '" value="' + faNum(r.start || '13:00') + '" inputmode="numeric" />' +
          '<input class="tin num" data-routine-min="' + i + '" value="' + faNum(r.minutes || 30) + '" inputmode="numeric" style="max-width:74px" />' +
          '<span class="muted" style="font-size:10.5px;align-self:center">دقیقه</span>' +
        '</div></div>').join('');
  }

  function readRoutines() {
    const base = (state.routines && state.routines.length ? state.routines : routineDefaults()).slice();
    const out = base.map((r, i) => {
      const tEl = document.querySelector('[data-routine-time="' + i + '"]');
      const mEl = document.querySelector('[data-routine-min="' + i + '"]');
      return {
        title: r.title,
        start: normTime(tEl ? tEl.value : r.start) || r.start || '13:00',
        minutes: clampNum(Number(numVal(mEl)) || r.minutes || 30, 5, 180),
        enabled: true,
      };
    });
    return out;
  }

  if ($('routinePinned')) {
    $('routinePinned').addEventListener('change', () => {
      state.routinePinned = $('routinePinned').checked;
      state.routines = readRoutines();
      try { persist(); } catch (e) { /* بی‌صدا */ }
      if (state.plan) rebuildWith(null, state.routinePinned
        ? 'روال‌های روز ثابت شدند و برنامه دور آن‌ها بازچینی شد.'
        : 'روال‌های روز از برنامه برداشته شدند.');
    });
  }

  function renderHome() {
    const st = stepStatus();
    const avail = readAvailabilityTotal();
    const ch = readChaptersRead();

    /* چیپ تیک روی نوار کنار */
    NAVS().forEach((nav) => {
      const step = Number(nav.dataset.step || 0);
      if (!step) return;
      const tick = nav.querySelector('.tick');
      const num = nav.querySelector('.num');
      const meta = STEPS_META.find((m) => m.n === step);
      const done = Boolean(st[step]);
      if (tick) tick.hidden = !done;
      if (num) {
        num.classList.toggle('done', done);
        num.classList.toggle('opt', !done && Boolean(meta && meta.optional));
      }
    });

    /* چک‌لیست خانه */
    const box = $('homeSteps');
    if (box) {
      const doneCount = STEPS_META.filter((m) => st[m.n]).length;
      const tag = $('homeProgressTag');
      if (tag) tag.textContent = faNum(doneCount) + ' از ۶';
      box.innerHTML = STEPS_META.map((m) => {
        const done = Boolean(st[m.n]);
        const cls = 'chkitem' + (done ? ' done' : (m.optional ? ' opt' : ''));
        return '<button class="' + cls + '" data-goto="' + m.view + '">' +
          '<span class="ic">' + (done ? '✓' : faNum(m.n)) + '</span>' +
          '<span class="tx"><b>' + m.title + '</b><small>' + (done ? 'تکمیل شد' : m.hint) + '</small></span>' +
          '<span class="go">' + (done ? 'ویرایش' : 'برو') + ' <span class="ar">‹</span></span></button>';
      }).join('');
      box.querySelectorAll('[data-goto]').forEach((b) => b.addEventListener('click', () => gotoView(b.dataset.goto)));
    }

    /* KPIهای خانه */
    const kpis = $('homeKpis');
    if (kpis) {
      let daysLeft = 0;
      try {
        const cfgStart = $('startDate') && $('startDate').dataset.iso;
        const cfgExam = $('examDate') && $('examDate').dataset.iso;
        if (cfgStart && cfgExam) daysLeft = Math.max(0, Math.round((new Date(cfgExam) - new Date(cfgStart)) / 86400000));
      } catch (e) { /* بی‌صدا */ }
      const items = [
        { v: faNum(avail) + ' ساعت', l: 'جمع ساعت هفتگی' },
        { v: faNum(daysLeft) + ' روز', l: 'تا آزمون هدف' },
        { v: faNum(ch.read) + ' از ' + faNum(ch.all), l: 'فصل خوانده‌شده' },
        { v: faNum(readFinalsCount()), l: 'درس سوابق' },
      ];
      kpis.innerHTML = items.map((i) => '<div class="stat"><b>' + i.v + '</b><span>' + i.l + '</span></div>').join('');
    }

    /* وضعیت برنامه */
    const lead = $('homePlanLead');
    const stats = $('homePlanStats');
    if (lead && stats) {
      if (state.plan && state.plan.summary) {
        const sm = state.plan.summary;
        const cov = sm.coverage || {};
        const firstDay = state.plan.days[0] ? state.plan.days[0].date : '';
        const lastDay = state.plan.days[state.plan.days.length - 1] ? state.plan.days[state.plan.days.length - 1].date : '';
        const fmt = (iso) => (iso && J && J.fmt) ? J.fmt(iso) : (iso || '');
        lead.textContent = 'برنامهٔ فعلی ساخته شده است — ' + faNum(state.plan.days.length) + ' روز، از ' +
          fmt(firstDay) + ' تا ' + fmt(lastDay) + '.';
        stats.innerHTML = [
          { v: faNum(Math.round(cov.coverageRatio || 0)) + '٪', l: 'پوشش فصل‌ها' },
          { v: faNum(cov.testsPlanned || 0), l: 'تست چیده‌شده' },
          { v: faNum(Math.round((sm.totalMinutes || 0) / 60)) + ' ساعت', l: 'زمان کل' },
        ].map((i) => '<div class="stat"><b>' + i.v + '</b><span>' + i.l + '</span></div>').join('');
      } else {
        stats.innerHTML = '';
      }
    }

    /* کارت‌های خطا در خانه + برنامهٔ امروز و روزهای آینده */
    try { renderIssues(issuesOf(state.plan), $('homeIssues')); } catch (e) { /* بی‌صدا */ }
    try { renderDayStartUI(); } catch (e) { /* بی‌صدا */ }
    try { renderEmergencyUI(); } catch (e) { /* بی‌صدا */ }
    try { renderReadinessSplit(state.plan); } catch (e) { /* بی‌صدا */ }
    try { renderHomeToday(); } catch (e) { /* بی‌صدا */ }
  }

  /* ══════════════════════════════════════════════════════════════════
     خانه: برنامهٔ امروز + روزهای آینده (با تاریخ شمسی و ساعت مطالعه)
     ══════════════════════════════════════════════════════════════════ */
  function dayMinutes(d) {
    if (!d) return 0;
    if (d.plannedMinutes) return d.plannedMinutes;
    return (d.blocks || []).reduce((a, b) => a + Math.max(0, (b.end || 0) - (b.start || 0)), 0);
  }
  function dayTests(d) {
    return (d.blocks || []).reduce((a, b) => a + (b.practiceCount || 0), 0);
  }
  /** «۰۹:۳۰» یا «09:30» → دقیقه از نیمه‌شب (۶۹۰) */
  function hmMin(v) {
    if (typeof v === 'number' && v >= 0) return v;
    const en = faToEn(String(v == null ? '' : v));
    const m = /(\d{1,2}):(\d{2})/.exec(en);
    if (!m) return 0;
    return (Number(m[1]) % 24) * 60 + Number(m[2]);
  }

  function hoursFa(mins) {
    const h = Math.round((mins / 60) * 10) / 10;
    return faNum(h);
  }

  /** رفتن به یک روز مشخص در تب «برنامهٔ من» */
  function openDay(dateIso) {
    if (!state.plan) return;
    const idx = state.plan.days.findIndex((d) => d.date === dateIso);
    if (idx < 0) return;
    state.week = Math.floor(idx / 7);
    state.selectedDay = idx;
    gotoView('plan');
    const body = $('planBody');
    if (body) body.style.display = 'block';
    renderWeek();
    const dv = $('dayView');
    if (dv) { try { dv.scrollIntoView({ behavior: 'smooth', block: 'start' }); } catch (e) { /* بی‌صدا */ } }
  }

  function renderHomeToday() {
    const card = $('homeTodayCard');
    if (!card) return;
    const plan = state.plan;
    if (!plan || !plan.days || !plan.days.length) { card.style.display = 'none'; return; }
    card.style.display = 'block';

    const todayIso = iso(new Date());
    let idx = plan.days.findIndex((d) => d.date === todayIso);
    const isToday = idx >= 0;
    if (!isToday) {
      /* امروز خارج از بازهٔ برنامه است: نزدیک‌ترین روز آینده، وگرنه اولین روز */
      idx = plan.days.findIndex((d) => d.date > todayIso);
      if (idx < 0) idx = 0;
    }
    const d = plan.days[idx];
    const mins = dayMinutes(d);
    const blocks = (d.blocks || []).filter((b) => b.kind !== 'exam');
    const tests = dayTests(d);

    const restDay = blocks.length === 0 && (d.isRestDay || d.isOff || !(d.blocks || []).length);
    const list = $('homeTodayList');
    /* عنوان و برچسب تاریخ: «امروز» فقط یک‌بار نوشته می‌شود */
    if ($('homeTodayTitle')) {
      $('homeTodayTitle').textContent = isToday ? 'برنامهٔ امروز' : 'برنامهٔ نزدیک‌ترین روز';
    }
    if ($('homeTodayDate')) {
      $('homeTodayDate').textContent = jDateFull(d.date) + ' · ' + d.weekday +
        (restDay ? ' · روز استراحت' : '') + (isToday ? '' : ' (نه امروز)');
    }
    if ($('homeTodayStats')) {
      /* روز استراحت: به‌جای «۰ ساعت» که نگران‌کننده است، پیام روشن بده */
      if (restDay) {
        const nxt = plan.days.slice(idx + 1).find((x) => (x.blocks || []).length);
        $('homeTodayStats').innerHTML = [
          { v: 'استراحت', l: isToday ? 'امروز' : 'این روز' },
          { v: nxt ? hoursFa(dayMinutes(nxt)) + ' ساعت' : '—', l: nxt ? 'روز بعدی (' + nxt.weekday + ')' : 'روز بعدی' },
          { v: nxt ? jDateFull(nxt.date) : '—', l: 'تاریخ روز بعدی' },
          { v: faNum(plan.summary.coverage.coverageRatio) + '٪', l: 'پوشش کل برنامه' },
        ].map((i) => '<div class="stat"><b>' + i.v + '</b><span>' + i.l + '</span></div>').join('');
        if (list) {
          list.innerHTML = '<div class="issue info" style="cursor:default"><span class="mark">i</span><div class="body">' +
            '<div class="ttl">' + (isToday ? 'امروز' : 'این روز') + ' روز استراحت هفتگی است</div>' +
            '<div class="det">روز استراحت را خودت در «زمان‌های تو» انتخاب کرده‌ای. اگر می‌خواهی امروز هم بخوانی، ' +
            'روز استراحت را عوض کن یا روی «برنامهٔ کامل» برو و به روز بعد سر بزن.</div></div></div>';
        }
        renderAhead(plan, idx);
        return;
      }

      /* شروع/پایان بازهٔ مطالعه — ساعت‌ها رشته‌اند («۰۹:۰۰») و باید به دقیقه تبدیل شوند */
      const lastEnd = blocks.reduce((a, b) => Math.max(a, hmMin(b.end)), 0);
      const firstStart = blocks.reduce((a, b) => Math.min(a, hmMin(b.start)), 1440);
      $('homeTodayStats').innerHTML = [
        { v: hoursFa(mins) + ' ساعت', l: 'مدت مطالعهٔ این روز' },
        { v: faNum(blocks.length), l: 'بلوک کاری' },
        { v: faNum(tests), l: 'تست هدف' },
        { v: blocks.length ? timeRangeShort(String(Math.floor(firstStart / 60)).padStart(2, '0') + ':' + String(firstStart % 60).padStart(2, '0'), String(Math.floor(lastEnd / 60)).padStart(2, '0') + ':' + String(lastEnd % 60).padStart(2, '0')) : '—', l: 'بازهٔ مطالعه' },
      ].map((i) => '<div class="stat"><b>' + i.v + '</b><span>' + i.l + '</span></div>').join('');
    }

    /* فهرست فشردهٔ بلوک‌های امروز */
    if (list) {
      const evts = (d.events || []).map((e) =>
        '<div class="evt' + (e.type === 'exam' ? ' exam' : '') + '"><span>' + (e.type === 'exam' ? '📝' : '📌') + '</span>' +
        '<b>' + esc(e.title) + '</b><span class="t">' + timeRange(e.start, e.end) + '</span></div>').join('');
      const items = blocks.slice(0, 8).map((b) => {
        const bi = (d.blocks || []).indexOf(b);
        return '<div class="' + blockStateClass(d, bi) + '" style="grid-template-columns:112px 1fr">' +
          doneTick(d, bi) +
          '<div class="time">' + timeRange(b.start, b.end) + '<small>' + durationFa(b.minutes || 0) + '</small></div>' +
          '<div><div class="t">' + esc(b.subjectName) +
            (b.kind === 'routine' ? '' : ' ' + chapterLine(b)) + '</div>' +
          '<div class="row" style="gap:6px;flex-wrap:wrap;margin-top:3px">' +
            '<span class="tech">' + esc(faNum(b.kindLabel || '')) + '</span>' + chapterBadge(b) +
          '</div>' +
          timerHtml(d, b, bi) + '</div>' +
          (b.kind === 'routine' ? '' : goalsHtml(b)) + '</div>';
      }).join('');
      const more = blocks.length > 8
        ? '<div class="muted" style="font-size:11px;margin-top:6px">و ' + faNum(blocks.length - 8) + ' بلوک دیگر — در «برنامهٔ من» ببین.</div>'
        : '';
      list.innerHTML = evts + items + more || '<div class="muted" style="font-size:12px">این روز بلوکی ندارد (استراحت یا تعطیل).</div>';
    }

    renderAhead(plan, idx);
  }

  /* نوار روزهای آینده */
  function renderAhead(plan, idx) {
    const ahead = $('homeAhead');
    if (ahead) {
      const start = idx + 1;
      const days = plan.days.slice(start, start + 8);
      ahead.innerHTML = days.map((x) => {
        const h = hoursFa(dayMinutes(x));
        const n = (x.blocks || []).length;
        return '<button class="aday" data-open-day="' + x.date + '">' +
          '<div class="wd">' + esc(x.weekday) + '</div>' +
          '<div class="dt">' + esc(jDateFull(x.date)) + '</div>' +
          '<div class="hrs">' + h + ' ساعت</div>' +
          '<div class="sub">' + (n ? faNum(n) + ' بلوک' + (dayTests(x) ? ' · ' + faNum(dayTests(x)) + ' تست' : '') : 'استراحت') + '</div>' +
          '</button>';
      }).join('') || '<div class="muted" style="font-size:12px">روز دیگری در برنامه نیست.</div>';
      ahead.querySelectorAll('[data-open-day]').forEach((b) => {
        b.addEventListener('click', () => openDay(b.dataset.openDay));
      });
    }
  }

  /* چیپ‌های پرش داخل گزارش */
  document.querySelectorAll('[data-jump]').forEach((b) => {
    b.addEventListener('click', () => {
      const target = $(b.dataset.jump);
      if (!target) return;
      document.querySelectorAll('[data-jump]').forEach((x) => x.classList.remove('on'));
      b.classList.add('on');
      target.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  });

  /* دکمه‌های جهش بین قدم‌ها */
  document.querySelectorAll('[data-goto]').forEach((b) => {
    if (b.classList.contains('chkitem')) return;
    b.addEventListener('click', () => gotoView(b.dataset.goto));
  });
  document.querySelectorAll('[data-next]').forEach((b) => {
    b.addEventListener('click', () => gotoView('step-' + b.dataset.next));
  });
  document.querySelectorAll('[data-back]').forEach((b) => {
    b.addEventListener('click', () => gotoView('step-' + b.dataset.back));
  });

  /* دکمه‌های ساخت برنامه در نوار بالا و نوار کنار و خانه */
  [['buildTop', null], ['buildSide', null], ['homeBuild', null]].forEach(([id]) => {
    const el = $(id);
    if (el) el.addEventListener('click', () => { if ($('build')) $('build').click(); });
  });
  if ($('homeStart')) $('homeStart').addEventListener('click', () => gotoView('step-1'));

  /* ══════════════════════════════════════════════════════════════════
     راهنمای هر فیلد (ⓘ) — برای کسی که مفهوم بخش‌ها را نمی‌داند
     ══════════════════════════════════════════════════════════════════ */
  const HELP = {
    /* — اهمیت فصل (نشان کنار هر بلوک) — */
    imp: { t: 'سطح اهمیت این فصل', d: 'عدد اهمیت از بودجه‌بندی واقعی کنکور می‌آید: تعداد سؤال‌های همان فصل در کنکور، سختی و اهمیت نسبی‌اش. ' +
      'فصل ۵ از ۵ (بحرانی) بیشترین زمان یادگیری، مرور و تست را می‌گیرد؛ فصل ۱ از ۵ کمترین. ' +
      'نقطه‌های پُر یعنی اهمیت بالاتر. با نگه‌داشتن نشانگر روی نشان، سهم دقیق فصل از سؤال‌های درس و سختی‌اش را می‌بینی.' },
    /* — قدم ۱ — */
    name: { t: 'نام', d: 'فقط برای اینکه برنامه به اسم خودت ساخته شود. هر چیزی بنویسی اشکالی ندارد.' },
    grade: { t: 'پایهٔ تحصیلی', d: 'پایه‌ای که امسال در آن درس می‌خوانی. اگر امسال دوازدهمی، «دوازدهم» را انتخاب کن؛ کنکور ۱۴۰۶ برای دوازدهمی‌های امسال است.' },
    field: { t: 'رشته', d: 'رشتهٔ کنکورت. تجربی، ریاضی یا انسانی. ضرایب درس‌ها و حجم فصل‌ها بر اساس همین رشته چیده می‌شود.' },
    chronotype: { t: 'الگوی خواب و بیداری', d: '«سحرخیز» یعنی صبح‌ها بازده بیشتری داری؛ برنامه سنگین‌ترین بلوک‌ها را در بازهٔ اوج تو می‌گذارد. اگر مطمئن نیستی «متعادل» را بگذار.' },
    startDate: { t: 'تاریخ شروع برنامه', d: 'از چه روزی برنامه شروع شود. معمولاً همان امروز. تاریخ‌ها شمسی است.' },
    examDate: { t: 'تاریخ کنکور', d: 'برنامه تا این تاریخ چیده می‌شود و ۳۰ روز آخر خودکار «فاز جمع‌بندی» می‌شود. تاریخ رسمی هنوز اعلام نشده؛ می‌توانی بعداً عوضش کنی.' },
    /* — قدم ۲ — */
    timeMode: { t: 'چطور ساعت‌ها تعیین شود؟', d: '«خودم می‌گویم» = ساعت هر روز را خودت وارد می‌کنی. «خودکار» = فقط سقف را می‌دهی و برنامه بر اساس نیاز واقعی فصل‌ها، ضریب درس‌ها و مهلت‌ها ساعت لازم را خودش تعیین می‌کند.' },
    dailyCap: { t: 'سقف ساعت در روز', d: 'بیشترین ساعتی که حاضر هستی در یک روز بخوانی. برنامه هیچ‌وقت از این بیشتر نمی‌چیند؛ اگر نیاز کمتر بود، کمتر هم می‌گذارد و دلیلش را می‌گوید.' },
    dailyFloor: { t: 'کف ساعت در روز', d: 'کمترین ساعتی که برنامه نباید زیر آن برود (اختیاری). مثلاً اگر می‌خواهی حتی در روزهای سبک هم حداقل ۲ ساعت بخوانی، ۲ بگذار.' },
    availability: { t: 'ساعت مطالعهٔ هر روز', d: 'واقع‌بینانه بنویس، نه آرزومندانه: ساعتی که واقعاً می‌توانی مطالعه کنی (بعد از مدرسه و کلاس). برنامه دقیقاً روی همین عدد چیده می‌شود.' },
    startTimes: { t: 'ساعت شروع مطالعهٔ هر روز', d: 'اولین ساعتی که در آن روز می‌توانی شروع کنی (معمولاً بعد از مدرسه). برنامه از این ساعت به بعد بلوک می‌گذارد.' },
    bedtime: { t: 'ساعت خواب', d: 'برنامه ۴۵ دقیقه قبل از خواب را بافر می‌گذارد. اگر بعد از نیمه‌شب می‌خوابی، مثلاً ۰۰:۳۰ بنویس؛ برنامه این را «بعد از نیمه‌شب» می‌فهمد.' },
    wake: { t: 'ساعت بیداری', d: 'برای تشخیص این‌که ساعت خوابت بعد از نیمه‌شب است و برای تعیین مرز روز استفاده می‌شود.' },
    restDay: { t: 'روز استراحت هفتگی', d: 'یک روز که هیچ بلوکی چیده نشود. استراحت برنامه‌ریزی‌شده، از فرسودگی جلوگیری می‌کند؛ با این حال می‌توانی «بدون روز استراحت» را انتخاب کنی.' },
    blockMinutes: { t: 'طول هر بلوک مطالعه', d: 'مدت یک بلوک تمرکز. ۴۵ دقیقه برای بیشتر دانش‌آموزها بهترین تعادل بین تمرکز و خستگی است.' },
    breakMinutes: { t: 'استراحت بین بلوک‌ها', d: 'فاصلهٔ کوتاه بین دو بلوک. ۱۰ دقیقه استراحت واقعی (بدون گوشی) بازده بلوک بعدی را حفظ می‌کند.' },
    /* — قدم ۳ — */
    classRows: { t: 'کلاس‌های هفتگی', d: 'کلاس‌هایی که ساعتشان ثابت است (مدرسه، آموزشگاه، کلاس آنلاین). برنامه این ساعت‌ها را قفل می‌کند و ۲۰ دقیقه «تثبیت کلاس» بعد از آن می‌گذارد.' },
    examRows: { t: 'آزمون‌های ثابت', d: 'آزمون‌هایی که تاریخشان مشخص است (قلم‌چی، گزینهٔ دو...). سه روز آخر قبل از هر آزمون فقط مرور است و روز بعدش بلوک تحلیل خطا دارد.' },
    offRows: { t: 'روزهای خارج از برنامه', d: 'روزهایی که مسافری یا مهمانی و نمی‌توانی بخوانی. «تعطیل کامل» یعنی هیچ بلوکی چیده نشود؛ «سبک» یعنی بار نصف شود.' },
    /* — قدم ۴ — */
    assessment: { t: 'ارزیابی فصل‌به‌فصل', d: 'برای هر فصل بگو خوانده‌ای یا نه و چقدر مسلطی. برنامه از همین‌جا می‌فهمد کدام فصل «یادگیری از صفر»، کدام «جبران» و کدام فقط «مرور» لازم دارد.' },
    general: { t: 'دروس عمومی', d: 'دروس عمومی (سلامت، هویت اجتماعی، ادبیات، دین و زندگی، عربی، زبان) از مسیر سوابق تحصیلی مدیریت می‌شوند. پایه‌اش را انتخاب کن تا فصل‌هایش اضافه شود.' },
    /* — قدم ۵ — */
    finalsEnabled: { t: 'سوابق تحصیلی', d: 'امتحانات نهایی خرداد، ۶۰٪ نتیجهٔ کنکور ۱۴۰۶ را می‌سازند. این بخش، درس‌های نهایی و بازهٔ خرداد را به برنامه اضافه می‌کند.' },
    finalsTable: { t: 'درس‌های سوابق', d: 'نمرهٔ فعلی و نمرهٔ هدف هر درس + میزان تأثیرش. برنامه به درسی که فاصلهٔ بیشتری تا هدف دارد وقت بیشتری می‌دهد.' },
    /* — قدم ۶ — */
    bookDeadlineRows: { t: 'مهلت کتابی', d: 'مثلاً «پایان زیست تا ۲۹ اسفند». برنامه عقب‌افتادگی را حساب می‌کند و می‌گوید روزی چند دقیقه لازم است.' },
    shortDeadlineRows: { t: 'مهلت کوتاه / آزمون تک‌درس', d: 'مهلت برای یک درس یا یک بازهٔ فصل‌ها. برای آزمون‌های آموزشگاه‌ها هم از همین استفاده کن.' },
    mocksCard: { t: 'آزمون‌های دوره‌ای هفتگی', d: 'هر روز هفته، هر چند هفته یک‌بار، چند آزمون هم‌زمان. برنامه قبلش مرور و بعدش تحلیل خطا می‌گذارد.' },
    /* — v2.5 — */
    startDay: {
      t: 'شروع روز',
      d: 'ساعت بیداری فقط پیش‌فرض است. اگر امروز ۷ یا ۱۱ بیدار شدی، ساعت واقعی را بنویس و این دکمه را بزن: ' +
        'فقط برنامهٔ همین روز از همان ساعت بازچیده می‌شود. کلاس‌ها، وعده‌های غذایی و آزمون‌ها ثابت می‌مانند و ' +
        'بلوکی که جا نشود خودکار با اولویت به روزهای بعد منتقل می‌شود.',
    },
    emergency: {
      t: 'آیتم اضطراری',
      d: 'یک فصل یا موضوع که «باید» انجام شود. برنامه می‌پرسد کِی: «امروز» با ساعتی که می‌نویسی، یا «این هفته» در اولین فرصت. ' +
        'بعد بقیهٔ برنامه را دور همین آیتم بازچینی می‌کند تا از ذهنت بیرون نرود. ساعت کلاس‌ها دست نمی‌خورد.',
    },
    routines: {
      t: 'روال ثابت روز',
      d: 'وعده‌های غذایی، نماز، ورزش. اگر روشن باشد این بازه‌ها مثل کلاس قفل می‌شوند و هیچ بازچینشی آن‌ها را جابه‌جا نمی‌کند؛ ' +
        'برنامه فقط اطرافشان چیده می‌شود. اگر خاموش باشد، این ساعت‌ها هم به مطالعه اختصاص می‌یابد.',
    },
    readiness: {
      t: 'آمادگی کنکور و نهایی',
      d: 'دو مسیر جدا: کنکور با ضریب درس × تسلط فصل × تست زمان‌دار سنجیده می‌شود؛ امتحان نهایی با بارم رسمی هر فصل × تسلط و ' +
        'پاسخ تشریحی. روش مطالعه و برنامهٔ این دو هم جدا چیده می‌شود، پس دو عدد جدا هم می‌بینی.',
    },
    timer: {
      t: 'تایمر بلوک (مکس / ادامه)',
      d: 'روی هر بلوک «شروع» را بزن. اگر وسط کار چیزی پیش آمد «مکس (توقف)» را بزن — زمان جمع‌شده حفظ می‌شود. ' +
        'بعداً «ادامه» را بزن تا همان مدت برنامه‌ریزی‌شده کامل شود. هر بلوک فقط وقتی «تمام‌شده» می‌شود که زمانش پر شود.',
    },
  };

  let helpTipEl = null;
  function showHelp(anchor, key) {
    const item = HELP[key];
    if (!item || !helpTipEl) return;
    helpTipEl.innerHTML = '<b>' + esc(item.t) + '</b>' + esc(item.d);
    helpTipEl.classList.add('show');
    const r = anchor.getBoundingClientRect();
    const w = Math.min(330, window.innerWidth - 24);
    helpTipEl.style.maxWidth = w + 'px';
    /* در RTL جعبه سمت چپِ آیکن باز می‌شود و اگر جا نبود، سمت راست */
    let left = r.left - w - 10;
    if (left < 12) left = Math.min(window.innerWidth - w - 12, r.right + 10);
    let top = r.bottom + 8;
    const th = helpTipEl.offsetHeight || 90;
    if (top + th > window.innerHeight - 12) top = Math.max(12, r.top - th - 8);
    helpTipEl.style.left = left + 'px';
    helpTipEl.style.top = top + 'px';
  }
  function hideHelp() { if (helpTipEl) helpTipEl.classList.remove('show'); }

  /* ساخت آیکن ⓘ برای هر فیلد ثبت‌شده در HELP */
  function installHelp() {
    helpTipEl = $('helpTip');
    Object.keys(HELP).forEach((key) => {
      const el = $(key) || document.querySelector('[data-help="' + key + '"]');
      if (!el) return;
      if (el.querySelector('.qmark[data-k="' + key + '"]')) return;
      const isForm = /^(INPUT|SELECT|TEXTAREA)$/.test(el.tagName);
      let host = null;
      if (isForm) {
        host = el.parentElement && el.parentElement.querySelector(':scope > label');
        if (!host && el.previousElementSibling && el.previousElementSibling.tagName === 'LABEL') host = el.previousElementSibling;
      }
      if (!host) {
        host = el.closest('.card') ? el.closest('.card').querySelector('h2') : null;
      }
      if (!host) host = el.parentElement;
      if (!host) return;
      const ic = document.createElement('span');
      ic.className = 'qmark';
      ic.dataset.k = key;
      ic.textContent = '?';
      ic.setAttribute('aria-label', HELP[key].t);
      ic.addEventListener('mouseenter', () => showHelp(ic, key));
      ic.addEventListener('mouseleave', hideHelp);
      ic.addEventListener('click', (ev) => {
        ev.preventDefault();
        ev.stopPropagation();
        const on = ic.classList.contains('on');
        document.querySelectorAll('.qmark.on').forEach((x) => x.classList.remove('on'));
        if (on) { hideHelp(); return; }
        ic.classList.add('on');
        showHelp(ic, key);
      });
      host.appendChild(ic);
    });
    document.addEventListener('click', (ev) => {
      if (!ev.target.closest || !ev.target.closest('.qmark')) {
        document.querySelectorAll('.qmark.on').forEach((x) => x.classList.remove('on'));
        hideHelp();
      }
    });
    const scroller = $('mainScroll');
    if (scroller) scroller.addEventListener('scroll', hideHelp, { passive: true });
  }

  /* ══════════════════════════════════════════════════════════════════
     کارت‌های خطا: چرا + چطور رفعش کنم + پرش به همان فیلد
     ══════════════════════════════════════════════════════════════════ */
  function issuesOf(plan) {
    if (!plan || !plan.summary) return [];
    const list = (plan.summary.diagnostics || []).slice();
    /* پیام‌های متنیِ قدیمی که ساخت‌یافته نشده‌اند هم نشان داده می‌شوند */
    const known = {};
    list.forEach((d) => { known[d.detail] = true; });
    (plan.summary.warnings || []).forEach((w) => {
      if (!known[w]) list.push({ id: 'legacy', level: 'warn', title: 'هشدار برنامه', detail: w, fix: '', step: 'step-2', field: '' });
    });
    const rank = { error: 0, warn: 1, info: 2 };
    return list.sort((a, b) => (rank[a.level] || 1) - (rank[b.level] || 1));
  }

  function issueHtml(it) {
    const lvl = it.level === 'error' ? ' err' : (it.level === 'info' ? ' info' : '');
    const mark = it.level === 'error' ? '!' : (it.level === 'info' ? 'i' : '⚠');
    return '<div class="issue' + lvl + '" data-istep="' + esc(it.step || '') + '" data-ifield="' + esc(it.field || '') + '">' +
      '<span class="mark">' + mark + '</span>' +
      '<div class="body">' +
        '<div class="ttl">' + esc(it.title || '') + '</div>' +
        (it.detail ? '<div class="det">' + esc(it.detail) + '</div>' : '') +
        (it.fix ? '<div class="fixline"><b>راه‌حل: </b>' + esc(it.fix) + '</div>' : '') +
      '</div>' +
      (it.step ? '<span class="go">رفع این مورد ‹</span>' : '') +
    '</div>';
  }

  function renderIssues(list, box) {
    if (!box) return;
    if (!list.length) { box.innerHTML = ''; return; }
    box.innerHTML = list.map(issueHtml).join('');
    box.querySelectorAll('.issue').forEach((el) => {
      el.addEventListener('click', () => jumpToIssue(el.dataset.istep, el.dataset.ifield));
    });
  }

  /* پرش: همان قدم را باز می‌کند، به همان فیلد می‌رود و راهنما را نشان می‌دهد */
  function jumpToIssue(step, field) {
    if (!step) return;
    gotoView(step);
    if (!field) return;
    setTimeout(() => {
      let el = $(field);
      if (!el && field === 'availability') el = document.querySelector('[data-avail]');
      if (!el) el = document.querySelector('#view-' + step + ' .card');
      if (!el) return;
      try { el.scrollIntoView({ behavior: 'smooth', block: 'center' }); } catch (e) { /* بی‌صدا */ }
      el.classList.add('fld-flash');
      setTimeout(() => el.classList.remove('fld-flash'), 3200);
      if (el.focus) { try { el.focus({ preventScroll: true }); } catch (e) { /* بی‌صدا */ } }
      const key = HELP[field] ? field : null;
      const kb = el.dataset ? el.dataset.k : null;
      const hintEl = el.parentElement && el.parentElement.querySelector('.qmark');
      if (hintEl && hintEl.dataset && hintEl.dataset.k) {
        document.querySelectorAll('.qmark.on').forEach((x) => x.classList.remove('on'));
        hintEl.classList.add('on');
        showHelp(hintEl, hintEl.dataset.k);
        setTimeout(() => { hintEl.classList.remove('on'); hideHelp(); }, 6000);
      }
      void key; void kb;
    }, 90);
  }

  /* ══════════════════════════════════════════════════════════════════
     حالت زمان‌بندی: دستی / خودکار (فقط سقف)
     ══════════════════════════════════════════════════════════════════ */
  function setTimeMode(mode) {
    state.timeMode = mode === 'auto' ? 'auto' : 'fixed';
    const fixed = $('modeFixed');
    const auto = $('modeAuto');
    if (fixed) fixed.classList.toggle('on', state.timeMode === 'fixed');
    if (auto) auto.classList.toggle('on', state.timeMode === 'auto');
    if ($('autoBox')) $('autoBox').style.display = state.timeMode === 'auto' ? 'block' : 'none';
    if ($('manualBox')) $('manualBox').style.display = state.timeMode === 'auto' ? 'none' : 'block';
  }

  /* ---------------- فرم تنظیمات ---------------- */

  function buildAvailabilityGrid(values) {
    const box = $('availability');
    box.innerHTML = '';
    WEEKDAY_KEY.forEach((k, i) => {
      const div = document.createElement('div');
      div.className = 'avail-cell';
      div.innerHTML = '<label>' + WEEKDAY_FA[i] + ' (ساعت)</label>' +
        '<input type="text" inputmode="decimal" data-avail="' + k + '" value="' + faDigits(values[k] != null ? values[k] : 4) + '" style="text-align:center;font-weight:700;font-size:14px" />';
      box.appendChild(div);
    });
  }

  function subjectRow(s, index) {
    const types = engine.SUBJECT_TYPE_FA;
    const typeOpts = Object.keys(types)
      .map((t) => '<option value="' + t + '"' + (s.type === t ? ' selected' : '') + '>' + types[t] + '</option>')
      .join('');
    const rows = chapterRows(s);
    const s2 = assessSummary(rows);
    return '' +
      '<tr data-row="' + index + '" data-id="' + esc(s.id) + '">' +
      '<td><input data-f="name" value="' + esc(s.name) + '" /></td>' +
      '<td><input data-f="weight" type="number" min="0.5" max="20" step="0.5" value="' + s.weight + '" style="width:64px" /></td>' +
      '<td><span class="muted" style="font-size:12px">' + faNum(s2.readCount) + ' / ' + faNum(s2.total) + '</span></td>' +
      '<td><span class="muted" style="font-size:12px">' + faNum(s2.avg) + '٪</span></td>' +
      '<td><select data-f="difficulty">' +
      [1, 2, 3].map((d) => '<option value="' + d + '"' + (s.difficulty === d ? ' selected' : '') + '>' + ['آسان', 'متوسط', 'سخت'][d - 1] + '</option>').join('') +
      '</select></td>' +
      '<td><select data-f="type">' + typeOpts + '</select></td>' +
      '<td><input data-f="examPercent" type="number" min="-33" max="100" value="' + (s.examPercent == null ? '' : s.examPercent) + '" placeholder="—" style="width:70px" /></td>' +
      '<td><input data-f="include" type="checkbox" ' + (s.include === false ? '' : 'checked') + ' /></td>' +
      '</tr>';
  }

  function esc(s) {
    return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
  }

  /* ---------------- ارزیابی فصل به فصل ---------------- */

  function faToEn(t) {
    return String(t).replace(/[۰-۹]/g, (d) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d)));
  }

  /* ══════════ عنوان رسمی فصل‌ها (منبع: فهرست کتاب‌های درسی در presets) ══════════
     «فصل ۱» به‌تنهایی چیزی از محتوا نمی‌گوید. برای همین برای هر درس، فهرست
     رسمی سرفصل‌های کتاب درسی نگه داشته می‌شود و هر جا فصل نمایش داده شود —
     ارزیابی، بلوک‌های برنامه، گزارش، جدول نهایی، مهلت‌ها — همان عنوان می‌آید. */

  const GENERIC_CHAP = /^\s*(فصل|درس)\s*[۰-۹0-9٠-٩]+\s*$/;

  /** فهرست [{grade,name}] برای یک درس؛ اگر پایه‌اش معلوم باشد همان پایه */
  function canonChapterList(sub) {
    const id = sub && sub.id;
    if (!id) return null;
    let list = null;
    try { list = (presets && presets.chaptersFor) ? presets.chaptersFor(id) : null; } catch (e) { list = null; }
    if (!list || !list.length) return null;
    return list;
  }

  /** عنوان‌های استاندارد به ترتیب کتاب، محدود به پایه‌های همان درس */
  function canonTopicNames(sub, count) {
    const list = canonChapterList(sub);
    if (!list) return null;
    const wanted = [];
    if (Array.isArray(sub.grades)) sub.grades.forEach((g) => wanted.push(String(g)));
    if (sub.grade) wanted.push(String(sub.grade));
    const valid = wanted.filter((g) => /دهم|یازدهم|دوازدهم/.test(g));
    let picked = list;
    if (valid.length) {
      const f = list.filter((c) => valid.some((g) => c.grade === g || (g === 'فارغ‌التحصیل' && c.grade === 'دوازدهم')));
      if (f.length) picked = f;
    }
    if (count && picked.length > count && valid.length === 0) picked = picked.slice(0, count);
    return picked.map((c) => (c.grade === '—' ? c.name : c.grade + ' · ' + c.name));
  }

  /** topicNames یک درس را (در صورت نبود یا بی‌معنی بودن) با عناوین رسمی پر می‌کند */
  function ensureTopicNames(sub) {
    if (!sub || !sub.id) return sub;
    const canon = canonTopicNames(sub);
    if (!canon) return sub;
    const need = Math.max(clampNum(sub.chapters, 1, 120), Array.isArray(sub.topicNames) ? sub.topicNames.length : 0);
    const cur = Array.isArray(sub.topicNames) ? sub.topicNames.slice() : [];
    const out = [];
    let changed = 0;
    for (let i = 0; i < Math.max(need, canon.length && need ? need : canon.length); i += 1) {
      const c = cur[i];
      const generic = !c || GENERIC_CHAP.test(String(c).trim());
      if (generic) {
        const pick = canon[i] || canon[canon.length - 1] || null;
        out.push(pick || ('فصل ' + faNum(i + 1)));
        if (pick) changed += 1;
      } else {
        out.push(String(c));
      }
    }
    if (!out.length) return sub;
    sub.topicNames = out;
    sub.chapters = out.length;
    if (!Array.isArray(sub.chapterGrades) || sub.chapterGrades.length !== out.length) {
      const list = canonChapterList(sub) || [];
      sub.chapterGrades = out.map((n, i) => (list[i] && list[i].grade) || gradeFromName(n) || sub.grade || '');
    }
    if (!Array.isArray(sub.chapterShort) || sub.chapterShort.length !== out.length) {
      sub.chapterShort = out.map((n) => String(n).replace(/^\s*(دهم|یازدهم|دوازدهم)\s*[·:.\-–]\s*/, ''));
    }
    return sub;
  }

  /** نقشهٔ «درس.فصل ← عنوان» برای هر چیزی که در برنامه ساخته شده */
  function chapterTitleMap() {
    const map = {};
    const all = (state.coreSubjects || []).concat((state.general || []).filter((x) => x.include !== false));
    all.forEach((sub) => {
      const s2 = ensureTopicNames(Object.assign({}, sub));
      (s2.topicNames || []).forEach((name, i) => { map[sub.id + '.c' + (i + 1)] = String(name); });
    });
    return map;
  }

  /** عنوان‌های «فصل N» در برنامهٔ ساخته‌شده را با عنوان واقعی کتاب عوض می‌کند. */
  function migratePlanChapterNames(plan) {
    if (!plan) return 0;
    const map = chapterTitleMap();
    let fixed = 0;
    (plan.days || []).forEach((d) => {
      (d.blocks || []).forEach((b) => {
        if (!b || !b.topicId || !map[b.topicId]) return;
        if (!b.topic || GENERIC_CHAP.test(String(b.topic).trim())) { b.topic = map[b.topicId]; fixed += 1; }
      });
    });
    const stats = (plan.summary && plan.summary.chapterStats) || [];
    stats.forEach((c) => {
      const t = map[c.subjectId + '.c' + c.chapter];
      if (t && (!c.label || GENERIC_CHAP.test(String(c.label).trim()))) { c.label = t; fixed += 1; }
    });
    return fixed;
  }

  /** فهرست پیش‌فرض فصل‌های یک درس (نخوانده) */
  function defaultChapterRows(sub) {
    const s2 = ensureTopicNames(Object.assign({}, sub || {}));
    const names = Array.isArray(s2.topicNames) && s2.topicNames.length ? s2.topicNames : null;
    const n = names ? names.length : clampNum(sub && sub.chapters, 1, 120);
    const out = [];
    for (let i = 0; i < n; i++) {
      out.push({
        name: names && !GENERIC_CHAP.test(String(names[i])) ? String(names[i]) : ((s2 && s2.topicLabel) || 'فصل') + ' ' + faNum(i + 1),
        read: false,
        mastery: 0,
      });
    }
    return out;
  }

  function clampNum(v, lo, hi) {
    const n = Number(v);
    if (!Number.isFinite(n)) return lo;
    return Math.max(lo, Math.min(hi, n));
  }

  /** آیا خودِ عنوان، پایه را در خود دارد؟ («دهم · مثلثات») */
  const NM_HAS_GRADE = (name) => /^\s*(دهم|یازدهم|دوازدهم|پایه)\s*[·:.\-–]/.test(String(name || ''));

  /** پایهٔ هر فصل را از عنوانش درمی‌آورد: «دهم · مثلثات» ← «دهم» */
  function gradeFromName(name) {
    const m = String(name || '').match(/^\s*(دهم|یازدهم|دوازدهم|پایه\s*(?:یازدهم|دوازدهم|دهم)?)\s*[·:.\-–]/);
    return m ? String(m[1]).replace(/\s+/g, ' ').trim() : '';
  }

  /** سطرهای ارزیابی یک درس (منبع حقیقت: state.chapters) */
  function chapterRows(sub) {
    if (!sub || !sub.id) return [];
    /* فهرست رسمی عنوان‌های کتاب (از دادهٔ پیش‌فرض) */
    const canon = (sub && Array.isArray(sub.topicNames) && sub.topicNames.length)
      ? sub.topicNames.map((x) => String(x)) : null;
    if (!state.chapters[sub.id] || !state.chapters[sub.id].length) {
      state.chapters[sub.id] = defaultChapterRows(sub);
    }
    repairChapterRows(sub, state.chapters[sub.id], canon);
    return state.chapters[sub.id];
  }

  /** سطرهایی که از نسخه‌های قدیمی بدون عنوان ذخیره شده‌اند با عنوان واقعی کتاب پر می‌شوند؛
      اگر هنوز هم عنوانی نبود، «فصل N» به‌عنوان جای‌نگهدار می‌ماند تا سطر خالی نماند. */
  function repairChapterRows(sub, rows, canon) {
    const label = (sub && sub.general) ? 'درس' : 'فصل';
    /* منبع عنوان: اول فهرست رسمی کتاب (canon)، بعد فهرست خودِ درس */
    const official = (canon && canon.length ? canon : null) || canonTopicNames(sub) || null;
    rows.forEach((r, i) => {
      if (!r) return;
      const nm = String(r.name == null ? '' : r.name).trim();
      const isGeneric = !nm || GENERIC_CHAP.test(nm) || nm === label + ' ' + faNum(i + 1) || nm === label + ' ' + (i + 1);
      if (isGeneric) {
        const pick = (official && official[i]) || (official && official[official.length - 1]) || null;
        r.name = pick && !GENERIC_CHAP.test(String(pick)) ? String(pick) : (label + ' ' + faNum(i + 1));
      }
      if (!r.grade) {
        const g = gradeFromName(r.name) || (sub && sub.grade) || '';
        if (g) r.grade = g;
      }
    });
    return rows;
  }

  /** خلاصهٔ ارزیابی یک درس */
  function assessSummary(rows) {
    const total = rows.length || 1;
    const read = rows.filter((r) => r.read);
    const avgAll = Math.round(rows.reduce((a, r) => a + (r.read ? Number(r.mastery) || 0 : 0), 0) / total);
    const weak = read.filter((r) => r.mastery < 45).length;
    const boost = read.filter((r) => r.mastery >= 45 && r.mastery < 75).length;
    const solid = read.filter((r) => r.mastery >= 75).length;
    return { total: rows.length, readCount: read.length, avg: avgAll, weak, boost, solid };
  }

  /** دروس قابل ارزیابی = اختصاصی‌ها + عمومی‌های فعال */
  function assessSubjects() {
    const core = (state.coreSubjects || []).map((x) => ensureTopicNames({
      id: x.id, name: x.name, weight: x.weight, chapters: x.chapters,
      topicLabel: x.topicLabel, topicNames: x.topicNames, chapterGrades: x.chapterGrades,
      grade: x.grade, grades: x.grades, general: false,
    }));
    const gen = (state.general || []).filter((x) => x.include !== false).map((x) => ensureTopicNames({
      id: x.id, name: x.name, weight: x.weight, chapters: x.chapters,
      topicLabel: x.topicLabel, topicNames: x.topicNames, chapterGrades: x.chapterGrades,
      general: true, grade: x.grade, grades: x.grades,
    }));
    return core.concat(gen);
  }

  /* ══════════ درجهٔ اهمیت و سهم هر فصل از کل کتاب ══════════
     «فصل ۲» تازه شروعِ کار است؛ دانش‌آموز باید بداند این فصل چند درصد از
     کتاب/سؤال‌ها را می‌گیرد و چقدر مهم است تا وقتش را درست بگذارد.
     منبع: بودجه‌بندی کنکور (chapter-weights) برای درس‌های اختصاصی و
     بارم رسمی نهایی برای درس‌های عمومی. */

  /** شناسهٔ درس در جدول بارم نهایی (di3 ← dini3، sal3 ← salamat3 …) */
  function finalsKeyOf(sub) {
    const m = { di1: 'dini1', di2: 'dini2', di3: 'dini3', sal1: 'salamat1', sal2: 'salamat2', sal3: 'salamat3',
      hovi1: 'hoviat1', hovi2: 'hoviat2', hovi3: 'hoviat3' };
    return m[sub.id] || sub.id;
  }

  /** درجهٔ ۱..۵ از نسبت بارم فصل به بارم میانگین */
  function impFromRel(rel) {
    if (!Number.isFinite(rel)) return 3;
    if (rel >= 1.35) return 5;
    if (rel >= 1.1) return 4;
    if (rel >= 0.85) return 3;
    if (rel >= 0.6) return 2;
    return 1;
  }

  const IMP_LABEL = { 5: 'بحرانی', 4: 'پرتکرار', 3: 'متوسط', 2: 'کم', 1: 'کم‌هزینه' };
  const IMP_LABEL_FIN = { 5: 'پربارم', 4: 'پربارم', 3: 'متوسط', 2: 'کم‌بارم', 1: 'کم‌بارم' };

  /**
   * اطلاعات اهمیت یک فصل برای نمایش در ارزیابی:
   * { imp 1..5, label, sharePct, q, baram, source, kind }
   * اگر داده‌ای برای آن درس نباشد، null برمی‌گردد (سطر ساده می‌ماند).
   */
  function chapterImportanceFor(sub, idx) {
    if (!sub || !sub.id || !cw) return null;
    const no = idx + 1;
    const count = (Array.isArray(sub.topicNames) && sub.topicNames.length) || clampNum(sub.chapters, 1, 120);

    /* ۱) درس‌های اختصاصی: بودجه‌بندی رسمی کنکور */
    if (!sub.general) {
      const ci = cw.chapterInfo ? cw.chapterInfo(sub.id, no) : null;
      if (ci) {
        return {
          kind: 'konkur', imp: clampNum(ci.imp, 1, 5), label: ci.tag || IMP_LABEL[clampNum(ci.imp, 1, 5)],
          sharePct: ci.sharePct, q: ci.q, diff: ci.diff,
          source: 'بودجه‌بندی کنکور (میانگین ۱۴۰۲–۱۴۰۴)',
        };
      }
    }

    /* ۲) درس‌های عمومی: بارم رسمی امتحان نهایی */
    const key = finalsKeyOf(sub);
    const fdata = cw.finals ? cw.finals(key, sub.grade) : null;
    const fc = cw.finalsChapterInfo ? cw.finalsChapterInfo(key, no, sub.grade) : null;
    if (fc && fdata) {
      /* اگر جدول بارم با تعداد درس‌های کتاب نمی‌خواند و بارم هم یکنواخت نیست،
         عددِ نادرست نشان نمی‌دهیم (مثلاً عربی با ۵ قلمرو و ۴ درس). */
      if (!fdata.uniform && fdata.baram.length !== count) return null;
      const total = fdata.total || 20;
      const imp = impFromRel(fc.rel);
      return {
        kind: 'finals', imp, label: IMP_LABEL_FIN[imp],
        sharePct: Math.round((fc.baram / total) * 1000) / 10,
        baram: fc.baram, total, uniform: Boolean(fdata.uniform),
        source: 'بارم رسمی امتحان نهایی' + (fdata.approx ? ' (تقریبی)' : ''),
      };
    }
    return null;
  }

  /** نقطه‌های اهمیت: ●●●○○ */
  function impDots(imp) {
    const n = clampNum(imp, 1, 5);
    let out = '';
    for (let k = 1; k <= 5; k += 1) out += '<i class="' + (k <= n ? 'on' : '') + '"></i>';
    return '<span class="impdots" dir="rtl">' + out + '</span>';
  }

  /** سلول «اهمیت / سهم از کتاب» در جدول ارزیابی */
  function impCellHtml(sub, idx) {
    const m = chapterImportanceFor(sub, idx);
    if (!m) {
      return '<td class="cmeta"><span class="muted" style="font-size:10.5px" title="برای این درس دادهٔ اهمیت ثبت نشده است">—</span></td>';
    }
    const tip = (sub.name || '') + ' · ' + ((sub.general ? 'درس ' : 'فصل ') + faNum(idx + 1)) + '\n' +
      'درجهٔ اهمیت: ' + faNum(m.imp) + ' از ۵ (' + m.label + ')\n' +
      'سهم از کل کتاب: ' + faNum(m.sharePct) + '٪' +
      (m.kind === 'konkur' ? '\nتعداد سؤال کنکور: ≈' + faNum(Math.round(m.q)) : '\nبارم نهایی: ' + faNum(m.baram) + ' از ' + faNum(m.total)) +
      '\nمنبع: ' + m.source;
    const share = '<span class="mshare" title="' + esc(m.kind === 'konkur'
      ? '≈' + faNum(Math.round(m.q)) + ' سؤال از این درس در کنکور'
      : 'بارم نهایی: ' + faNum(m.baram) + ' از ' + faNum(m.total)) + '">' +
      faNum(m.sharePct) + '٪ از کتاب</span>';
    return '<td class="cmeta" title="' + esc(tip) + '" data-help="imp">' +
      '<div class="mimp imp' + m.imp + '">' + impDots(m.imp) + '<span class="mtag">' + esc(m.label) + '</span></div>' +
      share + '</td>';
  }

  /** عنوان رسمی همان فصل (برای جای‌نگهدار و راهنما) */
  function officialTitle(sub, i) {
    const list = canonTopicNames(sub) || [];
    return list[i] || '';
  }

  function assessmentRowHtml(row, i, sub) {
    const label = (sub && sub.general) ? 'درس' : 'فصل';
    const num = label + ' ' + faNum(i + 1);
    const official = officialTitle(sub, i);
    const raw = String(row.name == null ? '' : row.name).trim();
    /* اگر نام ذخیره‌شده نبود یا فقط «فصل N» بود، عنوان رسمی کتاب جایش می‌نشیند */
    const nm = (!raw || GENERIC_CHAP.test(raw)) ? (official || num) : raw;
    const hasTitle = nm !== num && !GENERIC_CHAP.test(nm);
    const grade = row.grade || gradeFromName(nm) || (sub && sub.grade) || '';
    const badge = hasTitle ? '<span class="cn-badge">' + esc(num) + '</span>' : '';
    const gradeChip = (hasTitle && grade && !NM_HAS_GRADE(nm) && grade !== nm)
      ? '<span class="cn-grade">' + esc(grade) + '</span>' : '';
    return '<tr data-ci="' + i + '">' +
      '<td class="cname"><div class="cn-wrap">' + badge + gradeChip +
        '<input data-cf="name" value="' + esc(nm) + '"' +
          ' placeholder="' + esc(official || num) + '" title="' + esc(num + (official ? ' — ' + official : '')) + '" />' +
      '</div></td>' +
      impCellHtml(sub, i) +
      '<td style="text-align:center"><input type="checkbox" data-cf="read"' + (row.read ? ' checked' : '') + ' /></td>' +
      '<td><div class="mrow">' +
        '<input type="number" min="0" max="100" step="5" data-cf="mastery" value="' + (row.read ? row.mastery : 0) + '"' +
          (row.read ? '' : ' disabled') + ' style="width:66px" />' +
        '<span class="muted" style="font-size:11px">٪</span>' +
        [0, 25, 50, 75, 90].map((v) => '<button class="mini" data-set="' + v + '"' + (row.read ? '' : ' disabled') + '>' + faNum(v) + '</button>').join('') +
      '</div></td>' +
      '<td style="text-align:center"><button class="mini del" data-del="' + i + '" title="حذف">✕</button></td>' +
    '</tr>';
  }

  /** رندر کل بخش ارزیابی فصل‌به‌فصل */
  function renderAssessment() {
    const box = $('assessment');
    if (!box) return;
    const subs = assessSubjects();
    if (!subs.length) { box.innerHTML = '<div class="muted">درسی برای ارزیابی نیست.</div>'; return; }

    /* خلاصهٔ کل */
    let allRows = [];
    subs.forEach((sub) => { allRows = allRows.concat(chapterRows(sub)); });
    const g = assessSummary(allRows);
    const filled = g.readCount > 0;

    box.innerHTML =
      '<div class="assess-top">' +
        '<div><b style="font-size:13px">' + faNum(g.total) + ' فصل/درس</b>' +
          '<div class="muted" style="font-size:11.5px;margin-top:3px">' +
            faNum(g.readCount) + ' خوانده‌شده · ' + faNum(g.weak) + ' ضعیف (زیر ۴۵٪) · ' +
            faNum(g.boost) + ' نیازمند ارتقا · ' + faNum(g.solid) + ' مسلط</div></div>' +
        '<div style="flex:1;min-width:160px"><div class="acard-bar" style="height:9px"><i style="width:' + g.avg + '%"></i></div>' +
          '<div class="muted" style="font-size:11px;margin-top:4px">آمادگی فعلی (میانگین وزنی تسلط): ' + faNum(g.avg) + '٪</div></div>' +
        '<div class="row" style="gap:6px">' +
          '<button class="btn ghost small" data-all="open">باز کردن همه</button>' +
          '<button class="btn ghost small" data-all="close">بستن همه</button>' +
        '</div>' +
      '</div>' +
      (!filled
        ? '<div class="hint">هنوز چیزی علامت نزده‌ای. هر درسی که خوانده‌ای را تیک بزن و درصد تسلطش را بزن؛ ' +
          'فصل‌های تیک‌نخورده در برنامه «یادگیری از صفر» و فصل‌های ضعیف خودکار «جبران/ارتقا» می‌گیرند.</div>'
        : '') +
      subs.map((sub) => {
        const rows = chapterRows(sub);
        const s2 = assessSummary(rows);
        const open = state.assessOpen[sub.id] === true;
        return '<div class="acard' + (open ? ' open' : '') + '" data-sid="' + esc(sub.id) + '">' +
          '<div class="acard-h" data-head="' + esc(sub.id) + '">' +
            '<span class="acard-t">' + esc(sub.name) +
              '<small>' + (sub.grade ? esc(sub.grade) + ' · ' : '') + 'ضریب ' + faNum(sub.weight) + ' · ' + faNum(s2.total) + ' ' +
              esc(sub.general ? 'درس' : 'فصل') + '</small></span>' +
            '<span class="acard-m">' + (s2.readCount ? faNum(s2.readCount) + ' از ' + faNum(s2.total) + ' خوانده · میانگین ' + faNum(s2.avg) + '٪' +
              (s2.weak ? ' · <b style="color:#dc2626">' + faNum(s2.weak) + ' ضعیف</b>' : '') : 'ارزیابی نشده') + '</span>' +
            '<div class="acard-bar"><i style="width:' + s2.avg + '%"></i></div>' +
            '<button class="mini" data-toggle="' + esc(sub.id) + '">' + (open ? 'بستن' : 'باز کردن') + '</button>' +
          '</div>' +
          '<div class="acard-b"' + (open ? '' : ' hidden') + '>' +
            '<div class="legend-row">' +
              '<span class="lg"><i class="dot-on"></i> درجهٔ اهمیت فصل (۱ تا ۵، از بودجه‌بندی کنکور / بارم نهایی)</span>' +
              '<span class="lg"><b>٪ از کتاب</b> سهم این فصل از کل سؤالات همان درس</span>' +
            '</div>' +
            '<div class="row" style="gap:6px;margin-bottom:8px;flex-wrap:wrap">' +
              '<button class="btn ghost small" data-fill="' + esc(sub.id) + '" data-val="85">همه را خوانده‌ام (۸۵٪)</button>' +
              '<button class="btn ghost small" data-fill="' + esc(sub.id) + '" data-val="60">همه را خوانده‌ام (۶۰٪)</button>' +
              '<button class="btn ghost small" data-fill="' + esc(sub.id) + '" data-val="0">همه را نخوانده‌ام</button>' +
              '<button class="btn ghost small" data-add="' + esc(sub.id) + '">+ افزودن مبحث</button>' +
            '</div>' +
            '<table class="chap"><thead><tr><th>' + esc(sub.general ? 'درس و عنوان' : 'فصل و عنوان') +
              '</th><th style="width:126px" title="درجهٔ اهمیت فصل (۱ تا ۵) و سهمش از کل کتاب">اهمیت / سهم</th>' +
              '<th style="width:64px">خوانده‌ام</th><th style="width:250px">تسلط</th><th style="width:36px"></th></tr></thead><tbody>' +
              rows.map((row, i) => assessmentRowHtml(row, i, sub)).join('') +
            '</tbody></table>' +
          '</div>' +
        '</div>';
      }).join('');

    /* رویدادها */
    box.querySelectorAll('[data-head]').forEach((h) => {
      h.addEventListener('click', (ev) => {
        if (ev.target.closest('button')) return;
        const id = h.dataset.head;
        state.assessOpen[id] = !(state.assessOpen[id] === true);
        renderAssessment();
      });
    });
    box.querySelectorAll('[data-all]').forEach((b) => {
      b.addEventListener('click', () => {
        const open = b.dataset.all === 'open';
        subs.forEach((sub) => { state.assessOpen[sub.id] = open; });
        renderAssessment();
      });
    });
    box.querySelectorAll('[data-fill]').forEach((b) => {
      b.addEventListener('click', () => {
        const id = b.dataset.fill;
        const v = Number(b.dataset.val);
        const sub = subs.find((x) => x.id === id);
        const rows = chapterRows(sub);
        rows.forEach((r) => { r.read = v > 0; r.mastery = v > 0 ? v : 0; });
        state.assessOpen[id] = true;
        renderAssessment();
        toast('برای «' + (sub ? sub.name : '') + '» ' + (v > 0 ? 'همه فصل‌ها با تسلط ' + faNum(v) + '٪' : 'همه فصل‌ها نخوانده') + ' ثبت شد.');
      });
    });
    box.querySelectorAll('[data-add]').forEach((b) => {
      b.addEventListener('click', () => {
        const id = b.dataset.add;
        const sub = subs.find((x) => x.id === id);
        const rows = chapterRows(sub);
        rows.push({ name: 'مبحث تازه ' + faNum(rows.length + 1), read: false, mastery: 0 });
        state.assessOpen[id] = true;
        renderAssessment();
      });
    });
    box.querySelectorAll('[data-toggle]').forEach((b) => {
      b.addEventListener('click', () => {
        const id = b.dataset.toggle;
        state.assessOpen[id] = !(state.assessOpen[id] === true);
        renderAssessment();
      });
    });
    box.querySelectorAll('[data-set]').forEach((b) => {
      b.addEventListener('click', () => {
        const tr = b.closest('tr');
        const card = b.closest('.acard');
        const sub = subs.find((x) => x.id === card.dataset.sid);
        const rows = chapterRows(sub);
        const row = rows[Number(tr.dataset.ci)];
        if (!row) return;
        row.read = true;
        row.mastery = Number(b.dataset.set);
        renderAssessment();
      });
    });
    box.querySelectorAll('[data-del]').forEach((b) => {
      b.addEventListener('click', () => {
        const card = b.closest('.acard');
        const sub = subs.find((x) => x.id === card.dataset.sid);
        const rows = chapterRows(sub);
        if (rows.length <= 1) { toast('حداقل یک مبحث باید بماند.'); return; }
        rows.splice(Number(b.dataset.del), 1);
        renderAssessment();
      });
    });
    /* ورودی‌ها: بدون رندر مجدد (تا فوکوس از دست نرود) */
    box.querySelectorAll('.acard').forEach((card) => {
      const sub = subs.find((x) => x.id === card.dataset.sid);
      const rows = chapterRows(sub);
      card.querySelectorAll('tbody tr').forEach((tr) => {
        const i = Number(tr.dataset.ci);
        const row = rows[i];
        if (!row) return;
        const nameEl = tr.querySelector('[data-cf="name"]');
        const readEl = tr.querySelector('[data-cf="read"]');
        const mEl = tr.querySelector('[data-cf="mastery"]');
        if (nameEl) nameEl.addEventListener('input', () => { row.name = nameEl.value; });
        if (readEl) readEl.addEventListener('change', () => {
          row.read = readEl.checked;
          if (row.read && !row.mastery) row.mastery = 50;
          if (mEl) { mEl.disabled = !row.read; mEl.value = row.read ? row.mastery : 0; }
          tr.querySelectorAll('[data-set]').forEach((x) => { x.disabled = !row.read; });
          updateAssessHeader(card, sub);
          updateAssessTop(box, subs);
        });
        if (mEl) mEl.addEventListener('input', () => {
          const v = clampNum(faToEn(mEl.value), 0, 100);
          row.mastery = v;
          if (v > 0) row.read = true;
          updateAssessHeader(card, sub);
          updateAssessTop(box, subs);
        });
      });
    });
  }

  function updateAssessHeader(card, sub) {
    const rows = chapterRows(sub);
    const s2 = assessSummary(rows);
    const m = card.querySelector('.acard-m');
    if (m) {
      m.innerHTML = s2.readCount
        ? faNum(s2.readCount) + ' از ' + faNum(s2.total) + ' خوانده · میانگین ' + faNum(s2.avg) + '٪' +
          (s2.weak ? ' · <b style="color:#dc2626">' + faNum(s2.weak) + ' ضعیف</b>' : '')
        : 'ارزیابی نشده';
    }
    const bar = card.querySelector('.acard-bar i');
    if (bar) bar.style.width = s2.avg + '%';
  }

  function updateAssessTop(box, subs) {
    let allRows = [];
    subs.forEach((sub) => { allRows = allRows.concat(chapterRows(sub)); });
    const g = assessSummary(allRows);
    const top = box.querySelector('.assess-top');
    if (!top) return;
    const sub2 = top.querySelector('div > div.muted');
    if (sub2) {
      sub2.innerHTML = faNum(g.readCount) + ' خوانده‌شده · ' + faNum(g.weak) + ' ضعیف (زیر ۴۵٪) · ' +
        faNum(g.boost) + ' نیازمند ارتقا · ' + faNum(g.solid) + ' مسلط';
    }
    const bar = top.querySelector('.acard-bar i');
    if (bar) bar.style.width = g.avg + '%';
    const lbl = top.querySelectorAll('.muted');
    if (lbl && lbl[1]) lbl[1].textContent = 'آمادگی فعلی (میانگین وزنی تسلط): ' + faNum(g.avg) + '٪';
  }

  /** چسباندن داده‌های ارزیابی فصل‌به‌فصل به یک درس در config */
  function withChapters(sub) {
    ensureTopicNames(sub);
    const rows = state.chapters[sub.id];
    if (!rows || !rows.length) return sub;
    const s2 = assessSummary(rows);
    return Object.assign({}, sub, {
      chapters: rows.length,
      chaptersData: rows.map((r) => ({ name: r.name, read: !!r.read, mastery: r.read ? clampNum(r.mastery, 0, 100) : 0 })),
      masteredChapters: rows.filter((r) => r.read && r.mastery >= 75).length,
      mastery: s2.avg,
      topicNames: rows.map((r) => r.name),
    });
  }

  function renderSubjects(subjects) {
    state.coreSubjects = (subjects || []).map((s) => Object.assign({}, s));
    const table = $('subjects');
    if (!table) return;
    table.innerHTML = '' +
      '<thead><tr><th>درس</th><th>ضریب</th><th>خوانده / کل</th><th>میانگین تسلط</th><th>سختی</th><th>نوع</th><th>درصد آزمون</th><th>در برنامه</th></tr></thead>' +
      '<tbody>' + (subjects || []).map(subjectRow).join('') + '</tbody>';
    renderAssessment();
  }

  /* ---------------- دروس عمومی ---------------- */

  /** چیپ‌های انتخاب پایه برای دروس عمومی */
  function renderGradeChips() {
    const box = $('generalGrades');
    if (!box) return;
    const grades = presets.grades ? presets.grades() : ['دهم', 'یازدهم', 'دوازدهم'];
    box.innerHTML = grades.map((g) =>
      '<button class="grade-chip' + (state.gradeSel.indexOf(g) !== -1 ? ' on' : '') + '" data-grade="' + esc(g) + '">' +
      esc(g) + '</button>').join('');
    box.querySelectorAll('[data-grade]').forEach((b) => {
      b.addEventListener('click', () => {
        readGeneral(); // ویرایش‌های فعلی را نگه دار
        const g = b.dataset.grade;
        const i = state.gradeSel.indexOf(g);
        if (i === -1) state.gradeSel.push(g);
        else if (state.gradeSel.length > 1) state.gradeSel.splice(i, 1);
        else { toast('حداقل یک پایه باید انتخاب باشد.'); return; }
        renderGeneralForGrades();
      });
    });
  }

  /** ساخت لیست عمومی‌ها بر اساس پایه‌های انتخابی + ویرایش‌های ذخیره‌شده */
  function generalFromGrades() {
    return presets.generalFor(state.gradeSel).map((s) => {
      const edit = state.generalEdits[s.id];
      return edit ? Object.assign({}, s, edit) : s;
    });
  }

  function renderGeneralForGrades() {
    renderGradeChips();
    renderGeneral(generalFromGrades());
  }

  function renderGeneral(list) {
    const rows = (list && list.length ? list : generalFromGrades())
      .map((s) => Object.assign({}, s, { include: s.include !== false }));
    const genSig = JSON.stringify(rows.map((x) => x.id + ':' + (x.include !== false)));
    const generalChanged = genSig !== state._genSig;
    state._genSig = genSig;
    state.general = rows;
    /* ۲.۸.۶: فهرست «کتاب» در مهلت‌های کلی هم‌زمان با دروس عمومی به‌روز شود */
    if (generalChanged) {
      const dlBox = $('bookDeadlineRows');
      if (dlBox && (state.deadlineBooks || []).length) renderBookDeadlineRows(state.deadlineBooks);
    }
    const table = $('general');
    if (!table) return;
    table.innerHTML = '' +
      '<thead><tr><th>درس</th><th>پایه</th><th>ضریب</th><th>خوانده / کل</th><th>میانگین تسلط</th><th>در برنامه</th></tr></thead>' +
      '<tbody>' + rows.map((s) => {
        const _gs = assessSummary(chapterRows(s));
        return '' +
        '<tr data-gid="' + esc(s.id) + '">' +
        '<td><input data-gf="name" value="' + esc(s.name) + '" /></td>' +
        '<td><span class="grade-tag">' + esc(s.grade || '—') + '</span></td>' +
        '<td><input data-gf="weight" type="number" min="0.5" max="20" step="0.5" value="' + s.weight + '" style="width:64px" /></td>' +
        '<td><span class="muted" style="font-size:12px">' + faNum(_gs.readCount) + ' / ' + faNum(_gs.total) + '</span>' +
          '<div class="muted" style="font-size:10px;margin-top:2px">' + esc(s.topicLabel || 'درس') + '</div></td>' +
        '<td><span class="muted" style="font-size:12px">' + faNum(_gs.avg) + '٪</span></td>' +
        '<td><input data-gf="include" type="checkbox" ' + (s.include === false ? '' : 'checked') + ' /></td>' +
        '</tr>';
      }).join('') + '</tbody>';
    renderAssessment();
  }

  function readGeneral() {
    const table = $('general');
    if (!table) return [];
    const byId = {};
    (state.general || []).forEach((s) => { byId[s.id] = s; });
    const out = [];
    table.querySelectorAll('tbody tr').forEach((tr, i) => {
      const get = (f) => tr.querySelector('[data-gf="' + f + '"]');
      const base = byId[tr.dataset.gid] || {};
      const gid = tr.dataset.gid || ('G' + (i + 1));
      const gRows = chapterRows(Object.assign({}, base, { id: gid }));
      const row = Object.assign({}, base, {
        id: gid,
        name: get('name').value.trim() || base.name || ('درس عمومی ' + (i + 1)),
        weight: Number(get('weight').value) || 2,
        chapters: gRows.length,
        masteredChapters: gRows.filter((r) => r.read && r.mastery >= 75).length,
        mastery: assessSummary(gRows).avg,
        include: get('include').checked,
        general: true,
        type: base.type || 'conceptual',
        difficulty: base.difficulty || 2,
        topicLabel: base.topicLabel || 'درس',
        topicNames: base.topicNames || null,
        examPercent: base.examPercent == null ? null : base.examPercent,
      });
      // ویرایش‌ها را برای دفعهٔ بعد (تغییر پایه) نگه دار
      state.generalEdits[row.id] = {
        name: row.name, weight: row.weight, chapters: row.chapters,
        masteredChapters: row.masteredChapters, mastery: row.mastery, include: row.include,
      };
      out.push(row);
    });
    return out;
  }

  /* ---------------- کلاس‌ها و آزمون‌ها ---------------- */

  function subjectOptions(selected) {
    const base = state.config && state.config.subjects ? state.config.subjects.filter((x) => !x.general) : presets.subjectsFor('tajrobi');
    const subs = base.concat((state.general || []).map((x) => ({ id: x.id, name: x.name })));
    return subs.map((x) => '<option value="' + esc(x.id) + '"' + (selected === x.id ? ' selected' : '') + '>' + esc(x.name) + '</option>').join('');
  }

  function renderClassRows(classes) {
    const box = $('classRows');
    box.innerHTML = '';
    (classes && classes.length ? classes : []).forEach((c, i) => {
      const div = document.createElement('div');
      div.className = 'dyn-row class';
      div.innerHTML =
        '<div><label>عنوان کلاس</label><input data-cf="title" value="' + esc(c.title || '') + '" placeholder="مثلاً کلاس زیست" /></div>' +
        '<div><label>درس</label><select data-cf="subjectId">' + subjectOptions(c.subjectId) + '</select></div>' +
        '<div><label>روز</label><select data-cf="weekday">' +
          WEEKDAY_FA.map((w, k) => '<option value="' + k + '"' + ((c.weekdays || [])[0] === k ? ' selected' : '') + '>' + w + '</option>').join('') +
        '</select></div>' +
        '<div><label>از</label>' + timeInput('data-cf="start"', c.start, '18:00') + '</div>' +
        '<div><label>تا</label>' + timeInput('data-cf="end"', c.end, '20:00') + '</div>' +
        '<button class="del" title="حذف">✕</button>';
      div.querySelector('.del').addEventListener('click', () => { div.remove(); toast('کلاس حذف شد — برای اعمال، برنامه را دوباره بساز.'); });
      box.appendChild(div);
    });
    if (!box.children.length) box.innerHTML = '<div class="muted" style="font-size:11.5px">کلاسی اضافه نشده.</div>';
  }

  function renderExamRows(exams) {
    const box = $('examRows');
    box.innerHTML = '';
    (exams && exams.length ? exams : []).forEach((e) => {
      const div = document.createElement('div');
      div.className = 'dyn-row exam';
      div.innerHTML =
        '<div><label>عنوان آزمون</label><input data-ef="title" value="' + esc(e.title || '') + '" placeholder="آزمون آزمایشی" /></div>' +
        '<div><label>تاریخ (شمسی)</label><input data-ef="date" data-jdate data-iso="' + esc(e.date || '') + '" placeholder="۱۴۰۵/۰۹/۱۲" /></div>' +
        '<div><label>از</label>' + timeInput('data-ef="start"', e.start, '08:00') + '</div>' +
        '<div><label>تا</label>' + timeInput('data-ef="end"', e.end, '11:30') + '</div>' +
        '<div class="wide"><label>درس‌های آزمون (با تیک انتخاب کن)</label>' +
          subjectChecksHtml('ef', e.subjectIds || []) + '</div>' +
        '<button class="del" title="حذف">✕</button>';
      div.querySelector('.del').addEventListener('click', () => { div.remove(); toast('آزمون حذف شد — برای اعمال، برنامه را دوباره بساز.'); });
      box.appendChild(div);
    });
    if (!box.children.length) box.innerHTML = '<div class="muted" style="font-size:11.5px">آزمونی اضافه نشده.</div>';
    else if (J) J.attachAll(box);
  }

  function readClasses() {
    const out = [];
    $('classRows').querySelectorAll('.dyn-row').forEach((row) => {
      const get = (f) => row.querySelector('[data-cf="' + f + '"]');
      out.push({
        title: get('title').value.trim() || 'کلاس آنلاین',
        subjectId: get('subjectId').value || null,
        weekdays: [Number(get('weekday').value)],
        start: readTime(get('start'), '18:00'),
        end: readTime(get('end'), '20:00'),
      });
    });
    return out;
  }

  function readExams() {
    const out = [];
    $('examRows').querySelectorAll('.dyn-row').forEach((row) => {
      const get = (f) => row.querySelector('[data-ef="' + f + '"]');
      const dateInput = get('date');
      const date = dateInput.dataset.iso || (J ? J.parse(dateInput.value) : null);
      if (!date) return;
      out.push({
        title: get('title').value.trim() || 'آزمون آزمایشی',
        date,
        start: readTime(get('start'), '08:00'),
        end: readTime(get('end'), '11:30'),
        subjectIds: readSubjectChecks(row),
      });
    });
    return out;
  }

  $('addClass').addEventListener('click', () => {
    const rows = readClasses();
    rows.push({ title: '', subjectId: null, weekdays: [0], start: '18:00', end: '20:00' });
    renderClassRows(rows);
  });

  $('addExam').addEventListener('click', () => {
    const rows = readExams();
    const d = new Date(); d.setDate(d.getDate() + 14);
    rows.push({ title: 'آزمون آزمایشی', date: J ? J.dateToISO(d) : iso(d), start: '08:00', end: '11:30', subjectIds: [] });
    renderExamRows(rows);
  });

  function readSubjects() {
    const rows = $('subjects').querySelectorAll('tbody tr');
    const out = [];
    rows.forEach((tr, i) => {
      const get = (f) => tr.querySelector('[data-f="' + f + '"]');
      const id = tr.dataset.id || ('S' + (i + 1));
      const base = (state.coreSubjects || []).find((x) => x.id === id) || {};
      const rows = chapterRows(base.id ? base : { id: id, chapters: 1 });
      out.push({
        id: id,
        name: get('name').value.trim() || 'درس ' + (i + 1),
        weight: Number(get('weight').value) || 1,
        chapters: rows.length,
        masteredChapters: rows.filter((r) => r.read && r.mastery >= 75).length,
        mastery: assessSummary(rows).avg,
        difficulty: Number(get('difficulty').value) || 2,
        type: get('type').value,
        examPercent: get('examPercent').value === '' ? null : Number(get('examPercent').value),
        include: get('include').checked,
        topicLabel: base.topicLabel || 'فصل',
        topicNames: rows.map((r) => r.name),
      });
    });
    return out;
  }

  function collectConfig() {
    const availability = {};
    document.querySelectorAll('[data-avail]').forEach((inp) => {
      availability[inp.dataset.avail] = numVal(inp);
    });
    const subjects = readSubjects()
      .concat(readGeneral().filter((x) => x.include))
      .map(withChapters)
      .map((x) => ensureTopicNames(x));
    const schoolDays = { sat: '16:00', sun: '16:00', mon: '16:00', tue: '16:00', wed: '16:00', thu: '09:00', fri: '09:00' };
    return {
      student: {
        name: $('name').value.trim() || 'دانش‌آموز',
        grade: $('grade').value,
        field: $('field').value,
        chronotype: $('chronotype').value,
      },
      startDate: readJDate('startDate') || iso(new Date()),
      examDate: readJDate('examDate') || presets.defaultExamDate(),
      sleep: { bedtime: readTime($('bedtime'), '23:30'), wake: readTime($('wake'), '07:00') },
      availability,
      timeMode: state.timeMode === 'auto' ? 'auto' : 'fixed',
      dailyCapHours: numVal($('dailyCap')) || 8,
      dailyFloorHours: numVal($('dailyFloor')) || 1,
      startTimes: schoolDays,
      blockMinutes: Number($('blockMinutes').value) || 45,
      breakMinutes: Number($('breakMinutes').value) || 10,
      restDay: Number($('restDay').value),
      weeklyMock: $('weeklyMock').value === '1',
      weeklyMocks: readMocks(),
      classes: readClasses(),
      exams: readExams(),
      generalGrades: state.gradeSel.slice(),
      subjects,
      startTimes: readStartTimes(),
      offDates: readOffRows(),
      deadlines: { books: readBookDeadlines(), exams: readShortDeadlines() },
      finals: {
        enabled: ($('finalsEnabled') || {}).value !== '0',
        courses: readFinals(),
        window: {
          start: readJDate('finalsStart') || (presets.defaultFinalsWindow ? presets.defaultFinalsWindow().start : null),
          end: readJDate('finalsEnd') || (presets.defaultFinalsWindow ? presets.defaultFinalsWindow().end : null),
        },
        spread: ($('finalsSpread') || {}).value !== '0',
        spreadMinutes: Number(($('finalsSpreadMinutes') || {}).value) || 45,
      },
      /* v2.5: بیداری پیش‌فرض، روال ثابت، شروع روزها، آیتم اضطراری */
      wakeTime: state.wakeTime || readTime($('wake'), '07:00'),
      dayStarts: Object.assign({}, state.dayStarts || {}),
      routinePinned: state.routinePinned === true,
      routines: readRoutines(),
      emergency: (state.emergency || []).map((e) => Object.assign({}, e)),
    };
  }

  function applyConfigToForm(cfg) {
    try {
      if (cfg.wakeTime) state.wakeTime = cfg.wakeTime;
      if (cfg.dayStarts) state.dayStarts = cfg.dayStarts;
      if (Array.isArray(cfg.emergency)) state.emergency = cfg.emergency;
      if (typeof cfg.routinePinned === 'boolean') state.routinePinned = cfg.routinePinned;
      if (Array.isArray(cfg.routines) && cfg.routines.length) state.routines = cfg.routines;
    } catch (e) { /* بی‌صدا */ }
    state.config = cfg;
    $('name').value = (cfg.student && cfg.student.name) || '';
    $('grade').value = (cfg.student && cfg.student.grade) || 'دوازدهم';
    $('field').value = (cfg.student && cfg.student.field) || 'tajrobi';
    $('chronotype').value = (cfg.student && cfg.student.chronotype) || 'neutral';
    writeJDate('startDate', cfg.startDate || iso(new Date()));
    writeJDate('examDate', cfg.examDate || presets.defaultExamDate());
    if ($('dailyCap')) $('dailyCap').value = faDigits(cfg.dailyCapHours != null ? cfg.dailyCapHours : 8);
    if ($('dailyFloor')) $('dailyFloor').value = faDigits(cfg.dailyFloorHours != null ? cfg.dailyFloorHours : 1);
    setTimeMode(cfg.timeMode === 'auto' ? 'auto' : 'fixed');
    $('bedtime').value = timeFa((cfg.sleep && cfg.sleep.bedtime) || '23:30');
    $('wake').value = timeFa((cfg.sleep && cfg.sleep.wake) || '07:00');
    $('restDay').value = String(cfg.restDay == null ? 5 : cfg.restDay);
    $('blockMinutes').value = String(cfg.blockMinutes || 45);
    $('breakMinutes').value = String(cfg.breakMinutes == null ? 10 : cfg.breakMinutes);
    $('weeklyMock').value = cfg.weeklyMock === false ? '0' : '1';
    state.weeklyMocks = cfg.weeklyMocks || [];
    renderMockRows(state.weeklyMocks);
    buildAvailabilityGrid(cfg.availability || {});
    const allSubs = cfg.subjects || presets.subjectsFor('tajrobi');
    /* ارزیابی فصل‌به‌فصل ذخیره‌شده را برگردان */
    state.chapters = {};
    allSubs.forEach((sub) => {
      if (Array.isArray(sub.chaptersData) && sub.chaptersData.length) {
        state.chapters[sub.id] = sub.chaptersData.map((c) => ({
          name: String(c.name || ''),
          read: Boolean(c.read),
          mastery: clampNum(c.mastery, 0, 100),
        }));
      }
    });
    const core = allSubs.filter((x) => !x.general);
    const gen = allSubs.filter((x) => x.general);
    renderSubjects(core.length ? core : presets.subjectsFor(cfg.student && cfg.student.field || 'tajrobi'));

    /* پایه‌های عمومی: از config، وگرنه از خودِ دروس ذخیره‌شده، وگرنه پایهٔ دانش‌آموز */
    const cfgGrades = cfg.generalGrades && cfg.generalGrades.length
      ? presets.normalizeGrades(cfg.generalGrades)
      : presets.normalizeGrades(gen.length ? gen.map((g) => g.grade).filter(Boolean) : ((cfg.student && cfg.student.grade) || 'دوازدهم'));
    state.gradeSel = cfgGrades;
    gen.forEach((g) => {
      state.generalEdits[g.id] = {
        name: g.name, weight: g.weight, chapters: g.chapters,
        masteredChapters: g.masteredChapters, mastery: g.mastery, include: g.include,
      };
    });
    renderGeneralForGrades();
    renderClassRows(cfg.classes || []);
    renderExamRows(cfg.exams || []);

    /* --- ساعت شروع، روزهای خارج از برنامه، مهلت‌ها، سوابق --- */
    renderStartTimes(cfg.startTimes || DEFAULT_START_TIMES);
    state.offDates = cfg.offDates || [];
    renderOffRows(state.offDates);
    state.deadlineBooks = (cfg.deadlines && cfg.deadlines.books) || [];
    state.deadlineExams = (cfg.deadlines && cfg.deadlines.exams) || [];
    renderBookDeadlineRows(state.deadlineBooks);
    renderShortDeadlineRows(state.deadlineExams);

    const fcfg = cfg.finals || {};
    const fgrade = (fcfg.courses && fcfg.courses[0] && fcfg.courses[0].grade) ||
      (cfg.student && cfg.student.grade === 'یازدهم' ? 'یازدهم' : 'دوازدهم');
    if ($('finalsEnabled')) $('finalsEnabled').value = fcfg.enabled === false ? '0' : '1';
    if ($('finalsGrade')) $('finalsGrade').value = fgrade;
    if ($('finalsSpread')) $('finalsSpread').value = fcfg.spread === false ? '0' : '1';
    if ($('finalsSpreadMinutes')) $('finalsSpreadMinutes').value = String(fcfg.spreadMinutes || 45);
    const win = presets.defaultFinalsWindow ? presets.defaultFinalsWindow() : { start: null, end: null };
    writeJDate('finalsStart', (fcfg.window && fcfg.window.start) || win.start);
    writeJDate('finalsEnd', (fcfg.window && fcfg.window.end) || win.end);
    if (fcfg.courses && fcfg.courses.length) {
      state.finalsList = fcfg.courses.map((c) => ({
        id: c.id, name: c.name, grade: c.grade || fgrade, influence: c.influence || 3, target: c.target == null ? 18 : c.target,
      }));
      state.finals = {};
      fcfg.courses.forEach((c) => {
        state.finals[c.id] = { current: c.current == null ? null : c.current, target: c.target == null ? 18 : c.target, inProgram: c.inProgram !== false };
      });
      renderFinalsTable();
    } else {
      loadFinalsFor(fgrade);
    }
  }

  function defaultConfig() {
    const field = $('field').value || 'tajrobi';
    return {
      student: {
        name: $('name').value.trim() || 'دانش‌آموز',
        grade: $('grade').value,
        field,
        chronotype: $('chronotype').value,
      },
      startDate: iso(new Date()),
      examDate: presets.defaultExamDate(),
      sleep: { bedtime: '23:30', wake: '07:00' },
      timeMode: 'fixed', dailyCapHours: 8, dailyFloorHours: 1,
      availability: { sat: 4, sun: 4, mon: 4, tue: 4, wed: 4, thu: 6, fri: 5 },
      startTimes: { sat: '16:00', sun: '16:00', mon: '16:00', tue: '16:00', wed: '16:00', thu: '09:00', fri: '09:00' },
      blockMinutes: 45,
      breakMinutes: 10,
      restDay: 5,
      weeklyMock: true,
      weeklyMocks: [{ title: 'آزمون جامع هفتگی', day: 5, everyNWeeks: 1, minutes: 100, subjectIds: [] }],
      classes: [],
      exams: [],
      generalGrades: state.gradeSel.slice(),
      subjects: presets.subjectsFor(field).concat(generalFromGrades()),
      startTimes: Object.assign({}, DEFAULT_START_TIMES),
      offDates: [],
      /* پیش‌فرض: هر دو مدل مهلت از روز اول دیده شوند (قابل حذف/ویرایش) */
      deadlines: {
        books: presets.suggestedBookDeadlines ? presets.suggestedBookDeadlines(presets.subjectsFor(field)) : [],
        exams: [],
      },
      finals: {
        enabled: true,
        courses: finalsDefaults(field, $('grade').value || 'دوازدهم'),
        window: presets.defaultFinalsWindow ? presets.defaultFinalsWindow() : { start: null, end: null },
        spread: true,
        spreadMinutes: 45,
      },
    };
  }

  $('field').addEventListener('change', () => {
    presets.subjectsFor($('field').value).forEach((s) => {
      const keep = state.chapters[s.id];
      state.chapters[s.id] = (keep && keep.length === s.chapters) ? keep : defaultChapterRows(s);
    });
    renderSubjects(presets.subjectsFor($('field').value));
    toast('دروس پیش‌فرض گروه تغییر کرد — ارزیابی فصل‌ها را بازبینی کن.');
  });

  $('resetSubjects').addEventListener('click', () => {
    presets.subjectsFor($('field').value).forEach((s) => {
      state.chapters[s.id] = defaultChapterRows(s);
    });
    renderSubjects(presets.subjectsFor($('field').value));
    toast('دروس و ارزیابی فصل‌ها بازگردانی شد.');
  });

  $('grade').addEventListener('change', () => {
    readGeneral();
    state.gradeSel = presets.normalizeGrades($('grade').value);
    state.generalEdits = {};
    renderGeneralForGrades();
    toast('دروس عمومی پایهٔ ' + $('grade').value + ' بارگذاری شد (قابل تغییر از بخش ۶).');
  });

  $('resetGeneral').addEventListener('click', () => {
    state.generalEdits = {};
    renderGeneralForGrades();
    toast('دروس عمومی پایه‌های انتخابی بازگردانی شد.');
  });

  $('toggleGeneral').addEventListener('click', () => {
    const rows = readGeneral();
    const anyOn = rows.some((r) => r.include);
    rows.forEach((r) => { r.include = !anyOn; });
    renderGeneralForGrades();
  });

  /* ---------------- ساخت برنامه ---------------- */

  $('build').addEventListener('click', async () => {
    const btn = $('build');
    btn.disabled = true;
    const old = btn.textContent;
    btn.innerHTML = '<span class="spinner"></span> در حال ساخت…';
    try {
      const cfg = collectConfig();
      const plan = engine.createPlan(cfg);
      try {
        window.__revalDebug = {
          cfg: { timeMode: cfg.timeMode, dailyCapHours: cfg.dailyCapHours, availability: cfg.availability, startDate: cfg.startDate, examDate: cfg.examDate },
          auto: plan.summary.autoInfo,
          summary: { totalHours: plan.summary.totalHours, avg: plan.summary.avgHoursPerDay, days: plan.days.length, cov: plan.summary.coverage.coverageRatio },
          metaCfg: { autoHours: plan.meta.config.autoHours, timeMode: plan.meta.config.timeMode, avail: plan.meta.config.availability },
        };
      } catch (e) { /* بی‌صدا */ }
      state.config = cfg;
      state.plan = plan;
      /* هر عنوان «فصل N» که از دادهٔ قدیمی مانده، با عنوان رسمی کتاب عوض می‌شود */
      try { migratePlanChapterNames(plan); } catch (e) { /* بی‌صدا */ }
      state.week = 0;
      state.selectedDay = null;
      state.scores = {};
      state.done = {};
      state.visited = { 'step-1': true, 'step-2': true, 'step-3': true, 'step-4': true, 'step-5': true, 'step-6': true };
      renderPlan();
      renderReport();
      renderHome();
      gotoView('plan');
      toast('برنامه ساخته شد ✓');
      await persist();
    } catch (err) {
      toast('خطا: ' + err.message);
      console.error(err);
    } finally {
      btn.disabled = false;
      btn.textContent = old;
    }
  });

  /* ---------------- نمایش برنامه ---------------- */

  function renderPlan() {
    const plan = state.plan;
    if (!plan) return;
    $('planEmpty').style.display = 'none';
    $('planBody').style.display = 'block';

    const s = plan.summary;
    $('stats').innerHTML = [
      stat(faNum(s.totalHours), 'ساعت برنامه‌ریزی‌شده'),
      stat(faNum(s.avgHoursPerDay), 'میانگین ساعت روزانه'),
      stat(faNum(s.learnedTopics), 'مبحث پوشش‌داده‌شده'),
      stat(faNum(s.totalReviewEvents), 'جلسهٔ مرور فاصله‌دار'),
      stat(faNum(s.classFixBlocks || 0), 'تثبیت کلاس'),
      stat(faNum(s.examDays || 0), 'روز آزمون'),
    ].join('');

    $('coachNotes').innerHTML = s.coachNotes.map((n) => '<li>' + esc(n) + '</li>').join('');
    const issues = issuesOf(plan);
    renderIssues(issues, $('warnBox'));
    renderIssues(issues, $('issueBox'));

    const maxMinutes = Math.max.apply(null, s.bySubject.map((x) => x.minutes).concat([1]));
    $('subjectBars').innerHTML = s.bySubject.map((x) => {
      const w = Math.round((x.minutes / maxMinutes) * 100);
      return '<div style="margin-bottom:10px">' +
        '<div class="row" style="justify-content:space-between"><span style="font-size:12.5px">' + esc(x.name) + '</span>' +
        '<span class="muted" style="font-size:11.5px">' + faNum(x.hours) + ' ساعت · ضریب ' + faNum(x.weight) +
        ' · سهم ' + faNum(Math.round(x.sharePlanned * 100)) + '٪</span></div>' +
        '<div class="bar"><i style="width:' + w + '%"></i></div></div>';
    }).join('');

    renderCoach(plan);
    renderWeek();
    renderScoreGrid();
  }

  /* ---------------- تب گزارش و آنالیز ---------------- */

  function progressBar(pct) {
    const v = Math.max(0, Math.min(100, Math.round(pct)));
    return '<div class="bar" style="min-width:60px"><i style="width:' + v + '%"></i></div>' +
      '<span class="muted" style="font-size:10.5px">' + faNum(v) + '٪</span>';
  }

  function statusPill(st) {
    const m = DL_STATUS[st] || { fa: st, cls: 'warn' };
    return '<span class="pill ' + m.cls + '">' + esc(m.fa) + '</span>';
  }

  function renderReport() {
    const plan = state.plan;
    if (!plan) {
      if ($('reportEmpty')) $('reportEmpty').style.display = 'block';
      if ($('reportBody')) $('reportBody').style.display = 'none';
      return;
    }
    $('reportEmpty').style.display = 'none';
    $('reportBody').style.display = 'block';
    const c = plan.summary.coverage;

    $('reportStats').innerHTML = [
      stat(faNum(c.coverageRatio) + '٪', 'پوشش فصل‌ها'),
      stat(faNum(c.readiness) + ' → ' + faNum(c.projectedReadiness) + '٪', 'آمادگی کنکور (اکنون → پایان)'),
      stat(faNum(c.finalsReadiness) + '٪', 'آمادگی سوابق تحصیلی'),
      stat(faNum(c.composite) + '٪', 'نمرهٔ ترکیبی ۱۴۰۶ (۴۰/۶۰)'),
    ].join('');

    /* --- مهلت‌های کتابی --- */
    const books = c.deadlineBooks || [];
    $('bookDeadlineTable').innerHTML = books.length
      ? '<table class="chap"><thead><tr><th>کتاب</th><th>مهلت</th><th>وضعیت</th><th>فصل</th>' +
        '<th>زمان چیده‌شده / لازم</th><th>تمام‌شدن</th></tr></thead><tbody>' +
        books.map((d) => '<tr><td><b style="font-size:12px">' + esc(d.subjectName) + '</b></td>' +
          '<td>' + faNum(J ? J.fmt(d.date) : d.date) + '</td>' +
          '<td>' + statusPill(d.status) + '</td>' +
          '<td>' + faNum(d.doneChapters) + ' از ' + faNum(d.chapters) + '</td>' +
          '<td><span class="num">' + faNum(Math.round(d.plannedMinutes / 60)) + ' / ' + faNum(Math.round(d.needMinutes / 60)) + '</span> ساعت</td>' +
          '<td>' + (d.finishDate ? faNum(J ? J.fmt(d.finishDate) : d.finishDate) : '—') + '</td></tr>').join('') +
        '</tbody></table>'
      : '<div class="muted" style="font-size:12px">مهلت کتابی ثبت نشده. از تب تنظیمات، بخش ۸ اضافه کن.</div>';

    /* --- مهلت‌های کوتاه --- */
    const exams = c.deadlineExams || [];
    $('shortDeadlineTable').innerHTML = exams.length
      ? '<table class="chap"><thead><tr><th>آزمون</th><th>نوع</th><th>تاریخ</th><th>وضعیت</th>' +
        '<th>فصل‌های آماده</th><th>زمان چیده‌شده / لازم</th></tr></thead><tbody>' +
        exams.map((d) => '<tr><td><b style="font-size:12px">' + esc(d.title) + '</b>' +
          (d.subjectName && d.kind === 'single' ? '<div class="muted" style="font-size:10.5px">' + esc(d.subjectName) + '</div>' : '') + '</td>' +
          '<td>' + (d.kind === 'comprehensive' ? 'جامع' : 'تک‌درس') + '</td>' +
          '<td>' + faNum(J ? J.fmt(d.date) : d.date) + '</td>' +
          '<td>' + statusPill(d.status) + '</td>' +
          '<td>' + faNum(d.doneChapters) + ' از ' + faNum(d.chapters) + '</td>' +
          '<td>' + faNum(Math.round(d.plannedMinutes / 60 * 10) / 10) + ' / ' + faNum(Math.round(d.needMinutes / 60 * 10) / 10) + ' ساعت</td></tr>').join('') +
        '</tbody></table>'
      : '<div class="muted" style="font-size:12px">آزمون تک‌درس یا جامعی ثبت نشده. از تب تنظیمات، بخش ۹ اضافه کن.</div>';

    /* --- سوابق تحصیلی --- */
    const fc = c.finalsCourses || [];
    $('finalsReport').innerHTML = fc.length
      ? '<p class="muted" style="margin-top:0;font-size:11.5px">نمرهٔ فعلی، برآورد پایان دوره و زمانی که برنامه برای هر درس گذاشته است. ' +
        'اگر نمره‌ای ثبت نکرده باشی، «فرض ۱۲» علامت می‌خورد.</p>' +
        '<table class="chap"><thead><tr><th>درس</th><th>ضریب</th><th>فعلی</th><th>هدف</th><th>برآورد پایان</th>' +
        '<th>زمان چیده‌شده / لازم</th><th style="width:130px">پیشرفت</th></tr></thead><tbody>' +
        fc.map((x) => '<tr><td><b style="font-size:12px">' + esc(x.name) + '</b>' +
          (x.assumed ? ' <span class="pill warm" title="نمره ثبت نشده">فرض</span>' : '') + '</td>' +
          '<td>' + faNum(x.influence) + '</td>' +
          '<td>' + faNum(Math.round(x.current * 10) / 10) + '</td>' +
          '<td>' + faNum(x.target) + '</td>' +
          '<td><b>' + faNum(Math.round((x.projected / 100) * 20 * 10) / 10) + '</b></td>' +
          '<td><span class="num">' + faNum(Math.round(x.plannedMinutes / 60 * 10) / 10) + ' / ' + faNum(Math.round(x.needMinutes / 60 * 10) / 10) + '</span> ساعت</td>' +
          '<td>' + progressBar(x.progress) + '</td></tr>').join('') +
        '</tbody></table>' +
        '<div style="margin-top:12px"><b style="font-size:12.5px">بارم رسمی، فصل‌به‌فصل</b>' +
        '<div class="muted" style="font-size:11px;margin:3px 0 8px">نمرهٔ هر فصل در برگهٔ نهایی و زمانی که برنامه برایش گذاشته است — ' +
        'فصل پربارم، وقت بیشتری می‌گیرد.</div>' +
        fc.filter((x) => (x.chapters || []).length).map((x) =>
          '<details style="margin-bottom:6px"><summary style="cursor:pointer;font-size:12px">' + esc(x.name) +
          ' <span class="muted" style="font-size:10.5px">· ' + (x.uniform ? 'بارم یکنواخت' : 'بارم نامتوازن') +
          (x.approx ? ' · تقریبی' : '') + '</span></summary>' +
          '<table class="chap" style="margin-top:6px"><thead><tr><th>فصل / قلمرو</th><th>بارم</th>' +
          '<th title="سهم این فصل از نمرهٔ کل برگهٔ نهایی">سهم از برگه</th><th>زمان چیده‌شده</th></tr></thead><tbody>' +
          x.chapters.map((ch) => {
            const sum = x.chapters.reduce((a, b2) => a + (b2.baram || 0), 0) || 1;
            const pct = Math.round(((ch.baram || 0) / sum) * 1000) / 10;
            return '<tr><td>' + esc(ch.name) + '</td><td>' + faNum(Math.round(ch.baram * 100) / 100) +
              '</td><td><b>' + faNum(pct) + '٪</b></td>' +
              '<td>' + faNum(Math.round((ch.minutes || 0) / 60 * 10) / 10) + ' ساعت</td></tr>';
          }).join('') +
          '</tbody></table>' +
          (x.source ? '<div class="muted" style="font-size:10px;margin-top:4px">منبع: ' + esc(x.source) + '</div>' : '') +
          '<div class="muted" style="font-size:10.5px;margin-top:4px">روش مطالعهٔ نهایی: ' +
            esc((x.method || []).join(' · ')) + '</div>' +
          '</details>').join('') +
        '</div>'
      : '<div class="muted" style="font-size:12px">لایهٔ سوابق غیرفعال است (تنظیمات، بخش ۱۰).</div>';

    /* --- ظرفیت و استاندارد --- */
    const adv = c.capacityAdvisory || {};
    const covOk = c.coverageRatio >= 98;
    $('capacityBox').innerHTML =
      '<div class="grid g3">' +
        '<div class="kpi"><b>' + faNum(adv.declaredDailyHours || 0) + ' ساعت</b><span>ساعت اعلامی تو در روز</span></div>' +
        '<div class="kpi"><b>' + faNum(adv.minDailyHoursNeeded || 0) + ' ساعت</b><span>حداقل لازم برای پوشش کامل</span></div>' +
        '<div class="kpi"><b>' + faNum(Math.round((adv.fixedWeeklyMinutes || 0) / 60 * 10) / 10) + ' ساعت</b><span>کلاس/آزمون ثابت در هفته</span></div>' +
      '</div>' +
      '<p style="margin:10px 0 0;font-size:12.5px;' + (covOk ? 'color:#047857' : 'color:#b45309') + '">' +
        (covOk
          ? '✓ با ساعت‌های فعلی، پوشش کامل فصل‌ها در دسترس است.'
          : '⚠ با ساعت‌های فعلی پوشش ' + faNum(c.coverageRatio) + '٪ می‌شود. ' +
            'برای پوشش کامل روزی حداقل ' + faNum(adv.minDailyHoursNeeded) + ' ساعت لازم است؛ ' +
            'می‌توانی ساعت‌ها را بالا ببری (تا ۱۶ ساعت را پشتیبانی می‌کند) یا چند فصل کم‌ضریب را عقب بیندازی.') +
      '</p>' +
      '<p class="muted" style="margin:6px 0 0;font-size:11.5px">' +
        'ظرفیت تست: هدف ' + faNum(c.testTargetDaily) + ' تست در روز · ' +
        'میانگین واقعی برنامه ' + faNum(c.testsPerDay) + ' تست · ' +
        'لازم برای استاندارد ' + faNum(c.requiredDailyTests || 0) + ' تست در روز.' +
      '</p>';

    /* --- ظرفیت تست هر درس --- */
    const tRows = c.testsBySubject || [];
    $('testCapacityTable').innerHTML = tRows.length
      ? '<table class="chap"><thead><tr><th>درس</th><th>تست لازم</th><th>چیده‌شده</th><th>پوشش</th><th style="width:130px">پیشرفت</th></tr></thead><tbody>' +
        tRows.map((t) => {
          const pct = t.need > 0 ? Math.min(100, Math.round((t.planned / t.need) * 100)) : 100;
          return '<tr><td><b style="font-size:12px">' + esc(t.name) + '</b></td>' +
            '<td class="num">' + faNum(t.need) + '</td>' +
            '<td class="num">' + faNum(t.planned) + '</td>' +
            '<td>' + faNum(pct) + '٪</td>' +
            '<td>' + progressBar(pct) + '</td></tr>';
        }).join('') + '</tbody></table>'
      : '<div class="muted" style="font-size:12px">داده‌ای نیست.</div>';

    /* --- آزمون‌های دوره‌ای --- */
    const mocks = (plan.meta && plan.meta.weeklyMocks) || state.weeklyMocks || [];
    $('mocksReport').innerHTML = mocks.length
      ? '<table class="chap"><thead><tr><th>آزمون</th><th>روز</th><th>تکرار</th><th>مدت</th><th>دروس</th></tr></thead><tbody>' +
        mocks.map((m) => '<tr><td><b style="font-size:12px">' + esc(m.title) + '</b></td>' +
          '<td>' + (WEEKDAYS_FA[Number(m.day) || 0] || '—') + '</td>' +
          '<td>' + (Number(m.everyNWeeks) <= 1 ? 'هر هفته' : 'هر ' + faNum(m.everyNWeeks) + ' هفته') + '</td>' +
          '<td class="num">' + faNum(m.minutes) + ' دقیقه</td>' +
          '<td>' + ((m.subjectIds || []).length ? (m.subjectIds || []).map((id) => {
            const sub = (plan.meta.subjects || []).find((x) => x.id === id);
            return esc(sub ? sub.name : id);
          }).join('، ') : 'همه دروس') + '</td></tr>').join('') +
        '</tbody></table>'
      : '<div class="muted" style="font-size:12px">آزمون دوره‌ای تعریف نشده.</div>';

    renderBookTable(plan);
    renderChapterTable(plan);
    renderReportFilters(plan);
  }

  function renderReportFilters(plan) {
    const sel = $('reportBook');
    if (!sel) return;
    const cur = sel.value || 'all';
    const subs = (plan.summary.bySubject || []).filter((x) => plan.summary.chapterStats.some((c) => c.subjectId === x.id));
    sel.innerHTML = '<option value="all">همهٔ کتاب‌ها</option>' +
      subs.map((x) => '<option value="' + esc(x.id) + '">' + esc(x.name) + '</option>').join('');
    sel.value = subs.some((x) => x.id === cur) ? cur : 'all';
    renderChapterTable(plan);
  }

  function renderBookTable(plan) {
    const chs = plan.summary.chapterStats || [];
    const rows = (plan.summary.bySubject || []).map((sub) => {
      const list = chs.filter((c) => c.subjectId === sub.id);
      if (!list.length) return null;
      const need = list.reduce((a, c) => a + c.needMinutes, 0);
      const planned = list.reduce((a, c) => a + c.plannedMinutes, 0);
      const testsNeed = list.reduce((a, c) => a + c.testsNeed, 0);
      const testsDone = list.reduce((a, c) => a + c.testsDone, 0);
      const covered = list.filter((c) => c.covered).length;
      const mastery = Math.round(list.reduce((a, c) => a + c.mastery, 0) / list.length);
      const reviews = list.reduce((a, c) => a + (c.reviews || 0), 0);
      return '<tr><td><b style="font-size:12px">' + esc(sub.name) + '</b>' +
        '<div class="muted" style="font-size:10.5px">ضریب ' + faNum(sub.weight) + '</div></td>' +
        '<td>' + faNum(covered) + ' / ' + faNum(list.length) + '</td>' +
        '<td>' + faNum(Math.round(covered / list.length * 100)) + '٪</td>' +
        '<td>' + faNum(Math.round(planned / 60)) + ' / ' + faNum(Math.round(need / 60)) + ' ساعت</td>' +
        '<td>' + faNum(testsDone) + ' / ' + faNum(testsNeed) + '</td>' +
        '<td>' + faNum(mastery) + '٪</td>' +
        '<td>' + faNum(reviews) + '</td>' +
        '<td>' + progressBar(planned / Math.max(1, need) * 100) + '</td></tr>';
    }).filter(Boolean);
    $('bookTable').innerHTML =
      '<table class="chap"><thead><tr><th>کتاب</th><th>فصل</th><th>پوشش</th><th>زمان چیده‌شده / لازم</th>' +
      '<th>تست انجام‌شده / لازم</th><th>تسلط فعلی</th><th>مرور</th><th style="width:120px">پیشرفت</th></tr></thead><tbody>' +
      rows.join('') + '</tbody></table>';
  }

  /** «چه چیزی مانده» — جملهٔ دقیق و قابل‌اجرا برای هر فصل */
  function remainingText(c) {
    if (c.mode === 'solid') return 'مرور فاصله‌دار تا کنکور';
    if (c.plannedMinutes === 0) {
      return c.read
        ? 'جبران نشده — نیازمند ' + faNum(c.needMinutes) + ' دقیقه بازآموزی'
        : 'هنوز خوانده نشده — نیازمند ' + faNum(c.needMinutes) + ' دقیقه';
    }
    if (c.covered) return c.testsNeed > 0 ? faNum(Math.max(0, c.testsNeed - c.testsDone)) + ' تست برای تکمیل' : 'تثبیت‌شده';
    const parts = [];
    if (c.remainingMinutes > 0) parts.push(faNum(c.remainingMinutes) + ' دقیقه مطالعه');
    if (c.testsNeed > c.testsDone) parts.push(faNum(c.testsNeed - c.testsDone) + ' تست');
    if (c.mastery < 75) parts.push('تسلط زیر ۷۵٪ (اکنون ' + faNum(Math.round(c.mastery)) + '٪)');
    return parts.length ? parts.join(' · ') : 'مرور';
  }

  /* ── سلولِ «اهمیت واقعی» (۲.۸.۱۲) ─────────────────────────────────────
     عددها دیگر دستی نیستند: میانگینِ سؤالِ همان فصل در کنکورهای اخیر،
     سهمش از درس، ضریبِ درس، و «اولویتِ» حاصل از ضربِ این دو.
     tooltip همان سلول، ریزِ سال‌به‌سال و منبع را نشان می‌دهد. */
  function importanceCell(c) {
    if (!c.ciTag) return '<span class="muted" style="font-size:10.5px">—</span>';
    const cls = c.ciTag === 'بحرانی' ? 'crit' : c.ciTag === 'پرتکرار' ? 'hot' : c.ciTag === 'متوسط' ? 'mid' : 'low';
    const q = faNum(Math.round((c.ciQuestions || 0) * 10) / 10);
    const share = faNum(Math.round((c.ciSharePct || 0) * 10) / 10);
    const prio = c.ciPriority == null ? null : Math.round(c.ciPriority);
    const coef = c.ciCoef == null ? null : c.ciCoef;
    const cols = c.ciCols || [];
    const detail = (function () {
      if (!c.ciDataDriven) {
        return 'دادهٔ فصل‌به‌فصلِ این درس برای این رشته در دسترس نیست؛ عدد نمایش‌داده‌شده برآورد است.';
      }
      const per = cols.map((col, i) => {
        const v = (c.ciSeries || [])[i];
        if (v == null) return null;
        const extra = col.merged && col.merged.length ? ' (+' + col.merged.join('، ') + ' هم‌عدد)' : '';
        return col.label + ': ' + faNum(Math.round(v * 10) / 10) + extra;
      }).filter(Boolean).join(' · ');
      const trend = c.ciTrend == null ? 0 : Math.round(c.ciTrend * 10) / 10;
      const parts = [
        'تعداد سؤال این فصل در هر آزمون — ' + per,
        'میانگینِ وزنی (سال‌های جدیدتر وزن بیشتر): ' + q + ' سؤال از ' + faNum(c.ciQTotal || 0),
        'سهم از سؤال‌های درس: ' + share + '٪',
        trend ? 'روند نسبت به سال‌های دورتر: ' + (trend > 0 ? '+' : '') + faNum(trend) + ' سؤال' : null,
        coef != null ? 'ضریب درس در کنکور: ' + faNum(coef) : null,
        prio != null ? 'اولویت در کل رشته (سؤال × ضریب، ۰ تا ۱۰۰): ' + faNum(prio) : null,
        c.ciCoarse ? 'توجه: برای این درس فقط ' + faNum(c.ciExams || 0) + ' آزمونِ مستقل منتشر شده؛ قطعیت کمتر از دروس دیگر است.' : null,
        c.ciSources && c.ciSources.length ? 'منبع: ' + c.ciSources.join(' ، ') : null,
      ].filter(Boolean);
      return parts.join('\n');
    })();
    return '<span class="ci ci-' + cls + '" title="' + esc(detail) + '">' + esc(c.ciTag) + '</span>' +
      (prio != null ? '<span class="ci-prio" title="' + esc(detail) + '">اولویت رشته ' + faNum(prio) + '</span>' : '') +
      (c.ciCoarse ? '<span class="ci-soft" title="' + esc(detail) + '">دادهٔ محدود</span>' : '') +
      '<div class="muted" style="font-size:10.5px">' + q + ' سؤال در هر آزمون · ' + share + '٪ درس' +
      (coef != null ? ' · ضریب ' + faNum(coef) : '') +
      (c.ciExams ? ' · ' + faNum(c.ciExams) + ' آزمون' : '') + '</div>';
  }

  function renderChapterTable(plan) {
    const box = $('chapterTable');
    if (!box) return;
    plan = plan || state.plan;
    if (!plan) return;
    const all = plan.summary.chapterStats || [];
    const book = ($('reportBook') && $('reportBook').value) || 'all';
    const filter = ($('reportFilter') && $('reportFilter').value) || 'all';
    let list = all.filter((c) => book === 'all' || c.subjectId === book);
    if (filter === 'open') list = list.filter((c) => !c.covered);
    else if (filter === 'weak') list = list.filter((c) => c.read && c.mastery < 75);
    else if (filter === 'deadline') list = list.filter((c) => c.deadlineIdx != null);
    else if (filter === 'week') {
      const today = iso(new Date());
      const weekEnd = (function () { const d = new Date(); d.setDate(d.getDate() + 7); return iso(d); })();
      const inWeek = new Set();
      state.plan.days.forEach((d) => {
        if (d.date >= today && d.date <= weekEnd) {
          d.blocks.forEach((b) => inWeek.add(b.subjectId + '|' + b.topic));
        }
      });
      list = list.filter((c) => Array.from(inWeek).some((k) => k.indexOf(c.subjectName + '|') === 0 && k.indexOf(c.label) !== -1));
    }

    if (!list.length) { box.innerHTML = '<div class="muted" style="font-size:12px">موردی با این فیلتر نیست.</div>'; return; }
    box.innerHTML =
      '<table class="chap"><thead><tr><th>فصل</th><th>اهمیت واقعی</th><th>وضعیت</th><th>تسلط</th><th>تست</th>' +
      '<th style="width:110px">پیشرفت</th><th>چه چیزی مانده</th></tr></thead><tbody>' +
      list.map((c) => '<tr' + (c.mode === 'solid' ? ' style="opacity:.75"' : '') + '>' +
        '<td><b style="font-size:12px">' + esc(c.label) + '</b>' +
          '<div class="muted" style="font-size:10.5px">' + esc(c.subjectName) +
          (c.deadlineTitle ? ' · مهلت: ' + esc(c.deadlineTitle) : '') + '</div></td>' +
        '<td>' + importanceCell(c) + '</td>' +
        '<td><span class="pill ' + (c.mode === 'solid' ? '' : c.mastery < 45 ? 'hot' : c.mastery < 75 ? 'warm' : '') + '">' +
          esc(c.status) + '</span></td>' +
        '<td>' + faNum(Math.round(c.mastery)) + '٪<div class="muted" style="font-size:10.5px">هدف ۷۵٪</div></td>' +
        '<td><span dir="rtl">' + faNum(c.testsDone) + ' از ' + faNum(c.testsNeed) + '</span></td>' +
        '<td>' + progressBar(c.progress) + '</td>' +
        '<td style="font-size:11.5px">' + esc(remainingText(c)) + '</td>' +
      '</tr>').join('') + '</tbody></table>';
  }

  $('reportFilter').addEventListener('change', () => renderChapterTable(state.plan));
  $('reportBook').addEventListener('change', () => renderChapterTable(state.plan));

  /* ---------------- کارت مشاور: آمادگی و نقشهٔ جبران ---------------- */

  const MODE_FA = {
    learn: 'یادگیری از صفر',
    reteach: 'جبران و بازآموزی',
    boost: 'ارتقای تسلط',
    solid: 'فقط مرور',
  };

  function renderCoach(plan) {
    const c = (plan.summary && plan.summary.coverage) || null;
    if (!c) return;
    $('coachStats').innerHTML = [
      stat(faNum(c.readiness) + '٪', 'آمادگی فعلی'),
      stat(faNum(c.projectedReadiness) + '٪', 'برآورد پایان دوره'),
      stat(faNum(c.readChapters) + ' / ' + faNum(c.totalChapters), 'فصل خوانده‌شده'),
      stat(faNum(c.reteachChapters + c.boostChapters), 'فصل نیازمند جبران/ارتقا'),
    ].join('');

    const verdict = $('coachVerdict');
    verdict.innerHTML =
      '<div class="' + (c.willCover ? 'hint' : 'warn') + '">' +
        (c.willCover ? '✓ ' : '⚠ ') + esc(c.verdict) +
        ' <span class="muted" style="font-size:11px">(نیاز باقی‌مانده: ' + faNum(Math.round(c.remainingMinutes / 60)) +
        ' ساعت · ظرفیت آزاد تا کنکور: ' + faNum(Math.round(c.spareMinutes / 60)) + ' ساعت)</span>' +
      '</div>';

    const weak = (plan.summary.weakChapters || []).slice(0, 10);
    $('weakList').innerHTML = weak.length
      ? weak.map((w) => {
        const subj = (plan.summary.bySubject || []).find((x) => x.id === w.subjectId) || { weight: 1 };
        const cls = w.mastery < 45 ? 'hot' : 'warm';
        return '<div class="weakrow">' +
          '<span class="pill ' + cls + '">' + faNum(w.mastery) + '٪</span>' +
          '<b style="font-size:12px">' + esc(w.subjectName) + '</b>' +
          '<span style="flex:1">' + esc(w.label) + '</span>' +
          '<span class="muted" style="font-size:11px">' + esc(MODE_FA[w.mode] || w.mode) +
            ' · ضریب ' + faNum(subj.weight) + '</span>' +
          '<span class="muted" style="font-size:11px;min-width:78px;text-align:left">' +
            faNum(w.plannedMinutes) + ' دقیقه در برنامه</span>' +
        '</div>';
      }).join('')
      : '<div class="muted" style="font-size:12px">هیچ فصلی زیر ۷۵٪ تسلط نیست — وضعیت خوبی است؛ مرور فاصله‌دار ادامه پیدا می‌کند.</div>';

    const pr = plan.summary.priorities || [];
    $('priorityList').innerHTML = pr.length
      ? pr.map((x) => '<li>' + esc(x.subject) + ' — ' + esc(x.chapter) + ' <span class="pill ' +
          (x.mode === 'reteach' ? 'hot' : x.mode === 'boost' ? 'warm' : '') + '">' + esc(MODE_FA[x.mode] || x.mode) + '</span></li>').join('')
      : '<li class="muted">همهٔ فصل‌ها در وضعیت خوب‌اند؛ اولویت، حفظ تسلط با مرور و آزمون است.</li>';
  }

  function stat(value, label) {
    return '<div class="stat"><b>' + value + '</b><span>' + label + '</span></div>';
  }

  function renderWeek() {
    const plan = state.plan;
    const totalWeeks = Math.ceil(plan.days.length / 7);
    state.week = Math.max(0, Math.min(totalWeeks - 1, state.week));
    $('weekLabel').textContent = 'هفتهٔ ' + faNum(state.week + 1) + ' از ' + faNum(totalWeeks);

    const startIdx = state.week * 7;
    const pills = [];
    for (let i = startIdx; i < Math.min(startIdx + 7, plan.days.length); i++) {
      const d = plan.days[i];
      pills.push('<button class="day-pill' + (String(i) === String(state.selectedDay) ? ' active' : '') + '" data-day="' + i + '">' +
        esc(d.weekday) + '<small class="xp-day">' + jDayMonth(d.date) + '</small>' +
        '<small>' + faNum(Math.round(d.plannedMinutes / 60 * 10) / 10) + ' ساعت' +
        (d.variety && d.variety.subjects >= 2 ? ' · ' + faNum(d.variety.subjects) + ' درس' : '') + '</small></button>');
    }
    $('dayPills').innerHTML = pills.join('');
    $('dayPills').querySelectorAll('[data-day]').forEach((b) => {
      b.addEventListener('click', () => { state.selectedDay = Number(b.dataset.day); renderWeek(); });
    });

    if (state.selectedDay == null || Math.floor(state.selectedDay / 7) !== state.week) {
      // پیش‌فرض: اولین روزِ پرِ همان هفته
      const first = plan.days.slice(startIdx, startIdx + 7).findIndex((d) => d.blocks.length);
      state.selectedDay = startIdx + (first === -1 ? 0 : first);
    }
    renderDay(state.selectedDay);
  }

  function renderDay(idx) {
    const plan = state.plan;
    const d = plan.days[idx];
    if (!d) { $('dayView').innerHTML = ''; return; }

    /* ۲.۸.۱۱ — «چند درس در این روز؟» با درصدِ سهم هر درس.
       چرا: برنامهٔ یک‌کتابی هم خسته‌کننده است و هم برخلاف شواهد «تمرین درهم» و
       «فاصله‌گذاری» (Rohrer 2007؛ Cepeda 2006؛ Kornell & Bjork 2008) است.
       با این نوار، دانش‌آموز در یک نگاه می‌بیند که امروز چند کتاب/درس در کار است. */
    const varietyHtml = (function () {
      const v = d.variety;
      if (!v || !v.list || v.list.length < 2) return '';
      const chips = v.list.slice(0, 5).map((x) =>
        '<span class="vchip">' + esc(x.name) + ' <b>' + faNum(x.percent) + '٪</b></span>').join('');
      const extra = v.list.length > 5
        ? '<span class="vchip more">+' + faNum(v.list.length - 5) + ' درس</span>' : '';
      return '<div class="variety" title="تنوعِ درس‌ها عمدی است: درهم‌آمیزی و فاصله‌گذاری، بازیابی را قوی‌تر و خستگی را کمتر می‌کند؛ مرور و تثبیتِ هر فصل سرِ جای خودش می‌ماند.">' +
        '<span class="vlabel">' + faNum(v.subjects) + ' درس در این روز:</span>' + chips + extra + '</div>';
    })();

    const head = '<div class="card" style="margin-bottom:10px;background:var(--panel2)">' +
      '<div class="row" style="justify-content:space-between">' +
      '<div><b style="font-size:13.5px">' + esc(jDateFull(d.date)) + '</b>' +
      '<div class="muted" style="font-size:11.5px;margin-top:3px">' + durationFa(d.plannedMinutes) +
      (d.isMockDay ? ' · آزمون جامع' : '') + (d.isDeload ? ' · هفتهٔ سبک' : '') + '</div></div>' +
      '</div>' + (d.note ? '<div class="muted" style="margin-top:8px">' + esc(d.note) + '</div>' : '') +
      varietyHtml + '</div>';

    const events = (d.events || []).map((e) =>
      '<div class="evt' + (e.type === 'exam' ? ' exam' : '') + '">' +
      '<span>' + (e.type === 'exam' ? '📝' : '📌') + '</span>' +
      '<b>' + esc(e.title) + '</b>' +
      (e.subjectName ? '<span class="muted">· ' + esc(e.subjectName) + '</span>' : '') +
      '<span class="t">' + timeRange(e.start, e.end) + (e.type === 'exam' ? ' · آزمون' : ' · کلاس') + '</span>' +
      '</div>').join('');

    const blocks = d.blocks.map((b, i) => {
      const key = d.date + '#' + i;
      const done = state.done[key] ? 'checked' : '';
      return '<div class="' + blockStateClass(d, i) + '">' + doneTick(d, i) +
        '<div class="time">' + timeRange(b.start, b.end) + '<small>' + durationFa(b.minutes) + '</small></div>' +
        '<div><div class="t">' + esc(b.subjectName) + (b.kind === 'routine' ? '' : ' ' + chapterLine(b)) + '</div>' +
        '<div class="row" style="gap:6px;flex-wrap:wrap;margin:2px 0 4px">' + chapterBadge(b) + '</div>' +
        (b.kind === 'routine' ? '<div class="c">' + esc(b.content) + '</div>' : '') +
        (b.ifThen ? '<details><summary>جملهٔ اجرا (if-then)</summary>' + esc(b.ifThen) + '</details>' : '') +
        (b.why ? '<details><summary>چرا این کار؟</summary>' + esc(b.why) + '</details>' : '') +
        '</div>' +
        '<div><span class="badge ' + (KIND_CLASS[b.kind] || '') + '">' + esc(b.kindLabel) + '</span>' +
        '<div class="chk" style="margin-top:8px"><input type="checkbox" data-done="' + key + '" ' + done + ' /> انجام شد</div>' +
        timerHtml(d, b, i) + '</div>' +
        (b.kind === 'routine' ? '' : goalsHtml(b)) +
        '</div>';
    }).join('');

    const body = events + blocks;
    $('dayView').innerHTML = head + (body || '<div class="empty">این روز خالی است (استراحت).</div>');
    $('dayView').querySelectorAll('[data-done]').forEach((chk) => {
      chk.addEventListener('change', () => {
        state.done[chk.dataset.done] = chk.checked;
        persist();
      });
    });
  }

  $('prevWeek').addEventListener('click', () => { state.week--; state.selectedDay = null; renderWeek(); });
  $('nextWeek').addEventListener('click', () => { state.week++; state.selectedDay = null; renderWeek(); });
  /* «امروز»: هفته و روز جاری را پیدا و انتخاب می‌کند */
  if ($('todayBtn')) $('todayBtn').addEventListener('click', () => {
    const plan = state.plan;
    if (!plan || !plan.days || !plan.days.length) return;
    const todayISO = J ? J.dateToISO(new Date()) : iso(new Date());
    let idx = plan.days.findIndex((d) => d.date >= todayISO);
    if (idx < 0) idx = plan.days.length - 1;
    state.week = Math.floor(idx / 7);
    state.selectedDay = idx;
    renderWeek();
    toast('رفتی روی ' + (plan.days[idx] ? plan.days[idx].weekday : '') + ' ' + (plan.days[idx] && J ? J.fmt(plan.days[idx].date) : ''));
  });

  /* ---------------- ثبت درصد آزمون ---------------- */

  function renderScoreGrid() {
    const plan = state.plan;
    if (!plan) return;
    $('scoreGrid').innerHTML = plan.summary.bySubject.map((s) =>
      '<div><label>' + esc(s.name) + ' (تسلط فعلی ' + faNum(s.mastery) + '٪)</label>' +
      '<input type="number" min="-33" max="100" placeholder="درصد" data-score="' + esc(s.id) + '" value="' +
      (state.scores[s.id] == null ? '' : state.scores[s.id]) + '" /></div>'
    ).join('');
    $('scoreGrid').querySelectorAll('[data-score]').forEach((inp) => {
      inp.addEventListener('input', () => { state.scores[inp.dataset.score] = inp.value; });
    });
  }

  /* درصد آزمون هر درس را به ارزیابی فصل‌به‌فصل همان درس منتقل می‌کند
     (فصل‌های خوانده‌شده نصفِ فاصله به‌سمت درصد آزمون حرکت می‌کنند) */
  function syncScoresToChapters() {
    Object.keys(state.scores).forEach((sid) => {
      const v = state.scores[sid];
      if (v === undefined || v === '' || v === null) return;
      const rows = state.chapters[sid];
      if (!rows || !rows.length) return;
      const target = Math.max(0, Math.min(100, Number(v)));
      rows.forEach((r) => {
        if (!r.read) return;
        r.mastery = Math.round(Math.max(0, Math.min(100, r.mastery + 0.5 * (target - r.mastery))));
      });
    });
  }

  $('replan').addEventListener('click', () => {
    if (!state.plan) return;
    const cfg = JSON.parse(JSON.stringify(state.config));
    let changed = 0;
    cfg.subjects = cfg.subjects.map((s) => {
      const v = state.scores[s.id];
      if (v === undefined || v === '') return s;
      changed++;
      return engine.applySubjectScore ? engine.applySubjectScore(s, Number(v)) : engine.updateMastery(s, Number(v));
    });
    if (!changed) return toast('اول درصد آزمون حداقل یک درس را وارد کن.');
    // تاریخ شروع = امروز
    cfg.startDate = iso(new Date());
    // ارزیابی فصل‌ها هم با درصد آزمون به‌روز شود تا برنامهٔ جبران دقیق بماند
    syncScoresToChapters();
    cfg.subjects = cfg.subjects.map(withChapters);
    try {
      state.plan = engine.createPlan(cfg);
      state.config = cfg;
      state.week = 0;
      state.selectedDay = null;
      applyConfigToForm(cfg);
      renderPlan();
      persist();
      toast('برنامه با نتایج جدید بازتنظیم شد ✓');
    } catch (err) {
      toast('خطا: ' + err.message);
    }
  });

  /* ---------------- بازچینش هوشمند روزهای ازدست‌رفته ---------------- */

  function missedBlocks() {
    const plan = state.plan;
    if (!plan) return [];
    const today = iso(new Date());
    const out = [];
    plan.days.forEach((d) => {
      if (d.date >= today) return;
      d.blocks.forEach((b, bi) => {
        if (b.kind === 'exam' || b.kind === 'mock') return;      // آزمون برگزارشده قابل جبران نیست
        const key = d.date + '#' + bi;
        if (state.done[key]) return;
        out.push({ day: d.date, block: b, key });
      });
    });
    return out;
  }

  $('smartReplan').addEventListener('click', () => {
    if (!state.plan) return toast('اول برنامه را بساز.');
    const missed = missedBlocks();
    if (!missed.length) {
      state.lastCarry = [];
      $('carryCount').textContent = 'کار جامانده‌ای نیست — عالی پیش رفته‌ای.';
      return toast('چیزی برای جبران نیست.');
    }
    /* کارهای جامانده را به «کار عقب‌افتاده» تبدیل کن (فقط بخش یادگیری/تست، با سقف) */
    const byTopic = {};
    missed.forEach((m) => {
      if (m.block.kind === 'analysis' || m.block.kind === 'warmup') return;
      const k = m.block.subjectId + '|' + m.block.topic;
      byTopic[k] = byTopic[k] || {
        subjectId: m.block.subjectId, subjectName: m.block.subjectName,
        label: m.block.topic || m.block.kindLabel, minutes: 0,
        kind: (m.block.kind === 'review' || m.block.kind === 'cumreview') ? 'review' : 'learn',
      };
      byTopic[k].minutes += m.block.minutes;
    });
    const carry = Object.keys(byTopic).map((k) => byTopic[k]);
    if (!carry.length) {
      $('carryCount').textContent = 'جاماندهٔ قابل‌جبران نداشتی.';
      return toast('جاماندهٔ قابل‌جبران نبود.');
    }
    const cfg = JSON.parse(JSON.stringify(state.config || collectConfig()));
    cfg.startDate = iso(new Date());                 // از امروز به بعد بازچینش
    cfg.carryOver = carry;
    try {
      state.plan = engine.createPlan(cfg);
      state.config = cfg;
      state.week = 0;
      state.selectedDay = null;
      state.lastCarry = carry;
      $('carryCount').textContent = faNum(carry.length) + ' کار جامانده به روزهای آینده منتقل شد (' +
        faNum(Math.round(carry.reduce((a, c) => a + c.minutes, 0) / 60 * 10) / 10) + ' ساعت).';
      renderPlan();
      renderReport();
      persist();
      toast('بازچینش انجام شد ✓');
    } catch (err) { toast('خطا در بازچینش: ' + err.message); }
  });

  $('markTodayDone').addEventListener('click', () => {
    if (!state.plan) return toast('اول برنامه را بساز.');
    const today = iso(new Date());
    const d = state.plan.days.find((x) => x.date === today);
    if (!d) return toast('امروز در برنامه نیست.');
    let n = 0;
    d.blocks.forEach((b, bi) => { state.done[today + '#' + bi] = true; n += 1; });
    persist();
    toast(faNum(n) + ' بلوک امروز تیک خورد.');
  });

  /* ---------------- خروجی‌ها ---------------- */

  document.querySelectorAll('[data-export]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      if (!state.plan) return toast('اول برنامه را بساز.');
      const type = btn.dataset.export;
      try {
        if (type === 'tasks') {
          const today = iso(new Date());
          const text = engine.toTaskList(state.plan, today) || engine.toTaskList(state.plan);
          await navigator.clipboard.writeText(text);
          return toast('تسک‌های امروز کپی شد — در روال بچسبان.');
        }
        if (type === 'report-md') {
          const content = buildReportMarkdown();
          if (api && api.saveFile) {
            const res = await api.saveFile({ name: 'گزارش-روال.md', ext: 'md', content });
            return toast(res && res.ok ? 'ذخیره شد: ' + res.path : 'ذخیره لغو شد.');
          }
          const a = document.createElement('a');
          a.href = URL.createObjectURL(new Blob([content], { type: 'text/markdown;charset=utf-8' }));
          a.download = 'گزارش-روال.md';
          a.click();
          return toast('گزارش ذخیره شد.');
        }
        if (type === 'report-csv') {
          const rows = [['کتاب', 'فصل', 'وضعیت', 'تسلط', 'تست انجام‌شده', 'تست لازم', 'پیشرفت', 'باقی‌مانده (دقیقه)']];
          (state.plan.summary.chapterStats || []).forEach((c) => rows.push([
            c.subjectName, c.label, c.status, c.mastery, c.testsDone, c.testsNeed, c.progress, c.remainingMinutes,
          ]));
          const csv = '\ufeff' + rows.map((r) => r.map((x) => '"' + String(x).replace(/"/g, '""') + '"').join(',')).join('\r\n');
          const a = document.createElement('a');
          a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
          a.download = 'گزارش-فصل‌ها.csv';
          a.click();
          return toast('گزارش فصل‌ها ذخیره شد.');
        }
        const map = {
          md: { content: engine.toMarkdown(state.plan), ext: 'md', label: 'برنامه-روال.md' },
          csv: { content: '\ufeff' + engine.toCSV(state.plan), ext: 'csv', label: 'برنامه-روال.csv' },
          ics: { content: engine.toICS(state.plan), ext: 'ics', label: 'برنامه-روال.ics' },
          json: { content: JSON.stringify({ config: state.config, plan: state.plan }, null, 2), ext: 'json', label: 'برنامه-روال.json' },
        };
        const f = map[type];
        if (api && api.saveFile) {
          const res = await api.saveFile({ name: f.label, ext: f.ext, content: f.content });
          toast(res && res.ok ? 'ذخیره شد: ' + res.path : 'ذخیره لغو شد.');
        } else {
          const blob = new Blob([f.content], { type: 'text/plain;charset=utf-8' });
          const a = document.createElement('a');
          a.href = URL.createObjectURL(blob);
          a.download = f.label;
          a.click();
          toast('دانلود شد.');
        }
      } catch (err) {
        toast('خطا در خروجی: ' + err.message);
      }
    });
  });

  function buildReportMarkdown() {
    const plan = state.plan;
    const c = plan.summary.coverage;
    const L = [];
    L.push('# گزارش برنامهٔ روال — ' + (plan.meta.studentName || ''));
    L.push('');
    L.push('- پوشش فصل‌ها: **' + faNum(c.coverageRatio) + '٪**');
    L.push('- آمادگی کنکور: ' + faNum(c.readiness) + '٪ → برآورد پایان: **' + faNum(c.projectedReadiness) + '٪**');
    L.push('- آمادگی سوابق تحصیلی: **' + faNum(c.finalsReadiness) + '٪** · نمرهٔ ترکیبی ۱۴۰۶: **' + faNum(c.composite) + '٪**');
    L.push('- ساعت برنامه‌ریزی‌شده: ' + faNum(plan.summary.totalHours) + ' ساعت · تست: ' + faNum(c.testsPlanned) +
      ' (' + faNum(c.testsPerDay) + ' در روز)');
    L.push('');
    if ((c.deadlines || []).length) {
      L.push('## مهلت‌ها');
      L.push('| مهلت | مدل | تاریخ | وضعیت | زمان چیده‌شده / لازم |');
      L.push('|---|---|---|---|---|');
      c.deadlines.forEach((d) => L.push('| ' + d.title + ' | ' + (d.model === 'book' ? 'کتابی' : 'آزمون') +
        ' | ' + faNum(J ? J.fmt(d.date) : d.date) + ' | ' + (DL_STATUS[d.status] || {}).fa +
        ' | ' + Math.round(d.plannedMinutes / 60) + ' / ' + Math.round(d.needMinutes / 60) + ' ساعت |'));
      L.push('');
    }
    if ((c.finalsCourses || []).length) {
      L.push('## سوابق تحصیلی (نهایی)');
      L.push('| درس | ضریب | فعلی | هدف | برآورد پایان | زمان چیده‌شده / لازم |');
      L.push('|---|---|---|---|---|---|');
      c.finalsCourses.forEach((x) => L.push('| ' + x.name + ' | ' + x.influence + ' | ' +
        (Math.round(x.current * 10) / 10) + (x.assumed ? ' (فرض)' : '') + ' | ' + x.target + ' | ' +
        (Math.round((x.projected / 100) * 20 * 10) / 10) + ' | ' +
        Math.round(x.plannedMinutes / 60 * 10) / 10 + ' / ' + Math.round(x.needMinutes / 60 * 10) / 10 + ' |'));
      L.push('');
    }
    L.push('## فصل‌به‌فصل');
    L.push('| کتاب | فصل | وضعیت | تسلط | تست | پیشرفت | چه چیزی مانده |');
    L.push('|---|---|---|---|---|---|---|');
    (plan.summary.chapterStats || []).forEach((x) => L.push('| ' + x.subjectName + ' | ' + x.label + ' | ' + x.status +
      ' | ' + Math.round(x.mastery) + '٪ | ' + x.testsDone + '/' + x.testsNeed + ' | ' + x.progress + '٪ | ' + remainingText(x) + ' |'));
    return L.join('\n');
  }

  /* ---------------- ذخیره/بازیابی ---------------- */

  async function persist() {
    if (!api || !api.saveState) return;
    try {
      await api.saveState({
        config: state.config,
        plan: state.plan,
        scores: state.scores,
        done: state.done,
        visited: state.visited,
        /* v2.5: تایمرها و وضعیت اجرای روز */
        sessions: state.sessions,
        dayStarts: state.dayStarts,
        emergency: state.emergency,
        routines: state.routines,
        routinePinned: state.routinePinned,
        wakeTime: state.wakeTime,
        /* v2.7: آخرین نسخه‌ای که کاربر تغییراتش را دیده است */
        seenVersion: state.seenVersion || null,
        appVersion: state.appVersion || null,
      });
    } catch (e) { /* بی‌صدا */ }
  }

  async function restore() {
    if (api && api.loadState) {
      try {
        const data = await api.loadState();
        if (data && data.config) {
          applyConfigToForm(data.config);
          state.scores = data.scores || {};
          state.done = data.done || {};
          state.visited = data.visited || {};
          state.sessions = data.sessions || {};
          if (data.dayStarts) state.dayStarts = data.dayStarts;
          if (Array.isArray(data.emergency)) state.emergency = data.emergency;
          if (Array.isArray(data.routines) && data.routines.length) { state.routines = data.routines; renderRoutineRows(state.routines); }
          if (typeof data.routinePinned === 'boolean') {
            state.routinePinned = data.routinePinned;
            if ($('routinePinned')) $('routinePinned').checked = data.routinePinned;
          }
          if (data.wakeTime) state.wakeTime = data.wakeTime;
          if (data.seenVersion) state.seenVersion = data.seenVersion;
          if (data.appVersion) state.appVersion = data.appVersion;
          if (data.plan) {
            state.plan = data.plan;
            try { migratePlanChapterNames(state.plan); } catch (e) { /* بی‌صدا */ }
            renderPlan();
            return;
          }
          return;
        }
      } catch (e) { /* ادامه با پیش‌فرض */ }
    }
    applyConfigToForm(defaultConfig());
  }

  /* ══════════ v2.7: «چه چیزی در این به‌روزرسانی عوض شد» ══════════
     متنِ تغییرات همراهِ خودِ نسخه می‌آید (src/changelog.js). بعد از هر
     به‌روزرسانی — چه وصلهٔ کوچک و چه نصب کامل — یک بار به کاربر نشان داده
     می‌شود و با دکمهٔ «خواندم، ببند» بسته می‌شود. */
  const CL = window.RevalChangelog || null;

  function clTag(kind) {
    const m = { engine: ['engine', 'موتور برنامه‌ریزی'], ui: ['ui', 'رابط کاربری'], fix: ['fix', 'رفع اشکال'] };
    const t = m[kind] || ['ui', 'بهبود'];
    return '<span class="cl-tag ' + t[0] + '">' + t[1] + '</span>';
  }

  function clPersistSeen(ver) {
    state.seenVersion = ver;
    try { persist(); } catch (e) { /* بی‌صدا */ }
  }

  function showChangelog(entries, opts) {
    const o = opts || {};
    const box = $('clModal');
    if (!box || !CL) return;
    const list = (entries && entries.length) ? entries : [].concat(CL.latest());
    const top = list[0];
    const brand = (updateSnap && updateSnap.current) || (state.appVersion || '');
    $('clTitle').textContent = o.title || 'برنامه به‌روزرسانی شد';
    $('clSub').innerHTML = 'نسخهٔ فعلی <b>' + upVer(brand || (top && top.version) || '') + '</b>' +
      (list.length > 1 ? ' · ' + upFa(list.length) + ' نسخه تغییر کرد' : '') +
      ' · ' + ((top && top.date) || '');
    const badgeSvg = top && top.kind === 'fix'
      ? '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="#15803d" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M14.7 6.3a4 4 0 0 1 5 5l-8.6 8.6-4-1-1-4z"/><path d="m3 21 4-4"/></svg>'
      : '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="#1d4ed8" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3l1.9 4.6L18.5 9.5l-4.6 1.9L12 16l-1.9-4.6L5.5 9.5l4.6-1.9z"/><path d="M18 16.5l.9 2.1 2.1.9-2.1.9-.9 2.1-.9-2.1-2.1-.9 2.1-.9z"/></svg>';
    $('clBadge').innerHTML = badgeSvg;
    $('clBody').innerHTML = list.map((e) => (
      '<div class="cl-ver">' +
        '<div class="cl-ver-top">' + clTag(e.kind) +
          '<b>نسخهٔ ' + upVer(e.version) + '</b>' +
          '<span class="date">' + esc(e.date || '') + '</span>' +
        '</div>' +
        (e.title ? '<div style="font-size:12.5px;font-weight:600;margin-bottom:6px;line-height:1.8">' + esc(e.title) + '</div>' : '') +
        '<ul>' + (e.items || []).map((it) => '<li>' + esc(it) + '</li>').join('') + '</ul>' +
      '</div>'
    )).join('');
    $('clHint').textContent = o.hint || 'این پیام فقط یک بار برای هر به‌روزرسانی نشان داده می‌شود.';
    box.classList.add('show');
    box.setAttribute('aria-hidden', 'false');
    const ok = $('clOk');
    const close = () => {
      box.classList.remove('show');
      box.setAttribute('aria-hidden', 'true');
      clPersistSeen((top && top.version) || state.appVersion || '');
      if (typeof o.onClose === 'function') o.onClose();
    };
    ok.onclick = close;
    box.onclick = (ev) => { if (ev.target === box) close(); };
    /* Esc هم ببندد، ولی «خواندم» ثبت شود */
    box.dataset.mode = 'changelog';
    if (o.autoCloseAfter) setTimeout(() => { if (box.classList.contains('show')) close(); }, o.autoCloseAfter);
    return true;
  }

  /** پس از راه‌اندازی: اگر نسخهٔ فعلی از نسخهٔ دیده‌شده جدیدتر است، تغییرات را نشان بده */
  function maybeShowChangelog() {
    if (!CL) return false;
    if (!api || !upd) return false;
    const run = async () => {
      let snap = null;
      try { snap = await upd.state(); } catch (e) { snap = null; }
      const cur = String((snap && snap.current) || state.appVersion || '').replace(/^v/i, '');
      if (!cur) return;
      state.appVersion = cur;
      const seen = String(state.seenVersion || '').replace(/^v/i, '');
      if (seen && CL.compare(cur, seen) <= 0) return;      // قبلاً دیده است
      if (!seen) {
        /* نسخهٔ قبلی ثبت نشده (نصب تازه یا اولین اجرای این نسخه):
           فقط تغییرات همین نسخه را یک بار نشان بده. */
        const returning = Boolean(state.config || state.plan);
        showChangelog([].concat(CL.latest()), {
          title: returning ? 'برنامه به‌روزرسانی شد' : 'به روال خوش آمدی',
          hint: returning ? undefined : 'تازه‌ترین تغییرات این نسخه را ببین.',
        });
        return;
      }
      const entries = CL.since(seen);
      if (!entries.length) return;
      showChangelog(entries, { title: 'برنامه به‌روزرسانی شد' });
    };
    run();
    return true;
  }

  if (api && api.updates) {
    try {
      api.updates.onEvent((payload) => {
        /* پس از نصبِ وصله/به‌روزرسانی، تغییرات را نشان بده */
        if (!payload) return;
        const st = String(payload.status || '');
        if (st === 'installed' || st === 'applied' || st === 'restart' || st === 'patch-applied') {
          const v = String(payload.version || '').replace(/^v/i, '');
          const entries = v ? CL.since((state.seenVersion || ''), CL.CHANGELOG).filter((e) => CL.compare(e.version, v) <= 0) : CL.since(state.seenVersion);
          showChangelog(entries.length ? entries : [].concat(CL.latest()), { title: 'برنامه به‌روزرسانی شد' });
        }
      });
    } catch (e) { /* بی‌صدا */ }
  }

  /* ---------------- به‌روزرسانی خودکار ---------------- */

  const upd = (api && api.updates) ? api.updates : null;
  let updateSnap = null;
  let userDismissed = false;

  /* شمارهٔ نسخه با رقم فارسی ولی نقطه‌های استاندارد نسخه (۲.۲.۰ نه ۲٫۲٫۰) */
  function upVer(v) { return String(v == null ? '—' : v).replace(/\d/g, (d) => '۰۱۲۳۴۵۶۷۸۹'[d]); }
  function upFa(n) { return faNum(String(n)); }

  function renderUpdate(snap, opts) {
    if (!snap) return;
    updateSnap = snap;
    const bar = $('updateBar');
    const chip = $('verChip');
    const txt = $('verText');
    if (txt) txt.textContent = upVer(snap.current || '—');
    if (chip) chip.classList.toggle('has', Boolean(snap.hasUpdate));
    if (!bar) return;

    const title = $('ubarTitle');
    const sub = $('ubarSub');
    const act = $('ubarAction');
    const fullBtn0 = $('ubarFull');
    if (fullBtn0) fullBtn0.addEventListener('click', async () => {
      try {
        renderUpdate({ ...(updateSnap || {}), status: 'checking' }, { manual: false });
        const snap = await upd.now({ full: true });
        renderUpdate(snap || updateSnap, { manual: true });
      } catch (e) {
        renderUpdate({ ...(updateSnap || {}), status: 'error', error: 'دانلود کامل انجام نشد' }, { manual: true });
      }
    });
    const later = $('ubarLater');
    const prog = $('ubarProg');
    const fill = $('ubarFill');
    const fullBtn = $('ubarFull');
    bar.classList.remove('err', 'done');
    /* هر رندر از صفر: وگرنه حالت پنهانِ رندر قبلی به ارث می‌رسد (باگ «دکمه‌ای نمی‌بینم») */
    act.hidden = false;
    act.disabled = false;
    later.hidden = false;
    prog.hidden = true;
    if (fullBtn) fullBtn.hidden = true;
    const show = (kind) => { if (!(userDismissed && kind !== 'ready' && kind !== 'downloading')) bar.hidden = false; };

    const sizeMb = snap.sizeMb ? upFa(snap.sizeMb) + ' مگابایت' : '';
    const patchKb = snap.patchKb ? upFa(snap.patchKb) + ' کیلوبایت' : '';

    if (snap.status === 'downloading') {
      show('downloading');
      bar.classList.add('done');
      prog.hidden = false;
      fill.style.width = Math.max(2, snap.percent || 0) + '%';
      title.textContent = 'در حال دانلود نسخهٔ ' + upVer(snap.latest) + '…';
      sub.textContent = upFa(Math.round(snap.percent || 0)) + '٪ — ' +
        upFa(snap.receivedMb) + ' از ' + upFa(snap.totalMb || snap.sizeMb || 0) + ' مگابایت. دانلود متوقف نشود.';
      act.textContent = 'در حال دانلود…';
      act.disabled = true;
      later.hidden = true;
      return;
    }

    if (snap.status === 'ready') {
      show('ready');
      bar.classList.add('done');
      prog.hidden = false;
      fill.style.width = '100%';
      title.textContent = 'نسخهٔ ' + upVer(snap.latest) + ' دانلود شد ✅';
      sub.textContent = snap.usedPatch
        ? 'فقط کدِ تغییریافته دانلود شد' +
          (snap.savedMb ? ' (' + upFa(snap.savedMb) + ' مگابایت صرفه‌جویی)' : '') +
          ' — برای نصب، برنامه بسته و خودکار دوباره باز می‌شود. داده‌هایت حفظ می‌شود.'
        : 'برای نصب، برنامه بسته و خودکار دوباره باز می‌شود. برنامه‌ها، تیک‌ها و درصدهای تو حفظ می‌شوند.';
      act.textContent = 'نصب و راه‌اندازی مجدد';
      act.disabled = false;
      later.hidden = false;
      later.textContent = 'بستن';
      return;
    }

    later.hidden = false;
    later.textContent = 'بعداً';
    prog.hidden = true;
    act.disabled = false;

    if (snap.status === 'installing') {
      show('installing');
      title.textContent = 'در حال نصب نسخهٔ ' + upVer(snap.latest) + '…';
      sub.textContent = 'برنامه بسته می‌شود و نسخهٔ تازه باز می‌شود.';
      act.textContent = 'در حال نصب…';
      act.disabled = true;
      later.hidden = true;
      return;
    }

    if (snap.hasUpdate && snap.latest) {
      show('available');
      const usePatch = snap.patchAvailable && patchKb;
      title.textContent = 'نسخهٔ جدید موجود است: ' + upVer(snap.latest);
      sub.textContent = 'نسخهٔ فعلی ' + upVer(snap.current) +
        (usePatch
          ? ' — فقط بخش‌های تغییریافته دانلود می‌شود (' + patchKb + (sizeMb ? ' · به‌جای ' + sizeMb : '') + '). با یک کلیک نصب و برنامه دوباره باز می‌شود.'
          : (sizeMb ? ' · ' + sizeMb : '') + ' — با یک کلیک دانلود و نصب می‌شود.');
      act.textContent = usePatch ? 'به‌روزرسانی سریع (' + patchKb + ')' : 'به‌روزرسانی';
      if (fullBtn) fullBtn.hidden = !snap.patchAvailable;
      return;
    }

    if (snap.status === 'latest') {
      if (opts && opts.manual) {
        show('latest');
        bar.classList.add('done');
        title.textContent = 'شما آخرین نسخه را دارید ✅';
        sub.textContent = 'نسخهٔ ' + upVer(snap.current) + ' · بررسی شد در ' + upFa(clockNow());
        act.hidden = true;
        later.textContent = 'باشه';
        setTimeout(() => { if (!userDismissed) bar.hidden = true; }, 7000);
      } else {
        bar.hidden = true;
      }
      return;
    }

    if (snap.status === 'error') {
      if (opts && opts.manual) {
        show('error');
        bar.classList.add('err');
        title.textContent = 'بررسی به‌روزرسانی انجام نشد';
        sub.textContent = snap.error || 'اتصال اینترنت را بررسی کن.';
        act.textContent = 'تلاش دوباره';
        act.hidden = false;
      } else {
        bar.hidden = true; /* بررسی خودکارِ ناموفق، کاربر را آزار نمی‌دهد */
      }
      return;
    }

    if (snap.status === 'checking') {
      show('checking');
      title.textContent = 'در حال بررسی نسخهٔ جدید…';
      sub.textContent = 'اتصال به گیت‌هاب';
      prog.hidden = true;
      act.textContent = 'بررسی…';
      act.disabled = true;
      return;
    }

    act.hidden = false;
    if (snap.hasUpdate) show('available');
    else bar.hidden = true;
  }

  function clockNow() {
    const d = new Date();
    return pad(d.getHours()) + ':' + pad(d.getMinutes());
  }

  function initUpdates() {
    if (!upd) return;
    if (upd.onEvent) {
      upd.onEvent((ev) => {
        if (!ev || !ev.state) return;
        renderUpdate(ev.state, { manual: ev.type !== 'state' || ev.state.status !== 'checking' });
      });
    }
    if (upd.state) {
      upd.state().then((snap) => renderUpdate(snap, { manual: false })).catch(() => {});
    }
    const chip = $('verChip');
    if (chip) chip.addEventListener('click', () => {
      userDismissed = false;
      const bar = $('updateBar');
      if (bar) bar.hidden = false;
      renderUpdate({ ...(updateSnap || {}), status: 'checking' }, { manual: true });
      if (upd.check) upd.check().then((snap) => renderUpdate(snap, { manual: true })).catch(() => {});
    });
    const act = $('ubarAction');
    if (act) act.addEventListener('click', async () => {
      const s = updateSnap || {};
      try {
        if (s.status === 'ready') { act.disabled = true; await upd.install(); return; }
        if (s.status === 'error' || !s.hasUpdate) {
          renderUpdate({ ...s, status: 'checking' }, { manual: true });
          const snap = await upd.check();
          renderUpdate(snap, { manual: true });
          if (snap && snap.hasUpdate) {
            const after = await upd.now(); /* دانلود + نصب در یک کلیک */
            renderUpdate(after, { manual: true });
          }
          return;
        }
        act.disabled = true;
        act.textContent = 'شروع دانلود…';
        const snap = await upd.now(); /* دانلود و سپس نصب خودکار */
        renderUpdate(snap, { manual: true });
        if (snap && snap.status === 'ready') { /* نصب در updateNow انجام شده */ }
      } catch (e) {
        renderUpdate({ ...(updateSnap || {}), status: 'error', error: 'خطای غیرمنتظره در به‌روزرسانی' }, { manual: true });
      }
    });
    const later = $('ubarLater');
    if (later) later.addEventListener('click', () => {
      userDismissed = true;
      const bar = $('updateBar');
      if (bar) bar.hidden = true;
    });
  }

  /* ورودی‌های عددی: رقم فارسی هم پذیرفته می‌شود (کیبورد فارسی) */
  document.addEventListener('input', (ev) => {
    const el = ev.target;
    if (!el || el.tagName !== 'INPUT') return;
    const numeric = el.type === 'number' || (el.classList && el.classList.contains('num'));
    if (!numeric) return;
    const conv = String(el.value).replace(/[۰-۹٠-٩]/g, (c) => EN_DIGITS[c] || c).replace(/٫/g, '.');
    if (conv !== el.value) {
      const pos = el.selectionStart;
      el.value = conv;
      try { el.setSelectionRange(pos, pos); } catch (e) { /* بی‌صدا */ }
    }
  }, true);

  /* ورودی ساعت: با خروج از فیلد، خودکار به شکل ۲۴ ساعتهٔ فارسی درمی‌آید */
  document.addEventListener('focusout', (ev) => {
    const el = ev.target;
    if (!el || !el.classList || !el.classList.contains('tin')) return;
    const t = normTime(el.value);
    if (t) { el.value = faDigits(t); el.classList.remove('bad'); }
    else if (String(el.value).trim()) el.classList.add('bad');
  }, true);
  /* Enter در ورودی ساعت: مقدار را نرمال کن و از فیلد بیرون بیا */
  document.addEventListener('keydown', (ev) => {
    const el = ev.target;
    if (!el || !el.classList || !el.classList.contains('tin')) return;
    if (ev.key === 'Enter') {
      const t = normTime(el.value);
      if (t) { el.value = faDigits(t); el.classList.remove('bad'); }
      el.blur();
      ev.preventDefault();
    }
  }, true);

  /* ---------------- شروع ---------------- */

  if (J) J.attachAll(document);
  initUpdates();
  try { installHelp(); } catch (e) { console.error(e); }
  [['modeFixed', 'fixed'], ['modeAuto', 'auto']].forEach(([id, mode]) => {
    const b = $(id);
    if (b) b.addEventListener('click', () => { setTimeMode(mode); try { persist(); } catch (e) { /* بی‌صدا */ } });
  });
  setTimeMode('fixed');
  try { renderRoutineRows(null); } catch (e) { /* بی‌صدا */ }
  if ($('routinePinned')) $('routinePinned').checked = state.routinePinned === true;
  if ($('wake')) {
    state.wakeTime = normTime($('wake').value) || state.wakeTime || '07:00';
    $('wake').addEventListener('change', () => {
      const v = normTime($('wake').value);
      if (v) { state.wakeTime = v; try { persist(); } catch (e) { /* بی‌صدا */ } try { renderDayStartUI(); } catch (e) { /* بی‌صدا */ } }
    });
  }
  /* ══════════════════ v2.8: مشاور هوش مصنوعی ══════════════════ */
  const AIBrain = window.RevalAIBrain || null;
  const AITools = window.RevalAITools || null;
  const AINLU = window.RevalAINLU || null;
  const AIKB = window.RevalAIKnowledge || null;
  let aiApi = (api && api.ai) ? api.ai : null;
  /* اگر پل دسکتاپ نبود (پیش‌نمایش مرورگر)، فهرست ارائه‌دهنده‌ها از همین‌جا پر می‌شود
     تا هیچ‌وقت کادر خالی و بی‌معنی نماند. */
  const AI_PROVIDERS_FALLBACK = [
    { id: 'openai', label: 'OpenAI', defaultModel: 'gpt-4o-mini', models: ['gpt-4o', 'gpt-4o-mini', 'gpt-4.1-mini'], keyUrl: 'https://platform.openai.com/api-keys' },
    { id: 'openrouter', label: 'OpenRouter', defaultModel: 'openai/gpt-4o-mini', models: ['openai/gpt-4o-mini', 'anthropic/claude-3.5-sonnet', 'google/gemini-2.0-flash-001'], keyUrl: 'https://openrouter.ai/keys' },
    { id: 'gemini', label: 'Google Gemini', defaultModel: 'gemini-2.0-flash', models: ['gemini-2.0-flash', 'gemini-1.5-pro'], keyUrl: 'https://aistudio.google.com/apikey' },
    { id: 'custom', label: 'سرویس سازگار با OpenAI (آدرس دلخواه)', defaultModel: '', models: [], keyUrl: '' },
  ];

  const ai = {
    open: false,
    cfg: null,          // تنظیمات ارائه‌دهنده (بدون کلید)
    ready: false,       // کلید معتبر دارد؟
    busy: false,
    history: [],        // [{role:'user'|'assistant'|'tool', content, actions}]
    providerModels: [],
  };

  /* ---------- ابزارهای اجرایی: دستیار با این‌ها واقعاً برنامه را عوض می‌کند ---------- */
  const aiCtx = {
    get studentName() { return (state.config && state.config.student && state.config.student.name) || null; },

    readConfig() {
      const c = state.config || {};
      const av = c.availability || {};
      const days = WEEKDAY_KEY.map((k) => Number(av[k]) || 0);
      const total = days.reduce((a, b) => a + b, 0);
      return {
        avgDailyHours: Math.round((total / (days.filter((d) => d > 0).length || 1)) * 10) / 10,
        weeklyHours: total,
        restDay: c.restDay,
        blockMinutes: c.blockMinutes,
        timeMode: c.timeMode,
        examDate: c.examDate,
      };
    },

    readPlan(scope) {
      if (!state.plan) return null;
      const t = todayIso();
      let day = findDay(state.plan, t);
      if (scope === 'tomorrow' || scope === 'tomorrow_plus') {
        const i = state.plan.days.findIndex((d) => d.date === t);
        day = state.plan.days[Math.min(state.plan.days.length - 1, Math.max(0, i) + 1)] || day;
      }
      if (scope === 'week') {
        const i = Math.max(0, state.plan.days.findIndex((d) => d.date === t));
        const slice = state.plan.days.slice(i, i + 7);
        const blocks = slice.flatMap((d) => (d.blocks || []).filter((b) => b.kind !== 'routine')
          .map((b) => Object.assign({}, b, { start: fmtDayShort(d) + ' ' + b.start })));
        return {
          label: 'از ' + J.fmt(slice[0] && slice[0].date) + ' تا ' + J.fmt(slice[slice.length - 1] && slice[slice.length - 1].date),
          blocks, count: blocks.length,
          totalMinutes: blocks.reduce((a, b) => a + (b.minutes || 0), 0),
        };
      }
      if (!day) return null;
      const blocks = (day.blocks || []).filter((b) => b.kind !== 'routine');
      return {
        label: J.fmt(day.date), date: day.date, blocks, count: blocks.length,
        totalMinutes: blocks.reduce((a, b) => a + (b.minutes || 0), 0),
      };
    },

    readReport() {
      const toMin = (hm) => { const a = String(hm || '').split(':'); return (Number(a[0]) || 0) * 60 + (Number(a[1]) || 0); };
      const p = state.plan;
      if (!p) return null;
      const S = p.summary;
      const cov = S.coverage || {};
      const t = todayIso();
      const daysLeft = Math.max(0, Math.round((new Date(p.meta.examDate || state.config.examDate) - new Date(t)) / 86400000));
      const day = findDay(p, t);
      const blocks = day ? (day.blocks || []).filter((b) => b.kind !== 'routine') : [];
      const nowMin = toMin(nowHM());
      const next = blocks.find((b, i) => toMin(b.start) >= nowMin && !isBlockDone(day, i));
      const weak = (S.chapterStats || []).filter((c) => c.needMinutes > 0 && c.mastery < 60)
        .sort((a, b) => (a.mastery || 0) - (b.mastery || 0)).slice(0, 4)
        .map((c) => c.subjectName + ' — ' + c.label + ' (' + faNum(Math.round(c.mastery || 0)) + '٪)').join(' · ');
      const warn = [];
      ((cov.diagnostics || []).concat(S.diagnostics || [])).forEach((d) => { if (d && d.title) warn.push(d.title); });
      return {
        coverage: cov.coverageRatio,
        covered: cov.coveredChapters,
        total: cov.totalChapters,
        hours: S.totalHours || 0,
        daysLeft,
        examDateFa: J.fmt(p.meta.examDate || (state.config && state.config.examDate)),
        konkurProjected: (S.readinessSplit && S.readinessSplit.konkur && S.readinessSplit.konkur.projected) || 0,
        konkurCurrent: (S.readinessSplit && S.readinessSplit.konkur && S.readinessSplit.konkur.current) || 0,
        finalsProjected: (S.readinessSplit && S.readinessSplit.finals && S.readinessSplit.finals.projected) || 0,
        finalsCurrent: (S.readinessSplit && S.readinessSplit.finals && S.readinessSplit.finals.current) || 0,
        todayCount: blocks.length,
        todayMinutes: blocks.reduce((a, b) => a + (b.minutes || 0), 0),
        nextBlock: next ? { start: next.start, title: (next.subjectName || '') + ' — ' + (next.topic || '') } : null,
        weak, warnings: warn,
      };
    },

    readChapters(opts) {
      const p = state.plan;
      if (!p) return null;
      const o = opts || {};
      const wOf = {};
      ((state.config && state.config.subjects) || []).forEach((x) => { wOf[x.id] = Number(x.weight) || 1; });
      let list = (p.summary.chapterStats || []).filter((c) => c.needMinutes > 0 || c.plannedMinutes > 0);
      if (o.subjectId) list = list.filter((c) => c.subjectId === o.subjectId);
      /* وزن هر فصل در «کل برنامه» = ضریب درس × سهم فصل از کتاب (نه فقط سهم درون‌درس،
         وگرنه فصل کوچکِ زمین‌شناسی از فصل مشتقِ ریاضی جلو می‌زند). */
      const score = (c) => (wOf[c.subjectId] || 1) * (c.ciSharePct || 0);
      if (o.weakest) list = list.slice().sort((a, b) => (a.mastery || 0) - (b.mastery || 0));
      else list = list.slice().sort((a, b) => score(b) - score(a));
      const items = list.slice(0, o.limit || 6).map((c) => ({
        subjectName: c.subjectName, label: c.label, chapter: c.chapter,
        share: c.ciSharePct != null ? c.ciSharePct : 0,
        rank: c.ciRank || null, total: c.ciTotal || null,
        importance: c.ciImportance != null ? c.ciImportance : 0,
        mastery: Math.round(c.mastery || 0), needMinutes: c.needMinutes,
      }));
      if (!items.length) return null;
      return { items };
    },

    /* --- تغییرها --- */
    applyAvailability(days) {
      const cur = Object.assign({}, (state.config && state.config.availability) || {});
      Object.keys(days || {}).forEach((k) => { cur[k] = days[k]; });
      Object.keys(cur).forEach((k) => {
        const inp = document.querySelector('[data-avail="' + k + '"]');
        if (inp) inp.value = faDigits(cur[k]);
      });
      const ok = rebuildWith((cfg) => { cfg.availability = Object.assign({}, cfg.availability, cur); });
      const c = state.config || {};
      return { ok, autoHours: c.autoHours || null };
    },

    applyRestDay(key) {
      const idx = WEEKDAY_KEY.indexOf(key);
      if (idx === -1) return { ok: false, message: 'روز نامعتبر است.' };
      if ($('restDay')) $('restDay').value = String(idx);
      rebuildWith((cfg) => { cfg.restDay = idx; });
      return { ok: true };
    },

    applyBlockMinutes(m) {
      if ($('blockMinutes')) $('blockMinutes').value = String(m);
      rebuildWith((cfg) => { cfg.blockMinutes = m; });
      return { ok: true };
    },

    applyExamDate(target) {
      let isoDate = null;
      if (/^\d{4}-\d{2}-\d{2}$/.test(target)) isoDate = target;
      else {
        const parts = String(target).split(/[\/\-.]/).map((x) => Number(x));
        if (parts.length === 3 && parts[0] > 1300) {
          try { isoDate = J.toISO(parts[0], parts[1], parts[2]); } catch (e) { isoDate = null; }
        }
      }
      if (!isoDate) return { ok: false, message: 'تاریخ را نتوانستم بخوانم؛ مثال: ۱۴۰۶/۰۴/۱۰' };
      writeJDate('examDate', isoDate);
      rebuildWith((cfg) => { cfg.examDate = isoDate; });
      return { ok: true, message: 'تاریخ آزمون شد ' + faNum(J.fmt(isoDate)) + ' و برنامه از نو ساخته شد.' };
    },

    applyTimeMode(mode, cap) {
      setTimeMode(mode === 'auto' ? 'auto' : 'fixed');
      if (cap != null && $('dailyCap')) $('dailyCap').value = faDigits(cap);
      rebuildWith((cfg) => {
        cfg.timeMode = mode === 'auto' ? 'auto' : 'fixed';
        if (cap != null) cfg.dailyCapHours = cap;
      });
      const s = state.plan && state.plan.summary;
      return { ok: true, autoHours: (s && s.autoInfo && s.autoInfo.chosenHours) || null };
    },

    rebuild() {
      const ok = rebuildWith(null);
      const s = state.plan && state.plan.summary;
      return ok
        ? { ok: true, message: 'برنامه از نو ساخته شد: ' + faNum(s.coverage.coverageRatio) + '٪ پوشش، ' + faNum(Math.round(s.totalHours)) + ' ساعت کل.' }
        : { ok: false, message: 'ساخت برنامه ناموفق بود.' };
    },

    replanToday() {
      const done = startDayNow(nowHM());
      if (done === false) return { ok: false, message: 'امروز در بازهٔ برنامه نیست یا برنامه‌ای ساخته نشده.' };
      const day = findDay(state.plan, todayIso());
      const blocks = day ? (day.blocks || []).filter((b) => b.kind !== 'routine') : [];
      return {
        ok: true,
        message: 'برنامهٔ امروز از ساعت ' + faNum(nowHM()) + ' بازچیده شد: ' + faNum(blocks.length) + ' بلوک.',
      };
    },

    startFirstTask() {
      const day = findDay(state.plan, todayIso());
      if (!day) return { ok: false, message: 'برنامه‌ای برای امروز نیست.' };
      const idx = firstTaskIndex(day);
      if (idx < 0) return { ok: false, message: 'همهٔ کارهای امروز انجام شده‌اند 👏' };
      const block = day.blocks[idx];
      const key = day.date + '#' + idx;
      const cur = sessionOf(day, idx, block);
      sessions()[key] = DP ? DP.start(cur, nowMs()) : cur;
      try { renderHomeToday(); } catch (e) { /* بی‌صدا */ }
      persist();
      return {
        ok: true,
        message: 'شروع شد: ' + (block.subjectName || '') + ' — ' + (block.topic || '') + ' از ساعت ' + faNum(block.start) + '.',
      };
    },

    addUrgent(item) {
      const it = Object.assign({
        id: 'em' + Date.now().toString(36),
        date: todayIso(),
        time: null,
        minutes: 45,
        subjectId: null,
        subjectName: '',
        topic: '',
        scope: 'today',
        createdAt: new Date().toISOString(),
        source: 'ai',
      }, item || {});
      if (it.subjectId) {
        const s = (state.config && state.config.subjects || []).find((x) => x.id === it.subjectId);
        if (s) it.subjectName = s.name;
      }
      state.emergency = (state.emergency || []).concat([it]);
      rebuildWith((cfg) => { cfg.emergency = (state.emergency || []).slice(); });
      return { ok: true, message: '«' + (it.subjectName ? it.subjectName + ' — ' : '') + it.topic + '» (' + faNum(it.minutes) + ' دقیقه) اضافه و برنامه بازچینی شد.' };
    },

    applyTool(name, args) {
      if (!AITools) return { ok: false, message: 'ابزارها بارگذاری نشده‌اند.' };
      const res = AITools.run(name, args, aiCtx);
      if (res && res.ok) { try { afterAiChange(); } catch (e) { /* بی‌صدا */ } }
      return res;
    },
  };

  function afterAiChange() {
    try { renderHome(); } catch (e) { /* بی‌صدا */ }
    try { renderPlan(); } catch (e) { /* بی‌صدا */ }
    try { renderReport(); } catch (e) { /* بی‌صدا */ }
    persist();
  }

  function fmtDayShort(day) {
    try { return J.weekdayFa(day.date); } catch (e) { return ''; }
  }
  function isBlockDone(day, idx) {
    const st = (state.sessions || {})[day.date + '#' + idx];
    return Boolean(st && st.status === 'done');
  }

  /* ---------- رسم گفت‌وگو ---------- */
  function aiEsc(t) { return String(t == null ? '' : t).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }

  function aiRich(t) {
    /* متن ساده با **پررنگ** و خطوط */
    /* ساعت‌ها همیشه با رقم لاتین و چپ‌به‌راست نوشته می‌شوند (۰۹:۰۰ ← 09:00) */
    const withLatinClock = (str) => str.replace(/[۰-۹٠-٩]{1,2}:[۰-۹٠-٩]{2}/g,
      (m) => '\u0001' + m.replace(/[۰-۹٠-٩]/g, (c) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(c) >= 0 ? '۰۱۲۳۴۵۶۷۸۹'.indexOf(c) : '٠١٢٣٤٥٦٧٨٩'.indexOf(c))) + '\u0002');
    return withLatinClock(aiEsc(t))
      .replace(/\*\*(.+?)\*\*/g, '<b>$1</b>')
      .replace(/«(.+?)»/g, '<span style="color:#4338ca">«$1»</span>')
      .replace(/\u0001([0-9:]{4,5})\u0002/g, '<span class="tt" dir="ltr">$1</span>');
  }

  function aiMsgHtml(m) {
    const mine = m.role === 'user';
    const actions = (m.actions || []).map((a) => {
      const r = a.result || {};
      const tool = (AITools && AITools.byName[a.name]) ? AITools.byName[a.name].title : a.name;
      return '<div class="ai-act ' + (r.ok ? '' : 'bad') + '"><span class="ic">' + (r.ok ? '✓' : '!') + '</span><span>' +
        '<b>' + aiEsc(tool) + '</b>' + (r.message ? '<br>' + aiEsc(r.message) : '') + '</span></div>';
    }).join('');
    const chips = (m.chips || []).map((c) => '<button class="ai-chip" data-chip="' + aiEsc(c) + '">' + aiEsc(c) + '</button>').join('');
    return '<div class="msg ' + (mine ? 'me' : 'ai') + '">' +
      '<div class="mini-av">' + (mine ? 'شما' : 'AI') + '</div>' +
      '<div><div class="bub">' + aiRich(m.content || '') + '</div>' +
      (actions ? '<div class="ai-tools">' + actions + '</div>' : '') +
      (chips ? '<div class="ai-chips">' + chips + '</div>' : '') +
      '</div></div>';
  }

  function aiRender() {
    const body = $('aiBody');
    if (!body) return;
    body.innerHTML = ai.history.map(aiMsgHtml).join('') +
      (ai.busy ? '<div class="msg ai"><div class="mini-av">AI</div><div class="bub"><div class="ai-typing"><i></i><i></i><i></i></div></div></div>' : '');
    body.scrollTop = body.scrollHeight;
  }

  function aiPush(role, content, extra) {
    ai.history.push(Object.assign({ role, content }, extra || {}));
    aiRender();
  }

  function aiSetStatus() {
    const st = $('aiStatus');
    const tx = $('aiStatusText');
    const fab = $('aiFab');
    if (!st || !tx) return;
    st.classList.remove('off', 'ext');
    if (ai.ready) {
      st.classList.add('ext');
      const mdl = (ai.cfg && ai.cfg.model) ? String(ai.cfg.model) : '';
      tx.textContent = mdl ? ('هوش زبانی فعال · ' + mdl) : 'هوش زبانی فعال';
      if (fab) fab.classList.add('live');
    } else {
      st.classList.add('off');
      tx.textContent = 'حالت آفلاین — بدون کلید هم کار می‌کند';
      if (fab) fab.classList.remove('live');
    }
    if ($('aiFab')) $('aiFab').setAttribute('aria-label', 'گفت‌وگو با مشاور هوشمند');
  }

  function aiNote() {
    const note = $('aiNoteText');
    if (!note) return;
    note.textContent = ai.ready
      ? 'متصل به ' + (ai.cfg.providerLabel || '') + ' · کلید روی همین دستگاه ذخیره شده است.'
      : 'بدون کلید API هم کار می‌کند؛ برای هوش زبانی کامل، کلید را در تنظیمات بگذار.';
  }

  async function aiLoadConfig() {
    if (!aiApi) {
      ai.ready = false;
      ai.providerModels = AI_PROVIDERS_FALLBACK;
      aiSetStatus(); aiNote(); return;
    }
    try {
      const c = await aiApi.config();
      ai.cfg = c;
      ai.ready = Boolean(c && c.ready);
      ai.providerModels = (c && c.providers) || [];
    } catch (e) { ai.ready = false; }
    aiSetStatus(); aiNote();
  }

  function aiOpenPanel(open) {
    const panel = $('aiPanel');
    const back = $('aiBackdrop');
    if (!panel) return;
    ai.open = open !== false;
    /* کلاس open روی خودِ پنل تنظیم می‌شود؛ وقتی برداشته شود پنل به‌طور کامل
       از صفحه بیرون می‌رود و (به‌خاطر visibility) دیگر جلوی کلیک‌ها را نمی‌گیرد. */
    panel.classList.toggle('open', ai.open);
    panel.setAttribute('aria-hidden', ai.open ? 'false' : 'true');
    if (back) back.classList.toggle('show', ai.open);
    /* دکمهٔ شناور هم وضعیت را نشان می‌دهد: «مشاور هوشمند» ↔ «بستن» */
    const fab = $('aiFab');
    if (fab) {
      fab.classList.toggle('open', ai.open);
      fab.setAttribute('aria-expanded', ai.open ? 'true' : 'false');
      fab.setAttribute('title', ai.open ? 'بستن گفت‌وگو (Esc)' : 'گفت‌وگو با مشاور هوشمند (Ctrl+I)');
    }
    if (ai.open) {
      if (!ai.history.length) {
        const op = AIBrain && AIBrain.opening ? AIBrain.opening(aiCtx) : { text: 'سلام! در خدمتم.', chips: [] };
        aiPush('assistant', op.text, { chips: op.chips });
      }
      setTimeout(() => { const i = $('aiInput'); if (i) i.focus(); }, 120);
    }
  }

  /* ---------- سیستم‌پرامپت مدل زبانی ---------- */
  function aiSystemPrompt() {
    const r = aiCtx.readReport();
    const c = aiCtx.readConfig();
    const lines = [
      'تو «مشاور هوشمند روال» هستی: یک مشاور کنکور و برنامه‌ریزِ متخصص برای دانش‌آموزان ایرانی، مسلط بر روان‌شناسی یادگیری و تجربهٔ کنکورهای گذشته.',
      'همیشه فارسی و راست‌به‌چپ پاسخ بده. کوتاه، دقیق و قابل اجرا باش (معمولاً کمتر از ۱۵۰ کلمه، مگر کاربر توضیح بخواهد).',
      'اگر کاربر تغییری در برنامه می‌خواهد، حتماً از ابزارها (function calling) استفاده کن؛ دربارهٔ انجام کار حرف نزن، انجامش بده.',
      'عدد و آمار را از context بگیر و از خودت نساز. اگر داده‌ای نداری، بگو نداری.',
      'اگر درخواست مبهم است، فقط یک سؤال روشن‌کننده بپرس.',
      'در توصیه‌ها به اصول علمی تکیه کن: بازیابی فعال، مرور فاصله‌دار (۱-۳-۷-۱۶-۳۵)، تمرین درهم، خودتوضیحی، خواب کافی، تحلیل خطا.',
      'هرگز توصیهٔ ناسالم (شب‌بیداری، حذف خواب، بیش از ۱۲ ساعت مطالعه) نکن؛ اگر کاربر چنین چیزی خواست، صریح توضیح بده چرا ضرر دارد.',
    ];
    if (AIKB) {
      lines.push('دانش پایه — ضرایب کنکور ' + AIKB.KONKUR.year + ': ' + JSON.stringify(AIKB.KONKUR.coefficients.tajrobi) + ' (تجربی)؛ سوابق ' +
        Math.round(AIKB.KONKUR.finalShare * 100) + '٪ و آزمون ' + Math.round(AIKB.KONKUR.testShare * 100) + '٪.');
      lines.push('حقایق کلیدی: ' + AIKB.KONKUR.facts.slice(0, 3).join(' | '));
    }
    lines.push('وضعیت فعلی برنامه (context):');
    lines.push(c ? ('• تنظیمات: ' + c.avgDailyHours + ' ساعت/روز، روز استراحت شمارهٔ ' + c.restDay + '، بلوک ' + c.blockMinutes + ' دقیقه، حالت ' + c.timeMode) : '• برنامه‌ای ساخته نشده.');
    if (r) {
      lines.push('• پوشش ' + r.coverage + '٪ (' + r.covered + '/' + r.total + ' فصل)، ' + Math.round(r.hours) + ' ساعت کل، ' + r.daysLeft + ' روز تا کنکور');
      lines.push('• آمادگی کنکور (برآورد پایان): ' + r.konkurProjected + '٪، آمادگی نهایی: ' + r.finalsProjected + '٪');
      lines.push('• امروز: ' + r.todayCount + ' بلوک، ' + r.todayMinutes + ' دقیقه' + (r.nextBlock ? '، بعدی: ' + r.nextBlock.start + ' ' + r.nextBlock.title : ''));
      if (r.weak) lines.push('• ضعیف‌ترین فصل‌ها: ' + r.weak);
      if (r.warnings && r.warnings.length) lines.push('• هشدارها: ' + r.warnings.join(' | '));
    }
    return lines.join('\n');
  }

  /* ---------- پاسخ آفلاین ---------- */
  function aiOfflineReply(text) {
    if (!AIBrain) return { text: 'دستیار در دسترس نیست.', chips: [] };
    return AIBrain.respond(text, aiCtx);
  }

  /* ---------- پاسخ با مدل زبانی ---------- */
  async function aiLlmReply(userText) {
    const sys = aiSystemPrompt();
    const msgs = [{ role: 'system', content: sys }];
    ai.history.filter((m) => m.role === 'user' || m.role === 'assistant').slice(-12).forEach((m) => {
      if (m.content) msgs.push({ role: m.role === 'user' ? 'user' : 'assistant', content: m.content });
    });
    const actions = [];
    for (let step = 0; step < 5; step += 1) {
      const res = await aiApi.chat({ messages: msgs, tools: AITools ? AITools.forLLM() : undefined });
      if (!res || !res.ok) {
        const why = (res && res.error) || 'ارتباط با سرویس هوش مصنوعی برقرار نشد.';
        const fb = aiOfflineReply(userText);
        return {
          text: '⚠️ ' + why + '\n\n' + (res && res.needsKey
            ? 'تا وقتی کلید تنظیم نشود، با حالت آفلاین جواب می‌دهم:'
            : 'جواب آفلاین:') + '\n' + fb.text,
          chips: fb.chips, actions, failed: true,
        };
      }
      const m = res.message || {};
      const calls = m.tool_calls || [];
      if (calls.length) {
        msgs.push({ role: 'assistant', content: m.content || '', tool_calls: calls });
        calls.forEach((call) => {
          let args = {};
          try { args = JSON.parse(call.function && call.function.arguments || '{}'); } catch (e) { args = {}; }
          const out = aiCtx.applyTool(call.function && call.function.name, args);
          actions.push({ name: call.function && call.function.name, args, result: out });
          msgs.push({
            role: 'tool', tool_call_id: call.id,
            content: JSON.stringify(out && out.data ? out.data : { ok: out.ok, message: out.message }),
          });
        });
        continue;
      }
      return { text: (m.content || '').trim() || 'انجام شد.', chips: [], actions };
    }
    return { text: 'چند مرحله پیاپی ابزار اجرا شد؛ اگر کار تمام نشد بگو ادامه بدهم.', chips: [], actions };
  }

  async function aiSend(text) {
    const clean = String(text || '').trim();
    if (!clean || ai.busy) return;
    aiPush('user', clean);
    const input = $('aiInput');
    if (input) { input.value = ''; input.style.height = 'auto'; }
    ai.busy = true; aiRender();
    try {
      let reply;
      if (ai.ready && aiApi) reply = await aiLlmReply(clean);
      else {
        await new Promise((r) => setTimeout(r, 180));   // حس طبیعیِ «فکر کردن»
        reply = aiOfflineReply(clean);
      }
      ai.busy = false;
      aiPush('assistant', reply.text, { chips: reply.chips, actions: reply.actions });
      aiSaveHistory();
    } catch (err) {
      ai.busy = false;
      aiPush('assistant', 'خطا: ' + (err && err.message ? err.message : 'نامشخص'), { chips: ['تلاش دوباره'] });
    }
  }

  function aiSaveHistory() {
    try {
      const slim = ai.history.slice(-40).map((m) => ({ role: m.role, content: String(m.content || '').slice(0, 4000) }));
      localStorage.setItem('reval.ai.history', JSON.stringify(slim));
    } catch (e) { /* بی‌صدا */ }
  }
  function aiLoadHistory() {
    try {
      const raw = localStorage.getItem('reval.ai.history');
      if (!raw) return false;
      const arr = JSON.parse(raw);
      if (!Array.isArray(arr) || !arr.length) return false;
      ai.history = arr.slice(-40);
      return true;
    } catch (e) { return false; }
  }

  /* ---------- تنظیمات ---------- */
  function aiOpenSettings() {
    const c = ai.cfg || {};
    const sel = $('aiProvider');
    if (!(ai.providerModels || []).length) ai.providerModels = AI_PROVIDERS_FALLBACK;
    if (sel && !sel.options.length) {
      (ai.providerModels || []).forEach((p) => {
        const o = document.createElement('option');
        o.value = p.id; o.textContent = p.label;
        sel.appendChild(o);
      });
    }
    if (sel) sel.value = c.provider || 'openai';
    if ($('aiModel')) $('aiModel').value = c.model || '';
    if ($('aiBaseUrl')) $('aiBaseUrl').value = c.baseUrl || '';
    if ($('aiKey')) $('aiKey').value = '';
    if ($('aiKeyHint')) {
      $('aiKeyHint').textContent = c.hasKey
        ? 'کلید ذخیره‌شده: ' + (c.keyHint || '') + ' — برای تغییر، کلید تازه را وارد کن.'
        : 'کلیدی ذخیره نشده. بدون کلید هم دستیار در حالت آفلاین کار می‌کند.';
    }
    aiSyncModels();
    if ($('aiModalErr')) {
      $('aiModalErr').textContent = aiApi
        ? ''
        : 'این نسخه در مرورگر اجرا شده؛ ذخیرهٔ کلید فقط در نسخهٔ دسکتاپ روال کار می‌کند.';
    }
    if ($('aiTestBtn')) $('aiTestBtn').disabled = !aiApi;
    if ($('aiSaveBtn')) $('aiSaveBtn').disabled = !aiApi;
    const m = $('aiModal');
    if (m) { m.classList.add('show'); m.setAttribute('aria-hidden', 'false'); }
  }

  function aiSyncModels() {
    const prov = ($('aiProvider') && $('aiProvider').value) || 'openai';
    const p = (ai.providerModels || []).find((x) => x.id === prov);
    const list = $('aiModelList');
    if (list) {
      list.innerHTML = ((p && p.models) || []).map((m) => '<option value="' + aiEsc(m) + '"></option>').join('');
    }
    if ($('aiModel') && p && p.defaultModel && !$('aiModel').value) $('aiModel').value = p.defaultModel;
    if ($('aiBaseRow')) $('aiBaseRow').style.display = prov === 'custom' ? '' : 'none';
    if ($('aiKeyHint') && p && p.keyUrl) {
      const el = $('aiKeyHint');
      el.innerHTML = el.textContent + ' · <a href="#" data-key-url="' + aiEsc(p.keyUrl) + '" style="color:#4f46e5">گرفتن کلید ' + aiEsc(p.label) + '</a>';
    }
  }

  async function aiSaveSettings() {
    if (!aiApi) return;
    const patch = {
      provider: ($('aiProvider') && $('aiProvider').value) || 'openai',
      model: ($('aiModel') && $('aiModel').value.trim()) || undefined,
      baseUrl: ($('aiBaseUrl') && $('aiBaseUrl').value.trim()) || undefined,
    };
    const key = ($('aiKey') && $('aiKey').value.trim()) || '';
    if (key) patch.key = key;
    if ($('aiModalErr')) $('aiModalErr').textContent = '';
    try {
      const res = await aiApi.saveConfig(patch);
      if (!res || !res.ok) {
        if ($('aiModalErr')) $('aiModalErr').textContent = (res && res.error) || 'ذخیره نشد.';
        return;
      }
      ai.cfg = Object.assign({}, ai.cfg || {}, res.config || {});
      ai.ready = Boolean(ai.cfg && ai.cfg.ready);
      aiSetStatus(); aiNote();
      const m = $('aiModal');
      if (m) { m.classList.remove('show'); m.setAttribute('aria-hidden', 'true'); }
      aiPush('assistant', ai.ready
        ? 'تنظیم شد ✅ حالا با هوش زبانی کامل صحبت می‌کنم (' + (ai.cfg.providerLabel || '') + ' · ' + (ai.cfg.model || '') + ').'
        : 'ذخیره شد، ولی کلید معتبری نیست؛ فعلاً در حالت آفلاین کار می‌کنم.', { chips: ['آزمون اتصال'] });
    } catch (e) {
      if ($('aiModalErr')) $('aiModalErr').textContent = 'خطا در ذخیره: ' + e.message;
    }
  }

  /* ---------- رویدادها ---------- */
  if ($('aiFab')) $('aiFab').addEventListener('click', () => aiOpenPanel(!ai.open));
  if ($('aiCloseBtn')) $('aiCloseBtn').addEventListener('click', () => aiOpenPanel(false));
  if ($('aiBackdrop')) $('aiBackdrop').addEventListener('click', () => aiOpenPanel(false));
  if ($('aiSend')) $('aiSend').addEventListener('click', () => aiSend($('aiInput') && $('aiInput').value));
  if ($('aiInput')) {
    const ta = $('aiInput');
    ta.addEventListener('keydown', (ev) => {
      if (ev.key === 'Enter' && !ev.shiftKey) { ev.preventDefault(); aiSend(ta.value); }
    });
    ta.addEventListener('input', () => {
      ta.style.height = 'auto';
      ta.style.height = Math.min(120, ta.scrollHeight) + 'px';
    });
  }
  if ($('aiBody')) {
    $('aiBody').addEventListener('click', (ev) => {
      const chip = ev.target.closest && ev.target.closest('[data-chip]');
      if (chip) { aiSend(chip.getAttribute('data-chip')); return; }
      const keyLink = ev.target.closest && ev.target.closest('[data-key-url]');
      if (keyLink) { ev.preventDefault(); try { window.open(keyLink.getAttribute('data-key-url')); } catch (e) { /* بی‌صدا */ } }
    });
  }
  if ($('aiClearBtn')) $('aiClearBtn').addEventListener('click', () => {
    ai.history = [];
    try { localStorage.removeItem('reval.ai.history'); } catch (e) { /* بی‌صدا */ }
    const op = AIBrain && AIBrain.opening ? AIBrain.opening(aiCtx) : { text: 'سلام!', chips: [] };
    aiPush('assistant', op.text, { chips: op.chips });
  });
  if ($('aiSettingsBtn')) $('aiSettingsBtn').addEventListener('click', aiOpenSettings);
  if ($('aiNoteLink')) $('aiNoteLink').addEventListener('click', aiOpenSettings);
  if ($('aiModalClose')) $('aiModalClose').addEventListener('click', () => {
    const m = $('aiModal'); if (m) { m.classList.remove('show'); m.setAttribute('aria-hidden', 'true'); }
  });
  if ($('aiProvider')) $('aiProvider').addEventListener('change', aiSyncModels);
  if ($('aiKeyClear')) $('aiKeyClear').addEventListener('click', async () => {
    if (!aiApi) return;
    const res = await aiApi.saveConfig({ clearKey: true });
    if (res && res.ok) {
      ai.cfg = Object.assign({}, ai.cfg || {}, res.config || {});
      ai.ready = false; aiSetStatus(); aiNote();
      if ($('aiKeyHint')) $('aiKeyHint').textContent = 'کلید پاک شد. دستیار در حالت آفلاین کار می‌کند.';
    }
  });
  if ($('aiSaveBtn')) $('aiSaveBtn').addEventListener('click', aiSaveSettings);
  if ($('aiTestBtn')) $('aiTestBtn').addEventListener('click', async () => {
    if (!aiApi) return;
    const el = $('aiModalErr');
    if (el) { el.style.color = '#334155'; el.textContent = 'در حال آزمون…'; }
    const r = await aiApi.test();
    if (el) {
      el.style.color = r && r.ok ? '#15803d' : '#b91c1c';
      el.textContent = r && r.ok
        ? '✅ اتصال برقرار است (' + (r.model || '') + ' · ' + (r.ms || 0) + ' میلی‌ثانیه)'
        : '❌ ' + ((r && r.error) || 'اتصال برقرار نشد');
    }
  });

  /* میان‌بر: Ctrl/⌘ + I */
  document.addEventListener('keydown', (ev) => {
    if ((ev.ctrlKey || ev.metaKey) && (ev.key === 'i' || ev.key === 'I')) {
      ev.preventDefault();
      aiOpenPanel(!ai.open);
    }
  });

  /* ابزار تست/اسکرین‌شات */
  try {
    window.__revalAI = {
      open: () => aiOpenPanel(true),
      close: () => aiOpenPanel(false),
      send: (t) => aiSend(t),
      ask: (t) => aiOfflineReply(t),
      history: () => ai.history,
      ready: () => ai.ready,
      settings: () => aiOpenSettings(),
      state: () => ({ open: ai.open, ready: ai.ready, cfg: ai.cfg, count: ai.history.length }),
      ctx: aiCtx,
      /* فقط برای تست: جایگزینی کلاینت مدل با یک نمونهٔ ساختگی */
      __setApi: (fake) => { aiApi = fake; ai.ready = Boolean(fake); aiSetStatus(); },
      __push: (role, text, extra) => aiPush(role, text, extra || {}),
    };
  } catch (e) { /* بی‌صدا */ }

  aiLoadConfig().then(() => {
    if (aiLoadHistory()) aiRender();
  });

  try { wireSubjectChecks(); } catch (e) { /* بی‌صدا */ }

  restore().then(() => {
    try { renderRoutineRows(state.routines); } catch (e) { /* بی‌صدا */ }
    try { maybeShowChangelog(); } catch (e) { /* بی‌صدا */ }
    try { reconcileSessions(); } catch (e) { /* بی‌صدا */ }
    try { renderHome(); } catch (e) { /* بی‌صدا */ }
  });

  /* بستن منوها با Esc یا کلیک بیرون */
  document.addEventListener('keydown', (ev) => {
    if (ev.key !== 'Escape') return;
    if (ai.open) { aiOpenPanel(false); const i = $('aiInput'); if (i) i.blur(); return; }
    if ($('clModal') && $('clModal').classList.contains('show')) { if ($('clOk')) $('clOk').click(); return; }
    if ($('emModal') && $('emModal').classList.contains('show')) { closeEmergencyModal(); return; }
    if ($('modal') && $('modal').classList.contains('show')) closeModal(false);
  });
  if ($('modal')) $('modal').addEventListener('click', (ev) => {
    if (ev.target === $('modal')) closeModal(false);
  });

  /* با هر تغییر در فرم، نمای خانه و تیک‌های نوار کنار تازه می‌شوند */
  let homeTick = null;
  document.addEventListener('input', () => {
    clearTimeout(homeTick);
    homeTick = setTimeout(() => { if (window.__revalView === 'home' || !window.__revalView) renderHome(); else renderHome(); }, 250);
  }, true);
  document.addEventListener('change', () => { try { renderHome(); } catch (e) { /* بی‌صدا */ } }, true);
})();
