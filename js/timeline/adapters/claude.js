/**
 * Claude Adapter
 * 
 * Supports: claude.ai/chat/{conversation_id}
 * 用户消息选择器: [data-testid="user-message"]
 * 文本位置: p 标签内
 */

class ClaudeAdapter extends SiteAdapter {
    constructor() {
        super();
    }

    matches(url) {
        return matchesPlatform(url, 'claude');
    }

    getUserMessageSelector() {
        return '[data-testid="user-message"]';
    }

    generateTurnId(element, index) {
        return `claude-${index}`;
    }

    extractText(element) {
        // 从 p 标签中提取文本内容
        const pElement = element.querySelector('p');
        const text = (pElement?.textContent || element.textContent || '').trim();
        return text || '[图片或文件]';
    }

    isConversationRoute(pathname) {
        // Claude 对话 URL: /chat/{uuid} 或分享页面 /share/{uuid}
        // UUID 格式: 78721a47-289d-46ad-b497-a47ec784247c
        return /^\/(chat|share)\/[a-f0-9-]+$/i.test(pathname);
    }

    extractConversationId(pathname) {
        try {
            // 从 /chat/{uuid} 或 /share/{uuid} 提取对话 ID
            const match = pathname.match(/^\/(chat|share)\/([a-f0-9-]+)$/i);
            if (match) return match[2];
            return null;
        } catch {
            return null;
        }
    }

    findConversationContainer(firstMessage) {
        /**
         * 查找对话容器
         * 使用 LCA（最近共同祖先）算法查找所有对话记录的最近父容器
         */
        return ContainerFinder.findConversationContainer(firstMessage, {
            messageSelector: this.getUserMessageSelector()
        });
    }

    getTimelinePosition() {
        // Claude 位置配置
        return {
            top: '120px',       // 避开顶部导航栏
            right: '22px',      // 右侧边距
            bottom: '120px',    // 避开底部输入框
        };
    }
    
    getStarChatButtonTarget() {
        // Claude: 暂时返回 null，后续可以根据实际 DOM 结构添加
        return null;
    }
    
    getDefaultChatTheme() {
        // Claude 使用页面标题作为默认主题，并过滤尾部的 " - Claude"
        const title = document.title || '';
        return title.replace(/\s*[-–]\s*Claude\s*$/i, '').trim();
    }
    
    /**
     * 检测是否应该隐藏时间轴
     * @returns {boolean}
     */
    shouldHideTimeline() {
        return false; // 默认不隐藏
    }
}

