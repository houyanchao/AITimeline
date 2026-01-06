/**
 * Ruby Sandbox Script
 * 
 * 在 iframe 沙箱中执行 Ruby 代码
 * 使用 Opal 作为 Ruby → JavaScript 编译器
 */

(function() {
    'use strict';

    let opalLoaded = false;

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
        postMessage('RUBY_OUTPUT', {
            level: level,
            data: args
        });
    }

    /**
     * 发送加载进度
     */
    function postLoading(message) {
        postMessage('RUBY_LOADING', { message });
    }

    /**
     * 执行 Ruby 代码
     */
    function executeRuby(code) {
        const startTime = Date.now();

        try {
            if (!opalLoaded || !window.Opal) {
                throw new Error('Opal 未加载');
            }

            // 重定向 puts 和 print 输出
            const outputBuffer = [];
            
            // 保存原始的 $stdout
            const originalStdout = Opal.gvars.stdout;
            
            // 创建自定义输出对象
            const customStdout = Opal.Object.$new();
            customStdout.$write = function(str) {
                const jsStr = str.toString();
                if (jsStr.trim() || jsStr === '\n') {
                    outputBuffer.push(jsStr);
                }
                return Opal.nil;
            };
            customStdout.$puts = function(...args) {
                args.forEach(arg => {
                    const str = arg === Opal.nil ? '' : arg.toString();
                    postOutput('log', str);
                });
                return Opal.nil;
            };
            customStdout.$print = function(...args) {
                const str = args.map(a => a === Opal.nil ? '' : a.toString()).join('');
                postOutput('log', str);
                return Opal.nil;
            };
            customStdout.$flush = function() { return Opal.nil; };
            
            // 设置自定义 stdout
            Opal.gvars.stdout = customStdout;

            try {
                // 编译并执行 Ruby 代码
                const result = Opal.eval(code);
                
                // 如果有返回值且不是 nil，显示它
                if (result !== Opal.nil && result !== undefined) {
                    const resultStr = result.toString();
                    if (resultStr && resultStr !== '' && resultStr !== 'nil') {
                        postOutput('result', '=> ' + resultStr);
                    }
                }
            } finally {
                // 恢复原始 stdout
                Opal.gvars.stdout = originalStdout;
            }

            const duration = Date.now() - startTime;
            postMessage('RUBY_COMPLETE', { success: true, duration });

        } catch (error) {
            const duration = Date.now() - startTime;
            
            // 格式化 Ruby 错误信息
            let errorMessage = error.message || String(error);
            
            // 尝试提取更友好的错误信息
            if (error.name && error.name.includes('Opal')) {
                errorMessage = error.message;
            }
            
            postMessage('RUBY_ERROR', { message: errorMessage });
            postMessage('RUBY_COMPLETE', { success: false, duration, error: errorMessage });
        }
    }

    /**
     * 监听来自父窗口的消息
     */
    window.addEventListener('message', (event) => {
        if (!event.data || typeof event.data !== 'object') return;
        
        const { type, code } = event.data;
        
        if (type === 'EXECUTE_RUBY' && code) {
            executeRuby(code);
        }
    });

    /**
     * Opal 加载完成后的回调
     */
    window.onOpalLoaded = function() {
        opalLoaded = true;
        postMessage('RUBY_SANDBOX_READY', {});
    };

    /**
     * Opal 加载失败的回调
     */
    window.onOpalError = function() {
        postMessage('RUBY_ERROR', { message: '无法加载 Opal，请检查网络连接' });
        postMessage('RUBY_COMPLETE', { success: false, duration: 0, error: '无法加载 Opal' });
    };

})();

