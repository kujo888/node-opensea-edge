# Opensea Top Bidder

Logic:
- The bot should check the current top offer price of each of the NFTs in the list every 6 hours
- If the current top offer is not in ETH no action should be taken
- If the current top offer of an NFT is the admin wallet then no new offer should be made
- If the current top offer of an NFT is under the maxOfferPrice for the NFT then the bot should make an offer on the NFT
- The offer made should be the current top offer price + 0.02 ETH
