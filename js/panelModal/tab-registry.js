/**
 * Tab Registry
 * 
 * 这个文件提供了便捷函数，用于注册需要特定依赖的 tabs
 * 
 * ✨ 设计理念：
 * - PanelModal 独立初始化（脚本加载时）
 * - 独立的 tabs 可以在 PanelModal 初始化时注册
 * - 依赖其他模块的 tabs 延迟注册（由依赖模块调用）
 */

/**
 * 注册依赖 TimelineManager 的 tabs
 * 由 TimelineManager 初始化时调用
 * 
 * @param {TimelineManager} timelineManager - Timeline 管理器实例
 */
function registerTimelineTabs(timelineManager) {
    if (!window.panelModal) {
        console.error('[TabRegistry] PanelModal not initialized');
        return;
    }
    
    if (!timelineManager) {
        console.error('[TabRegistry] TimelineManager is required');
        return;
    }
    
    try {
        // 1. 注册 Starred Tab（收藏列表）
        const starredTab = new StarredTab(timelineManager);
        window.panelModal.registerTab(starredTab);
        
        // 2. 注册独立的设置 Tabs（在收藏列表之后）
        registerSettingsTabs();
        
        console.log('[TabRegistry] Timeline tabs registered');
    } catch (error) {
        console.error('[TabRegistry] Failed to register timeline tabs:', error);
    }
}

/**
 * 注册独立的设置 Tabs
 * 由 PanelModal 初始化时调用（不依赖其他模块）
 */
function registerSettingsTabs() {
    if (!window.panelModal) {
        console.error('[TabRegistry] PanelModal not initialized');
        return;
    }
    
    try {
        // 1. 注册时间轴设置 Tab（第二位）
        if (typeof TimelineSettingsTab !== 'undefined') {
            const timelineSettingsTab = new TimelineSettingsTab();
            window.panelModal.registerTab(timelineSettingsTab);
        }
        
        // 2. 注册智能输入框设置 Tab（第三位）
        if (typeof SmartInputBoxTab !== 'undefined') {
            const smartInputBoxTab = new SmartInputBoxTab();
            window.panelModal.registerTab(smartInputBoxTab);
        }
        
        // 3. 注册复制公式设置 Tab（第四位）
        if (typeof FormulaTab !== 'undefined') {
            const formulaTab = new FormulaTab();
            window.panelModal.registerTab(formulaTab);
        }
        
        console.log('[TabRegistry] Settings tabs registered');
    } catch (error) {
        console.error('[TabRegistry] Failed to register settings tabs:', error);
    }
}

/**
 * @deprecated 使用 registerTimelineTabs 代替
 * 保留此函数以保持向后兼容
 */
function initializePanelModalTabs(timelineManager) {
    console.warn('[TabRegistry] initializePanelModalTabs is deprecated, use registerTimelineTabs instead');
    registerTimelineTabs(timelineManager);
}
