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

const getPerformanceData = async (req, res) => {
    const { userId, Profile_Key, projectId, projectKey } = req.body;
    
    
    const checkAuth = await Auth(userId, Profile_Key, projectId, projectKey);
    if (checkAuth?.error) {
        return res.status(400).json({ message: "error validating param" });
    }

    try {
        
        const clusterLatencyCommand = `
            SELECT 
                c.id, 
                c.Cluster_Name, 
                c.Cluster_Type, 
                COALESCE(AVG(q.execution_time_ms), 0) as avg_latency
            FROM \`Cluster_Table\` c
            LEFT JOIN \`Query_Metrics\` q ON c.id = q.cluster_id 
                AND q.created_at >= DATE_SUB(NOW(), INTERVAL 1 HOUR)
            WHERE c.project_id = ?
            GROUP BY c.id
        `;
        const [clusterLatencies] = await connection.query(clusterLatencyCommand, [projectId]);

        
        const throughputCommand = `
            SELECT 
                SUM(CASE WHEN query_type = 'Read' THEN 1 ELSE 0 END) as read_count,
                SUM(CASE WHEN query_type = 'Write' THEN 1 ELSE 0 END) as write_count
            FROM \`Query_Metrics\`
            WHERE project_id = ? AND created_at >= DATE_SUB(NOW(), INTERVAL 1 HOUR)
        `;
        const [throughput] = await connection.query(throughputCommand, [projectId]);

        
        const trendCommand = `
            SELECT 
                DATE(created_at) as date,
                AVG(execution_time_ms) as avg_latency
            FROM \`Query_Metrics\`
            WHERE project_id = ? AND created_at >= DATE_SUB(NOW(), INTERVAL 7 DAY)
            GROUP BY DATE(created_at)
            ORDER BY date ASC
        `;
        const [latencyTrend] = await connection.query(trendCommand, [projectId]);

        return res.status(200).json({
            message: {
                clusters: clusterLatencies,
                throughput: throughput[0] || { read_count: 0, write_count: 0 },
                trend: latencyTrend
            }
        });
    } catch (error) {
        console.error("Error fetching performance data", error);
        return res.status(400).json({ message: "Error fetching performance data" });
    }
};

const logQueryMetric = async (req, res) => {
    const { projectId, clusterId, queryType, executionTimeMs } = req.body;
    
    if (!projectId || !clusterId || !queryType || executionTimeMs === undefined) {
        return res.status(400).json({ message: "Missing metric parameters" });
    }

    try {
        const insertCommand = 'INSERT INTO `Query_Metrics` (project_id, cluster_id, query_type, execution_time_ms) VALUES (?, ?, ?, ?)';
        await connection.query(insertCommand, [projectId, clusterId, queryType, executionTimeMs]);
        
        const io = req.app.get('io');
        if (io) {
            const payload = {
                clusterId,
                queryType,
                executionTimeMs,
                timestamp: new Date().toISOString()
            };
            io.to(`cluster_${clusterId}`).emit('metricUpdate', payload);
            io.to(`cluster_${projectId}`).emit('metricUpdate', payload);
        }

        return res.status(200).json({ message: "Metric logged" });
    } catch (error) {
        console.error("Error logging query metric:", error.message);
        return res.status(400).json({ message: "Error logging query metric" });
    }
};

module.exports = { getPerformanceData, logQueryMetric };
