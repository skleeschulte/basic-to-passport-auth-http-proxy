/**
 * http-proxy's web outgoing pipeline is not exported, but grabbing it directly works:
 * @type {{}}
 */
const httpProxyWebOutgoing = require('http-proxy/lib/http-proxy/passes/web-outgoing');

/**
 * Crate an array from the object that defines the outgoing passes.
 * Adapted from: https://github.com/http-party/node-http-proxy/blob/1.17.0/lib/http-proxy/passes/web-incoming.js#L7-L9
 * @type {*[]}
 */
const httpProxyWebOutgoingPasses = Object.keys(httpProxyWebOutgoing).map((pass) => httpProxyWebOutgoing[pass]);

/**
 * This function handles proxy responses in the same way as http-proxy does when selfHandleResponse is not set to true
 * in the proxy options.
 * Also see: https://github.com/http-party/node-http-proxy/issues/1263
 *
 * @param {http.IncomingMessage}  proxyRes  HTTP response received by the proxy server
 * @param {http.IncomingMessage}  req       HTTP request from the client
 * @param {http.ServerResponse}   res       HTTP response to the client
 * @param {object}                options   Proxy server options
 */
function handleResponseWithHttpProxy(proxyRes, req, res, options) {
    // Adapted from:
    // https://github.com/http-party/node-http-proxy/blob/1.17.0/lib/http-proxy/passes/web-incoming.js#L173-L177
    if (!res.headersSent) {
        for (let i = 0; i < httpProxyWebOutgoingPasses.length; i += 1) {
            if (httpProxyWebOutgoingPasses[i](req, res, proxyRes, options)) {
                break;
            }
        }
    }

    // Adapted from:
    // https://github.com/http-party/node-http-proxy/blob/1.17.0/lib/http-proxy/passes/web-incoming.js#L179-L186
    if (!res.finished) {
        proxyRes.pipe(res);
    }
}

module.exports = handleResponseWithHttpProxy;
