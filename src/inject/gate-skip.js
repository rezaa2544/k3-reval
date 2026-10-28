/**
 * اسکریپت تزریقی در صفحه‌ی سایت
 * ---------------------------------
 * هدف: کاربر هیچ‌وقت «صفحه‌ی ورود» را به‌عنوان یک مانع نبیند.
 *
 *  ۱) اگر آدرس با #login یا #signup باز شده باشد، حذف می‌شود.
 *  ۲) اگر فرم ورود ظاهر شود و مشخصات ذخیره‌شده وجود داشته باشد،
 *     فیلدها به‌صورت خودکار پر و ارسال می‌شوند (سازگار با React).
 *  ۳) اگر فرم ورود ظاهر شود و مشخصاتی ذخیره نشده باشد، یک نوار
 *     بومی (نه فرم سایت) نشان داده می‌شود که کاربر را به «تنظیمات حساب»
 *     هدایت می‌کند.
 *  ۴) هر بار فرم ورود دوباره رندر شد (SPA)، دوباره تلاش می‌کند.
 *
 * این فایل به‌صورت متن خوانده و با executeJavaScript در صفحه اجرا می‌شود.
 * جای‌گذاری: توکنِ CONFIG با JSON تنظیمات جایگزین می‌شود (در main.js).
 */
(function () {
  'use strict';

  var CFG = __REVAL_CONFIG__;
  var FLAG = '__revalGate__';
  if (window[FLAG] && window[FLAG].version === 3) {
    window[FLAG].update(CFG);
    return;
  }

  var state = {
    version: 3,
    cfg: CFG,
    busy: false,
    attempts: 0,
    lastAttempt: 0,
    banner: null,
    observer: null,
  };

  /* ------------------------------ utils ------------------------------ */

  function sleep(ms) {
    return new Promise(function (r) { setTimeout(r, ms); });
  }

  function visible(el) {
    if (!el) return false;
    var r = el.getBoundingClientRect();
    if (r.width < 8 || r.height < 8) return false;
    var cs = getComputedStyle(el);
    return cs.visibility !== 'hidden' && cs.display !== 'none' && cs.opacity !== '0';
  }

  /** مقدار‌دهی سازگار با React (بدون آن، state آپدیت نمی‌شود) */
  function setValue(el, value) {
    var proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    var desc = Object.getOwnPropertyDescriptor(proto, 'value');
    if (desc && desc.set) desc.set.call(el, value);
    else el.value = value;
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
    el.dispatchEvent(new Event('blur', { bubbles: true }));
  }

  function textOf(el) {
    return ((el.innerText || el.textContent || '') + ' ' + (el.getAttribute('aria-label') || '') + ' ' + (el.getAttribute('title') || '')).trim();
  }

  function passwordInputs() {
    return Array.prototype.filter.call(document.querySelectorAll('input[type="password"]'), visible);
  }

  function userInputNear(passEl) {
    var scope = passEl.form || passEl.closest('form') || passEl.closest('div[class]') || document.body;
    var cands = Array.prototype.filter.call(
      scope.querySelectorAll('input:not([type="password"]):not([type="hidden"]):not([type="checkbox"]):not([type="radio"])'),
      visible
    );
    var typed = cands.filter(function (i) {
      var t = (i.type || '').toLowerCase();
      return t === 'email' || t === 'tel' || t === 'text' || t === 'number' || i.inputMode === 'email' || i.inputMode === 'tel';
    });
    return typed[0] || cands[0] || null;
  }

  function submitButtonNear(passEl) {
    var scope = passEl.form || passEl.closest('form') || passEl.closest('div[role="dialog"]') || document.body;
    var btns = Array.prototype.filter.call(
      scope.querySelectorAll('button, input[type="submit"], [role="button"]'),
      visible
    );
    var byType = btns.filter(function (b) {
      return b.type === 'submit' || b.getAttribute('type') === 'submit';
    });
    if (byType.length) return byType[0];
    var byText = btns.filter(function (b) {
      return /ورود|ثبت‌?\s?نام|ادامه|تایید|تأیید|ورود به|login|sign\s?in|submit/i.test(textOf(b)) && !/فراموش|رمز|خروج|انصراف|بستن|لغو/i.test(textOf(b));
    });
    return byText[0] || null;
  }

  function looksLikeGate() {
    if (passwordInputs().length > 0) return true;
    var body = (document.body && document.body.innerText) || '';
    if (body.length > 40000) return false; // صفحه‌ی بزرگ = احتمالاً داشبورد است
    return /ورود به حساب|کد تایید|کد تأیید|رمز عبور|شماره موبایل/.test(body) && /ورود|ثبت نام|ثبت‌نام/.test(body);
  }

  /* --------------------------- auto login ---------------------------- */

  async function attemptAutoLogin() {
    if (state.busy) return;
    var creds = state.cfg && state.cfg.credentials;
    if (!creds || !creds.password) return;

    state.busy = true;
    try {
      for (var step = 0; step < 4; step++) {
        var pass = passwordInputs()[0];
        if (!pass) break;

        var user = userInputNear(pass);
        if (user && creds.identifier) {
          setValue(user, creds.identifier);
          await sleep(120);
        }
        setValue(pass, creds.password);
        await sleep(180);

        var btn = submitButtonNear(pass);
        if (btn) {
          btn.click();
        } else if (pass.form) {
          if (typeof pass.form.requestSubmit === 'function') pass.form.requestSubmit();
          else pass.form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
        } else {
          ['keydown', 'keypress', 'keyup'].forEach(function (t) {
            pass.dispatchEvent(new KeyboardEvent(t, { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true }));
          });
        }

        state.lastAttempt = Date.now();
        await sleep(1800);

        if (!passwordInputs().length) {
          hideBanner();
          return; // وارد شد
        }
      }
    } finally {
      state.busy = false;
      if (passwordInputs().length) showBanner();
    }
  }

  /* ----------------------------- banner ------------------------------ */

  function hideBanner() {
    if (state.banner && state.banner.parentNode) state.banner.parentNode.removeChild(state.banner);
    state.banner = null;
  }

  function showBanner() {
    if (state.banner && document.body.contains(state.banner)) return;
    var box = document.createElement('div');
    box.setAttribute('dir', 'rtl');
    box.style.cssText = [
      'position:fixed', 'z-index:2147483647', 'bottom:18px', 'left:50%', 'transform:translateX(-50%)',
      'max-width:min(560px,92vw)', 'display:flex', 'gap:10px', 'align-items:center', 'flex-wrap:wrap',
      'justify-content:center', 'padding:12px 16px', 'border-radius:14px',
      'background:#0f172a', 'color:#e8eefc', 'font:13px/1.8 "Segoe UI",Tahoma,sans-serif',
      'box-shadow:0 18px 40px rgba(2,8,23,.35)', 'border:1px solid rgba(255,255,255,.12)',
    ].join(';');

    var txt = document.createElement('span');
    txt.textContent = state.cfg && state.cfg.hasCredentials
      ? 'ورود خودکار انجام نشد. مشخصات حساب را بررسی کنید.'
      : 'برای ورود بدون دیدن صفحه‌ی ورود، حساب خود را یک بار در برنامه ثبت کنید.';

    var btn = document.createElement('button');
    btn.textContent = 'تنظیمات حساب';
    btn.style.cssText = 'border:0;border-radius:10px;padding:8px 14px;cursor:pointer;font:inherit;font-weight:600;background:linear-gradient(135deg,#4f46e5,#0ea5e9);color:#fff';
    btn.addEventListener('click', function () {
      if (window.revalDesktop && window.revalDesktop.openAccount) window.revalDesktop.openAccount();
    });

    var close = document.createElement('button');
    close.textContent = '×';
    close.setAttribute('aria-label', 'بستن');
    close.style.cssText = 'border:0;background:transparent;color:#94a3b8;font-size:18px;cursor:pointer;line-height:1';
    close.addEventListener('click', hideBanner);

    box.appendChild(txt);
    box.appendChild(btn);
    box.appendChild(close);
    (document.body || document.documentElement).appendChild(box);
    state.banner = box;
  }

  /* --------------------------- hash cleanup -------------------------- */

  function cleanHash() {
    try {
      var h = (location.hash || '').toLowerCase();
      if (h === '#login' || h === '#signup' || h.indexOf('#/login') === 0 || h.indexOf('#/signup') === 0) {
        history.replaceState(history.state, '', location.pathname + location.search);
      }
    } catch (e) { /* noop */ }
  }

  /* ------------------------------ engine ----------------------------- */

  async function tick() {
    cleanHash();

    if (!looksLikeGate()) {
      hideBanner();
      return;
    }

    if (state.cfg && state.cfg.credentials && state.cfg.credentials.password) {
      if (state.busy) return;
      if (Date.now() - state.lastAttempt < 2500) return;
      if (state.attempts >= 8) {
        showBanner();
        return;
      }
      state.attempts += 1;
      await attemptAutoLogin();
    } else {
      showBanner();
    }
  }

  function start() {
    if (state.observer) state.observer.disconnect();
    state.observer = new MutationObserver(function () {
      if (state.timer) return;
      state.timer = setTimeout(function () { state.timer = null; tick(); }, 350);
    });
    if (document.body) {
      state.observer.observe(document.body, { childList: true, subtree: true });
    }
    tick();
    // تلاش‌های زمان‌بندی‌شده در برابر رندرهای دیرهنگام (SPA + هیدریشن)
    [1200, 3000, 6000, 10000].forEach(function (ms) { setTimeout(tick, ms); });
  }

  window[FLAG] = {
    version: 3,
    update: function (cfg) { state.cfg = cfg; state.attempts = 0; state.lastAttempt = 0; tick(); },
    rescan: function () { state.attempts = 0; state.lastAttempt = 0; tick(); },
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start, { once: true });
  } else {
    start();
  }
})();
