Committing scripts using external tools | Screeps Documentation































































Screeps has a handy embedded code editor for writing game scripts. However, in some cases (for example, you want to use a language other than JavaScript or integrate with your IDE) you will have to commit game scripts to your Screeps account from outside.
You have to create an auth token in the [account settings](https://screeps.com/a/#!/account/auth-tokens) in order to use external synchronization.

## [](#Using-Grunt-task)Using Grunt task[](#Using-Grunt-task)
If you haven't used [Grunt](http://gruntjs.com) before, be sure to check out the [Getting Started](http://gruntjs.com/getting-started) guide, as it explains how to create a [Gruntfile](http://gruntjs.com/sample-gruntfile) as well as install and use Grunt plugins. Once you're familiar with that process, you may install this plugin with this command:

```js
npm install grunt-screeps
```
Configure your Gruntfile.js:

```js
module.exports = function(grunt) {

grunt.loadNpmTasks('grunt-screeps');

grunt.initConfig({
screeps: {
options: {
email: '',
token: '',
branch: 'default',
//server: 'season'
},
dist: {
src: ['dist/*.js']
}
}
});
}
```
Now you can run this command to commit your code from `dist` folder to your Screeps account:

```js
grunt screeps
```

## [](#Using-direct-API-access)Using direct API access[](#Using-direct-API-access)
Screeps Web API has an endpoint `https://screeps.com/api/user/code` for working with scripts. The two supported methods are `POST` and `GET` for writing and retrieving respectively. Both methods accept [Basic access authentication](http://en.wikipedia.org/wiki/Basic_access_authentication). Endpoints get and return a JSON structure containing modules object with module names as keys and their content as values.
An example of committing code using Node.js:

```js
var https = require('https');

var email = '',
password = '',
data = {
branch: 'default',
modules: {
main: 'require("hello");',
hello: 'console.log("Hello World!");'
}
};

var req = https.request({
hostname: 'screeps.com',
port: 443,
path: '/api/user/code',
method: 'POST',
auth: email + ':' + password,
headers: {
'Content-Type': 'application/json; charset=utf-8'
}
});

req.write(JSON.stringify(data));
req.end();
```
Request:

```js
POST /api/user/code HTTP/1.1
Content-Type: application/json; charset=utf-8
Host: screeps.com:443
Authorization: Basic PHlvdXIgZS1tYWlsPjo8eW91ciBwYXNzd29yZD4=
Connection: close
Transfer-Encoding: chunked

{"branch":"default","modules":{"main":"require(\"hello\");","hello":"console.log(\"Hello World!\");"}}
```
Response:

```js
X-Powered-By: Express
Content-Type: application/json; charset=utf-8
Content-Length: 8
Date: Mon, 02 Feb 2015 18:46:11 GMT
Connection: close

{"ok":1}
```








**Contents**
1. [Using Grunt task](#Using-Grunt-task)
2. [Using direct API access](#Using-direct-API-access)

[Back to Top](#)






[API Reference](/api/)[Overview](/index.html)**Gameplay**[Introduction](/introduction.html)[Creeps](/creeps.html)[Control](/control.html)[Defense](/defense.html)[Respawning](/respawn.html)[Start Areas](/start-areas.html)[Resources](/resources.html)[Market](/market.html)[NPC Invaders](/invaders.html)[Power](/power.html)**Scripting**[Scripting Basics](/scripting-basics.html)[Global Objects](/global-objects.html)[Modules](/modules.html)[Debugging](/debugging.html)[Game Loop](/game-loop.html)[External Commit](/commit.html)[Simultaneous Actions](/simultaneous-actions.html)[CPU Limit](/cpu-limit.html)**Other**[Server-Side Architecture](/architecture.html)[Public Test Realm (PTR)](/ptr.html)[Third Party Tools](/third-party.html)[Auth Tokens](/auth-tokens.html)[Community Servers](/community-servers.html)[Terms of Service](/tos.html)[Privacy Policy](/privacy-policy.html)**Resources**[Blog](http://blog.screeps.com)[Changelogs](http://blog.screeps.com/categories/Changelogs/)[Chat](http://chat.screeps.com)[Forum](https://screeps.com/forum/)**Contributed Articles**[Contribution Rules](/contributed/rules.html)[Advanced Grunt Usage](/contributed/advanced_grunt.html)[Modifying Prototypes](/contributed/modifying-prototypes.html)[Caching Overview](/contributed/caching-overview.html)[Private Server MongoDB](/contributed/ps_ubuntu.html)