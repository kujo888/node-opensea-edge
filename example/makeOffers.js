

//const sdk = require('api')('@opensea/v1.0#gbq4cz1cksxopxqw'); // for this use ==> npm install api
const opensea = require("opensea-js");
const csv = require('csv-parser');
const fs = require('fs');
const OpenSeaPort = opensea.OpenSeaPort;
const Network = opensea.Network;

const MnemonicWalletSubprovider = require("@0x/subproviders")
.MnemonicWalletSubprovider;
const RPCSubprovider = require("web3-provider-engine/subproviders/rpc");
const Web3ProviderEngine = require("web3-provider-engine");

const MNEMONIC =  "";
const OWNER_ADDRESS = "";
const rpcUrl = "";
const accountAddress = "";
const startAmount = 0.000000000001;

const expirationNumber = 0.1;

var counter = 0;
const sleep = t => new Promise(s => setTimeout(s, t));

async function makeOffer(csvRows){
	
	if (!MNEMONIC) {
		console.error(
		"Please set a mnemonic, Alchemy/Infura key, owner, network, API key, nft contract, and factory contract address."
	);
	return;
	}

	const mnemonicWalletSubprovider = await new MnemonicWalletSubprovider({
		mnemonic: MNEMONIC,
	});
	const infuraRpcSubprovider =  await new RPCSubprovider({ rpcUrl });
	
	
	const providerEngine =  await new Web3ProviderEngine();
	await providerEngine.addProvider(mnemonicWalletSubprovider);
	await providerEngine.addProvider(infuraRpcSubprovider);
	await providerEngine.start();
	
	const seaport = await new OpenSeaPort(
	providerEngine,
	{
		networkName: Network.Main,
		
	},
	(arg,err) => console.log(arg,err));
	console.log('Seaport');	
	
	var waiter = 0;
	for(var i=0;i<csvRows.length;i++){
	  await console.log('Row #: ',i+1);
	  await console.log(csvRows[i]);
	  tokenId = await csvRows[i]['Token ID'];
	  tokenAddress = await csvRows[i]['Contract Address'];
	  /*if(waiter==3){
		await sleep(18000);
		waiter=0;
	  }*/
	  
	  var error = 0; 
	  while(1){
		  try{
			  const offer = await seaport.createBuyOrder({
				asset: {
					tokenId,
					tokenAddress,
				},
				accountAddress,
				startAmount,
				expirationTime: Math.round(Date.now() / 1000 + 60 * 60 * expirationNumber) // One day from now
			  });
			  await console.log('Transaction Completed');
			  
			await console.log(offer['hash']);	
			console.log("\n\n");
			//await sleep(3500);
			waiter+=1;			
			break;
		  }catch(e){
			 await console.log('\nError In Transaction');
			 console.log(e);//'\n\nTrying Again....\n');
			 //await sleep(3500);
			 
			 break;
			 /*
			 if (error==3){
				 error=0;
				 await sleep(18000);
			 }
			 error+=1;
			 */
			 
			 continue;
		  }
	 }
	  
	}

}

var csvRows = [];

fs.createReadStream('NFTData.csv')
  .pipe(csv())
  .on('data', (row) => {
	  csvRows.push(row);		  		 				
  })
  .on('end', async () => {		  
	await makeOffer(csvRows);
	console.log('Completed');
	process.exit();
  });
  

