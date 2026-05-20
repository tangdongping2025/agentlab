# RQ-018 全局字体大小调整 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将所有 inline fontSize 值统一 +2px，28px 保持不变，使界面文字更清晰易读。

**Architecture:** 纯像素值替换，每个组件文件独立修改，按文件分批执行。不引入 CSS 变量或设计令牌。

**Tech Stack:** React + TypeScript，inline styles

---

### 替换映射表

| 旧值 | 新值 |
|------|------|
| `'9px'` | `'11px'` |
| `'10px'` | `'12px'` |
| `'11px'` | `'13px'` |
| `'12px'` | `'14px'` |
| `'13px'` | `'15px'` |
| `'14px'` | `'16px'` |
| `'15px'` | `'17px'` |
| `'16px'` | `'18px'` |
| `'18px'` | `'20px'` |
| `'28px'` | `'28px'` (不变) |

---

### Task 1: 修改 App.tsx

**Files:**
- Modify: `context-lab/src/App.tsx`

- [ ] **Step 1: 替换 fontSize 值**

3 处替换：
- 行 107: `'14px'` → `'16px'`
- 行 112: `'11px'` → `'13px'`
- 行 120: `'11px'` → `'13px'`

- [ ] **Step 2: 验证构建**

Run: `cd context-lab && npm run build 2>&1 | tail -5`
Expected: `✓ built in`

---

### Task 2: 修改 BottomPanel.tsx

**Files:**
- Modify: `context-lab/src/components/BottomPanel.tsx`

- [ ] **Step 1: 替换 fontSize 值**

9 处替换：
- 行 67: `'10px'` → `'12px'`
- 行 79: `'10px'` → `'12px'`
- 行 117: `'12px'` → `'14px'`
- 行 127: `'18px'` → `'20px'`
- 行 142: `'12px'` → `'14px'`
- 行 150: `'10px'` → `'12px'`
- 行 159: `'10px'` → `'12px'`
- 行 168: `'11px'` → `'13px'`
- 行 189: `'10px'` → `'12px'`

- [ ] **Step 2: 验证构建**

Run: `cd context-lab && npm run build 2>&1 | tail -5`
Expected: `✓ built in`

---

### Task 3: 修改 ChatInteraction.tsx

**Files:**
- Modify: `context-lab/src/components/ChatInteraction.tsx`

- [ ] **Step 1: 替换 fontSize 值**

10 处替换：
- 行 257: `'14px'` → `'16px'`
- 行 274: `'12px'` → `'14px'`
- 行 285: `'13px'` → `'15px'`
- 行 309: `'9px'` → `'11px'`
- 行 318: `'10px'` → `'12px'`
- 行 360: `'12px'` → `'14px'`
- 行 383: `'12px'` → `'14px'`
- 行 389: `'14px'` → `'16px'`
- 行 392: `'10px'` → `'12px'`
- 行 414: `'13px'` → `'15px'`

- [ ] **Step 2: 运行测试**

Run: `cd context-lab && npx vitest run __tests__/components/ChatInteraction.test.tsx 2>&1 | tail -5`
Expected: `Tests  9 passed`

---

### Task 4: 修改 ContextSizePresets.tsx

**Files:**
- Modify: `context-lab/src/components/ContextSizePresets.tsx`

- [ ] **Step 1: 替换 fontSize 值**

1 处替换：
- 行 27: `'11px'` → `'13px'`

---

### Task 5: 修改 DetailModal.tsx

**Files:**
- Modify: `context-lab/src/components/DetailModal.tsx`

- [ ] **Step 1: 替换 fontSize 值**

5 处替换：
- 行 58: `'14px'` → `'16px'`
- 行 63: `'16px'` → `'18px'`
- 行 74: `'11px'` → `'13px'`
- 行 92: `'11px'` → `'13px'`
- 行 101: `'11px'` → `'13px'`

---

### Task 6: 修改 SceneCards.tsx

**Files:**
- Modify: `context-lab/src/components/SceneCards.tsx`

- [ ] **Step 1: 替换 fontSize 值**

8 处替换：
- 行 17: `'10px'` → `'12px'`
- 行 25: `'10px'` → `'12px'`
- 行 57: `'16px'` → `'18px'`
- 行 59: `'12px'` → `'14px'`
- 行 96: `'16px'` → `'18px'`
- 行 99: `'12px'` → `'14px'`
- 行 104: `'10px'` → `'12px'`
- 行 117: `'11px'` → `'13px'`

---

### Task 7: 修改 SceneEditModal.tsx

**Files:**
- Modify: `context-lab/src/components/SceneEditModal.tsx`

- [ ] **Step 1: 替换 fontSize 值**

11 处替换：
- 行 80: `'15px'` → `'17px'`
- 行 90: `'16px'` → `'18px'`
- 行 100: `'10px'` → `'12px'`
- 行 113: `'12px'` → `'14px'`
- 行 121: `'10px'` → `'12px'`
- 行 134: `'12px'` → `'14px'`
- 行 142: `'10px'` → `'12px'`
- 行 146: `'9px'` → `'11px'`
- 行 158: `'11px'` → `'13px'`
- 行 177: `'12px'` → `'14px'`
- 行 188: `'12px'` → `'14px'`

---

### Task 8: 修改 SessionList.tsx

**Files:**
- Modify: `context-lab/src/components/SessionList.tsx`

- [ ] **Step 1: 替换 fontSize 值**

6 处替换：
- 行 49: `'10px'` → `'12px'`
- 行 74: `'12px'` → `'14px'`
- 行 83: `'11px'` → `'13px'`
- 行 97: `'11px'` → `'13px'`
- 行 113: `'11px'` → `'13px'`
- 行 126: `'12px'` → `'14px'`

---

### Task 9: 修改 SettingsModal.tsx

**Files:**
- Modify: `context-lab/src/components/SettingsModal.tsx`

- [ ] **Step 1: 替换 fontSize 值**

8 处替换：
- 行 56: `'15px'` → `'17px'`
- 行 64: `'16px'` → `'18px'`
- 行 74: `'10px'` → `'12px'`
- 行 92: `'12px'` → `'14px'`
- 行 102: `'10px'` → `'12px'`
- 行 114: `'10px'` → `'12px'`
- 行 132: `'14px'` → `'16px'`
- 行 137: `'10px'` → `'12px'`

---

### Task 10: 修改 StepDetailPanel.tsx

**Files:**
- Modify: `context-lab/src/components/StepDetailPanel.tsx`

- [ ] **Step 1: 替换 fontSize 值**

10 处替换：
- 行 22: `'10px'` → `'12px'`
- 行 31: `'11px'` → `'13px'`
- 行 40: `'11px'` → `'13px'`
- 行 53: `'10px'` → `'12px'`
- 行 64: `'10px'` → `'12px'`
- 行 76: `'10px'` → `'12px'`
- 行 115: `'10px'` → `'12px'`
- 行 151: `'10px'` → `'12px'`
- 行 181: `'10px'` → `'12px'`
- 行 224: `'10px'` → `'12px'`

---

### Task 11: 修改 StrategyComparator.tsx

**Files:**
- Modify: `context-lab/src/components/StrategyComparator.tsx`

- [ ] **Step 1: 替换 fontSize 值**

1 处替换：
- 行 22: `'10px'` → `'12px'`

---

### Task 12: 修改 TimelineReplay.tsx

**Files:**
- Modify: `context-lab/src/components/TimelineReplay.tsx`

- [ ] **Step 1: 替换 fontSize 值**

4 处替换：
- 行 37: `'11px'` → `'13px'`
- 行 59: `'10px'` → `'12px'`
- 行 99: `'11px'` → `'13px'`
- 行 108: `'14px'` → `'16px'`

---

### Task 13: 修改 TokenAllocation.tsx

**Files:**
- Modify: `context-lab/src/components/TokenAllocation.tsx`

- [ ] **Step 1: 替换 fontSize 值**

2 处替换：
- 行 35: `'10px'` → `'12px'`
- 行 39: `'10px'` → `'12px'`

---

### Task 14: 修改 ToolSelectorBar.tsx

**Files:**
- Modify: `context-lab/src/components/ToolSelectorBar.tsx`

- [ ] **Step 1: 替换 fontSize 值**

5 处替换：
- 行 27: `'12px'` → `'14px'`
- 行 33: `'10px'` → `'12px'`
- 行 56: `'12px'` → `'14px'`
- 行 66: `'9px'` → `'11px'`
- 行 73: `'14px'` → `'16px'`

---

### Task 15: 修改 WelcomeScreen.tsx

**Files:**
- Modify: `context-lab/src/components/WelcomeScreen.tsx`

- [ ] **Step 1: 替换 fontSize 值**

8 处替换：
- 行 65: `'28px'` → `'28px'` (不变，跳过)
- 行 72: `'28px'` → `'28px'` (不变，跳过)
- 行 81: `'14px'` → `'16px'`
- 行 103: `'12px'` → `'14px'`
- 行 110: `'14px'` → `'16px'`
- 行 113: `'10px'` → `'12px'`
- 行 135: `'14px'` → `'16px'`
- 行 164: `'11px'` → `'13px'`

---

### Task 16: 全量验证

- [ ] **Step 1: 运行完整测试套件**

Run: `cd context-lab && npx vitest run 2>&1 | tail -10`

- [ ] **Step 2: 生产构建**

Run: `cd context-lab && npm run build 2>&1 | tail -5`
Expected: `✓ built in`

- [ ] **Step 3: 更新跟踪矩阵**

将 RQ-018 状态从 🚧 规划中改为 ✅ 已完成

---

### Task 17: 提交

- [ ] **Step 1: Git 提交**

```bash
cd context-lab
git add -A
git commit -m "feat(RQ-018): increase all font sizes by 2px for readability"
```
