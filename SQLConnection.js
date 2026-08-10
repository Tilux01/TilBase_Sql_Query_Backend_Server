const mysql = require("mysql2/promise")
const fs = require("fs")
require("dotenv").config()

let connection;
let pool;

const makeConnection = async() =>{
    try {
        if (!pool) {
            pool = await mysql.createPool({
                host: process.env.SQL_HOST,
                port: process.env.SQL_PORT,
                user: process.env.SQL_USER,
                password: process.env.SQL_PASSWORD,
                database: process.env.SQL_DATABASE,
                ssl: {
                    ca: fs.readFileSync('./ca.pem'),
                    rejectUnauthorized: true
                }
            });
        }
        return pool;
    } catch (error) {
        console.log("Database connection error:", error);
    }
}
module.exports = makeConnection