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
const deleteCluster = async(req, res) =>{
    try {
        console.log(req.body);
        const {user_Id, user_key, ProjectId, project_key, cluster_Key, cluster_Password, cluster_id} = req.body
        const CheckAuth = await ClusterAuth(user_Id, user_key, ProjectId, project_key, cluster_Key, cluster_Password, cluster_id)
        if (CheckAuth?.error) {
            return res.status(400).json({message:'Authentication failed'})
        } 
        const pauseCommand = 'DELETE FROM Cluster_Table WHERE id=?'
        const values = [cluster_id]
        const [execute] = await connection.query(pauseCommand, values)
        
        const updatePlanCommand = 'UPDATE Plan SET Total_Clusters = GREATEST(0, Total_Clusters - 1) WHERE user_id=?'
        await connection.query(updatePlanCommand, [user_Id])
        
        await logClusterEvent(connection, user_Id, ProjectId, `Cluster "${CheckAuth.cluster.Cluster_Name}" deleted`, `Cluster deletion successful on Project ${CheckAuth.projectName}`, 'clusterDelete', CheckAuth.cluster.Cluster_Key)
        
        res.status(201).json({message: cluster_id})
    } catch (error) {
        console.log(error);
        return res.status(501).json({message: "Error deleting clauster"})
    }  
}
module.exports = deleteCluster
startDB()