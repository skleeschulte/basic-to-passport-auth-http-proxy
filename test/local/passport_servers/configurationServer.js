const http = require('http');
const config = require('./config');

const server = http.createServer((req, res) => {
    const configurationData = 'DARealm=PassportTest'
        + `,DALogin=${config.AUTHENTICATION_SERVER_URL}`
        + ',DAReg=https://error.localhost/'
        + ',Properties=https://editprofile.localhost/'
        + ',Privacy=https://privacy.localhost/'
        + ',GeneralRedir=https://generalredir.localhost/'
        + ',Help=https://help.localhost/'
        + ',ConfigVersion=1';

    res.setHeader('PassportURLs', configurationData);
    res.writeHead(200);
    res.end();
});

module.exports = server;
