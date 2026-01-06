/**
 * Runner Tab - 代码运行器设置
 * 
 * 功能：
 * - 管理各语言代码块运行功能的开关（JS、Python 等）
 * - 默认开启
 */

class RunnerTab extends BaseTab {
    constructor() {
        super();
        this.id = 'runner';
        this.name = chrome.i18n.getMessage('runnerTabName') || '代码运行';
        this.icon = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <polygon points="5 3 19 12 5 21 5 3"></polygon>
        </svg>`;
        
        // 语言配置
        this.languages = [
            {
                id: 'javascript',
                name: 'JavaScript',
                storageKey: 'runnerJsEnabled'
            },
            {
                id: 'typescript',
                name: 'TypeScript',
                storageKey: 'runnerTypeScriptEnabled'
            },
            {
                id: 'python',
                name: 'Python',
                storageKey: 'runnerPythonEnabled'
            },
            {
                id: 'sql',
                name: 'SQL',
                storageKey: 'runnerSQLEnabled'
            },
            {
                id: 'html',
                name: 'HTML',
                storageKey: 'runnerHtmlEnabled'
            },
            {
                id: 'json',
                name: 'JSON',
                storageKey: 'runnerJsonEnabled'
            },
            {
                id: 'markdown',
                name: 'Markdown',
                storageKey: 'runnerMarkdownEnabled'
            },
            {
                id: 'lua',
                name: 'Lua',
                storageKey: 'runnerLuaEnabled'
            },
            {
                id: 'ruby',
                name: 'Ruby',
                storageKey: 'runnerRubyEnabled'
            }
        ];
    }
    
    /**
     * 渲染设置内容
     */
    render() {
        const container = document.createElement('div');
        container.className = 'runner-settings-tab';
        
        // 生成各语言的开关项
        const languageItems = this.languages.map(lang => `
            <div class="platform-item" data-lang="${lang.id}">
                <div class="platform-info-left">
                    <span class="platform-name">${lang.name}</span>
                </div>
                <label class="ait-toggle-switch">
                    <input type="checkbox" id="runner-${lang.id}-toggle">
                    <span class="ait-toggle-slider"></span>
                </label>
            </div>
        `).join('');
        
        container.innerHTML = `
            <div class="platform-list">
                <div class="platform-list-title">${chrome.i18n.getMessage('runnerSettingsTitle') || '代码运行功能'}</div>
                <div class="platform-list-hint">${chrome.i18n.getMessage('runnerSettingsHint') || '控制是否在代码块上显示运行按钮'}</div>
                <div class="platform-list-container">
                    ${languageItems}
                </div>
            </div>
        `;
        
        return container;
    }
    
    /**
     * Tab 激活时加载状态
     */
    async mounted() {
        super.mounted();
        
        // 为每个语言设置开关状态和事件
        for (const lang of this.languages) {
            const toggle = document.getElementById(`runner-${lang.id}-toggle`);
            if (!toggle) continue;
            
            // 读取当前状态（默认开启）
            try {
                const result = await chrome.storage.local.get(lang.storageKey);
                // 默认值为 true（开启）
                toggle.checked = result[lang.storageKey] !== false;
            } catch (e) {
                console.error(`[RunnerTab] Failed to load ${lang.id} state:`, e);
                toggle.checked = true;
            }
            
            // 监听开关变化
            this.addEventListener(toggle, 'change', async (e) => {
                await this._handleToggleChange(lang, e.target.checked, toggle);
            });
        }
    }
    
    /**
     * 处理开关变化
     */
    async _handleToggleChange(lang, enabled, toggle) {
        try {
            // 保存到 Storage
            await chrome.storage.local.set({ [lang.storageKey]: enabled });
            
            if (lang.id === 'javascript') {
                this._handleJavaScriptToggle(enabled);
            } else if (lang.id === 'python') {
                this._handlePythonToggle(enabled);
            } else if (lang.id === 'typescript') {
                this._handleTypeScriptToggle(enabled);
            } else if (lang.id === 'sql') {
                this._handleSQLToggle(enabled);
            } else if (lang.id === 'html') {
                this._handleHtmlToggle(enabled);
            } else if (lang.id === 'json') {
                this._handleJsonToggle(enabled);
            } else if (lang.id === 'markdown') {
                this._handleMarkdownToggle(enabled);
            } else if (lang.id === 'lua') {
                this._handleLuaToggle(enabled);
            } else if (lang.id === 'ruby') {
                this._handleRubyToggle(enabled);
            }
            
            console.log(`[RunnerTab] ${lang.id} runner enabled:`, enabled);
        } catch (e) {
            console.error(`[RunnerTab] Failed to save ${lang.id} state:`, e);
            // 保存失败，恢复 checkbox 状态
            toggle.checked = !toggle.checked;
        }
    }
    
    /**
     * 处理 JavaScript 运行器开关
     */
    _handleJavaScriptToggle(enabled) {
        if (enabled) {
            // 开启功能
            if (window.Runner) {
                // 重新扫描页面，添加 Run 按钮
                window.Runner.scan();
            }
        } else {
            // 关闭功能：移除 JavaScript 的 Run 按钮
            this._removeRunButtonsByLanguage('javascript');
        }
    }
    
    /**
     * 处理 Python 运行器开关
     */
    _handlePythonToggle(enabled) {
        if (enabled) {
            // 开启功能
            if (window.Runner) {
                // 重新扫描页面，添加 Run 按钮
                window.Runner.scan();
            }
        } else {
            // 关闭功能：移除 Python 的 Run 按钮
            this._removeRunButtonsByLanguage('python');
        }
    }
    
    /**
     * 处理 TypeScript 运行器开关
     */
    _handleTypeScriptToggle(enabled) {
        if (enabled) {
            // 开启功能
            if (window.Runner) {
                // 重新扫描页面，添加 Run 按钮
                window.Runner.scan();
            }
        } else {
            // 关闭功能：移除 TypeScript 的 Run 按钮
            this._removeRunButtonsByLanguage('typescript');
        }
    }
    
    /**
     * 处理 SQL 运行器开关
     */
    _handleSQLToggle(enabled) {
        if (enabled) {
            if (window.Runner) {
                window.Runner.scan();
            }
        } else {
            this._removeRunButtonsByLanguage('sql');
        }
    }
    
    /**
     * 处理 HTML 运行器开关
     */
    _handleHtmlToggle(enabled) {
        if (enabled) {
            if (window.Runner) {
                window.Runner.scan();
            }
        } else {
            this._removeRunButtonsByLanguage('html');
        }
    }
    
    /**
     * 处理 JSON 运行器开关
     */
    _handleJsonToggle(enabled) {
        if (enabled) {
            if (window.Runner) {
                window.Runner.scan();
            }
        } else {
            this._removeRunButtonsByLanguage('json');
        }
    }
    
    /**
     * 处理 Markdown 运行器开关
     */
    _handleMarkdownToggle(enabled) {
        if (enabled) {
            if (window.Runner) {
                window.Runner.scan();
            }
        } else {
            this._removeRunButtonsByLanguage('markdown');
        }
    }
    
    /**
     * 处理 Lua 运行器开关
     */
    _handleLuaToggle(enabled) {
        if (enabled) {
            if (window.Runner) {
                window.Runner.scan();
            }
        } else {
            this._removeRunButtonsByLanguage('lua');
        }
    }
    
    /**
     * 处理 Ruby 运行器开关
     */
    _handleRubyToggle(enabled) {
        if (enabled) {
            if (window.Runner) {
                window.Runner.scan();
            }
        } else {
            this._removeRunButtonsByLanguage('ruby');
        }
    }
    
    /**
     * 移除指定语言的 Run 按钮
     * @param {string} language - 语言类型
     */
    _removeRunButtonsByLanguage(language) {
        // 移除指定语言的 Run 按钮
        const runButtons = document.querySelectorAll(`.runner-code-run-btn[data-language="${language}"]`);
        runButtons.forEach(btn => btn.remove());
        
        // 移除对应的 Runner 容器
        const runnerContainers = document.querySelectorAll('.runner-container');
        runnerContainers.forEach(container => {
            if (container._language === language) {
                // 恢复 layoutContainer 的原始样式
                const layoutContainer = container.parentElement;
                if (layoutContainer && layoutContainer.dataset.originalHeight) {
                    layoutContainer.style.removeProperty('display');
                    layoutContainer.style.removeProperty('min-height');
                    layoutContainer.style.removeProperty('height');
                    layoutContainer.style.removeProperty('max-height');
                    layoutContainer.style.removeProperty('overflow');
                    delete layoutContainer.dataset.originalHeight;
                }
                // 显示 Run 按钮（如果有）
                if (container._runButton) {
                    container._runButton.style.display = '';
                }
                container.remove();
            }
        });
        
        // 移除已处理标记（让下次开启时可以重新扫描）
        // 注意：这里不能简单移除所有标记，需要让代码重新检测
        console.log(`[RunnerTab] Removed ${language} Run buttons`);
    }
    
    /**
     * 移除页面上所有 Run 按钮（关闭功能时调用）
     */
    _removeAllRunButtons() {
        // 移除所有 Run 按钮
        const runButtons = document.querySelectorAll('.runner-code-run-btn');
        runButtons.forEach(btn => btn.remove());
        
        // 移除所有 Runner 容器
        const runnerContainers = document.querySelectorAll('.runner-container');
        runnerContainers.forEach(container => {
            // 恢复 layoutContainer 的原始样式
            const layoutContainer = container.parentElement;
            if (layoutContainer && layoutContainer.dataset.originalHeight) {
                layoutContainer.style.removeProperty('display');
                layoutContainer.style.removeProperty('min-height');
                layoutContainer.style.removeProperty('height');
                layoutContainer.style.removeProperty('max-height');
                layoutContainer.style.removeProperty('overflow');
                delete layoutContainer.dataset.originalHeight;
            }
            container.remove();
        });
        
        // 移除已处理标记，下次开启时可重新添加
        const processedElements = document.querySelectorAll('[data-runner-initialized]');
        processedElements.forEach(el => el.removeAttribute('data-runner-initialized'));
        
        console.log('[RunnerTab] Removed all Run buttons and containers');
    }
    
    /**
     * Tab 卸载时清理
     */
    unmounted() {
        super.unmounted();
    }
}

// 导出
if (typeof window !== 'undefined') {
    window.RunnerTab = RunnerTab;
}
