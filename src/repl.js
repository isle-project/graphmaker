const repl = require( 'repl' );
const { initializeGraph, updateGraph, redo, resetGraph, undo, save, task } = require( './index.js' );

let replState = initializeGraph( { apiKey: "ATTN" } );

repl.start({
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
            case 'do':
                if ( !arg ) {
                    return callback( null, 'No task specified.' );
                }
                [ replState, output ] = await updateGraph( replState, task( arg ) );
                if ( output && output.kind === 'ERRORS' ) {
                    callback( null, output.data.map( x => x.message ).join( '\n' ) );
                } else {
                    callback( null, 'Task completed.' );
                }
                break;
            case 'show':
                [ replState, output ] = await updateGraph( replState, save() );
                // TODO: Figure out how to pretty-print the graph in the REPL for JSON:
                callback( null, JSON.stringify( output.data.graph, null, 2 ) );
                break;
            case 'undo':
                [ replState ] = await updateGraph( replState, undo() );
                callback( null, 'Moved back one step.' );
                break;
            case 'redo':
                [ replState, output ] = await updateGraph( replState, redo() );
                callback( null, 'Moved forward one step.' );
                break;
            case 'reset':
                [ replState ] = await updateGraph( replState, resetGraph() );
                callback( null, 'Reset graph to initial state.' );
                break;
            case 'history':
                // TODO: Show the history
                break;
            case 'save':
                // TODO: Save the graph to a file and a format (optional)
                break;
            case 'help':
                callback( null, 'Commands:\n' +
                    '  do <task> - execute a task\n' +
                    '  save <file> [<format>] - save the graph to a file in a given format\n' +
                    '  show - show the current graph\n' +
                    '  undo - undo the last command\n' +
                    '  redo - redo the last command\n' +
                    '  reset - reset the graph to the initial state\n' +
                    '  history - show the history of commands\n' +
                    '  help - show this help message\n' +
                    '  exit - exit the program' );
                break;
            case 'exit':
                callback( null, 'Exiting...' );
                process.exit( 0 );
            default:
                callback( null, 'Unknown command: \''+command+'\'' );
        }
    },
    writer: ( output ) => {
        return output;
    }
});
