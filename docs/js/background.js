// js/background.js

class Path {
    constructor(w, h) {
        this.init(w, h);
    }

    init(w, h) {
        const side = Math.floor(Math.random() * 4);
        const padding = 50;
        if (side === 0) { this.x = Math.random() * w; this.y = -padding; this.dir = { x: 0, y: 1 }; }
        else if (side === 1) { this.x = w + padding; this.y = Math.random() * h; this.dir = { x: -1, y: 0 }; }
        else if (side === 2) { this.x = Math.random() * w; this.y = h + padding; this.dir = { x: 0, y: -1 }; }
        else { this.x = -padding; this.y = Math.random() * h; this.dir = { x: 1, y: 0 }; }

        this.history =[];
        for (let i = 0; i < 80; i++) {
            this.history.push({ x: this.x, y: this.y });
        }

        const depth = Math.random();
        this.speed = depth * 1.5 + 0.5;
        this.lineWidth = depth * 1.5 + 0.8;
        this.maxHistory = Math.floor(depth * 40 + 80);

        this.turnDistance = Math.random() * 150 + 100;
        this.distCount = 0;
    }

    update(w, h) {
        const currentSpeed = this.speed + (this.beatBoost || 0);
        this.x += this.dir.x * currentSpeed;
        this.y += this.dir.y * currentSpeed;
        this.distCount += currentSpeed;

        this.history.push({ x: this.x, y: this.y });
        if (this.history.length > this.maxHistory) {
            this.history.shift();
        }

        if (this.distCount > this.turnDistance) {
            this.changeDirection();
            this.distCount = 0;
            this.turnDistance = Math.random() * 200 + 100;
        }

        const margin = 150;
        if (this.x < -margin || this.x > w + margin || this.y < -margin || this.y > h + margin) {
            this.init(w, h);
        }
    }

    changeDirection() {
        if (this.dir.x !== 0) {
            this.dir.x = 0;
            this.dir.y = Math.random() > 0.5 ? 1 : -1;
        } else {
            this.dir.x = Math.random() > 0.5 ? 1 : -1;
            this.dir.y = 0;
        }
    }

    draw(ctx) {
        if (this.history.length < 2) return;

        ctx.lineWidth = this.lineWidth;
        ctx.lineCap = 'round';

        const len = this.history.length;
        for (let i = 0; i < len - 1; i++) {
            const p1 = this.history[i];
            const p2 = this.history[i + 1];

            const ratio = i / len;
            const alpha = Math.pow(ratio, 0.5) * 0.7;

            ctx.strokeStyle = `rgba(255, 255, 255, ${alpha})`;
            ctx.beginPath();
            ctx.moveTo(p1.x, p1.y);
            ctx.lineTo(p2.x, p2.y);
            ctx.stroke();
        }
    }
}

export class BackgroundManager {
    constructor() {
        this.canvas = document.createElement('canvas');
        this.canvas.id = 'bg-canvas';
        document.body.prepend(this.canvas);
        this.ctx = this.canvas.getContext('2d');

        this.paths =[];
        this.numPaths = 12;
        this.pause = false; 
        this.isPlayMode = false; 
        this.dataArray = null;
        this.enableWave = true;

        this.resize();
        window.addEventListener('resize', () => this.resize());

        for (let i = 0; i < this.numPaths; i++) {
            this.paths.push(new Path(this.canvas.width, this.canvas.height));
        }
    }

    resize() {
        this.canvas.width = window.innerWidth;
        this.canvas.height = window.innerHeight;
    }

    draw() {
        if (this.pause) {
            if (this.isPlayMode) {
                this.ctx.fillStyle = '#000000';
            } else {
                this.ctx.fillStyle = '#0a0a0a';
            }
            this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
        } else {
            this.ctx.fillStyle = '#1a1a1a';
            this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

            this.paths.forEach(path => {
                path.update(this.canvas.width, this.canvas.height);
                path.draw(this.ctx);
            });
        }

        if (this.enableWave && this.dataArray && (!this.pause || this.isPlayMode)) {
            const numBars = 64; 
            const barWidth = this.canvas.width / numBars;
            
            const gradient = this.ctx.createLinearGradient(0, 0, this.canvas.width, 0);
            gradient.addColorStop(0, 'rgba(255, 50, 100, 0.4)');     
            gradient.addColorStop(0.25, 'rgba(255, 180, 50, 0.4)');  
            gradient.addColorStop(0.5, 'rgba(50, 255, 100, 0.4)');   
            gradient.addColorStop(0.75, 'rgba(50, 150, 255, 0.4)');  
            gradient.addColorStop(1, 'rgba(200, 50, 255, 0.4)');     
            this.ctx.fillStyle = gradient;

            for (let i = 0; i < numBars; i++) {
                const val = this.dataArray[i];
                const height = (val / 255) * (this.canvas.height * 0.25);
                this.ctx.fillRect(i * barWidth + 2, this.canvas.height - height, barWidth - 4, height);
            }
        }

        requestAnimationFrame(() => this.draw());
    }

    start() {
        this.draw();
    }
}