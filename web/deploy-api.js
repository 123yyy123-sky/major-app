// 走 GitHub API 创建提交（绕过 github.com:443 被墙的问题）
// 用法：GH_TOKEN=... node web/deploy-api.js
const fs = require('fs');
const path = require('path');
const https = require('https');
const { execFileSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const OWNER = '123yyy123-sky';
const REPO = 'major-app';
const TOKEN = process.env.GH_TOKEN;
if (!TOKEN) { console.error('缺少 GH_TOKEN'); process.exit(1); }

function api(method, url, body) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null;
    const req = https.request({
      hostname: 'api.github.com',
      path: url,
      method,
      headers: Object.assign({
        'User-Agent': 'dsh-deploy',
        Authorization: 'Bearer ' + TOKEN,
        Accept: 'application/vnd.github+json',
      }, data ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) } : {}),
    }, (res) => {
      let buf = '';
      res.on('data', (c) => (buf += c));
      res.on('end', () => {
        let j = null;
        try { j = JSON.parse(buf); } catch (e) {}
        if (res.statusCode >= 200 && res.statusCode < 300) resolve(j);
        else reject(new Error(`HTTP ${res.statusCode} ${method} ${url}\n${buf.slice(0, 400)}`));
      });
    });
    req.on('error', reject);
    if (data) req.write(data);
    req.end();
  });
}

(async () => {
  // 取 git 已跟踪的文件列表
  const files = execFileSync('git', ['ls-files'], { cwd: ROOT, encoding: 'utf8' })
    .split('\n').map((s) => s.trim()).filter(Boolean);
  console.log('待上传文件：', files.length);

  // 1) 每个文件 -> blob
  const entries = [];
  for (const f of files) {
    const abs = path.join(ROOT, f);
    const content = fs.readFileSync(abs).toString('base64');
    const blob = await api('POST', `/repos/${OWNER}/${REPO}/git/blobs`, { content, encoding: 'base64' });
    entries.push({ path: f.split(path.sep).join('/'), mode: '100644', type: 'blob', sha: blob.sha });
    process.stdout.write('.');
  }
  console.log('\nblob 完成');

  // 2) tree
  const tree = await api('POST', `/repos/${OWNER}/${REPO}/git/trees`, { tree: entries });
  console.log('tree:', tree.sha);

  // 3) commit
  const commit = await api('POST', `/repos/${OWNER}/${REPO}/git/commits`, {
    message: '专业课学习 App：思维导图/重点/练习/考点清单/错题本 + PWA 离线\n\n' +
             '- content/subjects.json 为唯一内容源（锅炉原理绪论 16 题）\n' +
             '- 出题引擎：课件题优先、非重点限比 25%、错题加权\n' +
             '- docs/ 为 GitHub Pages 发布目录（manifest + sw + icons，支持离线）',
    tree: tree.sha,
    parents: [],
  });
  console.log('commit:', commit.sha);

  // 4) ref
  try {
    await api('POST', `/repos/${OWNER}/${REPO}/git/refs`, { ref: 'refs/heads/main', sha: commit.sha });
    console.log('已创建分支 main');
  } catch (e) {
    await api('PATCH', `/repos/${OWNER}/${REPO}/git/refs/heads/main`, { sha: commit.sha, force: true });
    console.log('已更新分支 main');
  }

  const info = await api('GET', `/repos/${OWNER}/${REPO}`);
  console.log('\n✓ 完成：', info.html_url, '| 大小', info.size, 'KB');
})().catch((e) => { console.error('\n失败：', e.message); process.exit(1); });
