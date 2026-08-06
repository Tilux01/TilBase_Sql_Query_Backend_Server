const makeConnection = require('./SQLConnection');

const alterTable = async () => {
    let db;
    try {
        db = await makeConnection();
        console.log("Altering user_cred table...");
        
        
        await db.query("ALTER TABLE user_cred MODIFY Password VARCHAR(255) NULL;");
        console.log("Password column is now nullable.");

        
        try {
            await db.query("ALTER TABLE user_cred ADD COLUMN Auth_Provider VARCHAR(50) DEFAULT 'local';");
            console.log("Auth_Provider column added.");
        } catch (err) {
            if (err.code !== 'ER_DUP_FIELDNAME') throw err;
        }

        
        try {
            await db.query("ALTER TABLE user_cred ADD COLUMN Provider_ID VARCHAR(255) NULL;");
            console.log("Provider_ID column added.");
        } catch (err) {
            if (err.code !== 'ER_DUP_FIELDNAME') throw err;
        }

        console.log("Migration complete.");
        process.exit(0);
    } catch (error) {
        console.error("Migration failed:", error);
        process.exit(1);
    }
};

alterTable();
