/**
 * Smart Enter Adapter Registry
 * 
 * 适配器注册表，管理所有平台适配器
 */

class SmartEnterAdapterRegistry {
    constructor() {
        this.adapters = [];
        this._registerAdapters();
    }
    
    /**
     * 注册所有适配器
     */
    _registerAdapters() {
        // 注册 ChatGPT 适配器
        if (typeof ChatGPTSmartEnterAdapter !== 'undefined') {
            this.adapters.push(new ChatGPTSmartEnterAdapter());
        }
        
        // 注册 Gemini 适配器
        if (typeof GeminiSmartEnterAdapter !== 'undefined') {
            this.adapters.push(new GeminiSmartEnterAdapter());
        }
        
        // 注册 DeepSeek 适配器
        if (typeof DeepSeekSmartEnterAdapter !== 'undefined') {
            this.adapters.push(new DeepSeekSmartEnterAdapter());
        }
        
        // 注册 Kimi 适配器
        if (typeof KimiSmartEnterAdapter !== 'undefined') {
            this.adapters.push(new KimiSmartEnterAdapter());
        }
        
        // 注册 Perplexity 适配器
        if (typeof PerplexitySmartEnterAdapter !== 'undefined') {
            this.adapters.push(new PerplexitySmartEnterAdapter());
        }
        
        // 注册通义千问适配器
        if (typeof TongyiSmartEnterAdapter !== 'undefined') {
            this.adapters.push(new TongyiSmartEnterAdapter());
        }
        
        // 注册 Grok 适配器
        if (typeof GrokSmartEnterAdapter !== 'undefined') {
            this.adapters.push(new GrokSmartEnterAdapter());
        }
        
        // 未来添加其他平台：
        // if (typeof ClaudeSmartEnterAdapter !== 'undefined') {
        //     this.adapters.push(new ClaudeSmartEnterAdapter());
        // }
    }
    
    /**
     * 获取当前页面匹配的适配器
     * @returns {BaseSmartEnterAdapter|null}
     */
    getAdapter() {
        for (const adapter of this.adapters) {
            try {
                if (adapter.matches()) {
                    return adapter;
                }
            } catch (e) {
                console.error('[SmartEnterRegistry] Adapter check failed:', e);
            }
        }
        return null;
    }
    
    /**
     * 获取所有已注册的适配器
     * @returns {Array<BaseSmartEnterAdapter>}
     */
    getAllAdapters() {
        return [...this.adapters];
    }
}

// 创建全局注册表实例
if (typeof window.smartEnterAdapterRegistry === 'undefined') {
    window.smartEnterAdapterRegistry = new SmartEnterAdapterRegistry();
}

