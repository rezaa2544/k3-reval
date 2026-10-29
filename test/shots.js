/* گرفتن اسکرین‌شات از رابط واقعی (Electron + xvfb) برای نسخهٔ ۱.۹ */
const { app, BrowserWindow } = require('electron');
const path = require('path');
const fs = require('fs');

const OUT = '/home/user/k3-reval/docs/screens';
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

app.commandLine.appendSwitch('disable-gpu');
app.disableHardwareAcceleration();

app.whenReady().then(async () => {
  const win = new BrowserWindow({
    width: 1280, height: 1000, show: false,
    webPreferences: { offscreen: true, contextIsolation: false, nodeIntegration: false },
  });
  await win.loadFile(path.join(__dirname, '../src/planner/planner.html'));
  /* وضعیت ذخیره‌شدهٔ اجراهای قبلی پاک شود تا اسکرین‌شات‌ها قطعی باشند */
  await win.webContents.executeJavaScript('localStorage.clear()');
  win.reload();
  await wait(1500);

  const shot = async (name) => {
    const img = await win.webContents.capturePage();
    fs.writeFileSync(path.join(OUT, name), img.toPNG());
    console.log('shot →', name);
  };

  // ۱) تنظیمات: بخش سوابق تحصیلی
  await win.webContents.executeJavaScript(`
    (function(){
      document.getElementById('name').value = 'سارا محمدی';
      document.getElementById('field').value = 'tajrobi';
      document.getElementById('grade').value = 'دوازدهم';
      document.querySelectorAll('[data-fin-cur]').forEach((el, i) => {
        el.value = [11, 9.5, 15.75, 17, 14, 12.5, 10, 13, 18, 16][i];
        el.dispatchEvent(new Event('input', { bubbles: true }));
      });
      document.getElementById('finalsCard').scrollIntoView({block:'start'});
      return true;
    })()
  `);
  await wait(500);
  await shot('10-finals-layer.png');

  // ۲) ساخت برنامه + تب برنامه
  await win.webContents.executeJavaScript(`document.getElementById('build').click(); true`);
  await wait(3000);
  await win.webContents.executeJavaScript(`
    (function(){
      document.querySelector('.nav[data-view="plan"]').click();
      document.querySelector('main').scrollTop = 0;
      return true;
    })()
  `);
  await wait(900);
  await shot('11-plan-built.png');

  // ۳) تب گزارش — بالای صفحه
  await win.webContents.executeJavaScript(`
    (function(){
      document.querySelector('.nav[data-view="report"]').click();
      document.querySelector('main').scrollTop = 0;
      return { stats: document.getElementById('reportStats').innerText.slice(0,120),
               books: document.getElementById('bookTable').innerText.slice(0,200) };
    })()
  `).then((r) => console.log('report:', JSON.stringify(r)));
  await wait(900);
  await shot('12-report-overview.png');

  // ۴) جدول فصل‌به‌فصل
  await win.webContents.executeJavaScript(`
    (function(){
      document.querySelector('main').scrollTop = 620;
      return document.getElementById('chapterTable').innerText.slice(0, 300);
    })()
  `).then((r) => console.log('chapters:', r));
  await wait(600);
  await shot('13-report-chapters.png');

  // ۵) گزارش سوابق
  await win.webContents.executeJavaScript(`
    (function(){
      document.getElementById('finalsReportCard').scrollIntoView({block:'center'});
      return document.getElementById('finalsReport').innerText.slice(0,200);
    })()
  `).then((r) => console.log('finals:', r));
  await wait(600);
  await shot('14-report-finals.png');

  // ۶) برنامهٔ روزانه + بازچینش هوشمند
  await win.webContents.executeJavaScript(`
    (function(){
      document.querySelector('.nav[data-view="plan"]').click();
      document.getElementById('carryCount').scrollIntoView({block:'center'});
      return document.getElementById('carryCount').innerText;
    })()
  `).then((r) => console.log('carry:', r));
  await wait(700);
  await shot('15-smart-replan.png');

  // ۷) دو مدل مهلت: مهلت کتابی و مهلت آزمون تک‌درس
  await win.webContents.executeJavaScript(`
    (function(){
      document.querySelector('.nav[data-view="step-6"]').click();
      /* ردیف پیشنهادی زیست را به «تا اسفند» تغییر بده (تاریخ شمسی از ISO) */
      const rows = document.querySelectorAll('#bookDeadlineRows .dyn-row');
      if (rows[0]) {
        document.querySelectorAll('#view-step-6 details.adv').forEach((d) => { d.open = true; });
        const sel = rows[0].querySelector('[data-bd="subjectId"]');
        if (sel) sel.value = 'bio';
        const d = rows[0].querySelector('[data-bd="date"]');
        if (d) { d.dataset.iso = '2027-03-11'; d.dispatchEvent(new Event('change', { bubbles: true })); }
      }
      const addShort = document.getElementById('addShortDeadline');
      if (addShort) addShort.click();
      const srows = document.querySelectorAll('#shortDeadlineRows .dyn-row');
      if (srows.length) {
        const sel = srows[srows.length-1].querySelector('[data-sd="subjectId"]');
        if (sel) sel.value = 'bio';
        const d2 = srows[srows.length-1].querySelector('[data-sd="date"]');
        if (d2) { d2.dataset.iso = '2027-01-15'; d2.dispatchEvent(new Event('change', { bubbles: true })); }
      }
      const box = document.getElementById('bookDeadlineRows');
      if (box) box.scrollIntoView({ block: 'center' });
      return true;
    })()
  `);
  await wait(700);
  await shot('16-deadline-models.png');

  // ۸) گزارش مهلت‌ها
  await win.webContents.executeJavaScript(`document.getElementById('build').click(); true`);
  await wait(3000);
  await win.webContents.executeJavaScript(`
    (function(){
      document.querySelector('.nav[data-view="report"]').click();
      const t = document.getElementById('bookDeadlineTable');
      if (t) t.scrollIntoView({block:'center'});
      return t ? t.innerText.slice(0,200) : 'none';
    })()
  `).then((r) => console.log('deadlines:', r));
  await wait(800);
  await shot('17-deadlines-report.png');

  // ۹) آزمون‌های دوره‌ای (نسخهٔ ۲.۱)
  await win.webContents.executeJavaScript(`
    (function(){
      document.querySelector('.nav[data-view="step-6"]').click();
      document.querySelectorAll('#view-step-6 details.adv').forEach((d) => { d.open = true; });
      document.getElementById('suggestMocks').click();
      const rows = document.querySelectorAll('#mockRows .dyn-row');
      if (rows[0]) {
        rows[0].querySelector('[data-mk="title"]').value = 'زیستاز';
        rows[0].querySelector('[data-mk="day"]').value = '5';
        rows[0].querySelector('[data-mk="everyNWeeks"]').value = '2';
        rows[0].querySelector('[data-mk="start"]').value = '08:00';
        rows[0].querySelector('[data-mk="minutes"]').value = '180';
        const o = rows[0].querySelector('[data-mk="subjectIds"] option[value="bio"]'); if (o) o.selected = true;
      }
      if (rows[1]) {
        rows[1].querySelector('[data-mk="title"]').value = 'آلفا';
        rows[1].querySelector('[data-mk="day"]').value = '5';
        rows[1].querySelector('[data-mk="everyNWeeks"]').value = '2';
        rows[1].querySelector('[data-mk="start"]').value = '11:30';
        rows[1].querySelector('[data-mk="minutes"]').value = '120';
      }
      document.getElementById('mockRows').scrollIntoView({ block: 'center' });
      return document.getElementById('mockRows').innerText.slice(0, 120);
    })()
  `).then((r) => console.log('mocks:', r));
  await wait(700);
  await shot('18-mock-schedule.png');

  // ۱۰) ساخت برنامه با آزمون‌های دوره‌ای + گزارش ظرفیت
  await win.webContents.executeJavaScript(`document.getElementById('build').click(); true`);
  await wait(3500);
  await win.webContents.executeJavaScript(`
    (function(){
      document.querySelector('.nav[data-view="report"]').click();
      const el = document.getElementById('capacityBox');
      if (el) el.scrollIntoView({ block: 'start' });
      return (el ? el.innerText : '').slice(0, 240);
    })()
  `).then((r) => console.log('capacity:', r));
  await wait(800);
  await shot('19-capacity-advisory.png');

  await win.webContents.executeJavaScript(`
    (function(){
      const el = document.getElementById('mocksReport');
      if (el) el.scrollIntoView({ block: 'center' });
      return el ? el.innerText.slice(0, 200) : '';
    })()
  `).then((r) => console.log('mocksReport:', r));
  await wait(600);
  await shot('20-mocks-report.png');

  win.destroy();
  app.quit();
});
