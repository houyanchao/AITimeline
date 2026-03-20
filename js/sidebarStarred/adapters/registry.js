/**
 * Sidebar Starred Adapter Registry
 *
 * 管理所有平台的侧边栏收藏适配器。
 */

class SidebarStarredAdapterRegistry {
    constructor() {
        this.adapters = [];
        this._registerAdapters();
    }

    _registerAdapters() {
        if (typeof GeminiSidebarStarredAdapter !== 'undefined') {
            this.adapters.push(new GeminiSidebarStarredAdapter());
        }
        if (typeof ChatGPTSidebarStarredAdapter !== 'undefined') {
            this.adapters.push(new ChatGPTSidebarStarredAdapter());
        }
        if (typeof DeepSeekSidebarStarredAdapter !== 'undefined') {
            this.adapters.push(new DeepSeekSidebarStarredAdapter());
        }
        if (typeof DoubaoSidebarStarredAdapter !== 'undefined') {
            this.adapters.push(new DoubaoSidebarStarredAdapter());
        }
        if (typeof KimiSidebarStarredAdapter !== 'undefined') {
            this.adapters.push(new KimiSidebarStarredAdapter());
        }
        if (typeof ClaudeSidebarStarredAdapter !== 'undefined') {
            this.adapters.push(new ClaudeSidebarStarredAdapter());
        }
        if (typeof TongyiSidebarStarredAdapter !== 'undefined') {
            this.adapters.push(new TongyiSidebarStarredAdapter());
        }
    }

    /**
     * 获取匹配当前页面的适配器
     * @returns {BaseSidebarStarredAdapter|null}
     */
    getAdapter() {
        for (const adapter of this.adapters) {
            try {
                if (adapter.matches()) return adapter;
            } catch (e) {
                console.error('[SidebarStarredRegistry] Adapter check failed:', e);
            }
        }
        return null;
    }
}

if (typeof window.sidebarStarredAdapterRegistry === 'undefined') {
    window.sidebarStarredAdapterRegistry = new SidebarStarredAdapterRegistry();
}
