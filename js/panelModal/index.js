/**
 * Panel Modal - 右侧弹出的面板模态框
 * 
 * 功能：
 * - 从右侧滑入/滑出
 * - 支持多个 tab 切换
 * - tab 只显示 icon，悬停显示 tooltip
 * - 点击遮罩层或关闭按钮关闭
 * 
 * ✨ 组件自治：
 * - 脚本加载时自动初始化
 * - 独立管理生命周期
 * - 其他模块通过 window.panelModal 调用
 * 
 * 使用方式：
 * window.panelModal.show('starred'); // 打开并显示 starred tab
 * window.panelModal.hide();          // 关闭
 * window.panelModal.registerTab(tab); // 注册新 tab
 */

class PanelModal {
    constructor() {
        this.container = null;
        this.overlay = null;
        this.content = null;
        this.tabsContainer = null;
        this.closeBtn = null;
        
        this.tabs = new Map(); // tabId -> tab instance
        this.currentTabId = null;
        this.isVisible = false;
        
        // URL 变化监听器
        this._currentUrl = location.href;
        this._boundHandleUrlChange = this._handleUrlChange.bind(this);
        
        this.init();
    }
    
    init() {
        // 创建 DOM 结构
        this.createDOM();
        
        // 绑定事件
        this.bindEvents();
        
        // 监听 URL 变化（自动关闭）
        this._attachUrlListeners();
        
        console.log('[PanelModal] Initialized successfully');
    }
    
    createDOM() {
        // 主容器
        this.container = document.createElement('div');
        this.container.className = 'panel-modal';
        
        // 遮罩层
        this.overlay = document.createElement('div');
        this.overlay.className = 'panel-modal-overlay';
        
        // 内容容器（居中弹窗）
        const wrapper = document.createElement('div');
        wrapper.className = 'panel-modal-wrapper';
        
        // ========== 左侧边栏 ==========
        const sidebar = document.createElement('div');
        sidebar.className = 'panel-modal-sidebar';
        
        // 关闭按钮（左侧顶部）
        this.closeBtn = document.createElement('button');
        this.closeBtn.className = 'panel-modal-close';
        this.closeBtn.innerHTML = `
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <line x1="18" y1="6" x2="6" y2="18"></line>
                <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
        `;
        this.closeBtn.setAttribute('aria-label', chrome.i18n.getMessage('close'));
        
        // Tab 栏（可滚动区域）
        this.tabsContainer = document.createElement('div');
        this.tabsContainer.className = 'panel-modal-tabs';
        
        // Footer 底部信息区域
        const footer = document.createElement('div');
        footer.className = 'panel-modal-footer';
        footer.innerHTML = `
            <div class="panel-modal-footer-item"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg><span>${chrome.i18n.getMessage('dataStorageNote')}</span></div>
            <div class="panel-modal-footer-item"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z"/></svg><span>${chrome.i18n.getMessage('shareIfUseful')}</span><a href="https://chromewebstore.google.com/detail/ai-chat-timeline-chatgpt/fgebdnlceacaiaeikopldglhffljjlhh" target="_blank" class="panel-modal-footer-link">${chrome.i18n.getMessage('chromeWebStore')} ❤️</a></div>
            <div class="panel-modal-footer-item"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 19c-5 1.5-5-2.5-7-3m14 6v-3.87a3.37 3.37 0 0 0-.94-2.61c3.14-.35 6.44-1.54 6.44-7A5.44 5.44 0 0 0 20 4.77 5.07 5.07 0 0 0 19.91 1S18.73.65 16 2.48a13.38 13.38 0 0 0-7 0C6.27.65 5.09 1 5.09 1A5.07 5.07 0 0 0 5 4.77a5.44 5.44 0 0 0-1.5 3.78c0 5.42 3.3 6.61 6.44 7A3.37 3.37 0 0 0 9 18.13V22"/></svg><span>${chrome.i18n.getMessage('projectOpenSource')}</span><a href="https://github.com/houyanchao/AITimeline" target="_blank" class="panel-modal-footer-link">${chrome.i18n.getMessage('starOnGitHub')} ⭐</a></div>
        `;
        
        sidebar.appendChild(this.closeBtn);
        sidebar.appendChild(this.tabsContainer);
        sidebar.appendChild(footer);
        
        // ========== 右侧主区域 ==========
        const main = document.createElement('div');
        main.className = 'panel-modal-main';
        
        // 标题栏（右侧顶部）
        const header = document.createElement('div');
        header.className = 'panel-modal-header';
        
        this.titleElement = document.createElement('h2');
        this.titleElement.className = 'panel-modal-title';
        this.titleElement.textContent = 'Panel'; // 默认标题，会在切换 tab 时更新
        
        header.appendChild(this.titleElement);
        
        // 内容区（可滚动）
        this.content = document.createElement('div');
        this.content.className = 'panel-modal-content';
        
        main.appendChild(header);
        main.appendChild(this.content);
        
        // 组装
        wrapper.appendChild(sidebar);
        wrapper.appendChild(main);
        
        this.container.appendChild(this.overlay);
        this.container.appendChild(wrapper);
        
        // 添加到 body
        document.body.appendChild(this.container);
    }
    
    bindEvents() {
        // 点击遮罩层关闭
        this.overlay.addEventListener('click', () => {
            this.hide();
        });
        
        // 点击关闭按钮（只有 SVG 图标可点击）
        const closeSvg = this.closeBtn.querySelector('svg');
        if (closeSvg) {
            closeSvg.addEventListener('click', (e) => {
                e.stopPropagation(); // 阻止事件冒泡
                this.hide();
            });
        }
    }
    
    /**
     * 监听 URL 变化（自动关闭）
     */
    _attachUrlListeners() {
        try {
            window.addEventListener('popstate', this._boundHandleUrlChange);
            window.addEventListener('hashchange', this._boundHandleUrlChange);
        } catch (error) {
            console.error('[PanelModal] Failed to attach URL listeners:', error);
        }
    }
    
    /**
     * 移除 URL 监听
     */
    _detachUrlListeners() {
        try {
            window.removeEventListener('popstate', this._boundHandleUrlChange);
            window.removeEventListener('hashchange', this._boundHandleUrlChange);
        } catch (error) {
            console.error('[PanelModal] Failed to detach URL listeners:', error);
        }
    }
    
    /**
     * URL 变化处理：自动关闭面板
     */
    _handleUrlChange() {
        const newUrl = location.href;
        if (newUrl !== this._currentUrl) {
            this._currentUrl = newUrl;
            
            // URL 变化时自动关闭面板
            if (this.isVisible) {
                this.hide();
            }
        }
    }
    
    /**
     * 注册 tab
     * @param {BaseTab} tab - tab 实例
     */
    registerTab(tab) {
        if (!tab || !tab.id) {
            console.error('[PanelModal] Invalid tab:', tab);
            return;
        }
        
        if (this.tabs.has(tab.id)) {
            console.warn(`[PanelModal] Tab "${tab.id}" already registered`);
            return;
        }
        
        // 保存 tab
        this.tabs.set(tab.id, tab);
        
        // 创建 tab 按钮
        const tabButton = document.createElement('button');
        tabButton.className = 'panel-tab';
        tabButton.setAttribute('data-tab-id', tab.id);
        tabButton.setAttribute('aria-label', tab.name);
        
        // Tab 图标
        const icon = document.createElement('span');
        icon.className = 'tab-icon';
        
        // 支持 SVG 图标或 emoji
        if (typeof tab.icon === 'string' && tab.icon.trim().startsWith('<')) {
            // SVG 图标
            icon.innerHTML = tab.icon;
        } else {
            // Emoji 或文本
            icon.textContent = tab.icon;
        }
        
        tabButton.appendChild(icon);
        
        // Tab 文字标签
        const label = document.createElement('span');
        label.className = 'tab-label';
        label.textContent = tab.name;
        tabButton.appendChild(label);
        
        // 点击切换 tab
        tabButton.addEventListener('click', () => {
            this.switchTab(tab.id);
        });
        
        // 添加到 tab 栏
        this.tabsContainer.appendChild(tabButton);
        
        console.log(`[PanelModal] Tab "${tab.id}" registered`);
    }
    
    /**
     * 显示面板
     * @param {string} tabId - 要显示的 tab ID（可选）
     */
    show(tabId = null) {
        // 确定要显示的 tab
        const targetTabId = tabId || this.currentTabId || this.tabs.keys().next().value;
        
        if (!targetTabId) {
            console.warn('[PanelModal] No tabs registered');
            return;
        }
        
        // 切换到指定 tab
        this.switchTab(targetTabId);
        
        // 显示面板
        this.container.classList.add('visible');
        this.isVisible = true;
        
        // 禁用 body 滚动
        document.body.style.overflow = 'hidden';
    }
    
    /**
     * 切换 tab
     * @param {string} tabId - tab ID
     */
    switchTab(tabId) {
        const tab = this.tabs.get(tabId);
        if (!tab) {
            console.error(`[PanelModal] Tab "${tabId}" not found`);
            return;
        }
        
        // 如果已经是当前 tab，不重复切换
        if (this.currentTabId === tabId) {
            return;
        }
        
        // 卸载当前 tab
        if (this.currentTabId) {
            const currentTab = this.tabs.get(this.currentTabId);
            if (currentTab && currentTab.unmounted) {
                currentTab.unmounted();
            }
            
            // 移除当前 tab 按钮的 active 状态
            const currentButton = this.tabsContainer.querySelector(`[data-tab-id="${this.currentTabId}"]`);
            if (currentButton) {
                currentButton.classList.remove('active');
            }
        }
        
        // 渲染新 tab 内容
        this.content.innerHTML = '';
        const tabContent = tab.render();
        if (tabContent) {
            this.content.appendChild(tabContent);
        }
        
        // 更新标题
        this.titleElement.textContent = tab.name;
        
        // 更新当前 tab
        this.currentTabId = tabId;
        
        // 添加新 tab 按钮的 active 状态
        const newButton = this.tabsContainer.querySelector(`[data-tab-id="${tabId}"]`);
        if (newButton) {
            newButton.classList.add('active');
        }
        
        // 调用 tab 的 mounted 钩子
        if (tab.mounted) {
            tab.mounted();
        }
    }
    
    /**
     * 隐藏面板
     */
    hide() {
        this.container.classList.remove('visible');
        this.isVisible = false;
        
        // 恢复 body 滚动
        document.body.style.overflow = '';
        
        // 隐藏 tooltip
        if (window.globalTooltipManager) {
            window.globalTooltipManager.forceHideAll();
        }
        
        // 卸载当前 tab
        if (this.currentTabId) {
            const tab = this.tabs.get(this.currentTabId);
            if (tab && tab.unmounted) {
                tab.unmounted();
            }
            
            // 移除 tab 按钮的 active 状态
            const currentButton = this.tabsContainer.querySelector(`[data-tab-id="${this.currentTabId}"]`);
            if (currentButton) {
                currentButton.classList.remove('active');
            }
        }
        
        // ✨ 彻底销毁：清空内容和状态
        this.content.innerHTML = '';
        this.currentTabId = null;
        
        console.log('[PanelModal] Panel hidden and destroyed');
    }
    
    /**
     * 销毁
     */
    destroy() {
        // 移除 URL 监听
        this._detachUrlListeners();
        
        // 移除 DOM
        if (this.container && this.container.parentNode) {
            this.container.parentNode.removeChild(this.container);
        }
        
        // 清理引用
        this.tabs.clear();
        this.container = null;
        this.overlay = null;
        this.content = null;
        this.tabsContainer = null;
        this.closeBtn = null;
        
        console.log('[PanelModal] Destroyed');
    }
}

// ✅ 自动初始化：创建全局单例
// 脚本加载时立即创建，其他模块可直接使用 window.panelModal
if (typeof window !== 'undefined') {
    window.panelModal = new PanelModal();
}
