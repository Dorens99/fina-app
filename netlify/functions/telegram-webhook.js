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

    return { statusCode: 200, body: 'ok' };
  } catch(e) {
    return { statusCode: 500, body: e.message };
  }
};
