/**
 * Settings Tab - 其他配置
 * 
 * 功能：
 * - URL 按钮功能开关（识别页面纯文本 URL 并添加快捷跳转按钮）
 */

class SettingsTab extends BaseTab {
    constructor() {
        super();
        this.id = 'settings';
        this.name = chrome.i18n.getMessage('settingsTabName') || '其他配置';
        this.icon = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="12" cy="12" r="1"/>
            <circle cx="19" cy="12" r="1"/>
            <circle cx="5" cy="12" r="1"/>
        </svg>`;
    }
    
    /**
     * 渲染设置内容
     */
    render() {
        const container = document.createElement('div');
        container.className = 'settings-tab';
        
        // URL 按钮功能开关
        const urlButtonSection = `
            <div class="setting-section">
                <div class="setting-item">
                    <div class="setting-info">
                        <div class="setting-label">${chrome.i18n.getMessage('urlButtonLabel') || 'URL 快捷跳转'}</div>
                        <div class="setting-hint">
                            ${chrome.i18n.getMessage('urlButtonHint') || '识别页面上的纯文本 URL，在其后添加快捷跳转图标，点击可在新标签页打开链接'}
                        </div>
                    </div>
                    <label class="ait-toggle-switch">
                        <input type="checkbox" id="url-button-toggle">
                        <span class="ait-toggle-slider"></span>
                    </label>
                </div>
            </div>
        `;
        
        container.innerHTML = urlButtonSection;
        
        return container;
    }
    
    /**
     * Tab 激活时加载状态
     */
    async mounted() {
        super.mounted();
        
        // 处理 URL 按钮开关
        const urlButtonToggle = document.getElementById('url-button-toggle');
        if (urlButtonToggle) {
            // 读取当前状态（默认开启）
            try {
                const result = await chrome.storage.local.get('urlButtonEnabled');
                // 默认值为 true（开启）
                urlButtonToggle.checked = result.urlButtonEnabled !== false;
            } catch (e) {
                console.error('[SettingsTab] Failed to load URL button state:', e);
                // 读取失败，默认开启
                urlButtonToggle.checked = true;
            }
            
            // 监听开关变化
            this.addEventListener(urlButtonToggle, 'change', async (e) => {
                try {
                    const enabled = e.target.checked;
                    
                    // 保存到 Storage
                    await chrome.storage.local.set({ urlButtonEnabled: enabled });
                    
                    if (enabled) {
                        // 开启功能
                        if (window.urlButtonManager) {
                            // 已有实例，重新扫描页面
                            window.urlButtonManager.reprocess();
                        } else if (window.UrlButtonManager) {
                            // 没有实例但有类，创建新实例
                            window.urlButtonManager = new window.UrlButtonManager({ debug: false });
                        }
                    } else {
                        // 关闭功能：移除所有已添加的按钮
                        this._removeAllUrlButtons();
                        
                        // 销毁实例（停止监听 DOM 变化）
                        if (window.urlButtonManager) {
                            window.urlButtonManager.destroy();
                            window.urlButtonManager = null;
                        }
                    }
                    
                    console.log('[SettingsTab] URL button enabled:', enabled);
                } catch (e) {
                    console.error('[SettingsTab] Failed to save URL button state:', e);
                    
                    // 保存失败，恢复checkbox状态
                    urlButtonToggle.checked = !urlButtonToggle.checked;
                }
            });
        }
    }
    
    /**
     * 移除页面上所有 URL 按钮（关闭功能时调用）
     */
    _removeAllUrlButtons() {
        const wrappers = document.querySelectorAll('.url-btn-wrapper');
        wrappers.forEach(wrapper => {
            // 获取原始 URL 文本
            const urlText = wrapper.querySelector('.url-btn-text');
            if (urlText && wrapper.parentNode) {
                // 用纯文本节点替换 wrapper
                const textNode = document.createTextNode(urlText.textContent);
                wrapper.parentNode.replaceChild(textNode, wrapper);
            }
        });
        console.log('[SettingsTab] Removed all URL buttons');
    }
    
    /**
     * Tab 卸载时清理
     */
    unmounted() {
        super.unmounted();
    }
}

