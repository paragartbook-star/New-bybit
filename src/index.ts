/**
 * TradingView to Bybit Automated Trading Bot
 * Cloudflare Worker for webhook processing
 */

export interface Env {
  BYBIT_API_KEY: string;
  BYBIT_SECRET: string;
}

interface TradingViewAlert {
  action: 'BUY' | 'SELL';
  symbol: string;
  price: number;
  sl: number;
  tp: number;
  partial_tp: number;
  qty: number;
  risk: number;
  rr: number;
  regime: string;
  confluence: number;
  killzone: string;
  order_type: string;
  timestamp: string;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    
    // CORS Headers
    const corsHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    };

    // Handle OPTIONS (preflight)
    if (request.method === 'OPTIONS') {
      return new Response(null, { 
        status: 204,
        headers: corsHeaders 
      });
    }

    // Only allow POST
    if (request.method !== 'POST') {
      return new Response(JSON.stringify({ 
        error: 'Method not allowed. Use POST.' 
      }), { 
        status: 405,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    try {
      // Parse TradingView alert
      const alertData = await request.json() as TradingViewAlert;

      console.log('Received alert:', alertData);

      // Validate required fields
      if (!alertData.action || !alertData.symbol || !alertData.qty) {
        return new Response(JSON.stringify({ 
          success: false,
          error: 'Missing required fields: action, symbol, qty' 
        }), { 
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      // Place order on Bybit
      const orderResult = await placeBybitOrder(alertData, env);

      // Log success
      console.log('Order placed:', orderResult);

      return new Response(JSON.stringify({ 
        success: true, 
        message: 'Order placed successfully',
        bybit_response: orderResult,
        alert_data: alertData
      }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });

    } catch (error: any) {
      console.error('Error processing webhook:', error);
      
      return new Response(JSON.stringify({ 
        success: false,
        error: error.message || 'Internal server error',
        details: error.toString()
      }), { 
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }
  },
};

/**
 * Place order on Bybit Exchange
 */
async function placeBybitOrder(alert: TradingViewAlert, env: Env) {
  const timestamp = Date.now().toString();
  const recvWindow = '5000';

  // Clean symbol (remove NSE suffix if present)
  let symbol = alert.symbol.replace('-EQ', '').trim();

  // Bybit Order Parameters
  const orderParams: any = {
    category: 'spot', // Change to 'linear' for perpetual futures
    symbol: symbol,
    side: alert.action === 'BUY' ? 'Buy' : 'Sell',
    orderType: 'Market',
    qty: alert.qty.toString(),
    timeInForce: 'IOC', // Immediate or Cancel
  };

  // Add Stop Loss if provided
  if (alert.sl && alert.sl > 0) {
    orderParams.stopLoss = alert.sl.toString();
  }

  // Add Take Profit if provided
  if (alert.tp && alert.tp > 0) {
    orderParams.takeProfit = alert.tp.toString();
  }

  // Create query string (sorted alphabetically)
  const queryString = Object.keys(orderParams)
    .sort()
    .map(key => `${key}=${orderParams[key]}`)
    .join('&');

  // Generate signature
  const signaturePayload = timestamp + env.BYBIT_API_KEY + recvWindow + queryString;
  const signature = await generateHmacSha256(signaturePayload, env.BYBIT_SECRET);

  // Make API request to Bybit
  const response = await fetch('https://api.bybit.com/v5/order/create', {
    method: 'POST',
    headers: {
      'X-BAPI-API-KEY': env.BYBIT_API_KEY,
      'X-BAPI-TIMESTAMP': timestamp,
      'X-BAPI-SIGN': signature,
      'X-BAPI-RECV-WINDOW': recvWindow,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(orderParams)
  });

  const result = await response.json();

  // Check if order was successful
  if (!response.ok || (result as any).retCode !== 0) {
    throw new Error(`Bybit API Error: ${JSON.stringify(result)}`);
  }

  return result;
}

/**
 * Generate HMAC SHA256 signature for Bybit API
 */
async function generateHmacSha256(message: string, secret: string): Promise<string> {
  const encoder = new TextEncoder();
  const keyData = encoder.encode(secret);
  const messageData = encoder.encode(message);
  
  // Import secret key
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    keyData,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  
  // Generate signature
  const signature = await crypto.subtle.sign(
    'HMAC',
    cryptoKey,
    messageData
  );
  
  // Convert to hex string
  return Array.from(new Uint8Array(signature))
    .map(byte => byte.toString(16).padStart(2, '0'))
    .join('');
}
