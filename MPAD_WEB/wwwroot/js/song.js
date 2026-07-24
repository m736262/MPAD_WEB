// ==========================================
// 🎵 Global Variables & Config
// ==========================================
let currentPage = 1;
const pageRows = 15;
let isLoading = false;
let hasMoreData = true;
let currentKeyword = '';
let currentCategory = '';
let searchTimeout = null;

const RECENT_SEARCH_KEY = 'karaoke_recent_searches';
const MAX_RECENT_ITEMS = 5;
const DEFAULT_COVER = 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIxMDAiIGhlaWdodD0iMTAwIiB2aWV3Qm94PSIwIDAgMTAwIDEwMCI+PHJlY3Qgd2lkdGg9IjEwMCIgaGVpZ2h0PSIxMDAiIHJ4PSIxNiIgZmlsbD0iIzJEMzc0OCIvPjxjaXJjbGUgY3g9IjUwIiBjeT0iNTAiIHI9IjI1IiBmaWxsPSIjZmZmZmZmIiBmaWxsLW9wYWNpdHk9IjAuMDgiLz48cGF0aCBmaWxsPSIjQTBBRUMwIiBkPSJNNTUgMzV2MTQuMThjLTEuMDUtLjU0LTIuMzUtLjg1LTMuNzUtLjg1LTQuNiAwLTguMzMgMy43My04LjMzIDguMzNzMy43MyA4LjMzIDguMzMgOC43MyA4LjMzLTMuNzMgOC43My04LjMzVjQxLjY3aDEwVjM1SDU1eiIvPjwvc3ZnPg==';

function getToken() { return typeof getCookie === 'function' ? (getCookie('token') || '') : ''; }
function getUserId() { return typeof getCookie === 'function' ? (getCookie('userId') || 'GUEST') : 'GUEST'; }
function getAppkey() { return typeof getCookie === 'function' ? (getCookie('appKey') || '') : ''; }
function getRoom() { return typeof getCookie === 'function' ? (getCookie('currentRoom') || '') : ''; }
function getNickname() { return typeof getCookie === 'function' ? (getCookie('nickname') || '') : ''; }

function handleImgError(img) {
    img.onerror = null;
    img.src = DEFAULT_COVER;
}

// ==========================================
// 🎵 Song Fetcher & Renderer
// ==========================================
async function fetchSongs(keyword = currentKeyword, category = currentCategory, isNewSearch = true) {
    if (isLoading || (!hasMoreData && !isNewSearch)) return;

    currentKeyword = keyword;
    currentCategory = category;

    if (isNewSearch) {
        currentPage = 1;
        hasMoreData = true;
        const resultsContainer = document.getElementById('resultsContainer');
        if (resultsContainer) resultsContainer.innerHTML = '';
        showLoadingSkeleton();
    } else {
        showBottomLoader();
    }

    isLoading = true;

    const rawUrl = window.loginApiUrl && window.loginApiUrl.trim() !== '' ? window.loginApiUrl : 'https://localhost:7266';
    const baseUrl = rawUrl.replace(/\/+$/, '');
    const roomParts = getRoom().split('/');

    const songParam = {
        keyword: currentKeyword,
        pageNo: currentPage,
        pageRows: pageRows,
        category: currentCategory,
        supID: "",
        shopid: roomParts[2] || '',
        serial: roomParts[3] || '',
        includeDisable: false
    };

    const payload = {
        appKey: getAppkey(),
        id: getUserId(),
        token: getToken(),
        data: JSON.stringify(songParam)
    };

    try {
        const response = await fetch(`${baseUrl}/song/list`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);

        const result = await response.json();

        if (result.successFlag) {
            const songList = typeof result.data === 'string' ? JSON.parse(result.data) : result.data;

            const matchCount = document.getElementById('matchCount');
            if (matchCount) {
                matchCount.innerText = `${songList.totalRows || 0} MATCHES`;
            }

            const songs = songList.data || [];
            renderSongList(songs, isNewSearch);

            if (currentPage >= songList.totalPages || songs.length < pageRows) {
                hasMoreData = false;
            } else {
                currentPage++;
            }
        } else {
            if (isNewSearch) showErrorState(result.msg || 'Failed to load songs');
            hasMoreData = false;
        }
    } catch (error) {
        console.error('Fetch Error:', error);
        if (isNewSearch) showErrorState('Connection error. Please check API server.');
    } finally {
        isLoading = false;
        hideLoadingSkeleton();
        hideBottomLoader();
    }
}

function renderSongList(songs, isNewSearch = false) {
    const resultsContainer = document.getElementById('resultsContainer');
    if (!resultsContainer) return;

    if (isNewSearch && (!songs || songs.length === 0)) {
        resultsContainer.innerHTML = `<div class="text-center py-8 text-outline-variant text-sm">No songs found.</div>`;
        return;
    }

    const baseImgUrl = window.imgUrl || '/images/';
    let html = '';

    songs.forEach(song => {
        const rawTitle = song.songname || song.songname_e || 'Unknown Title';
        const rawSinger = song.singername || song.singername_e || 'Unknown Artist';
        const categoryTh = song.category_th || ''; // 👈 ดึงค่า category_th

        let imgSrc = DEFAULT_COVER;
        if (song.image && song.image.trim() !== '') {
            imgSrc = song.image.startsWith('http') ? song.image : `${baseImgUrl}${song.image}`;
        }

        // สร้าง Object ข้อมูลเพลง (เก็บ category_th ไว้ด้วยถ้าต้องการใช้ต่อใน Popup)
        const songData = {
            id: song.songid || '',
            title: rawTitle,
            singer: rawSinger,
            hdd: song.hdd || '0',
            image_url: imgSrc,
            category_th: categoryTh // 👈 ใส่ไว้ใน Object
        };

        const songJson = JSON.stringify(songData).replace(/"/g, '&quot;');

        html += `
            <div class="bg-surface-container p-4 rounded-2xl flex items-center justify-between hover:bg-surface-container-high transition-colors mb-2">
                <div class="flex items-center gap-3.5 min-w-0 pr-3">
                    <img src="${imgSrc}" class="w-12 h-12 rounded-xl object-cover shrink-0 bg-surface-container-highest" onerror="handleImgError(this)" />
                    <div class="min-w-0">
                        <h4 class="font-bold text-on-surface text-base truncate">${escapeHtml(rawTitle)}</h4>
                        <div class="flex items-center gap-2 mt-0.5 min-w-0">
                            <p class="text-xs text-on-surface-variant truncate">${escapeHtml(rawSinger)}</p>
                            
                            <!-- 🏷️ แสดง category_th (ถ้ามีข้อมูล) -->
                            ${categoryTh ? `
                                <span class="text-[10px] font-medium bg-primary/10 text-primary px-1.5 py-0.5 rounded-md shrink-0">
                                    ${escapeHtml(categoryTh)}
                                </span>
                            ` : ''}
                        </div>
                    </div>
                </div>
                <button onclick="addToQueue(${songJson})" class="h-10 w-10 rounded-full bg-primary/10 text-primary hover:bg-primary hover:text-black flex items-center justify-center shrink-0 transition-all active:scale-90">
                    <span class="material-symbols-outlined text-xl">add</span>
                </button>
            </div>
        `;
    });

    if (isNewSearch) {
        resultsContainer.innerHTML = html;
    } else {
        resultsContainer.insertAdjacentHTML('beforeend', html);
    }
}



// ==========================================
// 🔍 Search & Recent Search Manager
// ==========================================
function handleSearchInput(value) {
    const cleanVal = value ? value.trim() : '';

    clearTimeout(searchTimeout);

    if (cleanVal.length > 0) {
        if (typeof switchMode === 'function') switchMode('search');

        searchTimeout = setTimeout(() => {
            fetchSongs(cleanVal, currentCategory, true);
            saveRecentSearch(cleanVal);
        }, 300);
    } else {
        if (typeof switchMode === 'function') switchMode('home');
        fetchSongs('', currentCategory, true);
    }
}

function getRecentSearches() {
    try {
        const data = localStorage.getItem(RECENT_SEARCH_KEY);
        return data ? JSON.parse(data) : [];
    } catch (e) {
        return [];
    }
}

function saveRecentSearch(keyword) {
    if (!keyword || !keyword.trim()) return;

    let searches = getRecentSearches();
    const cleanKeyword = keyword.trim();

    searches = searches.filter(item => item.toLowerCase() !== cleanKeyword.toLowerCase());
    searches.unshift(cleanKeyword);

    if (searches.length > MAX_RECENT_ITEMS) {
        searches = searches.slice(0, MAX_RECENT_ITEMS);
    }

    localStorage.setItem(RECENT_SEARCH_KEY, JSON.stringify(searches));
    renderRecentSearches();
}

function clearRecentSearch(keyword = null) {
    if (keyword) {
        let searches = getRecentSearches();
        searches = searches.filter(item => item !== keyword);
        localStorage.setItem(RECENT_SEARCH_KEY, JSON.stringify(searches));
    } else {
        localStorage.removeItem(RECENT_SEARCH_KEY);
    }
    renderRecentSearches();
}

function renderRecentSearches() {
    const container = document.getElementById('recentSearchesContainer');
    if (!container) return;

    const searches = getRecentSearches();
    if (searches.length === 0) {
        container.innerHTML = '';
        return;
    }

    let html = `
        <div class="flex items-center justify-between mb-2">
            <span class="text-xs font-semibold text-on-surface-variant uppercase tracking-wider">Recent Searches</span>
            <button onclick="clearRecentSearch()" class="text-xs text-outline hover:text-primary transition-colors">Clear All</button>
        </div>
        <div class="flex flex-wrap gap-2 mb-4">
    `;

    searches.forEach(keyword => {
        const safeKeyword = keyword.replace(/"/g, '&quot;').replace(/'/g, '&#39;');
        html += `
            <button onclick="applyRecentSearch('${safeKeyword}')" class="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-surface-container-high text-xs text-on-surface hover:bg-surface-container-highest transition-all active:scale-95">
                <span>${safeKeyword}</span>
                <span class="material-symbols-outlined text-sm opacity-60 hover:opacity-100" onclick="event.stopPropagation(); clearRecentSearch('${safeKeyword}')">close</span>
            </button>
        `;
    });

    html += `</div>`;
    container.innerHTML = html;
}

function applyRecentSearch(keyword) {
    const searchInput = document.getElementById('searchInput');
    if (searchInput) searchInput.value = keyword;
    handleSearchInput(keyword);
}

// ==========================================
// 📂 Category Manager
// ==========================================
async function fetchCategories() {
    const rawUrl = window.loginApiUrl && window.loginApiUrl.trim() !== '' ? window.loginApiUrl : 'https://localhost:7266';
    const baseUrl = rawUrl.replace(/\/+$/, '');

    const payload = {
        appKey: getAppkey(),
        id: getUserId(),
        token: getToken(),
        data: ""
    };

    try {
        const response = await fetch(`${baseUrl}/song/category`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);

        const result = await response.json();

        if (result.successFlag) {
            const categories = typeof result.data === 'string' ? JSON.parse(result.data) : result.data;
            renderCategoryChips(categories);
        } else {
            console.warn('Get categories failed:', result.msg);
        }
    } catch (error) {
        console.error('Error fetching categories:', error);
    }
}

function renderCategoryChips(categories) {
    const container = document.getElementById('categoryContainer');
    if (!container) return;

    let html = `
        <button onclick="selectCategory(this, '')" 
                class="category-btn bg-primary text-black px-5 py-2 rounded-full font-bold text-sm shrink-0 transition-colors">
            All
        </button>
    `;

    if (Array.isArray(categories)) {
        categories.forEach(cat => {
            const catId = cat.categoryid || '';
            const catName = cat.categoryname || 'Unknown';

            html += `
                <button onclick="selectCategory(this, '${catId}')" 
                        class="category-btn bg-surface-container-highest text-on-surface px-5 py-2 rounded-full font-bold text-sm hover:bg-primary hover:text-black transition-colors shrink-0">
                    ${catName}
                </button>
            `;
        });
    }

    container.innerHTML = html;
}

function selectCategory(element, categoryId) {
    document.querySelectorAll('.category-btn').forEach(btn => {
        btn.className = "category-btn bg-surface-container-highest text-on-surface px-5 py-2 rounded-full font-bold text-sm hover:bg-primary hover:text-black transition-colors shrink-0";
    });
    element.className = "category-btn bg-primary text-black px-5 py-2 rounded-full font-bold text-sm shrink-0 transition-colors";

    if (typeof switchMode === 'function') switchMode('search');

    fetchSongs(currentKeyword, categoryId, true);
}

// ==========================================
// 📜 UI Helper Functions & Bottom Loader
// ==========================================
function showLoadingSkeleton() {
    const resultsContainer = document.getElementById('resultsContainer');
    if (resultsContainer) {
        resultsContainer.innerHTML = `
            <div class="text-center py-8 text-outline-variant">
                <span class="material-symbols-outlined animate-spin text-3xl">progress_activity</span>
                <p class="text-xs mt-2">Loading songs...</p>
            </div>
        `;
    }
}

function hideLoadingSkeleton() { }

function showBottomLoader() {
    let loader = document.getElementById('bottomLoader');
    if (!loader) {
        const resultsContainer = document.getElementById('resultsContainer');
        if (resultsContainer) {
            loader = document.createElement('div');
            loader.id = 'bottomLoader';
            loader.className = 'text-center py-4 text-primary';
            loader.innerHTML = `<span class="material-symbols-outlined animate-spin text-2xl">progress_activity</span>`;
            resultsContainer.after(loader);
        }
    }
}

function hideBottomLoader() {
    const loader = document.getElementById('bottomLoader');
    if (loader) loader.remove();
}

function showErrorState(message) {
    const resultsContainer = document.getElementById('resultsContainer');
    if (resultsContainer) {
        resultsContainer.innerHTML = `<div class="text-center py-8 text-red-400 text-sm">${message}</div>`;
    }
}



// ==========================================
// 📜 Infinite Scroll Event Listener
// ==========================================
window.addEventListener('scroll', () => {
    // เช็กว่าเลื่อนลงมาใกล้อยู่ด้านล่างสุดของหน้าจอ (เหลือระยะ 150px)
    if ((window.innerHeight + window.scrollY) >= document.body.offsetHeight - 150) {
        if (!isLoading && hasMoreData) {
            fetchSongs(currentKeyword, currentCategory, false);
        }
    }
});

// ==========================================
// 🚀 Page Initialization
// ==========================================
document.addEventListener('DOMContentLoaded', () => {
    fetchCategories();
    renderRecentSearches();
    fetchSongs('', '', true);
});


// ==========================================
// 🔝 Back to Top Manager
// ==========================================

// 1. ฟังก์ชันสั่งเลื่อนกลับไปบนสุด
function scrollToTop() {
    window.scrollTo({
        top: 0,
        behavior: 'smooth' // เลื่อนขึ้นแบบนุ่มนวล
    });
}

// 2. ดักการ Scroll เพื่อแสดง/ซ่อนปุ่ม
window.addEventListener('scroll', () => {
    const backToTopBtn = document.getElementById('backToTopBtn');
    if (!backToTopBtn) return;

    // ถ้าเลื่อนลงมาเกิน 300px ให้แสดงปุ่ม
    if (window.scrollY > 300) {
        backToTopBtn.classList.remove('opacity-0', 'pointer-events-none');
        backToTopBtn.classList.add('opacity-100', 'pointer-events-auto');
    } else {
        backToTopBtn.classList.add('opacity-0', 'pointer-events-none');
        backToTopBtn.classList.remove('opacity-100', 'pointer-events-auto');
    }
});