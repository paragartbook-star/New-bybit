export interface Env {
  BYBIT_API_KEY: string;
  BYBIT_SECRET: string; // Cloudflare dashboard mein bhi yahi naam rakhein
}

interface TradingViewAlert {
  action: 'BUY' | 'SELL';
  symbol: string;
  price: number;
  sl?: number;   // '?' ka matlab hai optional
  tp?: number;
  qty: number;
  category?: 'spot' | 'linear'; 
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const corsHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Content-Type': 'application/json',
    };

    if (request.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

    try {
      if (request.method !== 'POST') throw new Error('Use POST method');
      
      const alertData = await request.json() as TradingViewAlert;
      console.log('📥 Alert Received:', JSON.stringify(alertData));

      if (!alertData.action || !alertData.symbol || !alertData.qty) {
        throw new Error('Missing Action, Symbol or Qty');
      }

      const result = await placeBybitOrder(alertData, env);
      return new Response(JSON.stringify({ success: true, result }), { headers: corsHeaders });

    } catch (error: any) {
      console.error('❌ Error:', error.message);
      return new Response(JSON.stringify({ success: false, error: error.message }), { 
        status: 500, 
        headers: corsHeaders 
      });
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
  
  // High Speed Signature for Cloudflare
  const signature = await generateSignature(paramString, env.BYBIT_SECRET);

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

async function generateSignature(message: string, secret: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(message));
  return Array.from(new Uint8Array(sig)).map(b => b.toString(16).padStart(2, '0')).join('');
}
