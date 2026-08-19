const generateRandom = () =>{
    const constrains = 'abcdefghijk0123456789'
    console.log(constrains[3]);
    
    let random = ''
    for (let index = 0; index < 15; index++) {
        if (index == 4 || index == 10) {
            random += "-"
        }
        else{
            const gRandom = constrains[Math.floor(Math.random()*21)]
            random += gRandom
        }
    }
    return random
}

module.exports = { generateRandom };