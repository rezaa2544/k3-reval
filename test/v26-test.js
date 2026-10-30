/* تست‌های نسخهٔ ۲.۶
   ۱) یک دکمهٔ «شروع روز» و شروع خودکار اولین تسک
   ۲) آیتم اضطراری: دکمه ← منوی ورودی ← ثبت ← بسته‌شدن منو
   ۳) «امروز امروز» تکراری نشود
   ۴) پایان فصل با تأیید
   ۵) آلارم پایان زمان + «هنوز می‌خوانم؟» + حل تکلیف در بازگشت کاربر
   ۶) رنگ سبز/زنده برای بلوک در حال اجرا و زرد برای رزرو بعدی
   ۷) یادآوری سطح اهمیت فصل‌ها
   ۸) فونت و نمایش ساعت
*/
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const DP = require('../src/planner/dayplan.js');
const CW = require('../src/planner/chapter-weights.js');

let n = 0;
const ok = (cond, msg) => { assert.ok(cond, msg); n += 1; console.log('✓ ' + msg); };
const eq = (a, b, msg) => { assert.strictEqual(a, b, msg + ' (' + a + ' ≠ ' + b + ')'); n += 1; console.log('✓ ' + msg); };

const ROOT = path.join(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');
const HTML = read('src/planner/planner.html');
const JS = read('src/planner/planner.js');

const MIN = 60000;
const BLOCK = { minutes: 45, start: '09:00', end: '09:45', kind: 'learn', subjectId: 'bio', topicId: 'bio.c18' };

/* ═══ ۱) وضعیت «منتظر پاسخ» و اضافه‌کاری ═══ */
{
  const s0 = DP.newSession(BLOCK);
  eq(s0.status, 'idle', 'بلوک تازه در وضعیت «شروع‌نشده» است');
  eq(s0.plannedMinutes, 45, 'زمان برنامه‌ریزی‌شدهٔ بلوک ۴۵ دقیقه است');

  const running = DP.start(s0, 0);
  eq(running.status, 'running', 'با «شروع» تایمر اجرا می‌شود');
  ok(!DP.plannedReached(running, 44 * MIN), 'پیش از ۴۵ دقیقه هنوز به پایان نرسیده');

  /* tick دیگر بلوک را نمی‌بندد؛ فقط منتظر پاسخ می‌کند */
  const aw = DP.tick(running, 46 * MIN);
  eq(aw.status, 'awaiting', 'در پایان زمان برنامه‌ریزی‌شده ⇒ «منتظر پاسخ» (نه بسته‌شدن خودکار)');
  ok(aw.awaitSince != null, 'لحظهٔ شروع انتظار ثبت می‌شود');
  eq(aw.awaitAsked, false, 'پرچم «پرسیده‌شد» ابتدا خاموش است');
  eq(Math.round(aw.accumMs / MIN), 45, 'زمان ثبت‌شده تا سقفِ برنامه‌ریزی‌شده متوقف می‌شود');

  /* بله، هنوز می‌خوانم ⇒ تایمر ادامه + اضافه‌کاری */
  const yes = DP.answerStillStudying(aw, 76 * MIN);   // ۳۰ دقیقه بعد جواب می‌دهد
  eq(yes.status, 'running', 'پاسخ «هنوز می‌خوانم» تایمر را دوباره اجرا می‌کند');
  eq(yes.overtime, true, 'پرچم اضافه‌کاری روشن می‌شود');
  eq(Math.round(yes.accumMs / MIN), 75, 'زمان انتظار (۳۰ دقیقه) به زمان مطالعه اضافه می‌شود');
  ok(DP.tick(yes, 400 * MIN).status === 'running', 'در حالت اضافه‌کاری دیگر پرسش تکرار نمی‌شود');
  eq(DP.plannedReached(yes, 400 * MIN), false, 'بلوکِ اضافه‌کاری دوباره «رسیده» علامت نمی‌خورد');

  /* سقف اعتبار زمانِ انتظار */
  const longWait = DP.answerStillStudying(aw, 1000 * MIN);
  ok(Math.round(longWait.accumMs / MIN) <= 45 + DP.MAX_CREDIT_MIN,
    'زمان انتظار بیش از سقف (' + DP.MAX_CREDIT_MIN + ' دقیقه) حساب نمی‌شود');
}

/* ═══ ۲) پاسخ «رفته بودم» و بازیابی در بازگشت ═══ */
{
  const aw = DP.tick(DP.start(DP.newSession(BLOCK), 0), 50 * MIN);
  const away = DP.answerAway(aw, 140 * MIN);
  eq(away.status, 'done', 'پاسخ «نه، تمام شد» بلوک را می‌بندد');
  eq(away.awayAnswered, true, 'پرچم «رفته بودم» ثبت می‌شود');
  ok(away.missedMs >= 89 * MIN, 'زمان نبودن کاربر جداگانه نگه داشته می‌شود');
  eq(Math.round(away.accumMs / MIN), 45, 'زمان مطالعه از سقف برنامه‌ریزی‌شده بیشتر ثبت نمی‌شود');
}

/* ═══ ۳) پایان فصل با تأیید ═══ */
{
  const st = DP.start(DP.newSession(BLOCK), 0);
  const closed = DP.closeConfirmed(st, 30 * MIN);   // ۳۰ دقیقه از ۴۵ دقیقه
  eq(closed.status, 'done', '«پایان فصل» بلوک را تمام‌شده می‌کند');
  eq(closed.confirmed, true, 'تأیید کاربر ثبت می‌شود');
  eq(closed.earlyClose, true, 'بستن پیش از پایان زمان برنامه‌ریزی‌شده علامت‌گذاری می‌شود');
  eq(Math.round(closed.accumMs / MIN), 30, 'زمان واقعی خوانده‌شده (۳۰ دقیقه) حفظ می‌شود');

  const full = DP.closeConfirmed(DP.start(DP.newSession(BLOCK), 0), 60 * MIN);
  eq(full.earlyClose, false, 'اگر زمان برنامه‌ریزی‌شده پر شده باشد «زودتر تمام‌شده» نیست');
}

/* ═══ ۴) برچسب‌های فارسی وضعیت ═══ */
{
  eq(DP.statusFa({ status: 'idle' }), 'شروع نشده', 'برچسب وضعیت شروع‌نشده');
  ok(/منتظر پاسخ/.test(DP.statusFa({ status: 'awaiting' })), 'برچسب وضعیت «منتظر پاسخ»');
  ok(/اضافه‌کاری/.test(DP.statusFa({ status: 'running', overtime: true })), 'برچسب اضافه‌کاری در حال اجرا');
  ok(/پیش از پایان/.test(DP.statusFa({ status: 'done', earlyClose: true })), 'برچسب اتمام زودهنگام با تأیید');
  ok(/مکس/.test(DP.statusFa({ status: 'paused' })), 'برچسب توقف (مکس)');
}

/* ═══ ۵) رابط کاربری: یک دکمه برای شروع روز ═══ */
{
  ok(HTML.includes('id="startDayBtn"'), 'دکمهٔ «شروع روز» وجود دارد');
  ok(/بیدار شدم/.test(HTML), 'متن دکمه صریحاً «بیدار شدم» است');
  ok(/اولین تسک خودکار شروع/.test(HTML), 'کارت توضیح می‌دهد که اولین تسک خودکار شروع می‌شود');
  /* در بخش اصلی کارت، فقط یک دکمهٔ primary وجود دارد */
  const cardHtml = HTML.slice(HTML.indexOf('id="homeDayCard"'), HTML.indexOf('id="emergencyCard"'));
  const primaryCount = (cardHtml.match(/btn primary/g) || []).length;
  eq(primaryCount, 1, 'کارت «شروع روز» فقط یک دکمهٔ اصلی (primary) دارد');
  ok(/id="startDayAt"/.test(HTML), 'ورود دستی ساعت فقط به‌صورت گزینهٔ فرعی وجود دارد');
  ok(/function startDayNow/.test(JS), 'منطق «شروع از همین لحظه» پیاده شده است');
  ok(/startDayBtn'\)\)\s*\$\('startDayBtn'\)\.addEventListener\('click'/.test(JS), 'دکمهٔ شروع روز به همان تابع وصل است');
  ok(/applyTimerAction\(firstKey/.test(JS) || /'start'/.test(JS), 'شروع خودکار اولین تسک پس از بازچینی انجام می‌شود');
}

/* ═══ ۶) آیتم اضطراری: دکمه ← منو ← ثبت ← بسته‌شدن ═══ */
{
  ok(HTML.includes('id="emAdd"'), 'دکمهٔ «ثبت آیتم اضطراری» وجود دارد');
  ok(HTML.includes('id="emModal"'), 'منوی ورودی آیتم اضطراری وجود دارد');
  ok(/id="emModal"[\s\S]{0,4000}class="modal/.test(HTML) || /class="modal"[\s\S]{0,200}id="emModal"/.test(HTML),
    'منو با کلاس modal ساخته شده است');
  const cardHtml = HTML.slice(HTML.indexOf('id="emergencyCard"'), HTML.indexOf('id="homeTodayCard"'));
  ok(!/id="emSubject"/.test(cardHtml), 'فرم به‌صورت دائمی داخل کارت نیست (فقط با دکمه باز می‌شود)');
  ok(/function openEmergencyModal/.test(JS) && /function closeEmergencyModal/.test(JS), 'باز/بستن منو پیاده شده');
  ok(/closeEmergencyModal\(\);/.test(JS), 'پس از ثبت، منو بسته می‌شود');
}

/* ═══ ۷) «امروز امروز» تکراری نشود ═══ */
{
  ok(HTML.includes('id="homeTodayTitle"'), 'عنوان تاریخ در تیتر، شناسهٔ مستقل دارد');
  ok(!/برنامهٔ امروز امروز/.test(HTML), 'الگوی «امروز امروز» در HTML نیست');
  ok(!/برنامهٔ امروز امروز/.test(JS), 'الگوی «امروز امروز» در جاوااسکریپت هم ساخته نمی‌شود');
  ok(/homeTodayTitle/.test(JS) && /'برنامهٔ امروز'/.test(JS), 'عنوان به‌صورت یک‌بار نوشته می‌شود');
}

/* ═══ ۸) آلارم صوتی پایان زمان و پرسش اضافه‌کاری ═══ */
{
  ok(/function alarmBeep/.test(JS), 'آلارم صوتی پیاده شده است');
  ok(/AudioContext/.test(JS), 'آلارم از WebAudio استفاده می‌کند (بدون فایل خارجی)');
  ok(/function askOvertime/.test(JS), 'پرسش «هنوز مشغول درس خواندن هستی؟» وجود دارد');
  ok(/هنوز مشغول درس‌خواندن همين بخش هستی|هنوز مشغول درس‌خواندنِ همین بخش هستی|هنوز مشغول/.test(JS),
    'متن پرسش اضافه‌کاری همان چیزی است که کاربر خواست');
  ok(/function askUnattended/.test(JS), 'پرسش «درس می‌خواندی یا رفته بودی؟» برای بازگشت وجود دارد');
  ok(/window\.addEventListener\('focus', onUserActivity\)/.test(JS), 'بازگشت به برنامه (focus) تشخیص داده می‌شود');
  ok(/visibilitychange/.test(JS), 'تغییر visibility هم به‌عنوان فعالیت کاربر شمرده می‌شود');
  ok(/'pointerdown', 'keydown'/.test(JS), 'اولین کلیک/کلید کاربر فعالیت محسوب می‌شود');
  ok(/setInterval\(\(\) => \{ try \{ tickTimers/.test(JS), 'حلقهٔ تیک تایمرها فعال است');
  ok(/reconcileSessions/.test(JS), 'وضعیت تایمرهای بازمانده هنگام بازشدن برنامه آشتی داده می‌شود');
}

/* ═══ ۹) رنگ‌بندی وضعیت‌ها (۲.۷: آبی=در جریان، سبز=تمام‌شده، زرد=بعدی، قرمز=در صف) ═══ */
{
  ok(/\.block\.live\{/.test(HTML), 'استایل «در حال اجرا» تعریف شده');
  ok(/#2563eb/.test(HTML.slice(HTML.indexOf('.block.live{'), HTML.indexOf('.block.live{') + 200)),
    'رنگ بلوک در حال اجرا آبی است');
  ok(/\.block\.next\{/.test(HTML) && /#f59e0b/.test(HTML.slice(HTML.indexOf('.block.next{'), HTML.indexOf('.block.next{') + 160)),
    'رنگ بلوک بعدی زرد است');
  ok(/\.block\.queued\{/.test(HTML) && /#f87171/.test(HTML.slice(HTML.indexOf('.block.queued{'), HTML.indexOf('.block.queued{') + 120)),
    'بلوک‌های در صف قرمز ملایم‌اند');
  ok(/\.block\.isdone\{/.test(HTML) && /#10b981/.test(HTML.slice(HTML.indexOf('.block.isdone{'), HTML.indexOf('.block.isdone{') + 120)),
    'بلوک تمام‌شده سبز است');
  ok(/\.doneTick\{/.test(HTML) && /function doneTick/.test(JS), 'بلوک تمام‌شده تیک سبز دارد');
  ok(/background:#fff/.test(HTML.slice(HTML.indexOf('  .block{'), HTML.indexOf('  .block{') + 400)),
    'کادر بلوک سفید است و رنگ فقط داخل آن می‌آید');
  ok(/@keyframes pulseDot/.test(HTML), 'حالت زنده نبض‌دار (pulse) دارد');
  ok(/function blockStateClass/.test(JS), 'کلاس وضعیت بلوک در جاوااسکریپت محاسبه می‌شود');
  ok(/function nextBlockKey/.test(JS), 'بلوک رزرو بعدی محاسبه می‌شود');
  ok(/blockStateClass\(d, bi\)|blockStateClass\(d, i\)/.test(JS), 'کلاس وضعیت در فهرست امروز و نمای روز اعمال می‌شود');
}

/* ═══ ۱۰) اهمیت فصل: درصد از کل کتاب + رتبه در همان کتاب ═══ */
{
  ok(/function chapterBadge/.test(JS), 'نشان اهمیت فصل ساخته می‌شود');
  ok(/function chapterMetaOf/.test(JS), 'فرادادهٔ فصل (شماره/نام/درصد/رتبه) محاسبه می‌شود');
  ok(/function chapterInfoOf/.test(JS), 'اهمیت از ماژول داده‌های پژوهشی خوانده می‌شود');
  ok(/function chapterLine/.test(JS), 'خط «این فصل چیست» در کارت بلوک ساخته می‌شود');
  ok(/رتبهٔ /.test(JS) && /٪<\/b> از کتاب|از کتاب/.test(JS), 'نشان، درصد از کتاب و رتبه را نشان می‌دهد');
  ok(/function blockGoals/.test(JS), 'اهداف هر بلوک تولید می‌شود');
  ok(/function goalsHtml/.test(JS) && /این بلوک از تو چه می‌خواهد/.test(JS), 'اهداف داخل کارت بلوک نمایش داده می‌شود');
  ok(/مرور روی: /.test(JS), 'برای بلوک مرور، مبحثِ هدف صریح نوشته می‌شود');
  ok(/chapterLine\(b\)|chapterLine\(block\)/.test(JS), 'نام و شمارهٔ فصل کنار موضوع بلوک می‌آید');
  ok(/\.imp-hot\{/.test(HTML) && /\.imp-mid\{/.test(HTML), 'نشان اهمیت دو سطح رنگی دارد');

  const info = CW.chapterInfo('bio', 18);
  ok(info && info.sharePct > 0 && info.sharePct < 100, 'سهم فصل ۱۸ زیست از کتاب، درصدی معتبر است');
  ok(info && info.q > 0, 'تعداد سؤال کنکورِ فصل ۱۸ زیست مثبت است');
}

/* ═══ ۱۱) فونت و نمایش ساعت ═══ */
{
  ok(/@font-face/.test(HTML), 'فونت‌ها به‌صورت محلی تعریف شده‌اند (بدون اینترنت)');
  ok(/fonts\/Vazirmatn-Regular\.woff2/.test(HTML), 'فونت Vazirmatn برای متن بارگذاری می‌شود');
  ok(/fonts\/Estedad-var\.woff2/.test(HTML), 'فونت Estedad برای اعداد و تیترها بارگذاری می‌شود');
  ['Vazirmatn-Regular', 'Vazirmatn-Medium', 'Vazirmatn-SemiBold', 'Vazirmatn-Bold', 'Estedad-var'].forEach((f) => {
    const p = path.join(ROOT, 'src/planner/fonts', f + '.woff2');
    ok(fs.existsSync(p) && fs.statSync(p).size > 20000, 'فایل فونت ' + f + ' همراه برنامه هست');
  });
  ok(!/font-family:"Segoe UI",Tahoma/.test(HTML), 'فونت پیش‌فرض قبلی (Segoe UI/Tahoma) کنار گذاشته شد');
  ok(/tabular-nums/.test(HTML), 'اعداد با فونت جدولی (tabular-nums) نمایش داده می‌شوند');
  ok(/function padHM/.test(JS), 'ساعت‌ها همیشه دورقمی نمایش داده می‌شوند');
  ok(/function timeRange/.test(JS), 'بازهٔ ساعت با تابع یکدست ساخته می‌شود');
  ok(/'تا'|>تا</.test(JS) || /class="sep">تا</.test(JS), 'بین دو ساعت واژهٔ «تا» نوشته می‌شود');
  ok(!/faNum\(b\.start\) \+ '–' \+ faNum\(b\.end\)/.test(JS), 'دیگر از خط تیرهٔ خام برای ساعت استفاده نمی‌شود');
  ok(/function durationFa/.test(JS), 'مدت زمان به‌صورت «x ساعت و y دقیقه» خوانده می‌شود');
}

/* ═══ ۱۲) ساعت لاتین + انتخاب کشویی ساعت ═══ */
{
  ok(/function upgradeTimeInputs/.test(JS), 'ورودی‌های ساعت به منوی کشویی تبدیل می‌شوند');
  ok(/wrap.className = 'tpick'/.test(JS) && /data-role="h"/.test(JS) && /data-role="m"/.test(JS),
    'دو منوی «ساعت» و «دقیقه» ساخته می‌شود');
  ok(/\.tpick-s\{/.test(HTML), 'استایل منوی ساعت تعریف شده');
  ok(/HOURS24/.test(JS) && /MIN_STEPS/.test(JS), 'گزینه‌های ساعت (۰۰–۲۳) و دقیقه (گام ۵) آماده‌اند');
  ok(/function padHM/.test(JS) && !/return faNum\(hh \+ ':' \+ mm\)/.test(JS),
    'ساعت‌ها با رقم لاتین نوشته می‌شوند');
  ok(/tabular-nums/.test(HTML), 'اعداد ساعت هم‌عرض (tabular) هستند');
  ok(/MutationObserver/.test(JS), 'منوهای ساعت برای ورودی‌های تازه هم ساخته می‌شوند');
}

/* ═══ ۱۳) اهداف و توضیح فصل در هر بلوک ═══ */
{
  ok(/این بلوک از تو چه می‌خواهد/.test(JS), 'عنوان «این بلوک از تو چه می‌خواهد؟» وجود دارد');
  ok(/'مرور روی: '/.test(JS), 'برای مرور، مبحث هدف صریح بیان می‌شود');
  ok(/فصل ' \+ faNum\(m\.bookNo\)/.test(JS), 'شمارهٔ فصلِ کتاب (نه شمارهٔ کلی) نمایش داده می‌شود');
  ok(/رتبهٔ /.test(JS) && /٪<\/b> از کتاب/.test(JS), 'درصد از کتاب و رتبهٔ اهمیت نمایش داده می‌شود');
  ok(/\.goals\{/.test(HTML), 'استایل اهداف بلوک تعریف شده');
}

/* ═══ ۱۴) نسخه ═══ */
{
  const pkg = JSON.parse(read('package.json'));
  ok(String(pkg.version).split('.').map(Number)[0] >= 2, 'نسخهٔ بسته ۲ یا بالاتر است');
  const eng = read('src/planner/engine.js');
  ok(/version: '2\.[0-9]+\.[0-9]+'/.test(eng), 'نسخهٔ موتور در فایل ثبت شده است');
}

console.log('\n✅ ' + n + ' تست نسخهٔ ۲.۶ (شروع روز یک‌دکمه‌ای · اضطراری منویی · پایان فصل · آلارم اضافه‌کاری · رنگ زنده/رزرو · اهمیت فصل · فونت) پاس شد');
