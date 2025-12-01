/**
 * Tongyi Smart Enter Adapter
 * 
 * 通义千问平台的智能 Enter 适配器
 */

class TongyiSmartEnterAdapter extends BaseSmartEnterAdapter {
    /**
     * 检测是否为通义千问页面
     */
    matches() {
        return matchesSmartInputPlatform('tongyi');
    }
    
    /**
     * 获取输入框选择器
     * 通义千问使用 class 包含 textareaWrap 的元素下的 textarea
     */
    getInputSelector() {
        return '[class*="textareaWrap"] textarea';
    }

    /**
     * 获取定位参考元素
     * 使用 class 包含 inputContainer 的祖先元素作为定位参考
     * @param {HTMLElement} inputElement - 输入框元素
     */
    getPositionReferenceElement(inputElement) {
        return inputElement?.closest('[class*="inputContainer"]') || inputElement;
    }
    
    /**
     * 获取提示词按钮位置偏移量
     */
    getPromptButtonOffset() {
        return { top: 10, left: -2 };
    }
}

