/**
 * HtmlRunner - HTML/CSS 代码渲染器
 * 
 * 在 iframe 中渲染 HTML/CSS 代码预览
 */

class HtmlRunner extends BaseRunner {
    constructor() {
        super({
            language: 'html',
            displayName: 'HTML',
            icon: '🌐',
            fileExtension: '.html'
        });
    }

    /**
     * 执行（渲染）代码
     * @param {string} code - 要渲染的代码
     * @param {Object} options - 选项
     * @returns {Promise}
     */
    async execute(code, options = {}) {
        const startTime = Date.now();
        const { onOutput = () => {} } = options;
        
        try {
            // 发送 HTML 预览数据
            onOutput({
                level: 'html-preview',
                data: { html: code }
            });
            
            const duration = Date.now() - startTime;
            return {
                success: true,
                duration: duration,
                language: this.language
            };
        } catch (error) {
            onOutput({
                level: 'error',
                data: [error.message]
            });
            
            return {
                success: false,
                error: error.message,
                language: this.language
            };
        }
    }

    /**
     * 清理资源
     */
    cleanup() {
        // 无需清理
    }

    /**
     * 获取占位符
     */
    getPlaceholder() {
        return '<!-- 输入 HTML 代码 -->\n<h1>Hello World</h1>';
    }

    /**
     * 获取示例代码
     * @returns {string}
     */
    getExampleCode() {
        return `<!DOCTYPE html>
<html>
<head>
    <style>
        body {
            font-family: -apple-system, sans-serif;
            padding: 20px;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            min-height: 100vh;
            margin: 0;
        }
        .card {
            background: white;
            border-radius: 12px;
            padding: 24px;
            box-shadow: 0 10px 40px rgba(0,0,0,0.2);
            max-width: 300px;
        }
        h1 { color: #333; margin: 0 0 12px; }
        p { color: #666; margin: 0; }
        button {
            margin-top: 16px;
            padding: 10px 20px;
            background: #667eea;
            color: white;
            border: none;
            border-radius: 6px;
            cursor: pointer;
        }
        button:hover { background: #5a6fd6; }
    </style>
</head>
<body>
    <div class="card">
        <h1>欢迎!</h1>
        <p>这是一个 HTML/CSS 预览示例</p>
        <button onclick="alert('Hello!')">点击我</button>
    </div>
</body>
</html>`;
    }
}

// 导出
if (typeof window !== 'undefined') {
    window.HtmlRunner = HtmlRunner;
}

