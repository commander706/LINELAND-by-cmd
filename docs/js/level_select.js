// js/level_select.js

class LsParticle {
    constructor(x, y) {
        this.x = x; 
        this.y = y + (Math.random() - 0.5) * 10;
        this.vx = (Math.random() - 0.5) * 4;
        this.vy = (Math.random() - 0.5) * 4;
        this.life = 1.0;
        this.decay = Math.random() * 0.03 + 0.02;
    }
    update() {
        this.x += this.vx; this.y += this.vy;
        this.life -= this.decay;
    }
    draw(ctx) {
        if (this.life <= 0) return;
        ctx.fillStyle = `rgba(255, 255, 0, ${this.life})`;
        ctx.beginPath(); ctx.arc(this.x, this.y, 3, 0, Math.PI*2); ctx.fill();
    }
}

export class LevelSelectEngine {
    constructor(canvasId, ui, audioManager, onPlayLevel) {
        this.canvas = document.getElementById(canvasId);
        if (!this.canvas) return;
        this.ctx = this.canvas.getContext('2d');
        this.ui = ui;
        this.audioManager = audioManager;
        this.onPlayLevel = onPlayLevel;
        
        this.levels =[];
        this.isRunning = false;
        this.animId = null;
        
        this.keys = {};
        this.player = { x: 0, vx: 0 };
        this.cameraX = 0;
        this.nodeSpacing = 400; 
        this.logicWidth = window.innerWidth;
        this.logicHeight = window.innerHeight;
        this.startX = this.logicWidth / 2; 
        
        this.currentHoverNode = -1;
        this.lastHoverNode = -1;
        this.previewAlpha = 0;

        this.isStarting = false;
        this.progress = {};
        this.maxAccessible = 0;
        this.lastMaxAccessible = undefined;
        this.pathAnimProgress = 1;
        this.particles =[];
        this.uiCallback = null; // 全クリア演出用フック
        
        this.resizeCanvas();
        window.addEventListener('resize', () => this.resizeCanvas());
        
        this.handleKeyDown = this.handleKeyDown.bind(this);
        this.handleKeyUp = this.handleKeyUp.bind(this);
    }

    resizeCanvas() {
        const dpr = window.devicePixelRatio || 1;
        this.logicWidth = window.innerWidth;
        this.logicHeight = window.innerHeight;
        this.canvas.width = Math.floor(this.logicWidth * dpr);
        this.canvas.height = Math.floor(this.logicHeight * dpr);
        this.canvas.style.width = `${this.logicWidth}px`;
        this.canvas.style.height = `${this.logicHeight}px`;
        this.startX = this.logicWidth / 2;
    }

    updateProgress(progressObj) {
        this.progress = progressObj || {};
        let max = 0;
        // メインの18ステージのみクリア判定に含める
        for (let i = 0; i < 18; i++) {
            if (this.levels[i] && this.progress[this.levels[i].id]) {
                max = i + 1;
            } else {
                break;
            }
        }
        
        let pendingAllClear = false;
        if (max === 18 && !this.progress['all_cleared_seen']) {
            pendingAllClear = true; // 演出待機
            this.maxAccessible = 17; // 演出前は18(index17)で止めておく
        } else if (max === 18 && this.progress['all_cleared_seen']) {
            this.maxAccessible = 18; // ステージ19(index 18)への道を開放
        } else {
            this.maxAccessible = max;
        }
        
        const triggerAnim = () => {
            if (this.lastMaxAccessible === undefined) {
                this.lastMaxAccessible = this.maxAccessible;
                this.pathAnimProgress = 1;
            } else if (this.lastMaxAccessible < this.maxAccessible) {
                this.pathAnimProgress = 0; 
            } else {
                this.pathAnimProgress = 1;
                this.lastMaxAccessible = this.maxAccessible;
            }
        };

        if (pendingAllClear && this.uiCallback) {
            // UI側に演出を依頼。完了後にコールバックで呼ばれる
            this.uiCallback(true, () => {
                this.maxAccessible = 18; // 演出後に19番目を開放
                triggerAnim();
            });
        } else {
            if (this.uiCallback) this.uiCallback(false, () => triggerAnim());
            else triggerAnim();
        }
    }

    formatTime(ms) {
        if (!ms) return '--:--.--';
        const totalSec = Math.floor(ms / 1000);
        const min = Math.floor(totalSec / 60);
        const sec = totalSec % 60;
        const mill = Math.floor((ms % 1000) / 10);
        return `${min.toString().padStart(2,'0')}:${sec.toString().padStart(2,'0')}.${mill.toString().padStart(2,'0')}`;
    }

    loadLevels(loadedLevels) {
        this.levels =[];
        const validLevels = loadedLevels.filter(d => d !== null);
        
        for (let i = 0; i < 18; i++) {
            let data = validLevels[i];
            if (!data) {
                const grid = Array.from({length: 5}, () => Array.from({length: 7}, () => ({type: 'empty', color: '#333333'})));
                grid[2][1] = {type: 'player', color: '#ff0000'};
                grid[2][2] = {type: 'path', color: '#333333'};
                grid[2][3] = {type: 'path', color: '#333333'};
                grid[2][4] = {type: 'path', color: '#333333'};
                grid[2][5] = {type: 'goal', color: '#333333'};
                data = {
                    id: `main_${i}`, title: `MAIN STAGE ${i+1}`, subtitle: 'Dummy Level Data',
                    author: 'System', comment: '', data: { grid: grid }
                };
            }
            this.levels.push({
                id: data.id || `main_${i}`,
                title: data.title || `STAGE ${i+1}`,
                subtitle: data.subtitle || '',
                author: data.author || 'UNKNOWN',
                comment: data.comment || '',
                data: data.data || data, 
                x: this.levels.length * this.nodeSpacing,
                isDummy: false
            });
        }

        // ダミーステージ (19, 20) を追加
        for (let i = 0; i < 2; i++) {
            this.levels.push({
                id: `dummy_${19+i}`,
                title: `STAGE ${19+i}`,
                subtitle: '???',
                author: 'UNKNOWN',
                comment: 'この先はまだアクセスできない...',
                data: { grid: Array.from({length: 5}, () => Array.from({length: 7}, () => ({type: 'empty', color: '#333333'}))) },
                x: this.levels.length * this.nodeSpacing,
                isDummy: true
            });
        }
    }

    start(isFirstTime = false) {
        if (this.isRunning) return;
        this.isRunning = true;
        this.isStarting = false;
        
        if (isFirstTime) {
            this.player.x = 0;
            this.player.vx = 0;
            this.cameraX = 0;
        }
        
        this.currentHoverNode = -1;
        this.lastHoverNode = -1;
        this.previewAlpha = 0;
        this.keys = {};
        this.particles =[];
        
        window.addEventListener('keydown', this.handleKeyDown);
        window.addEventListener('keyup', this.handleKeyUp);
        
        document.getElementById('ls-info').style.opacity = '0';
        
        this.loop();
    }

    stop() {
        this.isRunning = false;
        this.keys = {};
        window.removeEventListener('keydown', this.handleKeyDown);
        window.removeEventListener('keyup', this.handleKeyUp);
        if (this.animId) {
            cancelAnimationFrame(this.animId);
            this.animId = null;
        }
    }

    handleKeyDown(e) {
        if (!this.isRunning) return;
        
        if (document.getElementById('fake-loading-overlay').classList.contains('active') || this.ui.isTransitioning) {
            return;
        }
        if (document.getElementById('all-clear-overlay').style.display === 'flex') return;

        const key = e.key.toLowerCase();
        this.keys[key] = true;
        this.keys[e.key] = true;

        if ((key === 'z' || key === ' ' || key === 'spacebar') && this.currentHoverNode !== -1) {
            if (this.isStarting || this.levels[this.currentHoverNode].isDummy) {
                if (this.levels[this.currentHoverNode]?.isDummy) this.audioManager.play('se_back'); // ダミーは入れない
                return; 
            }
            e.preventDefault(); 
            this.isStarting = true;
            this.isRunning = false; 
            window.removeEventListener('keydown', this.handleKeyDown); 
            
            this.audioManager.play('se_enter');
            this.onPlayLevel(this.levels[this.currentHoverNode]);
        }
    }

    handleKeyUp(e) {
        this.keys[e.key.toLowerCase()] = false;
        this.keys[e.key] = false;
    }

    loop() {
        if (!this.isRunning) return;
        const time = performance.now();

        if (this.pathAnimProgress < 1) {
            this.pathAnimProgress += 0.015;
            
            // パーティクル生成 (アニメーション中)
            if (this.lastMaxAccessible !== undefined) {
                const px = this.startX + this.levels[this.lastMaxAccessible].x - this.cameraX;
                const currentX = px + this.nodeSpacing * this.pathAnimProgress;
                for(let j=0; j<2; j++) {
                    this.particles.push(new LsParticle(currentX, this.logicHeight * 0.8));
                }
            }

            if (this.pathAnimProgress >= 1) {
                this.pathAnimProgress = 1;
                this.lastMaxAccessible = this.maxAccessible; 
            }
        }

        for(let i=this.particles.length-1; i>=0; i--) {
            this.particles[i].update();
            if(this.particles[i].life <= 0) this.particles.splice(i, 1);
        }

        const SPEED = 5.0; // 変更: 8.0 -> 5.0
        let reqDx = 0;
        if (this.keys['a'] || this.keys['arrowleft']) reqDx = -1;
        if (this.keys['d'] || this.keys['arrowright']) reqDx = 1;

        this.player.vx += (reqDx * SPEED - this.player.vx) * 0.2;
        this.player.x += this.player.vx;

        const maxDist = this.maxAccessible * this.nodeSpacing;
        if (this.player.x < 0) { this.player.x = 0; this.player.vx = 0; }
        if (this.player.x > maxDist) { this.player.x = maxDist; this.player.vx = 0; }

        // ダミー(19)へ行こうとした時の弾き返し
        if (this.levels[18]) {
            const barrierX = this.levels[18].x - 120;
            if (this.player.x > barrierX) {
                this.player.x = barrierX;
                this.player.vx = -15; // 弾く
            }
        }

        this.cameraX += (this.player.x - this.cameraX) * 0.1;

        let hovered = -1;
        for (let i = 0; i <= this.maxAccessible; i++) {
            const lvl = this.levels[i];
            if (Math.abs(this.player.x - lvl.x) < 60) { // 変更: 30 -> 60
                hovered = i;
                if (Math.abs(this.player.vx) < 1.0 && reqDx === 0) {
                    this.player.x += (lvl.x - this.player.x) * 0.2;
                }
                break;
            }
        }
        this.currentHoverNode = hovered;

        if (this.currentHoverNode !== -1) {
            this.previewAlpha = Math.min(1, this.previewAlpha + 0.05);
            if (this.lastHoverNode !== this.currentHoverNode) {
                const lvl = this.levels[this.currentHoverNode];
                document.getElementById('ls-title').innerText = lvl.title;
                document.getElementById('ls-subtitle').innerText = lvl.subtitle;
                document.getElementById('ls-author').innerText = `Created by ${lvl.author}`;
                document.getElementById('ls-comment').innerText = lvl.comment || 'コメントはありません';
                
                const timeMs = this.progress[lvl.id]?.time;
                document.getElementById('ls-time').innerText = timeMs ? `思考時間: ${this.formatTime(timeMs)}` : (lvl.isDummy ? '' : '未クリア');
                
                document.getElementById('ls-info').style.opacity = '1';
                this.lastHoverNode = this.currentHoverNode;
                this.audioManager.play('se_change');
            }
        } else {
            this.previewAlpha = Math.max(0, this.previewAlpha - 0.08);
            if (this.previewAlpha <= 0) {
                document.getElementById('ls-info').style.opacity = '0';
                this.lastHoverNode = -1;
            }
        }

        this.draw(time);
        this.animId = requestAnimationFrame(() => this.loop());
    }

    drawPreview(level, alpha) {
        if (!level || !level.data || !level.data.grid || alpha <= 0 || level.isDummy) return;
        const grid = level.data.grid;
        const cellSize = 60;
        const scale = cellSize / 140; 
        const rows = grid.length;
        const cols = grid[0].length;
        const w = cols * cellSize;
        const h = rows * cellSize;
        
        const cx = this.logicWidth / 2;
        const cy = this.logicHeight * 0.45; 
        
        this.ctx.save();
        this.ctx.globalAlpha = alpha;
        this.ctx.translate(cx - w/2, cy - h/2);
        
        this.ctx.fillStyle = 'rgba(10, 10, 10, 0.8)';
        this.ctx.strokeStyle = 'rgba(100, 100, 100, 0.5)';
        this.ctx.lineWidth = 2;
        this.ctx.shadowBlur = 20;
        this.ctx.shadowColor = 'rgba(0, 0, 0, 0.8)';
        this.ctx.fillRect(-20, -20, w + 40, h + 40);
        this.ctx.shadowBlur = 0;
        this.ctx.strokeRect(-20, -20, w + 40, h + 40);

        const pathWidth = 12 * scale;
        
        this.ctx.strokeStyle = '#ffffff'; 
        this.ctx.lineWidth = pathWidth;
        this.ctx.lineCap = 'square';

        for(let r=0; r<rows; r++) {
            for(let c=0; c<cols; c++) {
                const tile = grid[r][c];
                if (tile.type === 'empty') continue;
                
                const px = c * cellSize + cellSize/2;
                const py = r * cellSize + cellSize/2;
                
                const connects = (tc, tr) => {
                    if (tc < 0 || tc >= cols || tr < 0 || tr >= rows) return false;
                    return grid[tr][tc].type !== 'empty';
                };

                this.ctx.beginPath();
                if (connects(c, r-1)) { this.ctx.moveTo(px, py); this.ctx.lineTo(px, py - cellSize/2); }
                if (connects(c, r+1)) { this.ctx.moveTo(px, py); this.ctx.lineTo(px, py + cellSize/2); }
                if (connects(c-1, r)) { this.ctx.moveTo(px, py); this.ctx.lineTo(px - cellSize/2, py); }
                if (connects(c+1, r)) { this.ctx.moveTo(px, py); this.ctx.lineTo(px + cellSize/2, py); }
                this.ctx.stroke();
                
                this.ctx.fillStyle = '#ffffff';
                this.ctx.fillRect(px - pathWidth/2, py - pathWidth/2, pathWidth, pathWidth);
            }
        }
        
        for(let r=0; r<rows; r++) {
            for(let c=0; c<cols; c++) {
                const tile = grid[r][c];
                if (tile.type === 'empty' || tile.type === 'path' || tile.type === 'player') continue;
                
                const px = c * cellSize + cellSize/2;
                const py = r * cellSize + cellSize/2;
                
                if (tile.type === 'goal') {
                    this.ctx.fillStyle = '#050505'; 
                    this.ctx.fillRect(px - 60*scale, py - 60*scale, 120*scale, 120*scale);
                    this.ctx.strokeStyle = tile.color;
                    this.ctx.lineWidth = 8*scale;
                    this.ctx.strokeRect(px - 56*scale, py - 56*scale, 112*scale, 112*scale);
                } else if (tile.type === 'color_pass') {
                    this.ctx.fillStyle = '#050505';
                    this.ctx.beginPath(); this.ctx.moveTo(px, py - 40*scale); this.ctx.lineTo(px + 40*scale, py); this.ctx.lineTo(px, py + 40*scale); this.ctx.lineTo(px - 40*scale, py); this.ctx.fill();
                    this.ctx.strokeStyle = '#ffffff'; this.ctx.lineWidth = 8*scale; this.ctx.stroke();
                    this.ctx.fillStyle = tile.color;
                    this.ctx.beginPath(); this.ctx.moveTo(px, py - 28*scale); this.ctx.lineTo(px + 28*scale, py); this.ctx.lineTo(px, py + 28*scale); this.ctx.lineTo(px - 28*scale, py); this.ctx.fill();
                } else if (tile.type === 'color_socket') {
                    this.ctx.fillStyle = '#050505'; this.ctx.beginPath(); this.ctx.arc(px, py, 60*scale, 0, Math.PI*2); this.ctx.fill();
                    this.ctx.strokeStyle = '#ffffff'; this.ctx.lineWidth = 8*scale; this.ctx.beginPath(); this.ctx.arc(px, py, 62*scale, 0, Math.PI*2); this.ctx.stroke();
                    this.ctx.strokeStyle = tile.color; this.ctx.lineWidth = 16*scale; this.ctx.beginPath(); this.ctx.arc(px, py, 48*scale, 0, Math.PI*2); this.ctx.stroke();
                    this.ctx.strokeStyle = '#ffffff'; this.ctx.lineWidth = 8*scale; this.ctx.beginPath(); this.ctx.arc(px, py, 36*scale, 0, Math.PI*2); this.ctx.stroke();
                } else if (tile.type === 'vision_reverser') {
                    this.ctx.fillStyle = '#050505'; this.ctx.beginPath(); this.ctx.arc(px, py, 56*scale, 0, Math.PI*2); this.ctx.fill();
                    this.ctx.strokeStyle = '#ffffff'; this.ctx.lineWidth = 20*scale; this.ctx.beginPath(); this.ctx.arc(px, py, 50*scale, 0, Math.PI*2); this.ctx.stroke();
                }
            }
        }

        for(let r=0; r<rows; r++) {
            for(let c=0; c<cols; c++) {
                const tile = grid[r][c];
                if (tile.type === 'player') {
                    const px = c * cellSize + cellSize/2;
                    const py = r * cellSize + cellSize/2;
                    this.ctx.fillStyle = tile.color;
                    this.ctx.beginPath(); this.ctx.arc(px, py, 36*scale, 0, Math.PI*2); this.ctx.fill();
                    this.ctx.strokeStyle = '#ffffff';
                    this.ctx.lineWidth = 8*scale;
                    this.ctx.beginPath(); this.ctx.arc(px, py, 40*scale, 0, Math.PI*2); this.ctx.stroke();
                }
            }
        }
        this.ctx.restore();
    }

    draw(time) {
        const dpr = window.devicePixelRatio || 1;
        if (this.canvas.width !== Math.floor(this.logicWidth * dpr) || 
            this.canvas.height !== Math.floor(this.logicHeight * dpr)) {
            this.resizeCanvas();
        }

        this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        this.ctx.clearRect(0, 0, this.logicWidth, this.logicHeight);

        const lineY = this.logicHeight * 0.8; 

        // 全レベル分表示
        for(let i = 0; i < this.levels.length; i++) {
            const lvl = this.levels[i];
            const px = this.startX + lvl.x - this.cameraX;
            
            // 描画範囲を緩和
            if (px + this.nodeSpacing < -100 || px > this.logicWidth + 100) continue;
            
            // 道の描画
            if (i < this.levels.length - 1) {
                if (i === 17 && i < this.maxAccessible) {
                    // バグ道エフェクト (18番目 -> 19番目)
                    this.ctx.lineWidth = 12;
                    this.ctx.beginPath();
                    for(let t=0; t<=1; t+=0.02) {
                        let cx = px + this.nodeSpacing * t;
                        let amp = t * 15;
                        let cy = lineY + (Math.random() - 0.5) * amp * Math.sin(time*0.01 + t*20);
                        if (t===0) this.ctx.moveTo(cx, cy);
                        else this.ctx.lineTo(cx, cy);
                    }
                    this.ctx.strokeStyle = 'rgba(255, 50, 50, 0.8)';
                    this.ctx.stroke();

                } else if (i < this.lastMaxAccessible) {
                    this.ctx.lineWidth = 12;
                    this.ctx.strokeStyle = '#ffffff';
                    this.ctx.beginPath();
                    this.ctx.moveTo(px, lineY);
                    this.ctx.lineTo(px + this.nodeSpacing, lineY);
                    this.ctx.stroke();
                } else if (i === this.lastMaxAccessible && this.maxAccessible > this.lastMaxAccessible) {
                    this.ctx.lineWidth = 12;
                    this.ctx.beginPath();
                    this.ctx.moveTo(px, lineY);
                    
                    const currentX = px + Math.max(1, this.nodeSpacing * this.pathAnimProgress);
                    const gradient = this.ctx.createLinearGradient(px, lineY, currentX, lineY);
                    gradient.addColorStop(0, '#ffffff'); 
                    gradient.addColorStop(1, '#ffff00'); 
                    this.ctx.strokeStyle = gradient;
                    
                    this.ctx.lineTo(currentX, lineY);
                    this.ctx.stroke();
                }
            }

            // 四角形の描画
            this.ctx.fillStyle = '#050505'; 
            this.ctx.fillRect(px - 43, lineY - 43, 86, 86);
            
            const isCleared = !!this.progress[lvl.id];
            if (lvl.isDummy) {
                this.ctx.strokeStyle = '#ff0000'; // ダミーは赤
                this.ctx.shadowBlur = 10;
                this.ctx.shadowColor = '#ff0000';
            } else if (isCleared) {
                this.ctx.strokeStyle = '#32cd32';
                this.ctx.shadowBlur = 15;
                this.ctx.shadowColor = '#32cd32';
            } else if (i <= this.maxAccessible) {
                this.ctx.strokeStyle = '#ffffff'; 
                this.ctx.shadowBlur = 0;
            } else {
                this.ctx.strokeStyle = '#444444'; // 未到達
                this.ctx.shadowBlur = 0;
            }

            if (i === this.currentHoverNode && !lvl.isDummy) {
                this.ctx.shadowBlur = 20;
                this.ctx.shadowColor = isCleared ? '#32cd32' : (i <= this.maxAccessible ? '#fff' : '#444');
            }
            this.ctx.lineWidth = 6; 
            this.ctx.strokeRect(px - 40, lineY - 40, 80, 80);
            this.ctx.shadowBlur = 0;

            if (i === this.currentHoverNode && this.previewAlpha > 0.5 && !lvl.isDummy) {
                const alpha = Math.sin(time * 0.005) * 0.3 + 0.7; 
                this.ctx.fillStyle = `rgba(255, 255, 0, ${alpha})`;
                this.ctx.shadowBlur = 15;
                this.ctx.shadowColor = 'yellow';
                this.ctx.font = "bold 20px 'M PLUS Rounded 1c'";
                this.ctx.textAlign = 'center';
                this.ctx.fillText("Z / Spaceキーで始める", px, lineY - 60);
                this.ctx.shadowBlur = 0;
            }
        }

        this.particles.forEach(p => p.draw(this.ctx));

        const pDrawX = this.startX + this.player.x - this.cameraX;
        this.ctx.fillStyle = '#ff0000';
        this.ctx.beginPath(); this.ctx.arc(pDrawX, lineY, 26, 0, Math.PI*2); this.ctx.fill();
        this.ctx.strokeStyle = '#ffffff';
        this.ctx.lineWidth = 6;
        this.ctx.beginPath(); this.ctx.arc(pDrawX, lineY, 29, 0, Math.PI*2); this.ctx.stroke();

        if (this.currentHoverNode !== -1 && this.previewAlpha > 0) {
            this.drawPreview(this.levels[this.currentHoverNode], this.previewAlpha);
        }
    }
}