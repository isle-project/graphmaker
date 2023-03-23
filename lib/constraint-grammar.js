// Generated automatically by nearley, version 2.20.1
// http://github.com/Hardmath123/nearley
(function () {
function id(x) { return x[0]; }

const moo = require("moo");

const lexer = moo.compile({
  ws: { match: /\s+/, lineBreaks: true },
  number: { match: /(?:-?\d+(?:\.\d+)?|-?\.\d+|0)/, value: numstr => Number(numstr) },
  node: {
            match: /(?:'[^'\n]+'|[A-Za-z][-A-Za-z0-9_:<>,;]*)/,
            value: s => {
                if ( s.startsWith("'") ) {
                    return s.slice(1, -1);
                }
                return s;
            }
        },
  dim: { match: /\.\s*[xy]/, value: s => s.slice(s.length - 1) },
  lparen: '(',
  rparen: ')',
  plusOrMinus: /[-+]/,
  mult: '*',
  div: '/',
  eq: /[<>]?=/,
  unrecognized: moo.error
});

function dropWhitespace( data ) {
    return data.filter( item => item !== null );
}

function ignore( _ ) {
    return null;
}

function sumConstants( acc, item ) {
    if ( item.type === 'NUMBER' ) {
        return acc + item.coef;
    }
    return acc;
}

function processConstraint( data ) {
    const [lhsTerms, op, rhsTerms] = dropWhitespace( data );
    let rhs = rhsTerms.reduce( sumConstants, 0 ) - lhsTerms.reduce( sumConstants, 0 );

    // Final rhs is sum of NUMBERs in rhs terms minus sum of NUMBERs in lhs terms.
    // Coefficients in rhs terms multiplied by -1.
    // Coefs are reduced by merge, combining repeated nodes by summing.

    const coefs = lhsTerms.
        concat( rhsTerms.reduce( (coll, item) => {
            if ( item.type === 'TERM' ) {
                coll.push( { ...item, coef: -1 * item.coef } );
            }
            return coll;
        }, [] ) ).
        reduce( (acc, node) => {
            const name = node.node;
            const dim = node.coord === 'x' ? 0 : 1;
            if ( acc[name] !== void 0 ) {
                acc[name][dim] += node.coef;
            } else {
                const coefs = [0, 0];
                coefs[dim] = node.coef;
                acc[node.node] = coefs;
            }
            return acc;
        }, {});

    return { coefs, rhs, relation: op.value };
}


var grammar = {
    Lexer: lexer,
    ParserRules: [
    {"name": "constraint", "symbols": ["expr", "_", (lexer.has("eq") ? {type: "eq"} : eq), "_", "expr"], "postprocess": processConstraint},
    {"name": "expr", "symbols": ["pterm"], "postprocess": id},
    {"name": "expr", "symbols": ["expr", "_", (lexer.has("plusOrMinus") ? {type: "plusOrMinus"} : plusOrMinus), "_", "pterm"], "postprocess": 
        function( data ) {
            const [lhs, op, rhs] = dropWhitespace( data );
            const sign = (op.value === '-') ? -1 : 1;
            return lhs.concat( rhs.map( trm => {
                                   trm.coef *= sign;
                                   return trm;
                               }) );
        }
                },
    {"name": "pterm", "symbols": ["term"]},
    {"name": "pterm$ebnf$1", "symbols": [(lexer.has("mult") ? {type: "mult"} : mult)], "postprocess": id},
    {"name": "pterm$ebnf$1", "symbols": [], "postprocess": function(d) {return null;}},
    {"name": "pterm", "symbols": [(lexer.has("number") ? {type: "number"} : number), "_", "pterm$ebnf$1", "_", "coordinateGroup"], "postprocess": 
        function( data ) {
            const coords = data[data.length - 1];
            const coef = data[0].value;
            return coords.map( coord => ({
                    ...coord,
                    coef: coord.coef * coef
                   }) );
        }
        
                 },
    {"name": "pterm", "symbols": ["coordinateGroup", "_", (lexer.has("div") ? {type: "div"} : div), "_", (lexer.has("number") ? {type: "number"} : number)], "postprocess": 
        function( data ) {
            const coords = data[0];
            const coef = 1.0 / data[data.length - 1];  // ATTN:check error if value is zero
            return coords.map( coord => ({
                    ...coord,
                    coef: coord.coef * coef
                   }) );
        }
                 },
    {"name": "term$ebnf$1", "symbols": [(lexer.has("mult") ? {type: "mult"} : mult)], "postprocess": id},
    {"name": "term$ebnf$1", "symbols": [], "postprocess": function(d) {return null;}},
    {"name": "term", "symbols": [(lexer.has("number") ? {type: "number"} : number), "_", "term$ebnf$1", "_", "coordinate"], "postprocess": 
        function( data ) {
            const coord = data[data.length - 1];
            const num = data[0].value;
            return { ...coord, coef: coord.coef * num };
        }
                },
    {"name": "term", "symbols": ["coordinate", "_", (lexer.has("div") ? {type: "div"} : div), "_", (lexer.has("number") ? {type: "number"} : number)], "postprocess": 
        function( data ) {
            const coord = data[0];
            const num = data[data.length - 1].value;     // ATTN: Check for 0
            return { ...coord, coef: coord.coef / num };
        }
                },
    {"name": "term", "symbols": ["coordinate"], "postprocess": id},
    {"name": "term", "symbols": [(lexer.has("number") ? {type: "number"} : number)], "postprocess": 
        function( data ) {
            return {
                type: 'NUMBER',
                coef: data[0].value
            };
        }
                },
    {"name": "coordinateGroup", "symbols": [(lexer.has("lparen") ? {type: "lparen"} : lparen), "_", "coordinateSum", "_", (lexer.has("rparen") ? {type: "rparen"} : rparen)], "postprocess": 
        function( data ) {
            return dropWhitespace(data)[1];
        }
                           },
    {"name": "coordinateSum", "symbols": ["coordinateSum", "_", (lexer.has("plusOrMinus") ? {type: "plusOrMinus"} : plusOrMinus), "_", "coordinate"], "postprocess": 
        function( data ) {
            const [acc, op, coord] = dropWhitespace( data );
            const sign = op.value === '-' ? -1 : 1;
            acc.push( { ...coord, coef: sign * coord.coef } );
            return acc;
        }
                         },
    {"name": "coordinateSum", "symbols": ["coordinate"]},
    {"name": "coordinate", "symbols": [(lexer.has("node") ? {type: "node"} : node), "_", (lexer.has("dim") ? {type: "dim"} : dim)], "postprocess": 
        function( data ) {
            const [name, axis] = dropWhitespace( data );
            return {
                type: 'TERM',
                coef: 1.0,
                node: name.value,
                coord: axis.value
            };
        }
                      },
    {"name": "_", "symbols": [(lexer.has("ws") ? {type: "ws"} : ws)], "postprocess": ignore},
    {"name": "_", "symbols": [], "postprocess": ignore}
]
  , ParserStart: "constraint"
}
if (typeof module !== 'undefined'&& typeof module.exports !== 'undefined') {
   module.exports = grammar;
} else {
   window.grammar = grammar;
}
})();
