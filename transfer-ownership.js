/** Require dependencyes */
const google = require('googleapis');
const drive = google.drive('v3');

const config = require('./config');

let jwtClient = new google.auth.JWT(config.google.client_email, null, config.google.private_key, ['https://www.googleapis.com/auth/drive']);

const fileId = '1S2PWFRuwAghucQrC6VuoMNY1e7uCQQS1QyGq0mYEPh8';
const permissions = [
  {
    'type': 'user',
    'role': 'writer',
    'emailAddress': 'blendamedkiba94@gmail.com'
  }
];

/** Authorize */
jwtClient.authorize(async (err) => {
  if (err) throw new Error(`Authorisation error:\n${err}`);
  console.log(`Authorized`);
  await changeOwner();
});

async function changeOwner() {
  drive.permissions.create({resource: permissions, fileId: fileId, fields: 'id', auth: jwtClient}, function (err, res) {
    if (err) return console.error(`error while pushing ownership transit request` +err);
    console.log('Permission ID: ', res.id)
  });
}
