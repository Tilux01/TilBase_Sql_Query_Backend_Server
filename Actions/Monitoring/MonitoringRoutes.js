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

const getMonitoringData = async (req, res) => {
    const { userId, Profile_Key, projectId, projectKey, page = 1 } = req.body;
    
    
    const checkAuth = await Auth(userId, Profile_Key, projectId, projectKey);
    if (checkAuth?.error) {
        return res.status(400).json({ message: "error validating param" });
    }

    try {
        
        const clusterCommand = 'SELECT id, Cluster_Name, Cluster_Type, Current_State FROM `Cluster_Table` WHERE project_id=?';
        const [clusters] = await connection.execute(clusterCommand, [projectId]);

        
        
        const metricsCommand = `
            SELECT 
                DATE(created_at) as date,
                SUM(CASE WHEN status = 'Success' THEN 1 ELSE 0 END) as successful_connections,
                SUM(CASE WHEN status = 'Failed' THEN 1 ELSE 0 END) as failed_connections
            FROM Connection_Metrics 
            WHERE project_id=? AND created_at >= DATE_SUB(NOW(), INTERVAL 7 DAY)
            GROUP BY DATE(created_at)
            ORDER BY date ASC
        `;
        const [metrics] = await connection.execute(metricsCommand, [projectId]);

        
        const limit = 16;
        const offset = (page - 1) * 15;
        const alertsCommand = `SELECT * FROM \`Project_History\` WHERE Project_id=? AND History_Type=? ORDER BY id DESC LIMIT ${Number(limit)} OFFSET ${Number(offset)}`;
        const [alerts] = await connection.execute(alertsCommand, [projectId, 'Alert']);

        return res.status(201).json({
            message: {
                clusters,
                metrics,
                alerts
            }
        });
    } catch (error) {
        console.log("Error fetching monitoring data", error);
        return res.status(400).json({ message: "Error fetching monitoring data" });
    }
};

module.exports = { getMonitoringData };
