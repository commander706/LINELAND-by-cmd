// js/loader.js
export class AssetLoader {
    constructor() {
        this.loadedCount = 0;
        this.assets = {};
        this.levels = [];

        this.assetList = [
            { name: 'main_bgm', url: 'assets/main_music.ogg' },
            { name: 'stage_music', url: 'assets/stage_music.ogg' },
            { name: 'nk_bgm', url: 'assets/nk.ogg' },
            { name: 'potion_bgm', url: 'assets/potion.ogg' },
            { name: 'se_change', url: 'assets/change.ogg' },
            { name: 'se_complete', url: 'assets/complete.ogg' },
            { name: 'se_reset', url: 'assets/reset.ogg' },
            { name: 'se_enter', url: 'assets/enter.ogg' },
            { name: 'se_back', url: 'assets/back.ogg' }
        ];
    }

    async loadAll(onProgress) {
        const numLevels = 18;
        const total = this.assetList.length + numLevels;

        if (total === 0) {
            onProgress(100);
            await new Promise(resolve => setTimeout(resolve, 300));
            return;
        }

        const loadPromises = this.assetList.map(item => {
            return this.loadSingleAsset(item.url).then(asset => {
                this.assets[item.name] = asset;
                this.loadedCount++;
                onProgress((this.loadedCount / total) * 100);
            });
        });

        const levelPromises = [];
        // ★修正: main_1.lila から main_18.lila までを読み込む
        for (let i = 1; i <= numLevels; i++) {
            levelPromises.push(
                fetch(`main_levels/main_${i}.lila`)
                    .then(res => res.ok ? res.json() : null)
                    .catch(() => null)
                    .then(data => {
                        this.levels[i - 1] = data; // 配列は0インデックスから詰める
                        this.loadedCount++;
                        onProgress((this.loadedCount / total) * 100);
                    })
            );
        }

        await Promise.all([...loadPromises, ...levelPromises]);
        await new Promise(resolve => setTimeout(resolve, 300));
    }
    loadSingleAsset(url) {
        return new Promise((resolve) => {
            const extension = url.split('.').pop().toLowerCase();
            if (['png', 'jpg', 'jpeg', 'gif', 'webp'].includes(extension)) {
                const img = new Image();
                img.src = url;
                img.onload = () => resolve(img);
                img.onerror = () => { resolve(null); };
            } else if (['mp3', 'wav', 'ogg', 'm4a'].includes(extension)) {
                // canplaythrough待機による無限ロード・遅延を回避するためfetchで直接取得
                fetch(url)
                    .then(res => {
                        if (!res.ok) throw new Error();
                        return res.blob();
                    })
                    .then(blob => {
                        const audio = new Audio();
                        audio.src = URL.createObjectURL(blob);
                        resolve(audio);
                    })
                    .catch(() => {
                        resolve(null);
                    });
            } else {
                resolve(null);
            }
        });
    }
    getAsset(name) {
        return this.assets[name];
    }
}