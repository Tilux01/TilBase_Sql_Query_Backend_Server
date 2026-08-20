const broadcastRooms = new Map();

// Helper to get or create an in-memory room
function getRoom(clusterId, roomId) {
    const key = `${clusterId}_${roomId}`;
    if (!broadcastRooms.has(key)) {
        broadcastRooms.set(key, {
            viewers: new Set(),
            hosts: new Set(),
            peakViewers: 0,
            
            // Batch 2: Reactions
            reactionAggregates: {}, // { heart: 0, clap: 0 }
            reactionIntervalId: null,
            
            // Batch 2: Polls
            activePoll: null,
            
            // Batch 3: Q&A and Stage
            questions: new Map(), // questionId -> { id, text, upvotes, isAnswered }
            raisedHands: new Set(), // userIds requesting stage access
            
            // Batch 4: Storage
            skipStorage: true // Default to true for broadcast rooms
        });
    }
    return broadcastRooms.get(key);
}

// BATCH 2: REACTION AGGREGATOR
function startReactionAggregator(io, roomKey, room, roomId) {
    if (room.reactionIntervalId) return;
    
    // Broadcast aggregates every 500ms
    room.reactionIntervalId = setInterval(() => {
        if (Object.keys(room.reactionAggregates).length > 0) {
            io.to(roomKey).emit('broadcast_reaction_aggregate', {
                roomId,
                reactionCounts: { ...room.reactionAggregates }
            });
            // Reset aggregates after broadcasting
            room.reactionAggregates = {};
        }
    }, 500);
}

function initializeBroadcastEngine(io) {
    io.on('connection', (socket) => {
        // --- BATCH 1: CORE LIFECYCLE ---
        
        socket.on('broadcast_join', (data) => {
            const { clusterId, roomId, userId, options } = data;
            if (!clusterId || !roomId || !userId) return;

            const roomKey = `${clusterId}_${roomId}`;
            socket.join(roomKey);

            const room = getRoom(clusterId, roomId);
            room.viewers.add(userId);
            
            if (room.viewers.size > room.peakViewers) {
                room.peakViewers = room.viewers.size;
            }

            // Emit updated viewer count to the room
            io.to(roomKey).emit('broadcast_viewer_count', {
                roomId,
                totalViewers: room.viewers.size,
                peakViewers: room.peakViewers
            });
        });

        socket.on('broadcast_leave', (data) => {
            const { clusterId, roomId, userId } = data;
            if (!clusterId || !roomId || !userId) return;

            const roomKey = `${clusterId}_${roomId}`;
            socket.leave(roomKey);

            const room = getRoom(clusterId, roomId);
            room.viewers.delete(userId);
            room.hosts.delete(userId);

            // Clean up empty memory
            if (room.viewers.size === 0) {
                if (room.reactionIntervalId) clearInterval(room.reactionIntervalId);
                broadcastRooms.delete(roomKey);
            } else {
                io.to(roomKey).emit('broadcast_viewer_count', {
                    roomId,
                    totalViewers: room.viewers.size,
                    peakViewers: room.peakViewers
                });
            }
        });

        socket.on('broadcast_set_role', (data) => {
            const { clusterId, roomId, userId, role } = data;
            const room = getRoom(clusterId, roomId);
            if (role === 'host' || role === 'co-host') {
                room.hosts.add(userId);
            } else {
                room.hosts.delete(userId);
            }
        });

        socket.on('broadcast_get_viewers', (data) => {
            const { clusterId, roomId } = data;
            const roomKey = `${clusterId}_${roomId}`;
            const room = getRoom(clusterId, roomId);
            socket.emit('broadcast_viewer_count', {
                roomId,
                totalViewers: room.viewers.size,
                peakViewers: room.peakViewers
            });
        });

        // --- BATCH 1: HIGH-VOLUME FAN-OUT ---
        
        socket.on('broadcast_send_message', (data) => {
            const { clusterId, roomId, senderId, payload } = data;
            if (!clusterId || !roomId) return;
            
            const roomKey = `${clusterId}_${roomId}`;
            const message = {
                msgId: 'bmsg_' + Date.now() + '_' + Math.floor(Math.random() * 10000),
                roomId,
                senderId,
                payload,
                timestamp: Date.now()
            };

            // Pure fan-out: No DB wait. Fire and forget to all connected clients in the room.
            io.to(roomKey).emit('broadcast_message_received', {
                roomId,
                message
            });
        });

        socket.on('broadcast_send_announcement', (data) => {
            const { clusterId, roomId, senderId, payload } = data;
            if (!clusterId || !roomId) return;
            
            const room = getRoom(clusterId, roomId);
            if (!room.hosts.has(senderId)) return; // Security check

            const roomKey = `${clusterId}_${roomId}`;
            const announcement = {
                id: 'bann_' + Date.now(),
                roomId,
                senderId,
                payload,
                timestamp: Date.now()
            };

            io.to(roomKey).emit('broadcast_host_announcement', {
                roomId,
                announcement
            });
        });

        // --- BATCH 2: STREAM ENGAGEMENT (REACTIONS & POLLS) ---
        
        socket.on('broadcast_reaction_tap', (data) => {
            const { clusterId, roomId, userId, reactionType } = data;
            if (!clusterId || !roomId || !reactionType) return;
            
            const roomKey = `${clusterId}_${roomId}`;
            const room = getRoom(clusterId, roomId);
            
            // Add to in-memory aggregate
            if (!room.reactionAggregates[reactionType]) room.reactionAggregates[reactionType] = 0;
            room.reactionAggregates[reactionType] += 1;
            
            startReactionAggregator(io, roomKey, room, roomId);
            
            // Also fire burst payload randomly or selectively for particle engines
            // (e.g. only broadcast 1 out of every 10 taps immediately as a burst)
            if (Math.random() < 0.1) {
                io.to(roomKey).emit('broadcast_reaction_burst', {
                    roomId,
                    reactionStreamData: { reactionType, count: 1 }
                });
            }
        });

        socket.on('broadcast_poll_create', (data) => {
            const { clusterId, roomId, userId, pollConfig } = data;
            const room = getRoom(clusterId, roomId);
            if (!room.hosts.has(userId)) return;

            room.activePoll = {
                id: 'bpoll_' + Date.now(),
                ...pollConfig,
                votes: {} // { optionId: count }
            };
            
            if (pollConfig.options) {
                pollConfig.options.forEach(opt => { room.activePoll.votes[opt.id] = 0; });
            }

            const roomKey = `${clusterId}_${roomId}`;
            io.to(roomKey).emit('broadcast_poll_started', {
                roomId,
                poll: room.activePoll
            });
        });

        socket.on('broadcast_poll_vote', (data) => {
            const { clusterId, roomId, userId, pollId, optionId } = data;
            const room = getRoom(clusterId, roomId);
            
            if (!room.activePoll || room.activePoll.id !== pollId) return;
            if (room.activePoll.votes[optionId] !== undefined) {
                room.activePoll.votes[optionId] += 1;
                
                // Real-time aggregate update
                const roomKey = `${clusterId}_${roomId}`;
                io.to(roomKey).emit('broadcast_poll_updated', {
                    roomId,
                    pollId,
                    aggregatedVotes: room.activePoll.votes
                });
            }
        });

        socket.on('broadcast_poll_close', (data) => {
            const { clusterId, roomId, userId, pollId } = data;
            const room = getRoom(clusterId, roomId);
            if (!room.hosts.has(userId)) return;
            if (!room.activePoll || room.activePoll.id !== pollId) return;

            const finalResults = { ...room.activePoll.votes };
            room.activePoll = null;

            const roomKey = `${clusterId}_${roomId}`;
            io.to(roomKey).emit('broadcast_poll_closed', {
                roomId,
                pollId,
                finalResults
            });
        });

        // --- BATCH 3: Q&A & STAGE MANAGEMENT ---
        socket.on('broadcast_qa_submit', (data) => {
            const { clusterId, roomId, userId, questionText } = data;
            const room = getRoom(clusterId, roomId);
            const questionId = 'bq_' + Date.now();
            
            const question = { id: questionId, userId, text: questionText, upvotes: 0, isAnswered: false };
            room.questions.set(questionId, question);
            
            const roomKey = `${clusterId}_${roomId}`;
            io.to(roomKey).emit('broadcast_qa_submitted', { roomId, question });
        });

        socket.on('broadcast_qa_upvote', (data) => {
            const { clusterId, roomId, userId, questionId } = data;
            const room = getRoom(clusterId, roomId);
            
            if (room.questions.has(questionId)) {
                const question = room.questions.get(questionId);
                question.upvotes += 1;
                
                const roomKey = `${clusterId}_${roomId}`;
                io.to(roomKey).emit('broadcast_qa_upvoted', { roomId, questionId, newVoteCount: question.upvotes });
            }
        });

        socket.on('broadcast_qa_answered', (data) => {
            const { clusterId, roomId, userId, questionId } = data;
            const room = getRoom(clusterId, roomId);
            if (!room.hosts.has(userId)) return;

            if (room.questions.has(questionId)) {
                const question = room.questions.get(questionId);
                question.isAnswered = true;
                
                const roomKey = `${clusterId}_${roomId}`;
                io.to(roomKey).emit('broadcast_qa_active', { roomId, activeQuestion: question });
            }
        });

        socket.on('broadcast_stage_raise_hand', (data) => {
            const { clusterId, roomId, userId } = data;
            const room = getRoom(clusterId, roomId);
            room.raisedHands.add(userId);
            
            const roomKey = `${clusterId}_${roomId}`;
            // Only broadcast to hosts ideally, but for now broadcast to room
            io.to(roomKey).emit('broadcast_stage_hand_raised', { roomId, userId });
        });

        socket.on('broadcast_stage_lower_hand', (data) => {
            const { clusterId, roomId, userId } = data;
            const room = getRoom(clusterId, roomId);
            room.raisedHands.delete(userId);
        });

        socket.on('broadcast_stage_grant', (data) => {
            const { clusterId, roomId, hostId, userId } = data;
            const room = getRoom(clusterId, roomId);
            if (!room.hosts.has(hostId)) return;
            
            const roomKey = `${clusterId}_${roomId}`;
            io.to(roomKey).emit('broadcast_stage_granted', { roomId, userId });
        });

        socket.on('broadcast_stage_revoke', (data) => {
            const { clusterId, roomId, hostId, userId } = data;
            const room = getRoom(clusterId, roomId);
            if (!room.hosts.has(hostId)) return;
            
            const roomKey = `${clusterId}_${roomId}`;
            io.to(roomKey).emit('broadcast_stage_revoked', { roomId, userId });
        });

        // --- BATCH 4: STORAGE CONTROL ---
        socket.on('broadcast_set_storage', (data) => {
            const { clusterId, roomId, skipStorage } = data;
            const room = getRoom(clusterId, roomId);
            room.skipStorage = skipStorage;
        });

    });
}

module.exports = {
    initializeBroadcastEngine
};
