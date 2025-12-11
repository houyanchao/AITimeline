/**
 * Smart Input Box Settings Tab - 智能输入框设置
 * 
 * 功能：
 * - 单击 Enter 换行，快速双击 Enter 发送
 * - 控制各平台的智能输入功能
 */

class SmartInputBoxTab extends BaseTab {
    constructor() {
        super();
        this.id = 'smartInputBox';
        this.name = chrome.i18n.getMessage('xmvkpz');
        this.icon = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
            <line x1="9" y1="9" x2="15" y2="9"/>
            <line x1="9" y1="13" x2="15" y2="13"/>
            <line x1="9" y1="17" x2="15" y2="17"/>
        </svg>`;
    }
    
    /**
     * 渲染设置内容
     */
    render() {
        const container = document.createElement('div');
        container.className = 'smart-input-box-settings';
        
        // 平台列表
        const smartInputPlatforms = getPlatformsByFeature('smartInput');
        
        // ==================== Enter 换行控制模块 ====================
        const enterKeySection = `
            <div class="platform-list">
                <div class="platform-list-title">${chrome.i18n.getMessage('kvzmxp')}</div>
                <div class="platform-list-hint">${chrome.i18n.getMessage('mkpxvz')}</div>
                <div class="platform-list-container">
                    ${smartInputPlatforms.map(platform => `
                        <div class="platform-item">
                            <div class="platform-info-left">
                                <span class="platform-name">${platform.name}</span>
                            </div>
                            <label class="ait-toggle-switch">
                                <input type="checkbox" class="platform-toggle" data-platform-id="${platform.id}">
                                <span class="ait-toggle-slider"></span>
                            </label>
                        </div>
                    `).join('')}
                </div>
            </div>
        `;
        
        container.innerHTML = enterKeySection;
        
        return container;
    }
    
    /**
     * Tab 激活时加载状态
     */
    async mounted() {
        super.mounted();
        
        // 加载平台设置
        await this.loadPlatformSettings();
    }
    
    /**
     * 加载并初始化 Enter 换行平台设置
     */
    async loadPlatformSettings() {
        try {
            // 从 Storage 读取平台设置
            const result = await chrome.storage.local.get('smartInputPlatformSettings');
            const platformSettings = result.smartInputPlatformSettings || {};
            
            // 为每个平台开关设置状态和事件
            const platformToggles = document.querySelectorAll('.platform-toggle');
            platformToggles.forEach(toggle => {
                const platformId = toggle.getAttribute('data-platform-id');
                
                // 设置初始状态（默认关闭）
                toggle.checked = platformSettings[platformId] === true;
                
                // 监听开关变化
                this.addEventListener(toggle, 'change', async (e) => {
                    try {
                        const enabled = e.target.checked;
                        
                        // 读取当前所有设置
                        const result = await chrome.storage.local.get('smartInputPlatformSettings');
                        const settings = result.smartInputPlatformSettings || {};
                        
                        // 更新当前平台
                        settings[platformId] = enabled;
                        
                        // 保存到 Storage
                        await chrome.storage.local.set({ smartInputPlatformSettings: settings });
                    } catch (e) {
                        console.error('[SmartInputBoxTab] Failed to save platform setting:', e);
                        
                        // 保存失败，恢复开关状态
                        toggle.checked = !toggle.checked;
                    }
                });
            });
        } catch (e) {
            console.error('[SmartInputBoxTab] Failed to load platform settings:', e);
        }
    }
    
    /**
     * Tab 卸载时清理
     */
    unmounted() {
        super.unmounted();
    }
}

