/**
 * Errors thrown by the PassportHandler.
 */
class PassportError extends Error {
    /**
     * Initialize a new PassportError.
     *
     * @param {string}  message       Error message.
     * @param {number}  [statusCode]  HTTP status code.
     * @param {*}       [body]        Response body.
     */
    constructor(message, statusCode, body) {
        super(message);
        this.name = this.constructor.name;
        Error.captureStackTrace(this, this.constructor);

        this.statusCode = statusCode;
        this.body = body;
    }
}

module.exports = PassportError;
