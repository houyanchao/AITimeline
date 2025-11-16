# StarredTab 迁移到 BaseTab 示例

## 📋 迁移对比

### 🔴 迁移前（手动管理）

```javascript
class StarredTab {
    constructor() {
        this.id = 'starred';
        this.name = chrome.i18n.getMessage('starred');
        this.folderManager = new FolderManager();
        
        // ❌ 状态分散，容易忘记清理
        this.folderStates = {};
        this.searchQuery = '';
        this.searchInput = null;
        this.listContainer = null;
        this.storageListener = null;
    }
    
    render() {
        const container = document.createElement('div');
        
        // 创建搜索框
        this.searchInput = document.createElement('input');
        this.searchInput.value = this.searchQuery;  // ❌ 可能使用旧值
        this.searchInput.addEventListener('input', (e) => {
            this.searchQuery = e.target.value;
            this.updateList();
        });
        
        // 创建列表容器
        this.listContainer = document.createElement('div');
        
        container.appendChild(this.searchInput);
        container.appendChild(this.listContainer);
        
        return container;
    }
    
    mounted() {
        // 添加 Storage 监听
        this.storageListener = (changes) => {
            if (changes.starredTurns || changes.folders) {
                this.updateList();
            }
        };
        StorageAdapter.addChangeListener(this.storageListener);
        
        this.updateList();
    }
    
    unmounted() {
        // ❌ 手动清理，容易遗漏
        if (window.globalTooltipManager) {
            window.globalTooltipManager.hide();
        }
        
        if (this.storageListener) {
            StorageAdapter.removeChangeListener(this.storageListener);
            this.storageListener = null;
        }
        
        this.searchQuery = '';
        this.searchInput = null;
        this.listContainer = null;
        // ⚠️ 容易忘记清理某些状态
    }
}
```

---

### 🟢 迁移后（自动管理）

```javascript
import { BaseTab } from './BaseTab.js';

class StarredTab extends BaseTab {
    constructor() {
        super();  // ✅ 必须先调用
        this.id = 'starred';
        this.name = chrome.i18n.getMessage('starred');
        this.folderManager = new FolderManager();
    }
    
    // ✅ 声明初始状态
    getInitialState() {
        return {
            transient: {
                searchQuery: ''  // 临时状态，每次打开都重置
            },
            persistent: {
                folderStates: {}  // 持久状态，保留用户的展开/折叠
            }
        };
    }
    
    render() {
        const container = document.createElement('div');
        
        // 创建搜索框
        const searchInput = document.createElement('input');
        searchInput.value = '';  // ✅ 总是用空值初始化
        searchInput.autocomplete = 'off';  // ✅ 防止浏览器缓存
        
        // ✅ 使用自动管理的事件监听器
        this.addEventListener(searchInput, 'input', (e) => {
            this.setState('searchQuery', e.target.value);
            this.updateList();
        });
        
        // ✅ 保存 DOM 引用
        this.setDomRef('searchInput', searchInput);
        
        // 创建列表容器
        const listContainer = document.createElement('div');
        this.setDomRef('listContainer', listContainer);
        
        container.appendChild(searchInput);
        container.appendChild(listContainer);
        
        return container;
    }
    
    mounted() {
        super.mounted();  // ✅ 自动初始化状态
        
        // ✅ 使用自动管理的 Storage 监听器
        this.addStorageListener((changes) => {
            if (changes.starredTurns || changes.folders) {
                this.updateList();
            }
        });
        
        this.updateList();
    }
    
    unmounted() {
        super.unmounted();  // ✅ 自动清理所有状态、引用、监听器
        // ✅ 不需要手动清理任何东西！
    }
    
    // 其他方法保持不变，但需要更新状态访问方式
    
    async updateList() {
        const listContainer = this.getDomRef('listContainer');
        if (!listContainer) return;
        
        const searchQuery = this.getState('searchQuery');
        // ... 使用 searchQuery 过滤数据
    }
    
    toggleFolder(folderId) {
        const folderStates = this.getPersistentState('folderStates');
        folderStates[folderId] = !folderStates[folderId];
        this.setPersistentState('folderStates', folderStates);
        this.updateList();
    }
    
    renderFolder(folder) {
        const folderStates = this.getPersistentState('folderStates');
        const isExpanded = folderStates[folder.id] || false;
        // ... 渲染文件夹
    }
}
```

---

## 📊 迁移清单

### 状态迁移

| 旧代码 | 新代码 | 类型 |
|--------|--------|------|
| `this.searchQuery` | `this.setState('searchQuery', value)` | transient |
| `this.searchInput` | `this.setDomRef('searchInput', element)` | domRef |
| `this.listContainer` | `this.setDomRef('listContainer', element)` | domRef |
| `this.folderStates` | `this.setPersistentState('folderStates', value)` | persistent |
| `this.storageListener` | `this.addStorageListener(handler)` | listener |

### 事件监听器迁移

```javascript
// ❌ 旧代码
element.addEventListener('click', handler);

// ✅ 新代码
this.addEventListener(element, 'click', handler);
```

```javascript
// ❌ 旧代码
StorageAdapter.addChangeListener(this.storageListener);
// 在 unmounted() 中：
StorageAdapter.removeChangeListener(this.storageListener);

// ✅ 新代码
this.addStorageListener(handler);
// unmounted() 自动处理清理
```

### 生命周期迁移

```javascript
// ❌ 旧代码
mounted() {
    StorageAdapter.addChangeListener(this.storageListener);
    this.updateList();
}

unmounted() {
    if (this.storageListener) {
        StorageAdapter.removeChangeListener(this.storageListener);
    }
    this.searchQuery = '';
    this.searchInput = null;
}

// ✅ 新代码
mounted() {
    super.mounted();  // 初始化状态
    this.addStorageListener(handler);
    this.updateList();
}

unmounted() {
    super.unmounted();  // 自动清理所有
}
```

---

## 🧪 测试清单

迁移完成后，请验证：

- [ ] 打开 StarredTab，状态正常
- [ ] 输入搜索关键词，搜索正常
- [ ] 关闭 panelModal，再打开，搜索框为空
- [ ] 展开/折叠文件夹，关闭再打开，状态保留
- [ ] 添加/删除收藏，列表自动更新
- [ ] 没有控制台错误
- [ ] 没有内存泄漏（检查 Chrome DevTools Memory Profiler）

---

## ⚠️ 注意事项

### 1. 必须调用 super

```javascript
// ❌ 错误：忘记调用 super.mounted()
mounted() {
    this.updateList();  // 状态未初始化！
}

// ✅ 正确
mounted() {
    super.mounted();
    this.updateList();
}
```

### 2. render() 中不要使用旧状态初始化

```javascript
// ❌ 错误
render() {
    const query = this.getState('searchQuery');
    input.value = query;  // 可能是旧值
}

// ✅ 正确
render() {
    input.value = '';  // 总是用空值
    input.autocomplete = 'off';
}
```

### 3. 持久状态需要可序列化

```javascript
// ✅ 正确
persistent: {
    folderStates: {},
    sortOrder: 'asc',
    viewMode: 'list'
}

// ❌ 错误：不可序列化
persistent: {
    domElement: element,  // DOM 元素不可序列化
    callback: () => {}    // 函数不可序列化
}
```

---

## 🎯 迁移步骤

1. ✅ 让 StarredTab 继承 BaseTab
2. ✅ 实现 `getInitialState()` 方法
3. ✅ 替换所有状态访问为 `getState()`/`setState()`
4. ✅ 替换所有 DOM 引用为 `getDomRef()`/`setDomRef()`
5. ✅ 替换所有事件监听器为 `addEventListener()`/`addStorageListener()`
6. ✅ 简化 `mounted()` 和 `unmounted()`
7. ✅ 测试所有功能
8. ✅ 检查控制台无错误
9. ✅ 检查无内存泄漏

---

## 🚀 预期效果

迁移后，你将获得：

- ✅ **自动状态清理**：不再需要担心忘记清理
- ✅ **更少的代码**：`unmounted()` 只需一行 `super.unmounted()`
- ✅ **更可靠**：框架保证清理逻辑正确
- ✅ **更易维护**：添加新状态不需要修改清理逻辑
- ✅ **更好的架构**：状态分类清晰，职责明确

**迁移是值得的！** 🎊

