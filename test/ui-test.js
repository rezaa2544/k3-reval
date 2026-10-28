const { app, BrowserWindow } = require('electron');
const path = require('path');
const fs = require('fs');

app.whenReady().then(async () => {
  const win = new BrowserWindow({ width: 1180, height: 860, show: true, backgroundColor: '#0a0f1a' });
  const errors = [];
  win.webContents.on('console-message', (_e, level, msg) => { if (level >= 2) errors.push(msg); });
  await win.loadFile(path.join(__dirname, '..', 'src', 'planner', 'planner.html'));
  await new Promise(r => setTimeout(r, 800));

  // پر کردن فرم و ساخت برنامه
  const setup = await win.webContents.executeJavaScript(`(() => {
    document.getElementById('name').value = 'آرمان';
    document.getElementById('chronotype').value = 'morning';
    document.getElementById('name').dispatchEvent(new Event('input', {bubbles:true}));
    return {subjects: document.querySelectorAll('#subjects tbody tr').length};
  })()`);
  console.log('SETUP', JSON.stringify(setup));

  await win.webContents.executeJavaScript(`document.getElementById('build').click()`);
  await new Promise(r => setTimeout(r, 1500));

  const info = await win.webContents.executeJavaScript(`JSON.stringify({
    planVisible: document.getElementById('planBody').style.display,
    stats: document.getElementById('stats').innerText.replace(/\\s+/g,' ').slice(0,120),
    notes: document.querySelectorAll('#coachNotes li').length,
    bars: document.querySelectorAll('#subjectBars .bar').length,
    pills: document.querySelectorAll('#dayPills .day-pill').length,
    blocks: document.querySelectorAll('#dayView .block').length,
    blockText: (document.querySelector('#dayView .block')||{}).innerText,
    activeTab: document.querySelector('.tab.active').dataset.view,
  })`);
  console.log('PLAN', info);

  // توزیع روزانه‌ها (چند هفته) را بررسی کن
  const weeks = await win.webContents.executeJavaScript(`(() => {
    const out = [];
    for (let i=0;i<3;i++){ document.getElementById('nextWeek').click(); out.push(document.getElementById('weekLabel').innerText); }
    return out;
  })()`);
  console.log('WEEKS', JSON.stringify(weeks));

  // تب علم
  await win.webContents.executeJavaScript(`document.querySelector('.tab[data-view="science"]').click()`);
  await new Promise(r => setTimeout(r, 300));
  const img = await win.webContents.capturePage();
  fs.writeFileSync('/tmp/planner-science.png', img.toPNG());

  await win.webContents.executeJavaScript(`document.querySelector('.tab[data-view="plan"]').click()`);
  await new Promise(r => setTimeout(r, 400));
  const img2 = await win.webContents.capturePage();
  fs.writeFileSync('/tmp/planner-plan.png', img2.toPNG());

  await win.webContents.executeJavaScript(`document.querySelector('.tab[data-view="setup"]').click()`);
  await new Promise(r => setTimeout(r, 300));
  const img3 = await win.webContents.capturePage();
  fs.writeFileSync('/tmp/planner-setup.png', img3.toPNG());

  console.log('CONSOLE_ERRORS', JSON.stringify(errors.slice(0, 5)));
  app.exit(0);
});
