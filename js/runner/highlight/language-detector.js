/**
 * LanguageDetector - 基于 Highlight.js 的代码语言检测器
 * 
 * 使用 Highlight.js 的 highlightAuto 功能自动检测代码语言
 */

(function() {
    'use strict';

    // Highlight.js 支持的语言列表（用于检测）
    // 注意：css 不单独支持运行，只作为 HTML 的一部分
    const HLJS_LANGUAGES = ['javascript', 'python', 'typescript', 'sql', 'xml', 'json', 'markdown', 'lua', 'ruby'];
    
    // 语言名称映射（hljs 名称 -> 我们的名称）
    const LANGUAGE_MAP = {
        'xml': 'html'  // Highlight.js 用 xml 表示 HTML
    };
    
    // 我们支持的语言列表（用于外部引用）
    const SUPPORTED_LANGUAGES = ['javascript', 'python', 'typescript', 'sql', 'html', 'json', 'markdown', 'lua', 'ruby'];
    
    // 最低置信度阈值
    const MIN_RELEVANCE = 10;

    /**
     * 检测代码语言
     * @param {string} code - 代码文本
     * @returns {string|null} 'javascript' | 'python' | 'typescript' | 'sql' | 'html' | 'css' | 'json' | 'markdown' | null
     */
    function detectLanguage(code) {
        if (!code || typeof code !== 'string' || !code.trim()) {
            return null;
        }

        if (typeof hljs === 'undefined') {
            console.warn('[LanguageDetector] Highlight.js not loaded');
            return null;
        }

        try {
            const result = hljs.highlightAuto(code, HLJS_LANGUAGES);
            
            if (result.relevance < MIN_RELEVANCE) {
                return null;
            }
            
            if (HLJS_LANGUAGES.includes(result.language)) {
                // 应用语言映射
                const mapped = LANGUAGE_MAP[result.language] || result.language;
                return mapped;
            }
            
            return null;
        } catch (error) {
            console.error('[LanguageDetector] Detection failed:', error);
            return null;
        }
    }

    /**
     * 获取检测详情（用于调试）
     * @param {string} code - 代码文本
     * @returns {Object}
     */
    function detectWithDetails(code) {
        if (!code || typeof code !== 'string' || !code.trim()) {
            return { language: null, relevance: 0 };
        }

        if (typeof hljs === 'undefined') {
            return { language: null, relevance: 0, error: 'hljs not loaded' };
        }

        try {
            const result = hljs.highlightAuto(code, HLJS_LANGUAGES);
            const mapped = LANGUAGE_MAP[result.language] || result.language;
            return {
                language: result.relevance >= MIN_RELEVANCE && HLJS_LANGUAGES.includes(result.language) 
                    ? mapped : null,
                relevance: result.relevance,
                secondBest: result.secondBest ? {
                    language: result.secondBest.language,
                    relevance: result.secondBest.relevance
                } : null
            };
        } catch (error) {
            return { language: null, relevance: 0, error: error.message };
        }
    }

    // 导出
    if (typeof window !== 'undefined') {
        window.LanguageDetector = {
            detect: detectLanguage,
            detectWithDetails: detectWithDetails,
            supportedLanguages: SUPPORTED_LANGUAGES
        };
    }

})();
