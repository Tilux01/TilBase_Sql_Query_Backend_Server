const jwt = require('jsonwebtoken');
let connection;
const makeConnection = require("../SQLConnection");
makeConnection().then(conn => { connection = conn; }).catch(console.error);

const JWT_SECRET = process.env.JWT_SECRET || "tilbase_super_secret_key_2026";

const apiGuard = async (req, res, next) => {
    try {
        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return res.status(401).json({ message: "Unauthorized: Missing or invalid token" });
        }

        const token = authHeader.split(' ')[1];
        const decoded = jwt.verify(token, JWT_SECRET);

        const requestedClusterId = req.body?.clusterId;

        if (decoded.type === 'dashboard') {
            req.user = decoded;
            if (requestedClusterId) {
                if (!connection) return res.status(500).json({ message: "Database not ready" });
                const [rows] = await connection.query(
                    'SELECT id, project_id, Current_State FROM Cluster_Table WHERE id = ? AND user_id = ?', 
                    [requestedClusterId, decoded.userId]
                );
                if (rows.length === 0) {
                    return res.status(403).json({ message: "Forbidden: You do not own this cluster" });
                }
                if (rows[0].Current_State !== 'active') {
                    return res.status(403).json({ message: "Forbidden: This cluster is currently paused and cannot accept connections." });
                }
                req.project_id = rows[0].project_id;
                req.user_id = decoded.userId;
            }
        } 
        else if (decoded.type === 'sdk') {
            req.sdk = decoded;
            req.project_id = decoded.ProjectId;
            req.user_id = decoded.userId;
            
            if (requestedClusterId && requestedClusterId !== decoded.clusterId) {
                return res.status(403).json({ message: "Forbidden: SDK Token cluster mismatch" });
            }

            if (decoded.clusterId) {
                if (!connection) return res.status(500).json({ message: "Database not ready" });
                const [clusterRows] = await connection.query(
                    'SELECT Current_State FROM Cluster_Table WHERE id = ?', 
                    [decoded.clusterId]
                );
                if (clusterRows.length === 0) {
                    return res.status(404).json({ message: "Cluster not found" });
                }
                if (clusterRows[0].Current_State !== 'active') {
                    return res.status(403).json({ message: "Forbidden: This cluster is currently paused and cannot accept connections." });
                }
            }
            
            const isSDKWrite = [
                '/api/vectorExplorer/upsertVector', 
                '/api/vectorExplorer/deleteVector',
                '/api/documentExplorer/setDocumentData',
                '/api/documentExplorer/deleteDocument',
                '/api/documentExplorer/updateDocument',
                '/api/documentExplorer/bulkSaveDocuments',
                '/api/documentExplorer/batchWrite',
                '/api/hierarchicalExplorer/addNode',
                '/api/hierarchicalExplorer/updateNode',
                '/api/hierarchicalExplorer/deleteNode',
                '/api/hierarchicalExplorer/moveNode',
                '/api/hierarchicalExplorer/batchWrite',
                '/api/hierarchicalExplorer/bulkUpdate',
                '/api/hierarchicalExplorer/bulkDelete',
                '/api/graphExplorer/addNode',
                '/api/graphExplorer/updateNode',
                '/api/graphExplorer/deleteNode',
                '/api/graphExplorer/addEdge',
                '/api/graphExplorer/deleteEdge',
                '/api/graphExplorer/updateEdge',
                '/api/graphExplorer/clearGraph',
                '/api/realtimeExplorer/addNode',
                '/api/realtimeExplorer/updateNode',
                '/api/realtimeExplorer/deleteNode'
            ].includes(req.path);

            if (isSDKWrite && decoded.role === 'Read Only') {
                return res.status(403).json({ message: "Forbidden: SDK Database User is Read Only" });
            }
        } 
        else {
            return res.status(401).json({ message: "Unauthorized: Invalid token type" });
        }

        
        const isWriteOperation = [
            '/api/vectorExplorer/upsertVector', 
            '/api/vectorExplorer/deleteVector',
            '/api/documentExplorer/setDocumentData',
            '/api/documentExplorer/deleteDocument',
            '/api/documentExplorer/updateDocument',
            '/api/documentExplorer/bulkSaveDocuments',
            '/api/documentExplorer/batchWrite',
            '/api/hierarchicalExplorer/addNode',
            '/api/hierarchicalExplorer/updateNode',
            '/api/hierarchicalExplorer/deleteNode',
            '/api/hierarchicalExplorer/moveNode',
            '/api/hierarchicalExplorer/batchWrite',
            '/api/hierarchicalExplorer/bulkUpdate',
            '/api/hierarchicalExplorer/bulkDelete',
            '/api/graphExplorer/addNode',
            '/api/graphExplorer/updateNode',
            '/api/graphExplorer/deleteNode',
            '/api/graphExplorer/addEdge',
            '/api/graphExplorer/deleteEdge',
            '/api/graphExplorer/updateEdge',
            '/api/graphExplorer/clearGraph',
            '/api/realtimeExplorer/addNode',
            '/api/realtimeExplorer/updateNode',
            '/api/realtimeExplorer/deleteNode'
        ].includes(req.path);

        if (isWriteOperation && req.user_id) {
            const [planRows] = await connection.query('SELECT Cloud_Storage FROM Plan WHERE user_id = ?', [req.user_id]);
            if (planRows.length > 0) {
                const cloudStorageMB = planRows[0].Cloud_Storage;
                const maxBytes = cloudStorageMB * 1024 * 1024;

                const [clusterRows] = await connection.query('SELECT SUM(space_used) as total_used FROM Cluster_Table WHERE user_id = ?', [req.user_id]);
                const totalUsed = clusterRows[0].total_used || 0;

                if (totalUsed >= maxBytes) {
                    return res.status(403).json({ message: "Forbidden: Storage limit exceeded. Please upgrade your plan." });
                }
            }
        }

        next();
    } catch (error) {
        console.error("apiGuard Error:", error.message);
        return res.status(401).json({ message: "Unauthorized: Invalid or expired token" });
    }
};

module.exports = apiGuard;
