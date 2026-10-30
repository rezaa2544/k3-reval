/* تست ترتیب بخش‌ها در قدم «دروس و تسلط» (نسخهٔ ۲.۸.۵)
   «ارزیابی فصل به فصل» باید پیش از «دروس اختصاصی و ضرایب» و «دروس عمومی» باشد،
   چون مهم‌ترین ورودی برنامه است. */
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

  /* ترتیب واقعی در DOM */
  const order = JSON.parse(await js(`(function(){
    const view = document.getElementById('view-step-4');
    const titles = [...view.querySelectorAll('.card > h2')].map(function(h){ return h.textContent.replace(/\\s+/g,' ').trim(); });
    const cards = [...view.querySelectorAll('.card')].map(function(c){ return c.id || (c.querySelector('h2')||{}).textContent || ''; });
    const a = view.querySelector('#assessCard'), b = view.querySelector('#subjects'), g = view.querySelector('#general');
    const pos = function(el){ let i=0, n=el; while(n){ if(n.previousElementSibling) i++; n = n.previousElementSibling; } return i; };
    return JSON.stringify({ titles: titles, cards: cards,
      assessBeforeSubjects: !!(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING),
      assessBeforeGeneral: !!(a.compareDocumentPosition(g) & Node.DOCUMENT_POSITION_FOLLOWING) });
  })()`));

  check(order.titles.length >= 3, 'کارت‌های قدم ۴ رندر می‌شوند', JSON.stringify(order.titles));
  check(/ارزیابی فصل به فصل/.test(order.titles[0] || ''), 'اولین کارت «ارزیابی فصل به فصل» است', JSON.stringify(order.titles));
  check(/دروس اختصاصی/.test(order.titles[1] || ''), 'کارت «دروس اختصاصی و ضرایب» بعد از ارزیابی می‌آید', JSON.stringify(order.titles));
  check(/دروس عمومی/.test(order.titles[2] || ''), 'کارت «دروس عمومی» بعد از آن‌هاست', JSON.stringify(order.titles));
  check(order.assessBeforeSubjects === true, 'در DOM، ارزیابی قبل از جدول دروس اختصاصی است', String(order.assessBeforeSubjects));
  check(order.assessBeforeGeneral === true, 'در DOM، ارزیابی قبل از جدول عمومی‌هاست', String(order.assessBeforeGeneral));

  /* بالای صفحه واقعاً ارزیابی دیده شود و فهرست فصل‌ها باز باشد */
  await js(`(function(){const n=document.querySelector('.nav[data-view="step-4"]'); if(n) n.click(); return true;})()`);
  await wait(700);
  const topText = await js(`(function(){
    const view = document.getElementById('view-step-4');
    const y = view.getBoundingClientRect().top;
    const a = document.getElementById('assessCard').getBoundingClientRect().top - y;
    const b = document.getElementById('subjects').getBoundingClientRect().top - y;
    return JSON.stringify({ assessTop: Math.round(a), subjectsTop: Math.round(b) });
  })()`);
  const T = JSON.parse(topText);
  check(T.assessTop < T.subjectsTop, 'از نظر مختصات صفحه هم ارزیابی بالاتر از جدول دروس است', topText);

  /* ارزیابی همچنان کار می‌کند */
  await js(`(function(){const c=document.querySelector('[data-sid="bio"]'); const b=c&&c.querySelector('[data-toggle]'); if(b) b.click(); return true;})()`);
  await wait(600);
  const rows = await js(`document.querySelectorAll('[data-sid="bio"] tbody tr').length`);
  check(rows > 5, 'فهرست فصل‌های زیست پس از جابه‌جایی باز می‌شود', String(rows));
  const imp = await js(`document.querySelectorAll('[data-sid="bio"] .cmeta').length`);
  check(imp === rows, 'ستون اهمیت/سهم در همهٔ سطرها هست', imp + '/' + rows);

  /* اسکرین‌شات بالای قدم ۴ */
  await js(`(function(){const sc=document.getElementById('mainScroll'); if(sc) sc.scrollTop=0; return true;})()`);
  await wait(500);
  fs.writeFileSync(path.join(__dirname, '..', 'docs', 'screens', 'ui-52-assessment-first.png'),
    (await win.webContents.capturePage()).toPNG());

  check(errs.length === 0, 'هیچ خطای جاوااسکریپت در کنسول نیست', errs.slice(0, 2).join(' | '));
  console.log(`\n${fail ? '❌' : '✅'} ${pass} بررسی ترتیب بخش‌ها ${fail ? 'با ' + fail + ' خطا' : 'پاس شد'}\n`);
  win.destroy();
  app.exit(fail ? 1 : 0);
});
