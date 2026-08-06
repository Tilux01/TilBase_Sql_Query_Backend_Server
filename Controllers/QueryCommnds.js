const makeConnection = require("../SQLConnection")
let connection
makeConnection()
.then((output)=>{
    connection = output
})
.catch((error)=>{
    console.log(error);
    
})
const verifyUser = async(user_Id, profile_Key, Project_Key, Cluster_Id) =>{
    const command = 'SELECT id FROM user_cred WHERE id=? AND Profile_Key=?'
    const values = [user_Id, profile_Key]
    const [verify] = await connection.execute(command, values)
    if (verify?.length == 0) {
        return {error: "Invalid user account"}
    }
    const findProject = 'SELECT id FROM Project_Table WHERE Project_Key=? && user_id=?'
    const findProjectvalues = [Project_Key, user_Id]
    const [checkProject] = await connection.execute(findProject, findProjectvalues)
    console.log(checkProject);
    if (checkProject?.length == 0) {
        return {error: "No project with the project key"}
    }
}
module.exports = verifyUser