// js/play.js
class Particle {
    constructor(x, y, color, type) {
        this.x = x; this.y = y; this.color = color; this.type = type;
        this.life = 1.0;
        if (type === 'firework') {
            const angle = Math.random() * Math.PI * 2;
            const speed = Math.random() * 8 + 2;
            this.vx = Math.cos(angle) * speed;
            this.vy = Math.sin(angle) * speed;
            this.decay = Math.random() * 0.02 + 0.01;
            this.size = Math.random() * 5 + 3;
        } else {
            const angle = Math.random() * Math.PI * 2;
            const speed = Math.random() * 3 + 1;
            this.vx = Math.cos(angle) * speed;
            this.vy = Math.sin(angle) * speed;
            this.decay = Math.random() * 0.04 + 0.02;
            this.size = Math.random() * 4 + 2;
        }
    }
    update() {
        this.x += this.vx; this.y += this.vy;
        if (this.type === 'firework') this.vy += 0.1;
        this.life -= this.decay;
    }
    draw(ctx) {
        if (this.life <= 0) return;
        ctx.globalAlpha = this.life;
        ctx.fillStyle = this.color;
        ctx.beginPath(); ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2); ctx.fill();
        ctx.globalAlpha = 1.0;
    }
}

export class PlayEngine {
    constructor(canvasId, ui, audioManager) {
        this.canvas = document.getElementById(canvasId);
        this.ctx = this.canvas.getContext('2d');
        this.ui = ui;
        this.audioManager = audioManager;

        this.cellSize = 140;
        this.cols = 7;
        this.rows = 5;
        this.logicWidth = this.cols * this.cellSize;
        this.logicHeight = this.rows * this.cellSize;

        this.resizeCanvas = this.resizeCanvas.bind(this);
        window.addEventListener('resize', this.resizeCanvas);
        this.resizeCanvas();

        this.grid = [];
        this.player = null;
        this.particles = [];
        this.keys = {};

        this.isRunning = false;
        this.isCleared = false;
        this.clearFlash = 0;
        this.animId = null;
        this.elapsedTime = 0;
        this.startTime = null;

        this.currentLevelId = null;
        this.socketsForHint = [];
        this.playerTextTimer = 0;

        this.initialData = null;
        this.isTestMode = false;

        this.handleKeyDown = this.handleKeyDown.bind(this);
        this.handleKeyUp = this.handleKeyUp.bind(this);
    }

    resizeCanvas() {
        const dpr = window.devicePixelRatio || 1;
        this.canvas.width = Math.floor(this.logicWidth * dpr);
        this.canvas.height = Math.floor(this.logicHeight * dpr);

        const maxW = window.innerWidth * 0.95;
        const maxH = window.innerHeight * 0.80;
        const scale = Math.min(maxW / this.logicWidth, maxH / this.logicHeight);
        this.canvas.style.width = `${this.logicWidth * scale}px`;
        this.canvas.style.height = `${this.logicHeight * scale}px`;
    }

    loadLevel(data, levelInfo, isTestMode = false) {
        if (!data || !data.grid || data.grid.length === 0) return false;
        this.isTestMode = isTestMode;
        this.initialData = JSON.parse(JSON.stringify(data));
        this.grid = JSON.parse(JSON.stringify(data.grid));

        this.rows = this.grid.length;
        this.cols = this.grid[0].length;
        this.logicWidth = this.cols * this.cellSize;
        this.logicHeight = this.rows * this.cellSize;
        this.resizeCanvas();

        this.player = null;
        this.particles = [];
        this.keys = {};

        this.currentLevelId = levelInfo ? levelInfo.id : null;
        this.socketsForHint = [];

        for (let r = 0; r < this.rows; r++) {
            for (let c = 0; c < this.cols; c++) {
                if (!this.grid[r][c].connections) {
                    this.grid[r][c].connections = { top: true, bottom: true, left: true, right: true };
                }

                if (this.grid[r][c].type === 'color_socket') {
                    this.socketsForHint.push({ x: c, y: r });
                }

                if (this.grid[r][c].type === 'player') {
                    this.player = {
                        x: c, y: r,
                        px: c * this.cellSize + this.cellSize / 2,
                        py: r * this.cellSize + this.cellSize / 2,
                        drawX: c * this.cellSize + this.cellSize / 2,
                        drawY: r * this.cellSize + this.cellSize / 2,
                        vx: 0, vy: 0,
                        prevColor: this.grid[r][c].color,
                        targetColor: this.grid[r][c].color,
                        currentColor: this.grid[r][c].color,
                        colorProgress: 1,
                        isBouncingBack: false
                    };
                }
            }
        }

        if (!this.player) {
            this.ui.showToast("プレイヤーが配置されていません");
            return false;
        }

        this.isCleared = false;
        this.clearFlash = 0;
        this.elapsedTime = 0;
        this.startTime = null;
        document.getElementById('play-clear-overlay').style.display = 'none';

        const backBtn = document.getElementById('play-back-btn');
        if (backBtn) {
            backBtn.innerText = isTestMode ? "編集に戻る" : "戻る";
        }

        if (levelInfo) {
            document.getElementById('play-info-title').innerText = levelInfo.title;
            document.getElementById('play-info-subtitle').innerText = levelInfo.subtitle;
            document.getElementById('play-info-author').innerText = `Created by ${levelInfo.author}`;
            const infoOverlay = document.getElementById('play-info-overlay');
            infoOverlay.classList.remove('show', 'move-up');
            setTimeout(() => {
                infoOverlay.classList.add('show');
                setTimeout(() => infoOverlay.classList.add('move-up'), 1500);
            }, 300);
        }

        return true;
    }
    resetLevel(onComplete) {
        if (!this.initialData) return;
        this.audioManager.play('se_reset');
        this.ui.playResetWipe(() => {
            this.loadLevel(this.initialData, null, this.isTestMode);
            if (onComplete) onComplete();
        });
    }

    start() {
        if (!this.player) return;
        if (this.isRunning) return;

        this.isRunning = true;
        this.startTime = Date.now();
        this.lastTime = performance.now();
        this.playerTextTimer = 0;

        window.addEventListener('keydown', this.handleKeyDown);
        window.addEventListener('keyup', this.handleKeyUp);

        this.loop();
    }

    stop() {
        this.isRunning = false;
        window.removeEventListener('keydown', this.handleKeyDown);
        window.removeEventListener('keyup', this.handleKeyUp);

        if (this.animId) {
            cancelAnimationFrame(this.animId);
            this.animId = null;
        }
        this.keys = {};
    }

    spawnColorParticles(x, y, color) {
        if (color === '#333333' || color === '#ffffff') return;
        for (let i = 0; i < 15; i++) {
            this.particles.push(new Particle(x, y, color, 'normal'));
        }
    }

    spawnFireworks(x, y) {
        const colors = ['#ff0000', '#00ff00', '#0000ff', '#ffff00', '#ff00ff', '#00ffff'];
        for (let i = 0; i < 80; i++) {
            this.particles.push(new Particle(x, y, colors[Math.floor(Math.random() * colors.length)], 'firework'));
        }
    }

    handleKeyDown(e) {
        if (!this.isRunning || this.isCleared) return;

        if (document.getElementById('fake-loading-overlay').classList.contains('active') || this.ui.isTransitioning) {
            return;
        }

        const key = e.key.toLowerCase();
        this.keys[key] = true;
        this.keys[e.key] = true;

        if (key === 'r') {
            this.stop();
            this.resetLevel(() => {
                this.start();
            });
            return;
        }

        if (key === 'z' || key === ' ' || key === 'spacebar') {
            if (Date.now() - this.startTime < 300) return;
            this.handleAction();
        }
    }

    handleKeyUp(e) {
        this.keys[e.key.toLowerCase()] = false;
        this.keys[e.key] = false;
    }

    canMoveTo(fromX, fromY, toX, toY) {
        if (toX < 0 || toX >= this.cols || toY < 0 || toY >= this.rows) return false;
        const fromTile = this.grid[fromY][fromX];
        const toTile = this.grid[toY][toX];
        if (toTile.type === 'empty') return false;

        let dirFrom, dirTo;
        if (toY < fromY) { dirFrom = 'top'; dirTo = 'bottom'; }
        else if (toY > fromY) { dirFrom = 'bottom'; dirTo = 'top'; }
        else if (toX < fromX) { dirFrom = 'left'; dirTo = 'right'; }
        else if (toX > fromX) { dirFrom = 'right'; dirTo = 'left'; }
        else return false;

        const fromConn = fromTile.connections || { top: true, bottom: true, left: true, right: true };
        const toConn = toTile.connections || { top: true, bottom: true, left: true, right: true };

        if (!(fromConn[dirFrom] && toConn[dirTo])) return false;

        const playerColor = this.player.targetColor;
        if (toTile.type === 'color_pass') {
            const colors = toTile.color ? toTile.color.split(',') : [];
            if (!colors.includes(playerColor)) return false;
        }
        if (toTile.type === 'color_block') {
            const colors = toTile.color ? toTile.color.split(',') : [];
            if (colors.includes(playerColor)) return false;
        }
        return true;
    }

    parseSocketRules(str) {
        if (!str) return [];
        return str.split(',').map(s => {
            const parts = s.split('>');
            if (parts.length === 2) {
                return { in: parts[0].trim(), out: parts[1].trim() };
            } else {
                return { in: s.trim(), out: s.trim() };
            }
        }).filter(r => r.in || r.out);
    }

    changeSocketColor(x, y, newColor) {
        const visited = new Set();
        const queue = [{ x, y }];

        while (queue.length > 0) {
            const current = queue.shift();
            const key = `${current.x},${current.y}`;
            if (visited.has(key)) continue;
            visited.add(key);

            const tile = this.grid[current.y][current.x];
            tile.color = newColor;
            const cx = current.x * this.cellSize + this.cellSize / 2;
            const cy = current.y * this.cellSize + this.cellSize / 2;
            this.spawnColorParticles(cx, cy, newColor);

            const rules = this.parseSocketRules(tile.socketId);
            const outs = rules.map(r => r.out).filter(Boolean);

            if (outs.length === 0) continue;

            for (let r = 0; r < this.rows; r++) {
                for (let c = 0; c < this.cols; c++) {
                    const t = this.grid[r][c];
                    if (t.type === 'color_socket' && t.socketId && !(r === current.y && c === current.x)) {
                        const tRules = this.parseSocketRules(t.socketId);
                        const hasMatchingIn = tRules.some(tr => outs.includes(tr.in));
                        if (hasMatchingIn) {
                            queue.push({ x: c, y: r });
                        }
                    }
                }
            }
        }
    }

    handleAction() {
        const gridX = Math.floor(this.player.px / this.cellSize);
        const gridY = Math.floor(this.player.py / this.cellSize);
        if (gridX < 0 || gridX >= this.cols || gridY < 0 || gridY >= this.rows) return;

        const tile = this.grid[gridY][gridX];
        let colorChanged = false;

        if (tile.type === 'color_socket') {
            if (tile.color === '#333333') {
                if (this.player.targetColor !== '#333333') {
                    this.changeSocketColor(gridX, gridY, this.player.targetColor);
                    this.changePlayerColor('#333333');
                    colorChanged = true;
                }
            } else {
                const newColor = this.mixTwo(this.player.targetColor, tile.color);
                this.changePlayerColor(newColor);
                this.changeSocketColor(gridX, gridY, '#333333');
                colorChanged = true;
            }
        } else if (tile.type === 'vision_reverser') {
            const newColor = this.reverseColor(this.player.targetColor);
            if (newColor !== this.player.targetColor) {
                this.changePlayerColor(newColor);
                colorChanged = true;
            }
        }

        if (colorChanged && (this.player.vx !== 0 || this.player.vy !== 0)) {
            const centerX = gridX * this.cellSize + this.cellSize / 2;
            const centerY = gridY * this.cellSize + this.cellSize / 2;

            const isMovingOut =
                (this.player.vx > 0 && this.player.px >= centerX) ||
                (this.player.vx < 0 && this.player.px <= centerX) ||
                (this.player.vy > 0 && this.player.py >= centerY) ||
                (this.player.vy < 0 && this.player.py <= centerY);

            if (isMovingOut) {
                const targetX = gridX + this.player.vx;
                const targetY = gridY + this.player.vy;

                if (!this.canMoveTo(gridX, gridY, targetX, targetY)) {
                    this.player.vx = -this.player.vx;
                    this.player.vy = -this.player.vy;
                    this.player.isBouncingBack = true;
                }
            }
        }
    }

    changePlayerColor(newColor) {
        this.player.prevColor = this.player.currentColor;
        this.player.targetColor = newColor;
        this.player.colorProgress = 0;
        this.audioManager.play('se_change');
        this.spawnColorParticles(this.player.px, this.player.py, newColor);
    }

    mixTwo(c1, c2) {
        c1 = this.normalizeHex(c1);
        c2 = this.normalizeHex(c2);

        if (c1 === '#333333') return c2;
        if (c2 === '#333333') return c1;
        if (c1 === c2) return c1;

        const specialMix = {
            '0000ff|ff0000': '#800080',
            'ff0000|ffff00': '#ffa500',
            '0000ff|ffff00': '#00ff00',
        };

        const key = [c1.slice(1), c2.slice(1)].sort().join('|');
        if (specialMix[key]) return specialMix[key];

        const r1 = parseInt(c1.substr(1, 2), 16), g1 = parseInt(c1.substr(3, 2), 16), b1 = parseInt(c1.substr(5, 2), 16);
        const r2 = parseInt(c2.substr(1, 2), 16), g2 = parseInt(c2.substr(3, 2), 16), b2 = parseInt(c2.substr(5, 2), 16);

        return '#' + [(r1 + r2) >> 1, (g1 + g2) >> 1, (b1 + b2) >> 1].map(x => x.toString(16).padStart(2, '0')).join('');
    }

    reverseColor(c) {
        c = this.normalizeHex(c);
        if (c === '#333333' || c === '#ffffff') return c;

        // ★パレットの主要な色が綺麗に相互反転するように固定ペアを復活
        const revs = {
            '#ff0000': '#00ff00', '#00ff00': '#ff0000', // 赤 ↔ 緑
            '#ffff00': '#800080', '#800080': '#ffff00', // 黄 ↔ 紫
            '#0000ff': '#ffa500', '#ffa500': '#0000ff', // 青 ↔ 橙
            '#00ffff': '#ff4000', '#ff4000': '#00ffff', // シアン ↔ 朱色
            '#ff00ff': '#80ff00', '#80ff00': '#ff00ff'  // マゼンタ ↔ 黄緑
        };
        if (revs[c]) return revs[c];

        // それ以外のカスタム混色などはRYB色相環を用いた計算で正確に反転
        const r = parseInt(c.substr(1, 2), 16);
        const g = parseInt(c.substr(3, 2), 16);
        const b = parseInt(c.substr(5, 2), 16);

        const max = Math.max(r, g, b), min = Math.min(r, g, b);
        const d = max - min;
        let h = 0, s = max === 0 ? 0 : d / max, v = max / 255;

        if (max !== min) {
            switch (max) {
                case r: h = (g - b) / d + (g < b ? 6 : 0); break;
                case g: h = (b - r) / d + 2; break;
                case b: h = (r - g) / d + 4; break;
            }
            h /= 6;
        }
        h *= 360;

        if (s < 0.05) {
            return '#' + [255 - r, 255 - g, 255 - b].map(x => x.toString(16).padStart(2, '0')).join('');
        }

        const rgbToRyb = (hIn, vIn) => {
            if (Math.abs(hIn - 300) < 5 && vIn < 0.75) return 300;

            const map = [
                [0, 0], [15, 30], [30, 60], [60, 120], [90, 150], [120, 180],
                [180, 210], [240, 240], [300, 330], [360, 360]
            ];
            for (let i = 0; i < map.length - 1; i++) {
                if (hIn >= map[i][0] && hIn <= map[i + 1][0]) {
                    const t = (hIn - map[i][0]) / (map[i + 1][0] - map[i][0]);
                    return map[i][1] + t * (map[i + 1][1] - map[i][1]);
                }
            }
            return 0;
        };

        const rybToRgb = (rybIn) => {
            const map = [
                [0, 0], [30, 15], [60, 30], [120, 60], [150, 90], [180, 120],
                [210, 180], [240, 240], [300, 300], [330, 300], [360, 360]
            ];
            for (let i = 0; i < map.length - 1; i++) {
                if (rybIn >= map[i][0] && rybIn <= map[i + 1][0]) {
                    const t = (rybIn - map[i][0]) / (map[i + 1][0] - map[i][0]);
                    return map[i][1] + t * (map[i + 1][1] - map[i][1]);
                }
            }
            return 0;
        };

        let rybH = rgbToRyb(h, v);
        let origRybH = rybH;
        rybH = (rybH + 180) % 360;
        let newH = rybToRgb(rybH);

        const getBaseV = (rybHue) => {
            let dist = Math.min(Math.abs(rybHue - 300), 360 - Math.abs(rybHue - 300));
            if (dist < 60) return 0.5 + 0.5 * (dist / 60);
            return 1.0;
        };

        let relV = v / getBaseV(origRybH);
        let newV = relV * getBaseV(rybH);
        newV = Math.min(1.0, Math.max(0, newV));

        let newR, newG, newB;
        let i = Math.floor(newH / 60);
        let f = newH / 60 - i;
        let p = newV * (1 - s);
        let q = newV * (1 - f * s);
        let t_val = newV * (1 - (1 - f) * s);

        switch (i % 6) {
            case 0: newR = newV; newG = t_val; newB = p; break;
            case 1: newR = q; newG = newV; newB = p; break;
            case 2: newR = p; newG = newV; newB = t_val; break;
            case 3: newR = p; newG = q; newB = newV; break;
            case 4: newR = t_val; newG = p; newB = newV; break;
            case 5: newR = newV; newG = p; newB = q; break;
        }

        const toHex = x => Math.round(x * 255).toString(16).padStart(2, '0');
        return '#' + toHex(newR) + toHex(newG) + toHex(newB);
    }

    lerpHex(c1, c2, t) {
        const a = this.hexToRgb(c1);
        const b = this.hexToRgb(c2);
        return this.rgbToHex(
            Math.round(a.r + (b.r - a.r) * t),
            Math.round(a.g + (b.g - a.g) * t),
            Math.round(a.b + (b.b - a.b) * t)
        );
    }

    normalizeHex(hex) {
        hex = (hex || '#000000').toLowerCase();
        if (hex.length === 4) {
            return '#' + hex[1] + hex[1] + hex[2] + hex[2] + hex[3] + hex[3];
        }
        return hex;
    }

    hexToRgb(hex) {
        hex = this.normalizeHex(hex);
        return {
            r: parseInt(hex.slice(1, 3), 16),
            g: parseInt(hex.slice(3, 5), 16),
            b: parseInt(hex.slice(5, 7), 16)
        };
    }

    rgbToHex(r, g, b) {
        return '#' + [r, g, b]
            .map(v => Math.max(0, Math.min(255, v)).toString(16).padStart(2, '0'))
            .join('');
    }

    checkGoal(gridX, gridY) {
        const tile = this.grid[gridY][gridX];
        if (tile.type === 'goal' && !this.isCleared) {
            this.isCleared = true;
            this.elapsedTime = Date.now() - this.startTime;
            this.clearFlash = 1;

            this.player.px = gridX * this.cellSize + this.cellSize / 2;
            this.player.py = gridY * this.cellSize + this.cellSize / 2;
            this.player.vx = 0;
            this.player.vy = 0;

            this.audioManager.play('se_complete');
            document.getElementById('play-clear-overlay').style.display = 'flex';

            const chars = document.querySelectorAll('.clear-char');
            chars.forEach((char, i) => {
                char.classList.remove('show');
                setTimeout(() => {
                    char.classList.add('show');
                }, i * 80);
            });

            const testBtns = document.getElementById('play-clear-buttons-test');
            const normalBtns = document.getElementById('play-clear-buttons-normal');

            testBtns.classList.remove('show');
            normalBtns.classList.remove('show');

            testBtns.style.display = this.isTestMode ? 'flex' : 'none';
            normalBtns.style.display = this.isTestMode ? 'none' : 'flex';

            setTimeout(() => {
                if (this.isTestMode) testBtns.classList.add('show');
                else normalBtns.classList.add('show');
            }, chars.length * 80 + 400);

            this.spawnFireworks(this.player.px, this.player.py);
        }
    }

    drawConnections(time) {
        const sockets = [];
        for (let r = 0; r < this.rows; r++) {
            for (let c = 0; c < this.cols; c++) {
                const t = this.grid[r][c];
                if (t.type === 'color_socket' && t.socketId) {
                    sockets.push({ x: c, y: r, rules: this.parseSocketRules(t.socketId) });
                }
            }
        }

        this.ctx.strokeStyle = 'rgba(150, 150, 150, 0.6)';
        this.ctx.lineWidth = 4;
        const drawnLines = new Set();

        for (let i = 0; i < sockets.length; i++) {
            for (let j = 0; j < sockets.length; j++) {
                if (i === j) continue;

                const iOuts = sockets[i].rules.map(r => r.out).filter(Boolean);
                const jIns = sockets[j].rules.map(r => r.in).filter(Boolean);
                const connected = iOuts.some(out => jIns.includes(out));

                if (connected) {
                    const lineKey = `${i}->${j}`;
                    if (drawnLines.has(lineKey)) continue;
                    drawnLines.add(lineKey);

                    const x1 = sockets[i].x * this.cellSize + this.cellSize / 2;
                    const y1 = sockets[i].y * this.cellSize + this.cellSize / 2;
                    const x2 = sockets[j].x * this.cellSize + this.cellSize / 2;
                    const y2 = sockets[j].y * this.cellSize + this.cellSize / 2;

                    const dx = x2 - x1;
                    const dy = y2 - y1;
                    const dist = Math.sqrt(dx * dx + dy * dy);

                    if (dist === 0) continue;

                    const nx = -dy / dist;
                    const ny = dx / dist;

                    this.ctx.beginPath();
                    this.ctx.moveTo(x1, y1);

                    const segments = Math.floor(dist / 3);
                    const wavelength = 55;
                    const amplitude = 12;
                    const speed = time * 3.0;

                    for (let k = 1; k <= segments; k++) {
                        const t = k / segments;
                        let px = x1 + dx * t;
                        let py = y1 + dy * t;
                        const d = t * dist;
                        const envelope = Math.min(d / 20, (dist - d) / 20, 1.0);
                        const wave = Math.sin((d / wavelength) * Math.PI * 2 - speed) * amplitude * envelope;
                        this.ctx.lineTo(px + nx * wave, py + ny * wave);
                    }
                    this.ctx.stroke();
                }
            }
        }
    }

    loop(currentTime) {
        if (!this.isRunning) return;

        if (!this.lastTime) this.lastTime = currentTime || performance.now();
        const now = currentTime || performance.now();
        let dt = (now - this.lastTime) / (1000 / 60);
        this.lastTime = now;

        if (dt > 3) dt = 3;
        if (dt <= 0) dt = 1;

        if (this.playerTextTimer < 3000) {
            this.playerTextTimer += dt * (1000 / 60);
        }

        if (this.player.colorProgress < 1) {
            this.player.colorProgress += 0.1;
            if (this.player.colorProgress >= 1) {
                this.player.colorProgress = 1;
                this.player.currentColor = this.player.targetColor;
            } else {
                this.player.currentColor = this.lerpHex(this.player.prevColor, this.player.targetColor, this.player.colorProgress);
            }
        }

        const SPEED = 3.5;
        const ALLOWED_DIST = 20;

        if (!this.isCleared) {
            let reqDx = 0, reqDy = 0;
            if (this.keys['w'] || this.keys['arrowup']) reqDy = -1;
            else if (this.keys['s'] || this.keys['arrowdown']) reqDy = 1;
            if (this.keys['a'] || this.keys['arrowleft']) reqDx = -1;
            else if (this.keys['d'] || this.keys['arrowright']) reqDx = 1;

            if (reqDx !== 0 && reqDy !== 0) {
                if (this.player.vx !== 0) reqDy = 0;
                else if (this.player.vy !== 0) reqDx = 0;
                else reqDy = 0;
            }

            let gridX = Math.floor(this.player.px / this.cellSize);
            let gridY = Math.floor(this.player.py / this.cellSize);
            const centerX = gridX * this.cellSize + this.cellSize / 2;
            const centerY = gridY * this.cellSize + this.cellSize / 2;
            const distToCenter = Math.abs(this.player.px - centerX) + Math.abs(this.player.py - centerY);

            if (reqDx !== 0 || reqDy !== 0) {
                if (this.player.vx === 0 && this.player.vy === 0) {
                    if (this.canMoveTo(gridX, gridY, gridX + reqDx, gridY + reqDy)) {
                        this.player.px = centerX;
                        this.player.py = centerY;
                        this.player.vx = reqDx;
                        this.player.vy = reqDy;
                    }
                } else if (this.player.vx === -reqDx && this.player.vy === -reqDy) {
                    if (this.canMoveTo(gridX, gridY, gridX + reqDx, gridY + reqDy)) {
                        this.player.vx = reqDx;
                        this.player.vy = reqDy;
                        this.player.isBouncingBack = false;
                    }
                } else if (this.player.vx !== reqDx || this.player.vy !== reqDy) {
                    if (distToCenter <= ALLOWED_DIST) {
                        if (this.canMoveTo(gridX, gridY, gridX + reqDx, gridY + reqDy)) {
                            this.player.px = centerX;
                            this.player.py = centerY;
                            this.player.vx = reqDx;
                            this.player.vy = reqDy;
                            this.player.isBouncingBack = false;
                        }
                    }
                }
            }

            if (this.player.vx !== 0 || this.player.vy !== 0) {
                const nextPx = this.player.px + this.player.vx * SPEED;
                const nextPy = this.player.py + this.player.vy * SPEED;

                const isCrossingCenter = (this.player.vx > 0 && this.player.px <= centerX && nextPx >= centerX) ||
                    (this.player.vx < 0 && this.player.px >= centerX && nextPx <= centerX) ||
                    (this.player.vy > 0 && this.player.py <= centerY && nextPy >= centerY) ||
                    (this.player.vy < 0 && this.player.py >= centerY && nextPy <= centerY);

                if (isCrossingCenter) {
                    this.player.px = centerX;
                    this.player.py = centerY;
                    this.player.x = gridX;
                    this.player.y = gridY;
                    this.checkGoal(gridX, gridY);

                    const over = (this.player.vx !== 0) ? Math.abs(nextPx - centerX) : Math.abs(nextPy - centerY);

                    if (this.player.isBouncingBack) {
                        this.player.vx = 0;
                        this.player.vy = 0;
                        this.player.isBouncingBack = false;
                    } else if (reqDx === 0 && reqDy === 0) {
                        this.player.vx = 0;
                        this.player.vy = 0;
                    } else if (reqDx === this.player.vx && reqDy === this.player.vy) {
                        if (!this.canMoveTo(gridX, gridY, gridX + this.player.vx, gridY + this.player.vy)) {
                            this.player.vx = 0;
                            this.player.vy = 0;
                        } else {
                            this.player.px += this.player.vx * over;
                            this.player.py += this.player.vy * over;
                        }
                    } else {
                        if (this.canMoveTo(gridX, gridY, gridX + reqDx, gridY + reqDy)) {
                            this.player.vx = reqDx;
                            this.player.vy = reqDy;
                            this.player.px += this.player.vx * over;
                            this.player.py += this.player.vy * over;
                        } else {
                            if (this.canMoveTo(gridX, gridY, gridX + this.player.vx, gridY + this.player.vy)) {
                                this.player.px += this.player.vx * over;
                                this.player.py += this.player.vy * over;
                            } else {
                                this.player.vx = 0;
                                this.player.vy = 0;
                            }
                        }
                    }
                } else {
                    this.player.px = nextPx;
                    this.player.py = nextPy;
                }
            }
        }

        this.player.drawX = this.player.px;
        this.player.drawY = this.player.py;

        for (let i = this.particles.length - 1; i >= 0; i--) {
            this.particles[i].update();
            if (this.particles[i].life <= 0) this.particles.splice(i, 1);
        }

        this.draw();
        this.animId = requestAnimationFrame((t) => this.loop(t));
    }

    draw() {
        const time = performance.now() * 0.004;

        const dpr = window.devicePixelRatio || 1;
        if (this.canvas.width !== Math.floor(this.logicWidth * dpr) ||
            this.canvas.height !== Math.floor(this.logicHeight * dpr)) {
            this.resizeCanvas();
        }

        this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

        this.ctx.clearRect(0, 0, this.logicWidth, this.logicHeight);
        this.ctx.fillStyle = '#050505';
        this.ctx.fillRect(0, 0, this.logicWidth, this.logicHeight);

        this.drawConnections(time);

        const checkConnects = (fromX, fromY, toX, toY, dirFrom, dirTo) => {
            if (toX < 0 || toX >= this.cols || toY < 0 || toY >= this.rows) return false;
            const fromTile = this.grid[fromY][fromX];
            const toTile = this.grid[toY][toX];
            if (toTile.type === 'empty' || fromTile.type === 'empty') return false;

            const fromConn = fromTile.connections || { top: true, bottom: true, left: true, right: true };
            const toConn = toTile.connections || { top: true, bottom: true, left: true, right: true };

            return fromConn[dirFrom] && toConn[dirTo];
        };

        const pathWidth = 12;

        for (let y = 0; y < this.rows; y++) {
            for (let x = 0; x < this.cols; x++) {
                const tile = this.grid[y][x];
                if (tile.type === 'empty') continue;

                const cx = x * this.cellSize + this.cellSize / 2;
                const cy = y * this.cellSize + this.cellSize / 2;

                this.ctx.strokeStyle = '#ffffff';
                this.ctx.lineWidth = pathWidth;
                this.ctx.lineCap = 'square';

                this.ctx.beginPath();
                if (checkConnects(x, y, x, y - 1, 'top', 'bottom')) { this.ctx.moveTo(cx, cy); this.ctx.lineTo(cx, cy - this.cellSize / 2); }
                if (checkConnects(x, y, x, y + 1, 'bottom', 'top')) { this.ctx.moveTo(cx, cy); this.ctx.lineTo(cx, cy + this.cellSize / 2); }
                if (checkConnects(x, y, x - 1, y, 'left', 'right')) { this.ctx.moveTo(cx, cy); this.ctx.lineTo(cx - this.cellSize / 2, cy); }
                if (checkConnects(x, y, x + 1, y, 'right', 'left')) { this.ctx.moveTo(cx, cy); this.ctx.lineTo(cx + this.cellSize / 2, cy); }
                this.ctx.stroke();

                this.ctx.fillStyle = '#ffffff';
                this.ctx.fillRect(cx - pathWidth / 2, cy - pathWidth / 2, pathWidth, pathWidth);
            }
        }

        for (let y = 0; y < this.rows; y++) {
            for (let x = 0; x < this.cols; x++) {
                const tile = this.grid[y][x];
                if (tile.type === 'empty' || tile.type === 'path' || tile.type === 'player') continue;

                const cx = x * this.cellSize + this.cellSize / 2;
                const cy = y * this.cellSize + this.cellSize / 2;

                if (tile.type === 'goal') {
                    const pulse = Math.sin(time * 6) * 0.5 + 0.5;
                    this.ctx.fillStyle = '#050505';
                    this.ctx.fillRect(cx - 60, cy - 60, 120, 120);

                    this.ctx.save();
                    this.ctx.shadowBlur = 15 + 25 * pulse;
                    this.ctx.shadowColor = tile.color;
                    this.ctx.strokeStyle = tile.color;
                    this.ctx.lineWidth = 8 + 4 * pulse;
                    this.ctx.strokeRect(cx - 56 - 4 * pulse, cy - 56 - 4 * pulse, 112 + 8 * pulse, 112 + 8 * pulse);
                    this.ctx.restore();
                } else if (tile.type === 'color_pass' || tile.type === 'color_block') {
                    const colors = tile.color ? tile.color.split(',') : ['#333333'];
                    const drawMultiColorShape = (radius, isBlock) => {
                        if (colors.length === 1) {
                            this.ctx.fillStyle = colors[0];
                            this.ctx.beginPath();
                            if (isBlock) {
                                for (let i = 0; i < 8; i++) {
                                    const ang = i * Math.PI / 4 + Math.PI / 8;
                                    const pX = cx + Math.cos(ang) * radius;
                                    const pY = cy + Math.sin(ang) * radius;
                                    if (i === 0) this.ctx.moveTo(pX, pY);
                                    else this.ctx.lineTo(pX, pY);
                                }
                            } else {
                                this.ctx.moveTo(cx, cy - radius); this.ctx.lineTo(cx + radius, cy); this.ctx.lineTo(cx, cy + radius); this.ctx.lineTo(cx - radius, cy);
                            }
                            this.ctx.closePath(); this.ctx.fill();
                        } else {
                            this.ctx.save();
                            this.ctx.beginPath();
                            if (isBlock) {
                                for (let i = 0; i < 8; i++) {
                                    const ang = i * Math.PI / 4 + Math.PI / 8;
                                    const pX = cx + Math.cos(ang) * radius;
                                    const pY = cy + Math.sin(ang) * radius;
                                    if (i === 0) this.ctx.moveTo(pX, pY);
                                    else this.ctx.lineTo(pX, pY);
                                }
                            } else {
                                this.ctx.moveTo(cx, cy - radius); this.ctx.lineTo(cx + radius, cy); this.ctx.lineTo(cx, cy + radius); this.ctx.lineTo(cx - radius, cy);
                            }
                            this.ctx.closePath();
                            this.ctx.clip();

                            for (let i = 0; i < colors.length; i++) {
                                this.ctx.fillStyle = colors[i];
                                this.ctx.beginPath();
                                this.ctx.moveTo(cx, cy);
                                const startAng = i * (Math.PI * 2 / colors.length) - Math.PI / 2;
                                const endAng = (i + 1) * (Math.PI * 2 / colors.length) - Math.PI / 2;
                                this.ctx.arc(cx, cy, radius, startAng, endAng);
                                this.ctx.closePath(); this.ctx.fill();
                            }
                            this.ctx.restore();
                        }
                    };

                    this.ctx.fillStyle = '#050505';
                    this.ctx.beginPath();
                    if (tile.type === 'color_block') {
                        for (let i = 0; i < 8; i++) {
                            const ang = i * Math.PI / 4 + Math.PI / 8;
                            const pX = cx + Math.cos(ang) * 40;
                            const pY = cy + Math.sin(ang) * 40;
                            if (i === 0) this.ctx.moveTo(pX, pY);
                            else this.ctx.lineTo(pX, pY);
                        }
                    } else {
                        this.ctx.moveTo(cx, cy - 40); this.ctx.lineTo(cx + 40, cy); this.ctx.lineTo(cx, cy + 40); this.ctx.lineTo(cx - 40, cy);
                    }
                    this.ctx.closePath(); this.ctx.fill();

                    this.ctx.strokeStyle = '#ffffff'; this.ctx.lineWidth = 8; this.ctx.stroke();
                    drawMultiColorShape(tile.type === 'color_block' ? 24 : 28, tile.type === 'color_block');
                } else if (tile.type === 'color_socket') {
                    this.ctx.fillStyle = '#050505'; this.ctx.beginPath(); this.ctx.arc(cx, cy, 60, 0, Math.PI * 2); this.ctx.fill();
                    this.ctx.strokeStyle = '#ffffff'; this.ctx.lineWidth = 8; this.ctx.beginPath(); this.ctx.arc(cx, cy, 62, 0, Math.PI * 2); this.ctx.stroke();
                    this.ctx.strokeStyle = tile.color; this.ctx.lineWidth = 16; this.ctx.beginPath(); this.ctx.arc(cx, cy, 48, 0, Math.PI * 2); this.ctx.stroke();
                    this.ctx.strokeStyle = '#ffffff'; this.ctx.lineWidth = 8; this.ctx.beginPath(); this.ctx.arc(cx, cy, 36, 0, Math.PI * 2); this.ctx.stroke();
                } else if (tile.type === 'vision_reverser') {
                    this.ctx.fillStyle = '#050505'; this.ctx.beginPath(); this.ctx.arc(cx, cy, 56, 0, Math.PI * 2); this.ctx.fill();
                    this.ctx.strokeStyle = '#ffffff'; this.ctx.lineWidth = 20; this.ctx.beginPath(); this.ctx.arc(cx, cy, 50, 0, Math.PI * 2); this.ctx.stroke();
                }
            }
        }

        this.ctx.fillStyle = this.player.currentColor;
        this.ctx.beginPath(); this.ctx.arc(this.player.drawX, this.player.drawY, 36, 0, Math.PI * 2); this.ctx.fill();
        this.ctx.strokeStyle = '#ffffff';
        this.ctx.lineWidth = 8;
        this.ctx.beginPath(); this.ctx.arc(this.player.drawX, this.player.drawY, 40, 0, Math.PI * 2); this.ctx.stroke();

        this.particles.forEach(p => p.draw(this.ctx));

        // --- 追加: 「あなた」テキストのアニメーション ---
        if (this.playerTextTimer < 3000) {
            let alpha = 0;
            if (this.playerTextTimer < 400) {
                // 点き始めのチカチカ
                alpha = Math.random() < (this.playerTextTimer / 400) ? 0.8 : 0.1;
            } else if (this.playerTextTimer < 2400) {
                // 点灯中
                alpha = 1;
            } else if (this.playerTextTimer < 2800) {
                // 消えかけのチカチカ
                let p = 1 - (this.playerTextTimer - 2400) / 400;
                alpha = Math.random() < p ? 0.8 : 0.1;
            } else {
                // 消灯
                alpha = 0;
            }

            if (alpha > 0) {
                this.ctx.save();
                this.ctx.fillStyle = `rgba(255, 235, 59, ${alpha})`;
                this.ctx.shadowBlur = 15;
                this.ctx.shadowColor = `rgba(255, 235, 59, ${alpha})`;
                this.ctx.font = "bold 24px 'M PLUS Rounded 1c', sans-serif";
                this.ctx.textAlign = 'center';
                this.ctx.fillText("あなた", this.player.drawX, this.player.drawY - 60);
                this.ctx.restore();
            }
        }

        // --- 追加: ステージ4専用のヒントテキスト ---
        if (this.currentLevelId === 'main_4') {
            this.socketsForHint.forEach(pos => {
                const cx = pos.x * this.cellSize + this.cellSize / 2;
                const cy = pos.y * this.cellSize + this.cellSize / 2;

                // アルファ値とY座標を時間で揺らして呼吸しているように見せる
                const waveAlpha = Math.sin(time * 4) * 0.2 + 0.8;
                const waveY = Math.sin(time * 3) * 5;

                this.ctx.save();
                this.ctx.fillStyle = `rgba(255, 235, 59, ${waveAlpha})`;
                this.ctx.shadowBlur = 15;
                this.ctx.shadowColor = `rgba(255, 235, 59, ${waveAlpha})`;
                this.ctx.font = "bold 20px 'M PLUS Rounded 1c', sans-serif";
                this.ctx.textAlign = 'center';
                this.ctx.fillText("Z / Space で取得", cx, cy + 95 + waveY);
                this.ctx.restore();
            });
        }

        if (this.clearFlash > 0) {
            this.ctx.fillStyle = `rgba(255, 255, 0, ${this.clearFlash * 0.3})`;
            this.ctx.fillRect(0, 0, this.logicWidth, this.logicHeight);
            this.clearFlash -= 0.02;
        }
    }
}