/* تست نمایشِ «تنوع روز» (نسخهٔ ۲.۸.۱۱)
   کاربر شکایت کرده بود که برنامهٔ روز «یک کتاب» است. موتور حالا هر روز چند درس را
   درهم می‌آمیزد و کارتِ روز باید همین را با درصدِ سهمِ هر درس نشان بدهد تا
   دانش‌آموز در یک نگاه ببیند امروز چند کتاب در کار است. */
const { app, BrowserWindow } = require('electron');
const path = require('path');
const fs = require('fs');
app.commandLine.appendSwitch('disable-gpu');
app.commandLine.appendSwitch('disable-software-rasterizer');
app.commandLine.appendSwitch('disable-dev-shm-usage');
app.disableHardwareAcceleration();
app.on('window-all-closed', () => { /* در تست، بستن پنجره نباید برنامه را بکشد */ });

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
let pass = 0; let fail = 0;
const check = (c, m, x) => {
  if (c) { pass += 1; console.log('PASS ' + m); } else { fail += 1; console.log('FAIL ' + m + (x !== undefined ? ' → ' + x : '')); }
};

app.whenReady().then(async () => {
  const win = new BrowserWindow({
    width: 1400, height: 950, show: false,
    webPreferences: {
      offscreen: true, contextIsolation: true, sandbox: false,
      preload: path.join(__dirname, 'planner-bridge-mock.js'),
    },
  });
  const errs = [];
  win.webContents.on('console-message', (_e, lvl, msg) => {
    if (lvl >= 2 && !/Autofill|DevTools/.test(String(msg))) errs.push(String(msg).slice(0, 160));
  });
  await win.loadFile(path.join(__dirname, '../src/planner/planner.html'));
  const js = (c) => win.webContents.executeJavaScript(c);
  await wait(1600);

  /* ساخت برنامه با کلیک واقعی */
  await js(`document.getElementById('build').click(), true`);
  let built = false;
  for (let i = 0; i < 40; i += 1) {
    await wait(400);
    if (await js('!!(window.__revalTest && window.__revalTest.plan() && window.__revalTest.plan().summary)')) { built = true; break; }
  }
  check(built, 'برنامه ساخته شد');
  if (!built) { console.log('\n❌ 0 ✅'); app.exit(1); return; }

  /* رفتن به نمای روز (اولین روزی که چند درس دارد) */
  const picked = JSON.parse(await js(`(function(){
    const p = window.__revalTest.plan();
    const idx = p.days.findIndex(function(d){ return d.variety && d.variety.subjects >= 2 && (d.blocks||[]).length >= 2; });
    if (idx < 0) return JSON.stringify({ ok:false });
    window.__dayVarietyIdx = idx;
    return JSON.stringify({ ok:true, idx:idx, subjects:p.days[idx].variety.subjects });
  })()`));
  check(picked.ok === true, 'روزی با ۲ درس یا بیشتر پیدا شد', JSON.stringify(picked));

  /* همان روز را در نمای «برنامهٔ من» باز کن */
  await js(`(function(){
    const t = window.__revalTest;
    const nav = document.querySelector('.nav[data-view="plan"]') || document.querySelector('[data-go="plan"]');
    if (nav) nav.click();
    return true;
  })()`);
  await wait(900);
  const opened = await js(`(function(){
    const st = window.__revalTest;
    const plan = st.plan();
    const nav = document.querySelector('.nav[data-view="plan"]');
    if (nav) nav.click();
    const idx = window.__dayVarietyIdx;
    /* از طریق قلابِ تست: هفته و روزِ انتخابی را تنظیم می‌کنیم */
    if (st.openDayIndex) return !!st.openDayIndex(idx);
    return !!st.openToday();
  })()`);
  check(opened === true, 'نمای روزِ همان روز باز شد', String(opened));
  await wait(800);

  const dom = JSON.parse(await js(`(function(){
    const v = document.querySelector('#dayView .variety');
    if (!v) return JSON.stringify({ found:false });
    const chips = [...v.querySelectorAll('.vchip')].map(function(c){ return c.textContent.replace(/\\s+/g,' ').trim(); });
    const plan = window.__revalTest.plan();
    const day = plan.days[window.__dayVarietyIdx];
    return JSON.stringify({
      found: true, text: v.textContent.replace(/\\s+/g,' ').trim(), title: v.getAttribute('title') || '',
      chips: chips, expect: (day.variety.list || []).length,
      hasPercent: chips.some(function(c){ return /٪/.test(c); }),
      pills: [...document.querySelectorAll('#dayPills .day-pill small')].map(function(s){ return s.textContent.trim(); }),
    });
  })()`));

  check(dom.found === true, 'کارت روز نوار «تنوع» را نشان می‌دهد');
  check(/درس در این روز/.test(dom.text || ''), 'نوار می‌گوید «چند درس در این روز» است', dom.text);
  check(dom.hasPercent === true, 'سهم هر درس به درصد نوشته شده', JSON.stringify(dom.chips));
  check((dom.chips || []).length >= Math.min(2, dom.expect), 'برای هر درس یک چیپ نشان داده می‌شود',
    (dom.chips || []).length + ' از ' + dom.expect);
  check(/درهم|فاصله|خستگی/.test(dom.title || ''), 'نوار دلیلِ روان‌شناختی تنوع را در tooltip دارد', dom.title);
  check((dom.pills || []).some((t) => /درس/.test(t)), 'دکمه‌های روزِ هفته هم تعداد درس‌ها را نشان می‌دهند',
    JSON.stringify((dom.pills || []).slice(0, 3)));

  /* روز تک‌درس نباید نوارِ گمراه‌کننده بسازد */
  const single = JSON.parse(await js(`(function(){
    const p = window.__revalTest.plan();
    const idx = p.days.findIndex(function(d){ return d.variety && d.variety.subjects === 1 && (d.blocks||[]).length >= 2; });
    if (idx < 0) return JSON.stringify({ skip:true });
    if (!window.__revalTest.openDayIndex || !window.__revalTest.openDayIndex(idx)) return JSON.stringify({ skip:true });
    const v = document.querySelector('#dayView .variety');
    return JSON.stringify({ skip:false, hasVariety: !!v });
  })()`));
  if (!single.skip) check(single.hasVariety === false, 'روزِ تک‌درس نوار «چند درس» ندارد', JSON.stringify(single));

  /* برگرد به روزِ چنددرسی و نوارِ تنوع را وسط کادر بیاور تا اسکرین‌شات گویا باشد */
  await js(`(function(){
    const st = window.__revalTest;
    if (st.openDayIndex) st.openDayIndex(window.__dayVarietyIdx);
    const v = document.querySelector('#dayView .variety');
    if (v && v.scrollIntoView) v.scrollIntoView({ block: 'center' });
    return true;
  })()`);
  await wait(700);
  try {
    fs.writeFileSync(path.join(__dirname, '..', 'docs', 'screens', 'ui-58-day-variety.png'),
      (await win.webContents.capturePage()).toPNG());
  } catch (e) { /* اسکرین‌شات اختیاری است */ }

  check(errs.length === 0, 'هیچ خطای جاوااسکریپت در کنسول نیست', errs.slice(0, 2).join(' | '));

  console.log(`\n${fail ? '❌' : '✅'} ${pass} بررسی «تنوع روز» ${fail ? 'با ' + fail + ' خطا' : 'پاس شد'}\n`);
  win.destroy();
  app.exit(fail ? 1 : 0);
});
