/**
 * SQLRunner - SQL 代码执行器
 * 
 * 继承自 BaseRunner，使用 sql.js (SQLite WASM) 执行 SQL
 */

class SQLRunner extends BaseRunner {
    constructor() {
        super({
            language: 'sql',
            displayName: 'SQL',
            icon: '🗃️',
            fileExtension: '.sql'
        });
        this.sandboxManager = null;
    }

    /**
     * 初始化
     */
    async initialize() {
        if (!this.sandboxManager) {
            this.sandboxManager = new window.SQLSandboxManager();
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
            timeout = 30000  // SQL 执行超时 30 秒（首次加载 WASM 较慢）
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
        return '-- 输入 SQL 语句\nSELECT 1 + 1 AS result;';
    }

    /**
     * 获取示例代码
     * @returns {string}
     */
    getExampleCode() {
        return `-- SQL 示例代码 (SQLite)
-- 创建表
CREATE TABLE users (
    id INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    age INTEGER,
    email TEXT
);

-- 插入数据
INSERT INTO users (name, age, email) VALUES 
    ('张三', 25, 'zhangsan@example.com'),
    ('李四', 30, 'lisi@example.com'),
    ('王五', 28, 'wangwu@example.com');

-- 查询数据
SELECT * FROM users;

-- 条件查询
SELECT name, age FROM users WHERE age > 26;

-- 聚合查询
SELECT COUNT(*) AS total, AVG(age) AS avg_age FROM users;`;
    }
}

// 导出
if (typeof window !== 'undefined') {
    window.SQLRunner = SQLRunner;
}

