// js/ui.js
export class UIManager {
    constructor() {
        this.loadingScreen = document.getElementById('loading-screen');
        this.titleScreen = document.getElementById('title-screen');
        this.loaderCircle = document.getElementById('loader-circle');
        this.loaderProgressLine = document.querySelector('.loader-progress-line');
        this.loaderText = document.getElementById('loader-text');
        this.loaderTargetSquare = document.querySelector('.loader-target-square');
        this.titleSvg = document.getElementById('title-svg');
        this.titleText = document.querySelector('.line-text');
        this.menuButtons = document.getElementById('menu-buttons');
        this.transitionWipe = document.getElementById('transition-wipe');
        this.resetWipe = document.getElementById('reset-wipe');

        this.onVolumeChange = null;
        this.isTransitioning = false;
        this.initSliders();
    }

    initSliders() {
        const sliders = document.querySelectorAll('.custom-slider');
        sliders.forEach(slider => {
            let isDragging = false;
            const updateSlider = (e) => {
                const rect = slider.getBoundingClientRect();
                let x = e.clientX ?? e.touches?.[0].clientX;
                let percent = (x - rect.left) / rect.width;
                percent = Math.max(0, Math.min(1, percent));
                slider.querySelector('.slider-fill').style.width = `${percent * 100}%`;
                slider.querySelector('.slider-thumb').style.left = `${percent * 100}%`;
                slider.dataset.value = Math.round(percent * 100);
                if (this.onVolumeChange) this.onVolumeChange(slider.id, percent);
            };
            const startDrag = (e) => { isDragging = true; updateSlider(e); };
            const stopDrag = () => { isDragging = false; };
            const moveDrag = (e) => { if (isDragging) updateSlider(e); };

            slider.addEventListener('mousedown', startDrag);
            document.addEventListener('mousemove', moveDrag);
            document.addEventListener('mouseup', stopDrag);
            slider.addEventListener('touchstart', startDrag);
            document.addEventListener('touchmove', moveDrag);
            document.addEventListener('touchend', stopDrag);
        });
    }

    updateLoadingProgress(percent) {
        const p = Math.min(percent, 100);
        this.loaderCircle.style.left = `${p}%`;
        this.loaderProgressLine.style.width = `${p}%`;
        this.loaderText.innerText = `${Math.floor(p)}%`;
        if (p >= 100) {
            this.loaderTargetSquare.style.borderColor = '#ff0000';
            this.loaderTargetSquare.style.boxShadow = '0 0 20px #ff0000';
        }
    }

    showTitleScreen(onReady) {
        this.loadingScreen.style.opacity = '0';
        setTimeout(() => {
            this.loadingScreen.classList.remove('active');
            this.titleScreen.classList.add('active');
            this.titleScreen.style.opacity = '1';
            this.playTitleAnimation(onReady);
        }, 500);
    }

    playTitleAnimation(onReady) {
        this.titleText.classList.add('draw');
        setTimeout(() => {
            this.titleSvg.classList.add('move-up');
            setTimeout(() => {
                this.menuButtons.classList.add('show');
                if (onReady) onReady();
            }, 800);
        }, 1500);
    }

    showToast(msg) {
        const toast = document.getElementById('toast-message');
        if (!toast) return;
        toast.innerText = msg;
        toast.classList.add('show');
        setTimeout(() => toast.classList.remove('show'), 3000);
    }

    showConfirm(msg, onYes) {
        const modal = document.getElementById('custom-confirm-modal');
        document.getElementById('confirm-msg').innerText = msg;
        modal.classList.add('active');
        
        const yesBtn = document.getElementById('confirm-yes-btn');
        const noBtn = document.getElementById('confirm-no-btn');
        
        const cleanup = () => {
            modal.classList.remove('active');
            yesBtn.replaceWith(yesBtn.cloneNode(true));
            noBtn.replaceWith(noBtn.cloneNode(true));
        };

        document.getElementById('confirm-yes-btn').addEventListener('click', () => { cleanup(); onYes(); });
        document.getElementById('confirm-no-btn').addEventListener('click', () => { cleanup(); });
    }

    async showFakeLoading(duration) {
        const overlay = document.getElementById('fake-loading-overlay');
        const bar = overlay.querySelector('.loader-progress-line');
        const text = overlay.querySelector('.loader-text');
        const circle = overlay.querySelector('.loader-circle');

        overlay.classList.add('active');
        overlay.style.opacity = '1';
        bar.style.width = '0%';
        circle.style.left = '0%';
        text.innerText = '0%';
        
        await new Promise(r => setTimeout(r, 300));

        const startTime = performance.now();
        return new Promise(resolve => {
            const step = (time) => {
                const elapsed = time - startTime;
                let progress = Math.min(elapsed / duration, 1) * 100;
                const displayProgress = (1 - Math.pow(1 - progress/100, 4)) * 100;

                bar.style.width = `${displayProgress}%`;
                circle.style.left = `${displayProgress}%`;
                text.innerText = `${Math.floor(displayProgress)}%`;
                
                if (progress < 100) {
                    requestAnimationFrame(step);
                } else {
                    setTimeout(() => {
                        resolve(() => {
                            overlay.style.opacity = '0';
                            setTimeout(() => overlay.classList.remove('active'), 300);
                        });
                    }, 200);
                }
            };
            requestAnimationFrame(step);
        });
    }

    playResetWipe(onMiddle) {
        this.resetWipe.style.visibility = 'visible';
        this.resetWipe.style.transition = 'transform 0.3s cubic-bezier(0.8, 0, 0.2, 1)';
        this.resetWipe.style.transform = 'translateY(100vh)';
        
        setTimeout(() => {
            if (onMiddle) onMiddle();
            setTimeout(() => {
                this.resetWipe.style.visibility = 'hidden';
                this.resetWipe.style.transition = 'none';
                this.resetWipe.style.transform = 'translateY(-100%)';
            }, 50);
        }, 300);
    }

    transitionScreen(fromId, toId, direction, onComplete) {
        if (this.isTransitioning) return;
        this.isTransitioning = true;

        const fromScreen = document.getElementById(fromId);
        const toScreen = document.getElementById(toId);

        this.transitionWipe.style.visibility = 'visible';
        this.transitionWipe.style.transition = 'none';
        toScreen.style.transition = 'none';
        fromScreen.style.transition = 'none'; 

        toScreen.classList.add('active');
        toScreen.style.opacity = '1';

        const duration = 600; 
        const easing = 'cubic-bezier(0.8, 0, 0.2, 1)'; 

        if (direction === 'down') {
            this.transitionWipe.style.top = '0';
            this.transitionWipe.style.transform = 'translateY(-100%)';
            toScreen.style.clipPath = 'inset(0 0 100% 0)'; 
            fromScreen.style.clipPath = 'inset(0 0 0 0)';
            void this.transitionWipe.offsetWidth; 
            this.transitionWipe.style.transition = `transform ${duration}ms ${easing}`;
            toScreen.style.transition = `clip-path ${duration}ms ${easing}`;
            fromScreen.style.transition = `clip-path ${duration}ms ${easing}`;
            this.transitionWipe.style.transform = 'translateY(100vh)';
            toScreen.style.clipPath = 'inset(0 0 0 0)';       
            fromScreen.style.clipPath = 'inset(100% 0 0 0)'; 
        } else {
            this.transitionWipe.style.top = '100vh';
            this.transitionWipe.style.transform = 'translateY(0)';
            toScreen.style.clipPath = 'inset(100% 0 0 0)'; 
            fromScreen.style.clipPath = 'inset(0 0 0 0)';
            void this.transitionWipe.offsetWidth;
            this.transitionWipe.style.transition = `transform ${duration}ms ${easing}`;
            toScreen.style.transition = `clip-path ${duration}ms ${easing}`;
            fromScreen.style.transition = `clip-path ${duration}ms ${easing}`;
            this.transitionWipe.style.transform = 'translateY(-100vh)';
            toScreen.style.clipPath = 'inset(0 0 0 0)';       
            fromScreen.style.clipPath = 'inset(0 0 100% 0)'; 
        }

        setTimeout(() => {
            fromScreen.classList.remove('active');
            fromScreen.style.opacity = '0';
            this.transitionWipe.style.visibility = 'hidden';
            toScreen.style.clipPath = 'none';
            fromScreen.style.clipPath = 'none';
            toScreen.style.transition = '';
            fromScreen.style.transition = '';
            this.isTransitioning = false;
            if(onComplete) onComplete();
        }, duration);
    }
}