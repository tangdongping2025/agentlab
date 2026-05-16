import React, { useState } from 'react';
import { useAppStore } from '../stores/appStore';

interface SceneCardsProps {
  onEditScene: (sceneId: string | null) => void;
}

export default function SceneCards({ onEditScene }: SceneCardsProps) {
  const { scenes, currentScene, setScene } = useAppStore();
  const [collapsed, setCollapsed] = useState(false);

  return (
    <div style={{ borderBottom: '1px solid var(--border-subtle)' }}>
      <div
        onClick={() => setCollapsed(!collapsed)}
        style={{
          fontSize: '10px', fontWeight: 600, textTransform: 'uppercase',
          letterSpacing: '0.9px', color: 'var(--text-tertiary)',
          padding: '12px 16px', cursor: 'pointer', userSelect: 'none',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}
      >
        <span>场景</span>
        <span style={{
          fontSize: '10px', transition: 'transform 0.2s',
          transform: collapsed ? 'rotate(-90deg)' : 'none',
          display: 'inline-block',
        }}>
          ▾
        </span>
      </div>
      {!collapsed && (
        <div style={{ padding: '0 16px 14px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
          {scenes.map(scene => {
            const isActive = currentScene === scene.id;
            return (
              <SceneCard
                key={scene.id}
                scene={scene}
                isActive={isActive}
                onSelect={() => setScene(scene.id)}
                onEdit={() => onEditScene(scene.id)}
              />
            );
          })}
          <div
            onClick={() => onEditScene(null)}
            style={{
              display: 'flex', alignItems: 'center', gap: '10px',
              padding: '8px 10px', borderRadius: '8px',
              border: '1px dashed var(--border-default)',
              background: 'transparent', cursor: 'pointer', transition: 'all 0.15s',
            }}
            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = 'var(--accent-blue)'; (e.currentTarget as HTMLElement).style.background = 'rgba(91,156,245,0.04)'; }}
            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = 'var(--border-default)'; (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
          >
            <span style={{ fontSize: '16px', color: 'var(--text-tertiary)', flexShrink: 0 }}>＋</span>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: '12px', fontWeight: 500, color: 'var(--text-tertiary)' }}>新建场景</div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function SceneCard({ scene, isActive, onSelect, onEdit }: {
  scene: { id: string; name: string; icon: string; tools: string[] };
  isActive: boolean;
  onSelect: () => void;
  onEdit: () => void;
}) {
  const [hovered, setHovered] = React.useState(false);
  const strategy = useAppStore(s => s.contextStrategy);
  const strategyLabel = isActive
    ? strategy === 'sliding' ? '滑动窗口'
      : strategy === 'full' ? '完整记忆'
      : strategy === 'summary' ? '摘要记忆'
      : '无记忆'
    : '';

  return (
    <div
      onClick={onSelect}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: 'flex', alignItems: 'center', gap: '10px',
        padding: '8px 10px', borderRadius: '8px',
        border: `1px solid ${isActive ? 'var(--accent-blue)' : 'var(--border-subtle)'}`,
        background: isActive ? 'rgba(91,156,245,0.06)' : 'var(--bg-surface)',
        cursor: 'pointer', transition: 'all 0.15s',
      }}
    >
      <span style={{ fontSize: '16px', flexShrink: 0 }}>{scene.icon}</span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          fontSize: '12px', fontWeight: 600,
          color: isActive ? 'var(--accent-blue)' : 'var(--text-primary)',
        }}>
          {scene.name}
        </div>
        <div style={{ fontSize: '10px', color: 'var(--text-tertiary)', marginTop: '1px' }}>
          {scene.tools.length} 工具{isActive && strategyLabel ? ` · ${strategyLabel}` : ''}
        </div>
      </div>
      <span
        onClick={e => { e.stopPropagation(); onEdit(); }}
        title="编辑场景"
        style={{
          opacity: hovered || isActive ? 1 : 0,
          width: '22px', height: '22px',
          background: 'var(--bg-elevated)', border: '1px solid var(--border-default)',
          borderRadius: '5px', display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: 'var(--text-tertiary)', transition: 'all 0.12s', flexShrink: 0,
          fontSize: '11px',
        }}
      >
        ✎
      </span>
    </div>
  );
}
