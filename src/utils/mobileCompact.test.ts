import { describe, expect, it, vi, beforeEach } from 'vitest';
import { applyMobileCompactMode } from './mobileCompact';

describe('applyMobileCompactMode', () => {
  beforeEach(() => {
    document.body.className = '';
    vi.stubGlobal('innerWidth', 1024);
    window.matchMedia = vi.fn().mockReturnValue({ matches: false });
  });

  it('enables mobile compact mode for coarse pointer devices', () => {
    window.matchMedia = vi.fn().mockReturnValue({ matches: true });

    applyMobileCompactMode();

    expect(document.body).toHaveClass('mobile-compact');
  });

  it('enables mobile compact mode for narrow viewports', () => {
    vi.stubGlobal('innerWidth', 390);

    applyMobileCompactMode();

    expect(document.body).toHaveClass('mobile-compact');
  });
});
