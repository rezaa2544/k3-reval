'use strict';

/**
 * Reval — به‌روزرسانی خودکار
 * ------------------------------------------------------------------
 * هستهٔ خالص (بدون وابستگی به Electron) تا قابل تست باشد.
 * وظیفه: خواندن آخرین Release از GitHub، مقایسهٔ نسخه، انتخاب فایل
 * نصب، دانلود با درصد پیشرفت و اجرای نصب‌کننده به‌صورت سایلنت.
 *
 * در main.js با تابع‌های واقعی Electron تزریق می‌شود.
 */

const fs = require('fs');

const OWNER = 'rezaa2544';
const REPO = 'k3-reval';
const ASSET_RE = /^Reval-Setup-.*\.exe$/i;
const PATCH_RE = /^reval-code-.*\.zip$/i;
const PATCH_SHA_RE = /^reval-code-.*\.zip\.sha256$/i;

/* ---------- ابزار نسخه ---------- */

function parseVersion(v) {
  const s = String(v || '').trim().replace(/^v/i, '');
  const m = s.match(/^(\d+)\.(\d+)\.(\d+)/);
  if (!m) return null;
  return { major: +m[1], minor: +m[2], patch: +m[3], raw: s, pre: /-/.test(s) ? s.split('-').slice(1).join('-') : '' };
}

/** a > b  →  1 | a < b → -1 | برابر → 0 */
function compareVersions(a, b) {
  const x = parseVersion(a);
  const y = parseVersion(b);
  if (!x || !y) return 0;
  const keys = ['major', 'minor', 'patch'];
  for (let i = 0; i < keys.length; i++) {
    if (x[keys[i]] !== y[keys[i]]) return x[keys[i]] > y[keys[i]] ? 1 : -1;
  }
  /* نسخهٔ نهایی بر پیش‌انتشار مقدم است */
  if (x.pre && !y.pre) return -1;
  if (!x.pre && y.pre) return 1;
  return 0;
}

/* ---------- انتخاب فایل نصبی ---------- */

function pickAsset(assets) {
  const list = Array.isArray(assets) ? assets : [];
  const exe = list.filter((a) => a && ASSET_RE.test(a.name || ''));
  if (!exe.length) return null;
  const withSize = exe.filter((a) => !a.size || a.size > 5 * 1024 * 1024);
  const pool = withSize.length ? withSize : exe;
  /* جدیدترین/بزرگ‌ترین فایل نصبی؛ نام استاندارد Reval-Setup-x.y.z.exe اولویت دارد */
  pool.sort((a, b) => {
    const av = (String(a.name).match(/(\d+\.\d+\.\d+)/) || [])[1] || '0.0.0';
    const bv = (String(b.name).match(/(\d+\.\d+\.\d+)/) || [])[1] || '0.0.0';
    return compareVersions(bv, av) || (b.size || 0) - (a.size || 0);
  });
  return pool[0];
}

/* ---------- خواندن پاسخ API ---------- */

/** وصلهٔ کوچک کد (اگر منتشر شده باشد) */
function pickPatch(assets) {
  const list = Array.isArray(assets) ? assets : [];
  const zip = list.find((a) => a && PATCH_RE.test(a.name || ''));
  if (!zip) return null;
  const sha = list.find((a) => a && PATCH_SHA_RE.test(a.name || ''));
  return {
    name: zip.name,
    url: zip.browser_download_url,
    size: zip.size || 0,
    shaUrl: sha ? sha.browser_download_url : null,
  };
}

function parseRelease(release, currentVersion) {
  if (!release || !release.tag_name) {
    return { ok: false, error: 'پاسخ گیت‌هاب نامعتبر بود.', current: currentVersion, hasUpdate: false };
  }
  const latest = String(release.tag_name).replace(/^v/i, '');
  const asset = pickAsset(release.assets);
  const hasUpdate = compareVersions(latest, currentVersion) > 0;
  return {
    ok: true,
    current: currentVersion,
    latest,
    hasUpdate: Boolean(hasUpdate),
    asset: asset ? { name: asset.name, url: asset.browser_download_url, size: asset.size || 0 } : null,
    patch: pickPatch(release.assets),
    notes: release.body || '',
    publishedAt: release.published_at || '',
    pageUrl: release.html_url || ('https://github.com/' + OWNER + '/' + REPO + '/releases/tag/v' + latest),
    /* نسخهٔ جدید هست ولی فایلی برای ویندوز گذاشته نشده */
    missingAsset: Boolean(hasUpdate && !asset),
  };
}

function apiUrl() {
  return 'https://api.github.com/repos/' + OWNER + '/' + REPO + '/releases/latest';
}

function bytesToMb(n) {
  return Math.round((Number(n) || 0) / 1048576);
}

/* ---------- سازندهٔ اصلی ---------- */

/**
 * @param {object} deps
 * @param {()=>string} deps.getCurrentVersion
 * @param {(url:string, headers?:object)=>Promise<{status:number, body:any}>} deps.httpJson
 * @param {(url:string, dest:string, onProgress:(p:{received:number,total:number,percent:number})=>void)=>Promise<string>} deps.downloadFile
 * @param {(file:string, opts:{installDir:string})=>Promise<void>} deps.runInstaller
 * @param {(p:string)=>boolean} deps.exists
 * @param {()=>string} deps.tempPath
 * @param {(ev:object)=>void} [deps.onEvent]
 * @param {()=>void} [deps.quit]
 */
function createUpdater(deps) {
  const emit = (ev) => { try { if (deps.onEvent) deps.onEvent(ev); } catch (_) { /* بی‌صدا */ } };

  const state = {
    status: 'idle',        // idle | checking | latest | available | downloading | ready | error | installing
    current: deps.getCurrentVersion(),
    latest: null,
    hasUpdate: false,
    notes: '',
    pageUrl: '',
    asset: null,
    percent: 0,
    received: 0,
    total: 0,
    error: '',
    file: '',
    checkedAt: 0,
    patch: null,          // {name,url,size,shaUrl}
    patchReady: false,    // وصلهٔ کوچک انتخاب شده است؟
    mode: 'full',         // 'patch' = فقط کد تغییریافته · 'full' = نصب‌کنندهٔ کامل
    usedPatch: false,     // این به‌روزرسانی واقعاً با وصله انجام شد؟
    savedMb: 0,           // چند مگابایت صرفه‌جویی شد
  };

  let inflight = null;

  function snapshot() {
    return {
      status: state.status,
      current: state.current,
      latest: state.latest,
      hasUpdate: state.hasUpdate,
      notes: state.notes,
      pageUrl: state.pageUrl,
      sizeMb: bytesToMb(state.asset && state.asset.size),
      percent: Math.round(state.percent),
      receivedMb: Math.round((state.received / 1048576) * 10) / 10,
      totalMb: Math.round((state.total / 1048576) * 10) / 10,
      error: state.error,
      checkedAt: state.checkedAt,
      ready: state.status === 'ready',
      mode: state.mode,
      patchSizeMb: state.patch ? Math.round(((state.patch.size || 0) / 1048576) * 100) / 100 : 0,
      patchKb: state.patch ? Math.round((state.patch.size || 0) / 1024) : 0,
      patchAvailable: Boolean(state.patch && state.patchReady),
      usedPatch: state.usedPatch,
      savedMb: state.savedMb,
      activeCode: deps.currentCodeVersion ? deps.currentCodeVersion() : null,
    };
  }

  function set(patch, evName) {
    Object.assign(state, patch);
    const snap = snapshot();
    emit({ type: evName || 'state', state: snap });
    return snap;
  }

  async function check(opts) {
    const silent = Boolean(opts && opts.silent);
    if (inflight) return inflight;
    state.current = deps.getCurrentVersion();
    if (!silent) set({ status: 'checking', error: '' });
    else emit({ type: 'state', state: snapshot() });

    inflight = (async () => {
      try {
        const res = await deps.httpJson(apiUrl(), {
          Accept: 'application/vnd.github+json',
          'User-Agent': 'Reval-Desktop-Updater',
        });
        if (res.status === 404) throw new Error('هیچ نسخه‌ای در گیت‌هاب منتشر نشده است.');
        if (res.status === 403) throw new Error('محدودیت تعداد درخواست گیت‌هاب؛ چند دقیقهٔ دیگر دوباره تلاش کن.');
        if (res.status !== 200) throw new Error('گیت‌هاب پاسخ ' + res.status + ' داد.');
        const parsed = parseRelease(res.body, state.current);
        if (!parsed.ok) throw new Error(parsed.error || 'پاسخ نامعتبر');
        state.checkedAt = Date.now();
        const patch = {
          latest: parsed.latest,
          hasUpdate: parsed.hasUpdate,
          notes: parsed.notes,
          pageUrl: parsed.pageUrl,
          asset: parsed.asset,
          error: '',
          percent: 0,
          received: 0,
          total: parsed.asset ? parsed.asset.size : 0,
        };
        /* آیا می‌توان فقط کد را آپدیت کرد؟ (حجم چند صد کیلوبایت به‌جای ده‌ها مگابایت) */
        let patchReady = false;
        if (parsed.hasUpdate && parsed.patch && deps.supportsPatch ? deps.supportsPatch(parsed.latest, parsed.patch) : false) {
          patchReady = true;
        }
        state.patch = parsed.patch || null;
        state.patchReady = patchReady;
        state.mode = patchReady ? 'patch' : 'full';

        if (parsed.missingAsset) {
          return set({ ...patch, status: 'error', error: 'نسخهٔ ' + parsed.latest + ' منتشر شده ولی فایل نصب ویندوز ندارد.' }, 'error');
        }
        return set({ ...patch, status: parsed.hasUpdate ? 'available' : 'latest' }, parsed.hasUpdate ? 'available' : 'latest');
      } catch (err) {
        const msg = (err && err.message) ? err.message : 'بررسی به‌روزرسانی ناموفق بود (اتصال اینترنت؟)';
        return set({ status: 'error', error: msg }, 'error');
      } finally {
        inflight = null;
      }
    })();
    return inflight;
  }

  async function download(opts) {
    const forceFull = Boolean(opts && opts.full);
    const usePatch = state.mode === 'patch' && !forceFull && state.patch && state.patchReady;
    if (usePatch) return downloadPatch();
    if (!state.hasUpdate || !state.asset) {
      return set({ status: 'error', error: 'نسخهٔ جدیدی برای دانلود مشخص نیست.' }, 'error');
    }
    const target = deps.tempPath(state.asset.name);
    const sizeOnDisk = deps.fileSize ? deps.fileSize(target) : -1;
    if (deps.exists(target) && state.asset.size && sizeOnDisk === state.asset.size) {
      state.file = target;
      return set({ status: 'ready', percent: 100, error: '' }, 'ready');
    }
    set({ status: 'downloading', percent: 0, received: 0, total: state.asset.size || 0, error: '' }, 'downloading');
    try {
      const file = await deps.downloadFile(state.asset.url, target, (p) => {
        state.received = p.received || 0;
        state.total = p.total || state.asset.size || 0;
        state.percent = p.percent || (state.total ? (state.received / state.total) * 100 : 0);
        emit({ type: 'progress', state: snapshot() });
      });
      state.file = file || target;
      return set({ status: 'ready', percent: 100 }, 'ready');
    } catch (err) {
      return set({ status: 'error', error: 'دانلود ناموفق بود: ' + ((err && err.message) || 'خطای شبکه') }, 'error');
    }
  }

  function patchTarget(name) {
    const safe = String(name || 'reval-code.zip').replace(/[^\w.\-]/g, '_');
    return deps.tempPath(safe);
  }

  async function downloadPatch() {
    const target = patchTarget(state.patch.name);
    const sizeOnDisk = deps.fileSize ? deps.fileSize(target) : -1;
    const need = state.patch.size || 0;
    set({ status: 'downloading', percent: 0, received: 0, total: need, error: '', mode: 'patch' }, 'downloading');
    if (deps.exists(target) && need && sizeOnDisk !== need) {
      try { fs.unlinkSync(target); } catch (_) { /* بی‌صدا */ }
    }
    try {
      let expectedSha = null;
      if (state.patch.shaUrl) {
        const r = await deps.httpText(state.patch.shaUrl);
        const m = String(r || '').match(/[a-f0-9]{64}/i);
        if (m) expectedSha = m[0].toLowerCase();
      }
      const file = await deps.downloadFile(state.patch.url, target, (p) => {
        state.received = p.received || 0;
        state.total = p.total || need || 0;
        state.percent = p.percent || (state.total ? (state.received / state.total) * 100 : 0);
        emit({ type: 'progress', state: snapshot() });
      });
      if (deps.sha256 && expectedSha) {
        const actual = deps.sha256(file);
        if (String(actual).toLowerCase() !== expectedSha) throw new Error('چک‌سام وصله مطابقت ندارد');
      }
      state.file = file || target;
      state.usedPatch = true;
      state.savedMb = Math.max(0, Math.round((((state.asset && state.asset.size) || 0) - (need || 0)) / 1048576));
      return set({ status: 'ready', percent: 100 }, 'ready');
    } catch (err) {
      /* اگر وصله نیامد، به نصب‌کنندهٔ کامل برگرد (بدون اینکه کاربر گیر کند) */
      state.mode = 'full';
      state.patchReady = false;
      emit({ type: 'fallback', state: snapshot() });
      return download({ full: true });
    }
  }

  async function install() {
    if (!state.file) return set({ status: 'error', error: 'فایل دانلود نشده است.' }, 'error');
    set({ status: 'installing' }, 'installing');
    if (state.mode === 'patch' && state.usedPatch && deps.installPatch) {
      try {
        const res = deps.installPatch(state.file, { version: state.latest, electron: deps.electronVersion ? deps.electronVersion() : null });
        emit({ type: 'patched', state: snapshot(), result: res });
        if (deps.relaunch) deps.relaunch();
        return snapshot();
      } catch (err) {
        /* وصله اعمال نشد → نصب کامل */
        state.mode = 'full';
        state.usedPatch = false;
        return download({ full: true }).then((s) => (s.status === 'ready' ? install() : s));
      }
    }
    try {
      await deps.runInstaller(state.file, { installDir: deps.installDir ? deps.installDir() : '' });
      if (deps.quit) setTimeout(() => deps.quit(), 600);
      return snapshot();
    } catch (err) {
      return set({ status: 'error', error: 'اجرای نصب‌کننده ناموفق بود: ' + ((err && err.message) || '') }, 'error');
    }
  }

  function reset() {
    return set({ status: 'idle', error: '' }, 'state');
  }

  /** دانلود و نصب در یک کلیک */
  async function updateNow(opts) {
    if (state.status === 'ready') return install();
    const dl = await download(opts);
    if (dl.status === 'ready') return install();
    return dl;
  }

  return { check, download, install, updateNow, reset, snapshot, state, compareVersions, parseRelease };
}

module.exports = {
  OWNER, REPO, ASSET_RE,
  parseVersion, compareVersions, pickAsset, parseRelease, apiUrl, createUpdater,
};
