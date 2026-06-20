import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import FilesPanel from './FilesPanel';
import { dbApi } from '../../services/dbApi';
import { useAgentRuntimeStore } from '../../stores/agentRuntimeStore';

vi.mock('../../services/dbApi');

const mockedFetchWorkspaceSettings = vi.mocked(dbApi.fetchWorkspaceSettings);
const mockedListFiles = vi.mocked(dbApi.listFiles);
const mockedSaveWorkspaceSettings = vi.mocked(dbApi.saveWorkspaceSettings);

describe('暖白主题可读性', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    useAgentRuntimeStore.setState({ workspaceCwd: '/workspace', workspaceCwdHistory: [] });
    mockedFetchWorkspaceSettings.mockResolvedValue({
      environment: 'container',
      rootDir: '/workspace',
      cwd: '/workspace',
      cwdHistory: ['/workspace'],
    });
    mockedListFiles.mockResolvedValue([
      { name: 'src', mtime: 1, size: 0, is_dir: true },
      { name: 'README.md', mtime: 1, size: 128, is_dir: false },
    ]);
    mockedSaveWorkspaceSettings.mockResolvedValue({
      environment: 'container',
      rootDir: '/workspace',
      cwd: '/workspace',
      cwdHistory: ['/workspace'],
    });
  });

  it('uses warm readable global tokens instead of dark theme tokens', () => {
    const css = readFileSync(resolve(process.cwd(), 'src/index.css'), 'utf-8');

    expect(css).not.toContain('--bg-surface: #161c2e');
    expect(css).not.toContain('--text-primary: #e8ecf4');
    expect(css).toContain('--bg-surface: #FFFDF9');
    expect(css).toContain('--text-primary: #1F2937');
    expect(css).toContain('--text-tertiary: #6B7280');
  });

  it('renders the file list with readable contrast and sizes', async () => {
    render(<FilesPanel />);

    const fileName = await screen.findByText('📄 README.md');
    const meta = screen.getByText(/128 B/);
    const list = screen.getByTestId('files-panel-list');
    const currentPath = screen.getAllByText('/workspace').find(node => node.tagName === 'SPAN')!;

    expect(list.style.background).toBe('var(--bg-surface)');
    expect(fileName.parentElement?.style.fontSize).toBe('14px');
    expect(fileName.style.color).toBe('var(--text-primary)');
    expect(meta.style.fontSize).toBe('12px');
    expect(meta.style.color).toBe('var(--text-secondary)');
    expect(currentPath.parentElement?.style.color).toBe('var(--text-secondary)');
  });
});
