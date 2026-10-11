export function getBrandedGameCover(name: string): string | undefined {
  const normalized = String(name || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');
  const covers: Record<string, string> = {
    medusasstone: '/games/medusas-stone.png',
    medusastone: '/games/medusas-stone.png',
    fortunetiger: '/games/pg/fortune-tiger-clean-v1.png',
    fortuneox: '/games/pg/fortune-ox-clean-v1.png',
    fortunedragon: '/games/pg/fortune-dragon-clean-v1.png',
    fortunerabbit: '/games/pg/fortune-rabbit-clean-v1.png',
    fortunemouse: '/games/pg/fortune-mouse-clean-v1.png',
    bikiniparadise: '/games/pg/bikini-paradise-clean-v1.png',
    jungledelight: '/games/pg/jungle-delight-clean-v1.png',
    ganeshagold: '/games/pg/ganesha-gold-clean-v1.png',
    doublefortune: '/games/pg/double-fortune-clean-v1.png',
    dragontigerluck: '/games/pg/dragon-tiger-luck-clean-v1.png',
    butterflyblossom: '/games/pg/btrfly-blossom-clean-v1.png',
  };
  return covers[normalized];
}
