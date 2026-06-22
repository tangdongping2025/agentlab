# Skill 面板按来源分区

## 背景

claude-sdk agent 工作台的 Skill tab（`src/components/agentRuntime/SkillPanel.tsx`）展示当前 agent 可用的平台注入 skill。数据来自 `GET /api/settings/skills?cwd=<工作目录>`，后端 `discover_skills` 按固定顺序扫描 4 个目录（`backend/skills`、根 `.claude/skills`、`cwd/.claude/skills`、`cwd/skills`），每条 skill 带 `sourceType`（`platform` / `workspace`）。

## 现状与问题

SkillPanel 当前把所有 skill **平铺成一列卡片**，每张卡片贴一个"平台/工作目录"小标签。

- 来源信息以零散标签呈现，缺乏结构，skill 变多后不易快速定位。
- 每个 skill 已有"启用给龙虾 / 取消启用"按钮（`toggleSkill`），但来源未做分区，视觉上区分不出平台内置与工作目录本地。

## 目标

按 `sourceType` 分成两个区块展示，每个区块带标题与计数；保留现有单个 skill 启用/禁用能力与卡片内容；后端零改动。

## 方案

**改动范围**：仅 `src/components/agentRuntime/SkillPanel.tsx`，前端展示层重组。

**布局**：

- 两个区块，顺序固定：先"平台 Skill"，后"工作目录 Skill"。
- 每个区块标题带计数：`平台 Skill（N）` / `工作目录 Skill（N）`。
- 区块内为现有 skill 卡片（name、description、source 路径、content 预览、启用/禁用按钮），卡片内不再重复"平台/工作目录"小标签。

**分组依据**：`skill.sourceType === 'workspace'` → 工作目录区；否则 → 平台区。

**空区块文案**：

- 平台区空：`暂无平台 Skill。可放入 backend/skills 或根 .claude/skills`
- 工作目录区空且已选 cwd：`暂无工作目录 Skill。可在当前工作目录创建 .claude/skills 或 skills 目录`
- 工作目录区空且未选 cwd：`未选择工作目录`

**保留不动**：

- `toggleSkill` 启用/禁用逻辑
- 顶部说明文字
- 卡片内容字段
- `getSkillSettings(cwd)` 取数方式

## 验收

1. 混合 platform + workspace skill 时，分两组渲染，顺序为平台 → 工作目录。
2. 每组标题显示该组 skill 数量。
3. 任一组为空时显示对应空状态文案。
4. 单个 skill 的启用/禁用按钮行为与改动前一致。
5. 卡片内不再出现"平台/工作目录"小标签。
6. 新增/更新 SkillPanel 测试覆盖分组渲染与空状态。

## 不做（YAGNI）

- 不纳入 SDK/CLI 内置的 13 个 skill（code-review / verify 等），那属于另一层范围。
- 不做细粒度（按 4 个扫描目录）分区，仅 platform / workspace 两区。
- 不改后端 `discover_skills` / `sourceType` 数据结构。
- 不改 SettingsModal 的 Skill tab。
