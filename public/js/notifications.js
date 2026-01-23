import { fetchJson } from './api.js';

export async function updateNotifications() {
    try {
        const data = await fetchJson('/api/scenarios.php?action=count');
        const badge = document.getElementById('scenarios-badge');
        if (badge) {
            if (data.count > 0) {
                badge.textContent = data.count;
                badge.style.display = 'inline-block';
            } else {
                badge.style.display = 'none';
            }
        }
    } catch (e) {
        console.error('Failed to update notifications', e);
    }
}

// Auto run on load
window.updateNotifications = updateNotifications; // Expose global
updateNotifications();
// Poll every minute
setInterval(updateNotifications, 60000);
