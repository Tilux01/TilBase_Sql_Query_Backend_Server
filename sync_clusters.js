const makeConnection = require("./SQLConnection")

const run = async () => {
    try {
        const connection = await makeConnection()
        
        console.log("Starting sync...")
        
        await connection.query(`
            UPDATE Plan p
            LEFT JOIN (
                SELECT user_id, COUNT(*) as actual_count
                FROM Cluster_Table
                GROUP BY user_id
            ) c ON p.user_id = c.user_id
            SET p.Total_Clusters = IFNULL(c.actual_count, 0)
        `);
        
        console.log("Successfully synced Total_Clusters on the Plan table.")
        process.exit(0)
    } catch (e) {
        console.error(e)
        process.exit(1)
    }
}
run()
