const jwt = require('jsonwebtoken');
const axios = require('axios');

const token = jwt.sign({ type: 'dashboard', userId: 1 }, "tilbase_super_secret_key_2026", { expiresIn: '1h' });

async function run() {
    try {
        const res = await axios.post('http://localhost:4255/api/documentExplorer/setDocumentData', {
            clusterId: 8,
            path: 'yoo/test_end_point',
            documentData: { hello: "world" }
        }, {
            headers: { Authorization: `Bearer ${token}` }
        });
        console.log("Success:", res.data);
    } catch (error) {
        console.error("Failed:", error.response ? error.response.data : error.message);
    }
}
run();
