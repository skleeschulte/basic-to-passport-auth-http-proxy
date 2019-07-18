const http = require('http');
const tough = require('tough-cookie');
const { assert } = require('chai');
const AuthHeader = require('../../../lib/AuthHeader');
const config = require('./config');
const { getContent } = require('./users');

// eslint-disable-next-line consistent-return
const server = http.createServer((req, res) => {
    if (req.headers.cookie) {
        const cookieHeaders = Array.isArray(req.headers.cookie) ? req.headers.cookie : [req.headers.cookie];
        const cookies = cookieHeaders.map(cookieHeader => tough.Cookie.parse(cookieHeader));
        const authCookie = cookies.filter(cookie => cookie.key === 'auth')[0];

        if (authCookie && authCookie.value === req.url) {
            return res.end(getContent(req.url));
        }
    }

    const authorizationHeader = new AuthHeader(req.headers.authorization);

    assert.strictEqual(authorizationHeader.isBasic, false,
        'Proxy sent a Basic authorization header to the partner server');

    if (authorizationHeader.isPassport14 && authorizationHeader.parameters['from-PP']) {
        res.setHeader('Set-Cookie', 'auth=' + authorizationHeader.parameters['from-PP']);
        return res.end();
    }

    res.setHeader('Location', 'https://login.localhost/');
    res.setHeader('WWW-Authenticate',
        `Passport1.4 resource=${req.url},ru=${config.PARTNER_SERVER_URL}`);
    res.writeHead(302);
    res.end();
});

module.exports = server;
