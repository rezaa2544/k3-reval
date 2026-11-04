/* ═══════════════════════════════════════════════════════════════════════
   تستِ UI ۲.۱۰.۲ — «بخشِ ۲ از ۶» روی بلوک‌ها + دستیارِ سؤال‌فهم
   ───────────────────────────────────────────────────────────────────────
   شکایتِ کاربر با اسکرین‌شات: یک فصلِ ریاضی با «۵۰ دقیقه» نمایش داده می‌شد و
   دستیار در چت جوابِ بی‌ربط می‌داد. این تست در «خودِ برنامه» بررسی می‌کند:
     ۱) هر بلوکِ فصل روی صفحه «بخش i از n» را نشان می‌دهد
     ۲) تولتیپِ همان نشان، بودجهٔ کلِ فصل را به تفکیکِ فاز می‌گوید
     ۳) سؤال در چت، برنامه را عوض نمی‌کند و جوابِ عددی می‌دهد
     ۴) دستورِ روشن در چت، برنامه را واقعاً عوض می‌کند
   اجرا: xvfb-run -a electron test/ui-realism-2102.js --no-sandbox
   ═══════════════════════════════════════════════════════════════════════ */
const { app, BrowserWindow } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');
app.commandLine.appendSwitch('disable-gpu');
app.commandLine.appendSwitch('disable-software-rasterizer');
app.commandLine.appendSwitch('disable-dev-shm-usage');
app.disableHardwareAcceleration();
app.on('window-all-closed', () => { /* در تست، بستن پنجره برنامه را نمی‌کشد */ });

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
let pass = 0; let fail = 0;
const check = (c, m, x) => {
  if (c) { pass += 1; console.log('PASS ' + m); return true; }
  fail += 1; console.log('FAIL ' + m + (x !== undefined ? ' → ' + x : ''));
  return false;
};

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
  try { fs.unlinkSync(path.join(os.tmpdir(), 'reval-test-state.json')); } catch (e) { /* نبود */ }
  await win.loadFile(path.join(__dirname, '../src/planner/planner.html'));
  await wait(900);
  await js('localStorage.clear(), true');
  await win.loadFile(path.join(__dirname, '../src/planner/planner.html'));
  await wait(1600);
  await js(`(function(){ const c = document.querySelector('[data-close-changelog], #changelogClose'); if (c) c.click(); return true; })()`);

  await js(`document.getElementById('build').click(), true`);
  let built = false;
  for (let i = 0; i < 50; i += 1) {
    await wait(400);
    if (await js('!!(window.__revalTest && window.__revalTest.plan() && window.__revalTest.plan().summary)')) { built = true; break; }
  }
  check(built, 'برنامه ساخته می‌شود');

  /* ۱) نشانِ «بخش i از n» در DOM */
  const badge = JSON.parse(await js(`(function(){
    var p = window.__revalTest.plan();
    var host = document.getElementById('homeTodayList') || document.getElementById('dayView');
    var text = document.body.innerText;
    var parts = (p.days[0].blocks||[]).filter(function(b){return b.part;});
    var inDom = /بخش\\s*[۰-۹]+\\s*از\\s*[۰-۹]+/.test(text);
    return JSON.stringify({n: parts.length, inDom: inDom,
      sample: parts[0] ? {i: parts[0].part.index, total: parts[0].part.total, min: parts[0].minutes} : null});
  })()`));
  check(badge.n > 0, 'بلوک‌های امروز اطلاعاتِ بخش دارند', JSON.stringify(badge));
  check(badge.inDom === true, 'عبارتِ «بخش ۱ از N» واقعاً روی صفحه دیده می‌شود');
  check(badge.sample && badge.sample.min < 90, 'نمایشِ یک نشست، نه کلِ فصل', JSON.stringify(badge.sample));

  /* ۲) تولتیپ بودجهٔ فصل */
  const tip = JSON.parse(await js(`(function(){
    var el = document.querySelector('[data-help="part"]');
    if (!el) return JSON.stringify({ok:false});
    var t = el.getAttribute('title') || '';
    return JSON.stringify({ok:true, hasTotal: /کلِ این فصل/.test(t), hasPhases: /یادگیری/.test(t) && /تمرین/.test(t), len: t.length});
  })()`));
  check(tip.ok === true, 'نشانِ بخش تولتیپ دارد', JSON.stringify(tip));
  check(tip.hasTotal === true && tip.hasPhases === true, 'تولتیپ بودجهٔ کلِ فصل و تفکیکِ فازها را می‌گوید', JSON.stringify(tip));

  /* ۳) سؤال در چت: هیچ تغییری در برنامه */
  const before = await js(`JSON.stringify((window.__revalTest.plan().days[0].blocks||[]).map(function(b){return b.kind+':'+b.subjectId;}))`);
  const ask = JSON.parse(await js(`(function(){
    try {
      var r = window.RevalAIBrain.respond('چرا امروز فقط این‌قدر کم گذاشتی؟', window.__revalTest.aiCtx());
      return JSON.stringify({text: String(r.text||'').slice(0,300), actions: (r.actions||[]).length});
    } catch (e) { return JSON.stringify({err: String(e)}); }
  })()`));
  check(!ask.err, 'دستیار به سؤال جواب می‌دهد', JSON.stringify(ask).slice(0, 200));
  check(ask.actions === 0, 'سؤال هیچ ابزاری اجرا نکرد', ask.actions);
  check(/بلوک|دقیقه|ساعت/.test(ask.text || ''), 'جواب دربارهٔ همان روز و با عدد است', (ask.text || '').slice(0, 80));

  const budget = JSON.parse(await js(`(function(){
    try {
      var r = window.RevalAIBrain.respond('یک فصل ریاضی رو ۵۰ دقیقه زدی؟ این واقعی نیست', window.__revalTest.aiCtx());
      return JSON.stringify({text: String(r.text||'').slice(0,400), actions: (r.actions||[]).length});
    } catch (e) { return JSON.stringify({err: String(e)}); }
  })()`));
  check(!budget.err && budget.actions === 0, 'شکایتِ «غیرواقعی» برنامه را عوض نمی‌کند', JSON.stringify(budget).slice(0, 160));
  check(/جمع|بودجهٔ/.test(budget.text || '') && /ساعت/.test(budget.text || ''),
    'جواب، بودجهٔ واقعیِ فصل را با عدد می‌گوید', (budget.text || '').slice(0, 120));

  /* ۴) دستور در چت: برنامه واقعاً عوض می‌شود */
  const cmd = JSON.parse(await js(`(function(){
    try {
      var r = window.RevalAIBrain.respond('فصل ۲ شیمی رو امروز بذار', window.__revalTest.aiCtx());
      var p = window.__revalTest.plan();
      var d = p.days[0];
      var has = (d.blocks||[]).some(function(b){ return b.subjectId==='chem'; });
      return JSON.stringify({actions: (r.actions||[]).length, hasChem: has, text: String(r.text||'').slice(0,150)});
    } catch (e) { return JSON.stringify({err: String(e)}); }
  })()`));
  check(cmd.actions >= 1, 'دستورِ روشن ابزار را صدا می‌زند', JSON.stringify(cmd).slice(0, 200));
  await wait(600);
  const afterBlocks = await js(`JSON.stringify((window.__revalTest.plan().days[0].blocks||[]).map(function(b){return b.kind+':'+b.subjectId;}))`);
  check(afterBlocks !== before, 'برنامهٔ امروز بعد از دستور تغییر کرد');

  check(errs.length === 0, 'هیچ خطای جاوااسکریپت در کنسول نیست', errs.slice(0, 2).join(' | '));

  console.log('\n' + (fail ? '❌ ' : '✅ ') + pass + ' ✅ / ' + fail + ' ❌ — «بخشِ چندم از فصل» و «دستیارِ سؤال‌فهم» در خودِ برنامه');
  app.exit(fail ? 1 : 0);
});
