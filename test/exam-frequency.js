/* تست موتور «اهمیت واقعی بر پایهٔ آزمون‌های گذشته» (نسخهٔ ۲.۸.۱۲)
   ---------------------------------------------------------------
   چیزهایی که این تست قفل می‌کند:
   ۱) هر درسِ تخصصی، سری زمانیِ چندآزمونی دارد (نه یک عدد دستی).
   ۲) سهم فصل‌ها در هر درس با تعداد سؤال رسمی همان درس می‌خواند.
   ۳) سال‌های جدیدتر وزن بیشتری دارند.
   ۴) ستونِ عیناً تکراری (منبع، عدد یک سال را برای سال بعد تکرار کرده)
      یک‌بار شمرده می‌شود.
   ۵) اولویت = سهم × ضریب درس؛ پس فصلِ پرتکرارِ ضریب‌بالا جلو می‌افتد.
   ۶) تغییر رشته، اعداد را درست بازنشانی می‌کند.
*/
const assert = require('assert');
const EF = require('../src/planner/exam-frequency.js');
const CW = require('../src/planner/chapter-weights.js');

let pass = 0; let fail = 0;
function ok(cond, msg) {
  if (cond) { pass += 1; console.log('✓ ' + msg); } else { fail += 1; console.log('✗ ' + msg); }
}
function near(a, b, eps) { return Math.abs(a - b) <= (eps == null ? 0.05 : eps); }

/* ۱) پوشش دروس */
['bio', 'chem', 'phys', 'math', 'geo'].forEach((sid) => {
  const r = EF.chapters(sid, 'tajrobi');
  ok(Boolean(r), 'دادهٔ فصل‌به‌فصلِ «' + sid + '» برای تجربی موجود است');
  ok(r && r.data.exams >= 3, '«' + sid + '» دست‌کم ۳ آزمون مستقل دارد (' + (r ? r.data.exams : 0) + ')');
});

/* ۲) جمع سهم‌ها = تعداد سؤال درس */
['bio', 'chem', 'phys', 'math', 'geo'].forEach((sid) => {
  const r = EF.chapters(sid, 'tajrobi');
  const sum = r.items.reduce((a, b) => a + b.qAvg, 0);
  ok(near(sum, r.data.qTotal, 0.35), 'جمع سؤال فصل‌های ' + sid + ' ≈ ' + r.data.qTotal + ' (' + Math.round(sum * 100) / 100 + ')');
  const shareSum = r.items.reduce((a, b) => a + b.qShare, 0);
  ok(near(shareSum, 1, 0.01), 'جمع سهم فصل‌های ' + sid + ' = ۱۰۰٪ (' + Math.round(shareSum * 1000) / 10 + '٪)');
});

/* ۳) وزنِ بیشتر برای سال جدیدتر */
{
  const w0 = 1;
  const wLast = Math.pow(EF.GROWTH, 5);
  ok(EF.GROWTH > 1 && wLast > w0 * 1.5, 'وزن سال جدیدتر ≥ ۱٫۵ برابر سال قدیمی‌تر است');
  /* نوسان و موج فیزیک: ۱۳۹۹ هفت سؤال (پرت) ولی میانگین وزنی آن را مهار می‌کند */
  const p = EF.chapters('phys', 'tajrobi').items[9];
  ok(p.qAvg > 3.5 && p.qAvg < 5, 'میانگین وزنی نوسان و موج با وجود سال پرت، نزدیک ۴ می‌ماند (' + p.qAvg + ')');
}

/* ۴) تکرارِ ستون‌ها ادغام می‌شود */
{
  const c = EF.chapters('chem', 'tajrobi');
  const merged = c.data.cols.filter((x) => x.merged && x.merged.length);
  ok(merged.length >= 1, 'ستون‌های عیناً تکراری ادغام شده‌اند (' + merged.map((m) => m.label + '←' + m.merged.join(',')).join(' | ') + ')');
  ok(c.data.exams < 5, 'شیمی با ادغام تکرارها، تعداد آزمونِ مستقلِ کمتری گزارش می‌کند (' + c.data.exams + ')');
  ok(c.data.coarse === true, 'شیمی به‌عنوان «دادهٔ کم‌عمق» علامت خورده');
}

/* ۵) ضریب درس، ترتیب را تعیین می‌کند */
{
  const t = EF.chapters('chem', 'tajrobi');
  const g = EF.chapters('geo', 'tajrobi');
  const chemBest = Math.max(...t.items.map((i) => i.priority));
  const geoBest = Math.max(...g.items.map((i) => i.priority));
  ok(chemBest > geoBest, 'بهترین فصل شیمی از بهترین فصل زمین اولویت بالاتری دارد (' + chemBest + ' > ' + geoBest + ')');
  ok(geoBest < 40, 'زمین به‌خاطر ضریب ۱ از سقف اولویت پایین می‌ماند (' + geoBest + ')');
  /* قاعدهٔ اصلی: دو فصل با تعداد سؤال تقریباً برابر، آن‌که ضریب بالاتر دارد جلو می‌افتد */
  const b = EF.chapters('bio', 'tajrobi');
  const p = EF.chapters('phys', 'tajrobi');
  const pick = (r, q) => r.items.slice().sort((x, y) => Math.abs(x.qAvg - q) - Math.abs(y.qAvg - q))[0];
  const bEq = pick(b, 3.0);
  const pEq = pick(p, 3.0);
  ok(Math.abs(bEq.qAvg - pEq.qAvg) < 0.4, 'دو فصل با تعداد سؤال نزدیک پیدا شد (' + bEq.qAvg + ' و ' + pEq.qAvg + ')');
  ok(bEq.priority > pEq.priority, 'با سؤال برابر، زیست (ضریب ۱۲) از فیزیک (ضریب ۷) جلو می‌افتد (' + bEq.priority + ' > ' + pEq.priority + ')');
}

/* ۶) رتبه‌بندی درون‌درس و روند */
{
  const b = EF.chapters('bio', 'tajrobi');
  ok(b.items[0].priority === 0 && b.items[0].imp === 1, 'فصل ۱ زیست: اولویت ۰ و اهمیت ۱');
  const top = b.items.slice().sort((x, y) => y.priority - x.priority).slice(0, 3).map((x) => x.chapter);
  ok(top.includes(4) || top.includes(19), 'صدر جدول زیست از فصل‌های پرتکرار است (' + top.join('، ') + ')');
  const rising = EF.chapters('chem', 'tajrobi').items[5];
  ok(rising.trend >= 0, 'پوشاک (شیمی ۶) روند نزولی ندارد (' + rising.trend + ')');
  ok(rising.qRecent >= rising.qAvg, 'سؤالِ سال‌های اخیر پوشاک از میانگین کل کمتر نیست (' + rising.qRecent + ' ≥ ' + rising.qAvg + ')');
}

/* ۷) تغییر رشته */
{
  const before = CW.chapterInfo('bio', 4).priority;
  CW.setField('riazi');
  ok(CW.chapterInfo('bio', 4).priority == null, 'در رشتهٔ ریاضی، importance زیست (بی‌ضریب) خالی می‌شود');
  CW.setField('tajrobi');
  ok(CW.chapterInfo('bio', 4).priority === before, 'با برگشت به تجربی، همان عدد قبلی برمی‌گردد');
  ok(Boolean(CW.chapterInfo('math', 18).priority != null), 'ریاضی در رشتهٔ تجربی هم داده دارد');
}

/* ۸) ضریب‌ها و صحت علامت‌گذاری */
{
  ok(EF.FIELD_COEF.tajrobi.bio === 12, 'ضریب زیست در تجربی ۱۲ است');
  ok(EF.FIELD_COEF.tajrobi.geo === 1, 'ضریب زمین در تجربی ۱ است');
  ok(EF.FIELD_VERIFIED.tajrobi.bio === true, 'ضریب زیست به‌عنوان تأییدشده علامت خورده');
  ok(EF.FIELD_COEF.riazi.math === 12 && EF.FIELD_COEF.riazi.phys === 9, 'ضرایب رشتهٔ ریاضی درست است');
}

/* ۹) سری زمانیِ هر فصل با برچسب سال‌ها هم‌طول است */
{
  const b = EF.chapters('bio', 'tajrobi');
  ok(b.items.every((i) => i.series.length === b.data.cols.length), 'طول سری هر فصل با تعداد ستون‌ها یکی است');
  ok(EF.seriesText('bio', 4).indexOf('۱۴۰۵') >= 0, 'متن سری شامل ۱۴۰۵ است (' + EF.seriesText('bio', 4) + ')');
}

console.log('\n' + (fail ? '❌' : '✅') + ' ' + pass + ' تست موتور اهمیتِ آزمون‌محور ' +
  (fail ? 'با ' + fail + ' خطا' : 'پاس شد') + '\n');
assert.strictEqual(fail, 0);
