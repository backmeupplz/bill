/** Require dependencyes */
const google = require('googleapis');
const sheets = google.sheets('v4');
const TelegramBot = require('node-telegram-bot-api');

const config = require('./config');

/** Setup bot and sheets */
const bot = new TelegramBot(config.bot.token, {polling: true});

let jwtClient = new google.auth.JWT(config.google.client_email, null, config.google.private_key, ['https://www.googleapis.com/auth/spreadsheets']);

/** Depend variables */
const chat = config.bot.chatId;
const spreadsheetId = config.bot.sheetId;
let authorized = false;
let participants_list = [];
let alumni_list = [];

async function delay(s) {
  return new Promise(resolve => setTimeout(resolve, s * 1000));
}

/** Authorize */
jwtClient.authorize(async (err) => {
  if (err) throw new Error(`Authorisation error:\n${err}`);
  authorized = true;

  /** Start updating the sheet */
  try {
    await getSheets();
  } finally {
    await checkReminders();
  }

  /** Wait untill time will be multiple of ten i.e. 21:10, 23:30, 15:00 */
  const seconds = new Date().getSeconds();
  let minutes = new Date().getMinutes();
  while (minutes >= 10) minutes -= 10;
  minutes = (9 - minutes) * 60;
  let remaining = ((60 - seconds) + minutes);
  remaining = remaining === 600 ? 0 : remaining;

  await delay(remaining);
  try {
    await getSheets();
  } finally {
    await checkReminders();
  }

  setInterval(async () => {
    try {
      await getSheets();
    } finally {
      await checkReminders();
    }
  }, 1000 * 60 * 10)
});

bot.on('polling_error', (err) => {
  console.log(`on polling_error: ${err}`)
});

bot.on('message', async (msg) => {
  const isRightChat = (msg['chat'].id === chat);
  const isCommand = msg.text && (msg.text.toLowerCase().includes('/status') || msg.text.toLowerCase().includes('/dayoff'));
  const isPhoto = !!msg.photo;

  if (!isRightChat || !(isPhoto || isCommand) || !authorized) return;
  if (msg.text && msg.text.toLowerCase().includes('/dayoff')) {
    return await checkIfCanTakeDayOff(msg);
  } else if (msg.text && msg.text.toLowerCase().includes('/status')) {
    return await sendStatus(msg)
  }

  await bot.sendChatAction(chat, 'typing');
  return checkIfNeedsConfirmation(msg)
});

bot.on('callback_query', async (callbackQuery) => {
  const data = callbackQuery.data.split('~');
  const approved = data[0] === 'y';
  const username = data[1];
  const isAlumni = data[2] === 'a';
  const contributor = callbackQuery.from.username;

  /** Check if admin if approoving participant */
  if (!isAlumni && contributor !== 'borodutch') {
    return bot.answerCallbackQuery(callbackQuery.id, {text: 'Только Никита может аппрувить участников программы'});
  }

  if (approved) {
    await addTrainingToUser(username, isAlumni);
    if (!isAlumni) {
      return bot.editMessageText('Заапрувленно 👍🏻', { reply_markup: {}, chat_id: callbackQuery.message['chat'].id, message_id: callbackQuery.message.message_id })
    } else {
      return bot.editMessageText(`Заапрувленно участником @${contributor} 👍🏻`, { reply_markup: {}, chat_id: callbackQuery.message['chat'].id, message_id: callbackQuery.message.message_id })
    }
  } else {
    if (!isAlumni) {
      return bot.deleteMessage(callbackQuery.message['chat'].id, callbackQuery.message.message_id)
    } else {
      return bot.editMessageText(`Дисапрувленно участником @${contributor} 👍🏻`, { reply_markup: {}, chat_id: callbackQuery.message['chat'].id, message_id: callbackQuery.message.message_id })
    }
  }
});

async function getSheets() {
  return new Promise(async (resolve) => {
    /** Get participants from the first tab */
    const partipians = await getPartipians();
    /** Get alumni from the second tab */
    const alumni = await getAlumni();
    return resolve(partipians, alumni);
  })
}

function getPartipians() {
  return new Promise((resolve, reject) => {
    sheets.spreadsheets.values.get(
      {spreadsheetId: spreadsheetId, range: ['Participants!A2:O24'], auth: jwtClient },
      (err, response) => {
        if (err) return reject(err);
        participants_list = response.values;
        resolve(participants_list);
      })
  })
}

function getAlumni() {
  return new Promise((resolve, reject) => {
    sheets.spreadsheets.values.get({spreadsheetId: spreadsheetId, range: ['Alumni!A2:J25'], auth: jwtClient },(err, response) => {
      if (err) return reject(err);
      alumni_list = response.values;
      resolve(alumni_list);
    })
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
  let notification;
  alumni_list.forEach(alumni => {
    if (alumni[0].indexOf(username) > -1) {
      status = alumni[8];
      notification = alumni[9]
    }
  });
  if (!status) return await bot.sendMessage(chat, `Брать отгул могут только выпускники`, {reply_to_message_id: msg.message_id});
  if (notification && notification === 1) return bot.sendMessage(chat, `Вы уже и так отдыхаете, куда больше?`, {reply_to_message_id: msg.message_id});
  if (status && status.indexOf('Нужно заниматься') > -1) {
    await bot.sendMessage(chat, `Cегодня брать отгул нельзя`, {reply_to_message_id: msg.message_id});
  } else {
    console.log(`${username} can take day off, changing index to 1`);
    await switchNotification(username, true, 1);
    await bot.sendMessage(chat, `Cегодня отдыхаете`, {reply_to_message_id: msg.message_id});
  }
}

async function sendStatus(msg) {
  const username = msg.from.username;
  let status = false;
  alumni_list.forEach(alumni => {
    if (alumni[0].indexOf(username) > -1) {
      status = alumni[8];
    }
  });
  if (!status) return await bot.sendMessage(chat, `Статусы есть только у выпускников`, {reply_to_message_id: msg.message_id});
  return await bot.sendMessage(chat, `${status}`, {reply_to_message_id: msg.message_id});
}

async function checkReminders() {
  const londonHours = Number(new Date().toUTCString().slice(17, 19)) + 1;
  const londonMinutes = Number(new Date().toUTCString().slice(20, 22));
  let usersToRemind = '';
  /** Check participants */
  if (participants_list.length < 1 || alumni_list.length < 1) return console.log(`participants and alumnis lists is empty`);
  participants_list.forEach(async (participant) => {
    const timeZone = Number(participant[12]);
    const userTime = londonHours + timeZone;
    const isTimeToRemind = userTime === 22 && londonMinutes >= 0 && londonMinutes < 10;
    console.log(`current time for participant ${participant[0]} is ${userTime}, notification: ${participant[14]}`);
    if (Number(participant[14]) === 1 && userTime === 0) {
      console.log(`reset notification flag for ${participant[0]}. New day has come.`);
      return await switchNotification(participant[0], false, 0);
    }
    if (!isTimeToRemind) return;

    const day = Number(participant[2]);
    const week = Math.floor(day / 7);
    const trainingsRequired = day % 7;
    const finishedTrainings = Number(participant[3 + week]);

    if (finishedTrainings < trainingsRequired + 1) {
      usersToRemind += `${participant[0]}, `;
      console.log(`Noticing ${participant[0]}, should switch notification flag to 1`);
      await switchNotification(participant[0], false, 1);
    }
  });
  /** Check alumni */
  alumni_list.forEach(async (alumni) => {
    const alumniObj = {
      username: alumni[0],
      timeToRemind: Number(alumni[3]),
      timezone: Number(alumni[6]),
      status: alumni[8],
      notification: Number(alumni[9])
    };

    let userHours = londonHours + alumniObj.timezone;
    if (userHours >= 24) userHours -= 24;

    const rightTime = alumniObj.timeToRemind|| 22;
    const isTimeToRemind = (userHours === rightTime) && (londonMinutes >= 0) && (londonMinutes < 10);

    console.log(`current time for participant ${alumniObj.username} is ${userHours}, notification: ${alumniObj.notification}`);
    if (alumniObj.notification === 1 && userHours === 0) {
      console.log(`reset notification flag for alumni ${alumniObj.username}. New day has come.`);
      return await switchNotification(alumniObj.username, true, 0);
    }
    if (!isTimeToRemind) return;
    if (!alumniObj.status || alumniObj.status.length === 0) return; // no status, not active alumni user
    if (alumniObj.status.indexOf('Нужно отдохнуть') === -1) {
      usersToRemind += `${alumniObj.username}, `;
      console.log(`Noticing alumni ${alumniObj.username}. Should switch to 1.`);
      await switchNotification(alumniObj.username, true, 1);
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
    if (participants_list[i][0].indexOf(username) > -1) {
      user = participants_list[i];
      userType = 'participant';
      break
    }
  }
  if (!user) {
    for (let i = 0 ; i < alumni_list.length ; i++) {
      if (alumni_list[i][0].indexOf(username) > -1) {
        user = alumni_list[i];
        userType = 'alminu';
        break
      }
    }
  }
  if (!user) return;
  let noticed = 1;
  if (userType === 'participant') {
    noticed = Number(user[14])
  } else {
    noticed = Number(user[9])
  }

  if (noticed === 1) return;

  if (userType === 'participant') {
    await bot.sendMessage(chat, '@borodutch аппрувим? 💪🏻', {
      reply_to_message_id: msg.message_id,
      reply_markup: { inline_keyboard: [[
        { text: 'Любо 👍🏻', callback_data: `y~${msg.from.username}~p` },
        { text: 'Такое 🌮', callback_data: `n~${msg.from.username}~p` }
      ]]}
    })
  } else {
    await bot.sendMessage(chat, 'Аппрувим? 💪🏻', {
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
    console.log(`Adding training for alumni ${username}. Should change to 1.`);
    await switchNotification(username, true, 1, userIndex);
    await updateUsersSheet(5, userIndex, Number(user[5]) + 1, isAlumni);
  } else {
    participants_list.forEach((a, i) => { if (a[0].indexOf(username) > -1) userIndex = i });
    if (userIndex === -1) return;
    const user = participants_list[userIndex];
    console.log(`Adding training for participant ${username}. Should change to 1.`);
    await switchNotification(username, false, 1, userIndex);
    for (let i = 3; i < 11; i++) {
      if (user[i] < 6) return await updateUsersSheet(i, userIndex, Number(user[i]) + 1, isAlumni);
    }
  }
}

async function switchNotification(username, isAlumni, value, userIndex=-1) {
  let column;
  if (userIndex === -1) {
    if (isAlumni) {
      for (let i = 0; i < alumni_list; i++) if (alumni_list[i][0].indexOf(username) > -1) { userIndex = i; break }
    } else {
      for (let i = 0; i < participants_list; i++) if (participants_list[i][0].indexOf(username) > -1) { userIndex = i; break }
    }
  }
  if (isAlumni) column = 9;
  else column = 14;

  console.log(`switchNotification(${username}, ${isAlumni}, ${value}, ${userIndex}) + column ${column}\n`);

  if (userIndex === -1) return console.log(`Can not find user ${username} on the lists while switchNotification`);

  await updateUsersSheet(column, userIndex, 1, isAlumni)
}
