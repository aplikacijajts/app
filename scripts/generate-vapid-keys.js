const path = require('path');

let webPush;
try {
  webPush = require('web-push');
} catch (primaryError) {
  try {
    webPush = require(path.join(__dirname, '..', 'vendor', 'node_modules', 'web-push'));
  } catch (vendorError) {
    console.error('The bundled web-push dependency is missing.');
    process.exit(1);
  }
}

const keys = webPush.generateVAPIDKeys();
console.log('Add these values to Render Environment Variables:');
console.log(`VAPID_PUBLIC_KEY=${keys.publicKey}`);
console.log(`VAPID_PRIVATE_KEY=${keys.privateKey}`);
console.log('VAPID_SUBJECT=mailto:dispatch@jtslogistics.com');
