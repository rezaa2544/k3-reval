/* اسکرین‌شات‌های نسخهٔ ۲.۷: کارت بلوک با اهداف و اهمیت درصدی، رنگ‌بندی وضعیت، انتخاب کشویی ساعت */
const { app, BrowserWindow } = require('electron');
const path = require('path');
const fs = require('fs');
const OUT = path.join(__dirname, '..', 'docs', 'screens');
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
app.commandLine.appendSwitch('disable-gpu');
app.commandLine.appendSwitch('disable-software-rasterizer');
app.commandLine.appendSwitch('disable-dev-shm-usage');
app.disableHardwareAcceleration();

app.whenReady().then(async () => {
  const win = new BrowserWindow({ width: 1280, height: 1040, show: false, webPreferences: { offscreen: true, contextIsolation: false } });
  await win.loadFile(path.join(__dirname, '../src/planner/planner.html'));
  await win.webContents.executeJavaScript('localStorage.clear()');
  win.reload(); await wait(1500);
  const js = (c) => win.webContents.executeJavaScript(c);
  const shot = async (n) => { fs.writeFileSync(path.join(OUT, n), (await win.webContents.capturePage()).toPNG()); console.log('shot →', n); };

  /* ساعت ثابت ۰۹:۰۰ */
  await js(`(function(){const Real=Date;const f=new Real();f.setHours(9,0,0,0);const OFF=f.getTime()-Real.now();
    function F(a,b,c,d,e,g,h){if(!arguments.length)return new Real(Real.now()+OFF);if(arguments.length===1)return new Real(a);return new Real(a,b,c==null?1:c,d||0,e||0,g||0,h||0);}
    F.prototype=Real.prototype;F.now=()=>Real.now()+OFF;F.parse=Real.parse;F.UTC=Real.UTC;window.Date=F;return true;})()`);
  await js(`(function(){const sel=document.getElementById('restDay');const p=(new Date().getDay()+1)%7;
    sel.value=String((p+4)%7); sel.dispatchEvent(new Event('change',{bubbles:true})); return 1;})()`);
  await js(`document.getElementById('build').click(), true`);
  await wait(5200);
  await js(`document.querySelector('.nav[data-view="home"]').click(), true`);
  await wait(700);

  /* ۱) شروع روز و شروع خودکار اولین تسک */
  await js(`document.getElementById('startDayBtn').click(), true`);
  await wait(4800);
  await js(`document.getElementById('homeTodayCard').scrollIntoView({block:'start'}), true`);
  await wait(500);
  await shot('ui-36-block-goals-and-live.png');

  /* ۲) بستن یک بلوک (سبز + تیک) و دیدن رنگ‌ها */
  await js(`(function(){const b=[...document.querySelectorAll('#homeTodayList [data-tmr="close"]')].pop(); if(b)b.click(); return true;})()`);
  await wait(600);
  await js(`document.getElementById('modalOk').click(), true`);
  await wait(1200);
  await js(`document.getElementById('homeTodayCard').scrollIntoView({block:'start'}), true`);
  await wait(500);
  await shot('ui-37-status-colors.png');

  /* ۳) انتخاب ساعت کشویی در تنظیمات */
  await js(`document.querySelector('.nav[data-view="step-2"]').click(), true`);
  await wait(900);
  await js(`document.getElementById('startTimes').scrollIntoView({block:'center'}), true`);
  await wait(500);
  await shot('ui-38-time-dropdowns.png');

  /* ۴) نمای «برنامهٔ من» با اهداف کامل */
  await js(`document.querySelector('.nav[data-view="plan"]').click(), true`);
  await wait(500);
  await js(`window.__revalTest.openToday(), true`);
  await wait(900);
  await js(`document.getElementById('dayView').scrollIntoView({block:'start'}), true`);
  await wait(500);
  await shot('ui-39-plan-goals.png');

  /* ۵) پنجرهٔ «چه چیزی در این به‌روزرسانی عوض شد» (پس از به‌روزرسانی خودکار) */
  await js(`document.getElementById('verChip') && document.getElementById('verChip').scrollIntoView({block:'center'}), true`);
  const clDir = await js(`(function(){const e=window.__revalTest.changelogEntries('2.6.0'); window.__revalTest.showChangelog('2.6.0'); return e;})()`);
  console.log('changelog entries →', JSON.stringify(clDir));
  await wait(700);
  await shot('ui-40-changelog-modal.png');
  const closed = await js(`(function(){document.getElementById('clOk').click(); return !document.getElementById('clModal').classList.contains('show');})()`);
  console.log('changelog closed →', closed);

  /* ۶) نوار اسکرول در سمت راست */
  await js(`document.querySelector('.nav[data-view="plan"]').click(), true`);
  await wait(700);
  const side = await js('window.__revalTest.scrollSide()');
  console.log('scroll side →', JSON.stringify(side));
  await shot('ui-41-scrollbar-right.png');

  win.destroy(); app.quit();
});
