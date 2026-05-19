import React from 'react';
import { useAppStore } from '../stores/appStore';
import type { ContextStrategy } from '../types/index';

const strategies: Array<{ id: ContextStrategy; name: string; savings: string }> = [
  { id: 'sliding', name: '滑动窗口', savings: '节省 40%' },
  { id: 'full', name: '完整记忆', savings: '基线' },
  { id: 'summary', name: '摘要记忆', savings: '节省 60%' },
  { id: 'none', name: '无记忆', savings: '节省 80%' },
];

const sizePresets = [
  { value: 4096, label: '4K' },
  { value: 8192, label: '8K' },
  { value: 32768, label: '32K' },
  { value: 131072, label: '128K' },
  { value: 1048576, label: '1M' },
];

const temperaturePresets = [
  { value: 0, label: '精确', desc: '确定性输出' },
  { value: 0.3, label: '低', desc: '较少变化' },
  { value: 0.7, label: '平衡', desc: '适中创意' },
  { value: 1, label: '创意', desc: '最大多样性' },
];

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function SettingsModal({ isOpen, onClose }: SettingsModalProps) {
  const { contextStrategy, setStrategy, contextSize, setContextSize, temperature, setTemperature } = useAppStore();

  if (!isOpen) return null;

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0,
        background: 'rgba(0,0,0,0.55)',
        zIndex: 200,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        backdropFilter: 'blur(4px)',
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          width: '400px',
          background: 'var(--bg-base)',
          border: '1px solid var(--border-default)',
          borderRadius: '14px',
          boxShadow: '0 20px 60px rgba(0,0,0,0.5)',
        }}
      >
        <div style={{
          padding: '16px 20px',
          borderBottom: '1px solid var(--border-subtle)',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}>
          <h3 style={{ fontSize: '17px', fontWeight: 600 }}>⚙ 设置</h3>
          <button
            onClick={onClose}
            style={{
              width: '28px', height: '28px',
              background: 'transparent', border: 'none',
              color: 'var(--text-tertiary)', cursor: 'pointer',
              borderRadius: '5px', display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: '18px',
            }}
          >
            ×
          </button>
        </div>

        <div style={{ padding: '20px' }}>
          <div style={{ marginBottom: '20px' }}>
            <div style={{
              fontSize: '12px', fontWeight: 600, textTransform: 'uppercase',
              letterSpacing: '0.8px', color: 'var(--text-tertiary)', marginBottom: '8px',
            }}>
              上下文策略
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              {strategies.map(s => (
                <div
                  key={s.id}
                  onClick={() => setStrategy(s.id)}
                  style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    padding: '9px 12px', borderRadius: '6px', cursor: 'pointer',
                    border: `1px solid ${contextStrategy === s.id ? 'var(--accent-violet)' : 'var(--border-subtle)'}`,
                    background: contextStrategy === s.id ? 'rgba(167,139,250,0.06)' : 'var(--bg-surface)',
                    transition: 'all 0.12s',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '14px', fontWeight: 500 }}>
                    <span style={{
                      width: '6px', height: '6px', borderRadius: '50%',
                      background: contextStrategy === s.id ? 'var(--accent-violet)' : 'var(--text-tertiary)',
                    }} />
                    <span style={{ color: contextStrategy === s.id ? 'var(--accent-violet)' : 'var(--text-secondary)' }}>
                      {s.name}
                    </span>
                  </div>
                  <span style={{
                    fontFamily: 'var(--font-mono)', fontSize: '12px',
                    color: s.savings === '基线' ? 'var(--text-tertiary)' : 'var(--accent-emerald)',
                  }}>
                    {s.savings}
                  </span>
                </div>
              ))}
            </div>
          </div>

          <div>
            <div style={{
              fontSize: '12px', fontWeight: 600, textTransform: 'uppercase',
              letterSpacing: '0.8px', color: 'var(--text-tertiary)', marginBottom: '8px',
            }}>
              上下文窗口大小
            </div>
            <div style={{ display: 'flex', gap: '6px' }}>
              {sizePresets.map(p => (
                <div
                  key={p.value}
                  onClick={() => setContextSize(p.value)}
                  style={{
                    flex: 1, padding: '10px 0', textAlign: 'center',
                    background: contextSize === p.value ? 'rgba(91,156,245,0.08)' : 'var(--bg-surface)',
                    border: `1px solid ${contextSize === p.value ? 'var(--accent-blue)' : 'var(--border-subtle)'}`,
                    borderRadius: '6px', cursor: 'pointer', transition: 'all 0.12s',
                  }}
                >
                  <div style={{
                    fontFamily: 'var(--font-mono)', fontSize: '16px', fontWeight: 600,
                    color: contextSize === p.value ? 'var(--accent-blue)' : 'var(--text-secondary)',
                  }}>
                    {p.label}
                  </div>
                  <div style={{ fontSize: '12px', color: 'var(--text-tertiary)', marginTop: '2px' }}>tokens</div>
                </div>
              ))}
            </div>
          </div>

          <div style={{ marginTop: '20px' }}>
            <div style={{
              fontSize: '12px', fontWeight: 600, textTransform: 'uppercase',
              letterSpacing: '0.8px', color: 'var(--text-tertiary)', marginBottom: '8px',
            }}>
              温度参数
            </div>
            <div style={{ display: 'flex', gap: '6px' }}>
              {temperaturePresets.map(p => (
                <div
                  key={p.value}
                  onClick={() => setTemperature(p.value)}
                  style={{
                    flex: 1, padding: '10px 0', textAlign: 'center',
                    background: temperature === p.value ? 'rgba(245,158,11,0.08)' : 'var(--bg-surface)',
                    border: `1px solid ${temperature === p.value ? '#f59e0b' : 'var(--border-subtle)'}`,
                    borderRadius: '6px', cursor: 'pointer', transition: 'all 0.12s',
                  }}
                >
                  <div style={{
                    fontFamily: 'var(--font-mono)', fontSize: '16px', fontWeight: 600,
                    color: temperature === p.value ? '#f59e0b' : 'var(--text-secondary)',
                  }}>
                    {p.value}
                  </div>
                  <div style={{
                    fontSize: '12px', color: temperature === p.value ? '#f59e0b' : 'var(--text-tertiary)',
                    marginTop: '2px',
                  }}>
                    {p.desc}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
