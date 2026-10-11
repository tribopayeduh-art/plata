// Keep providerCode and game code intact: they identify the upstream wallet integration.
export const pgGameNames = [
  'Fortune Tiger', 'Fortune Ox', 'Fortune Dragon', 'Fortune Rabbit',
  'Fortune Mouse', 'Bikini Paradise', 'Jungle Delight', 'Ganesha Gold',
  'Double Fortune', 'Dragon Tiger Luck', 'Butterfly Blossom',
];
const normalize = value => String(value || '').toLowerCase().replace(/[^a-z0-9]/g, '');
export function classifyPgGame(game) {
  const index = pgGameNames.findIndex(name => normalize(name) === normalize(game.name) || normalize(name) === normalize(game.code));
  if (index < 0) return game;
  return { ...game, providerName: 'PG SOFT', category: 'PG SOFT', featured: true, sortOrder: -100 + index };
}
