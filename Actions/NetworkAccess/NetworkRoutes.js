const { fetchNetworkRulesSql, addNetworkRuleSql, deleteNetworkRuleSql } = require("./BasicNetworkSql");
const { Auth } = require("../Cluster/CheckAuth");

const fetchNetworkRules = async(req, res) =>{
    const {userId, Profile_Key, projectId, projectKey, page = 1 } = req.body
    const checkAuth = await Auth(userId,Profile_Key, projectId, projectKey)
    if (checkAuth?.error) {
        return res.status(400).json({message: "error validating param"})
    }
    const rules = await fetchNetworkRulesSql(projectId, page)
    if (rules?.error) {
        return res.status(400).json({message: "Error getting network rules"})
    }
    return res.status(201).json({message: rules})
}

const addNetworkRule = async(req, res) =>{
    const {userId, Profile_Key, projectId, projectKey, IP_Address, Description } = req.body
    const checkAuth = await Auth(userId,Profile_Key, projectId, projectKey)
    if (checkAuth?.error) {
        return res.status(400).json({message: "error validating param"})
    }
    const ruleId = await addNetworkRuleSql(projectId, IP_Address, Description)
    if (ruleId?.error) {
        return res.status(400).json({message: "Error adding network rule"})
    }
    return res.status(201).json({message: ruleId})
}

const deleteNetworkRule = async(req, res) =>{
    const {userId, Profile_Key, projectId, projectKey, ruleId } = req.body
    const checkAuth = await Auth(userId,Profile_Key, projectId, projectKey)
    if (checkAuth?.error) {
        return res.status(400).json({message: "error validating param"})
    }
    const result = await deleteNetworkRuleSql(ruleId, projectId)
    if (result?.error) {
        return res.status(400).json({message: "Error deleting network rule"})
    }
    return res.status(201).json({message: ruleId})
}

module.exports = { fetchNetworkRules, addNetworkRule, deleteNetworkRule }
