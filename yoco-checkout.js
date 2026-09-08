// ============================================================
// Yoco Checkout Worker
// ============================================================

export default {
  async fetch(request, env) {
    // CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        status: 204,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'POST, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type',
        }
      });
    }

    if (request.method !== 'POST') {
      return new Response(JSON.stringify({ error: 'Use POST' }), {
        status: 405,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
      });
    }

    try {
      const YOCO_SECRET_KEY = env.YOCO_SECRET_KEY;
      
      if (!YOCO_SECRET_KEY) {
        return new Response(JSON.stringify({ error: 'Missing API key' }), {
          status: 500,
          headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
        });
      }

      const body = await request.json();
      const { productId, price } = body;

      console.log('📦 Product:', productId, 'Price:', price);

      const productNames = {
        'htc1': 'HTs Collections',
        'htc2': 'HTs Collections Vol. 2',
        'htc3': 'HTs Collections Vol. 3',
        'htc4': 'HTs Collections Vol. 4',
        'htc5': 'HTs Collections V'
      };

      const productName = productNames[productId] || 'HTs Album';

      const successUrl = 'https://yoco-success.hyperproductionsa.workers.dev';

      const yocoPayload = {
        amount: price,
        currency: 'ZAR',
        successUrl: successUrl,
        cancelUrl: 'https://htcoll.shop',
        metadata: {
          productId: productId,
          productName: productName
        }
      };

      console.log('📤 Sending to Yoco:', JSON.stringify(yocoPayload, null, 2));

      const yocoResponse = await fetch('https://payments.yoco.com/api/checkouts', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${YOCO_SECRET_KEY}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(yocoPayload)
      });

      const data = await yocoResponse.json();

      console.log('📥 Yoco response:', JSON.stringify(data, null, 2));

      if (!yocoResponse.ok) {
        return new Response(JSON.stringify({
          error: data.message || data.detail || 'Payment error',
          code: data.code,
          details: data
        }), {
          status: yocoResponse.status,
          headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
        });
      }

      return new Response(JSON.stringify({
        success: true,
        redirectUrl: data.redirectUrl,
        checkoutId: data.id
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
      });

    } catch (error) {
      console.error('❌ Worker error:', error);
      return new Response(JSON.stringify({ error: error.message }), {
        status: 500,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
      });
    }
  }
}; 
