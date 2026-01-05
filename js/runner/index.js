/**
 * Runner - 代码块运行器
 * 
 * 检测页面中的代码块，为 JavaScript 代码块添加运行按钮
 * 完全独立运行，不依赖时间轴功能
 * 支持多平台：ChatGPT、Gemini、Claude、DeepSeek、豆包等
 */

(function() {
    'use strict';

    // ===== 配置区域 =====
    
    const CONFIG = {
        // JavaScript 关键词检测（包含这些关键词的代码块才显示运行按钮）
        jsKeywords: ['let ', 'var ', 'const ', 'console.'],
        // DOM 稳定延迟（1秒内无 DOM 变化视为稳定，执行扫描）
        stableDelay: 1000,
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
     * 检查代码是否包含 JavaScript 关键词
     * @param {string} code - 代码文本
     * @returns {boolean}
     */
    function isJavaScriptCode(code) {
        if (!code || typeof code !== 'string') return false;
        const normalizedCode = code.replace(/\u00A0/g, ' ');
        return CONFIG.jsKeywords.some(keyword => normalizedCode.includes(keyword));
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
     * @returns {HTMLElement}
     */
    function createRunButton(codeElement, layoutContainer) {
        const button = document.createElement('button');
        button.className = 'runner-code-run-btn';
        button.innerHTML = `
            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                <path d="M8 5v14l11-7z"/>
            </svg>
            <span>Run</span>
        `;
        button.setAttribute('title', '运行代码');
        
        // 动态计算 z-index，确保在其他同级元素之上
        const maxZ = getMaxChildZIndex(layoutContainer);
        button.style.zIndex = maxZ + 1;
        
        button.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            handleRunClick(codeElement, layoutContainer, button);
        });
        
        return button;
    }

    /**
     * 创建 Runner 容器（包含 CodeMirror 编辑器和结果面板）
     * @param {HTMLElement} layoutContainer - 布局容器
     * @param {HTMLElement} runButton - 运行按钮
     * @returns {Object} { container, cmEditor, contentEl }
     */
    function createRunnerContainer(layoutContainer, runButton) {
        // 创建容器
        const container = document.createElement('div');
        container.className = 'runner-container';
        
        // 动态计算 z-index，确保在其他同级元素之上
        const maxZ = getMaxChildZIndex(layoutContainer);
        container.style.zIndex = maxZ + 1;

        // 创建编辑器区域
        const editorSection = document.createElement('div');
        editorSection.className = 'runner-editor-section';
        editorSection.style.minHeight = (CONFIG.headerHeight + CONFIG.codeMinHeight) + 'px';

        const editorHeader = document.createElement('div');
        editorHeader.className = 'runner-section-header';
        editorHeader.style.height = CONFIG.headerHeight + 'px';
        editorHeader.innerHTML = `<span class="runner-section-title"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="16 18 22 12 16 6"></polyline><polyline points="8 6 2 12 8 18"></polyline></svg><span>Code</span></span><div class="runner-section-actions"><button class="runner-action-copy" title="复制代码"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg></button><button class="runner-action-close" title="关闭"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg></button></div>`;

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
        resultHeader.innerHTML = `<span class="runner-section-title"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="4 17 10 11 4 5"></polyline><line x1="12" y1="19" x2="20" y2="19"></line></svg><span>Output</span></span><div class="runner-section-actions"><button class="runner-action-clear" title="清空输出"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg></button><button class="runner-action-run" title="运行代码"><svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg><span>Run</span></button></div>`;

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
        const copyBtn = editorHeader.querySelector('.runner-action-copy');
        copyBtn.addEventListener('click', () => {
            const code = cmEditor ? cmEditor.getValue() : '';
            navigator.clipboard.writeText(code).then(() => {
                if (window.globalToastManager) {
                    window.globalToastManager.success('复制成功', copyBtn);
                }
            });
        });

        editorHeader.querySelector('.runner-action-close').addEventListener('click', () => {
            // 还原布局容器的原始高度
            if (layoutContainer.dataset.originalHeight) {
                layoutContainer.style.minHeight = '';
                delete layoutContainer.dataset.originalHeight;
            }
            // 显示 Run 按钮
            if (container._runButton) {
                container._runButton.style.display = '';
            }
            container.remove();
        });

        resultHeader.querySelector('.runner-action-clear').addEventListener('click', () => {
            resultContent.innerHTML = '';
        });

        resultHeader.querySelector('.runner-action-run').addEventListener('click', () => {
            const code = cmEditor ? cmEditor.getValue() : '';
            executeCode(code, resultContent, runButton);
        });

        return { container, cmEditor, contentEl: resultContent };
    }

    // ===== 执行逻辑 =====

    /**
     * 执行代码
     * @param {string} code - 代码
     * @param {HTMLElement} contentEl - 输出容器
     * @param {HTMLElement} runButton - 运行按钮
     */
    async function executeCode(code, contentEl, runButton) {
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

            await manager.run(code, 'javascript', {
                onOutput: (output) => {
                    // 转换格式：{ level, data } -> { type, content }
                    const content = Array.isArray(output.data) ? output.data.join(' ') : output.data;
                    outputs.push({ type: output.level || 'log', content: content });
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
     */
    async function handleRunClick(codeElement, layoutContainer, runButton) {
        // 确保布局容器有 position: relative
        if (getComputedStyle(layoutContainer).position === 'static') {
            layoutContainer.style.position = 'relative';
        }

        // 检查并调整布局容器高度
        const currentHeight = layoutContainer.offsetHeight;
        if (currentHeight < CONFIG.minContainerHeight) {
            // 保存原始高度
            if (!layoutContainer.dataset.originalHeight) {
                layoutContainer.dataset.originalHeight = currentHeight;
            }
            layoutContainer.style.minHeight = CONFIG.minContainerHeight + 'px';
        }

        // 获取或创建 Runner 容器（在布局容器内部）
        let container = layoutContainer.querySelector('.runner-container');
        let cmEditor, contentEl;

        if (!container) {
            const result = createRunnerContainer(layoutContainer, runButton);
            container = result.container;
            cmEditor = result.cmEditor;
            contentEl = result.contentEl;
            // 存储 runButton 引用，用于关闭时恢复显示
            container._runButton = runButton;
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

        if (cmEditor) {
            cmEditor.setValue(code);
            setTimeout(() => cmEditor.refresh(), 10);
        }
        await executeCode(code, contentEl, runButton);
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
            const typeClass = `runner-output-${output.type || 'log'}`;
            const content = formatOutputContent(output.content);
            return `<div class="${typeClass}">${content}</div>`;
        }).join('');
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
     */
    function initializeCodeBlock(codeElement, layoutContainer, config) {
        // 跳过已处理的（已添加 Run 按钮的）
        if (codeElement.hasAttribute(CONFIG.processedAttr)) return;
        
        // 跳过已有 Run 按钮的 layoutContainer（防止嵌套 code 重复添加）
        if (layoutContainer.querySelector('.runner-code-run-btn')) {
            codeElement.setAttribute(CONFIG.processedAttr, 'true');
            return;
        }

        // 检查是否是 JavaScript 代码（仅通过关键词检测）
        const code = getCodeText(codeElement);
        if (!isJavaScriptCode(code)) return;  // 没检测到 JS，不标记，下次继续检测
        
        // 检测到 JS 代码，标记为已处理
        codeElement.setAttribute(CONFIG.processedAttr, 'true');

        // 确保 layoutContainer 有定位上下文（用于 absolute 定位按钮）
        const position = getComputedStyle(layoutContainer).position;
        if (position === 'static') {
            layoutContainer.style.position = 'relative';
        }

        // 创建运行按钮（absolute 定位在 layoutContainer 内）
        const runButton = createRunButton(codeElement, layoutContainer);
        
        // 插入按钮到 layoutContainer 内部
        layoutContainer.appendChild(runButton);
    }

    /**
     * 扫描并处理所有代码块
     */
    function scanCodeBlocks() {
        // 遍历配置，按优先级匹配代码块
        for (const config of CODE_BLOCK_CONFIGS) {
            const codeElements = document.querySelectorAll(
                `${config.codeSelector}:not([${CONFIG.processedAttr}])`
            );
            
            codeElements.forEach(codeElement => {
                // 获取布局容器
                const layoutContainer = codeElement.closest(config.layoutSelector);
                if (layoutContainer) {
                    initializeCodeBlock(codeElement, layoutContainer, config);
                }
            });
        }
    }

    /**
     * 初始化 Runner 模块
     */
    function initialize() {
        // 初始扫描
        scanCodeBlocks();
        
        // 使用 DOMObserverManager 监听 DOM 变化
        // 防抖 1 秒：等代码块输出完整后再添加 Run 按钮
        unsubscribeObserver = window.DOMObserverManager.getInstance().subscribeBody('runner', {
            callback: () => scanCodeBlocks(),
            filter: { hasAddedNodes: true },
            debounce: CONFIG.stableDelay  // 1秒防抖
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
