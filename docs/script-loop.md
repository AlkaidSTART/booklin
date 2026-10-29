# 循环叙事分镜草案（Loop Storyboard · Draft）

> Status: **v0.3 — 页面已按循环结构重排；数据契约已落地；C1–C8 3D/视觉资产待产（书链馆与夜景暂用占位机位）**<br>
> Version: `2026-10-29`（附录 C 增补公司档案与客户）<br>
> 世界观依据：[`worldview.md`](worldview.md)（设定、决定记录、术语表）<br>
> 格式沿用：[`script-source.md`](script-source.md)（3D 视觉 + 文案编排）

本稿把「书架 → 购买 → 回家 → 扫码 → App 学习 → 读毕归架」的完整生命环落成分镜。**新增/改写章节**：00 停泊、01 携归、04 认领（改写）、05 伴读、06 传承；**原样沿用**：Hero 登场、02 结构、03 寻址；**降为尾声**：基准、部署。文案为草案，未进入 `copy-fields.json`，定稿前须过 `node scripts/validate-copy.mjs`。

---

## Hero · 序幕 — 书链（品牌宣言，保留现有 00 登场）

去掉章节号，作为全片的品牌宣言开场。书落桌、尘光、逐行浮现——全部沿用现有定稿（见 [`script-final.md`](script-final.md) §00）。

---

## 00 · 停泊 The Shelf — 一本书，在架上沉睡（🆕）

> Q1 已拍板（2026-10-27）：**书链馆（Bookln Haven）**，设定见 [`worldview.md`](worldview.md) §2。开场沿用 oryzo 式**单书聚焦**：第一眼永远是这一本书，书链馆只作虚焦环境，不拍群像。供给端为真实网络（2,600+ 合作出版商、100 万+ 品种，见 [`worldview.md`](worldview.md) §7.1）——书架是真实库存的陈列面，不是布景。

### 3D 视觉

- 承接 Hero：落桌的书轻轻合上，镜头沿书脊上摇，场景过渡到书链馆内一面高大的橡木书架。环境全部虚焦：暖黄顶灯、远处读者剪影、一枚「Bookln Haven」标签灯箱掠过景深。
- **取景始终是一本书**：书架上这一本的书脊独占画面中央，其余书脊化作暗色虚影。它的书脊透出一缕极弱的暖金微光——云魂沉睡态的呼吸光（0.00W 的视觉化）。
- 一只手入画，手机镜头对准书脊的**脊码**（Spine Mark）——书脊上方升起一层半透明的**试读层**全息浮窗：目录、样章、讲题样例、图谱轮廓。
- 手指在「带走它」按钮上悬停（不按下），浮窗轻晃了一下，暗示书在等一个决定。

### 文案编排

| Field | English | 中文 |
| --- | --- | --- |
| Eyebrow | WHERE BOOKS WAIT | 书在架上，魂在云上 |
| Main title | **One Book, Two Bodies.** | **一本书，两个身体。** |
| Subtitle | This book has two bodies: paper here, soul in the cloud. | 这本书有两个身体：纸身在此处，云魂在云上。 |
| Subtitle (mobile) | Paper here. Soul in the cloud. | 纸身在此，云魂在云上。 |
| Annotation | Scan a spine mark: the preview layer rises — a glimpse of a soul not yet yours. Unclaimed, it stays at 0.00W. | 扫一扫脊码，试读层升起——看一眼还不属于你的云魂。无人认领时，书保持 0.00W。 |
| Annotation (mobile) | Scan a spine mark: the preview layer rises. Unclaimed, it stays 0.00W. | 扫脊码，试读层升起。未认领，永为 0.00W。 |

**Telemetry:** `ON SHELF · DORMANT · 0.00W · PREVIEW ONLY` / `架上沉睡 · 仅试读层开放`

**Motion beat:** Hero 单书落桌 → 镜头沿书脊上摇入书链馆（环境虚焦）10% → 单书书脊微光特写 60% → 脊码扫开试读层全息浮窗 100%。

---

## 01 · 携归 The Carry — 买下的，是两个身体（🆕 轻章节）

### 3D 视觉

- 回到书架前，手指按下了「带走它」——试读层浮窗合拢成一枚光点，落回书脊；书从架上抽出。
- 走向书链馆出口：结算界碑亮起，一束极简的**封签光**沿函套封口烙下一道哑金烙印（复用 A3 函套的封签细节）。馆内只完成「归属转移」，认领留给家里。
- 快剪三连：书滑入函套 → 函套入包 → 门口回望一眼书架空出的位置（单书机位，环境虚焦）。云魂的微光此刻**跟随在书旁**，像一枚安静的伴星。
- 灯光由冷转暖：家的方向。

### 文案编排

| Field | English | 中文 |
| --- | --- | --- |
| Eyebrow | THE CARRY | 携归 |
| Main title | **You Buy Two Bodies.** | **买下的，是两个身体。** |
| Subtitle | Paper in your bag; the soul follows, asleep until claimed. | 纸身装进包里，云魂跟着回家，认领前一直沉睡。 |
| Subtitle (mobile) | Paper in your bag; soul in tow. | 纸身入包，云魂随行。 |

**Telemetry:** `PAID & SEALED · TWO BODIES, ONE BAG` / `封签已烙 · 两个身体一同带走`

**Motion beat:** 短章（约为 02 结构章时长的 1/3）。封签烙印为唯一高光时刻，克制。

---

## 02 · 结构 Structure — Cellulose Display™（沿用现有 01）

六层材质爆炸图、三个指标、材质检查器——全部沿用现有定稿（[`script-final.md`](script-final.md) §01）。新增一句桥文案（story-bridge）：

> 01 → 02 · 你带走的东西，值得先看清它 / 承接上章：先看清纸身的六层物理结构，再谈它的另一个身体。

---

## 03 · 寻址 Interaction — Haptic Random Access（沿用现有 02）

手感寻址、书签落 P.042——全部沿用现有定稿（[`script-final.md`](script-final.md) §02）。桥文案：

> 02 → 03 · 手停在纸上，脑即将停到云端 / 承接上章：书签锚定第 042 页——纸端的锚点就位，只等一次链结。

---

## 04 · 认领 The Binding — 纸端，即云端（改写现有 03，视觉全保留）

> 全片高潮转折点。原「Neural Link」的 3D 视觉全保留，叙事语义从「展示能力」升级为**绑定仪式**。

### 3D 视觉

- 沿用：翻开 P.042 → 俯冲聚焦页边矩阵码 → 码纹荧光激活 → 纸页半透明 → 九节点知识图谱升起。
- 新增一个开头节拍：**这是本书第一次被扫**——手机镜头贴近时，矩阵码的荧光先**迟疑了一拍**（呼吸光变奏），随后才亮起，如同认出了这只手是「把它带回家的那只」。
- 新增一个结尾节拍：图谱升起后，其中「PAGE 042」根节点向书签丝带垂下一条极细的金线——**云魂认了主，链结完成**。

### 文案编排

| Field | English | 中文 |
| --- | --- | --- |
| Eyebrow | THE BINDING | 认领 |
| Main title | **Analog at Heart.** | **纸端，即云端。** |
| Subtitle | Digital in Soul. | 触感留在手里，知识延展到云端。 |
| Annotation | The first scan is a claim — this book's soul now answers to you. | 第一次扫码即认领——从此这本书的云魂只应答你。 |
| Annotation (mobile) | The first scan claims the soul. | 第一次扫码，即认领。 |
| Feature 1 title | One-code entry | 一码入网 |
| Feature 1 body | Scan the mark on the page to open its companion knowledge layer. | 扫描页边标记，打开与当前页对应的云端知识层。 |
| Feature 2 title | AI study companion | AI 伴读协议 |
| Feature 2 body | Bring explanations, references and discussion into the margin without leaving the reading flow. | 让讲解、引文与讨论自然进入页边，不打断阅读心流。 |
| Microcopy | Your page stays paper. Your context becomes connected. | 纸页仍留在手中，上下文从此彼此相连。 |

**Telemetry:** `SCAN ACTIVE · P.042 → 9 NODES · BINDING` / `第一次链结 · 第 042 页升起云端图谱`

**Motion beat:** 迟疑一拍（新增）→ 荧光激活 → 图谱升起 → 金线垂落书签（新增收束）。节点浏览器、伴读 dock 三个 tab 的交互组件全部沿用现站实现。

---

## 05 · 伴读 The Nightly Loop — 读在纸上，懂在云端（🆕）

### 3D 视觉

- 夜。台灯是唯一光源，暖光半径刚好罩住摊开的书与一盏茶。手机起初**面朝下**扣在桌角——它不是主角。
- 一只手指在第 042 页某一行停住（卡壳），镜头给纸上这行字一个特写。
- 手拿起手机，扫页边码——浮窗升起：先讲题视频小窗，再图谱缩略，再 AI 问答框；三个浮窗像**页边的延伸**，全部贴着书页边缘排布，**绝不遮挡正文**。
- 讲解完毕，手机回到桌角再次面朝下；镜头落回书页，手指继续往下读。
- 帘幕式循环图（2D 印刷层）：**卡壳 → 扫码 → 开讲 → 回纸**，首尾箭头相接成环。

### 文案编排

| Field | English | 中文 |
| --- | --- | --- |
| Eyebrow | THE NIGHTLY LOOP | 伴读循环 |
| Main title | **The Nightly Loop.** | **每晚，一个小闭环。** |
| Subtitle | Read on paper. Understand in the cloud. | 读，在纸上；懂，在云端。 |
| Loop step 1 | Stuck on a line | 卡壳在一行 |
| Loop step 2 | Look up, scan | 抬头，扫码 |
| Loop step 3 | Companion answers | 云端开讲 |
| Loop step 4 | Back to paper | 回到纸上 |
| Annotation | The ribbon remembers where your hand stopped. The app remembers where your mind did. Dual anchors, one loop. | 书签记着手停在哪一页，App 记着脑学到哪一行。双锚点，一个循环。 |
| Annotation (mobile) | Ribbon marks the page; the app marks the mind. | 书签记页，App 记学。 |

**Telemetry:** `LOOP ACTIVE · RIBBON P.042 · MIND L.07` / `伴读运行 · 书签停 042 页 · 脑到第 7 讲`

**伴读内容全家桶（D3 已拍板，云魂四件套齐上）：** 讲题视频（B3 素材复用）、音频讲解、知识图谱（`knowledge-graph.json` 复用）、AI 问答（概念 UI）。

**世界观红线提醒（见 [`worldview.md`](worldview.md) §10）：** 纸书的伴读界面不得出现整页正文阅读、推送、红点、弹窗；电子档内页只在 READ 章整页呈现。

**Motion beat:** 夜景定场 → 卡壳特写 → 扫码与浮窗升起（本章唯一 3D 高光）→ 手机扣回 → 回到纸页。节奏刻意「安静」，与 04 的高潮形成反差。

---

## R · 阅读 The Read — 电子档在手里（🆕 2026-10-28）

> 新增的钉住章节，接在 05 伴读与 06 传承之间；`data-no-phase`，3D 机位保持在 05 章，不占用关键帧。

### 视觉

- 一块钉住的暗色编辑页：左侧是带虚线选框的手机实体，右侧是页序缩略图；底部圆形箭头提示「继续下滑」。
- 手机屏幕里是这本书的电子档内页（P.042–P.045）。滚动只做一件事：翻页。没有按钮、没有分页器、没有点击。
- 每页保留书页的呼吸感：章节行、页标题、正文、一张线描插图、页脚引文与页码。

### 文案编排

| Field | English | 中文 |
| --- | --- | --- |
| Eyebrow | READ | 阅读 |
| Main title | **Every Page, in Hand.** | **书里的，每一页。** |
| Subtitle | The e-book in hand. Scroll, and the pages follow. | 电子档在手里。往下滑，页跟着走。 |
| Meta | P.042 — P.045 · E-book edition | P.042 — P.045 · 电子档 |

**Data:** `public/data/reader.json`（页面文案与插图类型）。页序锚定 P.042，与 02 寻址、03 认领的页边码保持一致。

**Motion beat:** 手机与虚线框先落位 → 页序缩略图逐张点亮 → 手机内页随滚动翻过四页 → 底部箭头持续提示。全程无点击。

---

## 06 · 传承 The Return — 书比读者活得久（🆕）

> 环的闭合点。终章镜头必须回到 00 章的第一帧构图——首尾呼应即闭环。

### 3D 视觉

- 书合拢，滑入函套；茶已凉，窗外天色微亮。
- 书回到书架——**正是 00 章空出的那个位置**。云魂微光在书脊上缓缓熄灭（解绑），书重新沉睡。
- App 界面一闪：这本书的**阅读里程**归档进读者的账户（「第 N 本 · 共读 47 夜」），然后合上。
- **最后三秒**：镜头缓缓拉远，与 00 章开场构图重合。一只新的手伸向书架——微光在另一本书脊上**再次亮起**。黑场。

### 文案编排

| Field | English | 中文 |
| --- | --- | --- |
| Eyebrow | THE RETURN | 传承 |
| Main title | **Books Outlive Their Readers.** | **书比读者活得久。** |
| Subtitle | The soul unbinds. The book forgets. The shelf waits. | 云魂解绑，书忘了你，架子在等下一位。 |
| Annotation | Your journey stays in your account, never in the book. To the next reader, this is a first encounter. | 你的阅读里程只在你自己的账户里，从不在书里。对下一位读者而言，这是一场初见。 |
| Annotation (mobile) | Your journey lives in your account — never in the book. | 阅读里程只在你的账户里，从不在书里。 |

**Telemetry:** `UNBOUND · BACK ON SHELF · 0.00W` / `解绑归架 · 恢复沉睡`

**Motion beat:** 归架 60% → 微光熄灭 + 里程归档 80% → 新的手 + 新的微光 100%。

---

## 尾声 A · 基准 Benchmark（沿用现有 04，编号降为尾声）

「另一种引擎」对照表、来源披露、免责声明——全部沿用现有定稿（[`script-final.md`](script-final.md) §04）。

## 尾声 B · 部署 Deployment（沿用现有 05，编号降为尾声）

三档版本卡、函套交付、CTA——全部沿用现有定稿（[`script-final.md`](script-final.md) §05）。CTA 语义微调候选（待议）：

| Field | English | 中文 |
| --- | --- | --- |
| CTA 候选 | Claim your edition → | 认领你的版本 → |

---

## 附录 C · 书链 The Chain — 业务附录（🆕 2026-10-27 补充）

> 只做静态阅读，不进入 3D 关键帧；`BookStage` 以 `data-no-phase` 跳过，尾声 B 机位保持。依据 [`worldview.md`](worldview.md) §7 / §7.1 / §9 Q2。

### 内容

- **公司档案**：湖州云梯科技有限公司（原杭州云梯科技有限公司），2014 年成立，总部浙江安吉，创始人 / CEO 周伟；核心产品为「教育图书读者服务平台」，定位是教育图书出版行业全产业链技术服务商。
- **核心模式**：书里植入活码 → 读者扫码获取音频、视频、课件、题库、点读书、在线答疑 → 出版商实时更新资源、直连读者、运营变现。
- **真实供给**：2,600+ 合作教育图书出版商、100 万+ 教育图书品种、27 亿+ 册读者访问、2.5 亿+ 读者；标注「书链官方口径 · 截至 2023-07」，并与未来式概念承诺分栏书写。
- **B2B → 世界观映射**：服务分四组——读者服务（图书二维码 / 电子样书 / 微官网 / 流量运营 / 读者运营）、内容制作服务（音频录音·达摩院合作 / 课件制作 / 名师讲题）、书链出版云（智能编辑器 / 学转教 / 书版转Word / 智能初排 / 题库图库 / 打标签与多格式输出）、书链通（B2B 分销）；逐条映射见 [`worldview.md`](worldview.md) §7。
- **客户**：新东方、曲一线（5·3）、万唯、荣德基、星火、绿卡、开心文化等；公开资料口径，发布前确认授权。
- **政策状态**：魂随书走（PENDING，待商务确认）；书不存储读者（LOCKED，D4）。

### 文案编排

| Field | English | 中文 |
| --- | --- | --- |
| Eyebrow | THE CHAIN | 书链 · 关于我们 |
| Main title | **The Chain Behind the Paper.** | **纸书背后，是书链。** |
| Subtitle | A full-stack technology partner for education publishing. | 教育图书出版行业的全产业链技术服务商。 |
| Annotation | A live code in every book. Resources on every scan. A direct line from publisher to reader. | 书里植入活码，读者扫码即得音视频、课件、题库与答疑；出版商实时更新，直连读者运营变现。 |
| Footnote | † Illustrative concept copy. Supply figures are Bookln official figures as of 2023-07; confirm before launch. | † 概念文案。供给数据为书链 2023-07 官方口径，发布前须确认最新数值。 |

**Telemetry:** `C · REAL NETWORK · 2,600+ PUBLISHERS · 1M+ TITLES` / `C · 真实网络 · 2,600+ 出版商 · 100 万+ 品种`

---

## 页面补充：业务与交互（2026-10-27）

- **00 停泊 · 书链馆规则卡**：可购买的图书馆、随手可取、脊码公开、出口结算、认领在家（数据：`public/data/bookln.json`）。
- **00 停泊 · 两码两义模拟器**：未认领/已认领 × 脊码/页边码 四种结果；购前扫页边码必须回落到试读层，购后第一次页边扫码才打开完整云魂（数据：`public/data/marks.json`）。
- **01 携归 · 出口结算单**：纸身「已带走 / 封签已烙」，云魂「随行沉睡 / 0.00W」，并标注魂随书走待商务确认。
- **附录 C · 书链**：真实供给数据与 B2B 映射，见上节。

---

## 并稿与校验流程

1. ✅ 世界观 Q1 拍板（2026-10-27，书链馆）→ 00/01 章分镜定稿（v0.2）。
2. ✅ 草案并入 `script-final.md`（旧 03 云链的视觉与主文案由 04 认领继承，旧字段保留至页面重排）。
3. ✅ 新增 copy fields（含 mobile 变体）写入 `docs/copy-fields.json`：`shelf / carry / binding / loop / return` 五组。
4. ✅ `node scripts/validate-copy.mjs` 通过。
5. ✅ 页面重排完成：`index.astro` 10 段结构（序幕 + 00–06 + 尾声 A/B）、`BookScene` 关键帧扩为 10 帧、章节导航与 telemetry 重编号、伴读 dock 迁入 05 章。
6. ✅ 新章节数据契约落地：`public/data/shelf.json`、`public/data/companion.json`（契约并入 [`data-contracts.md`](data-contracts.md) §7/§8）。
7. ⏳ C1–C8 资产制作与接入（书架、夜景布光、手机/App 视觉稿、试读层浮窗）——到位后替换占位机位。
