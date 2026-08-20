const makeConnection = require("./SQLConnection");

async function setupChatbase() {
    let connection;
    try {
        connection = await makeConnection();
        console.log("Connected to MySQL for Chatbase Setup.");

        // 1. Chatbase_Channels
        await connection.query(`
            CREATE TABLE IF NOT EXISTS Chatbase_Channels (
                id INT AUTO_INCREMENT PRIMARY KEY,
                cluster_id VARCHAR(150) NOT NULL,
                channel_id VARCHAR(150) NOT NULL,
                type ENUM('direct', 'group', 'public') NOT NULL DEFAULT 'public',
                is_frozen BOOLEAN DEFAULT FALSE,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                metadata JSON,
                UNIQUE KEY unique_channel (cluster_id, channel_id),
                INDEX idx_cluster (cluster_id)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
        `);
        console.log("✅ Chatbase_Channels table created or exists.");

        // 2. Chatbase_Members
        await connection.query(`
            CREATE TABLE IF NOT EXISTS Chatbase_Members (
                id INT AUTO_INCREMENT PRIMARY KEY,
                cluster_id VARCHAR(150) NOT NULL,
                channel_id VARCHAR(150) NOT NULL,
                user_id VARCHAR(150) NOT NULL,
                role ENUM('admin', 'member') NOT NULL DEFAULT 'member',
                joined_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                last_read_message_id VARCHAR(150),
                UNIQUE KEY unique_member (cluster_id, channel_id, user_id),
                INDEX idx_user_channels (cluster_id, user_id)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
        `);
        console.log("✅ Chatbase_Members table created or exists.");

        // 3. Chatbase_Messages
        await connection.query(`
            CREATE TABLE IF NOT EXISTS Chatbase_Messages (
                id INT AUTO_INCREMENT PRIMARY KEY,
                cluster_id VARCHAR(150) NOT NULL,
                channel_id VARCHAR(150) NOT NULL,
                msg_id VARCHAR(150) NOT NULL,
                sender_id VARCHAR(150) NOT NULL,
                text TEXT,
                attachments JSON,
                payload JSON,
                is_pinned BOOLEAN DEFAULT FALSE,
                read_by JSON,
                reply_to VARCHAR(150) NULL,
                parent_msg_id VARCHAR(150),
                is_edited BOOLEAN DEFAULT FALSE,
                is_deleted BOOLEAN DEFAULT FALSE,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                UNIQUE KEY unique_msg (cluster_id, channel_id, msg_id),
                INDEX idx_channel_messages (cluster_id, channel_id, created_at DESC)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
        `);
        console.log("✅ Chatbase_Messages table created or exists.");

        // 4. Chatbase_Reactions
        await connection.query(`
            CREATE TABLE IF NOT EXISTS Chatbase_Reactions (
                id INT AUTO_INCREMENT PRIMARY KEY,
                cluster_id VARCHAR(150) NOT NULL,
                msg_id VARCHAR(150) NOT NULL,
                user_id VARCHAR(150) NOT NULL,
                reaction VARCHAR(50) NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                UNIQUE KEY unique_reaction (cluster_id, msg_id, user_id, reaction),
                INDEX idx_msg_reactions (cluster_id, msg_id)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
        `);
        console.log("✅ Chatbase_Reactions table created or exists.");
        // 5. Chatbase_Moderation
        await connection.query(`
            CREATE TABLE IF NOT EXISTS Chatbase_Moderation (
                id INT AUTO_INCREMENT PRIMARY KEY,
                cluster_id VARCHAR(150) NOT NULL,
                channel_id VARCHAR(150),
                user_id VARCHAR(150) NOT NULL,
                action_type ENUM('ban', 'mute', 'report') NOT NULL,
                reason TEXT,
                duration_minutes INT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                INDEX idx_mod (cluster_id, user_id)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
        `);
        console.log("✅ Chatbase_Moderation table created or exists.");

        // 6. Chatbase_Scheduled_Messages
        await connection.query(`
            CREATE TABLE IF NOT EXISTS Chatbase_Scheduled_Messages (
                id INT AUTO_INCREMENT PRIMARY KEY,
                cluster_id VARCHAR(150) NOT NULL,
                channel_id VARCHAR(150) NOT NULL,
                sender_id VARCHAR(150) NOT NULL,
                text TEXT,
                attachments JSON,
                send_at TIMESTAMP NOT NULL,
                status ENUM('pending', 'sent', 'failed', 'cancelled') DEFAULT 'pending',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                INDEX idx_scheduled (cluster_id, channel_id, send_at)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
        `);
        console.log("✅ Chatbase_Scheduled_Messages table created or exists.");

        // 7. Chatbase_AI_Tasks
        await connection.query(`
            CREATE TABLE IF NOT EXISTS Chatbase_AI_Tasks (
                id INT AUTO_INCREMENT PRIMARY KEY,
                cluster_id VARCHAR(150) NOT NULL,
                channel_id VARCHAR(150) NOT NULL,
                task_id VARCHAR(150) NOT NULL,
                task_state VARCHAR(50) NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                UNIQUE KEY unique_task (cluster_id, task_id)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
        `);
        console.log("✅ Chatbase_AI_Tasks table created or exists.");

        // 8. Push_Subscriptions
        await connection.query(`
            CREATE TABLE IF NOT EXISTS Push_Subscriptions (
                id INT AUTO_INCREMENT PRIMARY KEY,
                cluster_id VARCHAR(150) NOT NULL,
                user_id VARCHAR(150) NOT NULL,
                endpoint TEXT NOT NULL,
                p256dh_key TEXT NOT NULL,
                auth_key TEXT NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                UNIQUE KEY unique_sub (cluster_id, user_id)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
        `);
        console.log("✅ Push_Subscriptions table created or exists.");

        console.log("🎉 Chatbase Database Setup Complete!");
        process.exit(0);

    } catch (error) {
        console.error("Error setting up Chatbase DB:", error);
        process.exit(1);
    }
}

setupChatbase();
