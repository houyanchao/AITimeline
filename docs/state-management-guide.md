# 🎯 项目状态管理完全指南

## 📋 问题背景

在 PanelModal 系统中，Tab 实例是**持久的**（单例），但 DOM 会被**频繁销毁和重建**。这导致：

1. 如果状态没有正确重置 → 出现"记忆"效应（如搜索框保留旧值）
2. 如果 DOM 引用没有清除 → 内存泄漏
3. 如果事件监听器没有移除 → 事件泄漏

**传统解决方案**：手动在 `unmounted()` 中清理所有状态。

**问题**：
- ❌ 依赖开发者记忆
- ❌ 容易遗漏
- ❌ 代码重复
- ❌ 难以维护

---

## ✅ 新方案：BaseTab 自动状态管理

### 核心理念

通过**框架层面**的自动化，彻底解决状态管理问题。

#### 1. 状态分类

| 类型 | 说明 | 示例 | unmounted 时行为 |
|-----|------|------|-----------------|
| **transient** | 临时状态 | 搜索关键词、Loading | ✅ 自动重置 |
| **persistent** | 持久状态 | 展开/折叠、排序方式 | ⚠️ 保留 |
| **domRef** | DOM 引用 | input、container | ✅ 自动清除 |
| **listener** | 事件监听器 | click、storage | ✅ 自动移除 |

#### 2. 自动化机制

```
mounted() → _initializeState() → 初始化 transient/persistent

unmounted() → 自动清理：
    ├─ 移除所有 listeners
    ├─ 清除所有 domRefs
    ├─ 重置所有 transientState
    └─ 保留 persistentState
```

---

## 🏗️ 使用指南

### 1. 基础模板

```javascript
class MyTab extends BaseTab {
    constructor() {
        super();  // ✅ 必须先调用
        this.id = 'my-tab';
        this.name = 'My Tab';
        this.icon = '🎯';
        
        // ✅ 可以定义不需要重置的实例变量
        this.dataManager = new DataManager();
    }
    
    // ✅ 声明初始状态
    getInitialState() {
        return {
            transient: {
                searchQuery: '',    // 每次打开重置
                isLoading: false,
                selectedId: null
            },
            persistent: {
                viewMode: 'list',   // 保留用户偏好
                sortOrder: 'asc',
                expandedIds: {}
            }
        };
    }
    
    render() {
        const container = document.createElement('div');
        
        // 创建搜索框
        const input = document.createElement('input');
        input.value = '';  // ✅ 总是用空值
        input.autocomplete = 'off';  // ✅ 防止浏览器缓存
        
        // ✅ 使用自动管理的事件
        this.addEventListener(input, 'input', (e) => {
            this.setState('searchQuery', e.target.value);
            this.handleSearch();
        });
        
        // ✅ 保存 DOM 引用
        this.setDomRef('searchInput', input);
        
        container.appendChild(input);
        return container;
    }
    
    mounted() {
        super.mounted();  // ✅ 必须先调用（初始化状态）
        
        // ✅ 使用自动管理的 Storage 监听
        this.addStorageListener((changes) => {
            if (changes.myData) {
                this.refresh();
            }
        });
        
        this.loadData();
    }
    
    unmounted() {
        super.unmounted();  // ✅ 必须调用（自动清理所有）
        // ✅ 不需要手动清理任何东西！
    }
    
    // 业务方法
    handleSearch() {
        const query = this.getState('searchQuery');
        const viewMode = this.getPersistentState('viewMode');
        // ... 使用状态
    }
}
```

---

### 2. 状态 API

#### 临时状态（transient）

```javascript
// 设置
this.setState('searchQuery', 'hello');
this.setState('isLoading', true);

// 获取
const query = this.getState('searchQuery');
const loading = this.getState('isLoading');

// unmounted 时自动重置为初始值
```

#### 持久状态（persistent）

```javascript
// 设置
this.setPersistentState('viewMode', 'grid');
this.setPersistentState('expandedIds', { '1': true, '2': false });

// 获取
const mode = this.getPersistentState('viewMode');
const expanded = this.getPersistentState('expandedIds');

// unmounted 时保留
```

#### DOM 引用

```javascript
// 保存
const input = document.createElement('input');
this.setDomRef('searchInput', input);

// 获取
const input = this.getDomRef('searchInput');
if (input) {
    input.focus();
}

// unmounted 时自动清除
```

#### 事件监听器

```javascript
// DOM 事件
this.addEventListener(button, 'click', this.handleClick);
this.addEventListener(input, 'input', this.handleInput, { passive: true });

// Storage 事件
this.addStorageListener((changes) => {
    if (changes.data) {
        this.refresh();
    }
});

// unmounted 时自动移除所有
```

---

### 3. 生命周期钩子

#### mounted()

```javascript
mounted() {
    super.mounted();  // 1️⃣ 必须先调用（初始化状态）
    
    // 2️⃣ 添加事件监听
    this.addStorageListener(this.handleStorageChange);
    
    // 3️⃣ 加载数据
    this.loadData();
    
    // 4️⃣ 初始化 UI
    this.updateView();
}
```

#### unmounted()

```javascript
// ✅ 最简单的情况（推荐）
unmounted() {
    super.unmounted();  // 自动清理所有
}

// ⚠️ 如果需要保存数据
unmounted() {
    this.saveData();      // 1️⃣ 先保存数据
    super.unmounted();    // 2️⃣ 再清理
}
```

---

## 📚 实战案例

### 案例 1：搜索功能

```javascript
class SearchTab extends BaseTab {
    constructor() {
        super();
        this.id = 'search';
        this.name = chrome.i18n.getMessage('search');
    }
    
    getInitialState() {
        return {
            transient: {
                searchQuery: '',
                results: [],
                isSearching: false
            },
            persistent: {
                searchHistory: []  // 保留搜索历史
            }
        };
    }
    
    render() {
        const container = document.createElement('div');
        
        // 搜索框
        const input = document.createElement('input');
        input.placeholder = '搜索...';
        input.autocomplete = 'off';
        
        this.addEventListener(input, 'input', async (e) => {
            const query = e.target.value;
            this.setState('searchQuery', query);
            this.setState('isSearching', true);
            
            const results = await this.search(query);
            
            this.setState('results', results);
            this.setState('isSearching', false);
            this.renderResults();
        });
        
        this.setDomRef('searchInput', input);
        
        // 结果容器
        const resultsContainer = document.createElement('div');
        this.setDomRef('resultsContainer', resultsContainer);
        
        container.appendChild(input);
        container.appendChild(resultsContainer);
        return container;
    }
    
    async search(query) {
        // 执行搜索...
        return [];
    }
    
    renderResults() {
        const container = this.getDomRef('resultsContainer');
        const results = this.getState('results');
        const isSearching = this.getState('isSearching');
        
        if (isSearching) {
            container.innerHTML = '<div>搜索中...</div>';
        } else {
            container.innerHTML = results.map(r => 
                `<div>${r.title}</div>`
            ).join('');
        }
    }
}
```

---

### 案例 2：文件夹展开/折叠

```javascript
class FolderTab extends BaseTab {
    getInitialState() {
        return {
            transient: {
                hoveredId: null  // 鼠标悬停的文件夹
            },
            persistent: {
                expandedIds: {}  // 展开状态（保留）
            }
        };
    }
    
    toggleFolder(folderId) {
        const expanded = this.getPersistentState('expandedIds');
        expanded[folderId] = !expanded[folderId];
        this.setPersistentState('expandedIds', expanded);
        this.render();
    }
    
    renderFolder(folder) {
        const expanded = this.getPersistentState('expandedIds');
        const isExpanded = expanded[folder.id] || false;
        
        const folderEl = document.createElement('div');
        folderEl.innerHTML = `
            ${isExpanded ? '▼' : '▶'} ${folder.name}
        `;
        
        this.addEventListener(folderEl, 'click', () => {
            this.toggleFolder(folder.id);
        });
        
        return folderEl;
    }
}
```

---

### 案例 3：实时数据同步

```javascript
class DataTab extends BaseTab {
    getInitialState() {
        return {
            transient: {
                data: [],
                lastUpdateTime: null
            },
            persistent: {}
        };
    }
    
    mounted() {
        super.mounted();
        
        // 监听 Storage 变化，自动刷新
        this.addStorageListener((changes) => {
            if (changes.myData) {
                this.loadData();
            }
        });
        
        this.loadData();
    }
    
    async loadData() {
        const data = await StorageAdapter.get('myData');
        this.setState('data', data || []);
        this.setState('lastUpdateTime', Date.now());
        this.renderData();
    }
    
    renderData() {
        const container = this.getDomRef('container');
        const data = this.getState('data');
        
        container.innerHTML = data.map(item => 
            `<div>${item.name}</div>`
        ).join('');
    }
}
```

---

## ⚠️ 常见陷阱

### 1. 忘记调用 super

```javascript
// ❌ 错误
mounted() {
    this.loadData();  // 状态未初始化！
}

// ✅ 正确
mounted() {
    super.mounted();  // 先初始化状态
    this.loadData();
}
```

### 2. 在 render() 中使用状态

```javascript
// ❌ 错误：render() 时状态还未初始化
render() {
    const query = this.getState('searchQuery');
    input.value = query;  // undefined 或旧值
}

// ✅ 正确：总是用空值初始化
render() {
    input.value = '';
    input.autocomplete = 'off';
}
```

### 3. 持久状态用于临时数据

```javascript
// ❌ 错误：搜索关键词应该是临时状态
getInitialState() {
    return {
        persistent: {
            searchQuery: ''  // 错误！
        }
    };
}

// ✅ 正确
getInitialState() {
    return {
        transient: {
            searchQuery: ''  // 正确！
        }
    };
}
```

### 4. DOM 引用保存在持久状态

```javascript
// ❌ 错误：DOM 引用不可序列化
persistent: {
    inputElement: element  // 错误！
}

// ✅ 正确：使用 domRef
this.setDomRef('inputElement', element);
```

---

## 📊 迁移检查清单

从旧代码迁移到 BaseTab 时，请检查：

- [ ] 继承 BaseTab
- [ ] 实现 `getInitialState()`
- [ ] 所有状态都使用 `setState()`/`getPersistentState()`
- [ ] 所有 DOM 引用都使用 `setDomRef()`/`getDomRef()`
- [ ] 所有事件监听器都使用 `addEventListener()`/`addStorageListener()`
- [ ] `mounted()` 中先调用 `super.mounted()`
- [ ] `unmounted()` 中调用 `super.unmounted()`
- [ ] `render()` 中不使用状态初始化 DOM
- [ ] input 添加 `autocomplete="off"`
- [ ] 测试：打开→关闭→再打开，所有临时状态都被重置

---

## 🎯 设计原则

1. **最小惊讶原则**：每次打开 Tab，临时状态都应该是干净的
2. **用户偏好保留**：展开/折叠、排序、视图模式等应该保留
3. **自动化优先**：框架自动处理，减少手动代码
4. **声明式配置**：状态在 `getInitialState()` 中集中声明
5. **防御性编程**：获取 DOM 引用前先检查是否存在

---

## 🚀 预期效果

使用 BaseTab 后：

- ✅ **零状态泄漏**：临时状态自动重置
- ✅ **零内存泄漏**：DOM 引用自动清除
- ✅ **零事件泄漏**：监听器自动移除
- ✅ **更少代码**：`unmounted()` 只需一行
- ✅ **更可靠**：框架保证清理逻辑正确
- ✅ **更易维护**：添加新状态不需要修改清理代码

---

## 📖 相关文档

- [panelModal-lifecycle.md](./panelModal-lifecycle.md) - PanelModal 生命周期详解
- [state-management-solution.md](./state-management-solution.md) - 状态管理方案设计
- [starred-tab-migration-example.md](./starred-tab-migration-example.md) - StarredTab 迁移示例

---

**现在，状态管理问题彻底解决了！** 🎉

