/* تست ۲.۸.۶ — فهرست «کتاب» در مهلت‌های کلی باید کتاب‌های عمومی را هم داشته باشد */
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
  const win = new BrowserWindow({ width: 1440, height: 960, show: false, webPreferences: { offscreen: true, contextIsolation: false } });
  const errs = [];
  win.webContents.on('console-message', (_e, lvl, msg) => { if (lvl >= 2) errs.push(String(msg).slice(0, 160)); });
  await win.loadFile(path.join(__dirname, '../src/planner/planner.html'));
  const js = (c) => win.webContents.executeJavaScript(c);
  await wait(1800);

  await js(`(function(){const n=document.querySelector('.nav[data-view="step-6"]'); if(n) n.click(); return true;})()`);
  await wait(700);
  await js(`(function(){const b=document.getElementById('addBookDeadline'); if(b) b.click(); return true;})()`);
  await wait(400);

  const info = JSON.parse(await js(`(function(){
    const row = document.querySelector('#bookDeadlineRows .dyn-row');
    if(!row) return JSON.stringify({none:true});
    const sel = row.querySelector('[data-bd="subjectId"]');
    const opts = [...sel.options];
    return JSON.stringify({
      total: opts.length,
      values: opts.map(o => o.value),
      labels: opts.map(o => o.textContent.trim()),
      groups: [...sel.querySelectorAll('optgroup')].map(g => g.label),
      hasDi3: opts.some(o => o.value === 'di3'),
      hasFa3: opts.some(o => o.value === 'fa3'),
      hasAr3: opts.some(o => o.value === 'ar3'),
      hasBio: opts.some(o => o.value === 'bio')
    });})()`));
  check(!info.none, 'ردیف مهلت کتابی ساخته می‌شود', JSON.stringify(info));
  check(info.hasBio, 'کتاب‌های اختصاصی سرِ جای خود هستند', info.values.join(','));
  check(info.hasDi3 && info.hasFa3 && info.hasAr3,
    'کتاب‌های عمومی (دینی، فارسی، عربی) در فهرست هستند', info.values.join(','));
  const genCount = info.values.filter((v) => ['fa3','ar3','di3','en3','sal3','hovi3'].indexOf(v) !== -1).length;
  check(info.hasBio && genCount >= 5, 'همهٔ کتاب‌های فعال (اختصاصی + عمومی) در یک فهرست‌اند',
    info.total + ' گزینه · عمومی‌ها: ' + genCount);
  check(info.groups.indexOf('اختصاصی') !== -1 && info.groups.indexOf('عمومی') !== -1,
    'فهرست با دو گروه «اختصاصی» و «عمومی» دسته‌بندی شده', info.groups.join('|'));

  /* انتخاب یک کتاب عمومی و خواندن مقدار */
  const read = await js(`(function(){
    const row = document.querySelector('#bookDeadlineRows .dyn-row');
    const sel = row.querySelector('[data-bd="subjectId"]');
    sel.value = 'di3';
    sel.dispatchEvent(new Event('change', {bubbles:true}));
    const t = window.__revalTest;
    if (!t || !t.readBookDeadlinesDemo) return 'NO-HOOK';
    return t.readBookDeadlinesDemo();
  })()`);
  check(read !== 'NO-HOOK' && String(read).indexOf('di3') !== -1, 'انتخاب کتاب عمومی در داده ذخیره می‌شود', String(read));

  /* «مهلت پیشنهادی» هم عمومی‌ها را می‌آورد */
  await js(`(function(){const b=document.getElementById('suggestBookDeadlines'); if(b) b.click(); return true;})()`);
  await wait(500);
  const sug = JSON.parse(await js(`(function(){
    const rows=[...document.querySelectorAll('#bookDeadlineRows .dyn-row')];
    return JSON.stringify(rows.map(r => r.querySelector('[data-bd="subjectId"]').value));})()`));
  check(sug.filter((x) => ['di3','fa3','ar3'].indexOf(x) !== -1).length >= 3,
    'پیشنهاد مهلت شامل کتاب‌های عمومی است', sug.join(','));

  /* اسکرین‌شات با فهرست باز */
  await js(`(function(){
    const rows=[...document.querySelectorAll('#bookDeadlineRows .dyn-row')];
    rows.slice(2).forEach(r => r.remove());
    const box = document.getElementById('bookDeadlineRows');
    const card = box.closest('details') || box.closest('.card') || box.parentNode;
    if (card && card.tagName === 'DETAILS') card.open = true;
    const row = document.querySelector('#bookDeadlineRows .dyn-row');
    const sel = row.querySelector('[data-bd="subjectId"]');
    sel.value='di3'; sel.dispatchEvent(new Event('change',{bubbles:true}));
    const sec = document.getElementById('view-step-6');
    window.scrollTo(0, 0);
    if (sec) sec.scrollTop = 0;
    card.scrollIntoView({block:'center'});
    const t = document.querySelector('.toast'); if (t) t.remove();
    return true;})()`);
  await wait(600);
  fs.writeFileSync(path.join(__dirname, '..', 'docs', 'screens', 'ui-54-book-deadline-general.png'),
    (await win.webContents.capturePage()).toPNG());

  check(errs.length === 0, 'هیچ خطای جاوااسکریپت در کنسول نیست', errs.slice(0, 2).join(' | '));
  console.log(`\n${fail ? '❌' : '✅'} ${pass} بررسی مهلت کتاب‌های عمومی ${fail ? 'با ' + fail + ' خطا' : 'پاس شد'}\n`);
  win.destroy();
  app.exit(fail ? 1 : 0);
});
