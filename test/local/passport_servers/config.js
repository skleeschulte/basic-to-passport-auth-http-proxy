const config = {
    PARTNER_SERVER_PORT: 4000,
    CONFIGURATION_SERVER_PORT: 4001,
    AUTHENTICATION_SERVER_PORT: 4002,
};

config.PARTNER_SERVER_URL = `http://localhost:${config.PARTNER_SERVER_PORT}/`;
config.CONFIGURATION_SERVER_URL = `http://localhost:${config.CONFIGURATION_SERVER_PORT}/`;
config.AUTHENTICATION_SERVER_URL = `http://localhost:${config.AUTHENTICATION_SERVER_PORT}/`;

module.exports = config;
