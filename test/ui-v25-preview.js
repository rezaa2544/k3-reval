/* پیش‌نمایش نسخهٔ ۲.۵: شروع روز، تایمر/مکس، آیتم اضطراری، اهمیت فصل، آمادگی جدا */
const { app, BrowserWindow } = require('electron');
const path = require('path');
const fs = require('fs');

const OUT = path.join(__dirname, '..', 'docs', 'screens');
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
app.commandLine.appendSwitch('disable-gpu');
app.disableHardwareAcceleration();

app.whenReady().then(async () => {
  const win = new BrowserWindow({
    width: 1280, height: 980, show: false,
    webPreferences: { offscreen: true, contextIsolation: false, nodeIntegration: false },
  });
  win.webContents.on('console-message', (_e, level, msg) => { if (level >= 2) console.log('CONSOLE:', msg); });
  await win.loadFile(path.join(__dirname, '../src/planner/planner.html'));
  await win.webContents.executeJavaScript('localStorage.clear()');
  win.reload();
  await wait(1500);

  const shot = async (name) => {
    const img = await win.webContents.capturePage();
    fs.writeFileSync(path.join(OUT, name), img.toPNG());
    console.log('shot →', name);
  };
  const js = (c) => win.webContents.executeJavaScript(c);

  /* ۱) ساخت برنامه با ساعت‌های واقعی (روز استراحت = جمعه تا امروز/پنجشنبه بلوک داشته باشد) */
  await js(`(function(){
    const r = document.getElementById('restDay'); if (r) { r.value = '6'; r.dispatchEvent(new Event('change',{bubbles:true})); }
    return true;
  })()`);
  await wait(300);
  await js(`document.getElementById('build').click(), true`);
  await wait(4500);
  const span0 = await js(`(function(){
    const b = document.querySelectorAll('#homeTodayList .block .time');
    return b.length ? (b[0].textContent + ' … ' + b[b.length-1].textContent) : 'خالی';
  })()`);
  console.log('بازهٔ امروز پیش از شروع روز:', span0);

  /* ۲) خانه: کارت «شروع روز» + آیتم اضطراری */
  await js(`document.querySelector('.nav[data-view="home"]').click(), true`);
  await wait(800);
  await js(`document.getElementById('homeDayCard').scrollIntoView({block:'start'}), true`);
  await wait(400);
  await shot('ui-17-start-day.png');

  /* ۳) فشار دکمهٔ شروع روز از ساعت ۱۱:۰۰ */
  const started = await js(`(function(){
    const t = document.getElementById('startDayTime');
    t.value = '۱۱:۰۰';
    t.dispatchEvent(new Event('input', {bubbles:true}));
    document.getElementById('startDayBtn').click();
    return t.value;
  })()`);
  await wait(4500);
  const afterStart = await js(`(function(){
    const p = window.__revalDebug;
    return { note: (document.getElementById('dayStateNote')||{}).textContent || '',
             firstBlock: (function(){
               const d = (window.__revalPlanDays||[]);
               return null;
             })() };
  })()`);
  console.log('startDay:', started, JSON.stringify(afterStart && afterStart.note).slice(0, 200));
  await js(`document.getElementById('homeDayCard').scrollIntoView({block:'start'}), true`);
  await wait(400);
  const span1 = await js(`(function(){
    const b = document.querySelectorAll('#homeTodayList .block .time');
    return b.length ? (b[0].textContent + ' … ' + b[b.length-1].textContent) : 'خالی';
  })()`);
  console.log('بازهٔ امروز بعد از شروع روز:', span1);
  await shot('ui-18-day-replanned.png');

  /* ۴) تایمر یک بلوک: شروع → مکس → ادامه */
  const tmr = await js(`(function(){
    const b = document.querySelector('#homeTodayList [data-tmr="start"]');
    if (!b) return null;
    b.click();
    return true;
  })()`);
  await wait(1200);
  const paused = await js(`(function(){
    const b = document.querySelector('#homeTodayList [data-tmr="pause"]');
    if (!b) return null;
    b.click();
    return true;
  })()`);
  await wait(800);
  const resumed = await js(`(function(){
    const b = document.querySelector('#homeTodayList [data-tmr="resume"]');
    if (!b) return null;
    b.click();
    return true;
  })()`);
  await wait(700);
  console.log('timer start/pause/resume:', tmr, paused, resumed);
  await js(`document.getElementById('homeTodayCard').scrollIntoView({block:'start'}), true`);
  await wait(400);
  await shot('ui-19-block-timer.png');

  /* ۵) آیتم اضطراری */
  await js(`(function(){
    const c = document.getElementById('emergencyCard');
    if (c) c.scrollIntoView({block:'start'});
    const s = document.getElementById('emSubject');
    if (s && s.options.length) { s.selectedIndex = 0; s.dispatchEvent(new Event('change',{bubbles:true})); }
    const t = document.getElementById('emTime'); if (t) t.value = '۱۸:۰۰';
    return true;
  })()`);
  await wait(400);
  await shot('ui-20-emergency-form.png');
  const added = await js(`(function(){
    const b = document.getElementById('emAdd');
    if (!b) return null; b.click(); return true;
  })()`);
  await wait(4500);
  const emInfo = await js(`(function(){
    const el = document.querySelector('#emList .issue .det');
    return el ? el.textContent : null;
  })()`);
  console.log('emergency added:', added, emInfo);
  await js(`document.getElementById('emergencyCard').scrollIntoView({block:'start'}), true`);
  await wait(500);
  await shot('ui-21-emergency-placed.png');

  /* ۶) آمادگی جدا: کنکور و نهایی */
  await js(`document.querySelector('.nav[data-view="plan"]').click(), true`);
  await wait(900);
  await js(`(function(){ const c=document.getElementById('readinessCard'); if (c) c.scrollIntoView({block:'start'}); return true; })()`);
  await wait(500);
  const split = await js(`(function(){
    const box = document.getElementById('readinessSplit');
    return box ? box.textContent.replace(/\\s+/g,' ').slice(0, 220) : null;
  })()`);
  console.log('readiness:', split);
  await shot('ui-22-readiness-split.png');

  /* ۷) اهمیت واقعی فصل‌ها + بارم نهایی */
  await js(`document.querySelector('.nav[data-view="report"]').click(), true`);
  await wait(900);
  await js(`(function(){ const c=document.getElementById('chapterCard'); if (c) c.scrollIntoView({block:'start'}); return true; })()`);
  await wait(500);
  const ci = await js(`(function(){
    const el = document.querySelector('#chapterTable .ci');
    return el ? el.textContent : null;
  })()`);
  console.log('chapter importance badge:', ci);
  await shot('ui-23-chapter-importance.png');
  await js(`(function(){ const c=document.getElementById('finalsReportCard'); if (c) c.scrollIntoView({block:'start'}); return true; })()`);
  await wait(500);
  const baram = await js(`(function(){
    const d = document.querySelector('#finalsReport details summary');
    return d ? d.textContent.replace(/\\s+/g,' ').trim() : null;
  })()`);
  console.log('finals baram:', baram);
  await shot('ui-24-finals-baram.png');

  /* ۸) روال ثابت روز در قدم ۲ */
  await js(`document.querySelector('.nav[data-view="step-2"]').click(), true`);
  await wait(700);
  await js(`(function(){ const c=document.getElementById('routineRows'); if (c) c.scrollIntoView({block:'center'}); return true; })()`);
  await wait(400);
  await shot('ui-25-routine-pinning.png');

  win.destroy();
  app.quit();
});
