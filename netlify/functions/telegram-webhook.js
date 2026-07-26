const FIREBASE_URL = `https://firestore.googleapis.com/v1/projects/fina-app-eb51c/databases/(default)/documents`;
const FOUNDING_LIMIT = 500;

async function getFirebaseToken() {
  // Use Firebase REST API with API key
  return process.env.FIREBASE_API_KEY;
}

async function getUsersCount() {
  try {
    const res = await fetch(
      `${FIREBASE_URL}/users?pageSize=1&mask.fieldPaths=currency`,
      { headers: { 'Content-Type': 'application/json' } }
    );
    const data = await res.json();
    // We can't get exact count easily via REST, use a counter document instead
    const counterRes = await fetch(`${FIREBASE_URL}/meta/userCount`);
    const counterData = await counterRes.json();
    return counterData.fields?.count?.integerValue || 0;
  } catch(e) {
    return 0;
  }
}

async function incrementUserCount() {
  try {
    const counterRes = await fetch(`${FIREBASE_URL}/meta/userCount`);
    const counterData = await counterRes.json();
    const currentCount = parseInt(counterData.fields?.count?.integerValue || 0);
    const newCount = currentCount + 1;
    await fetch(`${FIREBASE_URL}/meta/userCount`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        fields: { count: { integerValue: newCount } }
      })
    });
    return newCount;
  } catch(e) {
    return 1;
  }
}

async function setUserPlan(uid, plan) {
  try {
    await fetch(`${FIREBASE_URL}/users/${uid}?updateMask.fieldPaths=plan`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        fields: { plan: { stringValue: plan } }
      })
    });
  } catch(e) {
    console.log('Error setting plan:', e);
  }
}

async function getUserByTelegramId(telegramId) {
  try {
    // Query users by telegramId
    const res = await fetch(
      `${FIREBASE_URL}:runQuery`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          structuredQuery: {
            from: [{ collectionId: 'users' }],
            where: {
              fieldFilter: {
                field: { fieldPath: 'telegramId' },
                op: 'EQUAL',
                value: { integerValue: telegramId }
              }
            },
            limit: 1
          }
        })
      }
    );
    const data = await res.json();
    if (data[0]?.document) {
      const doc = data[0].document;
      const uid = doc.name.split('/').pop();
      const plan = doc.fields?.plan?.stringValue || 'free';
      return { uid, plan };
    }
    return null;
  } catch(e) {
    return null;
  }
}

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
      const telegramId = update.message.from.id;

      // Check if user already exists and their plan
      const existingUser = await getUserByTelegramId(telegramId);
      let userCount = await getUsersCount();
      let isFoundingMember = false;

      // If new user and under limit - give founding plan
      if (!existingUser && userCount < FOUNDING_LIMIT) {
        isFoundingMember = true;
        await incrementUserCount();
        userCount++;
      } else if (existingUser && existingUser.plan === 'founding') {
        isFoundingMember = true;
      }

      const spotsLeft = Math.max(0, FOUNDING_LIMIT - userCount);
      const message = isFoundingMember
        ? `👋 Привет, ${firstName}!

Добро пожаловать в *Fina* — умный учёт финансов с AI-советником.

🏆 *Ты получил статус Founding Member!*
Все Premium функции бесплатно навсегда — в знак благодарности за то что ты среди первых.

🤖 *Что умеет Fina:*
• Учёт доходов и расходов
• AI-советник анализирует твои траты
• Бюджет, цели накопления, трекер подписок
• Семейный аккаунт
• 7 валют

💡 Нажми кнопку ниже чтобы открыть приложение!`
        : `👋 Привет, ${firstName}!

Добро пожаловать в *Fina* — умный учёт финансов с AI-советником.

⚡ Осталось *${spotsLeft}* мест для Founding Members — первые 500 пользователей получают Premium бесплатно навсегда!

🤖 *Что умеет Fina:*
• Учёт доходов и расходов
• AI-советник анализирует твои траты
• Бюджет, цели накопления, трекер подписок
• 7 валют

💡 Нажми кнопку ниже чтобы открыть приложение!`;

      await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: chatId,
          text: message,
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

      // If new founding member - update their plan after they register
      // This will be picked up when they login via Telegram
      if (isFoundingMember && !existingUser) {
        // Store pending founding status by telegramId
        await fetch(`${FIREBASE_URL}/pendingFounders/${telegramId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            fields: {
              telegramId: { integerValue: telegramId },
              plan: { stringValue: 'founding' },
              firstName: { stringValue: firstName },
              createdAt: { stringValue: new Date().toISOString() }
            }
          })
        });
      }
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
