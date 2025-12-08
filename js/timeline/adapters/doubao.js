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
        return matchesPlatform(url, 'doubao');
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
        const text = (textEl?.textContent || '').trim();
        return text || '[图片或文件]';
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
        /**
         * 查找对话容器
         * 
         * 使用 LCA（最近共同祖先）算法查找所有对话记录的最近父容器。
         * 传递 messageSelector 参数，让 ContainerFinder 能够：
         * 1. 查询所有用户消息元素
         * 2. 找到它们的最近共同祖先
         * 3. 确保容器是直接包裹所有对话的最小容器
         * 
         * 优势：比传统的向上遍历更精确，避免找到过于外层的容器
         */
        return ContainerFinder.findConversationContainer(firstMessage, {
            messageSelector: this.getUserMessageSelector()
        });
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

