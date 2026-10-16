# 专业课 · 学习助手

按专业课分科，每章含 **思维导图 / 重点 / 题目 / 练习 / 考点清单 / 错题本**。
「题目」页把题干、答案、解析、依据与课件原图一次摊开——**不用一题一题做也能看**；
「练习」页才是一题一题作答（做错自动进错题本），作答时也可点「看答案」跳过，跳过不计对错。
出题**课件题优先**，非重点题限比 25%，**考点标清**，可离线（PWA）。

**内容来源只有一个：雨课堂课件（老师本人的 PPT）。**
教材与视频**不进内容层**——考试口径、讲课重点、出题来源全部以课件为准；
课件没讲到的标「未覆盖」，**不补、不编、不猜**。

线上地址：<https://123yyy123-sky.github.io/major-app/>

---

## 一、仓库结构

```
major-app/
├── content/
│   ├── subjects.json      ★ 唯一内容源（改这里就行）
│   └── images.json        课件配图清单（由出图脚本生成）
├── web/
│   ├── template.html      App 外壳（HTML + CSS + JS 全在这一个文件）
│   ├── build.js           构建：注入内容 → 单文件版 + PWA 版（可被 require）
│   ├── mindmap.js         思维导图层级归一化
│   ├── assemble-chapter.js 批次片段 → 一章
│   ├── merge-chapter.js    一章 → 并入 subjects.json
│   ├── serve.js           本地开发服务器（自动重建 + 手机自动刷新）
│   ├── sw.js              Service Worker 模板（离线 + 自动换缓存）
│   ├── make_icons.py      生成 PWA 图标
│   └── 专业课.html        构建产物 · 单文件版（可直接传手机）
├── docs/                  ★ 上传这个文件夹 = 网站（GitHub Pages）
│   ├── index.html             PWA 版（单文件，约 305 KB）
│   ├── sw.js
│   ├── manifest.webmanifest
│   ├── .nojekyll              必须保留，否则 Pages 会走 Jekyll 处理
│   ├── icons/
│   └── img/<章>/pNNN.webp + .jpg
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

- 改 `content/subjects.json` 或 `web/template.html` → 自动重建 → 手机自动刷新（SSE 推送）
- 停止：`Ctrl+C`

> `serve.js` 直接复用 `build.js`，**不自己实现一遍构建**——曾经有过第二套简化构建，
> 跑一次就把 `docs/index.html` 覆盖成坏版本（图片不显示、导图塌平）。

---

## 三、部署到 GitHub Pages

仓库：`https://github.com/123yyy123-sky/major-app`

### 一次性设置
1. 仓库 → **Settings → Pages**
2. **Source** 选 `Deploy from a branch`
3. **Branch** 选 `main`，**Folder** 选 `/docs`
4. 保存，等 1 分钟

### 更新内容
```powershell
node web\build.js          # 重新构建 docs/
git add -A
git commit -m "更新内容"
git push
```

约 1 分钟后手机刷新即最新。Service Worker 的缓存版本号 = 内容哈希，**内容一变自动换缓存**。

> 代理：VPN 开时用 `-c http.proxy=http://127.0.0.1:65533` 临时传参，**不要写进 git config**。
> Token 只在命令行 URL 里临时用，**绝不写进任何文件**（本仓库是公开的）。

---

## 四、手机上装成 App（离线可用）

用**手机浏览器**打开线上地址：

- **Android (Chrome)**：菜单 → 「添加到主屏幕」/「安装应用」
- **iPhone (Safari)**：分享 → 「添加到主屏幕」

装好后有独立图标、全屏运行、**断网也能打开**（Service Worker 缓存应用外壳）。

> ⚠️ 离线能力依赖 HTTPS。GitHub Pages 自带 HTTPS；本地 `http://192.168.x.x` 不行。

---

## 五、出题规则（写在 `web/template.html` 的引擎里）

1. **课件题目优先** —— 按 `priority` 排序：`1 课件题目（必考）` → `2 课件考点（高频）`
2. **非重点题限比** —— 没打 `keyPoints` 的题最多占 **25%**（`MAX_NONKEY = 0.25`）
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
  "kind": "单选",                    // 单选 | 多选 | 填空 | 例题 | 计算 | 简答
  "priority": 1,                     // 1 课件题目（必考）｜2 课件考点（高频）
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

- `例题` / `计算` / `简答`：必须有 `given` / `ask` / `steps` / `result`，**不要 `options`**
- `items`、题干、选项都支持 `**加粗**` 与 `` `公式` ``（反引号走等宽+上下标排版）
- **溯源一律写 `课件 pNNN`**（绪论写 `课件 slide N`）；课件没讲到的标「未覆盖」

---

## 七、当前内容进度

| 科目 | 章节 | 重点卡 | 题 | 状态 |
|---|---|---:|---:|---|
| 锅炉原理 | 11 章（绪论 + 第 1/2/4/5/6/7/8/9/10/11 章） | 198 | 45 | ✅ 已上线 |
| 机械工程控制基础 | — | — | — | ⏳ 待做（第 4 期）|
| 动力测试技术 | — | — | — | ⏳ 待做（第 5 期，新科目）|
| 传热学 | — | — | — | ⏳ 待做（第 2 期）|
| 电工学 | — | — | — | ⏳ 待做（第 3 期）|

> 锅炉原理**第三章不考，永不建**。
> 已确认缺章等课件上传，**不用教材顶替**。

---

## 八、隐私红线

**含个人信息的课件页一律不进公开仓库。**

已发现的载体：课件「网络视频」占位页里的 B 站链接带 `vd_source=...` 追踪码，可定位到具体账号。

处理链路（**每做新科目必跑**）：

```powershell
python detect_risky_pages.py     # 生成 risky_pages.json（自动排除）+ risky_review.json（待确认）
python build_images.py           # 出图时读黑名单，命中页一律不发布
node   check_public_risky.js     # 核对：风险页是否有漏到 docs/img
node   check_text_pii.js         # 文本 PII 扫描（手机号 / 邮箱 / vd_source / B站链接 / 密钥）
```
