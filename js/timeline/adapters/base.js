/**
 * Base Adapter for AI Chat Sites
 * 
 * All site-specific adapters should extend this class
 */

/**
 * Base class for site adapters
 * Each AI chat site needs to implement this interface
 */
class SiteAdapter {
    constructor() {
    }

    /**
     * Check if current URL matches this site
     * @param {string} url - Current page URL
     * @returns {boolean}
     */
    matches(url) {
        return false;
    }

    /**
     * Get CSS selector for user message elements
     * @returns {string}
     */
    getUserMessageSelector() {
        return '';
    }

    /**
     * Generate unique ID for a message (using index)
     * @param {Element} element - Message DOM element
     * @param {number} index - Message index in the list
     * @returns {string}
     */
    generateTurnId(element, index) {
        return `msg-${index}`;
    }

    /**
     * Extract text content from message element
     * @param {Element} element - Message DOM element
     * @returns {string}
     */
    extractText(element) {
        const text = (element.textContent || '').trim();
        return text || '[图片或文件]';
    }

    /**
     * Check if current path is a conversation page
     * @param {string} pathname - URL pathname
     * @returns {boolean}
     */
    isConversationRoute(pathname) {
        return false;
    }

    /**
     * Extract conversation ID from pathname (for storage key)
     * @param {string} pathname - URL pathname
     * @returns {string|null}
     */
    extractConversationId(pathname) {
        return null;
    }

    /**
     * Find conversation container element
     * @param {Element} firstMessage - First message element
     * @returns {Element|null}
     */
    findConversationContainer(firstMessage) {
        return firstMessage?.parentElement;
    }

    /**
     * Get timeline position configuration for this site
     * @returns {Object} - {top, right, bottom} in pixels or CSS values
     */
    getTimelinePosition() {
        return {
            top: '120px',      // 避开顶部导航栏
            right: '22px',    // 右侧边距
            bottom: '120px',   // 避开底部输入框
        };
    }
    
    /**
     * Get target element for inserting star chat button
     * @returns {Element|null} - Target element to insert before, or null if not supported
     */
    getStarChatButtonTarget() {
        return null; // 默认不支持，返回 null
    }
    
    /**
     * Get default chat theme for star chat feature
     * @returns {string} - Default theme name, empty string means no default
     */
    getDefaultChatTheme() {
        return ''; // 默认返回空字符串
    }
    
    /**
     * Detect if the site is in dark mode
     * 各平台 adapter 应该覆盖此方法以提供平台特定的检测逻辑
     * @returns {boolean} - true if dark mode is detected
     */
    detectDarkMode() {
        // 默认检测策略
        if (document.documentElement.classList.contains('dark')) {
            return true;
        }
        const bodyClasses = document.body.className.toLowerCase();
        if (bodyClasses.includes('dark')) {
            return true;
        }
        return false;
    }
    
    /**
     * Check if timeline should be hidden in current state
     * @returns {boolean} - true if timeline should be hidden
     */
    shouldHideTimeline() {
        return false; // 默认不隐藏
    }
    
}

