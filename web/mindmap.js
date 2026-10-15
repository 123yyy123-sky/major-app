// 思维导图层级归一化
//
// 背景：第 4 章起的 mindmap 是「扁平追加」出来的（一级节点全是叶子），
//      折叠树渲染时没有 +/- 可点，手机上手感等于「折叠功能失效」。
//
// 原则：
//   1. 已分层的导图（绪论/第1/2/9章）**原样保留**，绝不改动。
//   2. 只有真正「一级节点全是叶子」的章节才归并。
//
// 两种平铺形态：
//   A. 交错型（第4/6/7章）：[节1, 内容…, 节2, 内容…, …]
//      → 只在「第X节」处断开，组名即节名，语义准确。
//   B. 节标题前置型（第5章）：[节1..节6, 内容…]
//      → 节名单独成一组，内容按块分组为「要点 1–7」…

const SEC = /^第[一二三四五六七八九十百]+节/;              // 第X节
const SUB = /^[（(]?[一二三四五六七八九十]+[)）]?[、．.]/;    // 一、二、三、

const BLOCK = 7;      // 内容分块大小

function norm(s) { return String(s == null ? '' : s).trim(); }
function hasChildren(n) { return !!(n && n.children && n.children.length); }
function isNested(kids) { return kids.some(hasChildren); }

function normalizeMindmap(mm, chapterName, grandLabel) {
  if (!mm || typeof mm !== 'object') return { label: chapterName || '', children: [] };
  const kids = Array.isArray(mm.children) ? mm.children : [];
  if (!kids.length) return mm;

  const label = norm(mm.label) || norm(chapterName);

  // ① 已分层 → 但若顶层散落着**大量**叶子，把叶子也归组（第9章这种混合形态）
  //    只散落 1~3 个叶子的章节（绪论/第1/第2章）是刻意保留的独立条目，不动
  if (isNested(kids)) {
    const nested = kids.filter(hasChildren);
    const loose = kids.filter((k) => !hasChildren(k));
    if (loose.length < 4) return mm;
    const groups = groupFlat(loose, label, chapterName, grandLabel, true);
    return { label, children: nested.concat(groups) };
  }

  // ② 整章扁平 → 归并，组名直接用节名（语义准确，不加前缀）
  return { label, children: groupFlat(kids, label, chapterName, null, false) };
}

/**
 * 把一组扁平节点归并成两层分组
 * @param {Array} nodes 扁平节点
 * @param {string} label 根名
 * @param {string} chapterName 章名（用于去重）
 * @param {string} grandLabel 组名前缀（仅"已分层章节的散落叶子"才用）
 * @param {boolean} usePrefix 是否加前缀
 */
function groupFlat(nodes, label, chapterName, grandLabel, usePrefix) {
  const flat = nodes.filter((k) => {
    const t = norm(k.label);
    return t && t !== label && t !== norm(chapterName);
  });
  if (!flat.length) return [];

  const p = usePrefix ? grandLabel : null;
  const secCount = flat.filter((k) => SEC.test(norm(k.label))).length;
  if (secCount === 0) {
    const r = bySub(flat, label);
    return prefix(r.children, p);
  }

  let lead = 0;
  for (const k of flat) { if (SEC.test(norm(k.label))) lead++; else break; }
  const frontLoaded = lead >= 3 && lead >= secCount * 0.8;

  const groups = frontLoaded ? formB(flat) : formA(flat);

  // 组内「一、二、」小标题再分一层
  for (const g of groups) {
    if (!g.children || g.children.length < 5) continue;
    if (!g.children.some((c) => SUB.test(norm(c.label)))) continue;
    const sub = [];
    let s = null;
    for (const c of g.children) {
      const t = norm(c.label);
      if (SUB.test(t)) { s = { label: t, children: [] }; sub.push(s); }
      else if (s) s.children.push(c);
      else sub.push(c);
    }
    g.children = sub;
  }

  return prefix(groups.filter((g) => g.children && g.children.length), p);
}

// 给组名加前缀（用于「已分层章节的散落叶子」）
function prefix(groups, p) {
  if (!p) return groups;
  return groups.map((g) => ({ label: p + '：' + g.label, children: g.children }));
}

// 形态 A：只在节边界断开，组名＝节名
function formA(flat) {
  const groups = [];
  let cur = null;
  for (const k of flat) {
    const t = norm(k.label);
    if (SEC.test(t)) {
      cur = { label: t, children: [] };
      groups.push(cur);
    } else if (cur) {
      cur.children.push({ label: t });
    } else {
      // 第一节之前的内容 → 归到「本章概览」
      let g = groups.find((x) => x.label === '本章概览');
      if (!g) { g = { label: '本章概览', children: [] }; groups.unshift(g); }
      g.children.push({ label: t });
    }
  }
  return groups;
}

// 形态 B：节名单独成组，内容按块分组，块名尽量带上该块涉及的节名
function formB(flat) {
  const secs = [], rest = [];
  let i = 0;
  for (; i < flat.length; i++) {
    if (SEC.test(norm(flat[i].label))) secs.push(norm(flat[i].label)); else break;
  }
  for (; i < flat.length; i++) rest.push(flat[i]);

  const groups = [];
  if (secs.length) {
    // 节名不多时直接全列；多了按「首–尾」概括
    const kids = secs.length <= 8
      ? secs.map((s) => ({ label: s }))
      : [{ label: secs[0] }, { label: '……' }, { label: secs[secs.length - 1] }];
    groups.push({ label: '本章小节（共 ' + secs.length + ' 节）', children: kids });
  }

  // 内容按节名再切一次：正文里若出现节名，就起新块
  const chunks = [];
  let cur = [];
  for (const n of rest) {
    const t = norm(n.label);
    if (SEC.test(t) && cur.length) { chunks.push(cur); cur = []; }
    cur.push(n);
    if (cur.length >= BLOCK) { chunks.push(cur); cur = []; }
  }
  if (cur.length) chunks.push(cur);

  chunks.forEach((part) => {
    const sec = part.find((n) => SEC.test(norm(n.label)));
    let name;
    if (sec) {
      name = norm(sec.label);
    } else {
      const a = rest.indexOf(part[0]) + 1;
      name = '要点 ' + a + '–' + (a + part.length - 1);
    }
    groups.push({ label: name, children: part.map((n) => ({ label: norm(n.label) })) });
  });
  return groups;
}

// 没有「第X节」时：优先按「一、二、」分组，否则按块
function bySub(flat, label) {
  if (flat.some((k) => SUB.test(norm(k.label)))) {
    const out = [];
    let cur = null;
    for (const k of flat) {
      const t = norm(k.label);
      if (SUB.test(t)) { cur = { label: t, children: [] }; out.push(cur); }
      else if (cur) cur.children.push({ label: t });
      else out.push({ label: t });
    }
    return { label, children: out };
  }
  const out = [];
  for (let a = 0; a < flat.length; a += BLOCK) {
    const part = flat.slice(a, a + BLOCK);
    out.push({
      label: '要点 ' + (a + 1) + '–' + Math.min(a + BLOCK, flat.length),
      children: part.map((n) => ({ label: norm(n.label) })),
    });
  }
  return { label, children: out };
}

module.exports = { normalizeMindmap, isNested, hasChildren };
