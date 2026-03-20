/**
 * StarredTreeRenderer - 收藏列表树渲染器（共享）
 *
 * 统一侧边栏和 Tab 两个场景的树结构渲染 + 交互逻辑。
 * 消费方通过 options 注入场景差异（搜索、平台图标、Toast 样式等）。
 *
 * @example
 * const renderer = new StarredTreeRenderer({
 *     scene: 'tab',
 *     showSearch: true,
 *     showPlatformIcon: true,
 *     folderManager,
 *     getSearchQuery: () => this.getState('searchQuery'),
 *     ...
 * });
 * renderer.renderTree(tree);
 */

class StarredTreeRenderer {

    /**
     * @param {Object} opts
     * @param {string}   opts.scene            - 'tab' | 'sidebar'
     * @param {boolean}  opts.showSearch        - 搜索过滤（sidebar: false, tab: true）
     * @param {boolean}  opts.showPlatformIcon  - 收藏项是否显示平台 logo
     * @param {string}   opts.emptyClass        - 空状态 CSS class
     * @param {Object}   opts.toastOptions      - Toast 额外参数（如 { color }）
     * @param {number}   [opts.tooltipGap]      - Tooltip gap
     * @param {Object}   opts.folderManager     - FolderManager 实例
     * @param {Function} opts.getSearchQuery    - () => string
     * @param {Function} opts.getFolderStates   - () => object
     * @param {Function} opts.setFolderStates   - (states) => void
     * @param {Function} opts.getListContainer  - () => HTMLElement|null
     * @param {Function} opts.onAfterAction     - 数据变更后的刷新回调
     * @param {Function} [opts.onAfterNavigate] - 导航后回调（tab: 关闭弹窗）
     */
    constructor(opts) {
        this.opts = Object.assign({
            scene: 'tab',
            showSearch: false,
            showPlatformIcon: false,
            emptyClass: 'timeline-starred-empty',
            toastOptions: {},
            tooltipGap: undefined,
            folderManager: null,
            getSearchQuery: () => '',
            getFolderStates: () => ({}),
            setFolderStates: () => {},
            getListContainer: () => null,
            onAfterAction: async () => {},
            onAfterNavigate: () => {},
        }, opts);

        this.folderManager = this.opts.folderManager;
        this._folderDataMap = new Map();
        this._itemDataMap = new Map();
        this._delegateContainer = null;
        this._delegateHandlers = null;
        this._urlChangeHandler = () => this._refreshActiveState();
        window.addEventListener('url:change', this._urlChangeHandler);

        const isMac = /Mac|iPhone|iPad|iPod/.test(navigator.platform) ||
            (navigator.userAgentData && navigator.userAgentData.platform === 'macOS');
        const gTop = isMac ? '#6CC4F8' : '#FFD666';
        const gBot = isMac ? '#3B9FE7' : '#E5A520';
        const id = this.opts.scene === 'sidebar' ? 'ss' : 'st';
        this._folderSvgClosed = `<svg viewBox="0 0 24 24" width="16" height="16" fill="none"><defs><linearGradient id="${id}-fc" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="${gTop}"/><stop offset="100%" stop-color="${gBot}"/></linearGradient></defs><path d="M10 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2h-8l-2-2z" fill="url(#${id}-fc)"/></svg>`;
        this._folderSvgOpen  = `<svg viewBox="0 0 24 24" width="16" height="16" fill="none"><defs><linearGradient id="${id}-fo" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="${gTop}"/><stop offset="100%" stop-color="${gBot}"/></linearGradient></defs><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" stroke="url(#${id}-fo)" stroke-width="2" fill="none"/></svg>`;
    }

    // ==================== 树渲染 ====================

    renderTree(tree) {
        const list = this.opts.getListContainer();
        if (!list) return;

        if (this._delegateContainer !== list) {
            this._unbindContainerDelegation();
            this._bindContainerDelegation(list);
            this._delegateContainer = list;
        }

        this._folderDataMap.clear();
        this._itemDataMap.clear();

        if (window.globalTooltipManager?.forceHideAll) {
            window.globalTooltipManager.forceHideAll();
        }

        list.innerHTML = '';

        if (tree.folders.length === 0 && tree.uncategorized.length === 0) {
            if (this.opts.scene === 'sidebar') list.style.display = 'none';
            return;
        }
        list.style.display = '';

        for (const folder of tree.folders) {
            this.renderFolder(folder, list);
        }

        if (tree.uncategorized.length > 0) {
            this._renderDefaultFolder(tree.uncategorized, list);
        }
        const searchQuery = this.opts.showSearch ? this.opts.getSearchQuery() : '';
        if (searchQuery && list.children.length === 0) {
            list.innerHTML = `
                <div class="${this.opts.emptyClass}">
                    <div style="margin-bottom:8px;">未找到匹配的收藏</div>
                    <div style="font-size:13px;color:#9ca3af;">
                        搜索关键词：<strong>"${this._escapeHtml(searchQuery)}"</strong>
                    </div>
                </div>`;
        }
    }

    renderFolder(folder, container, level = 0) {
        const searchQuery = this.opts.showSearch ? this.opts.getSearchQuery() : '';
        const folderStates = this.opts.getFolderStates();

        let filteredItems = folder.items;
        let folderNameMatches = false;

        if (searchQuery) {
            folderNameMatches = folder.name.toLowerCase().includes(searchQuery);
            filteredItems = folderNameMatches
                ? folder.items
                : folder.items.filter(item => this._matchesSearch(item, searchQuery));

            const hasMatchingChildren = (folder.children || []).some(child => {
                const childNameMatches = child.name.toLowerCase().includes(searchQuery);
                const childHasItems = child.items.some(item => this._matchesSearch(item, searchQuery));
                return childNameMatches || childHasItems;
            });

            if (!folderNameMatches && filteredItems.length === 0 && !hasMatchingChildren) {
                return;
            }
        }

        const isExpanded = searchQuery ? true : (folderStates[folder.id] === true);

        this._folderDataMap.set(folder.id, { folder, level });

        const folderEl = document.createElement('div');
        folderEl.className = `ait-folder-item ait-folder-level-${level}`;
        folderEl.dataset.folderId = folder.id;

        const header = document.createElement('div');
        header.className = 'ait-folder-header';

        const toggle = document.createElement('span');
        toggle.className = `ait-folder-toggle ${isExpanded ? 'expanded' : ''}`;
        toggle.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 6 15 12 9 18"></polyline></svg>';

        const info = document.createElement('div');
        info.className = 'ait-folder-info';
        const iconHtml = folder.icon
            ? this._escapeHtml(folder.icon)
            : (isExpanded ? this._folderSvgOpen : this._folderSvgClosed);
        info.innerHTML = `<span class="ait-folder-icon">${iconHtml}</span><span class="ait-folder-name">${this._escapeHtml(folder.name)}</span>`;
        info.style.cursor = 'pointer';

        const actions = document.createElement('div');
        actions.className = 'ait-folder-actions';

        if (folder.pinned) {
            const pinIcon = document.createElement('span');
            pinIcon.className = 'ait-pin-indicator';
            pinIcon.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="#facc15" stroke-width="2.5"><line x1="5" y1="3" x2="19" y2="3"/><line x1="12" y1="7" x2="12" y2="21"/><polyline points="8 11 12 7 16 11"/></svg>';
            actions.appendChild(pinIcon);
        }

        const actBtn = document.createElement('button');
        actBtn.className = 'ait-folder-action-btn';
        actBtn.innerHTML = '<svg viewBox="0 0 24 24" fill="currentColor"><circle cx="5" cy="12" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="19" cy="12" r="2"/></svg>';
        actions.appendChild(actBtn);

        header.appendChild(toggle);
        header.appendChild(info);
        header.appendChild(actions);
        folderEl.appendChild(header);

        const content = document.createElement('div');
        content.className = `ait-folder-content ${isExpanded ? 'expanded' : ''}`;

        for (const item of filteredItems) {
            content.appendChild(this.renderStarredItem(item));
        }
        if (folder.children && folder.children.length > 0) {
            for (const child of folder.children) {
                this.renderFolder(child, content, level + 1);
            }
        }

        folderEl.appendChild(content);
        container.appendChild(folderEl);
    }

    _renderDefaultFolder(items, container) {
        const searchQuery = this.opts.showSearch ? this.opts.getSearchQuery() : '';
        const folderStates = this.opts.getFolderStates();

        const filteredItems = searchQuery
            ? items.filter(item => this._matchesSearch(item, searchQuery))
            : items;

        if (searchQuery && filteredItems.length === 0) return;

        const isExpanded = searchQuery ? true : (folderStates['__default__'] !== false);

        const folderEl = document.createElement('div');
        folderEl.className = 'ait-folder-item ait-folder-level-0 default-folder';
        folderEl.dataset.folderId = '__default__';

        const header = document.createElement('div');
        header.className = 'ait-folder-header';

        const toggle = document.createElement('span');
        toggle.className = `ait-folder-toggle ${isExpanded ? 'expanded' : ''}`;
        toggle.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 6 15 12 9 18"></polyline></svg>';

        const info = document.createElement('div');
        info.className = 'ait-folder-info';
        info.innerHTML = `<span class="ait-folder-icon">${isExpanded ? this._folderSvgOpen : this._folderSvgClosed}</span><span class="ait-folder-name">${chrome.i18n.getMessage('defaultFolder') || 'Default'}</span>`;
        info.style.cursor = 'pointer';

        header.appendChild(toggle);
        header.appendChild(info);
        folderEl.appendChild(header);

        const content = document.createElement('div');
        content.className = `ait-folder-content ${isExpanded ? 'expanded' : ''}`;

        for (const item of filteredItems) {
            content.appendChild(this.renderStarredItem(item));
        }

        folderEl.appendChild(content);
        container.appendChild(folderEl);
    }

    renderStarredItem(item) {
        this._itemDataMap.set(item.turnId, item);

        const el = document.createElement('div');
        el.className = 'timeline-starred-item';
        el.dataset.turnId = item.turnId;

        if (this._isCurrentPage(item)) {
            el.classList.add('active');
        }

        if (this.opts.showPlatformIcon) {
            const siteInfo = getSiteInfoByUrl(item.url);
            const logo = document.createElement('div');
            logo.className = 'timeline-starred-item-logo';
            if (siteInfo.logo) {
                const img = document.createElement('img');
                img.src = siteInfo.logo;
                img.alt = siteInfo.name;
                logo.appendChild(img);
            } else {
                const initial = document.createElement('div');
                initial.className = 'timeline-starred-item-initial';
                initial.textContent = siteInfo.name.charAt(0).toUpperCase();
                logo.appendChild(initial);
            }
            el.appendChild(logo);
        }

        const name = document.createElement('div');
        name.className = 'timeline-starred-item-name';
        name.textContent = item.theme;
        el.appendChild(name);

        const actionsWrap = document.createElement('div');
        actionsWrap.className = 'timeline-starred-item-actions';

        if (item.pinned) {
            const pinIcon = document.createElement('span');
            pinIcon.className = 'ait-pin-indicator';
            pinIcon.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="#facc15" stroke-width="2.5"><line x1="5" y1="3" x2="19" y2="3"/><line x1="12" y1="7" x2="12" y2="21"/><polyline points="8 11 12 7 16 11"/></svg>';
            actionsWrap.appendChild(pinIcon);
        }

        const moreBtn = document.createElement('button');
        moreBtn.className = 'timeline-starred-item-more';
        moreBtn.innerHTML = '<svg viewBox="0 0 24 24" fill="currentColor"><circle cx="5" cy="12" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="19" cy="12" r="2"/></svg>';
        actionsWrap.appendChild(moreBtn);
        el.appendChild(actionsWrap);

        return el;
    }

    // ==================== 容器级事件委托 ====================

    _bindContainerDelegation(container) {
        let hoveredName = null;

        const onClick = (e) => {
            const toggle = e.target.closest('.ait-folder-toggle');
            if (toggle) {
                const folderEl = toggle.closest('.ait-folder-item');
                if (folderEl) this.toggleFolder(folderEl.dataset.folderId);
                return;
            }

            const info = e.target.closest('.ait-folder-info');
            if (info) {
                const folderEl = info.closest('.ait-folder-item');
                if (folderEl) this.toggleFolder(folderEl.dataset.folderId);
                return;
            }

            const actBtn = e.target.closest('.ait-folder-action-btn');
            if (actBtn) {
                e.stopPropagation();
                const folderEl = actBtn.closest('.ait-folder-item');
                if (folderEl) {
                    const data = this._folderDataMap.get(folderEl.dataset.folderId);
                    if (data) this._showFolderMenu(actBtn, data.folder, data.level);
                }
                return;
            }

            if (e.target.closest('.timeline-starred-item-name')) {
                const itemEl = e.target.closest('.timeline-starred-item');
                if (itemEl) {
                    const item = this._itemDataMap.get(itemEl.dataset.turnId);
                    if (item) this._navigateToItem(item);
                }
                return;
            }

            const moreBtn = e.target.closest('.timeline-starred-item-more');
            if (moreBtn) {
                e.stopPropagation();
                const itemEl = moreBtn.closest('.timeline-starred-item');
                if (itemEl) {
                    const item = this._itemDataMap.get(itemEl.dataset.turnId);
                    if (item) this._showItemMenu(moreBtn, item);
                }
                return;
            }
        };

        const onMouseover = (e) => {
            const name = e.target.closest('.timeline-starred-item-name');
            if (name === hoveredName) return;
            if (hoveredName) { window.globalTooltipManager?.hide(); hoveredName = null; }
            if (!name || name.scrollWidth <= name.clientWidth) return;
            if (!window.globalTooltipManager) return;
            const itemEl = name.closest('.timeline-starred-item');
            const item = itemEl ? this._itemDataMap.get(itemEl.dataset.turnId) : null;
            if (!item) return;
            hoveredName = name;
            const tipOpts = { placement: 'right' };
            if (this.opts.tooltipGap !== undefined) tipOpts.gap = this.opts.tooltipGap;
            window.globalTooltipManager.show('starred-item-name', 'button', itemEl, item.theme, tipOpts);
        };

        const onMouseout = (e) => {
            const name = e.target.closest('.timeline-starred-item-name');
            if (name && !name.contains(e.relatedTarget)) {
                hoveredName = null;
                window.globalTooltipManager?.hide();
            }
        };

        container.addEventListener('click', onClick);
        container.addEventListener('mouseover', onMouseover);
        container.addEventListener('mouseout', onMouseout);

        this._delegateHandlers = { container, onClick, onMouseover, onMouseout };
    }

    _unbindContainerDelegation() {
        if (!this._delegateHandlers) return;
        const { container, onClick, onMouseover, onMouseout } = this._delegateHandlers;
        container.removeEventListener('click', onClick);
        container.removeEventListener('mouseover', onMouseover);
        container.removeEventListener('mouseout', onMouseout);
        this._delegateHandlers = null;
    }

    // ==================== 展开 / 折叠 ====================

    toggleFolder(folderId) {
        const states = this.opts.getFolderStates();
        states[folderId] = !states[folderId];
        this.opts.setFolderStates(states);

        const list = this.opts.getListContainer();
        if (!list) return;

        const folderEl = list.querySelector(`[data-folder-id="${folderId}"]`);
        if (!folderEl) return;

        const toggle = folderEl.querySelector('.ait-folder-toggle');
        const content = folderEl.querySelector('.ait-folder-content');
        const icon = folderEl.querySelector('.ait-folder-icon');
        const expanded = states[folderId];

        if (toggle) toggle.classList.toggle('expanded', expanded);
        if (content) content.classList.toggle('expanded', expanded);
        if (icon && !icon.textContent.trim()) {
            icon.innerHTML = expanded ? this._folderSvgOpen : this._folderSvgClosed;
        }
    }

    // ==================== 菜单 ====================

    _showFolderMenu(trigger, folder, level) {
        const items = [];

        if (level === 0) {
            items.push({
                label: chrome.i18n.getMessage('vpmzkx') || 'New Subfolder',
                icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/><line x1="12" y1="11" x2="12" y2="17"/><line x1="9" y1="14" x2="15" y2="14"/></svg>',
                onClick: () => this.handleCreateFolder(folder.id)
            });
        }

        items.push({
            label: folder.pinned ? (chrome.i18n.getMessage('unpinItem') || 'Unpin') : (chrome.i18n.getMessage('pinItem') || 'Pin to top'),
            icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="5" y1="3" x2="19" y2="3"/><line x1="12" y1="7" x2="12" y2="21"/><polyline points="8 11 12 7 16 11"/></svg>',
            onClick: () => this._handleTogglePinFolder(folder.id)
        });

        items.push({
            label: chrome.i18n.getMessage('xvkpmz') || 'Edit',
            icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>',
            onClick: () => this.handleEditFolder(folder.id, folder.name)
        });

        items.push({ type: 'divider' });

        items.push({
            label: chrome.i18n.getMessage('mzxvkp') || 'Delete',
            icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></svg>',
            className: 'danger',
            onClick: () => this.handleDeleteFolder(folder.id)
        });

        window.globalDropdownManager.show({ trigger, items, position: 'bottom-right', width: 160 });
    }

    async _showItemMenu(trigger, item) {
        const items = [
            {
                label: item.pinned ? (chrome.i18n.getMessage('unpinItem') || 'Unpin') : (chrome.i18n.getMessage('pinItem') || 'Pin to top'),
                icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="5" y1="3" x2="19" y2="3"/><line x1="12" y1="7" x2="12" y2="21"/><polyline points="8 11 12 7 16 11"/></svg>',
                onClick: () => this._handleTogglePinStarred(item.turnId)
            },
            {
                label: chrome.i18n.getMessage('vkpxzm') || 'Edit',
                icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>',
                onClick: () => this.handleEditStarred(item.turnId, item.theme, item.folderId)
            },
            {
                label: chrome.i18n.getMessage('vxkpmz') || 'Move to',
                icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="17 1 21 5 17 9"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/><polyline points="7 23 3 19 7 15"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/></svg>',
                onClick: () => this.handleEditStarred(item.turnId, item.theme, item.folderId)
            },
            {
                label: chrome.i18n.getMessage('mvkxpz') || 'Copy',
                icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>',
                onClick: () => this.handleCopy(item.theme)
            },
            { type: 'divider' },
            {
                label: chrome.i18n.getMessage('bpxjkw') || 'Unstar',
                icon: '<svg viewBox="0 0 24 24" fill="rgb(255, 125, 3)" stroke="rgb(255, 125, 3)" stroke-width="0.5"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>',
                className: 'danger',
                onClick: () => this.handleUnstar(item.turnId)
            }
        ];

        window.globalDropdownManager.show({ trigger, items, position: 'bottom-right', width: 160 });
    }

    // ==================== 操作（CRUD） ====================

    _toast(type, msgKey, fallback) {
        if (!window.globalToastManager) return;
        const o = this.opts.toastOptions;
        const hasOpts = o && Object.keys(o).length > 0;
        window.globalToastManager[type](
            chrome.i18n.getMessage(msgKey) || fallback,
            null,
            hasOpts ? o : undefined
        );
    }

    async handleCreateFolder(parentId = null) {
        if (!window.folderEditModal) return;
        try {
            const parentPath = parentId ? await this.folderManager.getFolderPath(parentId) : '';
            const title = parentId
                ? (chrome.i18n.getMessage('xmkvpz') || 'New subfolder in {folderName}').replace('{folderName}', parentPath)
                : chrome.i18n.getMessage('kxvpmz') || 'New Folder';

            const result = await window.folderEditModal.show({
                mode: 'create', title,
                placeholder: chrome.i18n.getMessage('vzkpmx') || 'Folder name',
                requiredMessage: chrome.i18n.getMessage('kmxpvz') || 'Name is required',
                maxLength: 10
            });
            if (!result) return;

            const exists = await this.folderManager.isFolderNameExists(result.name, parentId);
            if (exists) { this._toast('error', 'kpvzmx', 'Name already exists'); return; }

            await this.folderManager.createFolder(result.name, parentId, result.icon);
            this._toast('success', 'xzvkpm', 'Created');
            await this.opts.onAfterAction();
        } catch (error) {
            console.error('[StarredTreeRenderer] Create folder failed:', error);
            if (error.message) this._toast('error', '', error.message);
        }
    }

    async handleEditFolder(folderId, currentName) {
        if (!window.folderEditModal) return;
        try {
            const folders = await this.folderManager.getFolders();
            const folder = folders.find(f => f.id === folderId);
            if (!folder) return;
            const parentId = folder.parentId || null;

            const result = await window.folderEditModal.show({
                mode: 'edit',
                title: chrome.i18n.getMessage('pxmzvk') || 'Edit Folder',
                name: currentName,
                icon: folder.icon || '',
                placeholder: chrome.i18n.getMessage('mvzxkp') || 'Folder name',
                maxLength: 10
            });
            if (!result) return;

            const nameChanged = result.name !== currentName;
            const iconChanged = result.icon !== (folder.icon || '');
            if (!nameChanged && !iconChanged) return;

            if (nameChanged) {
                const exists = await this.folderManager.isFolderNameExists(result.name, parentId, folderId);
                if (exists) { this._toast('error', 'kpvzmx', 'Name already exists'); return; }
            }

            await this.folderManager.updateFolder(folderId, result.name, result.icon);
            this._toast('success', 'folderUpdated', 'Updated');
            await this.opts.onAfterAction();
        } catch (error) {
            console.error('[StarredTreeRenderer] Edit folder failed:', error);
        }
    }

    async handleDeleteFolder(folderId) {
        try {
            const tree = await this.folderManager.getStarredByFolder();
            let folderData = tree.folders.find(f => f.id === folderId);
            if (!folderData) {
                for (const parent of tree.folders) {
                    if (parent.children) {
                        folderData = parent.children.find(c => c.id === folderId);
                        if (folderData) break;
                    }
                }
            }
            if (!folderData) { this._toast('error', 'zpxmkv', 'Folder not found'); return; }

            const totalItems = this._countAllItems(folderData);
            const title = (chrome.i18n.getMessage('qzmvkx') || 'Delete folder "{folderName}"?')
                .replace('{folderName}', folderData.name);
            const content = totalItems > 0
                ? (chrome.i18n.getMessage('wjxnkp') || '{count} starred items inside will also be deleted.')
                    .replace('{count}', totalItems)
                : '';

            const confirmed = await window.globalPopconfirmManager.show({
                title,
                content,
                confirmTextType: 'danger'
            });
            if (!confirmed) return;
            await this.folderManager.deleteFolder(folderId);
            this._toast('success', 'kvpzmx', 'Deleted');
            await this.opts.onAfterAction();
        } catch (error) {
            console.error('[StarredTreeRenderer] Delete folder failed:', error);
            this._toast('error', 'mxkvzp', 'Delete failed');
        }
    }

    async _handleTogglePinFolder(folderId) {
        try {
            await this.folderManager.togglePinFolder(folderId);
            await this.opts.onAfterAction();
        } catch (error) {
            console.error('[StarredTreeRenderer] Toggle pin folder failed:', error);
        }
    }

    async _handleTogglePinStarred(turnId) {
        try {
            await this.folderManager.togglePinStarred(turnId);
            await this.opts.onAfterAction();
        } catch (error) {
            console.error('[StarredTreeRenderer] Toggle pin starred failed:', error);
        }
    }

    async handleEditStarred(turnId, currentTheme, currentFolderId) {
        if (!window.starInputModal) return;
        try {
            const result = await window.starInputModal.show({
                title: chrome.i18n.getMessage('vkpxzm') || 'Edit',
                defaultValue: currentTheme,
                placeholder: chrome.i18n.getMessage('zmxvkp') || 'Title',
                folderManager: this.folderManager,
                defaultFolderId: currentFolderId || null
            });
            if (!result || !result.value?.trim()) return;

            const key = `chatTimelineStar:${turnId}`;
            const item = await StarStorageManager.findByKey(key);
            if (item) {
                const updates = {};
                if (result.value.trim() !== currentTheme) updates.question = result.value.trim();
                if (result.folderId !== (currentFolderId || null)) updates.folderId = result.folderId;
                if (Object.keys(updates).length > 0) {
                    await StarStorageManager.update(key, updates);
                    this._toast('success', 'vmkxpz', 'Updated');
                    await this.opts.onAfterAction();
                }
            }
        } catch (error) {
            console.error('[StarredTreeRenderer] Edit starred failed:', error);
        }
    }

    async handleCopy(text) {
        try {
            await navigator.clipboard.writeText(text);
            this._toast('success', 'xpzmvk', 'Copied');
        } catch {
            const ta = document.createElement('textarea');
            ta.value = text;
            ta.style.cssText = 'position:fixed;opacity:0';
            document.body.appendChild(ta);
            ta.select();
            try { document.execCommand('copy'); this._toast('success', 'xpzmvk', 'Copied'); }
            catch { this._toast('error', 'kpzmvx', 'Copy failed'); }
            finally { document.body.removeChild(ta); }
        }
    }

    async handleUnstar(turnId) {
        try {
            const key = `chatTimelineStar:${turnId}`;
            await StarStorageManager.remove(key);
            this._toast('success', 'pzmvkx', 'Unstarred');
            await this.opts.onAfterAction();
        } catch (error) {
            console.error('[StarredTreeRenderer] Unstar failed:', error);
        }
    }

    // ==================== 点击导航 ====================

    async _navigateToItem(item) {
        const url = item.url || `https://${item.urlWithoutProtocol}`;
        const nodeKey = item.nodeId !== undefined ? item.nodeId : item.index;
        const needsScroll = nodeKey !== undefined && nodeKey !== -1;
        const isSamePage = location.href === url ||
            location.href.replace(/^https?:\/\//, '') === url.replace(/^https?:\/\//, '');

        if (isSamePage) {
            const tm = window.timelineManager;
            if (needsScroll && tm) {
                const marker = this._findMarker(tm, nodeKey);
                if (marker?.element) tm.smoothScrollTo(marker.element);
            }
            this.opts.onAfterNavigate();
        } else if (this._isSameSite(url)) {
            if (needsScroll && window.timelineManager) {
                await window.timelineManager.setNavigateDataForUrl(url, nodeKey);
            }
            const adapter = window.sidebarStarredAdapterRegistry?.getAdapter();
            if (!adapter?.navigateToConversation(url)) {
                location.href = url;
            }
            this.opts.onAfterNavigate();
        } else {
            if (needsScroll && window.timelineManager) {
                await window.timelineManager.setNavigateDataForUrl(url, nodeKey);
            }
            window.open(url, '_blank');
        }
    }

    _findMarker(tm, nodeKey) {
        if (nodeKey == null) return null;
        if (tm.adapter?.findMarkerByStoredIndex) {
            return tm.adapter.findMarkerByStoredIndex(nodeKey, tm.markers, tm.markerMap);
        }
        if (tm.adapter?.generateTurnIdFromIndex) {
            const m = tm.markerMap?.get(tm.adapter.generateTurnIdFromIndex(nodeKey));
            if (m) return m;
        }
        if (typeof nodeKey === 'number' && nodeKey >= 0 && nodeKey < tm.markers.length) {
            return tm.markers[nodeKey];
        }
        return null;
    }

    _isSameSite(url) {
        try {
            const u = new URL(url);
            if (u.hostname === location.hostname) return true;
            const main = h => h.split('.').slice(-2).join('.');
            return main(u.hostname) === main(location.hostname);
        } catch { return false; }
    }

    _isCurrentPage(item) {
        if (!item.urlWithoutProtocol) return false;
        const current = location.href.replace(/^https?:\/\//, '');
        return current === item.urlWithoutProtocol;
    }

    // ==================== 生命周期 ====================

    destroy() {
        window.removeEventListener('url:change', this._urlChangeHandler);
        this._unbindContainerDelegation();
        this._delegateContainer = null;
        this._folderDataMap.clear();
        this._itemDataMap.clear();
    }

    // ==================== URL 变化 → active 状态 ====================

    _refreshActiveState() {
        const list = this.opts.getListContainer();
        if (!list) return;
        list.querySelectorAll('.timeline-starred-item').forEach(el => {
            const turnId = el.dataset.turnId;
            if (!turnId) return;
            const urlPart = turnId.substring(0, turnId.lastIndexOf(':'));
            const current = location.href.replace(/^https?:\/\//, '');
            el.classList.toggle('active', current === urlPart);
        });
    }

    // ==================== 工具 ====================

    _countAllItems(folder) {
        let count = folder.items.length;
        if (folder.children) {
            for (const child of folder.children) count += this._countAllItems(child);
        }
        return count;
    }

    _matchesSearch(item, query) {
        if (!query) return true;
        return item.theme && item.theme.toLowerCase().includes(query);
    }

    _escapeHtml(text) {
        const d = document.createElement('div');
        d.textContent = text;
        return d.innerHTML;
    }
}
