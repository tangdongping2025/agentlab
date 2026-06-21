from datetime import datetime
from typing import Any, Optional

from pydantic import BaseModel, Field


class MessageIn(BaseModel):
    role: str
    content: str = ""
    timestamp: Optional[str] = None
    tokenUsage: Optional[dict] = None
    toolsUsed: Optional[list] = None
    timelineStepIndex: Optional[int] = None
    files: Optional[list] = None
    isFileOnly: Optional[bool] = None
    thinkingContent: Optional[str] = None
    thinkingTokens: Optional[int] = None


class SessionCreate(BaseModel):
    id: Optional[str] = None  # 前端生成，用于乐观更新与后续 PUT 匹配
    name: Optional[str] = None
    sceneId: Optional[str] = None
    systemPrompt: Optional[str] = None
    selectedTools: list = Field(default_factory=list)
    contextStrategy: Optional[str] = None
    contextSize: Optional[int] = None
    agentId: Optional[str] = None
    cwd: Optional[str] = None
    cwdHistory: list = Field(default_factory=list)


class SessionUpdate(BaseModel):
    name: Optional[str] = None
    sceneId: Optional[str] = None
    systemPrompt: Optional[str] = None
    selectedTools: Optional[list] = None
    contextStrategy: Optional[str] = None
    contextSize: Optional[int] = None
    agentId: Optional[str] = None
    cwd: Optional[str] = None
    cwdHistory: Optional[list] = None
    messages: Optional[list[MessageIn]] = None


class MessageOut(BaseModel):
    seq: Optional[int] = None
    role: str
    content: str = ""
    timestamp: Any = None
    tokenUsage: Optional[dict] = None
    toolsUsed: Optional[list] = None
    files: Optional[list] = None
    isFileOnly: Optional[bool] = None
    thinkingContent: Optional[str] = None
    thinkingTokens: Optional[int] = None


class MessageWindowOut(BaseModel):
    messages: list[MessageOut] = Field(default_factory=list)
    hasMoreBefore: bool = False
    hasMoreAfter: bool = False
    oldestSeq: Optional[int] = None
    newestSeq: Optional[int] = None
    total: int = 0


class MessageIndexItem(BaseModel):
    messageSeq: int
    role: str
    title: str
    preview: str
    timestamp: Optional[str] = None


class MessageIndexOut(BaseModel):
    items: list[MessageIndexItem] = Field(default_factory=list)


class AppendMessagesIn(BaseModel):
    messages: list[MessageIn] = Field(default_factory=list)


class SessionOut(BaseModel):
    id: str
    name: Optional[str] = None
    sceneId: Optional[str] = None
    systemPrompt: Optional[str] = None
    selectedTools: list = Field(default_factory=list)
    contextStrategy: Optional[str] = None
    contextSize: Optional[int] = None
    totalTokens: int = 0
    agentId: Optional[str] = None
    cwd: Optional[str] = None
    cwdHistory: list = Field(default_factory=list)
    messages: list[MessageOut] = Field(default_factory=list)
    createdAt: Optional[str] = None
    updatedAt: Optional[str] = None


class SessionListItem(BaseModel):
    """列表/查询用，不含 messages，避免大载荷。"""
    id: str
    name: Optional[str] = None
    sceneId: Optional[str] = None
    preview: str = ""
    agentId: Optional[str] = None
    totalTokens: int = 0
    createdAt: Optional[str] = None
    updatedAt: Optional[str] = None


class QueryResult(BaseModel):
    items: list[SessionListItem]
    total: int
    page: int
    size: int


class InsightItemCreate(BaseModel):
    kind: str
    title: str
    description: str
    sourceSessionIds: list[str] = Field(default_factory=list)
    status: str


class InsightItemOut(BaseModel):
    id: str
    kind: str
    title: str
    description: str
    sourceSessionIds: list[str] = Field(default_factory=list)
    status: str
    enabledForPrompt: bool = False
    createdAt: Optional[str] = None
    updatedAt: Optional[str] = None


class InsightItemUpdate(BaseModel):
    enabledForPrompt: Optional[bool] = None


class InsightItemList(BaseModel):
    items: list[InsightItemOut]
