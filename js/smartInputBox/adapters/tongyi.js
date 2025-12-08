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
}

