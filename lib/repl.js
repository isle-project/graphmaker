const repl = require( 'repl' );
const debug = require( 'debug' )( 'graphmaker:repl' );
const fs = require( 'fs' );
const path = require( 'path' );
const os = require( 'os' );
const { initializeGraph, updateGraph, redo, resetGraph, undo, save, task } = require( './index.js' );

function handleErrors( output, callback ) {
    if ( output && output.kind === 'ERRORS' ) {
        output.data.forEach( x => debug( x ) );
        callback( null, output.data.map( x => x.message ).join( '\n' ) );
        return true;
    }
    return false;
}

let replState = initializeGraph( { apiKey: 'ATTN' } );

const replServer = repl.start({
    prompt: '> ',
    eval: async ( cmd, _context, _name, callback ) => {
        cmd = cmd.trim();
        const idx = cmd.indexOf( ' ' );
        let command;
        let arg;
        if ( idx !== -1 ) {
            command = cmd.substring( 0, idx );
            arg = cmd.substring( idx + 1 );
        } else {
            command = cmd;
        }
        let output;
        switch ( command ) {
            case ':show':
                [ replState, output ] = await updateGraph( replState, save() );
                callback( null, JSON.stringify( replState.graph, null, 2 ) );
                break;
            case ':svg': {
                [ replState, output ] = await updateGraph( replState, save( 'svg' ) );
                if ( handleErrors( output, callback ) ) {
                    return;
                }
                // Write the SVG to a temporary file:
                const dir = fs.mkdtempSync( path.join( os.tmpdir(), 'graphmaker-' ) );
                const filename = path.join( dir, 'graph.svg' );
                fs.writeFileSync( filename, output.data );

                // Open the SVG in the default browser with Node.js child_process (cross-platform):
                const { exec } = require( 'child_process' );
                exec( `start ${filename}` );

                callback( null, output.data );
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
            case ':history':
                // TODO: Show the history
                break;
            case ':save':
                // TODO: Save the graph to a file and a format (optional)
                break;
            case ':help':
                callback( null, 'Commands:\n' +
                    '  <task> - execute a task\n' +
                    '  :save <file> [<format>] - save the graph to a file in a given format\n' +
                    '  :show - show the current graph\n' +
                    '  :undo - undo the last command\n' +
                    '  :redo - redo the last command\n' +
                    '  :reset - reset the graph to the initial state\n' +
                    '  :history - show the history of commands\n' +
                    '  :help - show this help message\n' +
                    '  :exit - exit the program' );
                break;
            case ':exit':
                return process.exit( 0 );
            default:
                [ replState, output ] = await updateGraph( replState, task( cmd ) );
                if ( !handleErrors( output, callback ) ) {
                    callback( null, 'As you wish.' );
                }
                break;
                // callback( null, 'Unknown command: \''+command+'\'' );
        }
    },
    writer: ( output ) => {
        return output;
    }
});

replServer.setupHistory( path.join( os.homedir(), '.graphmaker_history' ), ( err ) => {
    if ( err ) {
        debug( err );
    }
});
