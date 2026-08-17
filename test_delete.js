const makeConnection = require("./SQLConnection");
async function test() {
    try {
        const connection = await makeConnection();
        const project_id = 1;
        const user_id = 1;
        await connection.query('DELETE FROM `Project_History` WHERE Project_id=?', [project_id]);
        console.log("Project_History deleted");
        await connection.query('DELETE FROM `Database_Users` WHERE project_id=?', [project_id]);
        console.log("Database_Users deleted");
        await connection.query('DELETE FROM `Network_Access` WHERE project_id=?', [project_id]);
        console.log("Network_Access deleted");
        await connection.query('DELETE FROM `Cluster_Table` WHERE project_id=?', [project_id]);
        console.log("Cluster_Table deleted");
        await connection.query('DELETE FROM `Project_Table` WHERE id=? AND user_id=?', [project_id, user_id]);
        console.log("Project_Table deleted");
        process.exit(0);
    } catch(e) {
        console.error("SQL Error:", e);
        process.exit(1);
    }
}
test();
