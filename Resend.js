const emailjs = require("@emailjs/nodejs");
const env = require("dotenv");
env.config();
emailjs.init({
  publicKey: process.env.EMAILJS_PUBLIC_KEY,
  privateKey: process.env.EMAILJS_PRIVATE_KEY,
});

const sendOTP = async (mailAddress) => {
    let OTP = "";
    for (let index = 0; index < 6; index++) {
        const generatedNo = Math.floor(Math.random()*9)
        OTP = OTP + String(generatedNo) 
        console.log(OTP);
        
    }
    try {
        await emailjs.send(process.env.EMAILJS_SERVICE_ID,process.env.EMAILJS_TEMPLATE_ID,{
            OTP,
            email: mailAddress,
        });
        return(OTP)
    } catch (error) {
        console.log("Error", error);
    }
}

module.exports = { sendOTP };