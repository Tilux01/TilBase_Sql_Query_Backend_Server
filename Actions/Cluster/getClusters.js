const { fetchClusters } = require("./BasicClusterSql");
const { Auth } = require("./CheckAuth");

const getClusters = async(req, res) =>{
    console.log(req?.body);
    const {userId, Profile_Key, projectId, projectKey, page = 1 } = req.body
    const checkAuth = await Auth(userId,Profile_Key, projectId, projectKey)
    if (checkAuth?.error) {
        return res.status(400).json({message: "error validating param"})
    }
    const allClusters = await fetchClusters(projectId, page)
    console.log(allClusters);
    if (allClusters?.error) {
        return res.status(400).json({message: "Error getting clusters"})
    }
    return res.status(201).json({message: allClusters})
    
}

module.exports = getClusters