/**
 * Kimi Adapter
 * 
 * Supports: kimi.com, kimi.com/share/*
 * Features: 固定 class 名 user-content
 */

class KimiAdapter extends SiteAdapter {
    constructor() {
        super();
    }

    matches(url) {
        return url.includes('kimi.com');
    }

    getUserMessageSelector() {
        // Kimi 使用固定的 class 名
        return '.user-content';
    }

    generateTurnId(element, index) {
        return `kimi-${index}`;
    }

    extractText(element) {
        // 文本直接在元素中
        return element.textContent?.trim() || '';
    }

    isConversationRoute(pathname) {
        // Kimi 对话 URL: /chat/{id} 或分享页面 /share/{id}
        return pathname.includes('/chat/') || pathname.includes('/share/');
    }

    extractConversationId(pathname) {
        try {
            // 从 /chat/cuq3h25m2citjh45prb0 或 /share/xxx 提取对话 ID
            const chatMatch = pathname.match(/\/chat\/([^\/]+)/);
            if (chatMatch) return chatMatch[1];
            
            const shareMatch = pathname.match(/\/share\/([^\/]+)/);
            if (shareMatch) return shareMatch[1];
            
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
        // Kimi 位置配置
        return {
            top: '120px',       // 避开顶部导航栏
            right: '22px',     // 右侧边距
            bottom: '120px',    // 避开底部输入框
        };
    }
    
    getStarChatButtonTarget() {
        // 返回 chat-header-actions 下的 icon 元素，收藏按钮将插入到它前面
        const headerActions = document.querySelector('.chat-header-actions');
        if (!headerActions) return null;
        return headerActions.querySelector('.icon');
    }
    
    getDefaultChatTheme() {
        // Kimi 使用页面标题作为默认主题，并过滤尾部的 " - Kimi"
        const title = document.title || '';
        return title.replace(/\s*-\s*Kimi\s*$/i, '').trim();
    }
    
    /**
     * 检测 Kimi 的深色模式
     * Kimi 通过 html 元素的 class 控制主题 (dark/light)
     * @returns {boolean}
     */
    detectDarkMode() {
        // 检查 html 的 class 中是否有 dark
        return document.documentElement.classList.contains('dark');
    }
}

