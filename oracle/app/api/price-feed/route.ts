import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
// @ts-ignore
import Client from 'mina-signer';
import { createClient } from '@clickhouse/client' // or '@clickhouse/client-web'
const client = new Client({ network: 'testnet' });

// Implement toJSON for BigInt so we can include values in response
(BigInt.prototype as any).toJSON = function () {
  return this.toString();
};

/*
{
  "e": "24hrTicker",  // Event type
  "E": 1672515782136,     // Event time
  "s": "BNBBTC",      // Symbol
  "p": "0.0015",      // Price change
  "P": "250.00",      // Price change percent
  "w": "0.0018",      // Weighted average price
  "x": "0.0009",      // First trade(F)-1 price (first trade before the 24hr rolling window)
  "c": "0.0025",      // Last price
  "Q": "10",          // Last quantity
  "b": "0.0024",      // Best bid price
  "B": "10",          // Best bid quantity
  "a": "0.0026",      // Best ask price
  "A": "100",         // Best ask quantity
  "o": "0.0010",      // Open price
  "h": "0.0025",      // High price
  "l": "0.0010",      // Low price
  "v": "10000",       // Total traded base asset volume
  "q": "18",          // Total traded quote asset volume
  "O": 0,             // Statistics open time
  "C": 86400000,      // Statistics close time
  "F": 0,             // First trade ID
  "L": 18150,         // Last trade Id
  "n": 18151          // Total number of trades
}
*/

async function getCurrentPrice(symbol: string): Promise<any> {
  const chClient = createClient({
    host: 'https://vwres5krdo.us-east-1.aws.clickhouse.cloud:8443',
    database: 'default',
    username: 'default',
    password: 'A0dn.jxYwmE_R',
  });
  const res = await chClient.query({
    query: `SELECT 
    s, E, c 
    FROM default.raw_price_feed_binance WHERE s = '${symbol}' 
    ORDER BY E DESC LIMIT 1`,
    format: 'JSONEachRow',
  });
  const data = await res.json();
  console.log(data);
  return data;
}

async function getSignedCreditScore(symbol: string) {
  // The private key of our account. When running locally the hardcoded key will
  // be used. In production the key will be loaded from a Vercel environment
  // variable.
  let privateKey =
    process.env.PRIVATE_KEY ??
    'EKF65JKw9Q1XWLDZyZNGysBbYG21QbJf3a4xnEoZPZ28LKYGMw53';

  // We get the users credit score. In this case it's 787 for user 1, and 536
  // for anybody else :)
  // const getPrice = (priceId: number) => (priceId === 1 ? 787200000 : 53600000);

  // Compute the users credit score
  const dbData = await getCurrentPrice(symbol);
  const price = dbData[0].c;
  const pricePrecision = BigInt(parseFloat(price) * 10000);
  // const symbol = dbData[0].s;
  const priceTime = BigInt(parseInt(dbData[0].E));

  // Use our private key to sign an array of numbers containing the users id and
  // credit score
  const signature = client.signFields(
    [ BigInt(pricePrecision),
      BigInt(priceTime)],
    privateKey
  );

  return {
    data: { 
      pricePrecision: pricePrecision, 
      price: price,
      symbol: symbol,
      priceTime: priceTime},
    signature: signature.signature,
    publicKey: signature.publicKey,
  };
}

export async function GET(request: NextRequest) {
  const searchParams = new URLSearchParams(request.nextUrl.search);
  return NextResponse.json(
    await getSignedCreditScore(
      (searchParams.get('symbol') ?? "BTCUSDT")
      ),
    { status: 200 }
  );
}
