// __tests__/components/ToolSelector.test.tsx
import { render, screen, fireEvent } from '@testing-library/react';
import { vi, describe, beforeEach, test, expect } from 'vitest';
import ToolSelector from '../../src/components/ToolSelector';
import { useAppStore } from '../../src/stores/appStore';

vi.mock('../../src/stores/appStore');

describe('ToolSelector', () => {
  const mockSelectedTools = ['search', 'time'];
  const mockToggleTool = vi.fn();
  const mockSelectAllTools = vi.fn();
  const mockClearAllTools = vi.fn();

  beforeEach(() => {
    (useAppStore as jest.Mock).mockReturnValue({
      selectedTools: mockSelectedTools,
      availableTools: [
        { id: 'search', name: '🔍 搜索', description: '搜索信息', icon: '🔍' },
        { id: 'calculator', name: '🧮 计算器', description: '执行计算', icon: '🧮' },
        { id: 'time', name: '⏰ 时间查询', description: '获取当前时间', icon: '⏰' }
      ],
      toggleTool: mockToggleTool,
      selectAllTools: mockSelectAllTools,
      clearAllTools: mockClearAllTools
    });
  });

  // Helper function to expand the tool selector for tests
  const expandToolSelector = () => {
    const expandButton = screen.getByLabelText('展开工具配置');
    fireEvent.click(expandButton);
  };

  test('renders tool selector', () => {
    render(<ToolSelector />);
    expect(screen.getByRole('heading', { name: '工具配置' })).toBeInTheDocument();
  });

  test('renders collapsed state by default', () => {
    render(<ToolSelector />);
    expect(screen.getByText('点击 ▶ 查看工具配置 (2 个工具)')).toBeInTheDocument();
  });

  test('expands and shows tool list when expand button is clicked', () => {
    render(<ToolSelector />);
    expandToolSelector();

    expect(screen.getByText('🔍 搜索')).toBeInTheDocument();
    expect(screen.getByText('🧮 计算器')).toBeInTheDocument();
    expect(screen.getByText('⏰ 时间查询')).toBeInTheDocument();
  });

  test('toggles tool selection when tool is clicked', () => {
    render(<ToolSelector />);
    expandToolSelector();

    const calculatorCheckbox = screen.getByLabelText('🧮 计算器');
    fireEvent.click(calculatorCheckbox);

    expect(mockToggleTool).toHaveBeenCalledWith('calculator');
  });

  test('shows selected tools as checked when expanded', () => {
    render(<ToolSelector />);
    expandToolSelector();

    const searchCheckbox = screen.getByLabelText('🔍 搜索');
    const timeCheckbox = screen.getByLabelText('⏰ 时间查询');
    const calculatorCheckbox = screen.getByLabelText('🧮 计算器');

    expect(searchCheckbox).toBeChecked();
    expect(timeCheckbox).toBeChecked();
    expect(calculatorCheckbox).not.toBeChecked();
  });

  test('shows expand/contract button and toggles state correctly', () => {
    render(<ToolSelector />);

    // Initially collapsed
    expect(screen.getByLabelText('展开工具配置')).toBeInTheDocument();

    // Expand
    const expandButton = screen.getByLabelText('展开工具配置');
    fireEvent.click(expandButton);

    // Now expanded
    expect(screen.getByLabelText('收起工具配置')).toBeInTheDocument();

    // Contract
    const contractButton = screen.getByLabelText('收起工具配置');
    fireEvent.click(contractButton);

    // Collapsed again
    expect(screen.getByLabelText('展开工具配置')).toBeInTheDocument();
  });
});
