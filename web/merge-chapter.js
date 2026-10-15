// 通用：把某一章的 JSON 片段并入 content/subjects.json
// 用法：node web/merge-chapter.js <片段文件.json>
// 片段格式（任一字段缺失则跳过）：
// {
//   "id": "boiler-ch4", "name": "第四章 燃烧设备", "subtitle": "...", "status": "在读",
//   "overview": "...",
//   "mindmap": { "label": "...", "children": [...] },     // 可选
//   "mindmapExtra": [ { "label": "..." } ],               // 可选，追加到 mindmap.children
//   "points": [ ... ],                                     // 可选
//   "questions": [ ... ]                                   // 可选
// }
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const P = path.join(ROOT, 'content', 'subjects.json');
const fragPath = process.argv[2];
if (!fragPath) { console.error('用法：node web/merge-chapter.js <片段.json>'); process.exit(1); }

function readText(f) { return fs.readFileSync(f, 'utf8').replace(/^\uFEFF/, ''); }

const data = JSON.parse(readText(P));
const boiler = data.subjects.find((s) => s.id === 'boiler');
let frag = JSON.parse(readText(path.resolve(fragPath)));

// 允许传入数组（多章）
const frags = Array.isArray(frag) ? frag : [frag];

const order = (c) => (c.id.includes('intro') ? 0 : parseInt((c.id.match(/ch(\d+)/) || [0, 99])[1], 10));

for (const f of frags) {
  if (!f.id) { console.log('跳过（无 id）'); continue; }
  const i = boiler.chapters.findIndex((c) => c.id === f.id);
  const existing = i >= 0 ? boiler.chapters[i] : null;

  // 合并 points / questions（按 id 去重覆盖）
  function mergeById(oldArr, newArr) {
    const out = (oldArr || []).slice();
    for (const item of newArr || []) {
      const k = out.findIndex((x) => x.id === item.id);
      if (k >= 0) out[k] = item; else out.push(item);
    }
    return out;
  }

  let mindmap = f.mindmap || (existing && existing.mindmap) || { label: f.name || '第 ? 章', children: [] };
  if (f.mindmapExtra && f.mindmapExtra.length) {
    mindmap = Object.assign({}, mindmap, { children: (mindmap.children || []).concat(f.mindmapExtra) });
  }

  const merged = {
    id: f.id,
    name: f.name || (existing && existing.name) || f.id,
    subtitle: f.subtitle || (existing && existing.subtitle) || '',
    status: f.status || '在读',
    overview: f.overview || (existing && existing.overview) || '',
    mindmap,
    points: mergeById(existing && existing.points, f.points),
    questions: mergeById(existing && existing.questions, f.questions),
  };

  if (i >= 0) boiler.chapters[i] = merged; else boiler.chapters.push(merged);

  const bk = merged.questions.reduce((a, q) => { a[q.kind] = (a[q.kind] || 0) + 1; return a; }, {});
  console.log(`✔ ${merged.name}`);
  console.log(`    重点卡 ${merged.points.length} ｜ 题 ${merged.questions.length} ${JSON.stringify(bk)} ｜ 导图分支 ${(merged.mindmap.children || []).length}`);
}

boiler.chapters.sort((a, b) => order(a) - order(b));
data.updatedAt = '2026-10-15';
fs.writeFileSync(P, JSON.stringify(data, null, 2), 'utf8');
console.log('\n章节顺序：' + boiler.chapters.map((c) => c.name).join(' | '));
