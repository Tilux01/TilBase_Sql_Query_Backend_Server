const mysql = require('mysql2/promise');
const crypto = require('crypto');
const dbConfig = { host: 'localhost', user: 'root', password: '', database: 'TilBase' };

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
    const { clusterId, nodeLabel, properties } = req.body;
    const start = performance.now();
    try {
        const connection = await mysql.createConnection(dbConfig);
        const { projectId, userId } = await getProjectDetails(connection, clusterId);
        
        const id = crypto.randomUUID();
        const payloadStr = JSON.stringify(properties || {});
        const byteSize = Buffer.byteLength(payloadStr, 'utf8');
        
        const query = 'INSERT INTO Graph_Nodes (id, cluster_id, node_label, properties, byte_size) VALUES (?, ?, ?, ?, ?)';
        await connection.execute(query, [id, clusterId, nodeLabel, payloadStr, byteSize]);
        
        if (byteSize > 0) {
            await connection.execute('UPDATE Cluster_Table SET space_used = space_used + ? WHERE id = ?', [byteSize, clusterId]);
        }
        
        if (projectId && userId) {
            await connection.execute('INSERT INTO Project_History (user_id, Project_id, History_Title, History_Description, Status, History_Type, Other_Stamp) VALUES (?,?,?,?,?,?,?)', 
                [userId, projectId, 'Graph Write', `Node ${id} created`, 'Active', 'documentWrite', `Delta: ${byteSize} bytes`]);
        }
        
        const end = performance.now();
        const io = req.app.get('io');
        await logMetric(connection, projectId, clusterId, 'Write', end - start, io);
        
        if (io) io.to(`cluster_${clusterId}`).emit('graph_update', { type: 'addNode', id });
        
        await connection.end();
        res.json({ success: true, id });
    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
}

async function updateNode(req, res) {
    const { clusterId, nodeId, properties, merge = true } = req.body;
    const start = performance.now();
    try {
        const connection = await mysql.createConnection(dbConfig);
        const { projectId, userId } = await getProjectDetails(connection, clusterId);
        
        const [oldRows] = await connection.execute('SELECT properties, byte_size FROM Graph_Nodes WHERE id = ? AND cluster_id = ?', [nodeId, clusterId]);
        if (oldRows.length === 0) {
            await connection.end();
            return res.status(404).json({ success: false, message: 'Node not found' });
        }
        
        const oldByteSize = oldRows[0].byte_size;
        let finalPayloadStr;
        if (merge) {
            let oldPayload = oldRows[0].properties || '{}';
            try { oldPayload = JSON.parse(oldPayload); } catch(e) { oldPayload = {}; }
            finalPayloadStr = JSON.stringify({ ...oldPayload, ...(properties || {}) });
        } else {
            finalPayloadStr = JSON.stringify(properties || {});
        }
        
        const newByteSize = Buffer.byteLength(finalPayloadStr, 'utf8');
        const delta = newByteSize - oldByteSize;
        
        await connection.execute('UPDATE Graph_Nodes SET properties = ?, byte_size = ? WHERE id = ? AND cluster_id = ?', [finalPayloadStr, newByteSize, nodeId, clusterId]);
        
        if (delta !== 0) {
            await connection.execute('UPDATE Cluster_Table SET space_used = GREATEST(0, space_used + ?) WHERE id = ?', [delta, clusterId]);
        }
        
        if (projectId && userId) {
            await connection.execute('INSERT INTO Project_History (user_id, Project_id, History_Title, History_Description, Status, History_Type, Other_Stamp) VALUES (?,?,?,?,?,?,?)', 
                [userId, projectId, 'Graph Update', `Node ${nodeId} updated`, 'Active', 'documentWrite', `Delta: ${delta} bytes`]);
        }
        
        const end = performance.now();
        const io = req.app.get('io');
        await logMetric(connection, projectId, clusterId, 'Write', end - start, io);
        
        if (io) io.to(`cluster_${clusterId}`).emit('graph_update', { type: 'updateNode', id: nodeId });
        
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
        
        const [nodeRows] = await connection.execute('SELECT byte_size FROM Graph_Nodes WHERE id = ? AND cluster_id = ?', [nodeId, clusterId]);
        if (nodeRows.length === 0) {
            await connection.end();
            return res.status(404).json({ success: false, message: 'Node not found' });
        }
        
        const [edgeRows] = await connection.execute('SELECT byte_size FROM Graph_Edges WHERE cluster_id = ? AND (source_id = ? OR target_id = ?)', [clusterId, nodeId, nodeId]);
        
        let totalSizeToFree = nodeRows[0].byte_size;
        edgeRows.forEach(r => { totalSizeToFree += r.byte_size; });
        
        await connection.execute('DELETE FROM Graph_Nodes WHERE id = ? AND cluster_id = ?', [nodeId, clusterId]);
        
        if (totalSizeToFree > 0) {
            await connection.execute('UPDATE Cluster_Table SET space_used = GREATEST(0, space_used - ?) WHERE id = ?', [totalSizeToFree, clusterId]);
        }
        
        if (projectId && userId) {
            await connection.execute('INSERT INTO Project_History (user_id, Project_id, History_Title, History_Description, Status, History_Type, Other_Stamp) VALUES (?,?,?,?,?,?,?)', 
                [userId, projectId, 'Graph Delete', `Node ${nodeId} and related edges deleted`, 'Active', 'documentDelete', `Delta: -${totalSizeToFree} bytes`]);
        }
        
        const end = performance.now();
        const io = req.app.get('io');
        await logMetric(connection, projectId, clusterId, 'Write', end - start, io);
        
        if (io) io.to(`cluster_${clusterId}`).emit('graph_update', { type: 'deleteNode', id: nodeId });
        
        await connection.end();
        res.json({ success: true });
    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
}

async function addEdge(req, res) {
    const { clusterId, sourceId, targetId, edgeLabel, weight = 1.0, properties, directed = true } = req.body;
    const start = performance.now();
    try {
        const connection = await mysql.createConnection(dbConfig);
        const { projectId, userId } = await getProjectDetails(connection, clusterId);
        
        const id = crypto.randomUUID();
        const payloadStr = JSON.stringify(properties || {});
        const byteSize = Buffer.byteLength(payloadStr, 'utf8');
        
        const query = 'INSERT INTO Graph_Edges (id, cluster_id, source_id, target_id, edge_label, weight, properties, directed, byte_size) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)';
        await connection.execute(query, [id, clusterId, sourceId, targetId, edgeLabel, weight, payloadStr, directed, byteSize]);
        
        if (byteSize > 0) {
            await connection.execute('UPDATE Cluster_Table SET space_used = space_used + ? WHERE id = ?', [byteSize, clusterId]);
        }
        
        if (projectId && userId) {
            await connection.execute('INSERT INTO Project_History (user_id, Project_id, History_Title, History_Description, Status, History_Type, Other_Stamp) VALUES (?,?,?,?,?,?,?)', 
                [userId, projectId, 'Graph Edge Write', `Edge ${id} created`, 'Active', 'documentWrite', `Delta: ${byteSize} bytes`]);
        }
        
        const end = performance.now();
        const io = req.app.get('io');
        await logMetric(connection, projectId, clusterId, 'Write', end - start, io);
        
        if (io) io.to(`cluster_${clusterId}`).emit('graph_update', { type: 'addEdge', id, sourceId, targetId });
        
        await connection.end();
        res.json({ success: true, id });
    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
}

async function deleteEdge(req, res) {
    const { clusterId, edgeId } = req.body;
    const start = performance.now();
    try {
        const connection = await mysql.createConnection(dbConfig);
        const { projectId, userId } = await getProjectDetails(connection, clusterId);
        
        const [oldRows] = await connection.execute('SELECT byte_size FROM Graph_Edges WHERE id = ? AND cluster_id = ?', [edgeId, clusterId]);
        if (oldRows.length === 0) {
            await connection.end();
            return res.status(404).json({ success: false, message: 'Edge not found' });
        }
        
        const sizeToFree = oldRows[0].byte_size;
        
        await connection.execute('DELETE FROM Graph_Edges WHERE id = ? AND cluster_id = ?', [edgeId, clusterId]);
        
        if (sizeToFree > 0) {
            await connection.execute('UPDATE Cluster_Table SET space_used = GREATEST(0, space_used - ?) WHERE id = ?', [sizeToFree, clusterId]);
        }
        
        if (projectId && userId) {
            await connection.execute('INSERT INTO Project_History (user_id, Project_id, History_Title, History_Description, Status, History_Type, Other_Stamp) VALUES (?,?,?,?,?,?,?)', 
                [userId, projectId, 'Graph Edge Delete', `Edge ${edgeId} deleted`, 'Active', 'documentDelete', `Delta: -${sizeToFree} bytes`]);
        }
        
        const end = performance.now();
        const io = req.app.get('io');
        await logMetric(connection, projectId, clusterId, 'Write', end - start, io);
        
        if (io) io.to(`cluster_${clusterId}`).emit('graph_update', { type: 'deleteEdge', id: edgeId });
        
        await connection.end();
        res.json({ success: true });
    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
}

async function getGraph(req, res) {
    const { clusterId } = req.body;
    const start = performance.now();
    try {
        const connection = await mysql.createConnection(dbConfig);
        const { projectId } = await getProjectDetails(connection, clusterId);
        
        const [nodes] = await connection.execute('SELECT id, node_label, properties FROM Graph_Nodes WHERE cluster_id = ?', [clusterId]);
        const [edges] = await connection.execute('SELECT id, source_id, target_id, edge_label, weight, properties, directed FROM Graph_Edges WHERE cluster_id = ?', [clusterId]);
        
        const end = performance.now();
        const io = req.app.get('io');
        await logMetric(connection, projectId, clusterId, 'Read', end - start, io);
        
        await connection.end();
        res.json({ success: true, nodes, edges });
    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
}

async function getNeighbors(req, res) {
    const { clusterId, nodeId, depth = 1 } = req.body;
    const start = performance.now();
    try {
        const connection = await mysql.createConnection(dbConfig);
        const { projectId } = await getProjectDetails(connection, clusterId);
        
        const [edges] = await connection.execute('SELECT * FROM Graph_Edges WHERE cluster_id = ? AND (source_id = ? OR (target_id = ? AND directed = FALSE))', [clusterId, nodeId, nodeId]);
        
        const neighborIds = new Set();
        edges.forEach(e => {
            if (e.source_id === nodeId) neighborIds.add(e.target_id);
            else neighborIds.add(e.source_id);
        });
        
        let nodes = [];
        if (neighborIds.size > 0) {
            const placeholders = Array.from(neighborIds).map(() => '?').join(',');
            const [nRows] = await connection.execute(`SELECT * FROM Graph_Nodes WHERE id IN (${placeholders})`, Array.from(neighborIds));
            nodes = nRows;
        }
        
        const end = performance.now();
        const io = req.app.get('io');
        await logMetric(connection, projectId, clusterId, 'Read', end - start, io);
        
        await connection.end();
        res.json({ success: true, nodes, edges });
    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
}


async function updateEdge(req, res) {
    const { clusterId, edgeId, properties, weight, merge = true } = req.body;
    const start = performance.now();
    try {
        const connection = await mysql.createConnection(dbConfig);
        const { projectId, userId } = await getProjectDetails(connection, clusterId);
        
        const [oldRows] = await connection.execute('SELECT properties, byte_size, weight FROM Graph_Edges WHERE id = ? AND cluster_id = ?', [edgeId, clusterId]);
        if (oldRows.length === 0) {
            await connection.end();
            return res.status(404).json({ success: false, message: 'Edge not found' });
        }
        
        let newProps = properties;
        if (merge) {
            const oldProps = typeof oldRows[0].properties === 'string' ? JSON.parse(oldRows[0].properties) : (oldRows[0].properties || {});
            newProps = { ...oldProps, ...properties };
        }
        
        const payloadStr = JSON.stringify(newProps || {});
        const newSize = Buffer.byteLength(payloadStr, 'utf8');
        const oldSize = oldRows[0].byte_size;
        const sizeDelta = newSize - oldSize;
        const newWeight = weight !== undefined ? weight : oldRows[0].weight;
        
        await connection.execute('UPDATE Graph_Edges SET properties = ?, byte_size = ?, weight = ? WHERE id = ? AND cluster_id = ?', [payloadStr, newSize, newWeight, edgeId, clusterId]);
        
        if (sizeDelta !== 0) {
            await connection.execute('UPDATE Cluster_Table SET space_used = GREATEST(0, space_used + ?) WHERE id = ?', [sizeDelta, clusterId]);
        }
        
        if (projectId && userId) {
            await connection.execute('INSERT INTO Project_History (user_id, Project_id, History_Title, History_Description, Status, History_Type, Other_Stamp) VALUES (?,?,?,?,?,?,?)', 
                [userId, projectId, 'Graph Edge Update', `Edge ${edgeId} updated`, 'Active', 'documentWrite', `Delta: ${sizeDelta} bytes`]);
        }
        
        const end = performance.now();
        const io = req.app.get('io');
        await logMetric(connection, projectId, clusterId, 'Write', end - start, io);
        
        if (io) io.to(`cluster_${clusterId}`).emit('graph_update', { type: 'updateEdge', id: edgeId });
        
        await connection.end();
        res.json({ success: true });
    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
}

async function queryGraph(req, res) {
    const { clusterId, nodeLabel, propertiesMatch } = req.body;
    const start = performance.now();
    try {
        const connection = await mysql.createConnection(dbConfig);
        const { projectId } = await getProjectDetails(connection, clusterId);
        
        let query = 'SELECT id, node_label, properties FROM Graph_Nodes WHERE cluster_id = ?';
        let params = [clusterId];
        
        if (nodeLabel) {
            query += ' AND node_label = ?';
            params.push(nodeLabel);
        }
        
        const [nodes] = await connection.execute(query, params);
        
        let filteredNodes = nodes;
        if (propertiesMatch && Object.keys(propertiesMatch).length > 0) {
            filteredNodes = nodes.filter(node => {
                let props = typeof node.properties === 'string' ? JSON.parse(node.properties) : (node.properties || {});
                for (const key in propertiesMatch) {
                    if (props[key] !== propertiesMatch[key]) {
                        return false;
                    }
                }
                return true;
            });
        }
        
        const end = performance.now();
        const io = req.app.get('io');
        await logMetric(connection, projectId, clusterId, 'Read', end - start, io);
        
        await connection.end();
        res.json({ success: true, nodes: filteredNodes });
    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
}

async function clearGraph(req, res) {
    const { clusterId } = req.body;
    const start = performance.now();
    try {
        const connection = await mysql.createConnection(dbConfig);
        const { projectId, userId } = await getProjectDetails(connection, clusterId);
        
        const [nodeSum] = await connection.execute('SELECT SUM(byte_size) as total FROM Graph_Nodes WHERE cluster_id = ?', [clusterId]);
        const [edgeSum] = await connection.execute('SELECT SUM(byte_size) as total FROM Graph_Edges WHERE cluster_id = ?', [clusterId]);
        const sizeToFree = (nodeSum[0].total || 0) + (edgeSum[0].total || 0);
        
        await connection.execute('DELETE FROM Graph_Edges WHERE cluster_id = ?', [clusterId]);
        await connection.execute('DELETE FROM Graph_Nodes WHERE cluster_id = ?', [clusterId]);
        
        if (sizeToFree > 0) {
            await connection.execute('UPDATE Cluster_Table SET space_used = GREATEST(0, space_used - ?) WHERE id = ?', [sizeToFree, clusterId]);
        }
        
        if (projectId && userId) {
            await connection.execute('INSERT INTO Project_History (user_id, Project_id, History_Title, History_Description, Status, History_Type, Other_Stamp) VALUES (?,?,?,?,?,?,?)', 
                [userId, projectId, 'Graph Cleared', 'All nodes and edges deleted', 'Active', 'documentDelete', `Delta: -${sizeToFree} bytes`]);
        }
        
        const end = performance.now();
        const io = req.app.get('io');
        await logMetric(connection, projectId, clusterId, 'Write', end - start, io);
        
        if (io) io.to(`cluster_${clusterId}`).emit('graph_update', { type: 'clearGraph' });
        
        await connection.end();
        res.json({ success: true });
    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
}
module.exports = {
    updateEdge,
    queryGraph,
    clearGraph,
    addNode,
    updateNode,
    deleteNode,
    addEdge,
    deleteEdge,
    getGraph,
    getNeighbors
};
