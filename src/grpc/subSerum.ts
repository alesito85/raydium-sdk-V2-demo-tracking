import { ApiPoolInfoV4, Market, MARKET_STATE_LAYOUT_V3, SPL_MINT_LAYOUT } from "@raydium-io/raydium-sdk-v2";
import { Keypair, PublicKey } from '@solana/web3.js';
import Client from "@triton-one/yellowstone-grpc";
import base58 from "bs58";
import { connection, grpcToken, grpcUrl } from "../config";
import fs from 'fs';
import Redis from "ioredis";

const r = new Redis();

const filename = 'new-market-info.log';
const mint = process.env.MINT || 'NO MINT';

async function subNewAmmPool() {
  const programId = 'srmqPvymJeFKQ4zGQed1GFppgkRHL9kaELCbyksJtPX'

  const client = new Client(grpcUrl, grpcToken, undefined);
  const rpcConnInfo = await client.subscribe();
  rpcConnInfo.on("data", (data) => {
    callback(data, programId)
      .catch((reason) => {
        console.error(reason);
      });
  });
  // 0000000000
  // 40420f0000000000
  // 1027000000000000
  // 0000
  // 0100000000000000
  // 6400000000000000
  await new Promise<void>((resolve, reject) => {
    if (rpcConnInfo === undefined) throw Error('rpc conn error')
    rpcConnInfo.write({
      slots: {},
      accounts: {},
      transactions: {
        transactionsSubKey: {
          accountInclude: ['So11111111111111111111111111111111111111112', 'SysvarRent111111111111111111111111111111111'],
          accountExclude: [],
          accountRequired: []
        }
      },
      transactionsStatus: {},
      blocks: {},
      blocksMeta: {},
      accountsDataSlice: [],
      entry: {},
      commitment: 1
    }, (err: Error) => {
      if (err === null || err === undefined) {
        resolve();
      } else {
        reject(err);
      }
    });
  }).catch((reason) => {
    console.error(reason);
    throw reason;
  });
}

async function callback(data: any, programId: string) {
  if (!data.filters.includes('transactionsSubKey')) return undefined

  const info = data.transaction
  if (info.transaction.meta.err !== undefined) return undefined

  try {
    // console.log('new pool info:', JSON.stringify(info))
    fs.appendFileSync(filename, JSON.stringify(info, null, 2) + '\n')
  } catch (error) {
    console.error(error)
  }

  const formatData: {
    updateTime: number, slot: number, txid: string, poolInfos: ApiPoolInfoV4[]
  } = {
    updateTime: new Date().getTime(),
    slot: info.slot,
    txid: base58.encode(info.transaction.signature),
    poolInfos: []
  }


  const accounts = info.transaction.transaction.message.accountKeys.map((i: Buffer) => base58.encode(i))
  const serumProgramIndex = accounts.indexOf('srmqPvymJeFKQ4zGQed1GFppgkRHL9kaELCbyksJtPX');
  const filteredInstructions = info.transaction.transaction.message.instructions.filter((i: any) => i.programIdIndex == serumProgramIndex);
  let output: string[] = [];
  if (accounts.includes('So11111111111111111111111111111111111111112')
    && accounts.includes('SysvarRent111111111111111111111111111111111')
    // && accounts.length >= 10 && accounts.length <= 12
    && filteredInstructions.length > 0
  ) {
    filteredInstructions.forEach((i: any) => {
      const accs = Array.from(Buffer.from(i.accounts));
      for (const acc of accs) {
        output.push(accounts[acc]);
      }
    });
    console.log(new Date().toJSON(), 'new tx:', base58.encode(Buffer.from(info.transaction.signature)), accounts, filteredInstructions.length,
      filteredInstructions, output.join('\n'));
  }
  let hasSerumInitializeMarket = false;
  let mint = '';
  const serumInstructions = info.transaction.transaction.message.instructions.filter((i: any) => {
    if (i.accounts.length == 10) {
      // console.log('i:', JSON.stringify(i), i.accounts.length, i.accounts[8], i.accounts[9])
      const hasSerumInitializeMarketTmp = i.programIdIndex == serumProgramIndex
      && i.accounts.length == 10
      && (accounts[i.accounts[7]] == 'So11111111111111111111111111111111111111112' || accounts[i.accounts[8]] == 'So11111111111111111111111111111111111111112')
      && accounts[i.accounts[9]] == 'SysvarRent111111111111111111111111111111111';
      if (!hasSerumInitializeMarket && hasSerumInitializeMarketTmp) {
        hasSerumInitializeMarket = true;
        if (accounts[i.accounts[7]] == 'So11111111111111111111111111111111111111112') {
          mint = accounts[i.accounts[8]];
        } else {
          mint = accounts[i.accounts[7]];
        }
      }
      return hasSerumInitializeMarketTmp;
    }

    return false;
  });
  // console.log({serumInstructions})
  if (serumInstructions.length > 0
    && info.transaction.transaction.message.accountKeys.length >= 10
    && info.transaction.transaction.message.instructions.length >= 6
    // && info.transaction.transaction.message.instructions[5].accounts.length == 10
  ) {
    if (mint) {
      r.hset('serum-markets', `${output[0]}_eventQueue`, output[2]);
      r.hset('serum-markets', `${output[0]}_bids`, output[3]);
      r.hset('serum-markets', `${output[0]}_asks`, output[4]);
      r.hset('serum-markets', `${output[0]}_coinVault`, output[5]);
      r.hset('serum-markets', `${output[0]}_pcVault`, output[6]);
    }
    console.log('new serum stuff:', base58.encode(Buffer.from(info.transaction.signature)), {mint}, JSON.stringify(info))
  }

  // console.log('new serum stuff:', JSON.stringify(info))

  // for (const item of [...info.transaction.transaction.message.instructions, ...info.transaction.meta.innerInstructions.map((i: any) => i.instructions).flat()]) {
  //   if (accounts[item.programIdIndex] !== programId) continue

  //   if ([...(item.data as Buffer).values()][0] != 1) continue

  //   const keyIndex = [...(item.accounts as Buffer).values()]

  //   const startTime = new Date().getTime()
  //   console.log(new Date().toJSON(), 'new serum market Id: ', accounts[keyIndex[4]], JSON.stringify(keyIndex));
  //   fs.appendFileSync(filename, JSON.stringify(keyIndex) + '\n')
  //   fs.appendFileSync(filename, accounts[keyIndex[4]] + '\n')
  //   console.log('accounts:', JSON.stringify(accounts, null, 2))
  //   fs.appendFileSync(filename, JSON.stringify(accounts, null, 2) + '\n')
  //   console.log(`baseMint: ${accounts[keyIndex[8]]}, quoteMint: ${accounts[keyIndex[9]]}, marketId: ${accounts[keyIndex[16]]} baseVault: ${accounts[keyIndex[10]]} quoteVault: ${accounts[keyIndex[11]]}`)
  //   fs.appendFileSync(filename, `mandatory accounts baseMint: ${accounts[keyIndex[8]]}, quoteMint: ${accounts[keyIndex[9]]}, marketId: ${accounts[keyIndex[16]]}` + '\n')

  //   if (accounts[keyIndex[9]] == mint || accounts[keyIndex[8]] == mint || true) {
  //     const serumProgramId = new PublicKey('9xQeWvG816bUxViG6K51VdK5W2j9mWr6Uay3e3cL1Dve');
  //     const serumMarket = accounts[keyIndex[16]];
  //     const serumMarketPubkey = new PublicKey(serumMarket);
  //     const bidsAccount = PublicKey.createProgramAddressSync(
  //       [serumMarketPubkey.toBuffer(), Buffer.from('bids')],
  //       serumProgramId
  //     );
  //     let baseIsSol = accounts[keyIndex[8]] == 'So11111111111111111111111111111111111111112';
  //     const poolDeets = {
  //       poolId: accounts[keyIndex[4]],
  //       marketId: accounts[keyIndex[16]],
  //       baseMint: accounts[keyIndex[8]],
  //       quoteMint: accounts[keyIndex[9]],
  //       baseVault: accounts[keyIndex[10]],
  //       quoteVault: accounts[keyIndex[11]],
  //       ammOpenOrders: accounts[keyIndex[6]],
  //       ammTargetOrders: accounts[keyIndex[12]],
  //       serumMarket,
  //       serumBids: ,
  //       serumAsks: ,
  //       serumEventQueue: accounts[keyIndex[15]],
  //       serumCoinVault: accounts[keyIndex[17]],
  //       serumPcVault: accounts[keyIndex[18]],
  //       serumVaultSigner: accounts[keyIndex[19]],
  //     };
  //     console.log('pool deets:', JSON.stringify(poolDeets, null, 2))
  //     fs.appendFileSync('pooldeets.log', `pool deets: ${JSON.stringify(poolDeets)} ` + '\n')
  //     // for (let i = 0; i < concurrentOrders; i++) {
  //     //   executeBuys(
  //     //     new PublicKey(accounts[keyIndex[4]]),
  //     //     new PublicKey(accounts[keyIndex[baseIsSol ? 11 : 10]]),
  //     //     new PublicKey(accounts[keyIndex[baseIsSol ? 10 : 11]]),
  //     //     new PublicKey(accounts[keyIndex[baseIsSol ? 9 : 8]])
  //     //   ).catch((err) => console.log('executeBuys error:', err));
  //     //   if (process.env.PLACE_BOTH_SIDES) {
  //     //     executeBuys(
  //     //       new PublicKey(accounts[keyIndex[4]]),
  //     //       new PublicKey(accounts[keyIndex[!baseIsSol ? 11 : 10]]),
  //     //       new PublicKey(accounts[keyIndex[!baseIsSol ? 10 : 11]]),
  //     //       new PublicKey(accounts[keyIndex[!baseIsSol ? 9 : 8]])
  //     //     ).catch((err) => console.log('executeBuys! error:', err));
  //     //   }
  //     //   // sleep 550 ms
  //     //   await new Promise<void>((resolve) => {
  //     //     setTimeout(() => {
  //     //       resolve();
  //     //     }, 550);
  //     //   });
  //     // }
  //   }

  //   // const [baseMintAccount, quoteMintAccount, marketAccount] = await connection.getMultipleAccountsInfo([
  //   //   new PublicKey(accounts[keyIndex[8]]),
  //   //   new PublicKey(accounts[keyIndex[9]]),
  //   //   new PublicKey(accounts[keyIndex[16]]),
  //   // ])

  // // if (baseMintAccount === null || quoteMintAccount === null || marketAccount === null) throw Error(`get account info error ${baseMintAccount} | ${quoteMintAccount} | ${marketAccount}`)

  // //   const baseMintInfo = SPL_MINT_LAYOUT.decode(baseMintAccount.data)
  // //   const quoteMintInfo = SPL_MINT_LAYOUT.decode(quoteMintAccount.data)
  // //   const marketInfo = MARKET_STATE_LAYOUT_V3.decode(marketAccount.data)

  // //   formatData.poolInfos.push({
  // //     id: accounts[keyIndex[4]],
  // //     baseMint: accounts[keyIndex[8]],
  // //     quoteMint: accounts[keyIndex[9]],
  // //     lpMint: accounts[keyIndex[7]],
  // //     baseDecimals: baseMintInfo.decimals,
  // //     quoteDecimals: quoteMintInfo.decimals,
  // //     lpDecimals: baseMintInfo.decimals,
  // //     version: 4,
  // //     programId: programId,
  // //     authority: accounts[keyIndex[5]],
  // //     openOrders: accounts[keyIndex[6]],
  // //     targetOrders: accounts[keyIndex[12]],
  // //     baseVault: accounts[keyIndex[10]],
  // //     quoteVault: accounts[keyIndex[11]],
  // //     withdrawQueue: PublicKey.default.toString(),
  // //     lpVault: PublicKey.default.toString(),
  // //     marketVersion: 3,
  // //     marketProgramId: marketAccount.owner.toString(),
  // //     marketId: accounts[keyIndex[16]],
  // //     marketAuthority: Market.getAssociatedAuthority({ programId: marketAccount.owner, marketId: new PublicKey(accounts[keyIndex[16]]) }).publicKey.toString(),
  // //     marketBaseVault: marketInfo.baseVault.toString(),
  // //     marketQuoteVault: marketInfo.quoteVault.toString(),
  // //     marketBids: marketInfo.bids.toString(),
  // //     marketAsks: marketInfo.asks.toString(),
  // //     marketEventQueue: marketInfo.eventQueue.toString(),
  // //     lookupTableAccount: PublicKey.default.toString()
  // //   })
  // }

  // console.log(formatData)

  // // await multiswap(formatData.poolInfos);
  // return formatData
}

subNewAmmPool()
