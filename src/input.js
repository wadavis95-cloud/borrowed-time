// Prefer the device's capabilities, then follow the player's actual input.
// Screen width alone cannot distinguish a phone from a narrow laptop window.
export function createInputMode({ matchMedia = query => globalThis.matchMedia(query), onChange = () => {} } = {}) {
  const fine = matchMedia('(any-pointer:fine)');
  const coarse = matchMedia('(pointer:coarse)');
  let preferred = null, current;
  function publish() {
    const next = preferred ?? (coarse.matches && !fine.matches ? 'touch' : 'keyboard');
    if (next !== current) { current = next; onChange(next); }
  }
  fine.addEventListener('change', publish);
  coarse.addEventListener('change', publish);
  publish();
  return {
    get mode() { return current; },
    keyboard() { preferred = 'keyboard'; publish(); },
    pointer(type) {
      if (!['touch', 'pen', 'mouse'].includes(type)) return;
      preferred = type === 'mouse' ? 'keyboard' : 'touch';
      publish();
    },
    dispose() {
      fine.removeEventListener('change', publish);
      coarse.removeEventListener('change', publish);
    },
  };
}
