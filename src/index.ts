/**
 * TradingView to Bybit Automated Trading Bot
 * Version: 2.3 (Full Professional Version)
 */

export interface Env {
  BYBIT_API_KEY: string;
  BYBIT_SECRET: string;
}

interface TradingViewAlert {
  action: 'BUY' | 'SELL';
  symbol: string;
  price: number;
  sl?: number;   // Optional (Bot crash nahi hoga)
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

    // Handle Preflight (CORS)
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders });
    }

    // Security: Only POST allowed
    if (request.method !== 'POST') {
      return new Response(JSON.stringify({ success: false, error: 'Please use POST' }), { 
        status: 405, 
        headers: corsHeaders 
      });
    }

    try {
      const alertData = await request.json() as TradingViewAlert;
      console.log('📥 New Alert Received:', JSON.stringify(alertData));

      // 1. Validation Logic
      if (!alertData.action || !alertData.symbol || !alertData.qty) {
        throw new Error('Missing Required Fields: action, symbol, or qty');
      }

      // 2. Execute Order on Bybit
      const bybitResponse = await placeBybitOrder(alertData, env);
      
      console.log('📤 Bybit Response:', JSON.stringify(bybitResponse));

      return new Response(JSON.stringify({ 
        success: true, 
        message: 'Order Processed',
        bybit: bybitResponse 
      }), { headers: corsHeaders });

    } catch (error: any) {
      console.error('❌ Error:', error.message);
      return new Response(JSON.stringify({ 
        success: false, 
        error: error.message 
      }), { status: 500, headers: corsHeaders });
    }
  }
};

/**
 * Bybit API V5 Order Function
 */
async function placeBybitOrder(alert: TradingViewAlert, env: Env) {
  const timestamp = Date.now().toString();
  const recvWindow = '5000';
  
  // Bybit V5 Parameters
  const orderParams: any = {
    category: alert.category || 'linear', // Default to Futures
    symbol: alert.symbol,
    side: alert.action === 'BUY' ? 'Buy' : 'Sell',
    orderType: 'Market',
    qty: alert.qty.toString(),
    timeInForce: 'GTC'
  };

  // Add SL/TP only if they are sent from TradingView
  if (alert.sl) orderParams.stopLoss = alert.sl.toString();
  if (alert.tp) orderParams.takeProfit = alert.tp.toString();

  const rawBody = JSON.stringify(orderParams);
  
  // Create Signature (Standard V5 Rule)
  const paramString = timestamp + env.BYBIT_API_KEY + recvWindow + rawBody;
  
  const signature = await generateSignature(paramString, env.BYBIT_SECRET);

  const url = 'https://api.bybit.com/v5/order/create';
  
  const response = await fetch(url, {
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

/**
 * HMAC-SHA256 Helper (Optimized for Cloudflare)
 */
async function generateSignature(message: string, secret: string): Promise<string> {
  const encoder = new TextEncoder();
  const keyUint8 = encoder.encode(secret);
  const messageUint8 = encoder.encode(message);

  const cryptoKey = await crypto.subtle.importKey(
    'raw', 
    keyUint8, 
    { name: 'HMAC', hash: 'SHA-256' }, 
    false, 
    ['sign']
  );

  const signatureBuffer = await crypto.subtle.sign('HMAC', cryptoKey, messageUint8);
  
  // Convert Buffer to Hex String
  return Array.from(new Uint8Array(signatureBuffer))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}
