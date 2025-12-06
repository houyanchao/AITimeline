/**
 * Global Constants
 * 
 * 全局共享常量配置
 * 包含所有 AI 平台的基础信息，供多个模块使用
 * 
 * 使用模块：
 * - Timeline（时间轴）
 * - StarredTab（收藏列表）
 * - SmartEnter（智能输入）
 */

// ==================== 全局配置 ====================

/**
 * 全局调试开关
 * 控制所有模块的调试日志输出
 */
const GLOBAL_DEBUG = false;

// ==================== AI 平台信息 ====================

/**
 * 支持的 AI 平台信息（统一配置中心）
 * 每个平台包含：id、域名列表、平台名称、logo 路径、功能支持
 */
const SITE_INFO = [
    {
        id: 'chatgpt',
        sites: ['chatgpt.com', 'chat.openai.com'],
        name: 'ChatGPT',
        logoPath: 'images/logo/chatgpt.webp',
        features: {
            timeline: true,
            smartInput: true
        }
    },
    {
        id: 'gemini',
        sites: ['gemini.google.com'],
        name: 'Gemini',
        logoPath: 'images/logo/gemini.webp',
        features: {
            timeline: true,
            smartInput: true
        }
    },
    {
        id: 'doubao',
        sites: ['doubao.com'],
        name: '豆包 Doubao',
        logoPath: 'images/logo/doubao.webp',
        features: {
            timeline: true,
            smartInput: false
        }
    },
    {
        id: 'deepseek',
        sites: ['chat.deepseek.com'],
        name: 'DeepSeek',
        logoPath: 'images/logo/deepseek.webp',
        features: {
            timeline: true,
            smartInput: true
        }
    },
    {
        id: 'yiyan',
        sites: ['yiyan.baidu.com'],
        name: '文心一言',
        logoPath: 'images/logo/wenxin.webp',
        features: {
            timeline: true,
            smartInput: false
        }
    },
    {
        id: 'tongyi',
        sites: ['tongyi.com', 'qianwen.com'],
        name: '千问 Qwen',
        logoPath: 'images/logo/tongyi.webp',
        features: {
            timeline: true,
            smartInput: true
        }
    },
    {
        id: 'kimi',
        sites: ['kimi.com', 'kimi.moonshot.cn'],
        name: 'Kimi',
        logoPath: 'images/logo/kimi.webp',
        features: {
            timeline: true,
            smartInput: true
        }
    },
    {
        id: 'yuanbao',
        sites: ['yuanbao.tencent.com'],
        name: '元宝 Yuanbao',
        logoPath: 'images/logo/yuanbao.webp',
        features: {
            timeline: true,
            smartInput: false
        }
    },
    {
        id: 'grok',
        sites: ['grok.com'],
        name: 'Grok',
        logoPath: 'images/logo/grok.webp',
        features: {
            timeline: true,
            smartInput: true
        }
    },
    {
        id: 'perplexity',
        sites: ['perplexity.ai'],
        name: 'Perplexity',
        logoPath: 'images/logo/perplexity.webp',
        features: {
            timeline: true,
            smartInput: true
        }
    }
];

/**
 * 获取完整的 siteNameMap
 * 将数组结构的 SITE_INFO 转换为域名映射对象，并将 logoPath 转换为完整的 chrome.runtime URL
 * 
 * @returns {Object} 域名到平台信息的映射对象，格式：{ 'domain': { id, name, logo } }
 */
function getSiteNameMap() {
    const map = {};
    for (const platform of SITE_INFO) {
        const info = {
            id: platform.id,
            name: platform.name,
            logo: platform.logoPath ? chrome.runtime.getURL(platform.logoPath) : null
        };
        // 为每个域名创建映射
        for (const site of platform.sites) {
            map[site] = info;
        }
    }
    return map;
}

/**
 * 根据 URL 获取网站信息
 * 使用 includes 匹配，支持 www 等前缀
 * 
 * @param {string} url - 网站 URL
 * @returns {Object} { id, name, logo }
 */
function getSiteInfoByUrl(url) {
    try {
        const urlObj = new URL(url);
        const hostname = urlObj.hostname;
        
        // 遍历所有平台，使用 includes 匹配
        for (const platform of SITE_INFO) {
            for (const site of platform.sites) {
                if (hostname.includes(site)) {
                    return {
                        id: platform.id,
                        name: platform.name,
                        logo: platform.logoPath ? chrome.runtime.getURL(platform.logoPath) : null
                    };
                }
            }
        }
        
        // 未匹配到任何平台，返回默认值
        return { id: null, name: hostname, logo: null };
    } catch (e) {
        return { id: null, name: 'Unknown', logo: null };
    }
}

/**
 * 检查 URL 是否匹配某个平台
 * @param {string} url - URL 字符串
 * @param {string} platformId - 平台 ID
 * @returns {boolean}
 */
function matchesPlatform(url, platformId) {
    const platform = SITE_INFO.find(p => p.id === platformId);
    if (!platform) return false;
    
    return platform.sites.some(site => url.includes(site));
}

/**
 * 检查当前页面是否匹配某个平台
 * @param {string} platformId - 平台 ID
 * @returns {boolean}
 */
function matchesCurrentPlatform(platformId) {
    return matchesPlatform(location.href, platformId);
}

/**
 * 根据 URL 获取匹配的平台信息
 * @param {string} url - URL 字符串
 * @returns {Object|null} 平台信息 { id, sites, name, logoPath, features }
 */
function getPlatformByUrl(url) {
    for (const platform of SITE_INFO) {
        for (const site of platform.sites) {
            if (url.includes(site)) {
                return platform;
            }
        }
    }
    return null;
}

/**
 * 获取当前页面的平台信息
 * @returns {Object|null} 平台信息 { id, sites, name, logoPath, features }
 */
function getCurrentPlatform() {
    return getPlatformByUrl(location.href);
}

/**
 * 获取支持某功能的平台列表
 * @param {string} feature - 功能名：'timeline' | 'smartInput'
 * @returns {Array} 支持该功能的平台列表
 */
function getPlatformsByFeature(feature) {
    return SITE_INFO.filter(platform => platform.features?.[feature] === true);
}

/**
 * 检查平台是否支持某功能
 * @param {string} platformId - 平台 ID
 * @param {string} feature - 功能名
 * @returns {boolean}
 */
function platformSupportsFeature(platformId, feature) {
    const platform = SITE_INFO.find(p => p.id === platformId);
    return platform?.features?.[feature] === true;
}

/**
 * 检测当前页面是否为深色模式
 * 整合了所有 AI 平台的 dark mode 检测逻辑
 * 
 * @returns {boolean} true 表示深色模式
 */
function detectDarkMode() {
    try {
        // 1. 检查 html 元素的 dark 类（Kimi、Grok 等平台原生添加）
        if (document.documentElement?.classList?.contains('dark')) {
            return true;
        }
        
        // 2. 检查 body 元素的 dark 类（DeepSeek、Grok 等）
        if (document.body?.classList?.contains('dark')) {
            return true;
        }
        
        // 3. 检查 body 元素的 dark-theme 类（Gemini）
        if (document.body?.classList?.contains('dark-theme')) {
            return true;
        }
        
        // 4. 检查 html 元素的 color-scheme 样式（ChatGPT）
        try {
            const colorScheme = document.documentElement?.style?.colorScheme || 
                               getComputedStyle(document.documentElement).colorScheme;
            if (colorScheme && colorScheme.includes('dark')) {
                return true;
            }
        } catch (e) {
            // getComputedStyle 可能失败，忽略
        }
        
        // 5. 检查 html 元素的 data-theme 属性（通义、豆包等）
        const dataTheme = document.documentElement?.getAttribute?.('data-theme');
        if (dataTheme && dataTheme.includes('dark')) {
            return true;
        }
        
        // 6. 检查元宝的 yb-theme-mode 属性
        const ybThemeMode = document.documentElement?.getAttribute?.('yb-theme-mode') ||
                           document.body?.getAttribute?.('yb-theme-mode');
        if (ybThemeMode && ybThemeMode.includes('dark')) {
            return true;
        }
        
        return false;
    } catch (error) {
        // 发生任何错误时，返回 false（默认浅色模式）
        console.warn('[detectDarkMode] error:', error);
        return false;
    }
}

