# 素材交付清单（Asset Checklist）

本文档依据 [TDD.md](TDD.md)「资产管线与生产标准」与 [script-source.md](script-source.md) 章节分镜整理，用于在开发启动前明确素材范围、规格与验收标准。循环叙事扩展资产（C 系列）依据 [worldview.md](worldview.md) 与 [script-loop.md](script-loop.md)。

> **当前交付状态**
>
> - 清单：[asset-manifest.md](asset-manifest.md) 与机器可读的 [`../public/data/asset-manifest.json`](../public/data/asset-manifest.json)
> - **A1–A7：** 已交付可用于开发
> - **B1/B3：** 已有可用占位资产，正式二维码/讲师视频待替换
> - **B2：** 数据结构已交付，价格与购买链接待商务提供
> - **C1–C4：** ✅ 已交付（书架模型、沉睡书脊与主书微光、脊码、夜景 HDRI 与台灯布光，均已接入场景）；脊码 URL 为 `.example` 占位
> - **C5–C6：** 已在 `src/pages/index.astro` 的 05 伴读章节实现
> - **C7–C8：** ✅ 已交付（`visual-spec.html` 新增 Loop chapters 节；`reading-journey.html/png` 概念图）

**状态说明**

- 🔴 阻塞：缺失则无法完成对应章节，需先用占位素材
- 🟡 可后补：可先用 mock 数据开发，上线前替换
- ⚪ 不需要：已确认不纳入本项目

---

## 1. 阻塞项（🔴）

| 编号 | 素材 | 用途章节 | 交付格式 | 落地路径 |
| --- | --- | --- | --- | --- |
| A1 | 书本 3D 模型 | 全片 | GLB（Draco 压缩） | `public/models/book-transformed.glb` |
| A2 | 书本 PBR 贴图 | 全片 | KTX2 / Basis Universal | `public/textures/` |
| A3 | 函套 3D 模型 | 第六章 | GLB（Draco 压缩） | `public/models/slipcase.glb` |
| A4 | 桌面与台座 | 序章、第五章 | GLB 或程序化几何 | `public/models/` |
| A5 | 字体文件 | 全片 | woff2 + ttf/otf | `public/fonts/` |
| A6 | 视觉稿 | 全片 2D UI | Figma 链接/文件 | `docs/design/visual-spec.html`、`public/design/tokens.*` |
| A7 | 定稿文案 | 全片 | Markdown / 飞书文档 | `docs/script-final.md`、`docs/copy-fields.json` |

### A1 书本模型（Blender 源文件 + GLB）

- **网格结构**：精装书壳 + 5~7 层复合页面网格 + 书签丝带，总面数 **≤ 50,000 三角面**。
- **形态键（命名必须一致）**：
  - `Key_Closed`：合拢
  - `Key_HalfOpen`：翻开 45 度
  - `Key_Flat`：180 度纯平摊开
- **坐标系**：Y 轴向上，原点位于书本底面中心，正面朝 +Z；导出时应用全部变换（scale = 1）。
- **尺寸**：按真实比例建模（建议 210 × 148 × 30 mm 量级），便于统一设置相机与阴影。
- **UV**：无重叠，贴图密度一致；书脊与封面可独立 UV 岛。
- **禁止**：烘焙进模型的前端布料物理、未合并的多余节点、相机/灯光残留对象。
- **交付物**：`.blend` 源文件 + 导出的 `.glb`（Draco）+ 形态键清单截图。

### A2 PBR 贴图

| 通道 | 要求 |
| --- | --- |
| BaseColor | sRGB，无光照信息 |
| Normal | 纸张纤维微观纹理，切线空间 |
| Roughness | 区分特种触感纸、书脊烫金、棉线 |
| Metalness | 书脊烫金区域为金属，其余接近 0 |
| AO | **必须烘焙进贴图**，节省实时光照算力 |

- **分辨率**：桌面端 2048×2048，移动端回退 1024×1024。
- **格式**：KTX2 / Basis Universal，保持压缩态直接入显存。
- **命名**：`book-basecolor.ktx2`、`book-normal.ktx2`、`book-roughness.ktx2`、`book-metalness.ktx2`、`book-ao.ktx2`。
- **运行时消费**：`book-transformed.glb` 内嵌的 KTX2 PBR 图集由 `KTX2Loader` 直接解码，`BookScene` 保留 Normal / AO / Roughness / Metalness 通道。由于当前 GLB 内嵌的 BaseColor 仍为旧版 `CODEX` 图集，运行时用 `book-basecolor.webp`（当前 `THE BOOK.` 图集，2048²，36 KB，由源 PNG 转出）仅覆盖 BaseColor；待 GLB 按最新源图重建后，可移除该覆盖。
- **WebP 覆盖层重建**：`cwebp -q 90 public/textures/source/book-basecolor.png -o public/textures/book-basecolor.webp`

### A3 函套模型

- 极简黑色定制函套（Slipcase）+ 封签细节，风格与书本一致。
- 面数 ≤ 10,000；含开合所需的独立网格分组（书可被装入/抽出）。
- **运行时材质**：按网格区分哑光黑色布面（`Slipcase_Black_Cloth`）、深色绒面内托（`Slipcase_Inner_Tray`）与烫金封签（`Slipcase_Foil_Seal`，金属度 0.92），不再统一染成暖褐色。

### A4 桌面与台座

- **橡木书桌**：写实木质纹理，供序章落地镜头使用。
- **展示台座**：第五章书本 45° 立于其上旋转；简洁几何体即可。
- 若采用程序化几何，需提供材质贴图与尺寸参数。
- **运行时材质**：橡木 BaseColor / Normal / Roughness 随 `oak-desk.glb` 内嵌加载，并按桌面尺度平铺（2×2），以深胡桃色表现；台座按资产命名使用青铜黑（`Pedestal_Bronze_Black`，金属度 0.58）。

### A5 字体

- **英文标题**：用于 `CODEX 1.`、各章主标题及参数表；需**商用授权**。
- **中文标题/正文**：需**商用授权**，覆盖常规与中等字重。
- **格式**：woff2 供网页；ttf/otf 供 `troika-three-text` 在 3D 场景内渲染。
- **要求**：正文字号下中英文对比度 ≥ 4.5:1；提供 license 文件与授权范围说明。

### A6 视觉稿

- **断点**：桌面 1440px + 移动 390px 两套。
- **内容**：
  - 六个章节的排版布局与文字出现节奏（对应滚动进度）。
  - 颜色 token（抗疲劳暖色调，深色底）。
  - 字号阶梯与行高。
  - 按钮、配置卡片、参数表、CTA 的样式与状态。
- **验收**：所有正文组合通过 WCAG AA（≥ 4.5:1）。

### A7 定稿文案

- 确认 [script-final.md](script-final.md) 中的文案是否为最终版，输出中英双语定稿。
- 明确各字段长度上限（主标题、副标题、注释微字、卡片文案），避免排版溢出。
- 参数表（iPad Pro / Kindle）需提供数据来源或免责声明，见 [benchmark-sources.md](benchmark-sources.md)。
- 机器可读文案与移动端变体见 [`copy-fields.json`](copy-fields.json)，用 `node scripts/validate-copy.mjs` 校验。

---

## 2. 可后补项（🟡）

| 编号 | 素材 | 说明 | 上线前是否必须 |
| --- | --- | --- | --- |
| B1 | 真实二维码 / 落地链接 | 第四章「一码入网」的目标地址与二维码图片 | 是 |
| B2 | 购买链接与价格 | 三档配置卡（Standard / Pro / Enterprise）的跳转与价格文案 | 是 |
| B3 | 名师讲解视频 | 至少 1 段示例视频 + 封面图 | 是 |
| B4 | 知识图谱数据 | 节点/连线示例 JSON，或可替换的静态图 | 是 |
| B5 | 品牌 Logo / favicon | Bookln 标识，页脚与浏览器标签 | 是 |
| B6 | 摄影棚 HDRI | 暖色影棚环境光；开发期先用 `Environment preset` | 否（可 CDN/内置） |
| B7 | 降级素材 | 低端设备 fallback 用的静态海报或 2D 序列帧 | 是 |
| B8 | 参数依据 | 竞品续航、跌落等数据的来源与免责说明 | 是 |

---

## 3. 已确认不需要（⚪）

- **音效资产**：文档中音频引擎、音频生产流程与音效触发逻辑已全部剔除，无需 ElevenLabs / Freesound 素材。仓库中现有的 `public/voice/voice.mp3` 为历史遗留文件，不纳入当前交付，也不在清单中引用。

---

## 3.5 循环叙事扩展资产（C 系列 · C1–C8 已交付）

> 依据 [worldview.md](worldview.md)（决定记录 D1/D3/D4）与 [script-loop.md](script-loop.md) 分镜。<br>
> 章节重排后为：Hero → 00 停泊 → 01 携归 → 02 结构 → 03 寻址 → 04 认领 → 05 伴读 → 06 传承 → 尾声。**「已确认不需要」的第 3 节仍有效**；C 系列为新增章节所需，与 A/B 系列互补。

| 编号 | 素材 | 用途章节 | 交付格式 | 落地路径 | 复用说明 |
| --- | --- | --- | --- | --- | --- |
| C1 | 书架模型 | 00 停泊 / 06 传承 | GLB（Draco） | `public/models/shelf.glb` | ✅ 已交付（≈1,000 三角面）。两章共用同一模型（06 归架需回到 00 构图）；面数 ≤ 15,000，含一排可独立显隐的书脊群组 |
| C2 | 群书书脊（沉睡态） | 00 停泊 | 同 C1 的分组网格 / 贴图 | `public/models/shelf.glb`（材质内置） | ✅ 已交付。全部暗色，仅主书书脊带 0.00W 呼吸微光（材质自发光贴图或着色器呼吸） |
| C3 | 脊码 + 试读层全息浮窗 | 00 停泊 | 贴图 + 前端 DOM/全息卡片 | `public/qr/spine-mark.svg` + `src/` 组件 | ✅ 脊码（占位 URL）为 B1 二维码体系的新变体（复用 `build-qr.mjs` 流程）；试读层 UI 贴图/组件新建 |
| C4 | 夜景台灯与桌面布光 | 05 伴读 | HDRI / 灯光预设 + 可选台灯模型 | `public/hdri/night-desk.hdr` | ✅ 已交付。暖光半径小、噪点克制，与 `warm-studio.hdr` 同规格（B6 标准复用） |
| C5 | 伴读浮窗三件套 UI | 05 伴读 | 组件 + 2D 视觉稿 | `src/` + `docs/design/` | 🟡 新建。讲题视频小窗 / 图谱缩略 / AI 问答框，全部贴页边排布，**不得遮挡正文**；复用 B3 视频与 `knowledge-graph.json` 数据 |
| C6 | 双锚点循环图（2D 印刷层） | 05 伴读 | SVG / CSS 动效 | `src/` 组件 | 🟡 新建。卡壳 → 扫码 → 开讲 → 回纸，四步首尾相接成环；交互响应遵循 400ms / `Curves.easeOutCubic` 约束 |
| C7 | 2D 章节转场视觉稿扩展 | 00/01/05/06 章 | 桌面 1440 + 移动 390 两套 | `docs/design/visual-spec.html` 扩展 | ✅ 已交付。扩展现有 A6 视觉稿，覆盖四个新章节的排版节奏与 telemetry 状态 |
| C8 | App「阅读里程」归档界面 | 06 传承 | 概念 UI 视觉稿 | `docs/design/reading-journey.html` | ✅ 已交付。仅一屏概念图：「第 N 本 · 共读 47 夜」归档瞬间；**红线**：不得出现整页正文阅读、推送、红点、弹窗（见 [worldview.md](worldview.md) §10） |

C 系列验收补充：

- 00 与 06 的书架镜头构图必须一致（首尾呼应即闭环），验收时逐帧比对两章取景。
- 04 认领章新增的两个节拍（矩阵码「迟疑一拍」呼吸光变奏、图谱根节点向书签垂金线）在现有模型与形态键内完成，不新增模型资产。
- 所有新章节文案进入 `copy-fields.json` 前须过 [`worldview.md`](worldview.md) §11 术语表与 §10 红线检查。

### C9 · 00 章书架序列（运行时实现，无新增二进制资产）

00 章的字幕文案保持不动，书架部分改为运行时重建：

- **实体书脊**：`src/components/book-stage/ShelfStage.tsx` 用 `InstancedMesh` 生成三排有厚度的书（圆脊、护封板、书页块、烫金条、书名签），并隐藏 `shelf.glb` 中原来的平面 `Shelf_Books_Sleeping` / `Shelf_Hero_Spine` / `Shelf_Hero_Glow`，只保留胡桃木柜体。每帧约 6 个实例化绘制调用。
- **随机取书**：每次载入从中间层随机选一格（4 个候选位）作为主角书位；该格留出 80 mm 空位并显示金色选框与呼吸微光。滚动进入 00 章时，主角书从该格抽出、前移、下落到桌面并转向封面。
- **脊码特写**：封面右下角使用 `/qr/one-code-entry.png` 贴图，滚动到特写段时出现金色取景角与扫掠线。
- **手机扫描器**：程序化 `RoundedBox` 机身 + `CanvasTexture` 屏幕，屏幕 UI 绘制扫码取景框、脊码、`SCANNING…` 与命中后的书名 / 9 NODES / 11 LINKS / 0.4 S / 0.00 W；手机在 00 章后段升起。
- **云端面板**：同一 CanvasTexture 绘制 `CLOUD SOUL` 卡片与 9 节点小图谱，并以金色上行光路连接书页脊码。数据为确定性概念预览，不是实时接口。
- **验收**：桌面 1440×900 与移动 390×844 已截图比对；`astro build` 通过。

---

## 4. 命名与交付规范

- 文件名统一 `kebab-case`，全小写，不含空格与中文。
- 目录约定：
  - `public/models/`：GLB 模型
  - `public/textures/`：KTX2 贴图
  - `public/fonts/`：字体
  - `src/assets/`：仅存放参与构建、会被优化的图片等资源
- 资产预算（与 TDD 性能红线一致）：
  - 首屏传输总量 **< 4.5 MB**
  - 单张贴图最大边长 **≤ 2048px**
  - 模型面数 **< 50,000**
  - 绘制调用 **< 40 / 帧**
- 所有模型导出前需在 Blender 中执行：应用变换、合并同材质网格、删除隐藏对象、重算法线。

---

## 5. 验收清单

- [x] 书本模型面数 ≤ 50k，三个形态键命名正确且可正常插值（已核验：4,400 三角面；`Key_Closed`、`Key_HalfOpen`、`Key_Flat`）
- [x] 模型坐标、缩放、原点符合约定，导入后无需二次调整（节点 extras 记录 mm / +Y up / +Z forward / scale 1:1）
- [x] PBR 通道齐全，AO 已烘焙，贴图为 KTX2（Draco + KTX2 扩展均为 required）
- [x] Draco 压缩后 GLB 体积符合预算（1.4 MB）
- [x] 函套、书桌、台座可独立控制显隐与动画（独立 GLB）
- [x] 字体授权文件已归档，3D 文字字体可用（OFL）
- [x] 视觉稿覆盖桌面与移动断点，对比度达标
- [x] 文案双语定稿，无溢出风险（`validate-copy.mjs` 通过；移动端变体已补齐）
- [ ] 可后补项已明确责任人与最晚交付时间（B1/B2/B3 仍需商务、讲师与法务确认）

---

## 6. 当前交付状态

| 编号 | 状态 | 交付路径 | 说明 |
| --- | --- | --- | --- |
| A1 | ✅ delivered | `public/models/book-transformed.glb` | 4,400 三角面；Draco + KTX2；三个形态键；源文件 `public/models/source/book-codex-1.blend` |
| A2 | ✅ delivered | `public/textures/` | 桌面 + 移动 KTX2 PBR 套装；源 PNG 在 `public/textures/source/` |
| A3 | ✅ delivered | `public/models/slipcase.glb` | 函套模型 |
| A4 | ✅ delivered | `public/models/oak-desk.glb`、`display-pedestal.glb` | 橡木桌与台座 |
| A5 | ✅ delivered | `public/fonts/` | WOFF2 + TTF；OFL 授权文件与源字体在 `public/fonts/source/` |
| A6 | ✅ delivered | `docs/design/visual-spec.html`、`public/design/tokens.*` | 桌面/移动视觉稿与设计 token |
| A7 | ✅ delivered | `docs/script-final.md`、`docs/copy-fields.json` | 概念定稿；声明类文案待法务复核 |
| B1 | 🟡 placeholder | `public/qr/`、`public/data/links.json` | `.example` 占位域名；替换后重跑 QR 脚本 |
| B2 | 🟡 pending-external | `public/data/editions.json` | 三档结构已交付；价格/购买链接为 `null` |
| B3 | 🟡 placeholder | `public/video/` | 15 秒静音概念预览；讲师实拍与授权待补，音频不纳入当前素材范围 |
| B4 | ✅ delivered | `public/data/knowledge-graph.json`、`public/design/knowledge-graph.*` | 9 节点 / 11 连线的概念数据与静态图 |
| B5 | ✅ delivered | `public/brand/`、`public/favicon.*`、`public/site.webmanifest` | 标识、字标、锁合、favicon、PWA 图标 |
| B6 | ✅ delivered | `public/hdri/warm-studio.hdr` | 暖色影棚 HDRI |
| B7 | ✅ delivered | `public/fallback/` | 桌面/移动静态海报 |
| B8 | ✅ delivered | `public/data/benchmark.json`、`docs/benchmark-sources.md` | 来源、免责声明与发布前检查表 |

生成/刷新清单：

```sh
node scripts/build-asset-manifest.mjs
```
