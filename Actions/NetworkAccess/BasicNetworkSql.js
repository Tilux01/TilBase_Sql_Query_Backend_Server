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
const addNetworkRuleSql = async (project_id, IP_Address, Description) => {
    try {
        const command = 'INSERT INTO Network_Access (project_id, IP_Address, Description) VALUES (?, ?, ?)'
        const values = [project_id, IP_Address, Description]
        const [execute] = await connection.execute(command, values)
        return execute?.insertId
    } catch (error) {
        console.log("Error adding rule", error);
        return { error: "Error adding rule" }
    }
}
const fetchNetworkRulesSql = async (project_id, page = 1) => {
    const limit = 16;
    const offset = (page - 1) * 15;
    const command = 'SELECT * FROM Network_Access WHERE project_id=? ORDER BY id DESC LIMIT ? OFFSET ?'
    const [execute] = await connection.execute(command, [project_id, limit, offset])
    return execute
}
const deleteNetworkRuleSql = async (id, project_id) => {
    try {
        const command = 'DELETE FROM Network_Access WHERE id=? AND project_id=?'
        const [execute] = await connection.execute(command, [id, project_id])
        return execute
    } catch (error) {
        console.log("Error deleting rule", error);
        return { error: "Error deleting rule" }
    }
}
startDB()
module.exports = { addNetworkRuleSql, fetchNetworkRulesSql, deleteNetworkRuleSql }
