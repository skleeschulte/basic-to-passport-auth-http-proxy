const tough = require('tough-cookie');

/**
 * The cookieJar from tough-cookie separates cookies depending on the url. For Passport authentication, the same cookies
 * have to be passed to different servers, so we use a fictional URL for all Passport cookies.
 * Due to some strange behaviour of tough-cookie, setting rejectPublicSuffixes to false leads to synchronous functions
 * not being accessible anymore (see https://github.com/salesforce/tough-cookie/issues/165). So we use a fictional
 * public domain here.
 * @type {string}
 */
const PASSPORT_COOKIE_URL = 'https://localpassportcookiesstore-pl8q2i8k0j69autiip51.com/';

/**
 * Holds login session specific data.
 */
class LoginSession {
    /**
     * Initialize a new LoginSession instance.
     */
    constructor() {
        this.passwordHash = null;
        // this.cookieJar = new tough.CookieJar({ rejectPublicSuffixes: false }); // leads to sync functions not working
        this.cookieJar = new tough.CookieJar();
        this.lastAccessed = Date.now();
        this.passportCookieDomain = new URL(PASSPORT_COOKIE_URL).hostname;

        this.setPassportCookies = this.setPassportCookies.bind(this);
        this.getPassportCookieString = this.getPassportCookieString.bind(this);
        this.removeAllCookies = this.removeAllCookies.bind(this);
    }

    /**
     * Store Passport cookies in cookieJar.
     *
     * @param {[string]}  cookieStrings  Passport cookies.
     */
    setPassportCookies(cookieStrings) {
        cookieStrings.forEach((cookieString) => {
            const cookie = tough.Cookie.parse(cookieString);

            if (cookie.domain) {
                cookie.domain = this.passportCookieDomain;
            }

            this.cookieJar.setCookieSync(cookie, PASSPORT_COOKIE_URL);
        });
    }

    /**
     * Get Passport cookies from cookieJar.
     *
     * @returns {string} String for HTTP Cookie header.
     */
    getPassportCookieString() {
        return this.cookieJar.getCookieStringSync(PASSPORT_COOKIE_URL);
    }

    /**
     * Remove all cookies from cookieJar.
     */
    removeAllCookies() {
        this.cookieJar.removeAllCookiesSync();
    }
}

module.exports = LoginSession;
