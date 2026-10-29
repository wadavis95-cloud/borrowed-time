import { ABILITIES, CONFIG } from './game.js';

const CHANNELS = Object.freeze({ left: 'lane', right: 'lane', jump: 'jump', longJump: 'jump', boost: 'boost' });
const EPSILON = .0001;
const validTime = value => Number.isFinite(value) && value >= 0;
const validSeq = value => Number.isSafeInteger(value) && value >= 0;
const validRound = value => typeof value === 'string' && value.length > 0 || Number.isSafeInteger(value);
const airborne = state => state.jumpRemaining > 0;
const longArc = state => state.jumpKind === 'long' || state.jumpDuration > CONFIG.normalJumpDuration;

// This is measurement only: no inputs are replayed and no game state is changed.
// An inputSeq acknowledges processing, so each response also needs state evidence
// and a matching change in the pose that was actually submitted to the renderer.
export function createControlTiming({
  observe = () => {}, count = () => {}, now = () => performance.now(),
  maxPending = 60, ttlMs = 5000,
} = {}) {
  if (!Number.isSafeInteger(maxPending) || maxPending < 1 || !Number.isFinite(ttlMs) || ttlMs <= 0) {
    throw new RangeError('Control timing bounds must be positive');
  }
  const pending = new Map(), retiredRounds = new Set(), unacknowledged = new Map();
  const totals = { sent: 0, matched: 0, unmatched: 0, cancelled: 0, anticipated: 0 };
  let roundId = null, lastSentSeq = -1, lastServerTime = -Infinity, lastAck = -1;
  let lastPose = null, laneIntent = null;

  function add(key) {
    totals[key] += 1;
    count(`control${key[0].toUpperCase()}${key.slice(1)}`);
  }
  function retire(trace, reason) {
    if (!pending.delete(trace.seq)) return;
    add(reason);
  }
  function cancelAll() {
    for (const trace of pending.values()) retire(trace, 'cancelled');
    laneIntent = null;
    lastPose = null;
    unacknowledged.clear();
  }
  function useRound(nextRound) {
    if (!validRound(nextRound) || retiredRounds.has(nextRound)) return false;
    if (roundId === nextRound) return true;
    if (roundId !== null) {
      retiredRounds.add(roundId);
      // Round IDs stay local and bounded; callers also reset on connection generation changes.
      if (retiredRounds.size > 8) retiredRounds.delete(retiredRounds.values().next().value);
      cancelAll();
    }
    roundId = nextRound;
    lastSentSeq = -1;
    lastServerTime = -Infinity;
    lastAck = -1;
    return true;
  }
  function prune(at) {
    if (!validTime(at)) return;
    for (const trace of pending.values()) if (at - trace.sentAt > ttlMs) retire(trace, 'unmatched');
    if (laneIntent && at - laneIntent.sentAt > ttlMs) laneIntent = null;
    for (const [channel, intent] of unacknowledged) if (at - intent.sentAt > ttlMs) unacknowledged.delete(channel);
  }
  function paidEvidence(trace, state) {
    const price = ABILITIES[trace.action]?.cost;
    return !price || !Number.isFinite(trace.timeSpent) || !Number.isFinite(state.timeSpent)
      || state.timeSpent - trace.timeSpent >= price - EPSILON;
  }
  function supports(trace, state) {
    if (state?.phase !== 'running') return false;
    if (trace.channel === 'lane') return Math.abs(state.lane - trace.targetLane) < EPSILON;
    if (trace.action === 'boost') return state.boostRemaining > 0 && paidEvidence(trace, state);
    if (!airborne(state)) return false;
    return trace.action === 'longJump' ? longArc(state) && paidEvidence(trace, state) : !longArc(state);
  }
  function renderedStateSupports(trace, state) {
    if (trace.channel !== 'lane') return supports(trace, state);
    const direction = trace.action === 'left' ? -1 : 1;
    // The buffered state and actual pose may both be part-way to the confirmed
    // lane. Waiting for exact equality would hide the first visible response.
    return state?.phase === 'running' && Number.isFinite(state.lane)
      && (state.lane - trace.pose.lane) * direction > EPSILON
      && (state.lane - trace.targetLane) * direction <= EPSILON;
  }

  return {
    sent(action, receipt, metadata, baselineState) {
      const channel = CHANNELS[action], { seq, roundId: inputRound, sentAt } = receipt || {};
      if (!channel || !validSeq(seq) || !validTime(sentAt) || !useRound(inputRound) || seq <= lastSentSeq) return false;
      prune(sentAt);
      lastSentSeq = seq;
      add('sent');
      const { eventAt, recognizedAt } = metadata || {};
      const validTiming = validTime(eventAt) && validTime(recognizedAt) && eventAt <= recognizedAt && recognizedAt <= sentAt;
      if (validTiming) {
        observe('controlDispatch', sentAt - eventAt);
        observe('controlRecognize', sentAt - recognizedAt);
      }
      const previous = [...pending.values()].find(trace => trace.channel === channel);
      const previousIntent = unacknowledged.get(channel);
      // Two coalesced hops/boosts cannot reveal which was accepted. A hop ->
      // paid leap upgrade is distinct because the resulting arc identifies it.
      const ambiguousRepeat = channel !== 'lane' && previousIntent
        && !(previousIntent.action === 'jump' && action === 'longJump');
      if (previous) retire(previous, 'cancelled');
      unacknowledged.set(channel, { action, seq, sentAt });

      const state = baselineState || {};
      const baselinePose = lastPose || { lane: state.lane, jumpHeight: 0, boostFeel: 0 };
      let targetLane, originLane, burstOriginLane;
      if (channel === 'lane') {
        originLane = laneIntent?.targetLane ?? state.lane;
        // Keep the starting authority across an unacknowledged burst. Returning
        // to it may merely continue an older animation already easing there.
        burstOriginLane = laneIntent?.burstOriginLane ?? state.lane;
        const direction = action === 'left' ? -1 : 1;
        targetLane = Math.max(0, Math.min(CONFIG.laneCount - 1, originLane + direction));
        laneIntent = { seq, targetLane, sentAt, burstOriginLane };
      }
      const available = state.phase === 'running' && !ambiguousRepeat
        && (channel !== 'lane' || Number.isFinite(targetLane) && Number.isFinite(baselinePose.lane))
        && (action !== 'jump' || !airborne(state))
        && (action !== 'longJump' || !(airborne(state) && longArc(state)))
        && (action !== 'boost' || !(state.boostRemaining > 0) && !(state.boostCooldown > 0));
      if (!validTiming || !available) {
        add('unmatched');
        return true;
      }
      while (pending.size >= maxPending) retire(pending.values().next().value, 'unmatched');
      pending.set(seq, {
        action, channel, seq, sentAt, recognizedAt, targetLane,
        pose: { ...baselinePose }, timeSpent: state.timeSpent, confirmedAt: null, anticipatedAt: null,
        distinguishable: channel !== 'lane'
          || targetLane !== originLane && targetLane !== burstOriginLane
            && (targetLane - baselinePose.lane) * (action === 'left' ? -1 : 1) > EPSILON,
      });
      return true;
    },

    anticipated(pose, source, submittedAt) {
      if (!validTime(submittedAt) || !pose || !source || source.roundId !== roundId) return;
      prune(submittedAt);
      const trace = pending.get(source.seq);
      if (!trace || trace.channel !== 'lane' || !trace.distinguishable || trace.confirmedAt !== null
        || trace.anticipatedAt !== null || submittedAt < trace.sentAt
        || !Number.isFinite(pose.lane) || !Number.isInteger(source.targetLane)
        || source.targetLane !== trace.targetLane || pose.lane < 0 || pose.lane >= CONFIG.laneCount) return;
      const direction = trace.action === 'left' ? -1 : 1;
      if ((pose.lane - trace.pose.lane) * direction <= EPSILON
        || (pose.lane - trace.targetLane) * direction > EPSILON) return;
      trace.anticipatedAt = submittedAt;
      observe('controlAnticipatedRender', submittedAt - trace.recognizedAt);
      add('anticipated');
      // This pose is provisional. Only confirm() plus rendered() may count it
      // as a corresponding confirmed state, so keep the timing trace pending.
    },

    result(result) {
      if (!result || result.roundId !== roundId || typeof result.accepted !== 'boolean') return;
      prune(now());
      const trace = pending.get(result.seq);
      if (!trace || typeof trace.resultAccepted === 'boolean') return;
      trace.resultAccepted = result.accepted;
      if (result.accepted) return; // Acceptance alone carries no state/pose.
      retire(trace, 'unmatched');
      if (laneIntent?.seq === result.seq) laneIntent = null;
      if (unacknowledged.get(trace.channel)?.seq === result.seq) unacknowledged.delete(trace.channel);
    },

    confirm(snapshot, receivedAt) {
      if (!validTime(receivedAt) || !useRound(snapshot?.room?.roundId)) return;
      prune(receivedAt);
      const seq = snapshot.you?.inputSeq, state = snapshot.you?.game;
      if (!validSeq(seq) || !state || seq < lastAck
        || Number.isFinite(snapshot.serverTime) && snapshot.serverTime < lastServerTime) return;
      lastAck = seq;
      if (Number.isFinite(snapshot.serverTime)) lastServerTime = snapshot.serverTime;
      if (state.phase !== 'running') { cancelAll(); return; }
      for (const trace of pending.values()) {
        if (trace.confirmedAt !== null || seq < trace.seq || receivedAt < trace.sentAt) continue;
        if (trace.distinguishable && supports(trace, state)) trace.confirmedAt = receivedAt;
        else retire(trace, 'unmatched');
      }
      if (laneIntent && seq >= laneIntent.seq) laneIntent = null;
      for (const [channel, intent] of unacknowledged) if (seq >= intent.seq) unacknowledged.delete(channel);
    },

    rendered(pose, provenance, submittedAt) {
      if (!validTime(submittedAt) || !pose || !provenance) return;
      prune(submittedAt);
      if (provenance.roundId !== undefined && provenance.roundId !== roundId) return;
      if (provenance.state?.phase !== 'running') { cancelAll(); return; }
      if (provenance.isPredicted) return;
      if (![pose.lane, pose.jumpHeight, pose.boostFeel].every(Number.isFinite)) return;
      for (const trace of pending.values()) {
        const sourceSeq = trace.action === 'boost' ? provenance.boostInputSeq ?? provenance.inputSeq : provenance.inputSeq;
        if (trace.confirmedAt === null || !validSeq(sourceSeq) || sourceSeq < trace.seq
          || submittedAt < trace.confirmedAt || !renderedStateSupports(trace, provenance.state)) continue;
        const moved = trace.channel === 'lane'
          ? (pose.lane - trace.pose.lane) * (trace.action === 'left' ? -1 : 1) > EPSILON
          : trace.action === 'boost' ? pose.boostFeel - trace.pose.boostFeel > EPSILON
            : trace.action === 'longJump' ? pose.jumpHeight > EPSILON
              && Math.abs(pose.jumpHeight - trace.pose.jumpHeight) > EPSILON
              : pose.jumpHeight - trace.pose.jumpHeight > EPSILON;
        if (!moved) continue;
        observe('controlRender', submittedAt - trace.recognizedAt);
        observe('controlConfirmRender', submittedAt - trace.confirmedAt);
        retire(trace, 'matched');
      }
      lastPose = { lane: pose.lane, jumpHeight: pose.jumpHeight, boostFeel: pose.boostFeel };
    },

    reset() {
      cancelAll();
      roundId = null;
      lastSentSeq = -1;
      lastServerTime = -Infinity;
      lastAck = -1;
      retiredRounds.clear();
    },
    diagnostics() {
      prune(now());
      return { pending: pending.size, ...totals };
    },
  };
}
