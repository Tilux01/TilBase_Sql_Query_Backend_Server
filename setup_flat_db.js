const mysql = require('mysql2/promise');

async function createFlatDbTable() {
    try {
        const connection = await mysql.createConnection({
            host: 'localhost',
            user: 'root',
            password: '',
            database: 'TilBase'
        });

        const query = `
            CREATE TABLE IF NOT EXISTS Flat_Database (
                id BIGINT AUTO_INCREMENT PRIMARY KEY,
                cluster_id BIGINT NOT NULL,
                bucket_name VARCHAR(255) NOT NULL,
                key_name VARCHAR(255) NOT NULL,
                value_data LONGTEXT,
                type_lock VARCHAR(50) DEFAULT 'none',
                expires_at DATETIME NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                UNIQUE KEY unique_bucket_key (cluster_id, bucket_name, key_name),
                FOREIGN KEY (cluster_id) REFERENCES Cluster_Table(id) ON DELETE CASCADE
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
        `;

        await connection.query(query);
        console.log("Flat_Database table created successfully.");
        await connection.end();
    } catch (error) {
        console.error("Error creating Flat_Database table:", error);
    }
}
createFlatDbTable();
