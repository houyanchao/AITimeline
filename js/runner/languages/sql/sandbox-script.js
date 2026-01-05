/**
 * SQL Sandbox Script
 * 
 * 在 iframe 沙箱中使用 sql.js 执行 SQL
 */

(function() {
    'use strict';

    let db = null;
    let sqlJsLoaded = false;

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
        postMessage('SQL_OUTPUT', {
            level: level,
            data: args
        });
    }

    /**
     * 发送表格数据
     */
    function postTable(columns, values, statementIndex) {
        postMessage('SQL_TABLE', {
            columns: columns,
            values: values,
            statementIndex: statementIndex
        });
    }

    /**
     * 发送加载进度
     */
    function postLoading(message) {
        postMessage('SQL_LOADING', { message });
    }

    /**
     * 初始化数据库
     */
    async function initializeDatabase() {
        if (sqlJsLoaded && db) {
            return;
        }

        postLoading('正在加载 SQLite 环境 (首次加载约需 5-10 秒)...');

        try {
            // 使用 window.initSqlJs 调用 sql.js 提供的全局初始化函数
            const SQL = await window.initSqlJs({
                locateFile: file => `https://cdn.jsdelivr.net/npm/sql.js@1.8.0/dist/${file}`
            });
            
            // 创建内存数据库
            db = new SQL.Database();
            sqlJsLoaded = true;
            
            postLoading('SQLite 环境加载完成');
        } catch (error) {
            throw new Error('初始化 SQLite 失败: ' + error.message);
        }
    }

    /**
     * 执行 SQL 代码
     */
    async function executeSQL(code) {
        const startTime = Date.now();

        try {
            // 确保 sql.js 已初始化
            if (!sqlJsLoaded) {
                await initializeDatabase();
            }

            // 分割 SQL 语句（按分号分割，但保留在字符串内的分号）
            const statements = splitStatements(code);
            
            let statementIndex = 0;
            for (const statement of statements) {
                const trimmed = statement.trim();
                if (!trimmed || trimmed.startsWith('--')) {
                    continue;
                }

                try {
                    // 执行 SQL
                    const results = db.exec(trimmed);
                    
                    // 处理结果
                    if (results && results.length > 0) {
                        for (const result of results) {
                            postTable(result.columns, result.values, statementIndex);
                        }
                    } else {
                        // 非查询语句（INSERT, UPDATE, DELETE, CREATE 等）
                        const changes = db.getRowsModified();
                        const upperStmt = trimmed.toUpperCase();
                        
                        if (upperStmt.startsWith('INSERT')) {
                            postOutput('info', `✓ 插入成功，影响 ${changes} 行`);
                        } else if (upperStmt.startsWith('UPDATE')) {
                            postOutput('info', `✓ 更新成功，影响 ${changes} 行`);
                        } else if (upperStmt.startsWith('DELETE')) {
                            postOutput('info', `✓ 删除成功，影响 ${changes} 行`);
                        } else if (upperStmt.startsWith('CREATE')) {
                            postOutput('info', `✓ 创建成功`);
                        } else if (upperStmt.startsWith('DROP')) {
                            postOutput('info', `✓ 删除成功`);
                        } else if (upperStmt.startsWith('ALTER')) {
                            postOutput('info', `✓ 修改成功`);
                        }
                    }
                    
                    statementIndex++;
                } catch (stmtError) {
                    postOutput('error', `语句执行失败: ${stmtError.message}`);
                    postOutput('error', `问题语句: ${trimmed.substring(0, 100)}${trimmed.length > 100 ? '...' : ''}`);
                }
            }

            const duration = Date.now() - startTime;
            postMessage('SQL_COMPLETE', { success: true, duration });

        } catch (error) {
            const duration = Date.now() - startTime;
            
            let errorMessage = error.message || String(error);
            
            postMessage('SQL_ERROR', { message: errorMessage });
            postMessage('SQL_COMPLETE', { success: false, duration, error: errorMessage });
        }
    }

    /**
     * 分割 SQL 语句
     * 简单实现：按分号分割，不处理字符串内的分号
     */
    function splitStatements(code) {
        const statements = [];
        let current = '';
        let inString = false;
        let stringChar = '';
        
        for (let i = 0; i < code.length; i++) {
            const char = code[i];
            const prevChar = i > 0 ? code[i - 1] : '';
            
            if (!inString && (char === '"' || char === "'")) {
                inString = true;
                stringChar = char;
            } else if (inString && char === stringChar && prevChar !== '\\') {
                inString = false;
            }
            
            if (char === ';' && !inString) {
                if (current.trim()) {
                    statements.push(current.trim());
                }
                current = '';
            } else {
                current += char;
            }
        }
        
        if (current.trim()) {
            statements.push(current.trim());
        }
        
        return statements;
    }

    /**
     * 监听来自父窗口的消息
     */
    window.addEventListener('message', (event) => {
        if (!event.data || typeof event.data !== 'object') return;
        
        const { type, code } = event.data;
        
        if (type === 'EXECUTE_SQL' && code) {
            executeSQL(code);
        }
    });

    // 通知父窗口沙箱已准备就绪
    postMessage('SQL_SANDBOX_READY', {});

})();

