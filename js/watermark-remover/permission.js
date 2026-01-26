/**
 * Permission Request Page Script
 * 
 * 这个页面用于请求 optional_host_permissions 权限
 * 因为 chrome.permissions.request() 必须在扩展页面中由用户手势触发
 */

document.getElementById('grantBtn').addEventListener('click', async () => {
    const statusEl = document.getElementById('status');
    const btn = document.getElementById('grantBtn');
    
    btn.disabled = true;
    btn.textContent = 'Requesting...';
    
    try {
        const granted = await chrome.permissions.request({
            origins: ['https://lh3.googleusercontent.com/*']
        });
        
        if (granted) {
            statusEl.textContent = '✓ Permission granted! You can close this tab.';
            statusEl.className = 'status success';
            btn.textContent = 'Done!';
            
            // 通知所有 Gemini 标签页权限已授予
            chrome.tabs.query({ url: '*://gemini.google.com/*' }, (tabs) => {
                tabs.forEach(tab => {
                    chrome.tabs.sendMessage(tab.id, { type: 'PERMISSION_GRANTED' }).catch(() => {});
                });
            });
            
            // 3 秒后自动关闭
            setTimeout(() => window.close(), 3000);
        } else {
            statusEl.textContent = '✗ Permission denied. Please try again.';
            statusEl.className = 'status error';
            btn.disabled = false;
            btn.textContent = 'Grant Permission';
        }
    } catch (e) {
        statusEl.textContent = '✗ Error: ' + e.message;
        statusEl.className = 'status error';
        btn.disabled = false;
        btn.textContent = 'Grant Permission';
    }
});

// 检查是否已有权限
chrome.permissions.contains({
    origins: ['https://lh3.googleusercontent.com/*']
}, (hasPermission) => {
    if (hasPermission) {
        document.getElementById('status').textContent = '✓ Permission already granted!';
        document.getElementById('status').className = 'status success';
        document.getElementById('grantBtn').textContent = 'Already Granted';
        document.getElementById('grantBtn').disabled = true;
        setTimeout(() => window.close(), 2000);
    }
});
