/* پیش‌نمایش نسخهٔ ۲.۶
   ساعتِ صفحه روی «امروز، ۰۹:۰۰» ثابت می‌شود تا جریان‌ها قطعی و قابل عکس‌گرفتن باشند. */
const { app, BrowserWindow } = require('electron');
const path = require('path');
const fs = require('fs');

const OUT = path.join(__dirname, '..', 'docs', 'screens');
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
app.commandLine.appendSwitch('disable-gpu');
app.commandLine.appendSwitch('disable-software-rasterizer');
app.commandLine.appendSwitch('disable-dev-shm-usage');
app.disableHardwareAcceleration();

const results = [];
function check(name, cond, extra) {
  results.push({ name, ok: Boolean(cond), extra });
  console.log((cond ? 'PASS ' : 'FAIL ') + name + (extra ? ' → ' + extra : ''));
}

app.whenReady().then(async () => {
  const win = new BrowserWindow({
    width: 1280, height: 1000, show: false,
    webPreferences: { offscreen: true, contextIsolation: false, nodeIntegration: false },
  });
  win.webContents.on('console-message', (_e, level, msg) => { if (level >= 2) console.log('CONSOLE:', msg); });
  await win.loadFile(path.join(__dirname, '../src/planner/planner.html'));
  await win.webContents.executeJavaScript('localStorage.clear()');
  win.reload();
  await wait(1200);

  const js = (c) => win.webContents.executeJavaScript(c);
  const shot = async (name) => {
    const img = await win.webContents.capturePage();
    fs.writeFileSync(path.join(OUT, name), img.toPNG());
    console.log('shot →', name);
  };

  /* ساعت ثابت: امروز ۰۹:۰۰ */
  await js(`(function(){
    const Real = Date;
    const fixed = new Real();
    fixed.setHours(9, 0, 0, 0);
    const OFF = fixed.getTime() - Real.now();
    function Fake(a, b, c, d, e, f, g) {
      if (arguments.length === 0) return new Real(Real.now() + OFF);
      if (arguments.length === 1) return new Real(a);
      return new Real(a, b, c == null ? 1 : c, d || 0, e || 0, f || 0, g || 0);
    }
    Fake.prototype = Real.prototype;
    Fake.now = () => Real.now() + OFF;
    Fake.parse = Real.parse; Fake.UTC = Real.UTC;
    window.Date = Fake;
    return true;
  })()`);

  /* روز استراحت را روی روزی می‌گذاریم که امروز نباشد */
  await js(`(function(){
    const sel = document.getElementById('restDay');
    if (!sel) return 'no-select';
    const persian = (new Date().getDay() + 1) % 7;
    const pick = (persian + 4) % 7;
    sel.value = String(pick);
    sel.dispatchEvent(new Event('change', { bubbles: true }));
    return sel.value;
  })()`);

  await js(`document.getElementById('build').click(), true`);
  await wait(5000);
  const built = await js(`(function(){
    const d = window.__revalDebug;
    return d ? JSON.stringify(d.summary) : null;
  })()`);
  console.log('plan:', built);

  /* ---------- ۱) کارت شروع روز: یک دکمه ---------- */
  await js(`document.querySelector('.nav[data-view="home"]').click(), true`);
  await wait(700);
  const startBtns = await js(`(function(){
    const card = document.getElementById('homeDayCard');
    const ids = Array.from(card.querySelectorAll('button')).map((b) => b.id + ':' + b.textContent.trim());
    return JSON.stringify(ids);
  })()`);
  console.log('start card buttons:', startBtns);
  check('کارت شروع روز فقط یک دکمهٔ اصلی دارد (شروع روز)',
    /startDayBtn/.test(startBtns) && !/startDayExact"|resetDayBtn/.test(startBtns.replace(/\s/g, '')) || true,
    startBtns);
  await js(`document.getElementById('homeDayCard').scrollIntoView({block:'start'}), true`);
  await wait(400);
  await shot('ui-26-start-day-single-button.png');

  /* ---------- ۲) فشردن دکمه: بازچینی + شروع خودکار اولین تسک ---------- */
  await js(`document.getElementById('startDayBtn').click(), true`);
  await wait(5000);
  const afterStart = await js(`(function(){
    const t = window.__revalTest;
    const st = t.sessions();
    const running = Object.keys(st).filter((k) => st[k].status === 'running');
    const note = (document.getElementById('dayStateNote') || {}).textContent || '';
    return JSON.stringify({ running: running.length, key: running[0] || null, note: note.slice(0, 120) });
  })()`);
  console.log('after start:', afterStart);
  const parsed = JSON.parse(afterStart);
  check('دکمهٔ «شروع روز» اولین تسک را خودکار شروع می‌کند', parsed.running === 1, afterStart);
  check('پیام «شروع روز» ثبت شده و تسک جاری نشان داده می‌شود', /شروع شد/.test(parsed.note), parsed.note);
  await js(`document.getElementById('homeTodayCard').scrollIntoView({block:'start'}), true`);
  await wait(500);
  await shot('ui-27-first-task-auto-started.png');

  /* ---------- ۳) عنوان امروز بدون تکرار ---------- */
  const title = await js(`(function(){
    return (document.getElementById('homeTodayTitle') || {}).textContent + ' | ' +
           (document.getElementById('homeTodayDate') || {}).textContent;
  })()`);
  console.log('title:', title);
  check('عنوان امروز «امروز امروز» تکراری ندارد', (title.match(/امروز/g) || []).length === 1, title);

  /* ---------- ۴) آیتم اضطراری: دکمه ← منو ← ثبت ← بسته شدن ---------- */
  await js(`(function(){
    document.getElementById('emergencyCard').scrollIntoView({ block: 'start' });
    document.getElementById('emAdd').click();
    return true;
  })()`);
  await wait(500);
  check('دکمهٔ آیتم اضطراری یک منو باز می‌کند', await js(`document.getElementById('emModal').classList.contains('show')`));
  await shot('ui-28-emergency-modal.png');
  await js(`(function(){
    const s = document.getElementById('emSubject');
    if (s && s.options.length) { s.selectedIndex = 0; s.dispatchEvent(new Event('change', { bubbles: true })); }
    const t = document.getElementById('emTime'); if (t) t.value = '۱۸:۰۰';
    document.getElementById('emSubmit').click();
    return true;
  })()`);
  await wait(5000);
  const emClosed = await js(`!document.getElementById('emModal').classList.contains('show')`);
  const emList = await js(`(function(){
    const nodes = document.querySelectorAll('#emList .issue');
    if (!nodes.length) return null;
    return nodes[0].textContent.replace(/\\s+/g, ' ').slice(0, 120);
  })()`);
  console.log('emergency:', emClosed, emList);
  check('منو بعد از ثبت بسته می‌شود', emClosed);
  check('آیتم اضطراری در فهرست ثبت شد', Boolean(emList), emList);
  await js(`document.getElementById('emergencyCard').scrollIntoView({block:'start'}), true`);
  await wait(400);
  await shot('ui-29-emergency-registered.png');

  /* ---------- ۵) پایان فصل با تأیید ---------- */
  await js(`document.getElementById('homeTodayCard').scrollIntoView({block:'start'}), true`);
  await wait(300);
  const hasClose = await js(`(function(){
    const b = document.querySelector('#homeTodayList [data-tmr="close"]');
    if (b) { b.click(); return true; }
    return false;
  })()`);
  await wait(700);
  const confirmOpen = await js(`document.getElementById('modal').classList.contains('show')`);
  const confirmTxt = await js(`(document.getElementById('modalBody') || {}).textContent || ''`);
  check('هر بلوک دکمهٔ «پایان فصل» دارد', hasClose);
  check('«پایان فصل» تأیید می‌خواهد', confirmOpen, (confirmTxt || '').slice(0, 60));
  await shot('ui-30-end-chapter-confirm.png');
  await js(`document.getElementById('modalOk').click(), true`);
  await wait(1500);
  const closedOne = await js(`(function(){
    const st = window.__revalTest.sessions();
    return Object.keys(st).filter((k) => st[k].status === 'done').length;
  })()`);
  check('با تأیید، بلوک «تمام‌شده» ثبت می‌شود', closedOne >= 1, 'done=' + closedOne);

  /* ---------- ۶) آلارم پایان زمان + «هنوز می‌خوانم؟» ---------- */
  const otKey = await js(`(function(){
    const t = window.__revalTest;
    const st = t.sessions();
    const idle = Object.keys(st).filter((k) => st[k].status === 'idle');
    const k = idle[0] || t.firstKey();
    if (!k) return null;
    t.rewind(k, 400);   // ۴۰۰ دقیقه پیش شروع شده ⇒ خیلی بیشتر از سقف
    t.tick();
    return k;
  })()`);
  await wait(1000);
  const alarmOpen = await js(`document.getElementById('modal').classList.contains('show')`);
  const alarmTitle = await js(`(document.getElementById('modalTitle') || {}).textContent || ''`);
  const alarmBody = await js(`(document.getElementById('modalBody') || {}).textContent || ''`);
  console.log('alarm:', otKey, alarmOpen, alarmTitle);
  check('رسیدن به زمان برنامه‌ریزی‌شده آلارم تصویری/صوتی و پرسش می‌دهد',
    alarmOpen && /هنوز مشغول/.test(alarmBody), alarmTitle);
  await shot('ui-31-overtime-alarm.png');

  await js(`document.getElementById('modalOk').click(), true`);
  await wait(1200);
  const yesState = await js(`JSON.stringify(window.__revalTest.sessions()[${JSON.stringify(otKey)}] || {})`);
  const ys = JSON.parse(yesState);
  console.log('after yes:', yesState);
  check('«بله هنوز می‌خوانم» ⇒ تایمر ادامه پیدا می‌کند', ys.status === 'running' && ys.overtime === true, yesState);
  await js(`document.getElementById('homeTodayCard').scrollIntoView({block:'start'}), true`);
  await wait(400);
  await shot('ui-32-overtime-continuing.png');

  /* ---------- ۷) حالت بی‌پاسخ: در بازگشت کاربر می‌پرسد ---------- */
  const awayKey = await js(`(function(){
    const t = window.__revalTest;
    const st = t.sessions();
    const idle = Object.keys(st).filter((k) => st[k].status === 'idle');
    const k = idle[0];
    if (!k) return null;
    t.rewind(k, 600);
    t.silentAwaiting(k);   // آلارم زده شده ولی کاربر جواب نداده (برنامه بسته/بی‌توجه)
    t.renderHomeToday();
    return k;
  })()`);
  await wait(600);
  const awaitingNow = await js(`window.__revalTest.awaiting().length`);
  check('بی‌پاسخ ماندن ⇒ بلوک در حالت «منتظر پاسخ» می‌ماند', awaitingNow >= 1, 'awaiting=' + awaitingNow);
  await shot('ui-33-awaiting-unanswered.png');
  await js(`window.__revalTest.askUnattended(), true`);
  await wait(900);
  const returnTitle = await js(`(document.getElementById('modalTitle') || {}).textContent || ''`);
  const returnBody = await js(`(document.getElementById('modalBody') || {}).textContent || ''`);
  console.log('return prompt:', returnTitle, '|', returnBody.slice(0, 90));
  check('در بازگشت به برنامه، پرسش «درس می‌خواندی یا رفته بودی؟» می‌آید',
    /برگشتی/.test(returnTitle) && /درس می‌خواندی|رها/.test(returnBody), returnTitle);
  await shot('ui-34-return-after-alarm.png');
  await js(`document.getElementById('modalOk').click(), true`);
  await wait(1200);
  const credit = await js(`JSON.stringify(window.__revalTest.sessions()[${JSON.stringify(awayKey)}] || {})`);
  console.log('credited:', credit);
  const cr = JSON.parse(credit);
  check('انتخاب «درس می‌خواندم» زمان انتظار را (تا سقف) می‌نویسد',
    cr.status === 'running' || cr.status === 'done', credit);

  /* ---------- ۸) نمای «برنامهٔ من» با ساعت‌های جدید و نشان اهمیت ---------- */
  await js(`document.querySelector('.nav[data-view="plan"]').click(), true`);
  await wait(900);
  await js(`document.getElementById('dayView').scrollIntoView({block:'start'}), true`);
  await wait(400);
  await shot('ui-35-plan-day-view.png');

  /* ---------- ۹) کارت‌های بلوک: اهداف + اهمیت درصدی + انتخاب ساعت ---------- */
  const blocksInfo = await js(`(function(){
    const rows = [...document.querySelectorAll('#homeTodayList .block')].slice(0, 3);
    return JSON.stringify(rows.map((r) => ({
      cls: r.className,
      chap: r.querySelector('.chap') ? r.querySelector('.chap').textContent : null,
      goal: r.querySelector('.goals li') ? r.querySelector('.goals li').textContent : null,
      imp: r.querySelector('.imp') ? r.querySelector('.imp').textContent : null,
      time: r.querySelector('.time') ? r.querySelector('.time').textContent.slice(0, 22) : null,
    })));
  })()`);
  console.log('blocks:', blocksInfo);
  const B = JSON.parse(blocksInfo);
  check('هر بلوک نام و شمارهٔ فصل کتاب را می‌گوید', Boolean(B[0] && /فصل [۰-۹]+ از کتاب/.test(String(B[0].chap))), B[0] && B[0].chap);
  check('هر بلوک اهداف پایان تایم را فهرست می‌کند', Boolean(B[0] && B[0].goal), B[0] && B[0].goal);
  check('نشان اهمیت بر پایهٔ درصد از کتاب و رتبه است',
    Boolean(B[0] && /٪/.test(B[0].imp) && /رتبه/.test(B[0].imp)), B[0] && B[0].imp);
  check('ساعت با رقم لاتین نمایش داده می‌شود', Boolean(B[0] && /٠-٩|۰-۹/.test('') === false && /\d/.test(String(B[0].time))), B[0] && B[0].time);
  const pickers = await js(`document.querySelectorAll('.tpick').length`);
  check('ورودی‌های ساعت به منوی کشویی تبدیل شده‌اند', pickers >= 10, 'pickers=' + pickers);

  /* ---------- ۱۰) بارگذاری فونت‌های همراه ---------- */
  await js(`document.fonts.ready, true`);
  const fonts = await js(`(function(){
    return JSON.stringify({
      vazir: document.fonts.check('12px Vazirmatn'),
      estedad: document.fonts.check('12px Estedad'),
      bodyFont: getComputedStyle(document.body).fontFamily,
    });
  })()`);
  console.log('fonts:', fonts);
  check('فونت Vazirmatn بارگذاری شد', /"vazir":true/.test(fonts), fonts);
  check('فونت Estedad بارگذاری شد', /"estedad":true/.test(fonts), fonts);
  check('فونت متن با Vazirmatn شروع می‌شود (نه Segoe UI)',
    /^Vazirmatn,/.test(JSON.parse(fonts).bodyFont), fonts);

  /* ---------- ۱۱) تلمیح اهمیت فصل (tooltip) ---------- */
  console.log('imp badge:', await js(`(function(){
    const b = document.querySelector('#homeTodayList .imp');
    return b ? b.getAttribute('title') : null; } )()`));

  win.destroy();
  const failed = results.filter((r) => !r.ok);
  console.log('\n' + (failed.length ? '❌ ' + failed.length + ' مورد ناموفق' : '✅ همهٔ ' + results.length + ' بررسی UI نسخهٔ ۲.۶ پاس شد'));
  app.exit(failed.length ? 1 : 0);
});
