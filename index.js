const Web3 = require("web3");
const { OpenSeaPort, Network } = require("opensea-js");
const { OrderSide } = require("opensea-js/lib/types");
const { MnemonicWalletSubprovider } = require("@0x/subproviders");
const RPCSubprovider = require("web3-provider-engine/subproviders/rpc");
const Web3ProviderEngine = require("web3-provider-engine");
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
  BONUS_AMOUNT
} = process.env;

console.log(`RPC URL: \t\t ${RPC_URL}`);
console.log(`WALLET ADDRESS: \t ${WALLET_ADDRESS}`);
console.log(`INTERVAL TIME: \t every ${INTERVAL_TIME} hours`);
console.log(`BONUS AMOUNT: \t ${BONUS_AMOUNT} ETH`);

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

async function check_bid(tokenId, tokenAddress, maxPrice, no) {
  console.log(chalk.green(`\n*******************  # ${no}  *******************`));

  const wei = await web3.eth.getBalance(WALLET_ADDRESS);
  const balance = web3.utils.fromWei(wei, 'ether');

  console.log(`Your current balance: ${balance} ETH`);

  const { orders } = await seaport.api.getOrders({
    asset_contract_address: tokenAddress,
    token_id: tokenId,
    side: OrderSide.Buy
  });

  await delay(10);

  let topPrice = 0;

  // check if there is auction
  if (orders.length === 0) {
    console.log(`${tokenAddress}/${tokenId} doesn't have any auctions currently.`);
    return;
  }

  // get top offer
  for (item of orders) {

    // only ethereum
    if (item.metadata.schema != "ERC721") {
      console.log(`${tokenAddress} is not on ethereum.`);
      return;
    }

    if (item.currentPrice > topPrice) {
      topPrice = Number(item.currentPrice);
      makerAddress = item.makerAccount.address;
    }
  }

  // don't auction to owner
  if (makerAddress == WALLET_ADDRESS.toLowerCase()) {
    console.log(`${tokenAddress}'s top bidder is you currently.`);
    return;
  }

  // re-auction
  if (topPrice <= maxPrice * (10 ** 18)) {
    const reAuctionPrice = topPrice + (BONUS_AMOUNT * (10 ** 18));
    console.log(`Making your auction on ${tokenAddress}/${tokenId} ...`);
    console.log(`Current Top Price: \t ${topPrice / (10 ** 18)}`);
    console.log(`Your auction Price: \t ${reAuctionPrice / (10 ** 18)}`);

    try {
      const offer = await seaport.createBuyOrder({
        asset: {
          tokenId,
          tokenAddress,
          schemaName: "ERC721"
        },
        accountAddress: WALLET_ADDRESS,
        startAmount: reAuctionPrice / (10 ** 18),
        expirationTime: Math.round(Date.now() / 1000 + 60 * 60 * 24) // One day
      });
      console.log(chalk.yellow(`Your new auction was made successfully on ${tokenAddress}/${tokenId}, ${offer.hash}`));
    } catch (error) {
      console.log(chalk.red("Buy Order Error: \t" + error.message));
    }

    await delay(30);
  } else {
    console.log(`${tokenAddress}/${tokenId} top offer price is higher than your offer.`);
    console.log(`Current Top Price: \t ${topPrice / (10 ** 18)}`);
    console.log(`Your auction Price: \t ${maxPrice}`);
  }
}

async function makeOffer(csvRows) {
  for (let i = 0; i < csvRows.length; i++) {
    const tokenId = csvRows[i]['Token ID'];
    const tokenAddress = csvRows[i]['Contract Address'];
    const maxPrice = csvRows[i]['MaxPrice'];

    await check_bid(tokenId, tokenAddress, maxPrice, i + 1);
  }
}

function start() {
  let csvRows = [];

  fs.createReadStream('NFTData.csv')
    .pipe(csv())
    .on('data', (row) => {
      csvRows.push(row);
    })
    .on('end', async () => {
      await makeOffer(csvRows);
    });
}

start();

// every 6 hours
const job = new CronJob(`0 */${INTERVAL_TIME} * * *`, start);
job.start();
