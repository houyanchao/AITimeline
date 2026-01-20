/**
 * TypeScriptSandboxManager - TypeScript 沙箱管理器
 * 
 * 使用 TypeScript 编译器将 TS 编译为 JS，然后在沙箱中执行
 */

class TypeScriptSandboxManager {
    constructor() {
        this.currentSandbox = null;
        this.messageHandler = null;
        this.timeoutId = null;
        this.isReady = false;
        this.pendingCode = null;
        this.pendingResolve = null;
        this.pendingReject = null;
        this.pendingOnMessage = null;
    }

    /**
     * 获取沙箱 HTML 的 URL
     */
    getSandboxUrl() {
        if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.getURL) {
            return chrome.runtime.getURL('js/runner/languages/typescript/sandbox.html');
        }
        return null;
    }

    /**
     * 在沙箱中执行代码
     * @param {string} code - 要执行的 TypeScript 代码
     * @param {Function} onMessage - 消息回调
     * @param {number} timeout - 超时时间（毫秒）
     * @returns {Promise}
     */
    execute(code, onMessage, timeout = 30000) {
        return new Promise((resolve, reject) => {
            this.destroy();
            
            const sandboxUrl = this.getSandboxUrl();
            if (!sandboxUrl) {
                reject(new Error('无法获取沙箱 URL'));
                return;
            }
            
            this.pendingCode = code;
            this.pendingResolve = resolve;
            this.pendingReject = reject;
            this.pendingOnMessage = onMessage;
            this.isReady = false;
            
            const iframe = document.createElement('iframe');
            iframe.style.cssText = 'display:none;position:absolute;width:0;height:0;border:none;';
            
            this.messageHandler = (event) => {
                if (!event.data || typeof event.data !== 'object') return;
                
                const { type, data } = event.data;
                const validTypes = [
                    'TS_SANDBOX_READY', 
                    'TS_LOADING', 
                    'TS_OUTPUT', 
                    'TS_ERROR', 
                    'TS_COMPLETE'
                ];
                if (!validTypes.includes(type)) return;
                
                switch (type) {
                    case 'TS_SANDBOX_READY':
                        this.isReady = true;
                        if (this.currentSandbox && this.pendingCode) {
                            this.currentSandbox.contentWindow.postMessage({
                                type: 'EXECUTE_TS',
                                code: this.pendingCode
                            }, '*');
                        }
                        break;
                    
                    case 'TS_LOADING':
                        if (this.pendingOnMessage) {
                            this.pendingOnMessage({
                                level: 'info',
                                data: [data.message || '正在加载 TypeScript 编译器...']
                            });
                        }
                        break;
                        
                    case 'TS_OUTPUT':
                        if (this.pendingOnMessage) {
                            this.pendingOnMessage(data);
                        }
                        break;
                        
                    case 'TS_ERROR':
                        if (this.pendingOnMessage) {
                            this.pendingOnMessage({
                                level: 'error',
                                data: [data.message || String(data)]
                            });
                        }
                        break;
                        
                    case 'TS_COMPLETE':
                        clearTimeout(this.timeoutId);
                        const savedResolve = this.pendingResolve;
                        setTimeout(() => {
                            this.destroy();
                        }, 50);
                        if (savedResolve) {
                            savedResolve(data);
                        }
                        break;
                }
            };
            
            window.addEventListener('message', this.messageHandler);
            
            this.timeoutId = setTimeout(() => {
                const savedReject = this.pendingReject;
                this.destroy();
                if (savedReject) {
                    savedReject(new Error('代码执行超时（30秒）'));
                }
            }, timeout);
            
            document.body.appendChild(iframe);
            this.currentSandbox = iframe;
            iframe.src = sandboxUrl;
        });
    }

    /**
     * 清理沙箱
     */
    destroy() {
        if (this.timeoutId) {
            clearTimeout(this.timeoutId);
            this.timeoutId = null;
        }
        
        if (this.messageHandler) {
            window.removeEventListener('message', this.messageHandler);
            this.messageHandler = null;
        }
        
        if (this.currentSandbox) {
            this.currentSandbox.remove();
            this.currentSandbox = null;
        }
        
        this.isReady = false;
        this.pendingCode = null;
        this.pendingResolve = null;
        this.pendingReject = null;
        this.pendingOnMessage = null;
    }
}

if (typeof window !== 'undefined') {
    window.TypeScriptSandboxManager = TypeScriptSandboxManager;
}

