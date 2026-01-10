/**
 * Main Entry Point
 * 
 * Initializes the timeline extension and manages SPA navigation
 * 
 * Features:
 * - Site detection and adapter loading
 * - History API hooks for better SPA support
 * - Route change detection
 * - Timeline lifecycle management
 */

// --- Entry Point and SPA Navigation Handler ---
let timelineManagerInstance = null;
let currentUrl = location.href;
let initVersion = 0; // Version number for initialization, increments on URL change
let unsubscribePageObserver = null;  // DOMObserverManager 取消订阅函数
let routeCheckIntervalId = null;
let routeListenersAttached = false;
let adapterRegistry = new SiteAdapterRegistry();
let currentAdapter = null;

// Hook history methods for better SPA detection (more efficient than polling)
const originalPushState = history.pushState;
const originalReplaceState = history.replaceState;

history.pushState = function(...args) {
    originalPushState.apply(this, args);
    setTimeout(handleUrlChange, 0);
};

history.replaceState = function(...args) {
    originalReplaceState.apply(this, args);
    setTimeout(handleUrlChange, 0);
};

// Check if current route is a conversation page (uses adapter)
function isConversationRoute(pathname = location.pathname) {
    if (!currentAdapter) {
        currentAdapter = adapterRegistry.detectAdapter();
    }
    return currentAdapter ? currentAdapter.isConversationRoute(pathname) : false;
}

// Helper function: sleep for specified milliseconds
function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

// Helper function: check if current platform is enabled
async function isPlatformEnabled() {
    try {
        const platform = getCurrentPlatform();
        if (!platform) return true; // 未知平台，默认启用
        
        // ✅ 首先检查平台是否支持时间轴功能
        if (platform.features?.timeline !== true) {
            return false; // 平台不支持该功能
        }
        
        const result = await chrome.storage.local.get('timelinePlatformSettings');
        const settings = result.timelinePlatformSettings || {};
        
        // 默认启用（!== false）
        return settings[platform.id] !== false;
    } catch (e) {
        console.error('[Timeline] Failed to check platform enabled:', e);
        return true; // 出错默认启用
    }
}

// Helper function: lightweight check if timeline can be initialized
function canInitialize() {
    if (!currentAdapter) {
        currentAdapter = adapterRegistry.detectAdapter();
    }
    if (!currentAdapter) return false;
    
    const selector = currentAdapter.getUserMessageSelector();
    return document.querySelector(selector) !== null;
}

// Initialize timeline with retry mechanism (exponential backoff)
async function initWithRetry(version, delays, retryIndex = 0) {
    // Check if we've exceeded max retries
    if (retryIndex >= delays.length) {
        return;
    }
    
    // Wait for the specified delay
    await sleep(delays[retryIndex]);
    
    // Check if version is still current (user may have navigated away)
    if (version !== initVersion) {
        return; // Version mismatch, cancel this retry
    }
    
    // Double-check we're still on a conversation route
    if (!isConversationRoute()) {
        return;
    }
    
    // ✅ 检查当前平台是否启用时间轴功能
    const platformEnabled = await isPlatformEnabled();
    if (!platformEnabled) {
        return; // 当前平台未启用，不初始化
    }
    
    // Lightweight check: can we initialize?
    if (canInitialize()) {
        // Yes! Initialize the timeline
        initializeTimeline();
        return;
    }
    
    // No, retry with next delay
    await initWithRetry(version, delays, retryIndex + 1);
}

function attachRouteListenersOnce() {
    if (routeListenersAttached) return;
    routeListenersAttached = true;
    
    TimelineUtils.removeEventListenerSafe(window, 'popstate', handleUrlChange);
    TimelineUtils.removeEventListenerSafe(window, 'hashchange', handleUrlChange);
    
    try { window.addEventListener('popstate', handleUrlChange); } catch {}
    try { window.addEventListener('hashchange', handleUrlChange); } catch {}
    
    // Lightweight polling fallback (less frequent now that we hook history methods)
    routeCheckIntervalId = TimelineUtils.clearIntervalSafe(routeCheckIntervalId);
    try {
        routeCheckIntervalId = setInterval(() => {
            if (location.href !== currentUrl) handleUrlChange();
        }, TIMELINE_CONFIG.ROUTE_CHECK_INTERVAL);
    } catch {}
}

function detachRouteListeners() {
    if (!routeListenersAttached) return;
    routeListenersAttached = false;
    
    TimelineUtils.removeEventListenerSafe(window, 'popstate', handleUrlChange);
    TimelineUtils.removeEventListenerSafe(window, 'hashchange', handleUrlChange);
    routeCheckIntervalId = TimelineUtils.clearIntervalSafe(routeCheckIntervalId);
}

function cleanupGlobalObservers() {
    // 取消 DOMObserverManager 订阅
    if (unsubscribePageObserver) {
        unsubscribePageObserver();
        unsubscribePageObserver = null;
    }
}

function initializeTimeline() {
    // Detect current site adapter
    currentAdapter = adapterRegistry.detectAdapter();
    if (!currentAdapter) {
        return;
    }
    
    // 2. 符合条件的 AI 平台，时间轴初始化之前
    window.trackEvent?.('timeline');

    if (timelineManagerInstance) {
        try { timelineManagerInstance.destroy(); } catch {}
        timelineManagerInstance = null;
    }
    
    // ============================================
    // 清理所有可能残留的 UI 元素（重新初始化前确保页面干净）
    // ============================================
    
    // 1. 清理时间轴主容器（包含整个时间轴 UI 和收藏按钮的包装器）
    TimelineUtils.removeElementSafe(document.querySelector('.ait-chat-timeline-wrapper'));
    
    // 2. 清理原生收藏按钮（正常文档流中的收藏按钮）
    TimelineUtils.removeElementSafe(document.querySelector('.ait-timeline-star-chat-btn-native'));
    
    try {
        timelineManagerInstance = new TimelineManager(currentAdapter);
        timelineManagerInstance.init().catch(err => {});
    } catch (err) {
    }
}

async function handleUrlChange() {
    // 检测 URL 是否变化
    if (location.href === currentUrl) return;
    currentUrl = location.href;
    initVersion++;

    // URL 变化了，先清理旧时间轴实例
    if (timelineManagerInstance) {
        try { timelineManagerInstance.destroy(); } catch {}
        timelineManagerInstance = null;
    }
    
    // ============================================
    // 清理时间轴相关的所有 UI 元素
    // ============================================
    
    // 1. 清理时间轴主容器（包含整个时间轴 UI 和收藏按钮的包装器）
    TimelineUtils.removeElementSafe(document.querySelector('.ait-chat-timeline-wrapper'));
    
    // 2. 清理原生收藏按钮（正常文档流中的收藏按钮）
    TimelineUtils.removeElementSafe(document.querySelector('.ait-timeline-star-chat-btn-native'));
    
    cleanupGlobalObservers();

    // 如果当前是对话 URL，重新初始化
    if (isConversationRoute()) {
        const currentVersion = initVersion;
        initWithRetry(currentVersion, TIMELINE_CONFIG.INIT_RETRY_DELAYS);
    }
    // 如果不是对话 URL，只清理（上面已经做了）
}

// ✅ 监听平台设置变化，动态启用/禁用时间轴
function setupPlatformSettingsListener() {
    chrome.storage.onChanged.addListener((changes, areaName) => {
        if (areaName !== 'local') return;
        
        // 监听平台设置变化
        if (changes.timelinePlatformSettings) {
            const platform = getCurrentPlatform();
            if (!platform) return;
            
            // ✅ 检查平台是否支持时间轴功能
            if (platform.features?.timeline !== true) {
                return; // 平台不支持该功能，忽略
            }
            
            const oldSettings = changes.timelinePlatformSettings.oldValue || {};
            const newSettings = changes.timelinePlatformSettings.newValue || {};
            
            const wasEnabled = oldSettings[platform.id] !== false;
            const isEnabled = newSettings[platform.id] !== false;
            
            // 状态发生变化
            if (wasEnabled !== isEnabled) {
                if (isEnabled) {
                    // 从禁用到启用：重新初始化时间轴
                    if (!timelineManagerInstance && isConversationRoute()) {
                        initVersion++;
                        const currentVersion = initVersion;
                        initWithRetry(currentVersion, TIMELINE_CONFIG.INIT_RETRY_DELAYS);
                    }
                } else {
                    // 从启用到禁用：销毁时间轴
                    if (timelineManagerInstance) {
                        try { timelineManagerInstance.destroy(); } catch {}
                        timelineManagerInstance = null;
                    }
                    
                    // 清理 UI 元素
                    TimelineUtils.removeElementSafe(document.querySelector('.ait-chat-timeline-wrapper'));
                    TimelineUtils.removeElementSafe(document.querySelector('.ait-timeline-star-chat-btn-native'));
                }
            }
        }
    });
}

// Check if current site is supported before initializing
if (!adapterRegistry.isSupportedSite()) {
} else {
    currentAdapter = adapterRegistry.detectAdapter();
    
    // ✅ 设置平台设置监听器（监听用户在设置中切换平台开关）
    setupPlatformSettingsListener();
    
    // ✅ 修复：先检查DOM中是否已存在用户消息（SPA路由切换场景）
    const checkAndInit = () => {
        const selector = currentAdapter ? currentAdapter.getUserMessageSelector() : null;
        if (selector && document.querySelector(selector)) {
            if (isConversationRoute()) {
                // Use retry mechanism for initial load as well
                initVersion++;
                const currentVersion = initVersion;
                initWithRetry(currentVersion, TIMELINE_CONFIG.INIT_RETRY_DELAYS);
            }
            
            // 使用 DOMObserverManager 创建 pageObserver
            if (window.DOMObserverManager && !unsubscribePageObserver) {
                unsubscribePageObserver = window.DOMObserverManager.getInstance().subscribeBody('timeline-page', {
                    callback: handleUrlChange,
                    filter: { hasAddedNodes: true, hasRemovedNodes: true }, // 只关心节点增删
                    debounce: 200  // 200ms 防抖，路由检测不需要太敏感
                });
            }
            attachRouteListenersOnce();
            
            return true; // 已初始化
        }
        return false; // 未初始化
    };
    
    // ✅ 修复：立即检查一次（处理SPA路由切换到对话页的情况）
    // ✅ 异步检查平台是否启用
    (async () => {
        const platformEnabled = await isPlatformEnabled();
        if (!platformEnabled) {
            return; // 当前平台未启用，不初始化
        }
        
        if (checkAndInit()) {
            // 已经初始化成功，不需要observer
        } else {
            // 还没有用户消息，使用 DOMObserverManager 等待
            let unsubscribeInitial = null;
            if (window.DOMObserverManager) {
                unsubscribeInitial = window.DOMObserverManager.getInstance().subscribeBody('timeline-initial', {
                    callback: () => {
                        if (checkAndInit()) {
                            // 初始化成功，取消订阅
                            if (unsubscribeInitial) {
                                unsubscribeInitial();
                                unsubscribeInitial = null;
                            }
                        }
                    },
                    debounce: 150  // 150ms 防抖
                });
            }
        }
    })();
}
