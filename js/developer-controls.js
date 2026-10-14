/* Private exhibition controls are enabled locally through the code in Credits. */
import { Controls } from './control-mode.js';
import { PadBindings } from './controller-bindings.js';
import { ENDINGS, createEndingAccess, isEnding } from './endings.js';
import { DIFFS, DIFF_ORDER } from './difficulty.js';

export function createDeveloperControls(anchor, { onConfigure = () => {}, onPreviewEnding = () => {} } = {}) {
  const endingAccess = createEndingAccess();
  const panel = document.createElement('details');
  panel.id = 'developer-controls';
  panel.className = 'developer-controls';
  panel.innerHTML = `
    <summary>Código</summary>
    <form class="developer-unlock" autocomplete="off">
      <label for="developer-code">Código de desarrollador</label>
      <div class="developer-code-row">
        <input id="developer-code" type="password" autocomplete="off" spellcheck="false" autocapitalize="none" maxlength="128" />
        <button class="mini" type="submit">Activar</button>
      </div>
    </form>
    <p id="developer-code-status" class="option-note" role="status" aria-live="polite"></p>
    <div class="developer-choices hidden">
      <p class="option-note"><strong>Mando habilitado</strong></p>
      <p class="developer-pad-status option-note" role="status" aria-live="polite"></p>
      <p class="option-note">Para usar el mando, vincúlalo con la pantalla o computadora y pulsa un botón. El navegador del televisor también debe reconocerlo.</p>
      <dl class="developer-pad-guide">
        <div><dt>Stick izquierdo / cruceta</dt><dd>Mover y navegar</dd></div>
        <div><dt data-pad-action="jump"></dt><dd>Saltar; pulsa otra vez para el doble salto</dd></div>
        <div><dt data-pad-action="attack"></dt><dd>Atacar; volver al menú al terminar</dd></div>
        <div><dt data-pad-action="dodge"></dt><dd>Esquivar</dd></div>
        <div><dt data-pad-action="interact"></dt><dd>Interactuar</dd></div>
        <div><dt data-pad-action="parry"></dt><dd>Parada</dd></div>
        <div><dt data-pad-action="throw"></dt><dd>Lanzar</dd></div>
        <div><dt data-pad-action="pause"></dt><dd>Pausa</dd></div>
        <div><dt>✕ / ○</dt><dd>Confirmar / volver en los menús</dd></div>
      </dl>
      <p class="option-note">En los menús: arriba y abajo recorren los controles; izquierda y derecha cambian opciones y volumen. Puedes empezar con el apodo guardado o RIKO.</p>
      <button class="mini developer-configure" type="button">Configurar botones del mando</button>
      <button class="mini developer-lock" type="button">Cerrar acceso de desarrollador</button>
    </div>
    <div class="developer-endings hidden">
      <p class="option-note"><strong>Galería de finales</strong></p>
      <p class="option-note">Vista previa de las tres decisiones. No modifica tu partida ni la clasificación.</p>
      <label class="opt-row" for="ending-preview-difficulty"><span>Dificultad</span><select id="ending-preview-difficulty">${DIFF_ORDER.map(key => `<option value="${key}"${key === 'normal' ? ' selected' : ''}>${DIFFS[key].label}</option>`).join('')}</select></label>
      <div class="developer-ending-grid">${Object.entries(ENDINGS).map(([key, ending]) => `<button type="button" class="mini" data-preview-ending="${key}"><strong>FINAL ${key}</strong><span>${ending.choice}</span></button>`).join('')}</div>
      <button class="mini developer-endings-lock" type="button">Cerrar galería</button>
    </div>`;
  anchor.after(panel);

  const form = panel.querySelector('form');
  const input = panel.querySelector('#developer-code');
  const submit = form.querySelector('button');
  const message = panel.querySelector('#developer-code-status');
  const choices = panel.querySelector('.developer-choices');
  const status = panel.querySelector('.developer-pad-status');
  const endings = panel.querySelector('.developer-endings');
  let request = 0;
  let busy = false;

  function refresh() {
    const unlocked = Controls.isUnlocked();
    // Keep the code field reachable after unlocking either independent tool.
    form.classList.remove('hidden');
    choices.classList.toggle('hidden', !unlocked);
    endings.classList.toggle('hidden', !endingAccess.isUnlocked());
    for (const label of panel.querySelectorAll('[data-pad-action]')) label.textContent = PadBindings.getHint(label.dataset.padAction);
    const pad = Controls.getGamepadStatus();
    status.classList.toggle('connected', !!pad.connected && !!pad.ready);
    if (!pad.supported) status.textContent = 'Este navegador no ofrece acceso a mandos. Vincularlo por Bluetooth no basta para jugar aquí.';
    else if (pad.connected && pad.mapping !== 'standard') status.textContent = 'Mando detectado, pero su distribución de botones no es compatible. Usa un mando con distribución estándar.';
    else if (pad.connected && pad.ready) status.textContent = 'Mando listo' + (pad.id ? ' · ' + pad.id : '') + '.';
    else if (pad.connected) status.textContent = 'Mando detectado. Suelta los botones y pulsa uno para activarlo.';
    else status.textContent = Controls.getMode() === 'gamepad' ? 'Esperando mando. Vincúlalo y pulsa un botón para continuar.' : 'Mando sin detectar. Vincúlalo y pulsa un botón para comprobarlo.';
  }

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (busy) return;
    if (!input.value.trim()) { message.textContent = 'Escribe el código de desarrollador.'; input.focus(); return; }
    const revision = ++request;
    busy = true; submit.disabled = true;
    message.textContent = 'Comprobando código…';
    try {
      const value = input.value.trim();
      const previewAccepted = await endingAccess.unlock(value);
      if (revision !== request) return;
      const accepted = previewAccepted || await Controls.unlock(value);
      if (revision !== request) return;
      input.value = '';
      if (accepted) {
        refresh();
        message.textContent = previewAccepted ? 'Galería de finales habilitada en esta sesión.' : 'Mando activo en esta sesión. Puedes editar sus botones en Opciones.';
        panel.querySelector(previewAccepted ? '[data-preview-ending]' : '.developer-configure').focus();
      }
      else { message.textContent = Controls.canUnlock() ? 'Código incorrecto.' : 'Este navegador no puede validar el código. Abre el juego mediante HTTPS en un navegador actualizado.'; input.focus(); }
    } catch {
      if (revision === request) message.textContent = 'No se pudo comprobar el código en este navegador.';
    } finally {
      if (revision === request) { busy = false; submit.disabled = false; }
    }
  });
  panel.querySelector('.developer-configure').addEventListener('click', () => { if (Controls.isUnlocked()) onConfigure(); });
  for (const button of panel.querySelectorAll('[data-preview-ending]')) {
    button.addEventListener('click', () => {
      const ending = button.dataset.previewEnding;
      const difficulty = panel.querySelector('#ending-preview-difficulty').value;
      if (endingAccess.isUnlocked() && isEnding(ending)) onPreviewEnding(ending, DIFFS[difficulty] ? difficulty : 'normal');
    });
  }
  panel.querySelector('.developer-endings-lock').addEventListener('click', () => {
    request++; busy = false; submit.disabled = false; input.value = '';
    endingAccess.lock(); refresh();
    message.textContent = 'Galería cerrada.';
    panel.querySelector('summary').focus();
  });
  panel.querySelector('.developer-lock').addEventListener('click', () => {
    request++; busy = false; submit.disabled = false; input.value = '';
    endingAccess.lock();
    Controls.lock();
    message.textContent = 'Acceso cerrado.';
    panel.querySelector('summary').focus();
  });
  const unsubscribe = Controls.subscribe(refresh);
  refresh();
  return { element: panel, refresh, destroy() { request++; endingAccess.lock(); unsubscribe?.(); panel.remove(); } };
}
