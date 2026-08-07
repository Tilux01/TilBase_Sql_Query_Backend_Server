let connection
const { Auth } = require("../Actions/Cluster/CheckAuth")
const makeConnection = require("../SQLConnection")
const startDB = async () => {
    makeConnection()
    .then((connect)=>{
        connection = connect
    })  
    .catch((error)=>{
        console.log(error);
    })
}
const DBAuth = async(req, res) =>{
    console.log(req.body);
    const { profileKey, projectKey, clusterKey, dbUser, dbPassword, server, serverUrl, origin} = req.body
    let userId, ProjectId, clusterId = null
    if (!profileKey || !projectKey || !clusterKey || !dbUser || !dbPassword || !server || !serverUrl) return res.status(400).json({message: "Invalid/missing credentials provided"})     
    const checkUserCommand = 'SELECT id FROM `user_cred` WHERE profile_key=?'
    const checkUserValue = [profileKey]
    const [checkUser] = await connection.query(checkUserCommand, checkUserValue)
    if (checkUser?.length == 0) {
        return res.status(400).json({message: "Error, invalid user profile key"})
    }
    userId = checkUser[0]?.id
    console.log("here",userId);
    const checkProjectCommand = 'SELECT id,Server_Name FROM `Project_Table` WHERE Project_Key=? AND user_id=?'
    const checkProjectValue = [projectKey, userId]
    const [checkProject] = await connection.query(checkProjectCommand, checkProjectValue)
    if (checkProject?.length == 0) {
        return res.status(400).json({message: "Error, invalid user project key"})
    }
    if (checkProject[0]?.Server_Name != server) {
        console.log(checkProject[0]?.Server_Name);
        
        return res.status(400).json({message: "Server name error"})
    }
    ProjectId = checkProject[0]?.id
    console.log(ProjectId)
    const checkAuth = Auth(userId, profileKey, ProjectId, projectKey)
    if (checkAuth?.error) {
        console.log("ClausterAuth wrroe");
        return res.status(400).json({message: "Error, invalid cluster key or password"})
    }
    const checkClusterCommand = 'SELECT id, Cluster_Type, Current_State FROM `Cluster_Table` WHERE Cluster_Key=? AND project_id=? AND user_id=?'
    const values = [clusterKey, ProjectId, userId]
    const [executeCommand] = await connection.query(checkClusterCommand, values)
    if (executeCommand?.length == 0) {
        return res.status(400).json({message: 'Cluster key error'})
    }
    
    if (executeCommand[0]?.Current_State !== 'active') {
        return res.status(403).json({message: 'This cluster is currently paused and cannot accept connections.'})
    }
    
    
    const checkNetworkCommand = 'SELECT IP_Address FROM `Network_Access` WHERE project_id=?'
    const [networkRules] = await connection.query(checkNetworkCommand, [ProjectId])
    const allowedIps = networkRules.map(rule => rule.IP_Address);
    
    
    if (!allowedIps.includes('0.0.0.0/0') && !allowedIps.includes(origin)) {
        console.log(`Origin ${origin} not allowed. Allowed IPs:`, allowedIps);
        
        
        await connection.query('INSERT INTO Connection_Metrics (project_id, db_user, status) VALUES (?,?,?)', [ProjectId, dbUser || 'Unknown', 'Failed']);
        
        
        await connection.query('INSERT INTO Project_History (user_id, Project_id, History_Title, History_Description, Status, History_Type, Other_Stamp) VALUES (?,?,?,?,?,?,?)', [userId, ProjectId, 'Unauthorized Access Attempt', `Connection rejected from unwhitelisted IP: ${origin}`, 'Failed', 'Alert', '']);
        
        return res.status(400).json({message: "Origin not allowed"})
    }

    // Check Database Users
    const checkDbUserCommand = 'SELECT Role FROM `Database_Users` WHERE project_id=? AND DB_Username=? AND DB_Password=?'
    const [dbUserResult] = await connection.query(checkDbUserCommand, [ProjectId, dbUser, dbPassword])
    if (dbUserResult?.length === 0) {
        // Log to connection metrics as failed
        await connection.query('INSERT INTO Connection_Metrics (project_id, db_user, status) VALUES (?,?,?)', [ProjectId, dbUser, 'Failed']);
        
        await connection.query('INSERT INTO Project_History (user_id, Project_id, History_Title, History_Description, Status, History_Type, Other_Stamp) VALUES (?,?,?,?,?,?,?)', [userId, ProjectId, 'Authentication Failed', `Failed DB User login attempt for user: ${dbUser}`, 'Failed', 'Alert', '']);
        
        return res.status(400).json({message: "Invalid database username or password"})
    }
    const role = dbUserResult[0]?.Role

    clusterId = executeCommand[0]?.id
    const clusterType = executeCommand[0]?.Cluster_Type;
    console.log(clusterId, clusterType, role);
    
    // Log successful connection
    await connection.query('INSERT INTO Connection_Metrics (project_id, db_user, status) VALUES (?,?,?)', [ProjectId, dbUser, 'Success']);
    
    const jwt = require("jsonwebtoken");
    const JWT_SECRET = process.env.JWT_SECRET || "tilbase_super_secret_key_2026";
    const token = jwt.sign({ type: 'sdk', clusterId, role, userId, ProjectId }, JWT_SECRET);

    return res.status(201).json({message: {userId, ProjectId, clusterId, clusterType, role}, token})
}
startDB()
module.exports = DBAuth