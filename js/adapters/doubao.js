/**
 * Doubao (豆包) Adapter
 * 
 * Supports: doubao.com
 * Features: Uses data-testid for selection, index-based ID, extracts from message_text_content
 */

class DoubaoAdapter extends SiteAdapter {
    constructor() {
        super();
    }

    matches(url) {
        return url.includes('doubao.com');
    }

    getUserMessageSelector() {
        return '[data-testid="send_message"]';
    }

    generateTurnId(element, index) {
        return `doubao-${index}`;
    }

    extractText(element) {
        // Extract from message_text_content element
        const textEl = element.querySelector('[data-testid="message_text_content"]');
        return textEl?.textContent?.trim() || '';
    }

    isConversationRoute(pathname) {
        // Doubao conversation URLs: /chat/数字ID
        return pathname.includes('/chat/');
    }

    extractConversationId(pathname) {
        try {
            // Extract conversation ID from /chat/数字 pattern
            const match = pathname.match(/\/chat\/(\d+)/);
            return match ? match[1] : null;
        } catch {
            return null;
        }
    }

    findConversationContainer(firstMessage) {
        // ✅ 豆包特殊处理：直接从消息向上找第一个可滚动容器
        // 避免找到侧边栏的滚动容器
        let parent = firstMessage;
        while (parent && parent !== document.body) {
            parent = parent.parentElement;
            if (!parent) break;
            
            const style = window.getComputedStyle(parent);
            const isScrollable = style.overflow === 'auto' || 
                               style.overflow === 'scroll' || 
                               style.overflowY === 'auto' || 
                               style.overflowY === 'scroll';
            
            // 找到第一个可滚动且包含消息的容器
            if (isScrollable && parent.scrollHeight > parent.clientHeight) {
                return parent;
            }
        }
        
        // 兜底：向上查找固定深度
        let container = firstMessage;
        for (let i = 0; i < 10 && container.parentElement && container.parentElement !== document.body; i++) {
            container = container.parentElement;
        }
        return container || firstMessage.parentElement;
    }
    
    /**
     * ✅ 豆包使用反向滚动布局（scrollTop=0在底部，负数向上）
     * 其他平台如果也有反向滚动，可以在适配器中添加此方法返回 true
     * @returns {boolean}
     */
    isReverseScroll() {
        return true;
    }

    getTimelinePosition() {
        // Doubao 位置配置（可根据实际情况调整）
        return {
            top: '120px',      // 避开顶部导航栏
            right: '22px',    // 右侧边距
            bottom: '120px',   // 避开底部输入框
        };
    }
    
    getStarChatButtonTarget() {
        // 返回分享按钮，收藏按钮将插入到它前面
        return document.querySelector('[data-testid="thread_share_btn_right_side"]');
    }
    
    getDefaultChatTheme() {
        // 豆包使用页面标题作为默认主题，并过滤尾部的 " - 豆包"
        const title = document.title || '';
        return title.replace(/\s*-\s*豆包\s*$/i, '').trim();
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
     * 检测豆包的深色模式
     * 豆包通过 html 元素的 data-theme 属性控制主题 (dark/light)
     * @returns {boolean}
     */
    detectDarkMode() {
        // 检查 html 的 data-theme 属性
        const theme = document.documentElement.getAttribute('data-theme');
        return theme === 'dark';
    }
}

