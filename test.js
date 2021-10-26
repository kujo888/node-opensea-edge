const {
  getContentByURL
} = require('./utils');
require('dotenv').config();
const chalk = require("chalk");

const tokenAddress = '0xa7d8d9ef8d8ce8992df33d8b8cf4aebabd5bd270';

// env vars
const {
  ETHERSCAN_API_KEY
} = process.env;

(async () => {
  try {
    let schema = '';

    /// get contract abi
    const question =
      '?module=contract' +
      '&action=getabi' +
      '&address=' + tokenAddress +
      '&apikey=' + ETHERSCAN_API_KEY;

    const res = await getContentByURL('https://api.etherscan.io/api' + question);

    if (res.message === 'OK') {

      schema = res.result.includes('TransferSingle') ? 'ERC1155' : 'ERC721';

    } else if (res.message === 'NOTOK') {
      schema = 'ERC1155';

      console.log(res);
    } else {
      console.log(res);
    }
    

    console.log(chalk.yellow(schema));
  } catch (error) {
    console.log(11, error);
  }
})()