import React, { useState, useEffect } from 'react';
import ConfigSidebar from './components/ConfigSidebar';
import ChatInteraction from './components/ChatInteraction';
import BottomPanel from './components/BottomPanel';
import SettingsModal from './components/SettingsModal';
import SceneEditModal from './components/SceneEditModal';
import { useAppStore } from './stores/appStore';
import { migrateIfPending } from './services/migration';

const App: React.FC = () => {
  const {
    sidebarOpen, toggleSidebar, contextSize,
    currentSessionId, loadSessions, loadUserConfig, createSession, saveCurrentSession,
    conversationHistory,
  } = useAppStore();

  const [settingsOpen, setSettingsOpen] = useState(false);
  const [sceneEditOpen, setSceneEditOpen] = useState(false);
  const [editingSceneId, setEditingSceneId] = useState<string | null>(null);

  const sizeLabels: Record<number, string> = {
    4096: '4K', 8192: '8K', 32768: '32K', 131072: '128K', 1048576: '1M',
  };
  const sizeLabel = sizeLabels[contextSize] || `${(contextSize / 1024).toFixed(0)}K`;

  // Load persisted config and sessions on mount
  useEffect(() => {
    loadUserConfig();
    (async () => {
      await migrateIfPending();
      await loadSessions();
    })();
  }, []);

  const handleNewChat = () => {
    if (currentSessionId) saveCurrentSession();
    createSession();
  };

  const handleEditScene = (sceneId: string | null) => {
    setEditingSceneId(sceneId);
    setSceneEditOpen(true);
  };

  const handleCloseSceneEdit = () => {
    setSceneEditOpen(false);
    setEditingSceneId(null);
  };

  // ESC to close modals
  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setSettingsOpen(false);
        setSceneEditOpen(false);
      }
    };
    window.addEventListener('keydown', handleEsc);
    return () => window.removeEventListener('keydown', handleEsc);
  }, []);

  return (
    <div style={{ height: '100vh', display: 'flex', flexDirection: 'column', background: 'var(--bg-deep)' }}>
      {/* Header */}
      <header style={{
        height: 'var(--header-height)',
        background: 'var(--bg-base)',
        borderBottom: '1px solid var(--border-subtle)',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '0 16px', position: 'relative', zIndex: 100, flexShrink: 0,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <button
            onClick={toggleSidebar}
            style={{
              width: '32px', height: '32px', background: 'transparent',
              border: '1px solid var(--border-default)', borderRadius: '6px',
              color: 'var(--text-secondary)', cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}
            title="切换侧栏"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M3 12h18M3 6h18M3 18h18" />
            </svg>
          </button>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <div style={{
              width: '20px', height: '20px',
              background: 'linear-gradient(135deg, var(--accent-blue), var(--accent-violet))',
              borderRadius: '5px',
            }} />
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              <span style={{ fontWeight: 700, fontSize: '16px', letterSpacing: '-0.3px' }}>AGENT LAB (docker全流程)</span>
              <span style={{ fontSize: '10px', fontWeight: 700, letterSpacing: '-0.3px' }}>
                git push → Actions → ghcr.io → Watchtower 自动部署
              </span>
            </div>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{
            fontFamily: 'var(--font-mono)', fontSize: '13px',
            padding: '3px 8px', background: 'var(--bg-surface)',
            border: '1px solid var(--border-subtle)', borderRadius: '4px',
            color: 'var(--text-secondary)',
          }}>
            Claude 3.5 Sonnet
          </span>
          <span style={{
            fontFamily: 'var(--font-mono)', fontSize: '13px',
            padding: '3px 8px', background: 'rgba(91,156,245,0.1)',
            border: '1px solid rgba(91,156,245,0.2)', borderRadius: '4px',
            color: 'var(--accent-blue)',
          }}>
            {sizeLabel}
          </span>
          <button
            onClick={() => setSettingsOpen(true)}
            title="设置"
            style={{
              width: '32px', height: '32px', background: 'transparent',
              border: '1px solid var(--border-default)', borderRadius: '6px',
              color: 'var(--text-secondary)', cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M12.22 2h-.44a2 2 0 00-2 2v.18a2 2 0 01-1 1.73l-.43.25a2 2 0 01-2 0l-.15-.08a2 2 0 00-2.73.73l-.22.38a2 2 0 00.73 2.73l.15.1a2 2 0 011 1.72v.51a2 2 0 01-1 1.74l-.15.09a2 2 0 00-.73 2.73l.22.38a2 2 0 002.73.73l.15-.08a2 2 0 012 0l.43.25a2 2 0 011 1.73V20a2 2 0 002 2h.44a2 2 0 002-2v-.18a2 2 0 011-1.73l.43-.25a2 2 0 012 0l.15.08a2 2 0 002.73-.73l.22-.39a2 2 0 00-.73-2.73l-.15-.08a2 2 0 01-1-1.74v-.5a2 2 0 011-1.74l.15-.09a2 2 0 00.73-2.73l-.22-.38a2 2 0 00-2.73-.73l-.15.08a2 2 0 01-2 0l-.43-.25a2 2 0 01-1-1.73V4a2 2 0 00-2-2z" />
              <circle cx="12" cy="12" r="3" />
            </svg>
          </button>
        </div>
      </header>

      {/* Sidebar */}
      <ConfigSidebar onEditScene={handleEditScene} onNewChat={handleNewChat} />

      {/* Main */}
      <main style={{
        marginLeft: sidebarOpen ? 'var(--sidebar-width)' : '0',
        flex: 1, display: 'flex', flexDirection: 'column',
        transition: 'margin-left 0.3s cubic-bezier(0.4,0,0.2,1)',
        overflow: 'hidden',
      }}>
        <>
          <ChatInteraction key={currentSessionId} />
          {conversationHistory.length > 0 && <BottomPanel />}
        </>
      </main>

      {/* Modals */}
      <SettingsModal isOpen={settingsOpen} onClose={() => setSettingsOpen(false)} />
      <SceneEditModal isOpen={sceneEditOpen} onClose={handleCloseSceneEdit} sceneId={editingSceneId} />
    </div>
  );
};

export default App;
