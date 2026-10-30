/* تست «فصل و عنوان» در ارزیابی فصل‌به‌فصل (نسخهٔ ۲.۸.۲)
   - هر سطر باید هم شمارهٔ فصل را نشان دهد، هم عنوان واقعی کتاب را
   - سطرهایی که از نسخه‌های قدیمی بدون عنوان ذخیره شده‌اند، خودکار پر می‌شوند */
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
  const win = new BrowserWindow({ width: 1400, height: 950, show: false, webPreferences: { offscreen: true, contextIsolation: false } });
  const errs = [];
  win.webContents.on('console-message', (_e, lvl, msg) => { if (lvl >= 2) errs.push(String(msg).slice(0, 160)); });
  await win.loadFile(path.join(__dirname, '../src/planner/planner.html'));
  const js = (c) => win.webContents.executeJavaScript(c);
  await wait(1600);

  /* کارت ریاضی را باز کن */
  await js(`(function(){const c=document.querySelector('[data-sid="math"]'); const b=c&&c.querySelector('[data-toggle]'); if(b) b.click(); return true;})()`);
  await wait(500);

  const rows = JSON.parse(await js(`(function(){
    const trs=[...document.querySelectorAll('[data-sid="math"] tbody tr')];
    return JSON.stringify(trs.slice(0,4).map(tr=>({
      badge: (tr.querySelector('.cn-badge')||{}).textContent || '',
      grade: (tr.querySelector('.cn-grade')||{}).textContent || '',
      value: (tr.querySelector('input[data-cf=name]')||{}).value || '',
      ph: (tr.querySelector('input[data-cf=name]')||{}).placeholder || ''
    })));})()`));
  check(rows.length === 4, 'سطرهای فصل رندر می‌شوند', String(rows.length));
  check(/^فصل [۰-۹]+$/.test(rows[0].badge), 'شمارهٔ فصل در نشان کنار سطر هست', rows[0].badge);
  check(rows[0].badge === 'فصل ۱' && rows[1].badge === 'فصل ۲', 'شمارهٔ فصل‌ها به ترتیب است', JSON.stringify(rows.map((r) => r.badge)));
  check(rows.every((r) => r.value && r.value.trim().length > 2), 'عنوان واقعی فصل در هر سطر نوشته شده', JSON.stringify(rows.map((r) => r.value)));
  check(rows.every((r) => r.value !== r.badge), 'عنوان با شمارهٔ فصل یکی نیست', JSON.stringify(rows.map((r) => r.value)));
  check(/مثلثات|الگو و دنباله|توان/.test(rows.map((r) => r.value).join(' ')), 'عنوان‌ها همان سرفصل‌های کتاب ریاضی هستند', rows[0].value);
  check(rows.every((r) => /دهم|یازدهم|دوازدهم/.test(r.value)), 'پایهٔ هر فصل در عنوانش دیده می‌شود', rows[0].value);

  /* عمومی: «درس» به‌جای «فصل» */
  await js(`(function(){const c=document.querySelector('[data-sid="en3"]'); const b=c&&c.querySelector('[data-toggle]'); if(b) b.click(); return true;})()`);
  await wait(400);
  const g = JSON.parse(await js(`(function(){const tr=document.querySelector('[data-sid="en3"] tbody tr');
    return JSON.stringify({badge:(tr.querySelector('.cn-badge')||{}).textContent, value:(tr.querySelector('input[data-cf=name]')||{}).value});})()`));
  check(/^درس [۰-۹]+$/.test(g.badge || g.value || ''), 'برای درس عمومی، «درس N» نشان داده می‌شود', String(g.badge || g.value));
  check(!!g.value, 'عنوان درس عمومی هم نوشته شده', String(g.value));

  /* رفع خودکار سطرهای بدون عنوان (شبیه‌سازی دادهٔ ذخیره‌شدهٔ نسخه‌های قدیمی) */
  const repaired = await js(`(function(){
    const test = window.__revalTest;
    if (!test || !test.repairDemo) return 'NO-HOOK';
    return test.repairDemo();
  })()`);
  if (repaired === 'NO-HOOK') {
    check(false, 'هوک تست برای بازسازی سطرهای بدون عنوان موجود است');
  } else {
    const R = JSON.parse(repaired);
    check(R.before.some((x) => !x) && R.before.some((x) => /^فصل [۰-۹]+$/.test(x)),
      'دادهٔ قدیمی شامل سطرهای بدون عنوان و عنوان‌های تکراریِ شماره‌دار بود', JSON.stringify(R.before));
    check(R.after.every((x) => x && x.trim().length > 2), 'عنوان همهٔ سطرها خودکار پر شد', JSON.stringify(R.after));
    check(R.after[0] !== R.after[1], 'عنوان‌ها تکراری نیستند', JSON.stringify(R.after));
  }

  /* سرصفحهٔ ستون */
  const th = await js(`(function(){const t=document.querySelector('[data-sid="math"] thead th'); return t?t.textContent.trim():'';})()`);
  check(/فصل و عنوان/.test(th), 'سرصفحهٔ ستون «فصل و عنوان» است', th);

  /* جای‌نگهدار برای سطر خالی */
  check(!!rows[0].ph && rows[0].ph.length > 2, 'ورودی عنوان، جای‌نگهدار راهنما دارد (عنوان رسمی کتاب)', rows[0].ph.slice(0, 40));

  /* اسکرین‌شات: رفتن به نمای «دروس و تسلط» و اسکرول تا بخش ارزیابی */
  await js(`(function(){const n=document.querySelector('.nav[data-view="step-4"]'); if(n) n.click(); return true;})()`);
  await wait(700);
  await js(`(function(){
    const box=document.getElementById('assessment'); const sc=document.getElementById('mainScroll');
    if(box && sc){ sc.scrollTop = Math.max(0, box.getBoundingClientRect().top + sc.scrollTop - sc.getBoundingClientRect().top - 8); }
    return true;})()`);
  await wait(600);
  fs.writeFileSync(path.join(__dirname, '..', 'docs', 'screens', 'ui-48-chapter-name-and-number.png'),
    (await win.webContents.capturePage()).toPNG());

  check(errs.length === 0, 'هیچ خطای جاوااسکریپت در کنسول نیست', errs.slice(0, 2).join(' | '));
  console.log(`\n${fail ? '❌' : '✅'} ${pass} بررسی «فصل و عنوان» ${fail ? 'با ' + fail + ' خطا' : 'پاس شد'}\n`);
  win.destroy();
  app.exit(fail ? 1 : 0);
});
