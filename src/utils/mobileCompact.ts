export function applyMobileCompactMode(): void {
  const isCompact = window.innerWidth <= 768 || window.matchMedia('(pointer: coarse)').matches;
  document.body.classList.toggle('mobile-compact', isCompact);
}
