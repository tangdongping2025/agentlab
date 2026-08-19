# 测试债清偿:前端套件恢复全绿

> 2026-08-19。目标:清偿前端测试债,让 TDD 守门能力复活——此后套件红 = 新问题,一眼可见。

## 现状(2026-08-19 实测)

`npx vitest run`:41 文件 / 371 测试,**8 文件失败 / 17 测试失败 / 354 通过**。常红套件导致新失败被淹没,守门失效。

## 根因分类

| 类别 | 失败项 | 根因 |
|---|---|---|
| A 孤儿测试 | sceneService.test.ts、ToolInteractionDetails.test.tsx、ChatInteraction.test.tsx(8 个) | 生产代码已删除(sceneService/ToolInteractionDetails)或零引用(ChatInteraction.tsx 孤儿组件) |
| B mock 过时 | YuanbaoWarmTheme.test.tsx(4)、App.test.tsx(1) | 生产新增 dbApi.fetchWorkspaceSettings,mock 未跟上;App 恢复会话的 fetch mock 端点与现端点(messages?limit=12 / message-index)不匹配 |
| C 断言过时 | appStore.test.ts(1,断言已删除的 xueqiu-search)、MessageBubble.test.tsx(1,组件走 mobile-compact 渲染分支)、DetailModal.test.tsx(2,关闭按钮可达性标记与 backdrop testid 已变) | 组件/store 改版,测试断言未跟上;无生产 bug 证据 |

## 方案(分批清偿,每批独立 commit)

### 批 1:删孤儿
- 删 3 个测试文件:`__tests__/services/sceneService.test.ts`、`__tests__/components/ToolInteractionDetails.test.tsx`、`__tests__/components/ChatInteraction.test.tsx`
- 删孤儿组件 `src/components/ChatInteraction.tsx`(693 行,删除前再验一次生产零引用)

### 批 2:逐文件修 9 个失败(按文件分组 commit)
- `appStore.test.ts`:断言从 xueqiu-search 改为现役工具(anysearch)
- `YuanbaoWarmTheme.test.tsx`:mock 补 dbApi.fetchWorkspaceSettings
- `App.test.tsx`:fetch mock 对齐现端点
- `MessageBubble.test.tsx`:按源码改查询方式(重新生成按钮在 mobile-compact 分支下的渲染)
- `DetailModal.test.tsx`:按源码改查询方式;若组件确实丢失关闭可达性标记则补标记(修组件)

修复原则:**逐个先诊断再改**——测试跟不上改版就改测试;组件真丢了关键行为才修组件。

### 批 3:终验
- `npx vitest run` → 0 failed
- `npm run typecheck` 通过(删 ChatInteraction.tsx 后无悬空 import)
- 后端 pytest 与修复前对照无新增失败

## 验收标准

1. 前端 vitest 全绿
2. typecheck 通过
3. 后端无新增失败

## 非目标

- 不加 CI/git hook 门禁(已确认 YAGNI)
- 不动后端测试(仅对照)
- 不重构测试结构、不提升覆盖率
