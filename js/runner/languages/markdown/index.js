/**
 * MarkdownRunner - Markdown 渲染器
 * 
 * 使用 marked.js 渲染 Markdown
 */

class MarkdownRunner extends BaseRunner {
    constructor() {
        super({
            language: 'markdown',
            displayName: 'Markdown',
            icon: '📝',
            fileExtension: '.md'
        });
    }

    /**
     * 执行（渲染）代码
     * @param {string} code - 要渲染的 Markdown
     * @param {Object} options - 选项
     * @returns {Promise}
     */
    async execute(code, options = {}) {
        const startTime = Date.now();
        const { onOutput = () => {} } = options;
        
        try {
            // 检查 marked 是否已加载
            if (typeof marked === 'undefined') {
                throw new Error('Markdown 渲染器未加载');
            }
            
            // 渲染 Markdown
            const html = marked.parse(code);
            
            // 发送渲染结果
            onOutput({
                level: 'markdown-preview',
                data: { html: html, raw: code }
            });
            
            const duration = Date.now() - startTime;
            return {
                success: true,
                duration: duration,
                language: this.language
            };
        } catch (error) {
            onOutput({
                level: 'error',
                data: [error.message]
            });
            
            return {
                success: false,
                error: error.message,
                language: this.language
            };
        }
    }

    /**
     * 清理资源
     */
    cleanup() {
        // 无需清理
    }

    /**
     * 获取占位符
     */
    getPlaceholder() {
        return '# 标题\n\n输入 Markdown 内容...';
    }

    /**
     * 获取示例代码
     * @returns {string}
     */
    getExampleCode() {
        return `# Markdown 示例

## 文本格式

这是 **粗体** 和 *斜体* 文本。

这是 ~~删除线~~ 和 \`行内代码\`。

## 列表

- 项目 1
- 项目 2
  - 子项目 A
  - 子项目 B

1. 有序列表
2. 第二项
3. 第三项

## 引用

> 这是一段引用文本
> 可以多行

## 链接和图片

[访问 GitHub](https://github.com)

## 代码块

\`\`\`javascript
console.log("Hello World!");
\`\`\`

## 表格

| 名称 | 描述 |
|------|------|
| HTML | 超文本标记语言 |
| CSS | 层叠样式表 |
| JS | JavaScript |
`;
    }
}

// 导出
if (typeof window !== 'undefined') {
    window.MarkdownRunner = MarkdownRunner;
}

