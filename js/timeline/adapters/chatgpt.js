/**
 * ChatGPT Adapter
 * 
 * Supports: 
 *   - chatgpt.com/c/xxx (普通对话)
 *   - chatgpt.com/g/xxx/c/xxx (GPT 对话)
 *   - chatgpt.com/share/e/xxx (分享页面)
 *   - chat.openai.com (旧域名)
 */

class ChatGPTAdapter extends SiteAdapter {
    constructor() {
        super();
    }

    matches(url) {
        return matchesPlatform(url, 'chatgpt');
    }

    getUserMessageSelector() {
        return '[data-message-author-role="user"]';
    }

    generateTurnId(element, index) {
        // 使用 index 作为唯一标识，与其他 AI 平台保持一致
        return `chatgpt-${index}`;
    }

    extractText(element) {
        // 从 whitespace-pre-wrap 类的元素中提取文本内容
        const textElement = element.querySelector('.whitespace-pre-wrap');
        const text = (textElement?.textContent || '').replace(/\s+/g, ' ').trim();
        return text || '[图片或文件]';
    }

    isConversationRoute(pathname) {
        const segs = pathname.split('/').filter(Boolean);
        
        // 检查普通对话路径: /c/{id}
        const cIndex = segs.indexOf('c');
        if (cIndex !== -1) {
            const slug = segs[cIndex + 1];
            if (typeof slug === 'string' && slug.length > 0 && /^[A-Za-z0-9_-]+$/.test(slug)) {
                return true;
            }
        }
        
        // 检查 GPT 对话路径: /g/{gpt_id}/c/{conversation_id}
        const gIndex = segs.indexOf('g');
        if (gIndex !== -1 && segs[gIndex + 2] === 'c') {
            const gptId = segs[gIndex + 1];
            const conversationId = segs[gIndex + 3];
            if (gptId && conversationId && 
                /^[A-Za-z0-9_-]+$/.test(gptId) && 
                /^[A-Za-z0-9_-]+$/.test(conversationId)) {
                return true;
            }
        }
        
        // 检查分享页面路径: /share/e/{id}
        const shareIndex = segs.indexOf('share');
        if (shareIndex !== -1 && segs[shareIndex + 1] === 'e') {
            const shareId = segs[shareIndex + 2];
            if (typeof shareId === 'string' && shareId.length > 0 && /^[A-Za-z0-9_-]+$/.test(shareId)) {
                return true;
            }
        }
        
        return false;
    }

    extractConversationId(pathname) {
        try {
            const segs = pathname.split('/').filter(Boolean);
            
            // 尝试提取 GPT 对话 ID: /g/{gpt_id}/c/{conversation_id}
            const gIndex = segs.indexOf('g');
            if (gIndex !== -1 && segs[gIndex + 2] === 'c') {
                const conversationId = segs[gIndex + 3];
                if (conversationId && /^[A-Za-z0-9_-]+$/.test(conversationId)) return conversationId;
            }
            
            // 尝试提取普通对话 ID: /c/{id}
            const cIndex = segs.indexOf('c');
            if (cIndex !== -1) {
                const slug = segs[cIndex + 1];
                if (slug && /^[A-Za-z0-9_-]+$/.test(slug)) return slug;
            }
            
            // 尝试提取分享页面 ID: /share/e/{id}
            const shareIndex = segs.indexOf('share');
            if (shareIndex !== -1 && segs[shareIndex + 1] === 'e') {
                const shareId = segs[shareIndex + 2];
                if (shareId && /^[A-Za-z0-9_-]+$/.test(shareId)) return shareId;
            }
            
            return null;
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

    getTimelinePosition() {
        // ChatGPT 默认位置
        return {
            top: '120px',      // 避开顶部导航栏
            right: '22px',    // 右侧边距
            bottom: '120px',   // 避开底部输入框
        };
    }
    
    getStarChatButtonTarget() {
        // 返回分享按钮，收藏按钮将插入到它前面
        return document.querySelector('[data-testid="share-chat-button"]');
    }
    
    getDefaultChatTheme() {
        // ChatGPT 使用页面标题作为默认主题
        return document.title || '';
    }
    
    /**
     * 检测 ChatGPT 的深色模式
     * ChatGPT 通过 html 元素的 style.colorScheme 控制主题
     * @returns {boolean}
     */
    detectDarkMode() {
        // 检查 html 元素的 color-scheme 样式
        const colorScheme = document.documentElement.style.colorScheme;
        return colorScheme === 'dark';
    }
    
    /**
     * 检测是否应该隐藏时间轴
     * ChatGPT: 当页面存在 .text-token-primary 元素时隐藏
     * @returns {boolean}
     */
    shouldHideTimeline() {
        return document.querySelector('.text-token-primary') !== null;
    }
}

