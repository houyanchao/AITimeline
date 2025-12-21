/**
 * Folder Manager - 文件夹管理器
 * 
 * 功能：
 * - 支持最多2级文件夹（根文件夹 + 子文件夹）
 * - 创建、编辑、删除文件夹
 * - 移动收藏项到文件夹
 * - 按文件夹分组展示
 */

class FolderManager {
    constructor(storageAdapter) {
        this.storage = storageAdapter;
    }
    
    /**
     * 获取所有文件夹
     * @returns {Promise<Array>}
     */
    async getFolders() {
        const data = await this.storage.get('folders');
        return data || [];
    }
    
    /**
     * 创建文件夹
     * @param {string} name - 文件夹名称
     * @param {string|null} parentId - 父文件夹 ID（null = 根文件夹）
     * @returns {Promise<Object>} 新创建的文件夹
     */
    async createFolder(name, parentId = null) {
        // 检查嵌套层级（最多2级）
        if (parentId) {
            const folders = await this.getFolders();
            const parent = folders.find(f => f.id === parentId);
            
            if (parent && parent.parentId !== null) {
                throw new Error('最多支持2级文件夹');
            }
        }
        
        const folders = await this.getFolders();
        
        // 计算当前层级的 order
        const siblings = folders.filter(f => f.parentId === parentId);
        
        const newFolder = {
            id: `folder_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
            name,
            parentId,
            createdAt: Date.now(),
            order: siblings.length
        };
        
        folders.push(newFolder);
        await this.storage.set('folders', folders);
        
        console.log('[FolderManager] Created folder:', newFolder);
        return newFolder;
    }
    
    /**
     * 编辑文件夹名称
     * @param {string} folderId - 文件夹 ID
     * @param {string} newName - 新名称
     */
    async updateFolder(folderId, newName) {
        const folders = await this.getFolders();
        const folder = folders.find(f => f.id === folderId);
        
        if (!folder) {
            throw new Error('文件夹不存在');
        }
        
        folder.name = newName;
        await this.storage.set('folders', folders);
        
        console.log('[FolderManager] Updated folder:', folderId, newName);
    }
    
    /**
     * 删除文件夹
     * @param {string} folderId - 要删除的文件夹 ID
     * @param {string|null} moveToFolderId - 收藏项移动到的目标文件夹 ID（null = 未分类）
     */
    async deleteFolder(folderId, moveToFolderId = null) {
        const folders = await this.getFolders();
        const folderToDelete = folders.find(f => f.id === folderId);
        
        if (!folderToDelete) {
            throw new Error('文件夹不存在');
        }
        
        // 1. 找出所有子文件夹
        const childFolderIds = folders
            .filter(f => f.parentId === folderId)
            .map(f => f.id);
        
        // 2. 删除文件夹及其子文件夹
        const newFolders = folders.filter(f => 
            f.id !== folderId && !childFolderIds.includes(f.id)
        );
        await this.storage.set('folders', newFolders);
        
        // 3. 处理该文件夹及子文件夹中的收藏项（移到目标文件夹或默认文件夹）
        const allDeletedFolderIds = [folderId, ...childFolderIds];
        const starredItems = await this.storage.getAllByPrefix('chatTimelineStar:');
        
        for (const key in starredItems) {
            const item = starredItems[key];
            if (allDeletedFolderIds.includes(item.folderId)) {
                item.folderId = moveToFolderId;
                await this.storage.set(key, item);
            }
        }
        
        console.log('[FolderManager] Deleted folder:', folderId, 'and', childFolderIds.length, 'children');
    }
    
    /**
     * 移动收藏项到文件夹
     * @param {string} turnId - 收藏项 ID（格式：url:index）
     * @param {string|null} targetFolderId - 目标文件夹 ID（null = 未分类）
     */
    async moveStarredToFolder(turnId, targetFolderId) {
        // 构建原始的 storage key: chatTimelineStar:url:index
        const key = `chatTimelineStar:${turnId}`;
        const item = await this.storage.get(key);
        
        if (!item) {
            throw new Error('收藏项不存在');
        }
        
        // 更新 folderId 字段
        item.folderId = targetFolderId;
        await this.storage.set(key, item);
        
        console.log('[FolderManager] Moved starred:', turnId, 'to folder:', targetFolderId);
    }
    
    /**
     * 按文件夹分组收藏项（树状结构）
     * @returns {Promise<Object>} 分组后的数据
     */
    async getStarredByFolder() {
        const folders = await this.getFolders();
        
        // 使用原有方式获取所有收藏项（chatTimelineStar: 格式）
        const starredItems = await this.storage.getAllByPrefix('chatTimelineStar:');
        
        // ✅ 辅助函数：解析 nodeKey（支持字符串和数字）
        const parseNodeKey = (keyPart) => {
            if (keyPart === undefined || keyPart === '') return null;
            const parsed = parseInt(keyPart, 10);
            // 如果是纯数字字符串，返回数字；否则返回原字符串（如 Gemini nodeId）
            return (String(parsed) === keyPart) ? parsed : keyPart;
        };
        
        // ✅ 辅助函数：从 key 中提取 item 信息
        // ⚠️ 重要：turnId 必须完全从 Storage Key 中解析，确保 handleUnstar 时能正确删除
        const extractItemInfo = (key, item) => {
            // key 格式：chatTimelineStar:{urlWithoutProtocol}:{nodeKey}
            // 必须从 Key 中解析 nodeKey，不能用 item 中的字段，否则可能因类型差异导致 key 不匹配
            const keyWithoutPrefix = key.replace('chatTimelineStar:', '');
            const lastColonIndex = keyWithoutPrefix.lastIndexOf(':');
            
            let urlWithoutProtocol, nodeKeyStr;
            if (lastColonIndex === -1) {
                // 异常情况：没有冒号分隔
                urlWithoutProtocol = keyWithoutPrefix;
                nodeKeyStr = '';
            } else {
                urlWithoutProtocol = keyWithoutPrefix.substring(0, lastColonIndex);
                nodeKeyStr = keyWithoutPrefix.substring(lastColonIndex + 1);
            }
            
            // 解析 nodeKey 类型（数字或字符串）
            const nodeKey = parseNodeKey(nodeKeyStr);
            
            // ⚠️ turnId 必须用 nodeKeyStr（原始字符串），确保和 Storage Key 完全一致
            const turnId = `${urlWithoutProtocol}:${nodeKeyStr}`;
            return { urlWithoutProtocol, nodeKey, turnId };
        };
        
        // 构建树状结构
        const tree = {
            folders: [],      // 根文件夹列表
            uncategorized: [] // 未分类收藏项（默认文件夹）
        };
        
        // 创建文件夹 ID 集合，用于快速查找
        const folderIds = new Set(folders.map(f => f.id));
        const assignedTurnIds = new Set(); // 记录已分配的收藏项
        
        
        // 1. 先构建根文件夹
        const rootFolders = folders.filter(f => f.parentId === null);
        rootFolders.sort((a, b) => a.order - b.order);
        
        // 2. 为每个根文件夹添加子文件夹和收藏项
        for (const rootFolder of rootFolders) {
            const folderNode = {
                ...rootFolder,
                children: [], // 子文件夹
                items: []     // 当前文件夹的收藏项
            };
            
            // 找出子文件夹
            const childFolders = folders.filter(f => f.parentId === rootFolder.id);
            childFolders.sort((a, b) => a.order - b.order);
            
            for (const childFolder of childFolders) {
                const childNode = {
                    ...childFolder,
                    items: [] // 子文件夹的收藏项
                };
                
                // 添加子文件夹的收藏项
                for (const key in starredItems) {
                    const item = starredItems[key];
                    const { urlWithoutProtocol, nodeKey, turnId } = extractItemInfo(key, item);
                    
                    // 检查是否属于该子文件夹
                    if (item.folderId === childFolder.id) {
                        childNode.items.push({ 
                            turnId,
                            url: item.url || `https://${urlWithoutProtocol}`,
                            urlWithoutProtocol,
                            index: nodeKey,   // 兼容旧代码
                            nodeId: nodeKey,  // 新字段
                            theme: item.question || '整个对话',
                            timestamp: item.timestamp || 0,
                            folderId: item.folderId
                        });
                        assignedTurnIds.add(turnId);
                    }
                }
                
                // 按时间排序
                childNode.items.sort((a, b) => b.timestamp - a.timestamp);
                
                folderNode.children.push(childNode);
            }
            
            // 添加根文件夹的收藏项
            for (const key in starredItems) {
                const item = starredItems[key];
                const { urlWithoutProtocol, nodeKey, turnId } = extractItemInfo(key, item);
                
                // 检查是否属于该根文件夹
                if (item.folderId === rootFolder.id) {
                    folderNode.items.push({ 
                        turnId,
                        url: item.url || `https://${urlWithoutProtocol}`,
                        urlWithoutProtocol,
                        index: nodeKey,   // 兼容旧代码
                        nodeId: nodeKey,  // 新字段
                        theme: item.question || '整个对话',
                        timestamp: item.timestamp || 0,
                        folderId: item.folderId
                    });
                    assignedTurnIds.add(turnId);
                }
            }
            
            // 按时间排序
            folderNode.items.sort((a, b) => b.timestamp - a.timestamp);
            
            tree.folders.push(folderNode);
        }
        
        // 3. 添加未分类收藏项（没有 folderId 或 folderId 指向已删除文件夹的收藏项）
        
        for (const key in starredItems) {
            const item = starredItems[key];
            const { urlWithoutProtocol, nodeKey, turnId } = extractItemInfo(key, item);
            
            // 如果该收藏项还没有被分配到任何文件夹，则归为未分类（默认文件夹）
            // 这包括：folderId 为 null/undefined 或 folderId 指向已删除的文件夹
            if (!assignedTurnIds.has(turnId)) {
                tree.uncategorized.push({ 
                    turnId,
                    url: item.url || `https://${urlWithoutProtocol}`,
                    urlWithoutProtocol,
                    index: nodeKey,   // 兼容旧代码
                    nodeId: nodeKey,  // 新字段
                    theme: item.question || '整个对话',
                    timestamp: item.timestamp || 0,
                    folderId: item.folderId
                });
            }
        }
        
        // 按时间排序未分类项
        tree.uncategorized.sort((a, b) => b.timestamp - a.timestamp);
        
        
        return tree;
    }
    
    /**
     * 获取文件夹路径（用于显示）
     * @param {string} folderId - 文件夹 ID
     * @returns {Promise<string>} 文件夹路径，如 "工作/重要项目"
     */
    async getFolderPath(folderId) {
        if (!folderId) return '';
        
        const folders = await this.getFolders();
        const folder = folders.find(f => f.id === folderId);
        
        if (!folder) return '';
        
        if (folder.parentId) {
            const parent = folders.find(f => f.id === folder.parentId);
            return parent ? `${parent.name} / ${folder.name}` : folder.name;
        }
        
        return folder.name;
    }
    
    /**
     * 检查文件夹名称是否已存在（同级）
     * @param {string} name - 文件夹名称
     * @param {string|null} parentId - 父文件夹 ID
     * @param {string|null} excludeId - 排除的文件夹 ID（用于编辑时）
     * @returns {Promise<boolean>}
     */
    async isFolderNameExists(name, parentId = null, excludeId = null) {
        const folders = await this.getFolders();
        const siblings = folders.filter(f => 
            f.parentId === parentId && 
            f.id !== excludeId
        );
        
        return siblings.some(f => f.name === name);
    }
}

