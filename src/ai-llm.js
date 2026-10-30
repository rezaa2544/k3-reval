'use strict';

/**
 * Reval AI — کلاینت مدل زبانی (در فرایند اصلی اجرا می‌شود)
 * ------------------------------------------------------------------
 * چرا در main و نه در صفحه: (۱) کلید API هیچ‌وقت وارد صفحه/حافظهٔ رابط نمی‌شود،
 * (۲) درخواست از CORS مرورگر آزاد است، (۳) می‌توانیم timeout و خطا را مدیریت کنیم.
 *
 * همهٔ ارائه‌دهنده‌ها با قالب «سازگار با OpenAI» صدا زده می‌شوند:
 *   openai      → https://api.openai.com/v1
 *   openrouter  → https://openrouter.ai/api/v1
 *   gemini      → https://generativelanguage.googleapis.com/v1beta/openai
 *   custom      → baseUrl دلخواه (LM Studio / Ollama / سرور خودت)
 */

const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');
const { URL } = require('url');

const PROVIDERS = {
  openai: {
    label: 'OpenAI',
    baseUrl: 'https://api.openai.com/v1',
    models: ['gpt-4o-mini', 'gpt-4o', 'gpt-4.1-mini', 'o4-mini'],
    defaultModel: 'gpt-4o-mini',
    keyUrl: 'https://platform.openai.com/api-keys',
  },
  openrouter: {
    label: 'OpenRouter',
    baseUrl: 'https://openrouter.ai/api/v1',
    models: ['openai/gpt-4o-mini', 'anthropic/claude-3.5-sonnet', 'google/gemini-2.0-flash-001', 'deepseek/deepseek-chat'],
    defaultModel: 'openai/gpt-4o-mini',
    keyUrl: 'https://openrouter.ai/keys',
  },
  gemini: {
    label: 'Google Gemini',
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai',
    models: ['gemini-2.0-flash', 'gemini-1.5-flash', 'gemini-1.5-pro'],
    defaultModel: 'gemini-2.0-flash',
    keyUrl: 'https://aistudio.google.com/app/apikey',
  },
  custom: {
    label: 'سرور خودم (سازگار با OpenAI)',
    baseUrl: 'http://localhost:1234/v1',
    models: [],
    defaultModel: 'local-model',
    keyUrl: '',
  },
};

const TIMEOUT_MS = 60000;

function configFile(userDataDir) { return path.join(userDataDir, 'ai-config.json'); }

function readConfig(userDataDir) {
  try {
    const raw = JSON.parse(fs.readFileSync(configFile(userDataDir), 'utf8'));
    const provider = PROVIDERS[raw.provider] ? raw.provider : 'openai';
    return {
      provider,
      model: raw.model || PROVIDERS[provider].defaultModel,
      baseUrl: raw.baseUrl || PROVIDERS[provider].baseUrl,
      key: raw.key || '',
      enabled: raw.enabled !== false,
      temperature: typeof raw.temperature === 'number' ? raw.temperature : 0.4,
    };
  } catch (_) {
    return { provider: 'openai', model: PROVIDERS.openai.defaultModel, baseUrl: PROVIDERS.openai.baseUrl, key: '', enabled: true, temperature: 0.4 };
  }
}

function writeConfig(userDataDir, patch) {
  const cur = readConfig(userDataDir);
  const next = Object.assign({}, cur, patch || {});
  if (!PROVIDERS[next.provider]) next.provider = cur.provider;
  const dir = path.dirname(configFile(userDataDir));
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(configFile(userDataDir), JSON.stringify(next, null, 2), { mode: 0o600 });
  try { fs.chmodSync(configFile(userDataDir), 0o600); } catch (_) { /* ویندوز */ }
  return next;
}

/** نمای امن برای رابط: کلید هرگز برنمی‌گردد */
function publicConfig(userDataDir) {
  const c = readConfig(userDataDir);
  const p = PROVIDERS[c.provider] || PROVIDERS.openai;
  return {
    provider: c.provider,
    providerLabel: p.label,
    model: c.model,
    models: p.models || [],
    baseUrl: c.baseUrl,
    enabled: c.enabled,
    hasKey: Boolean(c.key && c.key.length > 8),
    keyHint: c.key ? (c.key.slice(0, 3) + '…' + c.key.slice(-4)) : '',
    keyUrl: p.keyUrl || '',
    ready: Boolean(c.key && c.key.length > 8),
  };
}

function providersPublic() {
  return Object.keys(PROVIDERS).map((id) => ({
    id, label: PROVIDERS[id].label, models: PROVIDERS[id].models || [],
    defaultModel: PROVIDERS[id].defaultModel, keyUrl: PROVIDERS[id].keyUrl || '',
  }));
}

/** درخواست JSON با https/http و timeout */
function requestJson(url, { method = 'POST', headers = {}, body = null, timeout = TIMEOUT_MS } = {}) {
  return new Promise((resolve) => {
    let u;
    try { u = new URL(url); } catch (e) { return resolve({ ok: false, status: 0, error: 'آدرس نامعتبر است' }); }
    const mod = u.protocol === 'http:' ? http : https;
    const payload = body == null ? null : Buffer.from(JSON.stringify(body));
    const h = Object.assign({ 'Content-Type': 'application/json' }, headers);
    if (payload) h['Content-Length'] = payload.length;
    const req = mod.request({
      protocol: u.protocol, hostname: u.hostname, port: u.port || (u.protocol === 'http:' ? 80 : 443),
      path: u.pathname + (u.search || ''), method, headers: h,
    }, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => {
        const text = Buffer.concat(chunks).toString('utf8');
        let json = null;
        try { json = JSON.parse(text); } catch (_) { /* متن غیر JSON */ }
        resolve({ ok: res.statusCode >= 200 && res.statusCode < 300, status: res.statusCode, json, text });
      });
    });
    req.setTimeout(timeout, () => { req.destroy(new Error('timeout')); });
    req.on('error', (err) => resolve({ ok: false, status: 0, error: err.message || 'خطای شبکه' }));
    if (payload) req.write(payload);
    req.end();
  });
}

/** ترجمهٔ خطاها به فارسی قابل‌فهم با راه‌حل */
function explainError(status, json, raw) {
  const msg = (json && json.error && (json.error.message || json.error.code)) || (typeof raw === 'string' ? raw.slice(0, 200) : '');
  if (status === 401 || status === 403) return 'کلید API پذیرفته نشد. کلید را در «تنظیمات هوش مصنوعی» دوباره وارد کن. (' + msg + ')';
  if (status === 429) return 'سهمیه/محدودیت نرخ ارائه‌دهنده پر شده است. چند دقیقه بعد امتحان کن یا مدل ارزان‌تری انتخاب کن.';
  if (status === 404) return 'مدل یا آدرس پیدا نشد؛ نام مدل را در تنظیمات بررسی کن. (' + msg + ')';
  if (status === 0) return 'اتصال برقرار نشد؛ اینترنت یا آدرس سرور را بررسی کن. (' + msg + ')';
  return 'خطای سرویس هوش مصنوعی (کد ' + status + '): ' + msg;
}

/**
 * یک نوبت گفت‌وگو با مدل.
 * @returns {Promise<{ok:boolean, message?:object, error?:string, usage?:object}>}
 *   message = { role:'assistant', content:string, tool_calls?:Array }
 */
async function chat(userDataDir, payload, deps) {
  const cfg = readConfig(userDataDir);
  if (!cfg.enabled) return { ok: false, error: 'هوش مصنوعی برون‌خطی خاموش است.' };
  if (!cfg.key || cfg.key.length < 8) return { ok: false, error: 'کلید API تنظیم نشده است.', needsKey: true };

  const body = {
    model: (payload && payload.model) || cfg.model,
    messages: (payload && payload.messages) || [],
    temperature: typeof (payload && payload.temperature) === 'number' ? payload.temperature : cfg.temperature,
  };
  if (payload && Array.isArray(payload.tools) && payload.tools.length) {
    body.tools = payload.tools;
    body.tool_choice = payload.tool_choice || 'auto';
  }
  const base = String(cfg.baseUrl || PROVIDERS[cfg.provider].baseUrl).replace(/\/+$/, '');
  const url = base + '/chat/completions';
  const doRequest = (deps && deps.request) || requestJson;
  const res = await doRequest(url, {
    headers: {
      Authorization: 'Bearer ' + cfg.key,
      ...(cfg.provider === 'openrouter' ? { 'HTTP-Referer': 'https://revaledu.ir', 'X-Title': 'Reval' } : {}),
    },
    body,
  });
  if (!res.ok) return { ok: false, error: explainError(res.status, res.json, res.text), status: res.status };
  const choice = res.json && res.json.choices && res.json.choices[0];
  if (!choice) return { ok: false, error: 'پاسخ سرویس خالی بود.' };
  return { ok: true, message: choice.message || { role: 'assistant', content: '' }, usage: res.json.usage || null, model: body.model };
}

/** آزمون اتصال: یک پیام کوتاه */
async function test(userDataDir, deps) {
  const t0 = Date.now();
  const res = await chat(userDataDir, {
    messages: [
      { role: 'system', content: 'پاسخ را فقط با یک کلمه بده: آماده' },
      { role: 'user', content: 'تست اتصال' },
    ],
    temperature: 0,
  }, deps);
  if (!res.ok) return { ok: false, error: res.error, needsKey: res.needsKey || false };
  return { ok: true, ms: Date.now() - t0, model: res.model, sample: String((res.message && res.message.content) || '').slice(0, 80) };
}

module.exports = { PROVIDERS, readConfig, writeConfig, publicConfig, providersPublic, chat, test, explainError, requestJson, configFile };
