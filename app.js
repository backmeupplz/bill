/** Require dependencyes */
const google = require('googleapis');
const TelegramBot = require('node-telegram-bot-api');

const config = require('./config');

/** Setup bot and sheets */
const bot = new TelegramBot(config.bot.testToken, {polling: true}); //

let jwtClient = new google.auth.JWT(config.google.client_email, null, config.google.private_key, ['https://www.googleapis.com/auth/spreadsheets']);
const sheets = google.sheets('v4');

/** Depend variables */
const chat = config.bot.testChatId;
const spreadsheetId = config.bot.testSheetId;
let authorized = false;
let sheet = [];
const confirmed = {};
const checkedUsers = [];

/** Authorize */
jwtClient.authorize(async (err) => {
  if (err) throw new Error(`Authorisation error: ${err}`);
  console.log(`Authorisation succeed`);
  authorized = true;

  /** Start updating the sheet */
  console.log(`getting sheets`);
  await getSheet();
  console.log(`checking reminder`);
  checkReminders();

  setInterval(async () => {
    console.log(`getting sheets on interval`);
    await getSheet();
    console.log(`checking reminder on interval`);
    checkReminders()
  }, 1000 * 60 * 10)
});

bot.on('polling_error', (err) => {
  console.log(`onError; ${err}`)
});

bot.on('message', (msg) => {
  console.log(`on message`);
  const isRightChat = (msg.chat.id === chat);
  const isPhoto = !!msg.photo;

  if (!isRightChat || !isPhoto || !authorized) return console.log(`wrong chat`);

  bot.sendChatAction(chat, 'typing');
  console.log(`sent typing`);
  checkIfNeedsConfirmation(msg)
});

bot.on('callback_query', async (callbackQuery) => {
  /** Check if admin */
  if (callbackQuery.from.username !== 'babrums') // todo change to borodutch
    return bot.answerCallbackQuery(callbackQuery.id, { text: 'Только Никита может аппрувить.' });

  const data = callbackQuery.data.split('~');
  const approved = data[0] === 'y';
  const username = data[1];

  if (approved) {
    console.log(`approove`);
    await addTrainingToUser(username);
    return bot.editMessageText('Заапрувлено 👍🏻',
      { reply_markup: {}, chat_id: callbackQuery.message.chat.id, message_id: callbackQuery.message.message_id })
  } else {
    console.log(`dont approove`);
    return bot.deleteMessage(callbackQuery.message.chat.id, callbackQuery.message.message_id)
  }
});

async function getSheet() {
  return new Promise((resolve, reject) => {
    sheets.spreadsheets.values.get({ spreadsheetId, range: ['A2:N25'], auth: jwtClient }, (err, response) => { // todo back to N24
      if (err) return reject(err);
      sheet = response.values;
      return resolve(response.values)
    })
  })
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
        res(response)
      }
    })
  })
}

function checkReminders() {
  sheet.forEach(user => {
    // Check if it's late
    const hour = Number(user[13].split(' ')[1].split(':')[0]);
    const isLate = hour >= 22;

    if (checkedUsers.indexOf(user[0]) > -1) {
      if (hour === 1) {
        checkedUsers.splice(checkedUsers.indexOf(user[0]), 1)
      }
      return
    }

    if (!isLate) return;

    const day = Number(user[2]);
    const week = Math.floor(day / 7);
    const trainingsRequired = day % 7;
    const finishedTrainings = Number(user[3 + week]);

    if (finishedTrainings < trainingsRequired) {
      bot.sendMessage(chat, `${user[0]} добрый вечер, вы еще можете успеть потренироваться. Вперед к спорту и здоровому телу! 💪🏻`);
      checkedUsers.push(user[0])
    }
  })
}
function checkIfNeedsConfirmation(msg) {
  const username = msg.from.username; // todo handle users without username?

  let user;
  for (let i = 0 ; i < sheet.length ; i++) {
    let sUser = sheet[i];
    console.log(`User: ${JSON.stringify(sUser, undefined, 2)}`);
    if (sUser[0].indexOf(username) > -1) {
      user = sUser;
      break
    }
  }
  if (!user) return;
  const day = Number(user[13].split(' ')[0].split('-')[0]);

  console.log(`needConfirmation: Confirmed\n${JSON.stringify(confirmed, undefined, 2)}`);
  if (confirmed[username] === day) return;

  checkedUsers.push(username);

  return bot.sendMessage(chat, '@borodutch аппрувим? 💪🏻', {
    reply_to_message_id: msg.message_id,
    reply_markup: { inline_keyboard: [[{ text: 'Любо 👍🏻', callback_data: `y~${msg.from.username}` },
        { text: 'Такое 🌮', callback_data: `n~${msg.from.username}` }]]}
  })
}
async function addTrainingToUser(username) {
  await getSheet();

  let index = -1;
  sheet.forEach((a, i) => { if (a[0].indexOf(username) > -1) index = i }); // if sheet not contains user — index == -1

  const row = sheet[index];
  confirmed[username] = Number(row[13].split(' ')[0].split('-')[0]);

  for (let i = 3; i <= 10; i++) {
    if (row[i] < 6) return await updateSheet(i, index, Number(row[i]) + 1);
  }
}