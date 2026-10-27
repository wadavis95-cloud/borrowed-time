import { createUnityProtocol } from './unity-protocol.js';

const BUILD = '/assets/unity/v5/Race';
let loaderPromise;
function loadUnityLoader() {
  if (!loaderPromise) loaderPromise = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = `${BUILD}.loader.js`;
    script.onload = () => typeof window.createUnityInstance === 'function'
      ? resolve(window.createUnityInstance) : reject(new Error('Unity loader is unavailable'));
    script.onerror = () => reject(new Error('Unity build could not be downloaded'));
    document.head.append(script);
  });
  return loaderPromise;
}

// Same facade as renderer.js, so main.js and the game/network never depend on C#.
export async function createUnityRenderer(canvas, { onProgress = () => {} } = {}) {
  const createUnityInstance = await loadUnityLoader();
  let failed = false, disposed = false;
  const onLost = () => { failed = true; };
  canvas.addEventListener('webglcontextlost', onLost);
  window.addEventListener('borrowed-time-graphics-error', onLost);
  let instance;
  try { instance = await createUnityInstance(canvas, {
    dataUrl: `${BUILD}.data.gz`, frameworkUrl: `${BUILD}.framework.js.gz`, codeUrl: `${BUILD}.wasm.gz`,
    streamingAssetsUrl: '/assets/unity/v5/StreamingAssets',
    companyName: 'Borrowed Time', productName: 'Borrowed Time', productVersion: '5.0.0-preview.1',
    devicePixelRatio: Math.min(window.devicePixelRatio || 1, 1.5),
    matchWebGLToCanvasSize: true,
    showBanner(message, type) {
      console[type === 'error' ? 'error' : 'warn'](message);
      if (type === 'error') failed = true;
    },
  }, onProgress); }
  catch (error) {
    canvas.removeEventListener('webglcontextlost', onLost);
    window.removeEventListener('borrowed-time-graphics-error', onLost);
    throw error;
  }
  const protocol = createUnityProtocol();
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  return {
    draw(game, animationTime, dt, opponents) {
      if (disposed || failed) throw new Error('Unity graphics context is unavailable');
      const packet = protocol.sample(game, dt, opponents, reducedMotion.matches);
      if (packet.course) instance.SendMessage('BorrowedTimeRaceRenderer', 'LoadCourse', JSON.stringify(packet.course));
      instance.SendMessage('BorrowedTimeRaceRenderer', 'RenderFrame', JSON.stringify(packet.frame));
    },
    reset() {
      protocol.reset();
      instance.SendMessage('BorrowedTimeRaceRenderer', 'ResetPresentation');
    },
    dispose() {
      disposed = true;
      canvas.removeEventListener('webglcontextlost', onLost);
      window.removeEventListener('borrowed-time-graphics-error', onLost);
      instance.Quit().catch(error => console.warn('Unity shutdown:', error));
    },
  };
}
