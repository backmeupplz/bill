/** Require dependencyes */
const google = require('googleapis');
const sheets = google.sheets('v4');
const TelegramBot = require('node-telegram-bot-api');

const config = require('./config');

/** Setup bot and sheets */
const bot = new TelegramBot(config.bot.testToken, {polling: true});

let jwtClient = new google.auth.JWT(config.google.client_email, null, config.google.private_key, ['https://www.googleapis.com/auth/spreadsheets']);

/** Depend variables */
const chat = config.bot.testChatId;
const spreadsheetId = config.bot.testSheetId;
let authorized = false;
let participants_list = [];
let alumni_list = [];
const confirmed = {};
const checkedUsers = [];

async function delay(s) {
  return new Promise(resolve => setTimeout(resolve, s * 1000));
}

/** Authorize */
jwtClient.authorize(async (err) => {
  if (err) throw new Error(`Authorisation error:\n${err}`);
  authorized = true;

  /** Start updating the sheet */
  await getSheets();
  await checkReminders();

  /** Wait untill time will be multiple of ten i.e. 21:10, 23:30, 15:00 */
  const seconds = new Date().getSeconds();
  let minutes = new Date().getMinutes();
  while (minutes >= 10) minutes -= 10;
  minutes = (9 - minutes) * 60;
  let remaining = ((60 - seconds) + minutes);
  remaining = remaining === 600 ? 0 : remaining;

  await delay(remaining);

  setInterval(async () => {
    await getSheets();
    await checkReminders()
  }, 1000 * 60 * 10)
});

bot.on('polling_error', (err) => {
  console.log(`on polling_error: ${err}`)
});

bot.on('message', async (msg) => {
  const isRightChat = (msg['chat'].id === chat);
  let isPhoto = !!msg.photo; // todo let it be const
  const isCommand = (msg.text && msg.text.toLowerCase().includes('/dayoff'));
  if (msg.text && msg.text.toLowerCase().includes('@')) { // todo delete function after tests
    isPhoto = true;
    msg.from.username = msg.text;
  }

  if (!isRightChat || !(isPhoto || isCommand) || !authorized) return;

  if (isCommand) return await checkIfCanTakeDayOff(msg);
  await bot.sendChatAction(chat, 'typing');
  checkIfNeedsConfirmation(msg)
});

bot.on('callback_query', async (callbackQuery) => {
  const data = callbackQuery.data.split('~');
  const approved = data[0] === 'y';
  const username = data[1];
  const isAlumni = data[2] === 'a';
  const contributor = callbackQuery.from.username;

  /** Check if admin if approoving participant */
  if (!isAlumni && contributor !== 'borodutch') {
    return bot.answerCallbackQuery(callbackQuery.id, {text: 'Только Никита может аппрувить учащихся.'});
  }

  if (approved) {
    await addTrainingToUser(username, isAlumni);
    if (!isAlumni) {
      return bot.editMessageText('Заапрувлено 👍🏻', { reply_markup: {}, chat_id: callbackQuery.message['chat'].id, message_id: callbackQuery.message.message_id })
    } else {
      return bot.editMessageText(`Заапрувлено участником @${contributor} 👍🏻`, { reply_markup: {}, chat_id: callbackQuery.message['chat'].id, message_id: callbackQuery.message.message_id })
    }
  } else {
    if (!isAlumni) {
      return bot.deleteMessage(callbackQuery.message['chat'].id, callbackQuery.message.message_id)
    } else {
      return bot.editMessageText(`Диспрув участником @${contributor} 👍🏻`, { reply_markup: {}, chat_id: callbackQuery.message['chat'].id, message_id: callbackQuery.message.message_id })
    }
  }
});

async function getSheets() {
  return new Promise(async (resolve, reject) => {
    /** Get participants from the first tab */
    await sheets.spreadsheets.values.get(
      {spreadsheetId: spreadsheetId, range: ['Participants!A2:N24'], auth: jwtClient },
      (err, response) => {
        if (err) return reject(err);
        participants_list = response.values;
        console.log(`Participants users:\n${JSON.stringify(participants_list, undefined, 2)}`);
      });
    /** Get alumni from the second tab */
    await sheets.spreadsheets.values.get(
      {spreadsheetId: spreadsheetId, range: ['Alumni!A2:Z25'], auth: jwtClient },
      (err, response) => {
        if (err) return reject(err);
        alumni_list = response.values;
        console.log(`Alumni users:\n${JSON.stringify(alumni_list, undefined, 2)}`);
      });
    return resolve();
  })
}

async function updateUsersSheet(column, row, value, isAlumni) {
  const columns = ['A','B','C','D','E','F','G','H','I','J','K','L','M','N','O','P','Q','R','S','T','U','V','W','X','Y','Z'];
  const tab = isAlumni ? 'Alumni' : 'Participants';
  return new Promise((res, rej) => {
    sheets.spreadsheets.values.update({
      spreadsheetId: spreadsheetId,
      valueInputOption: 'USER_ENTERED',
      range: [`${tab}!${columns[column]}${row+2}`],
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

async function checkIfCanTakeDayOff(msg) {
  const username = msg.from.username;
  let status;
  alumni_list.forEach(alumni => {
    if (alumni[0].indexOf(username) > -1) {
      status = alumni[8];
    }
  });
  if (!status) return await bot.sendMessage(chat, `Брать отгул могут только выпускники`);

  if (status.indexOf('Нужно заниматься') > -1) {
    await bot.sendMessage(chat, `${username}, сегодня брать отгул нельзя`);
  } else {
    checkedUsers.push(username);
    await bot.sendMessage(chat, `${username}, сегодня отдыхаешь`);
  }

}

async function checkReminders() {
  let usersToRemind = '';
  /** Check participants */
  participants_list.forEach(participant => {
    /** Check if it's time to remind */
    const hour = Number(participant[13].split(' ')[1].split(':')[0]);
    const minute = Number(participant[13].split(' ')[1].split(':')[1]);
    const isTimeToRemind = (hour === 22) && (minute > 0) && (minute < 10);

    if (checkedUsers.indexOf(participant[0]) > -1) {
      if (hour === 1) delete checkedUsers[checkedUsers.indexOf(participant[0])];
      return
    }

    if (!isTimeToRemind) return;

    const day = Number(participant[2]);
    const week = Math.floor(day / 7);
    const trainingsRequired = day % 7;
    const finishedTrainings = Number(participant[3 + week]);

    if (finishedTrainings < trainingsRequired) {
      usersToRemind += `${participant[0]}, `;
      checkedUsers.push(participant[0])
    }
  });
  /** Check alumni */
  alumni_list.forEach(alumni => {
    /** Check if it's time to remind */
    const hour = Number(alumni[7].split(' ')[1].split(':')[0]);
    const minute = Number(alumni[7].split(' ')[1].split(':')[1]);
    if (!alumni[3]) return;
    const isTimeToRemind = (hour === alumni[3]) && (minute > 0) && (minute < 10);

    if (checkedUsers.indexOf(alumni[0]) > -1) {
      if (hour === 1) delete checkedUsers[checkedUsers.indexOf(alumni[0])];
      return
    }

    if (!isTimeToRemind) return;

    const day = Number(alumni[2]);
    const week = Math.floor(day / 7);
    const trainingsRequired = day % 7;
    const finishedTrainings = Number(alumni[3 + week]);

    if (finishedTrainings < trainingsRequired) {
      usersToRemind += `${alumni[0]}, `;
      checkedUsers.push(alumni[0])
    }
  });
  if (usersToRemind.length === 0) return;
  await bot.sendMessage(chat, `${usersToRemind} добрый вечер, вы еще можете успеть потренироваться. Вперед к спорту и здоровому телу! 💪🏻`);
}
async function checkIfNeedsConfirmation(msg) {
  const username = msg.from.username;

  let user;
  let userType;
  for (let i = 0 ; i < participants_list.length ; i++) {
    let sUser = participants_list[i];
    console.log(`User: ${JSON.stringify(sUser)}`);
    if (sUser[0].indexOf(username) > -1) {
      user = sUser;
      userType = 'participant';
      break
    }
  }
  if (!user) {
    for (let i = 0 ; i < alumni_list.length ; i++) {
      let sUser = alumni_list[i];
      console.log(`User: ${JSON.stringify(sUser)}`);
      if (sUser[0].indexOf(username) > -1) {
        user = sUser;
        userType = 'alminu';
        break
      }
    }
  }
  if (!user) return;
  let day;
  if (userType === 'participant') {
    day = Number(user[13].split(' ')[0].split('-')[0]);
  } else {
    day = Number(user[7].split(' ')[0].split('-')[0]);
  }

  if (confirmed[username] === day) return;

  checkedUsers.push(username);

  if (userType === 'participant') {
    await bot.sendMessage(chat, '@borodutch аппрувим? 💪🏻', {
      reply_to_message_id: msg.message_id,
      reply_markup: { inline_keyboard: [[
        { text: 'Любо 👍🏻', callback_data: `y~${msg.from.username}~p` },
        { text: 'Такое 🌮', callback_data: `n~${msg.from.username}~p` }
      ]]}
    })
  } else {
    await bot.sendMessage(chat, 'Ну чо, пацаны? Аппрувим? 💪🏻', {
      reply_to_message_id: msg.message_id,
      reply_markup: { inline_keyboard: [[
        { text: 'Любо 👍🏻', callback_data: `y~${msg.from.username}~a` },
        { text: 'Такое 🌮', callback_data: `n~${msg.from.username}~a` }
      ]]}
    });
  }
}
async function addTrainingToUser(username, isAlumni) {
  await getSheets();

  let userIndex = -1;
  if (isAlumni) {
    alumni_list.forEach((a, i) => { if (a[0].indexOf(username) > -1) userIndex = i });
    if (userIndex === -1) return;
    const user = alumni_list[userIndex];
    confirmed[username] = Number(user[7].split(' ')[0].split('-')[0]);
    await updateUsersSheet(5, userIndex, Number(user[5]) + 1, isAlumni);
  } else {
    participants_list.forEach((a, i) => { if (a[0].indexOf(username) > -1) userIndex = i });
    if (userIndex === -1) return;
    const user = participants_list[userIndex];
    confirmed[username] = Number(user[13].split(' ')[0].split('-')[0]);
    for (let i = 3; i <= 10; i++) {
      if (user[i] < 6) await updateUsersSheet(i, userIndex, Number(user[i]) + 1, isAlumni);
    }
  }
}