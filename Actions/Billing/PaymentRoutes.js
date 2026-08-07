const makeConnection = require("../../SQLConnection");

const upgradePlan = async (req, res) => {
    const { user_id, plan_name, amount } = req.body;
    
    if (!user_id || !plan_name || amount === undefined) {
        return res.status(400).json({ message: "Missing required parameters" });
    }

    try {
        const connection = await makeConnection();
        
        
        const updatePlanQuery = 'UPDATE Plan SET Plan_Name=?, plan_price=? WHERE user_id=?';
        
        
        const planPrice = plan_name === 'premium' ? 199 : (plan_name === 'standard' ? 49 : 0);
        await connection.execute(updatePlanQuery, [plan_name, planPrice, user_id]);
        
        
        if (plan_name === 'premium') {
            await connection.execute('UPDATE Plan SET Ram=?, Cloud_Storage=?, Highest_Project=?, Highest_CLusters=? WHERE user_id=?', [32, 100000, 9999, 9999, user_id]);
        } else if (plan_name === 'standard') {
            await connection.execute('UPDATE Plan SET Ram=?, Cloud_Storage=?, Highest_Project=?, Highest_CLusters=? WHERE user_id=?', [8, 10000, 10, 20, user_id]);
        } else {
            await connection.execute('UPDATE Plan SET Ram=?, Cloud_Storage=?, Highest_Project=?, Highest_CLusters=? WHERE user_id=?', [0.5, 1000, 1, 2, user_id]);
        }

        
        const insertInvoiceQuery = 'INSERT INTO Billing_Invoices (user_id, plan_name, amount, status) VALUES (?, ?, ?, ?)';
        const [invoiceResult] = await connection.execute(insertInvoiceQuery, [user_id, plan_name, amount, 'paid']);

        return res.status(200).json({ message: "Plan upgraded successfully", invoiceId: invoiceResult.insertId });

    } catch (error) {
        console.error("Error upgrading plan:", error);
        return res.status(500).json({ message: "Internal server error during plan upgrade" });
    }
};

const fetchInvoices = async (req, res) => {
    const { user_id, page = 1 } = req.body;
    
    if (!user_id) {
        return res.status(400).json({ message: "Missing user_id" });
    }

    try {
        const connection = await makeConnection();
        const limit = 16;
        const offset = (page - 1) * 15;
        const fetchQuery = `SELECT * FROM Billing_Invoices WHERE user_id=? ORDER BY created_at DESC LIMIT ${Number(limit)} OFFSET ${Number(offset)}`;
        const [invoices] = await connection.execute(fetchQuery, [user_id]);
        
        return res.status(200).json({ invoices });
    } catch (error) {
        console.error("Error fetching invoices:", error);
        return res.status(500).json({ message: "Internal server error fetching invoices" });
    }
};

module.exports = {
    upgradePlan,
    fetchInvoices
};
