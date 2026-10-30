/* تست‌های نسخهٔ ۲.۸ — مشاور هوش مصنوعی
   ۱) درک زبان فارسی (NLU): نیت و موجودیت‌ها
   ۲) دانش مشاور: روش‌ها، راهبرد درس‌ها، پاسخ‌های احساسی
   ۳) ابزارها: هر ابزار واقعاً چه می‌کند (با ctx ساختگی)
   ۴) مغز آفلاین: پاسخ درست + انجام کار + صداقت
   ۵) کلاینت مدل زبانی: قالب درخواست، tool_calls، خطاها، امنیت کلید */
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const NLU = require('../src/planner/ai/nlu.js');
const KB = require('../src/planner/ai/knowledge.js');
const TOOLS = require('../src/planner/ai/tools.js');
const BRAIN = require('../src/planner/ai/brain.js');
const LLM = require('../src/ai-llm.js');

let n = 0;
const ok = (c, msg) => { assert.ok(c, msg); n += 1; console.log('✓ ' + msg); };
const eq = (a, b, msg) => { assert.strictEqual(a, b, msg + ' (' + a + ' ≠ ' + b + ')'); n += 1; console.log('✓ ' + msg); };

const ROOT = path.join(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');

/* ═══ ۱) NLU ═══ */
{
  eq(NLU.norm('۴ ساعت'), '4 ساعت', 'ارقام فارسی به لاتین تبدیل می‌شوند');
  eq(NLU.parseNumber('روزهای عادی ۵ ساعت'), 5, 'عدد فارسی در جمله پیدا می‌شود');
  eq(NLU.parseNumber('شش ساعت در روز'), 6, 'عدد نوشتاری («شش») فهمیده می‌شود');
  eq(NLU.parseNumber('۴/۵ ساعت'), 4.5, 'عدد اعشاری با ممیز فارسی');
  eq(NLU.parseWeekday('جمعه استراحت باشه').key, 'fri', 'روز هفته استخراج می‌شود');
  eq(NLU.parseWeekday('سه‌شنبه').key, 'tue', 'نیم‌فاصله در روز هفته مشکلی ندارد');
  ok(NLU.parseSubjects('زیست و شیمی').join(',') === 'bio,chem', 'نام درس‌ها تشخیص داده می‌شوند');
  eq(NLU.parseClock('ساعت ۵ عصر').h, 17, 'ساعت با «عصر» تبدیل می‌شود');
  eq(NLU.parseJalali('کنکور ۱۴۰۶/۰۴/۱۰').m, 4, 'تاریخ شمسی با اسلش خوانده می‌شود');
  eq(NLU.parseJalali('۱۰ تیر ۱۴۰۶').m, 4, 'تاریخ شمسی با نام ماه خوانده می‌شود');

  eq(NLU.primary('سلام خوبی'), 'greet', 'نیت سلام');
  eq(NLU.primary('ساعت مطالعه‌ام را بیشتر کن'), 'set_hours', 'نیت افزایش ساعت');
  eq(NLU.primary('جمعه استراحت باشه'), 'set_rest', 'نیت روز استراحت');
  eq(NLU.primary('بلوک‌ها را ۳۰ دقیقه کن'), 'set_block', 'نیت اندازهٔ بلوک');
  eq(NLU.primary('امروز را از نو بچین'), 'replan_today', 'نیت بازچینش امروز');
  eq(NLU.primary('چقدر آماده‌ام'), 'ask_report', 'نیت گزارش آمادگی');
  eq(NLU.primary('برنامه امروز چیه'), 'ask_plan', 'نیت خواندن برنامه');
  eq(NLU.primary('استرس دارم'), 'anxious', 'نیت اضطراب');
  eq(NLU.primary('خسته‌ام'), 'tired', 'نیت خستگی');
  eq(NLU.primary('چطور زیست بخونم'), 'ask_method', 'نیت روش مطالعه');
}

/* ═══ ۲) دانش مشاور ═══ */
{
  ok(KB.METHODS.length >= 8, 'دست‌کم ۸ روش مطالعهٔ مستند در دانش هست');
  ok(KB.METHODS.every((m) => m.name && m.idea && m.evidence && m.apply), 'هر روش: نام، ایده، پشتوانهٔ پژوهشی و کاربرد');
  ok(KB.methodsFor('چطور مرور کنم که فراموش نکنم').some((m) => m.id === 'spacing'), 'مرور فاصله‌دار برای پرسش فراموشی');
  ok(KB.methodsFor('تست می‌زنم ولی غلط‌هام زیاد').some((m) => m.id === 'error-log'), 'دفتر اشتباهات برای پرسش تست');
  ok(KB.strategyFor('bio').length >= 3, 'راهبرد اختصاصی زیست موجود است');
  ok(KB.strategyFor('math').join(' ').indexOf('مسئله') !== -1 || KB.strategyFor('math').join(' ').indexOf('حل') !== -1, 'راهبرد ریاضی روی حل مسئله تأکید دارد');
  ok(KB.KONKUR.coefficients.tajrobi.bio === 12, 'ضریب زیست در تجربی ۱۲ است');
  ok(Math.abs(KB.KONKUR.finalShare - 0.6) < 1e-9, 'سهم سوابق تحصیلی ۶۰٪ است');
  ok(KB.COACHING.tired.length >= 1 && KB.COACHING.anxious.length >= 1, 'پاسخ‌های همدلانه برای خستگی و اضطراب');
}

/* ═══ ۳) ابزارها با ctx ساختگی ═══ */
function fakeCtx() {
  const calls = [];
  const cfg = { availability: { sat: 4, sun: 4, mon: 4, tue: 4, wed: 4, thu: 6, fri: 5 }, restDay: 3, blockMinutes: 45, timeMode: 'fixed', examDate: '2027-07-02' };
  return {
    calls, cfg,
    readConfig: () => ({ avgDailyHours: 4.6, weeklyHours: 31, restDay: cfg.restDay, blockMinutes: cfg.blockMinutes, timeMode: cfg.timeMode }),
    readPlan: () => ({ label: '۱۴۰۵/۰۸/۰۸', blocks: [{ start: '09:00', end: '09:45', minutes: 45, kind: 'learn', kindLabel: 'یادگیری جدید', topic: 'مشتق' }], count: 1, totalMinutes: 45 }),
    readReport: () => ({ coverage: 62, covered: 45, total: 73, hours: 320, daysLeft: 200, examDateFa: '۱۴۰۶/۰۴/۱۰', konkurProjected: 70, konkurCurrent: 0, finalsProjected: 65, finalsCurrent: 40, todayCount: 4, todayMinutes: 180, nextBlock: { start: '09:00', title: 'ریاضی — مشتق' }, weak: 'زیست — گوارش (۳۰٪)', warnings: ['ساعت‌ها کافی نیست'] }),
    readChapters: () => ({ items: [{ subjectName: 'زیست', label: 'جریان اطلاعات', share: 6.3, rank: 1, total: 24, importance: 5, mastery: 40, needMinutes: 225 }] }),
    applyAvailability: (d) => { calls.push(['hours', d]); Object.keys(d).forEach((k) => { cfg.availability[k] = d[k]; }); return { ok: true }; },
    applyRestDay: (k) => { calls.push(['rest', k]); return { ok: true }; },
    applyBlockMinutes: (m) => { calls.push(['block', m]); return { ok: true }; },
    applyExamDate: (t) => { calls.push(['exam', t]); return t ? { ok: true, message: 'تاریخ ثبت شد' } : { ok: false, message: 'باد' }; },
    applyTimeMode: (m, c) => { calls.push(['mode', m, c]); return { ok: true, autoHours: 5 }; },
    rebuild: () => { calls.push(['rebuild']); return { ok: true, message: 'ساخته شد' }; },
    replanToday: () => { calls.push(['replan']); return { ok: true, message: 'بازچیده شد' }; },
    startFirstTask: () => { calls.push(['start']); return { ok: true, message: 'شروع شد' }; },
    addUrgent: (it) => { calls.push(['urgent', it]); return { ok: true, message: 'اضافه شد' }; },
    applyTool(name, args) { return TOOLS.run(name, args, this); },
  };
}

{
  const ctx = fakeCtx();
  const r1 = TOOLS.run('set_daily_study_hours', { hours: 5, weekendHours: 6 }, ctx);
  ok(r1.ok, 'ابزار ساعت مطالعه اجرا می‌شود');
  eq(ctx.cfg.availability.sat, 5, 'ساعت روزهای عادی اعمال شد');
  eq(ctx.cfg.availability.thu, 6, 'ساعت آخر هفته اعمال شد');

  const r2 = TOOLS.run('set_rest_day', { weekday: 'fri' }, ctx);
  ok(r2.ok && /جمعه/.test(r2.message), 'ابزار روز استراحت پیام فارسی درست می‌دهد');

  const r3 = TOOLS.run('set_block_minutes', { minutes: 20 }, ctx);
  ok(!r3.ok, 'بلوک زیر ۲۵ دقیقه رد می‌شود');
  const r4 = TOOLS.run('set_block_minutes', { minutes: 30 }, ctx);
  ok(r4.ok, 'بلوک ۳۰ دقیقه پذیرفته می‌شود');

  const r5 = TOOLS.run('set_exam_date', { jalali: '1406/04/10' }, ctx);
  ok(r5.ok, 'تاریخ کنکور شمسی به ابزار می‌رسد');

  ok(TOOLS.run('set_time_mode', { mode: 'auto', capHours: 7 }, ctx).ok, 'حالت خودکار تنظیم می‌شود');
  ok(TOOLS.run('rebuild_plan', {}, ctx).ok, 'ساخت دوباره اجرا می‌شود');
  ok(TOOLS.run('replan_today', {}, ctx).ok, 'بازچینش امروز اجرا می‌شود');
  ok(TOOLS.run('start_first_task', {}, ctx).ok, 'شروع اولین کار اجرا می‌شود');
  ok(TOOLS.run('add_urgent_item', { topic: 'فصل ۴ زیست', minutes: 45 }, ctx).ok, 'کار ضروری اضافه می‌شود');
  const bad = TOOLS.run('unknown_tool', {}, ctx);
  ok(!bad.ok, 'ابزار ناشناخته خطای مهارشده می‌دهد');
  ok(TOOLS.run('set_daily_study_hours', { hours: 0 }, ctx).ok === false, 'ساعت صفر رد می‌شود');

  const llmTools = TOOLS.forLLM();
  eq(llmTools.length, TOOLS.TOOLS.length, 'همهٔ ابزارها به قالب function-calling تبدیل می‌شوند');
  ok(llmTools.every((t) => t.type === 'function' && t.function.name && t.function.description), 'هر ابزار نام و توضیح دارد');
  ok(TOOLS.helpText().indexOf('ساعت مطالعه') !== -1, 'متن راهنما فهرست توانایی‌ها را می‌دهد');
}

/* ═══ ۴) مغز آفلاین ═══ */
{
  const ctx = fakeCtx();
  const g = BRAIN.respond('سلام', ctx);
  ok(/سلام/.test(g.text) && g.text.length > 10, 'سلام پاسخ می‌گیرد');

  const hours = BRAIN.respond('ساعت مطالعه‌ام را زیاد کن', ctx);
  ok(hours.actions.length === 1 && hours.actions[0].name === 'set_daily_study_hours',
    'درخواست افزایش ساعت، ابزار ساعت را صدا می‌زند');
  ok(ctx.calls.some((c) => c[0] === 'hours'), 'تغییر ساعت واقعاً اعمال شد');

  const rep = BRAIN.respond('چقدر آماده‌ام؟', ctx);
  ok(/پوشش/.test(rep.text) && /۶۲/.test(rep.text), 'گزارش آمادگی با عدد واقعی می‌آید');
  ok(rep.text.indexOf('هشدار') !== -1, 'هشدارهای برنامه در گزارش می‌آیند');

  const planAns = BRAIN.respond('برنامه امروز چیه', ctx);
  ok(/۰۹:۰۰/.test(planAns.text), 'برنامهٔ امروز با ساعت‌ها نمایش داده می‌شود');

  const imp = BRAIN.respond('مهم‌ترین فصل‌ها کدامند', ctx);
  ok(/رتبهٔ/.test(imp.text), 'اهمیت و رتبهٔ فصل در پاسخ هست');

  const anx = BRAIN.respond('خیلی استرس دارم', ctx);
  ok(anx.text.length > 30 && /اضطراب|تنفس|آمادگی/.test(anx.text), 'پاسخ همدلانه و عملی برای استرس');

  const met = BRAIN.respond('چطور زیست بخونم', ctx);
  ok(/کتاب درسی/.test(met.text), 'راهبرد اختصاصی زیست داده می‌شود');

  const help = BRAIN.respond('هرچی', ctx);
  ok(/می‌توانم/.test(help.text), 'درخواست نامفهوم، فهرست توانایی‌ها را می‌دهد');

  const rest = BRAIN.respond('جمعه استراحت باشه', ctx);
  ok(rest.actions.length === 1 && rest.actions[0].name === 'set_rest_day', 'روز استراحت با ابزار اعمال می‌شود');

  const op = BRAIN.opening(ctx);
  ok(/پوشش/.test(op.text) && op.chips.length > 0, 'پیام آغازین وضعیت و پیشنهادها را دارد');
  ok(BRAIN.minutesText(75) === 'یک ساعت و ۱۵ دقیقه' || /۱ ساعت و ۱۵ دقیقه/.test(BRAIN.minutesText(75)), 'مدت زمان خوانا نوشته می‌شود');
}

/* ═══ ۵) کلاینت مدل زبانی ═══ */
async function llmTests() {
  const os = require('os');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'reval-ai-'));

  const empty = LLM.publicConfig(dir);
  ok(empty.hasKey === false && empty.ready === false, 'بدون کلید، وضعیت «آماده نیست» است');
  ok(LLM.providersPublic().length >= 4, 'چهار ارائه‌دهنده پشتیبانی می‌شوند');

  LLM.writeConfig(dir, { provider: 'openai', key: 'sk-test-1234567890abcdef', model: 'gpt-4o-mini' });
  const pub = LLM.publicConfig(dir);
  ok(pub.ready === true, 'با کلید، وضعیت آماده می‌شود');
  ok(pub.key === undefined, 'کلید خام هرگز به رابط برنمی‌گردد');
  ok(/sk-…/.test(pub.keyHint) && pub.keyHint.indexOf('1234567890') === -1, 'فقط سرنخ ماسک‌شدهٔ کلید برمی‌گردد');

  const mode = fs.statSync(LLM.configFile(dir)).mode & 0o777;
  ok(mode === 0o600 || process.platform === 'win32', 'فایل کلید با دسترسی محدود ذخیره می‌شود');

  const calls = [];
  const fake = async (url, opts) => {
    calls.push({ url, body: opts.body, headers: opts.headers });
    return { ok: true, status: 200, json: { choices: [{ message: { role: 'assistant', content: 'سلام، آماده‌ام' } }], usage: { total_tokens: 12 } } };
  };
  const res = await LLM.chat(dir, {
    messages: [{ role: 'user', content: 'سلام' }],
    tools: TOOLS.forLLM(),
  }, { request: fake });
  ok(res.ok && /آماده/.test(res.message.content), 'پاسخ مدل برگردانده می‌شود');
  eq(calls[0].url, 'https://api.openai.com/v1/chat/completions', 'آدرس درست ارائه‌دهنده صدا زده می‌شود');
  ok(calls[0].body.tools && calls[0].body.tools.length, 'ابزارها به مدل معرفی می‌شوند');
  ok(/^Bearer sk-test/.test(calls[0].headers.Authorization), 'کلید در هدر Authorization می‌رود');
  ok(res.usage && res.usage.total_tokens === 12, 'مصرف توکن گزارش می‌شود');

  const toolResp = await LLM.chat(dir, { messages: [{ role: 'user', content: 'ساعت را زیاد کن' }] }, {
    request: async () => ({
      ok: true, status: 200,
      json: { choices: [{ message: { role: 'assistant', content: '', tool_calls: [{ id: 'c1', type: 'function', function: { name: 'set_daily_study_hours', arguments: '{"hours":5}' } }] } }] },
    }),
  });
  ok(toolResp.message.tool_calls && toolResp.message.tool_calls[0].function.name === 'set_daily_study_hours',
    'tool_calls مدل بدون تغییر به رابط می‌رسد');

  const e401 = await LLM.chat(dir, { messages: [] }, { request: async () => ({ ok: false, status: 401, json: { error: { message: 'invalid api key' } } }) });
  ok(!e401.ok && /کلید API پذیرفته نشد/.test(e401.error), 'خطای ۴۰۱ پیام فارسی با راه‌حل می‌دهد');
  const e429 = await LLM.chat(dir, { messages: [] }, { request: async () => ({ ok: false, status: 429, json: {} }) });
  ok(!e429.ok && /سهمیه/.test(e429.error), 'خطای ۴۲۹ توضیح می‌دهد');
  const e0 = await LLM.chat(dir, { messages: [] }, { request: async () => ({ ok: false, status: 0, error: 'ECONNREFUSED' }) });
  ok(!e0.ok && /اتصال برقرار نشد/.test(e0.error), 'خطای شبکه توضیح داده می‌شود');

  LLM.writeConfig(dir, { clearKey: true, key: '' });
  const noKey = await LLM.chat(dir, { messages: [] });
  ok(!noKey.ok && noKey.needsKey === true, 'بدون کلید، درخواست با پرچم needsKey برمی‌گردد');
  fs.rmSync(dir, { recursive: true, force: true });
}

/* ═══ ۶) یکپارچگی در برنامه ═══ */
function uiTests() {
  const html = read('src/planner/planner.html');
  const js = read('src/planner/planner.js');
  const main = read('src/main.js');
  const preload = read('src/planner/planner-preload.js');

  ok(/<script src="ai\/nlu.js"><\/script>/.test(html), 'ماژول NLU در صفحه بارگذاری می‌شود');
  ok(/<script src="ai\/brain.js"><\/script>/.test(html), 'مغز آفلاین بارگذاری می‌شود');
  ok(/id="aiPanel"/.test(html) && /id="aiFab"/.test(html), 'پنل گفت‌وگو و دکمهٔ شناور در UI هست');
  ok(/id="aiInput"/.test(html) && /id="aiSend"/.test(html), 'ورودی و دکمهٔ ارسال هست');
  ok(/id="aiModal"/.test(html) && /id="aiKey"/.test(html), 'پنجرهٔ تنظیمات کلید API هست');
  ok(/id="aiBody"/.test(html), 'ناحیهٔ پیام‌ها هست');

  ok(/ipcMain\.handle\('ai:chat'/.test(main), 'کانال امن گفت‌وگو در main هست');
  ok(/ipcMain\.handle\('ai:save-config'/.test(main), 'کانال ذخیرهٔ کلید هست');
  ok(/ai:config|saveConfig/.test(preload), 'preload پل امن را می‌دهد');
  ok(/contextBridge/.test(preload) && !/nodeIntegration: true/.test(main), 'ایزوله‌سازی context حفظ شده است');

  ok(/function aiLlmReply/.test(js), 'حلقهٔ مدل زبانی در رابط هست');
  ok(/tool_calls/.test(js), 'حلقهٔ اجرای tool_calls پیاده شده است');
  ok(/aiOfflineReply/.test(js), 'مسیر آفلاین وجود دارد');
  ok(/aiSystemPrompt/.test(js), 'سیستم‌پرامپت ساخته می‌شود');
  ok(/reval\.ai\.history/.test(js), 'تاریخچهٔ گفت‌وگو نگه داشته می‌شود');
  ok(/Ctrl|ctrlKey/.test(js), 'میان‌بر صفحه‌کلید برای باز کردن دستیار');
}

(async () => {
  uiTests();
  await llmTests();
  console.log('\n✅ ' + n + ' تست نسخهٔ ۲.۸ (درک زبان فارسی · دانش مشاور · ابزارهای اجرایی · مغز آفلاین · کلاینت مدل زبانی · یکپارچگی UI) پاس شد\n');
})().catch((e) => { console.error('❌', e.message); process.exit(1); });
