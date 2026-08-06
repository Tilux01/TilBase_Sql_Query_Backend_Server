const mysql = require("mysql2/promise")
const fs = require("fs")
require("dotenv").config()

let connection
const makeConnection = async() =>{
    try {
         const connection = await mysql.createPool({
            host: process.env.SQL_HOST,
            port: process.env.SQL_PORT,
            user: process.env.SQL_USER,
            password: process.env.SQL_PASSWORD,
            database: process.env.SQL_DATABASE,
            ssl: {
                ca: fs.readFileSync('./ca.pem'),
                rejectUnauthorized: true
            }
        })
        return connection
    } catch (error) {
        console.log(error)
    }
}
module.exports = makeConnection