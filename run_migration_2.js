const makeConnection = require('./SQLConnection');
async function migrate() {
    try {
        const connection = await makeConnection();
        console.log("Connected to DB, creating tables...");
        
        await connection.query(`
        CREATE TABLE IF NOT EXISTS Network_Access (
            id BIGINT AUTO_INCREMENT PRIMARY KEY,
            project_id BIGINT NOT NULL,
            IP_Address VARCHAR(100) NOT NULL,
            Description VARCHAR(255),
            Status VARCHAR(50) DEFAULT 'Active',
            Created_At TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (project_id) REFERENCES Project_Table(id) ON DELETE CASCADE
        )
        `);

        await connection.query(`
        CREATE TABLE IF NOT EXISTS Database_Users (
            id BIGINT AUTO_INCREMENT PRIMARY KEY,
            project_id BIGINT NOT NULL,
            DB_Username VARCHAR(100) NOT NULL,
            DB_Password VARCHAR(255) NOT NULL,
            Role VARCHAR(100) DEFAULT 'Read/Write',
            Created_At TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (project_id) REFERENCES Project_Table(id) ON DELETE CASCADE
        )
        `);
        console.log("Tables created.");
        process.exit(0);
    } catch(err) {
        console.error(err);
        process.exit(1);
    }
}
migrate();
