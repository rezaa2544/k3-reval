/* تست «درجهٔ اهمیت فصل + درصد از کل کتاب» (نسخهٔ ۲.۸.۴)
   هر سطر ارزیابی باید سه چیز را با هم نشان دهد: شماره/عنوان فصل،
   درجهٔ اهمیت (۱..۵ با برچسب)، و سهم آن فصل از کل کتاب به درصد. */
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
  await wait(1600);

  /* کارت زیست را باز کن */
  await js(`(function(){const c=document.querySelector('[data-sid="bio"]'); const b=c&&c.querySelector('[data-toggle]'); if(b) b.click(); return true;})()`);
  await wait(600);

  const rows = JSON.parse(await js(`(function(){
    const trs=[...document.querySelectorAll('[data-sid="bio"] tbody tr')];
    return JSON.stringify(trs.map(function(tr){
      const c=tr.querySelector('.cmeta');
      const dots=tr.querySelectorAll('.impdots i.on').length;
      const all=tr.querySelectorAll('.impdots i').length;
      const tag=(tr.querySelector('.mtag')||{}).textContent||'';
      const share=(tr.querySelector('.mshare')||{}).textContent||'';
      return { dots: dots, all: all, tag: tag.trim(), share: share.trim(),
        badge: (tr.querySelector('.cn-badge')||{}).textContent||'',
        title: (tr.querySelector('input[data-cf=name]')||{}).value||'',
        tip: c ? c.getAttribute('title') : '' };
    }));})()`));

  check(rows.length >= 8, 'سطرهای فصل رندر می‌شوند', String(rows.length));
  check(rows.every((r) => r.all === 5), 'درجهٔ اهمیت برای هر فصل پنج‌درجه‌ای نمایش داده می‌شود', JSON.stringify(rows[0]));
  check(rows.every((r) => r.dots >= 1 && r.dots <= 5), 'درجهٔ اهمیت بین ۱ تا ۵ است', JSON.stringify(rows.map((r) => r.dots)));
  check(new Set(rows.map((r) => r.dots)).size > 1, 'درجه‌ها یکسان نیستند (تفکیک واقعی فصل‌ها)', JSON.stringify(rows.map((r) => r.dots)));
  check(rows.every((r) => r.tag && r.tag.length > 1), 'برچسب متنی اهمیت (کم‌هزینه/متوسط/پرتکرار/بحرانی) هست', JSON.stringify(rows.slice(0, 3).map((r) => r.tag)));
  check(rows.every((r) => /٪ از کتاب/.test(r.share)), 'درصدِ سهم فصل از کل کتاب نوشته شده', JSON.stringify(rows.slice(0, 3).map((r) => r.share)));
  check(rows.every((r) => /\d|[۰-۹]/.test(r.share)), 'عدد درصد واقعی است، نه صفرِ خالی', JSON.stringify(rows.slice(0, 3).map((r) => r.share)));
  check(rows.every((r) => r.badge && r.title), 'شماره و عنوان فصل هم سرِ جای خود هستند', JSON.stringify(rows[0]));
  check(rows.every((r) => /درجهٔ اهمیت/.test(r.tip || '') && /سهم از کل کتاب/.test(r.tip || '')),
    'راهنمای کامل (اهمیت + سهم + منبع) روی سلول هست', (rows[0].tip || '').slice(0, 60));
  check(/بودجه‌بندی کنکور/.test(rows[0].tip || ''), 'منبع عدد اهمیت ذکر شده', (rows[0].tip || '').slice(0, 80));

  /* درس عمومی: از بارم رسمی نهایی */
  await js(`(function(){const c=document.querySelector('[data-sid="di3"]'); const b=c&&c.querySelector('[data-toggle]'); if(b) b.click(); return true;})()`);
  await wait(500);
  const g = JSON.parse(await js(`(function(){
    const tr=document.querySelector('[data-sid="di3"] tbody tr');
    if(!tr) return 'null';
    return JSON.stringify({ share:(tr.querySelector('.mshare')||{}).textContent, tag:(tr.querySelector('.mtag')||{}).textContent,
      tip: (tr.querySelector('.cmeta')||{getAttribute:function(){return '';}}).getAttribute('title') });})()`));
  check(/٪ از کتاب/.test(g.share || ''), 'برای درس عمومی هم درصد سهم از کتاب آمده', String(g.share));
  check(/بارم رسمی/.test(g.tip || ''), 'منبع درس عمومی «بارم رسمی نهایی» است', (g.tip || '').slice(0, 90));

  /* راهنمای بالای جدول */
  const legend = await js(`(function(){const c=document.querySelector('[data-sid="bio"] .legend-row'); return c?c.textContent.replace(/\\s+/g,' ').trim():'';})()`);
  check(/درجهٔ اهمیت/.test(legend) && /٪ از کتاب/.test(legend), 'راهنمای «اهمیت / درصد از کتاب» بالای جدول هست', legend.slice(0, 100));

  /* سرصفحه */
  const th = await js(`(function(){const t=[...document.querySelectorAll('[data-sid="bio"] thead th')].map(x=>x.textContent.trim()); return JSON.stringify(t);})()`);
  check(/اهمیت/.test(th) && /سهم/.test(th), 'سرصفحهٔ ستون اهمیت/سهم وجود دارد', th);

  /* اسکرین‌شات */
  await js(`(function(){const n=document.querySelector('.nav[data-view="step-4"]'); if(n) n.click(); return true;})()`);
  await wait(700);
  await js(`(function(){const c=document.querySelector('[data-sid="bio"]'); const sc=document.getElementById('mainScroll');
    if(c&&sc){ sc.scrollTop = Math.max(0, c.getBoundingClientRect().top + sc.scrollTop - sc.getBoundingClientRect().top - 8); } return true;})()`);
  await wait(600);
  fs.writeFileSync(path.join(__dirname, '..', 'docs', 'screens', 'ui-51-chapter-importance-share.png'),
    (await win.webContents.capturePage()).toPNG());

  check(errs.length === 0, 'هیچ خطای جاوااسکریپت در کنسول نیست', errs.slice(0, 2).join(' | '));
  console.log(`\n${fail ? '❌' : '✅'} ${pass} بررسی اهمیت و سهم فصل ${fail ? 'با ' + fail + ' خطا' : 'پاس شد'}\n`);
  win.destroy();
  app.exit(fail ? 1 : 0);
});
