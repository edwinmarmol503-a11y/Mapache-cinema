/* Private exhibition controls are enabled locally through the code in Credits. */
import { Controls } from './control-mode.js';

export function createDeveloperControls(anchor) {
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
      <label for="developer-control-mode">Forma de jugar</label>
      <select id="developer-control-mode">
        <option value="touch">Táctil</option>
        <option value="keyboard">Teclado</option>
        <option value="gamepad">Mando</option>
      </select>
      <p class="developer-pad-status option-note" role="status" aria-live="polite"></p>
      <p class="option-note">Para usar el mando, vincúlalo con la pantalla o computadora y pulsa un botón. El navegador del televisor también debe reconocerlo.</p>
      <dl class="developer-pad-guide">
        <div><dt>Stick izquierdo / cruceta</dt><dd>Mover y navegar</dd></div>
        <div><dt>Arriba</dt><dd>Saltar; suelta y vuelve a subir para el doble salto</dd></div>
        <div><dt>✕ / □</dt><dd>Confirmar / atacar</dd></div>
        <div><dt>○ / △</dt><dd>Esquivar o volver / interactuar</dd></div>
        <div><dt>L1 / R1</dt><dd>Parada / lanzar</dd></div>
        <div><dt>L2 / R2</dt><dd>Objeto anterior / siguiente</dd></div>
        <div><dt>OPTIONS</dt><dd>Pausa</dd></div>
      </dl>
      <p class="option-note">En los menús: arriba y abajo recorren los controles; izquierda y derecha cambian opciones y volumen. Puedes empezar con el apodo guardado o RIKO.</p>
      <button class="mini developer-lock" type="button">Cerrar acceso de desarrollador</button>
    </div>`;
  anchor.after(panel);

  const form = panel.querySelector('form');
  const input = panel.querySelector('#developer-code');
  const submit = form.querySelector('button');
  const message = panel.querySelector('#developer-code-status');
  const choices = panel.querySelector('.developer-choices');
  const select = panel.querySelector('select');
  const status = panel.querySelector('.developer-pad-status');
  let request = 0;
  let busy = false;

  function refresh() {
    const unlocked = Controls.isUnlocked();
    form.classList.toggle('hidden', unlocked);
    choices.classList.toggle('hidden', !unlocked);
    select.value = Controls.getMode();
    if (unlocked) message.textContent = 'Acceso de desarrollador activo en esta sesión.';
    const pad = Controls.getGamepadStatus();
    status.classList.toggle('connected', !!pad.connected && !!pad.ready);
    if (!pad.supported) status.textContent = 'Este navegador no ofrece acceso a mandos. Vincularlo por Bluetooth no basta para jugar aquí.';
    else if (pad.connected && pad.mapping !== 'standard') status.textContent = 'Mando detectado, pero su distribución de botones no es compatible. Usa un mando con distribución estándar.';
    else if (pad.connected && pad.ready) status.textContent = 'Mando listo' + (pad.id ? ' · ' + pad.id : '') + (Controls.getMode() === 'gamepad' ? '.' : '. Selecciona Mando para jugar.');
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
      const accepted = await Controls.unlock(input.value.trim());
      if (revision !== request) return;
      input.value = '';
      if (accepted) { refresh(); select.focus(); }
      else { message.textContent = Controls.canUnlock() ? 'Código incorrecto.' : 'Este navegador no puede validar el código. Abre el juego mediante HTTPS en un navegador actualizado.'; input.focus(); }
    } catch {
      if (revision === request) message.textContent = 'No se pudo comprobar el código en este navegador.';
    } finally {
      if (revision === request) { busy = false; submit.disabled = false; }
    }
  });
  select.addEventListener('change', () => {
    if (!Controls.setMode(select.value)) message.textContent = 'Activa el acceso de desarrollador para cambiar los controles.';
    refresh();
  });
  panel.querySelector('.developer-lock').addEventListener('click', () => {
    request++; busy = false; submit.disabled = false; input.value = '';
    Controls.lock();
    message.textContent = 'Acceso cerrado.';
    panel.querySelector('summary').focus();
  });
  const unsubscribe = Controls.subscribe(refresh);
  refresh();
  return { element: panel, refresh, destroy() { request++; unsubscribe?.(); panel.remove(); } };
}
