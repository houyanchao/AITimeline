/**
 * PythonRunner - Python 代码执行器
 * 
 * 继承自 BaseRunner，使用 Pyodide 在 iframe 沙箱中执行 Python 代码
 */

class PythonRunner extends BaseRunner {
    constructor() {
        super({
            language: 'python',
            displayName: 'Python',
            icon: '🐍',
            fileExtension: '.py'
        });
        this.sandboxManager = null;
    }

    /**
     * 初始化
     */
    async initialize() {
        if (!this.sandboxManager) {
            this.sandboxManager = new window.PythonSandboxManager();
        }
        await super.initialize();
    }

    /**
     * 执行代码
     * @param {string} code - 要执行的代码
     * @param {Object} options - 选项
     * @returns {Promise}
     */
    async execute(code, options = {}) {
        await this.initialize();
        
        const {
            onOutput = () => {},
            timeout = 30000  // Python 超时设为 30 秒（首次加载 Pyodide 需要时间）
        } = options;
        
        try {
            const result = await this.sandboxManager.execute(
                code,
                onOutput,
                timeout
            );
            
            return {
                success: true,
                duration: result.duration,
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
        if (this.sandboxManager) {
            this.sandboxManager.destroy();
        }
    }

    /**
     * 获取占位符
     */
    getPlaceholder() {
        return '# 输入 Python 代码\nprint("Hello, World!")';
    }

    /**
     * 获取示例代码
     * @returns {string}
     */
    getExampleCode() {
        return `# Python 示例代码
print('Hello, Runner!')

numbers = [1, 2, 3, 4, 5]
total = sum(numbers)
print(f'数组求和: {total}')

# 支持异步代码
import asyncio

async def fetch_data():
    await asyncio.sleep(1)
    return '异步数据加载完成！'

data = await fetch_data()
print(data)`;
    }
}

// 导出
if (typeof window !== 'undefined') {
    window.PythonRunner = PythonRunner;
}

