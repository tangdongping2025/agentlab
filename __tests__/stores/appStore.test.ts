// __tests__/stores/appStore.test.ts
import { renderHook, act } from '@testing-library/react';
import { useAppStore } from '../../src/stores/appStore';

describe('AppStore', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  test('should initialize with default values', () => {
    const { result } = renderHook(() => useAppStore());
    expect(result.current.currentScene).toBe('restaurant');
    expect(result.current.contextStrategy).toBe('sliding');
    expect(result.current.contextSize).toBe(32768);
  });

  test('should update scene correctly', () => {
    const { result } = renderHook(() => useAppStore());

    act(() => {
      result.current.setScene('research');
    });

    expect(result.current.currentScene).toBe('research');
  });

  test('should update strategy correctly', () => {
    const { result } = renderHook(() => useAppStore());

    act(() => {
      result.current.setStrategy('full');
    });

    expect(result.current.contextStrategy).toBe('full');
  });

  test('should toggle tool selection', () => {
    const { result } = renderHook(() => useAppStore());

    // 初始状态应该包含search
    expect(result.current.selectedTools).toContain('search');

    // 第一次toggle应该移除search
    act(() => {
      result.current.toggleTool('search');
    });

    expect(result.current.selectedTools).not.toContain('search');

    // 第二次toggle应该添加search
    act(() => {
      result.current.toggleTool('search');
    });

    expect(result.current.selectedTools).toContain('search');
  });
});
