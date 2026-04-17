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

        this.grid = this.createEmptyGrid();
        this.currentTool = 'empty';
        this.hoverPos = { x: -1, y: -1 };
        this.isDragging = false;

        this.mixingColors = [];
        this.multiColors = [];

        this.resizeCanvas();
        this.setupEvents();
        this.startLoop();
    }

    resizeCanvas() {
        const dpr = window.devicePixelRatio || 1;
        this.canvas.width = Math.floor(this.logicWidth * dpr);
        this.canvas.height = Math.floor(this.logicHeight * dpr);

        // 外枠(700x500)に収まるようにスケール計算
        const maxW = 700;
        const maxH = 500;
        const scale = Math.min(maxW / this.logicWidth, maxH / this.logicHeight);

        this.canvas.style.width = `${this.logicWidth * scale}px`;
        this.canvas.style.height = `${this.logicHeight * scale}px`;
    }

    createEmptyGrid() {
        return Array.from({ length: this.rows }, () =>
            Array.from({ length: this.cols }, () => ({ type: 'empty', color: '#333333', socketId: '', connections: { top: true, bottom: true, left: true, right: true } }))
        );
    }

    changeGridSize(newCols, newRows) {
        newCols = Math.max(5, Math.min(14, newCols));
        newRows = Math.max(5, Math.min(10, newRows));

        const newGrid = Array.from({ length: newRows }, (_, r) =>
            Array.from({ length: newCols }, (_, c) => {
                if (r < this.rows && c < this.cols && this.grid[r] && this.grid[r][c]) {
                    return this.grid[r][c];
                } else {
                    return { type: 'empty', color: '#333333', socketId: '', connections: { top: true, bottom: true, left: true, right: true } };
                }
            })
        );

        this.cols = newCols;
        this.rows = newRows;
        this.grid = newGrid;

        this.logicWidth = this.cols * this.cellSize;
        this.logicHeight = this.rows * this.cellSize;
        this.resizeCanvas();
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
        if (data && data.grid && data.grid.length > 0) {
            this.rows = data.grid.length;
            this.cols = data.grid[0].length;
            this.grid = data.grid;
            for (let r = 0; r < this.rows; r++) {
                for (let c = 0; c < this.cols; c++) {
                    if (this.grid[r][c].socketId === undefined) this.grid[r][c].socketId = '';
                    if (!this.grid[r][c].connections) this.grid[r][c].connections = { top: true, bottom: true, left: true, right: true };
                }
            }
        } else {
            this.cols = 7;
            this.rows = 5;
            this.grid = this.createEmptyGrid();
        }

        const rowInput = document.getElementById('edit-rows');
        const colInput = document.getElementById('edit-cols');
        if (rowInput) rowInput.value = this.rows;
        if (colInput) colInput.value = this.cols;

        this.logicWidth = this.cols * this.cellSize;
        this.logicHeight = this.rows * this.cellSize;
        this.resizeCanvas();
    }

    getData() {
        const gridWithLoc = this.grid.map((row, r) =>
            row.map((tile, c) => ({
                ...tile,
                location: [c, r]
            }))
        );
        return { grid: gridWithLoc };
    }

    setupEvents() {
        const rowInput = document.getElementById('edit-rows');
        const colInput = document.getElementById('edit-cols');

        if (rowInput && colInput) {
            const updateGridSize = () => {
                let r = parseInt(rowInput.value);
                let c = parseInt(colInput.value);

                // 空欄や無効な値なら無視
                if (isNaN(r) || isNaN(c)) return;

                // 強制的に上限・下限で抑える
                const clampedR = Math.max(5, Math.min(10, r));
                const clampedC = Math.max(5, Math.min(14, c));

                // 入力欄の見た目も補正後の値に書き換える
                if (r !== clampedR) rowInput.value = clampedR;
                if (c !== clampedC) colInput.value = clampedC;

                this.changeGridSize(clampedC, clampedR);
            };

            // 値が変わったとき（矢印クリック時など）
            rowInput.addEventListener('change', updateGridSize);
            colInput.addEventListener('change', updateGridSize);

            // 手入力でフォーカスを外したときにも確実にチェックする
            rowInput.addEventListener('blur', updateGridSize);
            colInput.addEventListener('blur', updateGridSize);
        }

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
                if (tile.type !== 'empty') {
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
        const socketIdInput = document.getElementById('socket-id-input');

        socketIdInput.addEventListener('input', (e) => {
            const c = parseInt(menu.dataset.targetC);
            const r = parseInt(menu.dataset.targetR);
            this.setSocketId(c, r, e.target.value);
        });

        document.querySelectorAll('.conn-chk').forEach(chk => {
            chk.addEventListener('change', (e) => {
                const c = parseInt(menu.dataset.targetC);
                const r = parseInt(menu.dataset.targetR);
                const tile = this.grid[r][c];
                if (!tile.connections) tile.connections = { top: true, bottom: true, left: true, right: true };
                const dir = e.target.id.replace('conn-', '');
                tile.connections[dir] = e.target.checked;
            });
        });

        const handleColorSelect = (color, e) => {
            const c = parseInt(menu.dataset.targetC);
            const r = parseInt(menu.dataset.targetR);
            const tile = this.grid[r][c];

            // 複数色指定を許可するのはカラーパスとカラーブロックのみ
            const allowMultiColor = (tile.type === 'color_pass' || tile.type === 'color_block');

            if (e && e.shiftKey) {
                this.mixingColors.push(color);
                this.updateMixingArea();
            } else if (e && e.ctrlKey && allowMultiColor) {
                const idx = this.multiColors.indexOf(color);
                if (idx === -1) {
                    this.multiColors.push(color);
                } else {
                    this.multiColors.splice(idx, 1);
                }
                this.updateMixingArea();
            } else {
                let finalColor = color;
                if (this.mixingColors.length > 0) {
                    this.mixingColors.push(color);
                    finalColor = this.calcMixColors(this.mixingColors);
                } else if (this.multiColors.length > 0 && allowMultiColor) {
                    if (!this.multiColors.includes(color)) {
                        this.multiColors.push(color);
                    }
                    finalColor = this.multiColors.join(',');
                }
                this.setColor(c, r, finalColor);
                menu.classList.remove('active');
                this.mixingColors = [];
                this.multiColors = [];
                this.updateMixingArea();
            }
        };

        document.querySelectorAll('.color-swatch:not(input):not(.mixing-result)').forEach(swatch => {
            swatch.addEventListener('click', (e) => {
                handleColorSelect(swatch.dataset.color, e);
            });
        });

        document.getElementById('mixing-result').addEventListener('click', (e) => {
            const color = e.target.dataset.color;
            const c = parseInt(menu.dataset.targetC);
            const r = parseInt(menu.dataset.targetR);
            this.setColor(c, r, color);
            menu.classList.remove('active');
            this.mixingColors = [];
            this.multiColors = [];
            this.updateMixingArea();
        });

        document.addEventListener('click', (e) => {
            if (!menu.contains(e.target)) {
                menu.classList.remove('active');
                this.mixingColors = [];
                this.multiColors = [];
                this.updateMixingArea();
            }
        });
    }

    calcMixColors(colors) {
        const valid = colors.filter(c => c !== '#333333');
        if (valid.length === 0) return '#333333';
        if (valid.length === 1) return valid[0];
        let res = valid[0];
        for (let i = 1; i < valid.length; i++) res = this.mixTwo(res, valid[i]);
        return res;
    }

    mixTwo(c1, c2) {
        const pairs = [['#ff0000', '#0000ff', '#800080'], ['#ff0000', '#ffff00', '#ffa500'], ['#0000ff', '#ffff00', '#00ff00']];
        for (let p of pairs) {
            if ((c1 === p[0] && c2 === p[1]) || (c1 === p[1] && c2 === p[0])) return p[2];
        }
        const r1 = parseInt(c1.substr(1, 2), 16), g1 = parseInt(c1.substr(3, 2), 16), b1 = parseInt(c1.substr(5, 2), 16);
        const r2 = parseInt(c2.substr(1, 2), 16), g2 = parseInt(c2.substr(3, 2), 16), b2 = parseInt(c2.substr(5, 2), 16);
        return '#' + [(r1 + r2) >> 1, (g1 + g2) >> 1, (b1 + b2) >> 1].map(x => x.toString(16).padStart(2, '0')).join('');
    }

    updateMixingArea() {
        const area = document.getElementById('mixing-area');
        const expr = document.getElementById('mixing-expression');
        const res = document.getElementById('mixing-result');
        if (this.mixingColors.length === 0 && this.multiColors.length === 0) { area.style.display = 'none'; return; }

        area.style.display = 'flex';
        expr.innerHTML = '';
        if (this.mixingColors.length > 0) {
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
        } else if (this.multiColors.length > 0) {
            this.multiColors.forEach((c, i) => {
                if (i > 0) { const or = document.createElement('span'); or.innerText = '或'; or.style.fontSize = '0.8rem'; expr.appendChild(or); }
                const swatch = document.createElement('div');
                swatch.className = 'color-swatch'; swatch.style.background = c;
                swatch.style.width = '24px'; swatch.style.height = '24px';
                swatch.style.cursor = 'default'; swatch.style.pointerEvents = 'none';
                expr.appendChild(swatch);
            });
            const gradientParts = this.multiColors.map((c, i, arr) => `${c} ${i * (360 / arr.length)}deg ${(i + 1) * (360 / arr.length)}deg`);
            res.style.background = `conic-gradient(${gradientParts.join(', ')})`;
            res.dataset.color = this.multiColors.join(',');
        }
    }
    placeTile(c, r) {
        if (c < 0 || c >= this.cols || r < 0 || r >= this.rows) return;
        if (this.currentTool === 'player') {
            for (let y = 0; y < this.rows; y++) {
                for (let x = 0; x < this.cols; x++) {
                    if (this.grid[y][x].type === 'player') {
                        this.grid[y][x] = { type: 'empty', color: '#333333', socketId: '', connections: { top: true, bottom: true, left: true, right: true } };
                    }
                }
            }
        }
        let prevColor = this.grid[r][c].type !== 'empty' ? this.grid[r][c].color : '#333333';
        if (this.currentTool === 'vision_reverser') prevColor = '#ffffff';

        let newSocketId = this.grid[r][c].socketId || '';
        let newConnections = this.grid[r][c].connections || { top: true, bottom: true, left: true, right: true };

        if (this.currentTool === 'empty') {
            newSocketId = '';
            newConnections = { top: true, bottom: true, left: true, right: true };
        }

        this.grid[r][c] = { type: this.currentTool, color: prevColor, socketId: newSocketId, connections: newConnections };
    }

    showColorMenu(pageX, pageY, c, r, tile) {
        const menu = document.getElementById('color-context-menu');
        const socketCont = document.getElementById('socket-id-container');
        const socketInput = document.getElementById('socket-id-input');
        const colorPalette = document.getElementById('color-palette-container');
        const colorPaletteDesc = colorPalette.querySelector('p');

        if (['player', 'color_pass', 'color_block', 'color_socket'].includes(tile.type)) {
            colorPalette.style.display = 'block';
            // 種類に応じてテキストを切り替え
            if (tile.type === 'color_pass' || tile.type === 'color_block') {
                colorPaletteDesc.innerHTML = 'Shift+クリック: 混色<br>Ctrl+クリック: 複数色指定';
            } else {
                colorPaletteDesc.innerHTML = 'Shift+クリック: 混色';
            }
        } else {
            colorPalette.style.display = 'none';
        }

        if (tile.type === 'color_socket') {
            socketCont.style.display = 'block';
            socketInput.value = tile.socketId || '';
        } else {
            socketCont.style.display = 'none';
        }

        const conns = tile.connections || { top: true, bottom: true, left: true, right: true };
        document.getElementById('conn-top').checked = conns.top;
        document.getElementById('conn-bottom').checked = conns.bottom;
        document.getElementById('conn-left').checked = conns.left;
        document.getElementById('conn-right').checked = conns.right;

        menu.dataset.targetC = c;
        menu.dataset.targetR = r;
        this.mixingColors = [];
        this.multiColors = [];
        this.updateMixingArea();

        menu.classList.add('active');

        const rect = menu.getBoundingClientRect();
        let left = pageX;
        let top = pageY;

        if (left + rect.width > window.innerWidth) {
            left = window.innerWidth - rect.width - 10;
        }
        if (top + rect.height > window.innerHeight) {
            top = window.innerHeight - rect.height - 10;
        }

        menu.style.left = `${left}px`;
        menu.style.top = `${top}px`;
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

    startLoop() {
        const draw = () => {
            const time = performance.now() * 0.003;
            const dpr = window.devicePixelRatio || 1;
            if (this.canvas.width !== Math.floor(this.logicWidth * dpr) ||
                this.canvas.height !== Math.floor(this.logicHeight * dpr)) {
                this.resizeCanvas();
            }

            this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
            this.ctx.clearRect(0, 0, this.logicWidth, this.logicHeight);
            this.ctx.fillStyle = '#050505';
            this.ctx.fillRect(0, 0, this.logicWidth, this.logicHeight);

            this.ctx.strokeStyle = 'rgba(0, 255, 0, 0.3)';
            this.ctx.lineWidth = 1;
            for (let i = 0; i <= this.cols; i++) { this.ctx.beginPath(); this.ctx.moveTo(i * this.cellSize, 0); this.ctx.lineTo(i * this.cellSize, this.logicHeight); this.ctx.stroke(); }
            for (let i = 0; i <= this.rows; i++) { this.ctx.beginPath(); this.ctx.moveTo(0, i * this.cellSize); this.ctx.lineTo(this.logicWidth, i * this.cellSize); this.ctx.stroke(); }

            if (this.hoverPos.x !== -1) {
                this.ctx.fillStyle = 'rgba(0, 255, 0, 0.2)';
                this.ctx.fillRect(this.hoverPos.x * this.cellSize, this.hoverPos.y * this.cellSize, this.cellSize, this.cellSize);
            }

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

            const pathWidth = 8;
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
                    if (tile.type === 'empty' || tile.type === 'path') continue;
                    const cx = x * this.cellSize + this.cellSize / 2;
                    const cy = y * this.cellSize + this.cellSize / 2;

                    if (tile.type === 'player') {
                        this.ctx.fillStyle = tile.color;
                        this.ctx.beginPath(); this.ctx.arc(cx, cy, 26, 0, Math.PI * 2); this.ctx.fill();
                        this.ctx.strokeStyle = '#ffffff';
                        this.ctx.lineWidth = 6;
                        this.ctx.beginPath(); this.ctx.arc(cx, cy, 29, 0, Math.PI * 2); this.ctx.stroke();

                    } else if (tile.type === 'goal') {
                        const pulse = Math.sin(time * 6) * 0.5 + 0.5;
                        this.ctx.fillStyle = '#050505';
                        this.ctx.fillRect(cx - 43, cy - 43, 86, 86);

                        this.ctx.save();
                        this.ctx.shadowBlur = 10 + 15 * pulse;
                        this.ctx.shadowColor = tile.color;
                        this.ctx.strokeStyle = tile.color;
                        this.ctx.lineWidth = 6 + 2 * pulse;
                        this.ctx.strokeRect(cx - 40 - 2 * pulse, cy - 40 - 2 * pulse, 80 + 4 * pulse, 80 + 4 * pulse);
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
                                this.ctx.save(); // 現在の状態を保存

                                // 1. 先に「型（クリッピング領域）」を作る
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
                                this.ctx.clip(); // 以降の描画をこの型の中だけに制限する

                                // 2. その上から扇状に色を塗る
                                for (let i = 0; i < colors.length; i++) {
                                    this.ctx.fillStyle = colors[i];
                                    this.ctx.beginPath();
                                    this.ctx.moveTo(cx, cy);
                                    const startAng = i * (Math.PI * 2 / colors.length) - Math.PI / 2;
                                    const endAng = (i + 1) * (Math.PI * 2 / colors.length) - Math.PI / 2;
                                    this.ctx.arc(cx, cy, radius, startAng, endAng);
                                    this.ctx.closePath(); this.ctx.fill();
                                }
                                this.ctx.restore(); // クリッピングを解除
                            }
                        };

                        this.ctx.fillStyle = '#050505';
                        this.ctx.beginPath();
                        if (tile.type === 'color_block') {
                            for (let i = 0; i < 8; i++) {
                                const ang = i * Math.PI / 4 + Math.PI / 8;
                                const pX = cx + Math.cos(ang) * 26;
                                const pY = cy + Math.sin(ang) * 26;
                                if (i === 0) this.ctx.moveTo(pX, pY);
                                else this.ctx.lineTo(pX, pY);
                            }
                        } else {
                            this.ctx.moveTo(cx, cy - 28); this.ctx.lineTo(cx + 28, cy); this.ctx.lineTo(cx, cy + 28); this.ctx.lineTo(cx - 28, cy);
                        }
                        this.ctx.closePath(); this.ctx.fill();

                        this.ctx.strokeStyle = '#ffffff'; this.ctx.lineWidth = 6; this.ctx.stroke();
                        drawMultiColorShape(tile.type === 'color_block' ? 16 : 18, tile.type === 'color_block');

                    } else if (tile.type === 'color_socket') {
                        this.ctx.fillStyle = '#050505'; this.ctx.beginPath(); this.ctx.arc(cx, cy, 42, 0, Math.PI * 2); this.ctx.fill();
                        this.ctx.strokeStyle = '#ffffff'; this.ctx.lineWidth = 6; this.ctx.beginPath(); this.ctx.arc(cx, cy, 44, 0, Math.PI * 2); this.ctx.stroke();
                        this.ctx.strokeStyle = tile.color; this.ctx.lineWidth = 12; this.ctx.beginPath(); this.ctx.arc(cx, cy, 35, 0, Math.PI * 2); this.ctx.stroke();
                        this.ctx.strokeStyle = '#ffffff'; this.ctx.lineWidth = 6; this.ctx.beginPath(); this.ctx.arc(cx, cy, 26, 0, Math.PI * 2); this.ctx.stroke();

                    } else if (tile.type === 'vision_reverser') {
                        this.ctx.fillStyle = '#050505'; this.ctx.beginPath(); this.ctx.arc(cx, cy, 40, 0, Math.PI * 2); this.ctx.fill();
                        this.ctx.strokeStyle = '#ffffff'; this.ctx.lineWidth = 14; this.ctx.beginPath(); this.ctx.arc(cx, cy, 36, 0, Math.PI * 2); this.ctx.stroke();
                    }
                }
            }
            requestAnimationFrame(draw);
        };
        draw();
    }
}