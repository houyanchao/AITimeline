# 🌐 Global Components - 全局组件

## 目录说明

全局组件已重新组织，每个组件的 JS 和 CSS 文件现在放在同一个文件夹中，便于维护和管理。

```
js/global/
├── README.md                    # 全局组件文档
├── tooltip-manager/
│   ├── index.js                # Tooltip 管理器逻辑
│   └── styles.css              # Tooltip 组件样式
├── toast-manager/
│   ├── index.js                # Toast 管理器逻辑
│   └── styles.css              # Toast 提示组件样式
└── input-modal/
    ├── index.js                # Input Modal 管理器逻辑
    └── styles.css              # Input Modal 样式
```

---

## 组件说明

### 📌 tooltip-manager
**全局 Tooltip 组件**

**文件位置**：`js/global/tooltip-manager/`
- `index.js` - Tooltip 管理器逻辑（GlobalTooltipManager 类）
- `styles.css` - Tooltip 组件样式

**包含样式类**：
- `.timeline-tooltip-base` - 基础 tooltip 样式
- `.timeline-tooltip-dark` - 深色主题 tooltip
- `.timeline-tooltip-light` - 浅色主题 tooltip
- 箭头样式（上下左右四个方向）

**使用场景**：
- 时间轴节点 tooltip
- 收藏按钮 tooltip
- 公式 tooltip

**特点**：
- ✨ **组件自治**：内部监听 URL 变化，自动清理 DOM（无需外部管理）
- 智能定位（auto placement）
- 深色/浅色主题自适应
- 支持 hover 悬停
- 可复制文本内容

### 🔔 toast-manager
**全局 Toast 提示组件**

**文件位置**：`js/global/toast-manager/`
- `index.js` - Toast 管理器逻辑（GlobalToastManager 类）
- `styles.css` - Toast 提示组件样式

**包含样式类**：
- `.timeline-copy-feedback` - 复制成功提示
- `.timeline-error-toast` - 错误提示

**使用场景**：
- 复制文本成功提示
- 复制公式成功提示
- 各种错误提示

**特点**：
- ✨ **组件自治**：内部监听 URL 变化，自动清理 DOM（无需外部管理）
- 固定定位，顶部居中
- 自动淡入淡出
- 深色模式适配

### 💬 input-modal
**全局输入对话框组件**

**文件位置**：`js/global/input-modal/`
- `index.js` - Input Modal 管理器逻辑（GlobalInputModal 类）
- `styles.css` - Input Modal 对话框样式

**包含样式类**：
- `.global-input-modal-overlay` - 遮罩层
- `.global-input-modal` - 对话框主体
- `.global-input-modal-header` - 对话框头部
- `.global-input-modal-body` - 对话框主体（输入区域）
- `.global-input-modal-input` - 输入框
- `.global-input-modal-footer` - 对话框底部（按钮区域）
- `.global-input-modal-cancel` - 取消按钮
- `.global-input-modal-confirm` - 确认按钮

**使用场景**：
- 输入收藏标题
- 编辑收藏标题
- 任何需要用户输入文本的场景

**特点**：
- ✨ **组件自治**：内部监听 URL 变化，自动清理 DOM（无需外部管理）
- Promise 异步返回
- ESC 取消、Enter 确认
- 点击遮罩层取消
- 自动聚焦和光标定位
- 输入验证支持
- 深色模式自适应

**使用示例**：
```javascript
// ✅ 调用方只管使用，不需要关心清理逻辑
const result = await window.globalInputModal.show({
    title: '请输入标题',
    defaultValue: 'Hello',
    placeholder: '请输入...',
    required: true,
    requiredMessage: '不能为空',
    maxLength: 100
});

if (result) {
    console.log('用户输入:', result);
} else {
    console.log('用户取消了');
}

// ❌ 不需要手动清理 DOM
// ❌ 不需要监听 URL 变化
// ❌ 不需要调用 forceClose()
// ✅ 组件会在 URL 变化时自动清理
```

**自治机制**：
- 组件内部监听 `popstate` 和 `hashchange` 事件
- 检测到 URL 变化时，自动调用 `forceClose()` 清理 DOM
- 外部调用方（如 timeline）无需管理组件的生命周期

---

## 🎯 设计原则：组件自治

### 核心理念
所有全局组件都采用**组件自治**的设计模式，即：
- ✅ **组件自己管理生命周期**：创建 DOM、显示、隐藏、清理 DOM
- ✅ **组件监听 URL 变化**：内部监听 `popstate` 和 `hashchange` 事件
- ✅ **URL 变化时自动清理**：无需外部调用清理方法
- ✅ **调用方只管使用**：只需调用 `show()`、`hide()` 等方法，不需要关心清理逻辑

### 实现方式
每个组件内部都包含以下逻辑：

```javascript
class GlobalComponent {
    constructor() {
        this.state = {
            currentUrl: location.href  // 记录当前 URL
        };
        
        // 监听 URL 变化
        this._boundHandleUrlChange = this._handleUrlChange.bind(this);
        window.addEventListener('popstate', this._boundHandleUrlChange);
        window.addEventListener('hashchange', this._boundHandleUrlChange);
    }
    
    _handleUrlChange() {
        const newUrl = location.href;
        if (newUrl !== this.state.currentUrl) {
            this.state.currentUrl = newUrl;
            // 自动清理组件
            this.forceHideAll();  // 或 forceClose()
        }
    }
    
    destroy() {
        // 清理 URL 监听器
        window.removeEventListener('popstate', this._boundHandleUrlChange);
        window.removeEventListener('hashchange', this._boundHandleUrlChange);
    }
}
```

### 使用示例

```javascript
// ✅ 调用方只管使用，不需要关心清理
await window.globalInputModal.show({ title: '输入标题' });
window.globalToastManager.success('操作成功');
window.globalTooltipManager.show('id', 'button', target, '提示内容');

// ❌ 不需要手动清理
// ❌ 不需要监听 URL 变化
// ❌ 不需要调用 forceClose() 或 forceHideAll()
// ✅ 组件会在 URL 变化时自动清理
```

### 优势
1. **简化调用**：外部只需关心显示逻辑，不需要管理清理
2. **防止泄漏**：URL 变化时自动清理，避免 DOM 残留
3. **解耦设计**：调用方不需要知道组件的内部实现
4. **维护性强**：组件实现改变时，调用方代码无需修改

---

## 依赖关系

```
js/global/*/styles.css
    ↓ depends on
styles/variables.css (CSS 变量)
```

**加载顺序**（manifest.json）：
```
1. variables.css                          (CSS 变量)
2. js/global/tooltip-manager/styles.css
3. js/global/toast-manager/styles.css
4. js/global/input-modal/styles.css
5. timeline.css
6. formula.css
```

---

## 使用的 JS 组件

| 模块 | JS 组件 | JS 文件 | CSS 文件 |
|------|---------|---------|----------|
| tooltip-manager | GlobalTooltipManager | `js/global/tooltip-manager/index.js` | `js/global/tooltip-manager/styles.css` |
| toast-manager | GlobalToastManager | `js/global/toast-manager/index.js` | `js/global/toast-manager/styles.css` |
| input-modal | GlobalInputModal | `js/global/input-modal/index.js` | `js/global/input-modal/styles.css` |

---

## 样式类名规范

### Tooltip 相关
- `.timeline-tooltip-base` - 基础 tooltip
- `.timeline-tooltip-dark` - 深色主题
- `.timeline-tooltip-light` - 浅色主题
- `[data-placement="*"]` - 定位属性

### Toast 相关
- `.timeline-copy-feedback` - 复制反馈
- `.timeline-error-toast` - 错误提示
- `.visible` - 显示状态

### Input Modal 相关
- `.global-input-modal-overlay` - 遮罩层
- `.global-input-modal` - 对话框
- `.global-input-modal-input` - 输入框
- `.global-input-modal-cancel` - 取消按钮
- `.global-input-modal-confirm` - 确认按钮
- `.visible` - 显示状态

---

## 修改指南

### 修改 Tooltip 样式

**修改尺寸**：
```css
/* js/global/tooltip-manager/styles.css */
.timeline-tooltip-base {
    padding: 8px 12px;      /* 修改内边距 */
    font-size: 13px;        /* 修改字号 */
    max-width: 400px;       /* 修改最大宽度 */
}
```

**修改箭头**：
```css
/* js/global/tooltip-manager/styles.css */
.timeline-tooltip-base::after {
    width: 8px;             /* 修改箭头大小 */
    height: 8px;
}
```

### 修改 Toast 样式

**修改位置**：
```css
/* js/global/toast-manager/styles.css */
.timeline-copy-feedback {
    /* 添加定位样式 */
    top: 20px;
    left: 50%;
    transform: translateX(-50%);
}
```

**修改颜色**：
```css
/* js/global/toast-manager/styles.css */
.timeline-error-toast {
    background-color: #ef4444;  /* 修改背景色 */
    color: #ffffff;             /* 修改文字色 */
}
```

---

## 主题适配

所有全局组件都支持深色模式：

```css
/* 浅色模式（默认） */
.component {
    background: #fff;
    color: #000;
}

/* 深色模式 */
html.dark .component {
    background: #000;
    color: #fff;
}
```

---

## 调试技巧

### 查看 Tooltip

Chrome DevTools:
```javascript
// 强制显示 tooltip
document.querySelector('.timeline-tooltip-base').classList.add('visible');

// 检查样式来源
getComputedStyle(document.querySelector('.timeline-tooltip-base'));
```

### 查看 Toast

```javascript
// 手动触发 toast
const toast = document.createElement('div');
toast.className = 'timeline-copy-feedback visible';
toast.textContent = '测试提示';
document.body.appendChild(toast);
```

---

## 性能优化

### 为什么采用模块化结构？

1. **内聚性强**：每个组件的 JS 和 CSS 放在一起，便于维护
2. **独立管理**：修改某个组件不影响其他组件
3. **清晰定位**：快速找到组件的所有相关文件
4. **便于扩展**：新增全局组件只需创建新文件夹

### 为什么独立文件？

1. **按需加载**：理论上可以只加载需要的组件样式
2. **缓存友好**：全局组件样式变化较少，缓存时间更长
3. **维护简单**：修改全局组件不影响业务模块
4. **职责清晰**：全局 vs 业务样式分离

---

## 总结

Global 组件目录采用了**模块化结构**，每个组件都是一个独立的文件夹：

✅ **独立维护** - JS 和 CSS 在同一文件夹中
✅ **复用性高** - 多个模块共享
✅ **易于定位** - 快速找到组件的所有文件
✅ **便于扩展** - 新增组件只需添加对应文件夹

