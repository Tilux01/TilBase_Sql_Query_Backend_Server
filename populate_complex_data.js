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
    console.log("Starting Complex Data Population for Last Projects...");
    const makeConnection = require("./SQLConnection");
    const conn = await makeConnection();

    // Find the last DB Project that has "Enterprise DB Report" in name
    const [dbProjects] = await conn.query('SELECT * FROM Project_Table WHERE Project_Name LIKE ? ORDER BY id DESC LIMIT 1', ['Enterprise DB Report%']);
    if (dbProjects.length === 0) throw new Error("No DB Project found");
    const dbProjectId = dbProjects[0].id;
    console.log(`Using DB Project ID: ${dbProjectId}`);

    // Find the last Chatbase Project
    const [chatProjects] = await conn.query('SELECT * FROM Project_Table WHERE Project_Name LIKE ? ORDER BY id DESC LIMIT 1', ['Enterprise Comms Report%']);
    if (chatProjects.length === 0) throw new Error("No Chatbase Project found");
    const chatProjectId = chatProjects[0].id;
    console.log(`Using Chat Project ID: ${chatProjectId}`);

    // Get clusters
    const [clusters] = await conn.query('SELECT * FROM Cluster_Table WHERE project_id IN (?, ?) ORDER BY id DESC', [dbProjectId, chatProjectId]);
    
    const graphCluster = clusters.find(c => c.Cluster_Type === 'graph')?.id;
    const chatClusterKey = clusters.find(c => c.Cluster_Type === 'chatbase')?.Cluster_Key;
    const chatClusterInt = clusters.find(c => c.Cluster_Type === 'chatbase')?.id;
    const broadcastCluster = clusters.find(c => c.Cluster_Type === 'chatbase_broadcast')?.Cluster_Key;

    if (!graphCluster || !chatClusterKey || !broadcastCluster) {
        console.log("Could not find required clusters in the last projects. Make sure the last run finished.");
        process.exit(1);
    }

    console.log("Targeting Graph Cluster ID:", graphCluster);
    console.log("Targeting Chatbase Cluster Key:", chatClusterKey);
    console.log("Targeting Broadcast Cluster Key:", broadcastCluster);

    // --- 1. Complex Graph Data (Social Network) ---
    console.log("Populating Complex Graph Data...");
    // 5 Users
    const n1 = 'node_' + Date.now() + '1';
    const n2 = 'node_' + Date.now() + '2';
    const n3 = 'node_' + Date.now() + '3';
    const n4 = 'node_' + Date.now() + '4';
    const n5 = 'node_' + Date.now() + '5';
    await conn.query('INSERT INTO Graph_Nodes (id, cluster_id, node_label, properties, byte_size) VALUES (?, ?, ?, ?, ?)', [n1, graphCluster, 'User', JSON.stringify({ name: 'Alice', role: 'CEO', age: 45 }), 128]);
    await conn.query('INSERT INTO Graph_Nodes (id, cluster_id, node_label, properties, byte_size) VALUES (?, ?, ?, ?, ?)', [n2, graphCluster, 'User', JSON.stringify({ name: 'Bob', role: 'CTO', age: 40 }), 128]);
    await conn.query('INSERT INTO Graph_Nodes (id, cluster_id, node_label, properties, byte_size) VALUES (?, ?, ?, ?, ?)', [n3, graphCluster, 'User', JSON.stringify({ name: 'Charlie', role: 'Dev', age: 28 }), 128]);
    await conn.query('INSERT INTO Graph_Nodes (id, cluster_id, node_label, properties, byte_size) VALUES (?, ?, ?, ?, ?)', [n4, graphCluster, 'Department', JSON.stringify({ name: 'Engineering', budget: 1000000 }), 128]);
    await conn.query('INSERT INTO Graph_Nodes (id, cluster_id, node_label, properties, byte_size) VALUES (?, ?, ?, ?, ?)', [n5, graphCluster, 'Department', JSON.stringify({ name: 'Management', budget: 500000 }), 128]);
    
    // Edges
    await conn.query('INSERT INTO Graph_Edges (id, cluster_id, source_id, target_id, edge_label, byte_size) VALUES (?, ?, ?, ?, ?, ?)', ['edge_' + Date.now() + '1', graphCluster, n1, n5, 'MANAGES', 64]);
    await conn.query('INSERT INTO Graph_Edges (id, cluster_id, source_id, target_id, edge_label, byte_size) VALUES (?, ?, ?, ?, ?, ?)', ['edge_' + Date.now() + '2', graphCluster, n2, n4, 'MANAGES', 64]);
    await conn.query('INSERT INTO Graph_Edges (id, cluster_id, source_id, target_id, edge_label, byte_size) VALUES (?, ?, ?, ?, ?, ?)', ['edge_' + Date.now() + '3', graphCluster, n3, n4, 'WORKS_IN', 64]);
    await conn.query('INSERT INTO Graph_Edges (id, cluster_id, source_id, target_id, edge_label, byte_size) VALUES (?, ?, ?, ?, ?, ?)', ['edge_' + Date.now() + '4', graphCluster, n2, n3, 'MANAGES_PERSON', 64]);
    await conn.query('INSERT INTO Graph_Edges (id, cluster_id, source_id, target_id, edge_label, byte_size) VALUES (?, ?, ?, ?, ?, ?)', ['edge_' + Date.now() + '5', graphCluster, n1, n2, 'KNOWS', 64]);
    console.log("Graph Data populated.");

    // --- 2. Complex Chatbase Data ---
    console.log("Populating Complex Chatbase Data...");
    // Find channels for the chatbase cluster
    let [channels] = await conn.query('SELECT * FROM Chatbase_Channels WHERE cluster_id=?', [chatClusterInt]);
    if (channels.length === 0) {
        await conn.query('INSERT INTO Chatbase_Channels (cluster_id, channel_id, metadata) VALUES (?, ?, ?)', [chatClusterInt, 'engineering', JSON.stringify({ name: 'engineering', creatorId: 'Alice' })]);
        await conn.query('INSERT INTO Chatbase_Channels (cluster_id, channel_id, metadata) VALUES (?, ?, ?)', [chatClusterInt, 'announcements', JSON.stringify({ name: 'announcements', creatorId: 'Alice' })]);
        [channels] = await conn.query('SELECT * FROM Chatbase_Channels WHERE cluster_id=?', [chatClusterInt]);
    }

    const chanId = channels[0].id; // use first channel
    const msgs = [
        { sender: 'Alice', text: 'Welcome to the engineering channel!' },
        { sender: 'Bob', text: 'Thanks! Are we deploying the new TilBase update today?' },
        { sender: 'Charlie', text: 'I am running the final integration tests now.' },
        { sender: 'Bob', text: 'Great. Let me know if the realtime cluster shows any latency.' },
        { sender: 'Alice', text: 'Please ensure you check the Vector endpoints too. We saw some 404s yesterday.' },
        { sender: 'Charlie', text: 'Fixed! The node_module sdk was misconfigured.' }
    ];

    for (let m of msgs) {
        await conn.query('INSERT INTO Chatbase_Messages (cluster_id, channel_id, sender_id, text, msg_id) VALUES (?, ?, ?, ?, ?)', 
            [chatClusterInt, chanId, m.sender, m.text, 'msg_' + Date.now().toString()]);
        await delay(200); // add slight delay so timestamps differ
    }
    
    // Add a pinned message
    const [recentMsg] = await conn.query('SELECT * FROM Chatbase_Messages WHERE channel_id=? ORDER BY id DESC LIMIT 1', [chanId]);
    if(recentMsg.length > 0) {
        await conn.query('UPDATE Chatbase_Messages SET is_pinned=1 WHERE id=?', [recentMsg[0].id]);
    }
    console.log("Chatbase Data populated.");

    // --- 3. Complex Broadcast Data ---
    console.log("Populating Complex Broadcast Data...");
    try {
        const socket = io(ROOT_API);
        socket.emit('broadcast_join', { clusterId: broadcastCluster, roomId: `${broadcastCluster}`, userId: 'AdminHost', role: 'host' });
        await delay(500);
        socket.emit('broadcast_send_message', { clusterId: broadcastCluster, roomId: `${broadcastCluster}`, userId: 'AdminHost', message: { text: "We are live! Let's talk about the new architecture." }});
        
        socket.emit('broadcast_poll_create', { 
            clusterId: broadcastCluster, 
            roomId: `${broadcastCluster}`, 
            userId: 'AdminHost', 
            pollConfig: { 
                question: "Which DB Engine is your favorite?", 
                options: [
                    {id: '1', text: 'Vector Search'}, 
                    {id: '2', text: 'Graph DB'},
                    {id: '3', text: 'Realtime Docs'}
                ]
            } 
        });

        // Simulate 20 complex users
        const reactions = ['fire', 'heart', 'clap', 'star'];
        for(let i=0; i<20; i++) {
            socket.emit('broadcast_join', { clusterId: broadcastCluster, roomId: `${broadcastCluster}`, userId: `dev_${i}`, role: 'viewer' });
            if (i % 3 === 0) {
                socket.emit('broadcast_send_message', { clusterId: broadcastCluster, roomId: `${broadcastCluster}`, userId: `dev_${i}`, message: { text: `dev_${i} here, looks solid!` }});
            }
            if (i % 2 === 0) {
                socket.emit('broadcast_poll_vote', { clusterId: broadcastCluster, roomId: `${broadcastCluster}`, userId: `dev_${i}`, optionId: (i%3 + 1).toString() });
            }
            if (i % 4 === 0) {
                socket.emit('broadcast_reaction', { clusterId: broadcastCluster, roomId: `${broadcastCluster}`, userId: `dev_${i}`, reactionType: reactions[i%4] });
            }
            await delay(100);
        }
        await delay(1000);
        socket.close();
    } catch(e) {
        console.error("Broadcast error:", e.message);
    }
    console.log("Broadcast Data populated.");

    // Helper to mock massive metrics
    async function mockMassiveMetrics(projectId, clusterIdInt, count) {
        for(let i=0; i<count; i++) {
            await conn.query('INSERT INTO Query_Metrics (project_id, cluster_id, query_type, execution_time_ms) VALUES (?, ?, ?, ?)',
                [projectId, clusterIdInt, ['Read', 'Write', 'Update', 'Delete'][Math.floor(Math.random()*4)], Math.floor(Math.random() * 200) + 10]);
            
            await conn.query('INSERT INTO Connection_Metrics (project_id, db_user, status) VALUES (?, ?, ?)',
                [projectId, 'Admin', 'connected']);
        }
    }
    
    // Pump more metrics for good measure to make charts look great
    console.log("Pumping 100 metrics to each complex cluster for the charts...");
    await mockMassiveMetrics(dbProjectId, graphCluster, 100);
    await mockMassiveMetrics(chatProjectId, chatClusterInt, 100);
    const broadcastInt = clusters.find(c => c.Cluster_Type === 'chatbase_broadcast')?.id;
    await mockMassiveMetrics(chatProjectId, broadcastInt, 100);

    console.log("=========================================");
    console.log("Complex data successfully seeded into latest projects!");
    console.log("=========================================");
    process.exit(0);
}

run().catch(console.error);
