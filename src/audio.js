import {createMusicPlayer} from './music.js';
import { createAudioScene } from './audio-scene.js';
// Local-runner feedback. AudioContext is created/resumed only by unlock()/toggle(),
// which the caller must invoke from a user gesture. No sounds or assets load on import.
const MAX_VOICES = 24;
const SILENCE = .0001;
const finite = (value) => Number.isFinite(value) ? value : 0;
const clock = () => globalThis.performance?.now() ?? Date.now();

export function createGameAudio({enabledByDefault=false}={}) {
  let context = null, master = null, noiseBuffer = null, music = null;
  let requested = enabledByDefault, disposed = false, toggleSequence = 0, previous = null;
  const voices = new Set();
  const scene = createAudioScene();
  let nextBeat=0,tickIndex=0;
  const page = globalThis.document;

  function stopVoices() {
    for (const voice of [...voices]) {
      try { voice.source.stop(); } catch { /* It may already have ended. */ }
      voice.release();
    }
  }

  function reset() {
    previous = null;
    scene.reset();nextBeat=tickIndex=0;music?.reset();
    stopVoices();
  }

  function initialize() {
    const AudioContext = globalThis.AudioContext || globalThis.webkitAudioContext;
    if (!AudioContext) throw new Error('Sound is not supported in this browser.');
    const nextContext = new AudioContext();
    try {
      const nextMaster = nextContext.createGain();
      nextMaster.gain.value = .12;
      nextMaster.connect(nextContext.destination);
      const nextNoise = nextContext.createBuffer(1, Math.ceil(nextContext.sampleRate * 2), nextContext.sampleRate);
      const samples = nextNoise.getChannelData(0);
      for (let i = 0; i < samples.length; i++) samples[i] = Math.random() * 2 - 1;
      context = nextContext;
      master = nextMaster;
      noiseBuffer = nextNoise;
      music?.dispose();
      if(context.decodeAudioData)music=createMusicPlayer(context);
    } catch (error) {
      void nextContext.close().catch(() => {});
      throw error;
    }
  }

  // Every voice has a scheduled end and disconnects its entire graph afterward.
  // The hard cap also bounds resources if a browser delays its ended callbacks.
  function play({ noise = false, frequency, endFrequency = frequency, duration, gain, delay = 0, filter = 'bandpass', pan = 0, attack = .006, wave = 'sine' }) {
    if (voices.size >= MAX_VOICES) return;
    const source = noise ? context.createBufferSource() : context.createOscillator();
    const envelope = context.createGain();
    const nodes = [source, envelope];
    const start = context.currentTime + .005 + delay;
    const end = start + duration;
    if (noise) {
      source.buffer = noiseBuffer;
      const shaping = context.createBiquadFilter();
      shaping.type = filter;
      shaping.Q.value = .65;
      shaping.frequency.setValueAtTime(frequency, start);
      shaping.frequency.exponentialRampToValueAtTime(endFrequency, end);
      source.connect(shaping);
      shaping.connect(envelope);
      nodes.push(shaping);
    } else {
      source.type = wave;
      source.frequency.setValueAtTime(frequency, start);
      source.frequency.exponentialRampToValueAtTime(endFrequency, end);
      source.connect(envelope);
    }
    envelope.gain.setValueAtTime(0, start);
    envelope.gain.linearRampToValueAtTime(gain, start + Math.min(attack,duration*.4));
    envelope.gain.exponentialRampToValueAtTime(SILENCE, end);
    if(context.createStereoPanner&&pan) {
      const panner=context.createStereoPanner();panner.pan.value=pan;envelope.connect(panner);panner.connect(master);nodes.push(panner);
    } else envelope.connect(master);
    const voice = {
      source,
      release() {
        if (!voices.delete(voice)) return;
        source.onended = null;
        for (const node of nodes) node.disconnect();
      },
    };
    voices.add(voice);
    source.onended = voice.release;
    source.start(start);
    source.stop(end + .01);
  }

  function launch(long) {
    // Paid leap: a sharp rising zip with a short airy tail; free hop is softer.
    play({noise:true,frequency:long?900:500,endFrequency:long?2800:1250,duration:long?.16:.11,gain:long?.20:.12});
    play({frequency:long?320:210,endFrequency:long?700:290,duration:.13,gain:.10});
    if(long)play({frequency:540,endFrequency:380,duration:.09,gain:.05,delay:.10});
  }

  function land(surface) {
    play({ noise: true, frequency: surface.frequency*.8, endFrequency: surface.frequency*.3, duration: .14, gain: .27 });
    play({ frequency: surface.body, endFrequency: surface.body*.45, duration: .12, gain: .13 });
  }

  function boost() {
    play({ noise: true, frequency: 350, endFrequency: 2400, duration: .48, gain: .22 });
    play({ frequency: 100, endFrequency: 260, duration: .22, gain: .12 });
  }

  function collision() {
    play({ noise: true, frequency: 1100, endFrequency: 250, duration: .19, gain: .4, filter: 'lowpass' });
    play({ frequency: 78, endFrequency: 36, duration: .17, gain: .25 });
  }

  function escape() {
    for (const [index, frequency] of [392, 493.88, 587.33].entries()) {
      play({ frequency, duration: .26, gain: .12, delay: index * .075 });
    }
  }

  function clockTick(direction) {
    // Mechanical tick/tock, tied only to this runner's remaining seconds.
    // One tick per update at most: never replay missed ticks after a pause.
    const now=context.currentTime;
    nextBeat=Math.min(nextBeat,now+direction.beatSeconds);
    if(now<nextBeat)return;
    const frequency=tickIndex++%2?1000:1400;
    play({noise:true,frequency:3400,endFrequency:1400,duration:.025,gain:.13,filter:'highpass',attack:.002});
    play({frequency,endFrequency:frequency*.68,duration:.025,gain:.075,attack:.002});
    nextBeat=now+direction.beatSeconds;
  }

  function cue(kind,value) {
    if(disposed||!requested||context?.state!=='running'||page?.hidden)return false;
    if(kind==='countdown') {
      const frequency=({3:330,2:392,1:440})[value];if(!frequency)return false;
      play({frequency,endFrequency:frequency,duration:.10,gain:.10});return true;
    }
    if(kind==='go') {
      play({frequency:660,endFrequency:880,duration:.16,gain:.10});
      play({frequency:880,duration:.12,gain:.07,delay:.06});return true;
    }
    return false;
  }

  function update(state) {
    if (disposed) return;
    if (!state || page?.hidden) { reset(); return; }
    const now = clock();
    const direction=scene.update(state);
    // Copy scalar fields: solo mutates the same state object between frames.
    const next = {
      phase: state.phase,mapId:state.mapId,
      elapsed: finite(state.elapsed), distance: finite(state.distance),
      jump: finite(state.jumpRemaining), jumpKind: state.jumpKind,
      boost: finite(state.boostRemaining), hits: finite(state.hits), now,
    };
    const before = previous;
    previous = next;
    void music?.update({mapId:state.mapId,elapsed:next.elapsed,
      playing:requested&&context?.state==='running'&&next.phase==='running',
      duck:next.boost>0||next.jump>0,urgency:direction.urgency});
    if (!requested || context?.state !== 'running') return;
    if (!before) return; // Enabling sound or a new snapshot begins silently.

    // Reconnects, rewinds, and long background gaps must not replay old events.
    const discontinuity = next.mapId !== before.mapId || next.elapsed < before.elapsed - .001
      || next.distance < before.distance - .01 || next.hits < before.hits
      || next.elapsed - before.elapsed > .5 || now - before.now > 500;
    if (discontinuity) { stopVoices(); nextBeat=0;music?.reset();return; }
    if (next.phase === 'won') {
      if (before.phase === 'running') { stopVoices(); escape(); }
      return;
    }
    if (next.phase === 'lost') {
      if(before.phase==='running') {stopVoices();play({frequency:170,endFrequency:85,duration:.22,gain:.10});}
      return;
    }
    if (next.phase !== 'running') {
      // Countdown cues run while the racer is ready. Let scheduled cue voices
      // finish; pause and actual phase transitions still silence ongoing sound.
      if(before.phase!==next.phase||next.phase==='paused')stopVoices();
      return;
    }
    if (before.phase !== 'running') { nextBeat=0;return; }
    clockTick(direction);


    const hit = next.hits > before.hits;
    const launched = next.jump > 0 && (before.jump <= 0
      || next.jumpKind === 'long' && before.jumpKind !== 'long');
    const landed = next.jump <= 0 && before.jump > 0;
    if (hit) collision();
    if (launched) launch(next.jumpKind === 'long');
    if (landed && !hit) land(direction.surface);
    if (next.boost > 0 && before.boost <= 0) boost();

  }

  async function unlock() {
    if(disposed||!requested)return false;
    if(context?.state==='running')return true;
    const sequence=toggleSequence;
    try {
      // Called directly from a click/tap/key gesture, never during page loading.
      if(!context||context.state==='closed')initialize();
      await context.resume();
      if(!requested||disposed){if(context.state!=='closed')await context.suspend();return false;}
      if(context.state!=='running')throw new Error('Sound could not start.');
      return true;
    } catch(error) {
      if(sequence===toggleSequence){requested=false;reset();}
      throw error;
    }
  }

  async function toggle() {
    if (disposed) return false;
    requested = !requested;
    const sequence = ++toggleSequence;
    reset();
    try {
      if (!requested) {
        if (context && context.state !== 'closed') await context.suspend();
      } else {
        // Keep these calls before any await so browser user activation is intact.
        if (!context || context.state === 'closed') initialize();
        await context.resume();
        if (sequence === toggleSequence && context.state !== 'running') {
          throw new Error('Sound could not start. Try the sound button again.');
        }
      }
      return !disposed && requested && context?.state === 'running';
    } catch (error) {
      if (sequence === toggleSequence) {
        requested = false;
        reset();
      }
      throw new Error(error?.message || 'Sound is unavailable in this browser.');
    }
  }

  function onVisibilityChange() {
    if (page.hidden) reset();
  }
  page?.addEventListener('visibilitychange', onVisibilityChange);

  function dispose() {
    if (disposed) return;
    disposed = true;
    requested = false;
    toggleSequence++;
    reset();
    page?.removeEventListener('visibilitychange', onVisibilityChange);
    music?.dispose();music=null;
    master?.disconnect();
    noiseBuffer = null;
    if (context && context.state !== 'closed') void context.close().catch(() => {});
  }

  return { toggle, unlock, update, cue, reset, dispose, get enabled() { return requested; }, get musicTrack(){return music?.track??null;} };
}
