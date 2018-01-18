const TelegramBot = require('node-telegram-bot-api');

const token = '454530498:AAEGpFbjeIhKsL7hprcsEZC27NvMbAaegoY';
const key = require('./auth.json');

var google = require('googleapis');
const sheets = google.sheets('v4');
let jwtClient = new google.auth.JWT(
  key.client_email,
  null,
  key.private_key,
  ['https://www.googleapis.com/auth/spreadsheets']);
const chat = 231399891;
const spreadsheetId = '1g75OIJGOqvZveIReuurPtDY-Yau39PBcMQ6qrTlFddE';

let bot = new TelegramBot(token, {polling: true});

let authorized = false;
let sheet = [];

// Authorize
jwtClient.authorize(async (err, tokens) => {
  authorized = true;

  // Start updating the sheet
  await getSheet();
  checkReminders();

  setInterval(async () => {
    await getSheet();
    checkReminders();
  }, 1000 * 60 * 10);
});

bot.on('message', (msg) => {
  const chatId = msg.chat.id;

  const isRightChat = msg.chat.id == chat;
  const isPhoto = !!msg.photo;

  if ((!isRightChat && !isPhoto) || !authorized) return;

  bot.sendChatAction(chat, 'typing');

  checkIfNeedsConfirmation(msg);
});

bot.on('callback_query', async function onCallbackQuery(callbackQuery) {
  if (callbackQuery.from.username !== 'borodutch') {
    bot.answerCallbackQuery(callbackQuery.id, {
      text: 'Только Никита может аппрувить.'
    });
    return;
  }

  const data = callbackQuery.data.split('~');
  const approved = data[0] === 'y';
  const username = data[1];

  if (approved) {
    // Add training
    await addTrainingToUser(username);
    bot.editMessageText('Заапрувлено 👍🏻', {
      reply_markup: {},
      chat_id: callbackQuery.message.chat.id,
      message_id: callbackQuery.message.message_id
    });
  } else {
    // Just delete
    bot.deleteMessage(callbackQuery.message.chat.id, callbackQuery.message.message_id);
  }
});

function checkIfNeedsConfirmation(msg) {
  bot.sendMessage(chat, '@borodutch аппрувим? 💪🏻', {
    reply_to_message_id: msg.message_id,
    reply_markup: {
      inline_keyboard: [
        [{ text: 'Любо 👍🏻', callback_data: `y~${msg.from.username}` },
         { text: 'Такое 🌮', callback_data: `n~${msg.from.username}` }]
      ]
    }
  });
}

async function addTrainingToUser(username) {
  await getSheet();

  let index = -1;
  const members = sheet.forEach((a, i) => {
    if (a[0].indexOf(username) > -1) {
      index = i;
    }
  });
  
  const row = sheet[index];
  
  for (let i = 3; i <= 10; i++) {
    if (row[i] < 6) {
      await updateSheet(i, index, Number(row[i]) + 1);
      return;
    }
  }
}

async function getSheet() {
  return new Promise((res, rej) => {
    sheets.spreadsheets.values.get({
      spreadsheetId,
      range: ['A2:N22'],
      auth: jwtClient
    }, (err, response) => {
      if (err) { 
        rej(err)
      } else {
        sheet = response.values;
        res(response.values);
      }
    });
  });
}

async function updateSheet(column, row, value) {
  const columns = ['A','B','C','D','E','F','G','H','I','J','K','L','M','N','O','P','Q','R','S','T','U','V','W','X','Y','Z'];
  return new Promise((res, rej) => {
    sheets.spreadsheets.values.update({
      spreadsheetId,
      valueInputOption: 'USER_ENTERED',
      range: [`${columns[column]}${row+2}`],
      auth: jwtClient,
      resource: {
        values: [[value]]
      }
    }, (err, response) => {
      if (err) { 
        rej(err)
      } else {
        res(response);
      }
    });
  })
}

function checkReminders() {
  sheet.forEach(user => {
    checkUser(user);
  });
}

const checkedUsers = [];

function checkUser(user) {
  // Check if it's late
  const hour = Number(user[13].split(' ')[1].split(':')[0]);
  const isLate = hour >= 22;

  if (!isLate) return;

  if (checkedUsers.indexOf(user[0]) > -1) {
    if (hour == 1) {
      checkedUsers.splice(checkedUsers.indexOf(user[0]), 1);
    }
    return;
  }

  // Check if no training yet
  const day = Number(user[2]);
  const week = Math.floor(day / 7);
  const trainingsRequired = day % 7;
  const finishedTrainings = Number(user[3 + week]);

  if (finishedTrainings < trainingsRequired) {
    remind(user[0]);
  }
}

function remind(username) {
  bot.sendMessage(chat, `${username} добрый вечер, вы еще можете успеть потренироваться. Вперед к спорту и здоровому телу! 💪🏻`);
  checkedUsers.push(username);
}