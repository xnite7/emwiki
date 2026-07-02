/* Split out of the old js/script.js (see git history). Loaded via js/core/bridge.js. */
// ==================== COUNTDOWN SYSTEM ====================
class CountdownManager {
    constructor() {
        this.countdowns = [];
    }

    add(elementId) {
        this.countdowns.push(elementId);
    }

    start() {
        const updateCountdowns = () => {
            const now = new Date();
            const nextReset = new Date();
            nextReset.setDate(nextReset.getDate() + (7 - nextReset.getDay()));
            nextReset.setHours(0, 0, 0, 0);

            const diff = nextReset - now;
            const days = Math.floor(diff / (1000 * 60 * 60 * 24));
            const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
            const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
            const seconds = Math.floor((diff % (1000 * 60)) / 1000);

            const timeString = `${days}d ${hours}h ${minutes}m ${seconds}s`;

            this.countdowns.forEach(id => {
                const el = document.getElementById(id);
                if (el) el.textContent = timeString;
            });
        };

        updateCountdowns();
        setInterval(updateCountdowns, 1000);
    }
}



export { CountdownManager };
