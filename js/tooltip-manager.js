/**
 * Global Tooltip Manager - 全局 Tooltip 统一管理器
 * 
 * 负责管理整个扩展的所有 tooltip，解决以下问题：
 * 1. Tooltip 不消失的 bug
 * 2. 多个 tooltip 同时显示
 * 3. 事件丢失导致的残留
 * 4. 滚动时没有隐藏
 * 
 * 特性：
 * - 全局单例模式
 * - 统一生命周期管理
 * - 保险定时器（强制消失）
 * - 全局安全网（滚动/点击/ESC 强制隐藏）
 * - DOM 复用（性能优化）
 */

class GlobalTooltipManager {
    constructor(options = {}) {
        // 状态管理
        this.state = {
            currentId: null,
            currentType: null,
            currentTarget: null,
            isVisible: false,
            isPinned: false  // 鼠标是否在 tooltip 上
        };
        
        // DOM 实例池（按类型复用）
        this.instances = new Map();
        
        // 定时器管理
        this.timers = {
            showDebounce: null,
            hideDelay: null,
            cleanupAnimation: null
        };
        
        // 观察器
        this.targetObserver = null;  // 监听目标元素被删除
        
        // 配置
        this.config = {
            debug: options.debug || false,
            types: {
                node: {
                    maxWidth: 288,
                    showDelay: 80,
                    hideDelay: 100,
                    allowHover: true,
                    className: 'timeline-tooltip',
                    placement: 'auto',
                    gap: 20,
                    // ✅ 可配置的颜色（留空则使用 CSS 默认）
                    backgroundColor: null,  // 例如：'#ffffff' 或 '#0d0d0d'
                    textColor: null,        // 例如：'#1f2937' 或 '#f5f5f5'
                    borderColor: null       // 例如：'#e5e7eb' 或 '#404040'
                },
                button: {
                    maxWidth: 200,
                    showDelay: 0,
                    hideDelay: 0,
                    allowHover: false,
                    className: 'timeline-tooltip-base timeline-tooltip-dark',
                    placement: 'bottom',
                    gap: 12,
                    backgroundColor: null,
                    textColor: null,
                    borderColor: null
                },
                formula: {
                    maxWidth: 250,
                    showDelay: 0,
                    hideDelay: 100,
                    allowHover: false,
                    className: 'formula-tooltip timeline-tooltip-base timeline-tooltip-dark',
                    placement: 'top',
                    gap: 12,
                    backgroundColor: null,
                    textColor: null,
                    borderColor: null
                }
            }
        };
        
        // 绑定方法（确保 this 正确）
        this._onGlobalScroll = this._onGlobalScroll.bind(this);
        this._onGlobalClick = this._onGlobalClick.bind(this);
        this._onGlobalKeydown = this._onGlobalKeydown.bind(this);
        this._onWindowBlur = this._onWindowBlur.bind(this);
        this._onTooltipEnter = this._onTooltipEnter.bind(this);
        this._onTooltipLeave = this._onTooltipLeave.bind(this);
        
        // 初始化
        this._setupGlobalListeners();
    }
    
    /**
     * 显示 tooltip
     * @param {string} id - 唯一标识
     * @param {string} type - 类型：node/button/formula
     * @param {HTMLElement} target - 触发元素
     * @param {Object} content - 内容配置
     * @param {Object} options - 可选配置（覆盖默认）
     */
    show(id, type, target, content, options = {}) {
        try {
            // 参数校验
            if (!this._validateParams(id, type, target, content)) {
                return;
            }
            
            // 去重：如果是同一个 tooltip，忽略
            if (this.state.currentId === id && this.state.isVisible) {
                this._log('Same tooltip already visible, ignoring');
                return;
            }
            
            // 取消所有待处理的定时器
            this._clearAllTimers();
            
            // 如果有其他 tooltip 正在显示，立即隐藏
            if (this.state.isVisible && this.state.currentId !== id) {
                this._hideImmediate();
            }
            
            // 获取配置
            const typeConfig = { ...this.config.types[type], ...options };
            
            // 防抖延迟
            this.timers.showDebounce = setTimeout(() => {
                this.timers.showDebounce = null;
                this._showImmediate(id, type, target, content, typeConfig);
            }, typeConfig.showDelay);
            
        } catch (error) {
            console.error('[TooltipManager] Show failed:', error);
            this.forceHideAll();
        }
    }
    
    /**
     * 隐藏 tooltip
     * @param {boolean} immediate - 是否立即隐藏
     */
    hide(immediate = false) {
        try {
            // 如果鼠标在 tooltip 上（pinned），忽略
            if (this.state.isPinned && !immediate) {
                this._log('Tooltip pinned, ignoring hide');
                return;
            }
            
            if (immediate) {
                this._hideImmediate();
            } else {
                // 延迟隐藏
                const typeConfig = this.config.types[this.state.currentType] || {};
                const delay = typeConfig.hideDelay || 100;
                
                this.timers.hideDelay = this._clearTimer(this.timers.hideDelay);
                this.timers.hideDelay = setTimeout(() => {
                    this.timers.hideDelay = null;
                    this._hideImmediate();
                }, delay);
            }
        } catch (error) {
            console.error('[TooltipManager] Hide failed:', error);
            this._hideImmediate();
        }
    }
    
    /**
     * 强制隐藏所有 tooltip（紧急情况）
     */
    forceHideAll() {
        this._log('Force hide all tooltips');
        this._clearAllTimers();
        this._hideImmediate();
        
        // 额外清理：移除页面上所有可能残留的 tooltip
        this._cleanupOrphanTooltips();
    }
    
    /**
     * 更新内容（不改变位置）
     */
    updateContent(content) {
        if (!this.state.isVisible || !this.state.currentType) return;
        
        const tooltip = this.instances.get(this.state.currentType);
        if (!tooltip) return;
        
        this._setContent(tooltip, content);
    }
    
    /**
     * 检查是否正在显示某个 tooltip
     */
    isShowing(id) {
        return this.state.isVisible && this.state.currentId === id;
    }
    
    /**
     * 销毁管理器
     */
    destroy() {
        this._log('Destroying tooltip manager');
        
        // 清理所有定时器
        this._clearAllTimers();
        
        // 移除全局事件监听
        this._removeGlobalListeners();
        
        // 停止观察
        if (this.targetObserver) {
            this.targetObserver.disconnect();
            this.targetObserver = null;
        }
        
        // 移除所有 tooltip DOM
        this.instances.forEach(tooltip => {
            if (tooltip.parentNode) {
                tooltip.parentNode.removeChild(tooltip);
            }
        });
        this.instances.clear();
        
        // 重置状态
        this.state = {
            currentId: null,
            currentType: null,
            currentTarget: null,
            isVisible: false,
            isPinned: false
        };
    }
    
    // ==================== 内部方法 ====================
    
    /**
     * 立即显示（内部）
     */
    _showImmediate(id, type, target, content, config) {
        this._log('Showing:', { id, type, target, content });
        
        // 再次检查元素是否在 DOM 中
        if (!target.isConnected) {
            this._log('Target disconnected, abort show');
            return;
        }
        
        // 获取或创建 tooltip DOM
        let tooltip = this.instances.get(type);
        if (!tooltip) {
            tooltip = this._createTooltip(type, config);
            this.instances.set(type, tooltip);
        }
        
        // 填充内容
        this._setContent(tooltip, content);
        
        // 临时显示（opacity 0）以获取尺寸
        tooltip.style.visibility = 'hidden';
        tooltip.style.opacity = '0';
        tooltip.classList.add('visible');
        
        // 计算位置（传入配置）
        const position = this._calculatePosition(target, tooltip, config.placement, config);
        
        // 应用位置
        tooltip.style.left = `${position.left}px`;
        tooltip.style.top = `${position.top}px`;
        tooltip.setAttribute('data-placement', position.placement);
        
        // ✅ 应用自定义颜色（如果配置了）
        if (config.backgroundColor) {
            tooltip.style.backgroundColor = config.backgroundColor;
        }
        if (config.textColor) {
            tooltip.style.color = config.textColor;
        }
        if (config.borderColor) {
            tooltip.style.borderColor = config.borderColor;
        }
        
        // 显示动画
        requestAnimationFrame(() => {
            tooltip.style.visibility = '';
            tooltip.style.opacity = '';
            tooltip.setAttribute('aria-hidden', 'false');
        });
        
        // 如果允许 hover，添加 tooltip 事件监听
        if (config.allowHover) {
            tooltip.addEventListener('mouseenter', this._onTooltipEnter);
            tooltip.addEventListener('mouseleave', this._onTooltipLeave);
        }
        
        // 更新状态
        this.state.currentId = id;
        this.state.currentType = type;
        this.state.currentTarget = target;
        this.state.isVisible = true;
        this.state.isPinned = false;
        
        // 监听目标元素被删除
        this._observeTarget(target);
    }
    
    /**
     * 立即隐藏（内部）
     */
    _hideImmediate() {
        if (!this.state.isVisible) return;
        
        this._log('Hiding immediately');
        
        const tooltip = this.instances.get(this.state.currentType);
        if (tooltip) {
            // 移除 visible class 触发隐藏动画
            tooltip.classList.remove('visible');
            tooltip.setAttribute('aria-hidden', 'true');
            tooltip.style.opacity = '';
            tooltip.style.visibility = '';
            
            // 移除事件监听
            tooltip.removeEventListener('mouseenter', this._onTooltipEnter);
            tooltip.removeEventListener('mouseleave', this._onTooltipLeave);
            
            // 等待动画完成后清空内容
            this.timers.cleanupAnimation = setTimeout(() => {
                this.timers.cleanupAnimation = null;
                if (tooltip && !tooltip.classList.contains('visible')) {
                    tooltip.innerHTML = '';
                }
            }, 200);
        }
        
        // 停止观察目标元素
        if (this.targetObserver) {
            this.targetObserver.disconnect();
        }
        
        // 重置状态
        this.state.currentId = null;
        this.state.currentType = null;
        this.state.currentTarget = null;
        this.state.isVisible = false;
        this.state.isPinned = false;
    }
    
    /**
     * 创建 tooltip DOM
     */
    _createTooltip(type, config) {
        const tooltip = document.createElement('div');
        tooltip.className = config.className;
        tooltip.setAttribute('role', 'tooltip');
        tooltip.setAttribute('aria-hidden', 'true');
        tooltip.id = `global-tooltip-${type}`;
        
        // 通用样式
        tooltip.style.position = 'fixed';
        tooltip.style.zIndex = '9999';
        tooltip.style.pointerEvents = config.allowHover ? 'auto' : 'none';
        
        document.body.appendChild(tooltip);
        
        this._log('Created tooltip DOM for type:', type);
        return tooltip;
    }
    
    /**
     * 设置内容
     */
    _setContent(tooltip, content) {
        // 清空现有内容（重要：先清空，避免事件监听器残留）
        tooltip.innerHTML = '';
        
        if (typeof content === 'string') {
            tooltip.textContent = content;
        } else if (content.html) {
            tooltip.innerHTML = content.html;
        } else if (content.element && content.element instanceof HTMLElement) {
            // ✅ 支持 DOM 元素（保留事件监听器）
            tooltip.appendChild(content.element);
        } else {
            // 默认当作文本
            tooltip.textContent = String(content);
        }
    }
    
    /**
     * 计算位置
     */
    _calculatePosition(target, tooltip, preferredPlacement, config) {
        const targetRect = target.getBoundingClientRect();
        const tooltipRect = tooltip.getBoundingClientRect();
        const viewport = {
            width: window.innerWidth,
            height: window.innerHeight
        };
        
        // 如果是 auto，智能选择位置
        let placement = preferredPlacement;
        if (placement === 'auto') {
            placement = this._chooseBestPlacement(targetRect, tooltipRect, viewport);
        }
        
        // 计算基础位置（传入配置）
        let position = this._computePositionForPlacement(targetRect, tooltipRect, placement, config);
        
        // 边界修正
        position = this._clampToBounds(position, tooltipRect, viewport);
        
        return {
            left: position.left,
            top: position.top,
            placement: placement
        };
    }
    
    /**
     * 智能选择最佳位置
     */
    _chooseBestPlacement(targetRect, tooltipRect, viewport) {
        const space = {
            left: targetRect.left,
            right: viewport.width - targetRect.right,
            top: targetRect.top,
            bottom: viewport.height - targetRect.bottom
        };
        
        const padding = 20;
        
        // 优先级：左 > 右 > 上 > 下
        if (space.left >= tooltipRect.width + padding) return 'left';
        if (space.right >= tooltipRect.width + padding) return 'right';
        if (space.top >= tooltipRect.height + padding) return 'top';
        return 'bottom';
    }
    
    /**
     * 根据位置计算坐标
     */
    _computePositionForPlacement(targetRect, tooltipRect, placement, config) {
        // ✅ 从配置中获取间距，默认 12px
        const gap = config.gap || 12;
        
        let left, top;
        
        switch (placement) {
            case 'left':
                left = targetRect.left - tooltipRect.width - gap;
                top = targetRect.top + (targetRect.height - tooltipRect.height) / 2;
                break;
            case 'right':
                left = targetRect.right + gap;
                top = targetRect.top + (targetRect.height - tooltipRect.height) / 2;
                break;
            case 'top':
                left = targetRect.left + (targetRect.width - tooltipRect.width) / 2;
                top = targetRect.top - tooltipRect.height - gap;
                break;
            case 'bottom':
                left = targetRect.left + (targetRect.width - tooltipRect.width) / 2;
                top = targetRect.bottom + gap;
                break;
            default:
                left = targetRect.right + gap;
                top = targetRect.top;
        }
        
        return { left: Math.round(left), top: Math.round(top) };
    }
    
    /**
     * 边界修正
     */
    _clampToBounds(position, tooltipRect, viewport) {
        const padding = 8;
        
        // 左右边界
        if (position.left < padding) {
            position.left = padding;
        } else if (position.left + tooltipRect.width > viewport.width - padding) {
            position.left = viewport.width - tooltipRect.width - padding;
        }
        
        // 上下边界
        if (position.top < padding) {
            position.top = padding;
        } else if (position.top + tooltipRect.height > viewport.height - padding) {
            position.top = viewport.height - tooltipRect.height - padding;
        }
        
        return position;
    }
    
    /**
     * 监听目标元素被删除
     */
    _observeTarget(target) {
        if (this.targetObserver) {
            this.targetObserver.disconnect();
        }
        
        this.targetObserver = new MutationObserver((mutations) => {
            // 检查目标元素是否还在 DOM 中
            if (!target.isConnected) {
                this._log('Target removed from DOM, hiding tooltip');
                this.forceHideAll();
            }
        });
        
        // 监听目标元素的父节点
        if (target.parentNode) {
            this.targetObserver.observe(target.parentNode, {
                childList: true,
                subtree: false
            });
        }
    }
    
    /**
     * 参数校验
     */
    _validateParams(id, type, target, content) {
        if (!id) {
            console.error('[TooltipManager] Missing id');
            return false;
        }
        
        if (!type || !this.config.types[type]) {
            console.error('[TooltipManager] Invalid type:', type);
            return false;
        }
        
        if (!target || !(target instanceof HTMLElement)) {
            console.error('[TooltipManager] Invalid target');
            return false;
        }
        
        if (!target.isConnected) {
            console.warn('[TooltipManager] Target not in DOM');
            return false;
        }
        
        if (!content) {
            console.error('[TooltipManager] Missing content');
            return false;
        }
        
        return true;
    }
    
    /**
     * 清理所有定时器
     */
    _clearAllTimers() {
        Object.keys(this.timers).forEach(key => {
            this.timers[key] = this._clearTimer(this.timers[key]);
        });
    }
    
    /**
     * 清理单个定时器
     */
    _clearTimer(timer) {
        if (timer !== null && timer !== undefined) {
            clearTimeout(timer);
        }
        return null;
    }
    
    /**
     * 清理孤儿 tooltip（DOM 中残留的）
     */
    _cleanupOrphanTooltips() {
        try {
            // 清理旧版本可能残留的 tooltip
            const selectors = [
                '.timeline-starred-btn-tooltip',
                '.timeline-tooltip:not([id^="global-tooltip"])',
                '.formula-tooltip:not([id^="global-tooltip"])'
            ];
            
            selectors.forEach(selector => {
                document.querySelectorAll(selector).forEach(el => {
                    if (el.parentNode) {
                        el.parentNode.removeChild(el);
                    }
                });
            });
        } catch (error) {
            console.error('[TooltipManager] Cleanup orphans failed:', error);
        }
    }
    
    // ==================== 全局事件处理 ====================
    
    /**
     * 设置全局监听器
     */
    _setupGlobalListeners() {
        // 滚动时强制隐藏（capture 阶段，捕获所有滚动）
        document.addEventListener('scroll', this._onGlobalScroll, true);
        
        // 点击时隐藏（除非点击的是 tooltip 相关元素）
        document.addEventListener('click', this._onGlobalClick, true);
        
        // ESC 键隐藏
        document.addEventListener('keydown', this._onGlobalKeydown);
        
        // 窗口失焦时隐藏
        window.addEventListener('blur', this._onWindowBlur);
        
        this._log('Global listeners setup complete');
    }
    
    /**
     * 移除全局监听器
     */
    _removeGlobalListeners() {
        document.removeEventListener('scroll', this._onGlobalScroll, true);
        document.removeEventListener('click', this._onGlobalClick, true);
        document.removeEventListener('keydown', this._onGlobalKeydown);
        window.removeEventListener('blur', this._onWindowBlur);
    }
    
    /**
     * 全局滚动事件
     */
    _onGlobalScroll() {
        if (this.state.isVisible) {
            this._log('Global scroll detected, hiding tooltip');
            this.forceHideAll();
        }
    }
    
    /**
     * 全局点击事件
     */
    _onGlobalClick(e) {
        if (!this.state.isVisible) return;
        
        // 检查是否点击的是 tooltip 或触发元素
        const clickedTooltip = e.target.closest('[id^="global-tooltip"]');
        const clickedTarget = this.state.currentTarget && 
                              (e.target === this.state.currentTarget || 
                               this.state.currentTarget.contains(e.target));
        
        if (!clickedTooltip && !clickedTarget) {
            this._log('Click outside tooltip, hiding');
            this.hide(true);
        }
    }
    
    /**
     * 全局键盘事件
     */
    _onGlobalKeydown(e) {
        if (e.key === 'Escape' && this.state.isVisible) {
            this._log('ESC pressed, hiding tooltip');
            this.forceHideAll();
        }
    }
    
    /**
     * 窗口失焦事件
     */
    _onWindowBlur() {
        if (this.state.isVisible) {
            this._log('Window blur, hiding tooltip');
            this.forceHideAll();
        }
    }
    
    /**
     * Tooltip 自身鼠标进入
     */
    _onTooltipEnter() {
        this._log('Mouse entered tooltip, pinning');
        this.state.isPinned = true;
        
        // 取消隐藏定时器
        this.timers.hideDelay = this._clearTimer(this.timers.hideDelay);
    }
    
    /**
     * Tooltip 自身鼠标离开
     */
    _onTooltipLeave(e) {
        this._log('Mouse left tooltip');
        this.state.isPinned = false;
        
        // 检查是否移回触发元素
        const movedToTarget = this.state.currentTarget && 
                              (e.relatedTarget === this.state.currentTarget ||
                               this.state.currentTarget.contains(e.relatedTarget));
        
        if (!movedToTarget) {
            this.hide();
        }
    }
    
    /**
     * 调试日志
     */
    _log(...args) {
        if (this.config.debug) {
            console.log('[TooltipManager]', ...args);
        }
    }
}

// ==================== 全局单例初始化 ====================

// 创建全局实例（只在第一次加载时）
if (typeof window.globalTooltipManager === 'undefined') {
    window.globalTooltipManager = new GlobalTooltipManager({
        debug: false  // 生产环境关闭，调试时可设为 true
    });
}

