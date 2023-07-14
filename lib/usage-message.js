const { table, getBorderCharacters } = require( 'table' );
const clOptions = require( './spec/cli-options.json' );

/**
 * Returns a usage message showing all available commands.
 */
function usageMessage() {
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

module.exports = usageMessage;
