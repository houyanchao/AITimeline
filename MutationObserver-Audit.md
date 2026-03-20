# MutationObserver 使用审计

## 概览

项目中共有 **3 类** MutationObserver：

| 类型 | 数量 | 监听范围 | 性能风险 |
|------|:----:|---------|:-------:|
| DOMObserverManager 的 body 订阅者 | 8 个 | `document.body` (subtree) — 共享 1 个 Observer | 中 |
| 独立 MutationObserver | 4 个 | 各自的目标元素 | 低~高 |
| DOMObserverManager 的 container 订阅 | 1 个 | 对话容器 (subtree) | 低 |

> AI 流式生成时，`document.body` 每秒可产生数十次 DOM mutation，所有 body 级别的 Observer 回调都会被触发。

---

## 一、DOMObserverManager body 订阅者（共享 1 个 Observer）

DOMObserverManager 已做了很好的收拢——8 个模块共享同一个 `MutationObserver(document.body, { childList: true, subtree: true })`，通过订阅者模式分发。

| ID | 模块 | 防抖/节流 | 过滤条件 | 用途 |
|----|------|----------|---------|------|
| `ai-state-monitor` | ai-state-monitor | debounce 300ms | hasAddedNodes | 检测 AI 是否在生成 |
| `timeline-dom-check` | timeline-manager | debounce 300ms | hasAddedNodes + hasRemovedNodes | 检查时间轴可见性 + 隐藏冲突元素 |
| `timeline-page` | timeline/index.js | debounce 200ms | hasAddedNodes + hasRemovedNodes | 路由变化检测兜底 |
| `timeline-initial` | timeline/index.js | — | — | 初始化时等待对话容器出现 |
| `formula-manager` | formula-manager | throttle 2000ms + debounce 1000ms | hasAddedNodes | 扫描并处理数学公式 |
| `runner` | runner/index.js | debounce 500ms | hasAddedNodes | 扫描代码块添加 Run 按钮 |
| `prompt-button` | prompt-button-manager | debounce 200ms | hasAddedNodes | 检测输入框出现/消失 |
| `smart-enter` | smart-enter-manager | debounce 200ms | hasAddedNodes | 检测输入框挂载 Enter 监听 |
| `scroll-to-bottom` | scroll-to-bottom-manager | debounce 300ms | hasAddedNodes | 检测输入框出现/消失 + 更新按钮位置 |
| `quick-ask-page` | quickAsk/index.js | debounce 200ms | hasAddedNodes + hasRemovedNodes | 路由变化检测兜底 |

### 风险评估

- **所有订阅者均有 debounce 或 throttle**，触发频率受控 ✅
- **`timeline-initial`**：短生命周期（初始化成功即取消），无风险 ✅
- **`quick-ask-page` 和 `timeline-page`**：用途是 "DOM 变化兜底检测路由切换"，现在 `UrlChangeMonitor` 已覆盖 URL 变化检测（含 pushState/replaceState/popstate/hashchange/轮询），这两个 body 订阅可能冗余

### 优化建议

1. `quick-ask-page` 和 `timeline-page`：评估移除（UrlChangeMonitor 已覆盖路由变化检测）
2. Claude 菜单的独立 Observer 应迁移到 `subscribeBody` 共享机制（见下文 P0）

---

## 二、独立 MutationObserver

这些是绕过 DOMObserverManager 直接创建的 Observer：

### 2.1 Claude 适配器 — ⚠️ 高风险

```
文件：js/sidebarStarred/adapters/claude.js
目标：document.body
配置：{ childList: true, subtree: true }
用途：监听 Radix UI 菜单弹出，注入收藏选项
```

**问题**：监听整个 `document.body` 的 `subtree`，与 DOMObserverManager 的 body observer 完全重叠。Claude 页面每次 DOM 变化都会同时触发两个 observer 的回调。

虽然回调内做了 `requestAnimationFrame` 合并和 `_menuCheckPending` 标记防重入，但 Observer 本身的触发开销仍然存在。

**优化建议**：
- 改用 DOMObserverManager 的 `subscribeBody` 共享 observer
- 或缩小监听范围：只 observe 菜单弹出的容器（如 `[data-radix-portal]` 或页面中的 portal root），而非整个 body

### 2.2 时间轴对话容器 — ✅ OK

```
文件：js/timeline/timeline-manager.js
目标：this.conversationContainer（对话区域 DOM 节点）
配置：{ childList: true, subtree: true }
用途：检测新对话节点（用户提问/AI 回复）出现
```

精确监听对话容器，范围合理。AI 流式生成时会频繁触发，但回调内有 `hasRelevantChanges` 过滤，只处理实际的节点增删。

### 2.3 时间轴 waitForElement — ✅ OK

```
文件：js/timeline/timeline-manager.js
目标：document.body
配置：{ childList: true, subtree: true }
用途：等待特定 DOM 元素出现（一次性）
```

短生命周期 observer，元素找到后立即 `disconnect()`，带 `setTimeout` 超时保护。无性能风险。

### 2.4 侧边栏父容器 — ✅ OK

```
文件：js/sidebarStarred/sidebar-starred-manager.js
目标：info.parent（侧边栏的父元素）
配置：{ childList: true }（无 subtree）
用途：检测侧边栏收藏区域是否被平台框架移除
```

只监听直接子节点变化，范围小，开销极低。

### 2.5 Tooltip 目标元素 — ✅ OK

```
文件：js/global/tooltip-manager/index.js
目标：target.parentNode
配置：{ childList: true, subtree: false }
用途：检测 tooltip 锚点元素被删除时自动隐藏
```

只监听父节点的直接子节点变化，短生命周期（tooltip 隐藏即断开），无风险。

---

## 三、其他 Observer

### 3.1 DOMObserverManager 的主题监听 — ✅ OK

```
文件：js/global/dom-observer-manager/index.js
目标：document.documentElement + document.body
配置：{ attributes: true, attributeFilter: ['class', 'data-theme', ...] }
用途：检测暗色/亮色主题切换
```

只监听特定属性变化（`class`、`data-theme`），不涉及子节点，开销极低。

### 3.2 ResizeObserver — ✅ OK

```
文件：js/timeline/timeline-manager.js, js/smartInputBox/prompt-button-manager.js
用途：检测元素尺寸变化，更新时间轴/按钮位置
```

ResizeObserver 不是 MutationObserver，只在尺寸变化时触发，开销极低。

### 3.3 IntersectionObserver — ✅ OK

```
文件：js/timeline/timeline-manager.js, js/global/tooltip-manager/index.js
用途：虚拟化渲染（时间轴节点可见性检测）、tooltip 可见性检测
```

浏览器原生高性能 API，不走主线程，无性能顾虑。

---

## 四、AI 流式生成时的 Observer 调用链

当 AI 正在流式输出回复时，每个 token 渲染都可能触发 DOM 变化。此时的调用链：

```
DOM 变化
├── DOMObserverManager body observer（1 个，分发给 8-10 个订阅者）
│   ├── ai-state-monitor        → debounce 300ms ✅
│   ├── timeline-dom-check      → debounce 300ms ✅
│   ├── formula-manager         → throttle 2s + debounce 1s ✅
│   ├── runner                  → debounce 500ms ✅
│   ├── prompt-button           → debounce 200ms ✅
│   ├── smart-enter             → debounce 200ms ✅
│   ├── scroll-to-bottom        → debounce 300ms ✅
│   ├── quick-ask-page          → debounce 200ms（可能冗余 🔸）
│   └── timeline-page           → debounce 200ms（可能冗余 🔸）
│
├── Claude 菜单 observer（如果在 Claude 页面）⚠️
│   └── requestAnimationFrame → _checkAndInjectMenu()
│
└── timeline-manager 对话容器 observer
    └── hasRelevantChanges 过滤 → recalculate ✅
```

---

## 五、优化优先级

| 优先级 | 项目 | 改动 | 预期收益 |
|:------:|------|------|---------|
| **P0** | Claude 菜单 observer | 迁移到 `subscribeBody` 共享 observer | 消除 1 个独立 body 级 observer |
| **P1** | `quick-ask-page` body 订阅 | 移除（UrlChangeMonitor 已覆盖路由变化检测） | 减少 1 个 body 订阅者 |
| **P1** | `timeline-page` body 订阅 | 移除（同上） | 减少 1 个 body 订阅者 |
