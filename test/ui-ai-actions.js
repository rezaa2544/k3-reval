/* تست «دستیار اجرایی در رابط کاربری» — نسخهٔ ۲.۸.۱۴
   ------------------------------------------------------------------
   شکایت کاربر: «مشاوره هوشمند در عمل هیچ کاری انجام نمیده و فقط ادعا است».
   این تست همان جمله را در کادرِ چتِ خودِ برنامه می‌فرستد و بررسی می‌کند که:
     ۱) دستیار ابزار اجرایی صدا می‌زند و برنامهٔ امروز واقعاً عوض می‌شود
     ۲) بلوکِ فصلِ خواسته‌شده در برنامهٔ امروز ظاهر می‌شود
     ۳) کارتِ روز نوارِ «تغییرِ دستیِ این روز» را نشان می‌دهد
     ۴) دکمهٔ «برگردان» برنامه را به حالت قبل برمی‌گرداند
   اجرا: electron test/ui-ai-actions.js
   ------------------------------------------------------------------ */
const { app, BrowserWindow } = require('electron');
const path = require('path');
const fs = require('fs');
app.commandLine.appendSwitch('disable-gpu');
app.commandLine.appendSwitch('disable-software-rasterizer');
app.commandLine.appendSwitch('disable-dev-shm-usage');
app.disableHardwareAcceleration();
app.on('window-all-closed', () => { /* در تست، بستن پنجره نباید برنامه را بکشد */ });

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
let pass = 0; let fail = 0;
const check = (c, m, x) => {
  if (c) { pass += 1; console.log('PASS ' + m); } else { fail += 1; console.log('FAIL ' + m + (x !== undefined ? ' → ' + x : '')); }
};

const MSG = 'الان زیست‌شناسی فصل ۴ از کتاب دهم — گردش مواد در بدن رو دارم. می‌خوام این تایم رو به شیمی فصل ۲ دهم اختصاص بدم. برنامه رو آپدیت کن';

app.whenReady().then(async () => {
  const win = new BrowserWindow({
    width: 1400, height: 950, show: false,
    webPreferences: {
      offscreen: true, contextIsolation: true, sandbox: false,
      preload: path.join(__dirname, 'planner-bridge-mock.js'),
    },
  });
  const errs = [];
  win.webContents.on('console-message', (_e, lvl, msg) => {
    if (lvl >= 2 && !/Autofill|DevTools/.test(String(msg))) errs.push(String(msg).slice(0, 160));
  });
  const js = (c) => win.webContents.executeJavaScript(c);
  /* هر اجرا از حالتِ تمیز شروع می‌شود (وگرنه تنظیماتِ تست‌های قبلی می‌ماند) */
  try { fs.unlinkSync(path.join(require('os').tmpdir(), 'reval-test-state.json')); } catch (e) { /* نبود */ }
  await win.loadFile(path.join(__dirname, '../src/planner/planner.html'));
  await wait(800);
  await js('localStorage.clear(), true');
  await win.loadFile(path.join(__dirname, '../src/planner/planner.html'));
  await wait(1600);

  /* بستنِ پنجرهٔ تغییرات اگر باز است */
  await js(`(function(){ const c = document.querySelector('[data-close-changelog], #changelogClose'); if (c) c.click(); return true; })()`);

  /* ساخت برنامه */
  await js(`document.getElementById('build').click(), true`);
  let built = false;
  for (let i = 0; i < 40; i += 1) {
    await wait(400);
    if (await js('!!(window.__revalTest && window.__revalTest.plan() && window.__revalTest.plan().summary)')) { built = true; break; }
  }
  check(built, 'برنامه ساخته شد');
  if (!built) { console.log('\n❌ 0 ✅'); app.exit(1); return; }

  /* وضعیتِ «قبل» امروز */
  const before = JSON.parse(await js(`(function(){
    const p = window.__revalTest.plan();
    const t = new Date(); const iso = t.toISOString().slice(0,10);
    let day = p.days.find(function(d){ return d.date === iso; }) || p.days[0];
    const blocks = (day.blocks||[]).filter(function(b){ return b.kind !== 'routine'; });
    return JSON.stringify({ date: day.date,
      blocks: blocks.map(function(b){ return b.kind + ':' + b.subjectId + ':' + (b.topicId||'') + ':' + b.minutes; }) });
  })()`));
  const bioBefore = before.blocks.filter((b) => b.indexOf(':bio:') !== -1).length;
  check(before.blocks.length > 0, 'برنامهٔ امروز بلوک دارد', before.blocks.join(' | '));
  check(bioBefore > 0, 'قبل از تغییر، زیست در برنامهٔ امروز بود');

  /* باز کردن چت و فرستادنِ همان جملهٔ کاربر */
  await js(`window.__revalAI.open(), true`);
  await wait(400);
  await js(`window.__revalAI.send(${JSON.stringify(MSG)}), true`);
  let done = false;
  for (let i = 0; i < 30; i += 1) {
    await wait(300);
    const n = await js(`(window.__revalAI.history() || []).length`);
    if (n >= 2) { done = true; break; }
  }
  check(done, 'دستیار پاسخ داد');

  /* آیا واقعاً برنامه عوض شد؟ */
  const after = JSON.parse(await js(`(function(){
    const p = window.__revalTest.plan();
    const t = new Date(); const iso = t.toISOString().slice(0,10);
    let day = p.days.find(function(d){ return d.date === iso; }) || p.days[0];
    const blocks = (day.blocks||[]).filter(function(b){ return b.kind !== 'routine'; });
    return JSON.stringify({ date: day.date,
      overrides: (day.overrides||[]).length,
      blocks: blocks.map(function(b){ return b.kind + ':' + b.subjectId + ':' + (b.topicId||'') + ':' + b.minutes + ':' + (b.topic||''); }) });
  })()`));

  check(after.overrides >= 1, 'تغییرِ دستی در خودِ برنامهٔ امروز ثبت شد', after.overrides);
  check(after.blocks.filter((b) => b.indexOf(':bio:') !== -1).length < bioBefore
    || after.blocks.join('|') !== before.blocks.join('|'), 'ترکیبِ امروز واقعاً عوض شد');
  check(after.blocks.some((b) => b.indexOf(':chem:') !== -1 && b.indexOf(':chem.c2:') !== -1),
    'فصل ۲ شیمی در برنامهٔ امروز است', after.blocks.join(' | '));

  /* پاسخِ چت باید «قبل/بعد» واقعی نشان بدهد */
  const lastMsg = await js(`(function(){
    const h = window.__revalAI.history() || [];
    for (let i = h.length - 1; i >= 0; i -= 1) if (h[i].role === 'assistant') return String(h[i].content || '');
    return '';
  })()`);
  check(/انجام شد/.test(String(lastMsg)), 'پاسخ تأییدِ انجامِ کار دارد');
  check(/قبل:/i.test(String(lastMsg)) && /بعد:/i.test(String(lastMsg)), 'پاسخ مقایسهٔ قبل/بعد را نشان می‌دهد');
  check(String(lastMsg).indexOf('🆕') !== -1, 'بلوکِ تازه در پاسخ علامت خورده است');

  /* نوارِ «تغییرِ دستی» در کارتِ روز */
  await js(`(function(){ const nav = document.querySelector('.nav[data-view="plan"]'); if (nav) nav.click(); return true; })()`);
  await wait(500);
  await js(`(function(){ const t = window.__revalTest; const p = t.plan(); const iso = new Date().toISOString().slice(0,10);
    const idx = p.days.findIndex(function(d){ return d.date === iso; });
    return (t.openDayIndex ? t.openDayIndex(idx < 0 ? 0 : idx) : t.openToday()); })()`);
  await wait(600);
  const bar = JSON.parse(await js(`(function(){
    const el = document.querySelector('#dayView .ovbar');
    if (!el) return JSON.stringify({ found:false });
    return JSON.stringify({ found:true, text: el.textContent.replace(/\\s+/g,' ').trim(),
      hasUndo: !!el.querySelector('[data-undo-day]') });
  })()`));
  check(bar.found === true, 'کارتِ روز نوارِ «تغییرِ دستی» را نشان می‌دهد');
  check(bar.hasUndo === true, 'دکمهٔ «برگردان» در همان نوار هست');

  /* برگرداندن با همان دکمه */
  await js(`(function(){ const b = document.querySelector('#dayView .ovbar [data-undo-day]'); if (b) b.click(); return true; })()`);
  await wait(700);
  const restored = JSON.parse(await js(`(function(){
    const p = window.__revalTest.plan();
    const iso = new Date().toISOString().slice(0,10);
    const day = p.days.find(function(d){ return d.date === iso; }) || p.days[0];
    const blocks = (day.blocks||[]).filter(function(b){ return b.kind !== 'routine'; });
    return JSON.stringify({ overrides: (day.overrides||[]).length,
      blocks: blocks.map(function(b){ return b.kind + ':' + b.subjectId + ':' + (b.topicId||'') + ':' + b.minutes; }) });
  })()`));
  check(restored.overrides === 0, 'بعد از «برگردان» تغییرِ دستی پاک شد', restored.overrides);
  check(restored.blocks.join('|') === before.blocks.join('|'), 'برنامهٔ امروز دقیقاً به حالت اول برگشت');

  check(errs.length === 0, 'هیچ خطای جاوااسکریپت در کنسول نیست', errs.slice(0, 2).join(' | '));

  console.log('\n' + (fail === 0
    ? `✅ ${pass} بررسی «دستیار اجرایی در UI» پاس شد`
    : `❌ ${pass} ✅ / ${fail} ❌`));
  app.exit(fail === 0 ? 0 : 1);
});
