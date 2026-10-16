// 思维导图 → 独立 SVG 文件
//
//   产出  docs/mindmap/<章节id>.svg     进仓库、App 内「图片版」点开看全图
//   可选  投递到知识库，按科目归位        --kb <知识库「专业课」目录>
//         实际落点：<专业课>/<科目名>/导图/<章节id>.svg
//         （与各科已有的 课件/ 出题练习/ 每日复盘/ 同级）
//
// 为什么用 SVG 不用 PNG：
//   · 矢量，双指放大不糊
//   · 每章几十 KB（PNG 同尺寸要几百 KB）
//   · 内容不变则字节不变，重建不会往 git 塞新的大 blob
//
// 数据源：content/subjects.json 的 chapters[].mindmap
//   与 App 折叠树同源，所以「一处生成、两处用」，不会出现两份导图脱节
//
// 可作模块调用：const { buildMindmaps } = require('./build-mindmap.js')
// 也可直接跑：  node web/build-mindmap.js [--kb <目录>]

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const OUT_DEFAULT = path.join(ROOT, 'docs', 'mindmap');

/* ============================ 文本度量 ============================ */
// 无 canvas / 无字体引擎环境下估算中英混排宽度。
// 宁可略高估（方框右边留白）也不要低估（文字溢出方框，最难修）。
// 系数按 Microsoft YaHei / PingFang SC 实测校准，最后一次 ×1.02 兜底。
const WIDE = /[\u1100-\u115F\u2E80-\u303F\u3041-\u33FF\u3400-\u4DBF\u4E00-\u9FFF\uA000-\uA4CF\uAC00-\uD7A3\uF900-\uFAFF\uFE30-\uFE4F\uFF00-\uFFEF\u2000-\u206F\u2190-\u2BFF]/;

function widthOf(text, fs) {
  let w = 0;
  for (const ch of String(text)) {
    const c = ch.codePointAt(0);
    if (c < 0x3000) {
      if (WIDE.test(ch)) w += fs * 1.00;          // 箭头、数学符号、破折号等全角
      else if (ch === ' ') w += fs * 0.30;
      else if (/[iIl1jft.,:;'|!\[\]()]/.test(ch)) w += fs * 0.38;
      else if (/[A-Z]/.test(ch)) w += fs * 0.74;
      else if (/[a-z0-9]/.test(ch)) w += fs * 0.62;
      else w += fs * 0.75;
    } else {
      w += fs * 1.00;                             // CJK / 全角标点
    }
  }
  return w * 1.02;
}

// 切成「英文/数字词」和「单个其它字符」，避免把英文单词拦腰截断
function tokens(text) {
  const out = [];
  const re = /[A-Za-z0-9][A-Za-z0-9._\-\/+%]*|\s+|[\s\S]/g;
  let m;
  while ((m = re.exec(String(text)))) out.push(m[0]);
  return out;
}

// 断点禁则：不许在「（」后断行，也不许让「）」、顿号逗号起行
const OPEN_END = /[（(\[｛{〈《「『【]$/;
const CLOSE_START = /^[）)\]｝}〉》」』】、，。；：？！·…～]/;

// 短括号串整体不可拆：如「（课件未覆盖）」若自己放得下一行，就整块换行，
// 免得出「…（课件未覆 / 盖）」这种断法；长括号串（超过行宽 65%）不锁，仍可内部折行
const OPEN_CHAR = /[（(\[｛{〈《「『【]/;
const CLOSE_CHAR = /[）)\]｝}〉》」』】]/;

function atomize(tks, fs, maxW) {
  const out = [];
  for (let i = 0; i < tks.length; i++) {
    const t = tks[i];
    if (OPEN_END.test(t)) {
      let acc = t, j = i + 1, bal = 1;
      while (j < tks.length && bal > 0) {
        const nx = tks[j++];
        acc += nx;
        if (OPEN_CHAR.test(nx)) bal++;
        if (CLOSE_CHAR.test(nx)) bal--;
      }
      if (bal === 0 && widthOf(acc, fs) <= maxW * 0.65) { out.push(acc); i = j - 1; continue; }
    }
    out.push(t);
  }
  return out;
}

function wrap(text, fs, maxW) {
  const lines = [];
  let cur = '';
  for (const tk of atomize(tokens(text), fs, maxW)) {
    if (!cur && /^\s+$/.test(tk)) continue;
    const over = cur && widthOf(cur + tk, fs) > maxW;
    // 宁可这一行多出一个字，也不把「（」甩在行尾、「）」甩到行首
    if (over && !OPEN_END.test(cur) && !CLOSE_START.test(tk)) {
      lines.push(cur.replace(/\s+$/, ''));
      cur = tk.replace(/^\s+/, '');
    } else {
      cur += tk;
    }
  }
  if (cur) lines.push(cur.replace(/\s+$/, ''));
  return lines.length ? lines : [''];
}

/* ---- 上下标记法 → Unicode 上下标字符 ----
   SVG 的 <text> 里没法用 <sup>/<sub>。浏览器认 baseline-shift，但导出/预览用的
   渲染器不认（实测 resvg 会按正常基线画），两处就会不一致。
   于是统一换成 Unicode 上下标字符：任何渲染器画出来都一样。
   转不了的字符（最典型的是**大写下标**，Unicode 压根没有）只去掉 ^ _ {} 记号，
   字符本身保留 —— 比让 `Q_c^tr` 原样显示干净，也不会把字吃掉。 */
const SUPCH = { '0':'⁰','1':'¹','2':'²','3':'³','4':'⁴','5':'⁵','6':'⁶','7':'⁷','8':'⁸','9':'⁹',
  '+':'⁺','-':'⁻','=':'⁼','(':'⁽',')':'⁾','n':'ⁿ','i':'ⁱ',
  a:'ᵃ',b:'ᵇ',c:'ᶜ',d:'ᵈ',e:'ᵉ',f:'ᶠ',g:'ᵍ',h:'ʰ',j:'ʲ',k:'ᵏ',l:'ˡ',m:'ᵐ',
  o:'ᵒ',p:'ᵖ',r:'ʳ',s:'ˢ',t:'ᵗ',u:'ᵘ',v:'ᵛ',w:'ʷ',x:'ˣ',y:'ʸ',z:'ᶻ' };
const SUBCH = { '0':'₀','1':'₁','2':'₂','3':'₃','4':'₄','5':'₅','6':'₆','7':'₇','8':'₈','9':'₉',
  '+':'₊','-':'₋','=':'₌','(':'₍',')':'₎',
  a:'ₐ',e:'ₑ',h:'ₕ',i:'ᵢ',j:'ⱼ',k:'ₖ',l:'ₗ',m:'ₘ',n:'ₙ',o:'ₒ',p:'ₚ',r:'ᵣ',s:'ₛ',t:'ₜ',u:'ᵤ',v:'ᵥ',x:'ₓ' };
// 先下标后上标：`e^{β(1/T−1/T_0)}` 这类「上标里套下标」才不会把内层记号吞掉
const shiftCh = (s, tbl) => [...s].map((c) => tbl[c] || c).join('');
// ★ 2026-10-17 补「附加字符」：∞、℃、°、·、中文
//   传热学正文大量写 `t_∞`、`u_∞`、`Q_导热`、`λ_纯金属`、`{t̄}_℃`。
//   老的字符类不含这些字符 → 正则压根不匹配 → 下划线**原样画在图上**。
//   现在能吃进来：能转成 Unicode 下标的转（∞/中文转不了），转不了的只摘记号。
const EXCLS = '\\u221e\\u2103\\u00b0\\u00b7\\u4e00-\\u9fff';
const RE_SUB = new RegExp('_\\{([^{}]+)\\}|_\\(([^)]+)\\)|_([A-Za-z0-9.\\u0370-\\u03ff\\u2032-\\u2037' + EXCLS + ']+)', 'g');
const RE_SUP = new RegExp('\\^\\{([^{}]+)\\}|\\^\\(([^)]+)\\)|\\^([A-Za-z0-9.\\u0370-\\u03ff\\u2032-\\u2037' + EXCLS + ']+)', 'g');
function plainify(t) {
  return String(t == null ? '' : t)
    .replace(RE_SUB, (m, a, b, c) => shiftCh(a || b || c, SUBCH))
    .replace(RE_SUP, (m, a, b, c) => shiftCh(a || b || c, SUPCH));
}

/* ============================ 版式常量 ============================ */
const FONTS = [21, 15.5, 13.5, 12.5];
const MAXW = [300, 300, 252, 232];
const PADX = 15, PADY = 10, VGAP = 9, HGAP = 54;
const MARGIN = 40, HEADER = 68;

function cloneNode(n) {
  return { label: plainify(n && n.label != null ? n.label : ''), children: (n && n.children || []).map(cloneNode) };
}

/* ============================ 布局 ============================ */
// 经典「左→右 tidy tree」：叶子按顺序占用垂直空间，父节点垂直居中于首末子
function layoutTree(root) {
  let cursor = 0;

  (function walk(n, d) {
    const di = Math.min(d, FONTS.length - 1);
    const fs = FONTS[di], maxW = MAXW[di];
    n.fs = fs;
    n.lines = wrap(n.label, fs, maxW);
    n.w = Math.max.apply(null, n.lines.map((l) => widthOf(l, fs))) + PADX * 2;
    n.h = n.lines.length * fs * 1.34 + PADY * 2;
    n.depth = d;

    const kids = n.children || [];
    if (!kids.length) {
      n.cy = cursor + n.h / 2;
      cursor += n.h + VGAP;
    } else {
      kids.forEach((k) => walk(k, d + 1));
      n.cy = (kids[0].cy + kids[kids.length - 1].cy) / 2;
    }
  })(root, 0);

  // 每层最大宽 → 列 x
  const colW = [];
  (function cols(n) {
    const i = Math.min(n.depth, FONTS.length - 1);
    colW[i] = Math.max(colW[i] || 0, n.w);
    (n.children || []).forEach(cols);
  })(root);
  const colX = [];
  let acc = MARGIN;
  for (let i = 0; i < colW.length; i++) {
    colX[i] = acc;
    acc += (colW[i] || 0) + HGAP;
  }
  const totalW = acc - HGAP + MARGIN;

  // 垂直边界 → 整体下移
  let minTop = Infinity, maxBot = -Infinity;
  (function bounds(n) {
    n.x = colX[Math.min(n.depth, colX.length - 1)];
    n.y = n.cy - n.h / 2;
    minTop = Math.min(minTop, n.y);
    maxBot = Math.max(maxBot, n.y + n.h);
    (n.children || []).forEach(bounds);
  })(root);
  const dy = HEADER - minTop;
  (function shift(n) {
    n.y += dy; n.cy += dy;
    (n.children || []).forEach(shift);
  })(root);

  return { w: Math.ceil(totalW), h: Math.ceil(maxBot + dy + MARGIN) };
}

/* ============================ 绘制 ============================ */
function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function edgePath(x1, y1, x2, y2) {
  const mx = (x1 + x2) / 2;
  return 'M' + x1 + ',' + y1 + ' C' + mx + ',' + y1 + ' ' + mx + ',' + y2 + ' ' + x2 + ',' + y2;
}

function styleOf(depth, accent) {
  if (depth === 0) return { fill: accent, stroke: 'none', color: '#ffffff', weight: 700, rx: 11 };
  if (depth === 1) return { fill: '#ffffff', stroke: accent, color: '#1b2430', weight: 700, rx: 9 };
  if (depth === 2) return { fill: '#f7f9fc', stroke: '#e3e9f0', color: '#33414f', weight: 600, rx: 8 };
  return { fill: '#ffffff', stroke: '#eef2f6', color: '#5a6878', width: 1.6, weight: 500, rx: 7 };
}

function drawNode(n, accent, out, edges) {
  const kids = n.children || [];
  const st = styleOf(n.depth, accent);

  kids.forEach((k) => {
    edges.push('<path d="' + edgePath(n.x + n.w, n.cy, k.x, k.cy) + '" fill="none" stroke="' +
      (n.depth === 0 ? accent : '#cfd9e4') + '" stroke-width="' +
      (n.depth === 0 ? 2 : 1.5) + '" stroke-linecap="round"' +
      (n.depth >= 2 ? ' stroke-opacity="0.85"' : '') + '/>');
  });

  out.push('<rect x="' + n.x.toFixed(1) + '" y="' + n.y.toFixed(1) +
    '" width="' + n.w.toFixed(1) + '" height="' + n.h.toFixed(1) +
    '" rx="' + st.rx + '" fill="' + st.fill + '" stroke="' + st.stroke + '"' +
    (st.width ? ' stroke-width="' + st.width + '"' : (n.depth ? ' stroke-width="1.6"' : '')) +
    (n.depth ? '' : ' filter="url(#sh)"') + '/>');

  const lh = n.fs * 1.34;
  n.lines.forEach((line, i) => {
    const baseY = n.y + PADY + i * lh + n.fs * 0.82;
    out.push('<text x="' + (n.x + PADX).toFixed(1) + '" y="' + baseY.toFixed(1) +
      '" font-size="' + n.fs + '" font-weight="' + st.weight + '" fill="' + st.color +
      '" xml:space="preserve">' + esc(line) + '</text>');
  });

  kids.forEach((k) => drawNode(k, accent, out, edges));
}

/* ============================ 单章渲染 ============================ */
function renderChapter(chapterName, subjectName, mm, accent, nodeCount) {
  const root = cloneNode(mm);
  root.label = plainify(mm.label || chapterName);
  const size = layoutTree(root);

  const out = [], edges = [];
  drawNode(root, accent, out, edges);

  const head = [
    '<text x="' + MARGIN + '" y="34" font-size="21" font-weight="800" fill="' + accent + '">' +
      esc(subjectName) + ' · ' + esc(chapterName) + '</text>',
    '<text x="' + MARGIN + '" y="54" font-size="12.5" fill="#8b98a8">思维导图 · 共 ' +
      nodeCount + ' 个节点 · 与 App 内折叠树同源</text>',
  ].join('');

  return '<?xml version="1.0" encoding="UTF-8"?>\n' +
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + size.w + ' ' + size.h +
    '" width="' + size.w + '" height="' + size.h + '">\n' +
    '<title>' + esc(subjectName + ' · ' + chapterName + ' · 思维导图') + '</title>\n' +
    '<defs><filter id="sh" x="-20%" y="-20%" width="140%" height="140%">' +
    '<feDropShadow dx="0" dy="1.5" stdDeviation="2" flood-color="' + accent +
    '" flood-opacity="0.22"/></filter></defs>\n' +
    '<rect width="100%" height="100%" fill="#ffffff"/>\n' +
    '<g font-family="-apple-system,BlinkMacSystemFont,\'Segoe UI\',\'Microsoft YaHei\',\'PingFang SC\',sans-serif">\n' +
    head + '\n' + edges.join('\n') + '\n' + out.join('\n') + '\n</g>\n</svg>\n';
}

function countNodes(n) {
  return 1 + (n.children || []).reduce((a, c) => a + countNodes(c), 0);
}

/* ============================ 出口 ============================ */
function buildMindmaps(opts) {
  opts = opts || {};
  const outDir = opts.outDir || OUT_DEFAULT;
  const kbRoot = opts.kbRoot || null;   // 知识库「专业课」目录：按科目落到 <科目>/导图/
  const kbDir = opts.kbDir || null;     // 兼容旧参数：单一目标目录
  const quiet = !!opts.quiet;

  const data = JSON.parse(
    fs.readFileSync(path.join(ROOT, 'content', 'subjects.json'), 'utf8').replace(/^\uFEFF/, ''));
  const { normalizeMindmap } = require('./mindmap.js');

  fs.mkdirSync(outDir, { recursive: true });
  if (kbDir) fs.mkdirSync(kbDir, { recursive: true });

  const files = [];
  const perSubject = {};
  const kbTargets = {};   // 科目 → 实际投递目录（null = 未投递）
  const kbMissing = [];

  for (const s of data.subjects) {
    const hasMM = (s.chapters || []).some((c) => c.mindmap);
    // 每科目一个知识库目标目录：<专业课>/<科目名>/导图/
    // 科目文件夹不存在时不自动新建（不在知识库乱造目录），只在末尾提示；
    // 目录也**延迟到真有图要写时才建**，免得给还没内容的科目留空文件夹
    let dest = kbDir || null;
    if (kbRoot) {
      const subjDir = path.join(kbRoot, s.name);
      dest = fs.existsSync(subjDir) ? path.join(subjDir, '导图') : null;
      if (!dest && hasMM) kbMissing.push(s.name);
    }
    kbTargets[s.name] = dest;

    for (const c of s.chapters || []) {
      if (!c.mindmap) continue;
      const mm = normalizeMindmap(c.mindmap, c.name, '其他要点');
      const n = countNodes(mm);
      const svg = renderChapter(c.name, s.name, mm, s.color || '#e8590c', n);
      const name = c.id + '.svg';
      fs.writeFileSync(path.join(outDir, name), svg, 'utf8');
      if (dest) {
        fs.mkdirSync(dest, { recursive: true });
        fs.writeFileSync(path.join(dest, name), svg, 'utf8');
      }
      files.push(name);
      perSubject[s.name] = (perSubject[s.name] || 0) + 1;
    }
  }

  if (!quiet) {
    const kb = (f) => (fs.statSync(path.join(outDir, f)).size / 1024).toFixed(1);
    const tot = files.reduce((a, f) => a + fs.statSync(path.join(outDir, f)).size, 0);
    console.log('导图    ' + files.length + ' 张 SVG（' + Object.keys(perSubject)
      .map((k) => k + ' ' + perSubject[k]).join(' · ') + '）');
    console.log('        合计 ' + (tot / 1024).toFixed(1) + ' KB → ' + outDir);
    if (files.length) console.log('        最大 ' + files.map((f) => [f, +kb(f)])
      .sort((a, b) => b[1] - a[1])[0].join(' '));
    for (const sb of Object.keys(kbTargets)) {
      if (kbTargets[sb] && perSubject[sb]) console.log('        投递知识库 → ' + kbTargets[sb]);
    }
    for (const sb of kbMissing) {
      console.log('        ⚠ 知识库缺科目文件夹，未投递：' + path.join(kbRoot, sb));
    }
  }
  return { files, outDir, kbDir, kbTargets, kbMissing };
}

module.exports = { buildMindmaps, renderChapter };

if (require.main === module) {
  const i = process.argv.indexOf('--kb');
  buildMindmaps(i >= 0 ? { kbRoot: process.argv[i + 1] } : {});
}
