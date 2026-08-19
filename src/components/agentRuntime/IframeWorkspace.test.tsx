import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import IframeWorkspace from './IframeWorkspace';
import AgentWorkspace from './AgentWorkspace';
import { useAgentRuntimeStore } from '../../stores/agentRuntimeStore';

const iframeAgent = {
  id: 'dsh', name: 'DeepSeek Harness', description: 'dsh',
  workspace: { type: 'iframe' as const, url: 'http://47.97.66.45:3080/?token=t' },
  capabilities: [],
};

describe('IframeWorkspace', () => {
  beforeEach(() => {
    useAgentRuntimeStore.setState({ agents: [iframeAgent], currentAgentId: 'dsh' });
  });

  it('渲染 iframe 指向 workspace.url', () => {
    render(<IframeWorkspace />);
    const frame = screen.getByTestId('dsh-iframe');
    expect(frame).toHaveAttribute('src', 'http://47.97.66.45:3080/?token=t');
  });

  it('提供新窗口打开按钮', () => {
    render(<IframeWorkspace />);
    expect(screen.getByTestId('dsh-open-external')).toHaveAttribute(
      'href', 'http://47.97.66.45:3080/?token=t',
    );
  });

  it('url 为空时显示未配置提示', () => {
    useAgentRuntimeStore.setState({
      agents: [{ ...iframeAgent, workspace: { type: 'iframe', url: '' } }],
    });
    render(<IframeWorkspace />);
    expect(screen.getByTestId('dsh-unconfigured')).toBeInTheDocument();
  });

  it('AgentWorkspace 按 iframe 类型分发到 IframeWorkspace', () => {
    render(<AgentWorkspace />);
    expect(screen.getByTestId('dsh-iframe')).toBeInTheDocument();
  });
});
