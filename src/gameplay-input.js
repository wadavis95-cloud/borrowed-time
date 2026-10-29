// Control timing uses the same monotonic clock as rendering/network measurements.
// Do not use DOM event.timeStamp: older browsers may expose a different epoch.
const clock = () => performance.now();
const COMPATIBILITY_CLICK_MS = 1500;

function capture(element, pointerId) {
  try { element.setPointerCapture?.(pointerId); } catch { /* A detached target can reject capture. */ }
}

function release(element, pointerId) {
  try { element.releasePointerCapture?.(pointerId); } catch { /* Capture may already have ended. */ }
}

function listen(element, handlers) {
  for (const [type, handler] of Object.entries(handlers)) element.addEventListener(type, handler);
  return () => {
    for (const [type, handler] of Object.entries(handlers)) element.removeEventListener(type, handler);
  };
}

/** Activate on press while preserving keyboard/assistive click activation. */
export function bindGameplayButton(element, action, dispatch, {now = clock} = {}) {
  const pressed = new Set();
  let suppressClickUntil = -Infinity;

  const end = event => {
    const at = now();
    if (!pressed.delete(event.pointerId)) return;
    // Start suppression at release too: a long hold must not produce another action.
    suppressClickUntil = at + COMPATIBILITY_CLICK_MS;
    release(element, event.pointerId);
  };
  const remove = listen(element, {
    pointerdown(event) {
      const at = now();
      if (event.button !== 0 || pressed.has(event.pointerId)) return;
      pressed.add(event.pointerId);
      suppressClickUntil = at + COMPATIBILITY_CLICK_MS;
      capture(element, event.pointerId);
      if (!element.disabled) dispatch(action, {eventAt: at, recognizedAt: at, source: 'button'});
    },
    pointerup: end,
    pointercancel: end,
    lostpointercapture: end,
    click(event) {
      const at = now();
      if (element.disabled || (event.button != null && event.button !== 0)) return;
      // Keyboard, assistive technology and HTMLElement.click() use detail 0.
      // Pointer clicks have a positive detail; retain a click-only fallback for
      // environments without Pointer Events while suppressing compatibility clicks.
      if (event.detail !== 0 && (pressed.size || at <= suppressClickUntil)) return;
      dispatch(action, {eventAt: at, recognizedAt: at, source: 'button'});
    },
  });

  // Capture normally routes release here. The document fallback also clears a
  // held pointer when capture is unavailable and the release lands elsewhere.
  const document = element.ownerDocument;
  document?.addEventListener('pointerup', end);
  document?.addEventListener('pointercancel', end);
  return () => {
    remove();
    document?.removeEventListener('pointerup', end);
    document?.removeEventListener('pointercancel', end);
    for (const pointerId of pressed) release(element, pointerId);
    pressed.clear();
  };
}

function direction(dx, dy) {
  if (Math.abs(dx) > 25 && Math.abs(dx) > Math.abs(dy)) return dx > 0 ? 'right' : 'left';
  if (dy < -25) return 'jump';
  return null;
}

/** One action per canvas gesture, as soon as the existing swipe threshold is met. */
export function bindCanvasGestures(canvas, dispatch, {now = clock} = {}) {
  let gesture = null;
  const clear = event => {
    if (!gesture || event.pointerId !== gesture.id) return;
    const id = gesture.id;
    gesture = null;
    release(canvas, id);
  };
  const remove = listen(canvas, {
    pointerdown(event) {
      const at = now();
      if (event.button !== 0 || event.isPrimary === false) return;
      if (gesture && gesture.id !== event.pointerId) return;
      // A fresh down with the same ID recovers from an outside release when
      // capture was unavailable. Different fingers cannot replace this gesture.
      gesture = {id: event.pointerId, x: event.clientX, y: event.clientY, at, consumed: false};
      capture(canvas, event.pointerId);
    },
    pointermove(event) {
      const at = now();
      if (!gesture || event.pointerId !== gesture.id || gesture.consumed) return;
      const action = direction(event.clientX - gesture.x, event.clientY - gesture.y);
      if (!action) return;
      gesture.consumed = true;
      dispatch(action, {eventAt: gesture.at, recognizedAt: at, source: 'swipe'});
    },
    pointerup(event) {
      const at = now();
      if (!gesture || event.pointerId !== gesture.id) return;
      const completed = gesture;
      clear(event);
      if (completed.consumed) return;
      const dx = event.clientX - completed.x;
      const dy = event.clientY - completed.y;
      const action = direction(dx, dy);
      if (action) dispatch(action, {eventAt: completed.at, recognizedAt: at, source: 'swipe'});
      else if (Math.abs(dx) < 10 && Math.abs(dy) < 10) {
        dispatch('jump', {eventAt: completed.at, recognizedAt: at, source: 'tap'});
      }
    },
    pointercancel: clear,
    lostpointercapture: clear,
  });
  // If capture fails, an outside release should cancel the pending gesture,
  // rather than leaving a stale pointer that blocks the next finger.
  const document = canvas.ownerDocument;
  document?.addEventListener('pointerup', clear);
  document?.addEventListener('pointercancel', clear);
  return () => {
    remove();
    document?.removeEventListener('pointerup', clear);
    document?.removeEventListener('pointercancel', clear);
    if (gesture) clear({pointerId: gesture.id});
  };
}
