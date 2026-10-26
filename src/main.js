// The coordinator: browser inputs, solo rules, multiplayer snapshots, 3D scene, and HUD.
import { CONFIG, ABILITIES, createGame, startGame, pauseGame, resumeGame, moveLane, jump, buyAbility, updateGame } from './game.js';
import { createRenderer } from './renderer.js';
import { connectRace, createRaceView } from './network.js';
import { AVATARS } from './avatars.js';

const $ = (id) => document.getElementById(id);
const canvas = $('game-canvas');
let renderer = null, graphicsError = '';
const graphicsMessage = '3D graphics are unavailable. Try an up-to-date browser with graphics acceleration enabled, then reload.';
try { renderer = createRenderer(canvas); } catch { graphicsError = graphicsMessage; }
let game = createGame();
let mode = 'solo';
let connection = null, snapshot = null, raceView = createRaceView();
let networkStatus = '', connectionGeneration = 0, rosterKey = '';
let lastOverlay = '', lastEvent = 0, toastUntil = 0;
let lastFrame = performance.now(), accumulator = 0;
const STEP = 1 / 60;
const guestName = `Runner ${100 + Math.floor(Math.random() * 900)}`;
$('player-name').placeholder = guestName;

$('boost-button').querySelector('.cost').firstChild.textContent = `−${ABILITIES.boost.cost}`;
$('long-jump-button').querySelector('.cost').firstChild.textContent = `−${ABILITIES.longJump.cost}`;
$('checkpoint-bonus').textContent = `+${CONFIG.checkpointBonus} seconds`;

function notify(text, kind = 'info') {
  $('event-toast').textContent = text;
  $('event-toast').dataset.kind = kind;
  $('event-toast').classList.add('visible');
  toastUntil = performance.now() + 1800;
}
function showNetworkError(message = '') {
  $('network-error').textContent = message;
  $('network-error').hidden = !message;
}
function resetVisuals() {
  renderer?.reset();
  lastEvent = 0;
  accumulator = 0;
  lastOverlay = '';
  lastFrame = performance.now();
  $('event-toast').classList.remove('visible');
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
  if (mode !== 'solo' || graphicsError) return;
  game = createGame({ seed: 42, avatarId: game.avatarId });
  startGame(game);
  resetVisuals();
  showNetworkError();
  updateHUD();
}
function joinRace(type) {
  if (graphicsError) return;
  const code = $('join-code').value.trim().toUpperCase();
  if (type === 'join' && !/^[A-Z0-9]{6}$/.test(code)) {
    showNetworkError('Enter the six-character code from your friend’s room.');
    $('join-code').focus();
    return;
  }
  connection?.close();
  const generation = ++connectionGeneration;
  mode = 'online';
  networkStatus = 'connecting';
  snapshot = null;
  rosterKey = '';
  raceView = createRaceView();
  game = createGame();
  resetVisuals();
  showNetworkError();
  const name = $('player-name').value.trim() || guestName;
  connection = connectRace({
    initialMessage: { type, code, name },
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
      if (next.room.roundId !== snapshot?.room.roundId) resetVisuals();
      snapshot = next;
      raceView.push(next, performance.now());
      // HUD uses the newest authoritative values; drawing blends positions separately.
      game = raceView.sample(performance.now() + 50).game;
      updateRoom();
      updateHUD();
    },
  });
  updateRoom();
  updateHUD();
}
function updateRoom() {
  $('room-code').textContent = snapshot?.room.code || '······';
  if (networkStatus === 'disconnected') $('room-status').textContent = 'Disconnected. Return to the menu to join a new race.';
  else if (!snapshot) $('room-status').textContent = 'Connecting to the race server…';
  else {
    const count = snapshot.players.filter(player => player.connected).length;
    $('room-status').textContent = snapshot.room.phase === 'lobby'
      ? `${count}/4 runners · Share this code. The host starts when everyone is here.`
      : snapshot.room.phase === 'countdown' ? 'Get ready. Everyone starts together.'
      : snapshot.room.phase === 'finished' ? 'Race complete. Stay for a rematch or leave.'
      : 'Race in progress · Switching tabs does not pause your clock.';
  }
  const key = JSON.stringify([snapshot?.players.map(p => [p.id, p.name, p.connected, p.color, p.avatarId]), snapshot?.room.hostId]);
  if (key !== rosterKey) {
    rosterKey = key;
    $('room-players').replaceChildren();
    for (const player of snapshot?.players || []) {
      const li = document.createElement('li');
      const dot = document.createElement('i');
      dot.style.backgroundColor = player.color;
      li.append(dot, document.createTextNode(`${player.name}${player.id === snapshot.you.id ? ' (you)' : ''} · ${AVATARS[player.avatarId]?.name || 'Runner'}${player.id === snapshot.room.hostId ? ' · host' : ''}${player.connected ? '' : ' · left'}`));
      $('room-players').append(li);
    }
  }
  $('room-players').hidden = snapshot?.room.phase === 'racing';
}
function togglePause() {
  if (mode === 'online') return;
  if (game.phase === 'running') pauseGame(game);
  else if (game.phase === 'paused') resumeGame(game);
  accumulator = 0;
  updateHUD();
}
function act(action) {
  if (graphicsError) return;
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
  $('start-button').textContent = button;
  $('start-button').disabled = disabled;
  $('overlay-hint').textContent = hint;
}
function updateOverlay() {
  if (graphicsError) {
    $('screen-overlay').hidden = false;
    $('result-stats').hidden = true;
    overlay('GRAPHICS UNAVAILABLE', 'Let’s get you running.', graphicsError, 'Reload game →');
    return;
  }
  const ended = game.phase === 'won' || game.phase === 'lost';
  $('result-stats').hidden = !ended;
  if (ended) {
    // All values below are numbers from the game; player names use textContent elsewhere.
    $('result-stats').innerHTML = `<div><strong>${game.elapsed.toFixed(1)}s</strong><small>RUN TIME</small></div><div><strong>${game.hits}</strong><small>HITS</small></div><div><strong>${game.timeSpent}s</strong><small>SPENT</small></div>`;
  }
  if (mode === 'online') {
    const room = snapshot?.room;
    const host = room?.hostId === snapshot?.you.id;
    $('screen-overlay').hidden = networkStatus === 'open' && room?.phase === 'racing' && !ended;
    if (networkStatus === 'disconnected') {
      overlay('CONNECTION LOST', 'The race moved on.', 'Your connection to the server ended. Return to the menu to create or join a room.', 'Back to menu →');
    } else if (!snapshot) {
      overlay('MULTIPLAYER', 'Joining the race.', 'Connecting to your room. Any connection errors appear above the course.', 'Back to menu →');
    } else if (room.phase === 'lobby') {
      const count = snapshot.players.filter(player => player.connected).length;
      overlay('PRIVATE RACE', 'Better with company.', 'Share the room code above. You’ll see other runners as transparent models on the same course.', host ? 'Start race →' : 'Waiting for host…', !host || count < 2, count < 2 ? 'At least two runners must join to start.' : `${count} runners ready. Everyone starts together.`);
    } else if (room.phase === 'countdown') {
      overlay('GET READY', `${room.countdown}`, 'Same course. Your own clock. Reach the exit first.', 'Starting…', true, 'Move ← → · Hop SPACE · Boost 1 · Long jump 2');
    } else if (ended) {
      const winner = snapshot.players.find(player => player.id === room.winnerId);
      const title = room.phase !== 'finished' ? (game.phase === 'won' ? 'You made it out.' : 'Your clock ran out.')
        : winner ? (winner.id === snapshot.you.id ? 'You won the race.' : `${winner.name} won the race.`) : 'The tunnel won this round.';
      overlay(room.phase === 'finished' ? 'RACE COMPLETE' : 'WAITING FOR RUNNERS', title,
        room.phase === 'finished' ? 'Another route. Another chance to spend your seconds wisely.' : 'The remaining runners are still racing. Stay for the result and rematch.',
        room.phase !== 'finished' ? 'Race still in progress…' : host ? 'Set up rematch →' : 'Waiting for host…', room.phase !== 'finished' || !host, 'Your run stats are shown below.');
    }
    return;
  }
  $('screen-overlay').hidden = game.phase === 'running';
  if (game.phase === 'ready') overlay(`${CONFIG.initialTime} SECONDS. ONE WAY OUT.`, 'Daylight is ahead.', 'Watch for falling stone. Dodge, jump, and spend seconds to escape. Create a room above to race friends.', 'Practice solo →', false, 'Move ← → · Hop SPACE · Abilities 1 / 2');
  else if (game.phase === 'paused') overlay('TAKE A BREATH', 'Time stands still.', 'Your solo run is paused. The clock and the building will wait.', 'Resume run →', false, 'Press P or ESC to resume');
  else if (ended) overlay(game.phase === 'won' ? 'ESCAPE COMPLETE' : 'THE CLOCK RAN OUT', game.phase === 'won' ? 'Seconds to spare.' : 'Out of borrowed time.', game.phase === 'won' ? 'You made it out. Try the same course again and see if you can escape faster.' : `You made it ${Math.floor(game.distance)} meters. Dodge the barriers, watch for gaps, and save enough time for the exit.`, 'Run it again →', false, 'Same route. A different strategy.');
}
function updateHUD() {
  const online = mode === 'online';
  const running = !graphicsError && game.phase === 'running' && (!online || networkStatus === 'open');
  $('race-menu').hidden = online;
  $('room-panel').hidden = !online;
  $('restart-button').hidden = online;
  $('race-mode-label').textContent = online ? 'LIVE MULTIPLAYER' : 'SOLO PRACTICE';
  $('avatar-label').textContent = AVATARS[game.avatarId]?.name || 'Runner';
  $('location-label').textContent = game.distance < 300 ? 'DEEP TUNNEL' : game.distance < 660 ? 'BROKEN VAULTS' : 'DAYLIGHT AHEAD';
  $('create-room').disabled = Boolean(graphicsError);
  $('join-room').disabled = Boolean(graphicsError);
  $('time-value').textContent = Math.max(0, game.timeLeft).toFixed(1);
  $('time-fill').style.width = `${Math.min(100, game.timeLeft / CONFIG.initialTime * 100)}%`;
  $('time-value').closest('.clock-panel').classList.toggle('low', game.timeLeft < 15);
  $('status-label').textContent = online && networkStatus === 'disconnected' ? 'OFFLINE' : ({ ready:'READY', running:'RUNNING', paused:'PAUSED', won:'ESCAPED', lost:'TIME OUT' })[game.phase];
  $('clock-note').textContent = game.timeLeft < 15 && running ? 'Low time. Make every second count.' : 'Your lifeline. Your currency.';
  $('distance-value').textContent = `${Math.max(0, Math.ceil(CONFIG.courseLength - game.distance))} m`;
  $('distance-fill').style.width = `${Math.min(100, game.distance / CONFIG.courseLength * 100)}%`;
  const sector = game.checkpoints.filter(checkpoint => checkpoint.passed).length + 1;
  $('sector-label').textContent = `SECTOR ${String(sector).padStart(2, '0')} / ${String(game.checkpoints.length + 1).padStart(2, '0')}`;
  $('hits-value').textContent = game.hits;
  $('spent-value').textContent = `${game.timeSpent}s`;
  $('boost-button').disabled = !running || game.timeLeft <= ABILITIES.boost.cost || game.boostCooldown > 0;
  $('long-jump-button').disabled = !running || game.timeLeft <= ABILITIES.longJump.cost || game.jumpKind === 'long';
  $('boost-button').classList.toggle('active', game.boostRemaining > 0);
  $('long-jump-button').classList.toggle('active', game.jumpKind === 'long');
  $('boost-description').textContent = game.boostRemaining > 0 ? `Boosting · ${game.boostRemaining.toFixed(1)}s` : game.boostCooldown > 0 ? `Recharging · ${game.boostCooldown.toFixed(1)}s` : `Run faster for ${ABILITIES.boost.duration} seconds`;
  $('jump-description').textContent = game.jumpKind === 'long' ? 'Long jump active' : 'Clear gaps and low debris';
  $('pause-button').disabled = online || (!running && game.phase !== 'paused');
  $('pause-button').textContent = game.phase === 'paused' ? '▷' : 'Ⅱ';
  $('pause-button').setAttribute('aria-label', online ? 'Multiplayer cannot be paused' : game.phase === 'paused' ? 'Resume game' : 'Pause game');
  for (const id of ['left-button', 'right-button', 'hop-button']) $(id).disabled = !running;
  if (game.recentEvent && game.recentEvent.id !== lastEvent) {
    lastEvent = game.recentEvent.id;
    notify(game.recentEvent.text, game.recentEvent.kind);
  }
  const key = [graphicsError, mode, networkStatus, game.phase, snapshot?.room.phase, snapshot?.room.countdown, snapshot?.room.hostId, snapshot?.room.winnerId, rosterKey].join(':');
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
$('join-code').addEventListener('keydown', event => { if (event.key === 'Enter') joinRace('join'); });
$('leave-room').addEventListener('click', returnToMenu);
$('restart-button').addEventListener('click', beginRun);
$('pause-button').addEventListener('click', togglePause);
for (const [id, action] of [['boost-button','boost'], ['long-jump-button','longJump'], ['left-button','left'], ['right-button','right'], ['hop-button','jump']]) {
  $(id).addEventListener('click', () => act(action));
}
document.addEventListener('keydown', event => {
  if ($('guide-dialog').open || event.altKey || event.ctrlKey || event.metaKey || event.target.closest('input,textarea,select,[contenteditable="true"]')) return;
  const actions = { ArrowLeft:'left', KeyA:'left', ArrowRight:'right', KeyD:'right', ArrowUp:'jump', KeyW:'jump', Space:'jump', Digit1:'boost', Digit2:'longJump' };
  if (actions[event.code] || ['KeyP', 'Escape'].includes(event.code)) {
    event.preventDefault();
    if (event.repeat) return;
    if (actions[event.code]) act(actions[event.code]);
    else togglePause();
  }
});
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
  const view = mode === 'online' && snapshot ? raceView.sample(now) : null;
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
      updateHUD();
    }
  }
  if (now > toastUntil) $('event-toast').classList.remove('visible');
  requestAnimationFrame(frame);
}
updateHUD();
requestAnimationFrame(frame);
