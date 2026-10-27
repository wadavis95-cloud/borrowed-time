// Shared, data-only map registry. IDs cross the socket; names never select code.
export const MAP_IDS = Object.freeze(['tunnel', 'pirate', 'jungle', 'frozen', 'orbital', 'desert']);
export const MAPS = Object.freeze({
  tunnel: Object.freeze({ id: 'tunnel', name: 'Tunnel Escape', tagline: 'Race into daylight.', thumbnail: '/assets/maps/tunnel.svg', seedSalt: 0,
    avatars: Object.freeze(['courier', 'engineer', 'guard', 'runner']), hazard: 'Falling roof', warning: 'Watch the amber markers. Dodge falling stone, then hop the rubble.' }),
  pirate: Object.freeze({ id: 'pirate', name: 'The Last Voyage', tagline: 'Outrun the sinking ship.', thumbnail: '/assets/maps/pirate.svg', seedSalt: 0x50495241,
    avatars: Object.freeze(['captain', 'navigator', 'shipwright', 'deckhand']), hazard: 'Cannon strike', warning: 'Watch the amber markers. Dodge incoming cannonballs, then hop the wreckage.' }),
  jungle: Object.freeze({ id: 'jungle', name: 'Volcanic Jungle', tagline: 'Escape the eruption.', thumbnail: '/assets/maps/jungle.svg', seedSalt: 0x4a554e47,
    avatars: Object.freeze(['scout', 'botanist', 'ranger', 'volcanologist']), hazard: 'Volcanic rock', warning: 'Watch the amber markers. Dodge volcanic rocks, then hop the cooled fragments.' }),
  frozen: Object.freeze({ id: 'frozen', name: 'Frozen Summit', tagline: 'Stay ahead of the avalanche.', thumbnail: '/assets/maps/frozen.svg', seedSalt: 0x49434538,
    avatars: Object.freeze(['mountaineer','medic','guide','snowranger']), hazard: 'Falling ice', warning: 'Watch the amber markers. Dodge falling ice, then hop the fragments.',
    sky:'#bfddeb', fog:'#c6dfed', sun:'#deedff', impactColor:'#92d8ed', impactGlow:'#205066' }),
  orbital: Object.freeze({ id: 'orbital', name: 'Orbital Escape', tagline: 'Make it off the station.', thumbnail: '/assets/maps/orbital.svg', seedSalt: 0x53504143,
    avatars: Object.freeze(['pilot','flightengineer','scientist','officer']), hazard: 'Station fragments', warning: 'Watch the amber markers. Dodge falling station fragments, then hop the wreckage.',
    sky:'#101529', fog:'#17253d', sun:'#a9cfff', impactColor:'#8396ac', impactGlow:'#164b66' }),
  desert: Object.freeze({ id: 'desert', name: 'Sandstorm Canyon', tagline: 'Outrun the wall of sand.', thumbnail: '/assets/maps/desert.svg', seedSalt: 0x53414e44,
    avatars: Object.freeze(['explorer','archaeologist','caravanscout','mechanic']), hazard: 'Falling sandstone', warning: 'Watch the amber markers. Dodge falling sandstone, then hop the fragments.',
    sky:'#e8bf8a', fog:'#e5b580', sun:'#ffe0a4', impactColor:'#b96c42', impactGlow:'#000000' }),
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
