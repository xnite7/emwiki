/* Split out of the old js/script.js (see git history). Loaded via js/core/bridge.js. */
class Confetti {
    constructor() {
        this.canvas = document.createElement('canvas');
        this.canvas.id = 'confetti-canvas';
        document.body.appendChild(this.canvas);
        this.ctx = this.canvas.getContext('2d');
        this.particles = [];
        this.animationFrame = null;

        this.colors = [
            '#24ff5a', // Green
            '#4a9eff', // Blue
            '#ffd700', // Gold
            '#ff5050', // Red
            '#c960fe', // Purple
            '#ffb135', // Orange
            '#00ffff', // Cyan
            '#ff69b4'  // Pink
        ];

        this.resize();
        window.addEventListener('resize', () => this.resize());
    }

    resize() {
        this.canvas.width = window.innerWidth;
        this.canvas.height = window.innerHeight;
    }

    createParticle(x, y) {
        return {
            x: x || Math.random() * this.canvas.width,
            y: y || -10,
            vx: (Math.random() - 0.5) * 8,
            vy: Math.random() * -15 - 5,
            rotation: Math.random() * 360,
            rotationSpeed: (Math.random() - 0.5) * 10,
            size: Math.random() * 8 + 4,
            color: this.colors[Math.floor(Math.random() * this.colors.length)],
            gravity: 0.5,
            life: 1.0,
            decay: Math.random() * 0.01 + 0.005,
            shape: Math.random() > 0.5 ? 'square' : 'circle'
        };
    }

    start() {
        this.canvas.classList.add('active');
        this.particles = [];

        // Create initial burst from top
        for (let i = 0; i < 150; i++) {
            const x = Math.random() * this.canvas.width;
            this.particles.push(this.createParticle(x, 0));
        }

        // Continue spawning confetti for 2 seconds
        let spawnCount = 0;
        const spawnInterval = setInterval(() => {
            for (let i = 0; i < 10; i++) {
                const x = Math.random() * this.canvas.width;
                this.particles.push(this.createParticle(x, 0));
            }
            spawnCount++;
            if (spawnCount > 20) {
                clearInterval(spawnInterval);
            }
        }, 100);

        this.animate();
    }

    animate() {
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

        for (let i = this.particles.length - 1; i >= 0; i--) {
            const p = this.particles[i];

            // Update physics
            p.vy += p.gravity;
            p.x += p.vx;
            p.y += p.vy;
            p.rotation += p.rotationSpeed;
            p.life -= p.decay;

            // Remove if off screen or dead
            if (p.y > this.canvas.height + 50 || p.life <= 0) {
                this.particles.splice(i, 1);
                continue;
            }

            // Draw particle
            this.ctx.save();
            this.ctx.translate(p.x, p.y);
            this.ctx.rotate((p.rotation * Math.PI) / 180);
            this.ctx.globalAlpha = p.life;

            this.ctx.fillStyle = p.color;
            this.ctx.shadowColor = p.color;
            this.ctx.shadowBlur = 8;

            if (p.shape === 'square') {
                this.ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size);
            } else {
                this.ctx.beginPath();
                this.ctx.arc(0, 0, p.size / 2, 0, Math.PI * 2);
                this.ctx.fill();
            }

            this.ctx.restore();
        }

        if (this.particles.length > 0) {
            this.animationFrame = requestAnimationFrame(() => this.animate());
        } else {
            this.stop();
        }
    }

    stop() {
        if (this.animationFrame) {
            cancelAnimationFrame(this.animationFrame);
        }
        this.canvas.classList.remove('active');
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    }
}

export { Confetti };
