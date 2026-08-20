require('dotenv').config();
const mysql = require('mysql2/promise');
const axios = require('axios');
const { io } = require('socket.io-client');

const API_BASE = 'http://localhost:3400/api';
const ROOT_API = 'http://localhost:3400';

async function delay(ms) {
    return new Promise(res => setTimeout(res, ms));
}

async function run() {
    console.log("Starting Full Platform Data Population...");
    
    const makeConnection = require("./SQLConnection");
    const conn = await makeConnection();

    const user_id = 1;
    
    // 1. Create a pristine Database Project
    const projKeyDb = 'db-' + Date.now().toString().substring(5);
    await conn.query('INSERT INTO Project_Table (user_id, Project_Name, Project_Description, Environment, Project_Key, Server_Name, Server_Region, Project_Type, Project_Plan) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)', 
        [user_id, 'Enterprise DB Report', 'Database testing suite', 'production', projKeyDb, 'TiluxM001', 'Global', 'Database', 'premium']);
    const [dbProj] = await conn.query('SELECT * FROM Project_Table WHERE Project_Key=?', [projKeyDb]);
    const dbProjectId = dbProj[0].id;

    // 2. Create a pristine Chatbase Project
    const projKeyChat = 'chat-' + Date.now().toString().substring(5);
    await conn.query('INSERT INTO Project_Table (user_id, Project_Name, Project_Description, Environment, Project_Key, Server_Name, Server_Region, Project_Type, Project_Plan) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)', 
        [user_id, 'Enterprise Comms Report', 'Chatbase testing suite', 'production', projKeyChat, 'TiluxM001', 'Global', 'ChatBase', 'premium']);
    const [chatProj] = await conn.query('SELECT * FROM Project_Table WHERE Project_Key=?', [projKeyChat]);
    const chatProjectId = chatProj[0].id;

    console.log(`Created Database Project: ${dbProjectId}`);
    console.log(`Created Chatbase Project: ${chatProjectId}`);

    // Helper to create cluster
    async function createCluster(projectId, name, type) {
        const clusterIdStr = type + '-' + Date.now().toString().substring(7);
        const [result] = await conn.query('INSERT INTO Cluster_Table (project_id, user_id, Cluster_Name, Cluster_Type, Cluster_Key, Current_State, Cluster_Password) VALUES (?, ?, ?, ?, ?, ?, ?)',
            [projectId, user_id, name, type, clusterIdStr, 'active', 'dummy_password']);
        console.log(`Created ${type} cluster: ${name} (ID: ${result.insertId})`);
        
        // Log history
        await conn.query('INSERT INTO Project_History (user_id, Project_id, History_Title, History_Description, History_Type, Status, Other_Stamp) VALUES (?, ?, ?, ?, ?, ?, ?)',
            [user_id, projectId, 'Create Cluster', `Cluster ${name} created`, 'creation', 'success', 'sys']);
            
        return result.insertId;
    }

    // Helper to mock metrics
    async function mockMetrics(projectId, clusterId, count) {
        for(let i=0; i<count; i++) {
            await conn.query('INSERT INTO Query_Metrics (project_id, cluster_id, query_type, execution_time_ms) VALUES (?, ?, ?, ?)',
                [projectId, clusterId, ['Read', 'Write', 'Update', 'Delete'][Math.floor(Math.random()*4)], Math.floor(Math.random() * 50) + 10]);
            
            await conn.query('INSERT INTO Connection_Metrics (project_id, db_user, status) VALUES (?, ?, ?)',
                [projectId, 'Admin', 'connected']);
        }
    }

    // --- 1. Document Cluster ---
    const docCluster = await createCluster(dbProjectId, 'Prod-Documents', 'document');
    try {
        await axios.post(`${API_BASE}/documentExplorer/setDocumentData`, { clusterId: docCluster, path: 'reports/report1', data: { name: 'Report 1', status: 'approved', metrics: [1,2,3] } });
        await axios.post(`${API_BASE}/documentExplorer/setDocumentData`, { clusterId: docCluster, path: 'reports/report2', data: { name: 'Report 2', status: 'pending', metrics: [4,5,6] } });
        await axios.post(`${API_BASE}/documentExplorer/getDocumentData`, { clusterId: docCluster, path: 'reports/report1' });
    } catch(e) {}
    await mockMetrics(dbProjectId, docCluster, 15);

    // --- 2. Vector Cluster ---
    const vectorCluster = await createCluster(dbProjectId, 'AI-Embeddings', 'vector');
    try {
        await axios.post(`${API_BASE}/vectorExplorer/upsertVector`, { clusterId: vectorCluster, namespace: 'test', vectorId: 'v1', vector: [0.1, 0.2, 0.3], metadata: { text: 'hello' } });
        await axios.post(`${API_BASE}/vectorExplorer/upsertVector`, { clusterId: vectorCluster, namespace: 'test', vectorId: 'v2', vector: [0.9, 0.1, 0.4], metadata: { text: 'world' } });
        await axios.post(`${API_BASE}/vectorExplorer/semanticSearch`, { clusterId: vectorCluster, namespace: 'test', queryVector: [0.1, 0.2, 0.3] });
    } catch(e) {}
    await mockMetrics(dbProjectId, vectorCluster, 20);

    // --- 3. Flat Cluster ---
    const flatCluster = await createCluster(dbProjectId, 'Analytics-Logs', 'flat');
    try {
        await axios.post(`${API_BASE}/flatExplorer/setRows`, { clusterId: flatCluster, collection: 'logs', rows: [{id: 1, level: 'info', msg: 'System started'}, {id: 2, level: 'error', msg: 'Crash'}] });
        await axios.post(`${API_BASE}/flatExplorer/getCollections`, { clusterId: flatCluster });
    } catch(e) {}
    await mockMetrics(dbProjectId, flatCluster, 10);

    // --- 4. Hierarchical Cluster ---
    const hierCluster = await createCluster(dbProjectId, 'Org-Structure', 'hierarchical');
    try {
        await axios.post(`${API_BASE}/hierarchicalExplorer/setNode`, { clusterId: hierCluster, path: 'root/users/admin', data: { role: 'superuser', active: true } });
        await axios.post(`${API_BASE}/hierarchicalExplorer/setNode`, { clusterId: hierCluster, path: 'root/settings', data: { theme: 'dark' } });
        await axios.post(`${API_BASE}/hierarchicalExplorer/getNode`, { clusterId: hierCluster, path: 'root' });
    } catch(e) {}
    await mockMetrics(dbProjectId, hierCluster, 12);

    // --- 5. Graph Cluster ---
    const graphCluster = await createCluster(dbProjectId, 'Social-Graph', 'graph');
    try {
        await axios.post(`${API_BASE}/graphExplorer/addNode`, { clusterId: graphCluster, type: 'User', data: { name: 'Alice' } });
        await axios.post(`${API_BASE}/graphExplorer/addNode`, { clusterId: graphCluster, type: 'User', data: { name: 'Bob' } });
    } catch(e) {}
    // Assuming node IDs are 1 and 2 conceptually, mock some generic metric
    await mockMetrics(dbProjectId, graphCluster, 8);

    // --- 6. Realtime Cluster ---
    const realCluster = await createCluster(dbProjectId, 'Live-State', 'realtime');
    try {
        await axios.post(`${API_BASE}/realtimeExplorer/setDocumentData`, { clusterId: realCluster, path: 'gamestate/match1', data: { score: 100 } });
        await axios.post(`${API_BASE}/realtimeExplorer/setDocumentData`, { clusterId: realCluster, path: 'gamestate/match2', data: { score: 250 } });
        await axios.post(`${API_BASE}/realtimeExplorer/getDocuments`, { clusterId: realCluster, path: 'gamestate' });
    } catch(e) {}
    await mockMetrics(dbProjectId, realCluster, 30);

    // --- 7. Chatbase (Standard) ---
    const chatCluster = await createCluster(chatProjectId, 'Support-Chat', 'chatbase');
    try {
        await axios.post(`${API_BASE}/chatbase/createChannel`, { clusterId: chatCluster, channelName: 'general-support', creatorId: 'Admin' });
        const [channels] = await conn.query('SELECT * FROM Chatbase_Channels WHERE cluster_id=?', [chatCluster]);
        if (channels.length > 0) {
            const chanId = channels[0].id;
            await axios.post(`${API_BASE}/chatbase/sendMessage`, { clusterId: chatCluster, channelId: chanId, senderId: 'User1', text: 'Hello, need help!' });
            await axios.post(`${API_BASE}/chatbase/sendMessage`, { clusterId: chatCluster, channelId: chanId, senderId: 'Admin', text: 'I am here to help you.' });
        }
    } catch(e) {}
    await mockMetrics(chatProjectId, chatCluster, 25);

    // --- 8. Chatbase Broadcast ---
    const broadcastCluster = await createCluster(chatProjectId, 'Live-Event-Stream', 'chatbase_broadcast');
    
    // Connect to broadcast via socket to generate traffic
    const socket = io(ROOT_API);
    socket.emit('broadcast_join', { clusterId: broadcastCluster, roomId: `${broadcastCluster}`, userId: 'AdminHost', role: 'host' });
    socket.emit('broadcast_send_message', { clusterId: broadcastCluster, roomId: `${broadcastCluster}`, userId: 'AdminHost', message: { text: "Welcome to the live stream!" }});
    socket.emit('broadcast_poll_create', { clusterId: broadcastCluster, roomId: `${broadcastCluster}`, userId: 'AdminHost', pollConfig: { question: "How is the quality?", options: [{id: '1', text: 'Great'}, {id: '2', text: 'Poor'}]} });
    
    // Simulate 50 viewers
    for(let i=0; i<50; i++) {
        socket.emit('broadcast_join', { clusterId: broadcastCluster, roomId: `${broadcastCluster}`, userId: `viewer_${i}`, role: 'viewer' });
        if(i%5===0) {
            socket.emit('broadcast_send_message', { clusterId: broadcastCluster, roomId: `${broadcastCluster}`, userId: `viewer_${i}`, message: { text: "Hi from viewer " + i }});
        }
    }
    await delay(1000);
    socket.emit('broadcast_reaction', { clusterId: broadcastCluster, roomId: `${broadcastCluster}`, userId: 'viewer_1', reactionType: 'fire' });
    
    await mockMetrics(chatProjectId, broadcastCluster, 40);
    socket.close();

    console.log("=========================================");
    console.log("All 8 clusters generated and populated!");
    console.log("Login as user_id 1 to see the two new projects:");
    console.log("- Enterprise DB Report (6 DB Clusters)");
    console.log("- Enterprise Comms Report (2 Chatbase Clusters)");
    console.log("=========================================");

    process.exit(0);
}

run().catch(console.error);
