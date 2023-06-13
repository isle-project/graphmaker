const repl = require( 'repl' );
const debug = require( 'debug' )( 'graphmaker:repl' );
const readline = require('readline/promises');
const fs = require( 'fs' );
const path = require( 'path' );
const execSync = require( 'child_process' ).execSync;
const os = require( 'os' );
const { parseArgs } = require( 'util' );
const semverCompare = require( 'semver-compare' );
const { table, getBorderCharacters } = require( 'table' );
const format = require( '@stdlib/string-format' );
const omit = require( '@stdlib/utils-omit' );
const align = require( 'align-text' );
const { version: VERSION } = require( './../package.json' );
const DEFAULT_CONFIG = require( './spec/default-config.json' );
const { initializeGraph, updateGraph, redo, resetGraph, resetPositions, undo, save, task, setGraph, aiFactory } = require( './index.js' );
const { DEFAULT_EXEC_POLICIES } = require( './ai-models.js' );

const CONFIG_FILE = '.graphmaker.json';
const COMMAND_DATA = require('./spec/repl-commands.json');
const COMMANDS = COMMAND_DATA.map(x => x.command);
const FORMATS = require('./spec/output-formats.json'); //

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
        config[ config.provider ] = { apiKey: clKeys.apiKey || config.apiKey, model: clKeys.model || config.model, exec: config.exec };
    }
    if ( !config[ config.provider ]?.apiKey ) {
        console.log( 'An API key for model provider `'+config.provider+'` needs to be set with the :config command before building a graph.');
    }
    return config;
}

const clOptions = require( './spec/cli-options.json' );

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
    out.push( table( rows, {
        border: getBorderCharacters('void'),
        columnDefault: {
          paddingLeft: 2,
          paddingRight: 2
        },
        columns: {
          0: {
            alignment: 'left',
            width: 30
          },
          1: {
            alignment: 'left',
            width: 50
          }
        }
    }) );
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
async function replEval( cmd, callback, server, noCallback = false ) {
    server.setPrompt( '> ' );
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
        case ':exec-batch':
        case ':exec': {
            const configExec = graphConfig[graphConfig.provider]['exec'];
            const model = graphConfig[graphConfig.provider]['model'];
            const batch = command === ':exec-batch' || configExec === 'batch' || (configExec === 'auto' && DEFAULT_EXEC_POLICIES[model] === 'batch');
            const prefixMatch = arg.match( /prefix=(['"`])([\s\S]*?)\1/ );
            const suffixMatch = arg.match( /suffix=(['"`])([\s\S]*?)\1/ );
            const prefix = prefixMatch ? prefixMatch[ 2 ] : '';
            const suffix = suffixMatch ? suffixMatch[ 2 ] : '';
            let file = prefixMatch ? arg.replace( prefixMatch[ 0 ], '' ) : arg;
            file = suffixMatch ? file.replace( suffixMatch[ 0 ], '' ) : file;
            file = file.trim();
            const RE_LINE_COMMENT = /^\s*(?:#.*)?(?:\r?\n)+/mg;
            let execCmds = fs.readFileSync( file, 'utf8' )
                .replace( RE_LINE_COMMENT, '' )
                .trim();
            if ( batch ) {
                execCmds = execCmds.split( /^\s*(:.*\n)/m );
                execCmds[ 0 ] = prefix + '\n' + execCmds[ 0 ];
                execCmds[ execCmds.length - 1 ] = execCmds[ execCmds.length - 1 ] + '\n' + suffix;
            } else {
                execCmds = execCmds.split( /(?:\r?\n)(?!\s)/m );
                if ( prefix ) {
                    // execCmds.unshift( prefix + '\n' );   // ATTN: prefix as separate command or...??
                    execCmds[ 0 ] = prefix + '\n' + execCmds[ 0 ];
                }
                if ( suffix ) {
                    // execCmds[ execCmds.length - 1 ] = execCmds[ execCmds.length - 1 ] + '\n' + suffix;  // ATTN: suffix appended to command or...??
                    execCmds.push( suffix + '\n' );
                }
            }
            const output = [];
            for ( let i = 0; i < execCmds.length; i++ ) {
                await replEval( execCmds[ i ], ( _, out ) => output.push( out ), server, true );
            }
            // output.push(`Executed commands in file ${file}.` );
            // callback( null, output.join( '\n' ) );
            callback( null, `\nExecuted commands in file ${file}.` );
            break;
        }
        case ':load': {
            const json = JSON.parse( fs.readFileSync( arg, 'utf8' ) );
            [ replState ] = await updateGraph( replState, setGraph( json ) );
            callback( null, `Using graph in file ${arg}.` );
            break;
        }
        case ':multiline':
            server.editorMode = true;
            callback( null, 'Now in multiline mode. Use Ctrl-D to finish and Ctrl-C to cancel.' );
            server.setPrompt( '' );
            server.prompt( );
            break;
        case ':transcript': {
            const transcript = server.lines.join( '\n' );
            fs.writeFileSync( arg, transcript );
            callback( null, 'Saved transcript to file: `' + arg + '`.' );
            break;
        }
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
        case ':reposition':
            [ replState ] = await updateGraph( replState, resetPositions() );
            callback( null, 'Graph positions will be recomputed as needed.' );
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
            const baseProviderConfig = { apiKey: '', model: '', type: 'serial', exec: 'auto' };
            if ( option === 'apiKey' || option === 'model' || option === 'type' || option === 'exec' ) {
                optionLabel = `${graphConfig.provider}.${option}`;
                if ( !graphConfig[graphConfig.provider] ) {
                    graphConfig[graphConfig.provider] = baseProviderConfig;
                }
                optionRef = graphConfig[graphConfig.provider];
            } else if ( match = /^([^.]+)\.(?:apiKey|model)$/.exec( option ) ) { // eslint-disable-line no-cond-assign
                if ( graphConfig[ match[1] ] === void 0 ) {
                    graphConfig[ match[1] ] = baseProviderConfig;
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
                    case 'string':
                        if ( clOptions[ option ].enum && !clOptions[ option ].enum.includes( value ) ) {
                            return callback( null, `Invalid value for option ${optionLabel}: ${value}. Must be one of: ${clOptions[ option ].enum.join( ', ' )}.` );
                        }
                        break;
                    default:
                        break;
                }
                optionRef[ option ] = value;
                if ( option === 'provider' && graphConfig[value] === void 0 ) {
                    graphConfig[ value ] = baseProviderConfig;
                    return callback(null, `'apiKey' and 'model' for provider ${value} need to be set before executing a task.` );
                } else if ( option === 'provider' || option === 'apiKey' || option === 'model' || option === 'type' ) {
                    try {
                        modelRequest = aiFactory( graphConfig.provider, graphConfig[graphConfig.provider] );
                    } catch ( err ) {
                        debug( 'Cannot reset modelRequest in :config command.');
                    }
                }
                if ( !noCallback ) {
                    callback( null, `Set option ${optionLabel} to ${value}.` );
                }
            }
            break;
        }
        case ':exit':
            return process.exit( 0 );
        case ':help': {
            const rows = [
                [ '<task>', 'Execute a task' ],
                ...COMMAND_DATA.map( x => [ `${x.command} ${x.args}`, x.usage ])
            ];
            const help = table( rows, {
                border: getBorderCharacters('void'),
                columnDefault: {
                  paddingLeft: 2,
                  paddingRight: 2
                },
                columns: {
                  0: {
                    alignment: 'left',
                    width: 28
                  },
                  1: {
                    alignment: 'left',
                    width: 52
                  }
                }
            });
            callback( null, 'Commands:\n\n' + help );
            break;
        }
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
            if ( !handleErrors( output, callback ) && !noCallback ) {
                callback( null, 'As you wish.' );
            }
            break;
    }
}

/**
 * Generates file path completions for the given argument.
 */
function filePathCompletion( arg, fileExtensions ) {
    const noArg = !arg;
    let sepIndex = noArg ? -1 : arg.lastIndexOf( '/' );
    let cwd;
    let prefix;
    if ( noArg || sepIndex === -1  ) {
        cwd = '.';
        prefix = arg || '';
    } else {
        cwd = arg.slice(0, sepIndex);
        prefix = arg.slice(sepIndex + 1);
    }
    const files = fs.readdirSync( cwd );
    const hits = files
        .filter( ( f ) => {
            if ( !f.startsWith( prefix ) ) {
                return false;
            }
            const stat = fs.statSync( path.posix.join( cwd, f ) );
            return !stat.isFile() || !fileExtensions || fileExtensions.some( ( ext ) => f.endsWith( '.' + ext ) );
        });
    return { hits, prefix };
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
        if ( line.startsWith( ':exec' ) ) {
            if ( line === ':exec' || !line.charAt(5).match(/\s/) ) {
                return [ [':exec '], line ];
            }
            const RE = /(pre|suf)fix=(['"`])([\s\S]*?)\2/g;
            RE.lastIndex = ':exec'.length + 1;
            let match;
            let gotPrefix = false;
            let gotSuffix = false;

            // Move past :exec initially
            let pos = RE.lastIndex;
            while ( ( match = RE.exec( line ) ) !== null ) { // eslint-disable-line no-cond-assign
                if ( match[1] === 'pre' ) {
                    gotPrefix = true;
                }
                else if ( match[1] === 'suf' ) {
                    gotSuffix = true;
                }
                pos = RE.lastIndex;
            }
            if ( line.length === pos ) {
                return [ [line + ' '], line ];
            }
            match = line.substring( pos ).match( /^\s*/ );
            pos += match ? match[ 0 ].length : 0;
            let arg = line.substring( pos );
            let initial = line.slice( 0, pos );

            if ( !gotPrefix && arg.match( /^p(?:r(?:e(?:f(?:i(?:x)?)?)?)?)/ ) ) {
                if ( arg.includes('=') ) {
                    return [ [], line ];
                }
                return [ [ initial + arg + 'prefix='.slice(arg.length) ], line ];
            }
            if ( !gotSuffix && arg.match( /^s(?:u(?:f(?:f(?:i(?:x)?)?)?)?)/ ) ) {
                if ( arg.includes( '=' ) ) {
                    return [ [], line ];
                }
                return [ [ initial + arg + 'suffix='.slice(arg.length) ], line ];
            }
            const { hits, prefix } = filePathCompletion( arg, ['txt'] );
            return [ hits.map( h => line + h.slice(prefix.length) ), line ];
        }
        if (
            line.startsWith( ':transcript' ) ||
            line.startsWith( ':load' ) ||
            line.startsWith( ':save' )
        ) {
            const match = /^\s*(:[a-z]+)\s+(.*)\s*$/.exec( line );
            if ( !match ) {
                return [ [line + ' '], line ];
            }
            const cmd = match[1];
            const arg = match[2];
            const extensions = {
                ':transcript': ['txt'],
                ':load': ['json'],
                ':save': FORMATS
             };
            const { hits, prefix } = filePathCompletion( arg, extensions[cmd] );
            return [ hits.map( h => line + h.slice(prefix.length) ), line ];
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

replServer.on( 'SIGINT', () => {
    replServer.setPrompt( '> ' );
    replServer.prompt();
});
