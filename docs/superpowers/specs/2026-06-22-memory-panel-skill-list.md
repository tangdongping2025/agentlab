# 记忆透视台 skill 段展示修正

## 问题

记忆 tab 的 skill 段预览只取 `build_skill_prompt_for_agent` 结果的前 200 字符。拼装按 skill id 字母序,第一个是 buffett,所以预览框只显示 buffett 开头。实际启用给龙虾的 4 个 skill(buffett / skill-creator / nuwa-perspective / superpowers-lite,共 37001 字符)都拼进了 system prompt,但用户从预览只看到 buffett,以为"只有 buffett" → 反馈"显示的 skill 和实际不符合"。

数据本身正确(DB `skill_settings` 4 个 enabled+claude-sdk,`chars=37001`=4 个之和)。问题在 preview 截断只露第一个。

## 方案

skill 段 preview 从"拼装结果前 200 字符"改为"启用 skill 清单":每个 skill 一行,`名字 · 字符数 · 占 skill 段总字符的百分比`。`chars` 保持 = `build_skill_prompt_for_agent` 全长(反映 system prompt 实际拼入字符)。前端 SegmentCard 不变(preview 是 `<pre>` 文本)。

## 改动

- `backend/memory_preview.py`:新增 `_skill_breakdown(agent_id, cwd)` 返回 `[{id, name, chars}]`(chars 与 `build_skill_prompt_for_agent` chunk 格式 `f"\n[启用的 Skill: {name}]\n{content}\n[/Skill]\n"` 对齐);新增 `_format_skill_preview(items, total)` 生成清单文本;`build_memory_preview_response` 的 skill 段 preview 改用清单。
- `backend/tests/test_memory_preview.py`:加测试,mock `_skill_breakdown` + `build_skill_prompt_for_agent`,断言 skill 段 chars + preview 含清单各项 + 占比。

## 不做

- 不改前端 SegmentCard(preview 文本足够展示清单)。
- 不改 `skill_settings.py` 公共函数。
- 不改其他 4 段(global/task/habit/mcp)的 preview 逻辑。
