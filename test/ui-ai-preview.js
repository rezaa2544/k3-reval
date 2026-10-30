/* تست رابط مشاور هوش مصنوعی (Electron)
   دو مسیر آزمایش می‌شود:
     ۱) حالت آفلاین: فهم دستور فارسی و تغییر واقعی برنامه
     ۲) حالت مدل زبانی: حلقهٔ tool-calling با یک مدل ساختگی (بدون نیاز به اینترنت/کلید)
   و اسکرین‌شات‌ها برای انتشار */
const { app, BrowserWindow } = require('electron');
const path = require('path');
const fs = require('fs');

const OUT = path.join(__dirname, '..', 'docs', 'screens');
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
app.commandLine.appendSwitch('disable-gpu');
app.commandLine.appendSwitch('disable-software-rasterizer');
app.commandLine.appendSwitch('disable-dev-shm-usage');
app.disableHardwareAcceleration();

let pass = 0; let fail = 0;
const check = (cond, msg, extra) => {
  if (cond) { pass += 1; console.log('PASS ' + msg); } else { fail += 1; console.log('FAIL ' + msg + (extra ? ' → ' + extra : '')); }
};

app.whenReady().then(async () => {
  const win = new BrowserWindow({ width: 1280, height: 980, show: false, webPreferences: { offscreen: true, contextIsolation: false } });
  const errs = [];
  win.webContents.on('console-message', (_e, lvl, msg) => { if (lvl >= 2) errs.push(String(msg).slice(0, 200)); });
  await win.loadFile(path.join(__dirname, '../src/planner/planner.html'));
  const js0 = (c) => win.webContents.executeJavaScript(c);
  await wait(1200);
  const js = (c) => win.webContents.executeJavaScript(c);
  const shot = async (name) => { fs.writeFileSync(path.join(OUT, name), (await win.webContents.capturePage()).toPNG()); console.log('shot →', name); };

  /* ساعت ثابت ۰۹:۰۰ برای خوانایی اسکرین‌شات‌ها */
  await js(`(function(){const Real=Date;const f=new Real();f.setHours(9,0,0,0);const OFF=f.getTime()-Real.now();
    function F(a,b,c,d,e,g,h){if(!arguments.length)return new Real(Real.now()+OFF);if(arguments.length===1)return new Real(a);return new Real(a,b,c==null?1:c,d||0,e||0,g||0,h||0);}
    F.prototype=Real.prototype;F.now=()=>Real.now()+OFF;F.parse=Real.parse;F.UTC=Real.UTC;window.Date=F;return true;})()`);
  await js(`(function(){const sel=document.getElementById('restDay');const p=(new Date().getDay()+1)%7;
    sel.value=String((p+4)%7); sel.dispatchEvent(new Event('change',{bubbles:true})); return 1;})()`);
  await js(`document.getElementById('build').click(), true`);
  /* تا آماده شدن برنامه صبر می‌کنیم (ساخت در ماشین‌های کند چند ثانیه طول می‌کشد) */
  for (let i = 0; i < 40; i += 1) {
    await wait(400);
    const have = await js(`!!(window.__revalTest && window.__revalTest.plan() && window.__revalTest.plan().summary)`);
    if (have) break;
  }
  await wait(600);
  /* گفت‌وگو را از صفر شروع می‌کنیم تا اسکرین‌شات‌ها تکرارپذیر باشند */
  await js(`document.getElementById('aiClearBtn').click(), true`);
  await wait(300);
  await js(`window.__revalAI.close(), true`);

  /* ── ۰) اجزای رابط ── */
  const ui = await js(`JSON.stringify({
    fab: !!document.getElementById('aiFab'),
    panel: !!document.getElementById('aiPanel'),
    input: !!document.getElementById('aiInput'),
    modal: !!document.getElementById('aiModal'),
    mods: [!!window.RevalAINLU, !!window.RevalAIKnowledge, !!window.RevalAITools, !!window.RevalAIBrain],
  })`);
  const U = JSON.parse(ui);
  check(U.fab && U.panel && U.input && U.modal, 'اجزای پنل گفت‌وگو در صفحه هستند', ui);
  check(U.mods.every(Boolean), 'هر چهار ماژول هوش مصنوعی بارگذاری شده‌اند', ui);

  /* ── ۱) باز کردن پنل ── */
  await js('window.__revalAI.open(), true');
  await wait(600);
  const opened = await js('window.__revalAI.state().open');
  check(opened === true, 'دکمهٔ شناور پنل را باز می‌کند');
  const opening = await js('JSON.stringify(window.__revalAI.history()[0])');
  check(/پوشش/.test(opening), 'پیام آغازین وضعیت برنامه را می‌گوید', opening.slice(0, 120));
  await shot('ui-42-ai-panel-open.png');

  /* ── ۲) پرسش برنامه (آفلاین) ── */
  const before = await js('JSON.stringify(window.__revalTest.plan().summary.coverage.coverageRatio)');
  await js(`window.__revalAI.send('برنامه امروز چیه'), true`);
  await wait(1200);
  const planAns = await js('JSON.stringify(window.__revalAI.history().slice(-1)[0])');
  check(/۰۹:۰۰|بلوک/.test(planAns), 'پرسش «برنامهٔ امروز» با بلوک‌ها پاسخ می‌گیرد', planAns.slice(0, 160));

  /* ── ۳) تغییر واقعی برنامه با دستور فارسی ── */
  await js(`window.__revalAI.send('روزهای عادی ۵ ساعت'), true`);
  await wait(600);
  await js(`window.__revalAI.ready()`).catch(() => {});
  await wait(2600);
  const afterHours = await js('JSON.stringify(window.__revalTest.plan().summary.totalHours)');
  check(Number(afterHours) > 0, 'پس از تغییر ساعت، برنامه بازسازی شده است', afterHours);
  const acts = await js(`JSON.stringify((window.__revalAI.history().slice(-1)[0].actions)||[])`);
  check(/set_daily_study_hours/.test(acts) && /true/.test(acts), 'ابزار «تنظیم ساعت مطالعه» اجرا و موفق بوده', acts);
  await shot('ui-43-ai-changed-hours.png');

  /* ── ۴) بازچینش امروز ── */
  await js(`window.__revalAI.send('امروز را از نو بچین'), true`);
  await wait(600);
  await js(`window.__revalAI.ready()`).catch(() => {});
  await wait(2600);
  const replan = await js(`JSON.stringify(window.__revalAI.history().slice(-1)[0])`);
  check(/replan_today/.test(replan), 'دستور بازچینش امروز اجرا می‌شود', replan.slice(0, 200));

  /* ── ۵) گزارش آمادگی ── */
  await js(`window.__revalAI.send('چقدر آماده‌ام؟'), true`);
  await wait(900);
  const report = await js(`JSON.stringify(window.__revalAI.history().slice(-1)[0].content)`);
  check(/آمادگی کنکور/.test(report) && /پوشش/.test(report), 'گزارش آمادگی با اعداد واقعی می‌آید', report.slice(0, 160));

  /* ── ۶) دانش مشاوره (روش مطالعه) ── */
  await js(`window.__revalAI.send('چطور زیست بخونم؟'), true`);
  await wait(900);
  const method = await js(`JSON.stringify(window.__revalAI.history().slice(-1)[0].content)`);
  check(/کتاب درسی/.test(method), 'راهبرد اختصاصی درس گفته می‌شود', method.slice(0, 120));
  await shot('ui-44-ai-method-advice.png');

  /* ── ۷) مسیر مدل زبانی با مدل ساختگی: حلقهٔ tool-calling ── */
  let step = 0;
  await js(`(function(){
    window.__aiCalls = [];
    const fake = {
      config: async () => ({ ready: true }),
      chat: async (payload) => {
        window.__aiCalls.push(payload.messages.length);
        /* نوبت اول: مدل یک ابزار را صدا می‌زند */
        if (window.__aiCalls.length === 1) {
          return { ok: true, message: { role: 'assistant', content: '',
            tool_calls: [{ id: 'call_1', type: 'function', function: { name: 'set_rest_day', arguments: '{"weekday":"fri"}' } }] } };
        }
        /* نوبت بعد: پاسخ نهایی متنی */
        return { ok: true, message: { role: 'assistant', content: 'روز استراحت را جمعه گذاشتم و برنامه را از نو چیدم.' } };
      },
    };
    window.__revalAI.__setApi(fake);
    return true;
  })()`);
  await js(`window.__revalAI.send('استراحت را بذار جمعه'), true`);
  await wait(1500);
  const llmLast = await js('JSON.stringify(window.__revalAI.history().slice(-1)[0])');
  const calls = await js('JSON.stringify(window.__aiCalls)');
  check(/set_rest_day/.test(llmLast), 'مدل زبانی می‌تواند ابزار را صدا بزند', llmLast.slice(0, 200));
  check(/جمعه/.test(llmLast), 'پاسخ نهایی مدل به کاربر نشان داده می‌شود', llmLast.slice(0, 200));
  check(JSON.parse(calls).length >= 2, 'حلقهٔ ابزار→مدل بیش از یک نوبت رفت‌وبرگشت دارد', calls);
  await shot('ui-45-ai-tool-calling.png');

  /* ── ۸) خطای سرویس: باید آفلاین جواب بدهد و صادق باشد ── */
  await js(`(function(){
    window.__revalAI.__setApi({ config: async()=>({ready:true}), chat: async()=>({ ok:false, error:'کلید API پذیرفته نشد.' }) });
    return true;
  })()`);
  await js(`window.__revalAI.send('ساعت مطالعه‌ام را بیشتر کن'), true`);
  await wait(1200);
  const fallback = await js(`JSON.stringify(window.__revalAI.history().slice(-1)[0].content)`);
  check(/کلید API پذیرفته نشد/.test(fallback), 'خطای کلید به کاربر گفته می‌شود', fallback.slice(0, 120));
  check(/آفلاین|جواب/.test(fallback), 'در خطا، پاسخ آفلاین جایگزین می‌شود', fallback.slice(0, 120));

  /* ── ۹) پنجرهٔ تنظیمات ── */
  await js('window.__revalAI.__setApi(null), window.__revalAI.settings(), true');
  await wait(500);
  const modalOpen = await js(`document.getElementById('aiModal').classList.contains('show')`);
  check(modalOpen === true, 'پنجرهٔ تنظیمات هوش مصنوعی باز می‌شود');
  const fields = await js(`JSON.stringify({p:!!document.getElementById('aiProvider'), k:!!document.getElementById('aiKey'), m:!!document.getElementById('aiModel'), t:!!document.getElementById('aiTestBtn')})`);
  const F = JSON.parse(fields);
  check(F.p && F.k && F.m && F.t, 'انتخاب ارائه‌دهنده، کلید، مدل و آزمون اتصال در تنظیمات هست', fields);
  await shot('ui-46-ai-settings.png');

  /* ── ۱۰) هیچ خطای کنسولی ── */
  check(errs.length === 0, 'هیچ خطای جاوااسکریپت در کنسول نیست', errs.slice(0, 2).join(' | '));

  console.log(`\n${fail ? '❌' : '✅'} ${pass} بررسی رابط هوش مصنوعی ${fail ? 'با ' + fail + ' خطا' : 'پاس شد'}\n`);
  win.destroy();
  app.exit(fail ? 1 : 0);
});
