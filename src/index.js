/**
 * Created by amitthakkar on 13/07/16.
 */
// Dependencies
const SIMPLE_OAUTH2 = require('simple-oauth2');
const RANDOM_STRING = require("randomstring");
const QUERY_STRING = require('querystring');

// Constants
const GITHUB_LOGIN_URL = 'https://github.com/login';
const OAUTH_ACCESS_TOKEN_PATH = '/oauth/access_token';
const OAUTHORIZATION_PATH = '/oauth/authorize';

let oauth2, redirectURL, clientId, clientSecret, redirectURI, scope;

class NodeGithubOAuth2 {
    constructor(options) {
        clientId = options.clientId;
        clientSecret = options.clientSecret;
        redirectURI = options.redirectURI;
        scope = options.scope;
        this.initialize();
    }

    initialize() {
        let randomString = RANDOM_STRING.generate({});
        oauth2 = SIMPLE_OAUTH2({
            clientID: clientId,
            clientSecret: clientSecret,
            site: GITHUB_LOGIN_URL,
            tokenPath: OAUTH_ACCESS_TOKEN_PATH,
            authorizationPath: OAUTHORIZATION_PATH
        });
        redirectURL = oauth2.authCode.authorizeURL({
            redirect_uri: redirectURI,
            scope: scope,
            state: randomString
        });
    }

    authorized(request, response) {
        response.redirect(redirectURL);
    }

    getToken(request, response, next) {
        var code = request.query.code;
        oauth2.authCode.getToken({
            code: code,
            redirect_uri: redirectURI
        }, (error, result) => {
            if (error) {
                next(error);
            } else {
                request.token = QUERY_STRING.parse(result).access_token;
                next();
            }
        });
    }
}

exports = module.exports = function (options) {
    return new NodeGithubOAuth2(options);
};