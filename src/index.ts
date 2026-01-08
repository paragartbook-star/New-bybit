export interface Env {
  BYBIT_API_KEY: string;
  BYBIT_SECRET: string;
}

interface TradingViewAlert {
  action: 'BUY' | 'SELL';
  symbol: string;
  price: number;
  sl?: number;
  tp?: number;
  qty: number;
  category?: 'spot' | 'linear';
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const corsHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Content-Type': 'application/json',
    };

    // Handle CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        status: 204,
        headers: corsHeaders,
      });
    }

    try {
      // Only accept POST requests
      if (request.method !== 'POST') {
        return new Response(
          JSON.stringify({
            success: false,
            error: 'Method not allowed. Use POST',
          }),
          {
            status: 405,
            headers: corsHeaders,
          }
        );
      }

      // Parse request body
      let alertData: TradingViewAlert;
      try {
        alertData = (await request.json()) as TradingViewAlert;
      } catch {
        return new Response(
          JSON.stringify({
            success: false,
            error: 'Invalid JSON in request body',
          }),
          {
            status: 400,
            headers: corsHeaders,
          }
        );
      }

      console.log('📥 Alert Received:', JSON.stringify(alertData));

      // Validate required fields
      if (!alertData.action || !alertData.symbol || !alertData.qty) {
        return new Response(
          JSON.stringify({
            success: false,
            error: 'Missing required fields: action, symbol, qty',
          }),
          {
            status: 400,
            headers: corsHeaders,
          }
        );
      }

      // Validate action
      if (!['BUY', 'SELL'].includes(alertData.action)) {
        return new Response(
          JSON.stringify({
            success: false,
            error: 'action must be BUY or SELL',
          }),
          {
            status: 400,
            headers: corsHeaders,
          }
        );
      }

      // Place order
      const result = await placeBybitOrder(alertData, env);

      return new Response(
        JSON.stringify({
          success: true,
          message: 'Order placed successfully',
          result,
        }),
        {
          status: 200,
          headers: corsHeaders,
        }
      );
    } catch (error: any) {
      console.error('❌ Error:', error.message);

      return new Response(
        JSON.stringify({
          success: false,
          error: error.message || 'Internal server error',
        }),
        {
          status: 500,
          headers: corsHeaders,
        }
      );
    }
  },
};

async function placeBybitOrder(
  alert: TradingViewAlert,
  env: Env
): Promise<any> {
  try {
    const timestamp = Date.now().toString();
    const recvWindow = '5000';

    const orderParams: any = {
      category: alert.category || 'linear',
      symbol: alert.symbol,
      side: alert.action === 'BUY' ? 'Buy' : 'Sell',
      orderType: 'Market',
      qty: alert.qty.toString(),
      timeInForce: 'GTC',
    };

    // Add optional parameters
    if (alert.sl) {
      orderParams.stopLoss = {
        triggerPrice: alert.sl.toString(),
      };
    }

    if (alert.tp) {
      orderParams.takeProfit = {
        triggerPrice: alert.tp.toString(),
      };
    }

    const rawBody = JSON.stringify(orderParams);
    const paramString = timestamp + env.BYBIT_API_KEY + recvWindow + rawBody;

    // Generate signature
    const signature = await generateSignature(paramString, env.BYBIT_SECRET);

    console.log('📤 Placing order on Bybit:', orderParams);

    // Call Bybit API
    const response = await fetch('https://api.bybit.com/v5/order/create', {
      method: 'POST',
      headers: {
        'X-BAPI-API-KEY': env.BYBIT_API_KEY,
        'X-BAPI-TIMESTAMP': timestamp,
        'X-BAPI-SIGN': signature,
        'X-BAPI-RECV-WINDOW': recvWindow,
        'Content-Type': 'application/json',
      },
      body: rawBody,
    });

    const result = await response.json();

    if (!response.ok) {
      console.error('❌ Bybit API Error:', result);
      throw new Error(`Bybit API error: ${JSON.stringify(result)}`);
    }

    console.log('✅ Order placed successfully:', result);
    return result;
  } catch (error: any) {
    console.error('❌ Order placement failed:', error.message);
    throw error;
  }
}

async function generateSignature(
  message: string,
  secret: string
): Promise<string> {
  try {
    const enc = new TextEncoder();
    const key = await crypto.subtle.importKey(
      'raw',
      enc.encode(secret),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign']
    );

    const sig = await crypto.subtle.sign('HMAC', key, enc.encode(message));

    return Array.from(new Uint8Array(sig))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
  } catch (error: any) {
    console.error('❌ Signature generation failed:', error.message);
    throw error;
  }
}
