// The coordinator: browser inputs, solo rules, multiplayer snapshots, 3D scene, and HUD.
import { CONFIG, ABILITIES, createGame, freshCourseSeed, startGame, pauseGame, resumeGame, moveLane, jump, buyAbility, updateGame } from './game.js';
import { createUnityRenderer } from './unity-renderer.js';
import { connectRace, createRaceView } from './network.js';
import { AVATARS } from './avatars.js';
import { createDemoRace } from './demo.js';
import { createGameAudio } from './audio.js';
import { createInputMode } from './input.js';

const $ = (id) => document.getElementById(id);
const canvas = $('game-canvas');
const audio = createGameAudio();
let renderer = null, graphicsError = '', graphicsLoading = true;
let graphicsProgress = 0;
const graphicsMessage = '3D graphics are unavailable. Try an up-to-date browser with graphics acceleration enabled, then reload.';
let game = createGame();
let soloSeed = 42;
let mode = 'solo';
let connection = null, snapshot = null, raceView = createRaceView();
let networkStatus = '', connectionGeneration = 0, rosterKey = '';
let lastOverlay = '', lastEvent = 0, toastUntil = 0;
let purchaseUntil = 0, purchaseFeedback = '';
let standingsKey = '';
let lastFrame = performance.now(), accumulator = 0;
const STEP = 1 / 60;
const inputMode = createInputMode({ onChange(mode) {
  document.documentElement.dataset.input = mode;
  lastOverlay = '';
  const touch = mode === 'touch';
  $('guide-move').textContent = touch ? 'Swipe sideways or tap ← / →.' : 'Press A / D or ← / →.';
  $('guide-hop').textContent = touch ? 'Swipe up, tap the course, or tap ↑.' : 'Press W or ↑.';
  $('guide-boost').textContent = touch ? 'Tap Boost.' : 'Press Q (or 1).';
  $('guide-leap').textContent = touch ? 'Tap Long jump.' : 'Press E (or 2).';
} });
const controlHint = () => inputMode.mode === 'touch'
  ? 'Swipe to move · Swipe up to hop · Tap abilities'
  : 'A / D move · W hop · Q boost · E long jump';
const guestName = `Runner ${100 + Math.floor(Math.random() * 900)}`;
$('player-name').placeholder = guestName;

$('boost-button').querySelector('.cost').firstChild.textContent = `−${ABILITIES.boost.cost}`;
$('long-jump-button').querySelector('.cost').firstChild.textContent = `−${ABILITIES.longJump.cost}`;
$('brief-boost-cost').textContent = `${ABILITIES.boost.cost}s`;
$('brief-jump-cost').textContent = `${ABILITIES.longJump.cost}s`;


async function prepareGraphics() {
  try {
    // Restore the last pre-Unity (V4) presentation as the normal game.
    // Keep the Unity study available only when explicitly requested.
    if (new URLSearchParams(location.search).get('graphics') !== 'unity') {
      const [{ createRenderer }, { preloadAvatars }] = await Promise.all([
        import('./renderer.js'), import('./graphics/avatars.js'),
      ]);
      await preloadAvatars();
      renderer = createRenderer(canvas);
    } else {
      renderer = await createUnityRenderer(canvas, { onProgress(progress) {
        graphicsProgress = Math.round(progress * 100);
        updateOverlay();
      } });
    }
  } catch (error) {
    console.error('Graphics initialization failed:', error);
    graphicsError = 'The game graphics could not load. Check your connection and browser, then reload to try again.';
  }
  graphicsLoading = false;
  updateHUD();
}

function showCourse() {
  ($('leaderboard').hidden ? canvas.closest('.arena') : $('leaderboard')).scrollIntoView({ block: 'start', behavior: 'auto' });
}

function notify(text, kind = 'info') {
  const message = text;
  $('event-toast').textContent = message;
  if (kind === 'ability') {
    purchaseUntil = performance.now() + 2600;
    purchaseFeedback = message;
  }
  $('event-toast').dataset.kind = kind;
  $('event-toast').classList.toggle('visible', kind !== 'ability');
  toastUntil = performance.now() + 1800;
}
function showNetworkError(message = '') {
  $('network-error').textContent = message;
  $('network-error').hidden = !message;
}
function resetVisuals() {
  renderer?.reset();
  audio.reset();
  lastEvent = 0;
  accumulator = 0;
  lastOverlay = '';
  lastFrame = performance.now();
  $('event-toast').classList.remove('visible');
  $('event-toast').textContent = '';
  purchaseUntil = 0;
  purchaseFeedback = '';
}
function returnToMenu() {
  connectionGeneration++;
  connection?.close();
  connection = null;
  snapshot = null;
  mode = 'solo';
  networkStatus = '';
  game = createGame();
  resetVisuals();
  showNetworkError();
  updateHUD();
}
function beginRun() {
  if (mode !== 'solo' || !renderer || graphicsError) return;
  soloSeed = freshCourseSeed(soloSeed);
  game = createGame({ seed: soloSeed, avatarId: game.avatarId });
  startGame(game);
  resetVisuals();
  showNetworkError();
  updateHUD();
  showCourse();
}
function joinRace(type) {
  if (!renderer || graphicsError) return;
  const code = $('join-code').value.trim().toUpperCase();
  if (type === 'join' && !/^[A-Z0-9]{6}$/.test(code)) {
    showNetworkError('Enter the six-character code from your friend’s room.');
    $('join-code').focus();
    return;
  }
  connection?.close();
  const generation = ++connectionGeneration;
  mode = type === 'demo' ? 'demo' : 'online';
  networkStatus = 'connecting';
  snapshot = null;
  rosterKey = '';
  raceView = createRaceView();
  game = createGame();
  resetVisuals();
  showNetworkError();
  const name = $('player-name').value.trim() || guestName;
  const callbacks = {
    onStatus(status) {
      if (generation !== connectionGeneration) return;
      networkStatus = status;
      updateRoom();
      updateHUD();
    },
    onError(message, code) {
      if (generation !== connectionGeneration) return;
      if (['ACTION_UNAVAILABLE', 'RATE_LIMIT', 'NOT_RACING'].includes(code)) notify(message, 'warning');
      else showNetworkError(message);
    },
    onSnapshot(next) {
      if (generation !== connectionGeneration) return;
      const starting = next.room.phase === 'countdown' && snapshot?.room.phase !== 'countdown';
      if (next.room.roundId !== snapshot?.room.roundId) resetVisuals();
      snapshot = next;
      raceView.push(next, performance.now());
      // HUD uses the newest authoritative values; drawing blends positions separately.
      game = raceView.sample(performance.now() + 50).game;
      updateRoom();
      updateHUD();
      if (starting) showCourse();
    },
  };
  connection = type === 'demo' ? createDemoRace(callbacks)
    : connectRace({ ...callbacks, initialMessage: { type, code, name } });
  updateRoom();
  updateHUD();
}
function updateRoom() {
  const demo = mode === 'demo';
  $('leave-room').textContent = demo ? 'Exit demo' : 'Leave room';
  $('room-code').textContent = snapshot?.room.code || '······';
  if (networkStatus === 'disconnected') $('room-status').textContent = 'Disconnected. Return to the menu to join a new race.';
  else if (!snapshot) $('room-status').textContent = 'Connecting to the race server…';
  else {
    const count = snapshot.players.filter(player => player.connected).length;
    $('room-status').textContent = demo
      ? snapshot.room.phase === 'finished' ? 'Demo complete' : '4 demo racers'
      : snapshot.room.phase === 'lobby'
      ? `${count}/4 racers · Share code to invite`
      : snapshot.room.phase === 'countdown' ? 'Get ready'
      : snapshot.room.phase === 'finished' ? 'Race complete'
      : `${count} racers`;
  }
  const key = JSON.stringify([snapshot?.players.map(p => [p.id, p.name, p.connected, p.color, p.avatarId]), snapshot?.room.hostId]);
  if (key !== rosterKey) {
    rosterKey = key;
    $('room-players').replaceChildren();
    for (const player of snapshot?.players || []) {
      const li = document.createElement('li');
      const dot = document.createElement('i');
      dot.style.backgroundColor = player.color;
      li.append(dot, document.createTextNode(`${player.name}${player.id === snapshot.you.id && !demo ? ' (you)' : ''} · ${AVATARS[player.avatarId]?.name || 'Runner'}${player.id === snapshot.room.hostId && !demo ? ' · host' : ''}${player.connected ? '' : ' · left'}`));
      $('room-players').append(li);
    }
  }
  $('room-players').hidden = snapshot?.room.phase === 'racing';
}

function updateLeaderboard() {
  const visible = mode !== 'solo' && Boolean(snapshot?.standings);
  $('leaderboard').hidden = !visible;
  if (!visible) { standingsKey = ''; return; }
  const finished = snapshot.room.phase === 'finished';
  const stale = networkStatus !== 'open';
  $('leaderboard-title').textContent = finished ? 'Race results' : 'Live standings';
  $('leaderboard-note').textContent = stale ? 'Connection lost · last known positions'
    : finished ? 'DNF = did not escape' : snapshot.room.phase === 'racing' ? '' : 'Waiting for the start';
  const rows = snapshot.standings.map(entry => ({ ...entry, ...snapshot.players.find(p => p.id === entry.id) }));
  // Only touch the DOM when order, identity or result changes, not every frame.
  const displayKey = JSON.stringify([snapshot.room.roundId, snapshot.you.id, mode,
    rows.map(p => [p.id, p.position, p.status, p.name, p.color])]);
  if (displayKey === standingsKey) return;
  standingsKey = displayKey;
  $('leaderboard-rows').replaceChildren(...rows.map(player => {
    const row = document.createElement('li');
    row.className = `standing ${player.status}`;
    row.classList.toggle('is-you', player.id === snapshot.you.id && mode !== 'demo');
    const place = document.createElement('strong');
    place.className = 'standing-place';
    place.textContent = player.position === null ? '—' : `${player.position}`;
    const name = document.createElement('span');
    name.className = 'standing-name';
    name.textContent = `${player.name}${player.id === snapshot.you.id && mode !== 'demo' ? ' (you)' : ''}`;
    name.title = name.textContent;
    const dot = document.createElement('i');
    dot.style.backgroundColor = player.color;
    const status = document.createElement('small');
    status.textContent = ({ ready: 'Ready', racing: 'Racing', escaped: '✓ Escaped', dnf: 'DNF · time out', disconnected: 'DNF · left' })[player.status];
    row.append(place, dot, name, status);
    return row;
  }));
}
function togglePause() {
  if (mode !== 'solo') return;
  if (game.phase === 'running') pauseGame(game);
  else if (game.phase === 'paused') resumeGame(game);
  accumulator = 0;
  updateHUD();
}
function act(action) {
  if (!renderer || graphicsError || mode === 'demo') return;
  if (mode === 'online') {
    if (networkStatus === 'open' && snapshot?.room.phase === 'racing' && game.phase === 'running') connection.input(action);
    return;
  }
  if (action === 'left') moveLane(game, -1);
  else if (action === 'right') moveLane(game, 1);
  else if (action === 'jump') jump(game);
  else {
    const result = buyAbility(game, action);
    if (!result.ok && game.phase === 'running') notify(result.reason || 'Ability unavailable', 'error');
  }
  updateHUD();
}
function overlay(kicker, title, description, button, disabled = false, hint = '') {
  $('overlay-kicker').textContent = kicker;
  $('overlay-title').textContent = title;
  $('overlay-description').textContent = description;
  $('overlay-description').hidden = !description;
  $('start-button').textContent = button;
  $('start-button').disabled = disabled;
  $('overlay-hint').textContent = hint;
  $('overlay-hint').hidden = !hint;
  $('overlay-kicker').hidden = !kicker;
}
function updateOverlay() {
  const brief = !graphicsLoading && !graphicsError && (mode === 'solo' ? game.phase === 'ready'
    : ['lobby', 'countdown'].includes(snapshot?.room.phase));
  $('ability-brief').hidden = !brief;
  canvas.closest('.arena').classList.toggle('briefing', brief);
  if (graphicsLoading) {
    $('screen-overlay').hidden = false;
    overlay('INTO THE LIGHT', 'Preparing your escape.', `Loading the runner and tunnel… ${graphicsProgress}%`, 'Loading…', true);
    return;
  }
  if (graphicsError) {
    $('screen-overlay').hidden = false;
    overlay('GRAPHICS UNAVAILABLE', 'Let’s get you running.', graphicsError, 'Reload game →');
    return;
  }
  const ended = game.phase === 'won' || game.phase === 'lost';
  if (mode !== 'solo') {
    const room = snapshot?.room;
    const host = room?.hostId === snapshot?.you.id;
    $('screen-overlay').hidden = networkStatus === 'open' && room?.phase === 'racing' && !ended;
    if (networkStatus === 'disconnected') {
      overlay('CONNECTION LOST', 'The race moved on.', 'Your connection to the server ended. Return to the menu to create or join a room.', 'Back to menu →');
    } else if (!snapshot) {
      overlay('MULTIPLAYER', 'Joining the race.', 'Connecting to your room. Any connection errors appear above the course.', 'Back to menu →');
    } else if (room.phase === 'lobby') {
      const count = snapshot.players.filter(player => player.connected).length;
      if (mode === 'demo') {
        overlay('FOUR-PLAYER DEMO', 'Meet the runners.', '', 'Getting ready…', true, '');
        return;
      }
      overlay('60 SECONDS', 'First to escape wins.', 'Abilities cost seconds from your clock.', host ? 'Start race →' : 'Waiting for host…', !host || count < 2, count < 2 ? 'Invite a friend with the room code.' : controlHint());
    } else if (room.phase === 'countdown') {
      overlay('', `${room.countdown}`, '', 'Starting…', true, controlHint());
    } else if (ended) {
      const winner = snapshot.players.find(player => player.id === room.winnerId);
      const title = mode === 'demo'
        ? room.phase !== 'finished' ? 'The others are still racing.' : winner ? `${winner.name} wins.` : 'The tunnel won this round.'
        : room.phase !== 'finished' ? (game.phase === 'won' ? 'You escaped.' : 'Time ran out.')
        : winner ? (winner.id === snapshot.you.id ? 'You won the race.' : `${winner.name} won the race.`) : 'The tunnel won this round.';
      overlay(room.phase === 'finished' ? 'RACE COMPLETE' : 'WAITING FOR RUNNERS', title,
        room.phase === 'finished' ? '' : 'Waiting for the remaining racers.',
        room.phase !== 'finished' ? 'Race still in progress…' : mode === 'demo' ? 'Watch again →' : host ? 'Set up rematch →' : 'Waiting for host…', room.phase !== 'finished' || !host);
    }
    return;
  }
  $('screen-overlay').hidden = game.phase === 'running';
  if (game.phase === 'ready') overlay(`${CONFIG.initialTime} SECONDS`, 'Escape before zero.', 'Abilities cost seconds from your clock.', 'Play solo →', false, controlHint());
  else if (game.phase === 'paused') overlay('TAKE A BREATH', 'Time stands still.', '', 'Resume run →', false, 'Press P or ESC to resume');
  else if (ended) overlay(game.phase === 'won' ? 'ESCAPE COMPLETE' : 'THE CLOCK RAN OUT', game.phase === 'won' ? 'You escaped.' : 'Time ran out.', '', 'New run →');
}
function updateHUD() {
  updateLeaderboard();
  const online = mode !== 'solo';
  const running = Boolean(renderer) && !graphicsError && mode !== 'demo' && game.phase === 'running' && (!online || networkStatus === 'open');
  $('race-menu').hidden = online || ['running', 'paused'].includes(game.phase);
  $('page-heading').hidden = online || ['running', 'paused'].includes(game.phase);
  $('room-panel').hidden = !online;
  $('restart-button').hidden = online;
  $('race-mode-label').textContent = mode === 'demo' ? 'DEMO' : online ? 'MULTIPLAYER' : 'SOLO';
  $('avatar-label').textContent = AVATARS[game.avatarId]?.name || 'Runner';
  for (const id of ['create-room', 'join-room', 'restart-button']) $(id).disabled = !renderer || Boolean(graphicsError);
  $('demo-button').disabled = !renderer || Boolean(graphicsError) || online;
  $('time-value').textContent = Math.max(0, game.timeLeft).toFixed(1);
  $('time-fill').style.width = `${Math.min(100, game.timeLeft / CONFIG.initialTime * 100)}%`;
  $('time-value').closest('.clock-panel').classList.toggle('low', game.timeLeft < 15);
  $('status-label').textContent = online && networkStatus === 'disconnected' ? 'OFFLINE' : ({ ready:'READY', running:'RUNNING', paused:'PAUSED', won:'ESCAPED', lost:'TIME OUT' })[game.phase];
  $('boost-button').disabled = !running || game.timeLeft <= ABILITIES.boost.cost || game.boostCooldown > 0;
  $('long-jump-button').disabled = !running || game.timeLeft <= ABILITIES.longJump.cost || game.jumpKind === 'long';
  $('boost-button').classList.toggle('active', game.boostRemaining > 0);
  $('long-jump-button').classList.toggle('active', game.jumpKind === 'long');
  $('boost-button').classList.toggle('has-status', game.boostRemaining > 0 || game.boostCooldown > 0 || game.timeLeft <= ABILITIES.boost.cost);
  $('long-jump-button').classList.toggle('has-status', game.jumpKind === 'long' || game.timeLeft <= ABILITIES.longJump.cost);
  $('boost-description').textContent = game.boostRemaining > 0 ? `Boosting · ${Math.ceil(game.boostRemaining)}s left`
    : game.boostCooldown > 0 ? `Recharges in ${Math.ceil(game.boostCooldown)}s`
      : game.timeLeft <= ABILITIES.boost.cost ? 'Not enough time' : `${ABILITIES.boost.duration}s sprint`;
  $('jump-description').textContent = game.jumpKind === 'long' ? 'Long jump active'
    : game.timeLeft <= ABILITIES.longJump.cost ? 'Not enough time' : 'Clear barriers & gaps';
  const discovering = running && game.elapsed < 10 && game.timeSpent === 0;
  $('boost-button').closest('.abilities-panel').classList.toggle('discovering', discovering);
  const spent = performance.now() < purchaseUntil;
  $('time-value').closest('.clock-panel').classList.toggle('spent', spent);
  const clockNote = spent ? purchaseFeedback : '';
  $('clock-feedback').hidden = !spent;
  if ($('clock-feedback').textContent !== clockNote) $('clock-feedback').textContent = clockNote;
  $('pause-button').disabled = online || (!running && game.phase !== 'paused');
  $('pause-button').textContent = game.phase === 'paused' ? '▷' : 'Ⅱ';
  $('pause-button').setAttribute('aria-label', online ? 'Multiplayer cannot be paused' : game.phase === 'paused' ? 'Resume game' : 'Pause game');
  for (const id of ['left-button', 'right-button', 'hop-button']) $(id).disabled = !running;
  if (game.recentEvent && game.recentEvent.id !== lastEvent) {
    lastEvent = game.recentEvent.id;
    notify(game.recentEvent.text, game.recentEvent.kind);
  }
  const key = [graphicsLoading, graphicsError, mode, networkStatus, game.phase, snapshot?.room.phase, snapshot?.room.countdown, snapshot?.room.hostId, snapshot?.room.winnerId, rosterKey].join(':');
  if (key !== lastOverlay) { updateOverlay(); lastOverlay = key; }
}

$('start-button').addEventListener('click', () => {
  if (graphicsError) { window.location.reload(); return; }
  if (mode === 'solo') game.phase === 'paused' ? togglePause() : beginRun();
  else if (!snapshot || networkStatus === 'disconnected') returnToMenu();
  else if (snapshot.room.phase === 'lobby') connection.send({ type:'start' });
  else if (snapshot.room.phase === 'finished') connection.send({ type:'rematch' });
});
$('create-room').addEventListener('click', () => joinRace('create'));
$('join-room').addEventListener('click', () => joinRace('join'));
$('demo-button').addEventListener('click', () => joinRace('demo'));
$('join-code').addEventListener('keydown', event => { if (event.key === 'Enter') joinRace('join'); });
$('leave-room').addEventListener('click', returnToMenu);
$('restart-button').addEventListener('click', beginRun);
$('pause-button').addEventListener('click', togglePause);
$('sound-button').addEventListener('click', async () => {
  const button = $('sound-button');
  button.disabled = true;
  try { await audio.toggle(); }
  catch (error) { notify(error.message, 'warning'); }
  button.textContent = audio.enabled ? 'Sound on' : 'Sound off';
  button.setAttribute('aria-pressed', String(audio.enabled));
  button.disabled = false;
});
for (const [id, action] of [['boost-button','boost'], ['long-jump-button','longJump'], ['left-button','left'], ['right-button','right'], ['hop-button','jump']]) {
  $(id).addEventListener('click', () => act(action));
}
document.addEventListener('keydown', event => {
  if ($('guide-dialog').open || event.altKey || event.ctrlKey || event.metaKey || event.target.closest('input,textarea,select,[contenteditable="true"]')) return;
  const actions = { ArrowLeft:'left', KeyA:'left', ArrowRight:'right', KeyD:'right', ArrowUp:'jump', KeyW:'jump', KeyQ:'boost', KeyE:'longJump', Digit1:'boost', Digit2:'longJump' };
  if (actions[event.code] || ['KeyP', 'Escape'].includes(event.code)) {
    event.preventDefault();
    inputMode.keyboard();
    if (event.repeat) return;
    if (actions[event.code]) act(actions[event.code]);
    else togglePause();
  }
});
document.addEventListener('pointerdown', event => {
  // Keep an explicitly clicked on-screen control in place until its click fires.
  if (event.pointerType === 'mouse' && event.target.closest('.touch-controls')) return;
  inputMode.pointer(event.pointerType);
}, { passive: true });
let touchStart = null;
canvas.addEventListener('pointerdown', event => {
  touchStart = { x:event.clientX, y:event.clientY };
  canvas.setPointerCapture(event.pointerId);
});
canvas.addEventListener('pointerup', event => {
  if (!touchStart) return;
  const dx = event.clientX - touchStart.x, dy = event.clientY - touchStart.y;
  if (Math.abs(dx) > 25 && Math.abs(dx) > Math.abs(dy)) act(dx < 0 ? 'left' : 'right');
  else if (dy < -25 || (Math.abs(dx) < 10 && Math.abs(dy) < 10)) act('jump');
  touchStart = null;
});
canvas.addEventListener('pointercancel', () => { touchStart = null; });
// Solo pauses on tab switches. A multiplayer clock belongs to the server and keeps running.
document.addEventListener('visibilitychange', () => {
  if (mode === 'solo' && document.hidden && game.phase === 'running') { pauseGame(game); updateHUD(); }
  accumulator = 0;
  lastFrame = performance.now();
});
$('guide-button').addEventListener('click', () => {
  if (mode === 'solo' && game.phase === 'running') { pauseGame(game); updateHUD(); }
  $('guide-dialog').showModal();
});
$('close-guide').addEventListener('click', () => $('guide-dialog').close());

function frame(now) {
  const dt = Math.min((now - lastFrame) / 1000, .1);
  lastFrame = now;
  if (!graphicsError && mode === 'solo' && game.phase === 'running') {
    accumulator += dt;
    while (accumulator >= STEP) { updateGame(game, STEP); accumulator -= STEP; }
  } else accumulator = 0;
  updateHUD();
  const view = mode !== 'solo' && snapshot ? raceView.sample(now) : null;
  if (renderer && !graphicsError) {
    try {
      renderer.draw(view?.game || game, now / 1000, dt, view?.opponents || []);
    } catch {
      // A lost graphics context must not leave a connected player racing blind.
      graphicsError = graphicsMessage;
      connectionGeneration++;
      connection?.close();
      connection = null;
      snapshot = null;
      mode = 'solo';
      pauseGame(game);
      try { renderer.dispose?.(); } catch { /* Context may already be gone. */ }
      renderer = null;
      audio.reset();
      updateHUD();
    }
  }
  if (!document.hidden && !graphicsError) {
    try { audio.update(view?.game || game); }
    catch { audio.reset(); } // Optional sound must never interrupt rendering.
  }
  if (now > toastUntil) $('event-toast').classList.remove('visible');
  requestAnimationFrame(frame);
}
updateHUD();
prepareGraphics();
requestAnimationFrame(frame);
