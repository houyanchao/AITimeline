/**
 * Lua Sandbox Script
 * 
 * 在 iframe 沙箱中执行 Lua 代码
 * 使用 Fengari 作为 Lua 运行时
 */

(function() {
    'use strict';

    /**
     * 发送消息到父窗口
     */
    function postMessage(type, data) {
        if (window.parent && window.parent !== window) {
            window.parent.postMessage({ type, data }, '*');
        }
    }

    /**
     * 发送输出
     */
    function postOutput(level, ...args) {
        postMessage('LUA_OUTPUT', {
            level: level,
            data: args
        });
    }

    /**
     * 执行 Lua 代码
     */
    function executeLua(code) {
        const startTime = Date.now();

        try {
            if (!window.fengari) {
                throw new Error('Fengari 未加载');
            }

            const { lua, lauxlib, lualib, to_luastring } = window.fengari;
            
            // 创建新的 Lua 状态
            const L = lauxlib.luaL_newstate();
            lualib.luaL_openlibs(L);

            // 重定向 print 函数
            const printCode = `
                local oldprint = print
                print = function(...)
                    local args = {...}
                    local parts = {}
                    for i, v in ipairs(args) do
                        parts[i] = tostring(v)
                    end
                    __output(table.concat(parts, "\\t"))
                end
            `;

            // 注册输出函数
            lua.lua_pushcfunction(L, function(L) {
                const str = lauxlib.luaL_checkstring(L, 1);
                const jsStr = window.fengari.to_jsstring(str);
                postOutput('log', jsStr);
                return 0;
            });
            lua.lua_setglobal(L, to_luastring('__output'));

            // 执行重定向代码
            let status = lauxlib.luaL_dostring(L, to_luastring(printCode));
            if (status !== lua.LUA_OK) {
                const errorMsg = lua.lua_tojsstring(L, -1);
                throw new Error(errorMsg);
            }

            // 执行用户代码
            status = lauxlib.luaL_dostring(L, to_luastring(code));
            
            if (status !== lua.LUA_OK) {
                const errorMsg = lua.lua_tojsstring(L, -1);
                throw new Error(errorMsg);
            }

            const duration = Date.now() - startTime;
            postMessage('LUA_COMPLETE', { success: true, duration });

        } catch (error) {
            const duration = Date.now() - startTime;
            postMessage('LUA_ERROR', { message: error.message });
            postMessage('LUA_COMPLETE', { success: false, duration, error: error.message });
        }
    }

    /**
     * 监听来自父窗口的消息
     */
    window.addEventListener('message', (event) => {
        if (!event.data || typeof event.data !== 'object') return;
        
        const { type, code } = event.data;
        
        if (type === 'EXECUTE_LUA' && code) {
            executeLua(code);
        }
    });

    /**
     * Fengari 就绪回调（由 sandbox.html 调用）
     */
    window.onFengariReady = function() {
        // 通知父窗口沙箱已准备就绪
        postMessage('LUA_SANDBOX_READY', {});
    };

    // 如果 Fengari 已经加载（可能在此脚本之前），立即发送就绪消息
    if (window.fengari) {
        postMessage('LUA_SANDBOX_READY', {});
    }

})();
