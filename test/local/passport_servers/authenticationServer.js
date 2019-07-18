const http = require('http');
const { assert } = require('chai');
const AuthHeader = require('../../../lib/AuthHeader');
const parsePassportParameters = require('../../../lib/parsePassportParameters');
const { getUserdata } = require('./users');

function send401(res) {
    res.setHeader('WWW-Authenticate', 'Passport1.4 da-status=failed,srealm=PassportTest,ctoken=abc');
    res.writeHead(401);
    res.end();
}

// eslint-disable-next-line consistent-return
const server = http.createServer((req, res) => {
    res.setHeader('PassportConfig', 'ConfigVersion=1');

    const authorizationHeader = new AuthHeader(req.headers.authorization);

    assert.strictEqual(authorizationHeader.isPassport14, true,
        'Authorization HTTP header is not Passport 1.4 header.');

    const {
        tname,
        'sign-in': usernameEnc,
        pwd: passwordEnc,
        'elapsed-time': elapsedTime,
        OrgVerb: orgVerb,
        OrgUrl: orgUrl,
        ctoken,
    } = authorizationHeader.parameters;

    if (!usernameEnc) {
        // Token Request Message
        assert.isString(tname, 'tname parameter is missing in Token Request Message');
        assert.isNotEmpty(orgVerb, 'OrgVerb parameter is missing in Token Request Message');
        assert.isNotEmpty(orgUrl, 'OrgUrl parameter is missing in Token Request Message');
        return send401(res);
    }

    const partnerServerChallenge = authorizationHeader.param.split(',ctoken=abc,')[1];

    assert.isNotEmpty(passwordEnc, 'pwd parameter is missing in Sign-in Request Message');
    assert.isNotEmpty(elapsedTime, 'elapsed-time parameter is missing in Sign-in Request Message');
    assert.isNotEmpty(orgVerb, 'OrgVerb parameter is missing in Sign-in Request Message');
    assert.isNotEmpty(orgUrl, 'OrgUrl parameter is missing in Sign-in Request Message');
    assert.isNotEmpty(ctoken, 'customtoken parameter is missing in Sign-in Request Message');
    assert.isNotEmpty(partnerServerChallenge, 'Partner Server Challenge is missing in Sign-in Request Message');

    const username = decodeURIComponent(usernameEnc);
    const password = decodeURIComponent(passwordEnc);
    const userdata = getUserdata(username);

    if (!userdata || userdata.password !== password) {
        return send401(res);
    }

    const challengeParameters = parsePassportParameters(partnerServerChallenge);

    if (userdata.directory !== challengeParameters['resource']) {
        return send401(res);
    }

    res.setHeader('Authentication-Info', 'Passport1.4 da-status=success'
        + `,from-PP=${userdata.directory},ru=${challengeParameters['ru']}`);
    res.end();
});

module.exports = server;
