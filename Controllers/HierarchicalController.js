const mysql = require('mysql2/promise');
const crypto = require('crypto');
const dbConfig = { host: 'localhost', user: 'root', password: '', database: 'TilBase' };

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

async function getProjectDetails(connection, clusterId) {
    const [rows] = await connection.execute('SELECT project_id, user_id FROM Cluster_Table WHERE id = ?', [clusterId]);
    return rows.length > 0 ? { projectId: rows[0].project_id, userId: rows[0].user_id } : { projectId: null, userId: null };
}

async function logMetric(connection, projectId, clusterId, queryType, executionTimeMs, io) {
    if (!projectId) return;
    await connection.execute('INSERT INTO Query_Metrics (project_id, cluster_id, query_type, execution_time_ms) VALUES (?, ?, ?, ?)', [projectId, clusterId, queryType, executionTimeMs]);
    if (io) {
        const payload = { clusterId, queryType, executionTimeMs, timestamp: new Date().toISOString() };
        io.to(`cluster_${clusterId}`).emit('metricUpdate', payload);
        io.to(`cluster_${projectId}`).emit('metricUpdate', payload);
    }
}

async function addNode(req, res) {
    const { clusterId, parentId, dataPayload } = req.body;
    const start = performance.now();
    try {
        const connection = await mysql.createConnection(dbConfig);
        const { projectId, userId } = await getProjectDetails(connection, clusterId);
        
        const id = crypto.randomUUID();
        const payloadStr = JSON.stringify(dataPayload || {});
        const byteSize = Buffer.byteLength(payloadStr, 'utf8');
        
        const query = 'INSERT INTO Hierarchical_Data (id, cluster_id, parent_id, data_payload, byte_size) VALUES (?, ?, ?, ?, ?)';
        await connection.execute(query, [id, clusterId, parentId || null, payloadStr, byteSize]);
        
        if (byteSize > 0) {
            await connection.execute('UPDATE Cluster_Table SET space_used = space_used + ? WHERE id = ?', [byteSize, clusterId]);
        }
        
        if (projectId && userId) {
            await connection.execute('INSERT INTO Project_History (user_id, Project_id, History_Title, History_Description, Status, History_Type, Other_Stamp) VALUES (?,?,?,?,?,?,?)', 
                [userId, projectId, 'Hierarchical Write', `Node ${id} created`, 'Active', 'documentWrite', `Delta: ${byteSize} bytes`]);
        }
        
        const end = performance.now();
        const io = req.app.get('io');
        await logMetric(connection, projectId, clusterId, 'Write', end - start, io);
        
        if (io) {
            io.to(`cluster_${clusterId}`).emit('hierarchical_update', { type: 'add', id, parentId });
        }
        
        await connection.end();
        res.json({ success: true, id });
    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
}

async function getChildren(req, res) {
    const { clusterId, parentId, queryOptions = {} } = req.body;
    const start = performance.now();
    try {
        const connection = await mysql.createConnection(dbConfig);
        const { projectId } = await getProjectDetails(connection, clusterId);
        
        const { orderBy, orderDirection = 'ASC', limit } = queryOptions;
        
        let query = 'SELECT id, parent_id, data_payload, created_at, updated_at FROM Hierarchical_Data WHERE cluster_id = ?';
        const params = [clusterId];
        
        if (parentId) {
            query += ' AND parent_id = ?';
            params.push(parentId);
        } else {
            query += ' AND parent_id IS NULL';
        }
        
        if (orderBy) {
            // Using JSON_EXTRACT for ordering
            query += ` ORDER BY JSON_UNQUOTE(JSON_EXTRACT(data_payload, '$.${orderBy}')) ${orderDirection === 'DESC' ? 'DESC' : 'ASC'}`;
        }
        
        if (limit && !isNaN(limit)) {
            query += ' LIMIT ?';
            params.push(Number(limit));
        }
        
        const [rows] = await connection.execute(query, params);
        
        const end = performance.now();
        const io = req.app.get('io');
        await logMetric(connection, projectId, clusterId, 'Read', end - start, io);
        
        await connection.end();
        res.json({ success: true, nodes: rows });
    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
}

async function getAncestors(req, res) {
    const { clusterId, nodeId } = req.body;
    const start = performance.now();
    try {
        const connection = await mysql.createConnection(dbConfig);
        const { projectId } = await getProjectDetails(connection, clusterId);
        
        const query = `
            WITH RECURSIVE Ancestors AS (
                SELECT id, parent_id, data_payload, created_at, updated_at, 1 AS depth
                FROM Hierarchical_Data
                WHERE id = ? AND cluster_id = ?
                
                UNION ALL
                
                SELECT h.id, h.parent_id, h.data_payload, h.created_at, h.updated_at, a.depth + 1
                FROM Hierarchical_Data h
                JOIN Ancestors a ON h.id = a.parent_id
                WHERE h.cluster_id = ?
            )
            SELECT * FROM Ancestors ORDER BY depth DESC;
        `;
        const [rows] = await connection.execute(query, [nodeId, clusterId, clusterId]);
        
        const end = performance.now();
        const io = req.app.get('io');
        await logMetric(connection, projectId, clusterId, 'Read', end - start, io);
        
        await connection.end();
        res.json({ success: true, ancestors: rows });
    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
}

async function countChildren(req, res) {
    const { clusterId, parentId } = req.body;
    const start = performance.now();
    try {
        const connection = await mysql.createConnection(dbConfig);
        const { projectId } = await getProjectDetails(connection, clusterId);
        
        let query = 'SELECT COUNT(id) as count FROM Hierarchical_Data WHERE cluster_id = ?';
        const params = [clusterId];
        
        if (parentId) {
            query += ' AND parent_id = ?';
            params.push(parentId);
        } else {
            query += ' AND parent_id IS NULL';
        }
        
        const [rows] = await connection.execute(query, params);
        const count = rows[0].count;
        
        const end = performance.now();
        const io = req.app.get('io');
        await logMetric(connection, projectId, clusterId, 'Read', end - start, io);
        
        await connection.end();
        res.json({ success: true, count });
    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
}

async function updateNode(req, res) {
    const { clusterId, nodeId, dataPayload, merge = false } = req.body;
    const start = performance.now();
    try {
        const connection = await mysql.createConnection(dbConfig);
        const { projectId, userId } = await getProjectDetails(connection, clusterId);
        
        const [oldRows] = await connection.execute('SELECT data_payload, byte_size FROM Hierarchical_Data WHERE id = ? AND cluster_id = ?', [nodeId, clusterId]);
        if (oldRows.length === 0) {
            await connection.end();
            return res.status(404).json({ success: false, message: 'Node not found' });
        }
        
        const oldByteSize = oldRows[0].byte_size;
        
        let finalPayloadStr;
        if (merge) {
            let oldPayload = oldRows[0].data_payload || {};
            if (typeof oldPayload === 'string') {
                try {
                    oldPayload = JSON.parse(oldPayload);
                } catch(e) {
                    oldPayload = {};
                }
            }

            const updates = dataPayload || {};
            
            for (const key in updates) {
                const val = updates[key];
                
                if (val && typeof val === 'object' && val.__type === 'FieldValue') {
                    let currentVal = getNestedValue(oldPayload, key);
                    switch (val.operation) {
                        case 'increment':
                            if (typeof currentVal !== 'number') currentVal = 0;
                            setNestedValue(oldPayload, key, currentVal + (val.value || 1));
                            break;
                        case 'serverTimestamp':
                            setNestedValue(oldPayload, key, new Date().toISOString());
                            break;
                        case 'deleteField':
                            deleteNestedValue(oldPayload, key);
                            break;
                        case 'arrayUnion':
                            if (!Array.isArray(currentVal)) currentVal = [];
                            if (!currentVal.includes(val.value)) {
                                currentVal.push(val.value);
                            }
                            setNestedValue(oldPayload, key, currentVal);
                            break;
                        case 'arrayRemove':
                            if (Array.isArray(currentVal)) {
                                setNestedValue(oldPayload, key, currentVal.filter(item => item !== val.value));
                            }
                            break;
                    }
                } else {
                    setNestedValue(oldPayload, key, val);
                }
            }
            finalPayloadStr = JSON.stringify(oldPayload);
        } else {
            finalPayloadStr = JSON.stringify(dataPayload || {});
        }
        
        const newByteSize = Buffer.byteLength(finalPayloadStr, 'utf8');
        const delta = newByteSize - oldByteSize;
        
        await connection.execute('UPDATE Hierarchical_Data SET data_payload = ?, byte_size = ? WHERE id = ? AND cluster_id = ?', [finalPayloadStr, newByteSize, nodeId, clusterId]);
        
        if (delta !== 0) {
            await connection.execute('UPDATE Cluster_Table SET space_used = GREATEST(0, space_used + ?) WHERE id = ?', [delta, clusterId]);
        }
        
        if (projectId && userId) {
            await connection.execute('INSERT INTO Project_History (user_id, Project_id, History_Title, History_Description, Status, History_Type, Other_Stamp) VALUES (?,?,?,?,?,?,?)', 
                [userId, projectId, 'Hierarchical Update', `Node ${nodeId} updated`, 'Active', 'documentWrite', `Delta: ${delta} bytes`]);
        }
        
        const end = performance.now();
        const io = req.app.get('io');
        await logMetric(connection, projectId, clusterId, 'Write', end - start, io);
        
        if (io) {
            io.to(`cluster_${clusterId}`).emit('hierarchical_update', { type: 'update', id: nodeId });
        }
        
        await connection.end();
        res.json({ success: true });
    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
}

async function deleteNode(req, res) {
    const { clusterId, nodeId } = req.body;
    const start = performance.now();
    try {
        const connection = await mysql.createConnection(dbConfig);
        const { projectId, userId } = await getProjectDetails(connection, clusterId);
        
        const getDescendantsQuery = `
            WITH RECURSIVE Descendants AS (
                SELECT id, byte_size
                FROM Hierarchical_Data
                WHERE id = ? AND cluster_id = ?
                
                UNION ALL
                
                SELECT h.id, h.byte_size
                FROM Hierarchical_Data h
                JOIN Descendants d ON h.parent_id = d.id
                WHERE h.cluster_id = ?
            )
            SELECT id, byte_size FROM Descendants;
        `;
        const [rows] = await connection.execute(getDescendantsQuery, [nodeId, clusterId, clusterId]);
        
        if (rows.length === 0) {
            await connection.end();
            return res.status(404).json({ success: false, message: 'Node not found' });
        }
        
        const totalSizeToFree = rows.reduce((sum, row) => sum + row.byte_size, 0);
        const idsToDelete = rows.map(r => r.id);
        
        const placeholders = idsToDelete.map(() => '?').join(',');
        await connection.execute(`DELETE FROM Hierarchical_Data WHERE id IN (${placeholders})`, idsToDelete);
        
        await connection.execute('UPDATE Cluster_Table SET space_used = GREATEST(0, space_used - ?) WHERE id = ?', [totalSizeToFree, clusterId]);
        
        if (projectId && userId) {
            const logCommand = 'INSERT INTO Project_History (user_id, Project_id, History_Title, History_Description, Status, History_Type, Other_Stamp) VALUES (?,?,?,?,?,?,?)';
            await connection.execute(logCommand, [
                userId, 
                projectId, 
                'Hierarchical Branch Deleted', 
                `Deleted a branch of ${rows.length} nodes from cluster`, 
                'Active', 
                'projectUpdate', 
                `Root ID: ${nodeId}`
            ]);
        }
        
        const end = performance.now();
        const io = req.app.get('io');
        await logMetric(connection, projectId, clusterId, 'Write', end - start, io);
        
        if (io) {
            io.to(`cluster_${clusterId}`).emit('hierarchical_update', { type: 'delete', id: nodeId, deletedCount: rows.length });
        }
        
        await connection.end();
        res.json({ success: true, deletedCount: rows.length });
    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
}

async function moveNode(req, res) {
    const { clusterId, nodeId, newParentId } = req.body;
    const start = performance.now();
    try {
        const connection = await mysql.createConnection(dbConfig);
        const projectId = await getProjectId(connection, clusterId);
        
        await connection.execute('UPDATE Hierarchical_Data SET parent_id = ? WHERE id = ? AND cluster_id = ?', [newParentId || null, nodeId, clusterId]);
        
        if (projectId && userId) {
            await connection.execute('INSERT INTO Project_History (user_id, Project_id, History_Title, History_Description, Status, History_Type, Other_Stamp) VALUES (?,?,?,?,?,?,?)', 
                [userId, projectId, 'Hierarchical Move', `Node ${nodeId} moved to parent ${newParentId || 'root'}`, 'Active', 'documentWrite', `Moved node`]);
        }
        
        const end = performance.now();
        const io = req.app.get('io');
        await logMetric(connection, projectId, clusterId, 'Write', end - start, io);
        
        if (io) {
            io.to(`cluster_${clusterId}`).emit('hierarchical_update', { type: 'move', id: nodeId, parentId: newParentId });
        }
        
        await connection.end();
        res.json({ success: true });
    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
}

async function searchNodes(req, res) {
    const { clusterId, query } = req.body;
    const start = performance.now();
    try {
        const connection = await mysql.createConnection(dbConfig);
        const projectId = await getProjectId(connection, clusterId);
        
        const searchTerm = `%${query}%`;
        const sqlQuery = `
            SELECT id, parent_id, data_payload, created_at, updated_at 
            FROM Hierarchical_Data 
            WHERE cluster_id = ? 
            AND (id LIKE ? OR data_payload LIKE ?) 
            LIMIT 50
        `;
        const [rows] = await connection.execute(sqlQuery, [clusterId, searchTerm, searchTerm]);
        
        const end = performance.now();
        const io = req.app.get('io');
        await logMetric(connection, projectId, clusterId, 'Read', end - start, io);
        
        await connection.end();
        res.json({ success: true, nodes: rows });
    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
}


async function batchWrite(req, res) {
    const { clusterId, operations } = req.body;
    if (!operations || !Array.isArray(operations)) return res.status(400).json({ success: false, message: "Invalid operations array" });

    const start = performance.now();
    try {
        const connection = await mysql.createConnection(dbConfig);
        const { projectId, userId } = await getProjectDetails(connection, clusterId);
        
        await connection.beginTransaction();
        
        let sizeDelta = 0;
        const io = req.app.get('io');
        
        try {
            for (const op of operations) {
                const { type, nodeId, parentId, data, merge = false } = op;
                
                if (type === 'add') {
                    const id = crypto.randomUUID();
                    const payloadStr = JSON.stringify(data || {});
                    const byteSize = Buffer.byteLength(payloadStr, 'utf8');
                    sizeDelta += byteSize;
                    
                    await connection.execute('INSERT INTO Hierarchical_Data (id, cluster_id, parent_id, data_payload, byte_size) VALUES (?, ?, ?, ?, ?)', 
                        [id, clusterId, parentId || null, payloadStr, byteSize]);
                        
                    if (io) io.to(`cluster_${clusterId}`).emit('hierarchical_update', { type: 'add', id, parentId });
                } 
                else if (type === 'update') {
                    const [oldRows] = await connection.execute('SELECT data_payload, byte_size FROM Hierarchical_Data WHERE id = ? AND cluster_id = ? FOR UPDATE', [nodeId, clusterId]);
                    if (oldRows.length > 0) {
                        const oldByteSize = oldRows[0].byte_size;
                        let finalPayloadStr;
                        if (merge) {
                            let oldPayload = oldRows[0].data_payload || {};
                            if (typeof oldPayload === 'string') {
                                try { oldPayload = JSON.parse(oldPayload); } catch(e) { oldPayload = {}; }
                            }
                            const updates = data || {};
                            for (const key in updates) {
                                const val = updates[key];
                                if (val && typeof val === 'object' && val.__type === 'FieldValue') {
                                    let currentVal = getNestedValue(oldPayload, key);
                                    switch (val.operation) {
                                        case 'increment':
                                            if (typeof currentVal !== 'number') currentVal = 0;
                                            setNestedValue(oldPayload, key, currentVal + (val.value || 1));
                                            break;
                                        case 'serverTimestamp':
                                            setNestedValue(oldPayload, key, new Date().toISOString());
                                            break;
                                        case 'deleteField':
                                            deleteNestedValue(oldPayload, key);
                                            break;
                                        case 'arrayUnion':
                                            if (!Array.isArray(currentVal)) currentVal = [];
                                            if (!currentVal.includes(val.value)) currentVal.push(val.value);
                                            setNestedValue(oldPayload, key, currentVal);
                                            break;
                                        case 'arrayRemove':
                                            if (Array.isArray(currentVal)) {
                                                setNestedValue(oldPayload, key, currentVal.filter(item => item !== val.value));
                                            }
                                            break;
                                    }
                                } else {
                                    setNestedValue(oldPayload, key, val);
                                }
                            }
                            finalPayloadStr = JSON.stringify(oldPayload);
                        } else {
                            finalPayloadStr = JSON.stringify(data || {});
                        }
                        const newByteSize = Buffer.byteLength(finalPayloadStr, 'utf8');
                        sizeDelta += (newByteSize - oldByteSize);
                        
                        await connection.execute('UPDATE Hierarchical_Data SET data_payload = ?, byte_size = ? WHERE id = ? AND cluster_id = ?', 
                            [finalPayloadStr, newByteSize, nodeId, clusterId]);
                            
                        if (io) io.to(`cluster_${clusterId}`).emit('hierarchical_update', { type: 'update', id: nodeId });
                    }
                }
                else if (type === 'delete') {
                    const getDescendantsQuery = `
                        WITH RECURSIVE Descendants AS (
                            SELECT id, byte_size FROM Hierarchical_Data WHERE id = ? AND cluster_id = ?
                            UNION ALL
                            SELECT h.id, h.byte_size FROM Hierarchical_Data h JOIN Descendants d ON h.parent_id = d.id WHERE h.cluster_id = ?
                        )
                        SELECT id, byte_size FROM Descendants;
                    `;
                    const [rows] = await connection.execute(getDescendantsQuery, [nodeId, clusterId, clusterId]);
                    if (rows.length > 0) {
                        const totalSizeToFree = rows.reduce((sum, row) => sum + row.byte_size, 0);
                        sizeDelta -= totalSizeToFree;
                        const idsToDelete = rows.map(r => r.id);
                        const placeholders = idsToDelete.map(() => '?').join(',');
                        await connection.execute(`DELETE FROM Hierarchical_Data WHERE id IN (${placeholders})`, idsToDelete);
                        
                        if (io) io.to(`cluster_${clusterId}`).emit('hierarchical_update', { type: 'delete', id: nodeId, deletedCount: rows.length });
                    }
                }
            }
            
            if (projectId && userId) {
                if (sizeDelta !== 0) {
                    await connection.execute('UPDATE Cluster_Table SET space_used = GREATEST(0, space_used + ?) WHERE id = ?', [sizeDelta, clusterId]);
                }
                await connection.execute('INSERT INTO Project_History (user_id, Project_id, History_Title, History_Description, Status, History_Type, Other_Stamp) VALUES (?,?,?,?,?,?,?)', 
                    [userId, projectId, 'Hierarchical Batch Transaction', `Executed batch operation of ${operations.length} commands`, 'Active', 'documentWrite', `Delta: ${sizeDelta} bytes`]);
            }
            
            await connection.commit();
            
            const end = performance.now();
            await logMetric(connection, projectId, clusterId, 'Write', end - start, io);
            await connection.end();
            
            res.json({ success: true, message: "Batch write successful" });
        } catch (innerErr) {
            await connection.rollback();
            throw innerErr;
        }
    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, message: 'Batch transaction failed' });
    }
}

async function bulkUpdate(req, res) {
    const { clusterId, parentId, updateData, queryOptions = {} } = req.body;
    const start = performance.now();
    try {
        const connection = await mysql.createConnection(dbConfig);
        const { projectId, userId } = await getProjectDetails(connection, clusterId);
        
        let query = 'SELECT id, data_payload, byte_size FROM Hierarchical_Data WHERE cluster_id = ?';
        const params = [clusterId];
        
        if (parentId) { query += ' AND parent_id = ?'; params.push(parentId); } 
        else { query += ' AND parent_id IS NULL'; }
        
        const [rows] = await connection.execute(query, params);
        if (rows.length === 0) {
            await connection.end();
            return res.json({ success: true, count: 0 });
        }

        let sizeDelta = 0;
        let updateCount = 0;
        const io = req.app.get('io');
        
        await connection.beginTransaction();
        
        try {
            for (const row of rows) {
                let payload = typeof row.data_payload === 'string' ? JSON.parse(row.data_payload) : (row.data_payload || {});
                let match = true;
                
                // Filtering based on queryOptions (similar to DocumentDB where clauses)
                if (queryOptions.where && Array.isArray(queryOptions.where)) {
                    for (const filter of queryOptions.where) {
                        const { field, operator, value } = filter;
                        const docVal = getNestedValue(payload, field);
                        let opMatch = false;
                        switch (operator) {
                            case '==': opMatch = docVal === value; break;
                            case '!=': opMatch = docVal !== value; break;
                            case '>': opMatch = docVal > value; break;
                            case '>=': opMatch = docVal >= value; break;
                            case '<': opMatch = docVal < value; break;
                            case '<=': opMatch = docVal <= value; break;
                        }
                        if (!opMatch) { match = false; break; }
                    }
                }

                if (match) {
                    const oldByteSize = row.byte_size;
                    const updates = updateData || {};
                    for (const key in updates) {
                        const val = updates[key];
                        if (val && typeof val === 'object' && val.__type === 'FieldValue') {
                            let currentVal = getNestedValue(payload, key);
                            switch (val.operation) {
                                case 'increment':
                                    if (typeof currentVal !== 'number') currentVal = 0;
                                    setNestedValue(payload, key, currentVal + (val.value || 1));
                                    break;
                                case 'serverTimestamp':
                                    setNestedValue(payload, key, new Date().toISOString());
                                    break;
                                case 'deleteField':
                                    deleteNestedValue(payload, key);
                                    break;
                            }
                        } else {
                            setNestedValue(payload, key, val);
                        }
                    }
                    
                    const finalPayloadStr = JSON.stringify(payload);
                    const newByteSize = Buffer.byteLength(finalPayloadStr, 'utf8');
                    sizeDelta += (newByteSize - oldByteSize);
                    
                    await connection.execute('UPDATE Hierarchical_Data SET data_payload = ?, byte_size = ? WHERE id = ? AND cluster_id = ?', 
                        [finalPayloadStr, newByteSize, row.id, clusterId]);
                        
                    if (io) io.to(`cluster_${clusterId}`).emit('hierarchical_update', { type: 'update', id: row.id });
                    updateCount++;
                }
            }
            
            if (projectId && userId && updateCount > 0) {
                if (sizeDelta !== 0) {
                    await connection.execute('UPDATE Cluster_Table SET space_used = GREATEST(0, space_used + ?) WHERE id = ?', [sizeDelta, clusterId]);
                }
                await connection.execute('INSERT INTO Project_History (user_id, Project_id, History_Title, History_Description, Status, History_Type, Other_Stamp) VALUES (?,?,?,?,?,?,?)', 
                    [userId, projectId, 'Hierarchical Bulk Update', `Updated ${updateCount} nodes`, 'Active', 'documentWrite', `Delta: ${sizeDelta} bytes`]);
            }
            
            await connection.commit();
            
            const end = performance.now();
            await logMetric(connection, projectId, clusterId, 'Write', end - start, io);
            await connection.end();
            
            res.json({ success: true, count: updateCount });
        } catch (innerErr) {
            await connection.rollback();
            throw innerErr;
        }
    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, message: 'Bulk update failed' });
    }
}

async function bulkDelete(req, res) {
    const { clusterId, parentId, queryOptions = {} } = req.body;
    const start = performance.now();
    try {
        const connection = await mysql.createConnection(dbConfig);
        const { projectId, userId } = await getProjectDetails(connection, clusterId);
        
        let query = 'SELECT id, data_payload FROM Hierarchical_Data WHERE cluster_id = ?';
        const params = [clusterId];
        
        if (parentId) { query += ' AND parent_id = ?'; params.push(parentId); } 
        else { query += ' AND parent_id IS NULL'; }
        
        const [rows] = await connection.execute(query, params);
        if (rows.length === 0) {
            await connection.end();
            return res.json({ success: true, count: 0 });
        }

        let idsToDeleteTopLevel = [];
        for (const row of rows) {
            let payload = typeof row.data_payload === 'string' ? JSON.parse(row.data_payload) : (row.data_payload || {});
            let match = true;
            
            if (queryOptions.where && Array.isArray(queryOptions.where)) {
                for (const filter of queryOptions.where) {
                    const { field, operator, value } = filter;
                    const docVal = getNestedValue(payload, field);
                    let opMatch = false;
                    switch (operator) {
                        case '==': opMatch = docVal === value; break;
                        case '!=': opMatch = docVal !== value; break;
                        case '>': opMatch = docVal > value; break;
                        case '>=': opMatch = docVal >= value; break;
                        case '<': opMatch = docVal < value; break;
                        case '<=': opMatch = docVal <= value; break;
                    }
                    if (!opMatch) { match = false; break; }
                }
            }
            if (match) idsToDeleteTopLevel.push(row.id);
        }
        
        if (idsToDeleteTopLevel.length === 0) {
            await connection.end();
            return res.json({ success: true, count: 0 });
        }

        let sizeDelta = 0;
        let deleteCount = 0;
        const io = req.app.get('io');
        
        await connection.beginTransaction();
        
        try {
            for (const nodeId of idsToDeleteTopLevel) {
                const getDescendantsQuery = `
                    WITH RECURSIVE Descendants AS (
                        SELECT id, byte_size FROM Hierarchical_Data WHERE id = ? AND cluster_id = ?
                        UNION ALL
                        SELECT h.id, h.byte_size FROM Hierarchical_Data h JOIN Descendants d ON h.parent_id = d.id WHERE h.cluster_id = ?
                    )
                    SELECT id, byte_size FROM Descendants;
                `;
                const [dRows] = await connection.execute(getDescendantsQuery, [nodeId, clusterId, clusterId]);
                if (dRows.length > 0) {
                    const totalSizeToFree = dRows.reduce((sum, r) => sum + r.byte_size, 0);
                    sizeDelta -= totalSizeToFree;
                    const idsToDel = dRows.map(r => r.id);
                    const placeholders = idsToDel.map(() => '?').join(',');
                    await connection.execute(`DELETE FROM Hierarchical_Data WHERE id IN (${placeholders})`, idsToDel);
                    
                    if (io) io.to(`cluster_${clusterId}`).emit('hierarchical_update', { type: 'delete', id: nodeId, deletedCount: dRows.length });
                    deleteCount++;
                }
            }
            
            if (projectId && userId && deleteCount > 0) {
                if (sizeDelta !== 0) {
                    await connection.execute('UPDATE Cluster_Table SET space_used = GREATEST(0, space_used + ?) WHERE id = ?', [sizeDelta, clusterId]);
                }
                await connection.execute('INSERT INTO Project_History (user_id, Project_id, History_Title, History_Description, Status, History_Type, Other_Stamp) VALUES (?,?,?,?,?,?,?)', 
                    [userId, projectId, 'Hierarchical Bulk Delete', `Deleted ${deleteCount} root branches`, 'Active', 'documentDelete', `Delta: ${sizeDelta} bytes`]);
            }
            
            await connection.commit();
            
            const end = performance.now();
            await logMetric(connection, projectId, clusterId, 'Write', end - start, io);
            await connection.end();
            
            res.json({ success: true, count: deleteCount });
        } catch (innerErr) {
            await connection.rollback();
            throw innerErr;
        }
    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, message: 'Bulk delete failed' });
    }
}

module.exports = {
    addNode,
    getChildren,
    getAncestors,
    updateNode,
    deleteNode,
    moveNode,
    searchNodes,
    countChildren,
    batchWrite,
    bulkUpdate,
    bulkDelete
};
