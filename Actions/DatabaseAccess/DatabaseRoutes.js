const { fetchDbUsersSql, addDbUserSql, deleteDbUserSql } = require("./BasicDatabaseSql");
const { Auth } = require("../Cluster/CheckAuth");

const fetchDbUsers = async(req, res) =>{
    const {userId, Profile_Key, projectId, projectKey, page = 1 } = req.body
    const checkAuth = await Auth(userId,Profile_Key, projectId, projectKey)
    if (checkAuth?.error) {
        return res.status(400).json({message: "error validating param"})
    }
    const users = await fetchDbUsersSql(projectId, page)
    if (users?.error) {
        return res.status(400).json({message: "Error getting db users"})
    }
    return res.status(201).json({message: users})
}

const addDbUser = async(req, res) =>{
    const {userId, Profile_Key, projectId, projectKey, DB_Username, DB_Password, Role } = req.body
    const checkAuth = await Auth(userId,Profile_Key, projectId, projectKey)
    if (checkAuth?.error) {
        return res.status(400).json({message: "error validating param"})
    }
    const userIdRes = await addDbUserSql(projectId, DB_Username, DB_Password, Role)
    if (userIdRes?.error) {
        return res.status(400).json({message: "Error adding db user"})
    }
    return res.status(201).json({message: userIdRes})
}

const deleteDbUser = async(req, res) =>{
    const {userId, Profile_Key, projectId, projectKey, dbUserId } = req.body
    const checkAuth = await Auth(userId,Profile_Key, projectId, projectKey)
    if (checkAuth?.error) {
        return res.status(400).json({message: "error validating param"})
    }
    const result = await deleteDbUserSql(dbUserId, projectId)
    if (result?.error) {
        return res.status(400).json({message: "Error deleting db user"})
    }
    return res.status(201).json({message: dbUserId})
}

module.exports = { fetchDbUsers, addDbUser, deleteDbUser }
