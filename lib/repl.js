const repl = require( 'repl' );
const debug = require( 'debug' )( 'graphmaker:repl' );
const readline = require('readline/promises');
const fs = require( 'fs' );
const path = require( 'path' );
const execSync = require( 'child_process' ).execSync;
const os = require( 'os' );
const { parseArgs } = require( 'util' );
const semverCompare = require( 'semver-compare' );
const textTable = require( 'text-table' );
const format = require( '@stdlib/string-format' );
const omit = require( '@stdlib/utils-omit' );
const align = require( 'align-text' );
const { version: VERSION } = require( './../package.json' );
const DEFAULT_CONFIG = require( './default-config.json' );
const { initializeGraph, updateGraph, redo, resetGraph, undo, save, task, setGraph, aiFactory } = require( './index.js' );

const CONFIG_FILE = '.graphmaker.json';
const COMMANDS = [
    ':save',
    ':show',
    ':undo',
    ':redo',
    ':config',
    ':reset',
    ':history',
    ':exec',
    ':load',
    ':transcript',
    ':help',
    ':intro',
    ':examples',
    ':exit'
];

function welcomeActions() {
    console.log( `This is graphmaker version ${VERSION}.` );
    console.log( 'Start creating a graph or type \':help\' for a list of available commands.' );
    checkAvailableVersion();
}

function checkAvailableVersion() {
    try {
        const newVersion = execSync( 'npm view graphmaker version', {
            stdio: [ 'pipe', 'pipe', 'ignore' ]
        }).toString().trim();
        if ( semverCompare( newVersion, VERSION ) > 0 ) {
            const msg = `A newer version of graphmaker (${newVersion} > ${VERSION}) is available. Type 'npm update -g graphmaker' at the terminal prompt to upgrade.`;
            console.log( msg );
        }
    } catch ( _ ) {
        debug( 'Unable to check for newer version of graphmaker.' );
    }
}

function homeDirectoryFile( fname ) {
    return path.join( os.homedir(), fname );
}

/**
 * Collects repl configuration settings.
 *
 * In priority order, CONFIG_FILE < environment < command line.
 * The setting with the :config command in repl takes priority over all.
 *
 */
function readConfig( clKeys, configFile = homeDirectoryFile( CONFIG_FILE ) ) {
    let config = { ...DEFAULT_CONFIG };
    try {
        config = { ...config, ...JSON.parse( fs.readFileSync( configFile, 'utf8' ) ) };
    } catch ( _ ) {
        debug( `No config file present: ${configFile}` );
    }
    /* eslint-disable no-process-env */
    if ( process.env.OPENAI_API_KEY ) {
        config = {
            ...config,
            provider: 'OpenAI',
            OpenAI: {
                ...DEFAULT_CONFIG.OpenAI,
                apiKey: process.env.OPENAI_API_KEY
            }
        };
    }
    /* eslint-enable no-process-env */
    config = {
        ...config,
        ...omit( clKeys, [ 'apiKey', 'model' ] )
    };
    if ( clKeys.apiKey || clKeys.model ) {
        config[ config.provider ] = { apiKey: clKeys.apiKey || config.apiKey, model: clKeys.model || config.model };
    }
    if ( !config[ config.provider ]?.apiKey ) {
        console.log( 'An API key for model provider `'+config.provider+'` needs to be set with the :config command before building a graph.');
    }
    return config;
}

const clOptions = {
    width: {
        description: 'Width of image canvas in pixels',
        tag: 'PIXELS',
        type: 'string',
        trueType: 'number',
        short: 'w'
    },
    height: {
        description: 'Height of image canvas in pixels',
        tag: 'PIXELS',
        type: 'string',
        trueType: 'number',
        short: 'h'
    },
    draft: {
        description: 'Display extra information, e.g., node reference names',
        type: 'boolean',
        short: 'd'
    },
    format: {
        description: 'Default output format for :show/:save commands',
        tag: 'FORMAT',
        type: 'string',
        short: 'f'
    },
    orientation: {
        description: 'Default orientation for displaying the graph indicating where the first/root node is positioned (either "left", "right", "top", "bottom", or "auto")',
        tag: 'ORIENTATION',
        type: 'string',
        short: 'o'
    },
    config: {
        description: 'Path to JSON configuration file (Default: ~/.graphmaker.json)',
        tag: 'FILE_PATH',
        type: 'string',
        short: 'c'
    },
    provider: {
        description: 'Model provider ("OpenAI")',
        tag: 'NAME',
        type: 'string',
        short: 'p'
    },
    model: {
        description: 'Model to use ("gpt-3.5-turbo")',
        tag: 'NAME',
        type: 'string',
        short: 'm',
    },
    apiKey: {
        description: 'Model provider API key',
        type: 'string',
        short: 'a'
    },
    type: {
        description: 'Model type ("memoryless" or "serial")',
        tag: 'NAME',
        type: 'string',
        short: 't'
    },
    version: {
        description: 'Print package version number and exit',
        type: 'boolean',
        short: 'v'
    },
    help: {
        description: 'Print this message and exit',
        type: 'boolean',
        short: 'h'
    }
};

function printUsage() {
    const out = [];
    out.push( 'Usage: graphmaker [options]' );
    out.push( '' );
    out.push( 'Options:' );
    out.push( '' );
    const rows = Object.keys( clOptions ).map( key => {
        const row = [];
        const opt = clOptions[ key ];
        const arg = opt.type === 'string' ? (' ' + (opt.tag || 'ARG')) : '';
        if ( opt.short ) {
            row.push( '-'+opt.short+', --'+key+arg );
        } else {
            row.push( '--'+key+arg );
        }
        row.push( opt.description );
        return row;
    });
    out.push( textTable( rows, { align: [ 'l', 'l' ] }) );
    out.push( '' );
    return out.join( '\n' );
}

function getArgs( options ) {
    const { values } = parseArgs({ options });
    // Process numeric args if present
    if ( values.width !== void 0 ) {
        values.width = parseInt( values.width, 10 );
    }
    if ( values.height !== void 0 ) {
        values.height = parseInt( values.height, 10 );
    }
    return values;
}

function handleErrors( output, callback ) {
    if ( output && output.kind === 'ERRORS' ) {
        output.data.forEach( x => debug( x ) );
        let msg = output.data.map( x => x.message ).join( '\n' );
        msg += '\n';
        msg += 'Context:\n';
        msg += JSON.stringify( output.context, null, 2 );
        callback( null, msg );
        return true;
    }
    return false;
}

const FORMATS = [ 'svg', 'png', 'jpg', 'jpeg', 'pdf', 'json', 'gif', 'webp', 'tiff', 'tex' ];

//
// Initial Processing
//
const args = getArgs( clOptions );
if ( args.version ) {
    console.log( `${VERSION}`);
    process.exit( 0 );
} else if ( args.help ) {
    console.log( printUsage() );
    process.exit( 0 );
}

const graphConfig = readConfig( args, args.config );
let modelRequest = graphConfig.provider ? aiFactory( graphConfig.provider, graphConfig[graphConfig.provider] ) : null;
let replState = initializeGraph( graphConfig );

welcomeActions();

let isReadingInSubShell = false;
async function replEval( cmd, callback, server ) {
    if ( isReadingInSubShell ) {
        return;
    }
    cmd = cmd.trim();
    if ( cmd === '' ) {
        return callback( null, '' );
    }

    const idx = cmd.indexOf( ' ' );
    let command;
    let arg;
    if ( idx !== -1 ) {
        command = cmd.substring( 0, idx );
        arg = cmd.substring( idx + 1 ).trimStart();
    } else {
        command = cmd;
    }
    let output;
    switch ( command ) {
        case ':show': {
            if ( arg === void 0 ) {
                arg = graphConfig.format;
            }
            if ( arg === 'json' ) {
                [ replState, output ] = await updateGraph( replState, save( { ...graphConfig, format: 'json', draft: true } ) );
                return callback( null, JSON.stringify( replState.graph, null, 2 ) );
            } else if ( arg === 'tex' ) {
                [ replState, output ] = await updateGraph( replState, save( { ...graphConfig, format: 'tex', draft: true } ) );
                return callback( null, output.data );
            } else if ( FORMATS.indexOf( arg ) !== -1 ) {
                [ replState, output ] = await updateGraph( replState, save({
                    ...graphConfig,
                    format: arg,
                    draft: true
                }) );
                if ( handleErrors( output, callback ) ) {
                    return;
                }
                // Write to a temporary file:
                const dir = fs.mkdtempSync( path.join( os.tmpdir(), 'graphmaker-' ) );
                const filename = path.join( dir, `graph.${arg}` );
                fs.writeFileSync( filename, output.data );

                // Open the SVG in the default browser with Node.js child_process (cross-platform):
                const { exec } = require( 'child_process' );
                if ( process.platform === 'win32' ) {
                    exec( `start ${filename}` );
                }
                else if ( process.platform === 'darwin' ) {
                    exec( `open ${filename}` );
                }
                else {
                    // Case: Linux
                    exec( `xdg-open ${filename}` );
                }
                return callback( null, 'Graph rendered.' );
            }
            handleErrors( { kind: 'ERRORS', data: [ new Error( 'unknown output format') ] }, callback );
            break;
        }
        case ':exec': {
            const execCmds = fs.readFileSync( arg, 'utf8' )
                .split( /^\s*(:.*\n)/m );
            const output = [];
            for ( let i = 0; i < execCmds.length; i++ ) {
                await replEval( execCmds[ i ], ( _, out ) => output.push( out ), server );
            }
            output.push(`Executed commands in file ${arg}.` );
            callback( null, output.join( '\n' ) );
            break;
        }
        case ':load': {
            const json = JSON.parse( fs.readFileSync( arg, 'utf8' ) );
            [ replState ] = await updateGraph( replState, setGraph( json ) );
            callback( null, `Using graph in file ${arg}.` );
            break;
        }
        case ':transcript':
            cmd = cmd.replace( ':transcript', '.save' );
            executeCommand( cmd );
            break;
        case ':undo':
            [ replState ] = await updateGraph( replState, undo() );
            callback( null, 'Moved back one step.' );
            break;
        case ':redo':
            [ replState, output ] = await updateGraph( replState, redo() );
            callback( null, 'Moved forward one step.' );
            break;
        case ':reset':
            [ replState ] = await updateGraph( replState, resetGraph() );
            callback( null, 'Reset graph to initial state.' );
            break;
        case ':history': {
            const n = arg ? parseInt( arg, 10 ) : 10;
            const history = server.history.
                filter( ( x, idx ) => !x.startsWith( '.' ) && idx > 0 ).
                reduce( (hist, item) => {
                    if ( item !== hist[hist.length - 1] ) {
                        hist.push( item );
                    }
                    return hist;
                }, [] ).
                slice( 0, n );
            callback( null, history.join( '\n' ) );
            break;
        }
        case ':save': {
            const parts = arg.split( '.' );
            const fileExtension = parts.length > 1 ? parts.pop() : graphConfig.format;
            [ replState, output ] = await updateGraph( replState, save({
                ...graphConfig,
                format: fileExtension,
                draft: false
            }) );
            if ( handleErrors( output, callback ) ) {
                return;
            }
            fs.writeFileSync( arg, output.data );
            callback( null, 'Saved to file: `' + arg + '`' );
            break;
        }
        case ':config': {
            let match;
            if ( arg === void 0 ) {
                callback( null, Object.keys( graphConfig )
                    .map( key => {
                        if ( typeof graphConfig[ key ] === 'object' ) {
                            return `${key} = ${JSON.stringify( graphConfig[ key ] )}`;
                        }
                        return `${key} = ${graphConfig[ key ]}`;
                    })
                    .join( '\n' ) );
                break;
            }
            let [ option, value ] = arg.split( ' ' );
            let optionLabel = option;
            let optionRef = graphConfig;
            if ( option === 'apiKey' || option === 'model' || option === 'type' ) {
                optionLabel = `${graphConfig.provider}.${option}`;
                if ( !graphConfig[graphConfig.provider] ) {
                    graphConfig[graphConfig.provider] = {
                        apiKey: '',
                        model: '',
                        type: 'serial'
                    };
                }
                optionRef = graphConfig[graphConfig.provider];
            } else if ( match = /^([^.]+)\.(?:apiKey|model)$/.exec( option ) ) { // eslint-disable-line no-cond-assign
                if ( graphConfig[ match[1] ] === void 0 ) {
                    graphConfig[ match[1] ] = { apiKey: '', model: '', type: 'serial' };
                }
                optionLabel = match[ 0 ];
                optionRef = graphConfig[ match[1] ];
            }
            if ( value === void 0 ) {
                callback( null, `${optionLabel} = ${optionRef[ option ]}\n(${clOptions[ option ].description})` );
            } else {
                const optType = clOptions[ option ].trueType || clOptions[ option ].type;
                switch ( optType ) {
                    case 'number':
                        if ( !/^[1-9][0-9]*$/.test( value ) ) {
                            return callback( null, `Invalid value for option ${optionLabel}: ${value}. Must be a positive integer.` );
                        }
                        value = parseInt( value, 10 );
                        break;
                    case 'boolean': {
                        const yes = [ 'true', 'yes', '1', 'y', 't'];
                        const no = ['false', 'no', '0', 'n', 'f'];
                        value = value.toLowerCase();
                        const truthy = yes.includes( value );
                        if ( !truthy && !no.includes( value ) ) {
                            return callback( null, `Invalid value for option ${optionLabel}: ${value}. Must be either 'true'/'yes'/'1' or 'false'/'no'/'0'.` );
                        }
                        value = truthy;
                        break;
                    }
                    default:
                        break;
                }
                optionRef[ option ] = value;
                if ( option === 'provider' && graphConfig[value] === void 0 ) {
                    graphConfig[ value ] = { apiKey: '', model: '', type: 'serial' };
                    return callback(null, `'apiKey' and 'model' for provider ${value} need to be set before executing a task.` );
                } else if ( option === 'provider' || option === 'apiKey' || option === 'model' ) {
                    try {
                        modelRequest = aiFactory( graphConfig.provider, graphConfig[graphConfig.provider] );
                    } catch ( err ) {
                        debug( 'Cannot reset modelRequest in :config command.');
                    }
                }
                callback( null, `Set option ${optionLabel} to ${value}.` );
            }
            break;
        }
        case ':exit':
            return process.exit( 0 );
        case ':help':
            callback( null, 'Commands:\n' +
                '  <task> - execute a task\n' +
                '  :save <filename> - save the graph to a file, format is determined by the file extension (supported formats: svg, tex (LaTex via tikZ), gif, tiff, webp, pdf, png, jp(e)g, json)\n' +
                '  :show [<format>] - show the graph in a given format\n' +
                '  :undo - undo the last command\n' +
                '  :redo - redo the last command\n' +
                '  :config [<option> [<value>]] - set a configuration option for the graph or print its value\n' +
                '  :reset - reset the graph to the initial state\n' +
                '  :history [<n>] - show the last n commands (default: 10)\n' +
                '  :exec <filename> - load a file containing commands\n' +
                '  :load <filename>.json - load a saved graph as the current state\n' +
                '  :transcript <filename> - save the transcript to a file\n' +
                '  :help - show this help message\n' +
                '  :intro - give descriptive introduction to how graphmaker is used\n' +
                '  :examples - give example prompts that can be run or modified to explore graphmaker\n' +
                '  :exit - exit the program' );
            break;
        case ':intro':
            callback( null, 'ATTN: Introductory explanation.');
            break;
        case ':examples': {
            const manifest = require( './../examples/manifest.json' );
            const readlineInterface = readline.createInterface( {
                input: process.stdin,
                output: null,
                historySize: 0,
                prompt: '? ',
                terminal: false
            } );
            isReadingInSubShell = true;
            while ( true ) {
                for ( let i = 1; i <= manifest.length; ++i ) {
                    process.stdout.write( `${format('%2d. ', i)}${manifest[i-1].name}\n` );
                }
                process.stdout.write( ' q. Exit examples\n');
                process.stdout.write( 'Which example would you like to see? ' );
                const answer = await readlineInterface.question( '' );
                if ( answer === 'q' ) {
                    break;
                }
                const choice = parseInt( answer, 10 );
                if ( choice > 0 && choice <= manifest.length ) {
                    const dir = path.join( __dirname, '..', 'examples', manifest[choice-1].path );
                    const fPath = path.join( dir, 'tasks.txt' );
                    const tasks = fs.readFileSync( fPath, 'utf8' );
                    process.stdout.write( align( tasks, 4 ) );
                    process.stdout.write( '\n' );
                    process.stdout.write( 'Do you want to run this example? (y/n) ' );
                    const run = await readlineInterface.question( '' );
                    console.log( 'run: ', run );
                    if ( run.toLowerCase() === 'y' ) {
                        // Load the resulting graph from running the example's tasks:
                        const json = JSON.parse( fs.readFileSync( path.join( dir, 'graph.json' ), 'utf8' ) );
                        [ replState ] = await updateGraph( replState, setGraph( json ) );

                        // Show the graph (as in :show with the default format)
                        isReadingInSubShell = false;
                        await replEval( ':show', () => null, server );
                        isReadingInSubShell = true;
                    }
                } else {
                    process.stdout.write( 'Invalid example specified.\n' );
                }
            }
            isReadingInSubShell = false;
            callback( null, '' );
            break;
        }
        default:
            if ( cmd.startsWith( ':' ) ) {
                return callback( null, `Unknown command: '${cmd}'. Type ':help' to see the list of commands.` );
            }
            [ replState, output ] = await updateGraph( replState, task( cmd, modelRequest ) );
            if ( !handleErrors( output, callback ) ) {
                callback( null, 'As you wish.' );
            }
            break;
    }
}

//
// Main event loop
//
const replServer = repl.start({
    prompt: '> ',
    eval: async ( cmd, _context, _name, callback ) => replEval( cmd, callback, replServer ),
    writer: ( output ) => {
        return output;
    },
    completer: ( line ) => {
        if ( !line.startsWith( ':' ) ) {
            return [ [], line ];
        }
        if ( line.startsWith( ':show' ) ) {
            const hits = FORMATS.map( ( f ) => `:show ${f}` ).filter( ( c ) => c.startsWith( line ) );
            return [ hits, line ];
        }
        if ( line.startsWith( ':config' ) ) {
            const hits = Object.keys( clOptions )
                .map( ( o ) => `:config ${o}` )
                .filter( ( c ) => c.startsWith( line ) );
            return [ hits, line ];
        }
        if ( /^:save\s*.*\.[a-z]*$/.test( line ) ) {
            const baseName = line.substring( 0, line.lastIndexOf( '.' )+1 );
            const hits = FORMATS.map( ( f ) => `${baseName}${f}` ).filter( ( c ) => c.startsWith( line ) );
            return [ hits, line ];
        }
        const hits = COMMANDS.filter((c) => c.startsWith(line));
        return [ hits, line ];
    },
    terminal: true
});

replServer.setupHistory( path.join( os.homedir(), '.graphmaker_history' ), ( err ) => {
    if ( err ) {
        debug( err );
    }
});

function executeCommand(command) {
    replServer.write(`${command}\n`);
}
