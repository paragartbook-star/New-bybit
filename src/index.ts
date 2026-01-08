/**
 * TradingView to Bybit Automated Trading Bot
 * Version: 2.3 (Pro Version - Optimized for Cloudflare)
 */

export interface Env {
  BYBIT_API_KEY: string;
  BYBIT_SECRET: string; // Dashboard mein check karein: BYBIT_SECRET hi hona chahiye
}

interface TradingViewAlert {
  action: 'BUY' | 'SELL';
  symbol: string;
  price: number;
  sl?: number;   // Optional (Bot crash nahi hoga agar TV se SL na aaye)
  tp?: number;   // Optional
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

    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders });

    if (request.method !== 'POST') {
      return new Response(JSON.stringify({ success: false, error: 'POST method required' }), { status: 405, headers: corsHeaders });
    }

    try {
      const alertData = await request.json() as TradingViewAlert;
      console.log('📥 Webhook Received:', JSON.stringify(alertData));

      // 1. Mandatory Fields Check
      if (!alertData.action || !alertData.symbol || !alertData.qty) {
        throw new Error('Missing Data: Action, Symbol and Qty are required.');
      }

      // 2. Execute on Bybit
      const result = await placeBybitOrder(alertData, env);
      console.log('📤 Bybit Response:', JSON.stringify(result));

      return new Response(JSON.stringify({ success: true, bybit: result }), { headers: corsHeaders });

    } catch (error: any) {
      console.error('❌ Bot Error:', error.message);
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
  
  // High-Speed Signature Generation
  const signature = await generateHMAC(paramString, env.BYBIT_SECRET);

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

async function generateHMAC(message: string, secret: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const signature = await crypto.subtle.sign('HMAC', key, enc.encode(message));
  return Array.from(new Uint8Array(signature)).map(b => b.toString(16).padStart(2, '0')).join('');
}
