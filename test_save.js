const makeConnection = require('./SQLConnection');
async function testSave() {
    const connection = await makeConnection();
    try {
        const clusterId = 8;
        const path = 'yoo/test1234';
        const parentPath = 'yoo';
        const jsonData = JSON.stringify({ omoh: true });
        const query = `
            INSERT INTO Document_Store (cluster_id, path, parent_path, document_data) 
            VALUES (?, ?, ?, ?) 
            ON DUPLICATE KEY UPDATE document_data = VALUES(document_data)
        `;
        await connection.query(query, [clusterId, path, parentPath, jsonData]);
        console.log("Success!");
    } catch (e) {
        console.error("SQL Error caught:");
        console.error(e);
    }
    process.exit(0);
}
testSave();
