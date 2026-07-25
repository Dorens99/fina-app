exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
  
  try {
    const update = JSON.parse(event.body);
    
    // Handle /start command
    if (update.message && update.message.text === '/start') {
      const chatId = update.message.chat.id;
      const firstName = update.message.from.first_name || 'друг';
      
      await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: chatId,
          text: `👋 Привет, ${firstName}!\n\nДобро пожаловать в *Fina* — умный учёт финансов с AI-советником.\n\n🤖 *Что умеет Fina:*\n• Учёт доходов и расходов\n• AI-советник анализирует твои траты\n• Статистика и аналитика\n• Поддержка 7 валют\n\n💡 Нажми кнопку *FinaFinance* внизу чтобы открыть приложение!\n\nПервые 500 пользователей получат Premium бесплатно на 3 месяца 🎁`,
          parse_mode: 'Markdown',
          reply_markup: {
            inline_keyboard: [[
              {
                text: '🚀 Открыть Fina',
                web_app: { url: 'https://fina-mvp.netlify.app' }
              }
            ]]
          }
        })
      });
    }

    // Handle successful payment
    if (update.pre_checkout_query) {
      // Always confirm pre-checkout
      await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/answerPreCheckoutQuery`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          pre_checkout_query_id: update.pre_checkout_query.id,
          ok: true
        })
      });
    }

    if (update.message?.successful_payment) {
      const payment = update.message.successful_payment;
      const payload = JSON.parse(payment.invoice_payload);
      const { uid, months } = payload;

      // Calculate expiry date
      const expiry = new Date();
      expiry.setMonth(expiry.getMonth() + months);

      // Update user plan in Firebase via Admin SDK would be here
      // For now send confirmation message
      const chatId = update.message.chat.id;
      await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: chatId,
          text: `⭐ *Premium активирован!*

Спасибо за поддержку Fina! Твой Premium активен на ${months} мес.

Открой приложение чтобы продолжить 👇`,
          parse_mode: 'Markdown',
          reply_markup: {
            inline_keyboard: [[{
              text: '🚀 Открыть Fina',
              web_app: { url: 'https://fina-mvp.netlify.app' }
            }]]
          }
        })
      });
    }

    return { statusCode: 200, body: 'ok' };
  } catch(e) {
    return { statusCode: 500, body: e.message };
  }
};
