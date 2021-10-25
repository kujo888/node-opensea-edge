
const openseaApi = require('api')('@opensea/v1.0#gbq4cz1cksxopxqw'); 

(async() => {
  try {
    const res = await openseaApi['retrieving-a-single-contract']({asset_contract_address: '0x495f947276749ce646f68ac8c248420045cb7b5e'})
    console.log(res);
  } catch (error) {
    console.error(error.message);
  }
})()