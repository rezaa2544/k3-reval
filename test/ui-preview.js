/* پیش‌نمایش سریع رابط جدید (Electron + xvfb) */
const { app, BrowserWindow } = require('electron');
const path = require('path');
const fs = require('fs');

const OUT = '/home/user/k3-reval/docs/screens';
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
  await wait(1600);

  const shot = async (name) => {
    const img = await win.webContents.capturePage();
    fs.writeFileSync(path.join(OUT, name), img.toPNG());
    console.log('shot →', name);
  };
  const js = (c) => win.webContents.executeJavaScript(c);

  await shot('ui-01-home-empty.png');

  // پر کردن فرم
  await js(`(function(){
    document.getElementById('name').value = 'سارا محمدی';
    document.querySelectorAll('[data-avail]').forEach((el) => { el.value = 4; el.dispatchEvent(new Event('change', {bubbles:true})); });
    document.getElementById('field').value='tajrobi';
    document.getElementById('field').dispatchEvent(new Event('change',{bubbles:true}));
    return true;
  })()`);
  await wait(600);
  await shot('ui-02-home-filled.png');

  await js(`document.querySelector('.nav[data-view="step-1"]').click(), true`);
  await wait(500);
  await shot('ui-03-step1.png');

  await js(`document.querySelector('.nav[data-view="step-2"]').click(), true`);
  await wait(500);
  await shot('ui-04-step2.png');

  await js(`document.querySelector('.nav[data-view="step-3"]').click(), true`);
  await wait(600);
  await shot('ui-04b-step3.png');

  await js(`document.querySelector('.nav[data-view="step-4"]').click(), true`);
  await wait(600);
  await shot('ui-05-step4.png');

  await js(`document.querySelector('.nav[data-view="step-6"]').click(), true`);
  await wait(900);
  await shot('ui-06-step6.png');

  // ساخت برنامه
  await js(`document.querySelectorAll('#view-step-6 details.adv').forEach((d) => { d.open = true; }), true`);
  await wait(500);
  await shot('ui-06b-step6-open.png');
  await js(`document.querySelectorAll('#view-step-6 details.adv').forEach((d) => { d.open = false; }), true`);

  await js(`document.getElementById('build').click(), true`);
  await wait(3500);
  await shot('ui-07-plan.png');

  await js(`document.querySelector('.nav[data-view="report"]').click(), true`);
  await wait(900);
  await shot('ui-08-report.png');

  await js(`document.querySelector('.nav[data-view="home"]').click(), true`);
  await wait(700);
  await shot('ui-09-home-built.png');

  win.destroy();
  app.quit();
});
