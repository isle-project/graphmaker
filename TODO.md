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

-  [ ] handle z-index
-  [ ] add export to tikz
-  [ ] text in PDF export
-  [ ] add support for linear constraints for fixed positioning (?)
-  [ ] add edge, label, and adjustment positioning phases to the automatic positioning
-  [ ] modify :show command to take an optional argument (start/open)
-  [ ] :set command add to config in repl  (use case: turn names on or off)
-  [ ] :load command to load script from file while repl continues
-  [ ] handle arrow styles
-  [ ] handle fill styles
-  [ ] handle line styles
-  [ ] user-defined node and edge attributes
-  [ ] clean-up the code
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
