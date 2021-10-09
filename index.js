const Web3 = require("web3");
const { OpenSeaPort, Network } = require("opensea-js");
const { OrderSide } = require("opensea-js/lib/types");
const { MnemonicWalletSubprovider } = require("@0x/subproviders");
const RPCSubprovider = require("web3-provider-engine/subproviders/rpc");
const Web3ProviderEngine = require("web3-provider-engine");
const WETH_ABI = require('./contracts/weth.json');
const http = require('http');
const chalk = require("chalk");
const { CronJob } = require('cron');
const csv = require('csv-parser');
const fs = require('fs');
require('dotenv').config();

// env vars
const {
  RPC_URL,
  WALLET_ADDRESS,
  INTERVAL_TIME,
  PRIVATE_KEY,
  BONUS_AMOUNT,
  OFFLINE
} = process.env;

http.createServer(function (req, res) {
  res.writeHead(200, { 'Content-Type': 'text/plain' });
  res.end('Bot is running!');
}).listen(process.env.PORT || 3000);

console.log(`RPC URL: \t\t ${RPC_URL}`);
console.log(`WALLET ADDRESS: \t ${WALLET_ADDRESS}`);
console.log(`INTERVAL TIME: \t\t every ${INTERVAL_TIME} hours`);
console.log(`BONUS AMOUNT: \t\t ${BONUS_AMOUNT} ETH`);

const WETH_CONTRACT = "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2";

const mnemonicWalletSubprovider = new MnemonicWalletSubprovider({
  mnemonic: PRIVATE_KEY,
});
const infuraRpcSubprovider = new RPCSubprovider({ rpcUrl: RPC_URL });
const providerEngine = new Web3ProviderEngine();
providerEngine.addProvider(mnemonicWalletSubprovider);
providerEngine.addProvider(infuraRpcSubprovider);
providerEngine.start();

const web3 = new Web3(providerEngine);

const seaport = new OpenSeaPort(providerEngine, {
  networkName: Network.Main
});

const delay = t => new Promise(s => setTimeout(s, t * 1000));

const creatBuyOrder = async (tokenId, tokenAddress, reAuctionPrice, schemaName = "ERC721") => {
  try {
    const offer = await seaport.createBuyOrder({
      asset: {
        tokenId,
        tokenAddress,
        schemaName: schemaName
      },
      accountAddress: WALLET_ADDRESS,
      startAmount: reAuctionPrice / (10 ** 18),
      expirationTime: Math.round(Date.now() / 1000 + 60 * 60 * 24) // One day
    });
  
    console.log(chalk.yellow(`Offer was made successfully on ${tokenAddress}/${tokenId}`));
    console.log(chalk.yellow(`Tx hash: ${offer.hash}`));
  } catch (error) {
    throw new Error(error);
  }
}

async function check_bid(tokenId, tokenAddress, maxPrice, no) {
  await delay(60);

  console.log(chalk.green(`\n*******************  # ${no}  *******************`));

  const eth = Web3.utils.fromWei(await web3.eth.getBalance(WALLET_ADDRESS), 'ether');
  const wethContract = new web3.eth.Contract(WETH_ABI, WETH_CONTRACT);
  const weth = Web3.utils.fromWei(await wethContract.methods.balanceOf(WALLET_ADDRESS).call(), 'ether');

  console.log(`Balance: ${eth} ETH, ${weth} WETH`);
  const { orders } = await seaport.api.getOrders({
    asset_contract_address: tokenAddress,
    token_id: tokenId,
    side: OrderSide.Buy
  });

  // check if there is offers
  if (orders.length === 0) {
    console.log(`${tokenAddress}/${tokenId} has no offers`);
    return;
  }

  let topPrice = 0;
  let topBidder = '';
  // get top offer
  for (item of orders) {
    // only ethereum
    if (!item.metadata.schema.includes("ERC")) {
      console.log(`${tokenAddress} is not on ethereum`);
      return;
    }
    if (item.currentPrice > topPrice) {
      topPrice = Number(item.currentPrice);
      topBidder = item.makerAccount.address;
    }
  }

  // don't auction to owner
  if (topBidder == WALLET_ADDRESS.toLowerCase()) {
    console.log(`${tokenAddress}/${tokenId} top offer is you`);
    return;
  }

  // re-auction
  if (topPrice <= maxPrice * (10 ** 18)) {
    const reAuctionPrice = topPrice + (BONUS_AMOUNT * (10 ** 18));
    console.log(`Making offer on ${tokenAddress}/${tokenId} ...`);
    console.log(`Current highest offer: \t ${topPrice / (10 ** 18)}`);
    console.log(`Your max offer: \t ${reAuctionPrice / (10 ** 18)}`);

    await delay(60);

    let success = false;
    let schema = "ERC721";
    let attemptCount = 0;

    while (!success) {
      try {
        attemptCount++;
        console.log(`Offer attempt: ${attemptCount}`);
        await creatBuyOrder(tokenId, tokenAddress, reAuctionPrice, schema);
        success = true;
      } catch (error) {
        if (error.message.includes("429")) {
          console.log(chalk.yellow("Too many requests. Waiting 2 min..."));  
          await delay(120); 
        } else if (error.message.includes("400")) {
          console.log("ERC1155 Contract Token. Retrying...");
          console.log(chalk.yellow("Waiting 2 min..."));
          await delay(120); 
          schema = "ERC1155";
        } else {
          console.log(chalk.red("Offer error: \t" + error.message));
        }
      }
    }
  } else {
    console.log(`${tokenAddress}/${tokenId} top offer is higher than your max offer`);
    console.log(`Current top offer: \t ${topPrice / (10 ** 18)}`);
    console.log(`Your max offer: \t ${maxPrice}`);
  }
}

async function makeOffer(csvRows) {
  for (let i = 0; i < csvRows.length; i++) {
    const openseaURL = csvRows[i]['OPENSEA URLS FOR AUTO BUYING'];
    const maxPrice = csvRows[i]['MAX BUYING PRICE'];
    const [tokenAddress, tokenId] = openseaURL.slice(26).split('/');

    await check_bid(tokenId, tokenAddress, maxPrice, i + 1);
  }
  console.log(chalk.blueBright("============================================="));
}

function start() {
  let csvRows = [];

  fs.createReadStream('opensea.csv')
    .pipe(csv())
    .on('data', (row) => {
      csvRows.push(row);
    })
    .on('end', async () => {
      await makeOffer(csvRows);
    });
}

if (OFFLINE == 1) {
  console.log('App is offline for maintenance')
} else {
  start();
  // run every INTERVAL_TIME hours
  const job = new CronJob(`0 */${INTERVAL_TIME} * * *`, start);
  job.start();
}

