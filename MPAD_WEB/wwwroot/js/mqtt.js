// ==========================================
// 📡 MQTT Manager (Using Paho MQTT)
// ==========================================

let client = null;
let connectON = false;

function connectShop() {
    var subscribeTopic = typeof getRoom === 'function' ? getRoom() : '';

    // ถ้าไม่มี Topic หรือต่ออยู่แล้ว ไม่ต้องต่อซ้ำ
    if (!subscribeTopic || connectON) return;

    var clientId = "line_" + Math.floor(Math.random() * 1000000000);
    var host = "ok.mbox.co.th";
    var port = 8084;

    console.log("Connecting to Paho MQTT Broker...");
    client = new Paho.MQTT.Client(host, Number(port), clientId);

    // Set callback handlers
    client.onConnectionLost = onConnectionLost;
    client.onMessageArrived = onMessageArrived;

    client.connect({
        onSuccess: onConnect,
        onFailure: onConnectFailure,
        useSSL: true,
        cleanSession: false,
        timeout: 10
    });
}

function onConnect() {
    var subscribeTopic = typeof getRoom === 'function' ? getRoom() : '';
    console.log("MQTT Connected to: " + subscribeTopic);
    connectON = true;

    if (subscribeTopic) {
        client.subscribe(subscribeTopic);

        // ดึง Token จาก cookie/storage โดยใช้ getCookie จาก site.js
        var userId = typeof getUserId === 'function' ? getUserId() : (getCookie('userId') || '');
        var authMessage = JSON.stringify({ deviceId: userId, command: "unregister_user" });

        sentMessage(authMessage);
    }

    updateConnectionStatus(true); // อัปเดต UI เป็น Connected
}

function onConnectFailure(responseObject) {
    console.error("MQTT Connect Failed: " + (responseObject ? responseObject.errorMessage : "Unknown error"));
    connectON = false;
    updateConnectionStatus(false);
}

// 🎯 ฟังก์ชันรับคำสั่งยืนยันห้องจากตู้ และทำการอัปเดต UI
function onMessageArrived(message) {
    console.log("onMessageArrived [Topic: " + message.destinationName + "]: " + message.payloadString);

    try {
        var data = JSON.parse(message.payloadString);

        // 🎯 คัดกรอง: จะเรียก renderQueueUI เฉพาะเมื่อมี currentSong (หรือข้อมูลสถานะเพลย์ลิสต์/เพลง)
        if (data && (data.currentSong !== undefined || data.playListStatus !== undefined)) {
            renderQueueUI(data);
        } else {
            console.log("Ignored MQTT message: No 'currentSong' or relevant UI data found.", data);
        }

    } catch (e) {
        console.warn("Message is not JSON format or parse error:", message.payloadString, e);
    }
}

function onConnectionLost(responseObject) {
    connectON = false;
    updateConnectionStatus(false);
    if (responseObject && responseObject.errorCode !== 0) {
        console.log("onConnectionLost: " + responseObject.errorMessage);
    }
}

function sentMessage(data) {
    var subscribeTopic = typeof getRoom === 'function' ? getRoom() : '';

    if (client && connectON && subscribeTopic) {
        var payload = typeof data === 'object' ? JSON.stringify(data) : data;
        var msgObj = new Paho.MQTT.Message(payload);
        msgObj.destinationName = subscribeTopic;
        client.send(msgObj);
        console.log("Sent MQTT Message:", payload);
    } else {
        console.warn("Cannot send message: MQTT not connected");
    }
}

// ⏱️ เช็กสถานะการเชื่อมต่อทุก 5 วินาที (ถ้าหลุดจะทำการเชื่อมต่อใหม่ให้อัตโนมัติ)
setInterval(connectShop, 5000);


// ==========================================
// ➕ ADD TO QUEUE (เรียกจาก song.js)
// ==========================================

// Variable สำหรับเก็บข้อมูลเพลงที่ผู้ใช้งานกำลังเลือกใน Popup
let selectedSongToQueue = null;

/**
 * 1. ฟังก์ชันเพิ่มเพลงลงคิว (เปลี่ยนมาเป็นตัวเปิด Popup แทน)
 * @param {Object} song - Object ข้อมูลเพลงจาก renderSongList
 */
function addToQueue(song) {
    if (!song) return;

    // เก็บข้อมูลเพลงไว้เตรียมใช้งานตอนผู้ใช้กดปุ่มยืนยันใน Popup
    selectedSongToQueue = song;

    // อัปเดตข้อมูลเพลงลงใน UI ของ Popup
    const popupTitle = document.getElementById('popupSongTitle');
    const popupArtist = document.getElementById('popupSongArtist');
    const popupCover = document.getElementById('popupSongCover');
    const popupCategory = document.getElementById('popupCategory');
    const popupCategoryContainer = document.getElementById('popupCategoryContainer');

    if (popupTitle) popupTitle.innerText = song.title || 'Unknown Title';
    if (popupArtist) popupArtist.innerText = song.singer || 'Unknown Artist';
    if (popupCover) popupCover.src = song.image_url || 'https://picsum.photos/400';

    // 🏷️ อัปเดตการแสดงผล category_th
    if (popupCategory && popupCategoryContainer) {
        if (song.category_th && song.category_th.trim() !== '') {
            popupCategory.innerText = song.category_th;
            popupCategoryContainer.classList.remove('hidden');
        } else {
            popupCategoryContainer.classList.add('hidden'); // ซ่อนถ้าไม่มีข้อมูลหมวดหมู่
        }
    }

    // เปิด Modal Popup
    const modal = document.getElementById('addToQueueModal');
    if (modal) modal.classList.remove('hidden');
}

/**
 * ฟังก์ชันสำหรับปิด Modal และเคลียร์ค่า
 */
function closeModal() {
    const modal = document.getElementById('addToQueueModal');
    if (modal) modal.classList.add('hidden');
    selectedSongToQueue = null;
}

let toastTimeout = null;

/**
 * ฟังก์ชันสำหรับแสดง Toast Notification พร้อมอนิเมชัน Fade In / Fade Out
 * @param {string} message - ข้อความที่ต้องการแสดง
 */
function showToast(message = "Added to queue!") {
    const toast = document.getElementById('queueToast');
    const toastMsg = document.getElementById('queueToastMessage');

    if (!toast) return;

    if (toastMsg) toastMsg.innerText = message;

    // เคลียร์ Timeout เดิมถ้ามีการแสดงผลซ้ำกันรัวๆ
    if (toastTimeout) clearTimeout(toastTimeout);

    // 1. แสดง Element ขึ้นมา
    toast.classList.remove('hidden');

    // ใช้ setTimeout เล็กน้อยเพื่อให้ CSS Transition ของ opacity ทำงาน
    setTimeout(() => {
        toast.classList.remove('opacity-0');
        toast.classList.add('opacity-100');
    }, 10);

    // 2. ซ่อนกลับหลังจาก 2 วินาที (2000ms)
    toastTimeout = setTimeout(() => {
        toast.classList.remove('opacity-100');
        toast.classList.add('opacity-0');

        // รอให้อิมแพกต์ Fade Out เล่นจบก่อนค่อยใส่ hidden
        setTimeout(() => {
            toast.classList.add('hidden');
        }, 300);
    }, 2000);
}

/**
 * กดปุ่ม ADD TO QUEUE
 */
function confirmAddToQueue() {
    if (!selectedSongToQueue) return;

    // 1. ยิง MQTT สั่งงาน
    sendQueueMqtt(selectedSongToQueue, "ADDQ");

    // 2. ปิด Popup
    closeModal();

    // 3. แสดง Toast แจ้งเตือน
    showToast("Added to queue!");
}

/**
 * กดปุ่ม Play Next
 */
function confirmPlayNext() {
    if (!selectedSongToQueue) return;

    // 1. ยิง MQTT สั่งงาน (เปลี่ยน command ให้ตรงตามตู้)
    sendQueueMqtt(selectedSongToQueue, "ADDQ_FIRST");

    // 2. ปิด Popup
    closeModal();

    // 3. แสดง Toast แจ้งเตือน (แยกข้อความเพื่อความชัดเจนได้)
    showToast("Set as next song!");
}

/**
 * Helper Function สำหรับประกอบ Payload และส่ง MQTT (เพื่อไม่ให้เขียนโค้ดซ้ำ)
 */
function sendQueueMqtt(song, controlCommand) {
    // 1. ดึงข้อมูลผู้ใช้งานจาก Cookie
    const nickname = getCookie("nickname") || "Guest";
    const imageurl = getCookie("imageurl") || "";

    // 2. ประกอบข้อมูลเพลงเป็น String Pipe: id|title|singer|hdd|image_url
    const itemData = `${song.id}|${song.title}|${song.singer}|${song.hdd || '0'}|${song.image_url || ''}`;

    // 3. สร้าง Payload
    const payload = {
        playListControl: controlCommand, // ค่า ADDQ หรือ INSERTQ
        playListControlData: [itemData],
        command: `register_user|${nickname}|${imageurl}`,
        deviceId : getUserId()
    };

    // 4. ส่งข้อความผ่าน sentMessage() ของ Paho MQTT
    sentMessage(payload);
}


// ==========================================
// 🔌 Connection Status UI Manager
// ==========================================

function updateConnectionStatus(isConnected) {
    const container = document.getElementById('connectionStatusContainer');
    const icon = document.getElementById('connectionIcon');
    const text = document.getElementById('connectionStatusText');

    if (!container || !icon || !text) return;

    // ดึง Nickname จาก getCookie() ของ site.js
    const userId = typeof getNickname === 'function' ? getNickname() : (getCookie("nickname") || 'GUEST');

    if (isConnected) {
        // 🟢 สถานะ Connected
        container.className = "flex items-center gap-2 transition-colors duration-300 text-[#00e5ff]";
        icon.innerText = "sensors";
        text.innerText = `${userId} • Connected`;
    } else {
        // 🔴 สถานะ Disconnected
        container.className = "flex items-center gap-2 transition-colors duration-300 text-slate-500";
        icon.innerText = "sensors_off";
        text.innerText = `${userId} • Disconnected`;
    }
}


// ==========================================
// 🛠️ HELPER FUNCTIONS
// ==========================================

function escapeHtml(text) {
    if (!text) return '';
    return String(text)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

function formatTime(ms) {
    if (ms === undefined || ms === null || isNaN(ms)) return "00:00";
    const totalSeconds = ms > 10000 ? Math.floor(ms / 1000) : Math.floor(ms);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

function parseSongItem(item) {
    if (typeof item === 'object' && item !== null) {
        return {
            id: item.id || '',
            title: item.title || item.songName || 'Unknown Title',
            singer: item.singer || item.artist || 'Unknown Artist',
            nickname: item.nickname || item.user || 'Guest',
            hdd: item.hdd || '',
            image_url: item.image_url || item.imageUrl || ''
        };
    }
    if (typeof item === 'string') {
        const parts = item.split('|');
        const rawSingerPart = parts[2] || '';

        let singer = rawSingerPart;
        let nickname = 'Guest';

        const match = rawSingerPart.match(/^(.*?)(?:\((.*?)\))?$/);
        if (match) {
            singer = match[1] ? match[1].trim() : rawSingerPart;
            nickname = match[2] ? match[2].trim() : 'Guest';
        }

        return {
            id: parts[0] || '',
            title: parts[1] || 'Unknown Title',
            singer: singer || 'Unknown Artist',
            nickname: nickname,
            hdd: parts[3] || '',
            image_url: parts[4] || ''
        };
    }
    return { title: 'Unknown Title', singer: 'Unknown Artist', nickname: 'Guest' };
}

// Variable เก็บสถานะการหยุดเพลงชั่วคราว
let isPaused = false;

// ==========================================
// 🕹️ Shortcut Control Functions (ส่งสั่ง MQTT)
// ==========================================

// แทนที่ฟังก์ชัน togglePausePlay เดิมด้วยอันนี้
function togglePausePlay(event) {
    if (event) event.stopPropagation();

    // สลับสถานะ paused
    isPaused = !isPaused;
    const command = isPaused ? "PAUSE" : "PLAY";

    // ส่งคำสั่งผ่าน MQTT
    sentMessage({playControl: command,deviceId: getUserId() });

    // อัปเดตไอคอนของปุ่มต่างๆ ที่เกี่ยวข้อง (ไม่เปลี่ยนขนาด)
    const btnIcon = document.getElementById('btnPauseIcon');               // mini bar
    const playingIcon = document.getElementById('playingFullPauseIcon');   // ไอคอนภายในปุ่มกลาง (playing view)
    const playingMain = document.getElementById('playingMainToggle');      // ปุ่มกลางตัวจริง

    const iconName = isPaused ? "play_arrow" : "pause";

    if (btnIcon) btnIcon.innerText = iconName;
    if (playingIcon) playingIcon.innerText = iconName;

    // ปรับสีพื้นหลัง/ข้อความของปุ่มกลาง แต่ไม่แตะขนาด (w-20 h-20)
    if (playingMain) {
        // เก็บคลาสสีที่ต้องการ (ไม่กระทบขนาด)
        if (isPaused) {
            playingMain.classList.remove('bg-[#00e5ff]', 'text-slate-950', 'shadow-[0_0_30px_rgba(0,229,255,0.3)]');
            playingMain.classList.add('bg-white/5', 'text-white', 'shadow-sm');
        } else {
            playingMain.classList.remove('bg-white/5', 'text-white', 'shadow-sm');
            playingMain.classList.add('bg-[#00e5ff]', 'text-slate-950', 'shadow-[0_0_30px_rgba(0,229,255,0.3)]');
        }
    }
}

function skipSong(event) {
    if (event) event.stopPropagation();

    //if (confirm("ต้องการข้ามเพลงนี้หรือไม่?")) {
    sentMessage({ playControl: "stop", deviceId: getUserId() });
    //}
}

// Variable สำหรับจัดการเรื่อง Timer
let progressTimer = null;
let currentElapsedMs = 0;
let currentDurationMs = 0;

// ==========================================
// 🎵 QUEUE UI RENDERER (MQTT Data -> DOM)
// ==========================================
// ==========================================
// 🎵 QUEUE UI RENDERER (MQTT Data -> DOM)
// ==========================================
function renderQueueUI(data) {
    if (!data) return;

    // 1. แปลงข้อมูล userListStatus เป็น Array ของวัตถุ [ { username, imageurl }, ... ]
    let userList = [];
    if (Array.isArray(data.userListStatus)) {
        userList = data.userListStatus.map(userStr => {
            if (typeof userStr === 'string') {
                const [username, imageurl] = userStr.split('|');
                return {
                    username: username ? username.trim() : 'Guest',
                    imageurl: imageurl ? imageurl.trim() : ''
                };
            }
            return { username: 'Guest', imageurl: '' };
        });
    }

    // 2. แปลงข้อมูล playListStatus โดยนำ Index ไปจับคู่กับ userList
    let rawList = data.playListStatus || data.playlist || [];
    let songList = Array.isArray(rawList) ? rawList.map((item, index) => {
        // แปลงเพลงพื้นฐานผ่าน parseSongItem
        const song = parseSongItem(item);

        // ผูกชื่อผู้กดจาก userList ตาม Index
        const matchedUser = userList[index];
        song.username = matchedUser ? matchedUser.username : (song.nickname || 'Guest');
        song.user_image = matchedUser ? matchedUser.imageurl : '';

        return song;
    }) : [];

    // ==========================================
    // ⏱️ คำนวณเวลา Elapsed & Duration และ เปอร์เซ็นต์ (%)
    // ==========================================
    let elapsedMs = data.elapsedTimeStatus || 0;
    let durationMs = data.durationTimeStatus || 0;

    let elapsedStr = formatTime(elapsedMs);
    let durationStr = formatTime(durationMs);
    let timeDisplay = `${durationStr}`;

    let progressPercent = 0;
    if (durationMs > 0) {
        progressPercent = Math.min(100, Math.max(0, (elapsedMs / durationMs) * 100));
    }

    // ==========================================
    // ⏯️ อัปเดตสถานะ Play / Pause / Stop
    // ==========================================
    const playStatus = data.playStauts || data.playStatus || "play";
    const isPausedStatus = (playStatus.toLowerCase() === "pause" || playStatus.toLowerCase() === "stop");
    isPaused = isPausedStatus;

    const btnIcon = document.getElementById('btnPauseIcon');
    if (btnIcon) {
        btnIcon.innerText = isPaused ? "play_arrow" : "pause";
    }

    // ==========================================
    // 🔊 อัปเดต Volume
    // ==========================================
    // ===== อัปเดต Volume slider & แสดงผลจาก MQTT (ไม่ให้ trigger handler) =====
    if (data.volumeStatus !== undefined) {
        const vol = Number(data.volumeStatus);
        const slider = document.getElementById('volumeSlider');
        const volumeValueText = document.getElementById('volumeValueText');

        // ป้องกันไม่ให้ handler local ยิงค่าออกไปเป็น MQTT ขณะอัปเดต
        suppressVolumeSend = true;

        if (slider) {
            slider.value = isNaN(vol) ? slider.value : vol;
        }
        if (volumeValueText) {
            volumeValueText.innerText = isNaN(vol) ? volumeValueText.innerText : String(vol);
        }

        // เคลียร์ flag หลังเล็กน้อย (ให้ handler กลับมาทำงานได้)
        setTimeout(() => { suppressVolumeSend = false; }, 300);
    }

    // ===== อัปเดตสถานะ Mute ถ้ามี =====
    if (data.muteStatus !== undefined) {
        isMuted = String(data.muteStatus).toLowerCase() === 'mute';
        const muteIcon = document.getElementById('playingMuteIcon');
        const muteBtn = document.getElementById('playingMuteToggle');
        const slider = document.getElementById('volumeSlider');

        if (muteIcon) muteIcon.innerText = isMuted ? 'volume_off' : 'volume_up';

        if (muteBtn) {
            if (isMuted) {
                muteBtn.classList.add('opacity-50');
            } else {
                muteBtn.classList.remove('opacity-50');
            }
        }
        if (slider) {
            if (isMuted) {
                slider.classList.add('opacity-50', 'pointer-events-none');
            } else {
                slider.classList.remove('opacity-50', 'pointer-events-none');
            }
        }
    }

    // ==========================================
    // 1. Mini Now Playing Bar
    // ==========================================
    const miniSongTitle = document.getElementById('miniSongTitle');
    const miniSongArtist = document.getElementById('miniSongArtist');
    const miniSongDuration = document.getElementById('miniSongDuration');
    const miniProgressBar = document.getElementById('miniProgressBar');
    const miniSongCover = document.getElementById('miniSongCover');
    const miniSongIcon = document.getElementById('miniSongIcon');

    let titleText = "ไม่มีเพลงกำลังเล่น";
    let artistText = "-";
    let imageUrl = "";

    if (songList.length > 0) {
        titleText = songList[0].title || "Unknown Title";
        artistText = songList[0].singer || "Unknown Artist";
        imageUrl = songList[0].image_url || ""; // ดึง Image URL จากคิวเพลง
    } else if (data.currentSong) {
        const parts = String(data.currentSong).split(' - ');
        titleText = parts[0] || data.currentSong;
        artistText = parts[1] || '-';
    }

    // อัปเดต Text & Progress
    if (miniSongTitle) miniSongTitle.innerText = titleText;
    if (miniSongArtist) miniSongArtist.innerText = artistText;
    if (miniSongDuration) miniSongDuration.innerText = timeDisplay;
    if (miniProgressBar) miniProgressBar.style.width = `${progressPercent}%`;

    // 🖼️ อัปเดตรูปปก / สลับการแสดงผล Icon
    if (miniSongCover && miniSongIcon) {
        if (imageUrl) {
            miniSongCover.src = imageUrl;
            miniSongCover.classList.remove('hidden');
            miniSongIcon.classList.add('hidden');
        } else {
            miniSongCover.src = "";
            miniSongCover.classList.add('hidden');
            miniSongIcon.classList.remove('hidden');
        }
    }

    // ==========================================
    // 2. Queue View: เพลงกำลังเล่น (Now Playing)
    // ==========================================
    const nowPlayingTitle = document.getElementById('nowPlayingTitle');
    const nowPlayingAddedBy = document.getElementById('nowPlayingAddedBy');
    const nowPlayingUserAvatar = document.getElementById('nowPlayingUserAvatar');
    const nowPlayingImg = document.getElementById('nowPlayingImg');
    const nowPlayingDefaultIcon = document.getElementById('nowPlayingDefaultIcon');
    const nowPlayingPlayOverlay = document.getElementById('nowPlayingPlayOverlay');
    const nowPlayingDuration = document.getElementById('nowPlayingDuration');

    if (songList.length > 0) {
        const currentSong = songList[0];
        const addedBy = currentSong.username || "System";
        const userInitial = addedBy.charAt(0).toUpperCase();
        const userImage = currentSong.user_image || '';

        if (nowPlayingTitle) nowPlayingTitle.innerText = currentSong.title;
        if (nowPlayingAddedBy) nowPlayingAddedBy.innerText = addedBy;
        if (nowPlayingDuration) nowPlayingDuration.innerText = timeDisplay;

        // 🖼️ แสดงรูปโปรไฟล์ผู้ใช้ หรือ ตัวอักษรย่อ
        if (nowPlayingUserAvatar) {
            if (userImage) {
                nowPlayingUserAvatar.innerHTML = `<img src="${userImage}" class="w-full h-full object-cover" alt="${escapeHtml(addedBy)}" />`;
            } else {
                nowPlayingUserAvatar.innerText = userInitial;
            }
        }

        // 🎵 แสดงรูปปกเพลง
        if (currentSong.image_url && nowPlayingImg) {
            nowPlayingImg.src = currentSong.image_url;
            nowPlayingImg.classList.remove('hidden');
            if (nowPlayingDefaultIcon) nowPlayingDefaultIcon.classList.add('hidden');
            if (nowPlayingPlayOverlay) nowPlayingPlayOverlay.classList.remove('hidden');
        } else if (nowPlayingImg) {
            nowPlayingImg.classList.add('hidden');
            if (nowPlayingDefaultIcon) nowPlayingDefaultIcon.classList.remove('hidden');
            if (nowPlayingPlayOverlay) nowPlayingPlayOverlay.classList.add('hidden');
        }
    } else {
        // 🔴 Empty State เมื่อไม่มีเพลงเล่น
        if (nowPlayingTitle) nowPlayingTitle.innerText = "ไม่มีเพลงกำลังเล่น";
        if (nowPlayingAddedBy) nowPlayingAddedBy.innerText = "-";
        if (nowPlayingUserAvatar) nowPlayingUserAvatar.innerText = "-";
        if (nowPlayingDuration) nowPlayingDuration.innerText = "00:00 / 00:00";

        if (nowPlayingImg) nowPlayingImg.classList.add('hidden');
        if (nowPlayingDefaultIcon) nowPlayingDefaultIcon.classList.remove('hidden');
        if (nowPlayingPlayOverlay) nowPlayingPlayOverlay.classList.add('hidden');
    }

    // ==========================================
    // 3. Queue View: Subtitle "Next up..."
    // ==========================================
    const nextTurnInfo = document.getElementById('nextTurnInfo');

    if (nextTurnInfo) {
        if (songList.length > 1) {
            const nextSong = songList[1];
            const nextUser = nextSong.username || 'Guest';

            const userTurnCount = songList.slice(0, 2).filter(s => s.username === nextUser).length;

            const getOrdinal = (n) => {
                const s = ["th", "st", "nd", "rd"];
                const v = n % 100;
                return n + (s[(v - 20) % 10] || s[v] || s[0]);
            };

            const turnText = getOrdinal(userTurnCount);
            nextTurnInfo.innerText = `Next up: ${turnText} turn for ${nextUser}`;
        } else {
            nextTurnInfo.innerText = "No upcoming songs";
        }
    }

    // ==========================================
    // 4. Queue View: รายการคิวถัดไป (Queue List)
    // ==========================================
    const queueContainer = document.getElementById('queueItemsContainer');
    // ===== ปรับสร้าง Queue HTML ให้มี data-playlist-index และ data-song-id =====
    if (queueContainer) {
        const nextQueue = songList.slice(1); // nextQueue[0] corresponds to playlist index 1
        if (nextQueue.length === 0) {
            queueContainer.innerHTML = `
            <div class="text-center py-8 text-on-surface-variant text-xs bg-surface-container/40 rounded-3xl border border-white/5">
                ไม่มีคิวเพลงถัดไป
            </div>`;
        } else {
            // สร้างรายการ และใส่ data attributes: data-playlist-index (absolute in playlist) + data-song-id
            const queueHTML = nextQueue.map((song, idx) => {
                const playlistIndex = idx + 1; // เพราะ songList[0] เป็น now playing
                const userName = song.username || 'Guest';
                const userInitial = userName.charAt(0).toUpperCase();
                const userImage = song.user_image || '';

                return `
            <div class="queue-item bg-surface-container/70 p-4 rounded-3xl flex items-center justify-between border border-white/5 hover:bg-surface-container transition-all"
                 data-playlist-index="${playlistIndex}"
                 data-song-id="${escapeHtml(song.id)}">
                <div class="flex items-center gap-3.5 min-w-0 pr-2">
                    <div class="w-14 h-14 shrink-0 rounded-2xl overflow-hidden ${idx === 0 ? 'bg-purple-900/40' : 'bg-slate-800'} flex items-center justify-center">
                        ${song.image_url ? `<img src="${song.image_url}" class="w-full h-full object-cover" />` : `
                        <span class="material-symbols-outlined ${idx === 0 ? 'text-purple-400' : 'text-slate-400'}">
                            ${idx === 0 ? 'graphic_eq' : 'music_note'}
                        </span>`}
                    </div>
                    <div class="min-w-0">
                        ${idx === 0 ? '<span class="text-[10px] font-bold tracking-widest text-slate-400 uppercase">NEXT UP</span>' : ''}
                        <h4 class="font-bold text-on-surface text-base truncate ${idx === 0 ? 'mt-0.5' : ''}">${escapeHtml(song.title)}</h4>
                        <p class="text-xs text-on-surface-variant truncate">${escapeHtml(song.singer)}</p>
                        <div class="flex items-center gap-1.5 mt-1 text-xs text-on-surface-variant">
                            <div class="w-4 h-4 rounded-full overflow-hidden shrink-0 flex items-center justify-center bg-amber-500/30 text-amber-300 text-[9px] font-bold">
                                ${userImage ? `<img src="${userImage}" class="w-full h-full object-cover" alt="${escapeHtml(userName)}" />` : userInitial}
                            </div>
                            <span>Added by <strong class="text-on-surface">${escapeHtml(userName)}</strong></span>
                        </div>
                    </div>
                </div>
                <span class="material-symbols-outlined text-slate-600">drag_handle</span>
            </div>`;
            }).join('');

            queueContainer.innerHTML = queueHTML;

            // หลังจากใส่ HTML แล้ว ผูก swipe handlers ให้แต่ละรายการ
            // ให้หน่วงนิดหนึ่งเพื่อให้ DOM อัพเดตเสร็จ
            setTimeout(() => attachSwipeHandlersForQueueItems(), 20);
            setTimeout(() => attachQueueInteractionHandlers(), 20);
        }
    }

    // ===== Update Playing Fullscreen View =====
    const playingFullCover = document.getElementById('playingFullCover');
    const playingFullTitle = document.getElementById('playingFullTitle');
    const playingFullArtist = document.getElementById('playingFullArtist');
    const playingProgressBar = document.getElementById('playingProgressBar');
    const playingCurrentTime = document.getElementById('playingCurrentTime');
    const playingTotalTime = document.getElementById('playingTotalTime');
    const playingFullPauseIcon = document.getElementById('playingFullPauseIcon');

    // ค่าเริ่มต้นจาก mini/queue ที่คำนวณแล้ว
    let pfTitle = titleText;
    let pfArtist = artistText;
    let pfImage = imageUrl;

    if (songList.length > 0) {
        pfTitle = songList[0].title || pfTitle;
        pfArtist = songList[0].singer || pfArtist;
        pfImage = songList[0].image_url || pfImage;
    } else if (data.currentSong) {
        const parts = String(data.currentSong).split(' - ');
        pfTitle = parts[0] || pfTitle;
        pfArtist = parts[1] || pfArtist;
    }

    if (playingFullTitle) playingFullTitle.innerText = pfTitle;
    if (playingFullArtist) playingFullArtist.innerText = pfArtist;
    if (playingFullCover) {
        if (pfImage && pfImage.trim() !== '') {
            playingFullCover.src = pfImage;
        } else {
            // ถ้าต้องการ ให้เปลี่ยนเป็น DEFAULT_COVER หรือ leave as is
            // playingFullCover.src = DEFAULT_COVER;
        }
    }

    if (playingProgressBar) playingProgressBar.style.width = `${progressPercent}%`;
    if (playingCurrentTime) playingCurrentTime.innerText = elapsedStr;
    if (playingTotalTime) playingTotalTime.innerText = durationStr;
    if (playingFullPauseIcon) playingFullPauseIcon.innerText = isPaused ? 'play_arrow' : 'pause';

    if (data.audioStatus !== undefined) {
        try {
            // อาจเป็น string เช่น "karaoke" หรือ object ขึ้นกับผู้ส่ง — ให้แปลงเป็น string
            const audioState = String(data.audioStatus).toLowerCase();
            updateAudioChannelUI(audioState);
        } catch (err) {
            console.warn('Failed to update audio channel UI from mqtt data:', err);
        }
    }

    // ===== Update Next Up card =====
    const nextUpCard = document.getElementById('nextUpCard');
    const nextUpCover = document.getElementById('nextUpCover');
    const nextUpTitle = document.getElementById('nextUpTitle');
    const nextUpMeta = document.getElementById('nextUpMeta');

    if (songList.length > 1) {
        const nextSong = songList[1];
        if (nextUpTitle) nextUpTitle.innerText = nextSong.title || 'Unknown Title';
        if (nextUpMeta) {
            const parts = [];
            if (nextSong.singer) parts.push(nextSong.singer);
            if (nextSong.album) parts.push(nextSong.album); // ถ้ามี field album
            // ถ้ามีผู้เพิ่ม:
            if (nextSong.username) parts.push(`Added by ${nextSong.username}`);
            nextUpMeta.innerText = parts.join(' • ');
        }
        if (nextUpCover) {
            if (nextSong.image_url && nextSong.image_url.trim() !== '') {
                nextUpCover.src = nextSong.image_url;
                nextUpCover.classList.remove('hidden');
            } else {
                nextUpCover.src = ''; // หรือใส่ DEFAULT_COVER
            }
        }
        if (nextUpCard) nextUpCard.classList.remove('hidden');
    } else {
        // ซ่อนเมื่อไม่มีคิวถัดไป
        if (nextUpCard) nextUpCard.classList.add('hidden');
    }
}

// ===== Mute control =====
let isMuted = false;

// ฟังก์ชันเรียกเมื่อกดปุ่ม mute
function toggleMute(e) {
    if (e && e.stopPropagation) e.stopPropagation();

    isMuted = !isMuted;
    const action = isMuted ? 'mute' : 'unmute';

    // ส่ง MQTT เฉพาะเมื่อเชื่อมต่อ (optional)
    if (typeof sentMessage === 'function') {
        sentMessage({ muteControl: action, deviceId: getUserId() });
    } else {
        console.warn("sentMessage() not available to send muteControl:", action);
    }

    // อัปเดตไอคอนปุ่ม
    const muteIcon = document.getElementById('playingMuteIcon');
    if (muteIcon) {
        muteIcon.innerText = isMuted ? 'volume_off' : 'volume_up';
    }

    // ถ้าต้องการ ปิดการส่ง volume ขณะ muted หรือปรับให้ slider ดู disabled
    const slider = document.getElementById('volumeSlider');
    const volumeValueText = document.getElementById('volumeValueText');
    if (slider) {
        if (isMuted) {
            // เก็บค่าปัจจุบันไว้ถ้าต้องการ (optional)
            slider.dataset.prevValue = slider.value;
            slider.classList.add('opacity-50', 'pointer-events-none'); // กึ่งปิดการใช้งานเชิง UI
        } else {
            slider.classList.remove('opacity-50', 'pointer-events-none');
            // ถ้าต้องการคืนค่าอัตโนมัติ:
            // slider.value = slider.dataset.prevValue || slider.value;
            // if (volumeValueText) volumeValueText.innerText = slider.value;
            // และส่งค่า volume กลับเมื่อ unmute (optional)
            // sendVolumeControl(slider.value);
        }
    }

    // (ออปชัน) อัปเดตปุ่มกลาง/mini bar ถ้าต้องการสอดคล้องกัน
    const btnIcon = document.getElementById('btnPauseIcon');
    if (btnIcon) {
        // ไม่เปลี่ยนอะไร แต่ถ้าต้องใช้ icon แสดง mute ให้เพิ่ม logic ที่นี่
    }
}

// ====== Volume control -> ส่ง MQTT (เพิ่มลงใน MPAD_WEB/wwwroot/js/mqtt.js) ======

// ตัวแปรช่วยสำหรับ debounce
let volumeSendTimeout = null;
const VOLUME_DEBOUNCE_MS = 150;

// ฟังก์ชันส่งคำสั่ง volume ผ่าน MQTT
function sendVolumeControl(value) {
    // แปลงเป็นตัวเลขเพื่อความแน่นอน
    const vol = Number(value);
    if (isNaN(vol)) return;

    // สร้าง payload ตามที่ระบบคาดหวัง
    const payload = {
        volumeControl: vol, deviceId: getUserId()
    };

    // ส่งผ่านฟังก์ชัน sentMessage ของไฟล์นี้
    sentMessage(payload);
    console.log('Sent volumeControl via MQTT:', vol);
}

// ตัวจัดการ input event (debounced) — ใช้เมื่อผู้ใช้ลากสไลเดอร์
function handleVolumeInputEvent(e) {
    // ถ้าเป็นการอัพเดตจาก MQTT ให้ไม่ส่ง
    if (suppressVolumeSend || isMuted) return;

    const val = e.target ? e.target.value : e;
    const volumeValueText = document.getElementById('volumeValueText');
    if (volumeValueText) volumeValueText.innerText = String(val);

    if (volumeSendTimeout) clearTimeout(volumeSendTimeout);
    volumeSendTimeout = setTimeout(() => {
        sendVolumeControl(val);
    }, VOLUME_DEBOUNCE_MS);
}

function handleVolumeChangeEvent(e) {
    if (suppressVolumeSend || isMuted) return;

    const val = e.target ? e.target.value : e;
    if (volumeSendTimeout) { clearTimeout(volumeSendTimeout); volumeSendTimeout = null; }
    sendVolumeControl(val);
}

// ผูก Event listeners หลัง DOM โหลด
document.addEventListener('DOMContentLoaded', () => {
    try {
        const slider = document.getElementById('volumeSlider');
        if (slider) {
            // ถ้โค้ดใน home.cshtml ยังมี oninput inline ก็ไม่จำเป็นต้องลบ
            slider.addEventListener('input', handleVolumeInputEvent);   // ขณะลาก (debounced)
            slider.addEventListener('change', handleVolumeChangeEvent); // เมื่อปล่อย/เปลี่ยนค่าแน่นอน
        }
    } catch (err) {
        console.error('Volume control bind error:', err);
    }
});

// ===== Audio channel control (MQTT send + UI update) =====

// ส่งคำสั่ง audio channel ผ่าน MQTT
function sendMqttChannelCommand(type) {
    if (!type) return;
    const t = String(type).toLowerCase();

    // ป้องกันการส่งค่าที่ไม่รู้จัก
    if (!['stereo', 'vocal', 'karaoke'].includes(t)) {
        console.warn('Unknown audio channel command:', type);
        return;
    }

    const payload = { audioControl: t, deviceId: getUserId() };

    // ตรวจการเชื่อมต่อก่อน (optional)
    if (typeof sentMessage === 'function') {
        sentMessage(payload);
        console.log('Sent audioControl via MQTT:', t);
    } else {
        console.warn('sentMessage() not available to send audioControl:', t);
    }
}

// อัปเดตปุ่ม Audio Channel UI เท่านั้น (ไม่ส่ง MQTT) — ถูกเรียกเมื่อได้รับสถานะจาก MQTT
function updateAudioChannelUI(type) {
    const t = (type || '').toString().toLowerCase();

    const btnStereo = document.getElementById('btnAudioStereo');
    const btnVocal = document.getElementById('btnAudioVocal');
    const btnKaraoke = document.getElementById('btnAudioKaraoke');

    // สไตล์ที่ใช้ใน home.cshtml (ซ้ำกับ logic ตรงนั้นเพื่อให้หน้าตาเหมือนกัน)
    const inactiveStyle = "py-3 px-2 rounded-2xl bg-white/5 hover:bg-white/10 active:scale-95 text-slate-300 text-xs font-bold flex flex-col items-center gap-1 transition-all border border-white/5";
    const activeCyanStyle = "py-3 px-2 rounded-2xl bg-gradient-to-b from-cyan-500/20 to-cyan-500/5 text-cyan-400 border border-cyan-500/40 text-xs font-bold flex flex-col items-center gap-1 transition-all";

    if (btnStereo) btnStereo.className = inactiveStyle;
    if (btnVocal) btnVocal.className = inactiveStyle;
    if (btnKaraoke) btnKaraoke.className = inactiveStyle;

    if (t === 'stereo' && btnStereo) btnStereo.className = activeCyanStyle;
    if (t === 'vocal' && btnVocal) btnVocal.className = activeCyanStyle;
    if (t === 'karaoke' && btnKaraoke) btnKaraoke.className = activeCyanStyle;
}


// ============================
// Swipe-to-delete for Queue items + MQTT DELQ sender
// ============================

// ส่งคำสั่งลบคิวผ่าน MQTT
function sendDeleteQueueMqtt(playlistIndex, songId) {
    if (playlistIndex === undefined || songId === undefined) return;
    const payload = {
        playListControl: "DELQ",
        playListControlData: [`${playlistIndex}|${songId}`], deviceId: getUserId()
    };

    if (typeof sentMessage === 'function') {
        sentMessage(payload);
        console.log('Sent DELQ via MQTT:', payload);
    } else {
        console.warn('sentMessage() not available to send DELQ payload', payload);
    }
}

// ฟังก์ชันลบรายการจาก DOM พร้อมอนิเมชัน (หลังจากส่งคำสั่ง)
function removeQueueItemElement(el) {
    if (!el) return;
    // เล่นอนิเมชันเลื่อนออกไปทางขวา แล้วลบ
    el.style.transition = 'transform 220ms ease-out, opacity 200ms ease-out';
    el.style.transform = 'translateX(120%)';
    el.style.opacity = '0';
    setTimeout(() => {
        if (el.parentNode) el.parentNode.removeChild(el);
    }, 240);
}

// ผูก event pointer (หรือ touch) ให้แต่ละรายการคิว
function attachSwipeHandlersForQueueItems() {
    const queueContainer = document.getElementById('queueItemsContainer');
    if (!queueContainer) return;

    // ตั้งค่า threshold px ที่ต้องปัดเกินจึงถือว่าเป็นการลบ
    const SWIPE_THRESHOLD = 80;

    // ผูกให้แต่ละ direct child ของ queueContainer
    const children = Array.from(queueContainer.children);
    children.forEach(itemEl => {
        // ถ้ามีแล้วอย่าใส่ซ้ำ
        if (itemEl.__swipeBound) return;
        itemEl.__swipeBound = true;

        let startX = 0;
        let currentX = 0;
        let dragging = false;

        // pointer events (works for mouse + touch)
        itemEl.addEventListener('pointerdown', (ev) => {
            // only left button or touch
            if (ev.pointerType === 'mouse' && ev.button !== 0) return;
            dragging = true;
            startX = ev.clientX;
            currentX = startX;
            itemEl.style.transition = ''; // cancel transition while dragging
            itemEl.setPointerCapture && itemEl.setPointerCapture(ev.pointerId);
        });

        itemEl.addEventListener('pointermove', (ev) => {
            if (!dragging) return;
            currentX = ev.clientX;
            const dx = currentX - startX;
            if (dx > 0) { // sliding to right only
                // apply translate but cap (for nicer UX)
                const translate = Math.min(dx, 160);
                itemEl.style.transform = `translateX(${translate}px)`;
                itemEl.style.boxShadow = '0 8px 20px rgba(0,0,0,0.12)';
            } else {
                // don't allow left drag (or very small)
                itemEl.style.transform = 'translateX(0px)';
            }
        });

        function endDrag(ev) {
            if (!dragging) return;
            dragging = false;
            const dx = (ev && ev.clientX ? ev.clientX : currentX) - startX;
            // ถ้าเกิน threshold => consider delete
            if (dx >= SWIPE_THRESHOLD) {
                // อ่าน data attributes ที่เราต้องการ
                const playlistIndexAttr = itemEl.getAttribute('data-playlist-index');
                const songIdAttr = itemEl.getAttribute('data-song-id');

                const playlistIndex = playlistIndexAttr !== null ? Number(playlistIndexAttr) : undefined;
                const songId = songIdAttr !== null ? songIdAttr : undefined;

                // ส่งคำสั่ง MQTT และลบ element หลังอนิเมชัน
                sendDeleteQueueMqtt(playlistIndex, songId);
                removeQueueItemElement(itemEl);
            } else {
                // กลับตำแหน่งเดิม
                itemEl.style.transition = 'transform 180ms cubic-bezier(.2,.8,.2,1)';
                itemEl.style.transform = 'translateX(0)';
                setTimeout(() => {
                    itemEl.style.boxShadow = '';
                }, 200);
            }

            // release capture if any
            try { itemEl.releasePointerCapture && itemEl.releasePointerCapture(ev.pointerId); } catch (e) {/*ignore*/ }
        }

        itemEl.addEventListener('pointerup', endDrag);
        itemEl.addEventListener('pointercancel', endDrag);
        // fallback: mouseleave can end drag
        itemEl.addEventListener('mouseleave', (ev) => {
            if (dragging) endDrag(ev);
        });

        // Prevent text selection while dragging
        itemEl.addEventListener('dragstart', (e) => e.preventDefault());
    });
}

// ====== Move (drag up/down) Queue items + MQTT MVQ sender ======

// ส่งคำสั่งย้ายคิวผ่าน MQTT
function sendMoveQueueMqtt(indexSrc, songId, indexDes) {
    if (indexSrc === undefined || songId === undefined || indexDes === undefined) return;
    const payload = {
        playListControl: "MVQ",
        playListControlData: [`${indexSrc}|${songId}|${indexDes}`]
    };

    if (typeof sentMessage === 'function') {
        sentMessage(payload);
        console.log('Sent MVQ via MQTT:', payload);
    } else {
        console.warn('sentMessage() not available to send MVQ payload', payload);
    }
}

// อัปเดต data-playlist-index สำหรับทุกรายการใน container (recompute)
function refreshPlaylistIndexes() {
    const queueContainer = document.getElementById('queueItemsContainer');
    if (!queueContainer) return;
    const items = Array.from(queueContainer.children);
    // songList index mapping: item 0 => playlist index 1 (since 0 is now playing)
    // But we used data-playlist-index when creating items. We recalc relative to playlist:
    items.forEach((el, i) => {
        // i corresponds to nextQueue index (0 => playlistIndex 1)
        const playlistIndex = i + 1; // keep same convention as other code
        el.setAttribute('data-playlist-index', playlistIndex);
    });
}

// ฟังก์ชันผูก handlers ทั้ง swipe และ drag (ทดแทน attachSwipeHandlersForQueueItems)
function attachQueueInteractionHandlers() {
    const queueContainer = document.getElementById('queueItemsContainer');
    if (!queueContainer) return;

    const items = Array.from(queueContainer.querySelectorAll('.queue-item'));
    const SWIPE_THRESHOLD = 80;
    const MOVE_THRESHOLD = 6; // minimal px to start move
    items.forEach(itemEl => {
        if (itemEl.__queueHandlersBound) return;
        itemEl.__queueHandlersBound = true;

        let startX = 0, startY = 0;
        let currentX = 0, currentY = 0;
        let dragging = false;
        let mode = null; // 'swipe' or 'move'
        let pointerId = null;

        // placeholder for move
        let placeholder = null;
        let originalIndex = null;

        function createPlaceholder(height) {
            const ph = document.createElement('div');
            ph.className = 'queue-placeholder';
            ph.style.height = `${height}px`;
            ph.style.margin = getComputedStyle(itemEl).margin;
            ph.style.borderRadius = getComputedStyle(itemEl).borderRadius;
            ph.style.background = 'transparent';
            ph.style.transition = 'height 120ms';
            return ph;
        }

        itemEl.addEventListener('pointerdown', (ev) => {
            if (ev.pointerType === 'mouse' && ev.button !== 0) return;
            pointerId = ev.pointerId;
            startX = currentX = ev.clientX;
            startY = currentY = ev.clientY;
            dragging = true;
            mode = null;
            itemEl.style.transition = ''; // cancel transitions while interacting
            itemEl.setPointerCapture && itemEl.setPointerCapture(pointerId);
        });

        itemEl.addEventListener('pointermove', (ev) => {
            if (!dragging) return;
            currentX = ev.clientX;
            currentY = ev.clientY;
            const dx = currentX - startX;
            const dy = currentY - startY;

            // determine mode when movement exceeds small threshold
            if (!mode) {
                if (Math.abs(dy) > MOVE_THRESHOLD && Math.abs(dy) > Math.abs(dx)) {
                    mode = 'move';
                    // prepare move: insert placeholder and make item absolute
                    const rect = itemEl.getBoundingClientRect();
                    placeholder = createPlaceholder(rect.height);
                    itemEl.parentNode.insertBefore(placeholder, itemEl.nextSibling);
                    originalIndex = Array.from(queueContainer.children).indexOf(itemEl);
                    itemEl.style.position = 'relative';
                    itemEl.style.zIndex = '999';
                    itemEl.style.willChange = 'transform';
                    itemEl.style.boxShadow = '0 12px 30px rgba(0,0,0,0.12)';
                } else if (Math.abs(dx) > MOVE_THRESHOLD && Math.abs(dx) > Math.abs(dy)) {
                    mode = 'swipe';
                    // for swipe we reuse earlier behavior: translateX
                } else {
                    return;
                }
            }

            if (mode === 'swipe') {
                // horizontal translate to right only
                if (dx > 0) {
                    const translate = Math.min(dx, 160);
                    itemEl.style.transform = `translateX(${translate}px)`;
                } else {
                    itemEl.style.transform = 'translateX(0)';
                }
            } else if (mode === 'move') {
                // move vertically: translate the element according to dy
                itemEl.style.transform = `translateY(${dy}px)`;

                // determine insertion position relative to siblings
                const allItems = Array.from(queueContainer.querySelectorAll('.queue-item')).filter(el => el !== itemEl && el !== placeholder);
                // find element whose midY is greater than current center to insert before it
                const itemCenterY = itemEl.getBoundingClientRect().top + (itemEl.getBoundingClientRect().height / 2) + dy;
                let insertBeforeEl = null;
                for (let sibling of allItems) {
                    const r = sibling.getBoundingClientRect();
                    const mid = r.top + r.height / 2;
                    if (itemCenterY < mid) { insertBeforeEl = sibling; break; }
                }
                if (insertBeforeEl) {
                    queueContainer.insertBefore(placeholder, insertBeforeEl);
                } else {
                    queueContainer.appendChild(placeholder);
                }
            }
        });

        function endInteraction(ev) {
            if (!dragging) return;
            dragging = false;
            itemEl.style.transition = 'transform 180ms cubic-bezier(.2,.8,.2,1)';
            const dx = (ev && ev.clientX ? ev.clientX : currentX) - startX;
            const dy = (ev && ev.clientY ? ev.clientY : currentY) - startY;

            if (mode === 'swipe') {
                // handle swipe to delete (same as previous threshold)
                if (dx >= SWIPE_THRESHOLD) {
                    const playlistIndexAttr = itemEl.getAttribute('data-playlist-index');
                    const songIdAttr = itemEl.getAttribute('data-song-id');
                    const playlistIndex = playlistIndexAttr !== null ? Number(playlistIndexAttr) : undefined;
                    const songId = songIdAttr !== null ? songIdAttr : undefined;
                    sendDeleteQueueMqtt(playlistIndex, songId);
                    // remove element with animation
                    itemEl.style.transform = `translateX(120%)`;
                    itemEl.style.opacity = '0';
                    setTimeout(() => { if (itemEl.parentNode) itemEl.parentNode.removeChild(itemEl); refreshPlaylistIndexes(); }, 240);
                } else {
                    itemEl.style.transform = 'translateX(0)';
                }
            } else if (mode === 'move') {
                // finalize move
                // find new index based on placeholder position
                const children = Array.from(queueContainer.querySelectorAll('.queue-item'));
                // If placeholder exists, compute its index among queue-items (placeholder sits among children)
                let childrenAll = Array.from(queueContainer.children);
                const newPos = childrenAll.indexOf(placeholder);
                // compute playlist indices: placeholder index corresponds to position in nextQueue
                // playlistIndex = placeholder position (0 -> playlistIndex 1)
                const newPlaylistIndex = newPos; // since items in queueContainer represent nextQueue starting at 0 => playlistIndex = newPos + 1
                // originalIndex is index before placeholder insertion; find original playlist index
                const origPlaylistIndex = Number(itemEl.getAttribute('data-playlist-index'));
                const songId = itemEl.getAttribute('data-song-id');

                // remove inline transform/styles and insert element at placeholder
                itemEl.style.transform = 'translateY(0)';
                itemEl.style.boxShadow = '';
                itemEl.style.zIndex = '';
                itemEl.style.position = '';
                if (placeholder && placeholder.parentNode) {
                    queueContainer.insertBefore(itemEl, placeholder);
                    placeholder.parentNode.removeChild(placeholder);
                }

                // refresh data-playlist-index attributes for all items
                refreshPlaylistIndexes();

                // determine indexSrc and indexDes in playlist index space (0-based, with now playing=0)
                // our data-playlist-index uses playlistIndex = nextQueueIndex + 1
                const indexSrc = origPlaylistIndex !== null ? Number(origPlaylistIndex) : undefined;
                const indexDes = itemEl.getAttribute('data-playlist-index') ? Number(itemEl.getAttribute('data-playlist-index')) : undefined;

                // if changed, send MQTT MVQ
                if (indexSrc !== undefined && indexDes !== undefined && indexSrc !== indexDes) {
                    sendMoveQueueMqtt(indexSrc, songId, indexDes);
                }
            } else {
                // no mode detected — just reset
                itemEl.style.transform = 'translateX(0)';
            }

            // cleanup
            try { itemEl.releasePointerCapture && itemEl.releasePointerCapture(pointerId); } catch(e){}
            mode = null;
            placeholder = null;
            originalIndex = null;
        }

        itemEl.addEventListener('pointerup', endInteraction);
        itemEl.addEventListener('pointercancel', endInteraction);
        itemEl.addEventListener('mouseleave', (ev) => { if (dragging) endInteraction(ev); });
        itemEl.addEventListener('dragstart', (e) => e.preventDefault());
    });
}

