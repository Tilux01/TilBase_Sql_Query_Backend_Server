export const fetchHistory = async (connection, user_id, project_id, page = 1) => {
    const limit = 16;
    const offset = (page - 1) * 15;
    const command = 'SELECT * FROM `Project_History` WHERE user_id=? AND Project_id=? ORDER BY id DESC LIMIT ? OFFSET ?'
    const value = [user_id, project_id, limit, offset]
    try {
        const [result] = await connection.execute(command, value)
        return result
    } catch (error) {
        console.log(error);
        return []
    }
}

export const fetchProjects = async (connection, user_id) => {
    const command = 'SELECT * FROM `Project_Table` WHERE user_id=?'
    const value = [user_id]
    try {
        const [result] = await connection.execute(command, value)
        return result
    } catch (error) {
        console.log(error);
        return []
    }
}

export const getProjectDetail = async (connection, userId, projectId) => {
    const command = 'SELECT * FROM `Project_Table` WHERE id=?'
    const value = [projectId]
    console.log(userId);

    try {
        const [result] = await connection.execute(command, value)
        console.log(result);
        if (result[0]?.user_id != userId) {
            return "Project Validation error"
        }
        return result[0]
    } catch (error) {
        console.log(error);
        return {}
    }
}

export const getUserPlan = async (connection, user_id) => {
    const command = 'SELECT * FROM `Plan` WHERE user_id=?'
    const value = [user_id]
    try {
        const [result] = await connection.execute(command, value)
        if (result.length == 0) {
            return { error: "No plan found for the  user" }
        }
        return result[0]
    } catch (error) {
        console.log(error);
        return { error: "Error fetching user plan" }
    }
}

export const checkPlan = async (connection, userId, ProjectPlan) => {
    try {
        const checkPlanCommand = 'SELECT Plan_Name FROM `Plan` WHERE user_id=?'
        const checkPlanValue = [userId]
        const [executeCheckPlan] = await connection.execute(checkPlanCommand, checkPlanValue)
        if (executeCheckPlan.length == 0) {
            return { error: "please provide a valid credentials" }
        }
        if (executeCheckPlan[0]?.Plan_Name != ProjectPlan) {
            console.log("Error, incorrect plan selected", executeCheckPlan[0]);
            return { error: "Error, incorrect plan selected" }
        }
    } catch (error) {
        console.log("error checking user plan", error);
        return {error:"Error checking user plan"}
    }
}

export const createProjectTable = async(connection, userId, ProjectName, projectDescription, Environment, ProjectKey, serverName, serverRegion, ProjectType, ProjectPlan)=>{
    try {
        const saveProject = 'INSERT INTO Project_Table (user_id, Project_Name, Project_Description, Environment, Project_Key, Server_Name, Server_Region, Project_Type, Project_Plan) VALUES (?, ?, ?, ?, ?, ?, ?, ?,?)'
        const Values = [userId, ProjectName, projectDescription, Environment, ProjectKey, serverName, serverRegion, ProjectType, ProjectPlan]
        const [ProjectResult] = await connection.execute(saveProject, Values)
        console.log(ProjectResult);
        return ProjectResult
    } catch (error) {
        return {error: "Error creating project"}
    }
}

export const planProjectAdd = async(connection, userId) =>{
    try {
        const getPlanCommand = 'SELECT Total_Project, Highest_Project FROM `Plan` WHERE user_id=?'
        const value = [userId]
        const [updatePlan] = await connection.execute(getPlanCommand, value)
        if ((updatePlan[0]?.Total_Project+1) > updatePlan[0]?.Highest_Project) {
            return {error: "User has exhausted total project limit"}
        }
        try {
            const addProject = 'UPDATE `Plan` SET Total_Project=Total_Project+1 WHERE user_id=?'
            const addValue = [userId]
            const [saveProject] = await connection.execute(addProject, addValue)
        } catch (error) {
            console.log(error);
            
            return {error: "Error updating user plan"}
        }
        
    } catch (error) {
        console.log("Error updating user cred", error);
        return {error: "error checking plan"}
    }
}

export const addProjectHistory = async(connection, userId, ProjectResultId, ProjectName, serverName, serverRegion, ProjectKey) =>{
    try {
        const command = 'INSERT INTO Project_History (user_id, Project_id, History_Title, History_Description, Status, History_Type, Other_Stamp) VALUES (?,?,?,?,?,?,?)'
        const values = [userId, ProjectResultId, `Project "${ProjectName}" created`, `Project Creation successful on server ${serverName}/${serverRegion}`, 'Active', 'projectAdd', `ID: ${ProjectKey}`]
        const [saveHistory] = await connection.execute(command, values)
    } catch (error) {
        console.log("Error updating history", error);
        return { error: "Error updating history" }
    }
}

export const connectionAuth = async(connection, userId, user_key, ProjectId, project_key, clusterKey, clusterPassword) =>{
    const checkUserCommand = 'SELECT id FROM `user_cred` WHERE id=? AND profile_key=?'
    const checkUserValue = [userId, user_key]
    const [checkUser] = await connection.execute(checkUserCommand, checkUserValue)
    if (checkUser?.length == 0) {
        return {error: "Auth failed"}
    }
    const checkProjectCommand = 'SELECT Project_Name FROM `Project_Table` WHERE id=? AND Project_Key=? AND user_id=?'
    const checkProjectValue = [ProjectId, project_key, userId]
    const [checkProject] = await connection.execute(checkProjectCommand, checkProjectValue)
    if (checkProject?.length == 0) {
        return {error: "Auth failed"}
    }
    const checkClusterCommand = 'SELECT id FROM `Cluster_Table` WHERE user_id=? AND Cluster_Password=? AND Cluster_Key=?'
    const checkClusterValue = [userId, clusterPassword, clusterKey]
    const [checkCluster] = await connection.execute(checkClusterCommand, checkClusterValue)
    if (checkCluster?.length == 0) {
        return {error: "Auth Failed"}
    }
    return checkCluster[0]?.id
}