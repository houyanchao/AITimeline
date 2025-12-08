/**
 * LaTeX Extractor - LaTeX 源码提取器
 * 支持多种平台的公式格式，完全独立的提取逻辑
 * 
 * 支持的平台：
 * - ChatGPT (KaTeX + annotation)
 * - Gemini (KaTeX + data-math)
 * - DeepSeek (KaTeX + annotation)
 * - 豆包 (data-custom-copy-text)
 * - Grok (KaTeX + annotation)
 * - 维基百科 (MathML + annotation)
 * - MathJax (script[type="math/tex"])
 */

class LatexExtractor {
    /**
     * 从公式元素中提取 LaTeX 源码
     * 按优先级尝试多种提取方式，自动适配不同平台
     * 
     * @param {Element} formulaElement - 公式 DOM 元素
     * @returns {string|null} - LaTeX 源码，失败返回 null
     */
    static extract(formulaElement) {
        if (!formulaElement) {
            return null;
        }

        // 方法1: 豆包格式 - data-custom-copy-text 属性（当前元素）
        if (formulaElement.hasAttribute('data-custom-copy-text')) {
            return formulaElement.getAttribute('data-custom-copy-text').trim();
        }

        // 方法2: 豆包格式 - 向上查找 .math-inline 父元素
        let mathInlineParent = formulaElement.closest('.math-inline');
        if (mathInlineParent && mathInlineParent.hasAttribute('data-custom-copy-text')) {
            return mathInlineParent.getAttribute('data-custom-copy-text').trim();
        }

        // 方法3: 豆包格式 - data-custom-copy-text 属性（子元素）
        const doubaoChild = formulaElement.querySelector('[data-custom-copy-text]');
        if (doubaoChild) {
            return doubaoChild.getAttribute('data-custom-copy-text').trim();
        }

        // 方法4: 当前元素的 data-math 属性
        if (formulaElement.hasAttribute('data-math')) {
            return formulaElement.getAttribute('data-math').trim();
        }

        // 方法5: Gemini 格式 - 从祖先元素的 data-math 属性获取
        let parent = formulaElement.parentElement;
        while (parent) {
            if (parent.hasAttribute('data-math')) {
                return parent.getAttribute('data-math').trim();
            }
            parent = parent.parentElement;
            if (!parent || parent === document.body) break;
        }

        // 方法6: ChatGPT 格式 - 从 annotation 标签获取
        const annotation = formulaElement.querySelector('annotation[encoding="application/x-tex"]');
        if (annotation) {
            return annotation.textContent.trim();
        }

        // 方法7: 从 .katex-mathml 中的 annotation 获取
        const mathml = formulaElement.querySelector('.katex-mathml annotation');
        if (mathml) {
            return mathml.textContent.trim();
        }

        // 方法8: 维基百科格式 - mwe-math-element 中的 annotation
        // 查找 class 包含 mwe-math-element 的元素
        let mweElement = formulaElement;
        if (!formulaElement.classList.contains('mwe-math-element')) {
            mweElement = formulaElement.closest('.mwe-math-element');
        }
        if (mweElement) {
            const wikiAnnotation = mweElement.querySelector('annotation');
            if (wikiAnnotation) {
                const latex = wikiAnnotation.textContent.trim();
                return latex || null;
            }
        }

        // 方法9: MathJax 格式 - 从兄弟 script[type="math/tex"] 提取
        // 查找父元素中的 script[type^="math/tex"] 标签
        if (formulaElement.parentElement) {
            const script = formulaElement.parentElement.querySelector('script[type^="math/tex"]');
            if (script) {
                return script.textContent.trim();
            }
        }

        // 方法10: 通用 data-latex 属性
        if (formulaElement.hasAttribute('data-latex')) {
            return formulaElement.getAttribute('data-latex').trim();
        }

        // 无法获取公式
        return null;
    }
}

