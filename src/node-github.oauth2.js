/**
 * Created by amitthakkar on 09/08/16.
 */
const SIMPLE_OAUTH2 = require('simple-oauth2');
const RANDOM_STRING = require("randomstring");
const QUERY_STRING = require('querystring');
const GITHUB = require("github");
const SPAWN = require('child_process').spawn;
const EXEC = require('child_process').exec;
const BLUE_BIRD = require('bluebird');

// Constants
const PROTOCOL = 'https';
const HOST = 'api.github.com';
const GITHUB_LOGIN_URL = PROTOCOL + '://github.com/login';
const OAUTH_ACCESS_TOKEN_PATH = '/oauth/access_token';
const OAUTHORIZATION_PATH = '/oauth/authorize';
const SPACE_REGEX = / /g;
const EMAIL_REGEX = /^(([^<>()\[\]\\.,;:\s@"]+(\.[^<>()\[\]\\.,;:\s@"]+)*)|(".+"))@((\[[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}])|(([a-zA-Z\-0-9]+\.)+[a-zA-Z]{2,}))$/;
const SPACE_REPLACER = '\\ ';

let oauth2, clientId, clientSecret, redirectURI, scope, gitDirectory, github;

let isValidEmail = (email) => {
    return EMAIL_REGEX.test(email);
};

let replaceSpaceInPath = (path) => {
    return path.replace(SPACE_REGEX, SPACE_REPLACER);
};

class NodeGithubOAuth2 {
    constructor(options) {
        clientId = options.clientId;
        clientSecret = options.clientSecret;
        redirectURI = options.redirectURI;
        scope = options.scope;
        gitDirectory = options.gitDirectory;
        github = new GITHUB({
            protocol: PROTOCOL,
            host: HOST,
            pathPrefix: "",
            headers: {
                "user-agent": options.userAgent
            },
            Promise: BLUE_BIRD,
            followRedirects: false,
            timeout: 5000
        });
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
    }

    getRedirectURL(state) {
        return oauth2.authCode.authorizeURL({
            redirect_uri: redirectURI,
            scope: scope,
            state: state
        });
    }

    getToken(request, response, next) {
        let code = request.query.code;
        let state = request.query.state;
        oauth2.authCode.getToken({
            code: code,
            redirect_uri: redirectURI
        }, (error, result) => {
            if (error) {
                next(error);
            } else {
                request.token = QUERY_STRING.parse(result).access_token;
                request.state = state;
                next();
            }
        });
    }

    authenicateGithubWithToken(token) {
        github.authenticate({
            type: "oauth",
            token: token
        });
    }

    getOrganizations(options, callback) {
        this.authenicateGithubWithToken(options.token);
        github.users.getOrgs({}, callback);
    }

    createRepo(options, callback) {
        this.authenicateGithubWithToken(options.token);
        github.repos.createForOrg({
            org: options.org,
            name: options.name,
            description: options.discription,
            private: options.private || false
        }, callback);
    }

    cloneProject(options, callback) {
        let gitURL = 'https://' + options.token + ':x-oauth-basic@github.com/' + options.org + '/' + options.name + '.git';
        const ls = SPAWN('git', ['clone', gitURL, gitDirectory + options.name]);
        let cloneResult = '';
        ls.stdout.on('data', (data) => {
            cloneResult += data.toString();
        });
        ls.stderr.on('data', (err) => {
            cloneResult += err.toString();
        });
        ls.on('close', (code) => {
            callback(null, cloneResult, code);
        });
    }

    createRepoAndCloneProject(options, callback) {
        if (!options.token) {
            return callback('token is not present!');
        } else if (!options.org) {
            return callback('org is not present!');
        } else if (!options.name) {
            return callback('name is not present!');
        }
        this.createRepo(options, (createRepoError) => {
            if (createRepoError) {
                return callback(createRepoError);
            }
            this.cloneProject(options, callback);
        });
    }

    deleteGithubRepo(options, callback) {
        if (!options.token) {
            return callback('token is not present!');
        } else if (!options.org) {
            return callback('org is not present!');
        } else if (!options.name) {
            return callback('name is not present!');
        }
        this.authenicateGithubWithToken(options.token);
        github.repos.delete({repo: options.name, user: options.org}, callback);
    }

    searchByEmail(options, callback) {
        if (!options.token) {
            return callback('token is not present!');
        } else if (!options.email) {
            return callback('email is not present!');
        }
        this.authenicateGithubWithToken(options.token);
        github.search.email({email: options.email}, callback);
    }

    addCollaborator(options, callback) {
        if (!options.token) {
            return callback('token is not present!');
        } else if (!options.collabuser) {
            return callback('collabuser is not present!');
        } else if (!options.user) {
            return callback('user is not present!');
        } else if (!options.repo) {
            return callback('repo is not present!');
        } else if (!options.permission) {
            return callback('permission is not present!');
        }
        if (isValidEmail(options.collabuser)) {
            this.searchByEmail({
                token: options.token,
                email: options.collabuser
            }, (error, result) => {
                let permission;
                switch (options.permission) {
                    case 'admin':
                        permission = 'admin';
                        break;
                    case 'write':
                        permission = 'push';
                        break;
                    case 'read':
                        permission = 'pull';
                        break;
                }
                this.authenicateGithubWithToken(options.token);
                github.repos.addCollaborator({
                    user: options.user,
                    repo: options.repo,
                    collabuser: result.user.login,
                    permission: permission
                }, callback);
            });
        } else {
            let permission;
            switch (options.permission) {
                case 'admin':
                    permission = 'admin';
                    break;
                case 'write':
                    permission = 'push';
                    break;
                case 'read':
                    permission = 'pull';
                    break;
            }
            this.authenicateGithubWithToken(options.token);
            github.repos.addCollaborator({
                user: options.user,
                repo: options.repo,
                collabuser: options.collabuser,
                permission: permission
            }, callback);
        }
    }

    removeCollaborator(options, callback) {
        if (!options.token) {
            return callback('token is not present!');
        } else if (!options.collabuser) {
            return callback('collabuser is not present!');
        } else if (!options.user) {
            return callback('user is not present!');
        } else if (!options.repo) {
            return callback('repo is not present!');
        }
        if (isValidEmail(options.collabuser)) {
            this.searchByEmail({
                token: options.token,
                email: options.collabuser
            }, (error, result) => {
                this.authenicateGithubWithToken(options.token);
                github.repos.removeCollaborator({
                    user: options.user,
                    repo: options.repo,
                    collabuser: result.user.login
                }, callback);
            });
        } else {
            this.authenicateGithubWithToken(options.token);
            github.repos.removeCollaborator({
                user: options.user,
                repo: options.repo,
                collabuser: options.collabuser
            }, callback);
        }
    }

    commitAndPush(options, callback) {
        if (!options.token) {
            return callback('token is not present!');
        } else if (!options.name) {
            return callback('name is not present!');
        } else if (!options.username) {
            return callback('username is not present!');
        } else if (!options.email) {
            return callback('email is not present!');
        } else if (!options.commitMessage) {
            return callback('commitMessage is not present!');
        } else if (!options.org) {
            return callback('org is not present!');
        }
        let remoteURL = 'https://' + options.token + '@github.com/' + options.org + '/' + options.name + '.git';
        EXEC([
            '/bin/sh',
            replaceSpaceInPath(__dirname + '/../scripts/commitAndPush.sh'),
            replaceSpaceInPath(gitDirectory + options.name),
            options.username,
            options.email,
            replaceSpaceInPath(options.commitMessage),
            remoteURL
        ].join(' '), function (error, stdout, stderr) {
            callback(error, stdout, stderr);
        });
    }

    getUserDetails(options, callback) {
        if (!options.token) {
            return callback('token is not present!');
        }
        this.authenicateGithubWithToken(options.token);
        github.users.get({}, callback);
    }

    getEmailIds(options, callback) {
        if (!options.token) {
            return callback('token is not present!');
        }
        this.authenicateGithubWithToken(options.token);
        github.users.getEmails({}, callback);
    }

    createRelease(options, callback) {
        if (!options.token) {
            return callback('token is not present!');
        }
        this.authenicateGithubWithToken(options.token);
        github.repos.createRelease({
            user: options.user,
            repo: options.repo,
            tag_name: options.tag_name
        }, callback);
    }
}