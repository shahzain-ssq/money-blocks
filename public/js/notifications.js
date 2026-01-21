export async function updateNotifications() {
    try {
        const res = await fetch('/api/scenarios.php?action=count');
        const data = await res.json();
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
