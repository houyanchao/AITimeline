/**
 * TypeScriptRunner - TypeScript 代码执行器
 * 
 * 继承自 BaseRunner，使用 TypeScript 编译器将 TS 编译为 JS 后执行
 */

class TypeScriptRunner extends BaseRunner {
    constructor() {
        super({
            language: 'typescript',
            displayName: 'TypeScript',
            icon: '🔷',
            fileExtension: '.ts'
        });
        this.sandboxManager = null;
    }

    /**
     * 初始化
     */
    async initialize() {
        if (!this.sandboxManager) {
            this.sandboxManager = new window.TypeScriptSandboxManager();
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
            timeout = 30000  // TypeScript 编译+执行超时 30 秒
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
        return '// 输入 TypeScript 代码\nconst msg: string = "Hello, World!";\nconsole.log(msg);';
    }

    /**
     * 获取示例代码
     * @returns {string}
     */
    getExampleCode() {
        return `// TypeScript 示例代码
interface User {
    name: string;
    age: number;
}

const user: User = {
    name: "张三",
    age: 25
};

console.log(\`用户: \${user.name}, 年龄: \${user.age}\`);

// 泛型函数
function identity<T>(arg: T): T {
    return arg;
}

console.log(identity<string>("Hello TypeScript!"));
console.log(identity<number>(42));`;
    }
}

// 导出
if (typeof window !== 'undefined') {
    window.TypeScriptRunner = TypeScriptRunner;
}

