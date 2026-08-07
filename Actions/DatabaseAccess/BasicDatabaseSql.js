let connection
const makeConnection = require("../../SQLConnection")
const startDB = async () => {
    makeConnection()
        .then((connect) => {
            connection = connect
        })
        .catch((error) => {
            console.log(error);
        })
}
const addDbUserSql = async (project_id, DB_Username, DB_Password, Role) => {
    try {
        const command = 'INSERT INTO Database_Users (project_id, DB_Username, DB_Password, Role) VALUES (?, ?, ?, ?)'
        const values = [project_id, DB_Username, DB_Password, Role]
        const [execute] = await connection.query(command, values)
        return execute?.insertId
    } catch (error) {
        console.log("Error adding db user", error);
        return { error: "Error adding db user" }
    }
}
const fetchDbUsersSql = async (project_id, page = 1) => {
    const limit = 16;
    const offset = (page - 1) * 15;
    const command = `SELECT * FROM Database_Users WHERE project_id=? ORDER BY id DESC LIMIT ${Number(limit)} OFFSET ${Number(offset)}`
    const [execute] = await connection.query(command, [project_id])
    return execute
}
const deleteDbUserSql = async (id, project_id) => {
    try {
        const command = 'DELETE FROM Database_Users WHERE id=? AND project_id=?'
        const [execute] = await connection.query(command, [id, project_id])
        return execute
    } catch (error) {
        console.log("Error deleting db user", error);
        return { error: "Error deleting db user" }
    }
}
startDB()
module.exports = { addDbUserSql, fetchDbUsersSql, deleteDbUserSql }
