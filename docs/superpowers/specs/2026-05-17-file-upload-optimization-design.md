---
name: 文件上传功能优化
description: 进一步优化文件上传功能，包括修复乱码问题和自动解析发送
version: 1.0
date: 2026-05-17
---

# 文件上传功能优化 - RQ-023

## 需求概述

本次优化主要解决两个问题：
1. **文件内容显示乱码** - 尤其是文本文件的编码问题
2. **自动解析发送** - 文件上传后自动解析内容并发送给 AI
3. **单独发送文件** - 允许只上传文件而不输入文本

## 问题分析

### 乱码问题
- 主要出现在文本文件（如 .txt, .md, .csv）
- 原因是编码检测不足，无法正确处理 UTF-8 以外的编码

### 解析问题
- 当前需要用户手动点击"查看内容"才会显示
- 文件内容未包含在发送给 AI 的消息中

## 设计方案

### 1. 编码检测与解码

#### 技术选型
使用 `jschardet` 库进行自动编码检测。

#### 实现逻辑
```typescript
import * as jschardet from 'jschardet';

const detectEncoding = (buffer: Buffer): string => {
  const result = jschardet.detect(buffer);
  return result.encoding || 'UTF-8';
};

const decodeContent = (buffer: Buffer, encoding: string): string => {
  try {
    return buffer.toString(encoding);
  } catch {
    return buffer.toString('UTF-8');
  }
};
```

### 2. 文件自动解析与发送

#### 发送逻辑优化
```typescript
// 发送时处理
if (files && files.length > 0) {
  for (const file of files) {
    if (isTextFile(file)) {
      const content = decodeFileContent(file);
      message += `\n\n以下是文件 "${file.name}" 的内容：\n${content}`;
    }
  }
}
```

#### 单独发送文件
```typescript
const handleSendWithInput = async (text: string) => {
  if (!text.trim() && !selectedFile) return;
  
  // 处理文件内容
  const fileAttachment = selectedFile ? await convertFileToBase64(selectedFile) : null;
  
  const messageText = text.trim() || (fileAttachment ? fileAttachment.name : '');
  
  await agentService.sendMessage(
    messageText,
    systemPrompt,
    selectedTools,
    contextStrategy,
    fileAttachment ? [fileAttachment] : undefined
  );
};
```

### 3. 文件内容发送策略

#### 文件类型判断
```typescript
const isTextFile = (file: FileAttachment): boolean => {
  const textExtensions = ['.txt', '.md', '.markdown', '.csv', '.json', '.html', '.css', '.js'];
  const contentType = file.type.toLowerCase();
  return contentType.startsWith('text/') || 
         textExtensions.some(ext => file.name.toLowerCase().endsWith(ext));
};
```

#### 大小限制策略
```typescript
const MAX_CONTENT_LENGTH = 10000; // 约 40000 Token

const truncateContent = (content: string): string => {
  if (content.length <= MAX_CONTENT_LENGTH) return content;
  return content.slice(0, MAX_CONTENT_LENGTH) + '...\n\n[文件内容过长，已截断]';
};
```

### 4. 发送按钮逻辑优化

#### 可点击条件
```typescript
const isSendButtonEnabled = text.trim() || selectedFile;
```

## 文件修改

### 修改的文件
1. **ChatInteraction.tsx** - 优化解码和发送逻辑
2. **agentService.ts** - 优化文件内容发送
3. **types/index.ts** - 更新类型定义
4. **package.json** - 添加 jschardet 依赖

### 新增依赖
```json
{
  "dependencies": {
    "jschardet": "^3.0.0"
  }
}
```

## 测试方案

### 测试场景
1. 上传 UTF-8 编码的 .txt 和 .md 文件
2. 上传 GBK/GB2312 编码的中文文件
3. 上传大文件（>10KB）
4. 只上传文件不输入文本
5. 输入文本同时上传文件

### 预期结果
1. 文件内容正确解码显示
2. AI 正确读取了文件内容
3. 截断功能正常工作
4. 单独发送文件功能正常

## 后续优化方向

### 阶段 1
- 实现基本的编码检测和发送功能

### 阶段 2
- 优化性能和错误处理
- 支持更多文件类型

### 阶段 3
- 实现文件预览优化
- 支持拖拽上传

## 验证时间

本次优化的功能将在完成实现后进行验证，预计时间：**2-3 个开发小时**。
