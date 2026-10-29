/**
 * نوار ابزار شناور روال (injected UI)
 * ------------------------------------
 * یک نوار کوچک و قابل‌جمع‌شدن که روی صفحهٔ سایت سوار می‌شود تا
 * «برنامه‌ریزی خودکار» همیشه در دسترس و قابل‌دیدن باشد.
 *
 * چیزهایی که به سایت اضافه *نمی‌کند*: هیچ تغییری در ظاهر/رفتار خود سایت.
 */
(function () {
  'use strict';

  if (window.__revalToolbar) return;
  window.__revalToolbar = true;

  var VERSION = typeof __REVAL_VERSION__ !== 'undefined' ? __REVAL_VERSION__ : '';

  function api() { return window.revalDesktop || null; }

  function build() {
    if (document.getElementById('reval-fab-root')) return;

    var root = document.createElement('div');
    root.id = 'reval-fab-root';
    root.setAttribute('dir', 'rtl');
    root.style.cssText = [
      'position:fixed', 'z-index:2147483000', 'bottom:18px', 'inset-inline-start:18px',
      'display:flex', 'flex-direction:column', 'align-items:flex-start', 'gap:8px',
      'font-family:"Segoe UI",Tahoma,sans-serif', 'direction:rtl',
    ].join(';');

    /* ---- پنل دکمه‌ها ---- */
    var panel = document.createElement('div');
    panel.style.cssText = [
      'display:none', 'flex-direction:column', 'gap:6px', 'padding:10px',
      'background:#ffffff', 'border:1px solid #e3e9f2', 'border-radius:14px',
      'box-shadow:0 18px 44px rgba(15,23,42,.16)', 'min-width:190px',
    ].join(';');

    var items = [
      { label: 'برنامه‌ریزی خودکار  ⚡', hint: 'Ctrl+Shift+P', act: function () { var a = api(); a && a.openPlanner(); }, primary: true },
      { label: 'ورود خودکار', hint: 'Ctrl+L', act: function () { var a = api(); a && a.applyAutoLogin(); } },
      { label: 'تنظیمات حساب', hint: 'Ctrl+,', act: function () { var a = api(); a && a.openAccount(); } },
      { label: 'داشبورد روال', hint: 'Ctrl+H', act: function () { var a = api(); a && a.goHome(); } },
      { label: 'بررسی به‌روزرسانی', hint: 'نسخهٔ جدید', act: function () { var a = api(); a && a.updates && a.updates.check(); } },
    ];

    items.forEach(function (it) {
      var b = document.createElement('button');
      b.textContent = it.label;
      b.title = it.hint;
      b.style.cssText = [
        'border:0', 'border-radius:10px', 'padding:9px 12px', 'cursor:pointer',
        'font:600 12.5px "Segoe UI",Tahoma,sans-serif', 'text-align:right',
        it.primary
          ? 'background:linear-gradient(135deg,#4f46e5,#0ea5e9);color:#fff'
          : 'background:#f1f5f9;color:#23324c',
      ].join(';');
      b.addEventListener('click', function (e) {
        e.preventDefault();
        e.stopPropagation();
        it.act();
      });
      panel.appendChild(b);
    });

    var vline = document.createElement('div');
    vline.style.cssText = 'font:11px "Segoe UI",Tahoma;color:#7086a3;padding:4px 6px 0;border-top:1px solid #e9eef6';
    vline.textContent = 'روال دسکتاپ' + (VERSION ? ' · نسخه ' + VERSION : '');
    panel.appendChild(vline);

    /* ---- دکمهٔ اصلی ---- */
    var fab = document.createElement('button');
    fab.id = 'reval-fab';
    fab.setAttribute('aria-label', 'ابزارهای روال');
    fab.innerHTML = '<svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v18"/><path d="M7.5 5.5A3.5 3.5 0 0 0 4 9c0 .9.34 1.7.9 2.32A3.5 3.5 0 0 0 4 14.5C4 16.4 5.6 18 7.5 18H12"/><path d="M16.5 5.5A3.5 3.5 0 0 1 20 9c0 .9-.34 1.7-.9 2.32A3.5 3.5 0 0 1 20 14.5c0 1.9-1.6 3.5-3.5 3.5H12"/></svg>';
    fab.style.cssText = [
      'width:52px', 'height:52px', 'border-radius:50%', 'border:0', 'cursor:pointer',
      'font-size:22px', 'line-height:1',
      'background:linear-gradient(135deg,#4f46e5,#0ea5e9)', 'color:#fff',
      'box-shadow:0 10px 26px rgba(79,70,229,.45)',
    ].join(';');

    var pulse = document.createElement('style');
    pulse.textContent = '@keyframes revalPulse{0%,100%{box-shadow:0 10px 26px rgba(79,70,229,.45)}50%{box-shadow:0 10px 26px rgba(79,70,229,.45),0 0 0 10px rgba(79,70,229,.12)}}#reval-fab{animation:revalPulse 2.4s ease-in-out infinite}';
    document.head.appendChild(pulse);

    fab.addEventListener('click', function (e) {
      e.preventDefault();
      e.stopPropagation();
      panel.style.display = panel.style.display === 'flex' ? 'none' : 'flex';
    });

    // اولین بار: کمی باز بماند تا دیده شود
    setTimeout(function () {
      panel.style.display = 'flex';
      setTimeout(function () { panel.style.display = 'none'; }, 6000);
    }, 2500);

    /* ---- نشان به‌روزرسانی (فقط وقتی نسخهٔ جدید باشد) ---- */
    var pill = document.createElement('button');
    pill.id = 'reval-update-pill';
    pill.style.cssText = [
      'display:none', 'border:0', 'cursor:pointer', 'border-radius:999px', 'padding:9px 14px',
      'font:600 12.5px "Segoe UI",Tahoma,sans-serif', 'color:#fff',
      'background:linear-gradient(135deg,#f59e0b,#ef4444)',
      'box-shadow:0 10px 26px rgba(239,68,68,.35)', 'max-width:260px', 'line-height:1.6',
    ].join(';');
    pill.addEventListener('click', function (e) {
      e.preventDefault();
      e.stopPropagation();
      var a = api();
      if (!a || !a.updates) return;
      pill.disabled = true;
      pill.textContent = 'در حال دانلود…';
      a.updates.now();
    });

    function faVer(v) { return String(v || '').replace(/\d/g, function (d) { return '۰۱۲۳۴۵۶۷۸۹'[d]; }); }

    function applyUpdate(ev) {
      if (!ev || !ev.state) return;
      var st = ev.state;
      if (st.status === 'downloading') {
        pill.style.display = 'block';
        pill.textContent = 'دانلود نسخهٔ ' + faVer(st.latest) + ' — ' + faVer(Math.round(st.percent || 0)) + '٪';
        return;
      }
      if (st.status === 'ready' || st.status === 'installing') {
        pill.style.display = 'block';
        pill.textContent = 'نصب نسخهٔ ' + faVer(st.latest) + '…';
        return;
      }
      if (st.hasUpdate && st.latest) {
        pill.style.display = 'block';
        pill.textContent = 'نسخهٔ ' + faVer(st.latest) + ' آماده است — به‌روزرسانی';
        return;
      }
      pill.style.display = 'none';
    }

    (function wireUpdates() {
      var a = api();
      if (!a || !a.updates) return;
      if (a.updates.onEvent) a.updates.onEvent(applyUpdate);
      if (a.updates.state) {
        a.updates.state().then(function (snap) { if (snap) applyUpdate({ state: snap }); }).catch(function () {});
      }
    })();

    root.appendChild(panel);
    root.appendChild(pill);
    root.appendChild(fab);
    (document.body || document.documentElement).appendChild(root);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', build, { once: true });
  } else {
    build();
  }
})();
