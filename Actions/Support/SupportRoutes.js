const makeConnection = require("../../SQLConnection");

const createSupportTicket = async (req, res) => {
    const { userId, subject, category, details } = req.body;
    if (!userId || !subject || !category || !details) {
        return res.status(501).json({ message: "Please provide all necessary fields" });
    }

    try {
        const connection = await makeConnection();
        const query = 'INSERT INTO Support_Tickets (user_id, subject, category, details, status) VALUES (?, ?, ?, ?, "open")';
        const values = [userId, subject, category, details];
        
        const [result] = await connection.execute(query, values);
        if (result.insertId) {
            res.status(201).json({ message: "Ticket created successfully", ticketId: result.insertId });
        } else {
            res.status(501).json({ message: "Failed to create ticket" });
        }
    } catch (error) {
        console.error("Error creating support ticket:", error);
        res.status(501).json({ message: "Server error creating ticket" });
    }
};

const fetchSupportTickets = async (req, res) => {
    const { userId, page = 1 } = req.body;
    if (!userId) {
        return res.status(501).json({ message: "User ID is required" });
    }

    const limit = 16;
    const offset = (page - 1) * 15;

    try {
        const connection = await makeConnection();
        const query = `SELECT * FROM Support_Tickets WHERE user_id = ? ORDER BY created_at DESC LIMIT ${Number(limit)} OFFSET ${Number(offset)}`;
        const [result] = await connection.execute(query, [userId]);
        res.status(200).json({ message: result });
    } catch (error) {
        console.error("Error fetching tickets:", error);
        res.status(501).json({ message: "Server error fetching tickets" });
    }
};

const fetchAllSupportTickets = async (req, res) => {
    const { page = 1 } = req.body;
    const limit = 16;
    const offset = (page - 1) * 15;

    try {
        const connection = await makeConnection();
        const query = `
            SELECT t.*, u.Email as user_email, u.UserName as user_name 
            FROM Support_Tickets t 
            LEFT JOIN user_cred u ON t.user_id = u.id 
            ORDER BY t.created_at DESC
            LIMIT ${Number(limit)} OFFSET ${Number(offset)}
        `;
        const [result] = await connection.execute(query, []);
        res.status(200).json({ message: result });
    } catch (error) {
        console.error("Error fetching all tickets:", error);
        res.status(501).json({ message: "Server error fetching all tickets" });
    }
};

const updateTicketStatus = async (req, res) => {
    const { ticketId, status } = req.body;
    if (!ticketId || !status) {
        return res.status(501).json({ message: "Ticket ID and status are required" });
    }

    try {
        const connection = await makeConnection();
        const query = 'UPDATE Support_Tickets SET status = ? WHERE id = ?';
        const [result] = await connection.execute(query, [status, ticketId]);
        if (result.affectedRows > 0) {
            res.status(200).json({ message: "Ticket status updated successfully" });
        } else {
            res.status(501).json({ message: "Ticket not found or no change made" });
        }
    } catch (error) {
        console.error("Error updating ticket:", error);
        res.status(501).json({ message: "Server error updating ticket" });
    }
};

const adminSignIn = async (req, res) => {
    const { email, password } = req.body;
    if (!email || !password) {
        return res.status(501).json({ message: "Email and password are required" });
    }

    
    if (email === "israeladekola8@gmail.com" && password === "Adekola@Israel2020") {
        res.status(200).json({ message: "Admin authenticated successfully", adminToken: "admin_super_secret_token" });
    } else {
        res.status(403).json({ message: "Invalid admin credentials" });
    }
};

module.exports = {
    createSupportTicket,
    fetchSupportTickets,
    fetchAllSupportTickets,
    updateTicketStatus,
    adminSignIn
};
