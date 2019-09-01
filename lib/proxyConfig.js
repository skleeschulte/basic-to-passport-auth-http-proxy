const log = require('./log');
const URL = require('url').URL;

/**
 * Get proxy target from env.
 */
const target = process.env.PROXY_TARGET;
if (!target) {
    log.e('PROXY_TARGET environment variable is not set.');
    process.exit(1);
}
try {
    new URL(target); // eslint-disable-line no-new
} catch (e) {
    log.e('The value provided in the PROXY_TARGET environment variable is not a valid url.');
    process.exit(1);
}

/**
 * http-proxy configuration object
 * @type {{}}
 */
module.exports = {
    target,
    changeOrigin: true,           // rewrite Origin HTTP header
    preserveHeaderKeyCase: true,  // preserve letter case of HTTP response headers
    autoRewrite: true,            // rewrite the Location header url in redirect responses based on the Host header of
                                  // the request (this rewrites hostname and port)
    protocolRewrite: 'http',      // rewrite the Location header url in redirect responses to http protocol
    cookieDomainRewrite: '',      // TODO: Is better cookie rewriting necessary, including secure flag and path?
    selfHandleResponse: true,     // handle proxy response ourselves
};
