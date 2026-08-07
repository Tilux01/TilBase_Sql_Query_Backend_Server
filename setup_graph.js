const mysql = require('mysql2/promise');

async function setup() {
    try {
        const conn = await mysql.createConnection({ host: 'localhost', user: 'root', password: '', database: 'TilBase' });
        
        await conn.query(`
            CREATE TABLE IF NOT EXISTS Graph_Nodes (
                id VARCHAR(255) PRIMARY KEY,
                cluster_id VARCHAR(255) NOT NULL,
                node_label VARCHAR(100) NOT NULL,
                properties LONGTEXT,
                byte_size INT DEFAULT 0,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                INDEX (cluster_id),
                INDEX (node_label)
            );
        `);
        console.log("Graph_Nodes table created.");

        await conn.query(`
            CREATE TABLE IF NOT EXISTS Graph_Edges (
                id VARCHAR(255) PRIMARY KEY,
                cluster_id VARCHAR(255) NOT NULL,
                source_id VARCHAR(255) NOT NULL,
                target_id VARCHAR(255) NOT NULL,
                edge_label VARCHAR(100) NOT NULL,
                weight FLOAT DEFAULT 1.0,
                properties LONGTEXT,
                directed BOOLEAN DEFAULT TRUE,
                byte_size INT DEFAULT 0,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                INDEX (cluster_id),
                INDEX (source_id),
                INDEX (target_id),
                FOREIGN KEY (source_id) REFERENCES Graph_Nodes(id) ON DELETE CASCADE,
                FOREIGN KEY (target_id) REFERENCES Graph_Nodes(id) ON DELETE CASCADE
            );
        `);
        console.log("Graph_Edges table created.");
        
        await conn.end();
    } catch (e) {
        console.error("Error setting up graph tables:", e);
    }
}

setup();
