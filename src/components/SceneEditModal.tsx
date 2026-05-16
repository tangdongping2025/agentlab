import React, { useState, useEffect } from 'react';
import { useAppStore } from '../stores/appStore';
import type { SceneConfig } from '../types/index';

interface SceneEditModalProps {
  isOpen: boolean;
  onClose: () => void;
  sceneId: string | null; // null = creating new scene
}

export default function SceneEditModal({ isOpen, onClose, sceneId }: SceneEditModalProps) {
  const { scenes, availableTools, addScene, updateScene } = useAppStore();
  const [name, setName] = useState('');
  const [prompt, setPrompt] = useState('');
  const [tools, setTools] = useState<string[]>([]);

  const isEditing = sceneId !== null;

  useEffect(() => {
    if (isOpen) {
      if (sceneId) {
        const scene = scenes.find(s => s.id === sceneId);
        if (scene) {
          setName(scene.name);
          setPrompt(scene.systemPrompt);
          setTools([...scene.tools]);
        }
      } else {
        setName('');
        setPrompt('');
        setTools([]);
      }
    }
  }, [isOpen, sceneId, scenes]);

  const toggleTool = (toolId: string) => {
    setTools(prev =>
      prev.includes(toolId) ? prev.filter(id => id !== toolId) : [...prev, toolId]
    );
  };

  const handleSave = () => {
    if (!name.trim()) return;
    if (isEditing && sceneId) {
      updateScene(sceneId, { name: name.trim(), systemPrompt: prompt, tools });
    } else {
      addScene({ name: name.trim(), icon: '✏️', systemPrompt: prompt, tools });
    }
    onClose();
  };

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
          width: '440px',
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
          <h3 style={{ fontSize: '17px', fontWeight: 600 }}>
            {isEditing ? '✏️ 编辑场景' : '✏️ 新建场景'}
          </h3>
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
          <div style={{ marginBottom: '14px' }}>
            <div style={{
              fontSize: '12px', fontWeight: 500, color: 'var(--text-tertiary)',
              textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '5px',
            }}>
              场景名称
            </div>
            <input
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="输入场景名称..."
              style={{
                width: '100%', padding: '9px 11px',
                background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)',
                borderRadius: '6px', color: 'var(--text-primary)',
                fontFamily: 'var(--font-mono)', fontSize: '14px',
                outline: 'none',
              }}
            />
          </div>

          <div style={{ marginBottom: '14px' }}>
            <div style={{
              fontSize: '12px', fontWeight: 500, color: 'var(--text-tertiary)',
              textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '5px',
            }}>
              系统提示词
            </div>
            <textarea
              value={prompt}
              onChange={e => setPrompt(e.target.value)}
              placeholder="定义这个场景的角色和行为..."
              style={{
                width: '100%', padding: '9px 11px', minHeight: '72px',
                background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)',
                borderRadius: '6px', color: 'var(--text-primary)',
                fontFamily: 'var(--font-mono)', fontSize: '14px',
                outline: 'none', resize: 'vertical', lineHeight: 1.5,
              }}
            />
          </div>

          <div>
            <div style={{
              fontSize: '12px', fontWeight: 500, color: 'var(--text-tertiary)',
              textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '5px',
            }}>
              关联工具{' '}
              <span style={{ fontWeight: 400, letterSpacing: 0, textTransform: 'none', fontSize: '11px' }}>
                （点击切换启用/禁用）
              </span>
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '5px' }}>
              {availableTools.map(tool => {
                const active = tools.includes(tool.id);
                return (
                  <span
                    key={tool.id}
                    onClick={() => toggleTool(tool.id)}
                    style={{
                      fontSize: '13px', padding: '4px 10px', borderRadius: '12px',
                      background: active ? 'rgba(91,156,245,0.08)' : 'transparent',
                      border: `1px solid ${active ? 'rgba(91,156,245,0.2)' : 'var(--border-default)'}`,
                      color: active ? 'var(--accent-blue)' : 'var(--text-tertiary)',
                      cursor: 'pointer', transition: 'all 0.12s',
                      ...(active ? {} : { opacity: 0.4, textDecoration: 'line-through' }),
                    }}
                  >
                    {tool.icon} {tool.name.replace(tool.icon + ' ', '')}
                  </span>
                );
              })}
            </div>
          </div>

          <div style={{ marginTop: '16px', display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
            <button
              onClick={onClose}
              style={{
                padding: '8px 16px', fontSize: '14px', fontWeight: 500,
                borderRadius: '6px', border: '1px solid var(--border-subtle)',
                background: 'var(--bg-surface)', color: 'var(--text-secondary)', cursor: 'pointer',
              }}
            >
              取消
            </button>
            <button
              onClick={handleSave}
              disabled={!name.trim()}
              style={{
                padding: '8px 16px', fontSize: '14px', fontWeight: 500,
                borderRadius: '6px', border: '1px solid var(--accent-blue)',
                background: 'var(--accent-blue)', color: 'white', cursor: 'pointer',
                opacity: name.trim() ? 1 : 0.5,
              }}
            >
              {isEditing ? '保存' : '创建'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
