/**
 * LanguageDetector - 基于 Highlight.js 的代码语言检测器
 * 
 * 使用 Highlight.js 的 highlightAuto 功能自动检测代码语言
 */

(function() {
    'use strict';

    // 支持的语言列表（限定检测范围，提高准确率和性能）
    const SUPPORTED_LANGUAGES = ['javascript', 'python', 'typescript', 'sql'];
    
    // 最低置信度阈值
    const MIN_RELEVANCE = 10;

    /**
     * 检测代码语言
     * @param {string} code - 代码文本
     * @returns {string|null} 'javascript' | 'python' | 'typescript' | 'sql' | null
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
            const result = hljs.highlightAuto(code, SUPPORTED_LANGUAGES);
            
            if (result.relevance < MIN_RELEVANCE) {
                return null;
            }
            
            if (SUPPORTED_LANGUAGES.includes(result.language)) {
                return result.language;
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
            const result = hljs.highlightAuto(code, SUPPORTED_LANGUAGES);
            return {
                language: result.relevance >= MIN_RELEVANCE && SUPPORTED_LANGUAGES.includes(result.language) 
                    ? result.language : null,
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
