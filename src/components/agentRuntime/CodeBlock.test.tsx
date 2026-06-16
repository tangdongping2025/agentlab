import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import CodeBlock from './CodeBlock';

describe('CodeBlock', () => {
  beforeEach(() => {
    Object.assign(navigator, { clipboard: { writeText: vi.fn().mockResolvedValue(undefined) } });
  });
  it('renders language label + code', () => {
    render(<CodeBlock language="python" code="print('hi')" />);
    expect(screen.getByText('python')).toBeTruthy();
  });
  it('copy button writes code to clipboard', () => {
    render(<CodeBlock language="js" code="const x = 1" />);
    fireEvent.click(screen.getByText('复制'));
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith('const x = 1');
  });
  it('shows 已复制 after click', async () => {
    render(<CodeBlock language="js" code="x" />);
    fireEvent.click(screen.getByText('复制'));
    expect(await screen.findByText('已复制')).toBeTruthy();
  });
});
