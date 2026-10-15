const message = document.getElementById('boot-message');
const RELEASE_VERSION = '8.0.0';

function withTimeout(promise, milliseconds) {
  let timer;
  return Promise.race([
    promise,
    new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('La actualización del juego no respondió.')), milliseconds); }),
  ]).finally(() => clearTimeout(timer));
}

function workerVersion(worker) {
  if (!worker) return Promise.resolve(null);
  return new Promise(resolve => {
    const channel = new MessageChannel();
    const timer = setTimeout(() => finish(null), 600);
    const finish = version => {
      clearTimeout(timer);
      channel.port1.close();
      channel.port2.close();
      resolve(version);
    };
    channel.port1.onmessage = event => finish(event.data?.version || null);
    try { worker.postMessage({ type: 'GET_BUILD_VERSION' }, [channel.port2]); }
    catch { finish(null); }
  });
}

async function waitForCurrentWorker(registration) {
  await new Promise((resolve, reject) => {
    let checking = false;
    const cleanup = () => {
      clearTimeout(timer);
      clearInterval(interval);
      navigator.serviceWorker.removeEventListener('controllerchange', check);
    };
    const check = async () => {
      if (checking) return;
      checking = true;
      const version = await workerVersion(navigator.serviceWorker.controller);
      checking = false;
      if (version === RELEASE_VERSION) { cleanup(); resolve(); }
    };
    const timer = setTimeout(() => {
      cleanup();
      reject(new Error('No se pudo preparar la versión actual del juego.'));
    }, 15000);
    const interval = setInterval(check, 500);
    navigator.serviceWorker.addEventListener('controllerchange', check);
    // A claim may complete between register() and listener installation.
    check();
  });
}

async function prepareGameCache() {
  if (!('serviceWorker' in navigator) || !window.isSecureContext) return;
  const previous = navigator.serviceWorker.controller;
  // Already installed copies work offline without attempting a network update.
  if (await workerVersion(previous) === RELEASE_VERSION) return;
  if (previous) message.textContent = 'Actualizando Lumera y preparando tus partidas…';
  let registration;
  try {
    registration = await withTimeout(navigator.serviceWorker.register(
      new URL('../sw.js', import.meta.url), { updateViaCache: 'none' }), 6000);
  } catch (error) {
    // Private browsing, embedded browsers and unsupported PWA policies still
    // allow the online game when no obsolete worker controls its files.
    if (!navigator.serviceWorker.controller) return;
    throw error;
  }
  if (!registration) return;
  try { await withTimeout(registration.update(), 6000); }
  catch { /* An installation already in progress can still activate offline. */ }
  try { await waitForCurrentWorker(registration); }
  catch (error) {
    if (!navigator.serviceWorker.controller) return;
    throw error;
  }
}

if (location.protocol === 'file:') {
  message.textContent = 'Abre el juego con INICIAR-JUEGO.cmd o un servidor local. Los navegadores necesitan HTTP para cargar los módulos.';
} else {
  try {
    // Never import a new document's module graph through an older cached build.
    // This runs once before gameplay and never reloads an active session.
    await prepareGameCache();
    await import('./main.js');
    document.getElementById('boot-hint').classList.add('hide');
  } catch (error) {
    console.error('No se pudo iniciar Mapache Cinema:', error);
    message.textContent = 'No se pudo cargar el juego. Revisa tu conexión y pulsa Reintentar.';
    const retry = document.createElement('button');
    retry.className = 'back';
    retry.textContent = 'REINTENTAR';
    retry.addEventListener('click', () => location.reload());
    document.getElementById('boot-hint').append(retry);
  }
}
