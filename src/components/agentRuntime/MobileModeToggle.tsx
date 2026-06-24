import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';

/** 移动端模式切换浮动按钮(桌面端由 CSS 隐藏):
 *  - 对话模式(默认):body 无 mobile-full,mobile-compact-hidden 元素全部隐藏,对话最大化
 *  - 功能模式:body 加 mobile-full,取消隐藏,header/tab 栏/agent 切换栏全部显示 */
const MobileModeToggle: React.FC = () => {
  const [full, setFull] = useState(false);
  const toggle = () => {
    const next = !full;
    setFull(next);
    document.body.classList.toggle('mobile-full', next);
  };
  // 卸载时清理 class,避免泄漏到其他视图
  useEffect(() => () => { document.body.classList.remove('mobile-full'); }, []);
  return createPortal(
    <button className="mobile-mode-toggle" onClick={toggle} aria-label="切换对话/功能模式">
      {full ? '💬 对话' : '☰ 功能'}
    </button>,
    document.body
  );
};

export default MobileModeToggle;
