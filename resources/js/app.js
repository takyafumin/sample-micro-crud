import htmx from 'htmx.org';
import Alpine from 'alpinejs';

window.htmx = htmx;
window.Alpine = Alpine;

htmx.on('htmx:configRequest', (event) => {
    const token = document.querySelector('meta[name="csrf-token"]')?.content;

    if (token) {
        event.detail.headers['X-CSRF-TOKEN'] = token;
    }
});

Alpine.start();
