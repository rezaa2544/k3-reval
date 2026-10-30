/* پلِ ساختگیِ planner برای تست‌های Electron: همان قرارداد planner-preload.js
   را دارد ولی داده را در یک فایل JSON نگه می‌دارد تا «ماندگاری» واقعی سنجیده شود. */
const { contextBridge } = require('electron');
const fs = require('fs');
const path = require('path');
const os = require('os');

const STATE_FILE = path.join(os.tmpdir(), 'reval-test-state.json');

contextBridge.exposeInMainWorld('revalPlanner', {
  loadState: async () => {
    try { return JSON.parse(fs.readFileSync(STATE_FILE, 'utf8')); } catch (e) { return null; }
  },
  saveState: async (data) => {
    try { fs.writeFileSync(STATE_FILE, JSON.stringify(data), 'utf8'); return { ok: true }; }
    catch (e) { return { ok: false, error: e.message }; }
  },
  saveFile: async () => ({ ok: true }),
  close: async () => ({ ok: true }),
  info: async () => ({ version: '2.8.13', test: true }),
  ai: {
    config: async () => ({ configured: false }),
    saveConfig: async () => ({ ok: true }),
    test: async () => ({ ok: false, error: 'تست' }),
    chat: async () => ({ ok: false, error: 'تست' }),
  },
  updates: {
    state: async () => ({ current: '2.8.13', latest: '2.8.13', status: 'idle' }),
    check: async () => ({ ok: true }),
    download: async () => ({ ok: true }),
    install: async () => ({ ok: true }),
    now: async () => ({ ok: true }),
    openRelease: async () => ({ ok: true }),
    onEvent: () => () => {},
  },
});
