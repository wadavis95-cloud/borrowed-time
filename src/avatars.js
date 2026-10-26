// These identities are cosmetic: all runners use the same movement rules.
export const AVATAR_IDS = Object.freeze(['courier', 'engineer', 'guard', 'runner']);

export const AVATARS = Object.freeze({
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
