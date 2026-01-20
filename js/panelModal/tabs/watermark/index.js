/**
 * Watermark Tab - Nano Banana 水印去除设置
 * 
 * 功能：
 * - Nano Banana 水印去除开关（默认开启）
 */

class WatermarkTab extends BaseTab {
    constructor() {
        super();
        this.id = 'watermark';
        this.name = chrome.i18n.getMessage('watermarkTabName') || '去除水印';
        this.icon = '🍌';
    }
    
    /**
     * 渲染设置内容
     */
    render() {
        const container = document.createElement('div');
        container.className = 'watermark-tab';
        
        // 水印去除开关
        const watermarkSection = `
            <div class="setting-section">
                <div class="setting-item">
                    <div class="setting-info">
                        <div class="setting-label">
                            <span class="platform-icon">🍌</span>
                            Nano Banana
                        </div>
                        <div class="setting-hint">
                            ${chrome.i18n.getMessage('watermarkRemoverHint')}
                        </div>
                    </div>
                    <label class="ait-toggle-switch">
                        <input type="checkbox" id="watermark-remover-toggle">
                        <span class="ait-toggle-slider"></span>
                    </label>
                </div>
            </div>
        `;
        
        container.innerHTML = watermarkSection;
        
        return container;
    }
    
    /**
     * Tab 激活时加载状态
     */
    async mounted() {
        super.mounted();
        
        // 处理水印去除开关
        const watermarkToggle = document.getElementById('watermark-remover-toggle');
        if (watermarkToggle) {
            // 读取当前状态（默认开启）
            try {
                const result = await chrome.storage.local.get('watermarkRemoverEnabled');
                // 默认值为 true（开启）
                watermarkToggle.checked = result.watermarkRemoverEnabled !== false;
            } catch (e) {
                console.error('[WatermarkTab] Failed to load watermark remover state:', e);
                // 读取失败，默认开启
                watermarkToggle.checked = true;
            }
            
            // 监听开关变化
            this.addEventListener(watermarkToggle, 'change', async (e) => {
                try {
                    const enabled = e.target.checked;
                    
                    // 保存到 Storage
                    await chrome.storage.local.set({ watermarkRemoverEnabled: enabled });
                    
                    // 通知水印去除模块
                    if (window.AIChatTimelineWatermarkRemover) {
                        window.AIChatTimelineWatermarkRemover.setEnabled(enabled);
                    }
                    
                    console.log('[WatermarkTab] Watermark remover enabled:', enabled);
                } catch (e) {
                    console.error('[WatermarkTab] Failed to save watermark remover state:', e);
                    
                    // 保存失败，恢复checkbox状态
                    watermarkToggle.checked = !watermarkToggle.checked;
                }
            });
        }
    }
    
    /**
     * Tab 卸载时清理
     */
    unmounted() {
        super.unmounted();
    }
}
