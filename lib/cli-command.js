const commands = new Set(['setup','check-credentials','forget-credentials','update','uninstall','version','help']);
function parseCommand(args) {
    if (!args.length) return {command:'run'};
    if (args.length !== 1) return {error:'Use one subcommand. See help.'};
    const value=args[0];
    if (['-h','--help'].includes(value)) return {command:'help'};
    if (['-v','--version'].includes(value)) return {command:'version'};
    if (commands.has(value)) return {command:value};
    if (value.startsWith('--') && commands.has(value.slice(2))) return {error:`Use ${value.slice(2)} instead of ${value}.`};
    return {error:'Unknown command. See help.'};
}
function helpText() {
    return 'EducationPerfected 2026.0.0\nUsage: educationperfected [command]\n'
      + 'setup: consent to Chrome download (cached download reused), then optional saved login; no browser/answers\n'
      + 'check-credentials: check saved login without displaying it\n'
      + 'forget-credentials: remove saved login\n'
      + 'update: check published stable releases and confirm a verified replacement\n'
      + 'uninstall: confirm removal of app data and saved login; retain live/uncertain data\n'
      + 'version (-v, --version): print version\nhelp (-h, --help): show help\n'
      + 'With no subcommand, opens the login browser and interactive CLI; no answers until start.\n'
      + 'Interactive: start (can submit live answers), stop, status, mode auto, mode semi, refresh, inspect-self-mark, quit/exit.\n'
      + 'Auto is default. Semi changes live answers but waits for manual submission. Assessments refused.\n';
}
module.exports={parseCommand,helpText};
