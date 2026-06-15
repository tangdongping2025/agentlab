import React, { useCallback, useRef } from 'react';

interface Props {
  direction: 'horizontal' | 'vertical';  // horizontal=左右拖(调宽), vertical=上下拖(调高)
  onResize: (delta: number) => void;      // delta = 鼠标位移(正/负)
}

const ResizeHandle: React.FC<Props> = ({ direction, onResize }) => {
  const startPos = useRef(0);
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    startPos.current = direction === 'horizontal' ? e.clientX : e.clientY;
    const onMove = (ev: MouseEvent) => {
      const cur = direction === 'horizontal' ? ev.clientX : ev.clientY;
      onResize(cur - startPos.current);
      startPos.current = cur;
    };
    const onUp = () => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
    document.body.style.cursor = direction === 'horizontal' ? 'col-resize' : 'row-resize';
    document.body.style.userSelect = 'none';
  }, [direction, onResize]);

  const isH = direction === 'horizontal';
  return (
    <div
      onMouseDown={handleMouseDown}
      style={{
        flexShrink: 0,
        width: isH ? 5 : '100%',
        height: isH ? '100%' : 5,
        cursor: isH ? 'col-resize' : 'row-resize',
        background: 'var(--border-subtle)',
        transition: 'background 0.15s',
      }}
      onMouseEnter={e => (e.currentTarget.style.background = 'var(--accent-blue)')}
      onMouseLeave={e => (e.currentTarget.style.background = 'var(--border-subtle)')}
    />
  );
};

export default ResizeHandle;
