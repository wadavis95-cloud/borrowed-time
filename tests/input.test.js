import test from 'node:test';
import assert from 'node:assert/strict';
import { createInputMode } from '../src/input.js';

function setup({ fine = false, coarse = false } = {}) {
  const queries = new Map();
  const changes = [];
  const mode = createInputMode({
    onChange: value => changes.push(value),
    matchMedia: query => {
      const listeners = new Set();
      const media = {
        matches: query.includes('any-pointer') ? fine : coarse,
        addEventListener: (_, fn) => listeners.add(fn),
        removeEventListener: (_, fn) => listeners.delete(fn),
        change(matches) { this.matches = matches; for (const fn of listeners) fn(); },
        listeners,
      };
      queries.set(query, media);
      return media;
    },
  });
  return { mode, queries, changes };
}

test('touch-only devices get touch controls while keyboard/mouse devices get key hints', () => {
  assert.equal(setup({ coarse: true }).mode.mode, 'touch');
  assert.equal(setup({ fine: true }).mode.mode, 'keyboard');
  assert.equal(setup({ coarse: true, fine: true }).mode.mode, 'keyboard');
  assert.equal(setup().mode.mode, 'keyboard', 'keyboard-only accessibility navigation remains supported');
});

test('hybrid devices switch on real input and suppress duplicate UI updates', () => {
  const { mode, changes } = setup({ fine: true, coarse: true });
  mode.pointer('touch');
  mode.pointer('pen');
  mode.keyboard();
  mode.pointer('touch');
  mode.pointer('mouse');
  mode.pointer('unknown');
  assert.deepEqual(changes, ['keyboard', 'touch', 'keyboard', 'touch', 'keyboard']);
});

test('capability changes update default layout without overriding actual input choice', () => {
  const { mode, queries } = setup({ coarse: true });
  queries.get('(any-pointer:fine)').change(true);
  assert.equal(mode.mode, 'keyboard');
  mode.pointer('touch');
  queries.get('(any-pointer:fine)').change(false);
  queries.get('(any-pointer:fine)').change(true);
  assert.equal(mode.mode, 'touch');
  mode.dispose();
  assert.ok([...queries.values()].every(query => query.listeners.size === 0));
});
