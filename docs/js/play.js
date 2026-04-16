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

        this.initialData = null;
        this.isTestMode = false;

        this.handleKeyDown = this.handleKeyDown.bind(this);
        this.handleKeyUp = this.handleKeyUp.bind(this);
    }

    resizeCanvas() {
        const dpr = window.devicePixelRatio || 1;
        this.canvas.width = Math.floor(this.logicWidth * dpr);
        this.canvas.height = Math.floor(this.logicHeight * dpr);
        this.canvas.style.width = `${this.logicWidth}px`;
        this.canvas.style.height = `${this.logicHeight}px`;
    }

    loadLevel(data, levelInfo, isTestMode = false) {
        this.isTestMode = isTestMode;
        this.initialData = JSON.parse(JSON.stringify(data));
        this.grid = JSON.parse(JSON.stringify(data.grid));
        this.player = null;
        this.particles = [];
        this.keys = {};

        for (let r = 0; r < this.rows; r++) {
            for (let c = 0; c < this.cols; c++) {
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
                        colorProgress: 1
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

        this.lastTime = performance.now(); // ★これを追加

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

        // トランジション・フェイクロード中は完全にキーを無視
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
            if (Date.now() - this.startTime < 300) return; // 0.3秒以内の意図しない連打を防止
            this.handleAction();
        }
    }

    handleKeyUp(e) {
        this.keys[e.key.toLowerCase()] = false;
        this.keys[e.key] = false;
    }

    canMoveTo(x, y) {
        if (x < 0 || x >= this.cols || y < 0 || y >= this.rows) return false;
        const tile = this.grid[y][x];
        if (tile.type === 'empty') return false;
        if (tile.type === 'color_pass' && tile.color !== this.player.targetColor) return false;
        return true;
    }

    changeSocketColor(x, y, newColor) {
        const tile = this.grid[y][x];
        tile.color = newColor;
        const cx = x * this.cellSize + this.cellSize / 2;
        const cy = y * this.cellSize + this.cellSize / 2;
        this.spawnColorParticles(cx, cy, newColor);

        if (tile.socketId) {
            for (let r = 0; r < this.rows; r++) {
                for (let c = 0; c < this.cols; c++) {
                    const t = this.grid[r][c];
                    if (t.type === 'color_socket' && t.socketId === tile.socketId && (c !== x || r !== y)) {
                        t.color = newColor;
                        this.spawnColorParticles(c * this.cellSize + this.cellSize / 2, r * this.cellSize + this.cellSize / 2, newColor);
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

        if (tile.type === 'color_socket') {
            if (tile.color === '#333333') {
                if (this.player.targetColor !== '#333333') {
                    this.changeSocketColor(gridX, gridY, this.player.targetColor);
                    this.changePlayerColor('#333333');
                }
            } else {
                const newColor = this.mixTwo(this.player.targetColor, tile.color);
                this.changePlayerColor(newColor);
                this.changeSocketColor(gridX, gridY, '#333333');
            }
        } else if (tile.type === 'vision_reverser') {
            const newColor = this.reverseColor(this.player.targetColor);
            if (newColor !== this.player.targetColor) {
                this.changePlayerColor(newColor);
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
        if (c1 === '#333333') return c2;
        if (c2 === '#333333') return c1;
        const pairs = [['#ff0000', '#0000ff', '#800080'], ['#ff0000', '#ffff00', '#ffa500'], ['#0000ff', '#ffff00', '#00ff00']];
        for (let p of pairs) {
            if ((c1 === p[0] && c2 === p[1]) || (c1 === p[1] && c2 === p[0])) return p[2];
        }
        const r1 = parseInt(c1.substr(1, 2), 16), g1 = parseInt(c1.substr(3, 2), 16), b1 = parseInt(c1.substr(5, 2), 16);
        const r2 = parseInt(c2.substr(1, 2), 16), g2 = parseInt(c2.substr(3, 2), 16), b2 = parseInt(c2.substr(5, 2), 16);
        return '#' + [(r1 + r2) >> 1, (g1 + g2) >> 1, (b1 + b2) >> 1].map(x => x.toString(16).padStart(2, '0')).join('');
    }

    reverseColor(c) {
        if (c === '#333333') return c;
        const revs = {
            '#ff0000': '#00ff00', '#00ff00': '#ff0000',
            '#800080': '#ffff00', '#ffff00': '#800080',
            '#0000ff': '#ffa500', '#ffa500': '#0000ff'
        };
        if (revs[c]) return revs[c];
        const r = parseInt(c.substr(1, 2), 16), g = parseInt(c.substr(3, 2), 16), b = parseInt(c.substr(5, 2), 16);
        return '#' + [255 - r, 255 - g, 255 - b].map(x => x.toString(16).padStart(2, '0')).join('');
    }

    lerpHex(c1, c2, t) {
        const r1 = parseInt(c1.substr(1, 2), 16), g1 = parseInt(c1.substr(3, 2), 16), b1 = parseInt(c1.substr(5, 2), 16);
        const r2 = parseInt(c2.substr(1, 2), 16), g2 = parseInt(c2.substr(3, 2), 16), b2 = parseInt(c2.substr(5, 2), 16);
        const r = Math.round(r1 + (r2 - r1) * t);
        const g = Math.round(g1 + (g2 - g1) * t);
        const b = Math.round(b1 + (b2 - b1) * t);
        return '#' + [r, g, b].map(x => x.toString(16).padStart(2, '0')).join('');
    }

    checkGoal(gridX, gridY) {
        const tile = this.grid[gridY][gridX];
        if (tile.type === 'goal' && !this.isCleared) {
            this.isCleared = true;
            this.elapsedTime = Date.now() - this.startTime; // 確定
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
        const connections = [];
        for (let r = 0; r < this.rows; r++) {
            for (let c = 0; c < this.cols; c++) {
                const t = this.grid[r][c];
                if (t.type === 'color_socket' && t.socketId) {
                    connections.push({ x: c, y: r, id: t.socketId });
                }
            }
        }

        this.ctx.strokeStyle = 'rgba(150, 150, 150, 0.6)';
        this.ctx.lineWidth = 4;

        for (let i = 0; i < connections.length; i++) {
            for (let j = i + 1; j < connections.length; j++) {
                if (connections[i].id === connections[j].id) {
                    const x1 = connections[i].x * this.cellSize + this.cellSize / 2;
                    const y1 = connections[i].y * this.cellSize + this.cellSize / 2;
                    const x2 = connections[j].x * this.cellSize + this.cellSize / 2;
                    const y2 = connections[j].y * this.cellSize + this.cellSize / 2;

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

    // loopの引数にcurrentTimeを追加
    loop(currentTime) { 
        if (!this.isRunning) return;

        // ★ ここからデルタタイム（dt）の計算を追加
        if (!this.lastTime) this.lastTime = currentTime || performance.now();
        const now = currentTime || performance.now();
        let dt = (now - this.lastTime) / (1000 / 60); // 60FPSを基準(1.0)とする
        this.lastTime = now;
        
        if (dt > 3) dt = 3; // カクつき防止
        if (dt <= 0) dt = 1;
        // ★ ここまで

        if (this.player.colorProgress < 1) {
            this.player.colorProgress += 0.05 * dt; // ★ dtをかける
            if (this.player.colorProgress >= 1) {
                this.player.colorProgress = 1;
                this.player.currentColor = this.player.targetColor;
            } else {
                this.player.currentColor = this.lerpHex(this.player.prevColor, this.player.targetColor, this.player.colorProgress);
            }
        }

        // ★ SPEEDにdtをかける（60FPS環境でちょうど良くなるよう、7.0くらいに上げるのがオススメです）
        const SPEED = 5.0 * dt; 
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
                    if (this.canMoveTo(gridX + reqDx, gridY + reqDy)) {
                        this.player.px = centerX;
                        this.player.py = centerY;
                        this.player.vx = reqDx;
                        this.player.vy = reqDy;
                    }
                } else if (this.player.vx === -reqDx && this.player.vy === -reqDy) {
                    this.player.vx = reqDx;
                    this.player.vy = reqDy;
                } else if (this.player.vx !== reqDx || this.player.vy !== reqDy) {
                    if (distToCenter <= ALLOWED_DIST) {
                        if (this.canMoveTo(gridX + reqDx, gridY + reqDy)) {
                            this.player.px = centerX;
                            this.player.py = centerY;
                            this.player.vx = reqDx;
                            this.player.vy = reqDy;
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

                    if (reqDx === 0 && reqDy === 0) {
                        this.player.vx = 0;
                        this.player.vy = 0;
                    } else if (reqDx === this.player.vx && reqDy === this.player.vy) {
                        if (!this.canMoveTo(gridX + this.player.vx, gridY + this.player.vy)) {
                            this.player.vx = 0;
                            this.player.vy = 0;
                        } else {
                            this.player.px += this.player.vx * over;
                            this.player.py += this.player.vy * over;
                        }
                    } else {
                        if (this.canMoveTo(gridX + reqDx, gridY + reqDy)) {
                            this.player.vx = reqDx;
                            this.player.vy = reqDy;
                            this.player.px += this.player.vx * over;
                            this.player.py += this.player.vy * over;
                        } else {
                            if (this.canMoveTo(gridX + this.player.vx, gridY + this.player.vy)) {
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

        for(let i=this.particles.length-1; i>=0; i--){
            this.particles[i].update();
            if (this.particles[i].life <= 0) this.particles.splice(i, 1);
        }

        this.draw();
        // ★ 最後に (t) => を追加して時間を渡すように変更
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

                const connects = (tx, ty) => {
                    if (tx < 0 || tx >= this.cols || ty < 0 || ty >= this.rows) return false;
                    return this.grid[ty][tx].type !== 'empty';
                };

                this.ctx.beginPath();
                if (connects(x, y - 1)) { this.ctx.moveTo(cx, cy); this.ctx.lineTo(cx, cy - this.cellSize / 2); }
                if (connects(x, y + 1)) { this.ctx.moveTo(cx, cy); this.ctx.lineTo(cx, cy + this.cellSize / 2); }
                if (connects(x - 1, y)) { this.ctx.moveTo(cx, cy); this.ctx.lineTo(cx - this.cellSize / 2, cy); }
                if (connects(x + 1, y)) { this.ctx.moveTo(cx, cy); this.ctx.lineTo(cx + this.cellSize / 2, cy); }
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
                } else if (tile.type === 'color_pass') {
                    this.ctx.fillStyle = '#050505';
                    this.ctx.beginPath(); this.ctx.moveTo(cx, cy - 40); this.ctx.lineTo(cx + 40, cy); this.ctx.lineTo(cx, cy + 40); this.ctx.lineTo(cx - 40, cy); this.ctx.closePath(); this.ctx.fill();
                    this.ctx.strokeStyle = '#ffffff'; this.ctx.lineWidth = 8; this.ctx.stroke();
                    this.ctx.fillStyle = tile.color;
                    this.ctx.beginPath(); this.ctx.moveTo(cx, cy - 28); this.ctx.lineTo(cx + 28, cy); this.ctx.lineTo(cx, cy + 28); this.ctx.lineTo(cx - 28, cy); this.ctx.closePath(); this.ctx.fill();
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

        if (this.clearFlash > 0) {
            this.ctx.fillStyle = `rgba(255, 255, 0, ${this.clearFlash * 0.3})`;
            this.ctx.fillRect(0, 0, this.logicWidth, this.logicHeight);
            this.clearFlash -= 0.02;
        }
    }
}
