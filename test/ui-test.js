const { app, BrowserWindow } = require('electron');
const path = require('path');
const fs = require('fs');

app.whenReady().then(async () => {
  const win = new BrowserWindow({ width: 1240, height: 900, show: true, backgroundColor: '#0a0f1a' });
  const errors = [];
  win.webContents.on('console-message', (_e, level, msg) => { if (level >= 2) errors.push(msg); });
  await win.loadFile(path.join(__dirname, '..', 'src', 'planner', 'planner.html'));
  await new Promise(r => setTimeout(r, 700));

  // پر کردن: نام + دو کلاس + یک آزمون
  const setup = await win.webContents.executeJavaScript(`(() => {
    document.getElementById('name').value = 'آرمان';
    document.getElementById('chronotype').value = 'morning';
    document.getElementById('addClass').click();
    document.getElementById('addClass').click();
    const rows = document.querySelectorAll('#classRows .dyn-row');
    rows[0].querySelector('[data-cf="title"]').value = 'کلاس زیست';
    rows[0].querySelector('[data-cf="subjectId"]').value = 'bio';
    rows[0].querySelector('[data-cf="weekday"]').value = '1';
    rows[0].querySelector('[data-cf="start"]').value = '18:00';
    rows[0].querySelector('[data-cf="end"]').value = '20:00';
    rows[1].querySelector('[data-cf="title"]').value = 'کلاس شیمی';
    rows[1].querySelector('[data-cf="subjectId"]').value = 'chem';
    rows[1].querySelector('[data-cf="weekday"]').value = '3';
    rows[1].querySelector('[data-cf="start"]').value = '17:00';
    rows[1].querySelector('[data-cf="end"]').value = '19:00';
    document.getElementById('addExam').click();
    const ex = document.querySelector('#examRows .dyn-row');
    ex.querySelector('[data-ef="title"]').value = 'آزمون قلم‌چی';
    const d = new Date(); d.setDate(d.getDate() + 16);
    const pad = n => String(n).padStart(2, '0');
    ex.querySelector('[data-ef="date"]').value = d.getFullYear()+'-'+pad(d.getMonth()+1)+'-'+pad(d.getDate());
    ex.querySelector('[data-ef="start"]').value = '08:00';
    ex.querySelector('[data-ef="end"]').value = '11:30';
    return {classes: rows.length, exams: document.querySelectorAll('#examRows .dyn-row').length};
  })()`);
  console.log('SETUP', JSON.stringify(setup));

  await win.webContents.executeJavaScript(`document.getElementById('build').click()`);
  await new Promise(r => setTimeout(r, 1600));

  const info = await win.webContents.executeJavaScript(`JSON.stringify({
    visible: document.getElementById('planBody').style.display,
    stats: document.getElementById('stats').innerText.replace(/\\s+/g,' ').slice(0,160),
    pills: document.querySelectorAll('#dayPills .day-pill').length,
    events: document.querySelectorAll('#dayView .evt').length,
    blocks: document.querySelectorAll('#dayView .block').length,
    firstEvent: (document.querySelector('#dayView .evt')||{}).innerText,
    notes: document.querySelectorAll('#coachNotes li').length,
  })`);
  console.log('PLAN', info);

  // پیدا کردن یک روز کلاس‌دار و یک روز پیش‌آزمون
  const probe = await win.webContents.executeJavaScript(`(() => {
    const tabs = ['setup','plan'];
    // هفته‌ها را بگرد تا روزی با رویداد کلاس پیدا شود
    let found = null;
    for (let w=0; w<4 && !found; w++) {
      document.getElementById('nextWeek').click();
      const pills = [...document.querySelectorAll('#dayPills .day-pill')];
      for (const p of pills) {
        p.click();
        if (document.querySelector('#dayView .evt')) { found = document.querySelector('#dayView').innerText.slice(0,200); break; }
      }
    }
    return found;
  })()`);
  console.log('CLASS_DAY', JSON.stringify(probe));
  const img = await win.webContents.capturePage();
  fs.writeFileSync('/tmp/planner-v2.png', img.toPNG());

  // تب تنظیمات برای اسکرین‌شات فرم
  await win.webContents.executeJavaScript(`document.querySelector('.tab[data-view="setup"]').click()`);
  await new Promise(r => setTimeout(r, 300));
  const img2 = await win.webContents.capturePage();
  fs.writeFileSync('/tmp/planner-v2-setup.png', img2.toPNG());

  console.log('CONSOLE_ERRORS', JSON.stringify(errors.slice(0, 4)));
  app.exit(0);
});
