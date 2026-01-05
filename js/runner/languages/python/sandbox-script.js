/**
 * Python Sandbox Script
 * 
 * 在 iframe 沙箱中执行 Python 代码
 * 使用 Pyodide 作为 Python 运行时
 */

(function() {
    'use strict';

    let pyodide = null;
    let pyodideLoading = false;
    
    // Pyodide CDN 地址
    const PYODIDE_INDEX_URL = 'https://cdn.jsdelivr.net/pyodide/v0.24.1/full/';

    /**
     * 发送消息到父窗口
     */
    function postMessage(type, data) {
        if (window.parent && window.parent !== window) {
            window.parent.postMessage({ type, data }, '*');
        }
    }

    /**
     * 发送输出
     */
    function postOutput(level, ...args) {
        postMessage('PYTHON_OUTPUT', {
            level: level,
            data: args
        });
    }

    /**
     * 发送加载进度
     */
    function postLoading(message) {
        postMessage('PYTHON_LOADING', { message });
    }

    /**
     * 加载 Pyodide
     */
    async function loadPyodideRuntime() {
        if (pyodide) return pyodide;
        if (pyodideLoading) {
            // 等待加载完成
            while (pyodideLoading) {
                await new Promise(r => setTimeout(r, 100));
            }
            return pyodide;
        }

        pyodideLoading = true;
        postLoading('正在加载 Python 环境 (首次加载约需 10-20 秒)...');

        try {
            pyodide = await loadPyodide({
                indexURL: PYODIDE_INDEX_URL,
                stdout: (text) => {
                    if (text.trim()) {
                        postOutput('log', text);
                    }
                },
                stderr: (text) => {
                    if (text.trim()) {
                        postOutput('error', text);
                    }
                }
            });

            postLoading('Python 环境加载完成！');
            pyodideLoading = false;
            return pyodide;
        } catch (error) {
            pyodideLoading = false;
            throw new Error('加载 Python 环境失败: ' + error.message);
        }
    }

    /**
     * 执行 Python 代码
     */
    async function executePython(code) {
        const startTime = Date.now();

        try {
            // 加载 Pyodide
            const py = await loadPyodideRuntime();

            // 检查是否有 await 关键字，决定使用同步还是异步执行
            const hasAwait = /\bawait\b/.test(code);
            
            let result;
            if (hasAwait) {
                // 异步代码
                result = await py.runPythonAsync(code);
            } else {
                // 同步代码
                result = py.runPython(code);
            }

            // 如果有返回值且不是 None，输出它
            if (result !== undefined && result !== null && result.toString() !== 'None') {
                const resultStr = result.toString();
                if (resultStr.trim()) {
                    postOutput('result', resultStr);
                }
            }

            const duration = Date.now() - startTime;
            postMessage('PYTHON_COMPLETE', { success: true, duration });

        } catch (error) {
            const duration = Date.now() - startTime;
            
            // 格式化 Python 错误信息
            let errorMessage = error.message || String(error);
            
            // 尝试提取更友好的错误信息
            if (errorMessage.includes('PythonError:')) {
                errorMessage = errorMessage.split('PythonError:').pop().trim();
            }
            
            postMessage('PYTHON_ERROR', { message: errorMessage });
            postMessage('PYTHON_COMPLETE', { success: false, duration, error: errorMessage });
        }
    }

    /**
     * 监听来自父窗口的消息
     */
    window.addEventListener('message', async (event) => {
        if (!event.data || typeof event.data !== 'object') return;
        
        const { type, code } = event.data;
        
        if (type === 'EXECUTE_PYTHON' && code) {
            await executePython(code);
        }
    });

    // 通知父窗口沙箱已准备就绪
    postMessage('PYTHON_SANDBOX_READY', {});

})();

