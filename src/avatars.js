import { MAPS } from './maps.js';

// These identities are cosmetic: all runners use the same movement rules.
export const AVATAR_IDS = MAPS.tunnel.avatars;
export const ALL_AVATAR_IDS = Object.freeze(Object.values(MAPS).flatMap(map => map.avatars));

export const AVATARS = Object.freeze({
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
