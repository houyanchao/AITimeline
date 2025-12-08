/**
 * Gemini Smart Enter Adapter
 * 
 * Google Gemini 平台的智能 Enter 适配器
 */

class GeminiSmartEnterAdapter extends BaseSmartEnterAdapter {
    /**
     * 检测是否为 Gemini 页面
     */
    matches() {
        return matchesSmartInputPlatform('gemini');
    }
    
    /**
     * 获取输入框选择器
     * Gemini 使用 Quill 编辑器，内部有 contenteditable div
     * 结构：<rich-textarea><div class="ql-editor textarea" contenteditable="true">
     */
    getInputSelector() {
        return '.ql-editor.textarea[contenteditable="true"]';
    }
}


