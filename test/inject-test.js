const { app, BrowserWindow } = require('electron');
const path = require('path');
const fs = require('fs');

const tpl = fs.readFileSync(path.join(__dirname, '..', 'src', 'inject', 'gate-skip.js'), 'utf8');
const src = tpl.replace('__REVAL_CONFIG__', JSON.stringify({
  hasCredentials: true,
  credentials: { identifier: '09120000000', password: 'secret123' },
}));

app.whenReady().then(async () => {
  const win = new BrowserWindow({ show: false, width: 1000, height: 700 });
  await win.loadFile(path.join(__dirname, 'fake-login.html'));
  let err = null;
  try {
    await win.webContents.executeJavaScript(
      'try{' + src + '\n; "INJECTED_OK"}catch(e){JSON.stringify({err:e.message,stack:String(e.stack).slice(0,400)})}',
      true
    );
  } catch (e) { err = e.message; }
  if (err) console.log('EXEC_ERROR ' + err);
  await new Promise(r => setTimeout(r, 4000));
  const result = await win.webContents.executeJavaScript(`JSON.stringify({
    submitted: window.__submitted,
    bodyText: document.body.innerText.replace(/\\s+/g,' ').trim().slice(0,120),
    hasPasswordField: !!document.querySelector('input[type=password]'),
  })`);
  console.log('RESULT ' + result);
  app.exit(0);
});
