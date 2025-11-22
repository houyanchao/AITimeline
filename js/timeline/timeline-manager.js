/**
 * Timeline Manager - Core Class
 * 
 * This is the heart of the timeline extension
 * Manages all UI, interactions, virtualization, and state
 * 
 * Responsibilities:
 * - Timeline UI injection and management
 * - Marker calculation and rendering
 * - Event handling (click, hover, long-press)
 * - Scroll synchronization
 * - Tooltip management
 * - Star/highlight persistence
 * - Virtual rendering for performance
 */

class TimelineManager {
    constructor(adapter) {
        if (!adapter) {
            throw new Error('TimelineManager requires a SiteAdapter');
        }
        this.adapter = adapter;
        this.scrollContainer = null;
        this.conversationContainer = null;
        this.markers = [];
        this.activeTurnId = null;
        this.ui = { timelineBar: null, tooltip: null, track: null, trackContent: null };
        
        // ✅ 用于跟踪节点变化，避免不必要的重新计算
        this.lastNodeCount = 0;
        this.lastNodeIds = new Set();

        this.mutationObserver = null;
        this.resizeObserver = null;
        this.intersectionObserver = null;
        this.hideStateObserver = null; // ✅ 监听需要隐藏时间轴的元素
        this.visibleUserTurns = new Set();
        
        // Event handlers
        this.onTimelineBarClick = null;
        this.onScroll = null;
        this.onTimelineBarOver = null;
        this.onTimelineBarOut = null;
        this.onTimelineBarFocusIn = null;
        this.onTimelineBarFocusOut = null;
        // ✅ 移除：tooltip hover 事件由 GlobalTooltipManager 管理
        this.onWindowResize = null;
        this.onTimelineWheel = null;
        this.onStorage = null;
        this.onVisualViewportResize = null;
        // ✅ 长按相关事件处理器
        this.startLongPress = null;
        this.checkLongPressMove = null;
        this.cancelLongPress = null;
        // ✅ 键盘导航
        this.onKeyDown = null;
        // ✅ 键盘导航功能启用状态（内存缓存，默认开启）
        this.arrowKeysNavigationEnabled = true;
        // ✅ 平台设置（内存缓存）
        this.platformSettings = {};
        // Timers and RAF IDs
        this.scrollRafId = null;
        this.activeChangeTimer = null;
        // ✅ 移除：tooltipHideTimer 由 GlobalTooltipManager 管理
        this.showRafId = null;
        this.resizeIdleTimer = null;
        this.resizeIdleRICId = null;
        this.zeroTurnsTimer = null;

        // Active state management
        this.lastActiveChangeTime = 0;
        this.pendingActiveId = null;
        
        // Tooltip and measurement
        this.measureEl = null;
        this.truncateCache = new Map();
        this.measureCanvas = null;
        this.measureCtx = null;
        
        // ✅ 优化：Tooltip 配置缓存（避免频繁读取 CSS 变量）
        this.tooltipConfigCache = null;
        
        // ✅ 优化：Tooltip 更新防抖（快速移动时避免闪烁）
        this.tooltipUpdateDebounceTimer = null;

        // Long-canvas scrollable track (Linked mode)
        this.scale = 1;
        this.contentHeight = 0;
        this.yPositions = [];
        this.visibleRange = { start: 0, end: -1 };
        this.firstUserTurnOffset = 0;
        this.contentSpanPx = 1;
        this.usePixelTop = false;
        this._cssVarTopSupported = null;

        // Markers and rendering
        this.markersVersion = 0;

        // Performance debugging
        this.debugPerf = false;
        try { this.debugPerf = (localStorage.getItem('chatgptTimelineDebugPerf') === '1'); } catch {}
        
        this.debouncedRecalculateAndRender = this.debounce(this.recalculateAndRenderMarkers, TIMELINE_CONFIG.DEBOUNCE_DELAY);

        // Star/Highlight feature state
        this.starred = new Set();
        this.markerMap = new Map();
        this.conversationId = this.adapter.extractConversationId(location.pathname);
        // 临时存储加载的收藏 index（在 markers 创建前）
        this.starredIndexes = new Set();
        
        // ✅ Pin（标记）功能状态
        this.pinned = new Set();
        this.pinnedIndexes = new Set();
        
        // ✅ URL 到网站信息的映射字典（包含名称和 logo）
        // 使用 constants.js 中的函数生成 siteNameMap
        this.siteNameMap = getSiteNameMap();
        
        // ✅ 文件夹管理器（用于收藏功能）
        this.folderManager = null;
        // 延迟初始化，确保 FolderManager 类已加载
        setTimeout(() => {
            if (typeof FolderManager !== 'undefined') {
                this.folderManager = new FolderManager(StorageAdapter);
            }
        }, 0);

        // ✅ 健康检查定时器
        this.healthCheckInterval = null;
    }

    perfStart(name) {
        if (!this.debugPerf) return;
        try { performance.mark(`tg-${name}-start`); } catch {}
    }

    perfEnd(name) {
        if (!this.debugPerf) return;
        try {
            performance.mark(`tg-${name}-end`);
            performance.measure(`tg-${name}`, `tg-${name}-start`, `tg-${name}-end`);
        } catch {}
    }

    async init() {
        const elementsFound = await this.findCriticalElements();
        if (!elementsFound) return;
        
        // ✅ 同步深色模式状态到 html 元素
        this.syncDarkModeClass();
        
        this.injectTimelineUI();
        this.setupEventListeners();
        this.setupObservers();
        // Load persisted star markers for current conversation
        this.conversationId = this.adapter.extractConversationId(location.pathname);
        await this.loadStars();
        // ✅ 加载标记数据
        await this.loadPins();
        // ✅ 加载键盘导航功能状态
        await this.loadArrowKeysNavigationState();
        // ✅ 加载平台设置
        await this.loadPlatformSettings();
        
        // Trigger initial rendering after a short delay to ensure DOM is stable
        // This fixes the bug where nodes don't appear until scroll
        setTimeout(async () => {
            this.recalculateAndRenderMarkers();
            // 初始化后手动触发一次滚动同步，确保激活状态正确
            this.scheduleScrollSync();
            
            // ✅ 等待时间轴渲染完成后，再显示收藏按钮
            // 使用双重 requestAnimationFrame 确保浏览器完成绘制
            requestAnimationFrame(() => {
                requestAnimationFrame(async () => {
                    // 此时浏览器已经完成时间轴的渲染
                    await this.updateStarredBtnVisibility();
                });
            });
            
            // ✅ 启动健康检查
            this.startHealthCheck();
        }, TIMELINE_CONFIG.INITIAL_RENDER_DELAY);
    }
    
    async findCriticalElements() {
        const selector = this.adapter.getUserMessageSelector();
        const firstTurn = await this.waitForElement(selector);
        if (!firstTurn) return false;
        
        this.conversationContainer = this.adapter.findConversationContainer(firstTurn);
        if (!this.conversationContainer) return false;

        let parent = this.conversationContainer;
        while (parent && parent !== document.body) {
            const style = window.getComputedStyle(parent);
            const overflowY = style.overflowY;
            if (overflowY === 'auto' || overflowY === 'scroll') {
                this.scrollContainer = parent;
                break;
            }
            parent = parent.parentElement;
        }
        
        // 如果没找到滚动容器，使用 document 作为备用（通用方案）
        if (!this.scrollContainer) {
            this.scrollContainer = document.scrollingElement || document.documentElement || document.body;
        }
        
        return this.scrollContainer !== null;
    }
    
    injectTimelineUI() {
        // ✅ 创建或获取包装容器
        let wrapper = document.querySelector('.chat-timeline-wrapper');
        if (!wrapper) {
            wrapper = document.createElement('div');
            wrapper.className = 'chat-timeline-wrapper';
            document.body.appendChild(wrapper);
        }
        this.ui.wrapper = wrapper;
        
        // Idempotent: ensure bar exists, then ensure track + content exist
        let timelineBar = wrapper.querySelector('.chat-timeline-bar');
        if (!timelineBar) {
            timelineBar = document.createElement('div');
            timelineBar.className = 'chat-timeline-bar';
            wrapper.appendChild(timelineBar);
        }
        this.ui.timelineBar = timelineBar;
        
        // Apply site-specific position from adapter to wrapper
        const position = this.adapter.getTimelinePosition();
        if (position) {
            if (position.top) wrapper.style.top = position.top;
            
            // ✅ 支持左右两侧定位
            if (position.right) {
                wrapper.style.right = position.right;
                wrapper.style.left = 'auto'; // 清除可能存在的 left 样式
            } else if (position.left) {
                wrapper.style.left = position.left;
                wrapper.style.right = 'auto'; // 清除可能存在的 right 样式
            }
            
            if (position.bottom) {
                // ✅ 修复：确保高度至少为 200px，避免窗口太小导致时间轴高度为 0
                // 使用 max() 函数确保即使 calc 结果为负数，也会有最小高度
                timelineBar.style.height = `max(200px, calc(100vh - ${position.top} - ${position.bottom}))`;
            }
        }
        // Track + content
        let track = this.ui.timelineBar.querySelector('.timeline-track');
        if (!track) {
            track = document.createElement('div');
            track.className = 'timeline-track';
            this.ui.timelineBar.appendChild(track);
        }
        let trackContent = track.querySelector('.timeline-track-content');
        if (!trackContent) {
            trackContent = document.createElement('div');
            trackContent.className = 'timeline-track-content';
            track.appendChild(trackContent);
        }
        this.ui.track = track;
        this.ui.trackContent = trackContent;
        
        // ✅ 重新设计：测量元素应该模拟内容区的样式
        if (!this.measureEl) {
            const m = document.createElement('div');
            m.setAttribute('aria-hidden', 'true');
            m.style.position = 'fixed';
            m.style.left = '-9999px';
            m.style.top = '0px';
            m.style.visibility = 'hidden';
            m.style.pointerEvents = 'none';
            
            // ✅ 关键：模拟 tooltip 内容区的样式（使用固定值）
            Object.assign(m.style, {
                fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
                fontSize: '13px',
                lineHeight: '18px',
                // ✅ 内容区的 padding（重要！）
                padding: '10px 12px',
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-word',
                maxWidth: 'none',
                display: 'block',
            });
            
            document.body.appendChild(m);
            this.measureEl = m;
        }
        // Create canvas for text layout based truncation (primary)
        if (!this.measureCanvas) {
            this.measureCanvas = document.createElement('canvas');
            this.measureCtx = this.measureCanvas.getContext('2d');
        }
        
        // ✅ 优化：延迟到下一帧缓存 CSS 变量（确保样式已应用）
        requestAnimationFrame(() => {
            this.cacheTooltipConfig();
        });
        
        // ✅ 添加收藏按钮（在 timeline-bar 下方 10px 处，垂直居中对齐）
        let starredBtn = document.querySelector('.timeline-starred-btn');
        if (!starredBtn) {
            starredBtn = document.createElement('button');
            starredBtn.className = 'timeline-starred-btn';
            starredBtn.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="-1 -1 26 26"><path fill="rgb(255, 125, 3)" stroke="rgb(255, 125, 3)" stroke-width="0.5" d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>';
            starredBtn.setAttribute('aria-label', chrome.i18n.getMessage('hkjvnr'));
            // ✅ 初始状态：隐藏，等时间轴渲染完成后再显示
            starredBtn.style.display = 'none';
            
            // 鼠标悬停事件 - 使用全局 Tooltip 管理器
            starredBtn.addEventListener('mouseenter', async () => {
                window.globalTooltipManager.show(
                    'starred-btn',
                    'button',
                    starredBtn,
                    chrome.i18n.getMessage('vnkxpm'),
                    { placement: 'left' }
                );
            });
            
            starredBtn.addEventListener('mouseleave', () => {
                window.globalTooltipManager.hide();
            });
            
            // ✅ 将收藏按钮添加到包装容器内（时间轴的兄弟元素）
            wrapper.appendChild(starredBtn);
        }
        // 如果按钮已存在，直接复用，保留原有事件监听器
        this.ui.starredBtn = starredBtn;
        
        // ✅ 收藏按钮使用相对定位，不需要动态计算位置
        
        // ✅ 添加收藏整个聊天的按钮（插入到平台原生UI中）
        this.injectStarChatButton();
    }
    
    /**
     * ✅ 注入收藏聊天按钮（原生插入模式）
     */
    async injectStarChatButton() {
        // 1. 获取Adapter提供的目标元素
        const targetElement = this.adapter.getStarChatButtonTarget?.();
        
        // 如果没有目标元素，不显示按钮
        if (!targetElement) {
            return;
        }
        
        // 2. 检查是否已存在按钮
        let starChatBtn = document.querySelector('.timeline-star-chat-btn-native');
        
        if (starChatBtn) {
            // ✅ 按钮已存在，只更新状态，不重建（避免事件监听器丢失）
            const isStarred = await this.isChatStarred();
            const svg = starChatBtn.querySelector('svg');
            if (svg) {
                svg.setAttribute('fill', isStarred ? 'rgb(255, 125, 3)' : 'none');
                svg.setAttribute('stroke', isStarred ? 'rgb(255, 125, 3)' : 'currentColor');
            }
            // 保存引用
            this.ui.starChatBtn = starChatBtn;
            return;
        }
        
        // 3. 创建新按钮
        starChatBtn = document.createElement('button');
        starChatBtn.className = 'timeline-star-chat-btn-native';
        
        // 4. 检查收藏状态并设置图标
        const isStarred = await this.isChatStarred();
        starChatBtn.innerHTML = `
            <svg width="18" height="18" viewBox="0 0 24 24" fill="${isStarred ? 'rgb(255, 125, 3)' : 'none'}" stroke="${isStarred ? 'rgb(255, 125, 3)' : 'currentColor'}" stroke-width="2">
                <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>
            </svg>
        `;
        
        // 5. 设置基础样式（适配原生UI）
        const isDeepSeek = this.adapter.constructor.name === 'DeepSeekAdapter';
        starChatBtn.style.cssText = `
            width: 36px;
            height: 36px;
            padding: 0;
            background: transparent;
            border: none;
            border-radius: 8px;
            cursor: pointer;
            display: inline-flex;
            align-items: center;
            justify-content: center;
            transition: background-color 0.2s;
            ${isDeepSeek ? 'position: absolute; top: 14px; right: 56px; z-index: 1000;' : 'position: relative;'}
        `;
        
        // 6. Hover效果和tooltip - 使用全局 Tooltip 管理器
        starChatBtn.onmouseenter = async () => {
            starChatBtn.style.backgroundColor = 'rgba(0, 0, 0, 0.05)';
            
            const isStarred = await this.isChatStarred();
            const tooltipText = isStarred ? chrome.i18n.getMessage('bpxjkw') : chrome.i18n.getMessage('zmvkpx');
            
            window.globalTooltipManager.show(
                'star-chat-btn',
                'button',
                starChatBtn,
                tooltipText,
                { placement: 'bottom' }
            );
        };
        
        starChatBtn.onmouseleave = () => {
            starChatBtn.style.backgroundColor = 'transparent';
            window.globalTooltipManager.hide();
        };
        
        // 8. 点击事件
        starChatBtn.addEventListener('click', async () => {
            const result = await this.toggleChatStar();
            
            if (result && result.success) {
                const nowStarred = await this.isChatStarred();
                starChatBtn.querySelector('svg').setAttribute('fill', nowStarred ? 'rgb(255, 125, 3)' : 'none');
                starChatBtn.querySelector('svg').setAttribute('stroke', nowStarred ? 'rgb(255, 125, 3)' : 'currentColor');
                
                // 更新 tooltip 文本
                const newText = nowStarred ? chrome.i18n.getMessage('bpxjkw') : chrome.i18n.getMessage('zmvkpx');
                window.globalTooltipManager.updateContent(newText);
                
                // 显示 toast
                if (window.globalToastManager) {
                    const toastColor = {
                        light: { backgroundColor: '#0d0d0d', textColor: '#ffffff', borderColor: '#262626' },
                        dark: { backgroundColor: '#ffffff', textColor: '#1f2937', borderColor: '#d1d5db' }
                    };
                    
                    if (result.action === 'star') {
                        window.globalToastManager.success(chrome.i18n.getMessage('kxpmzv'), null, { color: toastColor });
                    } else if (result.action === 'unstar') {
                        window.globalToastManager.info(chrome.i18n.getMessage('pzmvkx'), null, { color: toastColor });
                    }
                }
            }
        });
        
        // 9. 插入按钮到原生UI
        targetElement.parentNode.insertBefore(starChatBtn, targetElement);
        
        // 10. 保存引用
        this.ui.starChatBtn = starChatBtn;
    }
    
    /**
     * ✅ 显示编辑对话框（使用全局 Input Modal）
     */
    async showEditDialog(currentText) {
        if (!window.globalInputModal) {
            console.error('[TimelineManager] globalInputModal not available');
            return null;
        }
        
        return await window.globalInputModal.show({
            title: chrome.i18n.getMessage('vkpxzm'),
            defaultValue: currentText,
            placeholder: chrome.i18n.getMessage('zmxvkp'),
            required: true,
            requiredMessage: chrome.i18n.getMessage('pzmkvx'),
            maxLength: 100
        });
    }
    
    /**
     * ✅ 检查当前聊天是否已被收藏
     */
    async isChatStarred() {
        try {
            const urlWithoutProtocol = location.href.replace(/^https?:\/\//, '');
            const key = `chatTimelineStar:${urlWithoutProtocol}:-1`;
            const value = await StorageAdapter.get(key);
            return !!value;
        } catch (e) {
            return false;
        }
    }
    
    /**
     * ✅ 切换聊天收藏状态
     */
    async toggleChatStar() {
        try {
            const urlWithoutProtocol = location.href.replace(/^https?:\/\//, '');
            const key = `chatTimelineStar:${urlWithoutProtocol}:-1`;
            const existingValue = await StorageAdapter.get(key);
            
            if (existingValue) {
                // 已收藏，取消收藏
                await StorageAdapter.remove(key);
                return { success: true, action: 'unstar' };
            } else {
                // 未收藏，显示输入主题弹窗（带文件夹选择器）
                if (!window.starInputModal) {
                    console.error('[TimelineManager] starInputModal not available');
                    return { success: false, action: null };
                }
                
                // 获取默认主题（通过 Adapter 提供）
                const defaultTheme = this.adapter.getDefaultChatTheme?.() || '';
                
                const result = await window.starInputModal.show({
                    title: chrome.i18n.getMessage('qwxpzm'),
                    defaultValue: defaultTheme,
                    placeholder: chrome.i18n.getMessage('zmxvkp'),
                    folderManager: this.folderManager,
                    defaultFolderId: null
                });
                
                if (!result) {
                    // 用户取消了
                    return { success: false, action: 'cancelled' };
                }
                
                // 添加收藏
                // ✅ 限制收藏文字长度为前100个字符
                const truncatedTheme = this.truncateText(result.value, 100);
                const value = {
                    url: location.href,
                    urlWithoutProtocol: urlWithoutProtocol,
                    index: -1,
                    question: truncatedTheme,
                    timestamp: Date.now(),
                    folderId: result.folderId || null
                };
                await StorageAdapter.set(key, value);
                
                // ✅ 不再需要手动更新收藏列表UI，StarredTab 会自动监听存储变化
                return { success: true, action: 'star' };
            }
        } catch (e) {
            console.error('Failed to toggle chat star:', e);
            return { success: false, action: null };
        }
    }
    
    /**
     * ✅ 显示主题输入对话框（使用全局 Input Modal）
     */
    async showThemeInputDialog() {
        if (!window.globalInputModal) {
            console.error('[TimelineManager] globalInputModal not available');
            return null;
        }
        
            // 获取默认主题（通过 Adapter 提供）
            const defaultTheme = this.adapter.getDefaultChatTheme?.() || '';
            
        return await window.globalInputModal.show({
            title: chrome.i18n.getMessage('qwxpzm'),
            defaultValue: defaultTheme,
            placeholder: chrome.i18n.getMessage('zmxvkp'),
            required: true,
            requiredMessage: chrome.i18n.getMessage('mzpxvk'),
            maxLength: 100
        });
    }
    
    /**
     * ✅ 缓存 Tooltip 的 CSS 变量配置
     * 使用固定值，与 CSS 中的 .timeline-tooltip 样式保持一致
     */
    cacheTooltipConfig() {
        try {
            // ✅ 使用固定值（与 CSS 变量的默认值一致）
            this.tooltipConfigCache = {
                arrowOut: 6,   // --timeline-tooltip-arrow-outside
                baseGap: 12,   // --timeline-tooltip-gap-visual
                boxGap: 8,     // --timeline-tooltip-gap-box
                lineH: 18,     // --timeline-tooltip-lh
                padY: 10,      // --timeline-tooltip-pad-y
                borderW: 1,    // --timeline-tooltip-border-w
                maxW: 288,     // --timeline-tooltip-max
            };
        } catch (e) {
            // 使用默认值
            this.tooltipConfigCache = {
                arrowOut: 6,
                baseGap: 12,
                boxGap: 8,
                lineH: 18,
                padY: 10,
                borderW: 1,
                maxW: 288,
            };
        }
    }

    recalculateAndRenderMarkers() {
        this.perfStart('recalc');
        if (!this.conversationContainer || !this.ui.timelineBar || !this.scrollContainer) return;

        const selector = this.adapter.getUserMessageSelector();
        let userTurnElements = this.conversationContainer.querySelectorAll(selector);
        
        // Reset visible window to avoid cleaning with stale indices after rebuild
        this.visibleRange = { start: 0, end: -1 };
        // If the conversation is transiently empty (branch switching), don't wipe UI immediately
        if (userTurnElements.length === 0) {
            if (!this.zeroTurnsTimer) {
                this.zeroTurnsTimer = setTimeout(() => {
                    this.zeroTurnsTimer = null;
                    this.recalculateAndRenderMarkers();
                }, TIMELINE_CONFIG.ZERO_TURNS_TIMER);
            }
            return;
        }
        this.zeroTurnsTimer = TimelineUtils.clearTimerSafe(this.zeroTurnsTimer);

        // ✅ 按照元素在页面上的实际位置（从上往下）排序
        // 确保节点顺序和视觉顺序完全一致，适用于所有网站
        userTurnElements = Array.from(userTurnElements).sort((a, b) => {
            const rectA = a.getBoundingClientRect();
            const rectB = b.getBoundingClientRect();
            return rectA.top - rectB.top;
        });
        
        /**
         * ✅ 性能优化：只在节点真正变化时重新计算位置
         * 
         * 背景：
         * MutationObserver 会在各种 DOM 变化时触发，包括：
         * - 图片加载完成（样式变化）
         * - 代码高亮渲染（内容样式化）
         * - 公式渲染（LaTeX/KaTeX）
         * - 动画效果
         * 
         * 这些变化不会影响对话节点的数量和顺序，但会触发不必要的位置重新计算。
         * 
         * 优化策略：
         * 通过比对节点 ID 集合，只在节点真正增加/删除时才重新计算。
         * 这样可以减少 80%+ 的不必要计算，提升性能和稳定性。
         */
        
        // 生成当前节点的 ID 集合
        const currentNodeIds = new Set();
        userTurnElements.forEach((el, index) => {
            const id = this.adapter.generateTurnId(el, index);
            currentNodeIds.add(id);
        });
        
        // 判断节点是否变化：数量变化 或 ID 集合变化
        const nodeCountChanged = userTurnElements.length !== this.lastNodeCount;
        const nodeIdsChanged = currentNodeIds.size !== this.lastNodeIds.size || 
                               ![...currentNodeIds].every(id => this.lastNodeIds.has(id));
        const needsRecalculation = nodeCountChanged || nodeIdsChanged;
        
        // 如果节点没有变化，只更新渲染，不重新计算位置
        if (!needsRecalculation && this.markers.length > 0) {
            // 只更新视图和同步状态（不涉及位置计算）
            this.syncTimelineTrackToMain();
            this.updateVirtualRangeAndRender();
            this.updateActiveDotUI();
            this.scheduleScrollSync();
            this.perfEnd('recalc');
            // console.log('⚡ [优化] 节点未变化，跳过位置重新计算');
            return;
        }
        
        // console.log('🔄 [重新计算] 节点发生变化:', { 
        //     nodeCount: userTurnElements.length, 
        //     countChanged: nodeCountChanged, 
        //     idsChanged: nodeIdsChanged 
        // });
        
        // 更新跟踪状态
        this.lastNodeCount = userTurnElements.length;
        this.lastNodeIds = currentNodeIds;
        
        // 节点发生变化，清除旧的 dots，准备重新计算和渲染
        (this.ui.trackContent || this.ui.timelineBar).querySelectorAll('.timeline-dot').forEach(n => n.remove());
        
        /**
         * ✅ 计算元素相对于容器顶部的距离（使用 offsetTop）
         * 
         * 为什么使用 offsetTop 而不是 getBoundingClientRect？
         * - getBoundingClientRect().top 是相对于视口的，会随滚动变化
         * - offsetTop 是相对于 offsetParent 的，不受滚动影响，更稳定
         * 
         * 算法说明：
         * 1. 从元素开始，向上遍历到 container
         * 2. 累加每一层的 offsetTop
         * 3. 如果 offsetParent 跳出了 container（如 position:fixed），使用后备方案
         * 
         * @param {HTMLElement} element - 目标元素
         * @param {HTMLElement} container - 容器元素
         * @returns {number} 元素距离容器顶部的像素距离
         */
        const getOffsetTop = (element, container) => {
            let offset = 0;
            let current = element;
            
            // 向上遍历，累加 offsetTop，直到到达 container
            while (current && current !== container && container.contains(current)) {
                offset += current.offsetTop || 0;
                current = current.offsetParent;
                
                // 如果 offsetParent 跳到了 container 外面，需要修正
                // 这种情况通常发生在有 position:fixed 等特殊定位的元素
                if (current && !container.contains(current)) {
                    // 使用 getBoundingClientRect 作为后备方案
                    const elemRect = element.getBoundingClientRect();
                    const contRect = container.getBoundingClientRect();
                    const contScrollTop = container.scrollTop || 0;
                    return elemRect.top - contRect.top + contScrollTop;
                }
            }
            
            return offset;
        };
        
        // 计算第一个和最后一个节点距离容器顶部的距离
        const firstOffsetTop = getOffsetTop(userTurnElements[0], this.conversationContainer);
        const lastOffsetTop = getOffsetTop(userTurnElements[userTurnElements.length - 1], this.conversationContainer);
        
        const firstTurnOffset = 0; // 使用第一个元素作为基准
        let contentSpan = lastOffsetTop - firstOffsetTop;
        
        if (userTurnElements.length < 2 || contentSpan <= 0) {
            contentSpan = 1;
        }

        // Cache for scroll mapping
        this.firstUserTurnOffset = firstTurnOffset;
        this.contentSpanPx = contentSpan;

        // Build markers with normalized position along conversation
        this.markerMap.clear();
        
        this.markers = Array.from(userTurnElements).map((el, index) => {
            /**
             * ✅ 计算节点的归一化位置（0 到 1）
             * 
             * 重要：节点位置不是均匀分布，而是按对话内容在页面上的实际位置比例映射
             * 
             * 计算原理：
             * 1. 测量每个节点在页面上的实际位置（offsetTop）
             * 2. 计算相对于第一个节点的距离：offsetFromStart = elOffsetTop - firstOffsetTop
             * 3. 归一化到 [0, 1] 区间：n = offsetFromStart / contentSpan
             * 
             * 示例场景：
             * - 如果第2条对话很长（占300px），第3条对话很短（占50px）
             * - 那么节点2和节点3在时间轴上的距离也会反映这个比例（约6:1）
             * - 这样用户可以直观看到对话内容的疏密分布
             * 
             * 结果：
             * - 第一个节点：offsetFromStart = 0, n = 0 → 时间轴顶部（留 pad 边距）
             * - 最后一个节点：offsetFromStart = contentSpan, n = 1 → 时间轴底部（留 pad 边距）
             * - 中间节点：n 按对话实际位置比例分布（不是均匀分布）
             * 
             * 这个 n 值会在 updateTimelineGeometry() 中转换为时间轴上的实际像素位置：
             * y = pad + n * (contentHeight - 2*pad)
             */
            const elOffsetTop = getOffsetTop(el, this.conversationContainer);
            const offsetFromStart = elOffsetTop - firstOffsetTop;
            
            let n = offsetFromStart / contentSpan;
            n = Math.max(0, Math.min(1, n)); // 限制在 [0, 1] 范围内
            const id = this.adapter.generateTurnId(el, index);
            
            const m = {
                id: id,
                element: el,
                summary: this.adapter.extractText(el),
                n,
                baseN: n,
                dotElement: null,
                starred: false,
                pinned: false,  // ✅ 标记状态
            };
            this.markerMap.set(m.id, m);
            return m;
        });
        
        // ✅ 应用收藏状态：根据 starredIndexes 设置 starred 和填充 this.starred
        this.starredIndexes.forEach(index => {
            const marker = this.markers[index];
            if (marker && marker.id) {
                marker.starred = true;
                this.starred.add(marker.id);
            }
        });
        
        // ✅ 应用标记状态：根据 pinnedIndexes 设置 pinned 和填充 this.pinned
        this.pinnedIndexes.forEach(index => {
            const marker = this.markers[index];
            if (marker && marker.id) {
                marker.pinned = true;
                this.pinned.add(marker.id);
            }
        });
        
        // Bump version after markers are rebuilt to invalidate concurrent passes
        this.markersVersion++;
        
        // ✅ 动态调整时间轴高度（根据节点数量）
        this.updateTimelineHeight();

        // Compute geometry and virtualize render
        this.updateTimelineGeometry();
        if (!this.activeTurnId && this.markers.length > 0) {
            this.activeTurnId = this.markers[this.markers.length - 1].id;
        }
        this.syncTimelineTrackToMain();
        this.updateVirtualRangeAndRender();
        // Ensure active class is applied after dots are created
        this.updateActiveDotUI();
        this.scheduleScrollSync();
        // ✅ 检查是否有跨页面导航任务
        this.getNavigateData('targetIndex').then(targetIndex => {
            if (targetIndex !== null && this.markers[targetIndex]) {
                requestAnimationFrame(() => {
                    const marker = this.markers[targetIndex];
                    if (marker && marker.element) {
                        this.smoothScrollTo(marker.element);
                    }
                });
            }
        }).catch(() => {});
        
        // ✅ 检查是否有跨网站导航任务
        this.checkCrossSiteNavigate().then(targetIndex => {
            if (targetIndex !== null && this.markers[targetIndex]) {
                requestAnimationFrame(() => {
                    const marker = this.markers[targetIndex];
                    if (marker && marker.element) {
                        this.smoothScrollTo(marker.element);
                    }
                });
            }
        }).catch(() => {});
        
        this.perfEnd('recalc');
    }
    
    setupObservers() {
        this.mutationObserver = new MutationObserver((mutations) => {
            try { this.ensureContainersUpToDate(); } catch {}
            this.debouncedRecalculateAndRender();
            this.updateIntersectionObserverTargets();
        });
        this.mutationObserver.observe(this.conversationContainer, { childList: true, subtree: true });
        // Resize: update long-canvas geometry and virtualization
        // ⚠️ 注意：这里只监听时间轴自身大小变化，不需要重新计算节点位置
        // 因为时间轴大小变化不影响对话区域节点的 offsetTop
        this.resizeObserver = new ResizeObserver(() => {
            this.updateTimelineGeometry();
            this.syncTimelineTrackToMain();
            this.updateVirtualRangeAndRender();
        });
        if (this.ui.timelineBar) {
            this.resizeObserver.observe(this.ui.timelineBar);
        }

        this.intersectionObserver = new IntersectionObserver(entries => {
            // Maintain which user turns are currently visible
            entries.forEach(entry => {
                const target = entry.target;
                if (entry.isIntersecting) {
                    this.visibleUserTurns.add(target);
                } else {
                    this.visibleUserTurns.delete(target);
                }
            });

            // Defer active state decision to scroll-based computation
            this.scheduleScrollSync();
        }, { 
            root: this.scrollContainer,
            threshold: 0.1,
            rootMargin: "-40% 0px -59% 0px"
        });

        this.updateIntersectionObserverTargets();
        
        // ✅ 设置隐藏状态监听（监听特定元素出现/消失）
        this.setupHideStateObserver();
    }

    /**
     * ✅ 设置隐藏状态监听器
     * 监听DOM变化，调用adapter的检测方法判断是否应该隐藏时间轴
     */
    setupHideStateObserver() {
        // 检查并更新时间轴可见性
        const checkAndUpdateTimelineVisibility = () => {
            // 调用adapter的检测方法
            const shouldHide = this.adapter.shouldHideTimeline();
            
            // 设置时间轴可见性
            if (this.ui.wrapper) {
                this.ui.wrapper.style.display = shouldHide ? 'none' : 'flex';
            }
        };
        
        // 立即检查一次
        checkAndUpdateTimelineVisibility();
        
        // 监听DOM变化
        this.hideStateObserver = new MutationObserver(() => {
            checkAndUpdateTimelineVisibility();
        });
        
        // 监听整个body的变化（因为这些元素可能在任何地方出现）
        try {
            this.hideStateObserver.observe(document.body, { 
                childList: true, 
                subtree: true 
            });
        } catch (e) {
            console.warn('[Timeline] Failed to setup hide state observer:', e);
        }
    }

    /**
     * ✅ 启动健康检查，定期检测容器是否有效
     * 处理 SPA 页面 DOM 整体替换的情况
     */
    startHealthCheck() {
        if (this.healthCheckInterval) clearInterval(this.healthCheckInterval);
        
        this.healthCheckInterval = setInterval(() => {
            // 检查容器是否仍然连接在文档中
            const isContainerValid = this.conversationContainer && this.conversationContainer.isConnected;
            
            if (!isContainerValid) {
                // 容器失效，尝试更新
                this.ensureContainersUpToDate();
            }
        }, 5000); // 每 5 秒检查一次
    }

    // Ensure our conversation/scroll containers are still current after DOM replacements
    ensureContainersUpToDate() {
        const selector = this.adapter.getUserMessageSelector();
        const first = document.querySelector(selector);
        if (!first) return;
        
        const newConv = this.adapter.findConversationContainer(first);
        // ✅ 增强判断：如果新容器存在且 (新容器不等于旧容器 OR 旧容器已经断开连接)
        if (newConv && (newConv !== this.conversationContainer || !this.conversationContainer?.isConnected)) {
            // Rebind observers and listeners to the new conversation root
            this.rebindConversationContainer(newConv);
        }
    }

    rebindConversationContainer(newConv) {
        // Detach old listeners
        if (this.scrollContainer && this.onScroll) {
            try { this.scrollContainer.removeEventListener('scroll', this.onScroll); } catch {}
        }
        try { this.mutationObserver?.disconnect(); } catch {}
        try { this.intersectionObserver?.disconnect(); } catch {}

        this.conversationContainer = newConv;
        
        // ✅ 重置节点跟踪状态，因为切换了对话
        this.lastNodeCount = 0;
        this.lastNodeIds = new Set();

        // Find (or re-find) scroll container
        let parent = newConv;
        let newScroll = null;
        while (parent && parent !== document.body) {
            const style = window.getComputedStyle(parent);
            if (style.overflowY === 'auto' || style.overflowY === 'scroll') {
                newScroll = parent; break;
            }
            parent = parent.parentElement;
        }
        if (!newScroll) newScroll = document.scrollingElement || document.documentElement || document.body;
        this.scrollContainer = newScroll;
        // Reattach scroll listener
        this.onScroll = () => this.scheduleScrollSync();
        this.scrollContainer.addEventListener('scroll', this.onScroll, { passive: true });

        // Recreate IntersectionObserver with new root
        this.intersectionObserver = new IntersectionObserver(entries => {
            entries.forEach(entry => {
                const target = entry.target;
                if (entry.isIntersecting) { this.visibleUserTurns.add(target); }
                else { this.visibleUserTurns.delete(target); }
            });
            this.scheduleScrollSync();
        }, { root: this.scrollContainer, threshold: 0, rootMargin: "0px" });
        this.updateIntersectionObserverTargets();

        // Re-observe mutations on the new conversation container
        this.mutationObserver.observe(this.conversationContainer, { childList: true, subtree: true });

        // Force a recalc right away to rebuild markers
        this.recalculateAndRenderMarkers();
    }

    updateIntersectionObserverTargets() {
        if (!this.intersectionObserver || !this.conversationContainer) return;
        this.intersectionObserver.disconnect();
        this.visibleUserTurns.clear();
        const selector = this.adapter.getUserMessageSelector();
        const userTurns = this.conversationContainer.querySelectorAll(selector);
        userTurns.forEach(el => this.intersectionObserver.observe(el));
    }

    setupEventListeners() {
        // ✅ 长按标记功能：长按节点切换图钉
        let longPressTimer = null;
        let longPressTarget = null;
        let longPressStartPos = null;
        let longPressTriggered = false; // 标记长按是否已触发，用于阻止点击事件
        
        this.onTimelineBarClick = (e) => {
            // ✅ 如果刚刚触发了长按，阻止点击事件（避免长按后又滚动）
            if (longPressTriggered) {
                longPressTriggered = false;
                return;
            }
            
            const dot = e.target.closest('.timeline-dot');
            if (dot) {
                const targetId = dot.dataset.targetTurnId;
                // Find target element by matching marker ID
                const marker = this.markers.find(m => m.id === targetId);
                const targetElement = marker?.element;
                if (targetElement) {
                    // Only scroll; let scroll-based computation set active to avoid double-flash
                    this.smoothScrollTo(targetElement);
                }
            }
        };
        this.ui.timelineBar.addEventListener('click', this.onTimelineBarClick);
        
        // ✅ 键盘导航：上下方向键切换节点
        this.onKeyDown = (e) => {
            // 只处理上下方向键
            if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return;
            
            // ✅ 检查焦点元素，避免干扰可编辑元素和表单控件
            const activeElement = document.activeElement;
            if (activeElement) {
                // 检查是否为可编辑元素或表单控件
                // 按常见程度排序，优化短路求值性能
                const isEditableElement = 
                    activeElement.isContentEditable ||        // 最常见：ChatGPT/富文本编辑器
                    activeElement.tagName === 'INPUT' ||      // 常见：普通输入框
                    activeElement.tagName === 'TEXTAREA' ||   // 常见：多行文本
                    activeElement.tagName === 'SELECT' ||     // 常见：下拉框
                    activeElement.tagName === 'IFRAME' ||     // 特殊：iframe 内可能有输入框
                    activeElement.contentEditable === 'true'; // 冗余检查，增加兼容性
                
                // 如果焦点在可编辑元素上，不拦截，让原生行为生效
                if (isEditableElement) return;
            }
            
            // ✅ 检查功能是否启用
            if (!this.arrowKeysNavigationEnabled) {
                return; // 功能关闭，不处理
            }
            
            // ✅ 检查当前平台是否启用
            if (!this.isPlatformEnabled()) {
                return; // 当前平台被禁用，不处理
            }
            
            // 阻止默认滚动行为
            e.preventDefault();
            
            // 如果没有节点，不处理
            if (this.markers.length === 0) return;
            
            // ✅ 优化：只查找一次索引，避免重复遍历
            let currentIndex = -1;
            if (this.activeTurnId) {
                currentIndex = this.markers.findIndex(m => m.id === this.activeTurnId);
            }
            
            // 如果没有激活节点，或激活节点已失效（索引为-1），提供智能默认行为
            if (currentIndex === -1) {
                // 没有激活节点或激活节点失效（DOM 替换后可能发生）
                // 根据按键方向选择合适的默认节点
                let defaultMarker;
                if (e.key === 'ArrowUp') {
                    // 按上键：从最后一个节点开始（符合用户向上浏览的意图）
                    defaultMarker = this.markers[this.markers.length - 1];
                } else {
                    // 按下键：从第一个节点开始（符合用户向下浏览的意图）
                    defaultMarker = this.markers[0];
                }
                
                if (defaultMarker && defaultMarker.element) {
                    this.smoothScrollTo(defaultMarker.element);
                }
                return;
            }
            
            // 此时 currentIndex 一定是有效的（>= 0），直接计算目标索引
            let targetIndex;
            if (e.key === 'ArrowUp') {
                // 上键：跳转到上一个节点（索引减小）
                targetIndex = currentIndex - 1;
                // 边界检查：已经在第一个节点，保持不动
                if (targetIndex < 0) return;
            } else {
                // 下键：跳转到下一个节点（索引增加）
                targetIndex = currentIndex + 1;
                // 边界检查：已经在最后一个节点，保持不动
                if (targetIndex >= this.markers.length) return;
            }
            
            // 获取目标节点并跳转
            const targetMarker = this.markers[targetIndex];
            if (targetMarker && targetMarker.element) {
                this.smoothScrollTo(targetMarker.element);
            }
        };
        document.addEventListener('keydown', this.onKeyDown);
        
        // ✅ 保存为实例方法以便在 destroy 中清理
        this.startLongPress = (e) => {
            const dot = e.target.closest('.timeline-dot');
            if (!dot) return;
            
            longPressTarget = dot;
            longPressTriggered = false; // 重置标志
            
            // 记录起始位置
            const pos = e.type.startsWith('touch') ? e.touches[0] : e;
            longPressStartPos = { x: pos.clientX, y: pos.clientY };
            
            longPressTimer = setTimeout(async () => {
                const targetId = dot.dataset.targetTurnId;
                if (targetId) {
                    // ✅ 标记长按已触发
                    longPressTriggered = true;
                    
                    // ✅ 触觉反馈（如果支持）
                    if (navigator.vibrate) {
                        navigator.vibrate(50); // 震动 50ms
                    }
                    
                    // ✅ 切换图钉状态
                    await this.togglePin(targetId);
                }
                longPressTimer = null;
            }, 500); // 500ms 触发长按
        };
        
        this.checkLongPressMove = (e) => {
            if (!longPressTimer || !longPressStartPos) return;
            
            // 如果移动超过5px，取消长按
            const pos = e.type.startsWith('touch') ? e.touches[0] : e;
            const dx = pos.clientX - longPressStartPos.x;
            const dy = pos.clientY - longPressStartPos.y;
            const distance = Math.sqrt(dx * dx + dy * dy);
            
            if (distance > 5) {
                this.cancelLongPress();
            }
        };
        
        this.cancelLongPress = () => {
            if (longPressTimer) {
                clearTimeout(longPressTimer);
                longPressTimer = null;
            }
            longPressTarget = null;
            longPressStartPos = null;
        };
        
        this.ui.timelineBar.addEventListener('mousedown', this.startLongPress);
        this.ui.timelineBar.addEventListener('touchstart', this.startLongPress, { passive: true });
        this.ui.timelineBar.addEventListener('mousemove', this.checkLongPressMove);
        this.ui.timelineBar.addEventListener('touchmove', this.checkLongPressMove, { passive: true });
        this.ui.timelineBar.addEventListener('mouseup', this.cancelLongPress);
        this.ui.timelineBar.addEventListener('mouseleave', this.cancelLongPress);
        this.ui.timelineBar.addEventListener('touchend', this.cancelLongPress);
        this.ui.timelineBar.addEventListener('touchcancel', this.cancelLongPress);
        
        // Listen to container scroll to keep marker active state in sync
        this.onScroll = () => this.scheduleScrollSync();
        this.scrollContainer.addEventListener('scroll', this.onScroll, { passive: true });

        // Tooltip interactions (delegated)
        this.onTimelineBarOver = (e) => {
            const dot = e.target.closest('.timeline-dot');
            if (dot) this.showTooltipForDot(dot);
        };
        
        // ✅ 需求2：修改逻辑 - 只在鼠标不是移到 tooltip 时才隐藏
        this.onTimelineBarOut = (e) => {
            const fromDot = e.target.closest('.timeline-dot');
            const toDot = e.relatedTarget?.closest?.('.timeline-dot');
            const toTooltip = e.relatedTarget?.closest?.('.timeline-tooltip');
            
            // 如果从圆点移出，且不是移到另一个圆点或 tooltip，才隐藏
            if (fromDot && !toDot && !toTooltip) {
                this.hideTooltip();
            }
        };
        
        this.onTimelineBarFocusIn = (e) => {
            const dot = e.target.closest('.timeline-dot');
            if (dot) this.showTooltipForDot(dot);
        };
        this.onTimelineBarFocusOut = (e) => {
            const dot = e.target.closest('.timeline-dot');
            if (dot) this.hideTooltip();
        };
        
        this.ui.timelineBar.addEventListener('mouseover', this.onTimelineBarOver);
        this.ui.timelineBar.addEventListener('mouseout', this.onTimelineBarOut);
        this.ui.timelineBar.addEventListener('focusin', this.onTimelineBarFocusIn);
        this.ui.timelineBar.addEventListener('focusout', this.onTimelineBarFocusOut);
        
        // ✅ 移除：tooltip hover 事件由 GlobalTooltipManager 内部管理

        /**
         * 窗口大小变化处理
         * 
         * 需要重新计算节点位置的原因：
         * 1. 窗口宽度变化 → 对话容器宽度变化
         * 2. 文字重新折行 → 元素高度变化
         * 3. 元素高度变化 → offsetTop 变化
         * 4. 如果不重新计算，节点位置会不准确
         * 
         * 性能考虑：
         * 使用 debouncedRecalculateAndRender 避免频繁计算
         */
        this.onWindowResize = () => {
            // ✅ GlobalTooltipManager 会处理 tooltip 在 resize 时的行为
            // ✅ 强制重新计算节点位置
            // 重置状态，使优化逻辑认为"节点已变化"，从而触发位置重新计算
            this.lastNodeCount = 0;
            this.lastNodeIds.clear();
            this.debouncedRecalculateAndRender();
        };
        window.addEventListener('resize', this.onWindowResize);
        /**
         * 视口缩放处理（VisualViewport API）
         * 
         * 触发场景：
         * - 用户通过手势或快捷键缩放页面（Ctrl + +/-）
         * - 移动设备上的双指缩放
         * 
         * 为什么需要重新计算：
         * 缩放会改变页面布局和元素尺寸，导致 offsetTop 变化
         */
        if (window.visualViewport) {
            this.onVisualViewportResize = () => {
                // ✅ 强制重新计算节点位置
                this.lastNodeCount = 0;
                this.lastNodeIds.clear();
                this.debouncedRecalculateAndRender();
            };
            try { window.visualViewport.addEventListener('resize', this.onVisualViewportResize); } catch {}
        }

        // Scroll wheel on the timeline controls the main scroll container (Linked mode)
        this.onTimelineWheel = (e) => {
            // Prevent page from attempting to scroll anything else
            try { e.preventDefault(); } catch {}
            const delta = e.deltaY || 0;
            this.scrollContainer.scrollTop += delta;
            // Keep markers in sync on next frame
            this.scheduleScrollSync();
        };
        this.ui.timelineBar.addEventListener('wheel', this.onTimelineWheel, { passive: false });

        // Cross-tab/cross-site star sync via chrome.storage change event
        this.onStorage = (changes, areaName) => {
            try {
                const url = location.href.replace(/^https?:\/\//, '');
                const starPrefix = `chatTimelineStar:${url}:`;
                const pinPrefix = `chatTimelinePin:${url}:`;
                
                // 检查变化的key中是否有当前页面的收藏或标记数据
                Object.keys(changes).forEach(key => {
                    // 处理收藏变化
                    if (key.startsWith(starPrefix)) {
                        const indexStr = key.substring(starPrefix.length);
                        const index = parseInt(indexStr, 10);
                        if (isNaN(index)) return;
                        
                        const marker = this.markers[index];
                        if (!marker) return;
                        
                        const change = changes[key];
                        
                        // 判断是添加还是删除
                        if (change.newValue) {
                            // 添加收藏
                            this.starred.add(marker.id);
                            this.starredIndexes.add(index);
                            if (marker) marker.starred = true;
                        } else {
                            // 删除收藏
                            this.starred.delete(marker.id);
                            this.starredIndexes.delete(index);
                            if (marker) marker.starred = false;
                        }
                        
                        // 更新圆点样式
                        if (marker.dotElement) {
                            try { 
                                marker.dotElement.classList.toggle('starred', this.starred.has(marker.id));
                                // ✅ 更新 tooltip 中的星标状态（如果正在显示）
                                this._updateTooltipStarIfVisible(marker.dotElement, marker.id);
                            } catch {}
                        }
                    }
                    
                    // ✅ 处理标记变化
                    if (key.startsWith(pinPrefix)) {
                        const indexStr = key.substring(pinPrefix.length);
                        const index = parseInt(indexStr, 10);
                        if (isNaN(index)) return;
                        
                        const marker = this.markers[index];
                        if (!marker) return;
                        
                        const change = changes[key];
                        
                        // 判断是添加还是删除
                        if (change.newValue) {
                            // 添加标记
                            this.pinned.add(marker.id);
                            this.pinnedIndexes.add(index);
                            marker.pinned = true;
                        } else {
                            // 删除标记
                            this.pinned.delete(marker.id);
                            this.pinnedIndexes.delete(index);
                            marker.pinned = false;
                        }
                        
                        // 更新图钉图标
                        this.updatePinIcon(marker);
                    }
                });
                
                // ✅ 重新渲染所有图钉
                this.renderPinMarkers();
                
                // ✅ 监听箭头键导航功能状态变化
                if (changes.arrowKeysNavigationEnabled) {
                    this.arrowKeysNavigationEnabled = changes.arrowKeysNavigationEnabled.newValue !== false;
                }
                
                // ✅ 监听平台设置变化
                if (changes.timelinePlatformSettings) {
                    this.platformSettings = changes.timelinePlatformSettings.newValue || {};
                }
                
                // 更新收藏按钮显示状态
                this.updateStarredBtnVisibility();
            } catch {}
        };
        try { StorageAdapter.addChangeListener(this.onStorage); } catch {}
        
        // ✅ 收藏按钮点击事件（打开 Panel Modal 并显示收藏 tab）
        if (this.ui.starredBtn) {
            this.ui.starredBtn.addEventListener('click', () => {
                if (window.panelModal) {
                    window.panelModal.show('starred');
                }
            });
        }
        
        // ✅ 优化：监听主题变化，清空缓存
        this.setupThemeChangeListener();
        
        // ✅ 注册依赖 Timeline 的 Panel Modal tabs
        // PanelModal 已在脚本加载时自动初始化，这里只注册需要 timeline 的 tabs
        if (typeof registerTimelineTabs === 'function') {
            registerTimelineTabs(this);
        }
    }
    
    /**
     * ✅ 同步深色模式状态到 html 元素
     * 确保时间轴样式能正确应用深色模式
     */
    syncDarkModeClass() {
        const isDarkMode = this.adapter.detectDarkMode?.() || false;
        const htmlElement = document.documentElement;
        
        if (isDarkMode) {
            if (!htmlElement.classList.contains('dark')) {
                htmlElement.classList.add('dark');
            }
        } else {
            if (htmlElement.classList.contains('dark')) {
                htmlElement.classList.remove('dark');
            }
        }
    }
    
    /**
     * ✅ 优化：设置主题变化监听器
     * 当主题切换时，重新缓存 CSS 变量并清空截断缓存
     */
    setupThemeChangeListener() {
        // 监听 html 元素的 class、data-theme、style 和 yb-theme-mode 属性变化
        // style 用于 ChatGPT (color-scheme)
        // data-theme 用于通义
        // yb-theme-mode 用于元宝
        const htmlObserver = new MutationObserver((mutations) => {
            mutations.forEach((mutation) => {
                if (mutation.type === 'attributes' && 
                    (mutation.attributeName === 'class' || 
                     mutation.attributeName === 'data-theme' ||
                     mutation.attributeName === 'style' ||
                     mutation.attributeName === 'yb-theme-mode')) {
                    this.onThemeChange();
                }
            });
        });
        
        try {
            htmlObserver.observe(document.documentElement, {
                attributes: true,
                attributeFilter: ['class', 'data-theme', 'style', 'yb-theme-mode']
            });
            
            // 保存引用以便在 destroy 时清理
            this.htmlObserver = htmlObserver;
        } catch (e) {
        }
        
        // 监听 body 元素的 class 和 yb-theme-mode 属性变化（Gemini、DeepSeek、元宝等网站在 body 上切换主题）
        const bodyObserver = new MutationObserver((mutations) => {
            mutations.forEach((mutation) => {
                if (mutation.type === 'attributes' && 
                    (mutation.attributeName === 'class' || mutation.attributeName === 'yb-theme-mode')) {
                    this.onThemeChange();
                }
            });
        });
        
        try {
            bodyObserver.observe(document.body, {
                attributes: true,
                attributeFilter: ['class', 'yb-theme-mode']
            });
            
            // 保存引用以便在 destroy 时清理
            this.bodyObserver = bodyObserver;
        } catch (e) {
        }
        
        // 监听系统主题变化（prefers-color-scheme）
        try {
            const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
            const mediaQueryHandler = () => {
                this.onThemeChange();
            };
            
            // 使用现代 API（如果支持）
            if (mediaQuery.addEventListener) {
                mediaQuery.addEventListener('change', mediaQueryHandler);
            } else {
                // 降级到旧 API
                mediaQuery.addListener(mediaQueryHandler);
            }
            
            // 保存引用以便在 destroy 时清理
            this.mediaQuery = mediaQuery;
            this.mediaQueryHandler = mediaQueryHandler;
        } catch (e) {
        }
    }
    
    /**
     * ✅ 优化：主题变化处理
     */
    onThemeChange() {
        // 延迟到下一帧，确保新主题的样式已应用
        requestAnimationFrame(() => {
            // ✅ 同步深色模式类
            this.syncDarkModeClass();
            
            // 重新缓存 CSS 变量
            this.cacheTooltipConfig();
            
            // 清空截断缓存（因为颜色/字体可能变化）
            this.truncateCache.clear();
        });
    }
    
    smoothScrollTo(targetElement, duration = 600) {
        if (!targetElement || !this.scrollContainer) return;
        
        const containerRect = this.scrollContainer.getBoundingClientRect();
        const targetRect = targetElement.getBoundingClientRect();
        const targetPosition = targetRect.top - containerRect.top + this.scrollContainer.scrollTop;
        const startPosition = this.scrollContainer.scrollTop;
        const distance = targetPosition - startPosition;
        let startTime = null;

        const animation = (currentTime) => {
            if (startTime === null) startTime = currentTime;
            const timeElapsed = currentTime - startTime;
            const run = this.easeInOutQuad(timeElapsed, startPosition, distance, duration);
            this.scrollContainer.scrollTop = run;
            if (timeElapsed < duration) {
                requestAnimationFrame(animation);
            } else {
                this.scrollContainer.scrollTop = targetPosition;
            }
        };
        requestAnimationFrame(animation);
    }
    
    easeInOutQuad(t, b, c, d) {
        t /= d / 2;
        if (t < 1) return c / 2 * t * t + b;
        t--;
        return -c / 2 * (t * (t - 2) - 1) + b;
    }

    updateActiveDotUI() {
        this.markers.forEach(marker => {
            marker.dotElement?.classList.toggle('active', marker.id === this.activeTurnId);
        });
    }

    debounce(func, delay) {
        let timeout;
        return (...args) => {
            clearTimeout(timeout);
            timeout = setTimeout(() => func.apply(this, args), delay);
        };
    }

    // Read numeric CSS var from the timeline bar element
    getCSSVarNumber(el, name, fallback) {
        const v = getComputedStyle(el).getPropertyValue(name).trim();
        const n = parseFloat(v);
        return Number.isFinite(n) ? n : fallback;
    }

    getTrackPadding() {
        if (!this.ui.timelineBar) return 12;
        return this.getCSSVarNumber(this.ui.timelineBar, '--timeline-track-padding', 12);
    }

    getMinGap() {
        if (!this.ui.timelineBar) return 12;
        return this.getCSSVarNumber(this.ui.timelineBar, '--timeline-min-gap', 12);
    }

    // Enforce a minimum pixel gap between positions while staying within bounds
    applyMinGap(positions, minTop, maxTop, gap) {
        const n = positions.length;
        if (n === 0) return positions;
        const out = positions.slice();
        // Clamp first and forward pass (monotonic increasing)
        out[0] = Math.max(minTop, Math.min(positions[0], maxTop));
        for (let i = 1; i < n; i++) {
            const minAllowed = out[i - 1] + gap;
            out[i] = Math.max(positions[i], minAllowed);
        }
        // If last exceeds max, backward pass
        if (out[n - 1] > maxTop) {
            out[n - 1] = maxTop;
            for (let i = n - 2; i >= 0; i--) {
                const maxAllowed = out[i + 1] - gap;
                out[i] = Math.min(out[i], maxAllowed);
            }
            // Ensure first still within min
            if (out[0] < minTop) {
                out[0] = minTop;
                for (let i = 1; i < n; i++) {
                    const minAllowed = out[i - 1] + gap;
                    out[i] = Math.max(out[i], minAllowed);
                }
            }
        }
        // Final clamp
        for (let i = 0; i < n; i++) {
            if (out[i] < minTop) out[i] = minTop;
            if (out[i] > maxTop) out[i] = maxTop;
        }
        return out;
    }

    // Debounced scheduler: after resize/zoom settles, re-apply min-gap based on cached normalized positions
    scheduleMinGapCorrection() {
        this.resizeIdleTimer = TimelineUtils.clearTimerSafe(this.resizeIdleTimer);
        this.resizeIdleRICId = TimelineUtils.clearIdleCallbackSafe(this.resizeIdleRICId);
        
        this.resizeIdleTimer = setTimeout(() => {
            this.resizeIdleTimer = null;
            // Prefer idle callback to avoid contention; fallback to immediate
            try {
                if (typeof requestIdleCallback === 'function') {
                    this.resizeIdleRICId = requestIdleCallback(() => {
                        this.resizeIdleRICId = null;
                        this.reapplyMinGapAfterResize();
                    }, { timeout: TIMELINE_CONFIG.RESIZE_IDLE_TIMEOUT });
                    return;
                }
            } catch {}
            this.reapplyMinGapAfterResize();
        }, TIMELINE_CONFIG.RESIZE_IDLE_DELAY);
    }

    // Lightweight correction: map cached n -> pixel, apply min-gap, write back updated n
    reapplyMinGapAfterResize() {
        this.perfStart('minGapIdle');
        if (!this.ui.timelineBar || this.markers.length === 0) return;
        const barHeight = this.ui.timelineBar.clientHeight || 0;
        const trackPadding = this.getTrackPadding();
        const usable = Math.max(1, barHeight - 2 * trackPadding);
        const minTop = trackPadding;
        const maxTop = trackPadding + usable;
        const minGap = this.getMinGap();
        // Use cached normalized positions (default 0)
        const desired = this.markers.map(m => {
            const n = Math.max(0, Math.min(1, (m.n ?? 0)));
            return minTop + n * usable;
        });
        const adjusted = this.applyMinGap(desired, minTop, maxTop, minGap);
        for (let i = 0; i < this.markers.length; i++) {
            const top = adjusted[i];
            const n = (top - minTop) / Math.max(1, (maxTop - minTop));
            this.markers[i].n = Math.max(0, Math.min(1, n));
            try { this.markers[i].dotElement?.style.setProperty('--n', String(this.markers[i].n)); } catch {}
        }
        this.perfEnd('minGapIdle');
    }

    /**
     * ✅ 优化：显示 Tooltip（使用全局管理器）
     */
    showTooltipForDot(dot) {
        if (!dot) return;
        
        const id = 'node-' + (dot.dataset.targetTurnId || '');
        const messageText = (dot.getAttribute('aria-label') || '').trim();
        
        // 构建内容元素（包含交互逻辑）
        const contentElement = this._buildNodeTooltipElement(dot, messageText);
        
        window.globalTooltipManager.show(id, 'node', dot, {
            element: contentElement
        }, {
            placement: 'auto',
            maxWidth: 288  // ✅ 使用固定值（与 CSS 中的默认值一致）
        });
    }
    
    /**
     * ✅ 构建节点 tooltip 元素（包含完整交互逻辑）
     */
    _buildNodeTooltipElement(dot, messageText) {
        // 计算位置信息
        const p = this.computePlacementInfo(dot);
        
        // 截断文本
        const layout = this.truncateToFiveLines(messageText, p.width, true);
        
        // 检查是否收藏
        const id = dot.dataset.targetTurnId;
        const isStarred = id && this.starred.has(id);
        
        // 创建容器（用于包装 content + star）
        const container = document.createElement('div');
        container.style.display = 'flex';
        container.style.alignItems = 'center';
        container.style.gap = '8px';
        
        // 创建内容区
        const content = document.createElement('div');
        content.className = 'timeline-tooltip-content';
        content.textContent = layout.text;
        
        // ✅ 添加点击复制功能
        content.addEventListener('click', (e) => {
            e.stopPropagation();
            this.copyToClipboard(messageText, content);
        });
        
        // 创建星标图标（放在内容右侧，垂直居中）
        const starSpan = document.createElement('span');
        starSpan.className = 'timeline-tooltip-star';
        starSpan.dataset.targetTurnId = id; // 保存消息 ID
        
        // ✅ 根据当前收藏状态设置初始CSS类
        if (!isStarred) {
            starSpan.classList.add('not-starred');
        }
        
        // ✅ 添加点击切换收藏事件
        starSpan.addEventListener('click', async (e) => {
            e.stopPropagation(); // 阻止事件冒泡
            const turnId = starSpan.dataset.targetTurnId;
            
            const result = await this.toggleStar(turnId); // 切换收藏状态（异步，可能显示modal）
            
            // 根据操作结果显示 toast 和更新样式
            if (result && result.success) {
                const toastColor = {
                    light: { backgroundColor: '#0d0d0d', textColor: '#ffffff', borderColor: '#262626' },
                    dark: { backgroundColor: '#ffffff', textColor: '#1f2937', borderColor: '#d1d5db' }
                };
                
                if (result.action === 'star') {
                    // 添加收藏成功
                    starSpan.classList.remove('not-starred');
                    if (window.globalToastManager) {
                        window.globalToastManager.success(chrome.i18n.getMessage('kxpmzv'), null, { color: toastColor });
                    }
                } else if (result.action === 'unstar') {
                    // 取消收藏成功
                    starSpan.classList.add('not-starred');
                    if (window.globalToastManager) {
                        window.globalToastManager.info(chrome.i18n.getMessage('pzmvkx'), null, { color: toastColor });
                    }
                }
            }
            // 如果用户取消了操作（action === 'cancelled'），不显示 toast
        });
        
        // 组装
        container.appendChild(content);
        container.appendChild(starSpan);
        
        return container;
    }
    
    /**
     * ✅ 已废弃：完全使用 GlobalTooltipManager
     * 保留此方法签名以避免可能的调用错误
     */
    _showTooltipImmediate(dot) {
        console.warn('[TimelineManager] _showTooltipImmediate is deprecated, use GlobalTooltipManager instead');
        // 降级：使用全局管理器
        if (typeof window.globalTooltipManager !== 'undefined' && dot) {
            const id = dot.dataset.targetTurnId;
            const messageText = (dot.getAttribute('aria-label') || '').trim();
            const contentElement = this._buildNodeTooltipElement(dot, messageText);
            window.globalTooltipManager.show(id, 'node', dot, { element: contentElement });
        }
    }
    
    /**
     * ✅ 优化：获取 Tooltip 文本（提取为独立方法）
     */
    _getTooltipText(dot) {
        let text = (dot.getAttribute('aria-label') || '').trim();
        
        try {
            const id = dot.dataset.targetTurnId;
            if (id && this.starred.has(id)) {
                text = `★ ${text}`;
            }
        } catch {}
        
        return text;
    }

    hideTooltip(immediate = false) {
        window.globalTooltipManager.hide(immediate);
    }
    
    /**
     * ✅ 已废弃：完全使用 GlobalTooltipManager
     */
    placeTooltipAt(dot, placement, width, height) {
        console.warn('[TimelineManager] placeTooltipAt is deprecated, use GlobalTooltipManager instead');
    }
    
    /**
     * ✅ 已废弃：完全使用 GlobalTooltipManager
     */
    refreshTooltipForDot(dot) {
        console.warn('[TimelineManager] refreshTooltipForDot is deprecated, use GlobalTooltipManager instead');
    }
    
    /**
     * ✅ 更新 tooltip 中的星标状态（如果 tooltip 正在显示该节点）
     * 用于：当通过收藏面板或 storage 同步改变收藏状态时，更新已显示的 tooltip
     */
    _updateTooltipStarIfVisible(dotElement, turnId) {
        if (!dotElement || !turnId) return;
        
        try {
            // 检查 GlobalTooltipManager 是否正在显示此节点的 tooltip
            const tooltipManager = window.globalTooltipManager;
            if (!tooltipManager || !tooltipManager.state || !tooltipManager.state.isVisible) {
                return;
            }
            
            // 检查当前 tooltip 是否属于这个节点
            const currentId = tooltipManager.state.currentId;
            if (!currentId || !currentId.includes(turnId)) {
                return;
            }
            
            // 查找 tooltip 中的星标图标
            const tooltipInstances = tooltipManager.instances;
            for (const [type, instance] of tooltipInstances) {
                if (instance && instance.tooltip) {
                    const starSpan = instance.tooltip.querySelector('.timeline-tooltip-star');
                    if (starSpan && starSpan.dataset.targetTurnId === turnId) {
                        // 更新星标状态
                        const isStarred = this.starred.has(turnId);
                        if (isStarred) {
                            starSpan.classList.remove('not-starred');
                        } else {
                            starSpan.classList.add('not-starred');
                        }
                        break;
                    }
                }
            }
        } catch (e) {
            // 静默失败，不影响主流程
        }
    }

    /**
     * ✅ 更新时间轴高度和包装容器位置
     */
    updateTimelineHeight() {
        if (!this.ui.timelineBar || !this.ui.wrapper) return;
        
        const position = this.adapter.getTimelinePosition();
        if (!position || !position.top || !position.bottom) return;
        
        const defaultTop = parseInt(position.top, 10) || 100;
        const defaultBottom = parseInt(position.bottom, 10) || 100;
        
        // 统一使用默认高度
        const topValue = `${defaultTop}px`;
        const bottomValue = `${defaultBottom}px`;
        
        // 设置包装容器位置（包含时间轴和收藏按钮）
        this.ui.wrapper.style.top = topValue;
        
        // 设置时间轴高度
        this.ui.timelineBar.style.height = `max(200px, calc(100vh - ${topValue} - ${bottomValue}))`;
        
        // ✅ 收藏按钮使用相对定位，不需要动态调整位置
    }
    
    /**
     * 更新时间轴几何布局
     * 
     * 核心逻辑：将归一化位置（n，范围 0-1）转换为时间轴上的实际像素位置
     * 
     * 布局策略：
     * 1. 计算可用空间：usableC = contentHeight - 2*pad
     *    - 顶部预留 pad 像素
     *    - 底部预留 pad 像素
     *    - 中间是实际可用空间
     * 
     * 2. 计算节点位置：y = pad + n * usableC
     *    - 第一个节点（n=0）：y = pad（离顶部有边距）
     *    - 最后一个节点（n=1）：y = pad + usableC = contentHeight - pad（离底部有边距）
     *    - 中间节点按比例分布
     * 
     * 3. 应用最小间距约束：确保相邻节点之间至少有 minGap 像素
     */
    updateTimelineGeometry() {
        if (!this.ui.timelineBar || !this.ui.trackContent) return;
        const H = this.ui.timelineBar.clientHeight || 0;
        const pad = this.getTrackPadding();          // 顶部和底部的边距
        const minGap = this.getMinGap();             // 节点之间的最小间距
        const N = this.markers.length;
        
        // 计算内容高度，确保节点之间有足够的间距
        const desired = Math.max(H, (N > 0 ? (2 * pad + Math.max(0, N - 1) * minGap) : H));
        this.contentHeight = Math.ceil(desired);
        this.scale = (H > 0) ? (this.contentHeight / H) : 1;
        try { this.ui.trackContent.style.height = `${this.contentHeight}px`; } catch {}

        // 计算可用空间（减去顶部和底部的padding）
        const usableC = Math.max(1, this.contentHeight - 2 * pad);
        
        // 根据归一化位置计算期望的Y坐标
        // y = pad + n * usableC，确保第一个和最后一个节点不会贴边
        const desiredY = this.markers.map(m => pad + Math.max(0, Math.min(1, (m.baseN ?? m.n ?? 0))) * usableC);
        
        // 应用最小间距约束，避免节点重叠
        const adjusted = this.applyMinGap(desiredY, pad, pad + usableC, minGap);
        this.yPositions = adjusted;
        // Update normalized n for CSS positioning
        for (let i = 0; i < N; i++) {
            const top = adjusted[i];
            const n = (top - pad) / usableC;
            this.markers[i].n = Math.max(0, Math.min(1, n));
            if (this.markers[i].dotElement && !this.usePixelTop) {
                try { this.markers[i].dotElement.style.setProperty('--n', String(this.markers[i].n)); } catch {}
            }
        }
        if (this._cssVarTopSupported === null) {
            this._cssVarTopSupported = this.detectCssVarTopSupport(pad, usableC);
            this.usePixelTop = !this._cssVarTopSupported;
        }
    }

    detectCssVarTopSupport(pad, usableC) {
        try {
            if (!this.ui.trackContent) return false;
            const test = document.createElement('button');
            test.className = 'timeline-dot';
            test.style.visibility = 'hidden';
            test.style.pointerEvents = 'none';
            test.setAttribute('aria-hidden', 'true');
            const expected = pad + 0.5 * usableC;
            test.style.setProperty('--n', '0.5');
            this.ui.trackContent.appendChild(test);
            const cs = getComputedStyle(test);
            const topStr = cs.top || '';
            const px = parseFloat(topStr);
            test.remove();
            if (!Number.isFinite(px)) return false;
            return Math.abs(px - expected) <= TIMELINE_CONFIG.CSS_VAR_DETECTION_TOLERANCE;
        } catch {
            return false;
        }
    }

    syncTimelineTrackToMain() {
        if (!this.ui.track || !this.scrollContainer || !this.contentHeight) return;
        const scrollTop = this.scrollContainer.scrollTop;
        const ref = scrollTop + this.scrollContainer.clientHeight * 0.45;
        const span = Math.max(1, this.contentSpanPx || 1);
        const r = Math.max(0, Math.min(1, (ref - (this.firstUserTurnOffset || 0)) / span));
        const maxScroll = Math.max(0, this.contentHeight - (this.ui.track.clientHeight || 0));
        const target = Math.round(r * maxScroll);
        if (Math.abs((this.ui.track.scrollTop || 0) - target) > 1) {
            this.ui.track.scrollTop = target;
        }
    }

    updateVirtualRangeAndRender() {
        const localVersion = this.markersVersion;
        if (!this.ui.track || !this.ui.trackContent || this.markers.length === 0) return;
        const st = this.ui.track.scrollTop || 0;
        const vh = this.ui.track.clientHeight || 0;
        const buffer = Math.max(TIMELINE_CONFIG.VIRTUAL_BUFFER_MIN, vh);
        const minY = st - buffer;
        const maxY = st + vh + buffer;
        const start = this.lowerBound(this.yPositions, minY);
        const end = Math.max(start - 1, this.upperBound(this.yPositions, maxY));

        let prevStart = this.visibleRange.start;
        let prevEnd = this.visibleRange.end;
        const len = this.markers.length;
        // Clamp previous indices into current bounds to avoid undefined access
        if (len > 0) {
            prevStart = Math.max(0, Math.min(prevStart, len - 1));
            prevEnd = Math.max(-1, Math.min(prevEnd, len - 1));
        }
        if (prevEnd >= prevStart) {
            for (let i = prevStart; i < Math.min(start, prevEnd + 1); i++) {
                const m = this.markers[i];
                if (m && m.dotElement) { try { m.dotElement.remove(); } catch {} m.dotElement = null; }
            }
            for (let i = Math.max(end + 1, prevStart); i <= prevEnd; i++) {
                const m = this.markers[i];
                if (m && m.dotElement) { try { m.dotElement.remove(); } catch {} m.dotElement = null; }
            }
        } else {
            (this.ui.trackContent || this.ui.timelineBar).querySelectorAll('.timeline-dot').forEach(n => n.remove());
            this.markers.forEach(m => { m.dotElement = null; });
        }

        const frag = document.createDocumentFragment();
        for (let i = start; i <= end; i++) {
            const marker = this.markers[i];
            if (!marker) continue;
            if (!marker.dotElement) {
                const dot = document.createElement('button');
                dot.className = 'timeline-dot';
                dot.dataset.targetTurnId = marker.id;
                dot.setAttribute('aria-label', marker.summary);
                dot.setAttribute('tabindex', '0');
                try { dot.setAttribute('aria-describedby', 'chat-timeline-tooltip'); } catch {}
                try { dot.style.setProperty('--n', String(marker.n || 0)); } catch {}
                if (this.usePixelTop) {
                    dot.style.top = `${Math.round(this.yPositions[i])}px`;
                }
                // Apply active state immediately if this is the active marker
                try { dot.classList.toggle('active', marker.id === this.activeTurnId); } catch {}
                // ✅ 添加：如果已收藏，添加 starred 类（标记点变橙金色）
                try { dot.classList.toggle('starred', this.starred.has(marker.id)); } catch {}
                // ✅ 添加：如果已标记，添加 pinned 类（CSS自动显示图钉）
                try { 
                    dot.classList.toggle('pinned', this.pinned.has(marker.id));
                } catch {}
                marker.dotElement = dot;
                frag.appendChild(dot);
            } else {
                try { marker.dotElement.style.setProperty('--n', String(marker.n || 0)); } catch {}
                if (this.usePixelTop) {
                    marker.dotElement.style.top = `${Math.round(this.yPositions[i])}px`;
                }
                // ✅ 移除：不再更新圆点的 starred 类
            }
        }
        if (localVersion !== this.markersVersion) return; // stale pass, abort
        if (frag.childNodes.length) this.ui.trackContent.appendChild(frag);
        this.visibleRange = { start, end };
        
        // ✅ 节点渲染完成后，重新渲染图钉
        requestAnimationFrame(() => {
            this.renderPinMarkers();
        });
    }

    lowerBound(arr, x) {
        let lo = 0, hi = arr.length;
        while (lo < hi) {
            const mid = (lo + hi) >> 1;
            if (arr[mid] < x) lo = mid + 1; else hi = mid;
        }
        return lo;
    }

    upperBound(arr, x) {
        let lo = 0, hi = arr.length;
        while (lo < hi) {
            const mid = (lo + hi) >> 1;
            if (arr[mid] <= x) lo = mid + 1; else hi = mid;
        }
        return lo - 1;
    }

    computePlacementInfo(dot) {
        // ✅ 使用 document.body 作为参考（tooltip 已经不由 Timeline 创建）
        const dotRect = dot.getBoundingClientRect();
        const vw = window.innerWidth;
        
        // ✅ 使用缓存的配置值
        const config = this.tooltipConfigCache || {};
        const arrowOut = config.arrowOut ?? 6;
        const baseGap = config.baseGap ?? 12;
        const boxGap = config.boxGap ?? 8;
        const maxW = config.maxW ?? 288;
        
        const gap = baseGap + Math.max(0, arrowOut) + Math.max(0, boxGap);
        const viewportPad = 8;
        const minW = 160;
        const leftAvail = Math.max(0, dotRect.left - gap - viewportPad);
        const rightAvail = Math.max(0, vw - dotRect.right - gap - viewportPad);
        let placement = (rightAvail > leftAvail) ? 'right' : 'left';
        let avail = placement === 'right' ? rightAvail : leftAvail;
        // choose width tier for determinism
        const tiers = [280, 240, 200, 160];
        const hardMax = Math.max(minW, Math.min(maxW, Math.floor(avail)));
        let width = tiers.find(t => t <= hardMax) || Math.max(minW, Math.min(hardMax, 160));
        // if no tier fits (very tight), try switching side
        if (width < minW && placement === 'left' && rightAvail > leftAvail) {
            placement = 'right';
            avail = rightAvail;
            const hardMax2 = Math.max(minW, Math.min(maxW, Math.floor(avail)));
            width = tiers.find(t => t <= hardMax2) || Math.max(120, Math.min(hardMax2, minW));
        } else if (width < minW && placement === 'right' && leftAvail >= rightAvail) {
            placement = 'left';
            avail = leftAvail;
            const hardMax2 = Math.max(minW, Math.min(maxW, Math.floor(avail)));
            width = tiers.find(t => t <= hardMax2) || Math.max(120, Math.min(hardMax2, minW));
        }
        width = Math.max(120, Math.min(width, maxW));
        return { placement, width };
    }

    /**
     * ✅ 优化：截断文本为 5 行（添加缓存 + Emoji 安全截断）
     */
    truncateToFiveLines(text, targetWidth, wantLayout = false) {
        try {
            if (!this.measureEl) {
                return wantLayout ? { text, height: 0 } : text;
            }
            
            // ✅ 优化：检查缓存
            const cacheKey = `${text}|${targetWidth}|${wantLayout}`;
            if (this.truncateCache.has(cacheKey)) {
                return this.truncateCache.get(cacheKey);
            }
            
            // ✅ 使用缓存的配置值
            const config = this.tooltipConfigCache || {};
            const lineH = config.lineH ?? 18;
            const padY = config.padY ?? 10;
            
            // ✅ 重新设计：maxH 应该是内容区的最大高度（5行 + padding）
            // measureEl 已经模拟了内容区的样式（有 padding），所以不需要加 border
            const maxH = Math.round(5 * lineH + 2 * padY);
            const ell = '…';
            const el = this.measureEl;
            el.style.width = `${Math.max(0, Math.floor(targetWidth))}px`;

            // fast path: full text fits within 5 lines
            el.textContent = String(text || '').replace(/\s+/g, ' ').trim();
            let h = el.offsetHeight;
            if (h <= maxH) {
                const result = wantLayout ? { text: el.textContent, height: h } : el.textContent;
                // ✅ 优化：存入缓存（限制大小避免内存泄漏）
                this._addToTruncateCache(cacheKey, result);
                return result;
            }

            // binary search longest prefix that fits
            const raw = el.textContent;
            let lo = 0, hi = raw.length, ans = 0;
            while (lo <= hi) {
                const mid = (lo + hi) >> 1;
                // ✅ 优化：使用 Emoji 安全截断
                const slice = this._safeSlice(raw, mid);
                el.textContent = slice.trimEnd() + ell;
                h = el.offsetHeight;
                if (h <= maxH) { ans = mid; lo = mid + 1; } else { hi = mid - 1; }
            }
            
            // ✅ 优化：最终截断也使用安全方法
            const out = (ans >= raw.length) ? raw : (this._safeSlice(raw, ans).trimEnd() + ell);
            el.textContent = out;
            h = el.offsetHeight;
            
            const result = wantLayout ? { text: out, height: Math.min(h, maxH) } : out;
            // ✅ 优化：存入缓存
            this._addToTruncateCache(cacheKey, result);
            return result;
        } catch (e) {
            return wantLayout ? { text, height: 0 } : text;
        }
    }
    
    /**
     * ✅ 优化：安全截断字符串（避免破坏 Emoji/代理对）
     */
    _safeSlice(text, end) {
        if (end >= text.length) return text;
        if (end <= 0) return '';
        
        // 检查是否在代理对中间截断（Emoji 等多字节字符）
        const charCode = text.charCodeAt(end - 1);
        
        // 高代理对范围 0xD800-0xDBFF
        if (charCode >= 0xD800 && charCode <= 0xDBFF) {
            // 向前退一位，避免截断代理对
            return text.slice(0, end - 1);
        }
        
        return text.slice(0, end);
    }
    
    /**
     * ✅ 优化：添加到截断缓存（LRU 策略，限制大小）
     */
    _addToTruncateCache(key, value) {
        const MAX_CACHE_SIZE = 100;
        
        // 如果缓存已满，删除最旧的条目（Map 的第一个）
        if (this.truncateCache.size >= MAX_CACHE_SIZE) {
            const firstKey = this.truncateCache.keys().next().value;
            this.truncateCache.delete(firstKey);
        }
        
        this.truncateCache.set(key, value);
    }

    scheduleScrollSync() {
        if (this.scrollRafId !== null) return;
        this.scrollRafId = requestAnimationFrame(() => {
            this.scrollRafId = null;
            // Sync long-canvas scroll and virtualized dots before computing active
            this.syncTimelineTrackToMain();
            this.updateVirtualRangeAndRender();
            this.computeActiveByScroll();
        });
    }

    computeActiveByScroll() {
        if (!this.scrollContainer || this.markers.length === 0) return;
        
        const scrollTop = this.scrollContainer.scrollTop;
        const scrollHeight = this.scrollContainer.scrollHeight;
        const clientHeight = this.scrollContainer.clientHeight;
        const containerRect = this.scrollContainer.getBoundingClientRect();
        
        // ========== 优先检测：是否在顶部或底部 ==========
        // ✅ 检测平台是否使用反向滚动（如豆包）
        const isReverseScroll = typeof this.adapter.isReverseScroll === 'function' && this.adapter.isReverseScroll();
        
        let isAtTop, isAtBottom;
        
        if (isReverseScroll) {
            // 反向滚动：scrollTop = 0 在底部，负数越大越接近顶部
            const absScrollTop = Math.abs(scrollTop);
            isAtTop = absScrollTop + clientHeight >= scrollHeight - 10;
            isAtBottom = absScrollTop < 10;
        } else {
            // 正常滚动：scrollTop = 0 在顶部（默认逻辑）
            isAtTop = scrollTop < 10;
            isAtBottom = scrollTop + clientHeight >= scrollHeight - 10;
        }
        
        // 如果滚动到顶部（距离顶部 < 10px），强制激活第一个节点
        if (isAtTop) {
            const firstId = this.markers[0].id;
            if (this.activeTurnId !== firstId) {
                this.activeTurnId = firstId;
                this.updateActiveDotUI();
                this.lastActiveChangeTime = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
            }
            return;
        }
        
        // 如果滚动到底部（距离底部 < 10px），强制激活最后一个节点
        if (isAtBottom) {
            const lastId = this.markers[this.markers.length - 1].id;
            if (this.activeTurnId !== lastId) {
                this.activeTurnId = lastId;
                this.updateActiveDotUI();
                this.lastActiveChangeTime = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
            }
            return;
        }
        
        // ========== 常规情况：使用参考点计算 ==========
        /**
         * 参考点策略：容器顶部向下 45% 的位置
         * 
         * 逻辑分支：
         * 
         * 【情况1】0-45%区域内有节点：
         *   → 激活第一个在0-45%区域内的节点
         * 
         * 【情况2】0-45%区域内没有节点：
         *   → 情况2.1：上方存在节点 → 激活距离最近的上方节点（最后一个在视口上方的）
         *   → 情况2.2：上方没有节点 → 激活节点1（默认第一个节点）
         * 
         * 示例1（情况1：有节点在0-45%区域内）：
         * ┌─────────────┐
         * │ 视口顶部     │ 0%
         * │ 节点1 ●     │ 20%  ✅ 激活（第一个在0-45%内）
         * │ 节点2 ●     │ 40%  ← 不激活
         * │ ─────── ←─  │ 45%  ← 参考点
         * │ 节点3 ●     │ 55%
         * └─────────────┘
         * 
         * 示例2（情况2.1：0-45%内没有节点，上方有节点）：
         * │ 节点1 ●     │ -200px (在视口上方)
         * │ 节点2 ●     │ -100px (在视口上方) ✅ 激活（距离最近的上方节点）
         * ┌─────────────┐
         * │ 视口顶部     │ 0%
         * │ ─────── ←─  │ 45%  ← 参考点
         * │ 节点3 ●     │ 50%
         * └─────────────┘
         * 
         * 示例3（情况2.2：0-45%内没有节点，上方也没有节点）：
         * ┌─────────────┐
         * │ 视口顶部     │ 0%
         * │ ─────── ←─  │ 45%  ← 参考点
         * │ 节点1 ●     │ 50%  ✅ 激活（默认第一个节点）
         * │ 节点2 ●     │ 60%
         * └─────────────┘
         */
        const referencePoint = containerRect.top + clientHeight * 0.45;
        const viewportTop = containerRect.top;
        const viewportBottom = containerRect.bottom;
        
        // 默认激活第一个节点（用于情况2.2）
        let activeId = this.markers[0].id;
        let foundInRange = false;
        
        // 第一步：从前往后遍历，找第一个在【视口内】且在【0-45%区域】的节点
        for (let i = 0; i < this.markers.length; i++) {
            const m = this.markers[i];
            const elRect = m.element.getBoundingClientRect();
            const elTop = elRect.top;
            const elBottom = elRect.bottom;
            
            // 【情况1】找到第一个部分可见且在0-45%区域的节点
            // 判断元素是否部分可见：上边缘或下边缘在视口内，或完全覆盖视口
            const isTopInViewport = elTop >= viewportTop && elTop <= viewportBottom;
            const isBottomInViewport = elBottom >= viewportTop && elBottom <= viewportBottom;
            const coversViewport = elTop < viewportTop && elBottom > viewportBottom;
            const isPartiallyVisible = isTopInViewport || isBottomInViewport || coversViewport;
            
            // 条件：元素部分可见 && 元素顶部在45%参考线之上
            if (isPartiallyVisible && elTop <= referencePoint) {
                activeId = m.id;
                foundInRange = true;
                break;  // 找到第一个满足条件的，立即停止
            }
        }
        
        // 第二步：【情况2】0-45%区域内没有节点，找"视口上方"最近的节点
        if (!foundInRange) {
            for (let i = 0; i < this.markers.length; i++) {
                const m = this.markers[i];
                const elRect = m.element.getBoundingClientRect();
                const elTop = elRect.top;
                
                // 【情况2.1】找最后一个在视口上方的节点（距离最近的）
                if (elTop < viewportTop) {
                    activeId = m.id;  // 不断更新，最终得到最后一个
                } else {
                    break;  // 遇到第一个在视口内或之下的节点，停止
                }
            }
            // 【情况2.2】如果循环结束后 activeId 仍是默认值，说明上方没有节点，保持为节点1
        }
        
        if (this.activeTurnId !== activeId) {
            const now = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
            const since = now - this.lastActiveChangeTime;
            if (since < TIMELINE_CONFIG.MIN_ACTIVE_CHANGE_INTERVAL) {
                // Coalesce rapid changes during fast scrolling/layout shifts
                this.pendingActiveId = activeId;
                if (!this.activeChangeTimer) {
                    const delay = Math.max(TIMELINE_CONFIG.MIN_ACTIVE_CHANGE_INTERVAL - since, 0);
                    this.activeChangeTimer = setTimeout(() => {
                        this.activeChangeTimer = null;
                        if (this.pendingActiveId && this.pendingActiveId !== this.activeTurnId) {
                            this.activeTurnId = this.pendingActiveId;
                            this.updateActiveDotUI();
                            this.lastActiveChangeTime = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
                        }
                        this.pendingActiveId = null;
                    }, delay);
                }
            } else {
                this.activeTurnId = activeId;
                this.updateActiveDotUI();
                this.lastActiveChangeTime = now;
            }
        }
    }

    waitForElement(selector) {
        return new Promise((resolve) => {
            const element = document.querySelector(selector);
            if (element) return resolve(element);
            const observer = new MutationObserver(() => {
                const el = document.querySelector(selector);
                if (el) {
                    try { observer.disconnect(); } catch {}
                    resolve(el);
                }
            });
            try { observer.observe(document.body, { childList: true, subtree: true }); } catch {}
            // Guard against long-lived observers on wrong pages
            setTimeout(() => { TimelineUtils.disconnectObserverSafe(observer); resolve(null); }, TIMELINE_CONFIG.OBSERVER_TIMEOUT);
        });
    }

    destroy() {
        // Disconnect observers
        TimelineUtils.disconnectObserverSafe(this.mutationObserver);
        TimelineUtils.disconnectObserverSafe(this.resizeObserver);
        TimelineUtils.disconnectObserverSafe(this.intersectionObserver);
        TimelineUtils.disconnectObserverSafe(this.hideStateObserver); // ✅ 清理隐藏状态监听器
        TimelineUtils.disconnectObserverSafe(this.themeObserver); // ✅ 优化：清理主题监听器
        
        // ✅ 清理健康检查定时器
        if (this.healthCheckInterval) {
            clearInterval(this.healthCheckInterval);
            this.healthCheckInterval = null;
        }

        this.visibleUserTurns.clear();
        
        // ✅ 优化：清理媒体查询监听器
        if (this.mediaQuery && this.mediaQueryHandler) {
            try {
                if (this.mediaQuery.removeEventListener) {
                    this.mediaQuery.removeEventListener('change', this.mediaQueryHandler);
                } else {
                    this.mediaQuery.removeListener(this.mediaQueryHandler);
                }
            } catch {}
        }
        
        // Remove event listeners
        TimelineUtils.removeEventListenerSafe(this.ui.timelineBar, 'click', this.onTimelineBarClick);
        // ✅ 清理键盘导航监听器
        TimelineUtils.removeEventListenerSafe(document, 'keydown', this.onKeyDown);
        // ✅ 正确清理存储监听器（使用 StorageAdapter）
        try {
            if (this.onStorage) {
                StorageAdapter.removeChangeListener(this.onStorage);
            }
        } catch {}
        // ✅ 清理长按相关的事件监听器
        TimelineUtils.removeEventListenerSafe(this.ui.timelineBar, 'mousedown', this.startLongPress);
        TimelineUtils.removeEventListenerSafe(this.ui.timelineBar, 'touchstart', this.startLongPress);
        TimelineUtils.removeEventListenerSafe(this.ui.timelineBar, 'mousemove', this.checkLongPressMove);
        TimelineUtils.removeEventListenerSafe(this.ui.timelineBar, 'touchmove', this.checkLongPressMove);
        TimelineUtils.removeEventListenerSafe(this.ui.timelineBar, 'mouseup', this.cancelLongPress);
        TimelineUtils.removeEventListenerSafe(this.ui.timelineBar, 'mouseleave', this.cancelLongPress);
        TimelineUtils.removeEventListenerSafe(this.ui.timelineBar, 'touchend', this.cancelLongPress);
        TimelineUtils.removeEventListenerSafe(this.ui.timelineBar, 'touchcancel', this.cancelLongPress);
        TimelineUtils.removeEventListenerSafe(this.scrollContainer, 'scroll', this.onScroll, { passive: true });
        TimelineUtils.removeEventListenerSafe(this.ui.timelineBar, 'mouseover', this.onTimelineBarOver);
        TimelineUtils.removeEventListenerSafe(this.ui.timelineBar, 'mouseout', this.onTimelineBarOut);
        TimelineUtils.removeEventListenerSafe(this.ui.timelineBar, 'focusin', this.onTimelineBarFocusIn);
        TimelineUtils.removeEventListenerSafe(this.ui.timelineBar, 'focusout', this.onTimelineBarFocusOut);
        // ✅ 注意：不再需要清理 tooltip 事件监听器（因为 tooltip 不由 Timeline 创建）
        TimelineUtils.removeEventListenerSafe(this.ui.timelineBar, 'wheel', this.onTimelineWheel);
        TimelineUtils.removeEventListenerSafe(window, 'resize', this.onWindowResize);
        TimelineUtils.removeEventListenerSafe(window.visualViewport, 'resize', this.onVisualViewportResize);
        
        // Clear timers and RAF
        this.scrollRafId = TimelineUtils.clearRafSafe(this.scrollRafId);
        this.activeChangeTimer = TimelineUtils.clearTimerSafe(this.activeChangeTimer);
        // ✅ 移除：tooltipHideTimer 由 GlobalTooltipManager 管理
        this.tooltipUpdateDebounceTimer = TimelineUtils.clearTimerSafe(this.tooltipUpdateDebounceTimer);
        this.resizeIdleTimer = TimelineUtils.clearTimerSafe(this.resizeIdleTimer);
        this.resizeIdleRICId = TimelineUtils.clearIdleCallbackSafe(this.resizeIdleRICId);
        // ✅ 移除：longPressTimer 已删除
        this.zeroTurnsTimer = TimelineUtils.clearTimerSafe(this.zeroTurnsTimer);
        this.showRafId = TimelineUtils.clearRafSafe(this.showRafId);
        
        // Remove DOM elements
        TimelineUtils.removeElementSafe(this.ui.timelineBar);
        // ✅ 注意：不再清理 tooltip（由 GlobalTooltipManager 管理）
        TimelineUtils.removeElementSafe(this.measureEl);
        
        // ✅ 修复：清理收藏按钮
        TimelineUtils.removeElementSafe(this.ui.starredBtn);
        
        // Clear references
        this.ui = { timelineBar: null, track: null, trackContent: null };
        this.markers = [];
        this.activeTurnId = null;
        this.scrollContainer = null;
        this.conversationContainer = null;
        this.onTimelineBarClick = null;
        this.onTimelineBarOver = null;
        this.onTimelineBarOut = null;
        this.onTimelineBarFocusIn = null;
        this.onTimelineBarFocusOut = null;
        // ✅ 移除：tooltip hover 事件由 GlobalTooltipManager 管理
        this.onScroll = null;
        this.onWindowResize = null;
        this.onVisualViewportResize = null;
        // ✅ 清理长按相关的引用
        this.startLongPress = this.checkLongPressMove = this.cancelLongPress = null;
        // ✅ 清理键盘导航引用
        this.onKeyDown = null;
        this.pendingActiveId = null;
    }

    // --- Star/Highlight helpers ---
    async loadStars() {
        this.starred.clear();
        this.starredIndexes.clear();
        try {
            // 使用完整 URL（去掉协议）作为前缀
            const url = location.href.replace(/^https?:\/\//, '');
            const prefix = `chatTimelineStar:${url}:`;
            
            // 使用 StorageAdapter 获取所有匹配的收藏
            const items = await StorageAdapter.getAllByPrefix(prefix);
            
            // 提取 index
            Object.keys(items).forEach(key => {
                const indexStr = key.substring(prefix.length);
                const index = parseInt(indexStr, 10);
                if (!isNaN(index)) {
                    this.starredIndexes.add(index);
                }
            });
        } catch (e) {
            // Silently fail
        }
    }
    
    /**
     * ✅ 加载标记数据（与loadStars类似）
     */
    async loadPins() {
        this.pinned.clear();
        this.pinnedIndexes.clear();
        try {
            const url = location.href.replace(/^https?:\/\//, '');
            const prefix = `chatTimelinePin:${url}:`;
            
            const items = await StorageAdapter.getAllByPrefix(prefix);
            
            Object.keys(items).forEach(key => {
                const indexStr = key.substring(prefix.length);
                const index = parseInt(indexStr, 10);
                if (!isNaN(index)) {
                    this.pinnedIndexes.add(index);
                }
            });
        } catch (e) {
            // Silently fail
        }
    }

    /**
     * ✅ 加载箭头键导航功能状态
     */
    async loadArrowKeysNavigationState() {
        try {
            const result = await chrome.storage.local.get('arrowKeysNavigationEnabled');
            // 默认开启（!== false）
            this.arrowKeysNavigationEnabled = result.arrowKeysNavigationEnabled !== false;
        } catch (e) {
            console.error('[Timeline] Failed to load arrow keys navigation state:', e);
            // 读取失败，默认开启
            this.arrowKeysNavigationEnabled = true;
        }
    }

    /**
     * ✅ 加载平台设置
     */
    async loadPlatformSettings() {
        try {
            const result = await chrome.storage.local.get('timelinePlatformSettings');
            this.platformSettings = result.timelinePlatformSettings || {};
        } catch (e) {
            console.error('[Timeline] Failed to load platform settings:', e);
            this.platformSettings = {};
        }
    }

    /**
     * ✅ 检查当前平台是否启用箭头键导航
     */
    isPlatformEnabled() {
        try {
            // 获取当前平台信息
            const platform = getCurrentPlatform();
            if (!platform) return true; // 未知平台，默认启用
            
            // ✅ 首先检查平台是否支持时间轴功能
            if (platform.features?.timeline !== true) {
                return false; // 平台不支持该功能
            }
            
            // 从缓存中检查（默认启用）
            return this.platformSettings[platform.id] !== false;
        } catch (e) {
            return true; // 出错默认启用
        }
    }

    /**
     * ✅ 截断文本到指定长度，超出添加 "..."
     * 
     * 用途：
     * 用于收藏和标记功能，限制保存的文本长度，避免超出存储配额。
     * 
     * Chrome Storage API 限制：
     * - chrome.storage.sync.QUOTA_BYTES_PER_ITEM = 8KB (每个条目)
     * - 包含 LaTeX 公式或长代码的消息可能超出此限制
     * - 截断后可避免 "kQuotaBytesPerItem quota exceeded" 错误
     * 
     * @param {string} text - 原始文本
     * @param {number} maxLength - 最大长度（默认100字符）
     * @returns {string} 截断后的文本
     * 
     * @example
     * truncateText('Hello World', 100) // "Hello World"（不超长，原样返回）
     * truncateText('这是一段很长的文本内容需要被截断', 10)   // "这是一段很长的文..."（前10个字符 + "..."）
     */
    truncateText(text, maxLength = 100) {
        if (!text) return '';
        if (text.length <= maxLength) return text;
        return text.substring(0, maxLength) + '...';
    }

    async saveStarItem(index, question) {
        try {
            const urlWithoutProtocol = location.href.replace(/^https?:\/\//, '');
            const key = `chatTimelineStar:${urlWithoutProtocol}:${index}`;
            // ✅ 限制收藏文字长度为前100个字符
            const truncatedQuestion = this.truncateText(question, 100);
            const value = { 
                url: location.href,
                urlWithoutProtocol: urlWithoutProtocol,
                index: index,
                question: truncatedQuestion,
                timestamp: Date.now()
            };
            await StorageAdapter.set(key, value);
        } catch (e) {
            // Silently fail
        }
    }
    
    /**
     * ✅ 保存收藏项（带文件夹）
     */
    async saveStarItemWithFolder(index, question, folderId = null) {
        try {
            const urlWithoutProtocol = location.href.replace(/^https?:\/\//, '');
            const key = `chatTimelineStar:${urlWithoutProtocol}:${index}`;
            // ✅ 限制收藏文字长度为前100个字符
            const truncatedQuestion = this.truncateText(question, 100);
            const value = { 
                url: location.href,
                urlWithoutProtocol: urlWithoutProtocol,
                index: index,
                question: truncatedQuestion,
                timestamp: Date.now(),
                folderId: folderId || null
            };
            await StorageAdapter.set(key, value);
        } catch (e) {
            // Silently fail
        }
    }
    
    // ✅ 从 URL 获取网站信息
    getSiteInfoFromUrl(url) {
        try {
            // 提取域名
            let hostname = url;
            if (url.startsWith('http://') || url.startsWith('https://')) {
                hostname = new URL(url).hostname;
            } else {
                // 如果是 url without protocol，取第一个 / 之前的部分
                hostname = url.split('/')[0];
            }
            
            // 遍历映射字典，查找匹配的域名
            for (const [domain, info] of Object.entries(this.siteNameMap)) {
                if (hostname.includes(domain)) {
                    return info;
                }
            }
            
            // 如果没有匹配，返回域名的主要部分
            const parts = hostname.split('.');
            if (parts.length >= 2) {
                return { 
                    name: parts[parts.length - 2],
                    logo: null
                };
            }
            return { name: '未知网站', logo: null };
        } catch {
            return { name: '未知网站', logo: null };
        }
    }
    
    // ✅ 从 URL 获取网站名称
    getSiteNameFromUrl(url) {
        return this.getSiteInfoFromUrl(url).name;
    }
    
    async removeStarItem(index) {
        try {
            const url = location.href.replace(/^https?:\/\//, '');
            const key = `chatTimelineStar:${url}:${index}`;
            await StorageAdapter.remove(key);
        } catch (e) {
            // Silently fail
        }
    }

    async toggleStar(turnId) {
        const id = String(turnId || '');
        if (!id) return { success: false, action: null };
        
        const m = this.markerMap.get(id);
        if (!m) return { success: false, action: null };
        
        const index = this.markers.indexOf(m);
        if (index === -1) return { success: false, action: null };
        
        // 切换收藏状态
        if (this.starred.has(id)) {
            // 取消收藏
            this.starred.delete(id);
            this.starredIndexes.delete(index);
            this.removeStarItem(index);
            
            m.starred = false;
            
            // ✅ 更新圆点样式
            if (m.dotElement) {
                try {
                    m.dotElement.classList.remove('starred');
                    this._updateTooltipStarIfVisible(m.dotElement, id);
                } catch {}
            }
            
            this.updateStarredBtnVisibility();
            return { success: true, action: 'unstar' };
        } else {
            // 添加收藏 - 显示弹窗输入主题和选择文件夹
            if (!window.starInputModal) {
                console.error('[TimelineManager] starInputModal not available');
                return { success: false, action: null };
            }
            
            const result = await window.starInputModal.show({
                title: chrome.i18n.getMessage('qwxpzm'),
                defaultValue: m.summary,
                placeholder: chrome.i18n.getMessage('zmxvkp'),
                folderManager: this.folderManager,
                defaultFolderId: null
            });
            
            if (!result) {
                // 用户取消了
                return { success: false, action: 'cancelled' };
            }
            
            this.starred.add(id);
            this.starredIndexes.add(index);
            // 使用用户输入的主题和选择的文件夹保存
            this.saveStarItemWithFolder(index, result.value, result.folderId);
            
            m.starred = true;
            
            // ✅ 更新圆点样式
            if (m.dotElement) {
                try {
                    m.dotElement.classList.add('starred');
                    this._updateTooltipStarIfVisible(m.dotElement, id);
                } catch {}
            }
            
            this.updateStarredBtnVisibility();
            return { success: true, action: 'star' };
        }
    }
    
    // 获取所有收藏的消息（所有网站的收藏，不限于当前网站）
    async getStarredMessages() {
        const starredMessages = [];
        try {
            // ✅ 使用 StorageAdapter 获取所有网站的收藏（跨网站共享）
            // 注意：这里不过滤当前网站，获取所有以 'chatTimelineStar:' 开头的条目
            const items = await StorageAdapter.getAllByPrefix('chatTimelineStar:');
            
            Object.keys(items).forEach(key => {
                try {
                    const data = items[key];
                    
                    // 优先使用存储的字段，如果没有则从 key 中解析（兼容旧数据）
                    // 从 key 中提取 url 和 index（用于兼容旧数据）
                    const parts = key.split(':');
                    
                    const urlWithoutProtocol = data.urlWithoutProtocol || parts.slice(1, -1).join(':');
                    const index = data.index !== undefined ? data.index : parseInt(parts[parts.length - 1], 10);
                    const fullUrl = data.url || `https://${urlWithoutProtocol}`;
                    
                    // ✅ 处理整个聊天收藏（index = -1）和普通问题收藏
                    if (index === -1) {
                        // 整个聊天的收藏
                        const siteInfo = this.getSiteInfoFromUrl(fullUrl);
                        starredMessages.push({
                            index: -1,
                            question: data.question || '整个对话',
                            url: fullUrl,
                            urlWithoutProtocol: urlWithoutProtocol,
                            siteName: siteInfo.name,
                            timestamp: data.timestamp || 0,
                            isCurrentPage: urlWithoutProtocol === location.href.replace(/^https?:\/\//, ''),
                            isFullChat: true  // 标识这是整个聊天
                        });
                    } else if (!isNaN(index) && index >= 0) {
                        // 普通问题的收藏
                        const siteInfo = this.getSiteInfoFromUrl(fullUrl);
                        starredMessages.push({
                            index: index,
                            question: data.question || '',
                            url: fullUrl,
                            urlWithoutProtocol: urlWithoutProtocol,
                            siteName: siteInfo.name,
                            timestamp: data.timestamp || 0,
                            isCurrentPage: urlWithoutProtocol === location.href.replace(/^https?:\/\//, ''),
                            isFullChat: false  // 标识这是单个问题
                        });
                    }
                } catch (e) {
                    // 忽略解析错误的条目
                }
            });
        } catch (e) {
            // Silently fail
        }
        
        // 按时间倒序排序（最新的在前）
        return starredMessages.sort((a, b) => b.timestamp - a.timestamp);
    }
    
    // ✅ 复制文本到剪贴板并显示反馈
    async copyToClipboard(text, targetElement) {
        try {
            // 使用现代 Clipboard API
            await navigator.clipboard.writeText(text);
            
            // 显示复制成功提示
            this.showCopyFeedback(targetElement);
        } catch (err) {
            // 降级方案：使用传统方法
            try {
                const textarea = document.createElement('textarea');
                textarea.value = text;
                textarea.style.position = 'fixed';
                textarea.style.left = '-9999px';
                textarea.style.top = '0';
                document.body.appendChild(textarea);
                textarea.select();
                document.execCommand('copy');
                document.body.removeChild(textarea);
                
                // 显示复制成功提示
                this.showCopyFeedback(targetElement);
            } catch (e) {
                console.error('复制失败:', e);
            }
        }
    }
    
    // ✅ 显示复制成功的反馈提示（使用全局 Toast 管理器）
    showCopyFeedback(targetElement) {
        window.globalToastManager.success(
            chrome.i18n.getMessage('xpzmvk'),
            targetElement
        );
    }
    
    // ✅ 显示错误提示（使用全局 Toast 管理器）
    showErrorToast(message, targetElement) {
        window.globalToastManager.error(message, targetElement);
    }
    
    // ✅ 检查是否有收藏数据
    async hasStarredData() {
        try {
            const items = await StorageAdapter.getAllByPrefix('chatTimelineStar:');
            return Object.keys(items).length > 0;
        } catch (e) {
            return false;
        }
    }
    
    // ✅ 更新收藏按钮显示状态
    async updateStarredBtnVisibility() {
        if (!this.ui.starredBtn) return;
        
        // 始终显示收藏按钮，即使没有收藏记录
        this.ui.starredBtn.style.display = 'flex';
        
        // 根据是否有收藏数据来设置不同的颜色状态
        const hasData = await this.hasStarredData();
        if (hasData) {
            // 有收藏记录：移除灰色类，使用橙色
            this.ui.starredBtn.classList.remove('no-starred-data');
        } else {
            // 没有收藏记录：添加灰色类
            this.ui.starredBtn.classList.add('no-starred-data');
        }
    }
    
    // ✅ 设置导航数据（用于跨页面导航）
    async setNavigateData(key, value) {
        try {
            await StorageAdapter.set(`chatTimelineNavigate:${key}`, value);
        } catch (e) {
            // Silently fail
        }
    }
    
    // ✅ 设置导航数据（用于跨网站导航，使用目标URL作为key）
    async setNavigateDataForUrl(targetUrl, index) {
        try {
            // 使用目标URL（去掉协议）作为key
            const urlKey = targetUrl.replace(/^https?:\/\//, '');
            await StorageAdapter.set(`chatTimelineCrossNavigate:${urlKey}`, {
                targetIndex: index,
                timestamp: Date.now(),
                expires: Date.now() + 60000  // 1分钟后过期
            });
        } catch (e) {
            // Silently fail
        }
    }
    
    // ✅ 获取并删除导航数据
    async getNavigateData(key) {
        try {
            const fullKey = `chatTimelineNavigate:${key}`;
            const value = await StorageAdapter.get(fullKey);
            if (value !== undefined) {
                await StorageAdapter.remove(fullKey);
                return value;
            }
        } catch (e) {
            // Silently fail
        }
        return null;
    }
    
    // ✅ 检查跨网站导航数据
    async checkCrossSiteNavigate() {
        try {
            // 使用当前URL查找导航数据
            const currentUrl = location.href.replace(/^https?:\/\//, '');
            const key = `chatTimelineCrossNavigate:${currentUrl}`;
            const data = await StorageAdapter.get(key);
            
            if (data && data.targetIndex !== undefined) {
                // 检查是否过期（1分钟）
                if (data.expires && Date.now() < data.expires) {
                    // 删除数据（只使用一次）
                    await StorageAdapter.remove(key);
                    return data.targetIndex;
                } else {
                    // 过期，删除
                    await StorageAdapter.remove(key);
                }
            }
        } catch (e) {
            // Silently fail
        }
        return null;
    }
    
    escapeHTML(str) {
        const div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    }
    
    /**
     * ✅ 切换节点的标记状态
     */
    async togglePin(id) {
        if (!id) {
            return false;
        }
        
        const marker = this.markers.find(m => m.id === id);
        if (!marker) {
            return false;
        }
        
        // ✅ 修复：通过 indexOf 获取 index（与 toggleStar 一致）
        const index = this.markers.indexOf(marker);
        if (index === -1) {
            return false;
        }
        
        try {
            // ✅ 修复：动态计算 urlWithoutProtocol
            const urlWithoutProtocol = location.href.replace(/^https?:\/\//, '');
            const key = `chatTimelinePin:${urlWithoutProtocol}:${index}`;
            const isPinned = await StorageAdapter.get(key);
            
            if (isPinned) {
                // 取消标记
                await StorageAdapter.remove(key);
                marker.pinned = false;
                this.pinned.delete(id);
                this.pinnedIndexes.delete(index);
            } else {
                // 添加标记
                // ✅ 限制标记文字长度为前100个字符
                const truncatedSummary = this.truncateText(marker.summary || '', 100);
                const pinData = {
                    url: location.href,
                    urlWithoutProtocol: urlWithoutProtocol,
                    index: index,
                    question: truncatedSummary,
                    siteName: this.getSiteNameFromUrl(location.href),
                    timestamp: Date.now(),
                    isFullChat: false
                };
                await StorageAdapter.set(key, pinData);
                marker.pinned = true;
                this.pinned.add(id);
                this.pinnedIndexes.add(index);
            }
            
            // 更新节点UI
            this.updatePinIcon(marker);
            // ✅ 重新渲染所有图钉
            this.renderPinMarkers();
            return true;
        } catch (e) {
            console.error('Failed to toggle pin:', e);
            return false;
        }
    }
    
    /**
     * ✅ 更新节点的图钉图标显示
     */
    updatePinIcon(marker) {
        // ✅ 简化：只更新 pinned class，图钉在单独的方法中渲染
        if (marker.dotElement) {
            marker.dotElement.classList.toggle('pinned', marker.pinned);
        }
    }
    
    /**
     * ✅ 渲染所有图钉（独立于节点渲染）
     */
    renderPinMarkers() {
        // 清除所有旧的图钉
        const oldPins = this.ui.timelineBar.querySelectorAll('.timeline-pin-marker');
        oldPins.forEach(pin => pin.remove());
        
        // 为所有标记的节点渲染图钉
        this.markers.forEach(marker => {
            if (marker.pinned && marker.dotElement) {
                const pinMarker = document.createElement('span');
                pinMarker.className = 'timeline-pin-marker';
                pinMarker.textContent = '📌';
                pinMarker.dataset.markerId = marker.id;
                
                // 使用节点的 --n 变量来定位图钉
                const n = marker.n || 0;
                pinMarker.style.setProperty('--n', String(n));
                
                // 添加到 timelineBar
                this.ui.timelineBar.appendChild(pinMarker);
            }
        });
    }

    // ✅ 移除：cancelLongPress 方法已删除，长按收藏功能已移除
}
