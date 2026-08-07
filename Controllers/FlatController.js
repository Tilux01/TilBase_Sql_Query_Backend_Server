const mysql = require('mysql2/promise');
const dbConfig = { host: 'localhost', user: 'root', password: '', database: 'TilBase' };

async function getBuckets(req, res) {
    const { clusterId } = req.body;
    try {
        const connection = await mysql.createConnection(dbConfig);
        const [rows] = await connection.query('SELECT DISTINCT bucket_name as bucketName FROM Flat_Database WHERE cluster_id = ?', [clusterId]);
        await connection.end();
        res.json({ success: true, buckets: rows });
    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
}

async function getKeys(req, res) {
    const { clusterId, bucketName } = req.body;
    try {
        const connection = await mysql.createConnection(dbConfig);
        
        await connection.query('DELETE FROM Flat_Database WHERE cluster_id = ? AND expires_at IS NOT NULL AND expires_at < NOW()', [clusterId]);
        const [rows] = await connection.query('SELECT key_name as keyName FROM Flat_Database WHERE cluster_id = ? AND bucket_name = ?', [clusterId, bucketName]);
        await connection.end();
        res.json({ success: true, keys: rows });
    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
}

async function getValue(req, res) {
    const { clusterId, bucketName, keyName } = req.body;
    try {
        const connection = await mysql.createConnection(dbConfig);
        
        const [delRows] = await connection.query('DELETE FROM Flat_Database WHERE cluster_id = ? AND bucket_name = ? AND key_name = ? AND expires_at IS NOT NULL AND expires_at < NOW()', [clusterId, bucketName, keyName]);
        if (delRows.affectedRows > 0) {
            await connection.end();
            return res.json({ success: true, value: null });
        }
        
        const [rows] = await connection.query('SELECT value_data FROM Flat_Database WHERE cluster_id = ? AND bucket_name = ? AND key_name = ?', [clusterId, bucketName, keyName]);
        await connection.end();
        if (rows.length === 0) return res.json({ success: true, value: null });
        
        let val = rows[0].value_data;
        try { val = JSON.parse(val); } catch (e) {  }
        res.json({ success: true, value: val });
    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
}

async function setValue(req, res) {
    const { clusterId, bucketName, keyName, value, ttlSeconds } = req.body;
    try {
        const connection = await mysql.createConnection(dbConfig);
        const valueStr = typeof value === 'object' ? JSON.stringify(value) : String(value);
        
        
        const newSize = Buffer.byteLength(valueStr, 'utf8');
        
        const [oldRows] = await connection.query('SELECT value_data FROM Flat_Database WHERE cluster_id = ? AND bucket_name = ? AND key_name = ?', [clusterId, bucketName, keyName]);
        const oldSize = oldRows.length > 0 ? Buffer.byteLength(oldRows[0].value_data || '', 'utf8') : 0;
        const sizeDelta = newSize - oldSize;
        
        let expiresAt = null;
        if (ttlSeconds) {
            expiresAt = new Date(Date.now() + ttlSeconds * 1000);
        }

        const query = `
            INSERT INTO Flat_Database (cluster_id, bucket_name, key_name, value_data, expires_at) 
            VALUES (?, ?, ?, ?, ?)
            ON DUPLICATE KEY UPDATE value_data = ?, expires_at = ?
        `;
        
        await connection.query(query, [clusterId, bucketName, keyName, valueStr, expiresAt, valueStr, expiresAt]);
        
        
        if (sizeDelta !== 0) {
            await connection.query('UPDATE Cluster_Table SET space_used = GREATEST(0, space_used + ?) WHERE id = ?', [sizeDelta, clusterId]);
        }

        await connection.end();

        
        const io = req.app.get('io');
        console.log(`[DEBUG] io exists: ${!!io}, emitting to cluster_${clusterId}`);
        if (io) {
            io.to(`cluster_${clusterId}`).emit('flat_update', { bucketName, keyName });
            console.log("[DEBUG] Emitted flat_update!");
        }

        res.json({ success: true });
    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
}

async function deleteKey(req, res) {
    const { clusterId, bucketName, keyName } = req.body;
    try {
        const connection = await mysql.createConnection(dbConfig);
        const [oldRows] = await connection.query('SELECT value_data FROM Flat_Database WHERE cluster_id = ? AND bucket_name = ? AND key_name = ?', [clusterId, bucketName, keyName]);
        if (oldRows.length > 0) {
            const oldSize = Buffer.byteLength(oldRows[0].value_data || '', 'utf8');
            await connection.query('DELETE FROM Flat_Database WHERE cluster_id = ? AND bucket_name = ? AND key_name = ?', [clusterId, bucketName, keyName]);
            await connection.query('UPDATE Cluster_Table SET space_used = GREATEST(0, space_used - ?) WHERE id = ?', [oldSize, clusterId]);
        }
        await connection.end();
        
        const io = req.app.get('io');
        if (io) {
            io.to(`cluster_${clusterId}`).emit('flat_update', { bucketName, keyName });
        }
        
        res.json({ success: true });
    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
}

async function deleteBucket(req, res) {
    const { clusterId, bucketName } = req.body;
    try {
        const connection = await mysql.createConnection(dbConfig);
        const [oldRows] = await connection.query('SELECT value_data FROM Flat_Database WHERE cluster_id = ? AND bucket_name = ?', [clusterId, bucketName]);
        
        let oldSize = 0;
        for (let row of oldRows) {
            oldSize += Buffer.byteLength(row.value_data || '', 'utf8');
        }
        
        if (oldRows.length > 0) {
            await connection.query('DELETE FROM Flat_Database WHERE cluster_id = ? AND bucket_name = ?', [clusterId, bucketName]);
            await connection.query('UPDATE Cluster_Table SET space_used = GREATEST(0, space_used - ?) WHERE id = ?', [oldSize, clusterId]);
        }
        await connection.end();
        
        const io = req.app.get('io');
        if (io) {
            io.to(`cluster_${clusterId}`).emit('flat_bucket_deleted', { bucketName });
        }
        
        res.json({ success: true, deletedKeys: oldRows.length });
    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
}

async function increment(req, res) {
    const { clusterId, bucketName, keyName, amount } = req.body;
    try {
        const connection = await mysql.createConnection(dbConfig);
        
        await connection.beginTransaction();
        const [rows] = await connection.query('SELECT value_data FROM Flat_Database WHERE cluster_id = ? AND bucket_name = ? AND key_name = ? FOR UPDATE', [clusterId, bucketName, keyName]);
        
        let currentValue = 0;
        let oldSize = 0;
        
        if (rows.length > 0) {
            oldSize = Buffer.byteLength(rows[0].value_data || '', 'utf8');
            let parsed = Number(rows[0].value_data);
            if (!isNaN(parsed)) {
                currentValue = parsed;
            }
        }
        
        const newValue = currentValue + (Number(amount) || 1);
        const newValueStr = String(newValue);
        const newSize = Buffer.byteLength(newValueStr, 'utf8');
        const sizeDelta = newSize - oldSize;
        
        const query = `
            INSERT INTO Flat_Database (cluster_id, bucket_name, key_name, value_data) 
            VALUES (?, ?, ?, ?)
            ON DUPLICATE KEY UPDATE value_data = ?
        `;
        
        await connection.query(query, [clusterId, bucketName, keyName, newValueStr, newValueStr]);
        
        if (sizeDelta !== 0) {
            await connection.query('UPDATE Cluster_Table SET space_used = GREATEST(0, space_used + ?) WHERE id = ?', [sizeDelta, clusterId]);
        }
        
        await connection.commit();
        await connection.end();
        
        const io = req.app.get('io');
        if (io) {
            io.to(`cluster_${clusterId}`).emit('flat_update', { bucketName, keyName, newValue: newValueStr });
        }
        
        res.json({ success: true, value: newValue });
    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
}

module.exports = {
    getBuckets,
    getKeys,
    getValue,
    setValue,
    deleteKey,
    deleteBucket,
    increment
};
