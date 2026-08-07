const makeConnection = require("../SQLConnection");
const { Auth } = require("../Actions/Cluster/CheckAuth");

let connection;
makeConnection().then(conn => { connection = conn; });


const dotProduct = (a, b) => a.reduce((sum, val, i) => sum + val * (b[i] || 0), 0);
const magnitude = (arr) => Math.sqrt(arr.reduce((sum, val) => sum + val * val, 0));
const cosineSimilarity = (a, b) => {
    const magA = magnitude(a);
    const magB = magnitude(b);
    if (magA === 0 || magB === 0) return 0;
    return dotProduct(a, b) / (magA * magB);
};
const euclideanDistance = (a, b) => Math.sqrt(a.reduce((sum, val, i) => sum + Math.pow(val - (b[i] || 0), 2), 0));
const euclideanSimilarity = (a, b) => 1 / (1 + euclideanDistance(a, b));

const getNamespaces = async (req, res) => {
    const { clusterId } = req.body;
    try {
        const [rows] = await connection.query(
            'SELECT namespace, COUNT(*) as count FROM Vector_Store WHERE cluster_id = ? GROUP BY namespace',
            [clusterId]
        );
        return res.json({ success: true, namespaces: rows });
    } catch (error) {
        console.error(error);
        return res.status(500).json({ success: false, message: error.message });
    }
};

const getVectors = async (req, res) => {
    const { clusterId, namespace } = req.body;
    try {
        const [rows] = await connection.query(
            'SELECT id, vector_id as vectorId, dense_vector, sparse_text as sparse, metadata FROM Vector_Store WHERE cluster_id = ? AND namespace = ? ORDER BY created_at DESC LIMIT 100',
            [clusterId, namespace]
        );
        const mapped = rows.map(r => {
            let dbVector = r.dense_vector;
            if (typeof dbVector === 'string') {
                try { dbVector = JSON.parse(dbVector); } catch(e) { dbVector = []; }
            }
            if (!Array.isArray(dbVector)) dbVector = [];
            return {
                id: r.vectorId,
                vector: dbVector,
                sparse: r.sparse,
                metadata: r.metadata || {}
            };
        });
        return res.json({ success: true, vectors: mapped });
    } catch (error) {
        console.error(error);
        return res.status(500).json({ success: false, message: error.message });
    }
};

const upsertVector = async (req, res) => {
    const { clusterId, namespace, vectorId, vector, sparse, metadata } = req.body;
    try {
        const denseStr = JSON.stringify(vector || []);
        const metaStr = JSON.stringify(metadata || {});
        
        
        const [existing] = await connection.query("SELECT dense_vector, sparse_text, metadata FROM Vector_Store WHERE cluster_id = ? AND namespace = ? AND vector_id = ?", [clusterId, namespace, vectorId]);
        let oldSize = 0;
        if (existing.length > 0) {
            oldSize = Buffer.byteLength(existing[0].dense_vector || '[]', 'utf8') + Buffer.byteLength(existing[0].sparse_text || '', 'utf8') + Buffer.byteLength(existing[0].metadata || '{}', 'utf8');
        }
        const newSize = Buffer.byteLength(denseStr, 'utf8') + Buffer.byteLength(sparse || "", 'utf8') + Buffer.byteLength(metaStr, 'utf8');
        const sizeDelta = newSize - oldSize;
        
        const query = `
            INSERT INTO Vector_Store (cluster_id, namespace, vector_id, dense_vector, sparse_text, metadata)
            VALUES (?, ?, ?, ?, ?, ?)
            ON DUPLICATE KEY UPDATE 
                dense_vector = VALUES(dense_vector),
                sparse_text = VALUES(sparse_text),
                metadata = VALUES(metadata)
        `;
        await connection.query(query, [
            clusterId, namespace, vectorId, 
            denseStr, 
            sparse || "", 
            metaStr
        ]);
        
        const projectId = req.project_id || req.sdk_project_id;
        const userId = req.user_id || req.sdk_user_id;
        if (projectId && userId) {
            if (sizeDelta !== 0) await connection.query('UPDATE Cluster_Table SET space_used = space_used + ? WHERE id = ?', [sizeDelta, clusterId]);
            await connection.query('INSERT INTO Project_History (user_id, Project_id, History_Title, History_Description, Status, History_Type, Other_Stamp) VALUES (?,?,?,?,?,?,?)', 
                [userId, projectId, 'Vector Upsert', `Vector ${vectorId} upserted in ${namespace}`, 'Active', 'vectorWrite', `Delta: ${sizeDelta} bytes`]);
        }
        
        return res.json({ success: true, message: "Vector upserted successfully" });
    } catch (error) {
        console.error(error);
        return res.status(500).json({ success: false, message: error.message });
    }
};

const deleteVector = async (req, res) => {
    const { clusterId, namespace, vectorId } = req.body;
    try {
        
        const [existing] = await connection.query("SELECT dense_vector, sparse_text, metadata FROM Vector_Store WHERE cluster_id = ? AND namespace = ? AND vector_id = ?", [clusterId, namespace, vectorId]);
        let sizeDelta = 0;
        if (existing.length > 0) {
            sizeDelta = Buffer.byteLength(existing[0].dense_vector || '[]', 'utf8') + Buffer.byteLength(existing[0].sparse_text || '', 'utf8') + Buffer.byteLength(existing[0].metadata || '{}', 'utf8');
        }
        
        await connection.query(
            'DELETE FROM Vector_Store WHERE cluster_id = ? AND namespace = ? AND vector_id = ?',
            [clusterId, namespace, vectorId]
        );
        
        const projectId = req.project_id || req.sdk_project_id;
        const userId = req.user_id || req.sdk_user_id;
        if (projectId && userId && sizeDelta > 0) {
            await connection.query('UPDATE Cluster_Table SET space_used = space_used - ? WHERE id = ?', [sizeDelta, clusterId]);
            await connection.query('INSERT INTO Project_History (user_id, Project_id, History_Title, History_Description, Status, History_Type, Other_Stamp) VALUES (?,?,?,?,?,?,?)', 
                [userId, projectId, 'Vector Delete', `Vector ${vectorId} deleted from ${namespace}`, 'Active', 'vectorDelete', `Delta: -${sizeDelta} bytes`]);
        }
        
        return res.json({ success: true, message: "Vector deleted" });
    } catch (error) {
        console.error(error);
        return res.status(500).json({ success: false, message: error.message });
    }
};

const semanticSearch = async (req, res) => {
    const { clusterId, namespace, queryVector, queryText, searchType, metric, filter } = req.body;
    try {
        let sql = 'SELECT vector_id as id, dense_vector, sparse_text as sparse, metadata FROM Vector_Store WHERE cluster_id = ? AND namespace = ?';
        const params = [clusterId, namespace];

        
        if (filter && typeof filter === 'object') {
            for (const [key, val] of Object.entries(filter)) {
                if (typeof val === 'object' && val !== null) {
                    
                    if (val.$lt !== undefined) { sql += ` AND JSON_EXTRACT(metadata, '$.${key}') < ?`; params.push(val.$lt); }
                    if (val.$gt !== undefined) { sql += ` AND JSON_EXTRACT(metadata, '$.${key}') > ?`; params.push(val.$gt); }
                    if (val.$eq !== undefined) { sql += ` AND JSON_EXTRACT(metadata, '$.${key}') = ?`; params.push(val.$eq); }
                } else {
                    sql += ` AND JSON_EXTRACT(metadata, '$.${key}') = ?`; params.push(val);
                }
            }
        }

        
        if ((searchType === 'sparse' || searchType === 'hybrid') && queryText) {
            sql += ' AND MATCH(sparse_text) AGAINST(? IN NATURAL LANGUAGE MODE)';
            params.push(queryText);
        }

        const [rows] = await connection.query(sql, params);

        let results = rows.map(r => {
            let score = 0;
            let dbVector = r.dense_vector;
            if (typeof dbVector === 'string') {
                try { dbVector = JSON.parse(dbVector); } catch(e) { dbVector = []; }
            }
            if (!Array.isArray(dbVector)) dbVector = [];

            if (searchType === 'dense' || searchType === 'hybrid') {
                if (dbVector.length === 0 || !queryVector || queryVector.length === 0) {
                    score = 0.5; 
                } else {
                    if (metric === 'euclidean') score = euclideanSimilarity(queryVector, dbVector);
                    else if (metric === 'dotProduct') {
                        
                        const raw = dotProduct(queryVector, dbVector);
                        score = Math.max(0, Math.min(1, (raw + 10) / 20)); 
                    } else {
                        score = cosineSimilarity(queryVector, dbVector);
                    }
                }
            } else {
                score = 0.8; 
            }

            return {
                id: r.id,
                sparse: r.sparse,
                metadata: r.metadata || {},
                score: Math.max(0, Math.min(1, score)) 
            };
        });

        
        results.sort((a, b) => b.score - a.score);
        
        
        return res.json({ success: true, results: results.slice(0, 10) });

    } catch (error) {
        console.error(error);
        return res.status(500).json({ success: false, message: error.message });
    }
};

module.exports = { getNamespaces, getVectors, upsertVector, deleteVector, semanticSearch };
