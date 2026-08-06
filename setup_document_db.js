const mysql = require('mysql2');

const connection = mysql.createConnection({
    host: "localhost",
    user: "root",
    password: "",
    database: "TilBase"
});

connection.connect((err) => {
    if (err) throw err;
    console.log("Connected to MySQL.");

    const createTableQuery = `
        CREATE TABLE IF NOT EXISTS Document_Store (
            id BIGINT AUTO_INCREMENT PRIMARY KEY,
            cluster_id BIGINT NOT NULL,
            path VARCHAR(500) NOT NULL,
            parent_path VARCHAR(500) NOT NULL,
            document_data JSON,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (cluster_id) REFERENCES Cluster_Table(id) ON DELETE CASCADE,
            UNIQUE KEY unique_doc (cluster_id, path)
        );
    `;

    connection.query(createTableQuery, (err, result) => {
        if (err) {
            console.error("Error creating table:", err);
        } else {
            console.log("Table Document_Store created or already exists.");
        }
        connection.end();
    });
});
