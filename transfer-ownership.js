/** Require dependencyes */
const google = require('googleapis');
const drive = google.drive('v3');

const config = require('./config');

let jwtClient = new google.auth.JWT(config.google.client_email, null, config.google.private_key, ['https://www.googleapis.com/auth/drive']);

/** Authorize */
jwtClient.authorize(async (err) => {
  if (err) throw new Error(`Authorisation error:\n${err}`);
  console.log(`Authorized`);
  await createPermissions();
});

const fileId = '1g75OIJGOqvZveIReuurPtDY-Yau39PBcMQ6qrTlFddE';
const permission = {
  type: 'user',
  role: 'owner',
  emailAddress: 'backmeupplz@gmail.com'
};

async function createPermissions() {
  drive.permissions.create({
    transferOwnership: true,
    resource: permission,
    fileId: fileId,
    auth: jwtClient,
  }, function (err, res) {
    if (err) return console.error(`error while transfering ownership:\n${JSON.stringify(err, undefined, 2)}`);
    console.log(`Ownership transfered.\n${JSON.stringify(res, undefined, 2)}`)
  });
}
