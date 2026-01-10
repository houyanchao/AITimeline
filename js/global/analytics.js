/**
 * 简单埋点统计（临时使用）
 * 完全静默：任何错误不显示、不阻拦原有逻辑
 */
(function() {
    'use strict';
    
    // 发送埋点（完全静默）
    function track(action) {
        setTimeout(() => {
            try {
                // 中国时区日期 yyyymmdd
                const date = new Date().toLocaleDateString('zh-CN', { 
                    timeZone: 'Asia/Shanghai',
                    year: 'numeric',
                    month: '2-digit',
                    day: '2-digit'
                }).replace(/\//g, '');
                
                fetch('https://choujiang-e0196d-1252838588.ap-shanghai.app.tcloudbase.com/aitimeline', {
                    method: 'POST',
                    mode: 'no-cors',
                    headers: { 'Content-Type': 'text/plain' },
                    body: JSON.stringify({ action, date }),
                    keepalive: true
                }).catch(() => {});
            } catch (e) {
                // 完全静默，不做任何处理
            }
        }, 0);  // 异步执行，不阻塞主线程
    }
    
    // 1. 全局入口：脚本加载时
    track('load');
    
    // 暴露给其他模块调用
    window.trackEvent = track;
})();
