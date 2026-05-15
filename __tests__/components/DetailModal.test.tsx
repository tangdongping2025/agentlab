// __tests__/components/DetailModal.test.tsx
import { render, screen, fireEvent } from '@testing-library/react';
import { vi, describe, beforeEach, test, expect } from 'vitest';
import DetailModal from '../../src/components/DetailModal';

describe('DetailModal', () => {
  const mockOnClose = vi.fn();

  test('does not render when closed', () => {
    render(<DetailModal isOpen={false} onClose={mockOnClose} title="测试标题" content="测试内容" />);
    expect(screen.queryByText('测试标题')).not.toBeInTheDocument();
  });

  test('renders when open', () => {
    render(<DetailModal isOpen={true} onClose={mockOnClose} title="测试标题" content="测试内容" />);
    expect(screen.getByText('测试标题')).toBeInTheDocument();
    expect(screen.getByText('测试内容')).toBeInTheDocument();
  });

  test('calls onClose when close button is clicked', () => {
    render(<DetailModal isOpen={true} onClose={mockOnClose} title="测试标题" content="测试内容" />);
    const closeButton = screen.getByLabelText('关闭');
    fireEvent.click(closeButton);
    expect(mockOnClose).toHaveBeenCalled();
  });

  test('calls onClose when clicking outside', () => {
    render(<DetailModal isOpen={true} onClose={mockOnClose} title="测试标题" content="测试内容" />);
    const backdrop = screen.getByTestId('modal-backdrop');
    fireEvent.click(backdrop);
    expect(mockOnClose).toHaveBeenCalled();
  });

  test('renders copy button', () => {
    render(<DetailModal isOpen={true} onClose={mockOnClose} title="测试标题" content="测试内容" />);
    expect(screen.getByText('复制')).toBeInTheDocument();
  });
});
