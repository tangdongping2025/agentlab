import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import CodeBlock from './CodeBlock';

describe('CodeBlock', () => {
  beforeEach(() => {
    Object.assign(navigator, { clipboard: { writeText: vi.fn().mockResolvedValue(undefined) } });
  });
  it('renders language label + code with a warm light surface', () => {
    const { container } = render(<CodeBlock language="python" code="print('hi')" />);
    const wrapper = container.firstElementChild as HTMLElement;
    const header = wrapper.firstElementChild as HTMLElement;

    expect(screen.getByText('python')).toBeTruthy();
    expect(wrapper.style.border).toContain('rgb(214, 207, 196)');
    expect(header.style.background).toBe('rgb(237, 232, 223)');
  });
  it('copy button writes code to clipboard', async () => {
    render(<CodeBlock language="js" code="const x = 1" />);
    fireEvent.click(screen.getByText('复制'));
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith('const x = 1');
    expect(await screen.findByText('已复制')).toBeTruthy();
  });
  it('shows 已复制 after click', async () => {
    render(<CodeBlock language="js" code="x" />);
    fireEvent.click(screen.getByText('复制'));
    expect(await screen.findByText('已复制')).toBeTruthy();
  });
  it('constrains width to parent and scrolls long code horizontally inside the block', () => {
    const longLine = 'const x = "' + 'a'.repeat(500) + '";';
    const { container } = render(<CodeBlock language="js" code={longLine} />);
    const wrapper = container.firstElementChild as HTMLElement;
    expect(wrapper.style.maxWidth).toBe('100%');
    const scroll = wrapper.querySelector('[data-testid="codeblock-scroll"]') as HTMLElement;
    expect(scroll).toBeTruthy();
    expect(scroll.style.overflowX).toBe('auto');
  });
});
