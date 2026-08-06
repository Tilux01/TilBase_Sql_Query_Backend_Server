const makeConnection = require("./SQLConnection")
const run = async () => {
    try {
        const connection = await makeConnection()
        try {
            await connection.query("ALTER TABLE Cluster_Table ADD COLUMN Current_State VARCHAR(50) DEFAULT 'active';")
            console.log("Added Current_State to Cluster_Table")
        } catch (e) {
            console.log("Column might already exist:", e.message)
        }
        try {
            await connection.query(`
                CREATE TABLE IF NOT EXISTS Connection_Metrics (
                    id INT AUTO_INCREMENT PRIMARY KEY,
                    project_id INT NOT NULL,
                    db_user VARCHAR(255) NOT NULL,
                    status VARCHAR(50) NOT NULL,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                );
            `)
            console.log("Created Connection_Metrics table")
        } catch (e) {
            console.log("Error creating Connection_Metrics table:", e.message)
        }
        try {
            await connection.query(`
                CREATE TABLE IF NOT EXISTS Cluster_Backups (
                    id INT AUTO_INCREMENT PRIMARY KEY,
                    project_id INT NOT NULL,
                    cluster_id INT NOT NULL,
                    backup_name VARCHAR(255) NOT NULL,
                    file_path VARCHAR(500) NOT NULL,
                    size_bytes INT NOT NULL,
                    status VARCHAR(50) NOT NULL,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                );
            `)
            console.log("Created Cluster_Backups table")
        } catch (e) {
            console.log("Error creating Cluster_Backups table:", e.message)
        }
        try {
            await connection.query(`
                CREATE TABLE IF NOT EXISTS Query_Metrics (
                    id INT AUTO_INCREMENT PRIMARY KEY,
                    project_id INT NOT NULL,
                    cluster_id INT NOT NULL,
                    query_type VARCHAR(50) NOT NULL,
                    execution_time_ms INT NOT NULL,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                );
            `)
            console.log("Created Query_Metrics table")
        } catch (e) {
            console.log("Error creating Query_Metrics table:", e.message)
        }
        try {
            await connection.query(`
                CREATE TABLE IF NOT EXISTS Global_Replication (
                    id INT AUTO_INCREMENT PRIMARY KEY,
                    project_id INT NOT NULL,
                    region VARCHAR(50) NOT NULL,
                    status VARCHAR(50) DEFAULT 'active',
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                );
            `)
            console.log("Created Global_Replication table")
        } catch (e) {
            console.log("Error creating Global_Replication table:", e.message)
        }
        try {
            await connection.query(`
                CREATE TABLE IF NOT EXISTS Support_Tickets (
                    id INT AUTO_INCREMENT PRIMARY KEY,
                    user_id INT NOT NULL,
                    category VARCHAR(100) DEFAULT 'General',
                    subject VARCHAR(255) NOT NULL,
                    details TEXT,
                    status VARCHAR(50) DEFAULT 'open',
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                );
            `)
            console.log("Created Support_Tickets table")
        } catch (e) {
            console.log("Error creating Support_Tickets table:", e.message)
        }
        try {
            await connection.query("ALTER TABLE Support_Tickets ADD COLUMN category VARCHAR(100) DEFAULT 'General';")
            console.log("Added category to Support_Tickets")
        } catch (e) {
            console.log("Column category might already exist:", e.message)
        }
        try {
            await connection.query("ALTER TABLE Support_Tickets ADD COLUMN details TEXT;")
            console.log("Added details to Support_Tickets")
        } catch (e) {
            console.log("Column details might already exist:", e.message)
        }
        try {
            await connection.query(`
                CREATE TABLE IF NOT EXISTS Billing_Invoices (
                    id INT AUTO_INCREMENT PRIMARY KEY,
                    user_id INT NOT NULL,
                    plan_name VARCHAR(50) NOT NULL,
                    amount DECIMAL(10,2) NOT NULL,
                    status VARCHAR(50) DEFAULT 'paid',
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                );
            `)
            console.log("Created Billing_Invoices table")
        } catch (e) {
            console.log("Error creating Billing_Invoices table:", e.message)
        }
        process.exit(0)
    } catch (e) {
        console.error(e)
        process.exit(1)
    }
}
run()
