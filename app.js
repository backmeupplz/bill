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
const chat = 76104711;
const spreadsheetId = '1g75OIJGOqvZveIReuurPtDY-Yau39PBcMQ6qrTlFddE';

// let bot = new TelegramBot(token, {polling: true});

let authorized = false;
let sheet = [];

// Authorize
jwtClient.authorize((err, tokens) => {
  authorized = true;
  start();
});

async function start() {
  await addTrainingToUser('borodutch');
}

// bot.on('message', (msg) => {
//     const chatId = msg.chat.id;

//     const isRightChat = msg.chat.id == chat;
//     const isPhoto = !!msg.photo;

//     if ((!isRightChat && !isPhoto) || !authorized) return;

//     console.log(msg);
//     bot.sendMessage(chatId, 'Received your message');

// bot.sendChatAction(chat, 'typing');
// });

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