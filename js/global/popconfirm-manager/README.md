# Global Popconfirm Manager

全局确认弹窗管理器 - 简洁的确认对话框组件

## 🎯 功能特性

- ✅ **居中显示** - 屏幕中央显示，带半透明遮罩
- ✅ **Promise 交互** - 支持 async/await 调用
- ✅ **两个按钮** - 取消 + 确认
- ✅ **Title + Content** - 标题和内容文本
- ✅ **自动清理** - 点击外部、ESC键、URL变化自动关闭

## 🚀 快速开始

### 基础用法

```javascript
// 显示确认弹窗
const confirmed = await window.globalPopconfirmManager.show({
    title: '确认删除',
    content: '删除后将无法恢复，确定要继续吗？'
});

if (confirmed) {
    console.log('用户点击了确认');
    // 执行删除操作
} else {
    console.log('用户点击了取消');
}
```

### 自定义按钮文本

```javascript
const result = await window.globalPopconfirmManager.show({
    title: '确认操作',
    content: '这是一个重要操作',
    confirmText: '我确定',
    cancelText: '再想想'
});
```

## 📖 API

### `show(options)`

显示确认弹窗，返回 Promise<boolean>

#### 参数

| 参数 | 类型 | 必需 | 默认值 | 说明 |
|------|------|------|--------|------|
| `title` | string | ❌ | '' | 标题文本 |
| `content` | string | ❌ | '' | 内容文本 |
| `confirmText` | string | ❌ | '确定' | 确认按钮文本 |
| `cancelText` | string | ❌ | '取消' | 取消按钮文本 |

**注意：** `title` 和 `content` 至少需要提供一个

#### 返回值

- **Promise<boolean>**
  - `true` - 用户点击了确认按钮
  - `false` - 用户点击了取消按钮、点击外部或按ESC键

## 💡 使用示例

### 1. 删除确认

```javascript
deleteBtn.addEventListener('click', async () => {
    const confirmed = await window.globalPopconfirmManager.show({
        title: '确认删除',
        content: '删除后将无法恢复，确定要继续吗？',
        confirmText: '删除',
        cancelText: '取消'
    });
    
    if (confirmed) {
        await performDelete();
    }
});
```

### 2. 取消收藏确认

```javascript
async function unstarItem(itemId) {
    const confirmed = await window.globalPopconfirmManager.show({
        title: '取消收藏',
        content: '确定要取消收藏这个对话吗？'
    });
    
    if (confirmed) {
        await removeFromStarred(itemId);
    }
    
    return confirmed;
}
```

### 3. 放弃更改确认

```javascript
cancelBtn.addEventListener('click', async () => {
    const confirmed = await window.globalPopconfirmManager.show({
        title: '放弃更改',
        content: '您有未保存的更改，确定要放弃吗？',
        confirmText: '放弃',
        cancelText: '继续编辑'
    });
    
    if (confirmed) {
        closeEditor();
    }
});
```

### 4. 只有标题

```javascript
const confirmed = await window.globalPopconfirmManager.show({
    title: '确定要退出登录吗？'
});
```

### 5. 只有内容

```javascript
const confirmed = await window.globalPopconfirmManager.show({
    content: '这个操作无法撤销，请确认'
});
```

## 🎨 样式特点

- **居中显示** - 弹窗在屏幕正中央显示
- **半透明遮罩** - 黑色半透明遮罩层（rgba(0, 0, 0, 0.45)）
- **圆角设计** - 12px 圆角，现代化视觉
- **平滑动画** - 淡入 + 缩放动画
- **响应式** - 移动端自动适配

## 🔧 高级特性

### 自动关闭机制

弹窗会在以下情况自动关闭并返回 `false`：

1. 用户点击遮罩层（弹窗外部）
2. 用户按下 ESC 键
3. URL 发生变化（页面跳转）

### 单例模式

全局只有一个弹窗实例，新弹窗会自动关闭旧弹窗

## 📁 文件结构

```
popconfirm-manager/
├── index.js       # 核心逻辑
├── styles.css     # 样式文件
└── README.md      # 文档
```

## 🔗 使用流程

1. 在 `manifest.json` 中注册 JS 和 CSS 文件
2. 在需要确认的地方调用 `window.globalPopconfirmManager.show()`
3. 使用 async/await 获取用户选择结果
4. 根据结果执行相应操作

