// ============================================================
// Yoco Success Handler - WITH /send-email ENDPOINT
// ============================================================

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    
    // ============================================================
    // HANDLE EMAIL SEND REQUEST (from success page)
    // ============================================================
    if (url.pathname === '/send-email' && request.method === 'POST') {
      try {
        const body = await request.json();
        const { checkoutId, email, downloadUrl, productName } = body;
        
        console.log('📧 /send-email called:', { checkoutId, email, productName });
        
        if (!email || !email.includes('@')) {
          return new Response(JSON.stringify({ 
            success: false, 
            error: 'Invalid email address' 
          }), {
            status: 400,
            headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
          });
        }

        const emailSent = await sendZeptoEmail(env, {
          to: email,
          productName: productName || 'Album',
          downloadUrl: downloadUrl,
          checkoutId: checkoutId || 'unknown'
        });

        if (emailSent) {
          return new Response(JSON.stringify({ 
            success: true, 
            message: 'Email sent successfully' 
          }), {
            status: 200,
            headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
          });
        } else {
          return new Response(JSON.stringify({ 
            success: false, 
            error: 'Failed to send email' 
          }), {
            status: 500,
            headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
          });
        }
      } catch (error) {
        console.error('❌ /send-email error:', error);
        return new Response(JSON.stringify({ 
          success: false, 
          error: error.message 
        }), {
          status: 500,
          headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
        });
      }
    }

    // ============================================================
    // HANDLE PAYMENT SUCCESS REDIRECT
    // ============================================================
    const checkoutId = url.searchParams.get('checkoutId');

    if (!checkoutId) {
      return errorPage('Missing Checkout ID', 'No payment session found.');
    }

    try {
      const YOCO_SECRET_KEY = env.YOCO_SECRET_KEY;
      
      if (!YOCO_SECRET_KEY) {
        return errorPage('Configuration Error', 'API key not configured.');
      }

      const verifyResponse = await fetch(`https://payments.yoco.com/api/checkouts/${checkoutId}`, {
        headers: {
          'Authorization': `Bearer ${YOCO_SECRET_KEY}`
        }
      });

      const payment = await verifyResponse.json();

      console.log('📥 Verify status:', verifyResponse.status);
      console.log('📥 Payment data:', JSON.stringify(payment, null, 2));

      if (!verifyResponse.ok) {
        return errorPage('Payment Verification Failed', 'Could not verify your payment.');
      }

      if (payment.status !== 'paid') {
        return errorPage('Payment Not Completed', 'Your payment was not completed.');
      }

      const productId = payment.metadata?.productId || 'album';
      const productName = payment.metadata?.productName || 'Album';

      const downloadUrl = await generateSignedUrl(productId, env);

      if (!downloadUrl) {
        return errorPage('Download Error', 'Could not generate download link.');
      }

      return successPage(productName, downloadUrl, checkoutId);

    } catch (error) {
      console.error('Success handler error:', error);
      return errorPage('Something went wrong', 'Please try again.');
    }
  }
};

// ============================================================
// SEND EMAIL VIA ZEPTOMAIL
// ============================================================
async function sendZeptoEmail(env, { to, productName, downloadUrl, checkoutId }) {
  const ZEPTO_API_KEY = env.ZEPTO_API_KEY;
  
  if (!ZEPTO_API_KEY) {
    console.warn('⚠️ ZEPTO_API_KEY not configured.');
    return false;
  }

  const currentDate = new Date().toLocaleDateString('en-ZA', {
    day: 'numeric',
    month: 'long',
    year: 'numeric'
  });

  const emailBody = `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="UTF-8" />
        <title>Your Download: ${productName}</title>
        <style>
          body { font-family: 'Roboto', -apple-system, sans-serif; background: #0b0b0b; color: #fff; padding: 40px; line-height: 1.6; }
          .container { max-width: 560px; margin: 0 auto; background: #0f0f0f; border-radius: 24px; padding: 40px; border: 1px solid #2a2a2a; }
          .header { text-align: center; border-bottom: 2px solid #e5de69; padding-bottom: 20px; margin-bottom: 30px; }
          .logo { font-size: 1.8rem; font-weight: 700; color: #e5de69; letter-spacing: -0.5px; }
          .logo span { color: #fff; font-weight: 300; }
          h1 { color: #e5de69; font-size: 1.6rem; font-weight: 700; margin-bottom: 8px; }
          .album-name { color: #fff; font-size: 1.2rem; font-weight: 500; margin: 20px 0 10px; padding: 12px; background: #1a1a1a; border-radius: 12px; border: 1px solid #2a2a2a; }
          .btn { display: inline-block; background: #e5de69; color: #0f0f0f; padding: 14px 32px; border-radius: 40px; text-decoration: none; font-weight: 700; margin: 16px 0; }
          .btn:hover { background: #f5ee79; }
          .footer { margin-top: 30px; padding-top: 20px; border-top: 1px solid #2a2a2a; color: #888; font-size: .85rem; }
          .footer a { color: #e5de69; text-decoration: none; }
          .meta { display: flex; justify-content: space-between; color: #666; font-size: .75rem; margin: 20px 0 10px; }
          .meta span { background: #1a1a1a; padding: 4px 12px; border-radius: 20px; border: 1px solid #2a2a2a; }
          .expiry { color: #e5de69; font-weight: 600; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <div class="logo">HTs <span>Collections</span></div>
          </div>

          <h1>✓ Payment Successful!</h1>
          <p style="color: #aaa;">Thank you for your purchase. Your album is ready to download.</p>

          <div class="album-name">📀 ${productName}</div>

          <div style="text-align: center;">
            <a href="${downloadUrl}" class="btn">⬇ Download Album</a>
          </div>

          <div class="meta">
            <span>Transaction: ${checkoutId.slice(0, 16)}...</span>
            <span>Date: ${currentDate}</span>
          </div>

          <p style="color: #666; font-size: .8rem; text-align: center;">
            🔒 This link expires in <span class="expiry">24 hours</span>.
          </p>

          <div class="footer">
            <p>
              <strong>Hyper Production (SA)</strong><br />
              Email: <a href="mailto:shop@hyperproduction.co.za">shop@hyperproduction.co.za</a><br />
              <span style="color: #444;">This is an automated message. Please do not reply.</span>
            </p>
          </div>
        </div>
      </body>
    </html>
  `;

  try {
    const response = await fetch('https://api.zeptomail.com/v1.1/email', {
      method: 'POST',
      headers: {
        'Authorization': `Zoho-enczapikey ${ZEPTO_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        from: {
          address: 'shop@hyperproduction.co.za',
          name: 'HTs Collections'
        },
        to: [{ email_address: to }],
        subject: `Your Download: ${productName}`,
        htmlbody: emailBody,
        textbody: `Payment Successful!\n\nThank you for purchasing ${productName}.\n\nDownload your album: ${downloadUrl}\n\nThis link expires in 24 hours.\n\n— HTs Collections`
      })
    });

    const data = await response.json();

    if (!response.ok) {
      console.error('❌ ZeptoMail error:', data);
      return false;
    }

    console.log('✅ ZeptoMail sent:', data);
    return true;

  } catch (error) {
    console.error('❌ ZeptoMail send error:', error);
    return false;
  }
}

// ============================================================
// GENERATE SIGNED URL FROM R2 PRIVATE BUCKET
// ============================================================
async function generateSignedUrl(productId, env) {
  const filePaths = {
    'htc1': 'HTC1.zip',
    'htc2': 'HTC2.zip',
    'htc3': 'HTC3.zip',
    'htc4': 'HTC4.zip',
    'htc5': 'HTC5.zip'
  };

  const fileName = filePaths[productId];
  if (!fileName) return null;

  try {
    const signedUrl = await env.PRIVATE.presign(fileName, {
      expiresIn: 86400
    });
    return signedUrl;
  } catch (error) {
    console.error('R2 presign error:', error);
    return null;
  }
}

// ============================================================
// HTML HELPERS
// ============================================================
function successPage(productName, downloadUrl, checkoutId) {
  return new Response(`
    <!DOCTYPE html>
    <html>
      <head>
        <title>Payment Successful</title>
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <link href="https://fonts.googleapis.com/css2?family=Roboto:wght@300;400;500;700&display=swap" rel="stylesheet" />
        <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.0.0-beta3/css/all.min.css" />
        <style>
          * { margin: 0; padding: 0; box-sizing: border-box; font-family: 'Roboto', sans-serif; }
          body { background: #0b0b0b; display: flex; justify-content: center; align-items: center; min-height: 100vh; padding: 20px; }
          .container { max-width: 500px; width: 100%; background: #0f0f0f; border-radius: 24px; padding: 40px; border: 1px solid #2a2a2a; text-align: center; }
          .checkmark { font-size: 4rem; color: #e5de69; margin-bottom: 16px; }
          h1 { color: #e5de69; font-size: 1.8rem; font-weight: 700; margin-bottom: 8px; }
          p { color: #aaa; margin-bottom: 6px; }
          .album-name { color: #fff; font-weight: 500; font-size: 1.1rem; margin: 12px 0; padding: 12px; background: #1a1a1a; border-radius: 12px; border: 1px solid #2a2a2a; }
          .options { display: flex; flex-direction: column; gap: 12px; margin: 20px 0; }
          .btn { display: flex; align-items: center; justify-content: center; gap: 10px; padding: 14px 24px; border-radius: 40px; text-decoration: none; font-weight: 700; border: none; cursor: pointer; font-size: 1rem; transition: 0.2s; }
          .btn-primary { background: #e5de69; color: #0f0f0f; }
          .btn-primary:hover { background: #f5ee79; transform: scale(1.02); }
          .btn-secondary { background: transparent; color: #e5de69; border: 2px solid #e5de69; }
          .btn-secondary:hover { background: #1e1d12; transform: scale(1.02); }
          .divider { border-top: 1px solid #2a2a2a; margin: 20px 0; }
          .info-row { display: flex; justify-content: space-between; color: #888; font-size: .85rem; padding: 4px 0; }
          .info-row span:last-child { color: #fff; }
          .expiry { color: #e5de69; font-weight: 600; }
          .back-link { display: inline-block; color: #888; text-decoration: none; margin-top: 12px; font-size: .85rem; }
          .back-link:hover { color: #e5de69; }
          .email-status { margin-top: 12px; font-size: .85rem; }
          .email-status.success { color: #4caf50; }
          .email-status.error { color: #ff6b6b; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="checkmark">✓</div>
          <h1>Payment Successful!</h1>
          <p>Thank you for purchasing</p>
          <div class="album-name">${productName}</div>

          <div class="options">
            <a href="${downloadUrl}" class="btn btn-primary">
              <i class="fas fa-download"></i> Download Now
            </a>
            <button class="btn btn-secondary" onclick="sendEmailViaWorker()">
              <i class="fas fa-envelope"></i> Send Via Email
            </button>
          </div>

          <p style="color:#666;font-size:.85rem;">
            🔒 Link expires in <span class="expiry">24 hours</span>
          </p>

          <div id="emailStatus" class="email-status"></div>

          <div class="divider"></div>
          <div class="info-row">
            <span>Transaction</span>
            <span>${checkoutId.slice(0, 16)}...</span>
          </div>

          <a href="https://htcoll.shop" class="back-link">← Back to Player</a>
        </div>

        <script>
          const CHECKOUT_ID = '${checkoutId}';
          const DOWNLOAD_URL = '${downloadUrl}';
          const PRODUCT_NAME = '${productName}';
          const WORKER_URL = 'https://yoco-success.hyperproductionsa.workers.dev/send-email';

          async function sendEmailViaWorker() {
            const email = prompt('Enter your email address to receive the download link:');
            if (!email || !email.includes('@')) {
              alert('Please enter a valid email address.');
              return;
            }

            const btn = document.querySelector('.btn-secondary');
            const statusEl = document.getElementById('emailStatus');
            
            btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Sending...';
            btn.disabled = true;
            statusEl.textContent = '';
            statusEl.className = 'email-status';

            try {
              const response = await fetch(WORKER_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  checkoutId: CHECKOUT_ID,
                  email: email,
                  downloadUrl: DOWNLOAD_URL,
                  productName: PRODUCT_NAME
                })
              });

              const data = await response.json();

              if (response.ok && data.success) {
                statusEl.textContent = '✅ Download link sent to ' + email + '!';
                statusEl.className = 'email-status success';
                btn.innerHTML = '<i class="fas fa-check"></i> Sent!';
                btn.disabled = false;
              } else {
                statusEl.textContent = '❌ ' + (data.error || 'Failed to send email. Please try again.');
                statusEl.className = 'email-status error';
                btn.innerHTML = '<i class="fas fa-envelope"></i> Send Via Email';
                btn.disabled = false;
              }
            } catch (error) {
              statusEl.textContent = '❌ Error sending email. Please try again.';
              statusEl.className = 'email-status error';
              btn.innerHTML = '<i class="fas fa-envelope"></i> Send Via Email';
              btn.disabled = false;
              console.error('Email error:', error);
            }
          }
        </script>
      </body>
    </html>
  `, {
    headers: { 'Content-Type': 'text/html' }
  });
}

function errorPage(title, message) {
  return new Response(`
    <!DOCTYPE html>
    <html>
      <head><title>${title}</title></head>
      <body style="font-family:Roboto,sans-serif;background:#0b0b0b;color:#fff;display:flex;justify-content:center;align-items:center;height:100vh;margin:0;padding:20px;">
        <div style="text-align:center;">
          <div style="font-size:4rem;color:#ff4444;">✕</div>
          <h1 style="color:#fff;">${title}</h1>
          <p style="color:#888;">${message}</p>
          <a href="https://htcoll.shop" style="color:#e5de69;text-decoration:none;border:1px solid #e5de69;padding:12px 24px;border-radius:30px;display:inline-block;margin-top:20px;">← Back to Player</a>
        </div>
      </body>
    </html>
  `, {
    headers: { 'Content-Type': 'text/html' }
  });
}
