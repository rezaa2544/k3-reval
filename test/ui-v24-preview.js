/* پیش‌نمایش نسخهٔ ۲.۴: حالت خودکار، کارت امروز/روزهای آینده، پرش از خطا */
const { app, BrowserWindow } = require('electron');
const path = require('path');
const fs = require('fs');

const OUT = path.join(__dirname, '..', 'docs', 'screens');
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
app.commandLine.appendSwitch('disable-gpu');
app.disableHardwareAcceleration();

app.whenReady().then(async () => {
  const win = new BrowserWindow({
    width: 1280, height: 940, show: false,
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

  /* راهنمای فیلد */
  await js(`document.querySelector('.nav[data-view="step-1"]').click(), true`);
  await wait(400);
  await js(`(function(){
    const h = document.querySelector('#view-step-1 .qmark');
    if (h) { h.dispatchEvent(new MouseEvent('click', {bubbles:true})); }
    return Boolean(h);
  })()`);
  await wait(300);
  await shot('ui-10-help-tooltip.png');

  /* حالت خودکار */
  await js(`document.querySelector('.nav[data-view="step-2"]').click(), true`);
  await wait(400);
  await js(`document.getElementById('modeAuto').click(), true`);
  await wait(300);
  await js(`(function(){
    const c = document.getElementById('dailyCap'); c.value = '۷';
    c.dispatchEvent(new Event('input', {bubbles:true}));
    return c.value;
  })()`);
  await wait(300);
  await shot('ui-11-auto-mode.png');

  /* ساخت برنامه در حالت خودکار */
  await js(`document.getElementById('build').click(), true`);
  await wait(4000);
  const dbg = await js('window.__revalDebug || null');
  console.log('debug:', JSON.stringify(dbg && dbg.summary), 'auto:', JSON.stringify(dbg && dbg.auto && { hours: dbg.auto.chosenHours, cov: dbg.auto.coverage }));
  await shot('ui-12-plan-auto.png');

  /* خانه: امروز + روزهای آینده */
  await js(`document.querySelector('.nav[data-view="home"]').click(), true`);
  await wait(800);
  await js(`document.getElementById('homeTodayCard').scrollIntoView({block:'start'}), true`);
  await wait(500);
  await shot('ui-13-home-today.png');

  /* خطاها: کارت + پرش */
  const info = await js(`(function(){
    const el = document.querySelector('#homeIssues .issue') || document.querySelector('#issueBox .issue');
    return el ? { title: el.querySelector('.ttl').textContent, fix: Boolean(el.querySelector('.fixline')) } : null;
  })()`);
  console.log('first issue:', JSON.stringify(info));
  await shot('ui-14-home-issues.png');
  await js(`(function(){
    const el = document.querySelector('#homeIssues .issue') || document.querySelector('#issueBox .issue');
    if (el) el.click();
    return Boolean(el);
  })()`);
  await wait(900);
  await shot('ui-15-issue-jump.png');

  /* روز آینده از خانه */
  await js(`document.querySelector('.nav[data-view="home"]').click(), true`);
  await wait(600);
  const open = await js(`(function(){
    const b = document.querySelector('#homeAhead [data-open-day]');
    if (!b) return null;
    const txt = b.textContent; b.click(); return txt;
  })()`);
  console.log('ahead day:', open);
  await wait(900);
  await shot('ui-16-ahead-day.png');

  win.destroy();
  app.quit();
});
