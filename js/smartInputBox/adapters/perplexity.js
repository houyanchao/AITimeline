/**
 * Perplexity Smart Enter Adapter
 * 
 * Perplexity AI 平台的智能 Enter 适配器
 */

class PerplexitySmartEnterAdapter extends BaseSmartEnterAdapter {
    /**
     * 检测是否为 Perplexity 页面
     */
    matches() {
        return matchesSmartInputPlatform('perplexity');
    }
    
    /**
     * 获取输入框选择器
     * Perplexity 使用 id="ask-input" 的 contenteditable div
     */
    getInputSelector() {
        return '#ask-input[contenteditable="true"]';
    }
}

