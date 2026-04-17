// js/main.js
import { AssetLoader } from './loader.js';
import { UIManager } from './ui.js';
import { BackgroundManager } from './background.js';
import { EditorCanvas } from './editor.js';
import { PlayEngine } from './play.js';
import { LevelSelectEngine } from './level_select.js';

class GameApp {
    constructor() {
        this.loader = new AssetLoader();
        this.ui = new UIManager();
        this.bg = new BackgroundManager();
        this.editorCanvas = new EditorCanvas('editor-canvas');

        const audioManager = { play: (name) => this.playSound(name) };
        this.playEngine = new PlayEngine('play-canvas', this.ui, audioManager);

        this.levelSelect = new LevelSelectEngine('level-select-canvas', this.ui, audioManager, async (levelInfo) => {
            if (this.ui.isTransitioning || document.getElementById('fake-loading-overlay').classList.contains('active')) return;

            this.currentPlaySource = 'main';
            this.levelSelect.stop();
            this.playBGM('stage_music'); // ステージ用BGMにクロスフェード

            if (this.playEngine.loadLevel(levelInfo.data, {
                id: levelInfo.id,
                title: levelInfo.title,
                subtitle: levelInfo.subtitle,
                author: levelInfo.author
            }, false)) {
                const hideLoading = await this.ui.showFakeLoading(600);
                this.ui.transitionScreen('level-select-screen', 'play-screen', 'up', () => {
                    this.isPlayMode = true;
                    this.bg.pause = true;
                    this.bg.isPlayMode = true;
                    this.playEngine.start();
                    hideLoading();
                });
            }
        });

        this.bgm = null;
        this.currentBgmName = null;
        this.bgmVolume = 0.5;
        this.seVolume = 0.5;
        this.audioCtx = null;
        this.analyser = null;
        this.dataArray = null;
        this.sources = {}; // 複数BGM用ソース管理

        this.currentSelectedLevelId = null;
        this.currentEditLevelId = null;
        this.currentPlaySource = 'main';

        this.isEditorMode = false;
        this.isPlayMode = false;
        this.enableBgScale = true;
    }

    async init() {
        this.bg.start();
        await this.loader.loadAll((p) => this.ui.updateLoadingProgress(p));
        setTimeout(() => this.ui.showTitleScreen(() => this.playBGM('main_bgm')), 500);
        this.setupMenuEvents();
        this.setupEditorEvents();
        this.setupPlayEvents();
        this.animate();

        this.ui.onVolumeChange = (id, val) => {
            if (id === 'bgm-slider') { this.bgmVolume = val; if (this.bgm) this.bgm.volume = val; }
            if (id === 'se-slider') { this.seVolume = val; }
        };

        document.body.addEventListener('click', (e) => {
            const t = e.target;
            if (t.tagName === 'BUTTON') t.blur(); // フォーカス外し

            if (t.classList.contains('back-btn') || t.classList.contains('back') ||
                t.id.includes('cancel') || t.id.includes('nosave') || t.id === 'confirm-no-btn' || t.id.includes('close')) {
                this.playSound('se_back');
            } else if (t.tagName === 'BUTTON' || t.classList.contains('list-item') ||
                t.classList.contains('color-swatch') || t.classList.contains('tool-item')) {
                this.playSound('se_enter');
            }
        });

        window.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                if (this.ui.isTransitioning || document.getElementById('fake-loading-overlay').classList.contains('active')) return;

                // 全クリア演出中はESC無効
                if (document.getElementById('all-clear-overlay').style.display === 'flex') return;

                const activeModals = document.querySelectorAll('.modal-overlay.active');
                if (activeModals.length > 0) {
                    activeModals.forEach(m => {
                        const closeBtn = m.querySelector('.modal-btn:not(.confirm):not(.danger)') || m.querySelector('#setting-close-btn') || m.querySelector('#exit-nosave-btn') || m.querySelector('#modal-cancel-btn') || m.querySelector('#patch-close-btn');
                        if (closeBtn) closeBtn.click();
                    });
                    return;
                }
                let current = '';
                if (document.getElementById('play-screen').classList.contains('active')) current = 'play-screen';
                else if (document.getElementById('editor-screen').classList.contains('active')) current = 'editor-screen';
                else if (document.getElementById('editor-select-screen').classList.contains('active')) current = 'editor-select-screen';
                else if (document.getElementById('level-select-screen').classList.contains('active')) current = 'level-select-screen';

                if (current === 'level-select-screen') document.querySelector('.back-btn[data-action="back-from-start"]')?.click();
                else if (current === 'editor-select-screen') document.querySelector('.back-btn[data-action="back-from-editor"]')?.click();
                else if (current === 'editor-screen') document.getElementById('edit-back-btn')?.click();
                else if (current === 'play-screen') document.getElementById('play-back-btn')?.click();
            }
        });
    }

    setupAudioContext() {
        if (this.audioCtx) return;
        this.audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        this.analyser = this.audioCtx.createAnalyser();
        this.analyser.connect(this.audioCtx.destination);
        this.dataArray = new Uint8Array(this.analyser.frequencyBinCount);
        this.bg.dataArray = this.dataArray;
    }

    playBGM(name) {
        this.setupAudioContext();
        if (this.audioCtx.state === 'suspended') this.audioCtx.resume();

        if (this.currentBgmName === name && this.bgm) return;

        const nextBgm = this.loader.getAsset(name);
        if (!nextBgm) return;

        if (!this.sources[name]) {
            this.sources[name] = this.audioCtx.createMediaElementSource(nextBgm);
            this.sources[name].connect(this.analyser);
        }

        if (this.bgm) {
            const oldBgm = this.bgm;
            let vol = oldBgm.volume;
            const fadeOut = setInterval(() => {
                vol = Math.max(0, vol - 0.05);
                oldBgm.volume = vol;
                if (vol <= 0) {
                    oldBgm.pause();
                    clearInterval(fadeOut);
                }
            }, 50);
        }

        nextBgm.loop = true;
        nextBgm.volume = 0;
        nextBgm.play().catch(e => console.warn(e));

        let volIn = 0;
        const targetVol = this.bgmVolume;
        const fadeIn = setInterval(() => {
            volIn = Math.min(targetVol, volIn + 0.05);
            nextBgm.volume = volIn;
            if (volIn >= targetVol) clearInterval(fadeIn);
        }, 50);

        this.bgm = nextBgm;
        this.currentBgmName = name;
    }

    playSound(name) {
        const audio = this.loader.getAsset(name);
        if (audio) {
            // 元のデータをコピー（クローン）して新しいインスタンスを作る
            const soundClone = audio.cloneNode();
            soundClone.volume = this.seVolume;

            // 再生。クローンなので、元の音が鳴っていても影響を受けない
            soundClone.play().catch(e => console.warn(e));

            // メモリ節約のため、再生が終わったら要素を削除（任意）
            soundClone.onended = () => {
                soundClone.remove();
            };
        }
    }

    animate() {
        if (this.analyser) {
            this.analyser.getByteFrequencyData(this.dataArray);
            let bass = 0; for (let i = 0; i < 5; i++) bass += this.dataArray[i]; bass /= 5;
            let scale = 1;
            if (this.enableBgScale && (!this.isEditorMode || this.isPlayMode)) {
                scale = 1 + Math.pow(bass / 255, 2) * 0.08;
            }
            document.getElementById('game-container').style.transform = `scale(${scale})`;
            const bgCanvas = document.getElementById('bg-canvas');
            if (bgCanvas) bgCanvas.style.transform = `scale(${scale})`;
        }
        requestAnimationFrame(() => this.animate());
    }

    getFormattedDate() {
        const now = new Date();
        const pad = n => String(n).padStart(2, '0');
        return `${now.getFullYear()}/${pad(now.getMonth() + 1)}/${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}`;
    }

    setupMenuEvents() {
        document.querySelectorAll('.menu-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                if (this.ui.isTransitioning) return;
                const action = e.target.dataset.action;
                if (action === 'start') {
                    this.ui.transitionScreen('title-screen', 'level-select-screen', 'down', () => this.loadMainLevels());
                } else if (action === 'editor') {
                    this.ui.transitionScreen('title-screen', 'editor-select-screen', 'up', () => this.loadEditorLevels());
                } else if (action === 'setting') {
                    document.getElementById('setting-modal').classList.add('active');
                }
            });
        });

        document.getElementById('setting-close-btn')?.addEventListener('click', () => {
            document.getElementById('setting-modal').classList.remove('active');
        });

        document.getElementById('version-btn')?.addEventListener('click', () => {
            if (this.ui.isTransitioning) return;
            this.playSound('se_enter');
            document.getElementById('patch-note-modal').classList.add('active');
        });

        document.getElementById('patch-close-btn')?.addEventListener('click', () => {
            document.getElementById('patch-note-modal').classList.remove('active');
        });
        document.getElementById('toggle-bg-scale')?.addEventListener('change', (e) => {
            this.enableBgScale = e.target.checked;
        });
        document.getElementById('toggle-bg-wave')?.addEventListener('change', (e) => {
            this.bg.enableWave = e.target.checked;
        });
        document.getElementById('clear-data-btn')?.addEventListener('click', () => {
            this.ui.showConfirm("メインレベルのクリア状況をすべて削除します。よろしいですか？", () => {
                localStorage.removeItem('lineland_main_progress');
                this.levelSelect.updateProgress({});
                document.getElementById('setting-modal').classList.remove('active');
                this.ui.showToast("クリア状況を削除しました");
            });
        });

        document.querySelectorAll('.back-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                if (this.ui.isTransitioning) return;
                const action = e.target.dataset.action;
                if (action === 'back-from-start') {
                    this.levelSelect.stop();
                    this.ui.transitionScreen('level-select-screen', 'title-screen', 'up');
                } else if (action === 'back-from-editor') {
                    this.ui.transitionScreen('editor-select-screen', 'title-screen', 'down', () => {
                        document.querySelector('.editor-layout').classList.remove('show-details');
                        document.querySelectorAll('.level-item').forEach(el => el.classList.remove('selected'));
                        this.currentSelectedLevelId = null;
                    });
                }
            });
        });
    }

    setupEditorEvents() {
        // 長いので既存の機能同様に配置（省略せず完全な実装）
        const modalNew = document.getElementById('new-level-modal');
        const modalExit = document.getElementById('exit-confirm-modal');

        document.getElementById('new-level-btn')?.addEventListener('click', () => {
            document.getElementById('new-title').value = '';
            document.getElementById('new-subtitle').value = '';
            modalNew.classList.add('active');
        });
        document.getElementById('modal-cancel-btn')?.addEventListener('click', () => modalNew.classList.remove('active'));

        document.getElementById('modal-create-btn')?.addEventListener('click', async () => {
            const title = document.getElementById('new-title').value || '名称未設定';
            const subtitle = document.getElementById('new-subtitle').value || '';
            const author = document.getElementById('new-author').value || '名無し';

            const newLvl = {
                id: Date.now().toString(),
                title, subtitle, author, comment: '',
                updatedAt: this.getFormattedDate(),
                data: {}
            };
            let lvls = JSON.parse(localStorage.getItem('lineland_custom_levels') || '[]');
            lvls.push(newLvl);
            localStorage.setItem('lineland_custom_levels', JSON.stringify(lvls));

            modalNew.classList.remove('active');
            this.currentEditLevelId = newLvl.id;

            const hideLoading = await this.ui.showFakeLoading(800);
            document.getElementById('editor-select-screen').classList.remove('active');
            document.getElementById('editor-select-screen').style.opacity = '0';
            document.getElementById('editor-screen').classList.add('active');
            document.getElementById('editor-screen').style.opacity = '1';

            this.setupEditorWorkspace();
            this.isEditorMode = true;
            this.bg.pause = true;
            this.bg.isPlayMode = false;
            hideLoading();
        });

        document.getElementById('btn-delete')?.addEventListener('click', () => {
            this.ui.showConfirm("本当にこのステージを削除しますか？", () => {
                let lvls = JSON.parse(localStorage.getItem('lineland_custom_levels') || '[]');
                lvls = lvls.filter(l => l.id !== this.currentSelectedLevelId);
                localStorage.setItem('lineland_custom_levels', JSON.stringify(lvls));
                document.querySelector('.editor-layout').classList.remove('show-details');
                this.loadEditorLevels();
                this.ui.showToast("削除しました。");
            });
        });

        document.getElementById('btn-edit')?.addEventListener('click', async () => {
            this.currentEditLevelId = this.currentSelectedLevelId;
            const hideLoading = await this.ui.showFakeLoading(800);
            document.getElementById('editor-select-screen').classList.remove('active');
            document.getElementById('editor-select-screen').style.opacity = '0';
            document.getElementById('editor-screen').classList.add('active');
            document.getElementById('editor-screen').style.opacity = '1';
            this.setupEditorWorkspace();
            this.isEditorMode = true;
            this.bg.pause = true;
            this.bg.isPlayMode = false;
            hideLoading();
        });

        document.getElementById('btn-play')?.addEventListener('click', async () => {
            let lvls = JSON.parse(localStorage.getItem('lineland_custom_levels') || '[]');
            const lvl = lvls.find(l => l.id === this.currentSelectedLevelId);
            if (!lvl) return;

            this.currentPlaySource = 'editor';
            this.playBGM('stage_music');

            if (this.playEngine.loadLevel(lvl.data, { id: lvl.id, title: lvl.title, subtitle: lvl.subtitle, author: lvl.author }, false)) {
                const hideLoading = await this.ui.showFakeLoading(800);
                document.getElementById('editor-select-screen').classList.remove('active');
                document.getElementById('editor-select-screen').style.opacity = '0';
                document.getElementById('play-screen').classList.add('active');
                document.getElementById('play-screen').style.opacity = '1';

                this.isPlayMode = true;
                this.bg.pause = true;
                this.bg.isPlayMode = true;
                this.playEngine.start();
                hideLoading();
            }
        });

        const exportLevel = (id) => {
            let lvls = JSON.parse(localStorage.getItem('lineland_custom_levels') || '[]');
            const lvl = lvls.find(l => l.id === id);
            if (!lvl) return;
            this.ui.showConfirm("拡張子 .lila形式でレベルデーターをダウンロードします。よろしいですか？", () => {
                const blob = new Blob([JSON.stringify(lvl, null, 2)], { type: "application/json" });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `${lvl.title || 'level'}.lila`;
                a.click();
                URL.revokeObjectURL(url);
                this.ui.showToast("エクスポートが完了しました");
            });
        };

        document.getElementById('btn-download')?.addEventListener('click', () => exportLevel(this.currentSelectedLevelId));
        document.getElementById('edit-export-btn')?.addEventListener('click', () => {
            this.saveCurrentLevel();
            exportLevel(this.currentEditLevelId);
        });

        document.getElementById('import-level-btn')?.addEventListener('click', () => document.getElementById('import-file-input').click());
        document.getElementById('import-file-input')?.addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (!file) return;
            const reader = new FileReader();
            reader.onload = (event) => {
                try {
                    const data = JSON.parse(event.target.result);
                    data.id = Date.now().toString();
                    let lvls = JSON.parse(localStorage.getItem('lineland_custom_levels') || '[]');
                    lvls.push(data);
                    localStorage.setItem('lineland_custom_levels', JSON.stringify(lvls));
                    this.loadEditorLevels();
                    this.ui.showToast("インポートに成功しました");
                } catch (err) {
                    this.ui.showToast("ファイルの読み込みに失敗しました");
                }
                e.target.value = '';
            };
            reader.readAsText(file);
        });

        document.getElementById('edit-save-btn')?.addEventListener('click', () => {
            this.saveCurrentLevel();
            this.ui.showToast("セーブしました！");
        });

        const backBtn = document.getElementById('edit-back-btn');
        const newBackBtn = backBtn.cloneNode(true);
        backBtn.replaceWith(newBackBtn);
        newBackBtn.addEventListener('click', () => modalExit.classList.add('active'));

        const cancelBtn = document.getElementById('exit-cancel-btn');
        const newCancelBtn = cancelBtn.cloneNode(true);
        cancelBtn.replaceWith(newCancelBtn);
        newCancelBtn.addEventListener('click', () => modalExit.classList.remove('active'));

        const exitEditor = () => {
            this.isEditorMode = false;
            this.isPlayMode = false;
            this.bg.pause = false;
            this.bg.isPlayMode = false;
            this.ui.transitionScreen('editor-screen', 'editor-select-screen', 'down', () => this.loadEditorLevels());
        };

        const saveBtn = document.getElementById('exit-save-btn');
        const newSaveBtn = saveBtn.cloneNode(true);
        saveBtn.replaceWith(newSaveBtn);
        newSaveBtn.addEventListener('click', () => {
            this.saveCurrentLevel();
            modalExit.classList.remove('active');
            this.ui.showToast("セーブしました！");
            exitEditor();
        });

        const noSaveBtn = document.getElementById('exit-nosave-btn');
        const newNoSaveBtn = noSaveBtn.cloneNode(true);
        noSaveBtn.replaceWith(newNoSaveBtn);
        newNoSaveBtn.addEventListener('click', () => {
            modalExit.classList.remove('active');
            exitEditor();
        });

        document.getElementById('edit-test-btn')?.addEventListener('click', async () => {
            this.saveCurrentLevel();
            this.currentPlaySource = 'test';

            const levelData = this.editorCanvas.getData();
            const title = document.getElementById('edit-title').value || 'TEST PLAY';
            const subtitle = document.getElementById('edit-subtitle').value || 'Unsaved Level';
            const author = document.getElementById('edit-author').value || 'You';

            if (this.playEngine.loadLevel(levelData, { id: 'test', title, subtitle, author }, true)) {
                const hideLoading = await this.ui.showFakeLoading(600);
                document.getElementById('editor-screen').classList.remove('active');
                document.getElementById('editor-screen').style.opacity = '0';
                document.getElementById('play-screen').classList.add('active');
                document.getElementById('play-screen').style.opacity = '1';

                this.isPlayMode = true;
                this.bg.pause = true;
                this.bg.isPlayMode = true;
                this.playEngine.start();
                hideLoading();
            }
        });
    }

    setupPlayEvents() {
        const checkClear = () => {
            if (this.isPlayMode && this.currentPlaySource === 'main' && this.playEngine.isCleared) {
                const lvlId = this.levelSelect.levels[this.levelSelect.currentHoverNode].id;
                let progress = JSON.parse(localStorage.getItem('lineland_main_progress') || '{}');
                const time = this.playEngine.elapsedTime;

                if (!progress[lvlId] || progress[lvlId].time > time) {
                    progress[lvlId] = { time };
                    localStorage.setItem('lineland_main_progress', JSON.stringify(progress));
                }
                this.levelSelect.updateProgress(progress);
            }
        };

        const exitPlayToLevelSelect = () => {
            checkClear();
            this.playEngine.stop();
            this.isPlayMode = false;
            this.bg.pause = false;
            this.bg.isPlayMode = false;
            this.playBGM('main_bgm'); // メインに戻す
            this.ui.transitionScreen('play-screen', 'level-select-screen', 'down', () => {
                this.levelSelect.start(false);
            });
        };

        const exitPlayToEditor = () => {
            this.playEngine.stop();
            this.isPlayMode = false;
            this.bg.isPlayMode = false;
            this.ui.transitionScreen('play-screen', 'editor-screen', 'down');
        };

        const exitPlayToEditorSelect = () => {
            checkClear();
            this.playEngine.stop();
            this.isPlayMode = false;
            this.bg.pause = false;
            this.bg.isPlayMode = false;
            this.playBGM('main_bgm'); // メインに戻す
            this.ui.transitionScreen('play-screen', 'editor-select-screen', 'down', () => {
                document.querySelector('.editor-layout').classList.remove('show-details');
                document.querySelectorAll('.level-item').forEach(el => el.classList.remove('selected'));
            });
        };

        document.getElementById('play-back-btn')?.addEventListener('click', () => {
            if (this.ui.isTransitioning) return;
            if (this.currentPlaySource === 'test') exitPlayToEditor();
            else if (this.currentPlaySource === 'editor') exitPlayToEditorSelect();
            else exitPlayToLevelSelect();
        });

        document.getElementById('play-clear-edit-btn')?.addEventListener('click', exitPlayToEditor);

        document.getElementById('play-clear-back-btn')?.addEventListener('click', () => {
            if (this.currentPlaySource === 'editor') exitPlayToEditorSelect();
            else exitPlayToLevelSelect();
        });

        const retry = () => {
            this.playEngine.stop();
            this.playEngine.resetLevel(() => {
                this.playEngine.start();
            });
        };

        document.getElementById('play-retry-btn-test')?.addEventListener('click', retry);
        document.getElementById('play-retry-btn-normal')?.addEventListener('click', retry);
    }

    playAllClearAnimation(onComplete) {
        const overlay = document.getElementById('all-clear-overlay');
        const congrats = document.getElementById('ac-congrats');
        const message = document.getElementById('ac-message');

        overlay.style.display = 'flex';
        overlay.style.opacity = 0;
        congrats.innerHTML = '';
        message.innerHTML = '';

        let op = 0;
        const fi = setInterval(() => {
            op += 0.05;
            overlay.style.opacity = op;
            if (op >= 1) clearInterval(fi);
        }, 50);

        setTimeout(() => {
            const text = "Congratulation!";
            text.split('').forEach((char, i) => {
                const span = document.createElement('span');
                span.className = 'ac-char';
                span.innerText = char;
                if (char === ' ') span.style.width = '20px';
                congrats.appendChild(span);
                setTimeout(() => span.classList.add('show'), i * 150);
            });

            setTimeout(() => {
                const msgText = "あなたは全てのメインステージをクリアしました!";
                let i = 0;
                const typeWriter = setInterval(() => {
                    message.innerText += msgText[i];
                    i++;
                    if (i >= msgText.length) {
                        clearInterval(typeWriter);
                        setTimeout(() => {
                            let op2 = 1;
                            const fo = setInterval(() => {
                                op2 -= 0.05;
                                overlay.style.opacity = op2;
                                if (op2 <= 0) {
                                    clearInterval(fo);
                                    overlay.style.display = 'none';
                                    if (onComplete) onComplete();
                                }
                            }, 50);
                        }, 5000);
                    }
                }, 100);
            }, text.length * 150 + 1000);
        }, 1000);
    }

    loadMainLevels() {
        this.levelSelect.loadLevels(this.loader.levels);
        const progress = JSON.parse(localStorage.getItem('lineland_main_progress') || '{}');

        // 全クリア演出をフックするためのコールバックを仕込む
        this.levelSelect.uiCallback = (triggerAllClear, next) => {
            if (triggerAllClear) {
                this.playAllClearAnimation(() => {
                    progress['all_cleared_seen'] = true;
                    localStorage.setItem('lineland_main_progress', JSON.stringify(progress));
                    next();
                });
            } else {
                next();
            }
        };

        this.levelSelect.updateProgress(progress);
        this.levelSelect.start(true);
    }

    loadEditorLevels() {
        const list = document.getElementById('custom-levels-list');
        if (!list) return;
        list.innerHTML = '';
        let lvls = JSON.parse(localStorage.getItem('lineland_custom_levels') || '[]');

        lvls.forEach(lvl => {
            const div = document.createElement('div');
            div.className = 'list-item level-item';
            div.innerText = lvl.title || '名称未設定';

            div.addEventListener('click', () => {
                document.querySelectorAll('.level-item').forEach(el => el.classList.remove('selected'));
                div.classList.add('selected');

                this.currentSelectedLevelId = lvl.id;
                document.getElementById('detail-title').innerText = lvl.title;
                document.getElementById('detail-subtitle').innerText = lvl.subtitle || '-';
                document.getElementById('detail-author').innerText = lvl.author || '不明';
                document.getElementById('detail-updated').innerText = lvl.updatedAt || '-';
                document.getElementById('detail-comment').innerText = lvl.comment || 'コメントはありません。';

                document.querySelector('.editor-layout').classList.add('show-details');
            });
            list.appendChild(div);
        });
    }

    setupEditorWorkspace() {
        let lvls = JSON.parse(localStorage.getItem('lineland_custom_levels') || '[]');
        const lvl = lvls.find(l => l.id === this.currentEditLevelId);
        if (lvl) {
            document.getElementById('edit-title').value = lvl.title || '';
            document.getElementById('edit-subtitle').value = lvl.subtitle || '';
            document.getElementById('edit-author').value = lvl.author || '';
            document.getElementById('edit-comment').value = lvl.comment || '';

            this.editorCanvas.loadData(lvl.data);
            document.querySelectorAll('.tool-item').forEach(b => b.classList.remove('active'));
            document.querySelector('.tool-item[data-tool="empty"]').classList.add('active');
            this.editorCanvas.setTool('empty');
        }
    }

    saveCurrentLevel() {
        let lvls = JSON.parse(localStorage.getItem('lineland_custom_levels') || '[]');
        const idx = lvls.findIndex(l => l.id === this.currentEditLevelId);
        if (idx !== -1) {
            lvls[idx].title = document.getElementById('edit-title').value;
            lvls[idx].subtitle = document.getElementById('edit-subtitle').value;
            lvls[idx].author = document.getElementById('edit-author').value;
            lvls[idx].comment = document.getElementById('edit-comment').value;
            lvls[idx].updatedAt = this.getFormattedDate();
            lvls[idx].data = this.editorCanvas.getData();
            localStorage.setItem('lineland_custom_levels', JSON.stringify(lvls));
        }
    }
}

window.onload = () => new GameApp().init();