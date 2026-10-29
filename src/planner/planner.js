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

  /* ---------------- تب‌ها ---------------- */

  document.querySelectorAll('.tab').forEach((tab) => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.tab').forEach((t) => t.classList.remove('active'));
      document.querySelectorAll('.view').forEach((v) => v.classList.remove('active'));
      tab.classList.add('active');
      $('view-' + tab.dataset.view).classList.add('active');
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
      classes: readClasses(),
      exams: readExams(),
      generalGrades: state.gradeSel.slice(),
      subjects,
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
      classes: [],
      exams: [],
      generalGrades: state.gradeSel.slice(),
      subjects: presets.subjectsFor(field).concat(generalFromGrades()),
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
