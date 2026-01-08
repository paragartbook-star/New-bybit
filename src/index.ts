/**
 * TradingView to Bybit Automated Trading Bot
 * Cloudflare Worker for webhook processing
 * Version: 2.1 (Updated January 2026)
 */

export interface Env {
  BYBIT_API_KEY: string;
  BYBIT_SECRET: string;
}

interface TradingViewAlert {
  action: 'BUY' | 'SELL';
  symbol: string;
  price: number;
  sl?: number; // '?' lagane se ye optional ho jayega
  tp?: number; // '?' lagane se ye optional ho jayega
  qty: number;
  category?: 'spot' | 'linear'; 
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const corsHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Content-Type': 'application/json',
    };

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders });
    }

    if (request.method !== 'POST') {
      return new Response(JSON.stringify({ success: false, error: 'Method not allowed' }), { 
        status: 405, 
        headers: corsHeaders 
      });
    }

    try {
      const alertData = await request.json() as TradingViewAlert;
      console.log('📥 Received alert:', JSON.stringify(alertData));

      // Required fields validation
      if (!alertData.action || !alertData.symbol || !alertData.qty) {
        return new Response(JSON.stringify({ error: 'Missing required fields' }), { status: 400, headers: corsHeaders });
      }

      if (!env.BYBIT_API_KEY || !env.BYBIT_SECRET) {
        return new Response(JSON.stringify({ error: 'API Credentials missing in Workers' }), { status: 500, headers: corsHeaders });
      }

      const orderResult = await placeBybitOrder(alertData, env);

      return new Response(JSON.stringify({ 
        success: true, 
        bybit_response: orderResult 
      }), { status: 200, headers: corsHeaders });

    } catch (error: any) {
      console.error('❌ Error:', error.message);
      return new Response(JSON.stringify({ success: false, error: error.message }), { status: 500, headers: corsHeaders });
    }
  },
};

/**
 * Place order on Bybit Exchange using V5 API
 */
async function placeBybitOrder(alert: TradingViewAlert, env: Env) {
  const timestamp = Date.now().toString();
  const recvWindow = '5000';

  // 1. Symbol Cleaning: "BINANCE:BTCUSDT" ko "BTCUSDT" banata hai
  const symbol = alert.symbol.split(':').pop()?.toUpperCase().replace('-EQ', '').replace('.NS', '') || '';

  // 2. Order Parameters
  // NOTE: Agar Futures trade kar rahe hain toh 'linear' use karein, Spot ke liye 'spot'
  const orderParams: any = {
    category: alert.category || 'linear', 
    symbol: symbol,
    side: alert.action.toUpperCase() === 'BUY' ? 'Buy' : 'Sell',
    orderType: 'Market',
    qty: alert.qty.toString(),
    timeInForce: 'GTC',
  };

  // Stop Loss aur Take Profit (Sirf tabhi bhejein jab alert mein ho)
  if (alert.sl) orderParams.stopLoss = alert.sl.toString();
  if (alert.tp) orderParams.takeProfit = alert.tp.toString();

  // 3. Exact JSON String for Signature (Sabse zaruri step)
  const rawBody = JSON.stringify(orderParams);
  
  // 4. Create Signature
  // V5 Signature Rule: timestamp + api_key + recv_window + rawBody
  const paramString = timestamp + env.BYBIT_API_KEY + recvWindow + rawBody;
  const signature = await generateHmacSha256(paramString, env.BYBIT_SECRET);

  // 5. API Call
  const response = await fetch('https://api.bybit.com/v5/order/create', {
    method: 'POST',
    headers: {
      'X-BAPI-API-KEY': env.BYBIT_API_KEY,
      'X-BAPI-TIMESTAMP': timestamp,
      'X-BAPI-SIGN': signature,
      'X-BAPI-RECV-WINDOW': recvWindow,
      'Content-Type': 'application/json'
    },
    body: rawBody
  });

  const result = await response.json() as any;

  if (result.retCode !== 0) {
    throw new Error(`Bybit Error ${result.retCode}: ${result.retMsg}`);
  }

  return result;
}

/**
 * HMAC SHA256 Signature Generator
 */
async function generateHmacSha256(message: string, secret: string): Promise<string> {
  const encoder = new TextEncoder();
  const cryptoKey = await crypto.subtle.importKey(
    'raw', 
    encoder.encode(secret), 
    { name: 'HMAC', hash: 'SHA-256' }, 
    false, 
    ['sign']
  );
  const signature = await crypto.subtle.sign('HMAC', cryptoKey, encoder.encode(message));
  return Array.from(new Uint8Array(signature))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}
