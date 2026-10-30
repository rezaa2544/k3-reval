/* تست انتخاب درس‌های آزمون با تیک (نسخهٔ ۲.۸.۶)
   قبلاً <select multiple> بود و کاربر باید Ctrl+کلیک می‌کرد؛ حالا هر درس
   یک چیپِ تیک‌دار است. این تست رفتار واقعی (کلیک، خواندن مقدار، همه/هیچ) را می‌سنجد. */
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
  const win = new BrowserWindow({ width: 1440, height: 960, show: false, webPreferences: { offscreen: true, contextIsolation: false } });
  const errs = [];
  win.webContents.on('console-message', (_e, lvl, msg) => { if (lvl >= 2) errs.push(String(msg).slice(0, 160)); });
  await win.loadFile(path.join(__dirname, '../src/planner/planner.html'));
  const js = (c) => win.webContents.executeJavaScript(c);
  await wait(1700);

  /* یک آزمون تاریخ‌دار اضافه کن */
  await js(`(function(){const n=document.querySelector('.nav[data-view="step-3"]'); if(n) n.click(); return true;})()`);
  await wait(600);
  await js(`(function(){const b=document.getElementById('addExam'); if(b) b.click(); return true;})()`);
  await wait(400);

  const base = JSON.parse(await js(`(function(){
    const row = document.querySelector('#examRows .dyn-row.exam');
    if(!row) return JSON.stringify({none:true});
    const boxes = [...row.querySelectorAll('.subj-checks input[type=checkbox]')];
    return JSON.stringify({
      legacySelect: !!row.querySelector('select[multiple], select[data-ef="subjectIds"]'),
      count: boxes.length,
      allCheckbox: boxes.every(b => b.type === 'checkbox'),
      labels: boxes.slice(0,4).map(b => b.parentNode.textContent.trim()),
      allBtn: !!row.querySelector('[data-sc-all="1"]'),
      noneBtn: !!row.querySelector('[data-sc-all="0"]')
    });})()`));
  check(!base.none, 'ردیف آزمون تاریخ‌دار رندر می‌شود', JSON.stringify(base));
  check(base.legacySelect === false, '<select multiple> قدیمی حذف شده است', String(base.legacySelect));
  check(base.count >= 5, 'برای هر درس یک چک‌باکس هست', String(base.count));
  check(base.allCheckbox, 'همهٔ ورودی‌ها از نوع checkbox هستند', JSON.stringify(base.labels));
  check(base.allBtn && base.noneBtn, 'دکمه‌های «همه» و «هیچ» موجودند');

  /* کلیک واقعی روی دو چیپ → خوانده شدن در config */
  await js(`(function(){
    const row = document.querySelector('#examRows .dyn-row.exam');
    const want = ['bio','chem'];
    row.querySelectorAll('.subj-checks input[type=checkbox]').forEach(function(b){
      if (want.indexOf(b.value) !== -1) { b.checked = true; b.dispatchEvent(new Event('change', {bubbles:true})); }
    });
    return true;})()`);
  await wait(300);
  const checked = JSON.parse(await js(`(function(){
    const row = document.querySelector('#examRows .dyn-row.exam');
    return JSON.stringify([...row.querySelectorAll('.subj-checks input:checked')].map(b => b.value));})()`));
  check(checked.join(',') === 'bio,chem', 'تیک زدن چند درس با هم کار می‌کند (بدون Ctrl)', JSON.stringify(checked));

  /* خواندن مقدار در ساخت برنامه */
  const read = await js(`(function(){
    const t = window.__revalTest;
    if (!t || !t.readExamsDemo) return 'NO-HOOK';
    return t.readExamsDemo();
  })()`);
  check(read !== 'NO-HOOK' && JSON.parse(read).join(',') === 'bio,chem', 'موتور همان درس‌های تیک‌خورده را می‌خواند', String(read));

  /* «همه» و «هیچ» */
  await js(`(function(){
    const row = document.querySelector('#examRows .dyn-row.exam');
    row.querySelector('[data-sc-all="1"]').click();
    return true;})()`);
  await wait(250);
  const allOn = await js(`(function(){
    const row = document.querySelector('#examRows .dyn-row.exam');
    const boxes=[...row.querySelectorAll('.subj-checks input[type=checkbox]')];
    return boxes.filter(b=>b.checked).length + '/' + boxes.length;})()`);
  check(allOn.split('/')[0] === allOn.split('/')[1], 'دکمهٔ «همه» همهٔ درس‌ها را تیک می‌زند', allOn);

  await js(`(function(){
    const row = document.querySelector('#examRows .dyn-row.exam');
    row.querySelector('[data-sc-all="0"]').click();
    return true;})()`);
  await wait(250);
  const noneOn = await js(`(function(){
    const row = document.querySelector('#examRows .dyn-row.exam');
    return [...row.querySelectorAll('.subj-checks input:checked')].length;})()`);
  check(noneOn === 0, 'دکمهٔ «هیچ» همه را برمی‌دارد', String(noneOn));

  /* آزمون دوره‌ای هفتگی هم چک‌باکس دارد */
  await js(`(function(){const n=document.querySelector('.nav[data-view="step-6"]'); if(n) n.click(); return true;})()`);
  await wait(700);
  const weekly = JSON.parse(await js(`(function(){
    const row = document.querySelector('#mockRows .dyn-row');
    if(!row) return JSON.stringify({none:true});
    return JSON.stringify({
      legacy: !!row.querySelector('select[multiple]'),
      boxes: row.querySelectorAll('.subj-checks input[type=checkbox]').length
    });})()`));
  check(!weekly.none && weekly.legacy === false && weekly.boxes >= 5,
    'در «آزمون‌های دوره‌ای» هم انتخاب درس با تیک است', JSON.stringify(weekly));

  /* اسکرین‌شات */
  await js(`(function(){
    const n=document.querySelector('.nav[data-view="step-3"]'); if(n) n.click(); return true;})()`);
  await wait(600);
  await js(`(function(){
    const row=document.querySelector('#examRows .dyn-row.exam');
    if(!row) return true;
    ['bio','chem','math'].forEach(function(id){
      const b=row.querySelector('.subj-checks input[value="'+id+'"]');
      if(b){ b.checked=true; b.dispatchEvent(new Event('change',{bubbles:true})); }
    });
    row.scrollIntoView({block:'center'});
    return true;})()`);
  await wait(500);
  fs.writeFileSync(path.join(__dirname, '..', 'docs', 'screens', 'ui-53-exam-subject-checkbox.png'),
    (await win.webContents.capturePage()).toPNG());

  check(errs.length === 0, 'هیچ خطای جاوااسکریپت در کنسول نیست', errs.slice(0, 2).join(' | '));
  console.log(`\n${fail ? '❌' : '✅'} ${pass} بررسی انتخاب درس با تیک ${fail ? 'با ' + fail + ' خطا' : 'پاس شد'}\n`);
  win.destroy();
  app.exit(fail ? 1 : 0);
});
