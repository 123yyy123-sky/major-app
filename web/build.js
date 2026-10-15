// 构建：把 content/subjects.json 注入 web/template.html
//   产出  web/专业课.html      单文件版（可直接传手机 / file:// 打开）
//   产出  docs/index.html      PWA 版（配 manifest + sw + icons）
//   产出  docs/sw.js           Service Worker（版本号 = 内容哈希，内容变自动换缓存）
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = path.resolve(__dirname, '..');
const WEB = path.join(ROOT, 'web');
const DOCS = path.join(ROOT, 'docs');          // GitHub Pages 发布目录
const OUT_SINGLE = path.join(WEB, '专业课.html');
const OUT_INDEX = path.join(DOCS, 'index.html');

function readText(f) { return fs.readFileSync(f, 'utf8').replace(/^\uFEFF/, ''); }

const tpl = readText(path.join(WEB, 'template.html'));
const data = JSON.parse(readText(path.join(ROOT, 'content', 'subjects.json')));

// 图片清单（可选）：把课件页图挂到对应章节上
const imgPath = path.join(ROOT, 'content', 'images.json');
let imgs = {};
if (fs.existsSync(imgPath)) {
  imgs = JSON.parse(readText(imgPath));
  let n = 0;
  for (const s of data.subjects) {
    for (const c of s.chapters) {
      if (imgs[c.id]) { c.images = imgs[c.id]; n += Object.keys(imgs[c.id]).length; }
    }
  }
  console.log(`图片    已挂载 ${n} 张课件图`);
}

const json = JSON.stringify(data).replace(/<\//g, '<\\/');

// 单文件版在 web/ 下，图片在 docs/img/（相对 ../docs/img/）
const htmlWeb = tpl.replace('__DATA__', json).replace(/__IMGBASE__/g, '../docs/img/');
// PWA 版与图片同在 docs/（相对 img/）
const html = tpl.replace('__DATA__', json).replace(/__IMGBASE__/g, 'img/');

// 单文件版
fs.writeFileSync(OUT_SINGLE, htmlWeb, 'utf8');

// PWA 版
fs.mkdirSync(DOCS, { recursive: true });
fs.writeFileSync(OUT_INDEX, html, 'utf8');

// Service Worker（版本号 = 内容哈希）
const ver = crypto.createHash('sha1').update(html).digest('hex').slice(0, 10);const sw = readText(path.join(WEB, 'sw.js')).replace(/__VERSION__/g, ver);
fs.writeFileSync(path.join(DOCS, 'sw.js'), sw, 'utf8');

// manifest 若不在 docs 则从 web 复制过来
const manifest = path.join(DOCS, 'manifest.webmanifest');
if (!fs.existsSync(manifest)) {
  fs.writeFileSync(manifest, readText(path.join(WEB, 'manifest.webmanifest')), 'utf8');
}

function kb(n) { return (n / 1024).toFixed(1) + ' KB'; }
console.log('单文件  web/专业课.html     ' + kb(fs.statSync(OUT_SINGLE).size));
console.log('PWA     docs/index.html     ' + kb(fs.statSync(OUT_INDEX).size));
console.log('        docs/sw.js 版本 ' + ver);

let tq = 0, tk = 0, chn = 0;
for (const s of data.subjects) {
  for (const c of s.chapters) {
    chn++;
    tq += c.questions.length;
    tk += c.questions.filter((q) => q.keyPoints && q.keyPoints.length).length;
  }
}
console.log(`内容    ${data.subjects.length} 科 / ${chn} 章 / ${tq} 题（带考点 ${tk}，${Math.round(tk / tq * 100)}%）`);
