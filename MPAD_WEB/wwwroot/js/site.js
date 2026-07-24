// ==========================================
// 🍪 Cookie Helper Functions (ส่วนกลาง)
// ==========================================

/**
 * บันทึกค่า Cookie
 * @param {string} name - ชื่อ Cookie
 * @param {string} value - ค่าที่ต้องการเก็บ
 * @param {number} days - จำนวนวันที่ต้องการให้ Cookie มีอายุ (default: 7 วัน)
 */
function setCookie(name, value, days = 7) {
    const date = new Date();
    date.setTime(date.getTime() + (days * 24 * 60 * 60 * 1000));
    const expires = "expires=" + date.toUTCString();
    document.cookie = `${name}=${encodeURIComponent(value)}; ${expires}; path=/; SameSite=Lax`;
}

/**
 * ดึงค่า Cookie ตามชื่อ
 * @param {string} name - ชื่อ Cookie ที่ต้องการดึง
 * @returns {string|null} - คืนค่ากลับมา หรือ null ถ้าไม่พบ
 */
function getCookie(name) {
    const value = `; ${document.cookie}`;
    const parts = value.split(`; ${name}=`);
    if (parts.length === 2) {
        return decodeURIComponent(parts.pop().split(';').shift());
    }
    return null;
}

/**
 * ลบ Cookie
 * @param {string} name - ชื่อ Cookie ที่ต้องการลบ
 */
function eraseCookie(name) {
    document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;`;
}

/**
 * ตรวจสอบ Token ใน Cookie
 * @param {string} tokenName - ชื่อ cookie ที่เก็บ token (default: 'token')
 * @param {string} loginUrl - URL หน้า Login ที่ต้องการให้ redirect ไป (default: '/Login')
 * @returns {string|null} - คืนค่า token ถ้ามี หรือทำการ redirect ถ้าไม่มี
 */
function checkAuthToken(tokenName = 'token', loginUrl = '/Login') {
    const token = getCookie(tokenName);

    if (!token) {
        // ถ้าไม่มี Token ให้ส่งกลับไปหน้า Login
        window.location.href = loginUrl;
        return null;
    }

    return token;
}