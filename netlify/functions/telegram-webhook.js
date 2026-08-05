const { getAdmin } = require('./_firebaseAdmin');
const { CATS_EXP, guessCategory } = require('./_categories');

const FOUNDING_LIMIT = 500;

// ---------- Firestore helpers (через Admin SDK — обходит Security Rules, работает без auth) ----------

async function getUsersCount(db) {
  try {
    const snap = await db.collection('meta').doc('userCount').get();
    return snap.exists ? (snap.data().count || 0) : 0;
  } catch (e) { return 0; }
}

async function incrementUserCount(db) {
  try {
    const ref = db.collection('meta').doc('userCount');
    const snap = await ref.get();
    const current = snap.exists ? (snap.data().count || 0) : 0;
    const next = current + 1;
    await ref.set({ count: next }, { merge: true });
    return next;
  } catch (e) { return 1; }
}

async function getUserByTelegramId(telegramId, db) {
  try {
    const snap = await db.collection('users').where('telegramId', '==', telegramId).limit(1).get();
    if (snap.empty) return null;
    const doc = snap.docs[0];
    const data = doc.data();
    return { uid: doc.id, plan: data.plan || 'free' };
  } catch (e) { return null; }
}

// ---------- Telegram Bot API helpers ----------

async function sendMessage(BOT_TOKEN, chatId, text, extra = {}) {
  const res = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text, ...extra })
  });
  return res.json();
}

async function editMessageText(BOT_TOKEN, chatId, messageId, text, extra = {}) {
  const res = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/editMessageText`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, message_id: messageId, text, ...extra })
  });
  return res.json();
}

async function answerCallback(BOT_TOKEN, callbackQueryId, text) {
  await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/answerCallbackQuery`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ callback_query_id: callbackQueryId, text })
  });
}

function mainAppButton() {
  return {
    reply_markup: {
      inline_keyboard: [[{ text: '🚀 Открыть Fina', web_app: { url: 'https://fina-mvp.netlify.app' } }]]
    }
  };
}

// ---------- Распознавание чека через Claude (vision) ----------

async function getTelegramFileBase64(fileId, BOT_TOKEN) {
  const fileRes = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/getFile?file_id=${fileId}`);
  const fileData = await fileRes.json();
  if (!fileData.ok) throw new Error('getFile failed: ' + fileData.description);
  const filePath = fileData.result.file_path;
  const binRes = await fetch(`https://api.telegram.org/file/bot${BOT_TOKEN}/${filePath}`);
  const buf = Buffer.from(await binRes.arrayBuffer());
  return buf.toString('base64');
}

async function analyzeReceipt(base64Image) {
  const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': ANTHROPIC_KEY,
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 300,
      messages: [{
        role: 'user',
        content: [
          { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: base64Image } },
          {
            type: 'text',
            text: 'Это фото чека или квитанции об оплате. Верни ТОЛЬКО валидный JSON без markdown-разметки, пояснений и обратных кавычек, в формате: {"merchant":"название магазина/продавца","amount":число (итоговая сумма к оплате, только число, без валюты и пробелов),"currency":"3-буквенный код валюты, если виден на чеке, иначе null","date":"YYYY-MM-DD если дата видна на чеке, иначе null"}. Если это не похоже на чек или сумму не разобрать — верни {"error":"not_a_receipt"}.'
          }
        ]
      }]
    })
  });
  const data = await res.json();
  const textBlock = data?.content?.find(c => c.type === 'text');
  if (!textBlock) throw new Error('Claude не вернул текст: ' + JSON.stringify(data));
  const cleaned = textBlock.text.replace(/```json|```/g, '').trim();
  return JSON.parse(cleaned);
}

async function handlePhotoMessage(update, BOT_TOKEN, db) {
  const msg = update.message;
  const chatId = msg.chat.id;
  const telegramId = msg.from.id;

  const user = await getUserByTelegramId(telegramId, db);
  if (!user) {
    await sendMessage(
      BOT_TOKEN, chatId,
      'Сначала открой приложение Fina хотя бы раз, чтобы я знал, куда сохранять траты 👇',
      mainAppButton()
    );
    return;
  }

  await sendMessage(BOT_TOKEN, chatId, '🔎 Читаю чек...');

  const photos = msg.photo;
  const bestPhoto = photos[photos.length - 1]; // самое высокое разрешение из присланных Telegram
  let parsed;
  try {
    const base64 = await getTelegramFileBase64(bestPhoto.file_id, BOT_TOKEN);
    parsed = await analyzeReceipt(base64);
  } catch (e) {
    console.error('Receipt analysis failed:', e);
    await sendMessage(BOT_TOKEN, chatId, '😕 Не получилось распознать чек. Попробуй сфотографировать чётче или добавь трату вручную в приложении.');
    return;
  }

  if (parsed.error === 'not_a_receipt' || !parsed.amount) {
    await sendMessage(BOT_TOKEN, chatId, '🤔 Не похоже на чек с суммой. Попробуй другое фото или добавь трату вручную в приложении.');
    return;
  }

  const description = (parsed.merchant || 'Чек').toString().slice(0, 120);
  const amount = Math.abs(parseFloat(parsed.amount));
  const currency = parsed.currency || null;
  const dateStr = parsed.date || null;
  const category = guessCategory(description, 'expense') || '📦';
  const catObj = CATS_EXP.find(c => c.ico === category) || CATS_EXP[CATS_EXP.length - 1];

  const draftRef = db.collection('pendingReceipts').doc();
  await draftRef.set({
    uid: user.uid,
    telegramId,
    type: 'expense',
    amount,
    currency,
    description,
    date: dateStr,
    category: catObj.ico,
    catName: catObj.lbl,
    createdAt: new Date().toISOString()
  });

  const currencyLabel = currency ? ' ' + currency : '';
  const text = `${catObj.ico} ${description}\nСумма: ${amount.toFixed(2)}${currencyLabel}\nКатегория: ${catObj.lbl}` +
    (dateStr ? `\nДата: ${dateStr}` : '') +
    '\n\nСохранить?';

  await sendMessage(BOT_TOKEN, chatId, text, {
    reply_markup: {
      inline_keyboard: [[
        { text: '✅ Сохранить', callback_data: `rcpt_ok:${draftRef.id}` },
        { text: '✏️ Исправить', callback_data: `rcpt_edit:${draftRef.id}` }
      ]]
    }
  });
}

async function handleCallbackQuery(update, BOT_TOKEN, db) {
  const admin = getAdmin();
  const cq = update.callback_query;
  const data = cq.data || '';
  const chatId = cq.message.chat.id;
  const messageId = cq.message.message_id;
  const [action, draftId] = data.split(':');

  if (!draftId) { await answerCallback(BOT_TOKEN, cq.id); return; }

  const draftRef = db.collection('pendingReceipts').doc(draftId);
  const draftSnap = await draftRef.get();

  if (!draftSnap.exists) {
    await answerCallback(BOT_TOKEN, cq.id, 'Эта запись уже обработана');
    return;
  }
  const draft = draftSnap.data();

  if (action === 'rcpt_ok') {
    await db.collection('transactions').add({
      uid: draft.uid,
      type: draft.type,
      amount: draft.amount,
      category: draft.category,
      catName: draft.catName,
      comment: draft.description,
      currency: draft.currency || 'PLN',
      source: 'telegram-photo',
      createdAt: admin.firestore.Timestamp.fromDate(draft.date ? new Date(draft.date + 'T12:00:00') : new Date())
    });
    await draftRef.delete();
    await editMessageText(BOT_TOKEN, chatId, messageId, `✅ Сохранено: ${draft.catName} · ${draft.amount.toFixed(2)}${draft.currency ? ' ' + draft.currency : ''}`);
    await answerCallback(BOT_TOKEN, cq.id, 'Сохранено!');
  } else if (action === 'rcpt_edit') {
    await draftRef.delete();
    await editMessageText(BOT_TOKEN, chatId, messageId, '✏️ Ок, добавь эту трату вручную в приложении — там можно точно указать сумму, категорию и дату.');
    await answerCallback(BOT_TOKEN, cq.id);
  } else {
    await answerCallback(BOT_TOKEN, cq.id);
  }
}

// ---------- Основной обработчик webhook ----------

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
  const admin = getAdmin();
  const db = admin.firestore();

  try {
    const update = JSON.parse(event.body);

    // Фото чека — распознаём и предлагаем сохранить
    if (update.message?.photo) {
      await handlePhotoMessage(update, BOT_TOKEN, db);
      return { statusCode: 200, body: 'ok' };
    }

    // Нажатие на inline-кнопку («Сохранить» / «Исправить»)
    if (update.callback_query) {
      await handleCallbackQuery(update, BOT_TOKEN, db);
      return { statusCode: 200, body: 'ok' };
    }

    // Handle /start command
    if (update.message && update.message.text === '/start') {
      const chatId = update.message.chat.id;
      const firstName = update.message.from.first_name || 'друг';
      const telegramId = update.message.from.id;

      const existingUser = await getUserByTelegramId(telegramId, db);
      let userCount = await getUsersCount(db);
      let isFoundingMember = false;

      if (!existingUser && userCount < FOUNDING_LIMIT) {
        isFoundingMember = true;
        await incrementUserCount(db);
        userCount++;
      } else if (existingUser && existingUser.plan === 'founding') {
        isFoundingMember = true;
      }

      const spotsLeft = Math.max(0, FOUNDING_LIMIT - userCount);
      const trialEnd = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toLocaleDateString('ru');
      const featureList = `• 💰 Учёт доходов и расходов
• 📸 Сфотографируй чек — AI сам занесёт трату
• 🤖 AI анализирует траты и даёт советы
• 🎯 Бюджет по категориям
• ⭐ Цели накопления с планом достижения
• 🔄 Трекер подписок
• 👨‍👩‍👧 Семейный аккаунт
• 🌍 7 валют — $, €, zł, ₽, ₴ и другие`;

      const message = isFoundingMember
        ? `👋 Привет, ${firstName}!

Добро пожаловать в *Fina* — умный учёт финансов с AI-советником.

🎁 *Ты получил Premium на 3 месяца бесплатно!*
Ты среди первых 500 пользователей — все функции открыты до ${trialEnd}.

🤖 *Что умеет Fina:*
${featureList}

💡 Нажми кнопку ниже чтобы открыть приложение! Или просто пришли мне сюда фото чека 📸`
        : `👋 Привет, ${firstName}!

Добро пожаловать в *Fina* — умный учёт финансов с AI-советником.

⚡ Осталось *${spotsLeft}* мест — первые 500 пользователей получают Premium бесплатно на 3 месяца!

🤖 *Что умеет Fina:*
${featureList}

💡 Нажми кнопку ниже чтобы открыть приложение! Или просто пришли мне сюда фото чека 📸`;

      await sendMessage(BOT_TOKEN, chatId, message, {
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: [[{ text: '🚀 Открыть Fina', web_app: { url: 'https://fina-mvp.netlify.app' } }]]
        }
      });

      if (isFoundingMember && !existingUser) {
        await db.collection('pendingFounders').doc(String(telegramId)).set({
          telegramId,
          plan: 'trial',
          trialEndsAt: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString(),
          firstName,
          createdAt: new Date().toISOString()
        });
      }
    }

    // Handle successful payment
    if (update.pre_checkout_query) {
      await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/answerPreCheckoutQuery`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pre_checkout_query_id: update.pre_checkout_query.id, ok: true })
      });
    }

    if (update.message?.successful_payment) {
      const payment = update.message.successful_payment;
      const payload = JSON.parse(payment.invoice_payload);
      const { uid, months } = payload;

      const expiry = new Date();
      expiry.setMonth(expiry.getMonth() + months);

      await db.collection('users').doc(uid).update({
        plan: 'premium',
        premiumEndsAt: expiry.toISOString(),
        premiumMonths: months,
        lastPaymentAt: new Date().toISOString()
      });

      const chatId = update.message.chat.id;
      await sendMessage(BOT_TOKEN, chatId, `⭐ *Premium активирован!*

Спасибо за поддержку Fina! Твой Premium активен на ${months} мес.

Открой приложение чтобы продолжить 👇`, {
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: [[{ text: '🚀 Открыть Fina', web_app: { url: 'https://fina-mvp.netlify.app' } }]]
        }
      });
    }

    return { statusCode: 200, body: 'ok' };
  } catch (e) {
    console.error('Webhook error:', e);
    return { statusCode: 500, body: e.message };
  }
};
