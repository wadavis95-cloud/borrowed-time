import { MAPS } from './maps.js';

// These identities are cosmetic: all runners use the same movement rules.
export const AVATAR_IDS = MAPS.tunnel.avatars;
export const ALL_AVATAR_IDS = Object.freeze(Object.values(MAPS).flatMap(map => map.avatars));

export const AVATARS = Object.freeze({
  mountaineer: Object.freeze({ id: 'mountaineer', name: 'Mountaineer', description: 'Red insulated jacket, knitted cap and expedition pack.' }),
  medic: Object.freeze({ id: 'medic', name: 'Rescue Medic', description: 'White and coral rescue coat, medical pack and winter headband.' }),
  guide: Object.freeze({ id: 'guide', name: 'Expedition Guide', description: 'Blue expedition parka, goggles and rope harness.' }),
  snowranger: Object.freeze({ id: 'snowranger', name: 'Snow Ranger', description: 'Ochre winter coat, fur collar and green field pack.' }),
  pilot: Object.freeze({ id: 'pilot', name: 'Pilot', description: 'Blue flight suit, white flight helmet and compact oxygen pack.' }),
  flightengineer: Object.freeze({ id: 'flightengineer', name: 'Flight Engineer', description: 'Orange utility suit, tool harness and protective headgear.' }),
  scientist: Object.freeze({ id: 'scientist', name: 'Scientist', description: 'White station coat, cyan collar and sensor pack.' }),
  officer: Object.freeze({ id: 'officer', name: 'Station Officer', description: 'Navy uniform, gold shoulder trim and communications headset.' }),
  explorer: Object.freeze({ id: 'explorer', name: 'Explorer', description: 'Coral desert shirt, sun hat and canvas expedition pack.' }),
  archaeologist: Object.freeze({ id: 'archaeologist', name: 'Archaeologist', description: 'Cream field jacket, broad hat and leather equipment case.' }),
  caravanscout: Object.freeze({ id: 'caravanscout', name: 'Caravan Scout', description: 'Turquoise scarf, sand-colored tunic and travel pack.' }),
  mechanic: Object.freeze({ id: 'mechanic', name: 'Desert Mechanic', description: 'Rust workwear, dust goggles and utility belt.' }),
  captain: Object.freeze({ id: 'captain', name: 'Captain', description: 'Tall captain with a tricorn hat, long navy coat and gold shoulder trim.' }),
  navigator: Object.freeze({ id: 'navigator', name: 'Navigator', description: 'Silver-haired navigator with a teal coat, compass pouch and head scarf.' }),
  shipwright: Object.freeze({ id: 'shipwright', name: 'Shipwright', description: 'Broad shipwright with leather apron, tool belt and red bandanna.' }),
  deckhand: Object.freeze({ id: 'deckhand', name: 'Deckhand', description: 'Compact deckhand in a striped sailor shirt and bright red sash.' }),
  scout: Object.freeze({ id: 'scout', name: 'Trail Scout', description: 'Agile scout with a coral vest, high ponytail and small trail pack.' }),
  botanist: Object.freeze({ id: 'botanist', name: 'Botanist', description: 'Botanist with a broad sun hat, sage field jacket and specimen pack.' }),
  ranger: Object.freeze({ id: 'ranger', name: 'Jungle Ranger', description: 'Tall ranger with a wide brim hat, ochre shirt and field harness.' }),
  volcanologist: Object.freeze({ id: 'volcanologist', name: 'Volcanologist', description: 'Broad scientist with a white field helmet, orange suit and instrument pack.' }),
  courier: Object.freeze({
    id: 'courier', name: 'Courier',
    description: 'A quick-footed courier with a curly ponytail, burgundy jacket and satchel.',
  }),
  engineer: Object.freeze({
    id: 'engineer', name: 'Engineer',
    description: 'A broad-shouldered engineer with copper hair, work overalls and goggles.',
  }),
  guard: Object.freeze({
    id: 'guard', name: 'Station Guard',
    description: 'A tall, angular station guard with a silver braid and navy uniform.',
  }),
  runner: Object.freeze({
    id: 'runner', name: 'Rooftop Runner',
    description: 'A compact rooftop runner with cropped hair and a short green jacket.',
  }),
});
