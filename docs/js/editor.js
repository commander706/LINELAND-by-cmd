// js/editor.js

export class EditorCanvas {
    constructor(canvasId) {
        this.canvas = document.getElementById(canvasId);
        if (!this.canvas) return;
        this.ctx = this.canvas.getContext('2d');
        
        this.cols = 7;
        this.rows = 5;
        this.cellSize = 100;
        this.logicWidth = this.cols * this.cellSize;
        this.logicHeight = this.rows * this.cellSize;
        
        this.resizeCanvas();
        
        this.grid = this.createEmptyGrid();
        this.currentTool = 'empty';
        this.hoverPos = { x: -1, y: -1 };
        this.isDragging = false;
        
        this.mixingColors =[];
        
        this.setupEvents();
        this.startLoop();
    }

    resizeCanvas() {
        const dpr = window.devicePixelRatio || 1;
        this.canvas.width = Math.floor(this.logicWidth * dpr);
        this.canvas.height = Math.floor(this.logicHeight * dpr);
        this.canvas.style.width = `${this.logicWidth}px`;
        this.canvas.style.height = `${this.logicHeight}px`;
    }

    createEmptyGrid() {
        return Array.from({ length: this.rows }, () => 
            Array.from({ length: this.cols }, () => ({ type: 'empty', color: '#333333', socketId: '' }))
        );
    }

    setTool(tool) {
        this.currentTool = tool;
    }

    setColor(c, r, color) {
        if (this.grid[r] && this.grid[r][c]) {
            this.grid[r][c].color = color;
        }
    }
    
    setSocketId(c, r, id) {
        if (this.grid[r] && this.grid[r][c]) {
            this.grid[r][c].socketId = id;
        }
    }

    loadData(data) {
        if (data && data.grid && data.grid.length === this.rows) {
            this.grid = data.grid;
            for(let r=0; r<this.rows; r++) {
                for(let c=0; c<this.cols; c++) {
                    if (this.grid[r][c].socketId === undefined) this.grid[r][c].socketId = '';
                }
            }
        } else {
            this.grid = this.createEmptyGrid();
        }
    }

    getData() {
        return { grid: this.grid };
    }

    setupEvents() {
        const getPos = (e) => {
            const rect = this.canvas.getBoundingClientRect();
            const scaleX = this.logicWidth / rect.width;
            const scaleY = this.logicHeight / rect.height;
            return {
                c: Math.floor((e.clientX - rect.left) * scaleX / this.cellSize),
                r: Math.floor((e.clientY - rect.top) * scaleY / this.cellSize)
            };
        };

        this.canvas.addEventListener('mousemove', (e) => {
            const { c, r } = getPos(e);
            if (c >= 0 && c < this.cols && r >= 0 && r < this.rows) {
                this.hoverPos = { x: c, y: r };
                if (this.isDragging) this.placeTile(c, r);
            } else {
                this.hoverPos = { x: -1, y: -1 };
            }
        });

        this.canvas.addEventListener('mouseleave', () => {
            this.hoverPos = { x: -1, y: -1 };
            this.isDragging = false;
        });

        this.canvas.addEventListener('mousedown', (e) => {
            if (e.button === 0) {
                this.isDragging = true;
                const { c, r } = getPos(e);
                this.placeTile(c, r);
            }
        });

        this.canvas.addEventListener('mouseup', (e) => {
            if (e.button === 0) this.isDragging = false;
        });

        this.canvas.addEventListener('contextmenu', (e) => {
            e.preventDefault();
            const { c, r } = getPos(e);
            if (c >= 0 && c < this.cols && r >= 0 && r < this.rows) {
                const tile = this.grid[r][c];
                if (['player', 'color_pass', 'color_socket'].includes(tile.type)) {
                    this.showColorMenu(e.pageX, e.pageY, c, r, tile);
                }
            }
        });

        document.querySelectorAll('.tool-item').forEach(btn => {
            btn.addEventListener('click', () => {
                document.querySelectorAll('.tool-item').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                this.setTool(btn.dataset.tool);
            });
        });

        const menu = document.getElementById('color-context-menu');
        const socketIdContainer = document.getElementById('socket-id-container');
        const socketIdInput = document.getElementById('socket-id-input');
        
        socketIdInput.addEventListener('input', (e) => {
            const c = parseInt(menu.dataset.targetC);
            const r = parseInt(menu.dataset.targetR);
            this.setSocketId(c, r, e.target.value);
        });
        
        const handleColorSelect = (color, e) => {
            if (e && e.shiftKey) {
                this.mixingColors.push(color);
                this.updateMixingArea();
            } else {
                let finalColor = color;
                if (this.mixingColors.length > 0) {
                    this.mixingColors.push(color);
                    finalColor = this.calcMixColors(this.mixingColors);
                }
                const c = parseInt(menu.dataset.targetC);
                const r = parseInt(menu.dataset.targetR);
                this.setColor(c, r, finalColor);
                menu.classList.remove('active');
                this.mixingColors =[];
                this.updateMixingArea();
            }
        };

        document.querySelectorAll('.color-swatch:not(input):not(.mixing-result)').forEach(swatch => {
            swatch.addEventListener('click', (e) => {
                handleColorSelect(swatch.dataset.color, e);
            });
        });

        const customPicker = document.getElementById('custom-color-picker');
        customPicker.addEventListener('change', (e) => {
            handleColorSelect(e.target.value, { shiftKey: false });
        });

        document.getElementById('mixing-result').addEventListener('click', (e) => {
            const color = e.target.dataset.color;
            const c = parseInt(menu.dataset.targetC);
            const r = parseInt(menu.dataset.targetR);
            this.setColor(c, r, color);
            menu.classList.remove('active');
            this.mixingColors =[];
            this.updateMixingArea();
        });

        document.addEventListener('click', (e) => {
            if (!menu.contains(e.target)) {
                menu.classList.remove('active');
                this.mixingColors =[];
                this.updateMixingArea();
            }
        });
    }

    calcMixColors(colors) {
        const valid = colors.filter(c => c !== '#333333');
        if (valid.length === 0) return '#333333';
        if (valid.length === 1) return valid[0];
        let res = valid[0];
        for (let i=1; i<valid.length; i++) res = this.mixTwo(res, valid[i]);
        return res;
    }

    mixTwo(c1, c2) {
        const pairs = [['#ff0000', '#0000ff', '#800080'],['#ff0000', '#ffff00', '#ffa500'],['#0000ff', '#ffff00', '#00ff00']];
        for (let p of pairs) {
            if ((c1 === p[0] && c2 === p[1]) || (c1 === p[1] && c2 === p[0])) return p[2];
        }
        const r1 = parseInt(c1.substr(1,2),16), g1 = parseInt(c1.substr(3,2),16), b1 = parseInt(c1.substr(5,2),16);
        const r2 = parseInt(c2.substr(1,2),16), g2 = parseInt(c2.substr(3,2),16), b2 = parseInt(c2.substr(5,2),16);
        return '#' +[(r1+r2)>>1, (g1+g2)>>1, (b1+b2)>>1].map(x=>x.toString(16).padStart(2,'0')).join('');
    }

    updateMixingArea() {
        const area = document.getElementById('mixing-area');
        const expr = document.getElementById('mixing-expression');
        const res = document.getElementById('mixing-result');
        if (this.mixingColors.length === 0) { area.style.display = 'none'; return; }
        
        area.style.display = 'flex';
        expr.innerHTML = '';
        this.mixingColors.forEach((c, i) => {
            if (i > 0) { const plus = document.createElement('span'); plus.innerText = '+'; expr.appendChild(plus); }
            const swatch = document.createElement('div');
            swatch.className = 'color-swatch'; swatch.style.background = c;
            swatch.style.width = '24px'; swatch.style.height = '24px';
            swatch.style.cursor = 'default'; swatch.style.pointerEvents = 'none';
            expr.appendChild(swatch);
        });
        const finalColor = this.calcMixColors(this.mixingColors);
        res.style.background = finalColor;
        res.dataset.color = finalColor;
    }

    placeTile(c, r) {
        if (c < 0 || c >= this.cols || r < 0 || r >= this.rows) return;
        if (this.currentTool === 'player') {
            for(let y = 0; y < this.rows; y++) {
                for(let x = 0; x < this.cols; x++) {
                    if (this.grid[y][x].type === 'player') {
                        this.grid[y][x] = { type: 'empty', color: '#333333', socketId: '' };
                    }
                }
            }
        }
        let prevColor = this.grid[r][c].type !== 'empty' ? this.grid[r][c].color : '#333333';
        if (this.currentTool === 'vision_reverser') prevColor = '#ffffff'; 
        this.grid[r][c] = { type: this.currentTool, color: prevColor, socketId: this.grid[r][c].socketId || '' };
    }

    showColorMenu(pageX, pageY, c, r, tile) {
        const menu = document.getElementById('color-context-menu');
        const socketCont = document.getElementById('socket-id-container');
        const socketInput = document.getElementById('socket-id-input');
        
        if (tile.type === 'color_socket') {
            socketCont.style.display = 'block';
            socketInput.value = tile.socketId || '';
        } else {
            socketCont.style.display = 'none';
        }
        
        menu.dataset.targetC = c;
        menu.dataset.targetR = r;
        this.mixingColors =[];
        this.updateMixingArea();
        
        // メニューを一度表示状態にしてからサイズを計測し、はみ出しを防ぐ
        menu.classList.add('active');

        const rect = menu.getBoundingClientRect();
        let left = pageX;
        let top = pageY;

        // 画面の右端や下端にはみ出る場合は位置を補正する
        if (left + rect.width > window.innerWidth) {
            left = window.innerWidth - rect.width - 10;
        }
        if (top + rect.height > window.innerHeight) {
            top = window.innerHeight - rect.height - 10;
        }

        menu.style.left = `${left}px`;
        menu.style.top = `${top}px`;
    }

    drawConnections(time) {
        const connections =[];
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

    startLoop() {
        const draw = () => {
            const time = performance.now() * 0.003;
            
            // ★DPR（ズーム率）の変更を検知してキャンバス解像度を再設定する（増殖バグの防止）
            const dpr = window.devicePixelRatio || 1;
            if (this.canvas.width !== Math.floor(this.logicWidth * dpr) || 
                this.canvas.height !== Math.floor(this.logicHeight * dpr)) {
                this.resizeCanvas();
            }

            this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

            // 残像が残らないように確実に全体をクリアする
            this.ctx.clearRect(0, 0, this.logicWidth, this.logicHeight);
            this.ctx.fillStyle = '#050505';
            this.ctx.fillRect(0, 0, this.logicWidth, this.logicHeight);

            this.ctx.strokeStyle = 'rgba(0, 255, 0, 0.3)';
            this.ctx.lineWidth = 1;
            for(let i=0; i<=this.cols; i++) { this.ctx.beginPath(); this.ctx.moveTo(i*this.cellSize, 0); this.ctx.lineTo(i*this.cellSize, this.logicHeight); this.ctx.stroke(); }
            for(let i=0; i<=this.rows; i++) { this.ctx.beginPath(); this.ctx.moveTo(0, i*this.cellSize); this.ctx.lineTo(this.logicWidth, i*this.cellSize); this.ctx.stroke(); }

            if (this.hoverPos.x !== -1) {
                this.ctx.fillStyle = 'rgba(0, 255, 0, 0.2)';
                this.ctx.fillRect(this.hoverPos.x * this.cellSize, this.hoverPos.y * this.cellSize, this.cellSize, this.cellSize);
            }

            this.drawConnections(time);

            const pathWidth = 8;
            for(let y = 0; y < this.rows; y++) {
                for(let x = 0; x < this.cols; x++) {
                    const tile = this.grid[y][x];
                    if (tile.type === 'empty') continue;
                    const cx = x * this.cellSize + this.cellSize/2;
                    const cy = y * this.cellSize + this.cellSize/2;
                    this.ctx.strokeStyle = '#ffffff'; 
                    this.ctx.lineWidth = pathWidth;
                    this.ctx.lineCap = 'square';
                    const connects = (tx, ty) => {
                        if (tx < 0 || tx >= this.cols || ty < 0 || ty >= this.rows) return false;
                        return this.grid[ty][tx].type !== 'empty';
                    };
                    this.ctx.beginPath();
                    if (connects(x, y-1)) { this.ctx.moveTo(cx, cy); this.ctx.lineTo(cx, cy - this.cellSize/2); }
                    if (connects(x, y+1)) { this.ctx.moveTo(cx, cy); this.ctx.lineTo(cx, cy + this.cellSize/2); }
                    if (connects(x-1, y)) { this.ctx.moveTo(cx, cy); this.ctx.lineTo(cx - this.cellSize/2, cy); }
                    if (connects(x+1, y)) { this.ctx.moveTo(cx, cy); this.ctx.lineTo(cx + this.cellSize/2, cy); }
                    this.ctx.stroke();
                    this.ctx.fillStyle = '#ffffff';
                    this.ctx.fillRect(cx - pathWidth/2, cy - pathWidth/2, pathWidth, pathWidth);
                }
            }

            for(let y = 0; y < this.rows; y++) {
                for(let x = 0; x < this.cols; x++) {
                    const tile = this.grid[y][x];
                    if (tile.type === 'empty' || tile.type === 'path') continue;
                    const cx = x * this.cellSize + this.cellSize/2;
                    const cy = y * this.cellSize + this.cellSize/2;

                    if (tile.type === 'player') {
                        this.ctx.fillStyle = tile.color;
                        this.ctx.beginPath(); this.ctx.arc(cx, cy, 26, 0, Math.PI*2); this.ctx.fill();
                        this.ctx.strokeStyle = '#ffffff';
                        this.ctx.lineWidth = 6;
                        this.ctx.beginPath(); this.ctx.arc(cx, cy, 29, 0, Math.PI*2); this.ctx.stroke();
                        
                    } else if (tile.type === 'goal') {
                        const pulse = Math.sin(time * 6) * 0.5 + 0.5;
                        this.ctx.fillStyle = '#050505'; 
                        this.ctx.fillRect(cx - 43, cy - 43, 86, 86);
                        
                        this.ctx.save();
                        this.ctx.shadowBlur = 10 + 15 * pulse;
                        this.ctx.shadowColor = tile.color;
                        this.ctx.strokeStyle = tile.color; 
                        this.ctx.lineWidth = 6 + 2 * pulse; 
                        this.ctx.strokeRect(cx - 40 - 2*pulse, cy - 40 - 2*pulse, 80 + 4*pulse, 80 + 4*pulse);
                        this.ctx.restore();
                        
                    } else if (tile.type === 'color_pass') {
                        this.ctx.fillStyle = '#050505';
                        this.ctx.beginPath(); this.ctx.moveTo(cx, cy - 28); this.ctx.lineTo(cx + 28, cy); this.ctx.lineTo(cx, cy + 28); this.ctx.lineTo(cx - 28, cy); this.ctx.closePath(); this.ctx.fill();
                        this.ctx.strokeStyle = '#ffffff'; this.ctx.lineWidth = 6; this.ctx.stroke();
                        this.ctx.fillStyle = tile.color;
                        this.ctx.beginPath(); this.ctx.moveTo(cx, cy - 18); this.ctx.lineTo(cx + 18, cy); this.ctx.lineTo(cx, cy + 18); this.ctx.lineTo(cx - 18, cy); this.ctx.closePath(); this.ctx.fill();
                        
                    } else if (tile.type === 'color_socket') {
                        this.ctx.fillStyle = '#050505'; this.ctx.beginPath(); this.ctx.arc(cx, cy, 42, 0, Math.PI*2); this.ctx.fill();
                        this.ctx.strokeStyle = '#ffffff'; this.ctx.lineWidth = 6; this.ctx.beginPath(); this.ctx.arc(cx, cy, 44, 0, Math.PI*2); this.ctx.stroke();
                        this.ctx.strokeStyle = tile.color; this.ctx.lineWidth = 12; this.ctx.beginPath(); this.ctx.arc(cx, cy, 35, 0, Math.PI*2); this.ctx.stroke();
                        this.ctx.strokeStyle = '#ffffff'; this.ctx.lineWidth = 6; this.ctx.beginPath(); this.ctx.arc(cx, cy, 26, 0, Math.PI*2); this.ctx.stroke();

                    } else if (tile.type === 'vision_reverser') {
                        this.ctx.fillStyle = '#050505'; this.ctx.beginPath(); this.ctx.arc(cx, cy, 40, 0, Math.PI*2); this.ctx.fill();
                        this.ctx.strokeStyle = '#ffffff'; this.ctx.lineWidth = 14; this.ctx.beginPath(); this.ctx.arc(cx, cy, 36, 0, Math.PI*2); this.ctx.stroke();
                    }
                }
            }
            requestAnimationFrame(draw);
        };
        draw();
    }
}