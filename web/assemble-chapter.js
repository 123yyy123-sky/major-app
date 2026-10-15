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

const pIds = new Set(), qIds = new Set();
const mmLabels = new Set();

for (const fp of fragPaths) {
  let frag;
  try { frag = read(fp); } catch (e) { console.error(`✗ 读取失败 ${fp}: ${e.message}`); continue; }

  // 全章格式：直接合并
  if (frag.id && frag.mindmap) {
    chapter.subtitle = chapter.subtitle || frag.subtitle || '';
    chapter.overview = chapter.overview || frag.overview || '';
    for (const c of frag.mindmap.children || []) {
      const key = JSON.stringify(c);
      if (!mmLabels.has(key)) { mmLabels.add(key); chapter.mindmap.children.push(c); }
    }
  }
  // mindmapExtra 追加
  for (const c of frag.mindmapExtra || []) {
    const key = JSON.stringify(c);
    if (!mmLabels.has(key)) { mmLabels.add(key); chapter.mindmap.children.push(c); }
  }
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

// 校验：例题必须有 steps；单选/多选必须有 options 和 answer
const problems = [];
for (const q of chapter.questions) {
  if (q.kind === '例题' || q.kind === '计算') {
    if (!q.given || !q.ask || !q.steps || !q.steps.length) problems.push(`${q.id}: 例题缺 given/ask/steps`);
    if (q.options) problems.push(`${q.id}: 例题不应有 options`);
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
