# O:\any_skills Skill 逐行审阅版融合方案

> **已被 v4 取代**：最新方案见 `docs/unified-canvas-studio-skill-fusion-v4.md`。v4 不再把 skill 融合停留在单个 skill/preset 层面，而是按 Methodology、Canvas Studio Engines、Render/Export Runtime、Review、ToolRuntime 分层重构。

> 已有更深入的 v3 方案：`docs/skill-deep-fusion-v3.md`。v3 不再以“Skill Registry + active skill 注入”为主线，而是把 skill 编译成 Pinocchio 内生的 MethodologyKernel、ArtifactEngines、ReviewEngine 和 ToolRuntime。

日期：2026-05-08
目标项目：Pinocchio
来源目录：`O:\any_skills`
输出版本：v2，按正文内容重审，重点重估 `qiushi-skill-main`

## 1. 这次重审后的核心结论

| 结论 | 判断 |
|---|---|
| `name` 能不能去重 | 不能。`name` 只能做入口名，同名不代表内容相同 |
| 全库规模 | 153 个 `SKILL.md`，约 27062 行正文 |
| 唯一 `name` | 137 个 |
| 唯一内容哈希 | 152 个 |
| 真正完全重复 | 只有 1 组：`impeccable` 的 `.claude` 与 `plugin` 两份 |
| 最大判断修正 | `qiushi-skill-main` 不应放在 P2 低频参考，应升为 P0 方法论内核 |
| 最优融合方式 | `Qiushi 方法论层` + `Skill Registry 能力层` + `Artifact/Tool Runtime 执行层` |
| 不建议的做法 | 把 153 个正文全量塞进 system prompt；会造成上下文膨胀、规则冲突、资源路径失效 |

一句话判断：
**Qiushi 负责让 Agent 会“想问题”和“推进任务”；Open Design / html-ppt / HyperFrames / AMap / taste / impeccable 负责让 Agent 会“产出东西”和“把东西做好”。这两类不应互相替代，而应分层融合。**

## 2. 审阅事实与边界

这次不是按 `name` 粗分类。我按 UTF-8 逐行读取了每个 `SKILL.md`，提取了 frontmatter、行数、SHA-256、标题结构、触发条件、流程段、输出约束、资源目录和同名差异；其中 `qiushi-skill-main` 的 11 个 `SKILL.md`、`commands/`、`original-texts.md`、agent prompt、reference guide、hook 入口都单独逐行复核。

| 套件 | `SKILL.md` 数 | 正文行数 | 重审重点 |
|---|---:|---:|---|
| `open-design-main` | 74 | 9347 | Artifact、HTML 原型、deck preset、media contract、design/craft 机制 |
| `taste-skill-main` | 12 | 5464 | 高端视觉、图片生成、image-to-code、brandkit、anti-slop |
| `skills-main` | 17 | 2808 | pnpm、Vitest、Turborepo、Vue/Vite 生态参考 |
| `impeccable-main` | 14 | 2520 | 同名多平台 UI polish skill，13 个唯一内容哈希 |
| `hyperframes-main` | 13 | 2144 | HTML 视频、渲染 CLI、TTS、字幕、动画 adapter |
| `qiushi-skill-main` | 11 | 1774 | 一整套方法论系统，必须升格 |
| `ui-ux-pro-max-skill-main` | 7 | 1860 | UI/UX 数据库、品牌、banner、design system、slides |
| `khazix-skills-main` | 3 | 897 | 研究写作、横纵分析、知识整理 |
| `html-ppt-skill-main` | 1 | 223 | 完整 HTML PPT runtime 和模板目录 |
| `amap-skill-main` | 1 | 25 | 高德地图 API 工具型 skill |

## 3. 分类总览

| 大类 | 套件 / 代表 skill | 项目中应该扮演的角色 | 优先级 |
|---|---|---|---|
| 方法论 / 思想武器 | `qiushi-skill-main` | Agent 的任务思考、调查、矛盾分析、验证、复盘、阶段推进框架 | P0 |
| Artifact / Canvas 原型 | Open Design `web-prototype`、`dashboard`、`mobile-app` | 生成可预览 HTML app / 页面 / 文档 / 工作台界面 | P0 |
| PPT / Deck | `html-ppt-skill-main`、Open Design deck presets | 生成 HTML PPT、演讲者模式、小红书图文、导出链路 | P1 |
| UI 质量 / Polish | `impeccable`、Open Design `critique`、taste design skills | 设计审查、anti-slop、视觉高级化、可访问性和交互状态 | P1 |
| 图片 / 品牌资产 | taste `imagegen-*`、`brandkit`、Open Design `image-poster` | 图片先行、品牌板、海报、social carousel | P1 |
| 工具调用 | `amap` | 注册成真实 ToolDefinition，而不是纯提示词 | P1 |
| 视频 / 动画 | HyperFrames、Open Design `video-shortform` | 独立 media workspace，后接渲染/预览 | P2 |
| 工程栈知识 | `pnpm`、`vitest`、`turborepo`、部分 `vite` | Coding mode 辅助提示，按项目技术栈选择启用 | P2 |
| 写作 / 研究风格 | Khazix、Qiushi workflows | 显式选择，不污染默认口吻 | P2 |

## 4. Qiushi 重新定级：从“参考包”升为“思想武器层”

### 4.1 为什么它重要

| 观察 | 具体内容 | 对项目价值 |
|---|---|---|
| 它不是单一 prompt | `arming-thought` 是总入口，`workflows` 是编排层，9 个方法论 skill 是工具层 | 可作为 Agent 行为内核 |
| 它有完整认识闭环 | 调查研究 → 矛盾分析 → 实践验证 → 群众反馈 → 自我批评 | 解决“AI 急着答、答完不验、验完不复盘”的问题 |
| 它有阶段推进方法 | 持久战略、集中兵力、星火燎原、统筹兼顾 | 适合长期复杂项目、MVP、路线图和攻坚任务 |
| 它有可执行输出契约 | 每个 skill 都规定输出表、终止条件、禁止事项 | 很适合转成项目内 methodology templates |
| 它已有平台安装设计 | Codex 安装说明、commands、hooks、validate CLI | 可迁移，但不应照搬 hook 注入方式 |

### 4.2 Qiushi 全套 skill 表

| Skill | 方法论定位 | 触发场景 | 强制输出 / 行为 | 项目映射 |
|---|---|---|---|---|
| `arming-thought` | 总原则 + 路由器 | 每次顶层对话开始，建立实事求是原则 | 先看事实、再判断；只在明确有用时调用下游 skill | `PromptManager` 的 core discipline，可做轻量常驻 |
| `investigation-first` | 调查研究 | 信息不足、要下判断、领域陌生、需要摸清现状 | 先输出调查目的、调查清单、事实/约束/未知项，再给结论 | 替换现有 `investigation_report` 的占位实现 |
| `contradiction-analysis` | 矛盾分析法 | 多因素冲突、优先级不明、根因不清 | 输出矛盾清单、主要矛盾、矛盾性质、处理方向、转化风险 | Thinking / planning / architecture review 的核心分析框架 |
| `practice-cognition` | 实践认识论 | 有方案/假说需要验证或迭代 | 标记感性认识、理性认识、实践验证、总结升华阶段；定义终止条件 | Coding 验证、Canvas 迭代、方案试验 |
| `mass-line` | 群众路线 | 需要多源反馈、用户意见、测试结果、日志、代码惯例综合 | 收集 → 系统化 → 返回 → 检验 → 再收集 | `feedback_synthesis`、review loop、需求整合 |
| `criticism-self-criticism` | 批评与自我批评 | 完成工作、阶段验收、收到反馈、反复犯错 | 工作审视报告：目标、完成情况、问题表、好处、下次关注 | `AutoReviewService` 强化版 |
| `protracted-strategy` | 持久战略 | 长期任务、复杂目标、短期不能速胜 | 判断战略防御/相持/反攻阶段，给出阶段任务和转折条件 | Roadmap、长期计划、项目阶段 UI |
| `concentrate-forces` | 集中兵力 | 多任务争夺资源，必须选主攻 | 优先级矩阵、唯一主攻目标、暂缓任务、完成信号 | `priority_matrix` 强化版 |
| `spark-prairie-fire` | 星火燎原 | 从零开始、资源少、需要 MVP / 根据地 | 客观条件评估、根据地选择、三步发展路线、流寇主义检查 | 新能力 bootstrap、MVP 计划 |
| `overall-planning` | 统筹兼顾 | 多目标 trade-off，优化一项会伤另一项 | 辩证关系全景图、平衡点、系统影响、失衡预警 | 架构取舍、产品路线、性能/质量/速度平衡 |
| `workflows` | 跨 skill 编排 | 单一方法不够，需要组合 | 三条标准工作流：新项目启动、复杂问题攻坚、方案迭代优化 | Plan mode 的 workflow engine |

### 4.3 Qiushi 支撑文件

| 支撑文件 | 功能 | 融合价值 |
|---|---|---|
| `commands/*.md` | 每个方法论的 slash command 入口和输出要求 | 可转成 UI “方法按钮”或 prompt template |
| `original-texts.md` | 每个方法论的出处依据 | 不默认注入模型；放详情页或文档引用 |
| `contradiction-types-reference.md` | 工程场景矛盾类型速查 | 可直接做矛盾分析帮助表 |
| `review-checklist.md` | 完整性、正确性、方法论、质量四维检查 | 可并入 AutoReview / PR review |
| `phase-assessment-guide.md` | 防御/相持/反攻阶段判断指标 | 可并入 Plan phase picker |
| `investigation-agent-prompt.md` | 调查研究 agent prompt | 可作为 multi-pass Investigator 模板 |
| `contradiction-mapper-prompt.md` | 矛盾映射 agent prompt | 可作为 multi-pass ContradictionMapper 模板 |
| `feedback-synthesizer-prompt.md` | 反馈综合 agent prompt | 可作为 FeedbackSynthesizer 模板 |
| `agents/self-critic.md` | 自我批评审查 subagent | 可强化 AutoReviewService |
| `hooks/session-start.ps1` | 会话开始自动注入 `arming-thought` | 思路可借鉴，但项目内应用应走 `PromptManager`，不走外部 hook |

### 4.4 Qiushi 与当前项目已有方法论的对应关系

| 当前项目模块 | 现状 | Qiushi 对应 | 建议 |
|---|---|---|---|
| `coreDisciplines.ts` | 已有“无事实不判断、未验证不完成” | `arming-thought` + `investigation-first` | 保留现有中性表达，补强调查清单和结论格式 |
| `workflow.ts` | 只有 `new_project/troubleshooting/iteration` 和 `explore/focus/expand` | `workflows` + `protracted-strategy` | 扩成明确的三条 workflow + 三阶段策略 |
| `priorityMatrix.ts` | 关键词打分，较粗 | `concentrate-forces` | 增加影响/难度/依赖/完成信号/暂缓理由 |
| `methodologyTools.ts` | `investigation_report` 返回占位文本 | `investigation-first` | 改成真实结构化调查模板 |
| `MultiPassCoordinator` | 固定 5 个角色，但内容很薄 | Qiushi 的 investigation / contradiction / feedback prompts | 每个 role 使用对应 prompt 和输出契约 |
| `AutoReviewService` | 有固定复盘结构 | `criticism-self-criticism` + `review-checklist` | 增加问题分级、根因、改进建议、下次关注 |
| `PlanMethodologyControls.tsx` | 有计划类型、阶段、主攻目标 UI | Qiushi workflow + phase guide | UI 文案可升级为“方法论面板” |

### 4.5 Qiushi 融合原则

| 原则 | 说明 |
|---|---|
| 方法论保留，政治化符号降噪 | 内部文档可保留 Qiushi 来源；模型工具名、API 名使用中性英文，避免触发无关联想 |
| `arming-thought` 轻量常驻 | 只常驻“事实优先、验证优先、承认未知、遇阻探因”，不全量注入 11 个正文 |
| 下游方法按需注入 | 用户要方案/调研/复盘/攻坚时才注入对应 skill body 或压缩模板 |
| 保留原文依据但不默认注入 | `original-texts.md` 适合详情页、审计来源，不适合每轮 prompt |
| Workflows 优先于单点 skill | 新项目、疑难攻坚、迭代优化三条链路最适合产品化 |

## 5. 各套 skill 明细

### 5.1 AMap

| Skill | 路径 | 功能 | 取舍 |
|---|---|---|---|
| `amap` | `amap-skill-main/skills/amap/SKILL.md` | 地理编码、逆地理编码、IP 定位、天气、路线规划、距离测量、POI 查询；依赖 `references/command-map.md` 和脚本 | 保留，转成 `ToolDefinition`，需要 `AMAP_MAPS_API_KEY` |

### 5.2 html-ppt 独立套件

| Skill | 功能 | 资源 | 取舍 |
|---|---|---|---|
| `html-ppt` | HTML PPT Studio，支持主题、布局、CSS 动画、canvas FX、键盘导航、演讲者模式、逐字稿、小红书图文、PNG 导出 | `assets/`、`templates/`、`references/`、`scripts/` | 作为 Deck Engine canonical，Open Design deck skills 做 presets |

### 5.3 HyperFrames

| Skill | 功能 | 取舍 |
|---|---|---|
| `hyperframes` | HTML video composition 主技能，覆盖场景、字幕、音频、转场、设计系统、输出检查 | 保留为视频 canonical |
| `hyperframes-cli` | `npx hyperframes init/lint/inspect/preview/render/doctor` | 保留为 runtime 命令层 |
| `hyperframes-media` | TTS、Whisper 转写、去背景、字幕链路 | 实验性启用，依赖模型下载 |
| `hyperframes-registry` | 安装和接线 blocks/components | 视频能力成熟后启用 |
| `website-to-hyperframes` | 网站捕获并转视频脚本/分镜/旁白 | 保留为 URL→视频专用入口 |
| `remotion-to-hyperframes` | Remotion 迁移到 HyperFrames | 低频，仅显式迁移时使用 |
| `gsap` | HyperFrames 内 GSAP deterministic timeline 规则 | 保留为 adapter |
| `animejs` | Anime.js deterministic adapter | 保留为 adapter |
| `css-animations` | CSS keyframes seek-safe 规则 | 保留为 adapter |
| `waapi` | Web Animations API seek-safe 规则 | 保留为 adapter |
| `lottie` | lottie-web / dotLottie adapter | 保留为 adapter |
| `three` | Three.js / WebGL deterministic scene | 保留为 adapter |
| `tailwind` | Tailwind v4 browser runtime for HyperFrames | 仅 HyperFrames 项目启用 |

### 5.4 impeccable

`impeccable-main` 是同名多平台适配，不是 14 份完全一样。应选 canonical，再抽取平台差异。

| 路径 | 行数 | 内容哈希前缀 | 处理 |
|---|---:|---|---|
| `.agents/skills/impeccable/SKILL.md` | 176 | `F6A77113C482` | 平台适配参考 |
| `.claude/skills/impeccable/SKILL.md` | 182 | `455780E3D23A` | 与 `plugin` 完全相同 |
| `.cursor/skills/impeccable/SKILL.md` | 178 | `586708EAA508` | 平台适配参考 |
| `.gemini/skills/impeccable/SKILL.md` | 177 | `4BD383E6D472` | 平台适配参考 |
| `.github/skills/impeccable/SKILL.md` | 180 | `1645F0F1AC09` | 平台适配参考 |
| `.kiro/skills/impeccable/SKILL.md` | 178 | `18B8FB3A7D4A` | 平台适配参考 |
| `.opencode/skills/impeccable/SKILL.md` | 182 | `62C75614CB9C` | 平台适配参考 |
| `.pi/skills/impeccable/SKILL.md` | 180 | `7AA291490B5B` | 平台适配参考 |
| `.qoder/skills/impeccable/SKILL.md` | 182 | `01C388F04460` | 平台适配参考 |
| `.rovodev/skills/impeccable/SKILL.md` | 182 | `468DC8FB0E6C` | 平台适配参考 |
| `.trae/skills/impeccable/SKILL.md` | 180 | `E0DBA477742A` | 平台适配参考 |
| `.trae-cn/skills/impeccable/SKILL.md` | 180 | `012E2E9F2A30` | 平台适配参考 |
| `plugin/skills/impeccable/SKILL.md` | 182 | `455780E3D23A` | exact duplicate，可不展示 |
| `skill/SKILL.md` | 181 | `B590BD8B023A` | canonical 候选 |

| 能力 | 具体内容 | 项目落点 |
|---|---|---|
| UI 设计审查 | 颜色、主题、层级、布局、交互、可访问性、性能、响应式、空状态、i18n | Canvas / app preview 的 Review 按钮 |
| 设计改造 | bland→bold，loud→quiet，视觉 polish，micro-interactions | Web prototype / dashboard 输出后自审 |
| 设计系统 | tokens、theme、组件边界 | Design System Picker |

### 5.5 Khazix

| Skill | 功能 | 取舍 |
|---|---|---|
| `hv-analysis` | 横纵分析法深度研究，强调联网信息收集、时间线、横向对比、纵向演化 | 保留为研究模式高级 preset |
| `khazix-writer` | 卡兹克公众号长文写作，强个人风格，强调真实经历、选题判断、人味 | 仅用户显式选择，不默认污染写作 |
| `neat-freak` | 知识库洁癖：盘点、分类、变更影响矩阵、整理规范 | 适合文档库/知识库治理 |

### 5.6 Qiushi

已在第 4 节详述。这里给最终取舍：

| 处理项 | 决策 |
|---|---|
| 整套套件优先级 | P0 |
| 是否作为默认 prompt 全量注入 | 否 |
| 是否保留为项目方法论内核 | 是 |
| 是否保留原 skill 名和原文 | 源文件和文档保留；模型工具名/API 名用中性名 |
| 首批落地 | `arming-thought` 摘要、`investigation-first`、`contradiction-analysis`、`concentrate-forces`、`practice-cognition`、`criticism-self-criticism`、`workflows` |

### 5.7 skills-main

| Skill | 功能 | 项目适配 |
|---|---|---|
| `pnpm` | pnpm workspace、catalog、patch、override | 保留，项目使用 pnpm |
| `vitest` | Vitest 测试、mock、coverage、fixture | 保留，项目使用 Vitest |
| `turborepo` | Turborepo task、cache、package task 规则 | 保留参考，但项目目前脚本未使用 turbo |
| `tsdown` | TypeScript library bundler | 低频，库打包时启用 |
| `vite` | Vite 配置、插件、SSR、library build | 项目主要 Next，但 Vitest/Vite 相关可保留 |
| `slidev` | Markdown + Vue developer deck | 与 html-ppt 重叠，只保留给技术演示 |
| `antfu` | Anthony Fu 风格工程规范 | 参考，不默认启用 |
| `unocss` | UnoCSS 原子 CSS | 当前不启用 |
| `vitepress` | 文档站生成 | 低频保留 |
| `vue` | Vue 3 Composition API | 当前项目非 Vue，默认禁用 |
| `nuxt` | Nuxt full-stack Vue | 默认禁用 |
| `pinia` | Vue state management | 默认禁用 |
| `vue-best-practices` | Vue 任务强约束 | 默认禁用，仅 Vue 任务启用 |
| `vue-router-best-practices` | Vue Router | 默认禁用 |
| `vue-testing-best-practices` | Vue 测试 | 默认禁用 |
| `vueuse-functions` | VueUse composables | 默认禁用 |
| `web-design-guidelines` | Web UI review | 与 impeccable / critique 合并 |

### 5.8 taste-skill

| Skill | 功能 | 取舍 |
|---|---|---|
| `brandkit` | 高端品牌板、logo 系统、identity deck、视觉世界 | 保留，品牌资产主力 |
| `imagegen-frontend-web` | 每个 landing section 单独生成横图，强调可复刻 | 保留，Web 图片生成主力 |
| `imagegen-frontend-mobile` | 移动 app screen / flow 图片生成 | 保留，移动端概念图主力 |
| `image-to-code` | 图片先行，再分析，再实现网站 | 保留，但依赖 image generation 能力 |
| `redesign-existing-projects` | 现有站点高级化 redesign | 与 impeccable polish 合并 |
| `design-taste-frontend` | 高 agency frontend 设计工程规则 | 提炼为设计质量规则 |
| `high-end-visual-design` | 高端视觉规则、anti-pattern、motion | 作为风格 preset |
| `minimalist-ui` | Editorial minimalist UI | 风格 preset |
| `industrial-brutalist-ui` | Swiss industrial / tactical telemetry UI | 风格 preset |
| `gpt-taste` | Awwwards 级页面结构和 GSAP 规则 | 高风险强风格，显式启用 |
| `stitch-design-taste` | 生成 DESIGN.md 语义设计系统 | 保留，接 Design System Picker |
| `full-output-enforcement` | 禁止省略、占位、截断 | 可合并到长输出策略，不作为独立用户 skill |

### 5.9 UI/UX Pro Max

| Skill | 功能 | 取舍 |
|---|---|---|
| `ui-ux-pro-max` | 50+ styles、161 palettes、57 font pairings、UX guidelines、charts、多栈规则 | 大型参考库，按需查询，不默认注入 |
| `ckm:ui-styling` | shadcn/ui、Tailwind、accessibility、canvas design | 与项目 Next/Tailwind 接近，保留参考 |
| `ckm:design-system` | tokens、component specs、slides token compliance | 与 Design System Picker 合并 |
| `ckm:design` | logo、CIP、slides、banner、icon、social photos | 拆成品牌/图片/slide 参考，不做主入口 |
| `ckm:brand` | brand voice、visual identity、messaging | 与 taste `brandkit` 合并 |
| `ckm:banner-design` | 多尺寸 banner、社媒/广告/网站 hero | 与 Open Design `image-poster`、taste imagegen 合并 |
| `ckm:slides` | HTML presentation + Chart.js | 不做主流程，保留 Chart.js 和 copywriting 参考 |

### 5.10 Open Design

#### Web / App / Document / Connector 类

| Skill | 功能 | 取舍 |
|---|---|---|
| `web-prototype` | 通用单页 HTML 原型，seed + layouts + self-check | P0，Web 原型主入口 |
| `web-prototype-taste-brutalist` | 工业印刷 / brutalist Web 风格 preset | 保留为风格 preset |
| `web-prototype-taste-editorial` | editorial minimalist Web 风格 preset | 保留为风格 preset |
| `web-prototype-taste-soft` | Apple-tier soft premium Web 风格 preset | 保留为风格 preset |
| `saas-landing` | SaaS landing 正式 skill | 保留，与 `web-prototype` 合并成 landing preset |
| `saas-landing` example | skill 作者示例，与正式版内容不同 | 不作为用户入口，保留为开发参考 |
| `open-design-landing` | Open Design landing，含图片策略和可选 Astro mirror | 保留，适合品牌 landing |
| `kami-landing` | Kami 风格 landing | 保留为高质量模板 |
| `dashboard` | 仪表盘原型 | P0，项目场景高度贴合 |
| `live-dashboard` | 可刷新 / live artifact dashboard | 保留，需先解决 sandbox 和数据刷新 |
| `flowai-live-dashboard-template` | FlowAI 风格 dashboard 模板 | 保留为 dashboard preset |
| `social-media-dashboard` | 社媒数据 dashboard | 保留为 dashboard preset |
| `pricing-page` | 定价页 | 保留 |
| `waitlist-page` | waitlist 页面，带 hardened template 和 quality gates | 保留 |
| `docs-page` | 文档页 | 保留 |
| `blog-post` | 博客文章页面 | 保留 |
| `digital-eguide` | 电子指南 | 保留 |
| `finance-report` | 财务报告 | 保留 |
| `eng-runbook` | 工程 runbook | 保留 |
| `pm-spec` | 产品规格文档 | 保留 |
| `team-okrs` | OKR 文档 | 保留 |
| `weekly-update` | 周报 deck / 文档 | 保留 |
| `meeting-notes` | 会议纪要 | 保留 |
| `invoice` | 发票 / 账单 | 保留 |
| `hr-onboarding` | HR 入职材料 | 保留 |
| `email-marketing` | 营销邮件 | 保留 |
| `kanban-board` | 看板 UI | 保留 |
| `mobile-app` | 移动 app 原型 | 保留 |
| `mobile-onboarding` | 移动 onboarding | 保留 |
| `gamified-app` | 游戏化 app | 低频保留 |
| `dating-web` | 约会类网页 | 低频保留 |
| `wireframe-sketch` | 线框草图 | 保留为早期方案表达 |
| `orbit-general` | Orbit connector 通用界面 | 保留为连接器 UI 参考 |
| `orbit-github` | GitHub connector artifact | 低频保留 |
| `orbit-gmail` | Gmail connector artifact | 低频保留 |
| `orbit-linear` | Linear connector artifact | 低频保留 |
| `orbit-notion` | Notion connector artifact | 低频保留 |

#### Deck / PPT 类

| Skill | 功能 | 取舍 |
|---|---|---|
| `html-ppt` | Open Design 版 HTML PPT Studio | 保留为 registry 入口，engine 用独立 html-ppt |
| `simple-deck` | 简洁 deck seed | 保留 |
| `magazine-web-ppt` | 电子杂志 × e-ink 横向网页 PPT | 保留，高质量模板 |
| `kami-deck` | Kami 纸感 deck | 保留 |
| `replit-deck` | Replit 风格 deck | 保留 |
| `open-design-landing-deck` | landing deck，支持 imagery / Astro 相关流 | 保留 |
| `html-ppt-course-module` | 课程 / workshop module deck | 保留 |
| `html-ppt-tech-sharing` | 技术分享 deck | 保留，常用 |
| `html-ppt-product-launch` | 产品发布 deck | 保留 |
| `html-ppt-pitch-deck` | 融资 / pitch deck | 保留 |
| `html-ppt-weekly-report` | 周报 deck | 保留 |
| `html-ppt-testing-safety-alert` | 测试 / 安全警报 deck | 保留 |
| `html-ppt-presenter-mode` | 演讲者模式 deck | 合并到 html-ppt presenter mode |
| `html-ppt-dir-key-nav-minimal` | 8 色极简方向键 keynote | 保留 preset |
| `html-ppt-graphify-dark-graph` | 暗底知识图谱 deck | 保留 preset |
| `html-ppt-hermes-cyber-terminal` | 赛博终端测评 deck | 保留 preset |
| `html-ppt-knowledge-arch-blueprint` | 奶油蓝图架构 deck | 保留 preset |
| `html-ppt-obsidian-claude-gradient` | GitHub 暗紫渐变 deck | 保留 preset |
| `html-ppt-taste-brutalist` | taste brutalist deck | 保留 preset |
| `html-ppt-taste-editorial` | taste editorial deck | 保留 preset |
| `html-ppt-xhs-post` | 小红书 / Instagram 竖版图文 | 保留，和 social-carousel 合并 |
| `html-ppt-xhs-pastel-card` | 马卡龙小红书卡片 | 保留 preset |
| `html-ppt-xhs-white-editorial` | 白底杂志风小红书 / PPT | 保留 preset |
| `pptx-html-fidelity-audit` | HTML deck → python-pptx 导出一致性审计 | 保留，接导出链路 |

#### Media / Utility / Design 类

| Skill | 功能 | 取舍 |
|---|---|---|
| `design-brief` | I-Lang / 自然语言设计 brief 到 design-system | P0，接 Design System Picker |
| `critique` | 5 维度专家评审 HTML 报告 | 与 impeccable / Qiushi review 合并 |
| `tweaks` | 参数化变体面板：accent、scale、density、radius 等 | 保留，适合 Canvas 微调 |
| `live-artifact` | live artifact 资源和契约 | 实验性 |
| `image-poster` | 图片海报 prompt + media contract | 与 taste imagegen 合并 |
| `magazine-poster` | 杂志海报 | 保留 |
| `social-carousel` | 社交 carousel | 保留 |
| `video-shortform` | 短视频 prompt + media contract | 保留为视频场景 |
| `hyperframes` | Open Design 版 HyperFrames，含隐藏缓存 slot 和 OD scaffold | 与 HyperFrames main 合并，Open Design 版做集成桥 |
| `motion-frames` | 动效帧 | 低频保留 |
| `audio-jingle` | 音频 jingle prompt + media contract | 实验性 |
| `hatch-pet` | Codex pet spritesheet 生成、修复、验证、打包 | 低频但完整，保留 |
| `sprite-animation` | sprite animation | 低频保留 |

## 6. 重合 skill 取舍表

### 6.1 方法论重合

| 重合组 | 候选 | 采用哪个 | 不采用 / 合并哪个 | 理由 |
|---|---|---|---|---|
| 总原则 | Qiushi `arming-thought`、现有 `coreDisciplines` | 现有中性纪律 + Qiushi 结构 | 不全量注入 `arming-thought` | 常驻 prompt 要短；Qiushi 负责结构和路由 |
| 调查 | Qiushi `investigation-first`、现有 `investigation_report` | Qiushi | 替换现有占位 tool 输出 | Qiushi 有调查目的、提纲、事实/推断/存疑格式 |
| 矛盾分析 | Qiushi `contradiction-analysis`、现有 thinking prompt | Qiushi | 现有 prompt 保留为摘要 | Qiushi 有主次、性质、转化风险、输出表 |
| 优先级 | Qiushi `concentrate-forces`、现有 `priority_matrix` | Qiushi 逻辑 | 现有关键词矩阵升级 | 需要唯一主攻、完成信号、暂缓理由 |
| 复盘 | Qiushi `criticism-self-criticism`、现有 `AutoReviewService`、impeccable critique | Qiushi + AutoReview | impeccable 只管 UI 质量 | Qiushi 覆盖方法论和过程质量 |
| 多源反馈 | Qiushi `mass-line`、现有 `feedback_synthesis` | Qiushi | 现有 coordinator 内容升级 | 群众路线在 AI 语境中可映射为多源事实 |

### 6.2 PPT / Deck 重合

| 重合组 | 候选 | 采用哪个 | 不采用 / 合并哪个 | 理由 |
|---|---|---|---|---|
| PPT engine | `html-ppt-skill-main/html-ppt`、Open Design `html-ppt` | 独立 `html-ppt-skill-main` | Open Design 版做 registry 入口 | 独立仓库资源完整，Open Design 版更像集成版 |
| Deck presets | Open Design `html-ppt-*`、`simple-deck`、`kami-deck`、`replit-deck` | 全部保留为 preset | 不做独立 engine | 场景丰富，适合模板库 |
| Developer deck | `slidev`、`html-ppt` | 默认 `html-ppt` | `slidev` 只在用户要 Markdown/Vue deck 时启用 | html-ppt 更适合 Canvas 和导出 |
| 泛 slides | `ckm:slides`、`html-ppt` | `html-ppt` | `ckm:slides` 只保留 Chart.js/copywriting 参考 | runtime 完整度不同 |

### 6.3 UI / Design 重合

| 重合组 | 候选 | 采用哪个 | 不采用 / 合并哪个 | 理由 |
|---|---|---|---|---|
| UI polish | `impeccable`、Open Design `critique`、`web-design-guidelines`、taste redesign | `impeccable` canonical + Qiushi review | 其他合并为 checklist | impeccable 覆盖 UI 面最广，Qiushi 补过程复盘 |
| 高级视觉 | taste `design-taste-frontend`、`high-end-visual-design`、Open Design taste presets | taste 做规则源，Open Design 做 preset | 不默认注入强风格 | 避免所有界面都变成同一种“高级感” |
| Design system | Open Design `design-brief`、taste `stitch-design-taste`、`ckm:design-system` | Open Design + taste | ckm 做参考库 | Open Design 更贴 artifact，taste 更强视觉语义 |

### 6.4 图片 / 品牌 / Social 重合

| 重合组 | 候选 | 采用哪个 | 不采用 / 合并哪个 | 理由 |
|---|---|---|---|---|
| Web 设计图 | taste `imagegen-frontend-web`、Open Design `image-poster` | taste imagegen | Open Design 做 artifact 场景 | taste 对 section image 和可实现性约束更强 |
| Mobile 设计图 | taste `imagegen-frontend-mobile`、Open Design `mobile-app` | 两者都保留 | 不合并 | 一个生成图，一个生成 HTML 原型 |
| Brand kit | taste `brandkit`、`ckm:brand`、`ckm:design` | taste `brandkit` | ckm 拆为参考 | brandkit 更专注品牌板和视觉世界 |
| Social carousel | Open Design `social-carousel`、`html-ppt-xhs-*`、`ckm:banner-design` | Open Design + html-ppt | ckm 做尺寸/平台参考 | Open Design 更贴 Canvas 输出 |

### 6.5 视频 / 动画重合

| 重合组 | 候选 | 采用哪个 | 不采用 / 合并哪个 | 理由 |
|---|---|---|---|---|
| Video engine | HyperFrames main `hyperframes`、Open Design `hyperframes` | HyperFrames main | Open Design 版做 OD scaffold 集成桥 | main 是通用规范，OD 版是具体集成 |
| 短视频场景 | `video-shortform`、`website-to-hyperframes` | 都保留 | 不合并 | 一个从 brief 出发，一个从网站捕获出发 |
| 动画 adapter | GSAP、Anime.js、WAAPI、CSS、Lottie、Three | 全保留 | 按技术栈触发 | adapter 是互补关系 |

### 6.6 工程栈重合

| 重合组 | 候选 | 采用哪个 | 不采用 / 合并哪个 | 理由 |
|---|---|---|---|---|
| 包管理 | `pnpm`、`antfu` | `pnpm` | antfu 做风格参考 | 项目使用 pnpm |
| 测试 | `vitest`、Vue testing | `vitest` | Vue testing 默认禁用 | 项目是 Vitest，但不是 Vue |
| 构建 | `vite`、`tsdown`、`turborepo` | 按任务启用 | 不常驻 | 当前 Next + package build，不是统一 Vite app |
| Vue 生态 | vue/nuxt/pinia/vueuse | 默认禁用 | 用户指定 Vue 时启用 | 与当前项目栈不匹配 |

## 7. 推荐融合架构

### 7.1 三层模型

| 层 | 职责 | 代表输入 | 代表输出 |
|---|---|---|---|
| Qiushi 方法论层 | 决定怎么调查、分析、验证、复盘、推进 | 用户任务、项目状态、历史上下文 | workflow、phase、主攻目标、调查提纲、复盘报告 |
| Skill Registry 能力层 | 决定调用哪套 skill / preset / reference | 用户意图、Canvas kind、active skill | active skill body、resources、design system、prompt fragments |
| Artifact / Tool Runtime 层 | 真正生成和执行产物 | HTML/PPT/video/map/tool request | Canvas、Artifact、tool result、media workspace |

### 7.2 新增 / 改造模块建议

| 模块 | 文件建议 | 职责 |
|---|---|---|
| Skill 类型 | `packages/shared/src/skill.ts` | `SkillSummary`、`SkillDetail`、`SkillSource`、`SkillMode`、`SkillActivation` |
| Registry | `packages/core/src/skills/skillRegistry.ts` | 扫描 `SKILL.md`、解析 frontmatter、计算 hash、建立 canonical 映射 |
| Skill 资源 | `packages/core/src/skills/skillAssets.ts` | 解析 `assets/`、`references/`、`scripts/`，提供只读 staging |
| Skill 推荐 | `packages/core/src/skills/skillRecommender.ts` | 基于意图、Canvas kind、关键词推荐 1-3 个 skill |
| Qiushi 模板 | `packages/core/src/methodology/qiushiTemplates.ts` | 把 Qiushi 11 个方法转成中性 template |
| Workflow 引擎 | `packages/core/src/methodology/workflow.ts` | 从现有 3 类 workflow 升级到 Qiushi 三条链路 |
| Prompt 注入 | `packages/core/src/core/promptManager.ts` | 注入 active skill、Qiushi template、design system |
| API | `apps/web/app/api/skills/*` | `list/detail/activate/recommend/assets` |
| UI | `apps/web/components/workbench/SkillLibraryPanel.tsx` | 技能库、分类、详情、启停、canonical 标记 |
| Composer | `Composer.tsx` | active skill pill、方法论模式入口 |
| Canvas | `CanvasRenderer.tsx` / `PptCanvasViewer.tsx` | 支持 `appHtml`、`deckHtml`、`videoWorkspace` |

### 7.3 数据模型建议

| 字段 | 类型 | 说明 |
|---|---|---|
| `id` | string | 稳定 ID，建议 `suite/name/hashPrefix` |
| `name` | string | frontmatter `name` |
| `canonicalId` | string | 同名或重合技能的 canonical |
| `sourceSuite` | string | 来源套件 |
| `path` | string | 服务端绝对路径，不下发模型 |
| `contentHash` | string | SHA-256 |
| `lineCount` | number | 正文行数 |
| `mode` | enum | `methodology/prototype/deck/image/video/tool/design/engineering/writing` |
| `surface` | enum | `text/html/ppt/image/video/audio/tool` |
| `priority` | enum | `P0/P1/P2/disabled` |
| `activation` | enum | `always-light/explicit/recommended/experimental/disabled` |
| `hasAssets` | boolean | 是否有资源目录 |
| `hasReferences` | boolean | 是否有 references |
| `requiresTool` | boolean | 是否需要真实工具 |
| `risk` | string[] | sandbox、network、model download、style pollution 等 |

## 8. Prompt 注入策略

| 内容 | 默认策略 | 原因 |
|---|---|---|
| Qiushi core discipline 摘要 | 常驻轻量注入 | 事实优先、验证优先是全局纪律 |
| Qiushi 下游方法 | 按 workflow / 用户意图注入 | 避免 11 个正文全量膨胀 |
| Active skill body | 用户显式选择或推荐后确认 | 避免误触发 |
| Design system | 只在 UI / artifact / deck / image 任务注入 | 非视觉任务不需要 |
| References | 默认不全量注入，按需读取 | 控 token |
| Large assets/templates | 不进 prompt，走 staging 或 API | 资源文件不能靠模型记忆 |
| 重合 skill | 只注入 canonical，保留来源和 hash | 避免同名冲突，也避免误删差异 |

## 9. 分阶段落地计划

| 阶段 | 目标 | 任务 | 验收 |
|---|---|---|---|
| Phase 0 | 建立真实 inventory | 扫描 153 个 `SKILL.md`，记录 hash、行数、套件、canonical、优先级 | UI / JSON 能看到所有 skill，不按 name 误删 |
| Phase 1 | Qiushi 方法论内核 | 用 Qiushi 改造 `coreDisciplines`、`workflow`、`priorityMatrix`、`AutoReviewService`、`methodologyTools` | 计划输出能体现调查、主要矛盾、主攻目标、验证和复盘 |
| Phase 2 | Skill Registry MVP | API list/detail/recommend，Composer active skill pill | 用户可选择 `web-prototype` 或 `html-ppt` 并影响回答 |
| Phase 3 | Open Design 原型 | 接入 `web-prototype`、`dashboard`、`pricing-page`、`mobile-app` | Canvas 可生成 HTML 原型并预览 |
| Phase 4 | Deck Engine | 接入 html-ppt engine、Open Design presets、presenter mode | Canvas kind `ppt` 可键盘导航 |
| Phase 5 | AMap Tool | 将 AMap 脚本改成 core tools | 模型能真实调用地图查询 |
| Phase 6 | UI polish loop | impeccable + Open Design critique + Qiushi 自我批评 | 生成后自动/手动审查，有结构化报告 |
| Phase 7 | Image / Brand | taste imagegen、brandkit、Open Design poster/social | 图片和品牌资产进入独立 media pipeline |
| Phase 8 | HyperFrames | video workspace、CLI、preview/render、media preprocessing | 可生成并预览视频 composition |

## 10. 首批建议启用清单

| 优先级 | Skill / 能力 | 来源 | 为什么 |
|---|---|---|---|
| P0 | Qiushi core methodology | `qiushi-skill-main` | 直接提升 Agent 思考和推进质量 |
| P0 | `web-prototype` | Open Design | 最贴当前 Canvas HTML 输出 |
| P0 | `dashboard` | Open Design | 与 AI Workbench 场景接近 |
| P0 | `design-brief` | Open Design | 连接设计系统和视觉输出 |
| P0 | `critique` | Open Design | 与 review / polish 闭环匹配 |
| P1 | `html-ppt` | html-ppt 独立套件 | PPT 能力完整，用户价值明显 |
| P1 | `impeccable` canonical | impeccable | UI polish 覆盖面广 |
| P1 | `imagegen-frontend-web` | taste | 高质量网页设计图 |
| P1 | `brandkit` | taste | 品牌资产能力 |
| P1 | `amap` | amap | 工具型能力边界清晰 |
| P2 | `hyperframes` | HyperFrames | 视频能力价值高，但 runtime 更复杂 |
| P2 | `pnpm` / `vitest` / `turborepo` | skills-main | 工程辅助，按 coding 任务启用 |

## 11. 首批不建议默认启用

| Skill / 套件 | 原因 | 处理 |
|---|---|---|
| Vue/Nuxt/Pinia/Vueuse 系列 | 当前项目不是 Vue 栈 | 禁用，用户指定 Vue 时启用 |
| `khazix-writer` | 个人风格强，容易污染默认写作 | 显式选择 |
| `gpt-taste` | 风格强、GSAP heavy，容易过度设计 | 显式高创意任务启用 |
| `hyperframes-media` | 依赖模型下载，失败面大 | experimental |
| `ckm:design` 全量 | 内容大且与 taste/Open Design 重叠 | 拆成参考库 |
| `plugin/skills/impeccable` | 与 `.claude` exact duplicate | 不展示为独立 skill |
| Open Design `saas-landing` example | 是作者示例，不是正式用户入口 | 开发参考 |

## 12. 最终形态

| 能力 | 最终形态 |
|---|---|
| 思想武器 | Qiushi 驱动的 methodology engine，常驻轻量原则，按需注入下游方法 |
| Skill 管理 | Registry 支持扫描、hash、canonical、启停、详情、资源索引 |
| Prompt 组合 | `base + Qiushi light + mode + active skill + design system + references` |
| Web 原型 | Open Design prototype skills 做主入口，taste 做风格 preset |
| PPT | html-ppt 做 engine，Open Design deck skills 做 presets |
| UI 审查 | impeccable + Open Design critique + Qiushi self-criticism |
| 图片品牌 | taste imagegen / brandkit 做主力，Open Design 做 artifact 形态 |
| 工具调用 | AMap 改成 ToolRouter 工具 |
| 视频 | HyperFrames main 做 engine，Open Design hyperframes 做集成桥 |
| 工程辅助 | pnpm/vitest/turborepo 按 coding 任务启用 |

## 13. 最小可行实现建议

如果只做第一版，我建议先做这 6 件事：

| 顺序 | 要做的事 | 成功标志 |
|---:|---|---|
| 1 | 新增 Skill Registry inventory，不按 `name` 去重，记录 hash 和 canonical | 能列出 153 个文件、137 个 name、152 个 hash |
| 2 | 将 Qiushi 的 6 个核心方法转成中性 methodology templates | Plan / chat 输出有调查、矛盾、主攻、验证、复盘结构 |
| 3 | 替换 `methodologyTools.ts` 的占位输出 | `investigation_report` 不再返回固定假文本 |
| 4 | Composer 增加 active skill pill 和推荐入口 | 用户可手动启用 `web-prototype` / `html-ppt` |
| 5 | 接入 Open Design `web-prototype` 和 `dashboard` | Canvas 能生成可预览 HTML 原型 |
| 6 | 接入 html-ppt engine 的受控 sandbox | `ppt` Canvas 能运行键盘导航和 presenter mode |

这版里，Qiushi 应该先落地。它不是锦上添花，而是后面所有 skill 不乱用、不滥用、不互相打架的总调度思想。
