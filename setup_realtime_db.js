const makeConnection = require('./SQLConnection');

async function createRealtimeDbTable() {
    try {
        const connection = await makeConnection();

        // Drop the old incorrectly structured table if it exists
        await connection.query('DROP TABLE IF EXISTS Realtime_Database;');

        const query = `
            CREATE TABLE IF NOT EXISTS Realtime_Store (
                id BIGINT AUTO_INCREMENT PRIMARY KEY,
                cluster_id BIGINT NOT NULL,
                path VARCHAR(500) NOT NULL,
                parent_path VARCHAR(500) NOT NULL,
                document_data JSON,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                UNIQUE KEY unique_doc_path (cluster_id, path),
                INDEX idx_parent_path (cluster_id, parent_path),
                FOREIGN KEY (cluster_id) REFERENCES Cluster_Table(id) ON DELETE CASCADE
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
        `;

        await connection.query(query);
        console.log("Realtime_Store table created successfully.");
        process.exit(0);
    } catch (error) {
        console.error("Error creating Realtime_Database table:", error);
    }
}
createRealtimeDbTable();
