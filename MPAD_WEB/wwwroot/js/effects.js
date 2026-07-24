// wwwroot/js/effects.js
// Bind .effect-btn -> ส่ง MQTT { effect: "<id>" } ผ่าน sentMessage()
// เล่นเสียง local เป็น fallback ถ้ามีไฟล์ใน /sounds/<id>.mp3

(function () {
    const EFFECT_COOLDOWN_MS = 700;
    const lastTriggered = {};

    function triggerEffect(effectId) {
        if (!effectId) return;
        const now = Date.now();
        if (lastTriggered[effectId] && (now - lastTriggered[effectId] < EFFECT_COOLDOWN_MS)) return;
        lastTriggered[effectId] = now;

        // 1) ส่ง MQTT payload
        if (typeof sentMessage === 'function') {
            sentMessage({ effect: effectId });
            console.debug('effects.js sent effect:', effectId);
        } else {
            console.warn('effects.js: sentMessage() not available');
        }

        // 2) เล่น local sound fallback (if exists)
        try {
            const map = {
                applause: '/sounds/applause.mp3',
                cheer: '/sounds/cheer.mp3',
                laugh: '/sounds/laugh.mp3',
                air_horn: '/sounds/air_horn.mp3',
                boo: '/sounds/boo.mp3',
                magic: '/sounds/magic.mp3',
                drumroll: '/sounds/drumroll.mp3',
                mystery: '/sounds/mystery.mp3',
                stop_all: '/sounds/stop_all.mp3'
            };
            const src = map[effectId];
            if (src) {
                const a = new Audio(src);
                a.volume = 0.9;
                a.play().catch(err => console.debug('Local effect play blocked:', err));
            }
        } catch (e) {
            console.error('effects.js play error', e);
        }
    }

    function bindEffects() {
        const btns = document.querySelectorAll('.effect-btn[data-effect]');
        btns.forEach(btn => {
            // avoid duplicate listener
            if (btn.__effectsBound) return;
            btn.__effectsBound = true;

            btn.addEventListener('click', (ev) => {
                ev.stopPropagation();
                const id = btn.getAttribute('data-effect');
                // visual feedback
                btn.classList.add('scale-95', 'ring-2', 'ring-cyan-400');
                setTimeout(() => btn.classList.remove('scale-95', 'ring-2', 'ring-cyan-400'), 250);

                triggerEffect(id);
            });
        });
    }

    // bind on DOMContentLoaded and also expose a public rebind if needed
    document.addEventListener('DOMContentLoaded', bindEffects);
    window.rebindEffects = bindEffects;
})();