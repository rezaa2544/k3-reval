/* ═══════════════════════════════════════════════════════════════════
   شبیه‌سازِ برنامه برای تستِ «تسلطِ کاملِ دستیار» — نسخهٔ ۲.۸.۱۵
   ------------------------------------------------------------------
   این فایل یک «برنامهٔ واقعی» می‌سازد (با همان engine.createPlan که خودِ اپ
   استفاده می‌کند) و همان ctx‌ای را می‌دهد که planner.js به دستیار می‌دهد
   (readPlan / applyDayOverride / applyChapterRating / applyExam / …).

   تفاوتش با تستِ قبلی این است که:
     • حالتِ داخلی دارد (availability، chapters، exams، offDays، sessions، done…)
     • هر تغییر و «قبل/بعد»ش در changeLog ثبت می‌شود ⇒ می‌توان سنجید واقعاً
       چیزی عوض شده یا نه (نه اینکه فقط ok:true برگشته باشد)
   ═══════════════════════════════════════════════════════════════════ */
const engine = require('../src/planner/engine.js');
const presets = require('../src/planner/presets.js');

const DAY_KEYS = ['sat', 'sun', 'mon', 'tue', 'wed', 'thu', 'fri'];
const WEEKDAY_FA = engine.WEEKDAY_FA || { sat: 'شنبه', sun: 'یکشنبه', mon: 'دوشنبه', tue: 'سه‌شنبه', wed: 'چهارشنبه', thu: 'پنجشنبه', fri: 'جمعه' };

const NUM = '۰۱۲۳۴۵۶۷۸۹';
const fa = (s) => String(s == null ? '' : s).replace(/\d/g, (d) => NUM[+d]);
const pad = (n) => String(n).padStart(2, '0');
const padHM = (hm) => {
  const m = String(hm || '').match(/(\d{1,2})\s*:\s*(\d{1,2})/);
  return m ? pad(Number(m[1]) % 24) + ':' + pad(Number(m[2]) % 60) : String(hm || '');
};

function chapterRowsFor(sub) {
  const names = Array.isArray(sub.topicNames) && sub.topicNames.length ? sub.topicNames : null;
  const n = names ? names.length : (Number(sub.chapters) || 1);
  return Array.from({ length: n }, (_, i) => ({
    name: (names && names[i]) || ((sub.general ? 'درس ' : 'فصل ') + fa(i + 1)),
    read: false,
    mastery: 0,
  }));
}

/**
 * @param {object} opts  { hours:4, startDate:'2026-10-30', field:'tajrobi', grade:'دوازدهم',
 *                         timeMode:'fixed', autoHours:8, seedMastery:0, noPlan:false }
 */
function createApp(opts) {
  const o = opts || {};
  const TODAY = o.startDate || '2026-10-30';
  const availability = {}; const startTimes = {};
  DAY_KEYS.forEach((k) => { availability[k] = o.hours != null ? o.hours : 4; startTimes[k] = '16:00'; });

  const subs = (o.field === 'riazi' ? presets.subjectsFor('riazi') : presets.subjectsFor(o.field || 'tajrobi'))
    .concat(o.grade === 'یازدهم' ? presets.generalFor('یازدهم') : presets.generalFor('دوازدهم'));

  const st = {
    cfg: {
      student: { name: o.name || 'شبیه‌سازی', grade: o.grade || 'دوازدهم', field: o.field || 'tajrobi' },
      startDate: TODAY,
      examDate: o.examDate || '2027-07-02',
      availability, startTimes,
      sleep: { bedtime: '23:30', wake: '07:00' },
      blockMinutes: 45, breakMinutes: 10, restDay: 5,
      weeklyMock: true,
      timeMode: o.timeMode || 'fixed',
      dailyCapHours: o.autoHours || 8,
      subjects: subs.map((x) => Object.assign({}, x)),
    },
    plan: null,
    chapters: {},
    exams: [],
    offDays: [],
    sessions: {},
    done: {},
    carry: [],
    urgent: [],
    overrides: [],
    weeklyMock: true,
    startTimes: Object.assign({}, startTimes),
    sleep: { bedtime: '23:30', wake: '07:00' },
    name: o.name || 'شبیه‌سازی',
    timeMode: o.timeMode || 'fixed',
    autoHours: o.autoHours || 8,
  };

  subs.forEach((s) => {
    const rows = chapterRowsFor(s);
    const pct = o.seedMastery != null ? o.seedMastery : 0;
    rows.forEach((r, i) => { r.read = pct > 0 && i % 2 === 0; r.mastery = r.read ? pct : 0; });
    st.chapters[s.id] = rows;
  });

  function cfgSubjects() {
    const subjects = (st._subjectList || subs).map((s) => {
      const rows = st.chapters[s.id] || [];
      const read = rows.filter((r) => r.read);
      const avg = rows.length ? Math.round(rows.reduce((a, r) => a + (r.read ? Number(r.mastery) || 0 : 0), 0) / rows.length) : 0;
      return Object.assign({}, s, {
        chapters: rows.length || s.chapters,
        chaptersData: rows.map((r) => ({ name: r.name, read: !!r.read, mastery: r.read ? Number(r.mastery) || 0 : 0 })),
        masteredChapters: read.filter((r) => (Number(r.mastery) || 0) >= 75).length,
        mastery: avg,
        topicNames: rows.length ? rows.map((r) => r.name) : s.topicNames,
      });
    });
    return subjects;
  }

  const changeLog = [];
  function snap(label) {
    const day = dayOf(TODAY);
    return {
      label,
      blocks: ((day && day.blocks) || []).filter((b) => b.kind !== 'routine').map((b) => [b.start, b.end, b.subjectId, b.topic || '', b.kind].join('|')),
      hours: JSON.stringify(st.cfg.availability),
      restDay: st.cfg.restDay,
      blockMinutes: st.cfg.blockMinutes,
      examDate: st.cfg.examDate,
      startTimes: JSON.stringify(st.startTimes),
      sleep: JSON.stringify(st.sleep),
      breakMinutes: st.cfg.breakMinutes,
      weeklyMock: st.cfg.weeklyMock,
      chapters: JSON.stringify(st.chapters),
      exams: JSON.stringify(st.exams),
      offDays: JSON.stringify(st.offDays),
      sessions: JSON.stringify(st.sessions),
      done: JSON.stringify(st.done),
      overrides: JSON.stringify(st.overrides),
      name: st.name,
      carry: JSON.stringify(st.carry),
    };
  }
  function record(name, before) {
    const after = snap(name);
    const changed = Object.keys(after).filter((k) => k !== 'label' && after[k] !== before[k]);
    changeLog.push({ name, changed, before, after });
    return changed;
  }

  function rebuild() {
    st.cfg.dayOverrides = st.overrides.slice();
    st.cfg.subjects = cfgSubjects();
    st.cfg.emergency = st.urgent.slice();
    st.cfg.carryOver = st.carry.slice();
    st.plan = engine.createPlan(st.cfg);
  }
  function dayOf(date) { return ((st.plan && st.plan.days) || []).find((d) => d.date === date) || null; }
  function blocksOf(date) { return ((dayOf(date) || {}).blocks || []).filter((b) => b.kind !== 'routine'); }
  function minutesOf(date, sid) {
    return blocksOf(date).filter((b) => b.subjectId === sid && b.kind !== 'exam').reduce((a, b) => a + (b.minutes || 0), 0);
  }
  function normTime(v) {
    const m = String(v || '').match(/(\d{1,2})\s*[:.]\s*(\d{1,2})/) || String(v || '').match(/^(\d{1,2})$/);
    if (!m) return null;
    const h = Number(m[1]); const mi = Number(m[2] || 0);
    if (h > 23 || mi > 59) return null;
    return pad(h) + ':' + pad(mi);
  }

  const ctx = {
    /* ---- خواندن ---- */
    readConfig() {
      const days = DAY_KEYS.map((k) => Number(st.cfg.availability[k]) || 0);
      const live = days.filter((d) => d > 0);
      return {
        avgDailyHours: live.length ? Math.round((days.reduce((a, b) => a + b, 0) / live.length) * 10) / 10 : 0,
        weeklyHours: days.reduce((a, b) => a + b, 0),
        restDay: st.cfg.restDay,
        blockMinutes: st.cfg.blockMinutes,
        timeMode: st.timeMode,
        examDate: st.cfg.examDate,
      };
    },
    readPlan(scope) {
      if (!st.plan) return null;
      if (scope === 'tomorrow' || scope === 'tomorrow_plus') {
        const i = st.plan.days.findIndex((d) => d.date === TODAY);
        const d2 = st.plan.days[Math.min(st.plan.days.length - 1, Math.max(0, i) + 1)];
        const bs = ((d2 && d2.blocks) || []).filter((b) => b.kind !== 'routine');
        return { label: d2 ? d2.date : '', date: d2 ? d2.date : '', blocks: bs, count: bs.length, totalMinutes: bs.reduce((a, b) => a + (b.minutes || 0), 0) };
      }
      if (scope === 'week') {
        const i = Math.max(0, st.plan.days.findIndex((d) => d.date === TODAY));
        const slice = st.plan.days.slice(i, i + 7);
        const blocks = slice.flatMap((d) => (d.blocks || []).filter((b) => b.kind !== 'routine').map((b) => Object.assign({}, b, { start: d.date + ' ' + b.start })));
        return { label: 'هفته', blocks, count: blocks.length, totalMinutes: blocks.reduce((a, b) => a + (b.minutes || 0), 0) };
      }
      const day = dayOf(TODAY);
      if (!day) return null;
      const blocks = blocksOf(TODAY);
      return { label: TODAY, date: TODAY, blocks, count: blocks.length, totalMinutes: blocks.reduce((a, b) => a + (b.minutes || 0), 0) };
    },
    readReport() {
      if (!st.plan) return null;
      const S = st.plan.summary; const cov = S.coverage || {};
      const blocks = blocksOf(TODAY);
      return {
        coverage: cov.coverageRatio, covered: cov.coveredChapters, total: cov.totalChapters,
        hours: S.totalHours || 0, daysLeft: 245,
        konkurProjected: (S.readinessSplit && S.readinessSplit.konkur && S.readinessSplit.konkur.projected) || 0,
        finalsProjected: (S.readinessSplit && S.readinessSplit.finals && S.readinessSplit.finals.projected) || 0,
        todayCount: blocks.length, todayMinutes: blocks.reduce((a, b) => a + (b.minutes || 0), 0),
        weak: '', warnings: [],
      };
    },
    readChapters(opts) {
      if (!st.plan) return null;
      const O = opts || {};
      let list = (st.plan.summary.chapterStats || []).filter((c) => c.needMinutes > 0 || c.plannedMinutes > 0);
      if (O.subjectId) list = list.filter((c) => c.subjectId === O.subjectId);
      list = list.slice().sort((a, b) => (O.weakest ? (a.mastery || 0) - (b.mastery || 0) : (b.ciSharePct || 0) - (a.ciSharePct || 0)));
      const items = list.slice(0, O.limit || 6).map((c) => ({
        subjectName: c.subjectName, label: c.label, chapter: c.chapter,
        share: c.ciSharePct || 0, rank: c.ciRank || null, total: c.ciTotal || null,
        importance: c.ciImportance || 0, mastery: Math.round(c.mastery || 0), needMinutes: c.needMinutes,
      }));
      return items.length ? { items } : null;
    },
    planDayBlocks(date) {
      const d = dayOf(date || TODAY);
      if (!d) return null;
      const blocks = ((d.blocks || []).filter((b) => b.kind !== 'routine'));
      return { date: d.date, blocks, count: blocks.length, totalMinutes: blocks.reduce((a, b) => a + (b.minutes || 0), 0) };
    },
    toIsoDate(spec) {
      const s = spec || {};
      if (s.iso) return s.iso;
      if (s.jalali) {
        try {
          const J = require('../src/planner/jalali.js');
          const y = s.jalali.y || (J.fromISO(TODAY) || {}).jy;
          return J.toISO(y, s.jalali.m, s.jalali.d);
        } catch (e) { return null; }
      }
      if (s.offset != null) {
        const d = new Date(TODAY + 'T00:00:00');
        d.setDate(d.getDate() + Number(s.offset));
        return d.toISOString().slice(0, 10);
      }
      return TODAY;
    },

    /* ---- تغییرها ---- */
    applyAvailability(days) {
      const before = snap('hours');
      Object.keys(days || {}).forEach((k) => { st.cfg.availability[k] = days[k]; });
      rebuild();
      const changed = record('applyAvailability', before);
      return { ok: changed.length > 0, changed, autoHours: null };
    },
    applyRestDay(key) {
      if (DAY_KEYS.indexOf(key) === -1) return { ok: false, message: 'روز نامعتبر است.' };
      const before = snap('rest');
      st.cfg.restDay = DAY_KEYS.indexOf(key);
      rebuild();
      return { ok: true, changed: record('applyRestDay', before) };
    },
    applyBlockMinutes(m) {
      const before = snap('block');
      st.cfg.blockMinutes = Number(m);
      rebuild();
      return { ok: true, changed: record('applyBlockMinutes', before) };
    },
    applyExamDate(target) {
      let iso = null;
      if (/^\d{4}-\d{2}-\d{2}$/.test(String(target))) iso = String(target);
      else {
        const parts = String(target || '').split(/[\/\-.]/).map((x) => Number(x));
        if (parts.length === 3 && parts[0] > 1300) {
          try { iso = require('../src/planner/jalali.js').toISO(parts[0], parts[1], parts[2]); } catch (e) { iso = null; }
        }
      }
      if (!iso) return { ok: false, message: 'تاریخ نامعتبر است.' };
      if (iso <= TODAY) return { ok: false, message: 'تاریخ آزمون باید بعد از تاریخ شروع باشد.' };
      const before = snap('examDate');
      st.cfg.examDate = String(iso);
      rebuild();
      return { ok: true, changed: record('applyExamDate', before) };
    },
    applyTimeMode(mode, cap) {
      const before = snap('timeMode');
      st.timeMode = mode === 'auto' ? 'auto' : 'fixed';
      st.cfg.timeMode = st.timeMode;
      if (cap != null) st.cfg.dailyCapHours = cap;
      rebuild();
      return { ok: true, changed: record('applyTimeMode', before), autoHours: 0 };
    },
    rebuild() {
      const before = snap('rebuild');
      rebuild();
      return { ok: true, message: 'برنامه از نو ساخته شد.', changed: record('rebuild', before) };
    },
    replanToday() {
      const before = snap('replan');
      rebuild();
      record('replanToday', before);
      return { ok: true, message: 'بازچیده شد.' };
    },
    startFirstTask() {
      const day = dayOf(TODAY);
      if (!day) return { ok: false, message: 'برنامه‌ای برای امروز نیست.' };
      const idx = (day.blocks || []).findIndex((b) => b.kind !== 'routine' && b.kind !== 'exam');
      if (idx < 0) return { ok: false, message: 'کاری برای امروز نیست.' };
      const before = snap('start');
      st.sessions[TODAY + '#' + idx] = { status: 'running', startedAt: 1 };
      record('startFirstTask', before);
      return { ok: true, message: 'شروع شد: ' + (day.blocks[idx].subjectName || '') };
    },
    addUrgent(item) {
      const it = Object.assign({ id: 'em' + st.urgent.length, date: TODAY, minutes: 45, scope: 'today' }, item || {});
      const before = snap('urgent');
      st.urgent.push(it);
      rebuild();
      record('addUrgent', before);
      return { ok: true, message: 'کار ضروری اضافه شد.' };
    },
    applyDayOverride(spec) {
      const sp = spec || {};
      const date = sp.date || TODAY;
      if (!st.plan) return { ok: false, message: 'اول برنامه را بساز.' };
      const day = dayOf(date);
      if (!day) return { ok: false, message: 'این تاریخ در بازهٔ برنامه نیست.' };
      if (day.isOff) return { ok: false, message: 'این روز تعطیلِ کامل است.' };
      const cfg = st.cfg;
      const nameOf = (id) => ((cfg.subjects || []).find((x) => x.id === id) || {}).name || id;
      const entry = {
        id: 'ov' + st.overrides.length, date,
        action: sp.action === 'swap' ? 'swap' : (sp.action === 'skip' ? 'skip' : 'pin'),
        fromSubjectId: sp.fromSubjectId || null,
        fromChapter: sp.fromChapter != null ? Number(sp.fromChapter) : null,
        subjectId: sp.subjectId || sp.toSubjectId || null,
        chapter: sp.chapter != null ? Number(sp.chapter) : (sp.toChapter != null ? Number(sp.toChapter) : null),
        minutes: sp.minutes != null ? Number(sp.minutes) : null,
      };
      if (!entry.subjectId && !entry.fromSubjectId) return { ok: false, message: 'درس مشخص نشد.' };
      st.overrides = st.overrides.filter((x) => !(x.date === date && x.action === entry.action
        && (x.subjectId || null) === entry.subjectId && (x.fromSubjectId || null) === entry.fromSubjectId));
      const before = snap('override');
      st.overrides.push(entry);
      rebuild();
      const changed = record('applyDayOverride', before);
      const after = this.planDayBlocks(date);
      const parts = [];
      if (entry.action === 'swap') parts.push('«' + nameOf(entry.fromSubjectId) + '» کنار رفت و وقتش به «' + nameOf(entry.subjectId) + '» رسید.');
      else if (entry.action === 'skip') parts.push('«' + nameOf(entry.subjectId) + '» امروز برداشته شد.');
      else parts.push('«' + nameOf(entry.subjectId) + (entry.chapter ? ' فصل ' + fa(entry.chapter) : '') + '» در برنامهٔ امروز گذاشته شد.');
      return { ok: changed.indexOf('blocks') !== -1 || changed.length > 0, message: parts.join(' '), day: date, override: entry, after, changed };
    },
    clearDayOverrides(date) {
      const d = date || TODAY;
      const had = st.overrides.filter((x) => x.date === d);
      if (!had.length) return { ok: false, message: 'امروز تغییری ثبت نشده بود.' };
      const before = snap('undo');
      st.overrides = st.overrides.filter((x) => x.date !== d);
      rebuild();
      record('clearDayOverrides', before);
      return { ok: true, message: 'تغییرها برگشت.' };
    },

    /* ---- ۲.۸.۱۵ ---- */
    applyChapterRating(spec) {
      const sp = spec || {};
      let sid = sp.subjectId;
      if (!sid && sp.subjectName) {
        const hit = Object.keys(st.chapters).find((k) => k.indexOf(sp.subjectName) !== -1);
        sid = hit || null;
      }
      const rows = st.chapters[sid];
      if (!rows || !rows.length) return { ok: false, message: 'این درس را در فهرست پیدا نکردم.' };
      const ch = Math.max(1, Math.min(rows.length, Number(sp.chapter) || 1));
      const row = rows[ch - 1];
      const beforeRow = { read: !!row.read, mastery: Number(row.mastery) || 0 };
      let m;
      if (sp.mastery != null && Number.isFinite(Number(sp.mastery))) m = Math.max(0, Math.min(100, Number(sp.mastery)));
      else if (sp.read === false) m = 0;
      else m = 80;
      const before = snap('chapter');
      row.read = m > 0; row.mastery = m;
      rebuild();
      record('applyChapterRating', before);
      return {
        ok: true,
        message: sid + ' فصل ' + fa(ch) + ' ثبت شد (' + fa(m) + '٪)',
        before: beforeRow, after: { read: row.read, mastery: m },
      };
    },
    applyExam(spec) {
      const sp = spec || {};
      if (!/^\d{4}-\d{2}-\d{2}$/.test(String(sp.date || ''))) return { ok: false, message: 'تاریخِ آزمون را نتوانستم بخوانم.' };
      const before = snap('exam');
      st.exams.push({ title: sp.title || 'آزمون آزمایشی', date: sp.date, start: sp.start || '08:00', end: sp.end || '11:30', subjectIds: sp.subjectIds || [] });
      rebuild();
      const changed = record('applyExam', before);
      return { ok: true, message: 'آزمون اضافه شد.', exam: st.exams[st.exams.length - 1], changed };
    },
    applyOffDay(spec) {
      const sp = spec || {};
      let iso = null;
      if (sp.date && /^\d{4}-\d{2}-\d{2}$/.test(String(sp.date))) iso = String(sp.date);
      else if (sp.weekday) {
        const d0 = new Date(TODAY + 'T00:00:00');
        for (let i = 0; i < 8; i += 1) {
          const d = new Date(d0.getTime() + i * 86400000);
          if (DAY_KEYS[(d.getDay() + 1) % 7] === sp.weekday) { iso = d.toISOString().slice(0, 10); break; }
        }
      }
      if (!iso) return { ok: false, message: 'تاریخ یا روزِ هفته مشخص نشد.' };
      const before = snap('off');
      st.offDays = st.offDays.filter((x) => x.date !== iso);
      st.offDays.push({ date: iso, kind: sp.kind === 'light' ? 'light' : 'halt' });
      rebuild();
      const changed = record('applyOffDay', before);
      return { ok: true, message: 'ثبت شد.', date: iso, changed };
    },
    applyStartTime(spec) {
      const sp = spec || {};
      const time = normTime(sp.time);
      if (!time) return { ok: false, message: 'ساعت را نشناختم.' };
      const before = snap('startTime');
      const keys = sp.weekday ? [sp.weekday] : DAY_KEYS.slice();
      keys.forEach((k) => { st.startTimes[k] = time; st.cfg.startTimes[k] = time; });
      rebuild();
      const changed = record('applyStartTime', before);
      return { ok: true, message: 'ساعت شروع شد ' + time, changed };
    },
    applySleep(spec) {
      const sp = spec || {};
      const bt = sp.bedtime ? normTime(sp.bedtime) : null;
      const wk = sp.wake ? normTime(sp.wake) : null;
      if (!bt && !wk) return { ok: false, message: 'ساعت خواب یا بیداری مشخص نشد.' };
      const before = snap('sleep');
      if (bt) { st.sleep.bedtime = bt; st.cfg.sleep.bedtime = bt; }
      if (wk) { st.sleep.wake = wk; st.cfg.sleep.wake = wk; }
      rebuild();
      const changed = record('applySleep', before);
      return { ok: true, message: 'ساعت خواب/بیداری ثبت شد.', changed };
    },
    applyBreakMinutes(m) {
      const v = Math.max(0, Math.min(60, Number(m) || 0));
      const before = snap('break');
      st.cfg.breakMinutes = v;
      rebuild();
      return { ok: true, message: 'استراحت شد ' + fa(v) + ' دقیقه', changed: record('applyBreakMinutes', before) };
    },
    applyWeeklyMock(on) {
      const v = on !== false;
      const before = snap('mock');
      st.cfg.weeklyMock = v; st.weeklyMock = v;
      rebuild();
      return { ok: true, message: 'آزمون هفتگی ' + (v ? 'روشن' : 'خاموش'), changed: record('applyWeeklyMock', before) };
    },
    applyStudentName(name) {
      const nm = String(name || '').trim();
      if (!nm) return { ok: false, message: 'نام مشخص نشد.' };
      const before = snap('name');
      st.name = nm; st.cfg.student.name = nm;
      return { ok: true, message: 'نام شد ' + nm, changed: record('applyStudentName', before) };
    },
    _blockIndex(sel) {
      const day = dayOf(TODAY);
      if (!day) return { ok: false, message: 'برای امروز برنامه‌ای نیست.' };
      const list = day.blocks || [];
      let idx = -1;
      if (sel && sel.index != null) idx = Number(sel.index);
      else if (sel && sel.subjectId) idx = list.findIndex((b) => b.subjectId === sel.subjectId && b.kind !== 'routine');
      if (idx < 0 || idx >= list.length) return { ok: false, message: 'این کار را در برنامهٔ امروز پیدا نکردم.' };
      return { ok: true, day, list, block: list[idx], idx };
    },
    startBlock(sel) {
      const f = this._blockIndex(sel || {});
      if (!f.ok) return f;
      if (f.block.kind === 'routine') return { ok: false, message: 'این بلوک روال است.' };
      const before = snap('startBlock');
      st.sessions[f.day.date + '#' + f.idx] = { status: 'running', startedAt: 1 };
      record('startBlock', before);
      return { ok: true, message: 'شروع شد: ' + (f.block.subjectName || '') };
    },
    finishBlock(sel) {
      const f = this._blockIndex(sel || {});
      if (!f.ok) return f;
      const before = snap('finishBlock');
      st.sessions[f.day.date + '#' + f.idx] = { status: 'done' };
      st.done[f.day.date + '#' + f.idx] = true;
      record('finishBlock', before);
      return { ok: true, message: 'انجام‌شده تیک خورد: ' + (f.block.subjectName || '') };
    },
    closeDay() {
      const day = dayOf(TODAY);
      if (!day) return { ok: false, message: 'امروز در بازهٔ برنامه نیست.' };
      const left = (day.blocks || []).map((b, i) => ({ b, i }))
        .filter((x) => x.b.kind !== 'routine' && !(st.sessions[TODAY + '#' + x.i] || {}).status);
      if (!left.length) return { ok: true, message: 'کار جامانده‌ای امروز نبود.' };
      const before = snap('closeDay');
      st.carry = st.carry.concat(left.map(({ b }) => ({ subjectId: b.subjectId, topic: b.topic, minutes: b.minutes || 0 })));
      left.forEach(({ i }) => { delete st.sessions[TODAY + '#' + i]; });
      rebuild();
      const changed = record('closeDay', before);
      return { ok: true, message: fa(left.length) + ' کار جامانده منتقل شد.', changed };
    },
    applyTool(name, args) { return require('../src/planner/ai/tools.js').run(name, args, ctx); },

    /* ---- کمکی‌های تست ---- */
    _st: st,
    _day: dayOf,
    _blocks: blocksOf,
    _minutes: minutesOf,
    _changes: changeLog,
    _snap: snap,
    _fa: fa,
  };

  if (!o.noPlan) rebuild();
  return ctx;
}

module.exports = { createApp, DAY_KEYS, WEEKDAY_FA, padHM, fa };
