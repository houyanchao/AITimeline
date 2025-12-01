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
    
    /**
     * 获取定位参考元素
     * 使用 .input-area 祖先元素作为定位参考
     * @param {HTMLElement} inputElement - 输入框元素
     */
    getPositionReferenceElement(inputElement) {
        return inputElement?.closest('.input-area') || inputElement;
    }
    
    /**
     * 获取提示词按钮位置偏移量
     */
    getPromptButtonOffset() {
        return { top: 15, left: -2 };
    }
}


