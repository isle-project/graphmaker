# TODO
## Immediate
-  [ ] DOC Write README/intro/tips documentation (one doc shared in repo and with :intro and :tips commands) [CG & PB, serial?]
-  [ ] DOC Create a gallery [PB]

## Soon
-  [ ] FIX: handle forests in isTree check by separating components and positioning trees at different ranges of x (or y depending on orientation)
-  [x] Allow constraints to access not just center (.x, .y) but also bounding box coordinates (@e, @w, @s, @n, @nw, @ne, @se, @sw, and @c or none) for nodes
-  [ ] Add color translation/fixing capability:  e.g., "steel blue" -> "steelblue", "light steel blue" -> appropriate hex color, translating web colors -> xcolors for tikz, etc.  Use `color-convert` package
-  [ ] Add a prompt when trying to overwrite an existing file to confirm [PB]
-  [ ] Add to graph schema an optional field in edges:  direction = None | Directed | BiDirected and change display so that individual edge property overrides graph general directed setting
-  [ ] Add a new kind of decoration: arrow
-  [ ] PROVISIONAL Add labelJustify style (none, left, right, center) for nodes, edges, and text decorations (is labelWidth needed? or scale for node/edge size)
-  [ ] PROVISIONAL Add a new kind of constraint   DECORATION contains NODE1,...,NONEn. Possible UPDATE: Simpler and almost as functional -- Add a new way of specifying a decoration
-  [ ] PROVISIONAL Do not swallow all errors during REPL usage; figure out which errors should be displayed and how
-  [ ] PROVISIONAL Second phase positioning adjustments that improve the overall look and feel
-  [ ] PROVISIONAL Alternate initialization of positions using presence of edges as an implicit metric (as in multi-dimensional scaling)
       Related to this: should connected components be given roughly different zones in the initial positioning (bipartite case weird?)
-  [ ] PROVISIONAL Add a default pre-existing decoration "canvas" of type invisible whose coordinates are fixed at the canvas boundary (useful in constraints)

## Admin
-  [ ] ADMIN add a test suite and get existing tests to pass

## Future
-  [ ] FUTURE adjust parser to allow multipliers of parenthetical expressions on the right [CG]
-  [ ] FUTURE adjust parser so that < and > by themselves as equivalent to <= >= [CG]
-  [ ] FUTURE Add either a `:freeze` command to fix the current positions of nodes by turning them into constraints and an `:unfreeze` command to remove constraints (injected constraints would be identifiable via e.g. `derived` property) or we could also have a `config` `frozen` option to fix positions of nodes at those in _positions (if any nodes are not in _positions, we add transient constraints like in the last case for those that are and apply the positioning to set the _positions of the new nodes)
-  [ ] FUTURE Handle config changes (e.g., orientation) that allow positions to be reset when a *real* change in orientation takes place (one approach: config interface that distinguishes reified values from pending values  [current, last].   setting an unreified value sets it to last if current is last, otherwise to [current, last]; getting returns the current; getReified returns current and sets value to current as a reified value.  Alternative: a lastOrientation state that gets compared.)
-  [ ] FUTURE URL encoding of graph state for easy sharing, serving, linking, etc.
-  [ ] FUTURE support opacity in colors (use case: colorful decoration regions)
-  [ ] FUTURE support other LLM providers such as Google Bard, Anthropic, etc.
-  [ ] FUTURE handle arrow styles (easy in tikz); includes arrow heads and features like double arrows etc.

## Completed
-  [x] FIX correctly handle fillStyle (and check other styles) in to-tikz [CG]
-  [x] FIX in convertConstraint if a node in the constraint does not exist in nodesInOrder, ignore the constraint [CG]
-  [x] ADD ':show graph' command gives a clear, easy to read, text description of the current graph: node names, adjacency list(?), labels?, constraints as equations?
       Can also allow ':show [nodes|edges|constraints|decorations]' to give a textual summary of each type that might be less overwhelming, and which could also be given in more detail than in the general summary.
-  [x] TOOL README template and construction script (with description.human tags in schema, graphmaker usage, etc.) [CG]
-  [x] PROVISIONAL add an `autoshow` config that executes a :show (with format given in the config, default svg) after each non-command task
-  [x] FEATURE :help accepts (optional) text as an argument sent to AI (with separate task and getting the human descriptions in the schema)
-  [x] FIX resolve cutoff of the canvas in PDF export (causing e.g. wider rectangles to be not fully visible right now) [PB]
-  [x] FIX? PDF files are very large; seems that it should be convertible to much smaller size [PB]
-  [x] ADMIN clean-up and reorganize the code
-  [x] ADMIN add documentation in the code where required
-  [x] TEST Make sure the output of all examples is correct (at least most of the time)
-  [x] TEST Use decorations in examples to make sure they work
-  [x] FEAT Command (:reposition) and state option (e.g., resetPositions) to cause the _positions data to be reset in populateGraph [CG]
-  [x] FIX use GPT3 tokenizer to count the number of tokens in the prompt and adjust the assembled history prompt if necessary [PB]
-  [x] Improve indentation and line wrapping for REPL usage printout [PB]
-  [x] FIX Handle Bezier case for edge positioning on general nodes [CG & PB]
-  [x] REFACTOR Change iteration limit and annealing ratio in node position simulation (all more iteration) [CG & PB] 
-  [x] FIX Remove _description tags from schema in schemaMessage() [CG & PB]
-  [x] DOC Finish examples 
-  [x] PROVISIONAL support an array of styles for nodes, edges, and decorations 
-  [x] PROVISIONAL Allow names on decorations 
-  [x] SCHEMA add loopDirection to edge definition in graph schema; this is the direction that a self-loop points out of the node; integrate into calls to selfLoop
-  [x] ADMIN Compress schema a bit more
-  [x] FEAT Add none/invisible node shape
-  [x] FIX clean-up the adjacency `Set` checks as needed
-  [x] FEATURE Add file path completions to REPL
-  [x] FIX arrowhead line should always be solid
-  [x] FIX ai-models configuration of model (from config, not hard coded; need to change signatures)
-  [x] POS automatic positioning of self loops (including handling of multiple self loops for the same node), e.g. histogram approach (with say 10 degree bins)
-  [x] FIX Handle LaTeX node labels in tikz
-  [x] FIX support fontColor for SVG latex labels
-  [x] PRIORITY :command to load adjacency matrices from a file (grammar flexible for different reasonable formats for the adjacency matrix)
-  [x] PROVISIONAL Read node/edge attributes from file/data
-  [x] FIX self-loop boundary positions for all shapes 
-  [x] Handle diamond/triangle/ellipse boundary detection for edge positioning for linear edges
-  [x] FIX Set marker color for arrow heads to match line color of the edge
-  [x] PRIORITY add support for label coloring (for edges and nodes)
-  [x] PRIORITY user-defined node and edge attributes 
-  [x] IMMEDIATE incorporate nodePositions2 in lieu of nodePositions (changes calling sequence), and test that category gets set (e.g., automata)
-  [x] IMMEDIATE repl :config command set API key, or from command line, or from standard file (e.g., ~/.graphmaker.config)
-  [x] IMMEDIATE generate a platform-independent (as much as possible) installer script for the graphmaker repl tool
       Needs to (i) install Node.js / npm, dependencies, (ii) create base config, (iii) install executable script, (iv) prompt with help in storing API key etc
-  [x] IMMEDIATE repl message on retries (alive/progress indicator)
-  [x] IMMEDIATE in repl, use dynamic require to load expensive modules only when needed (e.g., sharp when saving PDF) to improve startup
-  [x] IMMEDIATE finish help text for --help option, check version for outdated reminder
-  [x] PRIORITY+ add LaTeX support for labels (!)  [Plan: use mathjax to generate SVG elements]  ALTERNATIVE: Mathlingo support for labels, possible config
-  [x] LaTeX equation positioning
-  [x] Positions encoded as x, y props on nodes used as starting points; missing positions are randomized (used _positions instead)
-  [x] With no initial positions, order in x (or y) in the node order given (random order statistics) and randomize other dimension
-  [x] add inequality constraints to node positioning
-  [x] add export to tikz 
-  [x] :config command add to config in repl  (use cases: turn names on or off, canvas dimensions)
-  [x] finish fill styles
-  [x] insert node x,y for starting/current positions to provide stability
-  [x] Experiment with AI specification of constraints (e.g., C is at the midpoint of the line from A to B, A is above B, A-C are at the same horizontal position, A is at center of the other nodes)
-  [x] Parse constraint strings into suitable matrix-rhs specs
-  [x] handle line styles
-  [x] add new entry point for node positioning
-  [x] add support for linear constraints for fixed positioning (?)
-  [x] :load command to load script from file while repl continues
-  [x] :history and :transcript command support
-  [x] modify :show command to take an optional argument (start/open)
-  [x] text in PDF export
-  [x] add weight offset and relative offsets to tangent and midpoint for edge label and weight.
-  [x] custom fonts for node and edge labels and decoration text
-  [x] add position offsets 
-  [x] finish label styling for nodes and edges
-  [x] add support for node and edge labels and weights
-  [x] add support for label rotation for edges
-  [x] node sizing
-  [x] check support for named styles
-  [x] add export to PNG, PDF, SVG
-  [x] add support for non-linear edges (cubic Bezier curve; generate control points for non-zero angles)
-  [x] add support for decorations (freely positioned rectangles and texts)
-  [x] add support for square, rectangle, ellipse node shapes 
-  [x] add automatic retries and error handling
-  [x] add triangle and diamond node shapes
-  [x] add softness parameters to graph schema
-  [x] reverse sign of angle entering so 45, 45 for example is a nice arc
-  [x] fix arrowhead offsets

# Notes

Library that takes a series of commands and returns a State that is up

init() -> initial-state for a new graph
update(State, Command) -> (State, Maybe Output)


Command = Prompt String | Undo | Redo | Export Format
Format = SVG | PNG | PDF | ... | Internal   (SVG is the default)
Output = Error String | Graph String | ...
State = { graph, history: Array<HistoryElement> }   // Preferred conceptually
HistoryElement = { graph, prompt, exported?, ...}
// State = Array<HistoryElement>   // Alternative, current graph is last

Task: Write a small library implementing the above interface.


Web UI, REPL interface,

JSON schema validation, OpenAI requests, 

immer  for the GraphState ?

# Library API

 initializeGraph() -> GraphState
 updateGraph(GraphState, Command) -> (GraphState, Result<GraphOutput>)

# Command generates
 task(prompt: String) -> Command
 undo() -> Command
 redo() -> Command
 export(format: String) -> Command

Command 
{ type: 'export', payload: 'svg | png | pdf | json' }
{ type: 'task', payload: 'userPrompt' }
{ type: 'redo', payload: null }
{ type: 'undo', payload: null }



# Hit export button or enter "export png" at the repl
 updateGraph(state, export("png")) -> (state', Some<PNGFile>)

updateGraph for task:
1) injects the user prompt into our template
2) call OpenAI API with the constructed prompt
3) parse the response and validates it against the JSON schema
4) updates the graph state with the new graph and the updated history
5) returns (GraphState,None)

# Move positioning from toSVG to the save function

-   if any position is missing, reposition all the nodes except for those that are fixed; otherwise, refine the positions using the existing positions as a starting point

# Specifying Constraints

Option 1. Specify constraints by object, rhs pairs

  Ex:  { A: { x: 1, y: 0 }, B: {x: -1} }  ,  0
  
       This is the constraint that A and B have the same x coordinate,
       i.e., A.x - B.x = 0.
       
Option 2. (Preferred for now) Specify constraints by simple strings       

  Ex:  A.x - B.x = 0
       A.x + B.x = 2 C.x
       A.y + B.y = 2 C.y

  A grammar for constraints is:

  ```
    constraint <- expr = expr
                | expr <= expr
     
    expr <- expr '+' term
         |  expr '-' term
     
    term <- coordinate
         |  number '*'? coordinate
         |  coordinate '/' number
         |  number
     
    coordinate <- name '.' [xy]
     
    name <- '[^']+'
  ```
       
  Right now the names forbid ', but this can be escaped.
  Spaces are allowed between tokens.
  
  Let's construct a regular expression for constraints:
  
  name = /'[^']+'/
  coordinate = /name \s*\.\s* [xy]/
  number = (?: [0-9] )...    # NO SCIENTIFIC NOTATION HAH 
  term = (?: number  (?: \s*\*?\s* coordinate)? | coordinate (?: \s*/\s* number)?)
  coordinateSum = coordinate (?: [-+] coordinate)*
  pterm = (?: term | number (\s*\*?\s*)? \( coordinateSum \) | \( coordinateSum \) (?: \s*/\s* number)?)
  expr = pterm (?: \s*[-+]\s* pterm)*
  constraint = expr (?: <?=) expr

  
  
    A grammar for constraints is:

  ```
  
  name <- '[^']+'

  coordinate <- name '.' [xy]
    
  coordinateSum <- coordinate
                   | coordinateSum '+' coordinate
                   | coordinateSum '-' coordinate
     
  term <- coordinate
         |  number '*'? coordinate
         |  coordinate '/' number
         |  number
         
  pterm <- term
          |  number '*'? '(' coordinateSum ')'
          |  '(' coordinateSum ')' '/' number
     
  expr <- expr '+' pterm
         |  expr '-' pterm
     
  constraint <- expr = expr
                | expr <= expr
  ```
 

```js
function constraintRegEx() {
    const name = /'[^']+'/;
    const coordinate = new RegExp(
      `(${name.source})\\s*\\.\\s*([xy])`
    );  
    const number = /(?:0|-?\d+(?:\.\d+)?|-?\.\d+)/;
    const term = new RegExp(
      `(?:${number.source}(?:\\s*\\*?\\s*${coordinate.source})?|${coordinate.source}(?:\\s*/\\s*${number.source})?)`
    );
    const expr = new RegExp(
      `${term.source}(?:\\s*[-+]\\s*${term.source})*`
    );
    const constraint = new RegExp(
      `^\\s*${expr.source}\\s*[<>]?=\\s*${expr.source}\\s*$`
    );
    return constraint;
}
```

JS function handling pterms and coordinateSum:

```js
function constraintRegEx() {
    const name = /(?:'[^'\n]+'|[A-Za-z][-A-Za-z0-9_:<>,;]*)/;
     const coordinate = new RegExp(
      `(${name.source})\\s*\\.\\s*([xy])`
    );  
    const number = /(?:0|-?\d+(?:\.\d+)?|-?\.\d+)/;
    const term = new RegExp(
      `(?:${number.source}(?:\\s*\\*?\\s*${coordinate.source})?|${coordinate.source}(?:\\s*/\\s*${number.source})?)`
    );
    const coordinateSum = new RegExp(
      `${coordinate.source}(?:\\s*[-+]\\s*${coordinate.source})*`
    );
    const pterm = new RegExp(
      `(?:${term.source}|${number.source}(?:\\s*\\*?\\s*)?\\(${coordinateSum.source}\\)|\\(${coordinateSum.source}\\)(?:\\s*/\\s*${number.source})?)`
    );
    const expr = new RegExp(
      `${pterm.source}(?:\\s*[-+]\\s*${pterm.source})*`
    );
    const constraint = new RegExp(
      `^\\s*${expr.source}\\s*[<>]?=\\s*${expr.source}\\s*$`
    );
    return constraint;
}
```   



  A grammar for constraints is: constraint <- expr = expr | expr <= expr; expr <- expr '+' term |  expr '-' term;
     
    term <- coordinate
         |  number '*'? coordinate
         |  coordinate '/' number
         |  number
     
    coordinate <- name '.' [xy]
     
    name <- '[^']+'
  ```

    expr <- expr '+' pterm
         |  expr '-' pterm

    pterm <- term
          |  number '*'? '(' coordinateSum ')'
          |  '(' coordinateSum ')' '/' number

    coordinateSum <- coordinate
                   | coordinateSum '+' coordinate
                   | coordinateSum '-' coordinate
                   
     
     # Inequality Constraints

     Equality constraints      A x = b     A is a c by n matrix
     Inequality constraints    L x <= d    L is an s by n matrix

     Two cases: 1 . s + c <= n, 2. s + c > n.

     SVD for A:   U [D 0] [V_1 V_0]^T    U is  c by x,  D is C by n,  [V_1 V_0] is n by n orthogonal

     Equality constraints:  If I have a feasible solution, x_0,   x_0 + Null(A)  is also feasible
                            Feasible solution:   base =  V_1 D^-1 U^T b     base + Null(A)
                            Initial positions: project given positions onto the affine space  base + Null(A)

     Inequality constraints: If I have a feasible solution, x_0.   Force F(x_0) and project on Null(A)
                                     x_1 = x_0 + delta P_0 F(x_0)   (like before except delta is chosen so that L x_1 <= d).
                                     s_0 = d - L x_0
                                     s_1 = d - L x_1 = s_0 - delta L P_0 F(x_0).  Need s_1 >= 0 to find delta.
                            Stop when || P_0 F(x_0) || = 0 or (?!) when delta = 0.   (Issue 2. Probably minor or not an issue.)
                            Issue 1. Finding a feasible solution.

                            Use x_0 from before as an initial guess and then modify to ensure  L x_0' <= d
                            Assume that either  L x_0 <= d or rank(L V_0) = s.

                            Case 1. s + c <= n.    (n - c >= s)
                                    L V_0  defines a subspace spanned by s orthogonal vectors. 
                                    x s.c   L x_0 + L V_0 x <= d  or   L V_0 x <= d_0 == d - L x_0
                                    Feasible solution   x_0' = x_0 + (L V_0)^dagger y   for any y <= d_0.
                            Case 2.  s + c > n   (or 0 < rank(L V_0) < s)
                                     min_alpha  sum_i  (alpha^T z_i - d_i - epsilon)_+^2

                            
## Prompts for categorizing graphs

The following prompt describes a graph consisting of nodes and edges. In at most five words, specify any categories or labels that describe the graph. Examples of categories include tree, acyclic, bipartite, complete, directed/undirected, simple/non-simple (multiple edges between two nodes or edges to itself) 


1. add nodes A-C to an undirected graph
2. add an edge from A to B 
3. add an edge from A to A
4. add another edge from A to B

Categories as a JSON array (up to five):
