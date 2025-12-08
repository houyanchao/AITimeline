/**
 * DeepSeek Smart Enter Adapter
 * 
 * DeepSeek 平台的智能 Enter 适配器
 */

class DeepSeekSmartEnterAdapter extends BaseSmartEnterAdapter {
    /**
     * 检测是否为 DeepSeek 页面
     */
    matches() {
        return matchesSmartInputPlatform('deepseek');
    }
    
    /**
     * 获取输入框选择器
     * DeepSeek 使用 class="ds-scroll-area" 且 rows="2" 的 textarea
     */
    getInputSelector() {
        return 'textarea.ds-scroll-area[rows="2"]';
    }
}


