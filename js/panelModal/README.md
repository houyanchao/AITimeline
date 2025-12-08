# Panel Modal - 右侧弹出面板

## 📋 概述

PanelModal 是一个从右侧滑入的模态面板系统，支持多个 tab 切换，用于承载各种功能模块。

## 🎯 特性

- ✅ **从右侧滑入/滑出**：流畅的动画效果（300ms）
- ✅ **多 tab 支持**：右侧垂直 tab 栏，支持多个 tab 切换
- ✅ **只显示图标**：tab 只显示 icon，鼠标悬停显示 tooltip
- ✅ **多种关闭方式**：点击遮罩层、关闭按钮、ESC 键、URL 变化
- ✅ **响应式**：移动端自适应
- ✅ **组件自治**：脚本加载时自动初始化，独立管理生命周期

## ⚡ 初始化

PanelModal **自动初始化**，无需手动调用：

```javascript
// ✅ 脚本加载后，window.panelModal 已经可用
// 位置：js/panelModal/index.js 末尾

if (typeof window !== 'undefined') {
    window.panelModal = new PanelModal();
}
```

**设计理念**：
- PanelModal 是**独立模块**，不依赖其他模块
- 其他模块通过 `window.panelModal` 直接使用
- Tabs 采用**延迟注册**，由需要它们的模块注册

**Tabs 注册**：
- 独立的 tabs：可以在 PanelModal 初始化时注册
- 依赖其他模块的 tabs：由依赖模块注册（如 StarredTab 由 Timeline 注册）

## 📁 文件结构

```
js/panelModal/
├── index.js              # 主入口，管理 Panel 显示/隐藏、tab 切换
├── styles.css            # Panel 基础样式（容器、tab栏、动画）
├── base-tab.js           # Tab 基类，所有 tab 继承此类
├── tab-registry.js       # Tab 注册表，管理所有可用的 tab
├── tabs/                 # 所有 tab 的实现
│   ├── starred/          # 收藏 tab
│   │   ├── index.js      # 收藏列表逻辑
│   │   └── styles.css    # 收藏列表样式
│   └── ...               # 其他 tab
└── README.md            # 本文档
```

## 🔧 使用方式

### 1. 打开 Panel Modal

```javascript
// 打开并显示指定 tab
window.panelModal.show('starred');  // 显示收藏 tab

// 如果不指定 tabId，会显示第一个 tab
window.panelModal.show();
```

### 2. 关闭 Panel Modal

```javascript
window.panelModal.hide();
```

### 3. 切换 Tab

```javascript
window.panelModal.switchTab('starred');
```

## 📝 创建新 Tab

### 步骤 1：创建 Tab 文件

```bash
mkdir -p js/panelModal/tabs/your-tab
touch js/panelModal/tabs/your-tab/index.js
touch js/panelModal/tabs/your-tab/styles.css
```

### 步骤 2：实现 Tab 类

```javascript
// js/panelModal/tabs/your-tab/index.js
class YourTab extends BaseTab {
    constructor() {
        super();
        this.id = 'your-tab';          // 唯一标识
        this.name = 'Your Tab Name';   // 显示名称（tooltip）
        this.icon = '🎯';               // 图标
    }
    
    /**
     * 渲染 tab 内容
     * @returns {HTMLElement}
     */
    render() {
        const container = document.createElement('div');
        container.className = 'your-tab-container';
        container.innerHTML = '<h3>Your Content</h3>';
        return container;
    }
    
    /**
     * Tab 被激活时调用（可选）
     */
    mounted() {
        console.log('Your tab mounted');
    }
    
    /**
     * Tab 被切换走时调用（可选）
     */
    unmounted() {
        console.log('Your tab unmounted');
    }
}
```

### 步骤 3：注册 Tab

在 `tab-registry.js` 中注册：

```javascript
function initializePanelModalTabs(timelineManager) {
    // ... 现有的 tab
    
    // 注册你的新 tab
    const yourTab = new YourTab();
    window.panelModal.registerTab(yourTab);
}
```

### 步骤 4：添加到 manifest.json

```json
{
  "content_scripts": [{
    "js": [
      // ... 现有文件
      "js/panelModal/tabs/your-tab/index.js",
      // ...
    ],
    "css": [
      // ... 现有文件
      "js/panelModal/tabs/your-tab/styles.css",
      // ...
    ]
  }]
}
```

## 🎨 样式指南

### Panel 尺寸
- **宽度**: 500px（桌面端），100%（移动端）
- **高度**: 100vh
- **Tab 栏宽度**: 60px

### 颜色变量
- 使用 `var(--timeline-bar-bg)` 作为背景色
- 使用 `var(--timeline-text-color)` 作为文本颜色

### 动画时长
- Panel 滑入/滑出: 300ms
- Hover 效果: 200ms

## 📦 已实现的 Tab

### 1. Starred Tab（收藏列表）
- **ID**: `starred`
- **图标**: ⭐
- **功能**: 显示所有收藏的对话，支持跳转、复制、取消收藏

## 🚀 API 参考

### PanelModal

#### `show(tabId?: string)`
显示 panel 并切换到指定 tab。

**参数**:
- `tabId` (可选): tab ID，不指定则显示第一个 tab

#### `hide()`
隐藏 panel。

#### `switchTab(tabId: string)`
切换到指定 tab。

**参数**:
- `tabId`: tab ID

#### `registerTab(tab: BaseTab)`
注册新 tab。

**参数**:
- `tab`: BaseTab 实例

### BaseTab

#### 属性
- `id` (string): Tab 唯一标识
- `name` (string): Tab 显示名称
- `icon` (string): Tab 图标

#### 方法
- `render()`: 返回 tab 内容的 HTMLElement
- `mounted()`: Tab 被激活时调用
- `unmounted()`: Tab 被切换走时调用

## 🔮 未来扩展

可以添加的其他 tab：
- ⚙️ **设置 tab**: 扩展设置选项
- 📊 **统计 tab**: 对话数量、收藏数等统计信息
- 🔍 **搜索 tab**: 搜索对话内容
- 📝 **笔记 tab**: 为对话添加笔记
- 🎨 **主题 tab**: 主题切换

