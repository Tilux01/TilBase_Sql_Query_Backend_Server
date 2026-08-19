const makeConnection = require("../SQLConnection");

const getNestedValue = (obj, path) => {
    if (!path.includes('.')) return obj[path];
    return path.split('.').reduce((acc, part) => (acc !== undefined && acc !== null) ? acc[part] : undefined, obj);
};

const setNestedValue = (obj, path, value) => {
    if (!path.includes('.')) {
        obj[path] = value;
        return;
    }
    const parts = path.split('.');
    let current = obj;
    for (let i = 0; i < parts.length - 1; i++) {
        if (!current[parts[i]] || typeof current[parts[i]] !== 'object') {
            current[parts[i]] = {};
        }
        current = current[parts[i]];
    }
    current[parts[parts.length - 1]] = value;
};

const deleteNestedValue = (obj, path) => {
    if (!path.includes('.')) {
        delete obj[path];
        return;
    }
    const parts = path.split('.');
    let current = obj;
    for (let i = 0; i < parts.length - 1; i++) {
        if (!current[parts[i]] || typeof current[parts[i]] !== 'object') return;
        current = current[parts[i]];
    }
    delete current[parts[parts.length - 1]];
};


const getCollections = async (req, res) => {
    const { clusterId, rootPath } = req.body; 

    try {
        const connection = await makeConnection();
        
        
        
        
        let query = "SELECT DISTINCT parent_path FROM Realtime_Store WHERE cluster_id = ?";
        let params = [clusterId];
        
        if (rootPath) {
            query += " AND parent_path LIKE ?";
            params.push(`${rootPath}/%`);
        } else {
            
            query += " AND parent_path NOT LIKE '%/%'";
        }

        const [rows] = await connection.query(query, params);
        
        
        let collections = new Set();
        rows.forEach(row => {
            let path = row.parent_path;
            if (rootPath) {
                path = path.substring(rootPath.length + 1); 
            }
            
            const collectionName = path.split('/')[0];
            if (collectionName) collections.add(collectionName);
        });

        res.status(200).json({ success: true, collections: Array.from(collections) });
    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, message: "Failed to fetch collections" });
    }
};


const getDocuments = async (req, res) => {
    const { clusterId, parentPath } = req.body; 

    if (!parentPath) return res.status(400).json({ success: false, message: "Missing collection path" });

    try {
        const connection = await makeConnection();
        
        const query = "SELECT id, path, created_at FROM Realtime_Store WHERE cluster_id = ? AND parent_path = ?";
        const [rows] = await connection.query(query, [clusterId, parentPath]);
        
        const documents = rows.map(r => {
            const segments = r.path.split('/');
            return {
                id: r.id,
                fullPath: r.path,
                docId: segments[segments.length - 1], 
                created_at: r.created_at
            };
        });

        res.status(200).json({ success: true, documents });
    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, message: "Failed to fetch documents" });
    }
};


const getDocumentData = async (req, res) => {
    const { clusterId, path } = req.body;

    try {
        const connection = await makeConnection();
        const query = "SELECT document_data FROM Realtime_Store WHERE cluster_id = ? AND path = ?";
        const [rows] = await connection.query(query, [clusterId, path]);

        if (rows.length === 0) {
            return res.status(404).json({ success: false, message: "Document not found" });
        }
        let parsedData = rows[0].document_data;
        if (typeof parsedData === 'string') {
            try {
                parsedData = JSON.parse(parsedData);
            } catch (e) {
                parsedData = {};
            }
        }

        res.status(200).json({ success: true, data: parsedData || {} });
    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, message: "Failed to fetch document data" });
    }
};


const setDocumentData = async (req, res) => {
    const { clusterId, path, documentData } = req.body;

    if (!path) return res.status(400).json({ success: false, message: "Path is required" });

    
    const segments = path.split('/');
    if (segments.length % 2 !== 0) {
        return res.status(400).json({ success: false, message: "Path must point to a document (even number of segments)" });
    }
    const parentPath = segments.slice(0, -1).join('/');

    try {
        const connection = await makeConnection();
        const query = `
            INSERT INTO Realtime_Store (cluster_id, path, parent_path, document_data) 
            VALUES (?, ?, ?, ?) 
            ON DUPLICATE KEY UPDATE document_data = VALUES(document_data)
        `;
        const jsonData = typeof documentData === 'string' ? documentData : JSON.stringify(documentData);
        
        
        const [existing] = await connection.query("SELECT document_data FROM Realtime_Store WHERE cluster_id = ? AND path = ?", [clusterId, path]);
        let oldSize = 0;
        if (existing.length > 0) {
            const oldData = typeof existing[0].document_data === 'string' ? existing[0].document_data : JSON.stringify(existing[0].document_data);
            oldSize = Buffer.byteLength(oldData, 'utf8');
        }
        const newSize = Buffer.byteLength(jsonData, 'utf8');
        const sizeDelta = newSize - oldSize;
        
        await connection.query(query, [clusterId, path, parentPath, jsonData]);

        const projectId = req.project_id || req.sdk_project_id;
        const userId = req.user_id || req.sdk_user_id;
        if (projectId && userId) {
            if (sizeDelta !== 0) {
                await connection.query('UPDATE Cluster_Table SET space_used = space_used + ? WHERE id = ?', [sizeDelta, clusterId]);
            }
            await connection.query('INSERT INTO Project_History (user_id, Project_id, History_Title, History_Description, Status, History_Type, Other_Stamp) VALUES (?,?,?,?,?,?,?)', 
                [userId, projectId, 'Document Write', `Document saved at ${path}`, 'Active', 'documentWrite', `Delta: ${sizeDelta} bytes`]);
        }

        
        const io = req.app?.get('io');
        if (io) {
            io.to(`cluster_${clusterId}`).emit('document_update', { path, eventType: 'set' });
            io.to(`cluster_${clusterId}`).emit('collection_update', { collection: parentPath, eventType: 'set', path });
        }

        res.status(200).json({ success: true, message: "Document saved successfully" });
    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, message: "Failed to save document" });
    }
};


const deleteDocument = async (req, res) => {
    const { clusterId, path } = req.body;

    try {
        const connection = await makeConnection();
        
        
        const [docs] = await connection.query("SELECT document_data FROM Realtime_Store WHERE cluster_id = ? AND (path = ? OR path LIKE ?)", [clusterId, path, `${path}/%`]);
        let sizeDelta = 0;
        docs.forEach(doc => {
            const oldData = typeof doc.document_data === 'string' ? doc.document_data : JSON.stringify(doc.document_data);
            sizeDelta += Buffer.byteLength(oldData, 'utf8');
        });

        const query = "DELETE FROM Realtime_Store WHERE cluster_id = ? AND (path = ? OR path LIKE ?)";
        await connection.query(query, [clusterId, path, `${path}/%`]);

        const projectId = req.project_id || req.sdk_project_id;
        const userId = req.user_id || req.sdk_user_id;
        if (projectId && userId && sizeDelta > 0) {
            await connection.query('UPDATE Cluster_Table SET space_used = space_used - ? WHERE id = ?', [sizeDelta, clusterId]);
            await connection.query('INSERT INTO Project_History (user_id, Project_id, History_Title, History_Description, Status, History_Type, Other_Stamp) VALUES (?,?,?,?,?,?,?)', 
                [userId, projectId, 'Document Delete', `Document(s) deleted at ${path}`, 'Active', 'documentDelete', `Delta: -${sizeDelta} bytes`]);
        }

        const io = req.app?.get('io');
        if (io) {
            io.to(`cluster_${clusterId}`).emit('document_update', { path, eventType: 'delete' });
            const segments = path.split('/');
            const parentPath = segments.slice(0, -1).join('/');
            io.to(`cluster_${clusterId}`).emit('collection_update', { collection: parentPath, eventType: 'delete', path });
        }

        res.status(200).json({ success: true, message: "Document deleted successfully" });
    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, message: "Failed to delete document" });
    }
};

const updateDocument = async (req, res) => {
    const { clusterId, path, documentData } = req.body;
    if (!path) return res.status(400).json({ success: false, message: "Path is required" });
    const segments = path.split('/');
    const parentPath = segments.slice(0, -1).join('/');

    try {
        const connection = await makeConnection();
        const [rows] = await connection.query("SELECT document_data FROM Realtime_Store WHERE cluster_id = ? AND path = ?", [clusterId, path]);
        let existing = {};
        if (rows.length > 0) {
            existing = typeof rows[0].document_data === 'string' ? JSON.parse(rows[0].document_data) : rows[0].document_data;
        }
        
        let merged = { ...existing };

        
        for (const key in documentData) {
            const val = documentData[key];
            if (val && typeof val === 'object' && val.__type === 'FieldValue') {
                if (val.operation === 'increment') {
                    const currentVal = getNestedValue(merged, key) || 0;
                    setNestedValue(merged, key, currentVal + val.value);
                } else if (val.operation === 'serverTimestamp') {
                    setNestedValue(merged, key, Date.now());
                } else if (val.operation === 'deleteField') {
                    deleteNestedValue(merged, key);
                } else if (val.operation === 'arrayUnion') {
                    let currentArr = getNestedValue(merged, key);
                    if (!Array.isArray(currentArr)) currentArr = [];
                    if (!currentArr.includes(val.value)) currentArr.push(val.value);
                    setNestedValue(merged, key, currentArr);
                } else if (val.operation === 'arrayRemove') {
                    let currentArr = getNestedValue(merged, key);
                    if (Array.isArray(currentArr)) {
                        setNestedValue(merged, key, currentArr.filter(item => item !== val.value));
                    }
                }
            } else {
                setNestedValue(merged, key, val);
            }
        }

        const jsonData = JSON.stringify(merged);
        
        const oldSize = rows.length > 0 ? Buffer.byteLength(typeof rows[0].document_data === 'string' ? rows[0].document_data : JSON.stringify(rows[0].document_data), 'utf8') : 0;
        const newSize = Buffer.byteLength(jsonData, 'utf8');
        const sizeDelta = newSize - oldSize;
        
        const query = `
            INSERT INTO Realtime_Store (cluster_id, path, parent_path, document_data) 
            VALUES (?, ?, ?, ?) 
            ON DUPLICATE KEY UPDATE document_data = VALUES(document_data)
        `;
        await connection.query(query, [clusterId, path, parentPath, jsonData]);

        const projectId = req.project_id || req.sdk_project_id;
        const userId = req.user_id || req.sdk_user_id;
        if (projectId && userId) {
            if (sizeDelta !== 0) {
                await connection.query('UPDATE Cluster_Table SET space_used = space_used + ? WHERE id = ?', [sizeDelta, clusterId]);
            }
            await connection.query('INSERT INTO Project_History (user_id, Project_id, History_Title, History_Description, Status, History_Type, Other_Stamp) VALUES (?,?,?,?,?,?,?)', 
                [userId, projectId, 'Document Update', `Document updated at ${path}`, 'Active', 'documentUpdate', `Delta: ${sizeDelta} bytes`]);
        }

        const io = req.app?.get('io');
        if (io) {
            io.to(`cluster_${clusterId}`).emit('document_update', { path, eventType: 'update' });
            io.to(`cluster_${clusterId}`).emit('collection_update', { collection: parentPath, eventType: 'update', path });
        }
        res.status(200).json({ success: true, message: "Document updated successfully" });
    } catch (e) {
        res.status(500).json({ success: false, message: "Failed to update document" });
    }
};

const findDocuments = async (req, res) => {
    const { clusterId, parentPath, filterObj, whereFilters = [], orderByDef, page = 1, limit = 100 } = req.body;
    try {
        const connection = await makeConnection();
        const [rows] = await connection.query("SELECT id, path, document_data, created_at FROM Realtime_Store WHERE cluster_id = ? AND parent_path = ?", [clusterId, parentPath]);
        
        let filtered = rows.map(r => ({ 
            id: r.id, 
            docId: r.path.split('/').pop(),
            fullPath: r.path, 
            data: typeof r.document_data === 'string' ? JSON.parse(r.document_data) : r.document_data,
            created_at: r.created_at
        }));
        
        
        if (filterObj && Object.keys(filterObj).length > 0) {
            filtered = filtered.filter(doc => {
                for (const key in filterObj) {
                    if (getNestedValue(doc.data, key) !== filterObj[key]) return false;
                }
                return true;
            });
        }

        
        if (whereFilters.length > 0) {
            filtered = filtered.filter(doc => {
                for (const filter of whereFilters) {
                    const { field, operator, value } = filter;
                    const docVal = getNestedValue(doc.data, field);
                    let match = false;
                    switch (operator) {
                        case '==': match = docVal === value; break;
                        case '!=': match = docVal !== value; break;
                        case '>': match = docVal > value; break;
                        case '>=': match = docVal >= value; break;
                        case '<': match = docVal < value; break;
                        case '<=': match = docVal <= value; break;
                        case 'in': match = Array.isArray(value) && value.includes(docVal); break;
                    }
                    if (!match) return false;
                }
                return true;
            });
        }

        
        if (orderByDef && orderByDef.field) {
            filtered.sort((a, b) => {
                const valA = getNestedValue(a.data, orderByDef.field);
                const valB = getNestedValue(b.data, orderByDef.field);
                if (valA === valB) return 0;
                const result = valA > valB ? 1 : -1;
                return orderByDef.direction === 'desc' ? -result : result;
            });
        }
        
        const count = filtered.length;
        const paginated = filtered.slice((page - 1) * limit, page * limit);
        
        res.status(200).json({ success: true, documents: paginated, total: count });
    } catch (e) {
        console.error("findDocuments Error:", e);
        res.status(500).json({ success: false, message: "Error finding documents" });
    }
};

const countDocuments = async (req, res) => {
    const { clusterId, parentPath, filterObj, whereFilters = [] } = req.body;
    try {
        const connection = await makeConnection();
        const [rows] = await connection.query("SELECT document_data FROM Realtime_Store WHERE cluster_id = ? AND parent_path = ?", [clusterId, parentPath]);
        
        let count = 0;
        rows.forEach(r => {
            let data = typeof r.document_data === 'string' ? JSON.parse(r.document_data) : r.document_data;
            let match = true;
            
            if (filterObj && Object.keys(filterObj).length > 0) {
                for (const key in filterObj) {
                    if (getNestedValue(data, key) !== filterObj[key]) {
                        match = false;
                        break;
                    }
                }
            } if (match && whereFilters.length > 0) {
                for (const filter of whereFilters) {
                    const { field, operator, value } = filter;
                    const docVal = getNestedValue(data, field);
                    let opMatch = false;
                    switch (operator) {
                        case '==': opMatch = docVal === value; break;
                        case '!=': opMatch = docVal !== value; break;
                        case '>': opMatch = docVal > value; break;
                        case '>=': opMatch = docVal >= value; break;
                        case '<': opMatch = docVal < value; break;
                        case '<=': opMatch = docVal <= value; break;
                        case 'in': opMatch = Array.isArray(value) && value.includes(docVal); break;
                    }
                    if (!opMatch) { match = false; break; }
                }
            }
            
            if (match) count++;
        });
        
        res.status(200).json({ success: true, count });
    } catch (e) {
        res.status(500).json({ success: false, message: "Error counting documents" });
    }
};

const bulkSaveDocuments = async (req, res) => {
    const { clusterId, parentPath, documentsArray } = req.body;
    if (!documentsArray || !Array.isArray(documentsArray)) return res.status(400).json({ success: false, message: "Invalid array" });
    
    try {
        const connection = await makeConnection();
        
        
        const paths = documentsArray.map(doc => doc.path);
        const placeholders = paths.map(() => '?').join(',');
        let oldSize = 0;
        if (paths.length > 0) {
            const [existing] = await connection.query(`SELECT document_data FROM Realtime_Store WHERE cluster_id = ? AND path IN (${placeholders})`, [clusterId, ...paths]);
            existing.forEach(row => { oldSize += Buffer.byteLength(typeof row.document_data === 'string' ? row.document_data : JSON.stringify(row.document_data), 'utf8'); });
        }
        
        let newSize = 0;
        
        for (let doc of documentsArray) {
            const path = doc.path;
            const data = JSON.stringify(doc.data);
            newSize += Buffer.byteLength(data, 'utf8');
            const query = `
                INSERT INTO Realtime_Store (cluster_id, path, parent_path, document_data) 
                VALUES (?, ?, ?, ?) 
                ON DUPLICATE KEY UPDATE document_data = VALUES(document_data)
            `;
            await connection.query(query, [clusterId, path, parentPath, data]);
        }
        
        const sizeDelta = newSize - oldSize;
        const projectId = req.project_id || req.sdk_project_id;
        const userId = req.user_id || req.sdk_user_id;
        if (projectId && userId) {
            if (sizeDelta !== 0) await connection.query('UPDATE Cluster_Table SET space_used = space_used + ? WHERE id = ?', [sizeDelta, clusterId]);
            await connection.query('INSERT INTO Project_History (user_id, Project_id, History_Title, History_Description, Status, History_Type, Other_Stamp) VALUES (?,?,?,?,?,?,?)', 
                [userId, projectId, 'Bulk Document Save', `Bulk inserted ${documentsArray.length} documents to ${parentPath}`, 'Active', 'documentWrite', `Delta: ${sizeDelta} bytes`]);
        }

        const io = req.app?.get('io');
        if (io) {
            io.to(`cluster_${clusterId}`).emit('collection_update', { collection: parentPath, eventType: 'bulk_set' });
        }

        res.status(200).json({ success: true, message: "Bulk save completed" });
    } catch (e) {
        res.status(500).json({ success: false, message: "Error in bulk save" });
    }
};

const batchWrite = async (req, res) => {
    const { clusterId, operations } = req.body;
    if (!operations || !Array.isArray(operations)) return res.status(400).json({ success: false, message: "Invalid operations array" });

    try {
        const connection = await makeConnection();
        await connection.beginTransaction();

        const io = req.app?.get('io');
        const emittedCollections = new Set();
        let sizeDelta = 0;

        try {
            for (const op of operations) {
                const { type, path, data } = op;
                const segments = path.split('/');
                const parentPath = segments.slice(0, -1).join('/');
                emittedCollections.add(parentPath);

                if (type === 'save') {
                    const jsonData = JSON.stringify(data);
                    
                    const [existing] = await connection.query("SELECT document_data FROM Realtime_Store WHERE cluster_id = ? AND path = ?", [clusterId, path]);
                    if (existing.length > 0) sizeDelta -= Buffer.byteLength(typeof existing[0].document_data === 'string' ? existing[0].document_data : JSON.stringify(existing[0].document_data), 'utf8');
                    sizeDelta += Buffer.byteLength(jsonData, 'utf8');

                    const query = `
                        INSERT INTO Realtime_Store (cluster_id, path, parent_path, document_data) 
                        VALUES (?, ?, ?, ?) 
                        ON DUPLICATE KEY UPDATE document_data = VALUES(document_data)
                    `;
                    await connection.query(query, [clusterId, path, parentPath, jsonData]);
                    if (io) io.to(`cluster_${clusterId}`).emit('document_update', { path, eventType: 'update' });
                } else if (type === 'update') {
                    const [rows] = await connection.query("SELECT document_data FROM Realtime_Store WHERE cluster_id = ? AND path = ?", [clusterId, path]);
                    let existing = {};
                    if (rows.length > 0) {
                        sizeDelta -= Buffer.byteLength(typeof rows[0].document_data === 'string' ? rows[0].document_data : JSON.stringify(rows[0].document_data), 'utf8');
                        existing = typeof rows[0].document_data === 'string' ? JSON.parse(rows[0].document_data) : rows[0].document_data;
                    }
                    
                    let merged = { ...existing };
                    for (const key in data) {
                        const val = data[key];
                        if (val && typeof val === 'object' && val.__type === 'FieldValue') {
                            if (val.operation === 'increment') merged[key] = (merged[key] || 0) + val.value;
                            else if (val.operation === 'serverTimestamp') merged[key] = Date.now();
                            else if (val.operation === 'deleteField') delete merged[key];
                            else if (val.operation === 'arrayUnion') {
                                if (!Array.isArray(merged[key])) merged[key] = [];
                                if (!merged[key].includes(val.value)) merged[key].push(val.value);
                            } else if (val.operation === 'arrayRemove') {
                                if (Array.isArray(merged[key])) merged[key] = merged[key].filter(item => item !== val.value);
                            }
                        } else {
                            merged[key] = val;
                        }
                    }
                    const jsonData = JSON.stringify(merged);
                    sizeDelta += Buffer.byteLength(jsonData, 'utf8');
                    
                    const query = `
                        INSERT INTO Realtime_Store (cluster_id, path, parent_path, document_data) 
                        VALUES (?, ?, ?, ?) 
                        ON DUPLICATE KEY UPDATE document_data = VALUES(document_data)
                    `;
                    await connection.query(query, [clusterId, path, parentPath, jsonData]);
                    if (io) io.to(`cluster_${clusterId}`).emit('document_update', { path, eventType: 'update' });
                } else if (type === 'delete') {
                    const [docs] = await connection.query("SELECT document_data FROM Realtime_Store WHERE cluster_id = ? AND (path = ? OR path LIKE ?)", [clusterId, path, `${path}/%`]);
                    docs.forEach(doc => { sizeDelta -= Buffer.byteLength(typeof doc.document_data === 'string' ? doc.document_data : JSON.stringify(doc.document_data), 'utf8'); });
                    
                    const query = "DELETE FROM Realtime_Store WHERE cluster_id = ? AND (path = ? OR path LIKE ?)";
                    await connection.query(query, [clusterId, path, `${path}/%`]);
                    if (io) io.to(`cluster_${clusterId}`).emit('document_update', { path, eventType: 'delete' });
                }
            }
            
            const projectId = req.project_id || req.sdk_project_id;
            const userId = req.user_id || req.sdk_user_id;
            if (projectId && userId) {
                if (sizeDelta !== 0) await connection.query('UPDATE Cluster_Table SET space_used = space_used + ? WHERE id = ?', [sizeDelta, clusterId]);
                await connection.query('INSERT INTO Project_History (user_id, Project_id, History_Title, History_Description, Status, History_Type, Other_Stamp) VALUES (?,?,?,?,?,?,?)', 
                    [userId, projectId, 'Batch Transaction', `Executed batch operation of ${operations.length} commands`, 'Active', 'documentWrite', `Delta: ${sizeDelta} bytes`]);
            }
            
            await connection.commit();

            if (io) {
                for (const col of emittedCollections) {
                    io.to(`cluster_${clusterId}`).emit('collection_update', { collection: col, eventType: 'batch_update' });
                }
            }

            res.status(200).json({ success: true, message: "Batch write successful" });
        } catch (innerError) {
            await connection.rollback();
            throw innerError;
        }
    } catch (e) {
        console.error("batchWrite Error:", e);
        res.status(500).json({ success: false, message: "Batch transaction failed" });
    }
};

const executeOnDisconnectMutation = async (actionObj, io) => {
    const { clusterId, path, action, data } = actionObj;
    try {
        const connection = await makeConnection();
        const segments = path.split('/');
        const parentPath = segments.slice(0, -1).join('/');

        if (action === 'set' || action === 'setWithPriority') {
            const jsonData = typeof data === 'string' ? data : JSON.stringify(data);
            const query = `
                INSERT INTO Realtime_Store (cluster_id, path, parent_path, document_data) 
                VALUES (?, ?, ?, ?) 
                ON DUPLICATE KEY UPDATE document_data = VALUES(document_data)
            `;
            await connection.query(query, [clusterId, path, parentPath, jsonData]);
            io.to(`cluster_${clusterId}`).emit('document_update', { path, eventType: 'set' });
            io.to(`cluster_${clusterId}`).emit('collection_update', { collection: parentPath, eventType: 'set', path });
        } else if (action === 'update') {
            const [rows] = await connection.query("SELECT document_data FROM Realtime_Store WHERE cluster_id = ? AND path = ?", [clusterId, path]);
            let existing = rows.length > 0 ? (typeof rows[0].document_data === 'string' ? JSON.parse(rows[0].document_data) : rows[0].document_data) : {};
            let merged = { ...existing };
            for (const key in data) {
                merged[key] = data[key];
            }
            const jsonData = JSON.stringify(merged);
            const query = `
                INSERT INTO Realtime_Store (cluster_id, path, parent_path, document_data) 
                VALUES (?, ?, ?, ?) 
                ON DUPLICATE KEY UPDATE document_data = VALUES(document_data)
            `;
            await connection.query(query, [clusterId, path, parentPath, jsonData]);
            io.to(`cluster_${clusterId}`).emit('document_update', { path, eventType: 'update' });
            io.to(`cluster_${clusterId}`).emit('collection_update', { collection: parentPath, eventType: 'update', path });
        } else if (action === 'remove') {
            const query = "DELETE FROM Realtime_Store WHERE cluster_id = ? AND (path = ? OR path LIKE ?)";
            await connection.query(query, [clusterId, path, `${path}/%`]);
            io.to(`cluster_${clusterId}`).emit('document_update', { path, eventType: 'delete' });
            io.to(`cluster_${clusterId}`).emit('collection_update', { collection: parentPath, eventType: 'delete', path });
        }
    } catch (e) {
        console.error("onDisconnect mutation failed:", e);
    }
};

module.exports = {
    getCollections,
    getDocuments,
    getDocumentData,
    setDocumentData,
    deleteDocument,
    updateDocument,
    findDocuments,
    countDocuments,
    bulkSaveDocuments,
    batchWrite,
    executeOnDisconnectMutation
};
