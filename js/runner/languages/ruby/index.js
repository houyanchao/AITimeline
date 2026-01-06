/**
 * RubyRunner - Ruby 代码执行器
 * 
 * 使用 Opal（Ruby → JavaScript 编译器）执行 Ruby 代码
 */

class RubyRunner extends BaseRunner {
    constructor() {
        super({
            language: 'ruby',
            displayName: 'Ruby',
            icon: '💎',
            fileExtension: '.rb'
        });
        this.sandboxManager = null;
    }

    /**
     * 初始化
     */
    async initialize() {
        if (!this.sandboxManager) {
            this.sandboxManager = new window.RubySandboxManager();
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
            timeout = 30000  // Ruby 首次加载 Opal 需要时间
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
        return '# 输入 Ruby 代码\nputs "Hello, World!"';
    }

    /**
     * 获取示例代码
     * @returns {string}
     */
    getExampleCode() {
        return `# Ruby 示例代码
puts "Hello, Ruby!"

# 数组操作
numbers = [1, 2, 3, 4, 5]
puts "数组: #{numbers}"
puts "求和: #{numbers.sum}"
puts "平方: #{numbers.map { |n| n ** 2 }}"

# 哈希
person = {
  name: "张三",
  age: 25,
  city: "北京"
}

person.each do |key, value|
  puts "#{key}: #{value}"
end

# 类定义
class Animal
  attr_accessor :name
  
  def initialize(name)
    @name = name
  end
  
  def speak
    "#{@name} says hello!"
  end
end

dog = Animal.new("小狗")
puts dog.speak

# 块和迭代
3.times { |i| puts "第 #{i + 1} 次迭代" }`;
    }
}

// 导出
if (typeof window !== 'undefined') {
    window.RubyRunner = RubyRunner;
}

