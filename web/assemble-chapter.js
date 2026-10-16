// 把各批次片段组装成「一章」的 JSON，供 merge-chapter.js 使用
// 用法：node web/assemble-chapter.js <输出.json> <元数据.json> <片段1.json> [片段2.json ...]
// 元数据.json 形如：{ "id":"boiler-ch4", "name":"第四章 燃烧设备", "subtitle":"...", "overview":"..." }
const fs = require('fs');
const path = require('path');

const [outPath, metaPath, ...fragPaths] = process.argv.slice(2);
if (!outPath || !metaPath) {
  console.error('用法：node web/assemble-chapter.js <输出.json> <元数据.json> <片段...>');
  process.exit(1);
}
const read = (p) => JSON.parse(fs.readFileSync(path.resolve(p), 'utf8').replace(/^\uFEFF/, ''));

const meta = read(metaPath);
const chapter = {
  id: meta.id,
  name: meta.name,
  subtitle: meta.subtitle || '',
  status: '在读',
  overview: meta.overview || '',
  mindmap: { label: meta.name, children: [] },
  points: [],
  questions: [],
};
// 可选：显式章序（无「第X章」字样的章节用它定序，如「拉普拉斯变换」）
if (typeof meta.order === 'number') chapter.order = meta.order;

const pIds = new Set(), qIds = new Set();
const mmLabels = new Set();

// 追加导图节点；**同名节点合并子条目**（同一节被拆到两个片段时会各带一半子节点）
//   2026-10-16：「2.2.4 拉普拉斯变换的基本性质」在 a/b 两片段各出现一次，
//   原先按 JSON 全等去重 → 留下两个同名分支，图上看着像重复。
function pushMM(node) {
  if (!node) return;
  const label = String(node.label == null ? '' : node.label).trim();
  const key = JSON.stringify(node);
  if (mmLabels.has(key)) return;
  const same = label
    ? chapter.mindmap.children.find((c) => String(c.label || '').trim() === label)
    : null;
  if (same) {
    same.children = same.children || [];
    for (const k of node.children || []) {
      if (!same.children.some((x) => JSON.stringify(x) === JSON.stringify(k))) {
        same.children.push(k);
      }
    }
    mmLabels.add(key);
    return;
  }
  mmLabels.add(key);
  chapter.mindmap.children.push(node);
}

for (const fp of fragPaths) {
  let frag;
  try { frag = read(fp); } catch (e) { console.error(`✗ 读取失败 ${fp}: ${e.message}`); continue; }

  // 全章格式：直接合并
  if (frag.id && frag.mindmap) {
    chapter.subtitle = chapter.subtitle || frag.subtitle || '';
    chapter.overview = chapter.overview || frag.overview || '';
    for (const c of frag.mindmap.children || []) pushMM(c);
  }
  // mindmapExtra 追加
  for (const c of frag.mindmapExtra || []) pushMM(c);
  // points
  for (const p of frag.points || []) {
    if (pIds.has(p.id)) continue;
    pIds.add(p.id); chapter.points.push(p);
  }
  // questions
  for (const q of frag.questions || []) {
    if (qIds.has(q.id)) continue;
    qIds.add(q.id); chapter.questions.push(q);
  }
  console.log(`  并入 ${path.basename(fp)}：+${(frag.points||[]).length} 卡 / +${(frag.questions||[]).length} 题`);
}

// 字段归一化：这些字段模板按**数组**渲染，子代理有时会给字符串 → 统一转数组
//   （2026-10-16：第 4 期机械控制的 given/ask 全是字符串，导致「题目」页
//     `q.given.map is not a function` 整页崩掉。此处是唯一入口，收在这最稳。）
const LIST_FIELDS = ['given', 'ask', 'steps', 'why', 'keyPoints'];
function toList(v) {
  if (v == null) return [];
  return Array.isArray(v) ? v : [v];
}
for (const q of chapter.questions) {
  for (const f of LIST_FIELDS) if (f in q) q[f] = toList(q[f]);
  if (q.options != null && !Array.isArray(q.options)) q.options = [];
}

// 校验：例题/计算/简答 必须有 steps；单选/多选 必须有 options 和 answer
const problems = [];
const SLOT_KINDS = ['例题', '计算', '简答'];
for (const q of chapter.questions) {
  if (SLOT_KINDS.indexOf(q.kind) >= 0) {
    if (!q.steps || !q.steps.length) problems.push(`${q.id}: ${q.kind} 缺 steps`);
    if (q.options && q.options.length) problems.push(`${q.id}: ${q.kind} 不应有 options`);
  } else if (q.kind === '填空') {
    if (!q.answer) problems.push(`${q.id}: 填空缺 answer`);
  } else {
    if (!q.options || !q.options.length) problems.push(`${q.id}: 缺 options`);
    if (!q.answer) problems.push(`${q.id}: 缺 answer`);
    if (!q.why || !q.why.length) problems.push(`${q.id}: 缺 why`);
  }
  if (!q.keyPoints) q.keyPoints = [];
}
// 补全默认字段
for (const q of chapter.questions) {
  if (!q.source) q.source = '课件题目';
  if (q.priority == null) q.priority = 1;
}
for (const p of chapter.points) {
  if (p.key == null) p.key = true;
}

fs.writeFileSync(path.resolve(outPath), JSON.stringify(chapter, null, 2), 'utf8');

const bk = chapter.questions.reduce((a, q) => { a[q.kind] = (a[q.kind] || 0) + 1; return a; }, {});
console.log(`\n✔ ${chapter.name}`);
console.log(`   导图分支 ${chapter.mindmap.children.length} ｜ 重点卡 ${chapter.points.length} ｜ 题 ${chapter.questions.length} ${JSON.stringify(bk)}`);
if (problems.length) {
  console.log(`\n⚠ 字段问题 ${problems.length} 处：`);
  problems.slice(0, 20).forEach((s) => console.log('   - ' + s));
} else {
  console.log('   字段校验：全部通过 ✅');
}
console.log(`   已写 ${outPath}`);
