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
        
        // 提示词列表
        this.prompts = [];
        
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
        
        // 2. 加载提示词列表
        await this._loadPrompts();
        
        // 3. 监听 Storage 变化
        this._attachStorageListener();
        
        // 4. 创建按钮
        this._createButton();
        
        // 5. 检查是否启用
        if (this._isPlatformEnabled()) {
            this._enable();
        }
    }
    
    /**
     * 加载提示词列表
     */
    async _loadPrompts() {
        try {
            const result = await chrome.storage.local.get('biwhckdj');
            this.prompts = result.biwhckdj || [];
        } catch (e) {
            console.error('[PromptButton] Failed to load prompts:', e);
            this.prompts = [];
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
            
            if (areaName === 'local') {
                // 监听平台设置变化
                if (changes.promptButtonPlatformSettings) {
                    this.platformSettings = changes.promptButtonPlatformSettings.newValue || {};
                    const shouldEnable = this._isPlatformEnabled();
                    
                    if (shouldEnable && !this.isEnabled) {
                        this._enable();
                    } else if (!shouldEnable && this.isEnabled) {
                        this._disable();
                    }
                }
                
                // 监听提示词列表变化
                if (changes.biwhckdj) {
                    this.prompts = changes.biwhckdj.newValue || [];
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
        
        if (!this.buttonElement || !window.globalDropdownManager) {
            return;
        }
        
        // 构建下拉菜单项
        const items = this._buildDropdownItems();
        
        // 显示下拉菜单（往上展开）
        window.globalDropdownManager.show({
            trigger: this.buttonElement,
            items: items,
            position: 'top-left',
            width: 220,
            className: 'prompt-dropdown',
            id: 'prompt-button-dropdown'
        });
    }
    
    /**
     * 构建下拉菜单项
     */
    _buildDropdownItems() {
        const items = [];
        
        // 1. 顶部"新增/管理"按钮
        items.push({
            label: chrome.i18n.getMessage('mngpqt'),
            icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <circle cx="12" cy="12" r="3"/>
                <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/>
            </svg>`,
            className: 'prompt-manage-item',
            onClick: () => {
                // 打开 PanelModal 的提示词 tab
                if (window.panelModal) {
                    window.panelModal.show('prompt');
                }
            }
        });
        
        // 2. 根据当前平台筛选提示词
        const currentPlatform = typeof getCurrentPlatform === 'function' ? getCurrentPlatform() : null;
        const currentPlatformId = currentPlatform?.id || '';
        
        // 筛选：platformId 为空（全部平台）或等于当前平台
        const filteredPrompts = this.prompts.filter(p => !p.platformId || p.platformId === currentPlatformId);
        
        // 分割线（如果有提示词）
        if (filteredPrompts.length > 0) {
            items.push({ type: 'divider' });
        }
        
        // 3. 提示词列表（置顶的在前面）
        const sortedPrompts = [...filteredPrompts].sort((a, b) => {
            if (a.pinned && !b.pinned) return -1;
            if (!a.pinned && b.pinned) return 1;
            return 0;
        });
        
        sortedPrompts.forEach(prompt => {
            // 截取内容前30个字符作为显示
            const displayText = prompt.content ? 
                (prompt.content.length > 30 ? prompt.content.substring(0, 30) + '...' : prompt.content) 
                : '空提示词';
            
            const item = {
                label: displayText,
                onClick: () => {
                    this._insertPrompt(prompt);
                }
            };
            
            // 只有置顶的才显示置顶 icon（颜色与 tab 列表中一致 #facc15）
            if (prompt.pinned) {
                item.icon = `<svg viewBox="0 0 24 24" fill="none" stroke="#facc15" stroke-width="2.5">
                    <line x1="5" y1="3" x2="19" y2="3"/>
                    <line x1="12" y1="7" x2="12" y2="21"/>
                    <polyline points="8 11 12 7 16 11"/>
                </svg>`;
            }
            
            items.push(item);
        });
        
        // 4. 如果没有适用的提示词，显示提示
        if (filteredPrompts.length === 0) {
            items.push({ type: 'divider' });
            items.push({
                label: chrome.i18n.getMessage('hsiwhwl'),
                disabled: true,
                icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <circle cx="12" cy="12" r="10"/>
                    <line x1="12" y1="8" x2="12" y2="12"/>
                    <line x1="12" y1="16" x2="12.01" y2="16"/>
                </svg>`
            });
        }
        
        return items;
    }
    
    /**
     * 插入提示词到输入框
     */
    _insertPrompt(prompt) {
        if (!this.inputElement || !prompt.content) {
            return;
        }
        
        try {
            // 获取适配器的插入方法
            if (this.adapter.insertText) {
                this.adapter.insertText(this.inputElement, prompt.content);
            } else {
                // 默认插入逻辑
                this._defaultInsertText(prompt.content);
            }
        } catch (e) {
            console.error('[PromptButton] Failed to insert prompt:', e);
        }
    }
    
    /**
     * 默认的文本插入逻辑
     */
    _defaultInsertText(text) {
        if (!this.inputElement) return;
        
        // 聚焦输入框
        this.inputElement.focus();
        
        // 尝试使用 execCommand（适用于 contenteditable）
        if (this.inputElement.isContentEditable) {
            document.execCommand('insertText', false, text);
        } else {
            // textarea 或 input
            const start = this.inputElement.selectionStart || 0;
            const end = this.inputElement.selectionEnd || 0;
            const value = this.inputElement.value || '';
            
            this.inputElement.value = value.substring(0, start) + text + value.substring(end);
            this.inputElement.selectionStart = this.inputElement.selectionEnd = start + text.length;
            
            // 触发 input 事件
            this.inputElement.dispatchEvent(new Event('input', { bubbles: true }));
        }
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
