const commands = new Set(['setup','check-credentials','forget-credentials','update','uninstall','version','help']);
const commandHelp = [
    ['setup', 'First-time setup: consent to the Chrome download, then optional saved login'],
    ['check-credentials', 'Check the saved login without displaying it'],
    ['forget-credentials', 'Remove the saved login'],
    ['update', 'Check published stable releases and confirm a verified replacement'],
    ['uninstall', 'Confirm, then remove app data and the saved login'],
    ['version', 'Print the version'],
    ['help', 'Show this help'],
];
const optionHelp = [
    ['-h, --help', 'Show this help'],
    ['-v, --version', 'Print the version'],
];
const interactiveHelp = [
    ['start', 'Start answering (can submit live answers)'],
    ['stop', 'Stop answering'],
    ['status', 'Show current status'],
    ['mode auto', 'Answer and submit automatically (default)'],
    ['mode semi', 'Change live answers but wait for manual submission'],
    ['refresh', 'Reload the task word lists'],
    ['inspect-self-mark', 'Read-only inspection of a self-mark page'],
    ['quit, exit', 'Close the CLI'],
];
function formatRows(rows) {
    const width = Math.max(...rows.map(([name]) => name.length));
    return rows.map(([name, text]) => '  ' + name.padEnd(width) + '  ' + text + '\n').join('');
}
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
    return 'EducationPerfected 2026.0.0\n\n'
      + 'Usage:\n  educationperfected [command]\n\n'
      + 'With no command, opens the login browser and interactive CLI; no answers until start.\n\n'
      + 'Commands:\n' + formatRows(commandHelp) + '\n'
      + 'Options:\n' + formatRows(optionHelp) + '\n'
      + 'Interactive commands (in the running CLI):\n' + formatRows(interactiveHelp) + '\n'
      + 'Assessments are always refused.\n';
}
module.exports={parseCommand,helpText};
