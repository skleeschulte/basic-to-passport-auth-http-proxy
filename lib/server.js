const httpProxy = require('http-proxy');
const http = require('http');
const getRequestUrl = require('get-request-url');
const AuthHeader = require('./AuthHeader');
const LoginSession = require('./LoginSession');
const LoginSessionStore = require('./LoginSessionStore');
const PassportSession = require('./PassportSession');
const PassportHandler = require('./PassportHandler');
const PassportError = require('./PassportError');
const RequestBodyCache = require('./RequestBodyCache');
const proxyConfig = require('./proxyConfig');
const handleResponseWithHttpProxy = require('./handleResponseWithHttpProxy');
const log = require('./log');

/**
 * Save script start time to shorten timestamps in debug messages.
 * @type {number}
 */
const scriptStart = Date.now();

/**
 * Initialize the LoginSessionStore.
 * @type {LoginSessionStore}
 */
const loginSessionStore = new LoginSessionStore();

/**
 * Create the http-proxy server.
 */
const proxy = httpProxy.createProxyServer(proxyConfig);

/**
 * Modify client request and options before http-proxy's stream pass of the incoming pipeline:
 *  - Remove HTTP Expect header. If an Expect header is added to the proxy request object, HTTP headers are sent
 *    immediately, preventing header modifications in the proxyReq event hook. The header is added back after header
 *    modifications are complete.
 *  - Cache the request body and set the cache as buffer in http-proxy's options so request can be repeated after
 *    successful authentication.
 */
proxy.before('web', 'stream', (req, res, options) => {
    // Generate a request id for debug messages - timestamp + random nr from 1000 to 9999 should do for this purpose
    if (!req.__requestId) {
        req.__requestId = '' + (Date.now() - scriptStart) + '/' + (Math.floor(Math.random() * 8999) + 1000);

        log.d(`[${req.__requestId}] Client request: ${req.method} ${req.url}`);

        if (log.t.enabled) {
            log.t(`[${req.__requestId}]    ${req.method} ${req.url} HTTP/${req.httpVersion}`);
            for (let i = 0; i < req.rawHeaders.length - 1; i += 2) {
                log.t(`[${req.__requestId}]    ${req.rawHeaders[i]}: ${req.rawHeaders[i + 1]}`);
            }
        }
    }

    if (req.headers.expect) {
        log.d(`[${req.__requestId}] Removing Expect header from client request`);

        req.__expectHeader = req.headers.expect;
        delete req.headers.expect;
    }

    if (!req.__bodyCache) {
        req.__bodyCache = new RequestBodyCache(req);
    }

    options.buffer = req.__bodyCache;
});

/**
 * Add additional variables to the req object and modify the proxy request:
 *  - Remove any Authorization header that was supplied by the client.
 *  - Add cookies from the LoginSession to the request.
 */
proxy.on('proxyReq', (proxyReq, req /*, res, options*/) => {
    const rId = req.__requestId;

    if(!req.__passportSession) {
        log.d(`[${rId}] Creating new PassportSession`);
        req.__passportSession = new PassportSession();
    }

    if (!req.__authorizationHeader) {
        req.__authorizationHeader = new AuthHeader(req.headers.authorization);

        if (req.__authorizationHeader.isBasic) {
            log.d(`[${rId}] Found Authorization header with Basic auth in client request`);

            req.__loginSession = loginSessionStore.getSession(
                req.__authorizationHeader.credentials.username,
                req.__authorizationHeader.credentials.password
            );

            if (req.__loginSession) {
                log.d(`[${rId}] Found session data for Basic auth credentials`);
            }
        }
    }

    // Never pass Authorization HTTP header from client to server
    if (proxyReq.getHeader('Authorization')) {
        log.d(`[${req.__requestId}] Removing Authorization header from proxy request`);

        proxyReq.removeHeader('Authorization');
    }

    if (req.__loginSession) {
        const cookieHeader = req.__loginSession.getPassportCookieString();

        if (cookieHeader) {
            log.d(`[${req.__requestId}] Adding cookies from LoginSession to proxy request`);

            const currentCookieHeader = proxyReq.getHeader('Cookie');
            proxyReq.setHeader('Cookie', cookieHeader + (currentCookieHeader ? '; ' + currentCookieHeader : ''));
        }
    }

    if (req.__expectHeader) {
        log.d(`[${rId}] Adding previously removed Expect header to proxy request`);

        proxyReq.setHeader('Expect', req.__expectHeader);
    }

    log.d(`[${req.__requestId}] Proxy request: ${proxyReq.method} ${proxyReq.path}`);

    if(log.t.enabled) {
        log.t(`[${req.__requestId}]    ${proxyReq.method} ${proxyReq.path} HTTP/1.1 (HTTP version is hardcoded)`);
        proxyReq.getHeaderNames().forEach(headerName => {
            const prettyHeaderName = headerName.replace(/(?:^|-)[a-z]/g, c => c.toUpperCase());
            log.t(`[${req.__requestId}]    ${prettyHeaderName}: ${proxyReq.getHeader(headerName)}`);
        });
    }
});

/**
 * Handle the proxy response: If it is a Passport 1.4 Partner Server Challenge Message, start the Passport
 * authentication process and if it succeeds, repeat the request with authorization. Otherwise just pass the request on
 * to http-proxy.
 */
proxy.on('proxyRes', async (proxyRes, req, res) => {
    log.d(`[${req.__requestId}] Server response: ${proxyRes.statusCode} ${proxyRes.statusMessage}`);

    if (log.t.enabled) {
        log.t(`[${req.__requestId}]    HTTP/${proxyRes.httpVersion} ${proxyRes.statusCode} ${proxyRes.statusMessage}`);
        for (let i = 0; i < proxyRes.rawHeaders.length - 1; i += 2) {
            log.t(`[${req.__requestId}]    ${proxyRes.rawHeaders[i]}: ${proxyRes.rawHeaders[i + 1]}`);
        }
    }

    const authenticateHeader = new AuthHeader(proxyRes.headers['www-authenticate']);

    if (PassportHandler.isPartnerServerChallengeMessage(proxyRes.statusCode, authenticateHeader)) {
        log.d(`[${req.__requestId}] Proxy server received Partner Server Challenge Message`);

        proxyRes.__requestUrl = getRequestUrl(proxyRes);

        let username, password;
        if (req.__authorizationHeader.isBasic) {
            username = req.__authorizationHeader.credentials.username;
            password = req.__authorizationHeader.credentials.password;
        }

        if (!username || !password) {
            sendResponse(proxyRes, req, res, 401, 'Username and/or password missing.');

            return;
        }

        // Use existing loginSession for currently authenticated user or create a fresh one.
        const loginSession = req.__loginSession || new LoginSession();

        const passportHandler = new PassportHandler(
            req.__passportSession,
            loginSession,
            username,
            password,
            req.__requestId
        );

        try {
            await passportHandler.handlePartnerServerChallengeMessage(
                authenticateHeader,
                proxyRes.req.method,
                proxyRes.__requestUrl.toString()
            );

            log.d(`[${req.__requestId}] Successfully completed Passport authentication process, repeating request with`
                + ` authorization information`);

            // If handlePartnerServerChallengeMessage did not throw an error, Passport authentication was successful.
            req.__loginSession = loginSession;
            loginSessionStore.storeSession(loginSession, username, password);

            if (req.__bodyCache.cacheOverflow) {
                // Cannot repeat request
                sendResponse(proxyRes, req, res, 503,
                    `Passport authentication was successfull, but the proxy server cannot repeat the original`
                        + ` client request with authorization because the client request body length exceeds the`
                        + ` request body cache size of ${RequestBodyCache.getMaxCacheSize()} KiB. Please repeat the`
                        + ` request.`);
            } else {
                // Repeat the request with authorization.
                proxy.web(req, res);
            }

            return;
        } catch(error) {
            if (error instanceof PassportError && (error.statusCode === 401 || error.statusCode === 403)) {
                sendResponse(proxyRes, req, res, error.statusCode, error.message, error.body);
            } else {
                log.e(error.message);
                sendResponse(proxyRes, req, res, 500, error.message);
            }

            return;
        }
    }

    sendResponse(proxyRes, req, res);
});

/**
 * Handle proxy errors
 */
proxy.on('error', (err, req, res) => {
    sendResponse(null, req, res, 500, err.message || '' + err);
});

/**
 * Send proxy response to client.
 *
 * @param {http.IncomingMessage}  proxyRes        Proxy server Response.
 * @param {http.ClientRequest}    req             Proxy client request.
 * @param {http.ServerResponse}   res             Proxy client response.
 * @param {number}                [statusCode]    Optional status code. If not set, response is handled with http-proxy.
 * @param {string}                [errorMessage]  Optional error message string.
 * @param {string}                [body]          Optional response body.
 */
function sendResponse(proxyRes, req, res, statusCode, errorMessage, body) {
    if (statusCode) {
        const level = (statusCode === 401) ? 'd' : 'e';
        log[level](`[${req.__requestId}] Sending error response: ${statusCode} ${errorMessage}`);

        if (errorMessage) {
            res.setHeader('X-Proxy-Error', errorMessage);
        }

        if (statusCode === 401) {
            res.setHeader('WWW-Authenticate', `Basic realm="${proxyRes.__requestUrl.host}"`);
        }

        if (statusCode === 503) {
            res.setHeader('Retry-After', '0');
        }

        if (body || errorMessage) {
            res.setHeader('Content-Type', 'text/plain');
        }

        res.writeHead(statusCode);
        res.end(body || errorMessage);

        return;
    }

    log.d(`[${req.__requestId}] Sending proxy response with http-proxy: ${proxyRes.statusCode}`
        + ` ${proxyRes.statusMessage}`);

    handleResponseWithHttpProxy(proxyRes, req, res, proxy.options);
}

/**
 * Create own HTTP server so the listening event can be logged.
 * @type {http.Server} HTTP server instance.
 */
const server = http.createServer((req, res) => proxy.web(req, res));
server.on('listening', () => {
    log(`Proxy server listening: %o`, server.address());
});
server.listen(process.env.PROXY_PORT || 3000);
