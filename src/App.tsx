import React, { useState, useEffect } from 'react';
import SettingsModal from './components/SettingsModal';
import HistoryPage from './components/HistoryPage';
import AgentRuntimeView from './components/agentRuntime/AgentRuntimeView';
import { useAppStore } from './stores/appStore';
import { useAgentRuntimeStore } from './stores/agentRuntimeStore';
import { migrateIfPending } from './services/migration';

const App: React.FC = () => {
  const {
    loadSessions, loadUserConfig,
  } = useAppStore();
  const resumeWorkspaceSession = useAgentRuntimeStore((state) => state.resumeWorkspaceSession);

  const [settingsOpen, setSettingsOpen] = useState(false);
  const [view, setView] = useState<'history' | 'agentRuntime'>('agentRuntime');

  const environmentLabel = import.meta.env.DEV ? 'dev开发环境' : 'docker生产环境';

  // Load persisted config and sessions on mount
  useEffect(() => {
    loadUserConfig();
    (async () => {
      await migrateIfPending();
      await loadSessions();
    })();
  }, []);

  // ESC to close modals
  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setSettingsOpen(false);
      }
    };
    window.addEventListener('keydown', handleEsc);
    return () => window.removeEventListener('keydown', handleEsc);
  }, []);

  return (
    <div style={{ height: '100vh', display: 'flex', flexDirection: 'column', background: '#F5F1EB' }}>
      {/* Header */}
      <header style={{
        height: 'var(--header-height)',
        background: '#F5F1EB',
        borderBottom: '1px solid #D6CFC4',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '0 16px', position: 'relative', zIndex: 100, flexShrink: 0,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <div style={{
              width: '20px', height: '20px',
              background: 'linear-gradient(135deg, var(--accent-blue), var(--accent-violet))',
              borderRadius: '5px',
            }} />
            <span style={{ fontWeight: 700, fontSize: '16px', letterSpacing: '-0.3px', color: '#1A1A1A' }}>AGENT LAB ({environmentLabel})</span>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <button
            onClick={() => setView(view === 'history' ? 'agentRuntime' : 'history')}
            title="历史会话"
            style={{
              width: '32px', height: '32px', background: 'transparent',
              border: '1px solid #D6CFC4', borderRadius: '6px',
              color: view === 'history' ? 'var(--accent-blue)' : 'var(--text-secondary)',
              cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
              <path d="M3 3v5h5" />
              <path d="M12 7v5l4 2" />
            </svg>
          </button>
          <button
            onClick={() => setSettingsOpen(true)}
            title="设置"
            style={{
              width: '32px', height: '32px', background: 'transparent',
              border: '1px solid #D6CFC4', borderRadius: '6px',
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

      {/* Main */}
      <main style={{
        marginLeft: '0',
        flex: 1, display: 'flex', flexDirection: 'column',
        transition: 'margin-left 0.3s cubic-bezier(0.4,0,0.2,1)',
        overflow: 'hidden',
      }}>
        {view === 'history' ? (
          <HistoryPage
            onBack={() => setView('agentRuntime')}
            onResumeSession={(session) => {
              resumeWorkspaceSession(session);
              setView('agentRuntime');
            }}
          />
        ) : (
          <AgentRuntimeView />
        )}
      </main>

      {/* Modals */}
      <SettingsModal isOpen={settingsOpen} onClose={() => setSettingsOpen(false)} />
    </div>
  );
};

export default App;
