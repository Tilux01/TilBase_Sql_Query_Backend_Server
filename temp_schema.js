const makeConnection = require("./SQLConnection");
async function run() {
    const db = await makeConnection();
    const [rows] = await db.query("DESCRIBE Plan");
    console.log(rows);
    process.exit(0);
}
run();
