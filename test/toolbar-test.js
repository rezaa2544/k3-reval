const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');

const ROOT = path.join(__dirname, '..', 'src', 'inject');
const gateTpl = fs.readFileSync(path.join(ROOT, 'gate-skip.js'), 'utf8');
const toolbarTpl = fs.readFileSync(path.join(ROOT, 'toolbar.js'), 'utf8');

const fakeLanding = `<!doctype html><html lang="fa" dir="rtl"><head><meta charset="utf-8"><title>روال</title></head>
<body style="font-family:Tahoma;background:#0b0c0e;color:#eee;padding:40px">
  <nav><a href="#login" id="loginLink">ورود</a> | <a href="#signup">ثبت‌نام</a></nav>
  <h1>یادگیری هدفمند، روی رِوال!</h1>
  <p>مسیر مطالعه‌ات رو هموار کن.</p>
  <div id="modal" style="display:none;margin-top:30px;border:1px solid #333;padding:20px">
    <h2>ورود به حساب کاربری</h2>
    <form id="f">
      <input type="text" id="phone" placeholder="شماره موبایل" />
      <input type="password" id="pass" placeholder="رمز عبور" />
      <button type="submit">ورود</button>
    </form>
  </div>
  <div id="app" style="display:none;margin-top:30px"><h2>داشبورد روزانه — سلام آرمان</h2></div>
  <script>
    window.__events = [];
    document.getElementById('loginLink').addEventListener('click', function (e) {
      e.preventDefault(); window.__events.push('login-link-clicked');
      document.getElementById('modal').style.display = 'block';
    });
    document.getElementById('f').addEventListener('submit', function (e) {
      e.preventDefault();
      window.__events.push('submitted:' + document.getElementById('phone').value + '/' + document.getElementById('pass').value);
      document.getElementById('modal').style.display = 'none';
      document.getElementById('app').style.display = 'block';
    });
  </script>
</body></html>`;

app.whenReady().then(async () => {
  const win = new BrowserWindow({ width: 1200, height: 850, show: true,
    webPreferences: { contextIsolation: false, nodeIntegration: false, preload: path.join(__dirname, 'test-preload.js') } });
  const errors = [];
  win.webContents.on('console-message', (_e, lvl, msg) => { if (lvl >= 2) errors.push(msg); });

  await win.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(fakeLanding));
  // شبیه‌سازی پل امن (revalDesktop) چون preload اصلی اینجا نیست
  await win.webContents.executeJavaScript(`
    window.__calls = [];
    window.revalDesktop = {
      openPlanner: () => window.__calls.push('openPlanner'),
      openAccount: () => window.__calls.push('openAccount'),
      applyAutoLogin: () => window.__calls.push('applyAutoLogin'),
      goHome: () => window.__calls.push('goHome'),
      version: () => '1.6.0'
    }; true;`);

  const gate = gateTpl.replace(/__REVAL_CONFIG__/g, JSON.stringify({
    hasCredentials: true, credentials: { identifier: '09120000000', password: 'secret123' },
  }));
  const toolbar = toolbarTpl.replace(/__REVAL_VERSION__/g, JSON.stringify('1.6.0'));

  await win.webContents.executeJavaScript(toolbar, true);
  await win.webContents.executeJavaScript(gate, true);
  await new Promise(r => setTimeout(r, 9000));   // منتظر باز شدن مودال و ارسال خودکار

  const res = await win.webContents.executeJavaScript(`JSON.stringify({
    events: window.__events,
    modalVisible: document.getElementById('modal').style.display,
    appVisible: document.getElementById('app').style.display,
    fab: !!document.getElementById('reval-fab'),
    panelText: (document.querySelector('#reval-fab-root div')||{}).innerText,
  })`);
  console.log('RESULT', res);

  // کلیک روی دکمهٔ «برنامه‌ریزی خودکار» در پنل
  const clickRes = await win.webContents.executeJavaScript(`(() => {
    const btns = [...document.querySelectorAll('#reval-fab-root button')];
    const plannerBtn = btns.find(b => /برنامه‌ریزی خودکار/.test(b.textContent));
    if (!plannerBtn) return 'NO_BUTTON';
    plannerBtn.click();
    return JSON.stringify(window.__calls);
  })()`);
  console.log('FAB_CLICK', clickRes);
  console.log('ERRORS', JSON.stringify(errors.slice(0, 3)));
  app.exit(0);
});
