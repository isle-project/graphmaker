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

# TODO


-  [x] handle line styles
-  [ ] handle fill styles
-  [ ] insert node x,y for starting/current positions to provide stability
-  [ ] Experiment with AI specification of constraints (e.g., C is at the midpoint of the line from A to B, A is above B, A-C are at the same horizontal position, A is at center of the other nodes)
-  [ ] PROVISIONAL handle arrow styles
-  [ ] add export to tikz
-  [ ] add support for linear constraints for fixed positioning (?)
-  [ ] add edge, label, and adjustment positioning phases to the automatic positioning
-  [ ] user-defined node and edge attributes
-  [ ] clean-up the code
-  [ ] handle z-index
-  [ ] PROVISIONAL :set command add to config in repl  (use case: turn names on or off)
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


# Specifying Constraints

Option 1. Specify constriants by object, rhs pairs

  Ex:  { A: { x: 1, y: 0 }, B: {x: -1} }  ,  0
  
       This is the constraint that A and B have the same x coordinate,
       i.e., A.x - B.x = 0.
       
Option 2. (Preferred for now) Specify constraints by simple strings       

  Ex:  A.x - B.x = 0
       A.x + B.x = 2 C.x
       A.y + B.y = 2 C.y

  A rough grammar is

  ```
    constraint <- expr = expr
                | expr <= expr
     
    expr <- term '+' term
         |  term '-' term
     
    term <- coordinate
         |  number [*] coordinate
         |  coordiate / number
         |  number
     
    coordinate <- name '.' [xy]
     
    name <- '[^']+'
  ```
       
  Right now the names forbid ', but this can be escaped.
  
