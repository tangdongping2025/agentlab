import React from 'react';
import LobsterAvatar from './LobsterAvatar';

/** 龙虾队列前进动画(用于 header)。多只龙虾横向排队循环左移,每只仍眨眼挥钳。
 *  track 放两份相同序列,translateX 0→-50% 实现无缝循环。 */
const LobsterParade: React.FC<{ count?: number; size?: number }> = ({ count = 4, size = 26 }) => (
  <div className="lobster-parade" aria-hidden data-testid="lobster-parade">
    <div className="lobster-parade-track">
      {Array.from({ length: count * 2 }).map((_, i) => (
        <LobsterAvatar key={i} size={size} />
      ))}
    </div>
  </div>
);

export default LobsterParade;
