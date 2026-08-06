const { connectionAuth } = require("../Query_Commands")
let connection
const makeConnection = require("../SQLConnection")
const startDB = async () => {
    makeConnection()
        .then((connect) => {
            connection = connect
        })
        .catch((error) => {
            console.log(error);
        })
}
const verifyConnection = (req, res)=>{
    const {user_Id, profile_Key, Project_Id, Project_Key, Cluster_Key, Cluster_Password} = req.body
    if (!user_Id || !profile_Key || !Project_Id || !Project_Key || !Cluster_Key || !Cluster_Password) {
        return res.status(400).json({message: "Please provide all credentials"})
    }
    const verify = connectionAuth(connection, user_Id, profile_Key, Project_Id, Project_Key, Cluster_Key, Cluster_Password)
}
startDB()
module.exports = verifyConnection