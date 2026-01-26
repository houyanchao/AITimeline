/**
 * Background Service Worker
 * 
 * 处理需要绕过 CORS 限制的请求
 * 使用 optional_host_permissions，需要用户授权后才能使用
 */

// 监听来自内容脚本的消息
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.type === 'FETCH_IMAGE') {
        fetchImageAsBase64(request.url)
            .then(result => sendResponse(result))
            .catch(error => sendResponse({ success: false, error: error.message }));
        return true; // 保持消息通道开放以进行异步响应
    }
    
    // 检查权限状态
    if (request.type === 'CHECK_PERMISSION') {
        chrome.permissions.contains({
            origins: ['https://lh3.googleusercontent.com/*']
        }, (result) => {
            // #region agent log
            fetch('http://127.0.0.1:7242/ingest/08b7461b-a8dc-41be-96a6-4841713a3f76',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'background.js:CHECK_PERMISSION',message:'Permission check result',data:{hasPermission:result},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'J'})}).catch(()=>{});
            // #endregion
            console.log('[AI Chat Timeline Background] CHECK_PERMISSION result:', result);
            sendResponse({ hasPermission: result });
        });
        return true;
    }
    
    // 请求权限（必须在 background 中调用）
    if (request.type === 'REQUEST_PERMISSION') {
        chrome.permissions.request({
            origins: ['https://lh3.googleusercontent.com/*']
        }, (granted) => {
            console.log('[AI Chat Timeline Background] Permission request result:', granted);
            sendResponse({ granted: granted });
        });
        return true;
    }
    
    // 打开权限弹窗
    if (request.type === 'OPEN_PERMISSION_POPUP') {
        const permissionPageUrl = chrome.runtime.getURL('js/watermark-remover/permission.html');
        chrome.windows.create({
            url: permissionPageUrl,
            type: 'popup',
            width: 420,
            height: 350,
            focused: true
        });
        return false;
    }
});

/**
 * 获取图片并转换为 base64
 */
async function fetchImageAsBase64(url) {
    try {
        const response = await fetch(url, { credentials: 'include' });
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const blob = await response.blob();
        
        // 将 blob 转换为 base64
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onloadend = () => {
                resolve({
                    success: true,
                    data: reader.result,
                    type: blob.type
                });
            };
            reader.onerror = () => reject(new Error('Failed to read blob'));
            reader.readAsDataURL(blob);
        });
    } catch (error) {
        console.error('[AI Chat Timeline Background] Fetch failed:', error);
        return { success: false, error: error.message };
    }
}
