// 自动构建 + 热刷新服务器
//   node web/serve.js
// 监听 content/*.json 与 web/template.html，改动后自动重建，并通知手机刷新。
//
// ⚠️ 这里**不再自己实现一遍构建**，直接复用 web/build.js，
//    避免出现第二套「劣化版构建」（曾经漏掉导图归一化 / 图片挂载 /
//    __IMGBASE__ 与 __BUILDVER__ 替换，跑一次就把 docs/index.html 改坏）。
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const os = require('os');
const { build } = require('./build.js');

const ROOT = path.resolve(__dirname, '..');
const WEB = path.join(ROOT, 'web');
const DIST = path.join(ROOT, 'docs');        // 发布目录就是 docs（GitHub Pages）
const OUT = path.join(DIST, 'index.html');   // PWA 版为服务根
const PORT = Number(process.env.PORT || 8090);

/* ---------- 1. 构建（带内容去重，防自触发循环） ---------- */
let lastHash = '';
function doBuild() {
  const data = fs.readFileSync(path.join(ROOT, 'content', 'subjects.json'));
  const tpl = fs.readFileSync(path.join(WEB, 'template.html'));
  const hash = crypto.createHash('sha1').update(data).update(tpl).digest('hex');
  if (hash === lastHash) return false;
  lastHash = hash;

  build();
  const stamp = new Date().toTimeString().slice(0, 8);
  console.log(`[${stamp}] 重建完成`);
  return true;
}

/* ---------- 2. 热刷新通道（SSE） ---------- */
const clients = new Set();
function broadcast() {
  for (const res of clients) {
    try { res.write('data: reload\n\n'); } catch (e) { clients.delete(res); }
  }
  console.log(`  → 已通知 ${clients.size} 个设备刷新`);
}

/* ---------- 3. 监听文件 ---------- */
let timer = null;
function schedule(reason) {
  clearTimeout(timer);
  timer = setTimeout(() => {
    try { if (doBuild()) broadcast(); }
    catch (e) { console.error('构建失败：', e.message); }
  }, 150);
}
function watch(file) {
  try {
    fs.watch(file, { persistent: true }, () => schedule(file));
    console.log('监听：', path.relative(ROOT, file));
  } catch (e) { console.warn('无法监听', file, e.message); }
}
watch(path.join(ROOT, 'content', 'subjects.json'));
watch(path.join(ROOT, 'content', 'images.json'));
watch(path.join(WEB, 'template.html'));
// 注意：不要监听 web/ 目录本身 —— 输出文件 专业课.html 就在里面，会自触发无限重建。

/* ---------- 4. 注入热刷新客户端 ---------- */
const LIVE = `
<script>
(function(){
  try{
    var es = new EventSource('/__live');
    es.onmessage = function(){ location.reload(); };
    es.onerror = function(){ /* 服务器重启后浏览器会自动重连 */ };
  }catch(e){}
})();
</script>
`;

/* ---------- 5. HTTP ---------- */
const server = http.createServer((req, res) => {
  const url = decodeURIComponent((req.url || '/').split('?')[0]);

  if (url === '/__live') {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    });
    res.write('retry: 2000\n\n');
    clients.add(res);
    req.on('close', () => clients.delete(res));
    return;
  }

  // 先找 docs（PWA 产出），再回落 web/（模板等源文件）
  const rel = url.replace(/^\/+/, '');
  let file = url === '/' || url === '/index.html' ? OUT : path.join(DIST, rel);
  if (!fs.existsSync(file)) file = path.join(WEB, rel);
  fs.readFile(file, (err, buf) => {
    if (err) { res.writeHead(404); res.end('404'); return; }
    let body = buf;
    let type = 'text/html; charset=utf-8';
    if (/\.webmanifest$/.test(file)) type = 'application/manifest+json; charset=utf-8';
    else if (/\.js$/.test(file)) type = 'application/javascript; charset=utf-8';
    else if (/\.png$/.test(file)) type = 'image/png';
    else if (/\.webp$/.test(file)) type = 'image/webp';
    else if (/\.jpe?g$/.test(file)) type = 'image/jpeg';
    if (file === OUT) {
      // 只在走网络时注入热刷新；file:// 直接打开不受影响
      body = Buffer.from(buf.toString('utf8').replace('</body>', LIVE + '</body>'), 'utf8');
    }
    res.writeHead(200, { 'Content-Type': type, 'Cache-Control': 'no-store, no-cache, must-revalidate' });
    res.end(body);
  });
});

doBuild();
server.listen(PORT, '0.0.0.0', () => {
  console.log('');
  console.log('  专业课 App 已启动（自动构建 + 热刷新）');
  console.log('  本机：   http://localhost:' + PORT);
  for (const list of Object.values(os.networkInterfaces())) {
    for (const ni of list || []) {
      if (ni.family === 'IPv4' && !ni.internal) console.log('  手机：   http://' + ni.address + ':' + PORT);
    }
  }
  console.log('');
  console.log('  改 content/subjects.json 或 web/template.html → 自动重建 → 手机自动刷新');
  console.log('  停止：Ctrl+C');
  console.log('');
});
