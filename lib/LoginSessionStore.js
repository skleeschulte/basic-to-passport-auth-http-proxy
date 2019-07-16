const crypto = require('crypto');

/**
 * Session time to live (TTL) in milliseconds.
 * @define {number}
 */
const LOGIN_SESSION_TTL = 15 * 60 * 1000; // 15 minutes

/**
 * Store for LoginSessions. LoginSessions are identified by username and protected by password provided by Basic auth.
 */
class LoginSessionStore {
    /**
     * Passport 1.4 usernames must be email names:
     * https://docs.microsoft.com/en-us/openspecs/windows_protocols/ms-pass/bd678e19-bc40-478e-ac2e-dbd2c654605d
     * Email names are case insensitive, so convert username to lower case.
     *
     * @param {string}  username  Username.
     * @returns {string} Lower case username.
     */
    static normalizeUsername(username) {
        return username.toLowerCase();
    }

    /**
     * Hash password.
     *
     * @param {string}  password  Password.
     * @returns {string}  SHA1 password hash.
     */
    static hashPassword(password) {
        return crypto.createHash('sha1').update(password).digest('base64');
    }

    /**
     * Initialize a new LoginSessionStore instance.
     */
    constructor() {
        this.store = new Map();

        this.storeSession = this.storeSession.bind(this);
        this.getSession = this.getSession.bind(this);
        this.deleteSession = this.deleteSession.bind(this);
    }

    /**
     * Store loginSession.
     *
     * @param {LoginSession}  loginSession  LoginSession to store.
     * @param {string}        username      Username string.
     * @param {string}        password      Password string.
     */
    storeSession(loginSession, username, password) {
        loginSession.passwordHash = LoginSessionStore.hashPassword(password);
        loginSession.lastAccessed = Date.now();

        this.store.set(LoginSessionStore.normalizeUsername(username), loginSession);
    }

    /**
     * Return the login session for the given username, if password hashes match.
     *
     * @param {string}  username  Username string.
     * @param {string}  password  Password string.
     * @returns {null|LoginSession} LoginSession or null.
     */
    getSession(username, password) {
        const loginSession = this.store.get(LoginSessionStore.normalizeUsername(username));

        if (!loginSession) {
            return null;
        }

        if (loginSession.lastAccessed < Date.now() - LOGIN_SESSION_TTL) {
            this.deleteSession(username);
            return null;
        }

        if (loginSession.passwordHash !== LoginSessionStore.hashPassword(password)) {
            return null;
        }

        loginSession.lastAccessed = Date.now();
        return loginSession;
    }

    /**
     * Delete LoginSession of given user.
     *
     * @param {string}  username  Username string.
     */
    deleteSession(username) {
        this.store.delete(LoginSessionStore.normalizeUsername(username));
    }
}

module.exports = LoginSessionStore;
