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
const {
  getContentByURL
} = require('./utils');
require('dotenv').config();

// env vars
const {
  RPC_URL,
  WALLET_ADDRESS,
  INTERVAL_TIME,
  PRIVATE_KEY,
  BONUS_AMOUNT,
  OFFLINE,
  CSV_ONLINE_PATH,
  CSV_LOCAL_PATH
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

const creatBuyOrder = async (tokenId, tokenAddress, reAuctionPrice, schemaName) => {
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

const finalBid = async (tokenId, tokenAddress, reAuctionPrice) => {
  await delay(60);

  let schema = "ERC721";
  let attemptCount = 0;

  while (true) {
    try {
      console.log(`Offer attempt: ${++attemptCount} times`);
      await creatBuyOrder(tokenId, tokenAddress, reAuctionPrice, schema);
      break;
    } catch (error) {
      if (error.message.includes("429")) {
        console.log(chalk.yellow(`Too many requests. Waiting ${RETRY_DELAY_TIME / 60} min...`));
        await delay(RETRY_DELAY_TIME);
      } else if (error.message.includes("400")) {
        console.log("ERC1155 Contract Token. Retrying...");
        console.log(chalk.yellow(`Waiting ${RETRY_DELAY_TIME / 60} min...`));
        await delay(RETRY_DELAY_TIME);
        schema = "ERC1155";
      } else {
        console.log(chalk.red("Offer error: \t" + error.message));
      }
    }
  }
}

async function check_bid(tokenId, tokenAddress, maxPrice, minPrice, no) {
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
    console.log(`${tokenAddress}/${tokenId} has no offers yet.`);
    console.log(`Making offer on ${tokenAddress}/${tokenId} ...`);
    console.log(`Your offer: \t ${minPrice}`);

    await finalBid(tokenId, tokenAddress, minPrice);
    return;
  }

  let topPrice = 0;
  let topBidder = '';
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
        console.log(`${tokenAddress}/${tokenId}'s second top offer is also not on ethereum.`);
        return;
      }
    }

    // this is for buying less than 1 WETH and getting top offer
    if (item.currentPrice < 10 ** 18 && item.currentPrice > topPrice) {
      topPrice = Number(item.currentPrice);
      topBidder = item.makerAccount.address;
    }
  }

  if (topPrice == 0) {
    console.log("There is no less than 1 WETH offer.");
    return;
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
    console.log(`Your max offer: \t ${topPrice / (10 ** 18)}`);
    console.log(`Your offer: \t ${reAuctionPrice / (10 ** 18)}`);

    await finalBid(tokenId, tokenAddress, reAuctionPrice);
  } else {
    console.log(`${tokenAddress}/${tokenId} top offer is higher than your max offer`);
    console.log(`Current top offer: \t ${topPrice / (10 ** 18)}`);
    console.log(`Your max offer: \t ${maxPrice}`);
  }
}

async function makeOffer(csvRows) {
  for (let i = 0; i < csvRows.length; i++) {
    const openseaURL = csvRows[i][0];
    const maxPrice = csvRows[i][1];
    const minPrice = csvRows[i][2];
    const [tokenAddress, tokenId] = openseaURL.slice(26).split('/');

    await check_bid(tokenId, tokenAddress, maxPrice, minPrice, i + 1);
  }
  console.log(chalk.blueBright("============================================="));
}

async function start() {
  let csvRows = [];

  try {
    console.log(chalk.yellow("Loading online csv..."));

    const content = await getContentByURL(CSV_ONLINE_PATH);
    const rows = content.split('\n');

    for (let i = 1; i < rows.length; i++) {
      let oneRow = rows.split(',');
      csvRows.push(oneRow);
    }

    console.log(chalk.blueBright("Have been read online csv successfully."));
    await makeOffer(csvRows);
  } catch (error) {
    console.log(chalk.blueBright("Can not find online csv file."));
    console.log(chalk.blueBright("Start with project folder's csv file."));

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
        console.log(chalk.blueBright("Have been read project folder's csv successfully."));
        await makeOffer(csvRows);
      });
  }
}

if (OFFLINE == 1) {
  console.log('App is offline for maintenance.')
} else {
  start();
  // run every INTERVAL_TIME hours
  const job = new CronJob(`0 */${INTERVAL_TIME} * * *`, start);
  job.start();
}