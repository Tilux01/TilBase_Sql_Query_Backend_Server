const makeConnection = require("../../SQLConnection");
const cloudinary = require("cloudinary").v2;
require("dotenv").config();

cloudinary.config({
    cloud_name: process.env.cloudName,
    api_key: process.env.cloudApiKey,
    api_secret: process.env.cloudApiSecret,
    secure: true
});

const updateProfile = async (req, res) => {
    const { user_id, UserName, Profile_Img } = req.body;
    
    if (!user_id || !UserName) {
        return res.status(400).json({ message: "Missing required parameters" });
    }

    try {
        const connection = await makeConnection();
        const command = 'UPDATE `user_cred` SET UserName=?, Profile_Img=? WHERE id=?';
        await connection.execute(command, [UserName, Profile_Img || null, user_id]);
        return res.status(200).json({ message: "Profile updated successfully", Profile_Img });
    } catch (error) {
        console.error("Error updating profile:", error);
        return res.status(500).json({ message: "Internal server error updating profile" });
    }
};

const updateWorkspace = async (req, res) => {
    const { user_id, project_id, Project_Name, Project_Description } = req.body;
    
    if (!user_id || !project_id || !Project_Name) {
        return res.status(400).json({ message: "Missing required parameters" });
    }

    try {
        const connection = await makeConnection();
        const command = 'UPDATE `Project_Table` SET Project_Name=?, Project_Description=? WHERE id=? AND user_id=?';
        await connection.execute(command, [Project_Name, Project_Description || '', project_id, user_id]);
        
        // Log to history
        const historyCommand = 'INSERT INTO Project_History (user_id, Project_id, History_Title, History_Description, Status, History_Type, Other_Stamp) VALUES (?,?,?,?,?,?,?)';
        const historyValues = [user_id, project_id, `Workspace Updated`, `Project name or description was updated`, 'Active', 'settings', `ID: ${project_id}`];
        await connection.execute(historyCommand, historyValues);

        return res.status(200).json({ message: "Workspace updated successfully" });
    } catch (error) {
        console.error("Error updating workspace:", error);
        return res.status(500).json({ message: "Internal server error updating workspace" });
    }
};

const deleteAccount = async (req, res) => {
    const { user_id } = req.body;
    
    if (!user_id) {
        return res.status(400).json({ message: "Missing required parameters" });
    }

    try {
        const connection = await makeConnection();
        
        
        await connection.execute('DELETE FROM `Project_History` WHERE user_id=?', [user_id]);
        await connection.execute('DELETE FROM `Cluster_Table` WHERE user_id=?', [user_id]);
        await connection.execute('DELETE FROM `Project_Table` WHERE user_id=?', [user_id]);
        await connection.execute('DELETE FROM `Plan` WHERE user_id=?', [user_id]);
        await connection.execute('DELETE FROM `Billing_Invoices` WHERE user_id=?', [user_id]);
        await connection.execute('DELETE FROM `user_cred` WHERE id=?', [user_id]);
        
        return res.status(200).json({ message: "Account deleted successfully" });
    } catch (error) {
        console.error("Error deleting account:", error);
        return res.status(500).json({ message: "Internal server error deleting account" });
    }
};

const getCloudinarySignature = (req, res) => {
    try {
        const timestamp = Math.round((new Date).getTime() / 1000);
        const signature = cloudinary.utils.api_sign_request(
            { timestamp: timestamp },
            process.env.cloudApiSecret
        );
        res.status(200).json({ timestamp, signature, apiKey: process.env.cloudApiKey, cloudName: process.env.cloudName });
    } catch (error) {
        console.error("Signature error:", error);
        res.status(500).json({ message: "Failed to generate signature" });
    }
};

module.exports = {
    updateProfile,
    updateWorkspace,
    deleteAccount,
    getCloudinarySignature
};
