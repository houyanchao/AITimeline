/**
 * Global Toast Manager - 全局 Toast 统一管理器
 * 
 * 负责管理整个扩展的所有 toast 提示，提供统一的用户反馈
 * 
 * 特性：
 * - 全局单例模式
 * - 支持多种类型（success/error/info/warning）
 * - 队列管理（多个 toast 优雅堆叠）
 * - 完全可配置（颜色、位置、时长、图标）
 * - 自动清理（定时消失）
 * - 相对定位或固定定位
 */

class GlobalToastManager {
    constructor(options = {}) {
        // 当前显示的 toast 队列
        this.queue = [];
        
        // 配置
        this.config = {
            debug: options.debug || false,
            maxVisible: 3,       // 最多同时显示3个
            stackGap: 10,        // 堆叠间距
            centerGap: 60,       // 屏幕中央堆叠的起始位置
            types: {
                success: {
                    backgroundColor: '#ffffff',
                    textColor: '#1f2937',
                    borderColor: '#e5e7eb',
                    icon: '✓',
                    duration: 1000,
                    position: 'top',  // 相对元素：top/bottom/center
                    gap: 10           // 与目标元素的距离
                },
                error: {
                    backgroundColor: '#ef4444',
                    textColor: '#ffffff',
                    borderColor: '#ef4444',
                    icon: '⚠',
                    duration: 1500,
                    position: 'top',
                    gap: 10
                },
                info: {
                    backgroundColor: '#3b82f6',
                    textColor: '#ffffff',
                    borderColor: '#3b82f6',
                    icon: 'ℹ',
                    duration: 2000,
                    position: 'top',
                    gap: 10
                },
                warning: {
                    backgroundColor: '#f59e0b',
                    textColor: '#ffffff',
                    borderColor: '#f59e0b',
                    icon: '⚡',
                    duration: 2000,
                    position: 'top',
                    gap: 10
                }
            }
        };
        
        this._log('Toast manager initialized');
    }
    
    /**
     * 显示 toast（通用方法）
     * @param {string} type - 类型：success/error/info/warning
     * @param {string} message - 消息文本
     * @param {Object} options - 可选配置
     * @param {HTMLElement} options.target - 目标元素（相对定位）
     * @param {number} options.duration - 显示时长（覆盖默认）
     * @param {string} options.position - 位置（覆盖默认）
     * @param {string} options.backgroundColor - 背景色
     * @param {string} options.textColor - 文字色
     * @param {string} options.borderColor - 边框色
     * @param {string} options.icon - 图标
     */
    show(type, message, options = {}) {
        try {
            // 参数校验
            if (!type || !this.config.types[type]) {
                console.error('[ToastManager] Invalid type:', type);
                return;
            }
            
            if (!message) {
                console.error('[ToastManager] Missing message');
                return;
            }
            
            // 合并配置
            const typeConfig = this.config.types[type];
            const finalConfig = { ...typeConfig, ...options };
            
            // 创建 toast 实例
            const toastInstance = this._createToast(message, finalConfig);
            
            // 添加到队列
            this.queue.push(toastInstance);
            
            // 更新所有 toast 位置
            this._updatePositions();
            
            // 限制队列长度
            if (this.queue.length > this.config.maxVisible) {
                const removed = this.queue.shift();
                this._hideToast(removed, true);
            }
            
            // 显示动画
            requestAnimationFrame(() => {
                toastInstance.element.classList.add('visible');
            });
            
            // 自动隐藏
            toastInstance.timer = setTimeout(() => {
                this._removeFromQueue(toastInstance);
            }, finalConfig.duration);
            
            this._log('Toast shown:', { type, message, config: finalConfig });
            
        } catch (error) {
            console.error('[ToastManager] Show failed:', error);
        }
    }
    
    /**
     * 快捷方法：成功提示
     */
    success(message, target = null, options = {}) {
        this.show('success', message, { target, ...options });
    }
    
    /**
     * 快捷方法：错误提示
     */
    error(message, target = null, options = {}) {
        this.show('error', message, { target, ...options });
    }
    
    /**
     * 快捷方法：信息提示
     */
    info(message, target = null, options = {}) {
        this.show('info', message, { target, ...options });
    }
    
    /**
     * 快捷方法：警告提示
     */
    warning(message, target = null, options = {}) {
        this.show('warning', message, { target, ...options });
    }
    
    /**
     * 强制隐藏所有 toast
     */
    forceHideAll() {
        this._log('Force hide all toasts');
        
        // 复制队列（避免在遍历时修改）
        const toasts = [...this.queue];
        
        toasts.forEach(toast => {
            this._removeFromQueue(toast, true);
        });
    }
    
    /**
     * 销毁管理器
     */
    destroy() {
        this._log('Destroying toast manager');
        this.forceHideAll();
    }
    
    // ==================== 内部方法 ====================
    
    /**
     * 创建 toast 实例
     */
    _createToast(message, config) {
        // 创建 DOM
        const element = document.createElement('div');
        element.className = 'global-toast';
        
        // 基础样式
        element.style.cssText = `
            position: fixed;
            display: flex;
            align-items: center;
            gap: 8px;
            padding: 10px 16px;
            border-radius: 12px;
            font-size: 13px;
            font-weight: 500;
            box-shadow: 0 4px 14px rgba(0, 0, 0, 0.15), 0 1px 2px rgba(0, 0, 0, 0.06);
            z-index: 2147483647;
            pointer-events: none;
            opacity: 0;
            transition: opacity 0.15s ease, transform 0.15s ease;
            transform: translateY(-10px);
            white-space: nowrap;
            max-width: 400px;
        `;
        
        // 应用配置的颜色
        if (config.backgroundColor) {
            element.style.backgroundColor = config.backgroundColor;
        }
        if (config.textColor) {
            element.style.color = config.textColor;
        }
        if (config.borderColor) {
            element.style.border = `1px solid ${config.borderColor}`;
        }
        
        // 添加图标（如果有）
        if (config.icon) {
            const iconSpan = document.createElement('span');
            iconSpan.style.fontSize = '16px';
            iconSpan.textContent = config.icon;
            element.appendChild(iconSpan);
        }
        
        // 添加消息文本
        const textSpan = document.createElement('span');
        textSpan.textContent = message;
        element.appendChild(textSpan);
        
        // 添加到 body
        document.body.appendChild(element);
        
        // 返回实例对象
        return {
            element: element,
            config: config,
            timer: null,
            id: Date.now() + Math.random()
        };
    }
    
    /**
     * 更新所有 toast 的位置
     */
    _updatePositions() {
        const centerToasts = this.queue.filter(t => !t.config.target);
        const relativeToasts = this.queue.filter(t => t.config.target);
        
        // 处理屏幕中央的 toast（堆叠）
        centerToasts.forEach((toast, index) => {
            const element = toast.element;
            const rect = element.getBoundingClientRect();
            
            // 从上往下堆叠
            const top = this.config.centerGap + index * (rect.height + this.config.stackGap);
            const left = (window.innerWidth - rect.width) / 2;
            
            element.style.left = `${left}px`;
            element.style.top = `${top}px`;
        });
        
        // 处理相对元素定位的 toast
        relativeToasts.forEach((toast) => {
            const target = toast.config.target;
            
            // 检查元素是否还在 DOM 中
            if (!target || !target.isConnected) {
                this._removeFromQueue(toast, true);
                return;
            }
            
            const element = toast.element;
            const targetRect = target.getBoundingClientRect();
            const toastRect = element.getBoundingClientRect();
            const gap = toast.config.gap || 10;
            
            let x, y;
            
            switch (toast.config.position) {
                case 'top':
                    x = targetRect.left + (targetRect.width - toastRect.width) / 2;
                    y = targetRect.top - toastRect.height - gap;
                    break;
                case 'bottom':
                    x = targetRect.left + (targetRect.width - toastRect.width) / 2;
                    y = targetRect.bottom + gap;
                    break;
                case 'left':
                    x = targetRect.left - toastRect.width - gap;
                    y = targetRect.top + (targetRect.height - toastRect.height) / 2;
                    break;
                case 'right':
                    x = targetRect.right + gap;
                    y = targetRect.top + (targetRect.height - toastRect.height) / 2;
                    break;
                default:
                    x = targetRect.left + (targetRect.width - toastRect.width) / 2;
                    y = targetRect.top - toastRect.height - gap;
            }
            
            // 边界检测
            const padding = 8;
            x = Math.max(padding, Math.min(x, window.innerWidth - toastRect.width - padding));
            y = Math.max(padding, Math.min(y, window.innerHeight - toastRect.height - padding));
            
            element.style.left = `${x}px`;
            element.style.top = `${y}px`;
        });
    }
    
    /**
     * 从队列中移除 toast
     */
    _removeFromQueue(toastInstance, immediate = false) {
        const index = this.queue.indexOf(toastInstance);
        if (index === -1) return;
        
        // 清除定时器
        if (toastInstance.timer) {
            clearTimeout(toastInstance.timer);
            toastInstance.timer = null;
        }
        
        // 从队列移除
        this.queue.splice(index, 1);
        
        // 隐藏
        this._hideToast(toastInstance, immediate);
        
        // 更新其他 toast 位置
        this._updatePositions();
        
        this._log('Toast removed from queue');
    }
    
    /**
     * 隐藏 toast
     */
    _hideToast(toastInstance, immediate = false) {
        const element = toastInstance.element;
        
        if (immediate) {
            // 立即移除
            if (element.parentNode) {
                element.parentNode.removeChild(element);
            }
        } else {
            // 隐藏动画
            element.classList.remove('visible');
            element.style.opacity = '0';
            element.style.transform = 'translateY(-10px)';
            
            // 等待动画完成后移除
            setTimeout(() => {
                if (element.parentNode) {
                    element.parentNode.removeChild(element);
                }
            }, 200);
        }
    }
    
    /**
     * 调试日志
     */
    _log(...args) {
        if (this.config.debug) {
            console.log('[ToastManager]', ...args);
        }
    }
}

// ==================== CSS 样式注入 ====================

// 动态注入 toast 样式（避免污染全局 CSS）
if (!document.getElementById('global-toast-styles')) {
    const style = document.createElement('style');
    style.id = 'global-toast-styles';
    style.textContent = `
        .global-toast {
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
        }
        
        .global-toast.visible {
            opacity: 1 !important;
            transform: translateY(0) !important;
        }
    `;
    document.head.appendChild(style);
}

// ==================== 全局单例初始化 ====================

// 创建全局实例（只在第一次加载时）
if (typeof window.globalToastManager === 'undefined') {
    window.globalToastManager = new GlobalToastManager({
        debug: false  // 生产环境关闭，调试时可设为 true
    });
}

