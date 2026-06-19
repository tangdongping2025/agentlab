import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import Markdown from './Markdown';
import CodeBlock from './CodeBlock';

describe('Yuanbao warm theme details', () => {
  it('uses warm markdown quote, table, link, and inline code styles', () => {
    const { container } = render(
      <Markdown content={'> 引用\n\n| 维度 | 说明 |\n|---|---|\n| A | B |\n\n[链接](https://example.com)\n\n`inline`'} />
    );

    const quote = container.querySelector('blockquote') as HTMLElement;
    const th = container.querySelector('th') as HTMLElement;
    const link = container.querySelector('a') as HTMLElement;
    const inlineCode = container.querySelector('p code') as HTMLElement;

    expect(quote.style.borderLeft).toContain('rgb(214, 207, 196)');
    expect(quote.style.color).toBe('rgb(85, 85, 85)');
    expect(th.style.background).toBe('rgb(237, 232, 223)');
    expect(link.style.color).toBe('rgb(37, 99, 235)');
    expect(inlineCode.style.background).toBe('rgb(237, 232, 223)');
  });

  it('uses a dark rounded code block compatible with warm chat cards', () => {
    const { container } = render(<CodeBlock language="ts" code="const a = 1;" />);

    const wrapper = container.firstElementChild as HTMLElement;
    const header = wrapper.firstElementChild as HTMLElement;

    expect(wrapper.style.borderRadius).toBe('8px');
    expect(header.style.background).toBe('rgb(30, 30, 30)');
  });
});
