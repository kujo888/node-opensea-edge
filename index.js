const express = require('express');
const fileUpload = require('express-fileupload');
const Web3 = require("web3");
const { OpenSeaPort, Network } = require("opensea-js");
const { OrderSide } = require("opensea-js/lib/types");
const { PrivateKeyWalletSubprovider } = require("@0x/subproviders");
const RPCSubprovider = require("web3-provider-engine/subproviders/rpc");
const Web3ProviderEngine = require("web3-provider-engine");
const WETH_ABI = require('./contracts/weth.json');
const http = require('http');
const chalk = require("chalk");
const { CronJob } = require('cron');
const csv = require('csv-parser');
const fs = require('fs');
require('dotenv').config();

const {
  getContentByURL
} = require('./utils');

// env vars
const {
  RPC_URL,
  ETHERSCAN_API_KEY,
  WALLET_ADDRESS,
  INTERVAL_TIME,
  PRIVATE_KEY,
  OFFER_ADD_AMOUNT,
  OFFLINE,
  CSV_ONLINE_PATH,
  CSV_LOCAL_PATH,
  RETRY_DELAY_TIME,
  ONLINE_CSV,
  OFFER_EXPIRE_TIME
} = process.env;

let isStop = false;   // for restart
let job;              // cron job

const app = express();

app.use('/admin', express.static(__dirname + '/index.html'));
app.use(fileUpload());

app.post('/upload', function(req, res) {
  let csvFile;
  let uploadPath;

  if (!req.files || Object.keys(req.files).length === 0) {
    res.status(400).send('No files were uploaded.');
    return;
  }

  csvFile = req.files.csvfile;
  uploadPath = __dirname + '/' + csvFile.name;

  csvFile.mv(uploadPath, function(err) {
    if (err) {
      return res.status(500).send(err);
    }
   
    // re-start bot
    isStop = true;
    if (job) {
      job.stop();
    }
    main();

    res.send(`<h2 style="text-align:center">${csvFile.name} has been uploaded & bot was restarted successfully!<h2>`);
  });
});

app.listen(process.env.PORT || 3000, () => console.log('Bot is running'));

console.log(`RPC URL: \t\t ${RPC_URL}`);
console.log(`WALLET ADDRESS: \t ${WALLET_ADDRESS}`);
console.log(`INTERVAL TIME: \t\t every ${INTERVAL_TIME} hours`);
console.log(`OFFER ADD AMOUNT: \t ${OFFER_ADD_AMOUNT} ETH`);

const WETH_CONTRACT = "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2";

const privateKeyWalletSubprovider = new PrivateKeyWalletSubprovider(PRIVATE_KEY);
const infuraRpcSubprovider = new RPCSubprovider({ rpcUrl: RPC_URL });
const providerEngine = new Web3ProviderEngine();
providerEngine.addProvider(privateKeyWalletSubprovider);
providerEngine.addProvider(infuraRpcSubprovider);
providerEngine.start();

const web3 = new Web3(providerEngine);

const seaport = new OpenSeaPort(providerEngine, {
  networkName: Network.Main
});

const delay = t => new Promise(s => setTimeout(s, t * 1000));

const creatBuyOrder = async (tokenId, tokenAddress, newOffer, schemaName) => {
  try {
    const offer = await seaport.createBuyOrder({
      asset: {
        tokenId,
        tokenAddress,
        schemaName: schemaName
      },
      accountAddress: WALLET_ADDRESS,
      startAmount: newOffer / (10 ** 18),
      expirationTime: Math.round(Date.now() / 1000 + 60 * 60 * OFFER_EXPIRE_TIME)
    });

    console.log(chalk.yellow(`Offer was made successfully on ${tokenAddress}/${tokenId}`));
    console.log(chalk.yellow(`Tx hash: ${offer.hash}`));
  } catch (error) {
    throw new Error(error);
  }
}

const finalBid = async (tokenId, tokenAddress, newOffer, schemaName) => {
  console.log(chalk.yellow(`MAKING OFFER ON ${schemaName}: \t ${newOffer / (10 ** 18)}`));

  await delay(60);

  let attemptCount = 0;

  while (true) {
    try {
      attemptCount > 0 && console.log(`Offer re-attempt: ${attemptCount}`);
      await creatBuyOrder(tokenId, tokenAddress, newOffer, schemaName);
      break;
    } catch (error) {
      if (error.message.includes("429")) {
        console.error(error.message);
        console.log(chalk.blue(`Waiting ${RETRY_DELAY_TIME / 60} min...`));
        await delay(RETRY_DELAY_TIME);
        ++attemptCount;
      } else {
        console.log(chalk.red("Offer error: \t" + error.message));
      }
    }
  }
}

async function check_bid(tokenId, tokenAddress, maxPrice, minPrice, no) {
  const eth = Web3.utils.fromWei(await web3.eth.getBalance(WALLET_ADDRESS), 'ether');
  const wethContract = new web3.eth.Contract(WETH_ABI, WETH_CONTRACT);
  const weth = Web3.utils.fromWei(await wethContract.methods.balanceOf(WALLET_ADDRESS).call(), 'ether');

  console.log(chalk.green(`\n*******************  # ${no}  *******************`));
  console.log(`https://opensea.io/assets/${tokenAddress}/${tokenId}`);
  console.log(`Balance: \t ${eth} ETH, ${weth} WETH`);
  console.log(`Your max offer: \t ${maxPrice}`);
  console.log(`Your min offer: \t ${minPrice}`);

  const { orders } = await seaport.api.getOrders({
    asset_contract_address: tokenAddress,
    token_id: tokenId,
    side: OrderSide.Buy
  });

  let bestOffer = minPrice * (10 ** 18);

  // check if there is offers
  if (orders.length === 0) {
    console.log('Has no offers yet.');

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
    }

    await finalBid(tokenId, tokenAddress, bestOffer, schema);
    return;
  }

  let topPrice = 0;
  let topBidder = '';
  let schemaName = '';
  let checkedFirstOffer = false;

  // get top offer
  for (item of orders) {
    // only ethereum
    if (!item.metadata.schema.includes("ERC")) {
      console.log(`${tokenAddress}/${tokenId} is not on ethereum.`);
      
      if (!checkedFirstOffer) {
        checkedFirstOffer = true;
        continue;
      } else {
        console.log(`second top offer is also not on ethereum.`);
        return;
      }
    }

    // check expirationTime of first item
    let curTime = new Date ();
    let limitTime = new Date ( curTime );
    limitTime.setHours ( curTime.getHours() + INTERVAL_TIME );

    if (item.expirationTime < limitTime.getTime() / 1000 && orders.length > 1) {
      continue;
    }

    if (item.currentPrice / item.metadata.asset.quantity > topPrice) {
      topPrice = Number(item.currentPrice);
      topBidder = item.makerAccount.address;
      schemaName = item.metadata.schema;
    }
  }

  // if (topPrice == 0) {
  //   console.log("There is no less than 1 WETH offer.");
  //   return;
  // }

  // don't outbid self
  if (topBidder == WALLET_ADDRESS.toLowerCase()) {
    console.log(`Current highest offer is you`);
    return;
  }

  console.log(`Current highest offer: ${topPrice / (10 ** 18)}`);

  // create offer
  if (bestOffer > topPrice + (OFFER_ADD_AMOUNT * (10 ** 18))) {
    console.log(`Your min offer > Highest offer`);
    
    await finalBid(tokenId, tokenAddress, bestOffer, schemaName);
  } else if (topPrice + (OFFER_ADD_AMOUNT * (10 ** 18)) <= maxPrice * (10 ** 18)) {
    // change bestOffer
    bestOffer = topPrice + (OFFER_ADD_AMOUNT * (10 ** 18));
    
    console.log('Your max offer > Highest offer')
    
    await finalBid(tokenId, tokenAddress, bestOffer, schemaName);
  } else {
    console.log(`Highest offer > Your max offer`);
  }
}

async function processCSVList(csvRows) {
  isStop = false;

  for (let i = 0; i < csvRows.length; i++) {
    if (isStop) return;

    const openseaURL = csvRows[i][0];
    const maxPrice = csvRows[i][1];
    const minPrice = csvRows[i][2];
    const [tokenAddress, tokenId] = openseaURL.slice(26).split('/');

    await check_bid(tokenId, tokenAddress, maxPrice, minPrice, i + 1);
  }
  console.log(chalk.green("============================================="));
}

async function start() {
  let csvRows = [];

  if(ONLINE_CSV == 1) {
    console.log(chalk.yellow("Loading online csv..."));

    const content = await getContentByURL(CSV_ONLINE_PATH);
    const rows = content.split('\n');

    for (let i = 1; i < rows.length; i++) {
      let oneRow = rows.split(',');
      csvRows.push(oneRow);
    }

    console.log(chalk.yellow("Read online csv successfully."));
    await processCSVList(csvRows);
  } else {
    console.log(chalk.yellow("Start with project folder's csv file."));

    fs.createReadStream(CSV_LOCAL_PATH)
      .pipe(csv())
      .on('data', (row) => {
        let oneRow = [];

        oneRow.push(row['OPENSEA URLS FOR AUTO BUYING']);
        oneRow.push(row['MAX BUYING PRICE']);
        oneRow.push(row['MIN BUYING PRICE']);

        csvRows.push(oneRow);
      })
      .on('end', async () => {
        await processCSVList(csvRows);
      });
  }
}

function main() {
  if (OFFLINE == 1) {
    console.log('App is offline for maintenance.');
  } else {
    start();
    // run every INTERVAL_TIME hours
    job = new CronJob(`0 */${INTERVAL_TIME} * * *`, start);
    job.start();
  }
}

main();