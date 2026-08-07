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
const addClusterHistory = async (connection, userId, ProjectId, clusterName, clusterKey, projectName) => {
    try {
        const command = 'INSERT INTO Project_History (user_id, Project_id, History_Title, History_Description, Status, History_Type, Other_Stamp) VALUES (?,?,?,?,?,?,?)'
        const values = [userId, ProjectId, `Cluster "${clusterName}" created`, `Cluster Creation successful on Project ${projectName}`, 'Active', 'clusterAdd', `ID: ${clusterKey}`]
        const [saveHistory] = await connection.query(command, values)
        return saveHistory?.insertId
    } catch (error) {
        console.log("Error updating history", error);
        return { error: "Error updating history" }
    }
}

const logClusterEvent = async (connection, userId, ProjectId, title, description, type, clusterKey) => {
    try {
        const command = 'INSERT INTO Project_History (user_id, Project_id, History_Title, History_Description, Status, History_Type, Other_Stamp) VALUES (?,?,?,?,?,?,?)'
        const values = [userId, ProjectId, title, description, 'Active', type, `ID: ${clusterKey}`]
        const [saveHistory] = await connection.query(command, values)
        return saveHistory?.insertId
    } catch (error) {
        console.log("Error logging history", error);
        return { error: "Error logging history" }
    }
}
const addCluster = async (user_id, project_id, clusterName, clusterPassword, clusterType, clusterKey) => {
    try {
        const command = 'INSERT INTO `Cluster_Table` (user_id, project_id, Cluster_Name, Cluster_Password, Cluster_Type, Cluster_Key) VALUES (?, ?, ?, ?, ?, ?)'
        const value = [user_id, project_id, clusterName, clusterPassword, clusterType, clusterKey]
        const [execute] = await connection.query(command, value)
        return execute?.insertId
    } catch (error) {
        console.log("Error adding cluster", error);
        return { error: "Error adding cluster" }
    }
}
const addPlan = async (planId, user_id) => {
    try {
        const command = 'UPDATE `Plan` SET Total_Clusters=Total_Clusters +1 WHERE id=? AND user_id=?'
        const values = [planId, user_id]
        const [execute] = await connection.query(command, values)
    } catch (error) {
        console.log(error);
        return { error: "Error updating plan" }
    }
}
const fetchCluster = async (id, project_id) => {
    const command = 'SELECT * FROM `Cluster_Table` WHERE id=? AND project_id=?'
    const value = [id, project_id]
    const [execute] = await connection.query(command, value)
    if (execute?.length == 0) {
        return { error: "No available cluster for this project" }
    }
    return execute[0]
}
const fetchClusters = async (project_id, page = 1) => {
    const limit = 16;
    const offset = (page - 1) * 15;
    const command = `SELECT * FROM \`Cluster_Table\` WHERE project_id=? ORDER BY id DESC LIMIT ${Number(limit)} OFFSET ${Number(offset)}`;
    const value = [project_id];
    const [execute] = await connection.query(command, value)
    return execute
}
const fetchHistory = async(id, project_id) => {
    const command = 'SELECT * FROM `Project_History` WHERE id=? AND Project_id=?'
    const value = [id, project_id]
    const [execute] = await connection.query(command, value)
    if (execute?.length == 0) {
        return { error: "No available cluster for this project" }
    }
    return execute[0]
}
const fetchTopHistory = async(user_Id, project_id) =>{
    const command = 'SELECT * FROM `Project_History` WHERE user_id=? AND Project_id=? ORDER BY id DESC LIMIT 5'
    const Values = [user_Id, project_id]
    const [execute] = await connection.query(command, Values) 
    return execute
}
startDB()
module.exports = { addClusterHistory, logClusterEvent, addCluster, addPlan, fetchCluster, fetchClusters, fetchHistory, fetchTopHistory }