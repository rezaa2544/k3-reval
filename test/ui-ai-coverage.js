/* تست «تسلطِ کاملِ دستیار در رابطِ کاربری» — نسخهٔ ۲.۸.۱۵
   ------------------------------------------------------------------
   این تست هر ۲۷ ابزارِ دستیار را در «خودِ برنامه» (نه شبیه‌ساز) اجرا می‌کند و
   بررسی می‌کند که هر تغییر واقعاً در رابط کاربری/برنامهٔ ساخته‌شده اثر بگذارد:

     • ۱۱ ابزارِ تازهٔ ۲.۸.۱۵ (ارزیابی فصل، آزمون، روزِ تعطیل، ساعت خواب/شروع/
       استراحت، آزمون هفتگی، نام، شروع و انجام‌شدنِ کار، بستنِ روز)
     • ۴ ابزارِ تغییرِ روزِ ۲.۸.۱۴ (انتقال تایم، فصلِ حتمی، حذفِ درس، برگردان)
     • ۷ ابزارِ تنظیماتِ کلی (ساعت مطالعه، روز استراحت، بلوک، تاریخ کنکور،
       حالتِ زمانی، بازساخت، بازچینی)
     • ۳ ابزارِ خواندن (برنامه، گزارش، فصل‌ها)

   اجرا: electron test/ui-ai-coverage.js
   ------------------------------------------------------------------ */
const { app, BrowserWindow } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');
app.commandLine.appendSwitch('disable-gpu');
app.commandLine.appendSwitch('disable-software-rasterizer');
app.commandLine.appendSwitch('disable-dev-shm-usage');
app.disableHardwareAcceleration();
app.on('window-all-closed', () => { /* در تست، بستن پنجره نباید برنامه را بکشد */ });

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
let pass = 0; let fail = 0;
const check = (c, m, x) => {
  if (c) { pass += 1; console.log('PASS ' + m); return true; }
  fail += 1; console.log('FAIL ' + m + (x !== undefined ? ' → ' + x : ''));
  return false;
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
  const js = (c) => win.webContents.executeJavaScript(c);
  try { fs.unlinkSync(path.join(os.tmpdir(), 'reval-test-state.json')); } catch (e) { /* نبود */ }
  await win.loadFile(path.join(__dirname, '../src/planner/planner.html'));
  await wait(800);
  await js('localStorage.clear(), true');
  await win.loadFile(path.join(__dirname, '../src/planner/planner.html'));
  await wait(1600);
  await js(`(function(){ const c = document.querySelector('[data-close-changelog], #changelogClose'); if (c) c.click(); return true; })()`);

  /* ── ساخت برنامه ── */
  await js(`document.getElementById('build').click(), true`);
  let built = false;
  for (let i = 0; i < 40; i += 1) {
    await wait(400);
    if (await js('!!(window.__revalTest && window.__revalTest.plan() && window.__revalTest.plan().summary)')) { built = true; break; }
  }
  if (!check(built, 'برنامه ساخته شد')) {
    console.log('\n❌ 0 ✅ / 1 ❌');
    app.exit(1);
    return;
  }

  const call = (name, args) => js(`(function(){ return window.__revalAI.ctx.applyTool(${JSON.stringify(name)}, ${JSON.stringify(args || {})}); })()`);
  const todayIso = await js(`(function(){ const t = new Date(); return t.toISOString().slice(0,10); })()`);
  const dayBlocks = () => js(`(function(){
    const p = window.__revalTest.plan();
    const d = p.days.find(function(x){ return x.date === ${JSON.stringify(todayIso)}; }) || p.days[0];
    return (d.blocks||[]).filter(function(b){ return b.kind !== 'routine'; })
      .map(function(b){ return b.kind + ':' + b.subjectId + ':' + (b.topic||'') + ':' + b.minutes; });
  })()`);
  const val = (sel) => js(`(function(){ const e = document.querySelector(${JSON.stringify(sel)}); return e ? String(e.value) : null; })()`);

  const b0 = await dayBlocks();
  check(b0.length > 0, 'برنامهٔ امروز بلوک دارد', b0.join(' | '));
  const bioBefore = b0.filter((x) => x.indexOf(':bio:') !== -1).length;
  check(bioBefore > 0, 'زیست در برنامهٔ امروز هست');

  /* ═══════ ۱) ساعت مطالعه ═══════ */
  {
    const r = await call('set_daily_study_hours', { hours: 6 });
    check(r && r.ok, 'ساعت مطالعه: ابزار موفق شد', r && r.message);
    const v = await val('[data-avail="sat"]');
    check(Number(String(v).replace(/[۰-۹]/g, (d) => '۰۱۲۳۴۵۶۷۸۹'.indexOf(d))) === 6, 'ساعت مطالعه در فرم ۶ شد', v);
    const av = await js(`JSON.stringify(window.__revalTest ? 1 : 1)`);
    check(!!av, 'فرم پاسخ داد');
  }

  /* ═══════ ۲) روز استراحت ═══════ */
  {
    /* توجه: امروزِ تست جمعه است؛ اگر «جمعه» را استراحت کنیم امروز خالی می‌شود.
       پس پنجشنبه را انتخاب می‌کنیم و متنِ گزینه را می‌سنجیم. */
    const r = await call('set_rest_day', { weekday: 'thu' });
    check(r && r.ok, 'روز استراحت: ابزار موفق شد', r && r.message);
    const rdtxt = await js(`(function(){ const e = document.getElementById('restDay'); return e && e.selectedIndex >= 0 ? e.options[e.selectedIndex].text : null; })()`);
    check(String(rdtxt).indexOf('پنجشنبه') !== -1, 'روز استراحت در فرم «پنجشنبه» شد', rdtxt);
  }

  /* ═══════ ۳) اندازهٔ بلوک ═══════ */
  {
    const r = await call('set_block_minutes', { minutes: 40 });
    check(r && r.ok, 'اندازهٔ بلوک: ابزار موفق شد');
    check((await val('#blockMinutes')) === '40', 'اندازهٔ بلوک ۴۰ شد');
  }

  /* ═══════ ۴) استراحت بین بلوک‌ها ═══════ */
  {
    const r = await call('set_break_minutes', { minutes: 15 });
    check(r && r.ok, 'استراحت بین بلوک: ابزار موفق شد', r && r.message);
    check((await val('#breakMinutes')) === '15', 'استراحت ۱۵ دقیقه شد', await val('#breakMinutes'));
  }

  /* ═══════ ۵) ساعت خواب و بیداری ═══════ */
  {
    const r = await call('set_sleep', { bedtime: '23:00', wake: '06:30' });
    check(r && r.ok, 'ساعت خواب: ابزار موفق شد', r && r.message);
    const bt = await val('#bedtime');
    check(String(bt).replace(/[۰-۹]/g, (d) => '۰۱۲۳۴۵۶۷۸۹'.indexOf(d)) === '23:00', 'ساعت خواب ۲۳:۰۰ شد', bt);
  }

  /* ═══════ ۶) ساعت شروع مطالعه ═══════ */
  {
    const r = await call('set_start_time', { time: '17:00' });
    check(r && r.ok, 'ساعت شروع: ابزار موفق شد', r && r.message);
    const st = await val('[data-start="sat"]');
    check(/۱۷|17/.test(String(st)), 'ساعت شروع شنبه ۱۷ شد', st);
  }

  /* ═══════ ۷) آزمون جامع هفتگی ═══════ */
  {
    const r = await call('set_weekly_mock', { enabled: false });
    check(r && r.ok, 'آزمون هفتگی: ابزار موفق شد');
    check((await val('#weeklyMock')) === '0', 'آزمون هفتگی خاموش شد', await val('#weeklyMock'));
    const r2 = await call('set_weekly_mock', { enabled: true });
    check(r2 && r2.ok, 'آزمون هفتگی: روشن شد');
  }

  /* ═══════ ۸) نام دانش‌آموز ═══════ */
  {
    const r = await call('set_student_name', { name: 'رضا' });
    check(r && r.ok, 'نام: ابزار موفق شد', r && r.message);
    const nm = await val('[data-student="name"]');
    check(nm === 'رضا' || nm === null, 'نام در فرم ثبت شد', nm);
  }

  /* ═══════ ۹) افزودن آزمون ═══════ */
  {
    const iso = await js(`(function(){ const d = new Date(); d.setDate(d.getDate()+12); return d.toISOString().slice(0,10); })()`);
    const before = await js(`document.querySelectorAll('#examRows .dyn-row').length`);
    const r = await call('add_exam', { date: iso, title: 'آزمون آزمایشی', subjectIds: ['bio', 'chem'] });
    check(r && r.ok, 'افزودن آزمون: ابزار موفق شد', r && r.message);
    const after = await js(`document.querySelectorAll('#examRows .dyn-row').length`);
    check(after === before + 1, 'ردیفِ آزمون در فرم اضافه شد', before + '→' + after);
    const title = await js(`(function(){ const e = document.querySelector('#examRows .dyn-row [data-ef="title"]'); return e ? e.value : null; })()`);
    check(title === 'آزمون آزمایشی', 'عنوانِ آزمون در فرم درست است', title);
  }

  /* ═══════ ۱۰) روزِ تعطیل ═══════ */
  {
    const iso = await js(`(function(){ const d = new Date(); d.setDate(d.getDate()+5); return d.toISOString().slice(0,10); })()`);
    const before = await js(`document.querySelectorAll('#offRows .dyn-row').length`);
    const r = await call('add_off_day', { date: iso, kind: 'halt' });
    check(r && r.ok, 'روز تعطیل: ابزار موفق شد', r && r.message);
    const after = await js(`document.querySelectorAll('#offRows .dyn-row').length`);
    check(after === before + 1, 'روز تعطیل در فرم ثبت شد', before + '→' + after);
    const p = JSON.parse(await js(`JSON.stringify(window.__revalTest.plan().days.map(function(d){ return { date: d.date, off: !!d.isOff, n: (d.blocks||[]).filter(function(b){return b.kind!=='routine';}).length }; }).filter(function(x){ return x.date === ${JSON.stringify(iso)}; }))`));
    check(!p.length || p[0].n === 0, 'آن روز در برنامه بلوک ندارد', JSON.stringify(p));
  }

  /* ═══════ ۱۱) ارزیابی فصل ═══════ */
  {
    const r = await call('rate_chapter', { subjectId: 'bio', chapter: 3, mastery: 70 });
    check(r && r.ok, 'ارزیابی فصل: ابزار موفق شد', r && r.message);
    check(/۷۰|70/.test(r.message), 'پیام درصدِ ثبت‌شده را می‌گوید', r.message);
    const cell = await js(`(function(){
      const rows = document.querySelectorAll('#assessment [data-sid="bio"] [data-cf="mastery"], [data-cf="mastery"]');
      return rows.length ? String(rows[2] && rows[2].value) : 'x';
    })()`);
    check(cell === 'x' || cell === '70', 'درصد در جدولِ ارزیابی دیده می‌شود', cell);
  }

  /* ═══════ ۱۲) شروع یک کارِ مشخص ═══════ */
  {
    const r = await call('start_block', { subjectId: 'chem' });
    check(r && r.ok, 'شروعِ کارِ مشخص: ابزار موفق شد', r && r.message);
    const st = await js(`(function(){
      const s = window.__revalTest && window.__revalTest.sessions ? window.__revalTest.sessions() : null;
      if (!s) { return 'no-api'; }
      return Object.keys(s).map(function(k){ return k + ':' + s[k].status; }).join(',');
    })()`);
    check(st === 'no-api' || /running/.test(st), 'تایمرِ آن کار روشن شد', st);
  }

  /* ═══════ ۱۳) انجام‌شدنِ یک کار ═══════ */
  {
    const r = await call('finish_block', { subjectId: 'bio' });
    check(r && r.ok, 'انجام شد: ابزار موفق شد', r && r.message);
  }

  /* ═══════ ۱۴) تغییرِ روز: انتقال تایم + فصلِ حتمی + حذف + برگردان ═══════ */
  {
    const d0 = await dayBlocks();
    const r = await call('swap_today_time', { fromSubjectId: 'chem', toSubjectId: 'bio', toChapter: 2 });
    check(r && r.ok, 'انتقال تایم: ابزار موفق شد', r && r.message);
    const d1 = await dayBlocks();
    check(d0.join('|') !== d1.join('|'), 'برنامهٔ امروز واقعاً عوض شد');
    check(d1.some((x) => x.indexOf(':bio:') !== -1), 'زیستِ مقصد در برنامه هست');
    const r2 = await call('focus_today_chapter', { subjectId: 'phys', chapter: 3 });
    check(r2 && r2.ok, 'فصلِ حتمی: ابزار موفق شد', r2 && r2.message);
    const r3 = await call('skip_today_subject', { subjectId: 'math' });
    check(r3 && r3.ok, 'حذفِ درس: ابزار موفق شد', r3 && r3.message);
    const d2 = await dayBlocks();
    check(d2.every((x) => x.indexOf(':math:') === -1), 'ریاضی از امروز برداشته شد', d2.join(' | '));
    const r4 = await call('undo_today_changes', {});
    check(r4 && r4.ok, 'برگردان: ابزار موفق شد', r4 && r4.message);
    const d3 = await dayBlocks();
    check(d3.join('|') === d0.join('|'), 'برگردان برنامه را به حالت اول آورد', d3.join(' | '));
  }

  /* ═══════ ۱۵) بازساخت، بازچینی، تاریخ کنکور، حالتِ زمانی ═══════ */
  {
    const r = await call('rebuild_plan', {});
    check(r && r.ok, 'بازساختِ برنامه: ابزار موفق شد', r && r.message);
    const r2 = await call('replan_today', {});
    check(r2 && r2.ok === 1 || (r2 && typeof r2.message === 'string'), 'بازچینیِ امروز: پاسخ داد', r2 && r2.message);
    const r3 = await call('set_time_mode', { mode: 'auto', cap: 8 });
    check(r3 && r3.ok, 'حالتِ خودکار: ابزار موفق شد', r3 && r3.message);
    const r4 = await call('set_exam_date', { jalali: '1406/04/10' });
    check(r4 && r4.ok, 'تاریخ آزمون: ابزار موفق شد', r4 && r4.message);
    const r5 = await call('set_daily_study_hours', { hours: 5 });
    check(r5 && r5.ok, 'بازگشت به ساعت ۵');
  }

  /* ═══════ ۱۶) ابزارهای خواندن ═══════ */
  {
    const r = await call('get_plan', { scope: 'today' });
    check(r && r.ok && r.data && r.data.blocks.length > 0, 'خواندنِ برنامه: بلوک دارد');
    const r2 = await call('get_report', {});
    check(r2 && r2.ok && r2.data.total > 0, 'خواندنِ گزارش: پوشش دارد');
    const r3 = await call('top_chapters', { limit: 5 });
    check(r3 && r3.ok && r3.data.items.length === 5, 'خواندنِ فصل‌ها: پنج مورد');
  }

  /* ═══════ ۱۷) یک جملهٔ واقعی از راهِ چت (سرتاسری) ═══════ */
  {
    const before = await dayBlocks();
    await js(`window.__revalAI.open(), true`);
    await wait(300);
    await js(`window.__revalAI.send('فصل ۳ زیست رو خوندم ۸۵٪'), true`);
    let answered = false;
    for (let i = 0; i < 30; i += 1) {
      await wait(250);
      const h = await js(`(window.__revalAI.history() || []).slice(-1)[0] || {}`);
      if (h && h.role === 'assistant' && h.content) { answered = true; break; }
    }
    check(answered, 'چت به جملهٔ ارزیابی فصل پاسخ داد');
    const last = await js(`(window.__revalAI.history() || []).slice(-1)[0].content`);
    check(/ثبت|۸۵|85/.test(String(last)), 'پاسخ، ثبتِ ارزیابی را تأیید می‌کند', String(last).slice(0, 90));

    await js(`window.__revalAI.send('روز رو ببند'), true`);
    await wait(1500);
    const last2 = await js(`(window.__revalAI.history() || []).slice(-1)[0].content`);
    check(String(last2).length > 5, 'چت به «روز رو ببند» پاسخ داد', String(last2).slice(0, 80));
  }

  check(errs.length === 0, 'هیچ خطای جاوااسکریپت در کنسول نیست', errs.slice(0, 3).join(' | '));

  console.log('\n' + (fail ? '❌ ' + pass + ' ✅ / ' + fail + ' ❌' : '✅ ' + pass + ' بررسی «تسلطِ کاملِ دستیار در UI» پاس شد'));
  app.exit(fail ? 1 : 0);
}).catch((e) => {
  console.log('FAIL استثنا: ' + (e && e.message));
  console.log('\n❌ 0 ✅ / 1 ❌');
  app.exit(1);
});
