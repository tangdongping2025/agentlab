import React, { useState, useEffect, useRef, useCallback } from 'react';

// ─── Capability data ────────────────────────────────────────────────

interface Capability {
  icon: string;
  title: string;
  desc: string;
  color: string;
  featured: boolean;
  action?: string;
}

const CAPABILITIES: Capability[] = [
  { icon: '🔍', title: '联网搜索', desc: '23 个垂直领域实时搜索，金融行情、代码仓库、学术论文一键查询', color: 'cyan', featured: true, action: '选择投资助手或研究分析场景 →' },
  { icon: '💭', title: '深度思考', desc: '模型先思考再回答，推理过程透明可见，预算可调', color: 'amber', featured: true, action: '点击💡深度思考按钮开启 →' },
  { icon: '🧠', title: '4 种上下文策略', desc: '完整记忆 / 滑动窗口 / 摘要记忆 / 无记忆，控制对话记忆范围', color: 'violet', featured: true, action: '在⚙设置中切换策略 →' },
  { icon: '📊', title: '策略效果可视化', desc: '实时看消息裁了哪些、Token 省了多少，策略决策透明', color: 'emerald', featured: true, action: '发送消息后查看策略效果区 →' },
  { icon: '🎭', title: '多场景切换', desc: '投资助手 / 研究分析 / 日常对话，一键换角色换工具', color: 'rose', featured: true, action: '点击左侧场景卡片切换 →' },
  { icon: '📄', title: '网页提取', desc: '给 URL 即可提取全文内容，深度研读任意网页', color: 'blue', action: '选择研究分析场景 →' },
  { icon: '📎', title: '文件上传', desc: '图片、PDF、Markdown 直接发给模型分析', color: 'orange', action: '点击📎按钮选择文件 →' },
  { icon: '🌡️', title: '温度控制', desc: '精确 / 低 / 平衡 / 创意，4 档预设调控模型输出风格', color: 'lime', action: '在⚙设置中选择温度 →' },
  { icon: '📋', title: '交互时间线', desc: '逐步回放 API 请求、工具调用、策略决策全过程', color: 'pink', action: '发送消息后查看交互过程区 →' },
  { icon: '📈', title: 'Token 分配', desc: '可视化系统提示词 / 对话历史 / 工具结果的 Token 占比', color: 'teal', action: '查看右侧 Token 分配面板 →' },
  { icon: '💬', title: '流式输出', desc: '打字机效果实时显示模型回复，支持中断控制', color: 'sky' },
  { icon: '💾', title: '会话持久化', desc: '对话历史、场景配置自动保存，切换无丢失', color: 'indigo' },
  { icon: '✏️', title: '系统提示词编辑', desc: '自定义系统提示词，预设场景一键恢复默认', color: 'fuchsia', action: '在输入框上方编辑提示词 →' },
  { icon: '🔧', title: '工具选择', desc: '按需开关工具，控制模型可用的能力范围', color: 'red', action: '点击🔧工具按钮选择 →' },
  { icon: '🗂️', title: '会话管理', desc: '创建 / 切换 / 删除会话，历史消息完整恢复', color: 'yellow', action: '在左侧会话列表管理 →' },
  { icon: '⏱️', title: '工具调用超时', desc: '15 秒超时保护 + 中断按钮，防止无限等待', color: 'cyan' },
  { icon: '📐', title: '上下文窗口调节', desc: '4K ~ 1M 可选，灵活控制模型可见上下文大小', color: 'violet', action: '在⚙设置中调节 →' },
  { icon: '📦', title: '配置持久化', desc: '场景、策略、工具、温度等设置自动保存到本地', color: 'emerald' },
  { icon: '🔽', title: '交互过程折叠', desc: 'API 请求 / 工具调用默认收缩，按需展开详情', color: 'amber' },
  { icon: '⛶', title: '交互区域最大化', desc: '全屏查看交互详情，深入分析每次 API 调用', color: 'rose' },
];

// ─── Color mapping ──────────────────────────────────────────────────

interface ColorSet {
  accent: string;
  bg: string;
  border: string;
}

const COLOR_MAP: Record<string, ColorSet> = {
  cyan:    { accent: '#22d3ee', bg: 'rgba(34,211,238,0.08)',   border: 'rgba(34,211,238,0.2)' },
  amber:   { accent: '#f59e0b', bg: 'rgba(245,158,11,0.08)',   border: 'rgba(245,158,11,0.2)' },
  violet:  { accent: '#a78bfa', bg: 'rgba(167,139,250,0.08)',  border: 'rgba(167,139,250,0.2)' },
  emerald: { accent: '#34d399', bg: 'rgba(52,211,153,0.08)',   border: 'rgba(52,211,153,0.2)' },
  rose:    { accent: '#f472b6', bg: 'rgba(244,114,182,0.08)',  border: 'rgba(244,114,182,0.2)' },
  blue:    { accent: '#60a5fa', bg: 'rgba(96,165,250,0.08)',   border: 'rgba(96,165,250,0.2)' },
  orange:  { accent: '#fb923c', bg: 'rgba(251,146,60,0.08)',   border: 'rgba(251,146,60,0.2)' },
  lime:    { accent: '#a3e635', bg: 'rgba(163,230,53,0.08)',   border: 'rgba(163,230,53,0.2)' },
  pink:    { accent: '#ec4899', bg: 'rgba(236,72,153,0.08)',   border: 'rgba(236,72,153,0.2)' },
  teal:    { accent: '#2dd4bf', bg: 'rgba(45,212,191,0.08)',   border: 'rgba(45,212,191,0.2)' },
  sky:     { accent: '#38bdf8', bg: 'rgba(56,189,248,0.08)',   border: 'rgba(56,189,248,0.2)' },
  fuchsia: { accent: '#d946ef', bg: 'rgba(217,70,239,0.08)',   border: 'rgba(217,70,239,0.2)' },
  red:     { accent: '#f87171', bg: 'rgba(248,113,113,0.08)',  border: 'rgba(248,113,113,0.2)' },
  yellow:  { accent: '#facc15', bg: 'rgba(250,204,21,0.08)',   border: 'rgba(250,204,21,0.2)' },
  indigo:  { accent: '#818cf8', bg: 'rgba(129,140,248,0.08)',  border: 'rgba(129,140,248,0.2)' },
};

// ─── Chunk capabilities into pages (3 per page) ─────────────────────

const CARDS_PER_PAGE = 3;
const PAGES: Capability[][] = [];
for (let i = 0; i < CAPABILITIES.length; i += CARDS_PER_PAGE) {
  PAGES.push(CAPABILITIES.slice(i, i + CARDS_PER_PAGE));
}
const TOTAL_PAGES = PAGES.length;

// ─── Component ──────────────────────────────────────────────────────

interface WelcomePageProps {
  onSend: (message: string) => void;
}

export default function WelcomePage({ onSend }: WelcomePageProps) {
  const [currentPage, setCurrentPage] = useState(0);
  const [input, setInput] = useState('');
  const [hoveredCard, setHoveredCard] = useState<number | null>(null);
  const autoTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ── Carousel navigation ──

  const goTo = useCallback((idx: number) => {
    setCurrentPage(Math.max(0, Math.min(idx, TOTAL_PAGES - 1)));
  }, []);

  const goNext = useCallback(() => {
    setCurrentPage(prev => (prev + 1 >= TOTAL_PAGES ? 0 : prev + 1));
  }, []);

  const goPrev = useCallback(() => {
    setCurrentPage(prev => Math.max(0, prev - 1));
  }, []);

  // ── Auto-rotate every 5s, pause on hover ──

  const startAutoRotate = useCallback(() => {
    if (autoTimerRef.current) clearInterval(autoTimerRef.current);
    autoTimerRef.current = setInterval(goNext, 5000);
  }, [goNext]);

  const stopAutoRotate = useCallback(() => {
    if (autoTimerRef.current) {
      clearInterval(autoTimerRef.current);
      autoTimerRef.current = null;
    }
  }, []);

  useEffect(() => {
    startAutoRotate();
    return stopAutoRotate;
  }, [startAutoRotate, stopAutoRotate]);

  // ── Input handling ──

  const handleSend = () => {
    const trimmed = input.trim();
    if (trimmed) {
      onSend(trimmed);
      setInput('');
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  // ── Global card index for hover tracking ──

  const globalIndex = (pageIdx: number, cardIdx: number) =>
    pageIdx * CARDS_PER_PAGE + cardIdx;

  return (
    <>
      {/* Keyframe animations injected once */}
      <style>{`
        @keyframes wpFadeIn {
          from { opacity: 0; transform: translateY(12px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes wpCardIn {
          from { opacity: 0; transform: translateY(16px) scale(0.97); }
          to   { opacity: 1; transform: translateY(0) scale(1); }
        }
        @keyframes wpPulse {
          0%, 100% { opacity: 1; }
          50%      { opacity: 0.4; }
        }
      `}</style>

      <div style={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        minHeight: 0,
        position: 'relative',
        overflow: 'hidden',
      }}>
        {/* ── Background: grid pattern ── */}
        <div style={{
          position: 'fixed',
          inset: 0,
          backgroundImage: [
            'linear-gradient(rgba(34,211,238,0.03) 1px, transparent 1px)',
            'linear-gradient(90deg, rgba(34,211,238,0.03) 1px, transparent 1px)',
          ].join(', '),
          backgroundSize: '60px 60px',
          pointerEvents: 'none',
          zIndex: 0,
        }} />

        {/* ── Background: glow orb ── */}
        <div style={{
          position: 'fixed',
          top: -200,
          right: -200,
          width: 600,
          height: 600,
          background: 'radial-gradient(circle, rgba(34,211,238,0.06) 0%, transparent 70%)',
          pointerEvents: 'none',
          zIndex: 0,
        }} />

        {/* ── Main content wrapper ── */}
        <div style={{
          maxWidth: 960,
          width: '100%',
          margin: '0 auto',
          padding: '36px 32px 24px',
          display: 'flex',
          flexDirection: 'column',
          flex: 1,
          minHeight: 0,
          position: 'relative',
          zIndex: 1,
        }}>
          {/* ── Header ── */}
          <div style={{
            textAlign: 'center',
            marginBottom: 32,
            flexShrink: 0,
            animation: 'wpFadeIn 0.6s ease-out',
          }}>
            {/* Badge */}
            <div style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 8,
              padding: '5px 14px',
              background: 'rgba(34,211,238,0.06)',
              border: '1px solid rgba(34,211,238,0.15)',
              borderRadius: 20,
              fontFamily: "'JetBrains Mono', monospace",
              fontSize: 11,
              color: '#22d3ee',
              letterSpacing: 1.5,
              textTransform: 'uppercase' as const,
              marginBottom: 14,
            }}>
              <span style={{
                width: 6,
                height: 6,
                borderRadius: '50%',
                background: '#22d3ee',
                animation: 'wpPulse 2s infinite',
                display: 'inline-block',
              }} />
              Agent Experiment Platform
            </div>

            <h1 style={{
              fontFamily: "'JetBrains Mono', monospace",
              fontSize: 36,
              fontWeight: 700,
              color: '#e8ecf4',
              letterSpacing: -0.5,
              marginBottom: 8,
            }}>
              Agent{' '}
              <span style={{
                background: 'linear-gradient(135deg, #22d3ee, #a78bfa)',
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
                backgroundClip: 'text',
              }}>
                Lab
              </span>
            </h1>

            <p style={{
              fontSize: 14,
              color: '#8b95a8',
              lineHeight: 1.5,
              maxWidth: 460,
              margin: '0 auto',
            }}>
              探索智能体能力的实验平台。观察、控制、理解每一次对话背后的工具调用、Token 流动与策略决策。
            </p>
          </div>

          {/* ── Carousel section ── */}
          <div style={{
            flex: 1,
            minHeight: 0,
            display: 'flex',
            flexDirection: 'column',
            marginBottom: 24,
            animation: 'wpFadeIn 0.6s ease-out 0.15s backwards',
          }}>
            {/* Viewport */}
            <div
              style={{
                flex: 1,
                minHeight: 0,
                overflow: 'hidden',
                position: 'relative',
              }}
              onMouseEnter={stopAutoRotate}
              onMouseLeave={startAutoRotate}
            >
              {/* Track */}
              <div style={{
                display: 'flex',
                transition: 'transform 0.4s cubic-bezier(0.4, 0, 0.2, 1)',
                transform: `translateX(-${currentPage * 100}%)`,
                position: 'absolute',
                inset: 0,
              }}>
                {PAGES.map((page, pageIdx) => (
                  <div key={pageIdx} style={{
                    minWidth: '100%',
                    display: 'grid',
                    gridTemplateColumns: 'repeat(3, 1fr)',
                    gap: 12,
                    padding: 2,
                  }}>
                    {page.map((cap, cardIdx) => {
                      const gIdx = globalIndex(pageIdx, cardIdx);
                      const cm = COLOR_MAP[cap.color] || COLOR_MAP.cyan;
                      const isHovered = hoveredCard === gIdx;

                      return (
                        <div
                          key={gIdx}
                          onMouseEnter={() => setHoveredCard(gIdx)}
                          onMouseLeave={() => setHoveredCard(null)}
                          style={{
                            background: '#111827',
                            border: `1px solid ${cap.featured ? cm.border : 'rgba(255,255,255,0.1)'}`,
                            borderRadius: 12,
                            padding: 22,
                            cursor: 'pointer',
                            transition: 'all 0.25s cubic-bezier(0.4, 0, 0.2, 1)',
                            position: 'relative',
                            overflow: 'hidden',
                            animation: `wpCardIn 0.4s ease-out ${0.05 + cardIdx * 0.05}s backwards`,
                            display: 'flex',
                            flexDirection: 'column',
                            transform: isHovered ? 'translateY(-2px)' : undefined,
                            boxShadow: isHovered ? '0 8px 32px rgba(0,0,0,0.3)' : undefined,
                            borderColor: isHovered ? 'rgba(255,255,255,0.15)' : (cap.featured ? cm.border : 'rgba(255,255,255,0.1)'),
                          }}
                        >
                          {/* Top accent bar on hover */}
                          <div style={{
                            position: 'absolute',
                            top: 0,
                            left: 0,
                            right: 0,
                            height: 2,
                            background: cm.accent,
                            opacity: isHovered ? 1 : 0,
                            transition: 'opacity 0.25s',
                          }} />

                          {/* Icon */}
                          <div style={{
                            width: 44,
                            height: 44,
                            borderRadius: 11,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontSize: 22,
                            marginBottom: 14,
                            background: cm.bg,
                            border: `1px solid ${cm.border}`,
                            flexShrink: 0,
                          }}>
                            {cap.icon}
                          </div>

                          {/* Title + tag */}
                          <div style={{
                            fontSize: 18,
                            fontWeight: 600,
                            color: '#e8ecf4',
                            marginBottom: 8,
                            display: 'flex',
                            alignItems: 'center',
                            gap: 6,
                          }}>
                            {cap.title}
                            {cap.featured && (
                              <span style={{
                                fontSize: 10,
                                fontFamily: "'JetBrains Mono', monospace",
                                padding: '2px 6px',
                                borderRadius: 4,
                                fontWeight: 500,
                                letterSpacing: 0.5,
                                background: cm.bg,
                                color: cm.accent,
                              }}>
                                独有
                              </span>
                            )}
                          </div>

                          {/* Description */}
                          <div style={{
                            fontSize: 14,
                            color: '#8b95a8',
                            lineHeight: 1.5,
                            flex: 1,
                          }}>
                            {cap.desc}
                          </div>

                          {/* Action hint */}
                          {cap.action && (
                            <div style={{
                              marginTop: 10,
                              fontFamily: "'JetBrains Mono', monospace",
                              fontSize: 12,
                              color: cm.accent,
                              display: 'flex',
                              alignItems: 'center',
                              gap: 4,
                              opacity: isHovered ? 1 : 0.7,
                              transition: 'opacity 0.2s',
                            }}>
                              {cap.action}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                ))}
              </div>
            </div>

            {/* ── Carousel navigation ── */}
            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 16,
              marginTop: 16,
              flexShrink: 0,
            }}>
              {/* Prev arrow */}
              <button
                onClick={goPrev}
                disabled={currentPage === 0}
                style={{
                  width: 32,
                  height: 32,
                  borderRadius: 8,
                  border: '1px solid rgba(255,255,255,0.1)',
                  background: '#111827',
                  color: '#8b95a8',
                  cursor: currentPage === 0 ? 'default' : 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: 14,
                  transition: 'all 0.2s',
                  opacity: currentPage === 0 ? 0.3 : 1,
                }}
              >
                ◀
              </button>

              {/* Dots */}
              <div style={{ display: 'flex', gap: 6 }}>
                {PAGES.map((_, i) => (
                  <button
                    key={i}
                    onClick={() => goTo(i)}
                    style={{
                      width: i === currentPage ? 24 : 8,
                      height: 8,
                      borderRadius: i === currentPage ? 4 : '50%',
                      background: i === currentPage ? '#22d3ee' : 'rgba(255,255,255,0.1)',
                      border: 'none',
                      cursor: 'pointer',
                      transition: 'all 0.3s',
                      padding: 0,
                    }}
                  />
                ))}
              </div>

              {/* Page label */}
              <span style={{
                fontFamily: "'JetBrains Mono', monospace",
                fontSize: 11,
                color: '#4b5568',
                letterSpacing: 0.5,
              }}>
                {currentPage + 1} / {TOTAL_PAGES}
              </span>

              {/* Next arrow */}
              <button
                onClick={currentPage === TOTAL_PAGES - 1 ? () => goTo(0) : goNext}
                style={{
                  width: 32,
                  height: 32,
                  borderRadius: 8,
                  border: '1px solid rgba(255,255,255,0.1)',
                  background: '#111827',
                  color: '#8b95a8',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: 14,
                  transition: 'all 0.2s',
                }}
              >
                ▶
              </button>
            </div>
          </div>

          {/* ── Input section ── */}
          <div style={{
            flexShrink: 0,
            textAlign: 'center',
            paddingBottom: 16,
            animation: 'wpFadeIn 0.6s ease-out 0.5s backwards',
          }}>
            <div style={{
              position: 'relative',
              maxWidth: 640,
              margin: '0 auto',
            }}>
              <input
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="输入你的问题，开始实验..."
                style={{
                  width: '100%',
                  padding: '14px 52px 14px 20px',
                  background: '#111827',
                  border: '1px solid rgba(255,255,255,0.1)',
                  borderRadius: 14,
                  fontFamily: "'Noto Sans SC', sans-serif",
                  fontSize: 15,
                  color: '#e8ecf4',
                  outline: 'none',
                  transition: 'all 0.25s',
                }}
                onFocus={e => {
                  e.currentTarget.style.borderColor = 'rgba(34,211,238,0.4)';
                  e.currentTarget.style.boxShadow = '0 0 0 3px rgba(34,211,238,0.08), 0 8px 32px rgba(0,0,0,0.3)';
                }}
                onBlur={e => {
                  e.currentTarget.style.borderColor = 'rgba(255,255,255,0.1)';
                  e.currentTarget.style.boxShadow = 'none';
                }}
              />
              <button
                onClick={handleSend}
                style={{
                  position: 'absolute',
                  right: 8,
                  top: '50%',
                  transform: 'translateY(-50%)',
                  width: 36,
                  height: 36,
                  borderRadius: 10,
                  border: 'none',
                  background: 'linear-gradient(135deg, #22d3ee, #a78bfa)',
                  color: '#0a0e17',
                  fontSize: 16,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  transition: 'all 0.2s',
                  opacity: 0.7,
                }}
                onMouseEnter={e => {
                  e.currentTarget.style.opacity = '1';
                  e.currentTarget.style.transform = 'translateY(-50%) scale(1.05)';
                }}
                onMouseLeave={e => {
                  e.currentTarget.style.opacity = '0.7';
                  e.currentTarget.style.transform = 'translateY(-50%) scale(1)';
                }}
              >
                ➤
              </button>
            </div>
            <div style={{
              marginTop: 12,
              fontSize: 12,
              color: '#4b5568',
            }}>
              选择左侧场景或直接输入问题
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
