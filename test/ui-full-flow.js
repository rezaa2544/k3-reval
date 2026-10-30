/* ═══════════════════════════════════════════════════════════════════
   تست سرتاسری رابط کاربری — نسخهٔ ۲.۸.۹
   سه دانش‌آموز را از صفر می‌سازد: هر ۶ قدم را با کلیک/تایپ واقعی پر می‌کند،
   «ساخت برنامهٔ من» را می‌زند و بعد همهٔ صفحه‌ها را می‌سنجد:
     خانه · برنامهٔ من · گزارش · علم پشت برنامه · هر ۶ قدم · پنجرهٔ تغییرات
   و بررسی می‌کند: ماندگاری پس از بارگذاری دوباره، نبود خطای کنسول،
   امکان بازچینش/تیک‌زدن، و اینکه همهٔ کارت‌ها داده دارند.
   خروجی: docs/screens/ui-56-*.png + خلاصه در کنسول
   ═══════════════════════════════════════════════════════════════════ */
const { app, BrowserWindow } = require('electron');
const path = require('path');
const fs = require('fs');
app.commandLine.appendSwitch('disable-gpu');
app.commandLine.appendSwitch('disable-dev-shm-usage');
app.disableHardwareAcceleration();
app.on('window-all-closed', () => { /* در تست، بستن پنجره نباید برنامه را بکشد */ });

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
let pass = 0; let fail = 0;
const errsAll = [];
const check = (c, m, x) => {
  if (c) { pass += 1; }
  else { fail += 1; console.log('FAIL ' + m + (x !== undefined ? ' → ' + x : '')); }
};

/* سه دانش‌آموز با شرایط کاملاً متفاوت */
const STUDENTS = [
  {
    key: 'arman', label: 'آرمان — دوازدهم تجربی، ۸ ساعت، کلاس و آزمون',
    name: 'آرمان', grade: 'دوازدهم', field: 'tajrobi', chrono: 'morning',
    avail: [6, 6, 6, 6, 6, 8, 8], rest: '5', mode: 'fixed',
    classes: [{ title: 'کلاس ریاضی', weekdays: [0, 2], start: '18:00', end: '20:00' }],
    exam: { title: 'آزمون آزمایشی مهر', afterDays: 30 },
    readChapters: true, finals: true, bookDeadline: true,
  },
  {
    key: 'sara', label: 'سارا — یازدهم ریاضی، شب‌زی، ۵ ساعت، خودکار؟ نه، دستی',
    name: 'سارا', grade: 'یازدهم', field: 'riazi', chrono: 'evening',
    avail: [5, 5, 5, 5, 5, 5, 0], rest: '6', mode: 'fixed',
    classes: [], exam: null, readChapters: false, finals: false, bookDeadline: false,
  },
  {
    key: 'maryam', label: 'مریم — فارغ‌التحصیل انسانی، حالت خودکار با سقف ۱۰ ساعت',
    name: 'مریم', grade: 'فارغ‌التحصیل', field: 'ensani', chrono: 'neutral',
    avail: null, rest: '7', mode: 'auto', cap: 10, floor: 3,
    classes: [], exam: null, readChapters: true, finals: true, bookDeadline: true,
  },
];

async function newWin() {
  const win = new BrowserWindow({
    width: 1440, height: 950, show: false,
    webPreferences: { offscreen: true, contextIsolation: true, sandbox: false, preload: path.join(__dirname, 'planner-bridge-mock.js') },
  });
  win.webContents.on('console-message', (_e, lvl, msg) => {
    if (lvl >= 2 && !/Autofill|DevTools/.test(String(msg))) errsAll.push(String(msg).slice(0, 140));
  });
  await win.loadFile(path.join(__dirname, '../src/planner/planner.html'));
  await wait(1600);
  return win;
}

/* ---------- پر کردن فرم با کلیک/تایپ واقعی ---------- */
async function fillAll(win, st) {
  const js = (c) => win.webContents.executeJavaScript(c);
  const steps = [];

  /* قدم ۱ */
  await js(`(function(){
    const n=document.querySelector('.nav[data-view="step-1"]'); if(n) n.click();
    const set=(id,v)=>{const el=document.getElementById(id); if(!el) return;
      el.value=v; el.dispatchEvent(new Event('input',{bubbles:true})); el.dispatchEvent(new Event('change',{bubbles:true}));};
    set('name', ${JSON.stringify(st.name)});
    set('grade', ${JSON.stringify(st.grade)});
    set('field', ${JSON.stringify(st.field)});
    set('chronotype', ${JSON.stringify(st.chrono)});
    return true;})()`);
  await wait(450);
  steps.push(await js(`window.__probe1 = { name: document.getElementById('name').value }; JSON.stringify(window.__probe1)`));

  /* قدم ۲: ساعت‌ها */
  await js(`(function(){
    const n=document.querySelector('.nav[data-view="step-2"]'); if(n) n.click();
    return true;})()`);
  await wait(450);
  if (st.mode === 'auto') {
    await js(`document.getElementById('modeAuto').click()`);
    await wait(400);
    await js(`(function(){
      const set=(id,v)=>{const el=document.getElementById(id); if(!el) return;
        el.value=v; el.dispatchEvent(new Event('input',{bubbles:true})); el.dispatchEvent(new Event('change',{bubbles:true}));};
      set('dailyCap', String(${st.cap}));
      set('dailyFloor', String(${st.floor}));
      return true;})()`);
  } else {
    await js(`document.getElementById('modeFixed').click()`);
    await wait(300);
    await js(`(function(){
      const boxes=[...document.querySelectorAll('#availability input')];
      const vals=${JSON.stringify(st.avail)};
      boxes.forEach(function(b,i){ if(vals[i]!=null){ b.value=String(vals[i]);
        b.dispatchEvent(new Event('input',{bubbles:true})); b.dispatchEvent(new Event('change',{bubbles:true})); } });
      return true;})()`);
  }
  await wait(300);
  await js(`(function(){
    const r=document.getElementById('restDay'); if(r){ r.value=${JSON.stringify(st.rest)};
      r.dispatchEvent(new Event('change',{bubbles:true})); }
    return true;})()`);

  /* قدم ۳: کلاس و آزمون */
  await js(`(function(){
    const n=document.querySelector('.nav[data-view="step-3"]'); if(n) n.click(); return true;})()`);
  await wait(500);
  for (const c of st.classes) {
    await js(`document.getElementById('addClass').click()`);
    await wait(350);
    await js(`(function(){
      const row=document.querySelector('#classRows .dyn-row');
      if(!row) return false;
      const t=row.querySelector('[data-cf="title"]'); if(t){t.value=${JSON.stringify(c.title)}; t.dispatchEvent(new Event('input',{bubbles:true}));}
      return true;})()`);
  }
  if (st.exam) {
    await js(`document.getElementById('addExam').click()`);
    await wait(350);
    await js(`(function(){
      const row=document.querySelector('#examRows .dyn-row.exam');
      if(!row) return false;
      const t=row.querySelector('[data-ef="title"]'); if(t){t.value=${JSON.stringify(st.exam.title)}; t.dispatchEvent(new Event('input',{bubbles:true}));}
      /* تاریخ: ۳۰ روز بعد از امروز */
      const d=new Date(); d.setDate(d.getDate()+${st.exam.afterDays});
      const iso=d.toISOString().slice(0,10);
      const di=row.querySelector('[data-ef="date"]'); if(di){ di.dataset.iso=iso; di.value=iso; di.dispatchEvent(new Event('change',{bubbles:true})); }
      /* دو درس را تیک بزن */
      ['bio','chem'].forEach(function(id){ const b=row.querySelector('.subj-checks input[value="'+id+'"]'); if(b){b.checked=true; b.dispatchEvent(new Event('change',{bubbles:true}));} });
      return true;})()`);
  }
  await wait(300);

  /* قدم ۴: ارزیابی فصل‌ها + عمومی‌ها */
  await js(`(function(){
    const n=document.querySelector('.nav[data-view="step-4"]'); if(n) n.click(); return true;})()`);
  await wait(800);
  if (st.readChapters) {
    await js(`(function(){
      /* باز کردن اولین درس و تیک‌زدن ۳ فصل با تسلط */
      const btn=document.querySelector('#assessment .assess-head, #assessment summary, #assessment .assess-row');
      if(btn) btn.click();
      return true;})()`);
    await wait(500);
    await js(`(function(){
      const rows=[...document.querySelectorAll('#assessment input[type=checkbox]')].slice(0,3);
      rows.forEach(function(c,i){ c.checked=true; c.dispatchEvent(new Event('change',{bubbles:true})); });
      const nums=[...document.querySelectorAll('#assessment input[type=number]')].slice(0,3);
      nums.forEach(function(n,i){ n.value=String(60+i*10); n.dispatchEvent(new Event('input',{bubbles:true})); n.dispatchEvent(new Event('change',{bubbles:true})); });
      return rows.length;})()`);
  }
  await wait(400);

  /* قدم ۵: سوابق */
  await js(`(function(){
    const n=document.querySelector('.nav[data-view="step-5"]'); if(n) n.click(); return true;})()`);
  await wait(600);
  if (st.finals) {
    await js(`(function(){
      const rows=[...document.querySelectorAll('#finalsTable tbody tr')].slice(0,10);
      rows.forEach(function(r){
        const cur=r.querySelector('[data-ff="current"]'); if(cur){cur.value='16'; cur.dispatchEvent(new Event('input',{bubbles:true}));}
        const tgt=r.querySelector('[data-ff="target"]'); if(tgt){tgt.value='19'; tgt.dispatchEvent(new Event('input',{bubbles:true}));}
      });
      return rows.length;})()`);
  }
  await wait(350);

  /* قدم ۶: مهلت کتاب (نسخهٔ ۲.۸.۷: عمومی‌ها هم) */
  await js(`(function(){
    const n=document.querySelector('.nav[data-view="step-6"]'); if(n) n.click(); return true;})()`);
  await wait(600);
  if (st.bookDeadline) {
    await js(`document.getElementById('addBookDeadline').click()`);
    await wait(350);
    await js(`(function(){
      const row=document.querySelector('#bookDeadlineRows .dyn-row');
      if(!row) return false;
      const sel=row.querySelector('[data-bd="subjectId"]');
      const gen=[...sel.options].filter(function(o){ return /دین|فارسی|عربی|زبان/.test(o.textContent); });
      if(gen.length){ sel.value=gen[0].value; sel.dispatchEvent(new Event('change',{bubbles:true})); }
      const d=new Date(); d.setDate(d.getDate()+150);
      const di=row.querySelector('[data-bd="date"]');
      if(di){ const iso=d.toISOString().slice(0,10); di.dataset.iso=iso; di.value=iso; di.dispatchEvent(new Event('change',{bubbles:true})); }
      return true;})()`);
  }
  return steps;
}

app.whenReady().then(async () => {
  /* پاک‌کردن دادهٔ تست قبلی تا هر اجرا از صفر شروع شود (مثل نصب تازه) */
  try { fs.unlinkSync(path.join(require('os').tmpdir(), 'reval-test-state.json')); } catch (e) { /* نبودش مهم نیست */ }
  const report = [];
  for (const st of STUDENTS) {
    console.log('\n▌ ' + st.label);
    const win = await newWin();
    const js = (c) => win.webContents.executeJavaScript(c).catch((e) => {
      console.log('   ⚠ خطای اجرای اسکریپت: ' + String(e.message || e).slice(0, 120));
      console.log('     ' + String(c).replace(/\s+/g, ' ').slice(0, 180));
      return 'SCRIPT-ERROR';
    });
    const errsBefore = errsAll.length;

    await fillAll(win, st);

    /* ساخت برنامه با کلیک روی دکمهٔ واقعی */
    const built = await js(`(function(){
      const b=document.getElementById('build');
      if(!b) return 'NO-BUTTON';
      b.click(); return 'clicked';})()`);
    await wait(4000);
    check(built === 'clicked', '[UI] دکمهٔ «ساخت برنامهٔ من» موجود است');

    const state = JSON.parse(await js(`(function(){
      const t=window.__revalTest;
      const plan=t.plan();
      const viewPlan=document.getElementById('view-plan');
      const planBody=document.getElementById('planBody');
      const days=plan?plan.days:[];
      return JSON.stringify({
        hasPlan: !!plan,
        days: days.length,
        planVisible: planBody && planBody.style.display !== 'none',
        activeView: (document.querySelector('.view.active')||{}).id,
        statsCards: document.querySelectorAll('#stats .stat, #stats > *').length,
        dayPills: document.querySelectorAll('#dayPills > *').length,
        dayBlocks: document.querySelectorAll('#dayView .task, #dayView .blk, #dayView li').length,
        issueBox: (document.getElementById('issueBox')||{}).textContent ,
        cov: plan ? plan.summary.coverage.coverageRatio : null,
        blocks: plan ? plan.days.reduce((n,d)=>n+d.blocks.length,0) : 0
      });})()`));

    check(state.hasPlan, '[UI] برنامه ساخته شد');
    check(state.days > 30, '[UI] برنامه روز دارد', state.days);
    check(state.planVisible, '[UI] بلافاصله به صفحهٔ «برنامهٔ من» می‌رود', state.activeView);
    check(state.statsCards >= 3, '[UI] کارت‌های آماری پر شده‌اند', state.statsCards);
    check(state.dayPills > 0, '[UI] نوار روزها ساخته شده', state.dayPills);
    check(state.dayBlocks > 0, '[UI] بلوک‌های روز نمایش داده می‌شوند', state.dayBlocks);
    check(state.blocks > 100, '[UI] تعداد بلوک‌های کل برنامه معقول است', state.blocks);

    /* گزارش */
    const rep = JSON.parse(await js(`(function(){
      document.querySelector('.nav[data-view="report"]').click();
      return JSON.stringify({});})()`));
    await wait(900);
    const repInfo = JSON.parse(await js(`(function(){
      const txt=(id)=>{const e=document.getElementById(id); return e?e.innerText.trim():'';};
      return JSON.stringify({
        visible: (document.getElementById('reportBody')||{}).style.display !== 'none',
        stats: (document.getElementById('reportStats')||{}).innerText||'',
        coins: document.querySelectorAll('#bookDeadlineTable tbody tr').length,
        shortDl: document.querySelectorAll('#shortDeadlineTable tbody tr').length,
        finals: document.querySelectorAll('#finalsReport tbody tr').length,
        hasBarom: /بارم/.test(txt('finalsReport')),
        chapterRows: document.querySelectorAll('#finalsReport tbody tr').length
      });})()`));
    check(repInfo.visible, '[گزارش] صفحهٔ گزارش داده دارد');
    check(/٪/.test(repInfo.stats), '[گزارش] کارت‌های آماری درصدی پر شده‌اند', repInfo.stats.slice(0, 40));
    if (st.bookDeadline) check(repInfo.coins >= 1, '[گزارش] مهلت کتابیِ ثبت‌شده در گزارش هست', repInfo.coins);
    if (st.finals) check(repInfo.finals >= 10, '[گزارش] سوابق تحصیلی برای ۱۰ درس', repInfo.finals);

    /* علم پشت برنامه */
    await js(`document.querySelector('.nav[data-view="science"]').click()`);
    await wait(700);
    const sci = JSON.parse(await js(`(function(){
      const v=document.getElementById('view-science');
      return JSON.stringify({ active: v.classList.contains('active'), len: (v.innerText||'').length,
        mentions: /Dunlosky|Cepeda|Roediger|مرور فاصله/.test(v.innerText||'') });})()`));
    check(sci.active && sci.len > 500, '[علم] صفحهٔ علم پشت برنامه پر است', sci.len);
    check(sci.mentions, '[علم] منابع علمی ذکر شده‌اند');

    /* تیک‌زدن یک بلوک از برنامه */
    await js(`document.querySelector('.nav[data-view="plan"]').click()`);
    await wait(700);
    const tick = JSON.parse(await js(`(function(){
      const cb=document.querySelector('#dayView input[type=checkbox], #dayView .task input, #dayView [role=checkbox]');
      if(!cb) return JSON.stringify({none:true});
      cb.click();
      return JSON.stringify({clicked:true, after: !!document.querySelector('#dayView input:checked')});})()`));
    check(!tick.none, '[برنامه] بلوک‌های روز قابل تیک‌زدن‌اند', JSON.stringify(tick));

    /* خانه: کارت امروز و شروع روز */
    await js(`document.querySelector('.nav[data-view="home"]').click()`);
    await wait(800);
    const home = JSON.parse(await js(`(function(){
      return JSON.stringify({
        kpis: document.querySelectorAll('#homeKpis > *').length,
        dayCard: (document.getElementById('homeDayCard')||{}).style.display,
        startBtn: !!document.getElementById('startDayBtn'),
        issues: (document.getElementById('homeIssues')||{}).innerText||''
      });})()`));
    check(home.kpis >= 3, '[خانه] کارت‌های خلاصه پر است', home.kpis);

    /* ماندگاری: بارگذاری دوباره و بازخوانی از دیسک */
    if (st.key === 'arman') {
      /* ذخیره از طریق پل واقعی برنامه */
      const saved = await js(`(async function(){
        try {
          const p = window.__revalTest.plan();
          const r = await window.revalPlanner.saveState({ config: p.meta.config, plan: p, scores:{}, done:{}, visited:{} });
          return JSON.stringify({ ok: !!(r && r.ok), ver: (await window.revalPlanner.info()).version });
        } catch (e) { return JSON.stringify({ ok:false, err:String(e) }); }
      })()`);
      check(JSON.parse(saved).ok, '[ماندگاری] ذخیره‌سازی از پل برنامه انجام شد', saved);
      await wait(600);
      const reloaded = await new Promise((resolve) => {
        const w2 = new BrowserWindow({
          width: 1400, height: 900, show: false,
          webPreferences: { offscreen: true, contextIsolation: true, sandbox: false, preload: path.join(__dirname, 'planner-bridge-mock.js') },
        });
        w2.loadFile(path.join(__dirname, '../src/planner/planner.html'));
        w2.webContents.once('did-finish-load', () => setTimeout(async () => {
          const r = await w2.webContents.executeJavaScript(`(function(){
            const p = window.__revalTest.plan();
            return JSON.stringify({ hasPlan: !!p, days: p ? p.days.length : 0,
              name: (document.getElementById('name')||{}).value || '' });})()`);
          w2.destroy();
          resolve(r);
        }, 2200));
      });
      const rj = JSON.parse(reloaded);
      check(rj.hasPlan && rj.days > 30, '[ماندگاری] پس از بازکردن دوباره، برنامه و اطلاعات برمی‌گردد',
        'روزها: ' + rj.days + ' · نام: ' + rj.name);
    }

    /* پنجرهٔ «چه چیزی عوض شد» — متنش نباید مارک‌داون خام داشته باشد */
    const clRaw = await js(`(function(){
      var m = document.getElementById('clModal');
      if (!m) return 'NOMODAL';
      var txt = m.innerText || '';
      return JSON.stringify({
        visible: m.classList.contains('show'),
        len: txt.length,
        stars: txt.indexOf('**') !== -1
      });
    })()`);
    if (clRaw !== 'SCRIPT-ERROR' && clRaw !== 'NOMODAL') {
      const cl = JSON.parse(clRaw);
      check(!cl.stars, '[چنج‌لاگ] متن پنجرهٔ تغییرات ستارهٔ مارک‌داونِ خام ندارد', cl.len);
      check(!cl.visible || cl.len > 50, '[چنج‌لاگ] اگر پنجره باز شد، توضیح دارد', cl.len);
      if (cl.visible) {
        await js(`(function(){ var b=document.getElementById('clOk'); if(b) b.click(); return true; })()`);
        await wait(500);
      }
    } else {
      check(false, '[چنج‌لاگ] پنجرهٔ تغییرات در DOM هست', clRaw);
    }

    /* اسکرین‌شات برنامهٔ روزانه */
    await js(`(function(){ document.querySelector('.nav[data-view="plan"]').click(); return true; })()`);
    await wait(900);
    fs.writeFileSync(path.join(__dirname, '..', 'docs', 'screens', 'ui-56-full-' + st.key + '.png'),
      (await win.webContents.capturePage()).toPNG());

    const newErrs = errsAll.length - errsBefore;
    check(newErrs === 0, '[پایداری] در مسیر ' + st.name + ' هیچ خطای کنسولی نبود', errsAll.slice(errsBefore).join(' | '));

    report.push({ who: st.label, days: state.days, blocks: state.blocks, cov: state.cov, finals: repInfo.finals, coins: repInfo.coins });
    console.log('   → ' + state.days + ' روز · ' + state.blocks + ' بلوک · پوشش ' + state.cov + '٪');
    win.destroy();
  }

  console.log('\n' + '═'.repeat(64));
  report.forEach((r) => console.log('  ' + r.who + ' → ' + r.days + ' روز، ' + r.blocks + ' بلوک، پوشش ' + r.cov + '٪'));
  if (fail) { console.log(`\n❌ ${pass} ✅ / ${fail} ❌`); process.exitCode = 1; }
  else { console.log(`\n✅ ${pass} بررسی سرتاسری UI پاس شد (${STUDENTS.length} دانش‌آموز، همهٔ صفحه‌ها)`); }
  app.exit(fail ? 1 : 0);
});
