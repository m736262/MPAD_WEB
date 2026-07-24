// wwwroot/js/effects.js
// ส่ง MQTT { soundEffectControl: "<url>" } โดยใช้ url จาก map (base from window.soundUrl)
// เล่นไฟล์ local fallback ถ้ามีไฟล์ใน path ที่ map ให้ไว้

(function () {
    const EFFECT_COOLDOWN_MS = 700;
    const lastTriggered = {};

    // base URL สำหรับไฟล์เสียง (ให้ตั้ง window.soundUrl = '/sounds/' ในหน้า layout ถ้าต้องการ)
    const base = (typeof window !== 'undefined' && window.soundUrl) ? String(window.soundUrl) : '/sounds/';
    // ensure trailing slash
    const BASE = base.endsWith('/') ? base : base + '/';

    // map: effectId => url (full or relative from BASE)
    const EFFECT_URL_MAP = {
        applause: BASE + 'applause.mp3',
        cheer: BASE + 'cheer.mp3',
        laugh: BASE + 'laugh.mp3',
        air_horn: BASE + 'air_horn.mp3',
        boo: BASE + 'boo.mp3',
        magic: BASE + 'magic.mp3',
        drumroll: BASE + 'drumroll.mp3',
        mystery: BASE + 'mystery.mp3',
        stop_all: BASE + 'stop_all.mp3' // optional local sound for stop_all if desired
    };

    function triggerEffect(effectId) {
        if (!effectId) return;
        const now = Date.now();
        if (lastTriggered[effectId] && (now - lastTriggered[effectId] < EFFECT_COOLDOWN_MS)) return;
        lastTriggered[effectId] = now;

        // resolve url (may be undefined)
        const url = EFFECT_URL_MAP[effectId];

        // 1) ส่ง MQTT payload: soundEffectControl = url (ถ้ามี) otherwise send effect id for compatibility
        if (typeof sentMessage === 'function') {
            if (effectId === 'stop_all') {
                // special case: send a clear/stop command instead of a url if desired
                sentMessage({ soundEffectControl: 'STOP_ALL' });
                console.debug('effects.js sent soundEffectControl: STOP_ALL');
            } else if (url) {
                sentMessage({ soundEffectControl: url });
                console.debug('effects.js sent soundEffectControl (url):', url);
            } else {
                // fallback: send effect id
                sentMessage({ soundEffectControl: effectId });
                console.debug('effects.js sent soundEffectControl fallback id:', effectId);
            }
        } else {
            console.warn('effects.js: sentMessage() not available');
        }

        // 2) เล่นไฟล์ local (ใช้ url ถ้ามี) — ถ้า stop_all และไม่ต้องการเล่น local ให้ข้าม
        try {
            if (effectId === 'stop_all') {
                // ถ้าต้องการให้ปุ่ม stop_all เล่นเสียง ให้เปิดใช้บรรทัดด้านล่าง (ถ้ามีไฟล์)
                // const s = url; if (s) new Audio(s).play().catch(()=>{});
                return;
            }

            const src = url;
            if (src) {
                const audio = new Audio(src);
                audio.volume = 0.9;
                audio.play().catch(err => console.debug('Local effect play blocked:', err));
            } else {
                console.debug('No local url mapped for effect:', effectId);
            }
        } catch (e) {
            console.error('effects.js play error', e);
        }
    }

    function bindEffects() {
        const btns = document.querySelectorAll('.effect-btn[data-effect]');
        btns.forEach(btn => {
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

    document.addEventListener('DOMContentLoaded', bindEffects);
    window.rebindEffects = bindEffects;
})();