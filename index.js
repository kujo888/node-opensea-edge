const Web3 = require("web3");
const { OpenSeaPort, Network } = require("opensea-js");
const { OrderSide } = require("opensea-js/lib/types");
const { MnemonicWalletSubprovider } = require("@0x/subproviders");
const RPCSubprovider = require("web3-provider-engine/subproviders/rpc");
const Web3ProviderEngine = require("web3-provider-engine");
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

const provider = new Web3.providers.HttpProvider(RPC_URL);
const mnemonicWalletSubprovider = new MnemonicWalletSubprovider({
  mnemonic: PRIVATE_KEY,
});
const infuraRpcSubprovider = new RPCSubprovider({ RPC_URL });
const providerEngine = new Web3ProviderEngine();
providerEngine.addProvider(mnemonicWalletSubprovider);
providerEngine.addProvider(infuraRpcSubprovider);
providerEngine.start();

const seaport = new OpenSeaPort(providerEngine, {
  networkName: Network.Main
});

async function check_bid(tokenId, tokenAddress, maxPrice) {
  const { orders } = await seaport.api.getOrders({
    asset_contract_address: tokenAddress,
    token_id: tokenId,
    side: OrderSide.Buy
  });

  let topPrice = 0;

  // get top offer
  for (item of orders) {

    // only ethereum
    if (item.metadata.schema != "ERC721")
      return;

    if (item.currentPrice > topPrice) {
      topPrice = Number(item.currentPrice);
      makerAddress = item.makerAccount.address;
    }
  }

  // don't auction to owner
  if (makerAddress == WALLET_ADDRESS)
    return;

  // re-auction
  if (topPrice <= maxPrice * (10 ** 18)) {
    const reAuctionPrice = topPrice + (BONUS_AMOUNT * (10 ** 18));
    
    await seaport.createBuyOrder({
      asset: {
        tokenId,
        tokenAddress,
      },
      accountAddress: WALLET_ADDRESS,
      startAmount: reAuctionPrice,
      expirationTime: Math.round(Date.now() / 1000 + 60 * 60 * 24) // One day from now
    });
  }
}

async function makeOffer(csvRows) {
  for (let i = 0; i < csvRows.length; i++) {
    const tokenId = csvRows[i]['Token ID'];
    const tokenAddress = csvRows[i]['Contract Address'];
    const maxPrice = csvRows[i]['MaxPrice'];

    await check_bid(tokenId, tokenAddress, maxPrice);
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
