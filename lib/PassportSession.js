/**
 * Holds Passport specific data with the lifetime of one client request/response cycle.
 * https://docs.microsoft.com/en-us/openspecs/windows_protocols/ms-pass/11a9752a-67c6-4fef-86ee-920e3f88f2c1
 */
class PassportSession {
    /**
     * Initialize a new PassportSession.
     */
    constructor() {
        this.passportConfigurationData = null;
        this.originalHttpVerb = null;
        this.originalHttpUrl = null;
        this.lastSignInRequest = null;
        this.sentFirstAuthenticatedRequest = false;
        this.signInAttempts = 0;
    }
}

module.exports = PassportSession;
