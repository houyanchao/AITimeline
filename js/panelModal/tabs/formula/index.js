/**
 * Formula Tab - 复制 LaTeX 公式设置
 * 
 * 功能：
 * - 提供开关控制公式复制功能
 * - 点击公式即可复制为 LaTeX 格式
 */

class FormulaTab extends BaseTab {
    constructor() {
        super();
        this.id = 'formula';
        this.name = chrome.i18n.getMessage('kpxvmz');
        this.icon = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M4 7h16M4 12h16M4 17h10"/>
            <path d="M14 17l3 3 5-5"/>
        </svg>`;
    }
    
    /**
     * 渲染设置内容
     */
    render() {
        const container = document.createElement('div');
        container.className = 'formula-settings';
        
        container.innerHTML = `
            <div class="setting-section">
                <div class="setting-item">
                    <div class="setting-info">
                        <div class="setting-label">${chrome.i18n.getMessage('zmkvpx')}</div>
                        <div class="setting-hint">
                            ${chrome.i18n.getMessage('vxkpzm')}
                        </div>
                    </div>
                    <label class="ait-toggle-switch">
                        <input type="checkbox" id="formula-toggle">
                        <span class="ait-toggle-slider"></span>
                    </label>
                </div>
            </div>
        `;
        
        return container;
    }
    
    /**
     * Tab 激活时加载状态
     */
    async mounted() {
        super.mounted();
        
        const checkbox = document.getElementById('formula-toggle');
        if (!checkbox) return;
        
        // 读取当前状态（默认开启）
        try {
            const result = await chrome.storage.local.get('formulaEnabled');
            // 默认值为 true（开启）
            checkbox.checked = result.formulaEnabled !== false;
        } catch (e) {
            console.error('[FormulaTab] Failed to load state:', e);
            // 读取失败，默认开启
            checkbox.checked = true;
        }
        
        // 监听开关变化
        this.addEventListener(checkbox, 'change', async (e) => {
            try {
                const enabled = e.target.checked;
                
                // 保存到 Storage
                await chrome.storage.local.set({ formulaEnabled: enabled });
            } catch (e) {
                console.error('[FormulaTab] Failed to save state:', e);
                
                // 保存失败，恢复checkbox状态
                checkbox.checked = !checkbox.checked;
            }
        });
    }
    
    /**
     * Tab 卸载时清理
     */
    unmounted() {
        super.unmounted();
    }
}

