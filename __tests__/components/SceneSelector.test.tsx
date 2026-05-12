// __tests__/components/SceneSelector.test.tsx
import { render, screen, fireEvent } from '@testing-library/react';
import { vi, describe, beforeEach, test, expect } from 'vitest';
import SceneSelector from '../../src/components/SceneSelector';
import { useAppStore } from '../../src/stores/appStore';

vi.mock('../../src/stores/appStore');

describe('SceneSelector', () => {
  const mockCurrentScene = 'restaurant';
  const mockSetScene = vi.fn();

  beforeEach(() => {
    (useAppStore as jest.Mock).mockReturnValue({
      currentScene: mockCurrentScene,
      setScene: mockSetScene
    });
  });

  test('renders scene select element', () => {
    render(<SceneSelector />);
    expect(screen.getByLabelText('场景配置')).toBeInTheDocument();
  });

  test('displays selected scene name', () => {
    render(<SceneSelector />);
    expect(screen.getByDisplayValue('餐厅预订助手')).toBeInTheDocument();
  });

  test('changes scene when selected', () => {
    render(<SceneSelector />);
    const select = screen.getByLabelText('场景配置');
    fireEvent.change(select, { target: { value: 'research' } });

    expect(mockSetScene).toHaveBeenCalledWith('research');
  });

  test('renders all scene options', () => {
    render(<SceneSelector />);
    const options = screen.getAllByRole('option');
    expect(options.length).toBeGreaterThan(3); // 4个预设场景 + 默认option
  });
});