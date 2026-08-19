const express = require("express");
const { createChannel, joinChannel, sendMessage, getMessages, banMember, muteMember, updateMemberRole, editMessage, deleteMessage, scheduleMessage, addReaction, removeReaction, scheduleAITask, getAITasks, getChannels, freezeChannel, unfreezeChannel, pinMessage, unpinMessage, forwardMessage, markAsRead, resendFailedMessage, postAIStream, updateAIStreamTask, registerClientTool, handoffToHuman, streamDeltaPatch, syncLocalCache, subscribeFieldPath, sendMediaMessage, sendVoiceNote, getMembers, unbanMember } = require("../Controllers/ChatbaseController");
const apiGuard = require("../Middleware/apiGuard");
const multer = require("multer");
const path = require("path");

const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, 'uploads/')
    },
    filename: function (req, file, cb) {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9)
        cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname))
    }
});
const upload = multer({ storage: storage });

const router = express.Router();

// Apply apiGuard so RBAC, Storage Limits, and Paused clusters are enforced automatically!
router.use(apiGuard);

// ----------------------------------------------------
// RESTful Admin Control Plane API (/admin/v1/...)
// ----------------------------------------------------
router.get("/channels", getChannels);
router.post("/channels", createChannel);
router.delete("/channels/:channelId", (req, res) => res.status(501).json({message: "Not implemented yet"})); // Purge Channel

router.post("/channels/:channelId", (req, res) => {
    // PATCH /admin/v1/channels/:channelId is requested, but Express might prefer PATCH, so we handle both.
    if(req.body.isFrozen !== undefined) return freezeChannel(req, res);
    return res.status(400).json({success: false});
});
router.patch("/channels/:channelId", (req, res) => {
    if(req.body.isFrozen !== undefined) return freezeChannel(req, res);
    return res.status(400).json({success: false});
});

router.post("/channels/:channelId/messages", sendMessage);
router.patch("/channels/:channelId/messages/:messageId", editMessage);
router.delete("/channels/:channelId/messages/:messageId", deleteMessage);

router.post("/channels/:channelId/bans", banMember);

// ----------------------------------------------------
// Legacy / RPC API Routes (Backward Compatibility)
// ----------------------------------------------------
router.post("/getChannels", getChannels);
router.post("/getMembers", getMembers);
router.post("/createChannel", createChannel);
router.post("/joinChannel", joinChannel);
router.post("/sendMessage", sendMessage);
router.post("/editMessage", editMessage);
router.post("/deleteMessage", deleteMessage);
router.post("/scheduleMessage", scheduleMessage);
router.post("/addReaction", addReaction);
router.post("/removeReaction", removeReaction);
router.post("/scheduleAITask", scheduleAITask);
router.post("/getAITasks", getAITasks);
router.post("/getMessages", getMessages);
router.post("/banMember", banMember);
router.post("/unbanMember", unbanMember);
router.post("/muteMember", muteMember);
router.post("/updateMemberRole", updateMemberRole);
router.post("/freezeChannel", freezeChannel);
router.post("/unfreezeChannel", unfreezeChannel);
router.post("/pinMessage", pinMessage);
router.post("/unpinMessage", unpinMessage);
router.post("/forwardMessage", forwardMessage);
router.post("/markAsRead", markAsRead);
router.post("/resendFailedMessage", resendFailedMessage);
router.post("/postAIStream", postAIStream);
router.post("/updateAIStreamTask", updateAIStreamTask);
router.post("/registerClientTool", registerClientTool);
router.post("/handoffToHuman", handoffToHuman);
router.post("/streamDeltaPatch", streamDeltaPatch);
router.post("/syncLocalCache", syncLocalCache);
router.post("/subscribeFieldPath", subscribeFieldPath);
router.post("/sendMediaMessage", upload.single('media'), sendMediaMessage);
router.post("/sendVoiceNote", upload.single('voice'), sendVoiceNote);

module.exports = router;
