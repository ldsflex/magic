import './styles.css';
import { bootstrap, subscribe } from './api.js';
import { createDashboard, setConnected } from './dashboard.js';
import { createPhone } from './phone.js';
import { configureFormatting } from './format.js';
import { el } from './dom.js';

const found = document.getElementById('app');
if (!found) throw new Error('#app is missing from index.html');
const mount: HTMLElement = found;

/** `/phone` (or `#phone`) opens the companion view; anything else is the wall. */
function wantsPhone(): boolean {
  return location.pathname.startsWith('/phone') || location.hash === '#phone';
}

async function start(): Promise<void> {
  const { config, state } = await bootstrap();
  configureFormatting(config);

  document.title = config.household.name;
  document.documentElement.dataset.orientation = config.display.orientation;

  const phone = wantsPhone();
  document.body.classList.add(phone ? 'is-phone' : 'is-wall');

  const view = phone ? createPhone(config) : createDashboard(config);
  view.update(state);

  mount.classList.remove('booting');
  mount.replaceChildren(view.root);

  subscribe(
    (next) => view.update(next),
    (online) => setConnected(mount, online),
  );
}

start().catch((err) => {
  console.error(err);
  // A wall screen has no console, so the failure has to be on the glass.
  mount.replaceChildren(
    el(
      'div',
      { class: 'boot boot-error' },
      el('p', { text: 'Could not reach the dashboard server.' }),
      el('p', { class: 'boot-detail', text: err instanceof Error ? err.message : String(err) }),
    ),
  );
  setTimeout(() => location.reload(), 15_000);
});
