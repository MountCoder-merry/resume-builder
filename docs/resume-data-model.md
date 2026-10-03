# Resume V2 数据模型设计

## 1. 目标与边界

V2 的目标是把当前的：

```text
DOM = 数据 + UI + 存储格式
```

迁移为：

```text
ResumeDocument
    ↓
Application State
    ↓
React Components
    ↓
Resume Renderer
```

本阶段只定义领域数据契约，不迁移现有 UI，也不修改 `dist/index.html`。

未来技术栈假定为 Next.js、TypeScript 和 Tailwind CSS。类型文件不应依赖 React、浏览器 DOM、localStorage 或具体 PDF/DOCX 库。

## 2. 设计原则

### 2.1 内容和布局严格分离

`ContentModel` 描述“用户有什么经历”；`LayoutModel` 描述“这些内容如何放在页面上”。布局节点只保存稳定引用（例如 `sectionId`、`itemId` 或 `contentBlockId`），不保存最终 HTML，也不把内容复制进布局。

因此，换模板时可以重新生成布局；修改经历时可以让所有绑定该经历的节点同步更新。

### 2.2 ID 永不依赖数组位置

section、section item、页面、布局节点和内容块都有稳定 ID。数组只负责顺序，`Record` 负责实体查找。删除或排序一个项目不会导致其他项目的引用失效。

### 2.3 所有持久化数据可序列化

日期使用 ISO 字符串；模型中不出现 `HTMLElement`、函数、`File`、`Blob` 或 React 状态。这样同一份文档可以用于浏览器、本地缓存、服务端渲染和 PDF worker。

### 2.4 AI 只能产生内容变更

AI suggestion 的目标类型是 `ContentPath`，只能修改 `content.*`。布局调整必须由用户操作或显式的布局命令完成。接受 AI 建议时生成普通 `content-patch`，因此天然进入 Undo/Redo 和版本历史。

### 2.5 语言是字段属性，不是文档副本

同一份内容通过 `LocalizedContent.values[locale]` 保存中文、英文等版本。切换语言只改变 renderer 的读取 locale，不需要复制整个简历或创建第二套布局。

### 2.6 迁移优先于隐式兼容

每个文档带 `schemaVersion`。读取持久化数据后，先运行迁移链，再交给应用使用；不要在组件内部散落“如果字段不存在就猜默认值”的逻辑。

## 3. `ResumeDocument`

定义位置：[src/types/resume.ts](../src/types/resume.ts)

```ts
type ResumeDocument = {
  schemaVersion: number;
  documentId: ResumeDocumentId;
  revision: ResumeRevision;
  defaultLocale: LocaleCode;
  supportedLocales: LocaleCode[];
  metadata: DocumentMetadata;
  content: ContentModel;
  layout: LayoutModel;
  theme: ThemeModel;
};
```

它是一个**可保存的领域文档**，不是 React state，也不是渲染后的 HTML。

- `schemaVersion`：决定如何迁移旧数据。
- `documentId`：同一份简历在不同岗位版本之间保持可追踪性。
- `revision`：每次可持久化变更递增，防止自动保存覆盖较新的版本。
- `defaultLocale/supportedLocales`：支持中文、英文和未来更多语言。
- `metadata`：标题、创建时间、更新时间和岗位变体来源。
- `content`：用户事实和文字内容。
- `layout`：页面、节点和布局约束。
- `theme`：模板和视觉 token。

`ResumeDocument` 不包含 Undo/Redo 栈。历史是应用态和版本存储的职责，避免每次渲染都携带大量历史数据。

## 4. Content Model

### 4.1 `LocalizedContent`

所有面向用户的文字使用：

```ts
type LocalizedContent = {
  defaultLocale: string;
  values: Record<string, string>;
  sourceByLocale?: Record<string, ContentSource>;
};
```

`sourceByLocale` 用于区分用户原文、文件导入和 AI 改写，便于显示差异、恢复原文和审计 AI 行为。

### 4.2 `ProfileContent`

保存姓名、求职标题、简介、联系方式、链接和头像引用。联系方式是数组而不是拼接后的 HTML，因此模板可以决定它们的顺序、图标和显示方式。

### 4.3 Section 联合类型

`ResumeSection` 是按 `type` 区分的联合类型：

- `experience`
- `education`
- `projects`
- `skills`
- `certifications`
- `languages`
- `custom`

每个 section 都有稳定 `id`、本地化 `title`、`visible` 和语义顺序。实体存于 `items`，顺序存于 `itemOrder`。

这样可以做到：

- 拖动模块只改变顺序或布局引用。
- 修改一个经历只修改一个 item。
- 模板可以隐藏某个 section，而不删除事实数据。
- 自定义 section 不需要修改核心联合类型。

### 4.4 内容不保存 HTML

段落、标题、列表使用纯文本 `LocalizedContent`。如果以后需要富文本，应增加受限的结构化 mark 模型，而不是直接允许任意 HTML。

## 5. Layout Model

`LayoutModel` 描述渲染所需要的页面和节点：

```ts
type LayoutModel = {
  mode: "flow" | "freeform";
  templateId: string;
  pageOrder: PageId[];
  pages: Record<string, PageModel>;
  nodes: Record<string, LayoutNode>;
  snap: SnapSettings;
};
```

### 5.1 Flow 与 Freeform

- `flow`：模板控制纵向排版，内容增加时自动重新计算高度。
- `freeform`：用户可移动和调整节点，节点使用毫米单位的 `RectMm`。

两种模式共享同一套内容引用，不会产生两份简历文字。

### 5.2 LayoutNode

节点类型包括：

- `section`：渲染整个 section
- `section-item`：渲染单个经历/项目/教育条目
- `text`：绑定 profile 字段或自定义内容块
- `image`：引用资产
- `divider`
- `shape`

节点包含：

- `pageId`
- `bounds`（x、y、width、height，单位 mm）
- `rotationDeg`
- `zIndex`
- `locked/visible`
- `style`

节点不存最终文字，只存 `ContentBinding`。因此 AI 修改内容不会破坏坐标、尺寸和层级。

### 5.3 为什么使用毫米而不是像素

简历最终需要 A4/Letter PDF。毫米是打印尺寸的稳定单位，避免浏览器缩放、设备像素比和 CSS transform 导致导出偏差。编辑器可以在运行时把毫米转换为 CSS 像素。

## 6. Page Model

`PageModel` 是 `LayoutModel.pages` 的实体：

```ts
type PageModel = {
  id: PageId;
  size: PageSize;
  margins: InsetsMm;
  background: PageBackground;
  nodeOrder: LayoutNodeId[];
  allowOverflow: boolean;
};
```

- `size` 支持 A4、Letter、Legal 和自定义尺寸。
- `margins` 负责打印安全区。
- `nodeOrder` 提供同页内稳定的渲染和层级顺序。
- `allowOverflow` 明确是否允许设计型元素越过安全区；默认应为 `false`。

页面顺序由 `LayoutModel.pageOrder` 管理。新增、删除和排序页面不会改变其他页面 ID。

## 7. Theme Model

`ThemeModel` 把模板和用户视觉设置分开：

```ts
type ThemeModel = {
  id: string;
  templateId: string;
  version: number;
  palette: ColorPalette;
  typography: TypographyTheme;
  spacingUnitMm: number;
  radiusMm: number;
  atsFriendly: boolean;
  userOverrides: ...;
};
```

- `templateId` 选择模板布局规则。
- `version` 防止模板升级后旧布局无法解释。
- `palette/typography` 是 token，不是散落在组件里的颜色字符串。
- `userOverrides` 只记录用户覆盖，不复制整套模板默认值。
- `atsFriendly` 允许产品明确提示模板适用场景。

模板切换时，只替换 `layout.templateId` 和必要的模板布局；`ContentModel` 保持不变。无法映射的自定义节点应进入迁移/警告流程，而不是静默删除。

## 8. Version Model 与 Undo/Redo

### 8.1 Undo/Redo

`HistoryState` 保存 `past` 和 `future`。每个 `HistoryEntry` 包含：

- 执行命令
- 逆向命令
- 前后 revision
- 时间和可选标签

命令分为：

- `content-patch`
- `layout-patch`
- `theme-patch`
- `page-patch`

未来可以使用 Immer patches 或 JSON Patch 实现，但 React 组件不应直接修改对象后再猜测差异。

### 8.2 VersionModel

`VersionModel` 是可展示、可恢复的持久版本；它与短期 Undo 栈不同。

版本来源包括：

- `autosave`
- `manual`
- `import`
- `ai-suggestion`
- `job-variant`

每个版本保存完整的 `ResumeDocumentSnapshot`，并记录父版本和变更摘要。生产环境可以进一步改成“定期完整快照 + patch 日志”，但对 MVP 来说完整快照更容易恢复和排查。

## 9. 多岗位版本与多语言

岗位版本通过 `DocumentMetadata.variantOf` 和 `jobTarget` 表达。一个岗位版本是一个独立的 `ResumeDocument`，但可以追溯到基础文档和某个 revision。

推荐流程：

1. 基础简历保持事实数据。
2. 创建岗位变体时 fork 当前 `ResumeDocument`。
3. 只在变体中修改排序、强调内容和 AI 润色结果。
4. 基础简历后续更新时，提供“同步未冲突字段”的显式操作。

不要用一个全局 `isJobVersion` 布尔值覆盖所有版本，也不要把不同岗位的内容直接混在一个 section 数组里。

多语言通过 `LocalizedContent` 完成。布局节点只绑定字段，不绑定某个语言的最终字符串；renderer 根据 `activeLocale` 选择值，缺失时回退到 `defaultLocale`。

## 10. ImportResult Model

导入不能直接覆盖 `ResumeDocument`。它先产生 `ImportResult`：

```text
文件/粘贴内容
  → 文本提取
  → 字段候选与置信度
  → 用户逐项确认
  → content-patch
  → ResumeDocument
```

`ImportResult` 保存：

- 原始来源和文件信息
- 状态：提取中、待确认、已接受、失败
- 检测语言
- 可选的原始文本
- 每个字段候选值、置信度和证据片段
- 警告与错误

因此 PDF/DOCX 解析器可以更换，确认界面也不会和解析器耦合。导入失败时不会破坏用户现有简历。

## 11. AI 修改边界

AI API 层应返回 `AiContentSuggestion[]`，而不是返回 HTML 或整个文档：

```text
target: content.sections.experience.items.item-1.bullets.0
original: "负责..."
proposed: "主导..."
rationale: "使用结果导向动词"
```

用户接受后，应用为 `content-patch`；拒绝则只更新 suggestion 状态。AI 不得直接写入：

- `layout.nodes.*`
- `layout.pages.*`
- `theme`
- 页面坐标和尺寸

## 12. Application State 与 React 边界

`ResumeApplicationState` 是编辑器运行态，包含：

- 多份文档和当前文档 ID
- 每份文档的 Undo/Redo
- 可恢复版本
- 导入会话
- AI 建议
- 当前语言、页码、选中节点、缩放等 UI 状态

React 组件建议只通过 actions/commands 修改 state：

```text
Inspector / Canvas interaction
  → dispatch(ResumeCommand)
  → reducer / command handler
  → new ResumeDocument + HistoryEntry
  → React re-render
  → ResumeRenderer
```

`ResumeRenderer` 只读 `ResumeDocument + activeLocale`，不负责保存、不负责调用 AI、不负责解析文件。

## 13. 迁移策略

定义 `ResumeMigration` 链：

```text
v1 → v2 → v3 → current
```

迁移入口应位于 persistence service：

1. 读取未知 JSON。
2. 校验最小 envelope。
3. 根据 `schemaVersion` 依次迁移。
4. 迁移失败则保留原始备份并显示恢复提示。
5. 只有迁移成功后才放入 Application State。

当前 `dist/index.html` 的 HTML 快照不能直接作为 V2 核心数据。迁移工具需要一次性解析旧 DOM，提取 profile、sections 和初始布局；解析不确定的字段进入 `ImportResult`，由用户确认。

## 14. 从当前原型迁移的建议顺序

1. 新建 `src/types/resume.ts`，先固定契约。
2. 新建纯函数 `createEmptyResumeDocument()`。
3. 新建 reducer/command handler，先支持内容编辑、模块排序和主题切换。
4. 新建 `ResumeRenderer`，让模板从结构化数据渲染。
5. 将 localStorage 改为保存 JSON document，而不是 HTML。
6. 增加 schema validator 和 migration runner。
7. 再迁移自由布局、多页、导入和 AI。
8. 最后迁移 Next.js 路由、账号和云端存储。

## 15. 关键不变量

- 任何 section、item、page、node 都有稳定 ID。
- 核心状态中没有 HTML 字符串作为内容来源。
- AI patch 只能命中 `content.*` 路径。
- renderer 不改变 document。
- 删除布局节点不会删除内容实体。
- 删除内容实体前必须处理其布局引用。
- 切换模板不会删除 `ContentModel`。
- 所有持久化数据带 schema version。
- Undo 和 Redo 都能产生可逆的 command。
- 导入结果必须经过用户确认才能写入正式文档。

## 16. 类型索引：每个类型解决什么问题

下面按 `src/types/resume.ts` 的出现顺序说明类型职责。类型名称是契约的一部分，后续实现不应为了方便把它们重新合并成一个 `any` 或 HTML 字符串。

### 基础类型与 ID

| 类型 | 设计理由 |
|---|---|
| `CURRENT_RESUME_SCHEMA_VERSION` | 提供创建新文档时的唯一当前版本常量，避免各处手写数字。 |
| `ResumeSchemaVersion` | 允许迁移链处理多个历史版本，而不是只支持一个固定字面量。 |
| `ISODateTime` | 明确持久化日期是可序列化的 ISO 字符串，不把运行时 `Date` 放进文档。 |
| `LocaleCode` | 支持 `zh-CN`、`en-US` 及未来自定义语言，不把语言集合锁死在 UI。 |
| `Brand<T, Name>` | 给字符串/数字 ID 增加编译期区分，避免把 `PageId` 误传成 `SectionId`。 |
| `ResumeDocumentId` | 标识一份简历文档及其岗位变体来源。 |
| `ResumeRevision` | 标识文档修改代次，用于并发保存、历史和冲突检测。 |
| `SectionId` | 稳定引用一个语义 section。 |
| `SectionItemId` | 稳定引用一条经历、教育、项目或技能。 |
| `ContentBlockId` | 稳定引用自定义文本块。 |
| `LayoutNodeId` | 稳定引用画布上的视觉节点。 |
| `PageId` | 稳定引用页面，页面排序不依赖数组下标。 |
| `AssetId` | 让图片、头像和背景被内容/布局共同引用，而不复制二进制数据。 |
| `VersionId` | 区分 Undo 历史条目和可恢复的持久版本。 |
| `ImportResultId` | 将一次文件导入会话与用户确认流程关联起来。 |
| `SuggestionId` | 跟踪一个 AI 建议的接受、拒绝和审计状态。 |

### 本地化与通用内容

| 类型 | 设计理由 |
|---|---|
| `LocalizedText` | 同一字段承载多语言值，并指定缺失翻译时的回退语言。只允许纯文本。 |
| `ContentSource` | 记录字段来自用户、导入、AI 还是模板，支持差异对比和溯源。 |
| `LocalizedContent` | 把本地化文字与每种语言的来源信息组合起来，作为事实内容的标准字段类型。 |
| `DateRange` | 统一工作、教育、项目和证书的起止时间，并支持“至今”和自定义展示文本。 |
| `Link` | 把链接从显示文字中分离，模板可以决定显示 URL、图标或隐藏。 |
| `AssetRef` | 只保存资源引用及可访问性/尺寸元数据，避免把文件对象塞进领域状态。 |
| `ContactPoint` | 将邮箱、电话、地点和社交链接建模为可排序、可隐藏的项目，而不是拼成一段 HTML。 |

### Content Model 类型

| 类型 | 设计理由 |
|---|---|
| `ProfileContent` | 归纳个人信息，模板可以绑定姓名、标题、简介或联系方式的不同布局。 |
| `ExperienceItem` | 保存一条工作经历的事实、时间、成果 bullet 和链接。 |
| `EducationItem` | 保存学校、学位、专业和教育时间，和工作经历共享日期模型但不混淆语义。 |
| `ProjectItem` | 保存项目名称、职责、描述、成果和链接，允许项目没有固定时间。 |
| `SkillItem` | 保存技能名称、熟练度和 ATS 关键词，视觉上的技能条由 renderer 决定。 |
| `CertificationItem` | 保存证书发行方、有效期和凭证 URL，方便过期提示。 |
| `LanguageItem` | 保存语言与熟练度，避免把语言能力误建模为普通技能。 |
| `CustomContentBlock` | 为用户自定义区块提供受限的段落/标题/列表/引用结构，不开放任意 HTML。 |
| `SectionBase` | 统一所有 section 的 ID、标题、可见性和语义项目顺序。它是内部基础类型，不直接作为 UI 数据使用。 |
| `ExperienceSection` | 以 discriminant `type: "experience"` 约束 items 为工作经历。 |
| `EducationSection` | 以 discriminant 约束 items 为教育经历，让 reducer 和 renderer 可穷举处理。 |
| `ProjectSection` | 以 discriminant 约束 items 为项目经历。 |
| `SkillsSection` | 以 discriminant 约束 items 为技能，不把技能等级混进布局样式。 |
| `CertificationSection` | 以 discriminant 约束 items 为证书。 |
| `LanguagesSection` | 以 discriminant 约束 items 为语言能力。 |
| `CustomSection` | 用 block order 支持未知类型的自定义区块，同时保持稳定 ID。 |
| `ResumeSection` | 所有 section 的联合类型；它是 reducer、导入映射和 renderer 的统一入口。 |
| `ContentModel` | 汇总 profile、section 实体、语义 section 顺序和资产索引，是文档的事实内容层。 |

### 页面与布局类型

| 类型 | 设计理由 |
|---|---|
| `PagePreset` | 用有限枚举表达标准纸张，同时保留 `CUSTOM`。 |
| `PageOrientation` | 将横向/纵向作为页面属性，而不是散落在模板 CSS 中。 |
| `PageSize` | 以 mm 保存实际纸张尺寸，保证浏览器预览和 PDF 输出可对齐。 |
| `InsetsMm` | 统一页边距、内边距和打印安全区的数据表达。 |
| `RectMm` | 统一自由布局节点的坐标和尺寸。 |
| `LayoutMode` | 明确当前使用模板流式排版还是用户自由布局。 |
| `ContentBinding` | 让布局节点引用内容路径而不是复制内容，从根上保持内容/布局分离。 |
| `NodeStyle` | 保存 token 引用和局部排版覆盖，不把最终 CSS 字符串持久化。 |
| `LayoutNodeBase` | 统一节点的页面、边界、层级、锁定和可见性字段。 |
| `SectionLayoutNode` | 将一个 section 映射为可移动视觉模块。 |
| `SectionItemLayoutNode` | 允许用户只移动某条经历或项目，而不是整个 section。 |
| `TextLayoutNode` | 将 profile 字段或自定义内容块放入自由画布。 |
| `ImageLayoutNode` | 通过 `AssetId` 放置图片，并明确 contain/cover 行为。 |
| `DividerLayoutNode` | 把分隔线建模为无内容的视觉节点。 |
| `ShapeLayoutNode` | 为设计型模板提供受控形状，不引入任意 SVG/HTML。 |
| `LayoutNode` | 所有可渲染节点的联合类型，供 renderer 和布局 reducer 穷举。 |
| `PageBackground` | 页面背景可以引用主题色或资源，但不与节点内容混合。 |
| `PageModel` | 保存单页尺寸、边距、背景和节点顺序，是多页渲染的最小单位。 |
| `SnapSettings` | 将网格、辅助线和吸附参数从交互组件中抽出来，便于持久化和测试。 |
| `LayoutModel` | 汇总模板、页面、节点和自由布局设置，是独立于内容的布局层。 |

### 主题类型

| 类型 | 设计理由 |
|---|---|
| `ColorPalette` | 用语义颜色 token 代替组件中的硬编码颜色。 |
| `TypographyTheme` | 统一字体、基础字号和比例，便于模板切换与打印校验。 |
| `ThemeModel` | 保存模板身份、版本、视觉 token、ATS 属性和用户覆盖；换主题不会改写内容。 |

### 文档、岗位和应用态类型

| 类型 | 设计理由 |
|---|---|
| `JobTarget` | 保存岗位标题、公司、JD 和关键词，供匹配和岗位变体说明使用。 |
| `DocumentMetadata` | 保存时间、标题和变体来源，不把业务元信息塞进内容 section。 |
| `ResumeDocument` | V2 的可持久化根对象，组合内容、布局和主题，但不包含 UI 临时状态。 |
| `ResumeDocumentSnapshot` | 明确版本快照是完整文档，不是 HTML；未来可替换为压缩快照而不影响调用方。 |
| `ResumeApplicationState` | 组合多文档、当前文档、历史、版本、导入、建议和 UI 状态，供 React store 使用。 |
| `EditorUiState` | 保存当前语言、页面、选中节点、缩放和待处理任务；刷新文档不应污染领域数据。 |

### 命令、历史与版本类型

| 类型 | 设计理由 |
|---|---|
| `JsonPatchOperation` | 用可序列化的 add/remove/replace/move 表达最小变更，支持逆向操作。 |
| `ContentPath` | 对 AI 和内容命令限制目标范围，防止 AI 误写布局和主题。 |
| `ResumeCommand` | 统一内容、布局、主题和页面修改入口，React 组件不直接变异文档。 |
| `HistoryEntry` | 保存正向/逆向命令以及 revision，构成可测试的 Undo/Redo 单元。 |
| `HistoryState` | 保存 past/future 栈和上限，避免历史无限增长。 |
| `VersionKind` | 区分自动保存、手动保存、导入、AI 和岗位变体版本。 |
| `VersionModel` | 保存可展示、可恢复的完整文档版本、父版本和变更摘要。 |

### 导入与 AI 类型

| 类型 | 设计理由 |
|---|---|
| `ImportSource` | 抽象 PDF、DOCX、TXT、图片和粘贴入口，解析器可以替换。 |
| `ImportCandidateTarget` | 把解析结果指向结构化字段或 section item，而不是直接写 DOM。 |
| `ImportCandidate` | 保存候选值、置信度、证据和用户确认状态，保证导入可审阅。 |
| `ImportResult` | 表示一次完整导入会话；失败或低置信度时不会污染正式文档。 |
| `AiContentSuggestion` | 表示一个可接受/拒绝的内容改写建议，保留原文、提案、理由和证据。 |
| `ResumeMigration` | 定义 schema 版本之间的显式迁移函数，避免组件各自猜测旧字段。 |
