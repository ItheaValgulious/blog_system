# Project 模块方案与 Workbench 插件解耦重构

## 1. Project 产品方案

### 1.1 定位

- `Project` 作为第一方模块插件设计。
- `Project` 不作为普通文章类型。
- `Project` 不直接写死在核心壳层中。

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
