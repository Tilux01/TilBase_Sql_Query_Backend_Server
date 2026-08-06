const checkAuth = require("./CheckAuth")
let connection
const makeConnection = require("../../SQLConnection")
const { addClusterHistory, addCluster, addPlan, fetchClusters, fetchCluster, fetchHistory } = require("./BasicClusterSql")
const startDB = async () => {
    makeConnection()
        .then((connect) => {
            connection = connect
        })
        .catch((error) => {
            console.log(error);
        })
}
const createCluster = async (req, res) => {
    try {
        const { user_id, user_key, project_id, project_key, Cluster_Name, Cluster_Password, Cluster_Type, Cluster_Key } = req.body
    if (!user_id || !user_key || !project_id || !project_key || !Cluster_Name || !Cluster_Password || !Cluster_Type || !Cluster_Key) {
        return res.status(400).json({ message: "Please provide all neccessary credentials" })
    }
    const auth = await checkAuth.Auth(user_id, user_key, project_id, project_key)
    console.log(auth, "hhh");
    
    if (auth?.error) {
        return res.status(400).json({ message: auth?.error })
    }
    const checkPlan = await checkAuth?.planAuth(user_id)
    console.log("checkPlan", checkPlan);
    if (checkPlan?.error) {
        return res.status(400).json({ message: checkPlan?.error })
    }
    
    const planAdd = await addPlan(checkPlan, user_id)
    if (planAdd?.error) {
        return res.status(400).json({message:planAdd?.error})
    }
    const checkClusterCommand = 'SELECT id FROM `Cluster_Table` WHERE Cluster_Key=?'
    const values = [Cluster_Key]
    const [executeCommand] = await connection.execute(checkClusterCommand, values)
    if (executeCommand?.length > 0) {
        return res.status(400).json({message: "A cluster with the key already exist"})
    }
    const clusterAdd = await addCluster(user_id, project_id, Cluster_Name, Cluster_Password, Cluster_Type, Cluster_Key)
    if (clusterAdd?.error) {
        return res.status(400).json({message: clusterAdd?.error})
    }
    const addHistory = await addClusterHistory(connection, user_id, project_id, Cluster_Name, Cluster_Key, auth)
    if (addHistory?.error) {
        return res.status(501).json({message:addHistory?.error})
    }
    const cluster = await fetchCluster(clusterAdd, project_id)
    const history = await fetchHistory(addHistory, project_id)
    return res.status(201).json({message: {cluster, history}})
    } catch (e) {
        console.error("Unhandled error in createCluster:", e)
        return res.status(500).json({message: "Internal Server Error: " + e.message})
    }
}
startDB()
module.exports = createCluster