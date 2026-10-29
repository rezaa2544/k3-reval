/**
 * تقویم شمسی (جلالی) — تبدیل، قالب‌بندی و انتخابگر تاریخ
 * ------------------------------------------------------
 * الگوریتم تبدیل بر پایهٔ پیاده‌سازی مرجع jalaali-js (MIT) است:
 * جلالی ↔ میلادی ↔ شمارهٔ روز جولین.
 *
 * خروجی‌ها همیشه با ارقام فارسی و قالب ۱۴۰۵/۰۸/۰۷ یا «۷ آبان ۱۴۰۵» هستند.
 * در کل برنامه فقط همین تقویم نمایش داده می‌شود؛ تاریخ میلادی (ISO) صرفاً
 * برای ذخیره‌سازی داخلی و فیلدهای استاندارد تقویم ICS استفاده می‌شود.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.RevalJalali = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const div = (a, b) => ~~(a / b);
  const mod = (a, b) => a - ~~(a / b) * b;

  const BREAKS = [-61, 9, 38, 199, 426, 686, 756, 818, 1111, 1181, 1210, 1635,
    2060, 2097, 2192, 2262, 2324, 2394, 2456, 3178];

  const MONTHS = ['فروردین', 'اردیبهشت', 'خرداد', 'تیر', 'مرداد', 'شهریور',
    'مهر', 'آبان', 'آذر', 'دی', 'بهمن', 'اسفند'];

  /* شنبه=۰ … جمعه=۶ (مطابق WeekDay engine) */
  const WEEKDAYS = ['شنبه', 'یکشنبه', 'دوشنبه', 'سه‌شنبه', 'چهارشنبه', 'پنجشنبه', 'جمعه'];
  const WEEKDAYS_SHORT = ['ش', 'ی', 'د', 'س', 'چ', 'پ', 'ج'];

  function jalCal(jy, withoutLeap) {
    const bl = BREAKS.length;
    const gy = jy + 621;
    let leapJ = -14;
    let jp = BREAKS[0];
    let jump = 0;
    if (jy < jp || jy >= BREAKS[bl - 1]) throw new Error('سال جلالی نامعتبر: ' + jy);
    for (let i = 1; i < bl; i += 1) {
      const jm = BREAKS[i];
      jump = jm - jp;
      if (jy < jm) break;
      leapJ = leapJ + div(jump, 33) * 8 + div(mod(jump, 33), 4);
      jp = jm;
    }
    let n = jy - jp;
    leapJ = leapJ + div(n, 33) * 8 + div(mod(n, 33) + 3, 4);
    if (mod(jump, 33) === 4 && jump - n === 4) leapJ += 1;
    const leapG = div(gy, 4) - div((div(gy, 100) + 1) * 3, 4) - 150;
    const march = 20 + leapJ - leapG;
    let leap = 0;
    if (!withoutLeap) {
      if (jump - n < 6) n = n - jump + div(jump + 4, 33) * 33;
      leap = mod(mod(n + 1, 33) - 1, 4);
      if (leap === -1) leap = 4;
    }
    return { leap, gy, march };
  }

  function g2d(gy, gm, gd) {
    let d = div((gy + div(gm - 8, 6) + 100100) * 1461, 4) +
      div(153 * mod(gm + 9, 12) + 2, 5) + gd - 34840408;
    d = d - div(div(gy + 100100 + div(gm - 8, 6), 100) * 3, 4) + 752;
    return d;
  }

  function d2g(jdn) {
    let j = 4 * jdn + 139361631;
    j = j + div(div(4 * jdn + 183187720, 146097) * 3, 4) * 4 - 3908;
    const i = div(mod(j, 1461), 4) * 5 + 308;
    const gd = div(mod(i, 153), 5) + 1;
    const gm = mod(div(i, 153), 12) + 1;
    const gy = div(j, 1461) - 100100 + div(8 - gm, 6);
    return { gy, gm, gd };
  }

  function j2d(jy, jm, jd) {
    const r = jalCal(jy, true);
    return g2d(r.gy, 3, r.march) + (jm - 1) * 31 - div(jm, 7) * (jm - 7) + jd - 1;
  }

  function d2j(jdn) {
    const gy = d2g(jdn).gy;
    let jy = gy - 621;
    const r = jalCal(jy, false);
    const jdn1f = g2d(gy, 3, r.march);
    let k = jdn - jdn1f;
    if (k >= 0) {
      if (k <= 185) return { jy, jm: 1 + div(k, 31), jd: mod(k, 31) + 1 };
      k -= 186;
    } else {
      jy -= 1;
      k += 179;
      if (r.leap === 1) k += 1;
    }
    return { jy, jm: 7 + div(k, 30), jd: mod(k, 30) + 1 };
  }

  function isLeapJalaliYear(jy) { return jalCal(jy, false).leap === 0; }

  function monthLength(jy, jm) {
    if (jm <= 6) return 31;
    if (jm <= 11) return 30;
    return isLeapJalaliYear(jy) ? 30 : 29;
  }

  /* ---------------- تبدیل با تاریخ میلادی و ISO ---------------- */

  /** 'YYYY-MM-DD' → {jy,jm,jd} */
  function fromISO(iso) {
    const [y, m, d] = String(iso || '').slice(0, 10).split('-').map(Number);
    if (!y || !m || !d) return null;
    return d2j(g2d(y, m, d));
  }

  /** {jy,jm,jd} → 'YYYY-MM-DD' */
  function toISO(jy, jm, jd) {
    const g = d2g(j2d(jy, jm, jd));
    const p = (n) => String(n).padStart(2, '0');
    return g.gy + '-' + p(g.gm) + '-' + p(g.gd);
  }

  /** Date → 'YYYY-MM-DD' (میلادی، برای ذخیرهٔ داخلی) */
  function dateToISO(date) {
    const p = (n) => String(n).padStart(2, '0');
    return date.getFullYear() + '-' + p(date.getMonth() + 1) + '-' + p(date.getDate());
  }

  function todayISO() { return dateToISO(new Date()); }

  /* ---------------- قالب‌بندی فارسی ---------------- */

  const FA_DIGITS = '۰۱۲۳۴۵۶۷۸۹';
  function faDigits(str) { return String(str).replace(/\d/g, (d) => FA_DIGITS[+d]); }
  function enDigits(str) { return String(str).replace(/[۰-۹]/g, (d) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d))).replace(/[٠-٩]/g, (d) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d))); }

  function pad2(n) { return String(n).padStart(2, '0'); }

  /** 'YYYY-MM-DD' → «۱۴۰۵/۰۸/۰۷» */
  function fmt(iso) {
    const j = fromISO(iso);
    if (!j) return '';
    return faDigits(j.jy + '/' + pad2(j.jm) + '/' + pad2(j.jd));
  }

  /** 'YYYY-MM-DD' → «۱۷ آبان ۱۴۰۵» */
  function fmtLong(iso) {
    const j = fromISO(iso);
    if (!j) return '';
    return faDigits(j.jd) + ' ' + MONTHS[j.jm - 1] + ' ' + faDigits(j.jy);
  }

  /** 'YYYY-MM-DD' → «شنبه ۱۷ آبان ۱۴۰۵» */
  function fmtFull(iso) {
    const j = fromISO(iso);
    if (!j) return '';
    return weekdayFa(iso) + ' ' + fmtLong(iso);
  }

  /** نام روز هفته (شنبه=۰) */
  function weekdayFa(iso) {
    const [y, m, d] = String(iso).slice(0, 10).split('-').map(Number);
    const dt = new Date(y, m - 1, d);
    const idx = (dt.getDay() + 1) % 7;
    return WEEKDAYS[idx];
  }

  /** «۱۴۰۵/۰۸/۰۷» یا «۱۴۰۵-۸-۷» → 'YYYY-MM-DD' (میلادی) — ورودی آزاد کاربر */
  function parse(text) {
    const clean = enDigits(String(text || '')).trim().replace(/[^\d]+/g, '-');
    const parts = clean.split('-').filter(Boolean).map(Number);
    if (parts.length < 3) return null;
    const [jy, jm, jd] = parts;
    if (!(jy > 1200 && jy < 1700)) return null;
    if (!(jm >= 1 && jm <= 12)) return null;
    if (!(jd >= 1 && jd <= monthLength(jy, jm))) return null;
    try { return toISO(jy, jm, jd); } catch (e) { return null; }
  }

  /** 'YYYY-MM-DD' ± n روز */
  function addDays(iso, n) {
    const [y, m, d] = iso.split('-').map(Number);
    const dt = new Date(y, m - 1, d + n);
    return dateToISO(dt);
  }

  /* ---------------- انتخابگر تاریخ ---------------- */

  let openPop = null;

  function closePicker() {
    if (openPop && openPop.parentNode) openPop.parentNode.removeChild(openPop);
    openPop = null;
  }

  if (typeof document !== 'undefined') {
    document.addEventListener('mousedown', (e) => {
      if (!openPop) return;
      if (openPop.contains(e.target) || (openPop._for && openPop._for === e.target)) return;
      closePicker();
    });
  }

  /**
   * تبدیل یک input متنی به فیلد تاریخ شمسی با تقویم بازشو.
   * input.dataset.iso تاریخ میلادی معتبر را نگه می‌دارد.
   */
  function attachPicker(input, opts) {
    if (!input || input._jdate) return;
    input._jdate = true;
    const onChange = (opts && opts.onChange) || null;
    input.setAttribute('autocomplete', 'off');
    input.setAttribute('dir', 'ltr');
    input.style.textAlign = 'center';
    input.placeholder = '۱۴۰۵/۰۸/۰۷';

    function setISO(iso) {
      input.dataset.iso = iso || '';
      input.value = iso ? fmt(iso) : '';
      input.dispatchEvent(new Event('jdate:change', { bubbles: true }));
      if (onChange) onChange(iso);
    }

    function currentISO() {
      return input.dataset.iso || parse(input.value) || todayISO();
    }

    input.addEventListener('change', () => {
      const iso = parse(input.value);
      if (iso) { input.dataset.iso = iso; input.value = fmt(iso); }
      else if (input.value.trim() === '') { input.dataset.iso = ''; }
      else { input.value = input.dataset.iso ? fmt(input.dataset.iso) : ''; }
      if (onChange) onChange(input.dataset.iso || null);
    });

    input.addEventListener('click', () => openCalendar(input, currentISO(), setISO));
    input.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowDown') { e.preventDefault(); openCalendar(input, currentISO(), setISO); }
    });

    if (input.dataset.iso) input.value = fmt(input.dataset.iso);
    return { setISO, currentISO };
  }

  function openCalendar(input, iso, onPick) {
    closePicker();
    const j = fromISO(iso) || fromISO(todayISO());
    let view = { jy: j.jy, jm: j.jm };

    const pop = document.createElement('div');
    pop.className = 'jdp';
    pop.setAttribute('dir', 'rtl');
    pop._for = input;
    pop.style.cssText = [
      'position:fixed', 'z-index:2147483646', 'background:#fff', 'color:#16233a',
      'border:1px solid #e3e9f2', 'border-radius:14px', 'box-shadow:0 18px 44px rgba(15,23,42,.18)',
      'padding:10px', 'width:268px', 'font:12px "Segoe UI",Tahoma,sans-serif',
    ].join(';');

    function render() {
      const firstIso = toISO(view.jy, view.jm, 1);
      const [y0, m0, d0] = firstIso.split('-').map(Number);
      const startIdx = (new Date(y0, m0 - 1, d0).getDay() + 1) % 7; // شنبه=۰
      const len = monthLength(view.jy, view.jm);
      const selected = fromISO(input.dataset.iso || iso);
      const today = fromISO(todayISO());

      let cells = '';
      for (let i = 0; i < startIdx; i += 1) cells += '<span></span>';
      for (let d = 1; d <= len; d += 1) {
        const isSel = selected && selected.jy === view.jy && selected.jm === view.jm && selected.jd === d;
        const isToday = today && today.jy === view.jy && today.jm === view.jm && today.jd === d;
        cells += '<button type="button" class="jdp-d' + (isSel ? ' jdp-sel' : '') + (isToday ? ' jdp-today' : '') +
          '" data-d="' + d + '">' + faDigits(d) + '</button>';
      }

      pop.innerHTML =
        '<div style="display:flex;align-items:center;gap:6px;margin-bottom:8px">' +
        '<button type="button" class="jdp-nav" data-nav="-1" title="ماه قبل">‹</button>' +
        '<b style="flex:1;text-align:center;font-size:13px">' + MONTHS[view.jm - 1] + ' ' + faDigits(view.jy) + '</b>' +
        '<button type="button" class="jdp-nav" data-nav="1" title="ماه بعد">›</button>' +
        '</div>' +
        '<div class="jdp-w">' + WEEKDAYS_SHORT.map((w) => '<span>' + w + '</span>').join('') + '</div>' +
        '<div class="jdp-g">' + cells + '</div>' +
        '<div style="display:flex;gap:6px;margin-top:8px">' +
        '<button type="button" class="jdp-today-btn" data-today="1">امروز</button>' +
        '<button type="button" class="jdp-today-btn" data-clear="1">پاک کردن</button>' +
        '</div>';

      if (!pop.parentNode) document.body.appendChild(pop);
      const r = input.getBoundingClientRect();
      const top = Math.min(r.bottom + 6, window.innerHeight - pop.offsetHeight - 8);
      const left = Math.min(Math.max(8, r.left), window.innerWidth - pop.offsetWidth - 8);
      pop.style.top = Math.max(8, top) + 'px';
      pop.style.left = left + 'px';

      pop.querySelectorAll('[data-nav]').forEach((b) => b.addEventListener('click', () => {
        const dir = Number(b.dataset.nav);
        let jm = view.jm + dir;
        let jy = view.jy;
        if (jm < 1) { jm = 12; jy -= 1; }
        if (jm > 12) { jm = 1; jy += 1; }
        view = { jy, jm };
        render();
      }));
      pop.querySelectorAll('.jdp-d').forEach((b) => b.addEventListener('click', () => {
        onPick(toISO(view.jy, view.jm, Number(b.dataset.d)));
        closePicker();
      }));
      const tBtn = pop.querySelector('[data-today]');
      if (tBtn) tBtn.addEventListener('click', () => { onPick(todayISO()); closePicker(); });
      const cBtn = pop.querySelector('[data-clear]');
      if (cBtn) cBtn.addEventListener('click', () => { onPick(''); closePicker(); });
    }

    render();
    openPop = pop;
  }

  const css = [
    '.jdp *{box-sizing:border-box}',
    '.jdp .jdp-nav{width:28px;height:28px;border:1px solid #e3e9f2;background:#fff;border-radius:9px;cursor:pointer;font-size:15px;line-height:1;color:#31415e}',
    '.jdp .jdp-nav:hover{background:#eef2f9}',
    '.jdp .jdp-w,.jdp .jdp-g{display:grid;grid-template-columns:repeat(7,1fr);gap:4px}',
    '.jdp .jdp-w span{text-align:center;font-size:10.5px;color:#7086a3;padding-bottom:4px}',
    '.jdp .jdp-d{border:0;background:#f8fafc;border-radius:8px;height:28px;cursor:pointer;font:inherit;font-size:12px;color:#16233a}',
    '.jdp .jdp-d:hover{background:#eef0ff}',
    '.jdp .jdp-today{box-shadow:inset 0 0 0 1px #c7d0e0}',
    '.jdp .jdp-sel{background:linear-gradient(135deg,#4f46e5,#0ea5e9)!important;color:#fff;font-weight:700}',
    '.jdp .jdp-today-btn{flex:1;border:1px solid #e3e9f2;background:#fff;border-radius:9px;padding:6px;cursor:pointer;font:inherit;font-size:11.5px;color:#31415e}',
    '.jdp .jdp-today-btn:hover{background:#eef2f9}',
  ].join('');

  function injectCss() {
    if (typeof document === 'undefined' || document.getElementById('jdp-css')) return;
    const st = document.createElement('style');
    st.id = 'jdp-css';
    st.textContent = css;
    document.head.appendChild(st);
  }

  /** همهٔ inputهای data-jdate را انتخابگر شمسی کن */
  function attachAll(root) {
    injectCss();
    const scope = root || document;
    scope.querySelectorAll('input[data-jdate]').forEach((el) => attachPicker(el));
  }

  return {
    MONTHS, WEEKDAYS, WEEKDAYS_SHORT,
    fromISO, toISO, dateToISO, todayISO, today: todayISO,
    fmt, fmtLong, fmtFull, weekdayFa, parse, addDays,
    faDigits, enDigits, monthLength, isLeapJalaliYear,
    attachPicker, attachAll, closePicker,
  };
});
