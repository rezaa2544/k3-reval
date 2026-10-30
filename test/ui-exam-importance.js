/* تست UI «اهمیت واقعیِ آزمون‌محور» (نسخهٔ ۲.۸.۱۲)
   -------------------------------------------------------------
   چیزی که کاربر می‌بیند باید همین باشد:
   • برچسب بحرانی/پرتکرار/متوسط/کم‌هزینه + عدد «اولویت ۰..۱۰۰»
   • tooltip با ریزِ سال‌به‌سال (۱۳۹۸ تا ۱۴۰۵)، ضریب درس، منبع
   • برای درسی که داده‌اش کم است (شیمی) برچسب «دادهٔ محدود»
   • راهنمای «؟» در سرِ کارت که روش محاسبه را می‌گوید
*/
const { app, BrowserWindow } = require('electron');
const path = require('path');
const fs = require('fs');
app.commandLine.appendSwitch('disable-gpu');
app.commandLine.appendSwitch('disable-software-rasterizer');
app.commandLine.appendSwitch('disable-dev-shm-usage');
app.disableHardwareAcceleration();
app.on('window-all-closed', () => {});

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
let pass = 0; let fail = 0;
const check = (c, m, x) => {
  if (c) { pass += 1; console.log('PASS ' + m); } else { fail += 1; console.log('FAIL ' + m + (x !== undefined ? ' → ' + x : '')); }
};

app.whenReady().then(async () => {
  const win = new BrowserWindow({
    width: 1440, height: 980, show: false,
    webPreferences: {
      offscreen: true, contextIsolation: true, sandbox: false,
      preload: path.join(__dirname, 'planner-bridge-mock.js'),
    },
  });
  const errs = [];
  win.webContents.on('console-message', (_e, lvl, msg) => {
    if (lvl >= 2 && !/Autofill|DevTools/.test(String(msg))) errs.push(String(msg).slice(0, 160));
  });
  await win.loadFile(path.join(__dirname, '../src/planner/planner.html'));
  const js = (c) => win.webContents.executeJavaScript(c);
  await wait(1600);

  /* رشته باید تجربی باشد تا دروس ضریب‌دار (زیست/شیمی/…) در گزارش باشند */
  await js(`(function(){
    const nav=document.querySelector('.nav[data-view="step-1"]'); if(nav) nav.click();
    const set=function(id,v){const el=document.getElementById(id); if(!el) return;
      el.value=v; el.dispatchEvent(new Event('input',{bubbles:true})); el.dispatchEvent(new Event('change',{bubbles:true}));};
    set('name','آرمان'); set('grade','دوازدهم'); set('field','tajrobi');
    return true;})()`);
  await wait(800);
  await js(`document.getElementById('build').click(), true`);
  let built = false;
  for (let i = 0; i < 40; i += 1) {
    await wait(400);
    if (await js('!!(window.__revalTest && window.__revalTest.plan() && window.__revalTest.plan().summary)')) { built = true; break; }
  }
  check(built, 'برنامه ساخته شد');
  if (!built) { console.log('\n❌ 0 ✅'); app.exit(1); return; }

  /* بستن پنجرهٔ تغییرات و رفتن به گزارش */
  await js(`(function(){
    const b=[...document.querySelectorAll('button')].find(function(x){return /خودم می‌بندم|بستن/.test(x.textContent);});
    if(b) b.click();
    const nav=document.querySelector('.nav[data-view="report"]');
    if(nav) nav.click();
    return true;})()`);
  await wait(1200);

  /* انتخاب کتاب بر اساس «نام» (id کتاب‌ها با id درس یکی نیست) */
  const readBook = (needle) => js(`(function(){
    const sel=document.getElementById('reportBook');
    if(!sel) return false;
    const opt=[...sel.options].find(function(o){ return o.textContent.indexOf(${JSON.stringify(needle)}) >= 0; });
    if(!opt) return false;
    sel.value=opt.value; sel.dispatchEvent(new Event('change',{bubbles:true}));
    return true;})()`);

  check(await readBook('زیست') === true, 'کتاب زیست‌شناسی در فهرست گزارش هست');
  await wait(700);
  const bio = JSON.parse(await js(`(function(){
    const rows=[...document.querySelectorAll('#chapterTable tbody tr')];
    return JSON.stringify(rows.slice(0,6).map(function(r){
      const pr=r.querySelector('.ci-prio');
      const tag=r.querySelector('.ci');
      const cell = tag ? tag.parentElement : null;
      return { prio: pr?pr.textContent.trim():'', tip: pr?pr.getAttribute('title'):'',
               tag: tag?tag.textContent.trim():'',
               sub: cell ? ((cell.querySelector('.muted')||{}).textContent||'') : '' };
    }));})()`));
  check(bio.length >= 5, 'سطرهای جدول فصل‌به‌فصل رندر شدند', String(bio.length));
  check(bio.every((r) => /اولویت/.test(r.prio)), 'ستون «اهمیت واقعی» عدد اولویت را نشان می‌دهد',
    JSON.stringify(bio.map((r) => r.prio)));
  check(bio.every((r) => r.tag && r.tag.length > 1), 'برچسب متنی (بحرانی/پرتکرار/…) هست',
    JSON.stringify(bio.map((r) => r.tag)));
  check(bio.some((r) => /۱۳۹۸/.test(r.tip)) && bio.some((r) => /۱۴۰۵/.test(r.tip)),
    'tooltip ریزِ سال‌به‌سال را از ۱۳۹۸ تا ۱۴۰۵ می‌آورد', (bio[0].tip || '').slice(0, 90));
  check(bio.some((r) => /ضریب درس در کنکور: ۱۲/.test(r.tip)), 'ضریب درس در tooltip آمده',
    (bio[0].tip || '').slice(0, 120));
  check(bio.some((r) => /منبع:/.test(r.tip)), 'منبع عددها ذکر شده', (bio[0].tip || '').slice(-80));
  check(bio.every((r) => /سؤال در هر آزمون/.test(r.sub)), 'زیرنویس سلول، سؤال در هر آزمون و سهم درس را دارد',
    (bio[0].sub || '').slice(0, 60));
  const prios = bio.map((r) => Number((r.prio.match(/[۰-۹]+/) || [''])[0].replace(/[۰-۹]/g, (d) => '۰۱۲۳۴۵۶۷۸۹'.indexOf(d))));
  check(new Set(prios).size > 1, 'اولویت فصل‌ها یکسان نیست (تفکیک واقعی)', JSON.stringify(prios));

  /* شیمی: داده کم است → برچسب «دادهٔ محدود» */
  check(await readBook('شیمی') === true, 'کتاب شیمی در فهرست گزارش هست');
  await wait(700);
  const chem = JSON.parse(await js(`(function(){
    const rows=[...document.querySelectorAll('#chapterTable tbody tr')];
    return JSON.stringify({
      soft: rows.filter(function(r){return !!r.querySelector('.ci-soft');}).length,
      exams: rows.slice(0,3).map(function(r){ const t=r.querySelector('.ci'); const cell=t?t.parentElement:null;
        const m=cell?cell.querySelector('.muted'):null; return m?m.textContent:''; }),
    });})()`));
  check(chem.soft >= 1, 'برای درسِ کم‌داده، برچسب «دادهٔ محدود» نمایش داده می‌شود', String(chem.soft));
  check(chem.exams.some((t) => /آزمون/.test(t)), 'تعداد آزمون‌های مستقل کنار عدد می‌آید', JSON.stringify(chem.exams.slice(0, 2)));

  /* راهنمای «؟» سرِ کارت */
  const help = await js(`(function(){
    const c=document.getElementById('chapterCard');
    const q=c?c.querySelector('.qmark'):null;
    return q?q.getAttribute('title'):'';})()`);
  check(/ضریب/.test(help) && /بودجه/.test(help), 'راهنمای «؟» روش محاسبه (بودجه × ضریب) را می‌گوید', (help || '').slice(0, 80));

  /* اسکرین‌شات مستندات */
  await js(`(function(){const c=document.getElementById('chapterCard'); if(c&&c.scrollIntoView) c.scrollIntoView({block:'start'}); return true;})()`);
  await wait(600);
  fs.writeFileSync(path.join(__dirname, '..', 'docs', 'screens', 'ui-60-exam-evidence-importance.png'),
    (await win.webContents.capturePage()).toPNG());

  check(errs.length === 0, 'هیچ خطای جاوااسکریپت در کنسول نیست', errs.slice(0, 2).join(' | '));
  console.log(`\n${fail ? '❌' : '✅'} ${pass} بررسی «اهمیت واقعیِ آزمون‌محور» ${fail ? 'با ' + fail + ' خطا' : 'پاس شد'}\n`);
  win.destroy();
  app.exit(fail ? 1 : 0);
});
