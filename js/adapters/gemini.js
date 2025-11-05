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
        return url.includes('gemini.google.com');
    }

    getUserMessageSelector() {
        return 'user-query';
    }

    generateTurnId(element, index) {
        return `gemini-${index}`;
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
        return texts.join(' ').replace(/\s+/g, ' ').trim();
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
        // 使用统一的容器查找策略
        return ContainerFinder.findConversationContainer(firstMessage);
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
     * 初始化公式交互功能
     * @returns {FormulaManager|null} - 返回 FormulaManager 实例，如果不支持则返回 null
     */
    initFormulaInteraction() {
        // 检查是否存在 FormulaManager 类
        if (typeof FormulaManager === 'undefined') {
            console.warn('FormulaManager is not loaded');
            return null;
        }
        
        // 创建并初始化 FormulaManager
        const formulaManager = new FormulaManager();
        formulaManager.init();
        
        return formulaManager;
    }
    
    /**
     * 检测 Gemini 的深色模式
     * Gemini 通过 body 元素的 class 控制主题 (dark-theme/light-theme)
     * @returns {boolean}
     */
    detectDarkMode() {
        // 检查 body 的 class 中是否有 dark-theme
        return document.body.classList.contains('dark-theme');
    }
}

