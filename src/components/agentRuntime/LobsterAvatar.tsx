import React from 'react';
import './LobsterAvatar.css';

interface Props { size?: number; }

/** 龙虾 Agent 头像 SVG(眨眼 + 挥左钳动画),用于 header 替代纯文字描述。 */
const LobsterAvatar: React.FC<Props> = ({ size = 34 }) => (
  <svg width={size} height={size * 0.84} viewBox="0 0 500 400" xmlns="http://www.w3.org/2000/svg" style={{ flexShrink: 0 }} role="img" aria-label="龙虾 Agent">
    {/* 触须 */}
    <path d="M210 110 Q150 60 90 80" stroke="#c0392b" strokeWidth="3" fill="none" />
    <path d="M230 110 Q290 60 360 75" stroke="#c0392b" strokeWidth="3" fill="none" />
    {/* 身体 + 头 */}
    <ellipse cx="250" cy="200" rx="90" ry="65" fill="#e74c3c" />
    <ellipse cx="250" cy="195" rx="75" ry="50" fill="#c0392b" />
    <ellipse cx="220" cy="130" rx="55" ry="45" fill="#e74c3c" />
    {/* 眼睛(眨眼) */}
    <circle cx="205" cy="115" r="9" fill="#fff" />
    <circle cx="235" cy="115" r="9" fill="#fff" />
    <circle className="lobster-blink" cx="205" cy="117" r="5" fill="#000" />
    <circle className="lobster-blink" cx="235" cy="117" r="5" fill="#000" />
    {/* 左钳(挥手) */}
    <g className="lobster-wave">
      <path d="M160 210 Q90 200 60 250 Q50 290 90 280 Q110 260 130 270 Z" fill="#e74c3c" />
      <ellipse cx="75" cy="255" rx="25" ry="18" fill="#c0392b" />
    </g>
    {/* 右钳 */}
    <g>
      <path d="M340 210 Q410 200 440 250 Q450 290 410 280 Q390 260 370 270 Z" fill="#e74c3c" />
      <ellipse cx="425" cy="255" rx="25" ry="18" fill="#c0392b" />
    </g>
    {/* 腿 */}
    <path d="M200 260 Q180 310 160 340" stroke="#c0392b" strokeWidth="9" fill="none" strokeLinecap="round" />
    <path d="M225 270 Q210 320 195 350" stroke="#c0392b" strokeWidth="9" fill="none" strokeLinecap="round" />
    <path d="M275 270 Q290 320 305 350" stroke="#c0392b" strokeWidth="9" fill="none" strokeLinecap="round" />
    <path d="M300 260 Q320 310 340 340" stroke="#c0392b" strokeWidth="9" fill="none" strokeLinecap="round" />
    {/* 尾巴 */}
    <path d="M335 195 Q400 180 430 200 Q410 225 430 250 Q395 245 380 270 Q360 245 335 240 Z" fill="#e74c3c" />
    <path d="M335 210 Q390 210 415 225" stroke="#c0392b" strokeWidth="3" fill="none" />
  </svg>
);

export default LobsterAvatar;
