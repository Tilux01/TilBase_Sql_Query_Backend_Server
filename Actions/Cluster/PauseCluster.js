const { ClusterAuth } = require("./CheckAuth");
const makeConnection = require("../../SQLConnection");
const { fetchCluster, logClusterEvent } = require("./BasicClusterSql");
let connection
const startDB = async () => {
    makeConnection()
    .then((connect)=>{
        connection = connect
    })  
    .catch((error)=>{
        console.log(error);
    })
}
const pauseCluster = async(req, res) =>{
    try {
        console.log(req.body);
        const {user_Id, user_key, ProjectId, project_key, cluster_Key, cluster_Password, cluster_id} = req.body
        const CheckAuth = await ClusterAuth(user_Id, user_key, ProjectId, project_key, cluster_Key, cluster_Password, cluster_id)
        if (CheckAuth?.error) {
            return res.status(400).json({message:'Authentication failed'})
        } 
        const pauseCommand = 'UPDATE Cluster_Table SET Current_State=? WHERE id=?'
        const values = ["paused", cluster_id]
        const [execute] = await connection.query(pauseCommand, values)
        
        await logClusterEvent(connection, user_Id, ProjectId, `Cluster "${CheckAuth.cluster.Cluster_Name}" paused`, `Cluster was paused on Project ${CheckAuth.projectName}`, 'clusterPause', CheckAuth.cluster.Cluster_Key)
        
        const getCluster = await fetchCluster(cluster_id, ProjectId)
        console.log(getCluster);
        res.status(201).json({message: getCluster})
    } catch (error) {
        console.log(error);
        return res.status(501).json({message: "Error pausing clauster"})
    }  
}
module.exports = pauseCluster
startDB()