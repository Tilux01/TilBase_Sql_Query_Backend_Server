require('dotenv').config();
const makeConnection = require('./SQLConnection');

async function run() {
    const conn = await makeConnection();
    
    // Find the latest Database project
    const [dbProjects] = await conn.query('SELECT * FROM Project_Table WHERE Project_Type=? ORDER BY id DESC LIMIT 1', ['Database']);
    if(dbProjects.length === 0) return console.log("No DB project found.");
    const dbProjectId = dbProjects[0].id;
    
    // Find clusters for this project
    const [clusters] = await conn.query('SELECT * FROM Cluster_Table WHERE project_id=?', [dbProjectId]);
    
    const graphCluster = clusters.find(c => c.Cluster_Type === 'graph')?.id;
    const docCluster = clusters.find(c => c.Cluster_Type === 'document')?.id;
    
    if(!graphCluster || !docCluster) {
        return console.log("Missing graph or document cluster.");
    }
    
    console.log("Targeting Graph Cluster ID:", graphCluster);
    console.log("Targeting Document Cluster ID:", docCluster);

    // --- 1. Populate Massive Graph Data (Org Chart) ---
    console.log("Populating Massive Graph Data...");
    const departments = ['Engineering', 'Marketing', 'Sales', 'HR', 'Finance', 'Executive'];
    const titles = ['Director', 'Manager', 'Lead', 'Specialist', 'Associate', 'Intern'];
    
    // Create CEO
    const ceoId = 'node_ceo_' + Date.now();
    await conn.query('INSERT INTO Graph_Nodes (id, cluster_id, node_label, properties, byte_size) VALUES (?, ?, ?, ?, ?)', 
        [ceoId, graphCluster, 'Executive', JSON.stringify({ name: 'Elias Thorne', role: 'CEO', salary: 500000 }), 256]);
    
    const nodes = [{ id: ceoId, role: 'CEO', dept: 'Executive' }];
    const edges = [];
    
    for (let d of departments) {
        if (d === 'Executive') continue;
        
        // Department Head
        const headId = 'node_head_' + d + '_' + Date.now();
        await conn.query('INSERT INTO Graph_Nodes (id, cluster_id, node_label, properties, byte_size) VALUES (?, ?, ?, ?, ?)', 
            [headId, graphCluster, 'Employee', JSON.stringify({ name: d + ' VP', department: d, role: 'VP' }), 256]);
            
        nodes.push({ id: headId, role: 'VP', dept: d });
        edges.push({ source: ceoId, target: headId, label: 'MANAGES' });
        
        // Create 10-15 employees per department
        const numEmployees = Math.floor(Math.random() * 6) + 10;
        let prevManager = headId;
        for (let i = 0; i < numEmployees; i++) {
            const empId = 'node_emp_' + d + '_' + i + '_' + Date.now();
            const title = titles[Math.floor(Math.random() * titles.length)];
            
            await conn.query('INSERT INTO Graph_Nodes (id, cluster_id, node_label, properties, byte_size) VALUES (?, ?, ?, ?, ?)', 
                [empId, graphCluster, 'Employee', JSON.stringify({ name: 'Emp ' + i, department: d, role: title }), 256]);
                
            nodes.push({ id: empId, role: title, dept: d });
            edges.push({ source: prevManager, target: empId, label: 'REPORTS_TO' });
            
            // Randomly cross-collaborate
            if (Math.random() > 0.7) {
                const randomNode = nodes[Math.floor(Math.random() * nodes.length)];
                if(randomNode.id !== empId) {
                    edges.push({ source: empId, target: randomNode.id, label: 'COLLABORATES_WITH' });
                }
            }
            
            // Sometimes change manager to create a hierarchy
            if(Math.random() > 0.5) prevManager = empId;
        }
    }
    
    // Insert all edges
    let eCount = 0;
    for (let e of edges) {
        eCount++;
        const edgeId = 'edge_' + Date.now() + '_' + eCount;
        await conn.query('INSERT INTO Graph_Edges (id, cluster_id, source_id, target_id, edge_label, byte_size) VALUES (?, ?, ?, ?, ?, ?)', 
            [edgeId, graphCluster, e.source, e.target, e.label, 128]);
    }
    console.log(`Inserted ${nodes.length} Graph Nodes and ${edges.length} Graph Edges.`);

    // --- 2. Populate Whole Company Data (Document DB) ---
    console.log("Populating Massive Document Data...");
    
    const companyDocs = [
        {
            path: '/company',
            parent_path: '/',
            data: { name: 'Acme Corp', founded: 1999, hq: 'New York' }
        },
        {
            path: '/company/hr',
            parent_path: '/company',
            data: { policies: ['Remote Work', 'Unlimited PTO', 'Code of Conduct'], active_employees: nodes.length }
        },
        {
            path: '/company/finance',
            parent_path: '/company',
            data: { Q1_Revenue: '$1.2M', Q2_Revenue: '$1.5M', Burn_Rate: '$100k/mo' }
        }
    ];
    
    // Generate 30 project documents
    for(let i=1; i<=30; i++) {
        companyDocs.push({
            path: `/company/projects/project_${i}`,
            parent_path: `/company/projects`,
            data: {
                id: i,
                title: `Project Alpha ${i}`,
                status: ['Planning', 'In Progress', 'Completed'][Math.floor(Math.random() * 3)],
                budget: Math.floor(Math.random() * 50000) + 10000,
                team: departments[Math.floor(Math.random() * departments.length)]
            }
        });
    }

    for (let doc of companyDocs) {
        try {
            await conn.query('INSERT IGNORE INTO Document_Store (cluster_id, path, parent_path, document_data) VALUES (?, ?, ?, ?)', 
                [docCluster, doc.path, doc.parent_path, JSON.stringify(doc.data)]);
        } catch(e) {
            console.log('Skipped duplicate doc:', doc.path);
        }
    }
    console.log(`Inserted ${companyDocs.length} Document Nodes.`);
    
    console.log("=========================================");
    console.log("Massive data successfully seeded into latest projects!");
    console.log("=========================================");
    process.exit(0);
}

run().catch(err => {
    console.error(err);
    process.exit(1);
});
