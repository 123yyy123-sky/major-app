# 专业课 · 移动学习 App

按专业课分科，每章含 **思维导图 / 重点 / 练习 / 考点清单 / 错题本**。
出题**课件题优先**，非重点题限比，**考点标清**。

内容来源优先级：**雨课堂课件 ＞ 视频 ＞ 课本**（与知识库 `专业课底层规则` 一致）。

---

## 一、仓库结构

```
major-app/
├── content/
│   └── subjects.json      ★ 唯一内容源（改这里就行）
├── web/
│   ├── template.html      App 外壳（HTML + CSS + JS）
│   ├── build.js           构建：注入内容 → 出单文件版 + PWA 版
│   ├── serve.js           本地开发服务器（自动重建 + 手机自动刷新）
│   ├── sw.js              Service Worker 模板（离线用）
│   ├── make_icons.py      生成 PWA 图标
│   └── 专业课.html        构建产物 · 单文件版
├── docs/                  ★ 上传这个文件夹 = 网站（GitHub Pages）
│   ├── index.html
│   ├── manifest.webmanifest
│   ├── sw.js
│   └── icons/
└── README.md
```

---

## 二、本地开发（电脑上改，手机上看）

```powershell
cd F:\Ai\major-app
node web\serve.js
```

启动后会打印：

```
本机：   http://localhost:8090
手机：   http://192.168.x.x:8090
```

- **改 `content/subjects.json` 或 `web/template.html` → 自动重建 → 手机自动刷新**（SSE 推送，不用手动刷）
- 只监听这两个源文件；输出文件不会触发重建
- 停止：`Ctrl+C`

> 手机连不上（校园网客户端隔离）：改用静态托管，见下。

---

## 三、部署到 GitHub Pages（推荐）

仓库：`https://github.com/123yyy123-sky/major-app`

### 一次性设置
1. 把本仓库推到 GitHub（见下方命令）
2. 仓库 → **Settings → Pages**
3. **Source** 选 `Deploy from a branch`
4. **Branch** 选 `main`，**Folder** 选 `/docs`
5. 保存，等 1 分钟

### 得到网址
```
https://123yyy123-sky.github.io/major-app/
```

### 更新内容
```powershell
node web\build.js          # 重新构建 docs/
git add -A
git commit -m "更新内容"
git push
```
约 1 分钟后手机刷新即最新。Service Worker 的缓存版本号 = 内容哈希，**内容一变自动换缓存**。

---

## 四、手机上装成 App（离线可用）

用**手机浏览器**打开上面的网址：

- **Android (Chrome)**：菜单 → 「添加到主屏幕」/「安装应用」
- **iPhone (Safari)**：分享 → 「添加到主屏幕」

装好后：
- 有独立图标（橙底白字「专」）
- 全屏运行，无浏览器地址栏
- **断网也能打开**（Service Worker 缓存了应用外壳）

> ⚠️ 离线能力依赖 HTTPS。GitHub Pages 自带 HTTPS，所以能用；
> 本地 `http://192.168.x.x` 不行（浏览器只允许 localhost/HTTPS 注册 Service Worker）。

---

## 五、出题规则（写在 `web/template.html` 的引擎里）

1. **课件题目优先** —— 按 `priority` 排序：`1 课件题目` → `2 视频考点` → `3 教材考点` → `4 补充练习`
2. **非重点题限比** —— 没打 `keyPoints` 的题，最多占 **25%**（`MAX_NONKEY = 0.25`）
3. **错题加权** —— 错过的题提权、连对的降权（存在手机本地 `localStorage`）
4. **考点标清** —— 每题显示考点标签；有独立「考点清单」页，按错题数排序，标注出处

---

## 六、内容字段说明

### 章节
```json
{
  "id": "boiler-intro",
  "name": "绪论",
  "subtitle": "火力发电厂和锅炉工作原理",
  "status": "在读",
  "mindmap": { "label": "绪论", "children": [ ... ] },
  "points":  [ { "title": "...", "key": true, "source": "课件 slide 6", "items": ["…"] } ],
  "questions": [ ... ]
}
```

### 题目
```json
{
  "id": "bq-1",
  "kind": "单选",                    // 单选 | 多选 | 填空
  "priority": 1,                     // 1 课件题目｜2 视频考点｜3 教材考点｜4 补充练习
  "source": "课件题目",
  "sourceDetail": "课件 slide 9（1 分）",
  "keyPoints": ["基本参数", "表压"],  // 空数组 = 非重点，会被限比
  "stem": "关于锅炉的基本参数，下列说法正确的是（　）",
  "options": [ { "k": "A", "t": "…" } ],
  "answer": "B",                     // 多选写 "ABD"；填空写 "374.15 ℃ ； 22.1 MPa"
  "why": ["A ✗ …", "B ✓ …"],
  "basis": "课件 slide 6–7",
  "answerNote": "课件未标答案，本答案由课件原文推出"
}
```

> `items`、题干、选项都支持 `**加粗**`。

---

## 七、当前内容进度

| 科目 | 章节 | 题数 | 状态 |
|---|---|---|---|
| 锅炉原理 | 绪论 | 16（课件题 2 · 视频 11 · 教材 1 · 补充 2） | ✅ 可用 |
| 传热学 | — | — | 待素材（正文扫描件需 OCR） |
| 电工学 | — | — | 待素材（PDF 加密） |
| 机械工程控制基础 | — | — | 待素材（书签无章节名） |

**铺开的关键是素材**：给了雨课堂课件就能按同一套结构加章节。
