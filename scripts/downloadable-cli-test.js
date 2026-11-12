// Shared native local fixture; not clean-machine/no-Node or first-run UI proof.
require('./packaged-cli-test').runPackagedFixture({directDownload:true}).catch(error=>{console.error(error);process.exitCode=1;});
