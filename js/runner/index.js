/**
 * Runner - 代码块运行器
 * 
 * 检测页面中的代码块，为 JavaScript 代码块添加运行按钮
 * 完全独立运行，不依赖时间轴功能
 * 支持多平台：ChatGPT、Gemini、Claude、DeepSeek、豆包等
 */

(function() {
    'use strict';

    // ===== 安全的 i18n 调用 =====
    function safeI18n(key, fallback = '') {
        try {
            return chrome.i18n.getMessage(key) || fallback;
        } catch (e) {
            // 扩展上下文失效时返回默认值
            return fallback;
        }
    }

    // ===== 配置区域 =====
    
    const CONFIG = {
        // DOM 稳定延迟（500ms 内无 DOM 变化视为稳定，执行扫描）
        stableDelay: 500,
        // 已处理标记
        processedAttr: 'data-runner-initialized',
        
        // ===== 高度配置 =====
        headerHeight: 50,           // 区域 header 高度
        
        // Code 区域
        codeMinHeight: 150,         // Code 内容区最小高度
        
        // Output 区域
        outputMinHeight: 100,       // Output 内容区最小高度
        outputMaxHeight: 300,       // Output 内容区最大高度
        outputDefaultHeight: 100,   // Output 内容区默认高度
        
        // 拖动限制（Output 整体高度 = header + 内容）
        outputDragMin: 120,         // 拖动最小高度（header 50 + 内容 100）
        outputDragMax: 350,         // 拖动最大高度（header 50 + 内容 300）
        
        // Runner 容器最小高度（用于撑开 layoutContainer）
        // 计算：header*2(100) + codeMin(150) + outputDefault(100) + resizer(1) = 351，留余量
        minContainerHeight: 360
    };

    // 代码块配置（按优先级排序，特殊规则在前，通用规则在后）
    // top/right: Run 按钮相对于布局容器的偏移量（可选，默认 0）
    const CODE_BLOCK_CONFIGS = [
        { 
            codeSelector: 'code-block code',  // Gemini
            layoutSelector: 'code-block'
        },
        { 
            codeSelector: '.md-code-block pre',  // DeepSeek
            layoutSelector: '.md-code-block'
        },
        { 
            codeSelector: '[class*="code-area-"] code',  // 豆包
            layoutSelector: '[class*="code-area-"]'
        },
        { 
            codeSelector: 'pre code',         // 通用（ChatGPT, Claude, Kimi...）
            layoutSelector: 'pre'
        },
    ];

    // ===== 状态变量 =====
    
    let runnerManagerInstance = null;
    let unsubscribeObserver = null;  // DOMObserverManager 取消订阅函数

    // ===== 工具函数 =====

    /**
     * 获取 RunnerManager 实例
     */
    function getRunnerManager() {
        if (!runnerManagerInstance) {
            runnerManagerInstance = new window.RunnerManager();
        }
        return runnerManagerInstance;
    }

    /**
     * 检测代码语言类型（使用 Highlight.js）
     * @param {string} code - 代码文本
     * @returns {string|null} 'javascript' | 'python' | 'typescript' | null
     */
    function detectLanguage(code) {
        if (!window.LanguageDetector) {
            console.warn('[Runner] LanguageDetector not loaded');
            return null;
        }
        return window.LanguageDetector.detect(code);
    }

    /**
     * 获取代码块的代码文本
     * @param {HTMLElement} codeElement - code 元素
     * @returns {string}
     */
    function getCodeText(codeElement) {
        return (codeElement.textContent || '').replace(/\u00A0/g, ' ');
    }

    /**
     * HTML 转义
     * @param {string} str - 字符串
     * @returns {string}
     */
    function escapeHtml(str) {
        const div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    }

    /**
     * 获取容器下直接子元素的最大 z-index
     * @param {HTMLElement} container - 容器元素
     * @returns {number}
     */
    function getMaxChildZIndex(container) {
        let maxZ = 0;
        for (const child of container.children) {
            const z = parseInt(getComputedStyle(child).zIndex) || 0;
            if (z > maxZ) maxZ = z;
        }
        return maxZ;
    }

    // ===== UI 创建函数 =====

    /**
     * 创建运行按钮
     * @param {HTMLElement} codeElement - code 元素
     * @param {HTMLElement} layoutContainer - 布局容器
     * @param {string} language - 语言类型 'javascript' | 'python'
     * @returns {HTMLElement}
     */
    function createRunButton(codeElement, layoutContainer, language = 'javascript') {
        const button = document.createElement('button');
        button.className = 'runner-code-run-btn';
        button.innerHTML = `
            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                <path d="M8 5v14l11-7z"/>
            </svg>
            <span>Run</span>
        `;
        button.setAttribute('title', '运行代码');
        button.setAttribute('data-language', language);
        
        // 动态计算 z-index，确保在其他同级元素之上
        const maxZ = getMaxChildZIndex(layoutContainer);
        button.style.zIndex = maxZ + 1;
        
        button.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            handleRunClick(codeElement, layoutContainer, button, language);
        });
        
        return button;
    }

    // 语言显示名称映射
    const LANGUAGE_DISPLAY_NAMES = {
        'javascript': 'JavaScript',
        'python': 'Python',
        'typescript': 'TypeScript',
        'sql': 'SQL',
        'html': 'HTML',
        'json': 'JSON',
        'markdown': 'Markdown',
        'lua': 'Lua',
        'ruby': 'Ruby'
    };

    /**
     * 创建 Runner 容器（包含 CodeMirror 编辑器和结果面板）
     * @param {HTMLElement} layoutContainer - 布局容器
     * @param {HTMLElement} runButton - 运行按钮
     * @param {string} language - 语言类型
     * @returns {Object} { container, cmEditor, contentEl }
     */
    function createRunnerContainer(layoutContainer, runButton, language = 'javascript') {
        // 创建容器
        const container = document.createElement('div');
        container.className = 'runner-container';
        
        // 动态计算 z-index，确保在其他同级元素之上
        const maxZ = getMaxChildZIndex(layoutContainer);
        container.style.zIndex = maxZ + 1;

        // 获取语言显示名称
        const langDisplayName = LANGUAGE_DISPLAY_NAMES[language] || language;

        // 创建编辑器区域
        const editorSection = document.createElement('div');
        editorSection.className = 'runner-editor-section';
        editorSection.style.minHeight = (CONFIG.headerHeight + CONFIG.codeMinHeight) + 'px';

        const editorHeader = document.createElement('div');
        editorHeader.className = 'runner-section-header';
        editorHeader.style.height = CONFIG.headerHeight + 'px';
        editorHeader.innerHTML = `<span class="runner-section-title"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="16 18 22 12 16 6"></polyline><polyline points="8 6 2 12 8 18"></polyline></svg><span>${langDisplayName}</span></span><div class="runner-section-actions"><button class="runner-action-settings" title="${safeI18n('vkmzpx', '设置')}"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3"></circle><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path></svg></button><button class="runner-action-copy" title="${safeI18n('mvkxpz', '复制')}"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg></button><button class="runner-action-close" title="${safeI18n('pxvkmz', '关闭')}"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg></button></div>`;

        // 创建 CodeMirror 容器
        const editorWrapper = document.createElement('div');
        editorWrapper.className = 'runner-code-editor';

        editorSection.appendChild(editorHeader);
        editorSection.appendChild(editorWrapper);

        // 创建结果区域
        const resultSection = document.createElement('div');
        resultSection.className = 'runner-result-section';
        const defaultOutputHeight = CONFIG.headerHeight + CONFIG.outputDefaultHeight;
        resultSection.style.height = defaultOutputHeight + 'px';
        resultSection.style.minHeight = (CONFIG.headerHeight + CONFIG.outputMinHeight) + 'px';
        resultSection.style.maxHeight = (CONFIG.headerHeight + CONFIG.outputMaxHeight) + 'px';

        const resultHeader = document.createElement('div');
        resultHeader.className = 'runner-section-header';
        resultHeader.style.height = CONFIG.headerHeight + 'px';
        resultHeader.innerHTML = `<span class="runner-section-title"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="4 17 10 11 4 5"></polyline><line x1="12" y1="19" x2="20" y2="19"></line></svg><span>Output</span></span><div class="runner-section-actions"><button class="runner-action-clear" title="清空输出"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg></button><button class="runner-output-copy" title="${safeI18n('mvkxpz', '复制')}"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg></button><button class="runner-action-run" title="运行代码"><svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg><span>Run</span></button></div>`;

        const resultContent = document.createElement('div');
        resultContent.className = 'runner-result-content';

        resultSection.appendChild(resultHeader);
        resultSection.appendChild(resultContent);

        // 创建分隔条（可拖动调整 Output 高度）
        const resizer = document.createElement('div');
        resizer.className = 'runner-resizer';

        // 组装容器
        container.appendChild(editorSection);
        container.appendChild(resizer);
        container.appendChild(resultSection);

        // 分隔条拖动逻辑
        let isResizing = false;
        let startY = 0;
        let startHeight = 0;

        resizer.addEventListener('mousedown', (e) => {
            isResizing = true;
            startY = e.clientY;
            startHeight = resultSection.offsetHeight;
            document.body.style.cursor = 'row-resize';
            document.body.style.userSelect = 'none';
            e.preventDefault();
        });

        document.addEventListener('mousemove', (e) => {
            if (!isResizing) return;
            const deltaY = startY - e.clientY;
            // 使用 CONFIG 配置的拖动限制
            const newHeight = Math.max(CONFIG.outputDragMin, Math.min(CONFIG.outputDragMax, startHeight + deltaY));
            resultSection.style.height = newHeight + 'px';
            resultSection.style.minHeight = newHeight + 'px';
            resultSection.style.maxHeight = newHeight + 'px';
        });

        document.addEventListener('mouseup', () => {
            if (isResizing) {
                isResizing = false;
                document.body.style.cursor = '';
                document.body.style.userSelect = '';
            }
        });

        // 初始化 CodeMirror
        let cmEditor = null;
        if (typeof CodeMirror !== 'undefined') {
            cmEditor = CodeMirror(editorWrapper, {
                mode: 'javascript',
                theme: 'default',
                lineNumbers: true,
                lineWrapping: true,
                tabSize: 2,
                indentWithTabs: false,
                matchBrackets: true
            });
            // 设置高度自适应
            cmEditor.setSize('100%', '100%');
            // 延迟刷新确保正确渲染
            setTimeout(() => cmEditor.refresh(), 50);
        }

        // 存储 CodeMirror 实例到容器
        container._cmEditor = cmEditor;

        // 绑定事件
        const settingsBtn = editorHeader.querySelector('.runner-action-settings');
        settingsBtn.addEventListener('click', () => {
            // 打开 panelModal 并切换到 runner tab
            if (window.panelModal) {
                window.panelModal.show('runner');
            }
        });

        const copyBtn = editorHeader.querySelector('.runner-action-copy');
        copyBtn.addEventListener('click', () => {
            const code = cmEditor ? cmEditor.getValue() : '';
            navigator.clipboard.writeText(code).then(() => {
                if (window.globalToastManager) {
                    window.globalToastManager.success(safeI18n('xpzmvk', '复制成功'), copyBtn);
                }
            });
        });

        editorHeader.querySelector('.runner-action-close').addEventListener('click', () => {
            // 还原布局容器的原始样式（使用 removeProperty 移除 important 样式）
            if (layoutContainer.dataset.originalHeight) {
                layoutContainer.style.removeProperty('display');
                layoutContainer.style.removeProperty('min-height');
                layoutContainer.style.removeProperty('height');
                layoutContainer.style.removeProperty('max-height');
                layoutContainer.style.removeProperty('overflow');
                delete layoutContainer.dataset.originalHeight;
            }
            // 显示 Run 按钮
            if (container._runButton) {
                container._runButton.style.display = '';
            }
            container.remove();
        });

        resultHeader.querySelector('.runner-action-clear').addEventListener('click', () => {
            resultContent.innerHTML = '<div class="runner-output-empty">（无输出）</div>';
        });

        const copyOutputBtn = resultHeader.querySelector('.runner-output-copy');
        copyOutputBtn.addEventListener('click', () => {
            // 获取输出内容的纯文本
            const outputText = resultContent.innerText || resultContent.textContent || '';
            navigator.clipboard.writeText(outputText).then(() => {
                if (window.globalToastManager) {
                    window.globalToastManager.success(safeI18n('xpzmvk', '复制成功'), copyOutputBtn);
                }
            });
        });

        resultHeader.querySelector('.runner-action-run').addEventListener('click', () => {
            const code = cmEditor ? cmEditor.getValue() : '';
            const language = container._language || 'javascript';
            executeCode(code, resultContent, runButton, language);
        });

        return { container, cmEditor, contentEl: resultContent };
    }

    // ===== 执行逻辑 =====

    /**
     * 执行代码
     * @param {string} code - 代码
     * @param {HTMLElement} contentEl - 输出容器
     * @param {HTMLElement} runButton - 运行按钮
     * @param {string} language - 语言类型 'javascript' | 'python'
     */
    async function executeCode(code, contentEl, runButton, language = 'javascript') {
        if (!code.trim()) {
            contentEl.innerHTML = '<div class="runner-output-empty">（无代码）</div>';
            return;
        }

        contentEl.innerHTML = '<div class="runner-result-loading">执行中...</div>';
        runButton.classList.add('loading');
        runButton.disabled = true;

        try {
            const manager = getRunnerManager();
            const outputs = [];

            await manager.run(code, language, {
                onOutput: (output) => {
                    // 特殊处理各种输出类型
                    if (output.level === 'table') {
                        // SQL 表格
                        outputs.push({ 
                            type: 'table', 
                            columns: output.data.columns, 
                            values: output.data.values 
                        });
                    } else if (output.level === 'html-preview') {
                        // HTML 预览
                        outputs.push({ type: 'html-preview', html: output.data.html });
                    } else if (output.level === 'json-formatted') {
                        // JSON 格式化
                        outputs.push({ type: 'json-formatted', json: output.data.json });
                    } else if (output.level === 'markdown-preview') {
                        // Markdown 预览
                        outputs.push({ type: 'markdown-preview', html: output.data.html });
                    } else {
                        // 普通输出
                        const content = Array.isArray(output.data) ? output.data.join(' ') : output.data;
                        outputs.push({ type: output.level || 'log', content: content });
                    }
                    // 实时渲染输出
                    renderOutput(contentEl, outputs);
                },
                onError: (error) => {
                    outputs.push({ type: 'error', content: error.message || error });
                },
                onComplete: () => {
                    renderOutput(contentEl, outputs);
                }
            });
        } catch (error) {
            contentEl.innerHTML = `<div class="runner-output-error">${escapeHtml(error.message)}</div>`;
        } finally {
            runButton.classList.remove('loading');
            runButton.disabled = false;
        }
    }

    /**
     * 处理运行按钮点击
     * @param {HTMLElement} codeElement - code 元素
     * @param {HTMLElement} layoutContainer - 布局容器
     * @param {HTMLElement} runButton - 运行按钮
     * @param {string} language - 语言类型 'javascript' | 'python'
     */
    async function handleRunClick(codeElement, layoutContainer, runButton, language = 'javascript') {
        // 确保布局容器有 position: relative
        if (getComputedStyle(layoutContainer).position === 'static') {
            layoutContainer.style.position = 'relative';
        }

        // 检查并调整布局容器高度（只有高度不足时才调整）
        const currentHeight = layoutContainer.offsetHeight;
        if (currentHeight < CONFIG.minContainerHeight) {
            // 保存原始高度
            if (!layoutContainer.dataset.originalHeight) {
                layoutContainer.dataset.originalHeight = currentHeight;
            }
            // 使用 setProperty 加 important 强制覆盖外部样式
            // display: inline 会阻止 height 生效，需要改为 block
            layoutContainer.style.setProperty('display', 'block', 'important');
            layoutContainer.style.setProperty('min-height', CONFIG.minContainerHeight + 'px', 'important');
            layoutContainer.style.setProperty('height', CONFIG.minContainerHeight + 'px', 'important');
            layoutContainer.style.setProperty('max-height', 'none', 'important');
            layoutContainer.style.setProperty('overflow', 'visible', 'important');
        }

        // 获取或创建 Runner 容器（在布局容器内部）
        let container = layoutContainer.querySelector('.runner-container');
        let cmEditor, contentEl;

        if (!container) {
            const result = createRunnerContainer(layoutContainer, runButton, language);
            container = result.container;
            cmEditor = result.cmEditor;
            contentEl = result.contentEl;
            // 存储 runButton 引用，用于关闭时恢复显示
            container._runButton = runButton;
            // 存储语言类型
            container._language = language;
            // 插入到布局容器内部
            layoutContainer.appendChild(container);
        } else {
            cmEditor = container._cmEditor;
            contentEl = container.querySelector('.runner-result-content');
        }
        
        // 隐藏 Run 按钮
        runButton.style.display = 'none';

        // 直接使用 textContent 获取代码
        const code = getCodeText(codeElement);

        // 存储语言类型到容器上，供内部 Run 按钮使用
        container._language = language;

        if (cmEditor) {
            cmEditor.setValue(code);
            setTimeout(() => cmEditor.refresh(), 10);
        }
        await executeCode(code, contentEl, runButton, language);
    }

    // ===== 输出渲染 =====

    /**
     * 渲染输出结果
     * @param {HTMLElement} container - 容器元素
     * @param {Array} outputs - 输出数组
     */
    function renderOutput(container, outputs) {
        if (!outputs || outputs.length === 0) {
            container.innerHTML = '<div class="runner-output-empty">（无输出）</div>';
            return;
        }

        container.innerHTML = outputs.map(output => {
            // SQL 表格
            if (output.type === 'table') {
                return renderSQLTable(output.columns, output.values);
            }
            // HTML 预览
            if (output.type === 'html-preview') {
                return renderHtmlPreview(output.html);
            }
            // JSON 格式化
            if (output.type === 'json-formatted') {
                return renderJsonFormatted(output.json);
            }
            // Markdown 预览
            if (output.type === 'markdown-preview') {
                return renderMarkdownPreview(output.html);
            }
            // 普通输出
            const typeClass = `runner-output-${output.type || 'log'}`;
            const content = formatOutputContent(output.content);
            return `<div class="${typeClass}">${content}</div>`;
        }).join('');
    }

    /**
     * 渲染 HTML 预览
     */
    function renderHtmlPreview(html) {
        // 使用 srcdoc 创建安全的 iframe 预览
        const escapedHtml = html.replace(/"/g, '&quot;');
        return `
            <div class="runner-html-preview">
                <iframe 
                    srcdoc="${escapedHtml}" 
                    sandbox="allow-scripts allow-same-origin"
                    style="width: 100%; height: 200px; border: 1px solid var(--runner-border); border-radius: 4px; background: white;"
                ></iframe>
            </div>
        `;
    }

    /**
     * 渲染格式化的 JSON
     */
    function renderJsonFormatted(json) {
        // 语法高亮
        const highlighted = json
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"([^"]+)":/g, '<span class="runner-json-key">"$1"</span>:')
            .replace(/: "([^"]*)"/g, ': <span class="runner-json-string">"$1"</span>')
            .replace(/: (\d+)/g, ': <span class="runner-json-number">$1</span>')
            .replace(/: (true|false)/g, ': <span class="runner-json-boolean">$1</span>')
            .replace(/: (null)/g, ': <span class="runner-json-null">$1</span>');
        
        return `<pre class="runner-json-output">${highlighted}</pre>`;
    }

    /**
     * 渲染 Markdown 预览
     */
    function renderMarkdownPreview(html) {
        return `<div class="runner-markdown-preview">${html}</div>`;
    }

    /**
     * 渲染 SQL 表格
     * @param {Array<string>} columns - 列名
     * @param {Array<Array>} values - 数据行
     * @returns {string} HTML 字符串
     */
    function renderSQLTable(columns, values) {
        if (!columns || columns.length === 0) {
            return '<div class="runner-output-info">查询成功，无返回数据</div>';
        }

        const headerCells = columns.map(col => `<th>${escapeHtml(col)}</th>`).join('');
        const rows = (values || []).map(row => {
            const cells = row.map(cell => {
                const cellValue = cell === null ? '<span class="runner-null">NULL</span>' : escapeHtml(String(cell));
                return `<td>${cellValue}</td>`;
            }).join('');
            return `<tr>${cells}</tr>`;
        }).join('');

        return `
            <div class="runner-sql-table-wrapper">
                <table class="runner-sql-table">
                    <thead><tr>${headerCells}</tr></thead>
                    <tbody>${rows}</tbody>
                </table>
                <div class="runner-sql-table-info">${values ? values.length : 0} 行</div>
            </div>
        `;
    }

    /**
     * 格式化输出内容
     * @param {*} content - 输出内容
     * @returns {string}
     */
    function formatOutputContent(content) {
        if (content === undefined) return '<span class="runner-undefined">undefined</span>';
        if (content === null) return '<span class="runner-null">null</span>';
        if (typeof content === 'string') return escapeHtml(content);
        if (typeof content === 'object') {
            try {
                return escapeHtml(JSON.stringify(content, null, 2));
            } catch {
                return escapeHtml(String(content));
            }
        }
        return escapeHtml(String(content));
    }

    // ===== 扫描与初始化 =====

    /**
     * 为代码块初始化运行器
     * @param {HTMLElement} codeElement - code 元素
     * @param {HTMLElement} layoutContainer - 布局容器
     * @param {Object} config - 配置对象
     * @param {Object} enabledLanguages - 已启用的语言 { javascript: boolean, python: boolean }
     */
    function initializeCodeBlock(codeElement, layoutContainer, config, enabledLanguages) {
        // 跳过已处理的（已添加 Run 按钮的）
        if (codeElement.hasAttribute(CONFIG.processedAttr)) return;
        
        // 跳过已有 Run 按钮的 layoutContainer（防止嵌套 code 重复添加）
        if (layoutContainer.querySelector('.runner-code-run-btn')) {
            codeElement.setAttribute(CONFIG.processedAttr, 'true');
            return;
        }

        // 检测代码语言
        const code = getCodeText(codeElement);
        const language = detectLanguage(code);
        
        // 没检测到支持的语言，不标记，下次继续检测
        if (!language) return;
        
        // 检查该语言是否启用
        if (!enabledLanguages[language]) return;
        
        // 检测到支持的代码，标记为已处理
        codeElement.setAttribute(CONFIG.processedAttr, 'true');

        // 确保 layoutContainer 有定位上下文（用于 absolute 定位按钮）
        const position = getComputedStyle(layoutContainer).position;
        if (position === 'static') {
            layoutContainer.style.position = 'relative';
        }

        // 创建运行按钮（absolute 定位在 layoutContainer 内）
        const runButton = createRunButton(codeElement, layoutContainer, language);
        
        // 插入按钮到 layoutContainer 内部
        layoutContainer.appendChild(runButton);
    }

    /**
     * 检查 JavaScript Runner 是否启用
     * @returns {Promise<boolean>}
     */
    async function isJavaScriptRunnerEnabled() {
        try {
            const result = await chrome.storage.local.get('runnerJsEnabled');
            // 默认值为 true（开启）
            return result.runnerJsEnabled !== false;
        } catch (e) {
            console.error('[Runner] Failed to check enabled state:', e);
            return true; // 默认开启
        }
    }

    /**
     * 检查 Python Runner 是否启用
     * @returns {Promise<boolean>}
     */
    async function isPythonRunnerEnabled() {
        try {
            const result = await chrome.storage.local.get('runnerPythonEnabled');
            // 默认值为 true（开启）
            return result.runnerPythonEnabled !== false;
        } catch (e) {
            console.error('[Runner] Failed to check Python enabled state:', e);
            return true; // 默认开启
        }
    }

    /**
     * 检查 TypeScript Runner 是否启用
     * @returns {Promise<boolean>}
     */
    async function isTypeScriptRunnerEnabled() {
        try {
            const result = await chrome.storage.local.get('runnerTypeScriptEnabled');
            // 默认值为 true（开启）
            return result.runnerTypeScriptEnabled !== false;
        } catch (e) {
            console.error('[Runner] Failed to check TypeScript enabled state:', e);
            return true; // 默认开启
        }
    }

    /**
     * 检查 SQL Runner 是否启用
     * @returns {Promise<boolean>}
     */
    async function isSQLRunnerEnabled() {
        try {
            const result = await chrome.storage.local.get('runnerSQLEnabled');
            // 默认值为 true（开启）
            return result.runnerSQLEnabled !== false;
        } catch (e) {
            console.error('[Runner] Failed to check SQL enabled state:', e);
            return true; // 默认开启
        }
    }

    /**
     * 检查 HTML Runner 是否启用
     * @returns {Promise<boolean>}
     */
    async function isHtmlRunnerEnabled() {
        try {
            const result = await chrome.storage.local.get('runnerHtmlEnabled');
            return result.runnerHtmlEnabled !== false;
        } catch (e) {
            return true;
        }
    }

    /**
     * 检查 JSON Runner 是否启用
     * @returns {Promise<boolean>}
     */
    async function isJsonRunnerEnabled() {
        try {
            const result = await chrome.storage.local.get('runnerJsonEnabled');
            return result.runnerJsonEnabled !== false;
        } catch (e) {
            return true;
        }
    }

    /**
     * 检查 Markdown Runner 是否启用
     * @returns {Promise<boolean>}
     */
    async function isMarkdownRunnerEnabled() {
        try {
            const result = await chrome.storage.local.get('runnerMarkdownEnabled');
            return result.runnerMarkdownEnabled !== false;
        } catch (e) {
            return true;
        }
    }

    /**
     * 检查 Lua Runner 是否启用
     * @returns {Promise<boolean>}
     */
    async function isLuaRunnerEnabled() {
        try {
            const result = await chrome.storage.local.get('runnerLuaEnabled');
            return result.runnerLuaEnabled !== false;
        } catch (e) {
            return true;
        }
    }

    /**
     * 检查 Ruby Runner 是否启用
     * @returns {Promise<boolean>}
     */
    async function isRubyRunnerEnabled() {
        try {
            const result = await chrome.storage.local.get('runnerRubyEnabled');
            return result.runnerRubyEnabled !== false;
        } catch (e) {
            return true;
        }
    }

    /**
     * 检查指定语言是否启用
     * @param {string} language - 语言类型
     * @returns {Promise<boolean>}
     */
    async function isLanguageEnabled(language) {
        if (language === 'javascript') return isJavaScriptRunnerEnabled();
        if (language === 'python') return isPythonRunnerEnabled();
        if (language === 'typescript') return isTypeScriptRunnerEnabled();
        if (language === 'sql') return isSQLRunnerEnabled();
        if (language === 'html') return isHtmlRunnerEnabled();
        if (language === 'json') return isJsonRunnerEnabled();
        if (language === 'markdown') return isMarkdownRunnerEnabled();
        if (language === 'lua') return isLuaRunnerEnabled();
        if (language === 'ruby') return isRubyRunnerEnabled();
        return false;
    }

    /**
     * 扫描并处理所有代码块
     */
    async function scanCodeBlocks() {
        // 检查各语言是否启用
        const [jsEnabled, pyEnabled, tsEnabled, sqlEnabled, htmlEnabled, jsonEnabled, mdEnabled, luaEnabled, rubyEnabled] = await Promise.all([
            isJavaScriptRunnerEnabled(),
            isPythonRunnerEnabled(),
            isTypeScriptRunnerEnabled(),
            isSQLRunnerEnabled(),
            isHtmlRunnerEnabled(),
            isJsonRunnerEnabled(),
            isMarkdownRunnerEnabled(),
            isLuaRunnerEnabled(),
            isRubyRunnerEnabled()
        ]);
        
        // 如果所有语言都禁用，不扫描
        if (!jsEnabled && !pyEnabled && !tsEnabled && !sqlEnabled && !htmlEnabled && !jsonEnabled && !mdEnabled && !luaEnabled && !rubyEnabled) {
            return;
        }
        
        const enabledLanguages = {
            javascript: jsEnabled,
            python: pyEnabled,
            typescript: tsEnabled,
            sql: sqlEnabled,
            html: htmlEnabled,
            json: jsonEnabled,
            markdown: mdEnabled,
            lua: luaEnabled,
            ruby: rubyEnabled
        };
        
        // 遍历配置，按优先级匹配代码块
        for (const config of CODE_BLOCK_CONFIGS) {
            const codeElements = document.querySelectorAll(
                `${config.codeSelector}:not([${CONFIG.processedAttr}])`
            );
            
            codeElements.forEach(codeElement => {
                // 获取布局容器
                const layoutContainer = codeElement.closest(config.layoutSelector);
                if (layoutContainer) {
                    initializeCodeBlock(codeElement, layoutContainer, config, enabledLanguages);
                }
            });
        }
    }

    /**
     * 初始化 Runner 模块
     */
    async function initialize() {
        // 检查是否有任何语言启用
        const [jsEnabled, pyEnabled, tsEnabled, sqlEnabled, htmlEnabled, jsonEnabled, mdEnabled, luaEnabled, rubyEnabled] = await Promise.all([
            isJavaScriptRunnerEnabled(),
            isPythonRunnerEnabled(),
            isTypeScriptRunnerEnabled(),
            isSQLRunnerEnabled(),
            isHtmlRunnerEnabled(),
            isJsonRunnerEnabled(),
            isMarkdownRunnerEnabled(),
            isLuaRunnerEnabled(),
            isRubyRunnerEnabled()
        ]);
        
        if (!jsEnabled && !pyEnabled && !tsEnabled && !sqlEnabled && !htmlEnabled && !jsonEnabled && !mdEnabled && !luaEnabled && !rubyEnabled) {
            console.log('[Runner] All runners are disabled, skipping initialization');
            return;
        }
        
        // 初始扫描
        await scanCodeBlocks();
        
        // 使用 DOMObserverManager 监听 DOM 变化
        // 防抖 500ms：等代码块输出完整后再添加 Run 按钮
        unsubscribeObserver = window.DOMObserverManager.getInstance().subscribeBody('runner', {
            callback: () => scanCodeBlocks(),
            filter: { hasAddedNodes: true },
            debounce: CONFIG.stableDelay  // 500ms 防抖
        });
    }

    /**
     * 清理资源
     */
    function cleanup() {
        // 取消 DOMObserverManager 订阅
        if (unsubscribeObserver) {
            unsubscribeObserver();
            unsubscribeObserver = null;
        }
        if (runnerManagerInstance) {
            runnerManagerInstance.cleanup();
            runnerManagerInstance = null;
        }
    }

    // ===== 暴露接口 =====

    if (typeof window !== 'undefined') {
        window.Runner = {
            getManager: getRunnerManager,
            scan: scanCodeBlocks,
            cleanup: cleanup
        };
    }

    // 自动初始化
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initialize);
    } else {
        initialize();
    }

})();
