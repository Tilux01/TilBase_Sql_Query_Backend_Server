const { Auth } = require("../Cluster/CheckAuth");
const makeConnection = require("../../SQLConnection");

let connection;
const startDB = async () => {
    makeConnection()
        .then((connect) => {
            connection = connect;
        })
        .catch((error) => {
            console.log(error);
        });
};
startDB();

const getSecurityOverview = async (req, res) => {
    const { userId, Profile_Key, projectId, projectKey, page = 1 } = req.body;
    
    
    const checkAuth = await Auth(userId, Profile_Key, projectId, projectKey);
    if (checkAuth?.error) {
        return res.status(400).json({ message: "error validating param" });
    }

    try {
        
        const networkCommand = 'SELECT IP_Address FROM `Network_Access` WHERE project_id=?';
        const [networkResults] = await connection.execute(networkCommand, [projectId]);
        
        let globalAccessEnabled = false;
        const totalIPs = networkResults.length;
        
        for (let i = 0; i < networkResults.length; i++) {
            if (networkResults[i].IP_Address === '0.0.0.0/0') {
                globalAccessEnabled = true;
                break;
            }
        }

        
        const limit = 16;
        const offset = (page - 1) * 15;
        const historyCommand = `SELECT * FROM \`Project_History\` WHERE user_id=? AND Project_id=? ORDER BY id DESC LIMIT ${Number(limit)} OFFSET ${Number(offset)}`;
        const [historyResults] = await connection.execute(historyCommand, [userId, projectId]);

        return res.status(201).json({
            message: {
                totalIPs,
                globalAccessEnabled,
                auditLogs: historyResults
            }
        });
    } catch (error) {
        console.log("Error fetching security overview", error);
        return res.status(400).json({ message: "Error fetching security overview" });
    }
};

const regenerateProfileKey = async (req, res) => {
    const { userId } = req.body;
    if (!userId) return res.status(400).json({ message: "Invalid parameters" });

    try {
        const crypto = require("crypto");
        const newKey = crypto.randomUUID();
        const command = 'UPDATE `user_cred` SET Profile_Key=? WHERE id=?';
        await connection.execute(command, [newKey, userId]);
        return res.status(201).json({ message: newKey });
    } catch (error) {
        console.log("Error regenerating profile key", error);
        return res.status(400).json({ message: "Error regenerating profile key" });
    }
};

const regenerateProjectKey = async (req, res) => {
    const { userId, projectId, projectName, serverName, serverRegion } = req.body;
    if (!userId || !projectId) return res.status(400).json({ message: "Invalid parameters" });

    try {
        const crypto = require("crypto");
        const newKey = crypto.randomUUID();
        const command = 'UPDATE `Project_Table` SET Project_Key=? WHERE id=? AND user_id=?';
        await connection.execute(command, [newKey, projectId, userId]);

        
        const historyCommand = 'INSERT INTO Project_History (user_id, Project_id, History_Title, History_Description, Status, History_Type, Other_Stamp) VALUES (?,?,?,?,?,?,?)';
        const historyValues = [userId, projectId, `Project Key Regenerated`, `API Key for project "${projectName}" was regenerated`, 'Active', 'security', `ID: ${newKey}`];
        await connection.execute(historyCommand, historyValues);

        return res.status(201).json({ message: newKey });
    } catch (error) {
        console.log("Error regenerating project key", error);
        return res.status(400).json({ message: "Error regenerating project key" });
    }
};

module.exports = { getSecurityOverview, regenerateProfileKey, regenerateProjectKey };
