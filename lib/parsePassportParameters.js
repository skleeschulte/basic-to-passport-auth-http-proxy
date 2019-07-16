/**
 * Parse a string with Passport parameters into an object.
 *
 * @param {string}  parameterString  String containing Passport parameters
 * @returns {{}} Object with parsed parameters.
 */
function parsePassportParameters(parameterString) {
    const elements = parameterString.split(',');

    return elements.reduce((parameters, element) => {
        const equalSignPos = element.indexOf('=');

        const key = element.substr(0, equalSignPos).trim() || element;
        const value = (equalSignPos !== -1) ? element.substr(equalSignPos + 1).trim() : true;

        if (parameters[key]) {
            if (!Array.isArray(parameters[key])) {
                parameters[key] = [parameters[key]];
            }
            parameters[key].push(value);
        } else {
            parameters[key] = value;
        }

        return parameters;
    }, {});
}

module.exports = parsePassportParameters;
