Organizing scripts using modules | Screeps Documentation































































For your convenience, you may divide your scripts into modules with the help of Node.js-like syntax – the `require` function and the `module.exports` object. For example, you can create a module called 'scout' with the following content:

```js
module.exports = {
run(creep) {
creep.moveTo(...);
}
}
```
Then you may include this module from the main module this way:

```js
var scout = require('scout');

for(var i in Game.creeps) {
scout.run(Game.creeps[i]);
}
```
Besides your own modules, you can also access some embedded modules. Currently, it is the [lodash](http://lodash.com) module which you can use like this:

```js
var _ = require('lodash');

var harvesters = _.filter(Game.creeps, {
memory: {role: 'harvester'}
});
```

## [](#Binary-modules)Binary modules[](#Binary-modules)
Besides normal script modules, you can create special binary modules. Such a module is loaded
as a raw `Buffer` with binary data when you call `require`. It allows you to use
techniques like [WebAssembly](http://webassembly.org/) to compile code written in different languages
and run it in Screeps.
WebAssembly is a binary compiled code format that allows to run C/C++ or Rust code (as well as other supported languages in the future) directly with native performance. Please refer to the WebAssembly [documentation](https://developer.mozilla.org/en-US/docs/WebAssembly) for more info.
Here is a short example of how to compile C/C++ code using [Emscripten](https://kripken.github.io/emscripten-site/index.html) and upload the binary file to Screeps.

### [](#Build-wasm-file)Build `.wasm` file[](#Build-wasm-file)
You can skip this step if you use an already compiled `.wasm` file from the web. For example,
we've already compiled the [`addTwo.wasm`](img/addTwo.wasm) file for you from the example below.

Install Emsripten SDK using [these instructions](https://kripken.github.io/emscripten-site/docs/getting_started/downloads.html#sdk-installation-instructions).
Write your native C function and save it as `addTwo.c` file:

```js
int addTwo(int a, int b) {
return a + b;
}
```
Compile it to `addTwo.wasm` using this command:

```js
emcc -s WASM=1 -s SIDE_MODULE=1 -O3 addTwo.c -o addTwo.wasm
```

### [](#Upload-binary-module)Upload binary module[](#Upload-binary-module)
Add a new module `addTwo` with binary type using this switch:

Upload your `addTwo.wasm` file as binary module contents, so that it looks as follows:

Click the ✔️ button to commit your modules.

### [](#Run-your-native-module-in-Screeps)Run your native module in Screeps[](#Run-your-native-module-in-Screeps)
If you uploaded your binary module correctly, you should see the following in your in-game IDE:

Now you can use the following code to run your imported binary code in `main` using WebAssembly API:

```js
// This will return an ArrayBuffer with `addTwo.wasm` binary contents
const bytecode = require('addTwo');

const wasmModule = new WebAssembly.Module(bytecode);

const imports = {};

// Some predefined environment for Emscripten. See here:
// https://github.com/WebAssembly/tool-conventions/blob/master/DynamicLinking.md
imports.env = {
memoryBase: 0,
tableBase: 0,
memory: new WebAssembly.Memory({ initial: 256 }),
table: new WebAssembly.Table({ initial: 0, element: 'anyfunc' })
};

const wasmInstance = new WebAssembly.Instance(wasmModule, imports);

console.log(wasmInstance.exports.addTwo(2,3));
```








**Contents**
1. [Binary modules](#Binary-modules)[Build .wasm file](#Build-wasm-file)
2. [Upload binary module](#Upload-binary-module)
3. [Run your native module in Screeps](#Run-your-native-module-in-Screeps)

[Back to Top](#)






[API Reference](/api/)[Overview](/index.html)**Gameplay**[Introduction](/introduction.html)[Creeps](/creeps.html)[Control](/control.html)[Defense](/defense.html)[Respawning](/respawn.html)[Start Areas](/start-areas.html)[Resources](/resources.html)[Market](/market.html)[NPC Invaders](/invaders.html)[Power](/power.html)**Scripting**[Scripting Basics](/scripting-basics.html)[Global Objects](/global-objects.html)[Modules](/modules.html)[Debugging](/debugging.html)[Game Loop](/game-loop.html)[External Commit](/commit.html)[Simultaneous Actions](/simultaneous-actions.html)[CPU Limit](/cpu-limit.html)**Other**[Server-Side Architecture](/architecture.html)[Public Test Realm (PTR)](/ptr.html)[Third Party Tools](/third-party.html)[Auth Tokens](/auth-tokens.html)[Community Servers](/community-servers.html)[Terms of Service](/tos.html)[Privacy Policy](/privacy-policy.html)**Resources**[Blog](http://blog.screeps.com)[Changelogs](http://blog.screeps.com/categories/Changelogs/)[Chat](http://chat.screeps.com)[Forum](https://screeps.com/forum/)**Contributed Articles**[Contribution Rules](/contributed/rules.html)[Advanced Grunt Usage](/contributed/advanced_grunt.html)[Modifying Prototypes](/contributed/modifying-prototypes.html)[Caching Overview](/contributed/caching-overview.html)[Private Server MongoDB](/contributed/ps_ubuntu.html)