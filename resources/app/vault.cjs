function ready(){if(process.platform!=='win32')throw Error('Cifratura Windows non disponibile');const {safeStorage}=require('electron');if(!safeStorage.isEncryptionAvailable())throw Error('Cifratura Windows non disponibile');return safeStorage;}
async function protect(value){return ready().encryptString(value).toString('base64');}
function unprotect(value){return ready().decryptString(Buffer.from(value,'base64'));}
module.exports={protect,unprotect};
