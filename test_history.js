const makeConnection = require('./SQLConnection');
async function testSave() {
    const connection = await makeConnection();
    try {
        const clusterId = 8;
        const sizeDelta = 12;
        const userId = 1;
        const projectId = 1; // Assuming 1
        const path = 'yoo/test1234';
        
        console.log("Updating Cluster_Table...");
        await connection.query('UPDATE Cluster_Table SET space_used = space_used + ? WHERE id = ?', [sizeDelta, clusterId]);
        
        console.log("Inserting Project_History...");
        await connection.query('INSERT INTO Project_History (user_id, Project_id, History_Title, History_Description, Status, History_Type, Other_Stamp) VALUES (?,?,?,?,?,?,?)', 
                [userId, projectId, 'Document Write', `Document saved at ${path}`, 'Active', 'documentWrite', `Delta: ${sizeDelta} bytes`]);
        console.log("Success!");
    } catch (e) {
        console.error("SQL Error caught:");
        console.error(e);
    }
    process.exit(0);
}
testSave();
