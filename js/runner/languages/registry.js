/**
 * LanguageRegistry - 语言运行器注册表
 * 
 * 管理所有支持的编程语言及其运行器
 * 语言配置来自全局 RUNNER_LANGUAGES（constants.js）
 */

class LanguageRegistry {
    constructor() {
        this.runners = new Map();
        // 使用全局语言配置
        this.languageConfigs = this._buildLanguageConfigs();
        this.initialize();
    }

    /**
     * 从全局 RUNNER_LANGUAGES 构建语言配置
     * @returns {Array}
     */
    _buildLanguageConfigs() {
        return RUNNER_LANGUAGES.map(lang => ({
            id: lang.id,
            name: lang.name,
            enabled: true,
            runnerClass: lang.runnerClass
        }));
    }

    /**
     * 初始化注册所有语言
     */
    initialize() {
        // 根据配置动态注册运行器
        this.languageConfigs.forEach(config => {
            if (window[config.runnerClass]) {
                this.register(config.id, new window[config.runnerClass]());
        }
        });
    }

    /**
     * 注册一个语言运行器
     * @param {string} language - 语言标识符
     * @param {Object} runner - 运行器实例
     */
    register(language, runner) {
        this.runners.set(language, runner);
    }

    /**
     * 获取指定语言的运行器
     * @param {string} language - 语言标识符
     * @returns {Object|null}
     */
    getRunner(language) {
        return this.runners.get(language) || null;
    }

    /**
     * 检查语言是否被支持
     * @param {string} language - 语言标识符
     * @returns {boolean}
     */
    isSupported(language) {
        return this.runners.has(language);
    }

    /**
     * 获取所有支持的语言列表
     * @returns {Array}
     */
    getSupportedLanguages() {
        const languages = [];
        this.runners.forEach((runner, language) => {
            languages.push({
                id: language,
                name: runner.displayName || language,
                enabled: true
            });
        });
        return languages;
    }

    /**
     * 获取所有语言（包括未来支持的）
     * @returns {Array}
     */
    getAllLanguages() {
        return this.languageConfigs;
    }

    /**
     * 获取语言配置
     * @param {string} language - 语言标识符
     * @returns {Object|null}
     */
    getLanguageConfig(language) {
        return this.languageConfigs.find(c => c.id === language) || null;
    }

    /**
     * 清理所有运行器
     */
    cleanup() {
        this.runners.forEach(runner => {
            if (runner.cleanup) {
                runner.cleanup();
            }
        });
    }
}

// 导出
if (typeof window !== 'undefined') {
    window.LanguageRegistry = LanguageRegistry;
}
