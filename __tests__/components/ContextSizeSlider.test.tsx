import { render, screen, fireEvent } from '@testing-library/react';
import ContextSizeSlider from '../../src/components/ContextSizeSlider';
import { useAppStore } from '../../src/stores/appStore';
import { formatNumber } from '../../src/utils/formatters';
import { vi } from 'vitest';

vi.mock('../../src/stores/appStore');

describe('ContextSizeSlider', () => {
  const mockContextSize = 32768;
  const mockSetContextSize = vi.fn();

  beforeEach(() => {
    (useAppStore as vi.Mock).mockReturnValue({
      contextSize: mockContextSize,
      setContextSize: mockSetContextSize
    });
  });

  test('renders slider element', () => {
    render(<ContextSizeSlider />);
    expect(screen.getByLabelText('上下文大小')).toBeInTheDocument();
  });

  test('displays current size label', () => {
    render(<ContextSizeSlider />);
    expect(screen.getByText(formatNumber(mockContextSize))).toBeInTheDocument();
  });

  test('changes context size when slider is dragged', () => {
    render(<ContextSizeSlider />);
    const slider = screen.getByLabelText('上下文大小');
    fireEvent.change(slider, { target: { value: 65536 } });

    expect(mockSetContextSize).toHaveBeenCalledWith(65536);
  });

  test('displays min and max values', () => {
    render(<ContextSizeSlider />);
    expect(screen.getByText('1,024')).toBeInTheDocument();
    expect(screen.getByText('1,048,576')).toBeInTheDocument();
  });
});
