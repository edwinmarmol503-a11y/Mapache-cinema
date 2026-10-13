import { Controls } from './control-mode.js';
import { Input } from './input.js';
import { Save } from './save.js';
import { PadBindings, PAD_BINDING_VERSION, PAD_ACTION_LABELS, prettyPadButton } from './controller-bindings.js';

/** Mounted beside the normal keyboard bindings. It can be operated entirely
 * with the controller: ✕ chooses an action, a fresh press binds it; held OPTIONS
 * cancels. The capture service consumes the press before gameplay or menus. */
export function createControllerSettings(anchor) {
  const opts = Save.loadOpts();
  PadBindings.load(opts.padBindings, opts.padBindingVersion);
  const panel = document.createElement('section');
  panel.id = 'controller-settings';
  panel.className = 'controller-settings hidden';
  panel.setAttribute('aria-label', 'Configurar mando');
  panel.innerHTML = `
    <h3>Botones del mando</h3>
    <p class="option-note">Elige una acción con ✕, suelta los botones y pulsa el que quieras asignar. Mantén OPTIONS para cancelar; para asignarlo, púlsalo y suéltalo. Si el botón ya tenía una acción, se intercambian.</p>
    <p class="option-note">El stick mueve y apunta, sin salto. En los menús, ✕ confirma y ○ vuelve; la cruceta y el stick navegan.</p>
    <p class="controller-bind-status option-note" role="status" aria-live="polite"></p>
    <div class="controller-bind-list"></div>
    <div class="controller-settings-footer">
      <button type="button" class="mini controller-cancel hidden">Cancelar asignación</button>
      <button type="button" class="mini controller-reset">Restaurar botones del mando</button>
    </div>`;
  anchor.after(panel);
  const status = panel.querySelector('.controller-bind-status');
  const cancel = panel.querySelector('.controller-cancel');
  const reset = panel.querySelector('.controller-reset');
  const list = panel.querySelector('.controller-bind-list');
  const buttons = new Map();
  let lastRevision = -1;
  let lastMessage = 'Los cambios se guardan en este navegador.';

  for (const [action, label] of Object.entries(PAD_ACTION_LABELS)) {
    const row = document.createElement('div'); row.className = 'ctl';
    const name = document.createElement('span'); name.textContent = label;
    const button = document.createElement('button');
    button.type = 'button'; button.dataset.padBind = action;
    button.addEventListener('click', () => {
      if (!Controls.isUnlocked() || Controls.getMode() !== 'gamepad' || PadBindings.isCapturing()) return;
      Input.reset();
      PadBindings.beginCapture(action, ({ reason, button: index }) => {
        lastMessage = reason === 'bound' ? label + ': ' + prettyPadButton(index) + '. Guardado.'
          : reason === 'disconnected' ? 'Mando desconectado. La asignación no cambió.' : 'Asignación cancelada.';
        refresh();
        if (!panel.classList.contains('hidden')) button.focus({ preventScroll: true });
      });
    });
    row.append(name, button); list.append(row); buttons.set(action, button);
  }
  cancel.addEventListener('click', () => PadBindings.cancelCapture());
  reset.addEventListener('click', () => {
    PadBindings.cancelCapture(); PadBindings.reset(); Input.reset();
    lastMessage = 'Botones originales restaurados. ✕ salta y □ ataca.'; refresh();
  });

  function refresh() {
    const active = Controls.isUnlocked() && Controls.getMode() === 'gamepad';
    panel.classList.toggle('hidden', !active);
    panel.closest('.panel')?.classList.toggle('controller-configuring', active);
    const state = PadBindings.getState();
    for (const [action, button] of buttons) {
      const listening = state.capture?.action === action;
      button.classList.toggle('listening', listening);
      button.disabled = !!state.capture && !listening;
      button.textContent = listening ? (state.capture.ready ? 'Pulsa un botón…' : 'Suelta los botones…') : prettyPadButton(state.bindings[action]);
      button.setAttribute('aria-label', PAD_ACTION_LABELS[action] + ': ' + button.textContent);
    }
    cancel.classList.toggle('hidden', !state.capture);
    reset.disabled = !!state.capture;
    status.textContent = state.capture ? (state.capture.ready ? 'Pulsa el nuevo botón. Mantén OPTIONS para cancelar.' : 'Centra el stick y suelta todos los botones para comenzar.') : lastMessage;
  }
  const unsubscribeBindings = PadBindings.subscribe((state) => {
    if (state.revision !== lastRevision) {
      lastRevision = state.revision;
      Save.saveOpts({ padBindings: state.bindings, padBindingVersion: PAD_BINDING_VERSION });
    }
    refresh();
  });
  const unsubscribeControls = Controls.subscribe(refresh);
  const screen = anchor.closest('.screen');
  const observer = typeof MutationObserver !== 'undefined' && screen ? new MutationObserver(() => {
    if (screen.classList.contains('hidden')) PadBindings.cancelCapture();
  }) : null;
  observer?.observe(screen, { attributes: true, attributeFilter: ['class'] });
  refresh();
  return { element: panel, refresh, cancelCapture: () => PadBindings.cancelCapture(), destroy() {
    observer?.disconnect(); PadBindings.cancelCapture(); unsubscribeBindings(); unsubscribeControls(); panel.closest('.panel')?.classList.remove('controller-configuring'); panel.remove();
  } };
}
