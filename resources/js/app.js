import htmx from 'htmx.org';
import Alpine from 'alpinejs';
import { setupGridSelection } from './grid-selection';

window.htmx = htmx;
window.Alpine = Alpine;

htmx.on('htmx:configRequest', (event) => {
    const token = document.querySelector('meta[name="csrf-token"]')?.content;

    if (token) {
        event.detail.headers['X-CSRF-TOKEN'] = token;
    }
});

Alpine.start();
setupGridSelection();
