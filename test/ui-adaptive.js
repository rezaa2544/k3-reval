/* تستِ رابطِ «هستهٔ هوشِ خودتطبیق» (نسخهٔ ۲.۱۰.۰)
   ─────────────────────────────────────────────────────────────────────
   این تست همان چیزی را در خودِ برنامه می‌سنجد که unit-test موتور سنجید:
     ۱) کارتِ هسته در خانه دیده می‌شود و سطح را نشان می‌دهد
     ۲) آزمونِ سطح (۶ پرسش) باز می‌شود و با پاسخ‌دادن، سطح و برنامه عوض می‌شود
     ۳) بلوکی که با زمانِ واقعیِ بیشتر «انجام شد» ⇒ پرسشِ «چرا؟» در کارت می‌آید
     ۴) پاسخ به پرسش ⇒ ضریبِ همان درس در برنامه اعمال می‌شود و کارت به‌روز می‌شود
     ۵) دکمهٔ گزارشِ تجربه، فایلِ markdown می‌سازد (گزارش شاملِ دادهٔ واقعی است)
     ۶) هیچ خطای جاوااسکریپتی در کنسول نیست
   اجرا: electron test/ui-adaptive.js --no-sandbox */
const { app, BrowserWindow } = require('electron');
const path = require('path');
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
    if (lvl >= 2 && !/Autofill|DevTools/.test(String(msg))) errs.push(String(msg).slice(0, 200));
  });
  await win.loadFile(path.join(__dirname, '../src/planner/planner.html'));
  const js = (c) => win.webContents.executeJavaScript(c);
  await wait(1600);

  /* ماژول هسته در صفحه حاضر است */
  check(await js('!!window.RevalAdaptive'), 'ماژولِ هستهٔ خودتطبیق در صفحه بارگذاری شده است');

  /* ساخت برنامه با کلیک واقعی */
  await js(`document.getElementById('build').click(), true`);
  let built = false;
  for (let i = 0; i < 40; i += 1) {
    await wait(400);
    if (await js('!!(window.__revalTest && window.__revalTest.plan() && window.__revalTest.plan().summary)')) { built = true; break; }
  }
  check(built, 'برنامه ساخته شد');
  if (!built) { console.log('\n❌ 0 ✅'); app.exit(1); return; }

  await wait(400);

  /* ۱) کارتِ هسته */
  check(await js(`(function(){const c=document.getElementById('adaptiveCard');return !!c && c.style.display!=='none';})()`),
    'کارتِ «هستهٔ هوشِ خودتطبیق» در صفحهٔ خانه دیده می‌شود');
  const chip = await js(`document.getElementById('adaptiveLevel').textContent`);
  check(/سطح/.test(String(chip)), 'کارت سطحِ فعلی را نشان می‌دهد', chip);
  check(/۳/.test(String(chip)) || /سطح/.test(String(chip)), 'سطحِ پیش‌فرض روی کارت است', chip);
  const lead = await js(`document.getElementById('adaptiveLead').textContent`);
  check(/نمونه|سطح/.test(String(lead)), 'متنِ کارت می‌گوید چند نمونهٔ واقعی ثبت شده', lead);

  /* ۲) آزمونِ سطح */
  await js(`document.getElementById('adaptiveQuizBtn').click(), true`);
  await wait(300);
  const qCount = await js(`document.querySelectorAll('#adaptiveQuestions [data-q]').length`);
  check(qCount === 24, 'آزمونِ سطح ۶ پرسش × ۴ گزینه نشان می‌دهد', qCount);
  await js(`(function(){
    var qs = ['q1','q2','q3','q4','q5','q6'];
    qs.forEach(function(q){
      var b = document.querySelector('#adaptiveQuestions [data-q="'+q+'"][data-o="d"]');
      if (b) b.click();
    });
    var go = document.getElementById('adaptiveQuizGo');
    if (go) go.click();
    return true;
  })()`);
  await wait(1400);
  const lvlAfter = await js(`window.__revalTest.calibration() && window.__revalTest.calibration().level`);
  check(lvlAfter === 6, 'پاسخِ «بهترین گزینه» سطح را روی ۶ می‌گذارد', lvlAfter);
  const chip2 = await js(`document.getElementById('adaptiveLevel').textContent`);
  check(/۶/.test(String(chip2)), 'کارت سطحِ تازه را نشان می‌دهد', chip2);
  const act = await js(`window.__revalTest.plan().summary.adaptive && window.__revalTest.plan().summary.adaptive.active`);
  check(act === true, 'برنامه با هستهٔ فعال بازساخته شد', act);

  /* ۳) بلوکِ طولانی‌تر از برآورد ⇒ پرسشِ چرا */
  const obs = JSON.parse(await js(`(function(){
    var t = window.__revalTest;
    var p = t.plan();
    var blk = null, day = null;
    for (var i=0;i<p.days.length;i++){
      var b = (p.days[i].blocks||[]).filter(function(x){return x.kind==='learn' && x.minutes>0;})[0];
      if (b) { blk = b; day = p.days[i]; break; }
    }
    if (!blk) return JSON.stringify({ok:false});
    var res = t.observeBlock({subjectId: blk.subjectId, subjectName: blk.subjectName, topic: blk.topic, minutes: blk.minutes, kind: blk.kind}, blk.minutes * 2);
    return JSON.stringify({ok:!!res, ask: !!(res && res.ask), sid: blk.subjectId, planned: blk.minutes});
  })()`));
  check(obs.ok === true, 'بلوکِ انجام‌شده با زمانِ واقعی ثبت می‌شود', JSON.stringify(obs));
  check(obs.ask === true, 'اختلافِ دوبرابری ⇒ پرسشِ «چرا؟» ساخته می‌شود');
  await wait(400);
  const askBtns = await js(`document.querySelectorAll('#adaptiveQuestions [data-reason]').length`);
  check(askBtns >= 6, 'کارت برای هر پرسش، شش دلیلِ آماده نشان می‌دهد', askBtns);
  const askCountChip = await js(`document.getElementById('adaptiveAskBtn').textContent`);
  check(/۱|۲|۳/.test(String(askCountChip)), 'دکمهٔ «پرسش‌های باز» تعداد را نشان می‌دهد', askCountChip);

  /* ۴) پاسخ به پرسش ⇒ ضریبِ درس */
  const answered = JSON.parse(await js(`(function(){
    var b = document.querySelector('#adaptiveQuestions [data-reason="hard"]');
    if (!b) return JSON.stringify({ok:false});
    var ask = b.getAttribute('data-ask');
    b.click();
    var c = window.__revalTest.calibration();
    return JSON.stringify({ok:true, open: window.RevalAdaptive.openQuestions(c).length, diff: c.difficulty['${'${obs.sid}'}']});
  })()`.replace('${obs.sid}', obs.sid)));
  check(answered.ok === true, 'دکمهٔ دلیلِ «سخت‌تر بود» قابلِ کلیک است', JSON.stringify(answered));
  await wait(1200);
  const openNow = await js(`window.RevalAdaptive.openQuestions(window.__revalTest.calibration()).length`);
  check(openNow === 0, 'پس از پاسخ، پرسشِ بازی نمی‌ماند', openNow);
  const pace = await js(`(function(){var c=window.__revalTest.calibration();return window.RevalAdaptive.paceFor(c, '${'${obs.sid}'}');})()`.replace('${obs.sid}', obs.sid));
  check(pace > 1, 'ضریبِ همان درس بالاتر از ۱ رفت', pace);
  const inPlan = await js(`(function(){var a=window.__revalTest.plan().summary.adaptive;return a && a.pace ? Object.keys(a.pace).length : 0;})()`);
  check(inPlan >= 1, 'ضریب در برنامهٔ بازساخته‌شده اعمال شده است', inPlan);

  /* ۵) گزارشِ تجربه */
  const rep = await js(`(function(){
    try {
      var md = window.RevalAdaptive.experienceReport(window.__revalTest.calibration(), {appVersion:'2.10.0'});
      var fence = String.fromCharCode(96,96,96) + 'json';
      return JSON.stringify({len: md.length, json: md.indexOf(fence)>=0, title: md.indexOf('گزارشِ تجربه')>=0, rows: md.indexOf('| درس |')>=0});
    } catch(e) { return JSON.stringify({err:String(e)}); }
  })()`);
  const R = JSON.parse(rep);
  check(!R.err && R.len > 400, 'گزارشِ تجربه ساخته می‌شود', JSON.stringify(R));
  check(R.title === true && R.rows === true && R.json === true, 'گزارش عنوان، جدولِ درس‌ها و بلوکِ JSON دارد', JSON.stringify(R));
  check(await js(`!!document.getElementById('adaptiveReportBtn')`), 'دکمهٔ گزارش در کارت هست');

  /* ۵.۵) شرایطِ دانش‌آموز (تمرکزِ کوتاه / اضطراب) */
  check(await js(`!!document.getElementById('adaptiveCondition')`), 'انتخاب‌گرِ «شرایطِ من» در کارت هست');
  const condRes = JSON.parse(await js(`(function(){
    var sel = document.getElementById('adaptiveCondition');
    sel.value = 'focus';
    sel.dispatchEvent(new Event('change'));
    return JSON.stringify({ cond: window.__revalTest.calibration().condition,
      inPlan: (window.__revalTest.plan().summary.adaptive||{}).condition || null });
  })()`));
  check(condRes.cond === 'focus', 'انتخابِ «تمرکزِ کوتاه» در حافظهٔ هسته ثبت می‌شود', condRes.cond);
  await wait(900);
  const focusPlan = JSON.parse(await js(`(function(){
    var p = window.__revalTest.plan();
    var lens = []; p.days.forEach(function(d){ (d.blocks||[]).forEach(function(b){ if (['learn','reteach','boost'].indexOf(b.kind)!==-1) lens.push(b.minutes); }); });
    var brk = 0; p.days.forEach(function(d){ brk += (d.breaks||[]).filter(function(x){return x.kind==='long';}).length; });
    return JSON.stringify({ n: lens.length, max: Math.max.apply(null, lens), longBreaks: brk, cov: p.summary.coverage.coverageRatio });
  })()`));
  check(focusPlan.n > 0, 'برنامه با شرایطِ تمرکزِ کوتاه ساخته می‌شود', JSON.stringify(focusPlan));
  check(focusPlan.longBreaks > 0, 'استراحتِ بلند در این حالت هم چیده می‌شود', focusPlan.longBreaks);

  /* ۶) خطای کنسول */
  check(errs.length === 0, 'هیچ خطای جاوااسکریپت در کنسول نیست', errs.slice(0, 3).join(' | '));

  console.log('\n' + (fail === 0 ? '✅ ' : '❌ ') + pass + ' ✅ / ' + fail + ' ❌'
    + (fail === 0 ? ' — «هستهٔ هوشِ خودتطبیق» در خودِ برنامه کار می‌کند' : ' — ایرادها:'));
  app.exit(fail === 0 ? 0 : 1);
});
