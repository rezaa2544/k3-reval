/* تست «عنوان فصل در همه‌جا» (نسخهٔ ۲.۸.۳)
   دادهٔ قدیمی (بدون topicNames و بدون سطر ارزیابی) شبیه‌سازی می‌شود و باید:
     ۱) در ارزیابی فصل‌به‌فصل، عنوان واقعی کتاب «کنار» شمارهٔ فصل دیده شود
     ۲) در بلوک‌های برنامهٔ ساخته‌شده، عنوان فصل بیاید (نه «فصل ۳»)
     ۳) در گزارش و جدول‌های فصل‌به‌فصل هم عنوان باشد */
const { app, BrowserWindow } = require('electron');
const path = require('path');
const fs = require('fs');
app.commandLine.appendSwitch('disable-gpu');
app.commandLine.appendSwitch('disable-software-rasterizer');
app.commandLine.appendSwitch('disable-dev-shm-usage');
app.disableHardwareAcceleration();

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
let pass = 0; let fail = 0;
const check = (c, m, x) => { if (c) { pass += 1; console.log('PASS ' + m); } else { fail += 1; console.log('FAIL ' + m + (x ? ' → ' + x : '')); } };

app.whenReady().then(async () => {
  const win = new BrowserWindow({ width: 1400, height: 960, show: false, webPreferences: { offscreen: true, contextIsolation: false } });
  const errs = [];
  win.webContents.on('console-message', (_e, lvl, msg) => { if (lvl >= 2) errs.push(String(msg).slice(0, 160)); });
  await win.loadFile(path.join(__dirname, '../src/planner/planner.html'));
  const js = (c) => win.webContents.executeJavaScript(c);
  await wait(1600);

  /* ── ۱) شبیه‌سازی دادهٔ قدیمی (همان چیزی که کاربرِ نسخه‌های قبل دارد) ── */
  const demo = JSON.parse(await js(`window.__revalTest.oldDataDemo()`));
  const bio = demo.subjects.find((x) => x.id === 'bio');
  check(bio && bio.n >= 8, 'برای زیست‌شناسی فهرست عنوان‌ها از منبع رسمی پر شد', JSON.stringify(demo.subjects.slice(0, 3)));
  check(demo.first.every((n) => n && !/^(فصل|درس) [۰-۹]+$/.test(n)), 'سطرهای ارزیابی دیگر «فصل N» خالی نیستند', JSON.stringify(demo.first));
  check(/دنیای زنده|گوارش|تبادلات گازی/.test(demo.first.join(' ')), 'عنوان‌ها همان سرفصل‌های کتاب زیست‌اند', JSON.stringify(demo.first));

  /* ── ۲) رندر ارزیابی: نشان شماره + عنوان ── */
  const rowBio = JSON.parse(await js(`window.__revalTest.assessRows('bio')`));
  check(rowBio.length >= 3, 'سطرهای زیست رندر می‌شوند', JSON.stringify(rowBio.length));
  check(/^فصل [۰-۹]+$/.test(rowBio[0].badge || ''), 'شمارهٔ فصل در نشان کنار سطر دیده می‌شود', JSON.stringify(rowBio[0]));
  check(rowBio[0].value && rowBio[0].value !== rowBio[0].badge, 'عنوان واقعی در همان سطر نوشته شده', JSON.stringify(rowBio[0]));
  check(rowBio.filter((r) => /دهم|یازدهم|دوازدهم/.test(r.value)).length >= 3, 'پایهٔ هر فصل هم در عنوان آمده', JSON.stringify(rowBio.map((r) => r.value)));

  /* ── ۳) برنامه‌سازی: عنوان در بلوک‌ها و در گزارش ── */
  await js(`document.getElementById('build').click(), true`);
  for (let i = 0; i < 40; i += 1) {
    await wait(400);
    if (await js('!!(window.__revalTest && window.__revalTest.plan() && window.__revalTest.plan().summary)')) break;
  }
  await wait(800);

  const plan = JSON.parse(await js(`(function(){
    const p = window.__revalTest.plan();
    const blocks = [];
    p.days.slice(0, 14).forEach(d => (d.blocks||[]).forEach(b => { if (b.topicId) blocks.push({ t: b.topic, id: b.topicId }); }));
    const stats = (p.summary.chapterStats||[]).slice(0,6).map(c => c.label);
    const generic = blocks.filter(b => /^(فصل|درس)\\s*[۰-۹]+$/.test(String(b.t||'').trim())).length;
    return JSON.stringify({ n: blocks.length, generic, sample: blocks.slice(0,3), stats });
  })()`));

  check(plan.n > 0, 'بلوک‌های دارای فصل ساخته می‌شوند', String(plan.n));
  check(plan.generic === 0, 'هیچ بلوکی عنوان «فصل N» تنها ندارد', JSON.stringify(plan.sample));
  check(plan.sample.every((b) => /دهم|یازدهم|دوازدهم/.test(b.t)), 'بلوک‌ها عنوان کامل فصل را نشان می‌دهند', JSON.stringify(plan.sample));
  check(plan.sample.every((b) => String(b.t).replace(/^[^·]+·\s*/, '').length > 2), 'بخش عنوان خالی نیست', JSON.stringify(plan.sample));
  check(plan.stats.every((l) => !/^(فصل|درس)\s*[۰-۹]+$/.test(String(l))), 'آمار فصل‌به‌فصل گزارش هم عنوان دارد', JSON.stringify(plan.stats));

  /* ── ۴) اسکرین‌شات ── */
  await js(`(function(){const n=document.querySelector('.nav[data-view="step-4"]'); if(n) n.click(); return true;})()`);
  await wait(700);
  /* کارت زیست را باز کن تا عنوان‌ها در تصویر دیده شوند */
  await js(`(function(){
    ['bio','math','chem'].forEach(function(sid){
      const c=document.querySelector('[data-sid="'+sid+'"]');
      const b=c && c.querySelector('[data-toggle]');
      if(b && !c.classList.contains('open')) b.click();
    });
    return true;})()`);
  await wait(700);
  await js(`(function(){
    const box=document.querySelector('[data-sid="bio"]'); const sc=document.getElementById('mainScroll');
    if(box && sc){ sc.scrollTop = Math.max(0, box.getBoundingClientRect().top + sc.scrollTop - sc.getBoundingClientRect().top - 10); }
    return true;})()`);
  await wait(600);
  fs.writeFileSync(path.join(__dirname, '..', 'docs', 'screens', 'ui-49-chapter-titles-everywhere.png'),
    (await win.webContents.capturePage()).toPNG());
  /* تصویر دوم: درس عمومی با عنوان‌ها */
  await js(`(function(){
    document.querySelectorAll('.acard.open').forEach(function(c){ const b=c.querySelector('[data-toggle]'); if(b) b.click(); });
    const c=document.querySelector('[data-sid="di3"]');
    const b=c && c.querySelector('[data-toggle]'); if(b) b.click();
    return true;})()`);
  await wait(700);
  await js(`(function(){const c=document.querySelector('[data-sid="di3"]'); const sc=document.getElementById('mainScroll');
    if(c && sc){ sc.scrollTop = Math.max(0, c.getBoundingClientRect().top + sc.scrollTop - sc.getBoundingClientRect().top - 10); }
    return true;})()`);
  await wait(600);
  fs.writeFileSync(path.join(__dirname, '..', 'docs', 'screens', 'ui-50-general-chapter-titles.png'),
    (await win.webContents.capturePage()).toPNG());

  /* ── ۵) درس‌های عمومی هم عنوان واقعی دارند (نه فقط «درس ۱») ── */
  await js(`(function(){const c=document.querySelector('[data-sid="di3"]'); const b=c&&c.querySelector('[data-toggle]'); if(b && !c.classList.contains('open')) b.click(); return true;})()`);
  await wait(500);
  const di3 = JSON.parse(await js(`window.__revalTest.assessRows('di3')`));
  check(di3.length >= 3 && di3.every((r) => r.value && !/^درس [۰-۹]+$/.test(r.value)),
    'دین و زندگی ۳ عنوان درس‌ها را نشان می‌دهد', JSON.stringify(di3.map((r) => r.value)));
  check(/هستی بخش|یگانۀ بی‌همتا/.test(di3.map((r) => r.value).join(' ')), 'عنوان‌ها همان درس‌های کتاب دینی ۳ هستند', di3[0].value);
  check(/^درس [۰-۹]+$/.test(di3[0].badge || ''), 'برای درس عمومی نشان «درس N» است', String(di3[0].badge));

  const en3 = JSON.parse(await js(`(function(){const c=document.querySelector('[data-sid="en3"]'); const b=c&&c.querySelector('[data-toggle]'); if(b && !c.classList.contains('open')) b.click();
    const trs=c?[...c.querySelectorAll('tbody tr')]:[]; return JSON.stringify(trs.slice(0,3).map(t=>({v:(t.querySelector('input[data-cf=name]')||{}).value})));})()`));
  check(/Sense of Appreciation|Renewable Energy|Look It Up/.test(en3.map((r) => r.v).join(' ')), 'زبان انگلیسی ۳ عنوان درس‌های کتاب را دارد', JSON.stringify(en3));

  check(errs.length === 0, 'هیچ خطای جاوااسکریپت در کنسول نیست', errs.slice(0, 2).join(' | '));
  console.log(`\n${fail ? '❌' : '✅'} ${pass} بررسی عنوان فصل در همه‌جا ${fail ? 'با ' + fail + ' خطا' : 'پاس شد'}\n`);
  win.destroy();
  app.exit(fail ? 1 : 0);
});
