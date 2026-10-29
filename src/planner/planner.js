/* رابط کاربری مشاور هوشمند روال */
(function () {
  'use strict';

  const engine = window.RevalPlanner;
  const presets = window.RevalPresets;
  const J = window.RevalJalali;   // تقویم شمسی
  const api = window.revalPlanner || null;

  const WEEKDAY_FA = engine.WEEKDAY_FA;
  const WEEKDAY_KEY = engine.WEEKDAY_KEY;
  const KIND_CLASS = {
    learn: 'b-learn', review: 'b-review', practice: 'b-practice',
    mock: 'b-mock', analysis: 'b-analysis', warmup: 'b-warmup',
    reteach: 'b-reteach', boost: 'b-boost', cumreview: 'b-cum', classfix: 'b-classfix',
    finalprep: 'b-final', deadlinecheck: 'b-deadline', carry: 'b-carry', carryreview: 'b-carry',
  };

  const WEEKDAYS_FA = ['شنبه', 'یکشنبه', 'دوشنبه', 'سه‌شنبه', 'چهارشنبه', 'پنجشنبه', 'جمعه'];

  const DL_STATUS = {
    met: { fa: 'سر وقت تمام شد', cls: 'ok' },
    ontrack: { fa: 'روی مسیر', cls: 'ok' },
    late: { fa: 'دیر می‌شود', cls: 'bad' },
    'late-done': { fa: 'با تأخیر تمام شد', cls: 'warn' },
  };

  const $ = (id) => document.getElementById(id);
  const pad = (n) => String(n).padStart(2, '0');
  const iso = (d) => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());

  let state = {
    config: null,
    plan: null,
    week: 0,
    selectedDay: null,
    scores: {},
    done: {},
    general: null,
    gradeSel: ['دوازدهم'],   // پایه‌های انتخابی برای دروس عمومی
    generalEdits: {},        // ویرایش‌های کاربر روی هر درس عمومی (با id)
    chapters: {},            // ارزیابی فصل‌به‌فصل: sid → [{name, read, mastery}]
    coreSubjects: [],        // آخرین فهرست دروس اختصاصی نمایش‌داده‌شده
    assessOpen: {},          // کدام درس‌ها در بخش ارزیابی باز است
    finals: {},              // سوابق: id → {current, target, inProgram, influence}
    deadlineBooks: [],       // مهلت‌های کتابی (مدل اول)
    deadlineExams: [],       // مهلت‌های کوتاه: تک‌درس/جامع (مدل دوم)
    offDates: [],            // روزهای خارج از برنامه
    startTimes: null,        // ساعت شروع هر روز
    lastCarry: [],           // کارهای جامانده‌ای که بازچینش شدند
  };

  /* ---------------- ابزار ---------------- */

  function toast(msg) {
    const el = $('toast');
    el.textContent = msg;
    el.classList.add('show');
    clearTimeout(toast._t);
    toast._t = setTimeout(() => el.classList.remove('show'), 2600);
  }

  function faNum(n) {
    // گرد کردن به یک رقم اعشار تا اعداد اعشاریِ شناور (مثل ۲۷٫۳۴۹۹۹۹) نمایش داده نشوند
    const num = Number(n);
    const val = isFinite(num) ? Math.round(num * 10) / 10 : n;
    return String(val)
      .replace(/\./g, '٫')
      .replace(/\d/g, (d) => '۰۱۲۳۴۵۶۷۸۹'[d]);
  }

  /* جداسازی جهت‌نویسی برای بازه‌های زمانی/تاریخ در متن راست‌به‌چپ */
  function bidi(txt) {
    return '<span dir="ltr" style="unicode-bidi:isolate">' + String(txt) + '</span>';
  }

  /* ---------------- تاریخ شمسی ---------------- */

  /** رشتهٔ شمسیِ فیلد تاریخ را به ISO میلادی تبدیل می‌کند (برای ذخیرهٔ داخلی) */
  function readJDate(id) {
    const el = $(id);
    if (!el) return null;
    if (el.dataset.iso) return el.dataset.iso;
    const parsed = J ? J.parse(el.value) : null;
    return parsed;
  }

  function writeJDate(id, iso) {
    const el = $(id);
    if (!el) return;
    el.dataset.iso = iso || '';
    el.value = iso && J ? J.fmt(iso) : '';
    if (J) J.attachPicker(el);
  }

  /** «۷ آبان» برای قرص‌های روز هفته */
  function jDayMonth(iso) {
    if (!J) return '';
    const j = J.fromISO(iso);
    return j ? faNum(j.jd) + ' ' + J.MONTHS[j.jm - 1] : '';
  }

  /** نمایش شمسی یک تاریخ ISO (بدون نام روز — روز هفته در بالای همان کارت) */
  function jDateFull(iso) {
    return J ? J.fmt(iso) : faNum(iso);
  }

  function weekOf(plan, dayIndex) {
    return Math.floor(dayIndex / 7);
  }

  /* ---------------- ساعت شروع هر روز ---------------- */

  const DEFAULT_START_TIMES = {
    sat: '16:00', sun: '16:00', mon: '16:00', tue: '16:00', wed: '16:00', thu: '09:00', fri: '09:00',
  };

  function renderStartTimes(values) {
    const box = $('startTimes');
    if (!box) return;
    const v = Object.assign({}, DEFAULT_START_TIMES, values || {});
    box.innerHTML = WEEKDAY_FA.map((w, i) =>
      '<div><label>' + w + '</label><input type="time" data-start="' + WEEKDAY_KEY[i] + '" value="' + v[WEEKDAY_KEY[i]] + '" /></div>').join('');
  }

  function readStartTimes() {
    const out = {};
    document.querySelectorAll('[data-start]').forEach((inp) => { out[inp.dataset.start] = inp.value || '16:00'; });
    return Object.keys(out).length ? out : Object.assign({}, DEFAULT_START_TIMES);
  }

  /* ---------------- روزهای خارج از برنامه ---------------- */

  function renderOffRows(rows) {
    const box = $('offRows');
    if (!box) return;
    box.innerHTML = '';
    (rows || []).forEach((o) => {
      const div = document.createElement('div');
      div.className = 'dyn-row off';
      div.innerHTML =
        '<div><label>تاریخ (شمسی)</label><input data-of="date" data-jdate data-iso="' + esc(o.date || '') + '" /></div>' +
        '<div><label>نوع</label><select data-of="kind">' +
          '<option value="halt"' + (o.kind !== 'light' ? ' selected' : '') + '>تعطیل کامل</option>' +
          '<option value="light"' + (o.kind === 'light' ? ' selected' : '') + '>روز سبک</option>' +
        '</select></div>' +
        '<div><label>یادداشت</label><input data-of="note" value="' + esc(o.note || '') + '" placeholder="سفر / بیماری / مهمانی" /></div>' +
        '<button class="del" title="حذف">✕</button>';
      div.querySelector('.del').addEventListener('click', () => div.remove());
      box.appendChild(div);
    });
    if (!box.children.length) box.innerHTML = '<div class="muted" style="font-size:11.5px">روزی ثبت نشده — همهٔ روزها عادی‌اند.</div>';
    else if (J) J.attachAll(box);
  }

  function readOffRows() {
    const out = [];
    $('offRows').querySelectorAll('.dyn-row').forEach((row) => {
      const d = row.querySelector('[data-of="date"]');
      const date = d.dataset.iso || (J ? J.parse(d.value) : null);
      if (!date) return;
      out.push({
        date,
        kind: row.querySelector('[data-of="kind"]').value,
        note: row.querySelector('[data-of="note"]').value.trim(),
      });
    });
    return out;
  }

  $('addOff').addEventListener('click', () => {
    const rows = readOffRows();
    const d = new Date(); d.setDate(d.getDate() + 3);
    rows.push({ date: J ? J.dateToISO(d) : iso(d), kind: 'halt', note: '' });
    renderOffRows(rows);
  });

  /* ---------------- مدل ۱: مهلت کتابی ---------------- */

  function coreSubjectOptions(selected) {
    const list = state.coreSubjects && state.coreSubjects.length ? state.coreSubjects : presets.subjectsFor($('field').value || 'tajrobi');
    return list.map((x) => '<option value="' + esc(x.id) + '"' + (x.id === selected ? ' selected' : '') + '>' + esc(x.name) + '</option>').join('');
  }

  function renderBookDeadlineRows(rows) {
    const box = $('bookDeadlineRows');
    if (!box) return;
    box.innerHTML = '';
    (rows || []).forEach((r) => {
      const div = document.createElement('div');
      div.className = 'dyn-row dlbook';
      div.innerHTML =
        '<div><label>کتاب</label><select data-bd="subjectId">' + coreSubjectOptions(r.subjectId) + '</select></div>' +
        '<div><label>تا تاریخ (شمسی)</label><input data-bd="date" data-jdate data-iso="' + esc(r.date || '') + '" /></div>' +
        '<div><label>هدف</label><select data-bd="goal">' +
          '<option value="read"' + (r.goal !== 'solid' ? ' selected' : '') + '>خوانده + تثبیت شود</option>' +
          '<option value="solid"' + (r.goal === 'solid' ? ' selected' : '') + '>تسلط کامل (فقط مرور بماند)</option>' +
        '</select></div>' +
        '<button class="del" title="حذف">✕</button>';
      div.querySelector('.del').addEventListener('click', () => div.remove());
      box.appendChild(div);
    });
    if (!box.children.length) box.innerHTML = '<div class="muted" style="font-size:11.5px">مهلت کتابی ثبت نشده — برنامه فقط بر پایهٔ کنکور چیده می‌شود.</div>';
    else if (J) J.attachAll(box);
  }

  function readBookDeadlines() {
    const out = [];
    $('bookDeadlineRows').querySelectorAll('.dyn-row').forEach((row) => {
      const d = row.querySelector('[data-bd="date"]');
      const date = d.dataset.iso || (J ? J.parse(d.value) : null);
      if (!date) return;
      out.push({
        subjectId: row.querySelector('[data-bd="subjectId"]').value,
        date,
        goal: row.querySelector('[data-bd="goal"]').value,
      });
    });
    return out;
  }

  $('addBookDeadline').addEventListener('click', () => {
    const rows = readBookDeadlines();
    const d = new Date(); d.setMonth(d.getMonth() + 4);
    rows.push({ subjectId: (state.coreSubjects[0] || {}).id || 'bio', date: J ? J.dateToISO(d) : iso(d), goal: 'read' });
    renderBookDeadlineRows(rows);
  });

  $('suggestBookDeadlines').addEventListener('click', () => {
    state.deadlineBooks = presets.suggestedBookDeadlines
      ? presets.suggestedBookDeadlines(state.coreSubjects && state.coreSubjects.length ? state.coreSubjects : presets.subjectsFor($('field').value || 'tajrobi'))
      : [];
    renderBookDeadlineRows(state.deadlineBooks);
    toast('مهلت پیشنهادی ساخته شد — هر تاریخ را می‌توانی عوض کنی.');
  });

  /* ---------------- آزمون‌های دوره‌ای (هر روز هفته، هر N هفته) ---------------- */

  function subjectOptionsAll(selected) {
    const list = (state.coreSubjects && state.coreSubjects.length ? state.coreSubjects : presets.subjectsFor($('field').value || 'tajrobi'));
    return list.map((s) => '<option value="' + s.id + '"' +
      ((selected || []).indexOf(s.id) !== -1 ? ' selected' : '') + '>' + esc(s.name) + '</option>').join('');
  }

  function renderMockRows(rows) {
    const box = $('mockRows');
    if (!box) return;
    box.innerHTML = '';
    (rows || []).forEach((m) => {
      const div = document.createElement('div');
      div.className = 'dyn-row mock';
      div.innerHTML =
        '<div><label>عنوان آزمون</label><input data-mk="title" value="' + esc(m.title || '') + '" placeholder="زیستاز / آلفا / قلم‌چی" /></div>' +
        '<div><label>روز هفته</label><select data-mk="day">' +
          WEEKDAYS_FA.map((d, i) => '<option value="' + i + '"' + (Number(m.day) === i ? ' selected' : '') + '>' + d + '</option>').join('') +
        '</select></div>' +
        '<div><label>تکرار</label><select data-mk="everyNWeeks">' +
          [[1, 'هر هفته'], [2, 'هر ۲ هفته'], [3, 'هر ۳ هفته'], [4, 'هر ۴ هفته']]
            .map(([v, t]) => '<option value="' + v + '"' + (Number(m.everyNWeeks || 1) === v ? ' selected' : '') + '>' + t + '</option>').join('') +
        '</select></div>' +
        '<div><label>ساعت شروع (اختیاری)</label><input data-mk="start" type="time" value="' + esc(m.start || '') + '" /></div>' +
        '<div><label>مدت (دقیقه)</label><select data-mk="minutes">' +
          [60, 90, 100, 120, 150, 180, 210]
            .map((v) => '<option value="' + v + '"' + (Number(m.minutes || 100) === v ? ' selected' : '') + '>' + faNum(v) + '</option>').join('') +
        '</select></div>' +
        '<div><label>دروس (خالی = همه)</label><select data-mk="subjectIds" multiple size="4">' + subjectOptionsAll(m.subjectIds) + '</select></div>' +
        '<button class="del" title="حذف">✕</button>';
      div.querySelector('.del').addEventListener('click', () => div.remove());
      box.appendChild(div);
    });
    if (!box.children.length) {
      box.innerHTML = '<div class="muted" style="font-size:11.5px">آزمون دوره‌ای ثبت نشده — یک آزمون جامع هفتگی ساده چیده می‌شود.</div>';
    }
  }

  function readMocks() {
    const out = [];
    const box = $('mockRows');
    if (!box) return out;
    box.querySelectorAll('.dyn-row').forEach((row) => {
      const title = (row.querySelector('[data-mk="title"]').value || '').trim();
      const day = Number(row.querySelector('[data-mk="day"]').value);
      const every = Number(row.querySelector('[data-mk="everyNWeeks"]').value) || 1;
      const start = row.querySelector('[data-mk="start"]').value || null;
      const minutes = Number(row.querySelector('[data-mk="minutes"]').value) || 100;
      const subjectIds = Array.from(row.querySelector('[data-mk="subjectIds"]').selectedOptions).map((o) => o.value);
      if (!title && !subjectIds.length) return;
      out.push({ title: title || 'آزمون دوره‌ای', day, everyNWeeks: every, start, minutes, subjectIds });
    });
    return out;
  }

  $('addMock') && $('addMock').addEventListener('click', () => {
    state.weeklyMocks = readMocks().concat([{
      title: 'آزمون دوره‌ای', day: 5, everyNWeeks: 1, minutes: 100, subjectIds: [],
    }]);
    renderMockRows(state.weeklyMocks);
  });

  $('suggestMocks') && $('suggestMocks').addEventListener('click', () => {
    /* پیشنهاد حرفه‌ای: آزمون آزمایشی هر ۲ هفته + آزمون تک‌درس هفتگی */
    state.weeklyMocks = [
      { title: 'آزمون جامع آزمایشی', day: 5, everyNWeeks: 2, minutes: 180, subjectIds: [] },
      { title: 'آزمون تک‌درس هفته', day: 5, everyNWeeks: 2, minutes: 100, subjectIds: [] },
    ];
    renderMockRows(state.weeklyMocks);
    toast('دو آزمون دوره‌ای پیشنهاد شد (پنجشنبه‌ها، یکی‌درمیان).');
  });

  $('examDatePreset') && $('examDatePreset').addEventListener('change', (e) => {
    const v = e.target.value;
    if (!v) return;
    const inp = $('examDate');
    const d = new Date(v + 'T00:00:00');
    inp.value = J ? J.fmt(v) : v;
    inp.dataset.iso = v;
    if (J && J.setIso) J.setIso(inp, v);
    toast('تاریخ آزمون هدف: ' + (J ? J.fmt(v) : v));
    e.target.value = '';
  });

  /* ---------------- مدل ۲: آزمون تک‌درس / جامع ---------------- */

  function renderShortDeadlineRows(rows) {
    const box = $('shortDeadlineRows');
    if (!box) return;
    box.innerHTML = '';
    (rows || []).forEach((r) => {
      const isSingle = r.kind !== 'comprehensive';
      const sub = state.coreSubjects.find((x) => x.id === r.subjectId) || state.coreSubjects[0] || { chapters: 24 };
      const chapters = sub.chapters || 24;
      const fromOpts = Array.from({ length: chapters }, (_, i) => i + 1)
        .map((n) => '<option value="' + n + '"' + ((r.from || 1) === n ? ' selected' : '') + '>' + faNum(n) + '</option>').join('');
      const toOpts = Array.from({ length: chapters }, (_, i) => i + 1)
        .map((n) => '<option value="' + n + '"' + ((r.to || chapters) === n ? ' selected' : '') + '>' + faNum(n) + '</option>').join('');
      const div = document.createElement('div');
      div.className = 'dyn-row dlexam';
      div.innerHTML =
        '<div><label>عنوان</label><input data-sd="title" value="' + esc(r.title || '') + '" placeholder="آزمون فصل ۲ زیست" /></div>' +
        '<div><label>نوع</label><select data-sd="kind">' +
          '<option value="single"' + (isSingle ? ' selected' : '') + '>تک‌درس</option>' +
          '<option value="comprehensive"' + (!isSingle ? ' selected' : '') + '>جامع</option>' +
        '</select></div>' +
        '<div><label>درس</label><select data-sd="subjectId">' + coreSubjectOptions(r.subjectId) + '</select></div>' +
        '<div><label>از فصل</label><select data-sd="from">' + fromOpts + '</select></div>' +
        '<div><label>تا فصل</label><select data-sd="to">' + toOpts + '</select></div>' +
        '<div><label>تاریخ (شمسی)</label><input data-sd="date" data-jdate data-iso="' + esc(r.date || '') + '" /></div>' +
        '<button class="del" title="حذف">✕</button>';
      div.querySelector('.del').addEventListener('click', () => div.remove());
      box.appendChild(div);
    });
    if (!box.children.length) box.innerHTML = '<div class="muted" style="font-size:11.5px">آزمونی ثبت نشده.</div>';
    else if (J) J.attachAll(box);
  }

  function readShortDeadlines() {
    const out = [];
    $('shortDeadlineRows').querySelectorAll('.dyn-row').forEach((row) => {
      const get = (f) => row.querySelector('[data-sd="' + f + '"]');
      const d = get('date');
      const date = d.dataset.iso || (J ? J.parse(d.value) : null);
      if (!date) return;
      const kind = get('kind').value === 'comprehensive' ? 'comprehensive' : 'single';
      out.push({
        title: get('title').value.trim() || (kind === 'single' ? 'آزمون تک‌درس' : 'آزمون جامع'),
        kind,
        subjectId: kind === 'single' ? get('subjectId').value : null,
        from: Number(get('from').value) || 1,
        to: Number(get('to').value) || 120,
        date,
      });
    });
    return out;
  }

  $('addShortDeadline').addEventListener('click', () => {
    const rows = readShortDeadlines();
    const d = new Date(); d.setDate(d.getDate() + 21);
    rows.push({
      title: '', kind: 'single', subjectId: (state.coreSubjects[0] || {}).id || 'bio',
      from: 1, to: 1, date: J ? J.dateToISO(d) : iso(d),
    });
    renderShortDeadlineRows(rows);
  });

  /* ---------------- سوابق تحصیلی ---------------- */

  function finalsDefaults(field, grade) {
    return presets.finalsFor ? presets.finalsFor(field || 'tajrobi', grade || 'دوازدهم') : [];
  }

  function renderFinalsTable() {
    const box = $('finalsTable');
    if (!box) return;
    const courses = state.finalsList || [];
    if (!courses.length) { box.innerHTML = '<tr><td class="muted">درسی بارگذاری نشده.</td></tr>'; return; }
    box.innerHTML =
      '<thead><tr><th>درس</th><th>ضریب</th><th>نمرهٔ فعلی (۰–۲۰)</th><th>هدف</th><th>در برنامه</th></tr></thead><tbody>' +
      courses.map((c, i) => {
        const st = state.finals[c.id] || {};
        const cur = st.current == null ? '' : st.current;
        return '<tr data-fin-id="' + esc(c.id) + '">' +
          '<td><b>' + esc(c.name) + '</b></td>' +
          '<td>' + faNum(c.influence) + '</td>' +
          '<td><input data-fin-cur="' + i + '" value="' + (cur === '' ? '' : faNum(cur)) + '" placeholder="۱۲ (فرض)" style="max-width:90px" /></td>' +
          '<td><input data-fin-tgt="' + i + '" value="' + faNum(st.target == null ? c.target : st.target) + '" style="max-width:70px" /></td>' +
          '<td><input type="checkbox" data-fin-in="' + i + '"' + (st.inProgram === false ? '' : ' checked') + ' /></td>' +
        '</tr>';
      }).join('') + '</tbody>';

    box.querySelectorAll('[data-fin-cur]').forEach((inp) => {
      inp.addEventListener('input', () => {
        const c = state.finalsList[Number(inp.dataset.finCur || inp.getAttribute('data-fin-cur'))];
        if (!c) return;
        state.finals[c.id] = state.finals[c.id] || {};
        state.finals[c.id].current = inp.value.trim() === '' ? null : faToEn(inp.value);
      });
    });
    box.querySelectorAll('[data-fin-tgt]').forEach((inp) => {
      inp.addEventListener('input', () => {
        const c = state.finalsList[Number(inp.getAttribute('data-fin-tgt'))];
        if (!c) return;
        state.finals[c.id] = state.finals[c.id] || {};
        state.finals[c.id].target = faToEn(inp.value);
      });
    });
    box.querySelectorAll('[data-fin-in]').forEach((inp) => {
      inp.addEventListener('change', () => {
        const c = state.finalsList[Number(inp.getAttribute('data-fin-in'))];
        if (!c) return;
        state.finals[c.id] = state.finals[c.id] || {};
        state.finals[c.id].inProgram = inp.checked;
      });
    });
  }

  function readFinals() {
    return (state.finalsList || []).map((c) => {
      const st = state.finals[c.id] || {};
      const cur = st.current;
      return {
        id: c.id, name: c.name, grade: c.grade, influence: c.influence,
        current: cur === '' || cur == null ? null : Number(faToEn(String(cur))),
        target: st.target == null || st.target === '' ? c.target : Number(faToEn(String(st.target))),
        inProgram: st.inProgram !== false,
      };
    });
  }

  function loadFinalsFor(grade) {
    const list = finalsDefaults($('field').value, grade);
    state.finalsList = list;
    list.forEach((c) => {
      if (!state.finals[c.id]) state.finals[c.id] = { current: null, target: c.target, inProgram: true };
    });
    renderFinalsTable();
  }

  $('finalsGrade').addEventListener('change', () => {
    loadFinalsFor($('finalsGrade').value);
    toast('درس‌های نهایی پایهٔ ' + $('finalsGrade').value + ' بارگذاری شد.');
  });

  $('finalsDefaults').addEventListener('click', () => {
    state.finals = {};
    loadFinalsFor($('finalsGrade').value);
    toast('درس‌های نهایی و نمره‌ها بازگردانی شد.');
  });

  /* ---------------- تب‌ها ---------------- */

  document.querySelectorAll('.tab').forEach((tab) => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.tab').forEach((t) => t.classList.remove('active'));
      document.querySelectorAll('.view').forEach((v) => v.classList.remove('active'));
      tab.classList.add('active');
      $('view-' + tab.dataset.view).classList.add('active');
      if (tab.dataset.view === 'report') renderReport();
    });
  });

  /* ---------------- فرم تنظیمات ---------------- */

  function buildAvailabilityGrid(values) {
    const box = $('availability');
    box.innerHTML = '';
    WEEKDAY_KEY.forEach((k, i) => {
      const div = document.createElement('div');
      div.innerHTML = '<label>' + WEEKDAY_FA[i] + ' (ساعت)</label>' +
        '<input type="number" min="0" max="12" step="0.5" data-avail="' + k + '" value="' + (values[k] != null ? values[k] : 4) + '" />';
      box.appendChild(div);
    });
  }

  function subjectRow(s, index) {
    const types = engine.SUBJECT_TYPE_FA;
    const typeOpts = Object.keys(types)
      .map((t) => '<option value="' + t + '"' + (s.type === t ? ' selected' : '') + '>' + types[t] + '</option>')
      .join('');
    const rows = chapterRows(s);
    const s2 = assessSummary(rows);
    return '' +
      '<tr data-row="' + index + '" data-id="' + esc(s.id) + '">' +
      '<td><input data-f="name" value="' + esc(s.name) + '" /></td>' +
      '<td><input data-f="weight" type="number" min="0.5" max="20" step="0.5" value="' + s.weight + '" style="width:64px" /></td>' +
      '<td><span class="muted" style="font-size:12px">' + faNum(s2.readCount) + ' / ' + faNum(s2.total) + '</span></td>' +
      '<td><span class="muted" style="font-size:12px">' + faNum(s2.avg) + '٪</span></td>' +
      '<td><select data-f="difficulty">' +
      [1, 2, 3].map((d) => '<option value="' + d + '"' + (s.difficulty === d ? ' selected' : '') + '>' + ['آسان', 'متوسط', 'سخت'][d - 1] + '</option>').join('') +
      '</select></td>' +
      '<td><select data-f="type">' + typeOpts + '</select></td>' +
      '<td><input data-f="examPercent" type="number" min="-33" max="100" value="' + (s.examPercent == null ? '' : s.examPercent) + '" placeholder="—" style="width:70px" /></td>' +
      '<td><input data-f="include" type="checkbox" ' + (s.include === false ? '' : 'checked') + ' /></td>' +
      '</tr>';
  }

  function esc(s) {
    return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
  }

  /* ---------------- ارزیابی فصل به فصل ---------------- */

  function faToEn(t) {
    return String(t).replace(/[۰-۹]/g, (d) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d)));
  }

  /** فهرست پیش‌فرض فصل‌های یک درس (نخوانده) */
  function defaultChapterRows(sub) {
    const names = sub && Array.isArray(sub.topicNames) && sub.topicNames.length ? sub.topicNames : null;
    const n = names ? names.length : clampNum(sub && sub.chapters, 1, 120);
    const out = [];
    for (let i = 0; i < n; i++) {
      out.push({
        name: names ? String(names[i]) : ((sub && sub.topicLabel) || 'فصل') + ' ' + faNum(i + 1),
        read: false,
        mastery: 0,
      });
    }
    return out;
  }

  function clampNum(v, lo, hi) {
    const n = Number(v);
    if (!Number.isFinite(n)) return lo;
    return Math.max(lo, Math.min(hi, n));
  }

  /** سطرهای ارزیابی یک درس (منبع حقیقت: state.chapters) */
  function chapterRows(sub) {
    if (!sub || !sub.id) return [];
    if (!state.chapters[sub.id] || !state.chapters[sub.id].length) {
      state.chapters[sub.id] = defaultChapterRows(sub);
    }
    return state.chapters[sub.id];
  }

  /** خلاصهٔ ارزیابی یک درس */
  function assessSummary(rows) {
    const total = rows.length || 1;
    const read = rows.filter((r) => r.read);
    const avgAll = Math.round(rows.reduce((a, r) => a + (r.read ? Number(r.mastery) || 0 : 0), 0) / total);
    const weak = read.filter((r) => r.mastery < 45).length;
    const boost = read.filter((r) => r.mastery >= 45 && r.mastery < 75).length;
    const solid = read.filter((r) => r.mastery >= 75).length;
    return { total: rows.length, readCount: read.length, avg: avgAll, weak, boost, solid };
  }

  /** دروس قابل ارزیابی = اختصاصی‌ها + عمومی‌های فعال */
  function assessSubjects() {
    const core = (state.coreSubjects || []).map((x) => ({
      id: x.id, name: x.name, weight: x.weight, chapters: x.chapters,
      topicLabel: x.topicLabel, topicNames: x.topicNames, general: false,
    }));
    const gen = (state.general || []).filter((x) => x.include !== false).map((x) => ({
      id: x.id, name: x.name, weight: x.weight, chapters: x.chapters,
      topicLabel: x.topicLabel, topicNames: x.topicNames, general: true, grade: x.grade,
    }));
    return core.concat(gen);
  }

  function assessmentRowHtml(row, i) {
    return '<tr data-ci="' + i + '">' +
      '<td><input data-cf="name" value="' + esc(row.name) + '" /></td>' +
      '<td style="text-align:center"><input type="checkbox" data-cf="read"' + (row.read ? ' checked' : '') + ' /></td>' +
      '<td><div class="mrow">' +
        '<input type="number" min="0" max="100" step="5" data-cf="mastery" value="' + (row.read ? row.mastery : 0) + '"' +
          (row.read ? '' : ' disabled') + ' style="width:66px" />' +
        '<span class="muted" style="font-size:11px">٪</span>' +
        [0, 25, 50, 75, 90].map((v) => '<button class="mini" data-set="' + v + '"' + (row.read ? '' : ' disabled') + '>' + faNum(v) + '</button>').join('') +
      '</div></td>' +
      '<td style="text-align:center"><button class="mini del" data-del="' + i + '" title="حذف">✕</button></td>' +
    '</tr>';
  }

  /** رندر کل بخش ارزیابی فصل‌به‌فصل */
  function renderAssessment() {
    const box = $('assessment');
    if (!box) return;
    const subs = assessSubjects();
    if (!subs.length) { box.innerHTML = '<div class="muted">درسی برای ارزیابی نیست.</div>'; return; }

    /* خلاصهٔ کل */
    let allRows = [];
    subs.forEach((sub) => { allRows = allRows.concat(chapterRows(sub)); });
    const g = assessSummary(allRows);
    const filled = g.readCount > 0;

    box.innerHTML =
      '<div class="assess-top">' +
        '<div><b style="font-size:13px">' + faNum(g.total) + ' فصل/درس</b>' +
          '<div class="muted" style="font-size:11.5px;margin-top:3px">' +
            faNum(g.readCount) + ' خوانده‌شده · ' + faNum(g.weak) + ' ضعیف (زیر ۴۵٪) · ' +
            faNum(g.boost) + ' نیازمند ارتقا · ' + faNum(g.solid) + ' مسلط</div></div>' +
        '<div style="flex:1;min-width:160px"><div class="acard-bar" style="height:9px"><i style="width:' + g.avg + '%"></i></div>' +
          '<div class="muted" style="font-size:11px;margin-top:4px">آمادگی فعلی (میانگین وزنی تسلط): ' + faNum(g.avg) + '٪</div></div>' +
        '<div class="row" style="gap:6px">' +
          '<button class="btn ghost small" data-all="open">باز کردن همه</button>' +
          '<button class="btn ghost small" data-all="close">بستن همه</button>' +
        '</div>' +
      '</div>' +
      (!filled
        ? '<div class="hint">هنوز چیزی علامت نزده‌ای. هر درسی که خوانده‌ای را تیک بزن و درصد تسلطش را بزن؛ ' +
          'فصل‌های تیک‌نخورده در برنامه «یادگیری از صفر» و فصل‌های ضعیف خودکار «جبران/ارتقا» می‌گیرند.</div>'
        : '') +
      subs.map((sub) => {
        const rows = chapterRows(sub);
        const s2 = assessSummary(rows);
        const open = state.assessOpen[sub.id] === true;
        return '<div class="acard' + (open ? ' open' : '') + '" data-sid="' + esc(sub.id) + '">' +
          '<div class="acard-h" data-head="' + esc(sub.id) + '">' +
            '<span class="acard-t">' + esc(sub.name) +
              '<small>' + (sub.grade ? esc(sub.grade) + ' · ' : '') + 'ضریب ' + faNum(sub.weight) + ' · ' + faNum(s2.total) + ' ' +
              esc(sub.general ? 'درس' : 'فصل') + '</small></span>' +
            '<span class="acard-m">' + (s2.readCount ? faNum(s2.readCount) + ' از ' + faNum(s2.total) + ' خوانده · میانگین ' + faNum(s2.avg) + '٪' +
              (s2.weak ? ' · <b style="color:#dc2626">' + faNum(s2.weak) + ' ضعیف</b>' : '') : 'ارزیابی نشده') + '</span>' +
            '<div class="acard-bar"><i style="width:' + s2.avg + '%"></i></div>' +
            '<button class="mini" data-toggle="' + esc(sub.id) + '">' + (open ? 'بستن' : 'باز کردن') + '</button>' +
          '</div>' +
          '<div class="acard-b"' + (open ? '' : ' hidden') + '>' +
            '<div class="row" style="gap:6px;margin-bottom:8px;flex-wrap:wrap">' +
              '<button class="btn ghost small" data-fill="' + esc(sub.id) + '" data-val="85">همه را خوانده‌ام (۸۵٪)</button>' +
              '<button class="btn ghost small" data-fill="' + esc(sub.id) + '" data-val="60">همه را خوانده‌ام (۶۰٪)</button>' +
              '<button class="btn ghost small" data-fill="' + esc(sub.id) + '" data-val="0">همه را نخوانده‌ام</button>' +
              '<button class="btn ghost small" data-add="' + esc(sub.id) + '">+ افزودن مبحث</button>' +
            '</div>' +
            '<table class="chap"><thead><tr><th>' + esc(sub.general ? 'درس' : 'فصل / مبحث') +
              '</th><th style="width:74px">خوانده‌ام</th><th style="width:270px">تسلط</th><th style="width:36px"></th></tr></thead><tbody>' +
              rows.map(assessmentRowHtml).join('') +
            '</tbody></table>' +
          '</div>' +
        '</div>';
      }).join('');

    /* رویدادها */
    box.querySelectorAll('[data-head]').forEach((h) => {
      h.addEventListener('click', (ev) => {
        if (ev.target.closest('button')) return;
        const id = h.dataset.head;
        state.assessOpen[id] = !(state.assessOpen[id] === true);
        renderAssessment();
      });
    });
    box.querySelectorAll('[data-all]').forEach((b) => {
      b.addEventListener('click', () => {
        const open = b.dataset.all === 'open';
        subs.forEach((sub) => { state.assessOpen[sub.id] = open; });
        renderAssessment();
      });
    });
    box.querySelectorAll('[data-fill]').forEach((b) => {
      b.addEventListener('click', () => {
        const id = b.dataset.fill;
        const v = Number(b.dataset.val);
        const sub = subs.find((x) => x.id === id);
        const rows = chapterRows(sub);
        rows.forEach((r) => { r.read = v > 0; r.mastery = v > 0 ? v : 0; });
        state.assessOpen[id] = true;
        renderAssessment();
        toast('برای «' + (sub ? sub.name : '') + '» ' + (v > 0 ? 'همه فصل‌ها با تسلط ' + faNum(v) + '٪' : 'همه فصل‌ها نخوانده') + ' ثبت شد.');
      });
    });
    box.querySelectorAll('[data-add]').forEach((b) => {
      b.addEventListener('click', () => {
        const id = b.dataset.add;
        const sub = subs.find((x) => x.id === id);
        const rows = chapterRows(sub);
        rows.push({ name: 'مبحث تازه ' + faNum(rows.length + 1), read: false, mastery: 0 });
        state.assessOpen[id] = true;
        renderAssessment();
      });
    });
    box.querySelectorAll('[data-toggle]').forEach((b) => {
      b.addEventListener('click', () => {
        const id = b.dataset.toggle;
        state.assessOpen[id] = !(state.assessOpen[id] === true);
        renderAssessment();
      });
    });
    box.querySelectorAll('[data-set]').forEach((b) => {
      b.addEventListener('click', () => {
        const tr = b.closest('tr');
        const card = b.closest('.acard');
        const sub = subs.find((x) => x.id === card.dataset.sid);
        const rows = chapterRows(sub);
        const row = rows[Number(tr.dataset.ci)];
        if (!row) return;
        row.read = true;
        row.mastery = Number(b.dataset.set);
        renderAssessment();
      });
    });
    box.querySelectorAll('[data-del]').forEach((b) => {
      b.addEventListener('click', () => {
        const card = b.closest('.acard');
        const sub = subs.find((x) => x.id === card.dataset.sid);
        const rows = chapterRows(sub);
        if (rows.length <= 1) { toast('حداقل یک مبحث باید بماند.'); return; }
        rows.splice(Number(b.dataset.del), 1);
        renderAssessment();
      });
    });
    /* ورودی‌ها: بدون رندر مجدد (تا فوکوس از دست نرود) */
    box.querySelectorAll('.acard').forEach((card) => {
      const sub = subs.find((x) => x.id === card.dataset.sid);
      const rows = chapterRows(sub);
      card.querySelectorAll('tbody tr').forEach((tr) => {
        const i = Number(tr.dataset.ci);
        const row = rows[i];
        if (!row) return;
        const nameEl = tr.querySelector('[data-cf="name"]');
        const readEl = tr.querySelector('[data-cf="read"]');
        const mEl = tr.querySelector('[data-cf="mastery"]');
        if (nameEl) nameEl.addEventListener('input', () => { row.name = nameEl.value; });
        if (readEl) readEl.addEventListener('change', () => {
          row.read = readEl.checked;
          if (row.read && !row.mastery) row.mastery = 50;
          if (mEl) { mEl.disabled = !row.read; mEl.value = row.read ? row.mastery : 0; }
          tr.querySelectorAll('[data-set]').forEach((x) => { x.disabled = !row.read; });
          updateAssessHeader(card, sub);
          updateAssessTop(box, subs);
        });
        if (mEl) mEl.addEventListener('input', () => {
          const v = clampNum(faToEn(mEl.value), 0, 100);
          row.mastery = v;
          if (v > 0) row.read = true;
          updateAssessHeader(card, sub);
          updateAssessTop(box, subs);
        });
      });
    });
  }

  function updateAssessHeader(card, sub) {
    const rows = chapterRows(sub);
    const s2 = assessSummary(rows);
    const m = card.querySelector('.acard-m');
    if (m) {
      m.innerHTML = s2.readCount
        ? faNum(s2.readCount) + ' از ' + faNum(s2.total) + ' خوانده · میانگین ' + faNum(s2.avg) + '٪' +
          (s2.weak ? ' · <b style="color:#dc2626">' + faNum(s2.weak) + ' ضعیف</b>' : '')
        : 'ارزیابی نشده';
    }
    const bar = card.querySelector('.acard-bar i');
    if (bar) bar.style.width = s2.avg + '%';
  }

  function updateAssessTop(box, subs) {
    let allRows = [];
    subs.forEach((sub) => { allRows = allRows.concat(chapterRows(sub)); });
    const g = assessSummary(allRows);
    const top = box.querySelector('.assess-top');
    if (!top) return;
    const sub2 = top.querySelector('div > div.muted');
    if (sub2) {
      sub2.innerHTML = faNum(g.readCount) + ' خوانده‌شده · ' + faNum(g.weak) + ' ضعیف (زیر ۴۵٪) · ' +
        faNum(g.boost) + ' نیازمند ارتقا · ' + faNum(g.solid) + ' مسلط';
    }
    const bar = top.querySelector('.acard-bar i');
    if (bar) bar.style.width = g.avg + '%';
    const lbl = top.querySelectorAll('.muted');
    if (lbl && lbl[1]) lbl[1].textContent = 'آمادگی فعلی (میانگین وزنی تسلط): ' + faNum(g.avg) + '٪';
  }

  /** چسباندن داده‌های ارزیابی فصل‌به‌فصل به یک درس در config */
  function withChapters(sub) {
    const rows = state.chapters[sub.id];
    if (!rows || !rows.length) return sub;
    const s2 = assessSummary(rows);
    return Object.assign({}, sub, {
      chapters: rows.length,
      chaptersData: rows.map((r) => ({ name: r.name, read: !!r.read, mastery: r.read ? clampNum(r.mastery, 0, 100) : 0 })),
      masteredChapters: rows.filter((r) => r.read && r.mastery >= 75).length,
      mastery: s2.avg,
      topicNames: rows.map((r) => r.name),
    });
  }

  function renderSubjects(subjects) {
    state.coreSubjects = (subjects || []).map((s) => Object.assign({}, s));
    const table = $('subjects');
    if (!table) return;
    table.innerHTML = '' +
      '<thead><tr><th>درس</th><th>ضریب</th><th>خوانده / کل</th><th>میانگین تسلط</th><th>سختی</th><th>نوع</th><th>درصد آزمون</th><th>در برنامه</th></tr></thead>' +
      '<tbody>' + (subjects || []).map(subjectRow).join('') + '</tbody>';
    renderAssessment();
  }

  /* ---------------- دروس عمومی ---------------- */

  /** چیپ‌های انتخاب پایه برای دروس عمومی */
  function renderGradeChips() {
    const box = $('generalGrades');
    if (!box) return;
    const grades = presets.grades ? presets.grades() : ['دهم', 'یازدهم', 'دوازدهم'];
    box.innerHTML = grades.map((g) =>
      '<button class="grade-chip' + (state.gradeSel.indexOf(g) !== -1 ? ' on' : '') + '" data-grade="' + esc(g) + '">' +
      esc(g) + '</button>').join('');
    box.querySelectorAll('[data-grade]').forEach((b) => {
      b.addEventListener('click', () => {
        readGeneral(); // ویرایش‌های فعلی را نگه دار
        const g = b.dataset.grade;
        const i = state.gradeSel.indexOf(g);
        if (i === -1) state.gradeSel.push(g);
        else if (state.gradeSel.length > 1) state.gradeSel.splice(i, 1);
        else { toast('حداقل یک پایه باید انتخاب باشد.'); return; }
        renderGeneralForGrades();
      });
    });
  }

  /** ساخت لیست عمومی‌ها بر اساس پایه‌های انتخابی + ویرایش‌های ذخیره‌شده */
  function generalFromGrades() {
    return presets.generalFor(state.gradeSel).map((s) => {
      const edit = state.generalEdits[s.id];
      return edit ? Object.assign({}, s, edit) : s;
    });
  }

  function renderGeneralForGrades() {
    renderGradeChips();
    renderGeneral(generalFromGrades());
  }

  function renderGeneral(list) {
    const rows = (list && list.length ? list : generalFromGrades())
      .map((s) => Object.assign({}, s, { include: s.include !== false }));
    state.general = rows;
    const table = $('general');
    if (!table) return;
    table.innerHTML = '' +
      '<thead><tr><th>درس</th><th>پایه</th><th>ضریب</th><th>خوانده / کل</th><th>میانگین تسلط</th><th>در برنامه</th></tr></thead>' +
      '<tbody>' + rows.map((s) => {
        const _gs = assessSummary(chapterRows(s));
        return '' +
        '<tr data-gid="' + esc(s.id) + '">' +
        '<td><input data-gf="name" value="' + esc(s.name) + '" /></td>' +
        '<td><span class="grade-tag">' + esc(s.grade || '—') + '</span></td>' +
        '<td><input data-gf="weight" type="number" min="0.5" max="20" step="0.5" value="' + s.weight + '" style="width:64px" /></td>' +
        '<td><span class="muted" style="font-size:12px">' + faNum(_gs.readCount) + ' / ' + faNum(_gs.total) + '</span>' +
          '<div class="muted" style="font-size:10px;margin-top:2px">' + esc(s.topicLabel || 'درس') + '</div></td>' +
        '<td><span class="muted" style="font-size:12px">' + faNum(_gs.avg) + '٪</span></td>' +
        '<td><input data-gf="include" type="checkbox" ' + (s.include === false ? '' : 'checked') + ' /></td>' +
        '</tr>';
      }).join('') + '</tbody>';
    renderAssessment();
  }

  function readGeneral() {
    const table = $('general');
    if (!table) return [];
    const byId = {};
    (state.general || []).forEach((s) => { byId[s.id] = s; });
    const out = [];
    table.querySelectorAll('tbody tr').forEach((tr, i) => {
      const get = (f) => tr.querySelector('[data-gf="' + f + '"]');
      const base = byId[tr.dataset.gid] || {};
      const gid = tr.dataset.gid || ('G' + (i + 1));
      const gRows = chapterRows(Object.assign({}, base, { id: gid }));
      const row = Object.assign({}, base, {
        id: gid,
        name: get('name').value.trim() || base.name || ('درس عمومی ' + (i + 1)),
        weight: Number(get('weight').value) || 2,
        chapters: gRows.length,
        masteredChapters: gRows.filter((r) => r.read && r.mastery >= 75).length,
        mastery: assessSummary(gRows).avg,
        include: get('include').checked,
        general: true,
        type: base.type || 'conceptual',
        difficulty: base.difficulty || 2,
        topicLabel: base.topicLabel || 'درس',
        topicNames: base.topicNames || null,
        examPercent: base.examPercent == null ? null : base.examPercent,
      });
      // ویرایش‌ها را برای دفعهٔ بعد (تغییر پایه) نگه دار
      state.generalEdits[row.id] = {
        name: row.name, weight: row.weight, chapters: row.chapters,
        masteredChapters: row.masteredChapters, mastery: row.mastery, include: row.include,
      };
      out.push(row);
    });
    return out;
  }

  /* ---------------- کلاس‌ها و آزمون‌ها ---------------- */

  function subjectOptions(selected) {
    const base = state.config && state.config.subjects ? state.config.subjects.filter((x) => !x.general) : presets.subjectsFor('tajrobi');
    const subs = base.concat((state.general || []).map((x) => ({ id: x.id, name: x.name })));
    return subs.map((x) => '<option value="' + esc(x.id) + '"' + (selected === x.id ? ' selected' : '') + '>' + esc(x.name) + '</option>').join('');
  }

  function renderClassRows(classes) {
    const box = $('classRows');
    box.innerHTML = '';
    (classes && classes.length ? classes : []).forEach((c, i) => {
      const div = document.createElement('div');
      div.className = 'dyn-row class';
      div.innerHTML =
        '<div><label>عنوان کلاس</label><input data-cf="title" value="' + esc(c.title || '') + '" placeholder="مثلاً کلاس زیست" /></div>' +
        '<div><label>درس</label><select data-cf="subjectId">' + subjectOptions(c.subjectId) + '</select></div>' +
        '<div><label>روز</label><select data-cf="weekday">' +
          WEEKDAY_FA.map((w, k) => '<option value="' + k + '"' + ((c.weekdays || [])[0] === k ? ' selected' : '') + '>' + w + '</option>').join('') +
        '</select></div>' +
        '<div><label>از</label><input type="time" data-cf="start" value="' + (c.start || '18:00') + '" /></div>' +
        '<div><label>تا</label><input type="time" data-cf="end" value="' + (c.end || '20:00') + '" /></div>' +
        '<button class="del" title="حذف">✕</button>';
      div.querySelector('.del').addEventListener('click', () => { div.remove(); toast('کلاس حذف شد — برای اعمال، برنامه را دوباره بساز.'); });
      box.appendChild(div);
    });
    if (!box.children.length) box.innerHTML = '<div class="muted" style="font-size:11.5px">کلاسی اضافه نشده.</div>';
  }

  function renderExamRows(exams) {
    const box = $('examRows');
    box.innerHTML = '';
    (exams && exams.length ? exams : []).forEach((e) => {
      const div = document.createElement('div');
      div.className = 'dyn-row exam';
      div.innerHTML =
        '<div><label>عنوان آزمون</label><input data-ef="title" value="' + esc(e.title || '') + '" placeholder="آزمون آزمایشی" /></div>' +
        '<div><label>تاریخ (شمسی)</label><input data-ef="date" data-jdate data-iso="' + esc(e.date || '') + '" placeholder="۱۴۰۵/۰۹/۱۲" /></div>' +
        '<div><label>از</label><input type="time" data-ef="start" value="' + (e.start || '08:00') + '" /></div>' +
        '<div><label>تا</label><input type="time" data-ef="end" value="' + (e.end || '11:30') + '" /></div>' +
        '<div><label>درس‌های آزمون</label><select multiple data-ef="subjectIds">' +
          (state.config ? state.config.subjects : []).concat(state.general || []).map((x) =>
            '<option value="' + esc(x.id) + '"' + ((e.subjectIds || []).indexOf(x.id) !== -1 ? ' selected' : '') + '>' + esc(x.name) + '</option>').join('') +
        '</select></div>' +
        '<button class="del" title="حذف">✕</button>';
      div.querySelector('.del').addEventListener('click', () => { div.remove(); toast('آزمون حذف شد — برای اعمال، برنامه را دوباره بساز.'); });
      box.appendChild(div);
    });
    if (!box.children.length) box.innerHTML = '<div class="muted" style="font-size:11.5px">آزمونی اضافه نشده.</div>';
    else if (J) J.attachAll(box);
  }

  function readClasses() {
    const out = [];
    $('classRows').querySelectorAll('.dyn-row').forEach((row) => {
      const get = (f) => row.querySelector('[data-cf="' + f + '"]');
      out.push({
        title: get('title').value.trim() || 'کلاس آنلاین',
        subjectId: get('subjectId').value || null,
        weekdays: [Number(get('weekday').value)],
        start: get('start').value || '18:00',
        end: get('end').value || '20:00',
      });
    });
    return out;
  }

  function readExams() {
    const out = [];
    $('examRows').querySelectorAll('.dyn-row').forEach((row) => {
      const get = (f) => row.querySelector('[data-ef="' + f + '"]');
      const dateInput = get('date');
      const date = dateInput.dataset.iso || (J ? J.parse(dateInput.value) : null);
      if (!date) return;
      const sel = get('subjectIds');
      out.push({
        title: get('title').value.trim() || 'آزمون آزمایشی',
        date,
        start: get('start').value || '08:00',
        end: get('end').value || '11:30',
        subjectIds: Array.prototype.map.call(sel.selectedOptions, (o) => o.value),
      });
    });
    return out;
  }

  $('addClass').addEventListener('click', () => {
    const rows = readClasses();
    rows.push({ title: '', subjectId: null, weekdays: [0], start: '18:00', end: '20:00' });
    renderClassRows(rows);
  });

  $('addExam').addEventListener('click', () => {
    const rows = readExams();
    const d = new Date(); d.setDate(d.getDate() + 14);
    rows.push({ title: 'آزمون آزمایشی', date: J ? J.dateToISO(d) : iso(d), start: '08:00', end: '11:30', subjectIds: [] });
    renderExamRows(rows);
  });

  function readSubjects() {
    const rows = $('subjects').querySelectorAll('tbody tr');
    const out = [];
    rows.forEach((tr, i) => {
      const get = (f) => tr.querySelector('[data-f="' + f + '"]');
      const id = tr.dataset.id || ('S' + (i + 1));
      const base = (state.coreSubjects || []).find((x) => x.id === id) || {};
      const rows = chapterRows(base.id ? base : { id: id, chapters: 1 });
      out.push({
        id: id,
        name: get('name').value.trim() || 'درس ' + (i + 1),
        weight: Number(get('weight').value) || 1,
        chapters: rows.length,
        masteredChapters: rows.filter((r) => r.read && r.mastery >= 75).length,
        mastery: assessSummary(rows).avg,
        difficulty: Number(get('difficulty').value) || 2,
        type: get('type').value,
        examPercent: get('examPercent').value === '' ? null : Number(get('examPercent').value),
        include: get('include').checked,
        topicLabel: base.topicLabel || 'فصل',
        topicNames: rows.map((r) => r.name),
      });
    });
    return out;
  }

  function collectConfig() {
    const availability = {};
    document.querySelectorAll('[data-avail]').forEach((inp) => {
      availability[inp.dataset.avail] = Number(inp.value) || 0;
    });
    const subjects = readSubjects()
      .concat(readGeneral().filter((x) => x.include))
      .map(withChapters);
    const schoolDays = { sat: '16:00', sun: '16:00', mon: '16:00', tue: '16:00', wed: '16:00', thu: '09:00', fri: '09:00' };
    return {
      student: {
        name: $('name').value.trim() || 'دانش‌آموز',
        grade: $('grade').value,
        field: $('field').value,
        chronotype: $('chronotype').value,
      },
      startDate: readJDate('startDate') || iso(new Date()),
      examDate: readJDate('examDate') || presets.defaultExamDate(),
      sleep: { bedtime: $('bedtime').value || '23:30', wake: $('wake').value || '07:00' },
      availability,
      startTimes: schoolDays,
      blockMinutes: Number($('blockMinutes').value) || 45,
      breakMinutes: Number($('breakMinutes').value) || 10,
      restDay: Number($('restDay').value),
      weeklyMock: $('weeklyMock').value === '1',
      weeklyMocks: readMocks(),
      classes: readClasses(),
      exams: readExams(),
      generalGrades: state.gradeSel.slice(),
      subjects,
      startTimes: readStartTimes(),
      offDates: readOffRows(),
      deadlines: { books: readBookDeadlines(), exams: readShortDeadlines() },
      finals: {
        enabled: ($('finalsEnabled') || {}).value !== '0',
        courses: readFinals(),
        window: {
          start: readJDate('finalsStart') || (presets.defaultFinalsWindow ? presets.defaultFinalsWindow().start : null),
          end: readJDate('finalsEnd') || (presets.defaultFinalsWindow ? presets.defaultFinalsWindow().end : null),
        },
        spread: ($('finalsSpread') || {}).value !== '0',
        spreadMinutes: Number(($('finalsSpreadMinutes') || {}).value) || 45,
      },
    };
  }

  function applyConfigToForm(cfg) {
    state.config = cfg;
    $('name').value = (cfg.student && cfg.student.name) || '';
    $('grade').value = (cfg.student && cfg.student.grade) || 'دوازدهم';
    $('field').value = (cfg.student && cfg.student.field) || 'tajrobi';
    $('chronotype').value = (cfg.student && cfg.student.chronotype) || 'neutral';
    writeJDate('startDate', cfg.startDate || iso(new Date()));
    writeJDate('examDate', cfg.examDate || presets.defaultExamDate());
    $('bedtime').value = (cfg.sleep && cfg.sleep.bedtime) || '23:30';
    $('wake').value = (cfg.sleep && cfg.sleep.wake) || '07:00';
    $('restDay').value = String(cfg.restDay == null ? 5 : cfg.restDay);
    $('blockMinutes').value = String(cfg.blockMinutes || 45);
    $('breakMinutes').value = String(cfg.breakMinutes == null ? 10 : cfg.breakMinutes);
    $('weeklyMock').value = cfg.weeklyMock === false ? '0' : '1';
    state.weeklyMocks = cfg.weeklyMocks || [];
    renderMockRows(state.weeklyMocks);
    buildAvailabilityGrid(cfg.availability || {});
    const allSubs = cfg.subjects || presets.subjectsFor('tajrobi');
    /* ارزیابی فصل‌به‌فصل ذخیره‌شده را برگردان */
    state.chapters = {};
    allSubs.forEach((sub) => {
      if (Array.isArray(sub.chaptersData) && sub.chaptersData.length) {
        state.chapters[sub.id] = sub.chaptersData.map((c) => ({
          name: String(c.name || ''),
          read: Boolean(c.read),
          mastery: clampNum(c.mastery, 0, 100),
        }));
      }
    });
    const core = allSubs.filter((x) => !x.general);
    const gen = allSubs.filter((x) => x.general);
    renderSubjects(core.length ? core : presets.subjectsFor(cfg.student && cfg.student.field || 'tajrobi'));

    /* پایه‌های عمومی: از config، وگرنه از خودِ دروس ذخیره‌شده، وگرنه پایهٔ دانش‌آموز */
    const cfgGrades = cfg.generalGrades && cfg.generalGrades.length
      ? presets.normalizeGrades(cfg.generalGrades)
      : presets.normalizeGrades(gen.length ? gen.map((g) => g.grade).filter(Boolean) : ((cfg.student && cfg.student.grade) || 'دوازدهم'));
    state.gradeSel = cfgGrades;
    gen.forEach((g) => {
      state.generalEdits[g.id] = {
        name: g.name, weight: g.weight, chapters: g.chapters,
        masteredChapters: g.masteredChapters, mastery: g.mastery, include: g.include,
      };
    });
    renderGeneralForGrades();
    renderClassRows(cfg.classes || []);
    renderExamRows(cfg.exams || []);

    /* --- ساعت شروع، روزهای خارج از برنامه، مهلت‌ها، سوابق --- */
    renderStartTimes(cfg.startTimes || DEFAULT_START_TIMES);
    state.offDates = cfg.offDates || [];
    renderOffRows(state.offDates);
    state.deadlineBooks = (cfg.deadlines && cfg.deadlines.books) || [];
    state.deadlineExams = (cfg.deadlines && cfg.deadlines.exams) || [];
    renderBookDeadlineRows(state.deadlineBooks);
    renderShortDeadlineRows(state.deadlineExams);

    const fcfg = cfg.finals || {};
    const fgrade = (fcfg.courses && fcfg.courses[0] && fcfg.courses[0].grade) ||
      (cfg.student && cfg.student.grade === 'یازدهم' ? 'یازدهم' : 'دوازدهم');
    if ($('finalsEnabled')) $('finalsEnabled').value = fcfg.enabled === false ? '0' : '1';
    if ($('finalsGrade')) $('finalsGrade').value = fgrade;
    if ($('finalsSpread')) $('finalsSpread').value = fcfg.spread === false ? '0' : '1';
    if ($('finalsSpreadMinutes')) $('finalsSpreadMinutes').value = String(fcfg.spreadMinutes || 45);
    const win = presets.defaultFinalsWindow ? presets.defaultFinalsWindow() : { start: null, end: null };
    writeJDate('finalsStart', (fcfg.window && fcfg.window.start) || win.start);
    writeJDate('finalsEnd', (fcfg.window && fcfg.window.end) || win.end);
    if (fcfg.courses && fcfg.courses.length) {
      state.finalsList = fcfg.courses.map((c) => ({
        id: c.id, name: c.name, grade: c.grade || fgrade, influence: c.influence || 3, target: c.target == null ? 18 : c.target,
      }));
      state.finals = {};
      fcfg.courses.forEach((c) => {
        state.finals[c.id] = { current: c.current == null ? null : c.current, target: c.target == null ? 18 : c.target, inProgram: c.inProgram !== false };
      });
      renderFinalsTable();
    } else {
      loadFinalsFor(fgrade);
    }
  }

  function defaultConfig() {
    const field = $('field').value || 'tajrobi';
    return {
      student: {
        name: $('name').value.trim() || 'دانش‌آموز',
        grade: $('grade').value,
        field,
        chronotype: $('chronotype').value,
      },
      startDate: iso(new Date()),
      examDate: presets.defaultExamDate(),
      sleep: { bedtime: '23:30', wake: '07:00' },
      availability: { sat: 4, sun: 4, mon: 4, tue: 4, wed: 4, thu: 6, fri: 5 },
      startTimes: { sat: '16:00', sun: '16:00', mon: '16:00', tue: '16:00', wed: '16:00', thu: '09:00', fri: '09:00' },
      blockMinutes: 45,
      breakMinutes: 10,
      restDay: 5,
      weeklyMock: true,
      weeklyMocks: [{ title: 'آزمون جامع هفتگی', day: 5, everyNWeeks: 1, minutes: 100, subjectIds: [] }],
      classes: [],
      exams: [],
      generalGrades: state.gradeSel.slice(),
      subjects: presets.subjectsFor(field).concat(generalFromGrades()),
      startTimes: Object.assign({}, DEFAULT_START_TIMES),
      offDates: [],
      /* پیش‌فرض: هر دو مدل مهلت از روز اول دیده شوند (قابل حذف/ویرایش) */
      deadlines: {
        books: presets.suggestedBookDeadlines ? presets.suggestedBookDeadlines(presets.subjectsFor(field)) : [],
        exams: [],
      },
      finals: {
        enabled: true,
        courses: finalsDefaults(field, $('grade').value || 'دوازدهم'),
        window: presets.defaultFinalsWindow ? presets.defaultFinalsWindow() : { start: null, end: null },
        spread: true,
        spreadMinutes: 45,
      },
    };
  }

  $('field').addEventListener('change', () => {
    presets.subjectsFor($('field').value).forEach((s) => {
      const keep = state.chapters[s.id];
      state.chapters[s.id] = (keep && keep.length === s.chapters) ? keep : defaultChapterRows(s);
    });
    renderSubjects(presets.subjectsFor($('field').value));
    toast('دروس پیش‌فرض گروه تغییر کرد — ارزیابی فصل‌ها را بازبینی کن.');
  });

  $('resetSubjects').addEventListener('click', () => {
    presets.subjectsFor($('field').value).forEach((s) => {
      state.chapters[s.id] = defaultChapterRows(s);
    });
    renderSubjects(presets.subjectsFor($('field').value));
    toast('دروس و ارزیابی فصل‌ها بازگردانی شد.');
  });

  $('grade').addEventListener('change', () => {
    readGeneral();
    state.gradeSel = presets.normalizeGrades($('grade').value);
    state.generalEdits = {};
    renderGeneralForGrades();
    toast('دروس عمومی پایهٔ ' + $('grade').value + ' بارگذاری شد (قابل تغییر از بخش ۶).');
  });

  $('resetGeneral').addEventListener('click', () => {
    state.generalEdits = {};
    renderGeneralForGrades();
    toast('دروس عمومی پایه‌های انتخابی بازگردانی شد.');
  });

  $('toggleGeneral').addEventListener('click', () => {
    const rows = readGeneral();
    const anyOn = rows.some((r) => r.include);
    rows.forEach((r) => { r.include = !anyOn; });
    renderGeneralForGrades();
  });

  /* ---------------- ساخت برنامه ---------------- */

  $('build').addEventListener('click', async () => {
    const btn = $('build');
    btn.disabled = true;
    const old = btn.textContent;
    btn.innerHTML = '<span class="spinner"></span> در حال ساخت…';
    try {
      const cfg = collectConfig();
      const plan = engine.createPlan(cfg);
      state.config = cfg;
      state.plan = plan;
      state.week = 0;
      state.selectedDay = null;
      state.scores = {};
      state.done = {};
      renderPlan();
      renderReport();
      document.querySelector('.tab[data-view="plan"]').click();
      toast('برنامه ساخته شد ✓');
      await persist();
    } catch (err) {
      toast('خطا: ' + err.message);
      console.error(err);
    } finally {
      btn.disabled = false;
      btn.textContent = old;
    }
  });

  /* ---------------- نمایش برنامه ---------------- */

  function renderPlan() {
    const plan = state.plan;
    if (!plan) return;
    $('planEmpty').style.display = 'none';
    $('planBody').style.display = 'block';

    const s = plan.summary;
    $('stats').innerHTML = [
      stat(faNum(s.totalHours), 'ساعت برنامه‌ریزی‌شده'),
      stat(faNum(s.avgHoursPerDay), 'میانگین ساعت روزانه'),
      stat(faNum(s.learnedTopics), 'مبحث پوشش‌داده‌شده'),
      stat(faNum(s.totalReviewEvents), 'جلسهٔ مرور فاصله‌دار'),
      stat(faNum(s.classFixBlocks || 0), 'تثبیت کلاس'),
      stat(faNum(s.examDays || 0), 'روز آزمون'),
    ].join('');

    $('coachNotes').innerHTML = s.coachNotes.map((n) => '<li>' + esc(n) + '</li>').join('');
    $('warnBox').innerHTML = s.warnings.length
      ? s.warnings.map((w) => '<div class="warn">⚠ ' + esc(w) + '</div>').join('')
      : '';

    const maxMinutes = Math.max.apply(null, s.bySubject.map((x) => x.minutes).concat([1]));
    $('subjectBars').innerHTML = s.bySubject.map((x) => {
      const w = Math.round((x.minutes / maxMinutes) * 100);
      return '<div style="margin-bottom:10px">' +
        '<div class="row" style="justify-content:space-between"><span style="font-size:12.5px">' + esc(x.name) + '</span>' +
        '<span class="muted" style="font-size:11.5px">' + faNum(x.hours) + ' ساعت · ضریب ' + faNum(x.weight) +
        ' · سهم ' + faNum(Math.round(x.sharePlanned * 100)) + '٪</span></div>' +
        '<div class="bar"><i style="width:' + w + '%"></i></div></div>';
    }).join('');

    renderCoach(plan);
    renderWeek();
    renderScoreGrid();
  }

  /* ---------------- تب گزارش و آنالیز ---------------- */

  function progressBar(pct) {
    const v = Math.max(0, Math.min(100, Math.round(pct)));
    return '<div class="bar" style="min-width:60px"><i style="width:' + v + '%"></i></div>' +
      '<span class="muted" style="font-size:10.5px">' + faNum(v) + '٪</span>';
  }

  function statusPill(st) {
    const m = DL_STATUS[st] || { fa: st, cls: 'warn' };
    return '<span class="pill ' + m.cls + '">' + esc(m.fa) + '</span>';
  }

  function renderReport() {
    const plan = state.plan;
    if (!plan) {
      if ($('reportEmpty')) $('reportEmpty').style.display = 'block';
      if ($('reportBody')) $('reportBody').style.display = 'none';
      return;
    }
    $('reportEmpty').style.display = 'none';
    $('reportBody').style.display = 'block';
    const c = plan.summary.coverage;

    $('reportStats').innerHTML = [
      stat(faNum(c.coverageRatio) + '٪', 'پوشش فصل‌ها'),
      stat(faNum(c.readiness) + ' → ' + faNum(c.projectedReadiness) + '٪', 'آمادگی کنکور (اکنون → پایان)'),
      stat(faNum(c.finalsReadiness) + '٪', 'آمادگی سوابق تحصیلی'),
      stat(faNum(c.composite) + '٪', 'نمرهٔ ترکیبی ۱۴۰۶ (۴۰/۶۰)'),
    ].join('');

    /* --- مهلت‌های کتابی --- */
    const books = c.deadlineBooks || [];
    $('bookDeadlineTable').innerHTML = books.length
      ? '<table class="chap"><thead><tr><th>کتاب</th><th>مهلت</th><th>وضعیت</th><th>فصل</th>' +
        '<th>زمان چیده‌شده / لازم</th><th>تمام‌شدن</th></tr></thead><tbody>' +
        books.map((d) => '<tr><td><b style="font-size:12px">' + esc(d.subjectName) + '</b></td>' +
          '<td>' + faNum(J ? J.fmt(d.date) : d.date) + '</td>' +
          '<td>' + statusPill(d.status) + '</td>' +
          '<td>' + faNum(d.doneChapters) + ' از ' + faNum(d.chapters) + '</td>' +
          '<td><span class="num">' + faNum(Math.round(d.plannedMinutes / 60)) + ' / ' + faNum(Math.round(d.needMinutes / 60)) + '</span> ساعت</td>' +
          '<td>' + (d.finishDate ? faNum(J ? J.fmt(d.finishDate) : d.finishDate) : '—') + '</td></tr>').join('') +
        '</tbody></table>'
      : '<div class="muted" style="font-size:12px">مهلت کتابی ثبت نشده. از تب تنظیمات، بخش ۸ اضافه کن.</div>';

    /* --- مهلت‌های کوتاه --- */
    const exams = c.deadlineExams || [];
    $('shortDeadlineTable').innerHTML = exams.length
      ? '<table class="chap"><thead><tr><th>آزمون</th><th>نوع</th><th>تاریخ</th><th>وضعیت</th>' +
        '<th>فصل‌های آماده</th><th>زمان چیده‌شده / لازم</th></tr></thead><tbody>' +
        exams.map((d) => '<tr><td><b style="font-size:12px">' + esc(d.title) + '</b>' +
          (d.subjectName && d.kind === 'single' ? '<div class="muted" style="font-size:10.5px">' + esc(d.subjectName) + '</div>' : '') + '</td>' +
          '<td>' + (d.kind === 'comprehensive' ? 'جامع' : 'تک‌درس') + '</td>' +
          '<td>' + faNum(J ? J.fmt(d.date) : d.date) + '</td>' +
          '<td>' + statusPill(d.status) + '</td>' +
          '<td>' + faNum(d.doneChapters) + ' از ' + faNum(d.chapters) + '</td>' +
          '<td>' + faNum(Math.round(d.plannedMinutes / 60 * 10) / 10) + ' / ' + faNum(Math.round(d.needMinutes / 60 * 10) / 10) + ' ساعت</td></tr>').join('') +
        '</tbody></table>'
      : '<div class="muted" style="font-size:12px">آزمون تک‌درس یا جامعی ثبت نشده. از تب تنظیمات، بخش ۹ اضافه کن.</div>';

    /* --- سوابق تحصیلی --- */
    const fc = c.finalsCourses || [];
    $('finalsReport').innerHTML = fc.length
      ? '<p class="muted" style="margin-top:0;font-size:11.5px">نمرهٔ فعلی، برآورد پایان دوره و زمانی که برنامه برای هر درس گذاشته است. ' +
        'اگر نمره‌ای ثبت نکرده باشی، «فرض ۱۲» علامت می‌خورد.</p>' +
        '<table class="chap"><thead><tr><th>درس</th><th>ضریب</th><th>فعلی</th><th>هدف</th><th>برآورد پایان</th>' +
        '<th>زمان چیده‌شده / لازم</th><th style="width:130px">پیشرفت</th></tr></thead><tbody>' +
        fc.map((x) => '<tr><td><b style="font-size:12px">' + esc(x.name) + '</b>' +
          (x.assumed ? ' <span class="pill warm" title="نمره ثبت نشده">فرض</span>' : '') + '</td>' +
          '<td>' + faNum(x.influence) + '</td>' +
          '<td>' + faNum(Math.round(x.current * 10) / 10) + '</td>' +
          '<td>' + faNum(x.target) + '</td>' +
          '<td><b>' + faNum(Math.round((x.projected / 100) * 20 * 10) / 10) + '</b></td>' +
          '<td><span class="num">' + faNum(Math.round(x.plannedMinutes / 60 * 10) / 10) + ' / ' + faNum(Math.round(x.needMinutes / 60 * 10) / 10) + '</span> ساعت</td>' +
          '<td>' + progressBar(x.progress) + '</td></tr>').join('') +
        '</tbody></table>'
      : '<div class="muted" style="font-size:12px">لایهٔ سوابق غیرفعال است (تنظیمات، بخش ۱۰).</div>';

    /* --- ظرفیت و استاندارد --- */
    const adv = c.capacityAdvisory || {};
    const covOk = c.coverageRatio >= 98;
    $('capacityBox').innerHTML =
      '<div class="grid g3">' +
        '<div class="kpi"><b>' + faNum(adv.declaredDailyHours || 0) + ' ساعت</b><span>ساعت اعلامی تو در روز</span></div>' +
        '<div class="kpi"><b>' + faNum(adv.minDailyHoursNeeded || 0) + ' ساعت</b><span>حداقل لازم برای پوشش کامل</span></div>' +
        '<div class="kpi"><b>' + faNum(Math.round((adv.fixedWeeklyMinutes || 0) / 60 * 10) / 10) + ' ساعت</b><span>کلاس/آزمون ثابت در هفته</span></div>' +
      '</div>' +
      '<p style="margin:10px 0 0;font-size:12.5px;' + (covOk ? 'color:#047857' : 'color:#b45309') + '">' +
        (covOk
          ? '✓ با ساعت‌های فعلی، پوشش کامل فصل‌ها در دسترس است.'
          : '⚠ با ساعت‌های فعلی پوشش ' + faNum(c.coverageRatio) + '٪ می‌شود. ' +
            'برای پوشش کامل روزی حداقل ' + faNum(adv.minDailyHoursNeeded) + ' ساعت لازم است؛ ' +
            'می‌توانی ساعت‌ها را بالا ببری (تا ۱۶ ساعت را پشتیبانی می‌کند) یا چند فصل کم‌ضریب را عقب بیندازی.') +
      '</p>' +
      '<p class="muted" style="margin:6px 0 0;font-size:11.5px">' +
        'ظرفیت تست: هدف ' + faNum(c.testTargetDaily) + ' تست در روز · ' +
        'میانگین واقعی برنامه ' + faNum(c.testsPerDay) + ' تست · ' +
        'لازم برای استاندارد ' + faNum(c.requiredDailyTests || 0) + ' تست در روز.' +
      '</p>';

    /* --- ظرفیت تست هر درس --- */
    const tRows = c.testsBySubject || [];
    $('testCapacityTable').innerHTML = tRows.length
      ? '<table class="chap"><thead><tr><th>درس</th><th>تست لازم</th><th>چیده‌شده</th><th>پوشش</th><th style="width:130px">پیشرفت</th></tr></thead><tbody>' +
        tRows.map((t) => {
          const pct = t.need > 0 ? Math.min(100, Math.round((t.planned / t.need) * 100)) : 100;
          return '<tr><td><b style="font-size:12px">' + esc(t.name) + '</b></td>' +
            '<td class="num">' + faNum(t.need) + '</td>' +
            '<td class="num">' + faNum(t.planned) + '</td>' +
            '<td>' + faNum(pct) + '٪</td>' +
            '<td>' + progressBar(pct) + '</td></tr>';
        }).join('') + '</tbody></table>'
      : '<div class="muted" style="font-size:12px">داده‌ای نیست.</div>';

    /* --- آزمون‌های دوره‌ای --- */
    const mocks = (plan.meta && plan.meta.weeklyMocks) || state.weeklyMocks || [];
    $('mocksReport').innerHTML = mocks.length
      ? '<table class="chap"><thead><tr><th>آزمون</th><th>روز</th><th>تکرار</th><th>مدت</th><th>دروس</th></tr></thead><tbody>' +
        mocks.map((m) => '<tr><td><b style="font-size:12px">' + esc(m.title) + '</b></td>' +
          '<td>' + (WEEKDAYS_FA[Number(m.day) || 0] || '—') + '</td>' +
          '<td>' + (Number(m.everyNWeeks) <= 1 ? 'هر هفته' : 'هر ' + faNum(m.everyNWeeks) + ' هفته') + '</td>' +
          '<td class="num">' + faNum(m.minutes) + ' دقیقه</td>' +
          '<td>' + ((m.subjectIds || []).length ? (m.subjectIds || []).map((id) => {
            const sub = (plan.meta.subjects || []).find((x) => x.id === id);
            return esc(sub ? sub.name : id);
          }).join('، ') : 'همه دروس') + '</td></tr>').join('') +
        '</tbody></table>'
      : '<div class="muted" style="font-size:12px">آزمون دوره‌ای تعریف نشده.</div>';

    renderBookTable(plan);
    renderChapterTable(plan);
    renderReportFilters(plan);
  }

  function renderReportFilters(plan) {
    const sel = $('reportBook');
    if (!sel) return;
    const cur = sel.value || 'all';
    const subs = (plan.summary.bySubject || []).filter((x) => plan.summary.chapterStats.some((c) => c.subjectId === x.id));
    sel.innerHTML = '<option value="all">همهٔ کتاب‌ها</option>' +
      subs.map((x) => '<option value="' + esc(x.id) + '">' + esc(x.name) + '</option>').join('');
    sel.value = subs.some((x) => x.id === cur) ? cur : 'all';
    renderChapterTable(plan);
  }

  function renderBookTable(plan) {
    const chs = plan.summary.chapterStats || [];
    const rows = (plan.summary.bySubject || []).map((sub) => {
      const list = chs.filter((c) => c.subjectId === sub.id);
      if (!list.length) return null;
      const need = list.reduce((a, c) => a + c.needMinutes, 0);
      const planned = list.reduce((a, c) => a + c.plannedMinutes, 0);
      const testsNeed = list.reduce((a, c) => a + c.testsNeed, 0);
      const testsDone = list.reduce((a, c) => a + c.testsDone, 0);
      const covered = list.filter((c) => c.covered).length;
      const mastery = Math.round(list.reduce((a, c) => a + c.mastery, 0) / list.length);
      const reviews = list.reduce((a, c) => a + (c.reviews || 0), 0);
      return '<tr><td><b style="font-size:12px">' + esc(sub.name) + '</b>' +
        '<div class="muted" style="font-size:10.5px">ضریب ' + faNum(sub.weight) + '</div></td>' +
        '<td>' + faNum(covered) + ' / ' + faNum(list.length) + '</td>' +
        '<td>' + faNum(Math.round(covered / list.length * 100)) + '٪</td>' +
        '<td>' + faNum(Math.round(planned / 60)) + ' / ' + faNum(Math.round(need / 60)) + ' ساعت</td>' +
        '<td>' + faNum(testsDone) + ' / ' + faNum(testsNeed) + '</td>' +
        '<td>' + faNum(mastery) + '٪</td>' +
        '<td>' + faNum(reviews) + '</td>' +
        '<td>' + progressBar(planned / Math.max(1, need) * 100) + '</td></tr>';
    }).filter(Boolean);
    $('bookTable').innerHTML =
      '<table class="chap"><thead><tr><th>کتاب</th><th>فصل</th><th>پوشش</th><th>زمان چیده‌شده / لازم</th>' +
      '<th>تست انجام‌شده / لازم</th><th>تسلط فعلی</th><th>مرور</th><th style="width:120px">پیشرفت</th></tr></thead><tbody>' +
      rows.join('') + '</tbody></table>';
  }

  /** «چه چیزی مانده» — جملهٔ دقیق و قابل‌اجرا برای هر فصل */
  function remainingText(c) {
    if (c.mode === 'solid') return 'مرور فاصله‌دار تا کنکور';
    if (c.plannedMinutes === 0) {
      return c.read
        ? 'جبران نشده — نیازمند ' + faNum(c.needMinutes) + ' دقیقه بازآموزی'
        : 'هنوز خوانده نشده — نیازمند ' + faNum(c.needMinutes) + ' دقیقه';
    }
    if (c.covered) return c.testsNeed > 0 ? faNum(Math.max(0, c.testsNeed - c.testsDone)) + ' تست برای تکمیل' : 'تثبیت‌شده';
    const parts = [];
    if (c.remainingMinutes > 0) parts.push(faNum(c.remainingMinutes) + ' دقیقه مطالعه');
    if (c.testsNeed > c.testsDone) parts.push(faNum(c.testsNeed - c.testsDone) + ' تست');
    if (c.mastery < 75) parts.push('تسلط زیر ۷۵٪ (اکنون ' + faNum(Math.round(c.mastery)) + '٪)');
    return parts.length ? parts.join(' · ') : 'مرور';
  }

  function renderChapterTable(plan) {
    const box = $('chapterTable');
    if (!box) return;
    plan = plan || state.plan;
    if (!plan) return;
    const all = plan.summary.chapterStats || [];
    const book = ($('reportBook') && $('reportBook').value) || 'all';
    const filter = ($('reportFilter') && $('reportFilter').value) || 'all';
    let list = all.filter((c) => book === 'all' || c.subjectId === book);
    if (filter === 'open') list = list.filter((c) => !c.covered);
    else if (filter === 'weak') list = list.filter((c) => c.read && c.mastery < 75);
    else if (filter === 'deadline') list = list.filter((c) => c.deadlineIdx != null);
    else if (filter === 'week') {
      const today = iso(new Date());
      const weekEnd = (function () { const d = new Date(); d.setDate(d.getDate() + 7); return iso(d); })();
      const inWeek = new Set();
      state.plan.days.forEach((d) => {
        if (d.date >= today && d.date <= weekEnd) {
          d.blocks.forEach((b) => inWeek.add(b.subjectId + '|' + b.topic));
        }
      });
      list = list.filter((c) => Array.from(inWeek).some((k) => k.indexOf(c.subjectName + '|') === 0 && k.indexOf(c.label) !== -1));
    }

    if (!list.length) { box.innerHTML = '<div class="muted" style="font-size:12px">موردی با این فیلتر نیست.</div>'; return; }
    box.innerHTML =
      '<table class="chap"><thead><tr><th>فصل</th><th>وضعیت</th><th>تسلط</th><th>تست</th>' +
      '<th style="width:110px">پیشرفت</th><th>چه چیزی مانده</th></tr></thead><tbody>' +
      list.map((c) => '<tr' + (c.mode === 'solid' ? ' style="opacity:.75"' : '') + '>' +
        '<td><b style="font-size:12px">' + esc(c.label) + '</b>' +
          '<div class="muted" style="font-size:10.5px">' + esc(c.subjectName) +
          (c.deadlineTitle ? ' · مهلت: ' + esc(c.deadlineTitle) : '') + '</div></td>' +
        '<td><span class="pill ' + (c.mode === 'solid' ? '' : c.mastery < 45 ? 'hot' : c.mastery < 75 ? 'warm' : '') + '">' +
          esc(c.status) + '</span></td>' +
        '<td>' + faNum(Math.round(c.mastery)) + '٪<div class="muted" style="font-size:10.5px">هدف ۷۵٪</div></td>' +
        '<td><span dir="rtl">' + faNum(c.testsDone) + ' از ' + faNum(c.testsNeed) + '</span></td>' +
        '<td>' + progressBar(c.progress) + '</td>' +
        '<td style="font-size:11.5px">' + esc(remainingText(c)) + '</td>' +
      '</tr>').join('') + '</tbody></table>';
  }

  $('reportFilter').addEventListener('change', () => renderChapterTable(state.plan));
  $('reportBook').addEventListener('change', () => renderChapterTable(state.plan));

  /* ---------------- کارت مشاور: آمادگی و نقشهٔ جبران ---------------- */

  const MODE_FA = {
    learn: 'یادگیری از صفر',
    reteach: 'جبران و بازآموزی',
    boost: 'ارتقای تسلط',
    solid: 'فقط مرور',
  };

  function renderCoach(plan) {
    const c = (plan.summary && plan.summary.coverage) || null;
    if (!c) return;
    $('coachStats').innerHTML = [
      stat(faNum(c.readiness) + '٪', 'آمادگی فعلی'),
      stat(faNum(c.projectedReadiness) + '٪', 'برآورد پایان دوره'),
      stat(faNum(c.readChapters) + ' / ' + faNum(c.totalChapters), 'فصل خوانده‌شده'),
      stat(faNum(c.reteachChapters + c.boostChapters), 'فصل نیازمند جبران/ارتقا'),
    ].join('');

    const verdict = $('coachVerdict');
    verdict.innerHTML =
      '<div class="' + (c.willCover ? 'hint' : 'warn') + '">' +
        (c.willCover ? '✓ ' : '⚠ ') + esc(c.verdict) +
        ' <span class="muted" style="font-size:11px">(نیاز باقی‌مانده: ' + faNum(Math.round(c.remainingMinutes / 60)) +
        ' ساعت · ظرفیت آزاد تا کنکور: ' + faNum(Math.round(c.spareMinutes / 60)) + ' ساعت)</span>' +
      '</div>';

    const weak = (plan.summary.weakChapters || []).slice(0, 10);
    $('weakList').innerHTML = weak.length
      ? weak.map((w) => {
        const subj = (plan.summary.bySubject || []).find((x) => x.id === w.subjectId) || { weight: 1 };
        const cls = w.mastery < 45 ? 'hot' : 'warm';
        return '<div class="weakrow">' +
          '<span class="pill ' + cls + '">' + faNum(w.mastery) + '٪</span>' +
          '<b style="font-size:12px">' + esc(w.subjectName) + '</b>' +
          '<span style="flex:1">' + esc(w.label) + '</span>' +
          '<span class="muted" style="font-size:11px">' + esc(MODE_FA[w.mode] || w.mode) +
            ' · ضریب ' + faNum(subj.weight) + '</span>' +
          '<span class="muted" style="font-size:11px;min-width:78px;text-align:left">' +
            faNum(w.plannedMinutes) + ' دقیقه در برنامه</span>' +
        '</div>';
      }).join('')
      : '<div class="muted" style="font-size:12px">هیچ فصلی زیر ۷۵٪ تسلط نیست — وضعیت خوبی است؛ مرور فاصله‌دار ادامه پیدا می‌کند.</div>';

    const pr = plan.summary.priorities || [];
    $('priorityList').innerHTML = pr.length
      ? pr.map((x) => '<li>' + esc(x.subject) + ' — ' + esc(x.chapter) + ' <span class="pill ' +
          (x.mode === 'reteach' ? 'hot' : x.mode === 'boost' ? 'warm' : '') + '">' + esc(MODE_FA[x.mode] || x.mode) + '</span></li>').join('')
      : '<li class="muted">همهٔ فصل‌ها در وضعیت خوب‌اند؛ اولویت، حفظ تسلط با مرور و آزمون است.</li>';
  }

  function stat(value, label) {
    return '<div class="stat"><b>' + value + '</b><span>' + label + '</span></div>';
  }

  function renderWeek() {
    const plan = state.plan;
    const totalWeeks = Math.ceil(plan.days.length / 7);
    state.week = Math.max(0, Math.min(totalWeeks - 1, state.week));
    $('weekLabel').textContent = 'هفتهٔ ' + faNum(state.week + 1) + ' از ' + faNum(totalWeeks);

    const startIdx = state.week * 7;
    const pills = [];
    for (let i = startIdx; i < Math.min(startIdx + 7, plan.days.length); i++) {
      const d = plan.days[i];
      pills.push('<button class="day-pill' + (String(i) === String(state.selectedDay) ? ' active' : '') + '" data-day="' + i + '">' +
        esc(d.weekday) + '<small class="xp-day">' + jDayMonth(d.date) + '</small>' +
        '<small>' + faNum(Math.round(d.plannedMinutes / 60 * 10) / 10) + ' ساعت</small></button>');
    }
    $('dayPills').innerHTML = pills.join('');
    $('dayPills').querySelectorAll('[data-day]').forEach((b) => {
      b.addEventListener('click', () => { state.selectedDay = Number(b.dataset.day); renderWeek(); });
    });

    if (state.selectedDay == null || Math.floor(state.selectedDay / 7) !== state.week) {
      // پیش‌فرض: اولین روزِ پرِ همان هفته
      const first = plan.days.slice(startIdx, startIdx + 7).findIndex((d) => d.blocks.length);
      state.selectedDay = startIdx + (first === -1 ? 0 : first);
    }
    renderDay(state.selectedDay);
  }

  function renderDay(idx) {
    const plan = state.plan;
    const d = plan.days[idx];
    if (!d) { $('dayView').innerHTML = ''; return; }

    const head = '<div class="card" style="margin-bottom:10px;background:var(--panel2)">' +
      '<div class="row" style="justify-content:space-between">' +
      '<div><b style="font-size:13.5px">' + esc(jDateFull(d.date)) + '</b>' +
      '<div class="muted" style="font-size:11.5px;margin-top:3px">' + faNum(d.plannedMinutes) + ' دقیقه' +
      (d.isMockDay ? ' · آزمون جامع' : '') + (d.isDeload ? ' · هفتهٔ سبک' : '') + '</div></div>' +
      '</div>' + (d.note ? '<div class="muted" style="margin-top:8px">' + esc(d.note) + '</div>' : '') + '</div>';

    const events = (d.events || []).map((e) =>
      '<div class="evt' + (e.type === 'exam' ? ' exam' : '') + '">' +
      '<span>' + (e.type === 'exam' ? '📝' : '📌') + '</span>' +
      '<b>' + esc(e.title) + '</b>' +
      (e.subjectName ? '<span class="muted">· ' + esc(e.subjectName) + '</span>' : '') +
      '<span class="t">' + bidi(faNum(e.start) + '–' + faNum(e.end)) + (e.type === 'exam' ? ' · آزمون' : ' · کلاس') + '</span>' +
      '</div>').join('');

    const blocks = d.blocks.map((b, i) => {
      const key = d.date + '#' + i;
      const done = state.done[key] ? 'checked' : '';
      return '<div class="block">' +
        '<div class="time">' + bidi(faNum(b.start) + '–' + faNum(b.end)) + '<small>' + faNum(b.minutes) + ' دقیقه</small></div>' +
        '<div><div class="t">' + esc(b.subjectName) + ' <span class="muted" style="font-size:11px">· ' + esc(b.topic) + '</span></div>' +
        '<div class="c">' + esc(faNum(b.content)) + (b.retrievalTail ? ' <b style="color:#4f46e5">+' + faNum(b.retrievalTail) + ' دقیقه بازیابی</b>' : '') + '</div>' +
        '<div class="tech">' + esc(faNum(b.technique)) + '</div>' +
        (b.ifThen ? '<details><summary>جملهٔ اجرا (if-then)</summary>' + esc(b.ifThen) + '</details>' : '') +
        (b.why ? '<details><summary>چرا این کار؟</summary>' + esc(b.why) + '</details>' : '') +
        '</div>' +
        '<div><span class="badge ' + (KIND_CLASS[b.kind] || '') + '">' + esc(b.kindLabel) + '</span>' +
        '<div class="chk" style="margin-top:8px"><input type="checkbox" data-done="' + key + '" ' + done + ' /> انجام شد</div></div>' +
        '</div>';
    }).join('');

    const body = events + blocks;
    $('dayView').innerHTML = head + (body || '<div class="empty">این روز خالی است (استراحت).</div>');
    $('dayView').querySelectorAll('[data-done]').forEach((chk) => {
      chk.addEventListener('change', () => {
        state.done[chk.dataset.done] = chk.checked;
        persist();
      });
    });
  }

  $('prevWeek').addEventListener('click', () => { state.week--; state.selectedDay = null; renderWeek(); });
  $('nextWeek').addEventListener('click', () => { state.week++; state.selectedDay = null; renderWeek(); });

  /* ---------------- ثبت درصد آزمون ---------------- */

  function renderScoreGrid() {
    const plan = state.plan;
    if (!plan) return;
    $('scoreGrid').innerHTML = plan.summary.bySubject.map((s) =>
      '<div><label>' + esc(s.name) + ' (تسلط فعلی ' + faNum(s.mastery) + '٪)</label>' +
      '<input type="number" min="-33" max="100" placeholder="درصد" data-score="' + esc(s.id) + '" value="' +
      (state.scores[s.id] == null ? '' : state.scores[s.id]) + '" /></div>'
    ).join('');
    $('scoreGrid').querySelectorAll('[data-score]').forEach((inp) => {
      inp.addEventListener('input', () => { state.scores[inp.dataset.score] = inp.value; });
    });
  }

  /* درصد آزمون هر درس را به ارزیابی فصل‌به‌فصل همان درس منتقل می‌کند
     (فصل‌های خوانده‌شده نصفِ فاصله به‌سمت درصد آزمون حرکت می‌کنند) */
  function syncScoresToChapters() {
    Object.keys(state.scores).forEach((sid) => {
      const v = state.scores[sid];
      if (v === undefined || v === '' || v === null) return;
      const rows = state.chapters[sid];
      if (!rows || !rows.length) return;
      const target = Math.max(0, Math.min(100, Number(v)));
      rows.forEach((r) => {
        if (!r.read) return;
        r.mastery = Math.round(Math.max(0, Math.min(100, r.mastery + 0.5 * (target - r.mastery))));
      });
    });
  }

  $('replan').addEventListener('click', () => {
    if (!state.plan) return;
    const cfg = JSON.parse(JSON.stringify(state.config));
    let changed = 0;
    cfg.subjects = cfg.subjects.map((s) => {
      const v = state.scores[s.id];
      if (v === undefined || v === '') return s;
      changed++;
      return engine.applySubjectScore ? engine.applySubjectScore(s, Number(v)) : engine.updateMastery(s, Number(v));
    });
    if (!changed) return toast('اول درصد آزمون حداقل یک درس را وارد کن.');
    // تاریخ شروع = امروز
    cfg.startDate = iso(new Date());
    // ارزیابی فصل‌ها هم با درصد آزمون به‌روز شود تا برنامهٔ جبران دقیق بماند
    syncScoresToChapters();
    cfg.subjects = cfg.subjects.map(withChapters);
    try {
      state.plan = engine.createPlan(cfg);
      state.config = cfg;
      state.week = 0;
      state.selectedDay = null;
      applyConfigToForm(cfg);
      renderPlan();
      persist();
      toast('برنامه با نتایج جدید بازتنظیم شد ✓');
    } catch (err) {
      toast('خطا: ' + err.message);
    }
  });

  /* ---------------- بازچینش هوشمند روزهای ازدست‌رفته ---------------- */

  function missedBlocks() {
    const plan = state.plan;
    if (!plan) return [];
    const today = iso(new Date());
    const out = [];
    plan.days.forEach((d) => {
      if (d.date >= today) return;
      d.blocks.forEach((b, bi) => {
        if (b.kind === 'exam' || b.kind === 'mock') return;      // آزمون برگزارشده قابل جبران نیست
        const key = d.date + '#' + bi;
        if (state.done[key]) return;
        out.push({ day: d.date, block: b, key });
      });
    });
    return out;
  }

  $('smartReplan').addEventListener('click', () => {
    if (!state.plan) return toast('اول برنامه را بساز.');
    const missed = missedBlocks();
    if (!missed.length) {
      state.lastCarry = [];
      $('carryCount').textContent = 'کار جامانده‌ای نیست — عالی پیش رفته‌ای.';
      return toast('چیزی برای جبران نیست.');
    }
    /* کارهای جامانده را به «کار عقب‌افتاده» تبدیل کن (فقط بخش یادگیری/تست، با سقف) */
    const byTopic = {};
    missed.forEach((m) => {
      if (m.block.kind === 'analysis' || m.block.kind === 'warmup') return;
      const k = m.block.subjectId + '|' + m.block.topic;
      byTopic[k] = byTopic[k] || {
        subjectId: m.block.subjectId, subjectName: m.block.subjectName,
        label: m.block.topic || m.block.kindLabel, minutes: 0,
        kind: (m.block.kind === 'review' || m.block.kind === 'cumreview') ? 'review' : 'learn',
      };
      byTopic[k].minutes += m.block.minutes;
    });
    const carry = Object.keys(byTopic).map((k) => byTopic[k]);
    if (!carry.length) {
      $('carryCount').textContent = 'جاماندهٔ قابل‌جبران نداشتی.';
      return toast('جاماندهٔ قابل‌جبران نبود.');
    }
    const cfg = JSON.parse(JSON.stringify(state.config || collectConfig()));
    cfg.startDate = iso(new Date());                 // از امروز به بعد بازچینش
    cfg.carryOver = carry;
    try {
      state.plan = engine.createPlan(cfg);
      state.config = cfg;
      state.week = 0;
      state.selectedDay = null;
      state.lastCarry = carry;
      $('carryCount').textContent = faNum(carry.length) + ' کار جامانده به روزهای آینده منتقل شد (' +
        faNum(Math.round(carry.reduce((a, c) => a + c.minutes, 0) / 60 * 10) / 10) + ' ساعت).';
      renderPlan();
      renderReport();
      persist();
      toast('بازچینش انجام شد ✓');
    } catch (err) { toast('خطا در بازچینش: ' + err.message); }
  });

  $('markTodayDone').addEventListener('click', () => {
    if (!state.plan) return toast('اول برنامه را بساز.');
    const today = iso(new Date());
    const d = state.plan.days.find((x) => x.date === today);
    if (!d) return toast('امروز در برنامه نیست.');
    let n = 0;
    d.blocks.forEach((b, bi) => { state.done[today + '#' + bi] = true; n += 1; });
    persist();
    toast(faNum(n) + ' بلوک امروز تیک خورد.');
  });

  /* ---------------- خروجی‌ها ---------------- */

  document.querySelectorAll('[data-export]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      if (!state.plan) return toast('اول برنامه را بساز.');
      const type = btn.dataset.export;
      try {
        if (type === 'tasks') {
          const today = iso(new Date());
          const text = engine.toTaskList(state.plan, today) || engine.toTaskList(state.plan);
          await navigator.clipboard.writeText(text);
          return toast('تسک‌های امروز کپی شد — در روال بچسبان.');
        }
        if (type === 'report-md') {
          const content = buildReportMarkdown();
          if (api && api.saveFile) {
            const res = await api.saveFile({ name: 'گزارش-روال.md', ext: 'md', content });
            return toast(res && res.ok ? 'ذخیره شد: ' + res.path : 'ذخیره لغو شد.');
          }
          const a = document.createElement('a');
          a.href = URL.createObjectURL(new Blob([content], { type: 'text/markdown;charset=utf-8' }));
          a.download = 'گزارش-روال.md';
          a.click();
          return toast('گزارش ذخیره شد.');
        }
        if (type === 'report-csv') {
          const rows = [['کتاب', 'فصل', 'وضعیت', 'تسلط', 'تست انجام‌شده', 'تست لازم', 'پیشرفت', 'باقی‌مانده (دقیقه)']];
          (state.plan.summary.chapterStats || []).forEach((c) => rows.push([
            c.subjectName, c.label, c.status, c.mastery, c.testsDone, c.testsNeed, c.progress, c.remainingMinutes,
          ]));
          const csv = '\ufeff' + rows.map((r) => r.map((x) => '"' + String(x).replace(/"/g, '""') + '"').join(',')).join('\r\n');
          const a = document.createElement('a');
          a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
          a.download = 'گزارش-فصل‌ها.csv';
          a.click();
          return toast('گزارش فصل‌ها ذخیره شد.');
        }
        const map = {
          md: { content: engine.toMarkdown(state.plan), ext: 'md', label: 'برنامه-روال.md' },
          csv: { content: '\ufeff' + engine.toCSV(state.plan), ext: 'csv', label: 'برنامه-روال.csv' },
          ics: { content: engine.toICS(state.plan), ext: 'ics', label: 'برنامه-روال.ics' },
          json: { content: JSON.stringify({ config: state.config, plan: state.plan }, null, 2), ext: 'json', label: 'برنامه-روال.json' },
        };
        const f = map[type];
        if (api && api.saveFile) {
          const res = await api.saveFile({ name: f.label, ext: f.ext, content: f.content });
          toast(res && res.ok ? 'ذخیره شد: ' + res.path : 'ذخیره لغو شد.');
        } else {
          const blob = new Blob([f.content], { type: 'text/plain;charset=utf-8' });
          const a = document.createElement('a');
          a.href = URL.createObjectURL(blob);
          a.download = f.label;
          a.click();
          toast('دانلود شد.');
        }
      } catch (err) {
        toast('خطا در خروجی: ' + err.message);
      }
    });
  });

  function buildReportMarkdown() {
    const plan = state.plan;
    const c = plan.summary.coverage;
    const L = [];
    L.push('# گزارش برنامهٔ روال — ' + (plan.meta.studentName || ''));
    L.push('');
    L.push('- پوشش فصل‌ها: **' + faNum(c.coverageRatio) + '٪**');
    L.push('- آمادگی کنکور: ' + faNum(c.readiness) + '٪ → برآورد پایان: **' + faNum(c.projectedReadiness) + '٪**');
    L.push('- آمادگی سوابق تحصیلی: **' + faNum(c.finalsReadiness) + '٪** · نمرهٔ ترکیبی ۱۴۰۶: **' + faNum(c.composite) + '٪**');
    L.push('- ساعت برنامه‌ریزی‌شده: ' + faNum(plan.summary.totalHours) + ' ساعت · تست: ' + faNum(c.testsPlanned) +
      ' (' + faNum(c.testsPerDay) + ' در روز)');
    L.push('');
    if ((c.deadlines || []).length) {
      L.push('## مهلت‌ها');
      L.push('| مهلت | مدل | تاریخ | وضعیت | زمان چیده‌شده / لازم |');
      L.push('|---|---|---|---|---|');
      c.deadlines.forEach((d) => L.push('| ' + d.title + ' | ' + (d.model === 'book' ? 'کتابی' : 'آزمون') +
        ' | ' + faNum(J ? J.fmt(d.date) : d.date) + ' | ' + (DL_STATUS[d.status] || {}).fa +
        ' | ' + Math.round(d.plannedMinutes / 60) + ' / ' + Math.round(d.needMinutes / 60) + ' ساعت |'));
      L.push('');
    }
    if ((c.finalsCourses || []).length) {
      L.push('## سوابق تحصیلی (نهایی)');
      L.push('| درس | ضریب | فعلی | هدف | برآورد پایان | زمان چیده‌شده / لازم |');
      L.push('|---|---|---|---|---|---|');
      c.finalsCourses.forEach((x) => L.push('| ' + x.name + ' | ' + x.influence + ' | ' +
        (Math.round(x.current * 10) / 10) + (x.assumed ? ' (فرض)' : '') + ' | ' + x.target + ' | ' +
        (Math.round((x.projected / 100) * 20 * 10) / 10) + ' | ' +
        Math.round(x.plannedMinutes / 60 * 10) / 10 + ' / ' + Math.round(x.needMinutes / 60 * 10) / 10 + ' |'));
      L.push('');
    }
    L.push('## فصل‌به‌فصل');
    L.push('| کتاب | فصل | وضعیت | تسلط | تست | پیشرفت | چه چیزی مانده |');
    L.push('|---|---|---|---|---|---|---|');
    (plan.summary.chapterStats || []).forEach((x) => L.push('| ' + x.subjectName + ' | ' + x.label + ' | ' + x.status +
      ' | ' + Math.round(x.mastery) + '٪ | ' + x.testsDone + '/' + x.testsNeed + ' | ' + x.progress + '٪ | ' + remainingText(x) + ' |'));
    return L.join('\n');
  }

  /* ---------------- ذخیره/بازیابی ---------------- */

  async function persist() {
    if (!api || !api.saveState) return;
    try {
      await api.saveState({
        config: state.config,
        plan: state.plan,
        scores: state.scores,
        done: state.done,
      });
    } catch (e) { /* بی‌صدا */ }
  }

  async function restore() {
    if (api && api.loadState) {
      try {
        const data = await api.loadState();
        if (data && data.config) {
          applyConfigToForm(data.config);
          state.scores = data.scores || {};
          state.done = data.done || {};
          if (data.plan) {
            state.plan = data.plan;
            renderPlan();
            return;
          }
          return;
        }
      } catch (e) { /* ادامه با پیش‌فرض */ }
    }
    applyConfigToForm(defaultConfig());
  }

  /* ---------------- شروع ---------------- */

  if (J) J.attachAll(document);
  restore();
})();
