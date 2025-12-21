/**
 * Gemini Adapter
 * 
 * Supports: 
 *   - gemini.google.com/app/xxx
 *   - gemini.google.com/share/xxx
 *   - gemini.google.com/gem/xxx/xxx
 * Features: Angular custom element, index-based ID, filters Angular comment nodes
 */

class GeminiAdapter extends SiteAdapter {
    constructor() {
        super();
    }

    matches(url) {
        return matchesPlatform(url, 'gemini');
    }

    getUserMessageSelector() {
        return 'user-query';
    }

    /**
     * 从 DOM 元素中提取稳定的 nodeId
     * Gemini 的虚拟滚动会隐藏/重建节点，导致数组索引不可靠
     * 使用 user-query 父元素的 id 作为稳定标识
     * @param {Element} element - user-query 元素
     * @returns {string|null} - 父元素的 id，失败返回 null
     */
    _extractNodeIdFromDom(element) {
        if (!element) return null;
        
        // 获取 user-query 父元素的 id
        const parent = element.parentElement;
        if (parent && parent.id) {
            return parent.id;
        }
        return null;
    }
    
    /**
     * 生成节点的唯一标识 turnId
     * 优先使用父元素 id（稳定），回退到数组索引（兼容）
     */
    generateTurnId(element, index) {
        // 优先使用父元素的 id（稳定标识）
        const nodeId = this._extractNodeIdFromDom(element);
        if (nodeId) {
            return `gemini-${nodeId}`;
        }
        // 回退到数组索引（兼容旧逻辑）
        return `gemini-${index}`;
    }
    
    /**
     * 从存储的 nodeId 生成 turnId（用于收藏跳转）
     * @param {string|number} identifier - nodeId（字符串）或 index（数字）
     * @returns {string}
     */
    generateTurnIdFromIndex(identifier) {
        return `gemini-${identifier}`;
    }
    
    /**
     * 从 turnId 中提取 nodeId/index
     * @param {string} turnId - 格式为 gemini-{nodeId} 或 gemini-{index}
     * @returns {string|number|null} - nodeId（字符串）或 index（数字）
     */
    extractIndexFromTurnId(turnId) {
        if (!turnId) return null;
        if (turnId.startsWith('gemini-')) {
            const part = turnId.substring(7); // 'gemini-'.length = 7
            // 尝试解析为数字（旧数据兼容）
            const parsed = parseInt(part, 10);
            // 如果是纯数字字符串，返回数字；否则返回字符串
            return (String(parsed) === part) ? parsed : part;
        }
        return null;
    }
    
    /**
     * 根据存储的 nodeId/index 查找 marker
     * 支持新数据（nodeId 字符串）和旧数据（index 数字）
     * @param {string|number} storedKey - 存储的 nodeId 或 index
     * @param {Array} markers - markers 数组
     * @param {Map} markerMap - markerMap
     * @returns {Object|null}
     */
    findMarkerByStoredIndex(storedKey, markers, markerMap) {
        if (storedKey === null || storedKey === undefined) return null;
        
        // 1. 先尝试用 nodeId/index 构建 turnId 查找
        const turnId = `gemini-${storedKey}`;
        const marker = markerMap.get(turnId);
        if (marker) return marker;
        
        // 2. Fallback：如果是数字，尝试用数组索引（兼容旧数据）
        if (typeof storedKey === 'number' && storedKey >= 0 && storedKey < markers.length) {
            return markers[storedKey];
        }
        
        return null;
    }

    extractText(element) {
        // Extract from .query-text-line elements
        const lines = element.querySelectorAll('.query-text-line');
        const texts = Array.from(lines).map(line => {
            // Filter out Angular comment nodes and get text
            return Array.from(line.childNodes)
                .filter(node => node.nodeType === Node.TEXT_NODE)
                .map(node => node.textContent)
                .join('');
        });
        const text = texts.join(' ').replace(/\s+/g, ' ').trim();
        return text || '[图片或文件]';
    }

    isConversationRoute(pathname) {
        // Gemini conversation URLs: /app/xxx, /share/xxx, /gem/xxx/xxx
        return pathname.includes('/app/') || pathname.includes('/share/') || pathname.includes('/gem/');
    }

    extractConversationId(pathname) {
        try {
            // Extract conversation ID from /app/xxx pattern
            const appMatch = pathname.match(/\/app\/([A-Za-z0-9_-]+)/);
            if (appMatch) return appMatch[1];
            
            // Extract conversation ID from /share/xxx pattern
            const shareMatch = pathname.match(/\/share\/([A-Za-z0-9_-]+)/);
            if (shareMatch) return shareMatch[1];
            
            // Extract conversation ID from /gem/xxx/xxx pattern
            const gemMatch = pathname.match(/\/gem\/([A-Za-z0-9_-]+)\/([A-Za-z0-9_-]+)/);
            if (gemMatch) return `${gemMatch[1]}-${gemMatch[2]}`; // 拼接两部分作为唯一ID
            
            return null;
        } catch {
            return null;
        }
    }

    findConversationContainer(firstMessage) {
        // 查找对话容器 - 使用 LCA（最近共同祖先）算法
        return ContainerFinder.findConversationContainer(firstMessage, {
            messageSelector: this.getUserMessageSelector()
        });
    }

    getTimelinePosition() {
        // Gemini 需要更大的边距，避开顶部工具栏
        return {
            top: '120px',      // 避开顶部导航栏
            right: '22px',    // 右侧边距
            bottom: '120px',   // 避开底部输入框
        };
    }
    
    getStarChatButtonTarget() {
        // 查找 .top-bar-actions 下的 .right-section，插入到第一个元素的左边
        const topBarActions = document.querySelector('.top-bar-actions');
        if (!topBarActions) return null;
        
        const rightSection = topBarActions.querySelector('.right-section');
        if (!rightSection) return null;
        
        // 返回 right-section 的第一个子元素，收藏按钮将插入到它前面
        return rightSection.firstElementChild;
    }
    
    getDefaultChatTheme() {
        // Gemini 从特定 DOM 结构中提取对话标题
        try {
            // 1. 找到 data-test-id="conversation" 且 class 中包含 selected 的元素
            const conversations = document.querySelectorAll('[data-test-id="conversation"]');
            let selectedConversation = null;
            
            for (const conv of conversations) {
                if (conv.className.includes('selected')) {
                    selectedConversation = conv;
                    break;
                }
            }
            
            if (!selectedConversation) return '';
            
            // 2. 找到 conversation-title 元素
            const titleElement = selectedConversation.querySelector('.conversation-title');
            if (!titleElement) return '';
            
            // 3. 提取直接文本节点（排除其他元素节点）
            let textContent = '';
            for (const node of titleElement.childNodes) {
                if (node.nodeType === Node.TEXT_NODE) {
                    textContent += node.textContent || '';
                }
            }
            
            return textContent.trim();
        } catch {
            return '';
        }
    }
    
    /**
     * 检测是否应该隐藏时间轴
     * Gemini: 当存在沉浸式面板或生成式UI框架时隐藏
     * @returns {boolean}
     */
    shouldHideTimeline() {
        return document.querySelector('.ng-trigger-immersivePanelTransitions') !== null ||
               document.querySelector('generative-ui-frame') !== null;
    }
}

