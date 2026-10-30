/* تست بستنِ پنل گفت‌وگو با کلیک واقعی ماوس (نه فراخوانی تابع)
   رگرسیونِ نسخهٔ ۲.۸.۱: پنل یک <aside> بود و قاعدهٔ `main, aside{direction:ltr}`
   جهتِ آن را عوض می‌کرد؛ در نتیجه پنلِ «بسته» به وسط صفحه می‌رفت و
   هم دیده می‌شد، هم جلوی کلیک‌های برنامه را می‌گرفت. */
const { app, BrowserWindow } = require('electron');
const path = require('path');
app.commandLine.appendSwitch('disable-gpu');
app.commandLine.appendSwitch('disable-software-rasterizer');
app.commandLine.appendSwitch('disable-dev-shm-usage');
app.disableHardwareAcceleration();

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
let pass = 0; let fail = 0;
const check = (c, m, x) => { if (c) { pass += 1; console.log('PASS ' + m); } else { fail += 1; console.log('FAIL ' + m + (x ? ' → ' + x : '')); } };

app.whenReady().then(async () => {
  const win = new BrowserWindow({ width: 1280, height: 950, show: false, webPreferences: { offscreen: true, contextIsolation: false } });
  const errs = [];
  win.webContents.on('console-message', (_e, lvl, msg) => { if (lvl >= 2) errs.push(String(msg).slice(0, 160)); });
  await win.loadFile(path.join(__dirname, '../src/planner/planner.html'));
  const js = (c) => win.webContents.executeJavaScript(c);
  await wait(1400);
  await js(`document.getElementById('build').click(), true`);
  for (let i = 0; i < 40; i += 1) { await wait(400); if (await js('!!(window.__revalTest && window.__revalTest.plan() && window.__revalTest.plan().summary)')) break; }
  await wait(600);

  const box = async (id) => js(`(function(){const r=document.getElementById('${id}').getBoundingClientRect();return {l:Math.round(r.left),r:Math.round(r.right),t:Math.round(r.top),b:Math.round(r.bottom)};})()`);
  const st = async () => js(`(function(){const p=document.getElementById('aiPanel');const cs=getComputedStyle(p);const r=p.getBoundingClientRect();
    const W=window.innerWidth;
    return JSON.stringify({open:window.__revalAI.state().open, cls:p.className, vis:cs.visibility, dir:cs.direction,
      left:Math.round(r.left), right:Math.round(r.right), W, off: (r.right<=2||r.left>=W-2),
      fabOpen: document.getElementById('aiFab').classList.contains('open')});})()`);
  const click = async (x, y) => {
    win.webContents.sendInputEvent({ type: 'mouseDown', x, y, button: 'left', clickCount: 1 });
    win.webContents.sendInputEvent({ type: 'mouseUp', x, y, button: 'left', clickCount: 1 });
    await wait(450);
  };
  const clickId = async (id) => { const b = await box(id); await click(Math.round((b.l + b.r) / 2), Math.round((b.t + b.b) / 2)); };
  const shot = async (n) => { require('fs').writeFileSync(path.join(__dirname, '..', 'docs', 'screens', n), (await win.webContents.capturePage()).toPNG()); };

  /* ۰) پنلِ بسته از ابتدا: کاملاً بیرون از صفحه و غیرقابل‌کلیک */
  const s0 = JSON.parse(await st());
  check(s0.open === false && s0.off === true, 'در حالت بسته، پنل کاملاً بیرون از صفحه است', JSON.stringify(s0));
  check(s0.vis === 'hidden', 'در حالت بسته، پنل کلیک‌ها را نمی‌گیرد (visibility:hidden)', s0.vis);
  check(s0.dir === 'rtl', 'جهت پنل راست‌به‌چپ است (با وجود قاعدهٔ globalِ aside)', s0.dir);

  /* ۱) کلیک روی دکمهٔ شناور → باز شدن، از سمت راستِ صفحه؟ (لبهٔ چپ) */
  await clickId('aiFab');
  const s1 = JSON.parse(await st());
  check(s1.open === true && s1.left === 0, 'کلیک روی دکمهٔ شناور پنل را باز می‌کند', JSON.stringify(s1));
  check(s1.vis === 'visible', 'پنل باز دیده می‌شود', s1.vis);
  check(s1.fabOpen === true, 'دکمهٔ شناور به حالت «بستن» می‌رود', String(s1.fabOpen));
  await shot('ui-47-ai-panel-open-closable.png');

  /* ۲) کلیک روی ✕ → بسته و کامل بیرون از صفحه */
  await clickId('aiCloseBtn');
  const s2 = JSON.parse(await st());
  check(s2.open === false && s2.off === true, 'دکمهٔ ✕ پنل را می‌بندد و کامل کنار می‌رود', JSON.stringify(s2));
  check(s2.vis === 'hidden', 'پس از بستن، پنل دیگر جلوی کلیک را نمی‌گیرد', s2.vis);

  /* ۳) مطمئن شویم کلیک وسط صفحه به خودِ برنامه می‌رسد (نه به پنلِ نامرئی) */
  const hit = await js(`(function(){const el=document.elementFromPoint(Math.round(window.innerWidth*0.45), Math.round(window.innerHeight*0.5));
    return el ? (el.closest('#aiPanel') ? 'PANEL' : 'APP') : 'NONE';})()`);
  check(hit === 'APP', 'کلیک در وسط صفحه به برنامه می‌رسد، نه به پنلِ بسته', hit);

  /* ۴) باز کردن دوباره با دکمهٔ شناور، بستن با Esc */
  await clickId('aiFab');
  check(JSON.parse(await st()).open === true, 'باز شدن دوباره با دکمهٔ شناور');
  win.webContents.sendInputEvent({ type: 'keyDown', keyCode: 'Escape' });
  win.webContents.sendInputEvent({ type: 'keyUp', keyCode: 'Escape' });
  await wait(450);
  check(JSON.parse(await st()).open === false, 'کلید Esc پنل را می‌بندد');

  /* ۵) باز کردن با میان‌بر Ctrl+I و بستن با کلیک روی پس‌زمینه */
  win.webContents.sendInputEvent({ type: 'keyDown', keyCode: 'I', modifiers: ['control'] });
  win.webContents.sendInputEvent({ type: 'char', keyCode: 'i', modifiers: ['control'] });
  win.webContents.sendInputEvent({ type: 'keyUp', keyCode: 'I', modifiers: ['control'] });
  await wait(500);
  check(JSON.parse(await st()).open === true, 'Ctrl+I پنل را باز می‌کند');
  await click(1150, 500);
  const s5 = JSON.parse(await st());
  check(s5.open === false && s5.off === true, 'کلیک بیرونِ پنل آن را می‌بندد', JSON.stringify(s5));

  /* ۶) دکمهٔ شناور در حالت باز، پنل را می‌بندد (کلیک دوم) */
  await clickId('aiFab');
  await clickId('aiFab');
  const s6 = JSON.parse(await st());
  check(s6.open === false && s6.off === true, 'کلیک دوم روی دکمهٔ شناور پنل را می‌بندد', JSON.stringify(s6));
  check(s6.fabOpen === false, 'دکمهٔ شناور به حالت اولیه برمی‌گردد');

  /* ۷) هیچ خطای کنسولی */
  check(errs.length === 0, 'هیچ خطای جاوااسکریپت در کنسول نیست', errs.slice(0, 2).join(' | '));

  console.log(`\n${fail ? '❌' : '✅'} ${pass} بررسی بستنِ پنل ${fail ? 'با ' + fail + ' خطا' : 'پاس شد'}\n`);
  win.destroy();
  app.exit(fail ? 1 : 0);
});
