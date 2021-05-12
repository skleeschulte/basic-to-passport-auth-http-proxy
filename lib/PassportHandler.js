const axios = require('axios');
const AuthHeader = require('./AuthHeader');
const PassportError = require('./PassportError');
const parsePassportParameters = require('./parsePassportParameters');
const log = require('./log');

/**
 * Configuration server URL.
 * https://docs.microsoft.com/en-us/openspecs/windows_protocols/ms-pass/89f68e68-85cd-441f-8eac-f9f2504ee013#Appendix_A_1
 * @define {string}
 */
const CONFIGURATION_SERVER_URL = process.env.CONFIGURATION_SERVER_URL || 'https://nexus.passport.com/rdr/pprdr.asp';

/**
 * Class for handling Passport 1.4 authentication.
 */
class PassportHandler {
    /**
     * RFC3986 compliant encodeURIComponent function. It does encode commas (',').
     * Source: https://developer.mozilla.org/de/docs/Web/JavaScript/Reference/Global_Objects/encodeURIComponent
     *
     * @param {string}  string  URI component to encode.
     * @returns {string} Encoded URI component.
     */
    static encodeURIComponentRFC3986(string) {
        return encodeURIComponent(string).replace(/[!'()*]/g, (c) => '%' + c.charCodeAt(0).toString(16));
    }

    /**
     * Check if a partner server response is as Partner Server Challenge Message.
     * https://docs.microsoft.com/en-us/openspecs/windows_protocols/ms-pass/cb1d13b5-55b5-4531-b57a-d1d36d22c31a
     *
     * @param {number}      statusCode          HTTP status code.
     * @param {AuthHeader}  authenticateHeader  Parsed WWW-Authenticate header.
     * @returns {boolean} Boolean indicating if the response is a Partner Server Challenge Message.
     */
    static isPartnerServerChallengeMessage(statusCode, authenticateHeader) {
        if (!(statusCode === 302 || statusCode === 401)) {
            return false;
        }

        return authenticateHeader.isPassport14;
    }

    /**
     * Extract challenge from Partner Server Challenge Message auth param.
     * https://docs.microsoft.com/en-us/openspecs/windows_protocols/ms-pass/cb1d13b5-55b5-4531-b57a-d1d36d22c31a
     *
     * @param {string}  authParam  Partner Server Challenge Message auth param.
     * @returns {string} Challenge for Sign-in Request Message.
     */
    static extractChallengeFromAuthParam(authParam) {
        const [, challenge = ''] = authParam.match(/^(.*?)(,\s*Negotiate2SupportedIf=.*)?$/i) || [];
        return challenge;
    }

    /**
     * Initialize a new PassportHandler instance.
     *
     * @param {PassportSession}  passportSession  The PassportSession instance associated with the current request.
     * @param {LoginSession}     loginSession     LoginSession for current user.
     * @param {string}           username         Username for Passport login.
     * @param {string}           password         Password for Passport login.
     * @param {string}           requestId        Request ID for logging.
     */
    constructor(passportSession, loginSession, username, password, requestId) {
        this.passportSession = passportSession;
        this.loginSession = loginSession;
        this.username = username;
        this.password = password;
        this.requestId = requestId;

        this.logd = this.logd.bind(this);
        this.getClient = this.getClient.bind(this);
        this.getAuthenticationServerUrl = this.getAuthenticationServerUrl.bind(this);
        this.updatePassportConfiguration = this.updatePassportConfiguration.bind(this);
        this.handlePartnerServerChallengeMessage = this.handlePartnerServerChallengeMessage.bind(this);
        this.sendTokenRequestMessage = this.sendTokenRequestMessage.bind(this);
        this.sendSignInRequestMessage = this.sendSignInRequestMessage.bind(this);
        this.sendAuthorizationRequestMessage = this.sendAuthorizationRequestMessage.bind(this);
        this.handleAuthenticationServerResponse = this.handleAuthenticationServerResponse.bind(this);
        this.sendFirstAuthenticatedRequestMessage = this.sendFirstAuthenticatedRequestMessage.bind(this);
    }

    /**
     * Log debug message.
     *
     * @param {string}  message  Message.
     */
    logd(message) {
        log.d(`[${this.requestId}] PassportHandler: ${message}`);
    }

    /**
     * Returns an instance of the Axios HTTP client that only throws if the status code is greater than or equal to 500
     * and does not follow redirects.
     *
     * @returns {AxiosInstance}
     */
    getClient() {
        const client = this.httpClient || (this.httpClient = axios.create({
            maxRedirects: 0,
            validateStatus: (status) => status < 500,
        }));

        return client;
    }

    /**
     * Get the authentication server URL. If necessary, fetches the URL from the configuration server.
     *
     * @returns {Promise<string>}
     */
    async getAuthenticationServerUrl() {
        if (!this.passportSession.passportConfigurationData) {
            await this.updatePassportConfiguration();
        }

        let authenticationServerUrl;
        try {
            authenticationServerUrl = new URL(this.passportSession.passportConfigurationData['DALogin']).toString();
        } catch (e) {
            authenticationServerUrl =
                new URL('https://' + this.passportSession.passportConfigurationData['DALogin']).toString();
        }

        return authenticationServerUrl;
    }

    /**
     * Get passport configuration from configuration server.
     * https://docs.microsoft.com/en-us/openspecs/windows_protocols/ms-pass/af8b25e3-f8e1-49fd-935d-1a72979d26dd
     * https://docs.microsoft.com/en-us/openspecs/windows_protocols/ms-pass/e8270513-8223-452c-948c-5189f75e3744
     *
     * @param configVersion
     * @returns {Promise<void>}
     */
    async updatePassportConfiguration(configVersion) {
        try {
            const localConfigVersion = parseInt(this.passportSession.passportConfigurationData['ConfigVersion'], 10);
            const serverConfigVersion = parseInt(configVersion, 10);

            if (localConfigVersion >= serverConfigVersion) {
                this.logd('Local Passport Configuration is up-to-date, skipping update');

                return;
            }
        } catch (e) {
            // could not compare versions -> request update
        }

        const client = this.getClient();

        this.logd('Requesting Passport Configuration Update from ' + CONFIGURATION_SERVER_URL);

        const res = await client.get(CONFIGURATION_SERVER_URL);

        if (!res.headers['passporturls']) {
            throw new PassportError('Could not get passport configuration from configuration server.');
        }

        this.passportSession.passportConfigurationData =
            parsePassportParameters(res.headers['passporturls']);
    }

    /**
     * Handle Partner Server Challenge Message.
     * https://docs.microsoft.com/en-us/openspecs/windows_protocols/ms-pass/cb1d13b5-55b5-4531-b57a-d1d36d22c31a
     * https://docs.microsoft.com/en-us/openspecs/windows_protocols/ms-pass/52c01920-8b04-4a04-a505-07ac7d3a37d8
     *
     * @param {AuthHeader}  authenticateHeader  Parsed WWW-Authenticate header.
     * @param {string}      orgVerb             HTTP verb of the original request.
     * @param {string}      orgUrl              URL of the original request.
     * @returns {Promise<{}>} Promise that resolves to the parameters of a Token Response Message.
     */
    async handlePartnerServerChallengeMessage(authenticateHeader, orgVerb, orgUrl) {
        if (this.passportSession.sentFirstAuthenticatedRequest) {
            throw new PassportError('Received Partner Server Challenge Message after a First Authenticated Request was'
                + ' sent.');
        }

        this.partnerChallenge = PassportHandler.extractChallengeFromAuthParam(authenticateHeader.param);
        this.passportSession.originalHttpVerb = orgVerb;
        this.passportSession.originalHttpUrl = orgUrl;

        return this.sendTokenRequestMessage();
    }

    /**
     * Send Token Request Message to authentication server.
     * https://docs.microsoft.com/en-us/openspecs/windows_protocols/ms-pass/2df2e9e6-bfc1-4143-a7e4-64034382e61b
     *
     * @returns {Promise<{}>} Promise that resolves to the parameters of a Token Response Message.
     */
    async sendTokenRequestMessage() {
        this.logd('Sending Token Request Message');

        return this.sendAuthorizationRequestMessage(
            'Passport1.4 '
            + 'tname='
            + ',OrgVerb=' + this.passportSession.originalHttpVerb
            + ',OrgUrl=' + this.passportSession.originalHttpUrl.replace(',', '%2C')
            + (this.partnerChallenge ? ',' + this.partnerChallenge : ''),
            undefined,
            true, // addCookies
        );
    }

    /**
     * Send Sign-in Request Message to authentication server.
     * https://docs.microsoft.com/en-us/openspecs/windows_protocols/ms-pass/bd678e19-bc40-478e-ac2e-dbd2c654605d
     *
     * @param {string}  [customtoken]  Custom token received in the Authentication Server Challenge Message.
     * @returns {Promise<{}>} Promise that resolves to the parameters of a Token Response Message.
     */
    async sendSignInRequestMessage(customtoken) {
        if (!this.username || !this.password) {
            throw new PassportError('Username and/or password missing.', 401);
        }

        this.logd('Sending Sign-in Request Message');

        this.passportSession.signInAttempts += 1;

        return this.sendAuthorizationRequestMessage(
            'Passport1.4 '
            + 'sign-in=' + PassportHandler.encodeURIComponentRFC3986(this.username)
            + ',pwd=' + PassportHandler.encodeURIComponentRFC3986(this.password)
            + ',elapsed-time=0'
            + ',OrgVerb=' + this.passportSession.originalHttpVerb
            + ',OrgUrl=' + this.passportSession.originalHttpUrl.replace(',', '%2C')
            + (customtoken ? ',' + customtoken : '')
            + (this.partnerChallenge ? ',' + this.partnerChallenge : ''),
        );
    }

    /**
     * Send authorization request to authentication server.
     *
     * @param {string}   requestMessage  The request message for the Authorization header.
     * @param {string}   [url]           Optional different authentication server url.
     * @param {boolean}  [addCookies]    Whether to add cookies to the request.
     * @returns {Promise<{}>} Promise that resolves to the parameters of a Token Response Message.
     */
    async sendAuthorizationRequestMessage(requestMessage, url, addCookies) {
        const authenticationServerUrl = url || await this.getAuthenticationServerUrl();

        this.logd('Authentication Server URL: ' + authenticationServerUrl);

        const client = this.getClient();

        this.passportSession.lastSignInRequest = requestMessage;

        const config = { headers: { Authorization: requestMessage } };

        if (addCookies) {
            config.headers.Cookie = this.loginSession.getPassportCookieString();
        }

        const res = await client.get(authenticationServerUrl, { headers: { Authorization: requestMessage } });

        return this.handleAuthenticationServerResponse(res);
    }

    /**
     * Handle response from authentication server.
     *
     * @param {http.IncomingMessage}  res  HTTP response from authentication server.
     * @returns {Promise<{}>} Promise that resolves to the parameters of a Token Response Message.
     */
    async handleAuthenticationServerResponse(res) {
        this.logd('Handling Authentication Server Response');

        if (res.headers['passportconfig']) {
            const parameters = parsePassportParameters(res.headers['passportconfig']);

            if (parameters['ConfigVersion']) {
                // Authentication Server-Instructed Update Message
                // https://docs.microsoft.com/en-us/openspecs/windows_protocols/ms-pass/7c043951-88d6-4802-b46a-e6986610d473

                this.logd('Got Authentication Server-Instructed Update Message');

                await this.updatePassportConfiguration(parameters['ConfigVersion']);
            }
        }

        const authInfoHeader = new AuthHeader(res.headers['authentication-info']);

        if (authInfoHeader.isPassport14) {
            if (authInfoHeader.parameters['da-status'] === 'success') {
                // Token Response Message
                // https://docs.microsoft.com/en-us/openspecs/windows_protocols/ms-pass/0df08329-936b-4eb2-ac06-41edeaba13a4

                this.logd('Got Token Response Message');

                return this.sendFirstAuthenticatedRequestMessage(
                    authInfoHeader.parameters['from-PP'],
                    authInfoHeader.parameters['ru'],
                );
            }

            if (authInfoHeader.parameters['da-status'] === 'redir'
                && res.statusCode === 302 && res.headers['location']) {
                // Authentication Server Redirect Message
                // https://docs.microsoft.com/en-us/openspecs/windows_protocols/ms-pass/0791ba10-e167-4208-a380-f5fccb3e88ed

                this.logd('Got Authentication Server Redirect Message');

                return this.sendAuthorizationRequestMessage(
                    this.passportSession.lastSignInRequest,
                    res.headers['location'],
                );
            }

            if (authInfoHeader.parameters['da-status'] === 'logout') {
                // Authentication Server Logout Message
                // https://docs.microsoft.com/en-us/openspecs/windows_protocols/ms-pass/0a4a6995-11d0-44b9-be42-a59ca95a3905

                this.logd('Got Authentication Server Logout Message');

                this.loginSession.removeAllCookies();
            }
        }

        const authenticateHeader = new AuthHeader(res.headers['www-authenticate']);

        if (res.status === 401 && authenticateHeader.isPassport14) {
            // Authentication Server Challenge Message
            // https://docs.microsoft.com/en-us/openspecs/windows_protocols/ms-pass/a059aaaf-2d4a-40c6-ad96-7175c379ffd7

            this.logd('Got Authentication Server Challenge Message');

            let errorMessage = null;

            if (authenticateHeader.parameters['da-status'] === 'failed-noretry') {
                errorMessage = 'Authentication server response contained da-status=failed-noretry';
            }

            // According to
            // https://docs.microsoft.com/en-us/openspecs/windows_protocols/ms-pass/f0671546-ad2a-441f-bab5-d5299796d29b
            // srealm and DARealm shall be checked for equality. In practice, https://nexus.passport.com/rdr/pprdr.asp
            // and https://login.live.com/login2.srf return srealm and DARealm with different letter cases. So do a best
            // effort approach and compare lower case values.
            if (authenticateHeader.parameters['srealm'].toLowerCase()
                    !== this.passportSession.passportConfigurationData['DARealm'].toLowerCase()) {
                errorMessage = 'Authentication server realm does not equal realm in passport configuration data';
            }

            if (errorMessage) {
                // According to the specification
                // (https://docs.microsoft.com/en-us/openspecs/windows_protocols/ms-pass/f0671546-ad2a-441f-bab5-d5299796d29b),
                // the HTTP response code should be 401. But for da-status='failed-noretry' or unequal realms, HTTP
                // status 403 Forbidden is more appropriate, because the client cannot change the condition by supplying
                // any user credentials.
                throw new PassportError(errorMessage, 403, res.data);
            }

            if (authenticateHeader.parameters['da-status'] === 'failed') {
                if (this.passportSession.signInAttempts > 0) {
                    throw new PassportError(errorMessage, 401, res.data);
                }

                const customtokenName = Object.keys(authenticateHeader.parameters).filter(
                    (v) => ['da-status', 'srealm', 'prompt', 'cburl', 'cbtxt'].indexOf(v) === -1,
                )[0];
                const customtokenValue = authenticateHeader.parameters[customtokenName];

                const customtoken = customtokenName
                    + ((typeof customtokenValue === 'string') ? '=' + customtokenValue : '');

                return this.sendSignInRequestMessage(customtoken);
            }
        }

        throw new PassportError('Received an unexpected response from authentication server');
    }

    /**
     * Send First Authenticated Request message to Partner Server.
     *
     * @param {string}  fromPP  First Authenticated Request token.
     * @param {string}  ru      Redirect URL for First Authenticated Request.
     * @returns {Promise<boolean>} Promise that resolves to true if the Partner Server answers with a Set Token Message.
     */
    async sendFirstAuthenticatedRequestMessage(fromPP, ru) {
        const firstAuthenticatedRequestMessage = 'Passport1.4 from-PP=' + fromPP;

        const client = this.getClient();

        this.logd('Sending First Authenticated Request Message');

        const res = await client.get(ru, { headers: { Authorization: firstAuthenticatedRequestMessage } });

        if (res.headers['set-cookie']) {
            this.loginSession.setPassportCookies(res.headers['set-cookie']);

            return true;
        }

        throw new PassportError('Did not receive Set Token Message after First Authenticated Request Message');
    }
}

module.exports = PassportHandler;
