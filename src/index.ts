/**
 * TradingView to Bybit Automated Trading Bot
 * Version: 2.2 (Fixed Interface & Variables)
 */

export interface Env {
  BYBIT_API_KEY: string;
  BYBIT_SECRET: string; // Dashboard mein bhi yahi naam rakhein
}

interface TradingViewAlert {
  action: 'BUY' | 'SELL';
  symbol: string;
  price: number;
  sl?: number;   // '?' lagane se optional ho gaya
  tp?: number;   // '?' lagane se optional ho gaya
  qty: number;
  category?: 'spot' | 'linear'; 
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const corsHeaders = {
      'Access-Control-Allow-Origin': '*',\
      'Access-Control-Allow-Methods': 'POST, OPTIONS',\
      'Access-Control-Allow-Headers': 'Content-Type',\
      'Content-Type': 'application/json',
    };

    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders });

    if (request.method !== 'POST') {
      return new Response(JSON.stringify({ success: false, error: 'Use POST method' }), { status: 405, headers: corsHeaders });
    }

    try {
      const alertData = await request.json() as TradingViewAlert;
      
      // Basic Validation
      if (!alertData.action || !alertData.symbol || !alertData.qty) {
        return new Response(JSON.stringify({ success: false, error: 'Missing parameters' }), { status: 400, headers: corsHeaders });
      }

      const result = await placeBybitOrder(alertData, env);
      return new Response(JSON.stringify({ success: true, result }), { headers: corsHeaders });

    } catch (error: any) {
      return new Response(JSON.stringify({ success: false, error: error.message }), { status: 500, headers: corsHeaders });
    }
  }
};

async function placeBybitOrder(alert: TradingViewAlert, env: Env) {
  const timestamp = Date.now().toString();
  const recvWindow = '5000';
  
  const orderParams: any = {
    category: alert.category || 'linear',
    symbol: alert.symbol,
    side: alert.action === 'BUY' ? 'Buy' : 'Sell',
    orderType: 'Market',
    qty: alert.qty.toString(),
    timeInForce: 'GTC'
  };

  if (alert.sl) orderParams.stopLoss = alert.sl.toString();
  if (alert.tp) orderParams.takeProfit = alert.tp.toString();

  const rawBody = JSON.stringify(orderParams);
  const paramString = timestamp + env.BYBIT_API_KEY + recvWindow + rawBody;
  
  // Signature Generation
  const encoder = new TextEncoder();
  const keyBuffer = encoder.encode(env.BYBIT_SECRET);
  const msgBuffer = encoder.encode(paramString);
  const cryptoKey = await crypto.subtle.importKey('raw', keyBuffer, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const signatureBuffer = await crypto.subtle.sign('HMAC', cryptoKey, msgBuffer);
  const signature = Array.from(new Uint8Array(signatureBuffer)).map(b => b.toString(16).padStart(2, '0')).join('');

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

  return await response.json();
}
