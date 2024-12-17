import dotenv from 'dotenv';
dotenv.config();
import { Connection } from '@solana/web3.js';
import Redis from 'ioredis';

const r = new Redis();

const rpcUrl = process.env.SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com';
console.log({rpcUrl})
const connection = new Connection(rpcUrl);

(async () => {
  while (true) {
    const getLatestBlockhash = await connection.getLatestBlockhash();
    console.log({getLatestBlockhash})
    r.set('recentBlockhash', getLatestBlockhash.blockhash);
    r.set('lastValidBlockHeight', getLatestBlockhash.lastValidBlockHeight.toString());
    // sleep 0.5s
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
})();
