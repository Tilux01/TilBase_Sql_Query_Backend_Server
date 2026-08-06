const makeConnection = require("./SQLConnection");

const setupVectorDB = async () => {
    try {
        const connection = await makeConnection();
        console.log("Connected to MySQL.");

        await connection.query('DROP TABLE IF EXISTS Vector_Store');
        const createVectorTable = `
            CREATE TABLE Vector_Store (
                id INT AUTO_INCREMENT PRIMARY KEY,
                cluster_id INT NOT NULL,
                namespace VARCHAR(255) NOT NULL,
                vector_id VARCHAR(255) NOT NULL,
                dense_vector JSON,
                sparse_text TEXT,
                metadata JSON,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                UNIQUE KEY unique_vector (cluster_id, namespace, vector_id),
                FULLTEXT INDEX ft_sparse_text (sparse_text)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
        `;

        await connection.query(createVectorTable);
        console.log("Successfully created Vector_Store table with FULLTEXT index.");

        process.exit(0);
    } catch (error) {
        console.error("Error creating Vector_Store:", error);
        process.exit(1);
    }
};

setupVectorDB();
