let connection
const makeConnection = require("../../SQLConnection")
const startDB = async () => {
    makeConnection()
    .then((connect)=>{
        connection = connect
    })  
    .catch((error)=>{
        console.log(error);
    })
}
const Auth = async(userId, user_key, ProjectId, project_key) =>{
    const checkUserCommand = 'SELECT id FROM `user_cred` WHERE id=? AND profile_key=?'
    const checkUserValue = [userId, user_key]
    const [checkUser] = await connection.query(checkUserCommand, checkUserValue)
    if (checkUser?.length == 0) {
        return {error: "Auth failed"}
    }
    const checkProjectCommand = 'SELECT Project_Name FROM `Project_Table` WHERE id=? AND Project_Key=? AND user_id=?'
    const checkProjectValue = [ProjectId, project_key, userId]
    const [checkProject] = await connection.query(checkProjectCommand, checkProjectValue)
    if (checkProject?.length == 0) {
        return {error: "Auth failed"}
    }
    return checkProject[0]?.Project_Name
}
const planAuth = async(userId) =>{
    const command  = 'SELECT id FROM `Plan` WHERE user_id=? AND Highest_CLusters > Total_Clusters'
    const value = [userId]
    const [executeCommand] = await connection.query(command, value)    
    if (executeCommand.length == 0) {
        return {error: "Maximum Plan exceeded"}
    }
    return executeCommand[0]?.id
}
const ClusterAuth = async(userId, user_key, ProjectId, project_key, cluster_Key, cluster_Password, cluster_id) =>{
    const checkAuth = await Auth(userId, user_key, ProjectId, project_key)
    if (checkAuth?.error) {
        return {error: "Authentication failed"}
    }
    const checkClusterCommand = 'SELECT * FROM `Cluster_Table` WHERE id=? AND Cluster_Key=? AND Cluster_Password=?'
    const values = [cluster_id, cluster_Key, cluster_Password]
    const [executeCommand] = await connection.query(checkClusterCommand, values)
    if (executeCommand?.length === 0) {
        return {error: "Cluster not found"}
    }
    return { cluster: executeCommand[0], projectName: checkAuth }
}
startDB()
module.exports = {Auth, planAuth, ClusterAuth}