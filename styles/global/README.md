# 🌐 Global Styles - 全局组件样式

## 目录说明

此目录包含全局共享组件的样式，这些组件被多个功能模块使用。

```
styles/global/
├── README.md                # 本文档
├── tooltip-manager.css      # Tooltip 组件样式
└── toast-manager.css        # Toast 提示组件样式
```

---

## 文件说明

### 📌 tooltip-manager.css
**全局 Tooltip 组件样式**

**对应 JS**：`js/global/tooltip-manager.js`

**包含内容**：
- `.timeline-tooltip-base` - 基础 tooltip 样式
- `.timeline-tooltip-dark` - 深色主题 tooltip
- `.timeline-tooltip-light` - 浅色主题 tooltip
- 箭头样式（上下左右四个方向）

**使用场景**：
- 时间轴节点 tooltip
- 收藏按钮 tooltip
- 公式 tooltip

**特点**：
- 智能定位（auto placement）
- 深色/浅色主题自适应
- 支持 hover 悬停
- 可复制文本内容

### 🔔 toast-manager.css
**全局 Toast 提示组件样式**

**对应 JS**：`js/global/toast-manager.js`

**包含内容**：
- `.timeline-copy-feedback` - 复制成功提示
- `.timeline-error-toast` - 错误提示

**使用场景**：
- 复制文本成功提示
- 复制公式成功提示
- 各种错误提示

**特点**：
- 固定定位，顶部居中
- 自动淡入淡出
- 深色模式适配

---

## 依赖关系

```
styles/global/*.css
    ↓ depends on
styles/variables.css (CSS 变量)
```

**加载顺序**（manifest.json）：
```
1. variables.css           (CSS 变量)
2. global/tooltip-manager.css
3. global/toast-manager.css
4. timeline.css
5. formula.css
6. capture.css
```

---

## 使用的 JS 组件

| CSS 文件 | JS 组件 | 位置 |
|---------|---------|------|
| tooltip-manager.css | GlobalTooltipManager | `js/global/tooltip-manager.js` |
| toast-manager.css | GlobalToastManager | `js/global/toast-manager.js` |

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

---

## 修改指南

### 修改 Tooltip 样式

**修改尺寸**：
```css
/* tooltip-manager.css */
.timeline-tooltip-base {
    padding: 8px 12px;      /* 修改内边距 */
    font-size: 13px;        /* 修改字号 */
    max-width: 400px;       /* 修改最大宽度 */
}
```

**修改箭头**：
```css
/* tooltip-manager.css */
.timeline-tooltip-base::after {
    width: 8px;             /* 修改箭头大小 */
    height: 8px;
}
```

### 修改 Toast 样式

**修改位置**：
```css
/* toast-manager.css */
.timeline-copy-feedback {
    /* 添加定位样式 */
    top: 20px;
    left: 50%;
    transform: translateX(-50%);
}
```

**修改颜色**：
```css
/* toast-manager.css */
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

### 为什么独立文件？

1. **按需加载**：理论上可以只加载需要的组件样式
2. **缓存友好**：全局组件样式变化较少，缓存时间更长
3. **维护简单**：修改全局组件不影响业务模块
4. **职责清晰**：全局 vs 业务样式分离

---

## 总结

Global 样式目录包含了所有**跨模块共享**的组件样式：

✅ **独立维护** - 与业务逻辑分离
✅ **复用性高** - 多个模块共享
✅ **易于定位** - 快速找到全局组件样式
✅ **便于扩展** - 新增全局组件只需添加对应文件

