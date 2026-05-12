// __tests__/components/StrategySelector.test.tsx
import { render, screen, fireEvent } from '@testing-library/react';
import StrategySelector from '../../src/components/StrategySelector';
import { useAppStore } from '../../src/stores/appStore';

vi.mock('../../src/stores/appStore');

describe('StrategySelector', () => {
  const mockCurrentStrategy = 'sliding';
  const mockSetStrategy = vi.fn();

  beforeEach(() => {
    (useAppStore as vi.Mock).mockReturnValue({
      contextStrategy: mockCurrentStrategy,
      setStrategy: mockSetStrategy
    });
  });

  test('renders strategy select element', () => {
    render(<StrategySelector />);
    expect(screen.getByLabelText('上下文策略')).toBeInTheDocument();
  });

  test('displays selected strategy name', () => {
    render(<StrategySelector />);
    expect(screen.getByDisplayValue('滑动窗口')).toBeInTheDocument();
  });

  test('changes strategy when selected', () => {
    render(<StrategySelector />);
    const select = screen.getByLabelText('上下文策略');
    fireEvent.change(select, { target: { value: 'full' } });

    expect(mockSetStrategy).toHaveBeenCalledWith('full');
  });

  test('renders all strategy options', () => {
    render(<StrategySelector />);
    const options = screen.getAllByRole('option');
    expect(options.length).toBe(4);
  });
});