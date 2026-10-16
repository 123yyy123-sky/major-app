// 通用：把某一章的 JSON 片段并入 content/subjects.json
//
// 用法：node web/merge-chapter.js <片段文件.json> [科目id]
//   科目id 可省略：自动按「章节 id 的前缀」判断（boiler-ch4 → boiler）
//   也可在片段里写 "subject": "control" 显式指定
//
// 片段格式（任一字段缺失则跳过）：
// {
//   "subject": "boiler",                                   // 可选，覆盖自动判断
//   "id": "boiler-ch4", "name": "第四章 燃烧设备", "subtitle": "...", "status": "在读",
//   "order": 4,                                            // 可选，覆盖按章名推的序号
//   "overview": "...",
//   "mindmap": { "label": "...", "children": [...] },      // 可选
//   "mindmapExtra": [ { "label": "..." } ],                // 可选，追加到 mindmap.children
//   "points": [ ... ],                                     // 可选
//   "questions": [ ... ]                                   // 可选
// }
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const P = path.join(ROOT, 'content', 'subjects.json');
const [fragPath, subjArg] = process.argv.slice(2);
if (!fragPath) {
  console.error('用法：node web/merge-chapter.js <片段.json> [科目id]');
  process.exit(1);
}

function readText(f) { return fs.readFileSync(f, 'utf8').replace(/^\uFEFF/, ''); }

const data = JSON.parse(readText(P));
let frag = JSON.parse(readText(path.resolve(fragPath)));

// 允许传入数组（多章）
const frags = Array.isArray(frag) ? frag : [frag];

/* ---------- 章节排序 ---------- */
// 章序来源优先级：片段里的 order > 章名里的「第X章」> 前置章节（绪论/拉普拉斯变换…）= 0
const CN = { 一:1, 二:2, 三:3, 四:4, 五:5, 六:6, 七:7, 八:8, 九:9, 十:10 };
function cnNum(s) {
  if (/^十$/.test(s)) return 10;
  if (/^十[一二三四五六七八九]$/.test(s)) return 10 + CN[s[1]];
  if (/^[一二三四五六七八九]十$/.test(s)) return CN[s[0]] * 10;
  if (/^[一二三四五六七八九]十[一二三四五六七八九]$/.test(s)) return CN[s[0]] * 10 + CN[s[2]];
  return CN[s] || NaN;
}
// 前置章节关键词：这些排在「第一章」之前
const LEADING = /绪论|前言|序论|引言|拉普拉斯变换|绪言|intro/i;

function orderOf(c) {
  if (typeof c.order === 'number') return c.order;                  // 显式指定
  const name = String(c.name || '');
  const m = name.match(/第\s*([一二三四五六七八九十百]+|\d+)\s*章/);
  if (m) return /^\d+$/.test(m[1]) ? parseInt(m[1], 10) : cnNum(m[1]);
  if (LEADING.test(name)) return 0;                                  // 前置章节
  return 500;                                                        // 兜底：排最后，不误删
}

/* ---------- 科目定位 ---------- */
const subjIds = data.subjects.map((s) => s.id);
function pickSubject(f) {
  if (f.subject && subjIds.indexOf(f.subject) >= 0) return f.subject;   // 片段显式指定
  if (subjArg && subjIds.indexOf(subjArg) >= 0) return subjArg;         // 命令行指定
  const prefix = String(f.id || '').split('-')[0];                      // 按 id 前缀
  if (subjIds.indexOf(prefix) >= 0) return prefix;
  return null;
}

const touched = new Set();
let failed = 0;

for (const f of frags) {
  if (!f.id) { console.log('跳过（无 id）'); continue; }

  const sid = pickSubject(f);
  if (!sid) {
    console.error(`⛔ 无法判断「${f.id}」属于哪个科目。`);
    console.error(`   请显式传：node web/merge-chapter.js ${fragPath} <科目id>`);
    console.error(`   现有科目：${subjIds.join(' / ')}`);
    failed++;
    continue;
  }
  const sub = data.subjects.find((s) => s.id === sid);
  sub.chapters = sub.chapters || [];

  // 跨科 id 撞车检查
  const clash = data.subjects.find(
    (s) => s.id !== sid && (s.chapters || []).some((c) => c.id === f.id));
  if (clash) {
    console.error(`⛔ 章节 id「${f.id}」已存在于科目「${clash.name}」，拒绝写入`);
    failed++;
    continue;
  }

  const i = sub.chapters.findIndex((c) => c.id === f.id);
  const existing = i >= 0 ? sub.chapters[i] : null;

  // 合并 points / questions（按 id 去重覆盖）
  function mergeById(oldArr, newArr) {
    const out = (oldArr || []).slice();
    for (const item of newArr || []) {
      const k = out.findIndex((x) => x.id === item.id);
      if (k >= 0) out[k] = item; else out.push(item);
    }
    return out;
  }

  let mindmap = f.mindmap || (existing && existing.mindmap) ||
    { label: f.name || '第 ? 章', children: [] };
  if (f.mindmapExtra && f.mindmapExtra.length) {
    mindmap = Object.assign({}, mindmap, {
      children: (mindmap.children || []).concat(f.mindmapExtra),
    });
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
  if (typeof f.order === 'number') merged.order = f.order;

  if (i >= 0) sub.chapters[i] = merged; else sub.chapters.push(merged);

  const bk = merged.questions.reduce((a, q) => {
    a[q.kind] = (a[q.kind] || 0) + 1; return a;
  }, {});
  console.log(`✔ [${sub.name}] ${merged.name}`);
  console.log(`    重点卡 ${merged.points.length} ｜ 题 ${merged.questions.length} ` +
    `${JSON.stringify(bk)} ｜ 导图分支 ${(merged.mindmap.children || []).length}`);
  touched.add(sid);
}

if (failed) {
  console.error(`\n⛔ 有 ${failed} 处未写入，subjects.json 未改动`);
  process.exit(1);
}

// 章序 + 日期
for (const sid of touched) {
  const s = data.subjects.find((x) => x.id === sid);
  s.chapters.sort((a, b) => orderOf(a) - orderOf(b));
}
data.updatedAt = new Date().toISOString().slice(0, 10);
fs.writeFileSync(P, JSON.stringify(data, null, 2), 'utf8');

for (const sid of touched) {
  const s = data.subjects.find((x) => x.id === sid);
  console.log(`\n[${s.name}] 章节顺序：` + s.chapters.map((c) => c.name).join(' | '));
}
