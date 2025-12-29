/**
 * Yuanbao (元宝) Smart Enter Adapter
 * 
 * 元宝平台的智能输入适配器
 */

class YuanbaoSmartEnterAdapter extends BaseSmartEnterAdapter {
    /**
     * 检测是否为元宝页面
     */
    matches() {
        return matchesSmartInputPlatform('yuanbao');
    }
    
    /**
     * 获取输入框选择器
     * 元宝使用 Quill 编辑器，class="ql-editor" 且 contenteditable="true"
     */
    getInputSelector() {
        return '.chat-input-editor .ql-editor[contenteditable="true"]';
    }

    /**
     * 获取定位参考元素
     * 使用 .yb-input-box-textarea 作为定位参考
     * @param {HTMLElement} inputElement - 输入框元素
     */
    getPositionReferenceElement(inputElement) {
        return document.querySelector('.yb-input-box-textarea') || inputElement;
    }
    
    /**
     * 获取提示词按钮位置偏移量
     */
    getPromptButtonOffset() {
        return { top: 10, left: -2 };
    }
}


