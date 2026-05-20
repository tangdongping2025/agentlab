# 系统提示词区域默认收缩优化 Design Spec

**RQ-007** - 系统提示词编辑器组件优化

## Overview

**Goal:** Make the system prompt editor section collapsed by default, with an arrow icon to toggle expand/collapse, showing a summary when collapsed. This is similar to RQ-006's API interaction process collapsible feature.

**Priority:** High  
**Estimated Time:** 1 day

## Problem

The system prompt editor section currently shows a large text area by default, which can take up a lot of vertical space in the UI. Users often don't need to edit the system prompt immediately, so it should be collapsed by default to save space.

## Solution

Add collapsible functionality to the system prompt editor section, similar to the API interaction process (RQ-006).

### Architecture
- Use `useState` within the component that contains the system prompt editor to manage expand/collapse state
- Show a summary of the current prompt when collapsed
- Expand to show full editor when clicked
- Use an arrow icon to indicate expand/collapse state

### Components Affected
- `context-lab/src/components/PromptEditor.tsx` (or similar component containing system prompt)

## Requirements

### Functional Requirements
1. System prompt section must be **collapsed by default**
2. Show arrow icon to toggle expand/collapse
3. When collapsed, show a summary of the current system prompt
4. When expanded, show full prompt editor
5. Persist expand/collapse state within a session

### Design Requirements
1. Clear visual distinction between collapsed/expanded states
2. Smooth animation when toggling
3. Consistent icon style with other collapsible sections

### Technical Requirements
1. Use React `useState` for state management
2. Use Tailwind CSS for styling
3. Add proper test coverage

---

## User Story

**As a user**,  
**I want** the system prompt editor to be collapsed by default,  
**So that** I can see more of the chat interface without scrolling, and only expand the prompt editor when I need to make changes.

---

## Acceptance Criteria

- [ ] System prompt section is collapsed by default on page load
- [ ] Arrow icon is present and indicates current state (pointing right when collapsed, down when expanded)
- [ ] Collapsed state shows summary of current system prompt
- [ ] Clicking on the collapsed section expands it
- [ ] Clicking on the expanded section collapses it
- [ ] Animation is smooth and visually appealing
- [ ] All existing functionality remains intact

---

## Technical Approach

### State Management
```typescript
const [isPromptExpanded, setIsPromptExpanded] = useState(false);
```

### Collapsed View
- Show arrow icon (▶️)
- Show first ~50 characters of current prompt as summary
- Show "System Prompt" label

### Expanded View
- Show arrow icon (▼)
- Show full prompt editor
- Allow normal editing functionality

---

**Created:** 2026-05-15  
**Status:** 🔄 Ready for implementation
