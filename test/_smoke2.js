const { app, BrowserWindow } = require('electron');
const path = require('path');
app.commandLine.appendSwitch('disable-gpu');
app.commandLine.appendSwitch('disable-software-rasterizer');
app.commandLine.appendSwitch('disable-dev-shm-usage');
app.disableHardwareAcceleration();
app.whenReady().then(async () => {
  const win = new BrowserWindow({ width: 1280, height: 950, show: false, webPreferences: { offscreen: true, contextIsolation: false } });
  win.webContents.on('console-message', (_e, l, m) => console.log('CONSOLE', l, String(m).slice(0, 300)));
  await win.loadFile(path.join(__dirname, '../src/planner/planner.html'));
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  await wait(1200);
  const js = (c) => win.webContents.executeJavaScript(c);
  console.log('modules', await js(`JSON.stringify({nlu:!!window.RevalAINLU,kb:!!window.RevalAIKnowledge,tools:!!window.RevalAITools,brain:!!window.RevalAIBrain,ai:!!window.__revalAI})`));
  // build a plan first
  await js(`(function(){const sel=document.getElementById('restDay'); const p=(new Date().getDay()+1)%7; sel.value=String((p+4)%7); sel.dispatchEvent(new Event('change',{bubbles:true})); return 1;})()`);
  await js(`document.getElementById('build').click(), true`);
  await wait(5200);
  await js('window.__revalAI.open(), true');
  await wait(600);
  console.log('state', JSON.stringify(await js('window.__revalAI.state()')));
  const answers = [];
  for (const q of ['برنامهٔ امروز', 'چقدر آماده‌ام؟', 'ساعت مطالعه‌ام را زیاد کن', 'مهم‌ترین فصل‌ها کدامند؟', 'استرس دارم', 'چطور زیست بخونم؟']) {
    const r = await js(`(function(){const r=window.__revalAI.ask(${JSON.stringify(q)}); return JSON.stringify({q:${JSON.stringify(q)}, text:r.text.slice(0,140), actions:(r.actions||[]).map(a=>a.name+':'+(a.result&&a.result.ok))});})()`);
    console.log('ASK', r);
  }
  await js(`window.__revalAI.send('روزهای عادی ۵ ساعت'), true`);
  await wait(2500);
  console.log('after send', JSON.stringify(await js('window.__revalAI.state()')));
  console.log('cov', await js('JSON.stringify((window.__revalTest.plan()||{}).summary ? {cov:window.__revalTest.plan().summary.coverage.coverageRatio, hours:Math.round(window.__revalTest.plan().summary.totalHours)} : null)'));
  win.destroy(); app.quit();
});
