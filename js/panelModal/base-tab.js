/**
 * BaseTab - Tab 基类（增强版）
 * 提供自动状态管理机制，彻底解决状态持久化问题
 * 
 * @author AIChatTimeline
 * @version 2.0
 * @since 2025-11-15
 * 
 * 核心特性：
 * - 自动状态管理（临时状态 vs 持久状态）
 * - 自动清理 DOM 引用
 * - 自动管理事件监听器
 * - 声明式配置，减少手动清理代码
 */

class BaseTab {
    constructor() {
        /**
         * Tab 唯一标识
         * @type {string}
         */
        this.id = '';
        
        /**
         * Tab 显示名称（用于 tooltip）
         * @type {string}
         */
        this.name = '';
        
        /**
         * Tab 图标（emoji 或 SVG）
         * @type {string}
         */
        this.icon = '';
        
        // 🔑 核心机制：自动状态管理
        this._transientState = {};   // 临时状态（unmounted 时自动清除）
        this._persistentState = {};  // 持久状态（保留跨会话）
        this._persistentStateInitialized = false;  // 标记持久状态是否已初始化
        this._domRefs = {};          // DOM 引用（unmounted 时自动清除）
        this._listeners = [];        // 事件监听器（unmounted 时自动清除）
    }
    
    /**
     * 定义初始状态（子类可选覆盖）
     * 
     * @returns {Object} 初始状态配置
     * @example
     * getInitialState() {
     *     return {
     *         transient: {
     *             searchQuery: '',  // 临时状态：每次打开都重置
     *             isLoading: false
     *         },
     *         persistent: {
     *             folderStates: {},  // 持久状态：保留用户偏好
     *             sortOrder: 'asc'
     *         }
     *     };
     * }
     */
    getInitialState() {
        return {
            transient: {},   // 临时状态：每次打开都重置
            persistent: {}   // 持久状态：保留用户偏好
        };
    }
    
    /**
     * 初始化状态（内部调用，子类不应覆盖）
     * @private
     */
    _initializeState() {
        const initialState = this.getInitialState();
        
        // 初始化临时状态（每次都重置）
        this._transientState = { ...initialState.transient };
        
        // 初始化持久状态（只在第一次）
        if (!this._persistentStateInitialized) {
            this._persistentState = { ...initialState.persistent };
            this._persistentStateInitialized = true;
        }
    }
    
    /**
     * 获取临时状态
     * @param {string} key - 状态键
     * @returns {*} 状态值
     */
    getState(key) {
        return this._transientState[key];
    }
    
    /**
     * 设置临时状态
     * @param {string} key - 状态键
     * @param {*} value - 状态值
     */
    setState(key, value) {
        this._transientState[key] = value;
    }
    
    /**
     * 获取持久状态
     * @param {string} key - 状态键
     * @returns {*} 状态值
     */
    getPersistentState(key) {
        return this._persistentState[key];
    }
    
    /**
     * 设置持久状态
     * @param {string} key - 状态键
     * @param {*} value - 状态值
     */
    setPersistentState(key, value) {
        this._persistentState[key] = value;
    }
    
    /**
     * 保存 DOM 引用
     * @param {string} key - 引用键
     * @param {HTMLElement} element - DOM 元素
     */
    setDomRef(key, element) {
        this._domRefs[key] = element;
    }
    
    /**
     * 获取 DOM 引用
     * @param {string} key - 引用键
     * @returns {HTMLElement|null} DOM 元素
     */
    getDomRef(key) {
        return this._domRefs[key];
    }
    
    /**
     * 添加事件监听器（自动管理，unmounted 时自动移除）
     * @param {HTMLElement} element - DOM 元素
     * @param {string} event - 事件名
     * @param {Function} handler - 处理函数
     * @param {Object} options - 事件选项
     * 
     * @example
     * this.addEventListener(button, 'click', () => {
     *     console.log('clicked');
     * });
     */
    addEventListener(element, event, handler, options = {}) {
        element.addEventListener(event, handler, options);
        this._listeners.push({ element, event, handler, options });
    }
    
    /**
     * 添加 Storage 监听器（自动管理，unmounted 时自动移除）
     * @param {Function} handler - 处理函数
     * 
     * @example
     * this.addStorageListener((changes) => {
     *     if (changes.starredTurns) {
     *         this.updateList();
     *     }
     * });
     */
    addStorageListener(handler) {
        if (window.StorageAdapter) {
            window.StorageAdapter.addChangeListener(handler);
            this._listeners.push({ type: 'storage', handler });
        }
    }
    
    /**
     * 渲染 tab 内容（子类必须实现）
     * @returns {HTMLElement} 返回要显示的 DOM 元素
     */
    render() {
        throw new Error('子类必须实现 render() 方法');
    }
    
    /**
     * Tab 被激活时调用（子类可选覆盖）
     * ⚠️ 如果覆盖，必须先调用 super.mounted()
     * 
     * @example
     * mounted() {
     *     super.mounted();  // ✅ 必须先调用
     *     this.loadData();
     * }
     */
    mounted() {
        // 初始化状态
        this._initializeState();
    }
    
    /**
     * Tab 被卸载时调用（子类可选覆盖）
     * ⚠️ 如果覆盖，必须调用 super.unmounted()
     * 
     * @example
     * unmounted() {
     *     this.saveData();
     *     super.unmounted();  // ✅ 必须调用
     * }
     */
    unmounted() {
        // 1. 自动清理所有事件监听器
        this._listeners.forEach(listener => {
            if (listener.type === 'storage' && window.StorageAdapter) {
                window.StorageAdapter.removeChangeListener(listener.handler);
            } else if (listener.element) {
                listener.element.removeEventListener(
                    listener.event, 
                    listener.handler, 
                    listener.options
                );
            }
        });
        this._listeners = [];
        
        // 2. 自动清除所有 DOM 引用
        this._domRefs = {};
        
        // 3. 自动重置所有临时状态
        this._transientState = {};
        
        // 4. 隐藏 tooltip
        if (window.globalTooltipManager) {
            window.globalTooltipManager.hide();
        }
        
        // 注意：不清除 _persistentState，保留用户偏好
        
        console.log(`[BaseTab] ${this.id} cleaned:`, {
            listenersCleared: this._listeners.length === 0,
            domRefsCleared: Object.keys(this._domRefs).length === 0,
            transientStateCleared: Object.keys(this._transientState).length === 0,
            persistentStateRetained: Object.keys(this._persistentState).length
        });
    }
}

