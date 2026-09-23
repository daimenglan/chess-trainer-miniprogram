"use strict";
/**
 * 通用工具函数
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.formatTime = formatTime;
exports.formatDate = formatDate;
exports.formatScore = formatScore;
exports.getScoreLabel = getScoreLabel;
exports.getScoreColor = getScoreColor;
exports.getScoreBg = getScoreBg;
exports.getResultBadge = getResultBadge;
exports.translateResult = translateResult;
exports.showToast = showToast;
exports.showLoading = showLoading;
exports.hideLoading = hideLoading;
exports.showModal = showModal;
exports.debounce = debounce;
exports.throttle = throttle;
exports.deepClone = deepClone;
exports.keyedList = keyedList;
exports.navigateBackSafe = navigateBackSafe;
exports.parseJwtPayload = parseJwtPayload;
exports.isAdminUser = isAdminUser;
exports.isTeacherUser = isTeacherUser;
exports.isTeacher = isTeacher;
exports.isDistributionEnabled = isDistributionEnabled;
exports.isMembershipEnabled = isMembershipEnabled;
exports.getMenuVisibility = getMenuVisibility;
exports.isMenuItemVisible = isMenuItemVisible;
/**
 * 格式化时间（秒 → MM:SS）
 */
function formatTime(seconds) {
    if (seconds <= 0)
        return '00:00';
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
}
/**
 * 格式化日期
 */
function formatDate(dateStr, format = 'YYYY-MM-DD') {
    if (!dateStr)
        return '';
    const d = new Date(dateStr);
    if (isNaN(d.getTime()))
        return dateStr;
    const map = {
        'YYYY': d.getFullYear().toString(),
        'MM': (d.getMonth() + 1).toString().padStart(2, '0'),
        'DD': d.getDate().toString().padStart(2, '0'),
        'HH': d.getHours().toString().padStart(2, '0'),
        'mm': d.getMinutes().toString().padStart(2, '0'),
        'SS': d.getSeconds().toString().padStart(2, '0'),
    };
    let result = format;
    for (const [key, val] of Object.entries(map)) {
        result = result.replace(key, val);
    }
    return result;
}
/**
 * 格式化评分（引擎分数）
 */
function formatScore(score) {
    if (score === undefined || score === null)
        return '—';
    if (score === 0)
        return '0.00';
    return score > 0 ? `+${score.toFixed(2)}` : score.toFixed(2);
}
/**
 * 评分标签
 */
function getScoreLabel(score) {
    if (score > 3)
        return '胜势';
    if (score > 1.5)
        return '优势';
    if (score > 0.5)
        return '稍优';
    if (score > -0.5)
        return '均势';
    if (score > -1.5)
        return '稍差';
    if (score > -3)
        return '劣势';
    return '败势';
}
/**
 * 获取评分颜色
 */
function getScoreColor(score) {
    if (score > 0.3)
        return '#4ade80';
    if (score > -0.3)
        return '#facc15';
    return '#f87171';
}
/**
 * 获取评分背景色
 */
function getScoreBg(score) {
    if (score > 0.3)
        return 'rgba(34, 197, 94, 0.15)';
    if (score > -0.3)
        return 'rgba(234, 179, 8, 0.15)';
    return 'rgba(239, 68, 68, 0.15)';
}
/**
 * 获取结果徽章样式
 */
function getResultBadge(result, playerSide) {
    if (result === 'draw' || result === '1/2-1/2')
        return { cls: 'badge-draw', text: '和棋' };
    if (result === playerSide || (result === '1-0' && playerSide === 'white') || (result === '0-1' && playerSide === 'black')) {
        return { cls: 'badge-win', text: '胜' };
    }
    return { cls: 'badge-loss', text: '负' };
}
/**
 * 翻译结果
 */
function translateResult(result) {
    const map = {
        '1-0': '白方胜',
        '0-1': '黑方胜',
        '1/2-1/2': '和棋',
        'playing': '进行中',
        'white': '白方胜',
        'black': '黑方胜',
        'draw': '和棋',
        'stalemate': '逼和',
    };
    return map[result] || result;
}
/**
 * 显示toast提示
 */
function showToast(title, icon = 'none') {
    wx.showToast({
        title: title,
        icon: icon,
        duration: 2000,
    });
}
/**
 * 显示加载提示
 */
function showLoading(title = '加载中...') {
    wx.showLoading({ title, mask: true });
}
function hideLoading() {
    wx.hideLoading();
}
/**
 * 显示模态对话框
 */
function showModal(options) {
    return new Promise((resolve) => {
        wx.showModal({
            title: options.title || '提示',
            content: options.content || '',
            confirmText: options.confirmText || '确定',
            cancelText: options.cancelText || '取消',
            success(res) {
                resolve(res.confirm);
            },
        });
    });
}
/**
 * 防抖
 */
function debounce(fn, delay = 300) {
    let timer = null;
    return function (...args) {
        clearTimeout(timer ?? undefined);
        timer = setTimeout(() => fn.apply(this, args), delay);
    };
}
/**
 * 节流
 */
function throttle(fn, interval = 300) {
    let last = 0;
    return function (...args) {
        const now = Date.now();
        if (now - last >= interval) {
            last = now;
            fn.apply(this, args);
        }
    };
}
/**
 * 深度克隆
 */
function deepClone(obj) {
    return JSON.parse(JSON.stringify(obj));
}
/**
 * 将字符串数组转为带唯一键的对象数组，避免 wx:key="*this" 在重复项时告警
 */
function keyedList(arr, prefix) {
    return (arr || []).map((text, i) => ({ key: prefix + '_' + i + '_' + text, text }));
}
/**
 * 安全返回：页面栈只有一层时（分享卡片、小程序码等外部入口直接打开本页），
 * wx.navigateBack 不会生效，此时改跳兜底页，避免用户被困在当前页。
 */
function navigateBackSafe(fallbackUrl = '/pages/choice/choice') {
    if (getCurrentPages().length > 1) {
        wx.navigateBack();
        return;
    }
    wx.reLaunch({ url: fallbackUrl });
}
/**
 * 解析 JWT payload（兼容 base64url 字符集）
 */
function parseJwtPayload(token) {
    try {
        const parts = token.split('.');
        if (parts.length !== 3)
            return null;
        let base64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
        while (base64.length % 4)
            base64 += '=';
        return JSON.parse(atob(base64));
    }
    catch {
        return null;
    }
}
/**
 * 判断当前登录用户是否为管理员（用于管理后台入口与页面的权限校验）
 * 依次取 globalData.user.role → user_info 存储 → JWT payload 中的 role
 */
function isAdminUser() {
    let user = null;
    try {
        const app = typeof getApp === 'function' ? getApp() : null;
        user = (app && app.globalData && app.globalData.user) || null;
    }
    catch { }
    if (!user) {
        try {
            user = wx.getStorageSync('user_info') || null;
        }
        catch { }
    }
    if (user && user.role)
        return user.role === 'admin';
    // 旧版登录未保存 role 时，从 JWT payload 恢复（后端签发的 payload 含 role）
    let token = '';
    try {
        const app = typeof getApp === 'function' ? getApp() : null;
        token = (app && app.globalData && app.globalData.token) || '';
    }
    catch { }
    if (!token) {
        try {
            token = wx.getStorageSync('auth_token') || '';
        }
        catch { }
    }
    if (token) {
        const payload = parseJwtPayload(token);
        if (payload && payload.role)
            return payload.role === 'admin';
    }
    return false;
}
/**
 * 判断当前用户是否为教师（与网页版逻辑一致：admin 或 teacherStatus === 'approved'）
 */
function isTeacherUser(role, teacherStatus) {
    return role === 'admin' || teacherStatus === 'approved';
}
function isTeacher() {
    let user = null;
    try {
        const app = typeof getApp === 'function' ? getApp() : null;
        user = (app && app.globalData && app.globalData.user) || null;
    }
    catch { }
    if (!user) {
        try {
            user = wx.getStorageSync('user_info') || null;
        }
        catch { }
    }
    if (!user)
        return false;
    return isTeacherUser(user.role, user.teacherStatus);
}
/**
 * 从全局配置获取分销系统是否启用（与网页版 distributionEnabled 一致）
 * 启动时由 app.ts 异步加载并写入 globalData.permissions
 */
function isDistributionEnabled() {
    try {
        const app = typeof getApp === 'function' ? getApp() : null;
        const perms = (app && app.globalData && app.globalData.permissions) || null;
        if (perms && typeof perms.distributionEnabled === 'boolean')
            return perms.distributionEnabled;
    }
    catch { }
    // 默认开启，与网页版失败时的回退一致
    return true;
}
/**
 * 从全局配置获取会员系统是否启用（与网页版 membershipEnabled 一致）
 */
function isMembershipEnabled() {
    try {
        const app = typeof getApp === 'function' ? getApp() : null;
        const perms = (app && app.globalData && app.globalData.permissions) || null;
        if (perms && typeof perms.membershipEnabled === 'boolean')
            return perms.membershipEnabled;
    }
    catch { }
    // 默认开启
    return true;
}
/**
 * 获取菜单可见性配置（与网页版 getAdminMenuVisibility 一致）
 * 返回 null 表示使用默认全部可见
 */
function getMenuVisibility() {
    try {
        const app = typeof getApp === 'function' ? getApp() : null;
        return (app && app.globalData && app.globalData.permissions && app.globalData.permissions.menuVisibility) || null;
    }
    catch { }
    return null;
}
/**
 * 检查指定菜单路径对当前用户是否可见（与网页版 isMenuItemVisible 逻辑一致）
 * - 无菜单配置 → 全部可见
 * - 菜单项未隐藏 → 可见
 * - 菜单项已隐藏 → 管理员始终可见；普通用户看白名单
 */
function isMenuItemVisible(menuPath) {
    const visibility = getMenuVisibility();
    if (!visibility)
        return true;
    const items = visibility.items || [];
    const config = items.find((v) => v.path === menuPath);
    if (!config || !config.hidden)
        return true;
    // 管理员始终可见
    if (isAdminUser())
        return true;
    // 普通用户检查白名单
    let user = null;
    try {
        const app = typeof getApp === 'function' ? getApp() : null;
        user = (app && app.globalData && app.globalData.user) || null;
    }
    catch { }
    if (!user)
        return false;
    return (config.visibleToUserIds || []).includes(user.userId);
}
