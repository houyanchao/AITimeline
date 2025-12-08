/**
 * Smart Enter - 主入口
 * 
 * 智能 Enter 功能初始化
 * 
 * 功能：
 * - Enter 键：换行
 * - 快速双击 Enter：发送消息
 * 
 * 支持平台：
 * - ChatGPT
 * - 更多平台待添加...
 */

(function() {
    'use strict';
    
    // 检查当前平台是否启用
    async function isPlatformEnabled() {
        try {
            const platform = getCurrentPlatform();
            if (!platform) return true; // 未知平台，默认启用
            
            // ✅ 首先检查平台是否支持智能输入功能
            if (platform.features?.smartInput !== true) {
                return false; // 平台不支持该功能
            }
            
            const result = await chrome.storage.local.get('smartInputPlatformSettings');
            const settings = result.smartInputPlatformSettings || {};
            
            // 默认关闭（=== true）
            return settings[platform.id] === true;
        } catch (e) {
            return true; // 出错默认启用
        }
    }
    
    // 等待 DOM 和依赖加载完成
    const initSmartEnter = async () => {
        try {
            // 检查依赖是否加载
            if (typeof SmartEnterAdapterRegistry === 'undefined') {
                console.error('[SmartInputBox] SmartEnterAdapterRegistry not loaded');
                return;
            }
            
            if (typeof SmartEnterManager === 'undefined') {
                console.error('[SmartInputBox] SmartEnterManager not loaded');
                return;
            }
            
            // 获取当前页面的适配器
            const registry = window.smartEnterAdapterRegistry;
            if (!registry) {
                console.error('[SmartInputBox] Registry not initialized');
                return;
            }
            
            const adapter = registry.getAdapter();
            
            if (!adapter) {
                // 当前页面不匹配任何适配器，不启用功能
                return;
            }
            
            // ✅ 检查当前平台是否启用
            const platformEnabled = await isPlatformEnabled();
            if (!platformEnabled) {
                console.log('[SmartInputBox] Current platform is disabled');
                return;
            }
            
            // 创建管理器实例
            const manager = new SmartEnterManager(adapter, {
                debug: SMART_ENTER_CONFIG.DEBUG
            });
            
            // 初始化
            await manager.init();
            
            // 保存到全局（方便调试和外部控制）
            window.smartEnterManager = manager;
            
        } catch (error) {
            console.error('[SmartInputBox] Initialization failed:', error);
        }
    };
    
    // ✅ 监听平台设置变化，动态启用/禁用
    function setupPlatformSettingsListener() {
        chrome.storage.onChanged.addListener((changes, areaName) => {
            if (areaName !== 'local') return;
            
            if (changes.smartInputPlatformSettings) {
                const platform = getCurrentPlatform();
                if (!platform) return;
                
                // ✅ 检查平台是否支持智能输入功能
                if (platform.features?.smartInput !== true) {
                    return; // 平台不支持该功能，忽略
                }
                
                const oldSettings = changes.smartInputPlatformSettings.oldValue || {};
                const newSettings = changes.smartInputPlatformSettings.newValue || {};
                
                const wasEnabled = oldSettings[platform.id] === true;
                const isEnabled = newSettings[platform.id] === true;
                
                // 状态发生变化
                if (wasEnabled !== isEnabled) {
                    if (isEnabled) {
                        // 从禁用到启用：重新初始化
                        if (!window.smartEnterManager) {
                            console.log('[SmartInputBox] Platform enabled, reinitializing...');
                            initSmartEnter();
                        }
                    } else {
                        // 从启用到禁用：销毁
                        if (window.smartEnterManager) {
                            console.log('[SmartInputBox] Platform disabled, destroying...');
                            try {
                                window.smartEnterManager.destroy();
                                window.smartEnterManager = null;
                            } catch (e) {
                                console.error('[SmartInputBox] Failed to destroy:', e);
                            }
                        }
                    }
                }
            }
        });
    }
    
    // DOM 加载完成后初始化
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initSmartEnter);
    } else {
        // DOM 已经加载完成
        initSmartEnter();
    }
    
    // ✅ 设置平台设置监听器
    setupPlatformSettingsListener();
    
})();

