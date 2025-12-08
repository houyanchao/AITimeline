/**
 * Kimi Smart Enter Adapter
 * 
 * Kimi 平台的智能 Enter 适配器
 */

class KimiSmartEnterAdapter extends BaseSmartEnterAdapter {
    /**
     * 检测是否为 Kimi 页面
     */
    matches() {
        return matchesSmartInputPlatform('kimi');
    }
    
    /**
     * 获取输入框选择器
     * Kimi 使用 class="chat-input-editor" 的 contenteditable div
     */
    getInputSelector() {
        return '.chat-input-editor[contenteditable="true"]';
    }
}

