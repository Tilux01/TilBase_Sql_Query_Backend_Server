require("dotenv").config()
const express = require("express")
const app = express()
const cors = require("cors")
const http = require('http');
const { Server } = require("socket.io");

app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(cors())
const path = require('path');
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

const server = http.createServer(app);
const port = process.env.PORT || 4255
server.listen(port, () => {
    console.log("App running on port " + port);
})
const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});
const { initializeBroadcastEngine } = require("./Controllers/BroadcastController");
app.set('io', io);
initializeBroadcastEngine(io);

io.on('connection', (socket) => {
    console.log('A client connected via WebSocket');
    
    socket.on('join_cluster', (clusterId) => {
        socket.join(`cluster_${clusterId}`);
        console.log(`Client joined cluster room: cluster_${clusterId}`);
    });

    socket.on('chatbase_presence', (data) => {
        // data = { clusterId, userId, status }
        socket.to(`cluster_${data.clusterId}`).emit('user_presence_changed', data);
    });

    socket.on('chatbase_typing', (data) => {
        // data = { clusterId, channelId, userId, isTyping }
        socket.to(`cluster_${data.clusterId}`).emit('typing_status', data);
    });

    socket.on('chatbase_live_reaction', (data) => {
        // data = { clusterId, channelId, messageId, emoji }
        socket.to(`cluster_${data.clusterId}`).emit('live_reaction', data);
    });

    socket.on('chatbase_cursor', (data) => {
        // data = { clusterId, channelId, userId, coordinates }
        socket.to(`cluster_${data.clusterId}`).emit('cursor_moved', data);
    });

    socket.on('chatbase_register_user', (userId) => {
        socket.join(`user_${userId}`);
    });

    socket.on('webrtc_offer', (data) => {
        // data = { targetUserId, callerId, sdp, isVideo, clusterId }
        socket.to(`user_${data.targetUserId}`).emit('webrtc_incoming_call', data);
    });

    socket.on('webrtc_answer', (data) => {
        // data = { targetUserId, answerSdp, clusterId }
        socket.to(`user_${data.targetUserId}`).emit('webrtc_call_accepted', data);
    });

    socket.on('webrtc_ice_candidate', (data) => {
        // data = { targetUserId, candidate, clusterId }
        socket.to(`user_${data.targetUserId}`).emit('webrtc_ice_candidate_received', data);
    });

    socket.on('webrtc_reject', (data) => {
        // data = { targetUserId, clusterId }
        socket.to(`user_${data.targetUserId}`).emit('webrtc_call_rejected', data);
    });

    socket.on('disconnect', () => {
        console.log('Client disconnected from WebSocket');
        // Telemetry
        io.emit('telemetry_disconnect', { timestamp: Date.now() });
    });

    // Telemetry: track new connections
    io.emit('telemetry_connect', { timestamp: Date.now() });
});

const crypto = require("crypto");
const { sendOTP } = require("./Resend");
const { generateRandom } = require("./BasicFX");
const { fetchHistory, fetchProjects, getProjectDetail, getUserPlan, checkPlan, createProjectTable, planProjectAdd, addProjectHistory } = require("./Query_Commands")
const { connect } = require("http2");


let connection
const makeConnection = require("./SQLConnection")
const startDB = async () => {
    makeConnection()
    .then((connect)=>{
        connection = connect
    })  
    .catch((error)=>{
        console.log(error);
    })
}
console.log(connection);
const serverName = "TiluxM001"
const serverRegion = "Nigeria"
const auth = require("./Controllers/Authentication");
const createCluster = require("./Actions/Cluster/CreateCluster");
const { fetchTopHistory } = require("./Actions/Cluster/BasicClusterSql");
const getClusters = require("./Actions/Cluster/getClusters");
const chatbaseRouter = require("./Routes/ChatbaseRoutes");
const pauseCluster = require("./Actions/Cluster/PauseCluster");
const resumeCluster = require("./Actions/Cluster/ResumeCluster");
const deleteCluster = require("./Actions/Cluster/DeleteClusuter");
const DBAuth = require("./Node Commands/DBAuth");
const { fetchNetworkRules, addNetworkRule, deleteNetworkRule } = require("./Actions/NetworkAccess/NetworkRoutes");
const { fetchDbUsers, addDbUser, deleteDbUser } = require("./Actions/DatabaseAccess/DatabaseRoutes");
const { getSecurityOverview, regenerateProfileKey, regenerateProjectKey } = require("./Actions/Security/SecurityRoutes");
const { getMonitoringData } = require("./Actions/Monitoring/MonitoringRoutes");
const { getBackups, createBackup, deleteBackup, downloadBackup } = require("./Actions/Backup/BackupRoutes");
const { getPerformanceData, logQueryMetric } = require("./Actions/Performance/PerformanceRoutes");
const { upgradePlan, fetchInvoices } = require("./Actions/Billing/PaymentRoutes");
const { updateProfile, updateWorkspace, deleteAccount, deleteProject, getCloudinarySignature } = require("./Actions/Settings/SettingsRoutes");
const { createSupportTicket, fetchSupportTickets, fetchAllSupportTickets, updateTicketStatus, adminSignIn } = require("./Actions/Support/SupportRoutes");
const { getCollections, getDocuments, getDocumentData, setDocumentData, deleteDocument, updateDocument, findDocuments, countDocuments, bulkSaveDocuments, batchWrite } = require("./Controllers/DocumentExplorerController");
const { getNamespaces, getVectors, upsertVector, deleteVector, semanticSearch } = require("./Controllers/VectorController");
const { getBuckets, getKeys, getValue, setValue, deleteKey, deleteBucket, increment } = require("./Controllers/FlatController");
const { addNode, getChildren, getAncestors, updateNode, deleteNode, moveNode, searchNodes, countChildren, batchWrite: hierarchicalBatchWrite, bulkUpdate, bulkDelete } = require("./Controllers/HierarchicalController");
const { getCollections: realtimeGetCollections, getDocuments: realtimeGetDocuments, getDocumentData: realtimeGetDocumentData, setDocumentData: realtimeSetDocumentData, deleteDocument: realtimeDeleteDocument } = require("./Controllers/RealtimeController");
const { 
    addNode: graphAddNode, 
    updateNode: graphUpdateNode, 
    deleteNode: graphDeleteNode, 
    addEdge, 
    updateEdge,
    deleteEdge, 
    getGraph, 
    getNeighbors,
    queryGraph,
    clearGraph
} = require("./Controllers/GraphController");
const jwt = require("jsonwebtoken");
const JWT_SECRET = process.env.JWT_SECRET || "tilbase_super_secret_key_2026";
const apiGuard = require("./Middleware/apiGuard");

app.post("/api/auth", auth)


app.get("/", (req, res) => {
    res.send("Welcome To TilBase")
})
app.get("/ping", async (req, res) => {
    try {
        if (connection) {
            await connection.query("SELECT 1");
            console.log("pinged successfully");
            res.status(200).json({message: "pinged"})
        } else {
            console.log("ping failed: No DB connection");
            res.status(503).json({message: "Service Unavailable: No DB connection"})
        }
    } catch (error) {
        console.log("ping failed", error);
        res.status(500).json({message: "ping failed", error})
    }
})

app.post("/devSignUp", async (req, res) => {
    console.log("Got a request");
    const mail = req.body?.mail
    const password = req.body?.password
    const userName = req.body?.userName
    const profileImg = req.body?.profileImg
    if (!mail || mail.trim() == "") {
        res.status(501).json({ message: "Error, Invalid mail" })
        return
    }
    if (!password || password.trim() == "") {
        res.status(501).json({ message: "Error, Invalid Password" })
        return
    }
    if (!userName || userName.trim() == "") {
        res.status(501).json({ message: "Error, username error" })
        return
    }
    try {
        const checkQuery = 'SELECT * FROM user_cred WHERE Email=?';
        const [existingUser] = await connection.query(checkQuery, [mail]);
        if (existingUser.length > 0) {
            const userCred = existingUser[0];
            if (userCred?.Auth_Provider && userCred.Auth_Provider !== 'local') {
                const provider = userCred.Auth_Provider.charAt(0).toUpperCase() + userCred.Auth_Provider.slice(1);
                return res.status(501).json({ message: `This email is already registered. Please sign in using your ${provider} account.` });
            } else {
                return res.status(501).json({ message: "User with this email already exists, please sign in." });
            }
        }

        const addDevUser = 'INSERT INTO user_cred(Email, Password, UserName, Profile_Key) VALUES(?, ?, ?, ?)'
        const Profile_Key = crypto.randomUUID()
        const values = [mail, password, userName, Profile_Key]
        try {
            const [result] = await connection.query(addDevUser, values);
            console.log("Created User with Id of: ", result.insertId);
            const sendRequest = await sendOTP(mail)
            if (sendRequest) {
                const addOTP = `INSERT INTO OTP_Table (user_id, OTP_Code,  email_address) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE OTP_Code = ?`
                const values = [result.insertId, sendRequest, mail, sendRequest]
                try {
                    const [OTPResult] = await connection.query(addOTP, values)
                    console.log("OTP Result", OTPResult);
                    const planCommand = 'INSERT INTO Plan (user_id) VALUES (?)'
                    const planValue = [result.insertId]
                    try {
                        const [planAdd] = await connection.query(planCommand, planValue)
                        res.status(201).json({ message: result.insertId })
                    } catch (error) {
                        res.status(501).json({ message: "Error creating user plan" })
                        console.log("Error creatign user plan", error);

                    }
                } catch (error) {
                    res.status(501).json({ message: "Error saving OTP" })
                    console.log("error saving OTP to databse", error);
                }
            }
        } catch (error) {
            console.log("Error saving user cred", error);
            res.status(501).json({ message: "Error saving user cred" });
        }
    } catch (error) {
        res.status(501).json({ message: "Server error, please try again later" })
        console.log("MySql connection error", error);
        return;
    }
})

app.post("/resendOTP", async (req, res) => {
    console.log("request recieved");
    const mail = req.body?.mail
    const id = req.body?.id
    console.log(mail);
    const sendRequest = await sendOTP(mail)
    if (sendRequest) {
        const addOTP = `INSERT INTO OTP_Table (user_id, OTP_Code,  email_address) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE OTP_Code = ?`
        const values = [id, sendRequest, mail, sendRequest]
        try {
            const [OTPResult] = await connection.query(addOTP, values)
            console.log("OTP Result", OTPResult);
        } catch (error) {
            res.status(501).json({ message: "Server error, please try again later" })
            console.log("error saving OTP to databse", error);
        }
    }
})

app.post("/confirmOTP", async (req, res) => {
    const mail = req.body.mail
    const id = req.body.id
    const OTP = req.body.OTP
    console.log(id, mail, OTP);

    if (!mail || !id || !OTP) {
        res.status(501).json({ message: "Please provide all parameters" })
        return
    }
    try {
        const query = 'SELECT OTP_Code FROM `OTP_Table` WHERE user_id=? AND email_address=?'
        const values = [id, mail]
        const [result] = await connection.query(query, values)
        console.log("Real-OTP", result[0]);
        if (result[0]?.OTP_Code == OTP) {
            const verifyAccount = 'UPDATE user_cred SET Verified=true WHERE id=?'
            const idValue = [id]
            try {
                const [verifyResult] = await connection.query(verifyAccount, idValue)
                console.log(verifyResult);
                const query = 'SELECT * FROM user_cred WHERE Email=?;'
                const values = [mail]
                try {
                    const [userCred] = await connection.query(query, values)
                    if (userCred.length > 0) {
                        try {
                            const getPlanCommand = 'SELECT * FROM Plan WHERE user_id=?'
                            const getPlanValue = [userCred[0]?.id]
                            const [getPlan] = await connection.query(getPlanCommand, getPlanValue)
                            const token = jwt.sign({ type: 'dashboard', userId: userCred[0].id }, JWT_SECRET);
                            res.status(201).json({ message: userCred[0], getPlan: getPlan[0], token })
                        } catch (error) {
                            res.status(501).json({ message: "Error getting user plan" })
                            console.log("Error getting user plan", error);
                        }
                    }
                    else {
                        res.status(501).json({ message: "Error, no user with the email" })
                    }
                } catch (error) {
                    console.log(error);

                    res.status(501).json({ message: "Error getting user credentials" })
                }
            } catch (error) {
                res.status(501).json({ message: "Error updating verification, please try again later" })
                console.log(error);

            }
        }
        else {
            res.status(501).json({ message: "Error, Incorrect OTP" })
        }

    } catch (error) {
        res.status(501).json({ message: "Server error, please try again later" })
        console.log(error);

    }

})

app.post("/devSignIn", async (req, res) => {
    console.log(req.body);
    const mail = req.body?.mail
    const password = req.body?.password
    if (!mail || !password) {
        res.status(501).json({ message: "Please provide all the necessary parameters" })
        return
    }
    const query = 'SELECT * FROM user_cred WHERE Email=?;'
    const values = [mail]
    try {
        const [result] = await connection.query(query, values)
        if (result.length > 0) {
            const userCred = result[0]
            if (userCred?.Password == password) {
                try {
                    const getPlanCommand = 'SELECT * FROM Plan WHERE user_id=?'
                    const getPlanValue = [userCred?.id]
                    const [getPlan] = await connection.query(getPlanCommand, getPlanValue)
                    const token = jwt.sign({ type: 'dashboard', userId: userCred.id }, JWT_SECRET);
                    res.status(201).json({ message: userCred, getPlan: getPlan[0], token })
                } catch (error) {
                    res.status(501).json({ message: "Error getting user plan" })
                    console.log("Error getting user plan", error);
                }
            }
            else {
                if (userCred?.Auth_Provider && userCred.Auth_Provider !== 'local') {
                    const provider = userCred.Auth_Provider.charAt(0).toUpperCase() + userCred.Auth_Provider.slice(1);
                    res.status(501).json({ message: `Please sign in using your ${provider} account.` })
                } else {
                    res.status(501).json({ message: "Incorrect Password" })
                }
            }
        }
        else {
            res.status(501).json({ message: "Their is no account with the email provided" })
        }
        console.log(result);
    }
    catch (error) {
        console.log(error);

        res.status(501).json({ message: "Server error, please try again" })
    }
})

app.post("/oauthSignIn", async (req, res) => {
    console.log("OAuth Sign In:", req.body);
    const { email, displayName, photoURL, providerId, uid } = req.body;

    if (!email) {
        return res.status(501).json({ message: "Please provide all the necessary parameters from OAuth" });
    }

    try {
        const query = 'SELECT * FROM user_cred WHERE Email=?;';
        const [result] = await connection.query(query, [email]);

        let userCred;

        if (result.length > 0) {
            userCred = result[0];
            
            if (userCred.Verified != 1) {
                await connection.query('UPDATE user_cred SET Verified=1 WHERE id=?', [userCred.id]);
                userCred.Verified = 1;
            }
        } else {
            const profileKey = crypto.randomUUID();
            const insertQuery = `INSERT INTO user_cred(Email, Password, UserName, Profile_Key, Verified, Profile_Img, Auth_Provider, Provider_ID) 
                                 VALUES(?, NULL, ?, ?, 1, ?, ?, ?)`;
            const [insertResult] = await connection.query(insertQuery, [
                email, displayName, profileKey, photoURL || 'https://cdn-icons-png.flaticon.com/128/456/456212.png', providerId, uid
            ]);
            
            const [newResult] = await connection.query(query, [email]);
            userCred = newResult[0];

            const planCommand = 'INSERT INTO Plan(user_id) VALUES(?)';
            await connection.query(planCommand, [userCred.id]);
        }

        const getPlanCommand = 'SELECT * FROM Plan WHERE user_id=?';
        const [getPlan] = await connection.query(getPlanCommand, [userCred.id]);
        const token = jwt.sign({ type: 'dashboard', userId: userCred.id }, JWT_SECRET);
        res.status(201).json({ message: userCred, getPlan: getPlan[0], token });

    } catch (error) {
        console.error("OAuth error:", error);
        res.status(501).json({ message: "Server error, please try again" });
    }
});

// Core Functionalities
app.post("/create-project", async (req, res) => {
    console.log(req.body);
    const userId = req.body?.userId
    const ProjectName = req.body?.ProjectName
    const ProjectKey = req.body?.ProjectKey
    const ProjectType = req.body?.ProjectType
    const projectDescription = req.body?.projectDescription
    const Environment = req.body?.Environment
    const ProjectPlan = req.body?.ProjectPlan
    if (!userId || !ProjectName || !ProjectKey || !ProjectType || !projectDescription || !Environment || !ProjectPlan) {
        res.status(501).json({ message: "Please provide all necessary credentials" })
        console.log("information not provided");
        return
    }
    if (ProjectPlan != "free") {
        const planCheck = await checkPlan(connection, userId, ProjectPlan)
        if (planCheck?.error) {
            res.status(501).json({message: planCheck?.error})
            return
        }
    }
    const projectPlanAdd = await planProjectAdd(connection, userId)
    if (projectPlanAdd?.error) {
        res.status(501).json({message: projectPlanAdd?.error})
        return
    }
    const ProjectResult = await createProjectTable(connection, userId, ProjectName, projectDescription, Environment, ProjectKey, serverName, serverRegion, ProjectType, ProjectPlan)
    if (ProjectResult?.error) {
        res.status(501).json({message: ProjectResult?.error})
        return
    }
    const ProjectResultId = ProjectResult?.insertId
    const addHistory = addProjectHistory(connection, userId, ProjectResultId, ProjectName, serverName, serverRegion, ProjectKey)
    if (addHistory?.error) {
        res.status(501).json({message: addHistory?.error})
        return
    }
    const History = await fetchHistory(connection, userId, ProjectResultId)
    const AllProject = await fetchProjects(connection, userId)
    const fetchProject = await getProjectDetail(connection, userId, ProjectResultId)
    if (fetchProject == "Project Validation error") {
        res.status(501).json({ message: "Project validation error, please provide necessary parameters" })
        return
    }
    const Plan = await getUserPlan(connection, userId)
    if (Plan?.error) {
        res.status(501).json({message: Plan?.error})
        return
    }
    console.log("Plan", Plan);
    
    res.status(201).json({ message: History, AllProject, fetchProject, Plan })
})

app.post("/getProjects", async (req, res) => {
    console.log(req.body);
    const id = req.body?.id
    const Profile_Key = req.body?.profileKey
    if (!id || !Profile_Key) {
        res.status(501).json({ message: "Please provide all parameters" })
        return
    }
    const userCredCommand = 'SELECT id,Profile_Key FROM `user_cred` WHERE id=?'
    const userCredValue = [id]
    try {
        const [result] = await connection.query(userCredCommand, userCredValue)
        console.log(result);
        if (result.length == 0) {
            res.status(501).json({ message: "invalid id given, please provide correct id and profile_Key" })
            return
        }
        try {
            const fetchAll = await fetchProjects(connection, id)
            if (fetchAll.length == 0) {
                res.status(501).json({ message: "Empty project" })
                console.log("Empty project");
                return
            }
            const getCurrentProject = await getProjectDetail(connection, id, fetchAll[fetchAll.length - 1]?.id)
            if (!getCurrentProject || getCurrentProject == {}) {
                res.status(501).json({ message: "Error fetching project details" })
                return
            }
            const getHistory = await fetchHistory(connection, id, fetchAll[fetchAll.length - 1]?.id)
            const getPlan = await getUserPlan(connection, id)
            if (getPlan?.error) {
                res.status(501).json({ message: error })
                return
            }
            res.status(201).json({ message: { AllProject: fetchAll, currentProject: getCurrentProject, projectHistory: getHistory, Plan: getPlan } })
        } catch (error) {
            res.status(501).json({ message: "Error fetching projects" })
            console.log("Error fetching projects", error);

        }

    } catch (error) {
        res.status(501).json({ message: "Error fetching user credentials" })
        console.log(error);
    }

})

app.post('/adminSignIn', adminSignIn);

// Graph Engine Routes
app.post('/api/graphExplorer/addNode', apiGuard, graphAddNode);
app.post('/api/graphExplorer/updateNode', apiGuard, graphUpdateNode);
app.post('/api/graphExplorer/deleteNode', apiGuard, graphDeleteNode);
app.post('/api/graphExplorer/addEdge', apiGuard, addEdge);
app.post('/api/graphExplorer/updateEdge', apiGuard, updateEdge);
app.post('/api/graphExplorer/deleteEdge', apiGuard, deleteEdge);
app.post('/api/graphExplorer/getGraph', apiGuard, getGraph);
app.post('/api/graphExplorer/getNeighbors', apiGuard, getNeighbors);
app.post('/api/graphExplorer/queryGraph', apiGuard, queryGraph);
app.post('/api/graphExplorer/clearGraph', apiGuard, clearGraph);

app.use('/api/chatbase', chatbaseRouter);
app.use('/admin/v1', chatbaseRouter);

// Document Explorer Routes
app.post('/api/documentExplorer/getCollections', apiGuard, getCollections);
app.post('/api/documentExplorer/getDocuments', apiGuard, getDocuments);
app.post('/api/documentExplorer/getDocumentData', apiGuard, getDocumentData);
app.post('/api/documentExplorer/setDocumentData', apiGuard, setDocumentData);
app.post('/api/documentExplorer/deleteDocument', apiGuard, deleteDocument);
app.post('/api/documentExplorer/updateDocument', apiGuard, updateDocument);
app.post('/api/documentExplorer/findDocuments', apiGuard, findDocuments);
app.post('/api/documentExplorer/countDocuments', apiGuard, countDocuments);
app.post('/api/documentExplorer/bulkSaveDocuments', apiGuard, bulkSaveDocuments);
app.post('/api/documentExplorer/batchWrite', apiGuard, batchWrite);

app.post("/createCluster", createCluster)
app.post("/fetchClusters", getClusters)
app.post("/pauseCluster", pauseCluster)
app.post("/resumeCluster", resumeCluster)
app.post("/deleteCluster", deleteCluster)
app.post("/moduleAuth", DBAuth )

// History
app.post("/fetchHistory", async (req, res) => {
    const { userId, Profile_Key, projectId, projectKey, page = 1 } = req.body;
    if (!userId || !Profile_Key || !projectId || !projectKey) {
        return res.status(501).json({ message: "Missing parameters" });
    }
    const checkUserCommand = 'SELECT id FROM `user_cred` WHERE id=? AND Profile_Key=?';
    const [checkUser] = await connection.query(checkUserCommand, [userId, Profile_Key]);
    if (checkUser.length === 0) return res.status(501).json({ message: "Auth failed" });
    
    const checkProjectCommand = 'SELECT id FROM `Project_Table` WHERE id=? AND Project_Key=? AND user_id=?';
    const [checkProject] = await connection.query(checkProjectCommand, [projectId, projectKey, userId]);
    if (checkProject.length === 0) return res.status(501).json({ message: "Auth failed" });
    
    const History = await fetchHistory(connection, userId, projectId, page);
    res.status(200).json({ message: History });
});

app.post("/markHistoryRead", async (req, res) => {
    const { userId, Profile_Key, projectId, projectKey, historyIds } = req.body;
    if (!userId || !Profile_Key || !projectId || !projectKey || !historyIds || !Array.isArray(historyIds)) {
        return res.status(501).json({ message: "Missing parameters" });
    }
    try {
        const checkUserCommand = 'SELECT id FROM `user_cred` WHERE id=? AND Profile_Key=?';
        const [checkUser] = await connection.query(checkUserCommand, [userId, Profile_Key]);
        if (checkUser.length === 0) return res.status(501).json({ message: "Auth failed" });
        
        const checkProjectCommand = 'SELECT id FROM `Project_Table` WHERE id=? AND Project_Key=? AND user_id=?';
        const [checkProject] = await connection.query(checkProjectCommand, [projectId, projectKey, userId]);
        if (checkProject.length === 0) return res.status(501).json({ message: "Auth failed" });

        if (historyIds.length > 0) {
            const placeholders = historyIds.map(() => '?').join(',');
            const updateCommand = `UPDATE \`Project_History\` SET is_read = 1 WHERE user_id=? AND Project_id=? AND id IN (${placeholders})`;
            await connection.query(updateCommand, [userId, projectId, ...historyIds]);
        }
        res.status(200).json({ message: "Success" });
    } catch (err) {
        console.error(err);
        res.status(501).json({ message: "Failed to mark read" });
    }
});

// Network Access
app.post("/fetchNetworkRules", fetchNetworkRules)
app.post("/addNetworkRule", addNetworkRule)
app.post("/deleteNetworkRule", deleteNetworkRule)

// Database Access
app.post("/fetchDbUsers", fetchDbUsers)
app.post("/addDbUser", addDbUser)
app.post("/deleteDbUser", deleteDbUser)

// Security
app.post("/getSecurityOverview", getSecurityOverview)
app.post("/regenerateProfileKey", regenerateProfileKey)
app.post("/regenerateProjectKey", regenerateProjectKey)

// Monitoring
app.post("/getMonitoringData", getMonitoringData)

// Backup
app.post("/getBackups", getBackups)
app.post("/createBackup", createBackup)
app.post("/deleteBackup", deleteBackup)
app.get("/downloadBackup/:id", downloadBackup)

// Performance
app.post("/getPerformanceData", getPerformanceData)
app.post("/logQueryMetric", logQueryMetric)

// Billing
app.post("/upgradePlan", upgradePlan)
app.post("/fetchInvoices", fetchInvoices)

// Settings
app.post("/updateProfile", updateProfile)
app.post("/updateWorkspace", updateWorkspace)
app.post("/deleteAccount", deleteAccount)
app.post("/deleteProject", deleteProject)
app.get("/getCloudinarySignature", getCloudinarySignature)

// Support and Admin
app.post("/createSupportTicket", createSupportTicket)
app.post("/fetchSupportTickets", fetchSupportTickets)
app.post("/fetchAllSupportTickets", fetchAllSupportTickets)
app.post("/updateTicketStatus", updateTicketStatus)
app.post("/adminSignIn", adminSignIn)

// Vector Explorer API
app.post("/api/vectorExplorer/getNamespaces", apiGuard, getNamespaces);
app.post("/api/vectorExplorer/getVectors", apiGuard, getVectors);
app.post("/api/vectorExplorer/upsertVector", apiGuard, upsertVector);
app.post("/api/vectorExplorer/deleteVector", apiGuard, deleteVector);
app.post("/api/vectorExplorer/semanticSearch", apiGuard, semanticSearch);

// ========================
// FLAT DB API
// ========================
app.post("/api/flatExplorer/getBuckets", apiGuard, getBuckets);
app.post("/api/flatExplorer/getKeys", apiGuard, getKeys);
app.post("/api/flatExplorer/getValue", apiGuard, getValue);
app.post("/api/flatExplorer/setValue", apiGuard, setValue);
app.post("/api/flatExplorer/deleteKey", apiGuard, deleteKey);
app.post("/api/flatExplorer/deleteBucket", apiGuard, deleteBucket);
app.post("/api/flatExplorer/increment", apiGuard, increment);

// ========================
// HIERARCHICAL DB API
// ========================
app.post("/api/hierarchicalExplorer/addNode", apiGuard, addNode);
app.post("/api/hierarchicalExplorer/getChildren", apiGuard, getChildren);
app.post("/api/hierarchicalExplorer/getAncestors", apiGuard, getAncestors);
app.post("/api/hierarchicalExplorer/updateNode", apiGuard, updateNode);
app.post("/api/hierarchicalExplorer/deleteNode", apiGuard, deleteNode);
app.post("/api/hierarchicalExplorer/moveNode", apiGuard, moveNode);
app.post("/api/hierarchicalExplorer/searchNodes", apiGuard, searchNodes);
app.post("/api/hierarchicalExplorer/countChildren", apiGuard, countChildren);
app.post("/api/hierarchicalExplorer/batchWrite", apiGuard, hierarchicalBatchWrite);
app.post("/api/hierarchicalExplorer/bulkUpdate", apiGuard, bulkUpdate);
app.post("/api/hierarchicalExplorer/bulkDelete", apiGuard, bulkDelete);

// ========================
// REALTIME DB API
// ========================
app.post("/api/realtimeExplorer/getCollections", apiGuard, realtimeGetCollections);
app.post("/api/realtimeExplorer/getDocuments", apiGuard, realtimeGetDocuments);
app.post("/api/realtimeExplorer/getDocumentData", apiGuard, realtimeGetDocumentData);
app.post("/api/realtimeExplorer/setDocumentData", apiGuard, realtimeSetDocumentData);
app.post("/api/realtimeExplorer/deleteDocument", apiGuard, realtimeDeleteDocument);

module.exports = connection
startDB()
