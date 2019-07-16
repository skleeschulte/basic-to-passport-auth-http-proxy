const parsePassportParameters = require('./parsePassportParameters');

/**
 * Class for parsing HTTP auth headers (e.g. WWW-Authenticate or Authentication-Info).
 */
class AuthHeader {
    /**
     * Parse Basic auth header param.
     *
     * @param {string}  param  Param from Basic auth header.
     * @returns {{password: string, username: string}} Object with user credentials.
     */
    static parseBasicAuthParam(param) {
        const decoded = Buffer.from(param, 'base64').toString();
        const colonPos = decoded.indexOf(':');

        return {
            username: decoded.substr(0, colonPos) || decoded,
            password: (colonPos !== -1) ? decoded.substr(colonPos + 1) : '',
        };
    }

    /**
     * Initialize a new AuthHeader instance.
     *
     * @param {string}  headerValue  HTTP header value.
     */
    constructor(headerValue = '') {
        const firstSpacePos = headerValue.indexOf(' ');

        this.scheme = headerValue.substr(0, firstSpacePos) || headerValue;
        this.param = (firstSpacePos !== -1) ? headerValue.substr(firstSpacePos + 1).trim() : '';

        this.lowerCaseScheme = this.scheme.toLowerCase();

        this.isBasic = this.lowerCaseScheme === 'basic';
        this.isPassport14 = this.lowerCaseScheme === 'passport1.4';

        if (this.isBasic) {
            this.credentials = AuthHeader.parseBasicAuthParam(this.param);
        }

        if (this.isPassport14) {
            this.parameters = parsePassportParameters(this.param);
        }
    }
}

module.exports = AuthHeader;
