import { createAudioScene } from './audio-scene.js';
// Optional local-runner feedback. AudioContext is created/resumed only by toggle(),
// which the caller must invoke from a user gesture. No sounds or assets load on import.
const STEP_DISTANCE = .36 / .058; // Half of the avatar's .72s run clip, in metres.
const MAX_VOICES = 24;
const SILENCE = .0001;
const finite = (value) => Number.isFinite(value) ? value : 0;
const clock = () => globalThis.performance?.now() ?? Date.now();

export function createGameAudio() {
  let context = null, master = null, noiseBuffer = null;
  let requested = false, disposed = false, toggleSequence = 0, previous = null;
  const voices = new Set();
  const scene = createAudioScene();
  let nextBeat=0,nextAir=0,noteIndex=0;
  const page = globalThis.document;

  function stopVoices() {
    for (const voice of [...voices]) {
      try { voice.source.stop(); } catch { /* It may already have ended. */ }
      voice.release();
    }
  }

  function reset() {
    previous = null;
    scene.reset();nextBeat=nextAir=noteIndex=0;
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
    } catch (error) {
      void nextContext.close().catch(() => {});
      throw error;
    }
  }

  // Every voice has a scheduled end and disconnects its entire graph afterward.
  // The hard cap also bounds resources if a browser delays its ended callbacks.
  function play({ noise = false, frequency, endFrequency = frequency, duration, gain, delay = 0, filter = 'bandpass', pan = 0, attack = .006 }) {
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
      source.type = 'sine';
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

  function footstep(step, surface) {
    play({ noise:true, frequency:surface.frequency*(step%2?1.08:.95), endFrequency:surface.frequency*.55, duration:surface.decay, gain:.19, pan:step%2?.12:-.12 });
    play({ frequency:surface.body, endFrequency:surface.body*.55, duration:surface.decay, gain:.07 });
  }

  function launch(long) {
    play({ noise: true, frequency: 500, endFrequency: long ? 1900 : 1250, duration: long ? .17 : .11, gain: long ? .17 : .12 });
    play({ frequency: long ? 180 : 210, endFrequency: long ? 350 : 290, duration: .13, gain: .09 });
  }

  function land(surface) {
    play({ noise: true, frequency: surface.frequency*.8, endFrequency: surface.frequency*.3, duration: .14, gain: .27 });
    play({ frequency: surface.body, endFrequency: surface.body*.45, duration: .12, gain: .13 });
  }

  function boost() {
    play({ noise: true, frequency: 350, endFrequency: 1800, duration: .25, gain: .2 });
    play({ frequency: 130, endFrequency: 230, duration: .19, gain: .1 });
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

  function environment(direction) {
    const {mapId,surface,warning,impact,urgency,beatSeconds}=direction;
    const event=impact||warning;
    if(event) {
      const pan=(event.lane-1)*.7;
      const warningFrequency={tunnel:320,pirate:170,jungle:250,frozen:1800,orbital:680,desert:480}[mapId];
      play({noise:true,frequency:warningFrequency,endFrequency:warningFrequency*(impact ? .45 : 1.8),duration:impact ? .25 : .22,gain:impact ? .25 : .13,pan,filter:mapId==='pirate'?'lowpass':'bandpass'});
      if(mapId==='pirate'||mapId==='orbital')play({frequency:mapId==='pirate'?65:440,endFrequency:impact?40:220,duration:.18,gain:.08,pan});
    }
    // Short scheduled voices, never a permanent loop. No catch-up bursts after
    // tab switches, pauses or an interrupted AudioContext.
    if(context.currentTime>=nextAir) {
      play({noise:true,frequency:surface.air,endFrequency:surface.air*.8,duration:1.1,gain:.03,filter:'lowpass',attack:.24});
      nextAir=context.currentTime+.85;
    }
    if(context.currentTime>=nextBeat) {
      const notes=[146.83,220,174.61,261.63,146.83,196,174.61,220];
      const transpose={tunnel:1,pirate:1,jungle:1.5,frozen:2,orbital:.75,desert:1.25}[mapId];
      const frequency=notes[noteIndex++%notes.length]*transpose;
      const duck=event ? .35 : 1;
      play({frequency,duration:.52,gain:.027*duck,attack:.055});
      if(urgency>.35)play({frequency:73.42,duration:.10,gain:(.025+urgency*.02)*duck});
      nextBeat=context.currentTime+beatSeconds;
    }
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
      phase: state.phase,
      elapsed: finite(state.elapsed), distance: finite(state.distance),
      jump: finite(state.jumpRemaining), jumpKind: state.jumpKind,
      boost: finite(state.boostRemaining), hits: finite(state.hits), now,
    };
    const before = previous;
    previous = next;
    if (!requested || context?.state !== 'running') return;
    if (!before) return; // Enabling sound or a new snapshot begins silently.

    // Reconnects, rewinds, and long background gaps must not replay old events.
    const discontinuity = next.elapsed < before.elapsed - .001
      || next.distance < before.distance - .01 || next.hits < before.hits
      || next.elapsed - before.elapsed > .5 || now - before.now > 500;
    if (discontinuity) { stopVoices(); nextBeat=nextAir=0;return; }
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
    if (before.phase !== 'running') { nextBeat=nextAir=0;return; }
    environment(direction);

    const hit = next.hits > before.hits;
    const launched = next.jump > 0 && (before.jump <= 0
      || next.jumpKind === 'long' && before.jumpKind !== 'long');
    const landed = next.jump <= 0 && before.jump > 0;
    if (hit) collision();
    if (launched) launch(next.jumpKind === 'long');
    if (landed && !hit) land(direction.surface);
    if (next.boost > 0 && before.boost <= 0) boost();
    const step = Math.floor(next.distance / STEP_DISTANCE);
    if (!hit && !launched && !landed && next.jump <= 0
      && step > Math.floor(before.distance / STEP_DISTANCE)) footstep(step,direction.surface);
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
    master?.disconnect();
    noiseBuffer = null;
    if (context && context.state !== 'closed') void context.close().catch(() => {});
  }

  return { toggle, update, cue, reset, dispose, get enabled() { return requested && context?.state === 'running'; } };
}
