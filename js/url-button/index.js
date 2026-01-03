/**
 * URL Auto Link Manager - URL 自动链接
 * 
 * 识别页面上的纯文本 URL，自动转换为可点击的 <a> 标签
 */

class UrlAutoLinkManager {
    constructor(options = {}) {
        this.config = {
            debug: options.debug || false
        };
        
        // 统一的 URL 正则：支持
        // - http:// / https:// 开头
        // - www. 开头
        // - 裸域名：google.com、example.cn/path（不含协议）
        //
        // 说明：裸域名可能产生误判，所以还会在代码里做一层上下文校验（避免邮箱等）
        this.urlRegex =
            /(?:https?:\/\/|www\.)[^\s<>"']+|(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+(?:[a-z]{2,24})(?::\d{2,5})?(?:\/[^\s<>"']*)?/gi;
        
        this.observer = null;
        this.processingDebounceTimer = null;
        this._pendingRoots = new Set();
        
        this._init();
        this._log('URL Auto Link Manager initialized');
    }
    
    /**
     * 将 URL 末尾常见的标点从链接中剥离出来，避免打开错误 URL。
     * 注意：不会改变页面原文本——剥离出来的标点会以普通文本形式保留在链接后面。
     */
    _splitTrailingPunctuation(rawUrl) {
        if (!rawUrl) return { url: rawUrl, tail: '' };

        // 常见“句末”标点/括号（中英文）
        const TRAILING = new Set([
            '.', ',', '!', '?', ':', ';',
            '。', '，', '！', '？', '：', '；',
            ')', '）',
            ']', '】',
            '}', '』',
            '》', '」',
            '"', '“', '”',
            "'", '’', '‘'
        ]);

        let url = rawUrl;
        let tail = '';
        while (url.length > 0) {
            const last = url[url.length - 1];
            if (!TRAILING.has(last)) break;
            tail = last + tail;
            url = url.slice(0, -1);
        }

        return { url, tail };
    }

    _createUrlLink(url) {
        // 不带协议的（包括 www. 和裸域名）默认使用 http://
        const finalUrl = /^https?:\/\//i.test(url) ? url : 'http://' + url;
        
        const link = document.createElement('a');
        link.href = finalUrl;
        link.textContent = url;
        link.className = 'url-auto-link';
        link.target = '_blank';
        link.rel = 'noopener noreferrer';
        link.dataset.urlProcessed = 'true';
        
        return link;
    }

    _isBareDomain(raw) {
        const s = String(raw || '');
        return !/^https?:\/\//i.test(s) && !/^www\./i.test(s);
    }

    /**
     * 裸域名的轻量校验：减少误判（例如邮箱 a@b.com）
     */
    _isBareDomainContextValid(text, index, rawUrl) {
        if (!this._isBareDomain(rawUrl)) return true;
        if (typeof index !== 'number' || index < 0) return true;

        const prev = index > 0 ? text[index - 1] : '';
        const next = index + rawUrl.length < text.length ? text[index + rawUrl.length] : '';

        // 邮箱：检查前面是否有 @ 符号，且 @ 和域名之间只能是邮箱用户名字符
        // 例如：houyanchao@outlook.com，需要检测 outlook.com 前面的 @
        const checkStart = Math.max(0, index - 64); // 往前看64个字符，覆盖最长的邮箱用户名
        const beforeText = text.slice(checkStart, index);
        
        // 如果前面有 @，检查 @ 和域名之间是否只包含邮箱用户名允许的字符
        const atIndex = beforeText.lastIndexOf('@');
        if (atIndex !== -1) {
            // 提取 @ 到域名之间的部分
            const betweenAtAndDomain = beforeText.slice(atIndex + 1);
            // 如果 @ 和域名之间只有邮箱用户名字符（字母数字._%-），则认为是邮箱
            if (/^[a-zA-Z0-9._%-]*$/.test(betweenAtAndDomain)) {
                return false; // 是邮箱的一部分，不转换为链接
            }
        }

        // 避免在单词/标识符内部命中（例如 abcgoogle.comdef）
        if (prev && /[a-z0-9_\-\.]/i.test(prev)) return false;
        if (next && /[a-z0-9_\-]/i.test(next)) return false;

        return true;
    }

    /**
     * 更保守的裸域名合法性校验：尽可能降低误判风险
     * - 必须是“像域名”的结构（label 规则）
     * - 过滤常见文件扩展名（例如 index.js、data.json）
     * - 过滤明显不可能的域名形态
     */
    _isBareDomainStrictValid(rawUrl) {
        if (!this._isBareDomain(rawUrl)) return true;
        if (!rawUrl) return false;

        // 额外保守：裸域名必须以字母开头（避免 2025.12.18 之类误判）
        if (!/^[a-z]/i.test(rawUrl)) return false;

        // 去掉 path/query/hash 只校验 host:port
        const firstSlash = rawUrl.indexOf('/');
        const hostPort = firstSlash >= 0 ? rawUrl.slice(0, firstSlash) : rawUrl;
        if (!hostPort || hostPort.length > 253) return false;
        if (hostPort.includes('..')) return false;
        if (hostPort.startsWith('.') || hostPort.endsWith('.')) return false;
        if (hostPort.includes('_')) return false;

        const [host, port] = hostPort.split(':');
        if (!host) return false;
        if (port) {
            if (!/^\d{2,5}$/.test(port)) return false;
            const p = Number(port);
            if (!(p >= 1 && p <= 65535)) return false;
        }

        const labels = host.split('.');
        if (labels.length < 2) return false;
        for (const label of labels) {
            if (!label || label.length > 63) return false;
            // label 规则：字母数字开头结尾，中间允许连字符
            if (!/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/i.test(label)) return false;
        }

        const tld = labels[labels.length - 1].toLowerCase();
        // tld 必须纯字母
        if (!/^[a-z]{2,24}$/.test(tld)) return false;

        // 裸域名只支持常用的一些后缀（白名单），尽可能降低误判。
        // 注：像 example.com.cn 这种会被识别（tld=cn）。
        const COMMON_TLDS = new Set([
            'com', 'cn', 'net', 'org',
            'io', 'ai', 'co', 'me', 'cc',
            'dev', 'app',
            'edu', 'gov',
            'xyz', 'top', 'vip', 'info'
        ]);
        if (!COMMON_TLDS.has(tld)) return false;

        return true;
    }

    _init() {
        this._log('Initializing...');
        this._processDocument();
        this._setupObserver();
        this._log('Initialization complete');
    }
    
    _processDocument() {
        this._processNode(document.body);
    }
    
    /**
     * 处理指定节点
     */
    _processNode(root) {
        if (!root) return;
        
        // 使用 TreeWalker 遍历所有文本节点
        const walker = document.createTreeWalker(
            root,
            NodeFilter.SHOW_TEXT,
            null  // 不在这里过滤，在处理时过滤
        );
        
        // 收集文本节点
        const textNodes = [];
        let node;
        while (node = walker.nextNode()) {
            textNodes.push(node);
        }
        
        this._log('Found', textNodes.length, 'text nodes to check');
        
        // 处理每个文本节点
        textNodes.forEach(node => this._processTextNode(node));
    }

    /**
     * 处理单个文本节点
     */
    _processTextNode(textNode) {
        const text = textNode.textContent;
        const parent = textNode.parentElement;
        
        if (!parent || !text) return;
        
        // 跳过不应处理的元素
        const tagName = parent.tagName?.toLowerCase();
        if (['script', 'style', 'textarea', 'input', 'select', 'button'].includes(tagName)) {
            return;
        }
        
        // 跳过已经是链接的
        if (parent.closest('a')) {
            return;
        }
        
        // 跳过可编辑元素
        if (parent.closest('[contenteditable="true"]')) {
            return;
        }
        
        // 跳过已处理的
        if (parent.closest('[data-url-processed="true"]')) {
            return;
        }
        
        // 重置正则状态并查找 URL
        this.urlRegex.lastIndex = 0;
        const matches = [...text.matchAll(this.urlRegex)];
        
        if (matches.length === 0) return;
        
        this._log('Found URLs in text:', matches.map(m => m[0]));
        
        // 创建文档片段
        const fragment = document.createDocumentFragment();
        let lastIndex = 0;

        for (const match of matches) {
            const rawUrl = match[0];
            const index = match.index ?? 0;

            // 添加 URL 前的文本
            if (index > lastIndex) {
                fragment.appendChild(document.createTextNode(text.slice(lastIndex, index)));
            }

            // 默认：不识别就原样输出，保证“零风险误改文案/结构”
            let didLinkify = false;

            // 裸域名做两层过滤：上下文 + 结构校验
            if (this._isBareDomain(rawUrl)) {
                if (this._isBareDomainContextValid(text, index, rawUrl) && this._isBareDomainStrictValid(rawUrl)) {
                    const { url, tail } = this._splitTrailingPunctuation(rawUrl);
                    if (url) {
                        fragment.appendChild(this._createUrlLink(url));
                        if (tail) fragment.appendChild(document.createTextNode(tail));
                        didLinkify = true;
                    }
                }
            } else {
                // 非裸域名（http/https/www）：只做末尾标点剥离
                const { url, tail } = this._splitTrailingPunctuation(rawUrl);
                if (url) {
                    fragment.appendChild(this._createUrlLink(url));
                    if (tail) fragment.appendChild(document.createTextNode(tail));
                    didLinkify = true;
                }
            }

            if (!didLinkify) {
                fragment.appendChild(document.createTextNode(rawUrl));
            }

            lastIndex = index + rawUrl.length;
        }
        
        // 添加剩余文本
        if (lastIndex < text.length) {
            fragment.appendChild(document.createTextNode(text.slice(lastIndex)));
        }
        
        // 替换原文本节点
        try {
            parent.replaceChild(fragment, textNode);
            this._log('Processed:', matches.length, 'URLs');
        } catch (e) {
            this._log('Error replacing node:', e);
        }
    }
    
    /**
     * 监听 DOM 变化
     */
    _setupObserver() {
        this.observer = new MutationObserver((mutations) => {
            const rootsToProcess = new Set();
            
            mutations.forEach(mutation => {
                if (mutation.type === 'childList') {
                    mutation.addedNodes.forEach(node => {
                        if (node.nodeType !== Node.ELEMENT_NODE) return;
                        if (node.dataset?.urlProcessed === 'true') return;
                        if (node.classList?.contains('url-auto-link')) return;
                        rootsToProcess.add(node);
                    });
                } else if (mutation.type === 'characterData') {
                    // 文本内容变化（很多站点是这种更新方式）
                    const p = mutation.target?.parentElement;
                    if (p) rootsToProcess.add(p);
                }
            });
            
            if (rootsToProcess.size > 0) {
                rootsToProcess.forEach(r => this._pendingRoots.add(r));

                clearTimeout(this.processingDebounceTimer);
                this.processingDebounceTimer = setTimeout(() => {
                    const roots = Array.from(this._pendingRoots);
                    this._pendingRoots.clear();
                    this._log('Processing', roots.length, 'mutation roots');
                    roots.forEach(node => {
                        if (document.body.contains(node)) {
                            this._processNode(node);
                        }
                    });
                }, 120);
            }
        });
        
        this.observer.observe(document.body, {
            childList: true,
            subtree: true,
            characterData: true
        });
    }
    
    destroy() {
        // 清理 debounce timer
        if (this.processingDebounceTimer) {
            clearTimeout(this.processingDebounceTimer);
            this.processingDebounceTimer = null;
        }
        
        // 清理 observer
        if (this.observer) {
            this.observer.disconnect();
            this.observer = null;
        }
        
        // 清理待处理列表
        this._pendingRoots.clear();
    }
    
    _log(...args) {
        if (this.config.debug) {
            console.log('[UrlAutoLink]', ...args);
        }
    }
    
    // 调试方法
    reprocess() {
        console.log('[UrlAutoLink] 重新处理页面...');
        this._processDocument();
    }
}

// 自动初始化
if (typeof window !== 'undefined') {
    window.UrlAutoLinkManager = UrlAutoLinkManager;
    
    const init = async () => {
        if (window.urlAutoLinkManager) return;
        
        // 检查功能是否启用（默认开启）
        let enabled = true;
        try {
            if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
                const result = await chrome.storage.local.get('urlButtonEnabled');
                enabled = result.urlButtonEnabled !== false;
            }
        } catch (e) {
            // 读取失败，默认开启
            console.log('[UrlAutoLink] Failed to read config, using default (enabled)');
        }
        
        if (!enabled) {
            console.log('[UrlAutoLink] Feature disabled by user config');
            return;
        }
        
        // 默认关闭 debug，避免污染控制台；需要排查时可在控制台手动开启：
        // window.urlAutoLinkManager.config.debug = true
        window.urlAutoLinkManager = new UrlAutoLinkManager({ debug: false });
    };
    
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
}
