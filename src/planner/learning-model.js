/**
 * Reval 2.9.0 — مدلِ یادگیری: از «حجمِ محتوا» تا «طرحِ جلسه»
 * ------------------------------------------------------------------
 * این فایل قلبِ بازنویسیِ ۲.۹.۰ است. سه کار می‌کند:
 *
 *   ۱) زمانِ لازمِ هر فصل را از محتوا برآورد می‌کند (نه از ضربِ سه عددِ اختیاری):
 *        Learn       = s · [ w_p·(P·a) + w_c·(N·m) ]
 *        Practice    = max( Learn·(p/l) , N_ex·e·s ) · (۱٫۲ برای فصلِ پرتکرار)
 *        Consolidate = Learn·(c/l)        Assess = Learn·(q/l)
 *      (فرمول‌ها از گزارشِ پژوهشی ۱۳ آبان ۱۴۰۵ — بخش ۳)
 *
 *   ۲) از آن، **طرحِ جلسه** می‌سازد: توالیِ جلسه‌های اتمی با نوع و طولِ مشخص
 *      (مفهوم + نمونهٔ حل‌شده / تمرینِ هدایت‌شده / تمرینِ مستقل / بازیابی / سنجش).
 *      هیچ جلسه‌ای کوچک‌تر از «حدِ معنادار» ساخته نمی‌شود (۳۵ دقیقه یادگیریِ نو،
 *      ۴۰ دقیقه تمرین) — این همان باگِ «نیم ساعت ریاضی» است.
 *
 *   ۳) نردبانِ مرور را از افقِ آزمون می‌سازد (درون‌یابیِ لگاریتمی بین ۳۰/۹۰/۱۸۰/۳۰۰).
 *
 * همهٔ اعداد از model-params.js می‌آیند (همان JSONِ گزارش).
 */
(function (root, factory) {
  const api = factory(
    typeof require === 'function' ? require('./model-params.js') : root.RevalModelParams,
    typeof require === 'function' ? require('./chapter-size.js') : root.RevalChapterSize,
  );
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.RevalLearningModel = api;
}(typeof window !== 'undefined' ? window : globalThis, function (P, SZ) {
  'use strict';

  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

  /* ═════════ نردبانِ مرور ═════════ */

  const LADDER_COLS = [
    { h: 30, gaps: P.reviewLadder.horizon30 },
    { h: 90, gaps: P.reviewLadder.horizon90 },
    { h: 180, gaps: P.reviewLadder.horizon180 },
    { h: 300, gaps: P.reviewLadder.horizon300 },
  ];

  /**
   * نردبانِ فاصله برای افقِ H روز.
   * بین ستون‌ها درون‌یابیِ لگاریتمی؛ بیرون از بازه، نزدیک‌ترین ستون با مقیاسِ خطی.
   * آخرین پله هرگز از ۰٫۷۵×H بیشتر نمی‌شود (قاعدهٔ گزارش).
   */
  function ladderFor(H) {
    const h = Math.max(5, Math.round(Number(H) || 90));
    let gaps;
    if (h <= 30) {
      gaps = LADDER_COLS[0].gaps.slice();
      const k = h / 30;
      gaps = gaps.map((g) => Math.max(1, Math.round(g * k)));
    } else if (h >= 300) {
      gaps = LADDER_COLS[3].gaps.slice();
      const k = Math.min(1.6, h / 300);
      gaps = gaps.map((g) => Math.max(1, Math.round(g * k)));
    } else {
      let lo = LADDER_COLS[0]; let hi = LADDER_COLS[1];
      for (let i = 0; i < LADDER_COLS.length - 1; i += 1) {
        if (h >= LADDER_COLS[i].h && h <= LADDER_COLS[i + 1].h) { lo = LADDER_COLS[i]; hi = LADDER_COLS[i + 1]; break; }
      }
      const t = (Math.log(h) - Math.log(lo.h)) / (Math.log(hi.h) - Math.log(lo.h));
      const n = Math.max(lo.gaps.length, hi.gaps.length);
      gaps = [];
      for (let i = 0; i < n; i += 1) {
        const a = lo.gaps[Math.min(i, lo.gaps.length - 1)];
        const b = hi.gaps[Math.min(i, hi.gaps.length - 1)];
        gaps.push(Math.max(1, Math.round(Math.exp(Math.log(a) * (1 - t) + Math.log(b) * t))));
      }
      const take = Math.round(lo.gaps.length * (1 - t) + hi.gaps.length * t);
      gaps = gaps.slice(0, Math.max(3, take));
    }
    /* صعودی + سقفِ ۰٫۷۵×H */
    gaps.sort((a, b) => a - b);
    const cap = Math.max(4, Math.round(h * 0.75));
    const out = [];
    gaps.forEach((g) => { if (!out.length || g > out[out.length - 1]) out.push(Math.min(g, cap)); });
    return out;
  }

  /** تعدادِ مرورهای مؤثر (سقف ۶؛ بالاتر بازده ندارد) */
  function reviewCountFor(H) {
    const h = Math.max(5, Number(H) || 90);
    if (h <= 30) return P.reviewCount.horizon30;
    if (h <= 90) return P.reviewCount.horizon90;
    if (h <= 180) return P.reviewCount.horizon180;
    return P.reviewCount.horizon300;
  }

  /* ═════════ ضریبِ فردی ═════════ */
  /**
   * s = clamp(1 − 0.006·(m_eff − 50), 0.8, 1.4)
   * m_eff پیشین = 0.5·تسلطِ اعلامی + 25
   * اگر سنجشِ واقعی داشتیم: m_eff = 0.5·quiz + 0.25·تسلط + 25 (وزنِ سنجش بیشتر)
   */
  function individualScale(masterySelf, quizScore) {
    const self = clamp(Number(masterySelf) || 0, 0, 100);
    const mEff = (quizScore != null && Number.isFinite(Number(quizScore)))
      ? 0.5 * Number(quizScore) + 0.25 * self + 25
      : 0.5 * self + 25;
    const s = clamp(1 - 0.006 * (mEff - 50), 0.8, 1.4);
    return { s: Math.round(s * 1000) / 1000, mEff: Math.round(mEff * 10) / 10 };
  }

  /* ═════════ تیر (tier) از اهمیتِ کنکور ═════════ */
  function tierOf(ciImportance, subjectId, chapter) {
    if (ciImportance != null && Number(ciImportance) > 0) return clamp(Math.round(Number(ciImportance)), 1, 5);
    const e = P.catalogEntry ? P.catalogEntry(subjectId, chapter) : null;
    if (e && e.tier) return clamp(Number(e.tier), 1, 5);
    return 3;
  }

  /* ═════════ زمانِ لازم ═════════ */
  function ratios(profile) {
    const m = P.mixRatio[profile] || P.mixRatio.concept;
    return m;
  }

  /**
   * برآوردِ زمان و طرحِ جلسهٔ یک فصل.
   * @param {object} c { subjectId, chapter, chapters, type, mastery, quiz, ciImportance, horizonDays, read }
   * @returns {object} profile
   */
  function chapterProfile(c) {
    const o = c || {};
    const size = SZ.sizeOf(o.subjectId, o.chapter, { type: o.type, chapters: o.chapters });
    const profile = size.profile;
    const ratio = ratios(profile);
    const mpp = P.minutesPerPage[profile] || P.minutesPerPage.concept;
    const a = mpp.active;
    const m = P.minutesPerNewConcept[o.subjectId] != null ? P.minutesPerNewConcept[o.subjectId]
      : (profile === 'quant' ? 18 : profile === 'memory' ? 7 : 10);
    const e = P.minutesPerExercise[o.subjectId] != null ? P.minutesPerExercise[o.subjectId]
      : (profile === 'quant' ? 4 : 1.5);
    const w = P.pageVsConceptWeights[profile] || P.pageVsConceptWeights.concept;

    const scale = individualScale(o.mastery, o.quiz);
    const s = scale.s;
    const tier = tierOf(o.ciImportance, o.subjectId, o.chapter);

    /* زمانِ «یادگیری از صفر» از محتوا */
    const rawLearn = s * (w.page * (size.pages * a) + w.concept * (size.concepts * m));

    /* حالتِ فصل بر اساسِ تسلطِ اعلامی (همان منطقِ قبلی، ولی روی زمانِ محتوایی) */
    const self = clamp(Number(o.mastery) || 0, 0, 100);
    const A = (P.masteryBands && P.masteryBands.advance) || 0.80;
    const T = (P.masteryBands && P.masteryBands.targetedPractice) || 0.65;
    let mode = 'learn';
    let learn = rawLearn;
    if (o.read || self > 0) {
      if (self >= A * 100) { mode = 'solid'; learn = 0; }
      else if (self >= T * 100) { mode = 'boost'; learn = rawLearn * (1 - self / 100) * 1.6; }
      else { mode = 'reteach'; learn = rawLearn * (1 - self / 100) * 1.25; }
    }

    const depthMult = tier >= P.depthForHighFrequency.tierThreshold ? P.depthForHighFrequency.practiceMultiplier : 1;
    const practice = mode === 'solid'
      ? Math.max(30, Math.round(size.exercises * e * s * 0.25))
      : Math.round(Math.max(learn * (ratio.practice / ratio.learn), size.exercises * e * s) * depthMult);
    const consolidate = Math.round(learn * (ratio.consolidate / ratio.learn));
    const assessBase = Math.round(learn * (ratio.assess / ratio.learn));
    const assess = clamp(Math.max(assessBase, P.assessLength.minutes[0]), 10, P.assessLength.minutes[1] + 20);

    const T0 = learn + practice + consolidate + assess;
    const H = Math.max(7, Number(o.horizonDays) || 180);
    const gaps = ladderFor(H);
    const count = Math.min(gaps.length, reviewCountFor(H) + (tier >= P.depthForHighFrequency.tierThreshold && reviewCountFor(H) < 6 ? P.depthForHighFrequency.extraReviews : 0), 6);
    const reviews = [];
    for (let i = 0; i < count; i += 1) {
      const frac = P.reviewLengthFractionOfInitialTime[i] || 0.02;
      /* طولِ مرور: کسری از زمانِ اولیه، ولی همیشه داخلِ بازهٔ استانداردِ جلسهٔ
         مرور (۱۰ تا ۳۰ دقیقه) تا بلوکی که در برنامه جا نمی‌شود ساخته نشود. */
      const rm = clamp(Math.round(T0 * frac), P.reviewLengthFloorMinutes, 30);
      reviews.push({ gap: gaps[i], minutes: rm });
    }

    return {
      subjectId: o.subjectId, chapter: o.chapter,
      profile, size, tier, mode,
      scale: s, mEff: scale.mEff,
      learn: Math.round(learn), consolidate, practice, assess,
      T0: Math.round(T0),
      reviews,
      reviewTotal: reviews.reduce((x, r) => x + r.minutes, 0),
      total: Math.round(T0 + reviews.reduce((x, r) => x + r.minutes, 0)),
      sessions: composeSessions({
        profile, mode, tier,
        learn: Math.round(learn), practice, consolidate, assess,
      }),
    };
  }

  /* ═════════ طرحِ جلسه (Session Composer) ═════════ */
  const B = P.sessionBounds;
  const MIN = P.minMeaningfulSession;

  function splitInto(total, min, max) {
    if (total <= 0) return [];
    const out = [];
    let left = Math.round(total);
    while (left > 0) {
      if (left <= max) { out.push(left); break; }
      const take = Math.min(max, Math.max(min, Math.round(left / Math.ceil(left / max))));
      out.push(take);
      left -= take;
      if (out.length > 40) break;
    }
    /* جلسهٔ آخرِ ناچیز را به قبلی بچسبان (نه جلسهٔ ۸ دقیقه‌ای) */
    if (out.length > 1 && out[out.length - 1] < min) {
      const tail = out.pop();
      out[out.length - 1] += tail;
    }
    return out;
  }

  /**
   * توالیِ جلسه‌ها: [مفهوم × k] → [تمرین هدایت‌شده] → [تمرین مستقل × m] → [سنجش]
   * هر جلسهٔ یادگیری با ۵ دقیقه بازیابی بسته می‌شود؛ جلسهٔ دوم به بعد با ۱۵ دقیقه
   * بازیابیِ همان فصل باز می‌شود (Roediger & Karpicke 2006؛ گزارش، گزارهٔ ۶).
   */
  function composeSessions(x) {
    const prof = x.profile;
    const out = [];
    const learnBounds = prof === 'quant' ? [35, 50] : (prof === 'memory' ? B.memory : B.concept);
    /* جلسهٔ تمرین: کف ۴۵ (حدِ معنادارِ تمرین) و سقف ۶۰ تا جلسه‌ها بلوک‌های واقعیِ روز باشند */
    const practiceBounds = prof === 'quant' ? [45, 60] : (prof === 'memory' ? B.memory : [40, 55]);

    if (x.learn > 0) {
      const parts = splitInto(x.learn, Math.max(MIN.newLearning, learnBounds[0]), learnBounds[1]);
      parts.forEach((mins, i) => {
        out.push({
          type: 'concept',
          label: 'مفهوم + نمونهٔ حل‌شده',
          minutes: mins,
          openRetrieval: i === 0 ? 0 : Math.min(15, Math.round(mins * 0.3)),
          closeRetrieval: 5,
        });
      });
    }
    if (x.practice > 0) {
      const guided = Math.round(x.practice * (prof === 'quant' ? 0.3 : 0.25));
      const solo = x.practice - guided;
      const gParts = splitInto(guided, Math.max(MIN.practice, practiceBounds[0]), practiceBounds[1]);
      const sParts = splitInto(solo, Math.max(MIN.practice, practiceBounds[0]), practiceBounds[1]);
      gParts.forEach((mins, i) => out.push({
        type: 'guided', label: 'تمرینِ هدایت‌شده', minutes: mins,
        openRetrieval: 5, closeRetrieval: 0, interleaveShare: 0, practiceIndex: i,
      }));
      sParts.forEach((mins, i) => out.push({
        type: 'solo', label: 'تمرینِ مستقل + تست', minutes: mins,
        openRetrieval: 5, closeRetrieval: 0,
        /* درهم‌آمیزی از جلسهٔ دومِ تمرین به بعد (گزارش، ردیف ۹) */
        interleaveShare: (i + 1) >= P.interleaving.startAfterPracticeSessions ? (P.interleaving[x.subjectId] || 0) : 0,
        practiceIndex: gParts.length + i,
      }));
    }
    if (x.assess > 0) {
      const quiz = clamp(Math.round(x.assess * 0.45), B.assess[0], 25);
      const analysis = Math.max(0, Math.round(x.assess) - quiz);
      out.push({ type: 'assess', label: 'سنجشِ کوتاهِ فصل', minutes: quiz, openRetrieval: 0, closeRetrieval: 0, quizItems: P.assessLength.items });
      if (analysis >= 15) {
        splitInto(analysis, 20, 45).forEach((mins, i) => out.push({
          type: 'analysis', label: 'تحلیل خطا و رفعِ نقطه‌ضعف', minutes: mins, openRetrieval: 0, closeRetrieval: 0, analysisIndex: i,
        }));
      }
    }
    return out;
  }

  /* ═════════ قواعدِ بارِ روزانه (گزارش، ردیف ۱۲ و dailyCapRule) ═════════ */
  const CAPS = {
    effectiveDailyHours: 10.5,
    hardLearningShare: 0.6,
    hardLearningHours: 5,
    maxDayOverWeekMean: 1.15,
    lightDayEveryDays: 7,
    lightDayRatio: 0.55,
    maxConsecutiveHeavy: 3,
  };

  function subjectsPerDay(loadMinutes) {
    const h = loadMinutes / 60;
    if (h <= 4) return 2;
    if (h <= 8) return 3;
    return 4;
  }

  /** سهمِ وزنیِ موردانتظارِ یک فصل از کل آزمون (برای اولویت در کمبودِ وقت) */
  function expectedWeightShare(pi, subjectWeight, totalWeightedQuestions) {
    if (!totalWeightedQuestions) return 0.5;
    return (pi.size.pages * 1 + (P.catalogExtra ? 0 : 0)) / totalWeightedQuestions;
  }

  /**
   * سهمِ تمرینِ درهم (interleaving) برای هر درس — گزارش، ردیف ۹.
   * در ریاضی ۴۰٪ تست‌های هر جلسه از فصل‌های قبلی می‌آید تا «تشخیصِ روش»
   * تمرین شود، نه فقط اجرای روشِ همین فصل (Rohrer & Taylor 2007).
   */
  function interleaveShare(subjectId, profile) {
    const map = P.interleaving || {};
    if (map[subjectId] != null) return map[subjectId];
    if (profile === 'memory') return 0;
    return profile === 'quant' ? 0.35 : 0.15;
  }

  return {
    ladderFor, reviewCountFor, individualScale, tierOf, chapterProfile,
    composeSessions, splitInto, CAPS, subjectsPerDay, expectedWeightShare, interleaveShare,
    ratios, LADDER_COLS,
  };
}));
