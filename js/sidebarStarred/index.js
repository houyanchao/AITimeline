/**
 * Sidebar Starred - Entry Point
 *
 * 功能入口：检测当前平台是否支持侧边栏收藏列表，
 * 然后以重试机制等待侧边栏 DOM 就绪后初始化 SidebarStarredManager。
 *
 * 生命周期：
 *   1. 平台检测（feature gate）
 *   2. 等待侧边栏 DOM 出现（retry）
 *   3. 初始化 Manager
 *   4. SPA 路由变化时由 Manager 内部的 reinjectTimer 自动处理
 */

(function () {
    const RETRY_DELAYS = [800, 1000, 1500, 2000, 2000, 3000];

    let manager = null;

    // ==================== Feature gate ====================

    const platform = getCurrentPlatform();
    if (!platform || platform.features?.sidebarStarred !== true) return;

    const registry = window.sidebarStarredAdapterRegistry;
    if (!registry) return;

    const adapter = registry.getAdapter();
    if (!adapter) return;

    // ==================== Init with retry ====================

    function canInject() {
        return adapter.findInsertionPoint() !== null;
    }

    async function initialize(retryIndex) {
        if (manager) return;

        manager = new SidebarStarredManager(adapter);
        const ok = await manager.init();

        if (!ok) {
            manager.destroy();
            manager = null;
            if (retryIndex !== undefined) {
                initWithRetry(retryIndex + 1);
            }
        }
    }

    function destroyManager() {
        if (manager) {
            manager.destroy();
            manager = null;
        }
    }

    function initWithRetry(retryIndex = 0) {
        if (retryIndex >= RETRY_DELAYS.length) return;

        setTimeout(() => {
            if (canInject()) {
                initialize(retryIndex);
            } else {
                initWithRetry(retryIndex + 1);
            }
        }, RETRY_DELAYS[retryIndex]);
    }

    // ==================== 监听开关变化 ====================

    StorageAdapter.addChangeListener((changes, areaName) => {
        if (areaName !== 'local' || !changes.sidebarStarredPlatformSettings) return;
        const settings = changes.sidebarStarredPlatformSettings.newValue || {};
        const enabled = settings[platform.id] !== false;
        if (enabled && !manager) {
            if (canInject()) { initialize(0); } else { initWithRetry(); }
        } else if (!enabled && manager) {
            destroyManager();
        }
    });

    // ==================== Bootstrap ====================

    async function bootstrap() {
        const settings = await StorageAdapter.get('sidebarStarredPlatformSettings');
        if (settings && settings[platform.id] === false) return;

        if (canInject()) {
            initialize(0);
        } else {
            initWithRetry();
        }
    }

    bootstrap();
})();
