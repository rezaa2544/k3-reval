const { app, BrowserWindow } = require('electron');
const path = require('path'); const fs = require('fs');
const tpl = fs.readFileSync(path.join(__dirname,'..','src','inject','gate-skip.js'),'utf8');
const withCreds = (c) => tpl.replace(/__REVAL_CONFIG__/g, JSON.stringify(c));
app.whenReady().then(async () => {
  const win = new BrowserWindow({ show: true, width: 900, height: 600 });
  await win.loadFile(path.join(__dirname,'fake-login.html'));
  await win.webContents.executeJavaScript(withCreds({hasCredentials:false, credentials:null}), true);
  await new Promise(r=>setTimeout(r,1200));
  const banner = await win.webContents.executeJavaScript(`JSON.stringify({bannerText: (document.body.innerText.match(/ورود بدون دیدن صفحه‌ی ورود|تنظیمات حساب/g)||[]).join('|'), submitted: window.__submitted})`);
  console.log('NO_CREDS ' + banner);
  // hash cleanup test
  await win.loadFile(path.join(__dirname,'fake-login.html'), { hash: 'login' }).catch(()=>{});
  await win.webContents.executeJavaScript(`location.hash = '#login'`);
  await win.webContents.executeJavaScript(withCreds({hasCredentials:false, credentials:null}), true);
  await new Promise(r=>setTimeout(r,800));
  console.log('HASH ' + await win.webContents.executeJavaScript(`JSON.stringify({hash: location.hash})`));
  app.exit(0);
});
