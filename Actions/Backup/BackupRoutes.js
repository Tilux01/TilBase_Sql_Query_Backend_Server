const { Auth } = require("../Cluster/CheckAuth");
const makeConnection = require("../../SQLConnection");
const fs = require("fs");
const path = require("path");

let connection;
const startDB = async () => {
    makeConnection()
        .then((connect) => {
            connection = connect;
        })
        .catch((error) => {
            console.log(error);
        });
};
startDB();

const getBackups = async (req, res) => {
    const { userId, Profile_Key, projectId, projectKey, page = 1 } = req.body;
    
    const checkAuth = await Auth(userId, Profile_Key, projectId, projectKey);
    if (checkAuth?.error) {
        return res.status(400).json({ message: "error validating param" });
    }

    try {
        const limit = 16;
        const offset = (page - 1) * 15;
        const fetchCommand = `SELECT * FROM \`Cluster_Backups\` WHERE project_id=? ORDER BY created_at DESC LIMIT ${Number(limit)} OFFSET ${Number(offset)}`;
        const [backups] = await connection.query(fetchCommand, [projectId]);
        
        
        const clusterCommand = 'SELECT id, Cluster_Name FROM `Cluster_Table` WHERE project_id=?';
        const [clusters] = await connection.query(clusterCommand, [projectId]);

        return res.status(200).json({ message: { backups, clusters } });
    } catch (error) {
        console.error(error);
        return res.status(400).json({ message: "Error fetching backups" });
    }
};

const createBackup = async (req, res) => {
    const { userId, Profile_Key, projectId, projectKey, clusterId, clusterName } = req.body;
    
    const checkAuth = await Auth(userId, Profile_Key, projectId, projectKey);
    if (checkAuth?.error) {
        return res.status(400).json({ message: "error validating param" });
    }

    try {
        
        const typeCommand = 'SELECT Cluster_Type FROM `Cluster_Table` WHERE id=? AND project_id=?';
        const [clusterInfo] = await connection.query(typeCommand, [clusterId, projectId]);
        
        if (clusterInfo.length === 0) {
            return res.status(404).json({ message: "Cluster not found." });
        }
        
        const clusterType = clusterInfo[0].Cluster_Type.toLowerCase();
        
        
        let clusterData = [];
        if (clusterType === 'document') {
            const [docs] = await connection.query('SELECT path, document_data, created_at FROM `Document_Store` WHERE cluster_id=?', [clusterId]);
            clusterData = docs;
        } else if (clusterType === 'flat') {
            const [flats] = await connection.query('SELECT bucket_name, key_name, value_data, created_at, updated_at FROM `Flat_Database` WHERE cluster_id=?', [clusterId]);
            clusterData = flats;
        } else if (clusterType === 'vector') {
            const [vectors] = await connection.query('SELECT namespace, vector_id, dense_vector, sparse_text, metadata, created_at FROM `Vector_Store` WHERE cluster_id=?', [clusterId]);
            clusterData = vectors;
        } else if (clusterType === 'hierarchical') {
            const [nodes] = await connection.query('SELECT id, parent_id, data_payload, created_at, updated_at FROM `Hierarchical_Data` WHERE cluster_id=?', [clusterId]);
            clusterData = nodes;
        } else if (clusterType === 'graph') {
            const [nodes] = await connection.query('SELECT id, node_label, properties, byte_size, created_at FROM `Graph_Nodes` WHERE cluster_id=?', [clusterId]);
            const [edges] = await connection.query('SELECT id, source_id, target_id, edge_label, weight, properties, directed, byte_size FROM `Graph_Edges` WHERE cluster_id=?', [clusterId]);
            clusterData = { nodes, edges };
        }
        
        const snapshotData = {
            metadata: {
                project_id: projectId,
                cluster_id: clusterId,
                cluster_name: clusterName,
                cluster_engine: clusterType,
                timestamp: new Date().toISOString(),
                record_count: clusterData.length
            },
            data: clusterData
        };

        const backupContent = JSON.stringify(snapshotData, null, 2);
        const sizeBytes = Buffer.byteLength(backupContent, 'utf8');
        
        
        const backupName = `backup_${clusterName.replace(/[^a-zA-Z0-9]/g, '_')}_${Date.now()}.json`;
        
        const backupsDir = path.join(__dirname, '..', '..', 'Backups');
        const filePath = path.join(backupsDir, backupName);
        
        if (!fs.existsSync(backupsDir)) {
            fs.mkdirSync(backupsDir, { recursive: true });
        }
        
        fs.writeFileSync(filePath, backupContent);

        
        const insertBackup = 'INSERT INTO `Cluster_Backups` (project_id, cluster_id, backup_name, file_path, size_bytes, status) VALUES (?, ?, ?, ?, ?, ?)';
        await connection.query(insertBackup, [projectId, clusterId, backupName, filePath, sizeBytes, 'Ready']);

        
        const historyTitle = `Backup Created`;
        const historyDescription = `A manual backup was successfully generated for cluster [${clusterName}].`;
        const insertHistory = 'INSERT INTO `Project_History` (Project_id, History_Title, History_Description, History_Type, User_id, Status, Other_Stamp) VALUES (?, ?, ?, ?, ?, ?, ?)';
        await connection.query(insertHistory, [projectId, historyTitle, historyDescription, 'Backup', userId, 'Success', '']);

        return res.status(200).json({ message: "Backup successfully created" });
    } catch (error) {
        console.error(error);
        return res.status(400).json({ message: "Error creating backup" });
    }
};

const deleteBackup = async (req, res) => {
    const { userId, Profile_Key, projectId, projectKey, backupId, backupName } = req.body;
    
    const checkAuth = await Auth(userId, Profile_Key, projectId, projectKey);
    if (checkAuth?.error) {
        return res.status(400).json({ message: "error validating param" });
    }

    try {
        // Fetch backup to get path
        const fetchCommand = 'SELECT file_path FROM `Cluster_Backups` WHERE id=? AND project_id=?';
        const [rows] = await connection.query(fetchCommand, [backupId, projectId]);
        
        if (rows.length === 0) {
            return res.status(404).json({ message: "Backup not found" });
        }

        const filePath = rows[0].file_path;
        
        // Delete local file
        if (fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
        }

        // Delete from DB
        const deleteCommand = 'DELETE FROM `Cluster_Backups` WHERE id=? AND project_id=?';
        await connection.query(deleteCommand, [backupId, projectId]);

        // Log to Project_History
        const historyTitle = `Backup Deleted`;
        const historyDescription = `The backup file [${backupName}] was deleted from the vault.`;
        const insertHistory = 'INSERT INTO `Project_History` (Project_id, History_Title, History_Description, History_Type, User_id, Status, Other_Stamp) VALUES (?, ?, ?, ?, ?, ?, ?)';
        await connection.query(insertHistory, [projectId, historyTitle, historyDescription, 'Backup', userId, 'Success', '']);

        return res.status(200).json({ message: "Backup successfully deleted" });
    } catch (error) {
        console.error(error);
        return res.status(400).json({ message: "Error deleting backup" });
    }
};

const downloadBackup = async (req, res) => {
    const { id } = req.params;
    const { userId, Profile_Key, projectId, projectKey } = req.query;

    // Use query params for GET request auth
    const checkAuth = await Auth(userId, Profile_Key, projectId, projectKey);
    if (checkAuth?.error) {
        return res.status(400).json({ message: "Unauthorized download request" });
    }

    try {
        const fetchCommand = 'SELECT file_path, backup_name FROM `Cluster_Backups` WHERE id=? AND project_id=?';
        const [rows] = await connection.query(fetchCommand, [id, projectId]);
        
        if (rows.length === 0) {
            return res.status(404).json({ message: "Backup not found" });
        }

        const filePath = rows[0].file_path;
        const backupName = rows[0].backup_name;

        if (fs.existsSync(filePath)) {
            res.download(filePath, backupName);
        } else {
            return res.status(404).json({ message: "File not found on disk" });
        }
    } catch (error) {
        console.error(error);
        return res.status(400).json({ message: "Error downloading backup" });
    }
};

module.exports = { getBackups, createBackup, deleteBackup, downloadBackup };
