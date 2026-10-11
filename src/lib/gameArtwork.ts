export function getBrandedGameCover(name: string): string | undefined {
  const normalized = String(name || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');
  const covers: Record<string, string> = {
    medusasstone: '/games/medusas-stone.png',
    medusastone: '/games/medusas-stone.png',
    fortunetiger: '/games/fortune-tiger.png',
    fortunemouse: '/games/fortune-mouse.png',
  };
  return covers[normalized];
}
