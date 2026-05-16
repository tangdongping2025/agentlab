import React from 'react';
import { useAppStore } from '../stores/appStore';
import SceneCards from './SceneCards';
import SessionList from './SessionList';

interface ConfigSidebarProps {
  onEditScene: (sceneId: string | null) => void;
  onNewChat: () => void;
}

export default function ConfigSidebar({ onEditScene, onNewChat }: ConfigSidebarProps) {
  const { sidebarOpen } = useAppStore();

  return (
    <nav style={{
      position: 'fixed',
      left: 0,
      top: 'var(--header-height)',
      width: 'var(--sidebar-width)',
      height: 'calc(100vh - var(--header-height))',
      background: 'var(--bg-base)',
      borderRight: '1px solid var(--border-subtle)',
      overflowY: 'auto',
      zIndex: 90,
      transform: sidebarOpen ? 'translateX(0)' : 'translateX(-100%)',
      transition: 'transform 0.3s cubic-bezier(0.4,0,0.2,1)',
      display: 'flex',
      flexDirection: 'column',
    }}>
      <SceneCards onEditScene={onEditScene} />
      <SessionList onNewChat={onNewChat} />
    </nav>
  );
}
