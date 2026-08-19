const makeConnection = require('./SQLConnection');

async function testChatbase() {
    console.log("🚀 Starting Chatbase API Tests...");
    let db;
    try {
        db = await makeConnection();
    } catch(e) {
        console.error("❌ Failed to connect to DB:", e);
        process.exit(1);
    }

    // 1. Setup Test Cluster & User
    console.log("Setting up test cluster...");
    let clusterId = 16;
    let channelId = null;
    let messageId = null;
    let adminUserId = "test_admin_" + Date.now();
    
    console.log("Testing controllers directly to bypass apiGuard HTTP requirements...");
    const controllers = require('./Controllers/ChatbaseController');

    const mockRes = () => {
        const res = {};
        res.status = (s) => { res.statusCode = s; return res; };
        res.json = (data) => { res.data = data; return res; };
        return res;
    };

    const mockReq = (body) => ({ 
        body, 
        project_id: 2, 
        user_id: 1,
        app: { get: () => null } // Mock io
    });

    // Test 1: createChannel
    console.log("1. Testing createChannel...");
    let res1 = mockRes();
    await controllers.createChannel(mockReq({ clusterId, channelName: "general" }), res1);
    if(res1.statusCode === 201) {
        channelId = res1.data.channelId;
        console.log("✅ createChannel passed. Channel ID:", channelId);
    } else {
        console.error("❌ createChannel failed:", res1.data);
    }

    // Test 2: joinChannel (Admin user)
    console.log("2. Testing joinChannel...");
    let res2 = mockRes();
    await controllers.joinChannel(mockReq({ clusterId, channelId, memberId: adminUserId, memberName: "Admin User", role: "admin" }), res2);
    if(res2.statusCode === 200) console.log("✅ joinChannel passed.");
    else console.error("❌ joinChannel failed:", res2.data);

    // Test 3: sendMessage
    console.log("3. Testing sendMessage...");
    let res3 = mockRes();
    await controllers.sendMessage(mockReq({ clusterId, channelId, senderId: adminUserId, text: "Hello World", isEncrypted: false }), res3);
    if(res3.statusCode === 201) {
        messageId = res3.data.messageId;
        console.log("✅ sendMessage passed. Message ID:", messageId);
    } else {
        console.error("❌ sendMessage failed:", res3.data);
    }

    // Test 4: editMessage
    console.log("4. Testing editMessage...");
    let res4 = mockRes();
    await controllers.editMessage(mockReq({ clusterId, channelId, msgId: messageId, senderId: adminUserId, newText: "Hello Edited" }), res4);
    if(res4.statusCode === 200) console.log("✅ editMessage passed.");
    else console.error("❌ editMessage failed:", res4.data);

    // Test 5: addReaction
    console.log("5. Testing addReaction...");
    let res5 = mockRes();
    await controllers.addReaction(mockReq({ clusterId, channelId, msgId: messageId, userId: adminUserId, emoji: "👍" }), res5);
    if(res5.statusCode === 200) console.log("✅ addReaction passed.");
    else console.error("❌ addReaction failed:", res5.data);

    // Test 6: scheduleAITask
    console.log("6. Testing scheduleAITask...");
    let res6 = mockRes();
    await controllers.scheduleAITask(mockReq({ clusterId, channelId, userId: adminUserId, prompt: "Summarize this channel", taskType: "summarize" }), res6);
    if(res6.statusCode === 201) console.log("✅ scheduleAITask passed. Task ID:", res6.data.taskId);
    else console.error("❌ scheduleAITask failed:", res6.data);

    // Test 7: deleteMessage
    console.log("7. Testing deleteMessage...");
    let res7 = mockRes();
    await controllers.deleteMessage(mockReq({ clusterId, channelId, msgId: messageId, senderId: adminUserId }), res7);
    if(res7.statusCode === 200) console.log("✅ deleteMessage passed.");
    else console.error("❌ deleteMessage failed:", res7.data);

    // Test 8: getMessages
    console.log("8. Testing getMessages...");
    let res8 = mockRes();
    await controllers.getMessages(mockReq({ clusterId, channelId }), res8);
    if(res8.statusCode === 200) {
        console.log("✅ getMessages passed. Messages retrieved:", res8.data.messages.length);
        if (res8.data.messages[0]) {
            console.log("  -> Message text:", res8.data.messages[0].text);
        }
    } else {
        console.error("❌ getMessages failed:", res8.data);
    }

    // Cleanup
    console.log("✅ Tests completed.");
    process.exit(0);
}

testChatbase();
