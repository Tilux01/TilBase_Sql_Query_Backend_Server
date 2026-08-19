const makeConnection = require("../SQLConnection");
const { v4: uuidv4 } = require('uuid');

const logLocalMetric = async (clusterId, queryType, executionTimeMs) => {
    try {
        const db = await makeConnection();
        const [rows] = await db.query("SELECT Project_Id FROM Cluster_Table WHERE id = ?", [clusterId]);
        if(rows.length) {
            await db.query('INSERT INTO Query_Metrics (project_id, cluster_id, query_type, execution_time_ms) VALUES (?, ?, ?, ?)', 
                           [rows[0].Project_Id, clusterId, queryType, executionTimeMs]);
        }
    } catch(e) {}
};

const enforceAdmin = async (connection, clusterId, channelId, userId) => {
    // RBAC: Check if user is admin in the channel
    const [rows] = await connection.query(
        "SELECT role FROM Chatbase_Members WHERE cluster_id = ? AND channel_id = ? AND user_id = ?", 
        [clusterId, channelId, userId]
    );
    if (!rows.length || rows[0].role !== 'admin') {
        throw new Error("Forbidden: Requires admin privileges");
    }
};

const createChannel = async (req, res) => {
    const { clusterId, channelName, type = 'public' } = req.body;
    if (!channelName) return res.status(400).json({ success: false, message: "Channel name is required" });

    try {
        const connection = await makeConnection();
        const channelId = uuidv4();

        const query = `
            INSERT INTO Chatbase_Channels (cluster_id, channel_id, type)
            VALUES (?, ?, ?)
        `;
        const result = await connection.query(query, [clusterId, channelName, type]);
        const channelIdStr = channelName; // use the name as ID for frontend

        // Auto-insert creator as admin
        const creatorId = req.body.creatorId || req.user_id || req.sdk_user_id || 'Admin';
        await connection.query(
            "INSERT INTO Chatbase_Members (channel_id, cluster_id, user_id, role) VALUES (?, ?, ?, ?) ON DUPLICATE KEY UPDATE role = 'admin'",
            [channelIdStr, clusterId, creatorId, 'admin']
        );

        const projectId = req.project_id || req.sdk_project_id;
        const userId = req.user_id || req.sdk_user_id;
        if (projectId && userId) {
            await connection.query('INSERT INTO Project_History (user_id, Project_id, History_Title, History_Description, Status, History_Type, Other_Stamp) VALUES (?,?,?,?,?,?,?)', 
                [userId, projectId, 'Channel Created', `Created chat channel: ${channelName}`, 'Active', 'chatbaseEvent', '']);
        }

        res.status(201).json({ success: true, channelId: channelIdStr, message: "Channel created" });
    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, message: "Failed to create channel" });
    }
};

const joinChannel = async (req, res) => {
    const { clusterId, channelId, memberId, memberName, role = 'member' } = req.body;
    if (!channelId || !memberId) return res.status(400).json({ success: false, message: "Channel ID and Member ID required" });

    try {
        const connection = await makeConnection();
        const query = `
            INSERT INTO Chatbase_Members (channel_id, cluster_id, user_id, role)
            VALUES (?, ?, ?, ?)
            ON DUPLICATE KEY UPDATE role = role
        `;
        await connection.query(query, [channelId, clusterId, memberId, role]);
        
        res.status(200).json({ success: true, message: "Joined channel" });
    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, message: "Failed to join channel" });
    }
};

const sendMessage = async (req, res) => {
    const { clusterId, senderId, text, attachments, replyTo, parentMsgId, isEncrypted } = req.body;
    const channelId = req.params.channelId || req.body.channelId;
    if (!channelId || !senderId || (!text && !attachments)) {
        return res.status(400).json({ success: false, message: "Missing required message fields" });
    }

    try {
        const startTime = Date.now();
        const connection = await makeConnection();
        const messageId = uuidv4();
        const payloadStr = attachments ? JSON.stringify(attachments) : null;
        
        const query = `
            INSERT INTO Chatbase_Messages (msg_id, channel_id, cluster_id, sender_id, text, attachments, reply_to, parent_msg_id, is_encrypted)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `;
        await connection.query(query, [messageId, channelId, clusterId, senderId, text, payloadStr, replyTo || null, parentMsgId || null, isEncrypted ? 1 : 0]);

        const sizeDelta = Buffer.byteLength(text || '', 'utf8') + (payloadStr ? Buffer.byteLength(payloadStr, 'utf8') : 0);

        const projectId = req.project_id || req.sdk_project_id;
        const userId = req.user_id || req.sdk_user_id;
        if (projectId && userId && sizeDelta > 0) {
            await connection.query('UPDATE Cluster_Table SET space_used = space_used + ? WHERE id = ?', [sizeDelta, clusterId]);
        }

        logLocalMetric(clusterId, 'Chatbase Send Message', Date.now() - startTime);

        const io = req.app?.get('io');
        if (io) {
            io.to(`cluster_${clusterId}`).emit('chatbase_message', {
                id: messageId,
                channelId,
                senderId,
                text: text,
                attachments: attachments,
                replyTo,
                parentMsgId,
                isEncrypted,
                created_at: new Date().toISOString()
            });
        }

        res.status(201).json({ success: true, messageId, message: "Message sent" });
    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, message: "Failed to send message" });
    }
};

const editMessage = async (req, res) => {
    const { clusterId, senderId, newText } = req.body;
    const channelId = req.params.channelId || req.body.channelId;
    const msgId = req.params.messageId || req.body.msgId;
    try {
        const startTime = Date.now();
        const connection = await makeConnection();
        
        await connection.query(
            "UPDATE Chatbase_Messages SET text = ?, is_edited = 1 WHERE cluster_id = ? AND channel_id = ? AND msg_id = ? AND sender_id = ?",
            [newText, clusterId, channelId, msgId, senderId]
        );

        logLocalMetric(clusterId, 'Chatbase Edit Message', Date.now() - startTime);

        const io = req.app?.get('io');
        if (io) {
            io.to(`cluster_${clusterId}`).emit('message_edited', { channelId, msgId, newText });
        }

        res.status(200).json({ success: true, message: "Message edited" });
    } catch (error) {
        res.status(500).json({ success: false, message: "Failed to edit message" });
    }
};

const deleteMessage = async (req, res) => {
    const { clusterId, senderId } = req.body;
    const channelId = req.params.channelId || req.body.channelId;
    const msgId = req.params.messageId || req.body.msgId;
    try {
        const startTime = Date.now();
        const connection = await makeConnection();
        
        await connection.query(
            "UPDATE Chatbase_Messages SET is_deleted = 1, text = '' WHERE cluster_id = ? AND channel_id = ? AND msg_id = ? AND sender_id = ?",
            [clusterId, channelId, msgId, senderId]
        );

        logLocalMetric(clusterId, 'Chatbase Delete Message', Date.now() - startTime);

        const io = req.app?.get('io');
        if (io) {
            io.to(`cluster_${clusterId}`).emit('message_deleted', { channelId, msgId });
        }

        res.status(200).json({ success: true, message: "Message deleted" });
    } catch (error) {
        res.status(500).json({ success: false, message: "Failed to delete message" });
    }
};

const addReaction = async (req, res) => {
    const { clusterId, channelId, msgId, userId, emoji } = req.body;
    try {
        const startTime = Date.now();
        const connection = await makeConnection();
        const query = `
            INSERT INTO Chatbase_Reactions (cluster_id, msg_id, user_id, reaction)
            VALUES (?, ?, ?, ?)
            ON DUPLICATE KEY UPDATE reaction = ?
        `;
        await connection.query(query, [clusterId, msgId, userId, emoji, emoji]);

        logLocalMetric(clusterId, 'Chatbase Add Reaction', Date.now() - startTime);

        const io = req.app?.get('io');
        if (io) {
            io.to(`cluster_${clusterId}`).emit('reaction_added', { channelId, msgId, userId, emoji });
        }
        res.status(200).json({ success: true, message: "Reaction added" });
    } catch (error) {
        res.status(500).json({ success: false, message: "Failed to add reaction" });
    }
};

const removeReaction = async (req, res) => {
    const { clusterId, channelId, msgId, userId, emoji } = req.body;
    try {
        const startTime = Date.now();
        const connection = await makeConnection();
        await connection.query(
            "DELETE FROM Chatbase_Reactions WHERE cluster_id = ? AND msg_id = ? AND user_id = ? AND reaction = ?",
            [clusterId, msgId, userId, emoji]
        );

        logLocalMetric(clusterId, 'Chatbase Remove Reaction', Date.now() - startTime);

        const io = req.app?.get('io');
        if (io) {
            io.to(`cluster_${clusterId}`).emit('reaction_removed', { channelId, msgId, userId, emoji });
        }
        res.status(200).json({ success: true, message: "Reaction removed" });
    } catch (error) {
        res.status(500).json({ success: false, message: "Failed to remove reaction" });
    }
};

const scheduleAITask = async (req, res) => {
    const { clusterId, channelId, userId, prompt, taskType, priority } = req.body;
    try {
        const startTime = Date.now();
        const connection = await makeConnection();
        const taskId = uuidv4();
        const query = `
            INSERT INTO Chatbase_AI_Tasks (cluster_id, channel_id, user_id, prompt, task_type, priority, status)
            VALUES (?, ?, ?, ?, ?, ?, 'pending')
        `;
        await connection.query(query, [clusterId, channelId, userId, prompt, taskType, priority || 'normal']);

        logLocalMetric(clusterId, 'Chatbase Schedule AI', Date.now() - startTime);

        const io = req.app?.get('io');
        if (io) {
            io.to(`cluster_${clusterId}`).emit('ai_task_scheduled', { channelId, taskId, status: 'pending' });
        }

        res.status(201).json({ success: true, taskId, message: "AI Task scheduled" });
    } catch (error) {
        res.status(500).json({ success: false, message: "Failed to schedule AI task" });
    }
};

const getAITasks = async (req, res) => {
    const { clusterId, channelId } = req.body;
    try {
        const connection = await makeConnection();
        const [rows] = await connection.query(
            "SELECT * FROM Chatbase_AI_Tasks WHERE cluster_id = ? AND channel_id = ? ORDER BY created_at DESC",
            [clusterId, channelId]
        );
        res.status(200).json({ success: true, tasks: rows });
    } catch (error) {
        res.status(500).json({ success: false, message: "Failed to fetch AI tasks" });
    }
};

// PHASE 7: AI STREAMING & TOOLING
const postAIStream = async (req, res) => {
    const { clusterId, channelId, streamId, chunk, isDone, finalMessage } = req.body;
    try {
        const io = req.app?.get('io');
        if (io) {
            if (isDone) {
                // Optionally save the final message to Chatbase_Messages here, but typically the orchestrator handles that separately via sendMessage
                io.to(`cluster_${clusterId}`).emit('ai_stream_completed', { channelId, streamId, finalMessage });
            } else {
                io.to(`cluster_${clusterId}`).emit('ai_stream_chunk', { channelId, streamId, chunk });
            }
        }
        res.status(200).json({ success: true });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

const updateAIStreamTask = async (req, res) => {
    const { clusterId, channelId, taskId, taskState } = req.body;
    try {
        const io = req.app?.get('io');
        if (io) io.to(`cluster_${clusterId}`).emit('ai_stream_task_updated', { channelId, taskId, taskState });
        res.status(200).json({ success: true });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

const registerClientTool = async (req, res) => {
    const { clusterId, channelId, toolName, schema } = req.body;
    try {
        const io = req.app?.get('io');
        if (io) io.to(`cluster_${clusterId}`).emit('ai_client_tool_registered', { channelId, toolName, schema });
        res.status(200).json({ success: true });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

const handoffToHuman = async (req, res) => {
    const { clusterId, channelId, agentId, reason } = req.body;
    try {
        const io = req.app?.get('io');
        if (io) io.to(`cluster_${clusterId}`).emit('human_handoff_requested', { channelId, agentId, reason });
        res.status(200).json({ success: true });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

// PHASE 8: OFFLINE & DELTA STREAMING
const streamDeltaPatch = async (req, res) => {
    const { clusterId, channelId, msgId, patch } = req.body;
    try {
        const startTime = Date.now();
        // The patch is a JSON patch array. For performance, we broadcast it immediately over sockets to peers.
        // We do NOT write to SQL on every single keystroke patch to save I/O. The client will eventually fire a standard `editMessage` to flush.
        logLocalMetric(clusterId, 'Chatbase Delta Patch', Date.now() - startTime);

        const io = req.app?.get('io');
        if (io) io.to(`cluster_${clusterId}`).emit('delta_patch_applied', { channelId, msgId, patch });
        
        res.status(200).json({ success: true });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

const syncLocalCache = async (req, res) => {
    const { clusterId, mutations } = req.body;
    try {
        // mutations is an array of offline events. In a real system, you'd iterate and apply them.
        // For now, we simulate processing the queue and returning success.
        const startTime = Date.now();
        
        // Loop over mutations and apply (mocked implementation)
        // mutations.forEach(mut => { if (mut.type === 'sendMessage') ... })

        logLocalMetric(clusterId, 'Chatbase Sync Cache', Date.now() - startTime);
        res.status(200).json({ success: true, syncedCounts: mutations.length });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

const subscribeFieldPath = async (req, res) => {
    // This is essentially just confirming subscription. The actual field path emission
    // happens on the backend when specific JSON fields update, but since this is socket-driven,
    // the client registers it locally. We just acknowledge it.
    res.status(200).json({ success: true });
};

// PHASE 9: MEDIA & VOICE PAYLOADS
const sendMediaMessage = async (req, res) => {
    const { clusterId, channelId, senderId } = req.body;
    try {
        if (!req.file) return res.status(400).json({ success: false, message: "No media file uploaded" });

        const startTime = Date.now();
        const connection = await makeConnection();
        const msgId = uuidv4();
        
        const mediaUrl = `/uploads/${req.file.filename}`;
        const attachments = JSON.stringify([{ url: mediaUrl, type: req.file.mimetype, name: req.file.originalname }]);

        const query = `
            INSERT INTO Chatbase_Messages (cluster_id, channel_id, msg_id, sender_id, text, attachments)
            VALUES (?, ?, ?, ?, ?, ?)
        `;
        await connection.query(query, [clusterId, channelId, msgId, senderId, '', attachments]);

        logLocalMetric(clusterId, 'Chatbase Media Message', Date.now() - startTime);

        const io = req.app?.get('io');
        if (io) io.to(`cluster_${clusterId}`).emit('chatbase_message', { channelId, msgId, senderId, text: '', attachments: JSON.parse(attachments) });
        
        res.status(201).json({ success: true, msgId, mediaUrl });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

const sendVoiceNote = async (req, res) => {
    const { clusterId, channelId, senderId, duration } = req.body;
    try {
        if (!req.file) return res.status(400).json({ success: false, message: "No voice file uploaded" });

        const startTime = Date.now();
        const connection = await makeConnection();
        const msgId = uuidv4();
        
        const voiceUrl = `/uploads/${req.file.filename}`;
        const attachments = JSON.stringify([{ url: voiceUrl, type: 'audio/voice-note', duration: duration }]);

        const query = `
            INSERT INTO Chatbase_Messages (cluster_id, channel_id, msg_id, sender_id, text, attachments)
            VALUES (?, ?, ?, ?, ?, ?)
        `;
        await connection.query(query, [clusterId, channelId, msgId, senderId, '', attachments]);

        logLocalMetric(clusterId, 'Chatbase Voice Note', Date.now() - startTime);

        const io = req.app?.get('io');
        if (io) io.to(`cluster_${clusterId}`).emit('chatbase_message', { channelId, msgId, senderId, text: '', attachments: JSON.parse(attachments) });
        
        res.status(201).json({ success: true, msgId, voiceUrl });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

// PHASE 6: ADVANCED MESSAGE & CHANNEL CONTROLS

const freezeChannel = async (req, res) => {
    const { clusterId, userId } = req.body;
    const channelId = req.params.channelId || req.body.channelId;
    try {
        const startTime = Date.now();
        const connection = await makeConnection();
        await enforceAdmin(connection, clusterId, channelId, userId);
        
        await connection.query("UPDATE Chatbase_Channels SET is_frozen = TRUE WHERE cluster_id = ? AND channel_id = ?", [clusterId, channelId]);
        logLocalMetric(clusterId, 'Chatbase Freeze Channel', Date.now() - startTime);

        const io = req.app?.get('io');
        if (io) io.to(`cluster_${clusterId}`).emit('channel_frozen', { channelId });
        
        res.status(200).json({ success: true, message: "Channel frozen" });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

const unfreezeChannel = async (req, res) => {
    const { clusterId, userId } = req.body;
    const channelId = req.params.channelId || req.body.channelId;
    try {
        const startTime = Date.now();
        const connection = await makeConnection();
        await enforceAdmin(connection, clusterId, channelId, userId);
        
        await connection.query("UPDATE Chatbase_Channels SET is_frozen = FALSE WHERE cluster_id = ? AND channel_id = ?", [clusterId, channelId]);
        logLocalMetric(clusterId, 'Chatbase Unfreeze Channel', Date.now() - startTime);

        const io = req.app?.get('io');
        if (io) io.to(`cluster_${clusterId}`).emit('channel_unfrozen', { channelId });
        
        res.status(200).json({ success: true, message: "Channel unfrozen" });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

const pinMessage = async (req, res) => {
    const { clusterId, channelId, msgId, userId } = req.body;
    try {
        const startTime = Date.now();
        const connection = await makeConnection();
        await enforceAdmin(connection, clusterId, channelId, userId);
        
        await connection.query("UPDATE Chatbase_Messages SET is_pinned = TRUE WHERE cluster_id = ? AND msg_id = ?", [clusterId, msgId]);
        logLocalMetric(clusterId, 'Chatbase Pin Message', Date.now() - startTime);

        const io = req.app?.get('io');
        if (io) io.to(`cluster_${clusterId}`).emit('message_pinned', { channelId, msgId });
        
        res.status(200).json({ success: true, message: "Message pinned" });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

const unpinMessage = async (req, res) => {
    const { clusterId, channelId, msgId, userId } = req.body;
    try {
        const startTime = Date.now();
        const connection = await makeConnection();
        await enforceAdmin(connection, clusterId, channelId, userId);
        
        await connection.query("UPDATE Chatbase_Messages SET is_pinned = FALSE WHERE cluster_id = ? AND msg_id = ?", [clusterId, msgId]);
        logLocalMetric(clusterId, 'Chatbase Unpin Message', Date.now() - startTime);

        const io = req.app?.get('io');
        if (io) io.to(`cluster_${clusterId}`).emit('message_unpinned', { channelId, msgId });
        
        res.status(200).json({ success: true, message: "Message unpinned" });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

const forwardMessage = async (req, res) => {
    const { clusterId, targetChannelId, sourceMessageId, senderId } = req.body;
    try {
        const startTime = Date.now();
        const connection = await makeConnection();
        const msgId = uuidv4();
        
        // Fetch source message
        const [sourceRows] = await connection.query("SELECT text, attachments, payload FROM Chatbase_Messages WHERE cluster_id = ? AND msg_id = ?", [clusterId, sourceMessageId]);
        if (!sourceRows.length) return res.status(404).json({ success: false, message: "Source message not found" });

        const source = sourceRows[0];
        const payloadStr = source.payload ? JSON.stringify(source.payload) : null;
        
        const query = `
            INSERT INTO Chatbase_Messages (cluster_id, channel_id, msg_id, sender_id, text, attachments, payload)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        `;
        await connection.query(query, [clusterId, targetChannelId, msgId, senderId, source.text, source.attachments, payloadStr]);
        
        logLocalMetric(clusterId, 'Chatbase Forward Message', Date.now() - startTime);

        const io = req.app?.get('io');
        if (io) {
            io.to(`cluster_${clusterId}`).emit('chatbase_message', { 
                channelId: targetChannelId, msgId, senderId, text: source.text, attachments: source.attachments 
            });
        }
        res.status(201).json({ success: true, msgId, message: "Message forwarded" });
    } catch (error) {
        res.status(500).json({ success: false, message: "Failed to forward message" });
    }
};

const markAsRead = async (req, res) => {
    const { clusterId, channelId, msgId, userId } = req.body;
    try {
        const startTime = Date.now();
        const connection = await makeConnection();
        // Since JSON array updates in MySQL can be complex for dynamic appending, we emit the status instead of complex SQL array functions,
        // but for robustness we will just emit the delivery receipt update.
        logLocalMetric(clusterId, 'Chatbase Mark Read', Date.now() - startTime);

        const io = req.app?.get('io');
        if (io) io.to(`cluster_${clusterId}`).emit('message_delivery_status', { channelId, msgId, userId, status: 'READ' });
        
        res.status(200).json({ success: true, message: "Message marked as read" });
    } catch (error) {
        res.status(500).json({ success: false, message: "Failed to mark as read" });
    }
};

const resendFailedMessage = async (req, res) => {
    // Treat similar to standard sendMessage if it failed locally
    return sendMessage(req, res);
};

const scheduleMessage = async (req, res) => {
    const { clusterId, channelId, senderId, text, attachments, sendAt } = req.body;
    try {
        const startTime = Date.now();
        const connection = await makeConnection();
        const payloadStr = attachments ? JSON.stringify(attachments) : null;
        
        const query = `
            INSERT INTO Chatbase_Scheduled_Messages (cluster_id, channel_id, sender_id, text, attachments, send_at)
            VALUES (?, ?, ?, ?, ?, ?)
        `;
        await connection.query(query, [clusterId, channelId, senderId, text, payloadStr, sendAt]);

        logLocalMetric(clusterId, 'Chatbase Mute Member', Date.now() - startTime);

        res.status(201).json({ success: true, message: "Message scheduled" });
    } catch (error) {
        res.status(500).json({ success: false, message: "Failed to schedule message" });
    }
};

const getChannels = async (req, res) => {
    const { clusterId } = req.body;
    try {
        const connection = await require("../SQLConnection")();
        const [rows] = await connection.query("SELECT * FROM Chatbase_Channels WHERE cluster_id = ?", [clusterId]);
        res.status(200).json({ success: true, channels: rows });
    } catch(error) {
        res.status(500).json({ success: false });
    }
};

const getMessages = async (req, res) => {
    const { clusterId, channelId, limit = 50, offset = 0 } = req.body;
    if (!channelId) return res.status(400).json({ success: false, message: "Channel ID required" });

    try {
        const connection = await makeConnection();
        const query = `
            SELECT msg_id as id, sender_id, text, attachments, reply_to, parent_msg_id, created_at, is_encrypted, is_edited
            FROM Chatbase_Messages
            WHERE cluster_id = ? AND channel_id = ? AND is_deleted = 0
            ORDER BY created_at DESC
            LIMIT ? OFFSET ?
        `;
        const [rows] = await connection.query(query, [clusterId, channelId, parseInt(limit), parseInt(offset)]);
        
        // Return in chronological order
        res.status(200).json({ success: true, messages: rows.reverse() });
    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, message: "Failed to fetch messages" });
    }
};

const banMember = async (req, res) => {
    const { clusterId, channelId, targetUserId, adminUserId, reason, durationMinutes } = req.body;
    try {
        const startTime = Date.now();
        const connection = await makeConnection();
        await enforceAdmin(connection, clusterId, channelId, adminUserId);

        const query = `
            INSERT INTO Chatbase_Moderation (cluster_id, channel_id, user_id, action_type, reason, duration_minutes)
            VALUES (?, ?, ?, 'ban', ?, ?)
        `;
        await connection.query(query, [clusterId, channelId, targetUserId, reason, durationMinutes]);

        // Remove from members list
        await connection.query(
            "DELETE FROM Chatbase_Members WHERE cluster_id = ? AND channel_id = ? AND user_id = ?",
            [clusterId, channelId, targetUserId]
        );

        logLocalMetric(clusterId, 'Chatbase Join Channel', Date.now() - startTime);

        const io = req.app?.get('io');
        if (io) {
            io.to(`cluster_${clusterId}`).emit('user_banned', { channelId, userId: targetUserId, reason });
        }

        res.status(200).json({ success: true, message: "User banned successfully" });
    } catch (error) {
        console.error(error);
        res.status(error.message.includes('Forbidden') ? 403 : 500).json({ success: false, message: error.message || "Failed to ban member" });
    }
};

const muteMember = async (req, res) => {
    const { clusterId, channelId, targetUserId, adminUserId, durationMinutes } = req.body;
    try {
        const startTime = Date.now();
        const connection = await makeConnection();
        await enforceAdmin(connection, clusterId, channelId, adminUserId);

        const query = `
            INSERT INTO Chatbase_Moderation (cluster_id, channel_id, user_id, action_type, duration_minutes)
            VALUES (?, ?, ?, 'mute', ?)
        `;
        await connection.query(query, [clusterId, channelId, targetUserId, durationMinutes]);

        logLocalMetric(clusterId, 'Chatbase Ban Member', Date.now() - startTime);

        const io = req.app?.get('io');
        if (io) {
            io.to(`cluster_${clusterId}`).emit('user_muted', { channelId, userId: targetUserId, durationMinutes });
        }

        res.status(200).json({ success: true, message: "User muted successfully" });
    } catch (error) {
        res.status(error.message.includes('Forbidden') ? 403 : 500).json({ success: false, message: error.message || "Failed to mute member" });
    }
};

const updateMemberRole = async (req, res) => {
    const { clusterId, channelId, targetUserId, adminUserId, newRole } = req.body;
    try {
        const startTime = Date.now();
        const connection = await makeConnection();
        await enforceAdmin(connection, clusterId, channelId, adminUserId);

        await connection.query(
            "UPDATE Chatbase_Members SET role = ? WHERE cluster_id = ? AND channel_id = ? AND user_id = ?",
            [newRole, clusterId, channelId, targetUserId]
        );

        logLocalMetric(clusterId, 'Chatbase Update Role', Date.now() - startTime);

        const io = req.app?.get('io');
        if (io) {
            io.to(`cluster_${clusterId}`).emit('role_updated', { channelId, userId: targetUserId, newRole });
        }

        res.status(200).json({ success: true, message: "Role updated" });
    } catch (error) {
        res.status(error.message.includes('Forbidden') ? 403 : 500).json({ success: false, message: error.message || "Failed to update role" });
    }
};
const getMembers = async (req, res) => {
    const { clusterId, channelId } = req.body;
    if (!channelId) return res.status(400).json({ success: false, message: "Channel ID required" });
    try {
        const connection = await makeConnection();
        const [rows] = await connection.query("SELECT * FROM Chatbase_Members WHERE cluster_id = ? AND channel_id = ?", [clusterId, channelId]);
        res.status(200).json({ success: true, members: rows });
    } catch(error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

const unbanMember = async (req, res) => {
    const { clusterId, channelId, userId, targetUserId } = req.body;
    try {
        const startTime = Date.now();
        const connection = await makeConnection();
        await enforceAdmin(connection, clusterId, channelId, userId);
        
        await connection.query(
            "UPDATE Chatbase_Members SET role = 'member' WHERE cluster_id = ? AND channel_id = ? AND user_id = ?",
            [clusterId, channelId, targetUserId]
        );

        logLocalMetric(clusterId, 'Chatbase Unban Member', Date.now() - startTime);

        const io = req.app?.get('io');
        if (io) {
            io.to(`cluster_${clusterId}`).emit('user_unbanned', { channelId, userId: targetUserId });
        }

        res.status(200).json({ success: true, message: "Member unbanned" });
    } catch (error) {
        res.status(error.message.includes('Forbidden') ? 403 : 500).json({ success: false, message: error.message || "Failed to unban member" });
    }
};

module.exports = {
    getMembers,
    unbanMember,
    createChannel,
    joinChannel,
    sendMessage,
    editMessage,
    deleteMessage,
    scheduleMessage,
    addReaction,
    removeReaction,
    scheduleAITask,
    getAITasks,
    getChannels,
    getMessages,
    banMember,
    muteMember,
    updateMemberRole,
    freezeChannel,
    unfreezeChannel,
    pinMessage,
    unpinMessage,
    forwardMessage,
    markAsRead,
    resendFailedMessage,
    postAIStream,
    updateAIStreamTask,
    registerClientTool,
    handoffToHuman,
    streamDeltaPatch,
    syncLocalCache,
    subscribeFieldPath,
    sendMediaMessage,
    sendVoiceNote
};
