/* تست ۲.۸.۸ — نشانگر «مشاور هوشمند» گوشهٔ چپ-پایین و کوچک‌تر */
const { app, BrowserWindow } = require('electron');
const path = require('path');
const fs = require('fs');
app.commandLine.appendSwitch('disable-gpu');
app.commandLine.appendSwitch('disable-dev-shm-usage');
app.disableHardwareAcceleration();

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
let pass = 0; let fail = 0;
const check = (c, m, x) => { if (c) { pass += 1; console.log('PASS ' + m); } else { fail += 1; console.log('FAIL ' + m + (x ? ' → ' + x : '')); } };

app.whenReady().then(async () => {
  const win = new BrowserWindow({ width: 1440, height: 900, show: false, webPreferences: { offscreen: true, contextIsolation: false } });
  const errs = [];
  win.webContents.on('console-message', (_e, lvl, msg) => { if (lvl >= 2) errs.push(String(msg).slice(0, 160)); });
  await win.loadFile(path.join(__dirname, '../src/planner/planner.html'));
  const js = (c) => win.webContents.executeJavaScript(c);
  await wait(1800);

  const geo = JSON.parse(await js(`(function(){
    const f = document.getElementById('aiFab');
    if (!f) return JSON.stringify({ none: true });
    const r = f.getBoundingClientRect();
    const cs = getComputedStyle(f);
    return JSON.stringify({
      left: Math.round(r.left), right: Math.round(r.right), top: Math.round(r.top), bottom: Math.round(r.bottom),
      w: Math.round(r.width), h: Math.round(r.height),
      vw: window.innerWidth, vh: window.innerHeight,
      position: cs.position, fontSize: parseFloat(cs.fontSize)
    });})()`));
  check(!geo.none, 'نشانگر مشاور هوشمند در صفحه هست', JSON.stringify(geo));
  check(geo.position === 'fixed', 'نشانگر شناور است', geo.position);
  check(geo.left >= 8 && geo.left <= 30, 'فاصله از لبهٔ چپ صفحه کم است (سمت چپ)', String(geo.left));
  check(geo.right < geo.vw * 0.35, 'نشانگر در نیمهٔ چپ صفحه است، نه راست', geo.right + ' از ' + geo.vw);
  check(geo.bottom > geo.vh - 70, 'در پایین صفحه می‌نشیند', String(geo.bottom));

  /* موچک‌تر: ارتفاع و عرض کمتر از نسخهٔ قبل */
  check(geo.h <= 30, 'ارتفاع فشرده است (≤ ۳۰px؛ قبل‌تر ~۴۰px)', String(geo.h));
  check(geo.w <= 130, 'عرض کمتر شده (≤ ۱۳۰px؛ قبل‌تر ~۱۵۰px)', String(geo.w));
  check(geo.fontSize <= 12, 'اندازهٔ متن کوچک‌تر شده', String(geo.fontSize));

  /* هنوز کار می‌کند: باز شدن پنل از چپ */
  await js(`document.getElementById('aiFab').click()`);
  await wait(700);
  const open = JSON.parse(await js(`(function(){
    const p = document.getElementById('aiPanel');
    const f = document.getElementById('aiFab');
    const pr = p.getBoundingClientRect();
    return JSON.stringify({ open: p.classList.contains('open'), panelLeft: Math.round(pr.left), closed: f.classList.contains('open'),
      lbl: (document.querySelector('#aiFab .lbl-close') || {}).textContent || '' });})()`));
  check(open.open && open.panelLeft <= 2, 'کلیک، پنل را از سمت چپ باز می‌کند', JSON.stringify(open));
  check(open.closed && open.lbl.indexOf('بستن') !== -1, 'نشانگر در حالت باز به «بستن» تبدیل می‌شود', open.lbl);

  await js(`document.getElementById('aiFab').click()`);
  await wait(500);

  fs.writeFileSync(path.join(__dirname, '..', 'docs', 'screens', 'ui-55-ai-fab-left.png'),
    (await win.webContents.capturePage()).toPNG());

  check(errs.length === 0, 'هیچ خطای جاوااسکریپت در کنسول نیست', errs.slice(0, 2).join(' | '));
  console.log(`\n${fail ? '❌' : '✅'} ${pass} بررسی نشانگر مشاور ${fail ? 'با ' + fail + ' خطا' : 'پاس شد'}\n`);
  win.destroy();
  app.exit(fail ? 1 : 0);
});
