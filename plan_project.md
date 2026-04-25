# Project 模块方案与 Workbench 插件解耦重构

## 1. Project 产品方案

### 1.1 定位

- `Project` 作为第一方模块插件设计。
- `Project` 不作为普通文章类型。
- `Project` 不直接写死在核心壳层中。
- 当前阶段只写方案和完成 Workbench 解耦基础, 不直接实现 Project 功能。

### 1.2 存储边界

- 在 workspace 下新增独立的 `projects/` 区域, 与现有 `content/` 分离。
- 每个项目使用 `projects/<projectId>/` 目录存储。
- 每个项目目录至少包含:
  - `project.json`
  - `tasks/`
  - `logs/`
  - `resources/`

### 1.3 项目总体信息

`project.json` 保存项目总体信息:

- `id`
- `title`
- `status`
- `goal`
- `startDate`
- `targetDate`
- `createdAt`
- `updatedAt`

约束:

- `startDate` 在创建项目时默认写入当前日期。
- `createdAt` 和 `updatedAt` 由系统自动维护。
- 这些字段不要求用户手填。

### 1.4 任务模型

- 每个任务保存为 `tasks/<taskId>.md`。
- 任务使用 `YAML frontmatter + Markdown 正文` 形式。
- 任务字段至少包含:
  - `id`
  - `title`
  - `status`
  - `order`
  - `startDate`
  - `dueDate`
  - `createdAt`
  - `updatedAt`
- 任务详情页采用 `结构化头部 + Monaco 增强 Markdown 编辑器正文` 的形式。

### 1.5 日志模型

- 日志采用双层模式。
- 底层每条事件独立保存为 `logs/<eventId>.md`。
- 每个事件文件使用 `YAML frontmatter + Markdown 正文`。
- frontmatter 至少包含:
  - `id`
  - `type`
  - `taskIds`
  - `occurredAt`
  - `createdAt`
  - `updatedAt`
- 上层统一用事件流视图聚合展示。
- 事件流中编辑长文本时复用当前增强版 Monaco 编辑器, 保持着色, snippets, 粘贴图片, 光标体验一致。

### 1.6 资料模型

- 资料存放在 `resources/` 下。
- 每条资料由系统自动分配 `resourceId`。
- 资料类型支持:
  - 网页存档
  - 教材
  - 笔记
  - 文件
- `resourceIds` 不作为人工维护字段暴露给用户。
- 资料关联由导入动作和正文中的资源引用自动生成并索引。

### 1.7 界面结构

- `Project` 的主入口是工作台中的独立模块区域。
- 当前主界面固定包含:
  - `Overview`
  - `Tasks`
  - `Log`
  - `Resources`
  - `Stats`
- 任务是项目主线。
- `Tasks` 的第一版只做列表视图。
- 点击任务后在主工作区标签页中打开任务详情。
- `Log` 使用事件流样式, 不按普通笔记页面设计。

### 1.8 统计与后续能力

- `Stats` 只做派生统计:
  - 任务总数
  - 已完成数量
  - 近期活动数
- `专注功能` 作为 `Phase 2` 预留能力, 本轮不进入 v1。

## 2. Workbench 插件解耦方案

### 2.1 核心壳层职责

本轮只重构 `admin` 端 Workbench 壳层, 不同步重做 `server` 和 `site` 的模块边界。

核心只保留这些职责:

- 布局
- Activity Bar
- Pane Host
- Tab Host
- Command Palette
- 通用打开/保存生命周期
- 全局 busy/error
- 登录后的工作区启动加载

核心不再保留具体插件的渲染分支, 尤其不再直接写死:

- `git`
- `media`
- `outline`
- `theme`

### 2.2 Pane Contribution

- 引入 `pane contribution`, 作为插件提供小窗格的统一方式。
- 每个 pane 至少声明:
  - `paneId`
  - `title`
  - `tabLabel`
  - `component`
  - `defaultGroupId`
- Activity Bar 不再直接对应固定视图枚举, 而是承载 pane group。
- 插件 pane 声明自己默认挂到哪个 group。
- 本轮先完成:
  - 可扩展的 pane host
  - 默认挂载机制
- `pane` 拖动与布局持久化只预留架构, 不在本轮实现。

### 2.3 Editor Contribution

- 原先的 `document type contribution` 改为 `editor contribution`。
- `editor contribution` 表示一种编辑器类型, 而不是一种文件种类。
- 每个 editor 至少声明:
  - `editorId`
  - `label`
  - `component`
  - `canHandle`
  - `matches`
  - `load`
  - `save`
  - `isDirty`
- editor 既可以处理文件型文档, 也可以处理虚拟文档。

### 2.4 Editor Associations

- 新增一个 JSON 配置文件用于设置 `文件扩展名/路径模式 -> 默认 editor`。
- 当前配置文件路径约定为:
  - `config/editor/editor.associations.json`
- 提供 `Reopen With Editor` 命令, 允许当前标签页使用其他 editor 重新打开。

### 2.5 Monaco 编辑器抽象

- 从当前文章编辑器中抽出共享的 Monaco 增强壳层。
- 共享壳层至少承担:
  - Monaco 通用配置
  - 语言和路径挂载
  - snippets 兼容
  - 粘贴图片兼容
  - 光标状态保持相关基础能力
- 文章, 任务, 日志事件等长文本区域都复用这套编辑器壳层。

## 3. 现有插件迁移目标

- `media` 从“注册一个 viewId + 宿主自己渲染”迁移为真正的 pane 插件。
- `git` 同上。
- `outline` 同上。
- Theme 管理不再依赖核心里的专门分支, 改为插件提供的 Theme pane, 默认挂在 `Edit` group。
- `commands`, `editor actions`, `paste handlers`, `home widgets`, `themes`, `create dialog fields` 继续走插件机制, 但统一收敛到新的宿主接口上。
- `App.tsx` 最终只负责宿主编排和通用调度, 不再承载插件自己的大段 UI 和状态机。

## 4. 实现边界

- 本轮不实现真正的 Project 数据模型和 Project UI。
- 本轮优先完成:
  - `plan_project.md`
  - pane contribution 基础
  - editor contribution 基础
  - editor associations 配置
  - `Reopen With Editor`
  - 现有插件解耦迁移

## 5. 验收要求

- 解耦后必须保持现有行为可用:
  - 登录
  - 内容树加载
  - 文章打开与保存
  - Markdown 预览
  - 命令面板
  - snippet 扩展
  - 剪贴板图片上传
  - 媒体库
  - Git 面板
  - Outline 面板
  - Theme 入口
  - Home Widget
  - 创建对话框元数据字段
- 增加针对 pane/editor 注册与调度的测试。
- 验证必须包含 `npm run dev` 和 Playwright 实机检查, 不能只看 build 或单元测试。
