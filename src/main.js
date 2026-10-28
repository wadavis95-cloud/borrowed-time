// The coordinator: browser inputs, solo rules, multiplayer snapshots, 3D scene, and HUD.
import { CONFIG, ABILITIES, createGame, freshCourseSeed, pauseGame, resumeGame, moveLane, jump, buyAbility, updateGame } from './game.js';
import { createUnityRenderer } from './unity-renderer.js';
import { connectRace, createRaceView } from './network.js';
import { AVATARS } from './avatars.js';
import { MAPS, MAP_IDS, getMap } from './maps.js';
import { createSessionScores } from './session-scores.js';
import { createSoloRace } from './solo-race.js';
import { createDemoRace } from './demo.js';
import { createGameAudio } from './audio.js';
import { createInputMode } from './input.js';
import { loadClassicGraphics } from './loading.js';
import { createRaceUI } from './race-ui.js';
import { finishPresentation } from './race-presentation.js';
import { createAbilityCoach } from './ability-coach.js';

const $ = (id) => document.getElementById(id);
const canvas = $('game-canvas');
const audio = createGameAudio({enabledByDefault:true});
const abilityCoach = createAbilityCoach();
const raceUI=createRaceUI({reducedMotion:window.matchMedia('(prefers-reduced-motion: reduce)').matches,
  onCue:cue=>audio.cue(cue.kind,cue.value),
  elements:{card:document.querySelector('.intro-card'),clock:$('time-value').closest('.clock-panel'),debit:$('clock-debit'),status:$('status-label'),trail:$('time-debit'),note:$('clock-feedback'),
    boost:$('boost-button'),jump:$('long-jump-button'),go:$('race-go'),title:$('overlay-title'),overlay:$('screen-overlay'),finishMark:$('finish-mark'),finishBadge:$('finish-badge')}});
let renderer = null, graphicsError = '', graphicsLoading = true;
let graphicsProgress = 0;
const graphicsMessage = '3D graphics are unavailable. Try an up-to-date browser with graphics acceleration enabled, then reload.';
let selectedMapId = 'tunnel';
let game = createGame({ mapId: selectedMapId });
let mapPickerKey = '';
let soloSeed = 42;
let mode = 'solo';
let soloRace = null;
const soloScores=createSessionScores(),characterChoices={};
let characterPickerKey='',portraitRequest=0;
let connection = null, snapshot = null, raceView = createRaceView();
let networkStatus = '', connectionGeneration = 0, rosterKey = '';
let lastOverlay = '', lastEvent = 0, toastUntil = 0;
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
for (const id of MAP_IDS) {
  const map = MAPS[id];
  const button = document.createElement('button');
  button.type = 'button'; button.className = 'map-card'; button.dataset.map = id;
  button.setAttribute('aria-pressed', String(id === selectedMapId));
  const image = document.createElement('img'); image.src = map.thumbnail; image.alt = ''; image.width = 600; image.height = 320;
  const copy = document.createElement('span'); copy.className = 'map-card-copy';
  const title = document.createElement('strong'); title.textContent = map.name;
  const tagline = document.createElement('small'); tagline.textContent = map.tagline;
  const votes = document.createElement('span'); votes.className = 'map-votes';
  copy.append(title, tagline); button.append(image, copy, votes);
  button.addEventListener('click', () => {
    if (mode !== 'solo') {
      if (snapshot?.room.phase === 'lobby' && mode !== 'demo') connection?.send({ type: 'vote', mapId: id });
      return;
    }
    selectedMapId = id; soloRace = null; game = createGame({ mapId: id,avatarId:characterChoices[id] }); resetVisuals(); updateHUD();
  });
  $('map-cards').append(button);
}
function updateMapPicker() {
  const lobby = mode !== 'solo' && snapshot?.room.phase === 'lobby';
  $('map-picker').hidden = mode === 'solo' ? game.phase !== 'ready' : !lobby || mode === 'demo';
  const votes = snapshot?.room.votes || {};
  const ownVote = mode === 'solo' ? selectedMapId : votes[snapshot?.you.id];
  const key = JSON.stringify([mode, lobby, ownVote, votes, graphicsLoading, graphicsError, networkStatus]);
  if (mapPickerKey === key) return;
  mapPickerKey = key;
  $('map-picker-title').textContent = lobby ? 'Vote for your escape' : 'Choose your escape';
  $('map-vote-note').textContent = lobby ? 'Most votes wins · Ties are random' : `${MAP_IDS.length} maps · Same ticking clock`;
  for (const button of $('map-cards').children) {
    const id = button.dataset.map;
    button.setAttribute('aria-pressed', String(ownVote === id));
    button.disabled = graphicsLoading || Boolean(graphicsError) || (mode !== 'solo' && (!lobby || networkStatus !== 'open'));
    const count = Object.values(votes).filter(vote => vote === id).length;
    button.querySelector('.map-votes').textContent = lobby ? `${count} vote${count === 1 ? '' : 's'}${ownVote === id ? ' · Yours' : ''}` : ownVote === id ? 'Selected' : '';
  }
}

function characterContext(){
  const online=mode!=='solo';
  const mapId=online?(snapshot?.room.votes?.[snapshot?.you.id]||snapshot?.room.mapId):selectedMapId;
  const map=getMap(mapId);
  const available=!graphicsLoading&&!graphicsError&&(online?mode!=='demo'&&networkStatus==='open'&&snapshot?.room.phase==='lobby':game.phase==='ready');
  const selected=online?(snapshot?.you.avatarChoices?.[map.id]||(game.mapId===map.id?game.avatarId:null)):game.avatarId;
  return {map,available,selected};
}
function updateCharacterPicker(){
  const {map,available,selected}=characterContext();
  $('character-picker').hidden=!available;
  if(!available&&$('character-dialog').open){portraitRequest++;$('character-dialog').close();}
  const key=[available,map.id,selected].join(':');if(key===characterPickerKey)return;characterPickerKey=key;
  $('selected-character').textContent=selected?AVATARS[selected].name:'Automatic';
}
$('change-character').addEventListener('click',async()=>{
  const {map,available,selected}=characterContext();if(!available)return;
  const request=++portraitRequest;
  $('character-map-note').textContent=`${map.name} · Appearance only. Same abilities and stats.`;
  $('character-cards').replaceChildren(...map.avatars.map(id=>{
    const button=document.createElement('button');button.className='character-card';button.dataset.avatar=id;button.setAttribute('aria-pressed',String(selected===id));
    const image=document.createElement('img');image.alt='';image.width=180;image.height=220;
    const label=document.createElement('strong');label.textContent=AVATARS[id].name;button.append(image,label);
    button.addEventListener('click',()=>{
      const current=characterContext();if(!current.available||current.map.id!==map.id)return;
      if(mode==='solo'){characterChoices[map.id]=id;game=createGame({mapId:map.id,avatarId:id});resetVisuals();updateHUD();}
      else connection.send({type:'character',mapId:map.id,avatarId:id});
      $('character-dialog').close();
    });return button;
  }));
  $('character-dialog').showModal();
  try{
    const {characterPortraits}=await import('./graphics/portraits.js');
    if(request!==portraitRequest||!$('character-dialog').open)return;
    const portraits=characterPortraits(map.avatars);
    for(const button of $('character-cards').children)button.querySelector('img').src=portraits[button.dataset.avatar];
  }catch{ /* Role labels remain usable if portrait rendering is unavailable. */ }
});
$('close-characters').addEventListener('click',()=>{$('character-dialog').close();portraitRequest++;});

$('boost-button').querySelector('.cost').firstChild.textContent = `−${ABILITIES.boost.cost}`;
$('long-jump-button').querySelector('.cost').firstChild.textContent = `−${ABILITIES.longJump.cost}`;
$('brief-boost-cost').textContent = `${ABILITIES.boost.cost}s`;
$('brief-jump-cost').textContent = `${ABILITIES.longJump.cost}s`;


async function prepareGraphics() {
  try {
    // Restore the last pre-Unity (V4) presentation as the normal game.
    // Keep the Unity study available only when explicitly requested.
    if (new URLSearchParams(location.search).get('graphics') !== 'unity') {
      const createRenderer = await loadClassicGraphics(()=>Promise.all([
        import('./renderer.js'), import('./graphics/avatars.js'),
      ]),progress=>{
        graphicsProgress=Math.round(progress*100);updateOverlay();
      });
      renderer = createRenderer(canvas);
    } else {
      renderer = await createUnityRenderer(canvas, { onProgress(progress) {
        graphicsProgress = Math.round(progress * 100);
        updateOverlay();
      } });
    }
  } catch (error) {
    console.error('Graphics initialization failed:', error);
    graphicsError = error?.message?.includes('taking too long') ? error.message : 'The game graphics could not load. Check your connection and browser, then reload to try again.';
  }
  graphicsLoading = false;
  updateHUD();
}

function showCourse() {
  canvas.closest('.arena').scrollIntoView({ block: 'start', behavior: 'auto' });
}

function notify(text, kind = 'info') {
  const message = text;
  $('event-toast').textContent = message;
  $('event-toast').dataset.kind = kind;
  $('event-toast').classList.toggle('visible', kind !== 'ability');
  toastUntil = performance.now() + 1800;
}
function showNetworkError(message = '') {
  $('network-error').textContent = message;
  $('network-error').hidden = !message;
}
function resetVisuals() {
  abilityCoach.reset();
  raceUI.reset();
  renderer?.reset();
  audio.reset();
  lastEvent = 0;
  accumulator = 0;
  lastOverlay = '';
  lastFrame = performance.now();
  $('event-toast').classList.remove('visible');
  $('event-toast').textContent = '';
}
function returnToMenu() {
  connectionGeneration++;
  connection?.close();
  connection = null;
  snapshot = null;
  mode = 'solo';
  soloRace = null;
  networkStatus = '';
  game = createGame({ mapId: selectedMapId,avatarId:characterChoices[selectedMapId] });
  resetVisuals();
  showNetworkError();
  updateHUD();
}
function beginRun() {
  if (mode !== 'solo' || !renderer || graphicsError) return;
  soloSeed = freshCourseSeed(soloSeed);
  soloRace = createSoloRace({ seed: soloSeed, mapId: selectedMapId,avatarId:game.avatarId,scores:soloScores });
  soloRace.start();
  game = soloRace.player;
  resetVisuals();
  raceUI.startSolo();
  showNetworkError();
  updateHUD();
  showCourse();
}
function joinRace(type) {
  if (!renderer || graphicsError) return;
  const code = $('join-code').value.trim().toUpperCase();
  if (type === 'join' && !/^[A-Z0-9]{6}$/.test(code)) {
    showNetworkError('Enter the six-character code from your friend’s lobby.');
    $('join-code').focus();
    return;
  }
  connection?.close();
  const generation = ++connectionGeneration;
  soloRace = null;
  mode = type === 'demo' ? 'demo' : 'online';
  networkStatus = 'connecting';
  snapshot = null;
  rosterKey = '';
  raceView = createRaceView();
  game = createGame({ mapId: selectedMapId,avatarId:characterChoices[selectedMapId] });
  resetVisuals();
  showNetworkError();
  const callbacks = {
    onStatus(status) {
      if (generation !== connectionGeneration) return;
      networkStatus = status;
      updateRoom();
      updateHUD();
    },
    onError(message, code) {
      if (generation !== connectionGeneration) return;
      if (['ACTION_UNAVAILABLE', 'RATE_LIMIT', 'NOT_RACING', 'CHARACTER_LOCKED'].includes(code)) notify(message, 'warning');
      else if(!snapshot) {
        returnToMenu();showNetworkError(message);$('join-code').focus();
      } else showNetworkError(message);
    },
    onSnapshot(next) {
      if (generation !== connectionGeneration) return;
      const starting = next.room.phase === 'countdown' && snapshot?.room.phase !== 'countdown';
      if (next.room.roundId !== snapshot?.room.roundId || next.room.mapId !== snapshot?.room.mapId) resetVisuals();
      snapshot = next;
      raceView.push(next, performance.now());
      // HUD uses the newest authoritative values; drawing blends positions separately.
      game = raceView.sample(performance.now() + 50).game;
      updateRoom();
      updateHUD();
      if (starting) showCourse();
    },
  };
  connection = type === 'demo' ? createDemoRace({ ...callbacks, mapId: selectedMapId })
    : connectRace({ ...callbacks, initialMessage: { type, code, ...(type === 'create' ? { mapId: selectedMapId,avatarId:characterChoices[selectedMapId]||game.avatarId } : {}) } });
  updateRoom();
  updateHUD();
}
function updateRoom() {
  const demo = mode === 'demo';
  $('leave-room').textContent = demo ? 'Exit demo' : 'Leave lobby';
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
  const key = JSON.stringify([snapshot?.players.map(p => [p.id, p.name, p.connected, p.color, p.avatarId,p.wins]), snapshot?.room.hostId]);
  if (key !== rosterKey) {
    rosterKey = key;
    $('room-players').replaceChildren();
    for (const player of snapshot?.players || []) {
      const li = document.createElement('li');
      const dot = document.createElement('i');
      dot.style.backgroundColor = player.color;
      li.append(dot, document.createTextNode(`${player.name}${player.id === snapshot.you.id && !demo ? ' (you)' : ''}${player.id === snapshot.room.hostId && !demo ? ' · host' : ''}${player.connected ? '' : ' · left'} · ${player.wins||0} wins`));
      $('room-players').append(li);
    }
  }
  $('room-players').hidden = ['racing', 'finished'].includes(snapshot?.room.phase);
}

function currentRaceSnapshot(){return mode==='solo' ? soloRace?.snapshot() : snapshot;}
function updateLeaderboard(snapshot = currentRaceSnapshot()) {
  const visible = Boolean(snapshot?.standings) && ['racing', 'finished'].includes(snapshot.room.phase);
  $('leaderboard').hidden = !visible;
  canvas.closest('.arena').classList.toggle('race-hud', visible);
  if (!visible) { standingsKey = ''; return; }
  const finished = snapshot.room.phase === 'finished';
  const results = finished || ['won', 'lost'].includes(game.phase);
  const view = results ? 'results' : 'live';
  $('leaderboard').dataset.view = view;
  const target = results ? $('results-standings-slot') : canvas.closest('.arena');
  if ($('leaderboard').parentElement !== target) target.append($('leaderboard'));
  const own = snapshot.standings.find(p => p.id === snapshot.you.id);
  const stale = mode !== 'solo' && networkStatus !== 'open';
  $('leaderboard-title').textContent = results ? finished ? 'Race results' : 'Still racing' : `${own?.position ?? '—'} / ${snapshot.standings.length}`;
  $('leaderboard-note').textContent = stale ? 'Offline · last positions'
    : results ? 'Wins this session' : 'POSITION';
  const rows = snapshot.standings.map(entry => ({ ...entry, ...snapshot.players.find(p => p.id === entry.id) }));
  // Only touch the DOM when order, identity or result changes, not every frame.
  const displayKey = JSON.stringify([snapshot.room.roundId, snapshot.you.id, mode, view,
    rows.map(p => [p.id, p.position, p.status, p.name, p.color, p.isComputer,p.wins])]);
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
    const role = document.createElement('span');
    role.className = 'standing-role';
    role.textContent = player.name;
    name.append(role);
    if (player.id === snapshot.you.id && mode !== 'demo') {
      const you = document.createElement('span');
      you.className = 'standing-you';
      you.textContent = ' (you)';
      name.append(you);
    } else if(player.isComputer) {
      const cpu=document.createElement('span');cpu.className='standing-cpu';cpu.textContent=' CPU';name.append(cpu);
    }
    name.title = name.textContent;
    const dot = document.createElement('i');
    dot.style.backgroundColor = player.color;
    const status = document.createElement('small');
    const statusLabel = ({ ready: 'Ready', racing: 'Racing', escaped: 'Escaped', dnf: 'DNF · time out', disconnected: 'DNF · left' })[player.status];
    status.textContent = results ? `${statusLabel} · ${player.wins||0} ${(player.wins||0)===1?'win':'wins'}` : player.status === 'escaped' ? '✓' : ['dnf', 'disconnected'].includes(player.status) ? '×' : '';
    row.setAttribute('aria-label', `${name.textContent}, ${player.position ? `position ${player.position}, ` : ''}${statusLabel}, ${player.wins||0} session wins`);
    row.title = `${name.textContent} · ${statusLabel}`;
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
  if(!$('screen-overlay').hidden&&$('screen-overlay').dataset.stage!=='countdown')raceUI.screen([mode,game.phase,networkStatus,kicker].join(':'));
}
function updateOverlay() {
  const countdown=mode!=='solo'&&snapshot?.room.phase==='countdown'&&networkStatus==='open'&&!graphicsLoading&&!graphicsError;
  $('screen-overlay').dataset.stage=countdown?'countdown':['won','lost'].includes(game.phase)?'finish':'menu';
  $('screen-overlay').dataset.countdown=String(Math.max(1,Math.min(3,snapshot?.room.countdown||1)));
  $('start-lights').hidden=!countdown;
  $('loading-progress').hidden=!graphicsLoading;
  $('loading-progress').value=graphicsProgress;
  $('choose-map').hidden=mode!=='solo'||!['won','lost'].includes(game.phase)||Boolean(graphicsError);
  raceUI.result(graphicsLoading||graphicsError||networkStatus==='disconnected'?null:finishPresentation(game,currentRaceSnapshot(),mode));
  const brief = !graphicsLoading && !graphicsError && (mode === 'solo' ? game.phase === 'ready'
    : snapshot?.room.phase === 'lobby');
  $('ability-brief').hidden = !brief;
  canvas.closest('.arena').classList.toggle('briefing', brief);
  if (graphicsLoading) {
    $('screen-overlay').hidden = false;
    overlay('INTO THE LIGHT', 'Preparing your escape.', `Loading the maps and runners… ${graphicsProgress}%`, 'Loading…', true);
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
      overlay('CONNECTION LOST', 'The race moved on.', 'Your connection to the server ended. Return to the menu to create or join a lobby.', 'Back to menu →');
    } else if (!snapshot) {
      overlay('MULTIPLAYER', 'Joining the race.', 'Connecting to your lobby. Any connection errors appear above the course.', 'Back to menu →');
    } else if (room.phase === 'lobby') {
      const count = snapshot.players.filter(player => player.connected).length;
      if (mode === 'demo') {
        overlay('FOUR-PLAYER DEMO', 'Meet the runners.', '', 'Getting ready…', true, '');
        return;
      }
      overlay('MAP VOTE OPEN', 'First to escape wins.', 'Abilities cost seconds from your clock.', host ? 'Start race →' : 'Waiting for host…', !host || count < 2, count < 2 ? 'Invite a friend with the lobby code.' : controlHint());
    } else if (room.phase === 'countdown') {
      overlay(getMap(room.mapId).name.toUpperCase(), `${Math.max(1,Math.min(3,room.countdown||1))}`, '', 'Starting…', true, controlHint());
    } else if (ended) {
      const result=finishPresentation(game,snapshot,mode);
      overlay(room.phase === 'finished' ? result.kind==='winner'?'RACE WON':'RACE COMPLETE' : 'RUN COMPLETE',result.title,result.detail,
        result.waiting ? 'Racers still finishing…' : mode === 'demo' ? 'Watch again →' : host ? 'Back to voting →' : 'Waiting for host…',result.waiting||!host);
    }
    return;
  }
  $('screen-overlay').hidden = game.phase === 'running';
  if (game.phase === 'ready') overlay(getMap(selectedMapId).name.toUpperCase(), 'Escape before zero.', 'Race 3 computer runners. Spend seconds on abilities.', 'Solo race →', false, controlHint());
  else if (game.phase === 'paused') overlay('TAKE A BREATH', 'Time stands still.', '', 'Resume run →', false, 'Press P or ESC to resume');
  else if (ended) { const result=finishPresentation(game,currentRaceSnapshot(),'solo');overlay(game.phase==='won'?result.kind==='winner'?'RACE WON':'ESCAPE COMPLETE':'THE CLOCK RAN OUT',result.title,result.detail,'Race again →'); }
}
function updateHUD() {
  updateMapPicker();
  updateCharacterPicker();
  $('guide-hazard').textContent = getMap(game.mapId).warning;
  canvas.setAttribute('aria-label', `${getMap(game.mapId).name}. Three lanes. Dodge hazards, hop small obstacles, spend seconds on Boost and Long jump.`);
  const raceSnapshot=currentRaceSnapshot();
  updateLeaderboard(raceSnapshot);
  const online = mode !== 'solo';
  const running = Boolean(renderer) && !graphicsError && mode !== 'demo' && game.phase === 'running' && (!online || networkStatus === 'open');
  $('race-menu').hidden = online || game.phase !== 'ready';
  $('page-heading').hidden = online || game.phase !== 'ready';
  $('room-panel').hidden = !online;
  $('room-panel').classList.toggle('live-room', online && ['racing', 'finished'].includes(snapshot?.room.phase));
  $('restart-button').hidden = online;
  $('race-mode-label').textContent = mode === 'demo' ? 'DEMO' : online ? 'MULTIPLAYER' : soloRace ? 'VS CPU' : 'SOLO';
  $('avatar-label').textContent = AVATARS[game.avatarId]?.name || 'Runner';
  for (const id of ['create-room', 'join-room', 'restart-button']) $(id).disabled = !renderer || Boolean(graphicsError);
  $('demo-button').disabled = !renderer || Boolean(graphicsError) || online;
  $('time-value').textContent = Math.max(0, game.timeLeft).toFixed(1);
  $('time-fill').style.width = `${Math.min(100, game.timeLeft / CONFIG.initialTime * 100)}%`;
  $('time-value').closest('.clock-panel').classList.toggle('low', game.timeLeft < 15);
  $('status-label').textContent = online && networkStatus === 'disconnected' ? 'OFFLINE' : ({ ready:'READY', running:'RUNNING', paused:'PAUSED', won:'ESCAPED', lost:'TIME OUT' })[game.phase];
  $('boost-button').disabled = !running || game.timeLeft <= ABILITIES.boost.cost || game.boostCooldown > 0;
  $('long-jump-button').disabled = !running || game.timeLeft <= ABILITIES.longJump.cost || game.jumpKind === 'long';
  const showAbilityState=['running','paused'].includes(game.phase);
  $('boost-button').classList.toggle('active', game.phase==='running' && game.boostRemaining > 0);
  $('long-jump-button').classList.toggle('active', game.phase==='running' && game.jumpKind === 'long');
  $('boost-button').classList.toggle('has-status', showAbilityState && (game.boostRemaining > 0 || game.boostCooldown > 0 || game.timeLeft <= ABILITIES.boost.cost));
  $('long-jump-button').classList.toggle('has-status', showAbilityState && (game.jumpKind === 'long' || game.timeLeft <= ABILITIES.longJump.cost));
  $('boost-description').textContent = !showAbilityState ? `${ABILITIES.boost.duration}s sprint` : game.boostRemaining > 0 ? `Boosting · ${Math.ceil(game.boostRemaining)}s left`
    : game.boostCooldown > 0 ? `Recharges in ${Math.ceil(game.boostCooldown)}s`
      : game.timeLeft <= ABILITIES.boost.cost ? 'Not enough time' : `${ABILITIES.boost.duration}s sprint`;
  $('jump-description').textContent = !showAbilityState ? 'Leap forward. Clear gaps.' : game.jumpKind === 'long' ? 'Long jump active'
    : game.timeLeft <= ABILITIES.longJump.cost ? 'Not enough time' : 'Leap forward. Clear gaps.';
  const cue = abilityCoach.update(game, running);
  for (const [id, ability] of [['boost-button', 'boost'], ['long-jump-button', 'longJump']]) {
    $(id).classList.toggle('coach-cue', cue?.ability === ability);
    const label = cue?.ability === ability ? cue.label : '';
    const hint = $(id).querySelector('.ability-hint');
    if (hint.textContent !== label) hint.textContent = label;
  }
  $('pause-button').disabled = online || (!running && game.phase !== 'paused');
  $('pause-button').textContent = game.phase === 'paused' ? '▷' : 'Ⅱ';
  $('pause-button').setAttribute('aria-label', online ? 'Multiplayer cannot be paused' : game.phase === 'paused' ? 'Resume game' : 'Pause game');
  for (const id of ['left-button', 'right-button', 'hop-button']) $(id).disabled = !running;
  if (game.recentEvent && game.recentEvent.id !== lastEvent) {
    lastEvent = game.recentEvent.id;
    notify(game.recentEvent.text, game.recentEvent.kind);
  }
  const key = [graphicsLoading, graphicsError, mode, networkStatus, game.phase, snapshot?.room.phase, snapshot?.room.countdown, snapshot?.room.hostId, snapshot?.room.winnerId, raceSnapshot?.room.phase, raceSnapshot?.room.winnerId, rosterKey].join(':');
  if (key !== lastOverlay) { updateOverlay(); lastOverlay = key; }
  raceUI.update(game,{mode,room:networkStatus==='disconnected'?undefined:snapshot?.room},performance.now());
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
$('choose-map').addEventListener('click',()=>{returnToMenu();$('map-picker').scrollIntoView({block:'start',behavior:'auto'});});
$('restart-button').addEventListener('click', beginRun);
$('pause-button').addEventListener('click', togglePause);
function updateSoundButton() {
  const button=$('sound-button');
  button.setAttribute('aria-pressed',String(audio.enabled));
  button.setAttribute('aria-label',audio.enabled?'Mute sound':'Enable sound');
  button.title=audio.enabled?'Sound on — mute':'Sound muted — enable';
}
async function unlockSound(event) {
  if(event.target.closest?.('#sound-button'))return;
  try{await audio.unlock();}catch{/* Audio remains optional if the device rejects it. */}
  updateSoundButton();
}
document.addEventListener('pointerdown',unlockSound,{passive:true});
document.addEventListener('keydown',unlockSound);
$('sound-button').addEventListener('click', async () => {
  const button = $('sound-button');
  button.disabled = true;
  try { await audio.toggle(); }
  catch (error) { notify(error.message, 'warning'); }
  updateSoundButton();
  button.disabled = false;
});
for (const [id, action] of [['boost-button','boost'], ['long-jump-button','longJump'], ['left-button','left'], ['right-button','right'], ['hop-button','jump']]) {
  $(id).addEventListener('click', () => act(action));
}
document.addEventListener('keydown', event => {
  if ($('character-dialog').open || $('guide-dialog').open || event.altKey || event.ctrlKey || event.metaKey || event.target.closest('input,textarea,select,[contenteditable="true"]')) return;
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
  if (!graphicsError && mode === 'solo' && !document.hidden && (game.phase === 'running' || soloRace && !soloRace.finished && game.phase !== 'paused')) {
    accumulator += dt;
    while (accumulator >= STEP) { if(soloRace)soloRace.update(STEP);else updateGame(game, STEP); accumulator -= STEP; }
  } else accumulator = 0;
  updateHUD();
  const view = mode !== 'solo' && snapshot ? raceView.sample(now) : soloRace ? {game:soloRace.view(),opponents:soloRace.opponents()} : null;
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
      soloRace = null;
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
