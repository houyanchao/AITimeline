/**
 * Highlight Manager
 *
 * 网页文字标注功能核心模块
 * - 选中文字后创建高亮标注（<mark> 包裹）
 * - 序列化：TextQuoteSelector (exact + prefix + suffix) + TextPositionSelector (start + end)
 * - 页面加载时恢复高亮：三级匹配（精确 → 模糊前缀锚定 → 模糊直接匹配）
 * - 使用 diff-match-patch 做模糊匹配，容忍页面渲染差异
 *
 * 存储结构（chrome.storage.local）：
 *   highlightEnabled  — boolean，功能开关
 *   highlightColor    — string，当前高亮颜色
 *   highlightData     — { [url]: [ {id, text, prefix, suffix, start, end, color, style, annotation, createdAt} ] }
 */

const _HL_INVISIBLE_TAGS = new Set(['SCRIPT', 'STYLE', 'NOSCRIPT', 'TEMPLATE', 'IFRAME']);

class HighlightManager {
    constructor() {
        this.isEnabled = false;
        this.currentColor = HIGHLIGHT_DEFAULT_COLORS[0];
        this.currentStyle = 'solid';
        this._storageKey = 'highlightData';
        this._colorKey = 'highlightColor';
        this._styleKey = 'highlightStyle';
        this._enabledKey = 'highlightEnabled';
        this._contextLen = 32;
        this._dmp = new diff_match_patch();
        this._dmp.Match_Threshold = 0.4;
        this._dmp.Match_Distance = 500;
    }

    async init() {
        const result = await chrome.storage.local.get([this._enabledKey, this._colorKey, this._styleKey]);
        this.isEnabled = result[this._enabledKey] !== false;
        if (result[this._colorKey]) this.currentColor = result[this._colorKey];
        if (result[this._styleKey]) this.currentStyle = result[this._styleKey];

        if (this.isEnabled) {
            this.restoreHighlights();
        }

        chrome.storage.onChanged.addListener((changes, area) => {
            if (area !== 'local') return;
            if (changes[this._enabledKey]) {
                this.isEnabled = changes[this._enabledKey].newValue !== false;
                if (this.isEnabled) this.restoreHighlights();
                else this.clearAllMarks();
            }
            if (changes[this._colorKey]) {
                this.currentColor = changes[this._colorKey].newValue || HIGHLIGHT_DEFAULT_COLORS[0];
            }
            if (changes[this._styleKey]) {
                this.currentStyle = changes[this._styleKey].newValue || 'solid';
            }
        });
    }

    // ==================== TreeWalker 工具 ====================

    _isVisibleTextNode(node) {
        let el = node.parentElement;
        while (el && el !== document.body) {
            if (_HL_INVISIBLE_TAGS.has(el.tagName)) return false;
            el = el.parentElement;
        }
        return true;
    }

    _createVisibleTextWalker(root = document.body) {
        return document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
            acceptNode: (node) => this._isVisibleTextNode(node) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT
        });
    }

    _collectTextNodes(root = document.body) {
        const tw = this._createVisibleTextWalker(root);
        const textArr = [];
        const nodes = [];
        let node;
        while ((node = tw.nextNode())) {
            textArr.push(node.textContent);
            nodes.push(node);
        }
        return { textArr, nodes, text: textArr.join('') };
    }

    // ==================== 选区与已有高亮的关系判断 ====================

    isSelectionInsideHighlight() {
        const selection = window.getSelection();
        if (!selection || selection.isCollapsed) return false;
        const range = selection.getRangeAt(0);
        const startEl = range.startContainer.nodeType === Node.TEXT_NODE ? range.startContainer.parentElement : range.startContainer;
        const endEl = range.endContainer.nodeType === Node.TEXT_NODE ? range.endContainer.parentElement : range.endContainer;
        if (!startEl || !endEl) return false;
        const startMark = startEl.closest('mark.ait-highlight');
        const endMark = endEl.closest('mark.ait-highlight');
        return !!(startMark && endMark && startMark.dataset.hlId === endMark.dataset.hlId);
    }

    _getOverlappingHighlightIds(range) {
        const ids = new Set();
        const marks = document.querySelectorAll('mark.ait-highlight');
        for (const mark of marks) {
            if (range.intersectsNode(mark)) {
                ids.add(mark.dataset.hlId);
            }
        }
        return ids;
    }

    // ==================== 创建高亮 ====================

    async highlightSelection(opts = {}) {
        if (!this.isEnabled) return false;

        const selection = window.getSelection();
        if (!selection || selection.isCollapsed || !selection.toString().trim()) return false;
        if (this.isSelectionInsideHighlight()) return false;

        return this.highlightRange(selection.getRangeAt(0), opts);
    }

    async highlightRange(range, opts = {}) {
        if (!this.isEnabled || !range) return false;

        const color = opts.color || this.currentColor;
        const style = opts.style || this.currentStyle;
        const annotation = opts.annotation || '';

        const overlapping = this._getOverlappingHighlightIds(range);

        const serialized = this._serialize(range, range.toString(), { color, style, annotation });
        if (!serialized) return false;

        if (overlapping.size > 0) {
            for (const id of overlapping) {
                this._unwrapHighlight(id);
            }
            for (const id of overlapping) {
                await this._removeFromStorage(id);
            }

            const recoveredRange = this._findRange(serialized);
            if (!recoveredRange) return false;

            try {
                this._wrapRange(recoveredRange, serialized.id, color, style, annotation);
            } catch (e) {
                this._wrapRangeComplex(recoveredRange, serialized.id, color, style, annotation);
            }
        } else {
            try {
                this._wrapRange(range, serialized.id, color, style, annotation);
            } catch (e) {
                this._wrapRangeComplex(range, serialized.id, color, style, annotation);
            }
        }

        await this._saveHighlight(serialized);
        window.getSelection()?.removeAllRanges();
        return true;
    }

    async highlightSerialized(serialized) {
        if (!this.isEnabled || !serialized) return false;

        let range = this._findRange(serialized);
        if (!range) return false;

        const overlapping = this._getOverlappingHighlightIds(range);
        if (overlapping.size > 0) {
            for (const id of overlapping) {
                this._unwrapHighlight(id);
            }
            for (const id of overlapping) {
                await this._removeFromStorage(id);
            }
            range = this._findRange(serialized);
            if (!range) return false;
        }

        const { color, style, annotation } = serialized;
        try {
            this._wrapRange(range, serialized.id, color, style, annotation || '');
        } catch {
            try {
                this._wrapRangeComplex(range, serialized.id, color, style, annotation || '');
            } catch { return false; }
        }

        await this._saveHighlight(serialized);
        window.getSelection()?.removeAllRanges();
        return true;
    }

    // ==================== 删除高亮 ====================

    _unwrapHighlight(id) {
        const marks = document.querySelectorAll(`mark.ait-highlight[data-hl-id="${id}"]`);
        marks.forEach(mark => {
            const parent = mark.parentNode;
            while (mark.firstChild) parent.insertBefore(mark.firstChild, mark);
            parent.removeChild(mark);
            parent.normalize();
        });
    }

    removeHighlight(id) {
        this._unwrapHighlight(id);
        this._removeFromStorage(id);
    }

    // ==================== 恢复高亮 ====================

    async restoreHighlights(retryCount = 0) {
        const url = this._getPageKey();
        const allData = await this._loadAllData();
        const highlights = allData[url];
        if (!highlights || highlights.length === 0) return;

        const { textArr, nodes, text } = this._collectTextNodes();

        let restored = 0;
        for (const hl of highlights) {
            if (document.querySelector(`mark.ait-highlight[data-hl-id="${hl.id}"]`)) {
                restored++;
                continue;
            }

            const range = this._findRangeIn(text, textArr, nodes, hl);
            if (range) {
                const hlStyle = hl.style || 'solid';
                const hlNote = hl.annotation || '';
                try {
                    this._wrapRange(range, hl.id, hl.color, hlStyle, hlNote);
                    restored++;
                } catch (e1) {
                    try {
                        this._wrapRangeComplex(range, hl.id, hl.color, hlStyle, hlNote);
                        restored++;
                    } catch { /* skip */ }
                }
            }
        }

        if (restored < highlights.length && retryCount < 5) {
            const delay = [500, 1000, 2000, 4000, 8000][retryCount];
            setTimeout(() => this.restoreHighlights(retryCount + 1), delay);
        }
    }

    clearAllMarks() {
        document.querySelectorAll('mark.ait-highlight').forEach(mark => {
            const parent = mark.parentNode;
            while (mark.firstChild) parent.insertBefore(mark.firstChild, mark);
            parent.removeChild(mark);
            parent.normalize();
        });
    }

    // ==================== 序列化（TextQuoteSelector + TextPositionSelector） ====================

    _serialize(range, text, opts = {}) {
        if (!text.trim()) return null;

        const { fullText, idx, endIdx } = this._buildTextAndOffset(range);
        if (idx === -1 || endIdx === -1) return null;

        const exact = fullText.substring(idx, endIdx);
        if (!exact.trim()) return null;

        const prefix = fullText.substring(Math.max(0, idx - this._contextLen), idx);
        const suffix = fullText.substring(endIdx, endIdx + this._contextLen);

        const hl = {
            id: 'hl_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7),
            text: exact,
            prefix,
            suffix,
            start: idx,
            end: endIdx,
            color: opts.color || this.currentColor,
            style: opts.style || this.currentStyle,
            createdAt: Date.now()
        };
        if (opts.annotation) hl.annotation = opts.annotation;
        return hl;
    }

    _buildTextAndOffset(range) {
        const tw = this._createVisibleTextWalker();
        let fullText = '';
        let startIdx = -1;
        let endIdx = -1;
        let node;
        while ((node = tw.nextNode())) {
            if (node === range.startContainer && startIdx === -1) {
                startIdx = fullText.length + range.startOffset;
            }
            if (node === range.endContainer && endIdx === -1) {
                endIdx = fullText.length + range.endOffset;
            }
            fullText += node.textContent;
        }
        return { fullText, idx: startIdx, endIdx };
    }

    // ==================== 查找 Range（恢复用 — 三级模糊匹配） ====================

    _findRange(hl) {
        const { textArr, nodes, text } = this._collectTextNodes();
        return this._findRangeIn(text, textArr, nodes, hl);
    }

    _findRangeIn(text, textArr, nodes, hl) {
        let matchIdx = -1;
        let matchLen = hl.text.length;

        // Strategy 1: 精确 indexOf + 上下文验证
        matchIdx = this._exactSearch(text, hl);

        // Strategy 2: 模糊前缀/后缀锚定（需要至少一个锚点命中）
        if (matchIdx === -1 && (hl.prefix || hl.suffix)) {
            const result = this._fuzzyAnchorSearch(text, hl);
            if (result) {
                matchIdx = result.index;
                matchLen = result.length;
            }
        }

        // Strategy 3: 短文本（≤32字符）模糊直接匹配 + 上下文验证
        if (matchIdx === -1 && hl.text.length <= 32) {
            const loc = hl.start != null ? Math.min(hl.start, text.length) : Math.floor(text.length / 2);
            const pos = this._dmp.match_main(text, hl.text, loc);
            if (pos !== -1 && this._verifyContext(text, pos, hl.text.length, hl.prefix, hl.suffix)) {
                matchIdx = pos;
                matchLen = hl.text.length;
            }
        }

        if (matchIdx === -1) return null;
        return this._offsetToRange(nodes, textArr, matchIdx, matchLen);
    }

    _exactSearch(text, hl) {
        let searchStart = 0;
        while (true) {
            const pos = text.indexOf(hl.text, searchStart);
            if (pos === -1) return -1;

            if (this._verifyContext(text, pos, hl.text.length, hl.prefix, hl.suffix)) {
                return pos;
            }
            searchStart = pos + 1;
        }
    }

    _fuzzyAnchorSearch(text, hl) {
        let expectedPos = hl.start != null ? Math.min(hl.start, text.length) : -1;
        let anchored = false;

        if (hl.prefix) {
            const prefixSnippet = hl.prefix.substring(Math.max(0, hl.prefix.length - 32));
            const searchLoc = expectedPos >= 0 ? Math.max(0, expectedPos - prefixSnippet.length) : Math.floor(text.length / 2);
            const prefixLoc = this._dmp.match_main(text, prefixSnippet, searchLoc);
            if (prefixLoc !== -1) {
                expectedPos = prefixLoc + prefixSnippet.length;
                anchored = true;
            }
        }

        if (!anchored && hl.suffix) {
            const suffixSnippet = hl.suffix.substring(0, Math.min(32, hl.suffix.length));
            const searchLoc = expectedPos >= 0 ? expectedPos + hl.text.length : Math.floor(text.length / 2);
            const suffixLoc = this._dmp.match_main(text, suffixSnippet, searchLoc);
            if (suffixLoc !== -1) {
                expectedPos = suffixLoc - hl.text.length;
                anchored = true;
            }
        }

        if (!anchored) return null;

        const searchFrom = Math.max(0, expectedPos - 100);
        const exactIdx = text.indexOf(hl.text, searchFrom);
        if (exactIdx !== -1 && Math.abs(exactIdx - expectedPos) < 300) {
            return { index: exactIdx, length: hl.text.length };
        }

        const stripped = hl.text.replace(/\*\*|__/g, '');
        if (stripped !== hl.text && stripped.length > 0) {
            const strippedIdx = text.indexOf(stripped, searchFrom);
            if (strippedIdx !== -1 && Math.abs(strippedIdx - expectedPos) < 300) {
                return { index: strippedIdx, length: stripped.length };
            }
        }

        return null;
    }

    _verifyContext(text, pos, len, prefix, suffix) {
        if (prefix) {
            const before = text.substring(Math.max(0, pos - this._contextLen * 2), pos);
            const tail = prefix.substring(Math.max(0, prefix.length - 8));
            if (!before.includes(tail)) return false;
        }
        if (suffix) {
            const after = text.substring(pos + len, pos + len + this._contextLen * 2);
            const head = suffix.substring(0, Math.min(8, suffix.length));
            if (!after.includes(head)) return false;
        }
        return true;
    }

    _offsetToRange(nodes, textArr, offset, length) {
        let cumulative = 0;
        let startNode = null, startOffset = 0;
        let endNode = null, endOffset = 0;

        for (let i = 0; i < nodes.length; i++) {
            const nodeLen = textArr[i].length;
            const nodeEnd = cumulative + nodeLen;

            if (!startNode && offset < nodeEnd) {
                startNode = nodes[i];
                startOffset = offset - cumulative;
            }

            if (startNode && offset + length <= nodeEnd) {
                endNode = nodes[i];
                endOffset = offset + length - cumulative;
                break;
            }

            cumulative = nodeEnd;
        }

        if (!startNode || !endNode) return null;

        try {
            const range = document.createRange();
            range.setStart(startNode, startOffset);
            range.setEnd(endNode, endOffset);
            return range;
        } catch {
            return null;
        }
    }

    // ==================== DOM 包裹 ====================

    _applyMarkStyle(mark, color, style) {
        const s = style || this.currentStyle;
        switch (s) {
            case 'half':
            case 'highlighter':
                mark.style.cssText = `background: linear-gradient(transparent 50%, ${color} 50%) !important;`;
                mark.dataset.hlStyle = 'half';
                break;
            case 'underline':
                mark.style.cssText = `background: linear-gradient(transparent calc(100% - 4px), ${color} calc(100% - 4px)) !important; padding-bottom: 2px;`;
                mark.dataset.hlStyle = 'underline';
                break;
            case 'textOnly':
                mark.style.cssText = `background: transparent !important; color: ${color} !important;`;
                mark.dataset.hlStyle = 'textOnly';
                break;
            default:
                mark.style.cssText = `background-color: ${color} !important;`;
                mark.dataset.hlStyle = 'solid';
                break;
        }
    }

    _createMark(id, color, style, annotation) {
        const mark = document.createElement('mark');
        mark.className = 'ait-highlight';
        mark.dataset.hlId = id;
        this._applyMarkStyle(mark, color, style);
        if (annotation) mark.title = annotation;
        return mark;
    }

    _wrapRange(range, id, color, style, annotation) {
        const mark = this._createMark(id, color, style, annotation);
        try {
            range.surroundContents(mark);
        } catch {
            this._wrapRangeComplex(range, id, color, style, annotation);
            return;
        }
        this._bindMarkEvents(mark);
    }

    _reparentIntoMark(range, mark) {
        let ancestor = range.commonAncestorContainer;
        if (ancestor.nodeType === Node.TEXT_NODE) ancestor = ancestor.parentNode;
        if (!ancestor) return false;

        const sc = range.startContainer, so = range.startOffset;
        const ec = range.endContainer, eo = range.endOffset;

        const climb = (n) => {
            while (n && n.parentNode !== ancestor) n = n.parentNode;
            return n;
        };

        let first, last;

        if (sc.nodeType === Node.TEXT_NODE) {
            if (so > 0 && so < sc.length) {
                if (sc.parentNode !== ancestor) return false;
                first = sc.splitText(so);
            } else {
                first = so === 0 ? climb(sc) : climb(sc)?.nextSibling;
            }
        } else {
            first = climb(sc.childNodes[so]);
        }

        if (ec.nodeType === Node.TEXT_NODE) {
            if (eo > 0 && eo < ec.length) {
                if (ec.parentNode !== ancestor) return false;
                ec.splitText(eo);
                last = ec;
            } else {
                last = eo > 0 ? climb(ec) : climb(ec)?.previousSibling;
            }
        } else {
            last = eo > 0 ? climb(ec.childNodes[eo - 1]) : null;
        }

        if (!first || !last) return false;

        ancestor.insertBefore(mark, first);
        let cur = mark.nextSibling;
        while (cur) {
            const next = cur.nextSibling;
            mark.appendChild(cur);
            if (cur === last) break;
            cur = next;
        }
        return true;
    }

    _wrapRangeComplex(range, id, color, style, annotation) {
        const nodes = this._getTextNodesInRange(range);
        if (nodes.length === 0) return;

        for (let i = 0; i < nodes.length; i++) {
            const mark = this._createMark(id, color, style, annotation);
            const subRange = document.createRange();
            subRange.setStart(nodes[i].node, nodes[i].start);
            subRange.setEnd(nodes[i].node, nodes[i].end);
            subRange.surroundContents(mark);
            this._bindMarkEvents(mark);
        }
    }

    _getTextNodesInRange(range) {
        const result = [];
        const treeWalker = document.createTreeWalker(
            range.commonAncestorContainer.nodeType === Node.TEXT_NODE
                ? range.commonAncestorContainer.parentElement
                : range.commonAncestorContainer,
            NodeFilter.SHOW_TEXT, null
        );

        let node;
        while ((node = treeWalker.nextNode())) {
            if (!range.intersectsNode(node)) continue;

            const start = node === range.startContainer ? range.startOffset : 0;
            const end = node === range.endContainer ? range.endOffset : node.textContent.length;
            if (end > start) {
                result.push({ node, start, end });
            }
        }

        return result;
    }

    _bindMarkEvents(mark) {
        mark.addEventListener('mouseenter', () => {
            const id = mark.dataset.hlId;
            document.querySelectorAll(`mark.ait-highlight[data-hl-id="${id}"]`).forEach(m => m.classList.add('ait-highlight-hover'));
        });
        mark.addEventListener('mouseleave', () => {
            const id = mark.dataset.hlId;
            document.querySelectorAll(`mark.ait-highlight[data-hl-id="${id}"]`).forEach(m => m.classList.remove('ait-highlight-hover'));
        });
        mark.addEventListener('click', (e) => {
            e.stopPropagation();
            const id = mark.dataset.hlId;
            window.dispatchEvent(new CustomEvent('ait-highlight-click', { detail: { id, mark } }));
        });
    }

    // ==================== 存储 ====================

    _getPageKey() {
        return location.origin + location.pathname;
    }

    async _loadAllData() {
        const result = await chrome.storage.local.get(this._storageKey);
        return result[this._storageKey] || {};
    }

    async _saveHighlight(hl) {
        const url = this._getPageKey();
        const allData = await this._loadAllData();
        if (!allData[url]) allData[url] = [];
        allData[url].push(hl);
        await chrome.storage.local.set({ [this._storageKey]: allData });
    }

    async _removeFromStorage(id) {
        const url = this._getPageKey();
        const allData = await this._loadAllData();
        if (!allData[url]) return;
        allData[url] = allData[url].filter(h => h.id !== id);
        if (allData[url].length === 0) delete allData[url];
        await chrome.storage.local.set({ [this._storageKey]: allData });
    }

    async getHighlightById(id) {
        const url = this._getPageKey();
        const allData = await this._loadAllData();
        return allData[url]?.find(h => h.id === id) || null;
    }

    async updateHighlight(id, updates) {
        const url = this._getPageKey();
        const allData = await this._loadAllData();
        if (!allData[url]) return;
        const hl = allData[url].find(h => h.id === id);
        if (!hl) return;
        Object.assign(hl, updates);
        await chrome.storage.local.set({ [this._storageKey]: allData });

        const marks = document.querySelectorAll(`mark.ait-highlight[data-hl-id="${id}"]`);
        marks.forEach(mark => {
            if (updates.color || updates.style) {
                this._applyMarkStyle(mark, updates.color || hl.color, updates.style || hl.style);
            }
            if ('annotation' in updates) {
                mark.title = updates.annotation || '';
            }
        });
    }

    async setColor(color) {
        this.currentColor = color;
        await chrome.storage.local.set({ [this._colorKey]: color });
    }

    async setStyle(style) {
        this.currentStyle = style;
        await chrome.storage.local.set({ [this._styleKey]: style });
    }

    async setEnabled(enabled) {
        this.isEnabled = enabled;
        await chrome.storage.local.set({ [this._enabledKey]: enabled });
        if (enabled) this.restoreHighlights();
        else this.clearAllMarks();
    }
}

window.HighlightManager = HighlightManager;
