/**
 * Tab Registry - 统一的 Tab 注册管理
 * 
 * ✨ 设计理念：所有 tabs 用相同的逻辑注册，按固定顺序
 */

// 缓存 TimelineManager 实例
let cachedTimelineManager = null;

/**
 * 注册所有可用的 tabs（按固定顺序）
 * @param {TimelineManager} timelineManager - 可选，StarredTab 需要
 */
function registerAllTabs(timelineManager = null) {
    if (!window.panelModal) {
        console.error('[TabRegistry] PanelModal not initialized');
        return;
    }
    
    // 缓存 TimelineManager（后续调用可能不传）
    if (timelineManager) {
        cachedTimelineManager = timelineManager;
    }
    
    const pm = window.panelModal;
        
    // 1. 收藏列表（需要 TimelineManager）
    if (!pm.tabs.has('starred') && typeof StarredTab !== 'undefined' && cachedTimelineManager) {
        pm.registerTab(new StarredTab(cachedTimelineManager));
    }
    
    // 2. 时间轴设置
    if (!pm.tabs.has('timeline-settings') && typeof TimelineSettingsTab !== 'undefined') {
        pm.registerTab(new TimelineSettingsTab());
    }
    
    // 3. 提示词
    if (!pm.tabs.has('prompt') && typeof PromptTab !== 'undefined') {
        pm.registerTab(new PromptTab());
        }
        
    // 4. 智能输入框
    if (!pm.tabs.has('smart-input-box') && typeof SmartInputBoxTab !== 'undefined') {
        pm.registerTab(new SmartInputBoxTab());
        }
        
    // 5. 复制公式
    if (!pm.tabs.has('formula') && typeof FormulaTab !== 'undefined') {
        pm.registerTab(new FormulaTab());
    }
}

/**
 * TimelineManager 初始化时调用
 */
function registerTimelineTabs(timelineManager) {
    registerAllTabs(timelineManager);
}

/**
 * @deprecated 使用 registerTimelineTabs 代替
 */
function initializePanelModalTabs(timelineManager) {
    registerTimelineTabs(timelineManager);
}
