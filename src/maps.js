// Shared, data-only map registry. IDs cross the socket; names never select code.
export const MAP_IDS = Object.freeze(['tunnel', 'pirate', 'jungle']);
export const MAPS = Object.freeze({
  tunnel: Object.freeze({ id: 'tunnel', name: 'Tunnel Escape', tagline: 'Race into daylight.', thumbnail: '/assets/maps/tunnel.svg', seedSalt: 0,
    avatars: Object.freeze(['courier', 'engineer', 'guard', 'runner']), hazard: 'Falling roof', warning: 'Watch the amber markers. Dodge falling stone, then hop the rubble.' }),
  pirate: Object.freeze({ id: 'pirate', name: 'The Last Voyage', tagline: 'Outrun the sinking ship.', thumbnail: '/assets/maps/pirate.svg', seedSalt: 0x50495241,
    avatars: Object.freeze(['captain', 'navigator', 'shipwright', 'deckhand']), hazard: 'Cannon strike', warning: 'Watch the amber markers. Dodge incoming cannonballs, then hop the wreckage.' }),
  jungle: Object.freeze({ id: 'jungle', name: 'Volcanic Jungle', tagline: 'Escape the eruption.', thumbnail: '/assets/maps/jungle.svg', seedSalt: 0x4a554e47,
    avatars: Object.freeze(['scout', 'botanist', 'ranger', 'volcanologist']), hazard: 'Volcanic rock', warning: 'Watch the amber markers. Dodge volcanic rocks, then hop the cooled fragments.' }),
});
export const isMapId = id => typeof id === 'string' && MAP_IDS.includes(id);
export const getMap = id => MAPS[isMapId(id) ? id : 'tunnel'];
export function resolveMapVote(votes, fallback = 'tunnel', random = Math.random) {
  const counts = MAP_IDS.map(id => votes.filter(vote => vote === id).length);
  const most = Math.max(...counts);
  if (!most) return getMap(fallback).id;
  const winners = MAP_IDS.filter((id, i) => counts[i] === most);
  return winners[Math.min(winners.length - 1, Math.max(0, Math.floor(random() * winners.length)))];
}
