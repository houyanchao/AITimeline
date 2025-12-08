/**
 * Grok Smart Enter Adapter
 * 
 * Grok 平台的智能 Enter 适配器
 */

class GrokSmartEnterAdapter extends BaseSmartEnterAdapter {
    /**
     * 检测是否为 Grok 页面
     */
    matches() {
        return matchesSmartInputPlatform('grok');
    }
    
    /**
     * 获取输入框选择器
     * Grok 使用 class="ProseMirror" 且 contenteditable="true" 的 div
     */
    getInputSelector() {
        return '.ProseMirror[contenteditable="true"]';
    }
}

