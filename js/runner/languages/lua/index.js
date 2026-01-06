/**
 * LuaRunner - Lua 代码执行器
 * 
 * 使用 Fengari（Lua 5.3 的 JavaScript 实现）执行 Lua 代码
 */

class LuaRunner extends BaseRunner {
    constructor() {
        super({
            language: 'lua',
            displayName: 'Lua',
            icon: '🌙',
            fileExtension: '.lua'
        });
        this.sandboxManager = null;
    }

    /**
     * 初始化
     */
    async initialize() {
        if (!this.sandboxManager) {
            this.sandboxManager = new window.LuaSandboxManager();
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
            timeout = 15000  // Lua 执行较快，15秒超时
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
        return '-- 输入 Lua 代码\nprint("Hello, World!")';
    }

    /**
     * 获取示例代码
     * @returns {string}
     */
    getExampleCode() {
        return `-- Lua 示例代码
print("Hello, Lua!")

-- 变量和运算
local x = 10
local y = 20
print("x + y = " .. (x + y))

-- 表（数组）
local fruits = {"apple", "banana", "orange"}
for i, fruit in ipairs(fruits) do
    print(i .. ": " .. fruit)
end

-- 函数
local function factorial(n)
    if n <= 1 then
        return 1
    else
        return n * factorial(n - 1)
    end
end

print("5! = " .. factorial(5))

-- 表（字典）
local person = {
    name = "张三",
    age = 25,
    city = "北京"
}

for key, value in pairs(person) do
    print(key .. ": " .. tostring(value))
end`;
    }
}

// 导出
if (typeof window !== 'undefined') {
    window.LuaRunner = LuaRunner;
}

