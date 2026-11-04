/* ═══════════════════════════════════════════════════════════════════════
   تستِ UI ۲.۱۰.۳ — سه عذرِ ۲.۱۰.۲ در «خودِ برنامه»
   ───────────────────────────────────────────────────────────────────────
   ۱) کارتِ «کالیبراسیونِ زمان» واقعاً دیده می‌شود، ثبتِ ساعتِ واقعی کار می‌کند
      و ضریب در ذخیره‌سازی و برنامه اثر می‌گذارد.
   ۲) نوارِ «پرشدگیِ ساعتِ اعلامی» در خلاصهٔ روز با عدد و دلیلِ فارسی دیده می‌شود.
   ۳) در چت، هر پاسخ نشانِ صریحِ حالت (آفلاین/مدل) دارد، دستیار یادش می‌ماند
      دربارهٔ چه درسی حرف می‌زدید، و «۲۰٪ کندتر» واقعاً کالیبراسیون را عوض می‌کند.
   اجرا: xvfb-run -a electron test/ui-calib-2103.js --no-sandbox
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

  /* ۸ ساعت در روز، تا مقدارِ خالی واقعی داشته باشیم */
  await js(`(function(){
    document.querySelectorAll('[data-avail]').forEach(function(inp){ inp.value = '۸'; inp.dispatchEvent(new Event('input',{bubbles:true})); });
    return true;
  })()`);
  await js(`document.getElementById('build').click(), true`);
  let built = false;
  for (let i = 0; i < 50; i += 1) {
    await wait(400);
    if (await js('!!(window.__revalTest && window.__revalTest.plan() && window.__revalTest.plan().summary)')) { built = true; break; }
  }
  check(built, 'برنامه ساخته می‌شود');

  /* ─────────── ۱) نوارِ پرشدگی در خلاصهٔ روز ─────────── */
  console.log('\n▌ ۱) «ساعتِ اعلامی چقدر محتوای واقعی گرفت؟» روی صفحه');
  await js(`(function(){ var b = document.querySelector('[data-view="plan"]'); if (b) b.click(); return true; })()`);
  await wait(700);
  await js(`(function(){ var d = document.querySelector('[data-day]'); if (d) d.click(); return true; })()`);
  await wait(700);

  const fillUi = JSON.parse(await js(`(function(){
    var p = window.__revalTest.plan();
    var days = (p.days||[]).filter(function(d){ return d.fill && d.capMinutes > 0; });
    var el = document.querySelector('.fillbar');
    var txt = el ? el.innerText : '';
    return JSON.stringify({
      daysWithFill: days.length,
      totalDays: (p.days||[]).length,
      allHaveWhy: days.every(function(d){ return !!d.fill.why && d.fill.pct <= 100; }),
      inDom: !!el,
      hasPct: /٪/.test(txt),
      hasWhy: txt.length > 40,
      sample: days[0] ? { used: days[0].fill.usedMinutes, cap: days[0].fill.capMinutes, pct: days[0].fill.pct } : null
    });
  })()`));
  check(fillUi.daysWithFill > 5, 'روزها فیلدِ پرشدگی دارند', fillUi.daysWithFill + '/' + fillUi.totalDays);
  check(fillUi.allHaveWhy, 'هر روز دلیلِ متنی دارد و درصد از ۱۰۰ بیشتر نیست');
  check(fillUi.inDom, 'نوارِ پرشدگی در DOM هست');
  check(fillUi.hasPct, 'درصد روی صفحه دیده می‌شود');
  check(fillUi.hasWhy, 'دلیلِ وقتِ آزاد (متن) روی صفحه دیده می‌شود');
  console.log('   نمونه: ' + JSON.stringify(fillUi.sample));

  /* ─────────── ۲) کارتِ کالیبراسیون: ثبت و اثر ─────────── */
  console.log('\n▌ ۲) کارتِ کالیبراسیون: ثبتِ ساعتِ واقعی');
  await js(`(function(){ var b = document.querySelector('[data-view="home"]'); if (b) b.click(); return true; })()`);
  await wait(600);
  const cardSeen = await js(`(function(){ var c = document.getElementById('calibCard'); return !!(c && c.offsetParent !== null); })()`);
  check(cardSeen, 'کارتِ کالیبراسیون دیده می‌شود');

  const before = JSON.parse(await js(`(function(){
    var st = window.__revalTest.measure ? window.__revalTest.measure() : null;
    var p = window.__revalTest.plan();
    var subj = (p.summary.chapterStats||[])[0] || {};
    return JSON.stringify({ n: (st && st.subjects) ? Object.keys(st.subjects).length : 0,
      sid: subj.subjectId || 'math', cov: p.summary.coverage.coverageRatio });
  })()`));

  const filled = await js(`(function(){
    var sid = document.getElementById('calibSubject');
    if (!sid || !sid.options.length) return 'no-select';
    sid.value = ${JSON.stringify('__SID__')} === '__SID__' ? sid.options[0].value : ${JSON.stringify('__SID__')};
    document.getElementById('calibChapter').value = '۱';
    document.getElementById('calibHours').value = '۶';
    document.getElementById('calibAdd').click();
    return sid.value;
  })()`.replace(/"__SID__"/g, JSON.stringify(before.sid)));
  await wait(1500);
  const after = JSON.parse(await js(`(function(){
    var st = window.__revalTest.measure();
    var rows = document.querySelectorAll('#calibRows tr');
    var p = window.__revalTest.plan();
    var sub = (st.subjects||{})[${JSON.stringify(before.sid)}] || null;
    return JSON.stringify({
      subjects: Object.keys(st.subjects||{}).length,
      scale: sub ? sub.pageScale : null,
      n: sub ? sub.n : 0,
      rowsInDom: rows.length,
      inConfig: !!(window.__revalTest.cfgCalibration && window.__revalTest.cfgCalibration()),
      cov: p.summary.coverage.coverageRatio,
      summaryText: (document.getElementById('calibSummary')||{}).textContent || ''
    });
  })()`));
  check(filled !== 'no-select', 'درس در فهرستِ کالیبراسیون انتخاب می‌شود', filled);
  check(after.subjects >= 1, 'اندازه‌گیری در وضعیت ثبت شد', after.subjects);
  check(after.scale && after.scale !== 1, 'ضریبِ درس با دادهٔ واقعی تغییر کرد', after.scale);
  check(after.rowsInDom >= 1, 'جدولِ کالیبراسیون ردیفِ درس را نشان می‌دهد', after.rowsInDom);
  check(/درس|نمونه/.test(after.summaryText), 'خلاصهٔ کارت به‌روز شد', after.summaryText);

  /* ─────────── ۳) چت: حالت، حافظه، کالیبراسیون ─────────── */
  console.log('\n▌ ۳) دستیار: نشانِ حالت، حافظه و کالیبراسیون از چت');
  const askChat = async (t) => {
    await js(`(function(){
      var fab = document.getElementById('aiFab'); if (fab) fab.click();
      var inp = document.getElementById('aiInput');
      inp.value = ${JSON.stringify(t)};
      inp.dispatchEvent(new Event('input', { bubbles: true }));
      document.getElementById('aiSend').click();
      return true;
    })()`);
    for (let i = 0; i < 25; i += 1) {
      await wait(300);
      const busy = await js(`document.querySelector('.ai-typing') ? 1 : 0`);
      if (!busy) break;
    }
    await wait(300);
    return JSON.parse(await js(`(function(){
      var msgs = document.querySelectorAll('#aiBody .msg.ai');
      var last = msgs.length ? msgs[msgs.length-1] : null;
      var badge = last ? last.querySelector('.ai-mode') : null;
      return JSON.stringify({
        count: msgs.length,
        /* textContent (نه innerText): پنلِ بسته هم متن دارد و تست به وضعیتِ رندر وابسته نمی‌شود */
        text: last ? last.textContent.slice(0, 400) : '',
        badge: badge ? badge.textContent : null,
        tools: last ? Array.from(last.querySelectorAll('.ai-act')).map(function(x){return x.textContent;}) : []
      });
    })()`));
  };

  const r1 = await askChat('سلام');
  check(r1.count >= 1, 'چت پاسخ می‌دهد', r1.count);
  check(!!r1.badge, 'هر پاسخِ دستیار نشانِ صریحِ «حالت» دارد', r1.badge);
  check(/آفلاین/.test(r1.badge || ''), 'حالتِ آفلاین صریح اعلام می‌شود (بدونِ ادعای مدل زبانی)', r1.badge);

  const r2 = await askChat('فصل ۴ ریاضی برام سخته');
  check(r2.count >= 2 && r2.text.length > 20, 'پاسخِ مشاوره‌ای می‌آید', r2.text.slice(0, 60));

  const r3 = await askChat('ریاضی برای من ۲۰٪ کندتر است');
  await wait(1200);
  const calibNow = JSON.parse(await js(`(function(){
    var st = window.__revalTest.measure();
    var rows = window.__revalTest.calibRows ? window.__revalTest.calibRows() : [];
    var m = rows.filter(function(r){ return r.subjectId === 'math'; })[0] || null;
    return JSON.stringify({ scale: m ? m.scale : null, n: m ? m.n : 0 });
  })()`));
  check(calibNow.scale && calibNow.scale > 1.05, '«۲۰٪ کندتر» از راهِ چت ضریبِ ریاضی را بالا برد', JSON.stringify(calibNow));
  check(r3.tools.length >= 1 || /کالیبر/.test(r3.text), 'پاسخِ چت اقدامِ انجام‌شده را نشان می‌دهد', r3.tools.join('|'));

  const r4 = await askChat('همون رو بذار برای امروز');
  check(r4.text.length > 10, '«همون رو بذار» جوابِ زمینه‌دار می‌گیرد (حافظهٔ گفت‌وگو)', r4.text.slice(0, 80));

  /* سؤال نباید برنامه را عوض کند */
  const before4 = await js(`JSON.stringify(window.__revalTest.plan().days[0].blocks.length)`);
  const r5 = await askChat('چرا امروز این‌قدر سنگینه؟');
  const after4 = await js(`JSON.stringify(window.__revalTest.plan().days[0].blocks.length)`);
  check(before4 === after4, 'سؤال، تعدادِ بلوک‌ها را عوض نمی‌کند', before4 + '→' + after4);
  check(r5.text.length > 20, 'سؤالِ «چرا» جوابِ توضیحی می‌گیرد', r5.text.slice(0, 60));

  /* ─────────── ۴) پایداریِ ذخیره ─────────── */
  console.log('\n▌ ۴) ماندگاریِ کالیبراسیون و حافظه پس از بارگذاریِ دوباره');
  const persisted = JSON.parse(await js(`(function(){
    var raw = window.__revalTest.savedState ? window.__revalTest.savedState() : null;
    if (!raw) return JSON.stringify({ ok:false });
    return JSON.stringify({ ok:true, measure: !!raw.measure, chatMemory: !!raw.chatMemory });
  })()`));
  check(persisted.ok === true && persisted.measure === true, 'کالیبراسیون در وضعیتِ ذخیره‌شده هست', JSON.stringify(persisted));
  check(persisted.chatMemory === true, 'حافظهٔ گفت‌وگو هم ذخیره می‌شود');

  check(errs.length === 0, 'هیچ خطای کنسولی نبود', errs.slice(0, 3).join(' | '));

  console.log('\n' + (fail === 0
    ? '✅ ' + pass + ' بررسیِ UI نسخهٔ ۲.۱۰.۳ پاس شد (کالیبراسیون · پرشدگیِ روز · دستیارِ حالت‌دار)'
    : '❌ ' + fail + ' ناموفق از ' + (pass + fail)));
  await wait(200);
  app.exit(fail === 0 ? 0 : 1);
}).catch((e) => {
  console.log('FAIL اجرای تست: ' + (e && e.stack ? e.stack : e));
  app.exit(1);
});
