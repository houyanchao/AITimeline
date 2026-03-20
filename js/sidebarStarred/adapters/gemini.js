/**
 * Gemini Sidebar Starred Adapter
 *
 * Gemini 侧边栏 DOM 结构：
 *   SIDE-NAVIGATION-V2 > BARD-SIDENAV-CONTAINER > BARD-SIDENAV
 *     > SIDE-NAVIGATION-CONTENT > .sidenav-with-history-container
 *       > .overflow-container > INFINITE-SCROLLER
 *         ├── .side-nav-entry-container  (New Chat)
 *         ├── .gems-list-container       (Gems)
 *         ├── .ait-sidebar-starred       ← 收藏区域（插入位置）
 *         └── .chat-history              ← 聊天历史（参考锚点）
 *
 * 策略：
 *   findSidebarContainer → .chat-history 的父元素（INFINITE-SCROLLER）
 *   findInsertionPoint   → insertBefore(.chat-history)
 */

class GeminiSidebarStarredAdapter extends BaseSidebarStarredAdapter {
    matches() {
        return matchesPlatform(location.href, 'gemini');
    }

    findSidebarContainer() {
        const chatHistory = document.querySelector('.chat-history');
        if (chatHistory?.parentElement) return chatHistory.parentElement;

        return document.querySelector('side-navigation-v2') || null;
    }

    findInsertionPoint() {
        const chatHistory = document.querySelector('.chat-history');
        if (chatHistory && chatHistory.parentElement) {
            return { parent: chatHistory.parentElement, reference: chatHistory, position: 'before' };
        }

        // fallback：从 conversation 元素向上找可滚动容器
        const conv = document.querySelector('[data-test-id="conversation"]');
        if (conv) {
            let el = conv.parentElement;
            while (el && el !== document.body) {
                const style = getComputedStyle(el);
                if (style.overflowY === 'auto' || style.overflowY === 'scroll') {
                    return { parent: el, reference: null, position: 'prepend' };
                }
                el = el.parentElement;
            }
        }

        return null;
    }

    getPlatformClass() {
        return 'gemini';
    }

    navigateToConversation(url) {
        try {
            const convId = new URL(url).pathname.split('/').filter(Boolean).pop();
            if (!convId) return false;
            const link = document.querySelector(`.conversations-container a[href*="${convId}"]`);
            if (link) { link.click(); return true; }
        } catch { /* ignore */ }
        return false;
    }

    // ==================== 侧边栏收藏标记 ====================

    getConversationElements() {
        return document.querySelectorAll('.conversation-items-container');
    }

    getConversationUrlPath(convEl) {
        const link = convEl.querySelector('a[href]');
        if (!link) return '';
        try { return new URL(link.href).pathname; } catch { return ''; }
    }

    injectStarIcon(convEl) {
        const titleEl = convEl.querySelector('.conversation-title');
        if (!titleEl || titleEl.querySelector(`[${BaseSidebarStarredAdapter.STAR_ICON_ATTR}]`)) return;

        const icon = document.createElement('span');
        icon.setAttribute(BaseSidebarStarredAdapter.STAR_ICON_ATTR, 'true');
        icon.className = 'ait-conv-starred-icon';
        icon.innerHTML = '<svg viewBox="0 0 24 24" width="14" height="14" fill="rgb(255, 125, 3)" stroke="rgb(255, 125, 3)" stroke-width="1"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>';
        titleEl.insertBefore(icon, titleEl.firstChild);
    }

    removeStarIcon(convEl) {
        const icon = convEl.querySelector(`[${BaseSidebarStarredAdapter.STAR_ICON_ATTR}]`);
        if (icon) icon.remove();
    }

    // ==================== 原生菜单注入 ====================

    getClickDelegateSelector() {
        return '.conversation-actions-container';
    }

    /**
     * 第一步：从 .conversation-actions-container 向上找到对话项，提取 URL 和标题
     */
    getConversationFromClickTarget(actionsContainer) {
        const conv = actionsContainer.closest('.conversation-items-container');
        if (!conv) return null;

        const link = conv.querySelector('a[href]');
        if (!link) return null;

        let title = '';
        const titleEl = conv.querySelector('.conversation-title');
        if (titleEl) {
            for (const node of titleEl.childNodes) {
                if (node.nodeType === Node.TEXT_NODE) title += node.textContent || '';
            }
        }

        return { url: link.href, title: title.trim() };
    }

    findCurrentMenuOverlay() {
        const boxes = document.querySelectorAll('.cdk-overlay-connected-position-bounding-box');
        for (const box of boxes) {
            if (box.querySelector('button')) return box;
        }
        return null;
    }

    /**
     * 在菜单中找到 button 列表，克隆最后一个并插入收藏选项
     */
    createStarMenuItem(overlay, isStarred) {
        const buttons = overlay.querySelectorAll('button');
        if (buttons.length === 0) return null;

        const lastBtn = buttons[buttons.length - 1];
        const menuItem = lastBtn.cloneNode(true);
        menuItem.setAttribute('data-ait-star-folder', 'true');

        const label = isStarred
            ? (chrome.i18n.getMessage('bpxjkw') || 'Unstar')
            : (chrome.i18n.getMessage('nativeMenuStarToFolder') || 'Star to Folder');
        const spans = menuItem.querySelectorAll('span');
        if (spans.length > 0) {
            spans[spans.length - 1].textContent = label;
        } else {
            menuItem.textContent = label;
        }

        const icon = menuItem.querySelector('mat-icon');
        if (icon) {
            const iconName = isStarred ? 'star' : 'star_border';
            icon.setAttribute('fonticon', iconName);
            icon.setAttribute('data-mat-icon-name', iconName);
            icon.textContent = '';
            if (isStarred) icon.style.color = 'rgb(255, 125, 3)';
        }
        if (isStarred) menuItem.style.color = '#ef4444';

        const parentEl = lastBtn.parentElement;
        if (!parentEl) return null;
        const secondBtn = buttons[1] || null;
        parentEl.insertBefore(menuItem, secondBtn);
        return menuItem;
    }

    updateStarMenuItemState(menuItem, isStarred) {
        const label = isStarred
            ? (chrome.i18n.getMessage('bpxjkw') || 'Unstar')
            : (chrome.i18n.getMessage('nativeMenuStarToFolder') || 'Star to Folder');
        const spans = menuItem.querySelectorAll('span');
        if (spans.length > 0) spans[spans.length - 1].textContent = label;

        const icon = menuItem.querySelector('mat-icon');
        if (icon) {
            const iconName = isStarred ? 'star' : 'star_border';
            icon.setAttribute('fonticon', iconName);
            icon.setAttribute('data-mat-icon-name', iconName);
            icon.style.color = isStarred ? 'rgb(255, 125, 3)' : '';
        }
        menuItem.style.color = isStarred ? '#ef4444' : '';
    }

    closeNativeMenu() {
        const overlay = document.querySelector('.cdk-overlay-backdrop');
        if (overlay) {
            overlay.click();
        } else {
            document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
        }
    }
}
