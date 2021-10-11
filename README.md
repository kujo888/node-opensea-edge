# Opensea Top Bidder

Logic:
- The bot should check the current top offer price of each of the NFTs in the list every 6 hours
- If the current top offer is not in ETH no action should be taken
- If the current top offer of an NFT is the admin wallet then no new offer should be made
- If the current top offer of an NFT is under the maxOfferPrice for the NFT then the bot should make an offer on the NFT
- The offer made should be the current top offer price + 0.02 ETH

1. Set csv to use filepath in env var
2. Set retry time delay in env var
3. New column: min price. If NFTs has no offers then use make new offer using min price
4. Check top offer type. Sometimes is not in ETH. If not in ETH, use 2nd highest offer instead. If 2nd highest offer not in ETH then no make offer
5. Check the amount of top offer. Sometimes top offer is more than 1 quanity. When this is top offer, use the 2nd highest offer instead