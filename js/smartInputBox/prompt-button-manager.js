/**
 * Prompt Button Manager
 * 
 * 提示词按钮管理器
 * 在输入框左上角显示一个 fixed 定位的"提示词"按钮
 * 
 * 位置更新策略（事件驱动）：
 * - resize 时立即更新
 * - MutationObserver 检测输入框出现/消失
 * - 不使用持续轮询
 */

class PromptButtonManager {
    constructor(adapter) {
        if (!adapter) {
            throw new Error('PromptButtonManager requires an adapter');
        }
        
        this.adapter = adapter;
        this.buttonElement = null;
        this.inputElement = null;
        this.isEnabled = false;
        this.isDestroyed = false;
        this.platformSettings = {};
        this.storageListener = null;
        this.mutationObserver = null;
        this._mutationDebounceTimer = null;  // MutationObserver 防抖定时器
        
        // 事件处理器引用
        this._onResize = null;
        this._rafPending = false;  // RAF 节流标志
        
        // 配置
        this.config = {
            gap: 8  // 按钮与输入框的间距
        };
    }
    
    /**
     * 初始化
     */
    async init() {
        // 1. 加载平台设置
        await this._loadPlatformSettings();
        
        // 2. 监听 Storage 变化
        this._attachStorageListener();
        
        // 3. 创建按钮
        this._createButton();
        
        // 4. 检查是否启用
        if (this._isPlatformEnabled()) {
            this._enable();
        }
    }
    
    /**
     * 启用功能
     */
    _enable() {
        if (this.isEnabled) return;
        this.isEnabled = true;
        
        // 绑定事件
        this._bindEvents();
        
        // 启动输入框检测
        this._startInputDetection();
        
        // 尝试立即查找输入框
        this._findInputAndShow();
    }
    
    /**
     * 禁用功能
     */
    _disable() {
        if (!this.isEnabled) return;
        this.isEnabled = false;
        
        // 解绑事件
        this._unbindEvents();
        
        // 停止检测
        this._stopInputDetection();
        
        // 隐藏按钮
        this._hideButton();
        
        // 清空输入框引用
        this.inputElement = null;
    }
    
    /**
     * 加载平台设置
     */
    async _loadPlatformSettings() {
        try {
            const result = await chrome.storage.local.get('promptButtonPlatformSettings');
            this.platformSettings = result.promptButtonPlatformSettings || {};
        } catch (e) {
            this.platformSettings = {};
        }
    }
    
    /**
     * 检查当前平台是否启用
     */
    _isPlatformEnabled() {
        try {
            const platform = getCurrentPlatform();
            if (!platform) return false;
            if (platform.features?.smartInput !== true) return false;
            return this.platformSettings[platform.id] !== false;
        } catch (e) {
            return true;
        }
    }
    
    /**
     * 监听 Storage 变化
     */
    _attachStorageListener() {
        this.storageListener = (changes, areaName) => {
            // ✅ 已销毁则忽略
            if (this.isDestroyed) return;
            
            if (areaName === 'local' && changes.promptButtonPlatformSettings) {
                this.platformSettings = changes.promptButtonPlatformSettings.newValue || {};
                const shouldEnable = this._isPlatformEnabled();
                
                if (shouldEnable && !this.isEnabled) {
                    this._enable();
                } else if (!shouldEnable && this.isEnabled) {
                    this._disable();
                }
            }
        };
        chrome.storage.onChanged.addListener(this.storageListener);
    }
    
    /**
     * 创建按钮元素
     */
    _createButton() {
        if (this.buttonElement) return;
        
        const button = document.createElement('div');
        button.className = 'smart-input-prompt-btn';
        button.innerHTML = `
            <svg class="smart-input-prompt-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M15 4V2"/>
                <path d="M15 16v-2"/>
                <path d="M8 9h2"/>
                <path d="M20 9h2"/>
                <path d="M17.8 11.8L19 13"/>
                <path d="M15 9h0"/>
                <path d="M17.8 6.2L19 5"/>
                <path d="m3 21 9-9"/>
                <path d="M12.2 6.2L11 5"/>
            </svg>
        `;
        
        button.style.display = 'none';
        button.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            this._handleClick();
        });
        
        document.body.appendChild(button);
        this.buttonElement = button;
    }
    
    /**
     * 绑定事件（resize）
     */
    _bindEvents() {
        // 使用 RAF 节流，每帧最多更新一次
        const scheduleUpdate = () => {
            if (this._rafPending) return;
            this._rafPending = true;
            
            requestAnimationFrame(() => {
                this._rafPending = false;
                this._updatePosition();
            });
        };
        
        this._onResize = scheduleUpdate;
        
        window.addEventListener('resize', this._onResize);
    }
    
    /**
     * 解绑事件
     */
    _unbindEvents() {
        this._rafPending = false;
        
        if (this._onResize) {
            window.removeEventListener('resize', this._onResize);
            this._onResize = null;
        }
    }
    
    /**
     * 启动输入框检测（MutationObserver）
     */
    _startInputDetection() {
        if (this.mutationObserver) return;
        
        this.mutationObserver = new MutationObserver(() => {
            // 防抖处理（DOM 变化可能很频繁）
            if (this._mutationDebounceTimer) {
                clearTimeout(this._mutationDebounceTimer);
            }
            
            this._mutationDebounceTimer = setTimeout(() => {
                this._mutationDebounceTimer = null;
                
                // ✅ 再次检查状态（防止禁用后仍执行）
                if (!this.isEnabled || this.isDestroyed) return;
                
                if (!this.inputElement) {
                    // 还没找到输入框，尝试查找
                    this._findInputAndShow();
                } else if (!document.body.contains(this.inputElement)) {
                    // 输入框被移除，重新查找
                    this.inputElement = null;
                    this._hideButton();
                    this._findInputAndShow();
                } else {
                    // ✅ 输入框存在，更新位置（处理位置变化的情况）
                    this._updatePosition();
                }
            }, 100);  // 100ms 防抖
        });
        
        this.mutationObserver.observe(document.body, {
            childList: true,
            subtree: true
        });
    }
    
    /**
     * 停止输入框检测
     */
    _stopInputDetection() {
        // ✅ 清除待执行的防抖定时器
        if (this._mutationDebounceTimer) {
            clearTimeout(this._mutationDebounceTimer);
            this._mutationDebounceTimer = null;
        }
        
        if (this.mutationObserver) {
            this.mutationObserver.disconnect();
            this.mutationObserver = null;
        }
    }
    
    /**
     * 查找输入框并显示按钮
     */
    _findInputAndShow() {
        if (!this.isEnabled || this.isDestroyed) return;
        
        try {
            const selector = this.adapter.getInputSelector();
            const input = document.querySelector(selector);
            
            if (input) {
                this.inputElement = input;
                this._updatePosition();
            }
        } catch (e) {
            // 忽略
        }
    }
    
    /**
     * 更新按钮位置
     */
    _updatePosition() {
        if (!this.buttonElement || !this.inputElement || this.isDestroyed || !this.isEnabled) {
            return;
        }
        
        try {
            // 获取定位参考元素（适配器可自定义，默认使用输入框）
            const referenceElement = this.adapter.getPositionReferenceElement?.(this.inputElement) || this.inputElement;
            const rect = referenceElement.getBoundingClientRect();
            
            // 参考元素不可见
            if (rect.width === 0 || rect.height === 0) {
                this._hideButton();
                return;
            }
            
            // 获取按钮尺寸
            this.buttonElement.style.visibility = 'hidden';
            this.buttonElement.style.display = 'flex';
            const buttonRect = this.buttonElement.getBoundingClientRect();
            
            // 获取平台偏移量
            const offset = this.adapter.getPromptButtonOffset?.(this.inputElement) || { top: 0, left: 0 };
            
            // 计算位置：相对于参考元素左上角
            const top = rect.top + offset.top;
            const left = rect.left - buttonRect.width - this.config.gap + offset.left;
            
            // 边界检查
            const safeTop = Math.max(8, Math.min(top, window.innerHeight - buttonRect.height - 8));
            const safeLeft = Math.max(8, left);
            
            // 设置位置并显示
            this.buttonElement.style.top = `${safeTop}px`;
            this.buttonElement.style.left = `${safeLeft}px`;
            this.buttonElement.style.visibility = 'visible';
            
        } catch (e) {
            this._hideButton();
        }
    }
    
    /**
     * 隐藏按钮
     */
    _hideButton() {
        if (this.buttonElement) {
            this.buttonElement.style.display = 'none';
        }
    }
    
    /**
     * 处理点击
     */
    _handleClick() {
        console.log('[PromptButton] Button clicked');
        // TODO: 实现点击逻辑
    }
    
    /**
     * 显示
     */
    show() {
        if (this.isEnabled) {
            this._findInputAndShow();
        }
    }
    
    /**
     * 隐藏
     */
    hide() {
        this._hideButton();
    }
    
    /**
     * 销毁
     */
    destroy() {
        this.isDestroyed = true;
        this._disable();
        
        // 移除 Storage 监听
        if (this.storageListener) {
            chrome.storage.onChanged.removeListener(this.storageListener);
            this.storageListener = null;
        }
        
        // 移除按钮
        if (this.buttonElement && this.buttonElement.parentNode) {
            this.buttonElement.parentNode.removeChild(this.buttonElement);
            this.buttonElement = null;
        }
    }
}
