// __tests__/components/ToolSelector.test.tsx
import { render, screen, fireEvent } from '@testing-library/react';
import { vi, describe, beforeEach, test, expect } from 'vitest';
import ToolSelector from '../../src/components/ToolSelector';
import { useAppStore } from '../../src/stores/appStore';

vi.mock('../../src/stores/appStore');

describe('ToolSelector', () => {
  const mockSelectedTools = ['search', 'time'];
  const mockToggleTool = vi.fn();

  beforeEach(() => {
    (useAppStore as jest.Mock).mockReturnValue({
      selectedTools: mockSelectedTools,
      availableTools: [
        { id: 'search', name: '🔍 搜索', description: '搜索信息', icon: '🔍' },
        { id: 'calculator', name: '🧮 计算器', description: '执行计算', icon: '🧮' },
        { id: 'time', name: '⏰ 时间查询', description: '获取当前时间', icon: '⏰' }
      ],
      toggleTool: mockToggleTool
    });
  });

  test('renders tool selector', () => {
    render(<ToolSelector />);
    expect(screen.getByRole('heading', { name: '工具配置' })).toBeInTheDocument();
  });

  test('renders tool list', () => {
    render(<ToolSelector />);
    expect(screen.getByText('🔍 搜索')).toBeInTheDocument();
    expect(screen.getByText('🧮 计算器')).toBeInTheDocument();
    expect(screen.getByText('⏰ 时间查询')).toBeInTheDocument();
  });

  test('toggles tool selection', () => {
    render(<ToolSelector />);
    const calculatorCheckbox = screen.getByLabelText('🧮 计算器');
    fireEvent.click(calculatorCheckbox);

    expect(mockToggleTool).toHaveBeenCalledWith('calculator');
  });

  test('shows selected tools as checked', () => {
    render(<ToolSelector />);
    const searchCheckbox = screen.getByLabelText('🔍 搜索');
    const timeCheckbox = screen.getByLabelText('⏰ 时间查询');
    const calculatorCheckbox = screen.getByLabelText('🧮 计算器');

    expect(searchCheckbox).toBeChecked();
    expect(timeCheckbox).toBeChecked();
    expect(calculatorCheckbox).not.toBeChecked();
  });
});
