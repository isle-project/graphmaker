# graphmaker

> GraphMaker is a tool for creating, manipulating, and exporting graphs using natural language.

---

<p align="center" >
  <img src="https://raw.githubusercontent.com/isle-project/graphmaker/main/graphmaker.gif" alt="Logo" style="width: 75%;" />
</p>

---

## REPL tool

### Installation

#### Via installation script:

To install or update `graphmaker`, you can run the install script. You may either download and run the script manually, or use one of the following commands:

```bash
curl -sSL https://raw.githubusercontent.com/isle-project/graphmaker/install-graphmaker.sh | bash
```

```bash
wget -sSL https://raw.githubusercontent.com/isle-project/graphmaker/install-graphmaker.sh | bash
```

#### Via npm:

```bash
npm install -g graphmaker
```

### Usage

Start the REPL:

```text
graphmaker 
```

```txt
Usage: graphmaker [options]

Options:

  -h,    --help                Print this message.
  -V,    --version             Print the package version.
  -p,    --provider NAME       Model provider ("OpenAI").
  -m,    --model NAME          Model to use ("gpt-3.5-turbo").
  -a,    --apiKey KEY          Model provider API key.
  -w,    --width PIXELS        Width of the graph.
  -h,    --height PIXELS       Height of the graph.
  -d,    --draft               Enable draft mode.
  -c,    --config FILE_PATH    Path to JSON configuration file.
```

### REPL Commands

```text
Commands:
  <task> - execute a task
  :save <filename> - save the graph to a file, format is determined by the file extension
  :show [<format>] - show the graph in a given format
  :undo - undo the last command
  :redo - redo the last command
  :config <option> [<value>] - set a configuration option for the graph or print its value
  :reset - reset the graph to the initial state
  :history <n> - show the last n commands (default: 10)
  :exec <filename> - load a file containing commands
  :load <filename>.json - load a saved graph as the current state
  :transcript <filename> - save the transcript to a file
  :help - show this help message
  :exit - exit the program
```

## JavaScript / Node.js library

### Installation

```bash
npm install graphmaker
```

### Usage

```javascript
const GraphMaker = require( 'graphmaker' );

const state = GraphMaker.initializeGraph( config );

const oracle = GraphMaker.aiFactory( 'openai' );

// Update the graph with a natural language prompt:
const [ newState, output ] = await GraphMaker.updateGraph( state, GraphMaker.task( 'Add a node A', oracle ) );

// Export the graph in various formats:
const [ _, svgOutput ] = await GraphMaker.updateGraph (state, GraphMaker.save({ format: 'svg' }) );
```

### API

#### .initializeGraph(config)

Initializes a new graph state with the given configuration options.

##### Arguments

-   `config`: configuration options

##### Returns

The initial graph state


#### aiFactory(provider, {type, model})

Creates an AI instance for generating directed and undirected graphs that match a specified JSON schema. The AI instance will be responsible for ensuring that nodes, edges, and properties are set correctly according to the schema.

##### Arguments

-   `provider`: the AI provider to use (currently only supports 'openai')
-   `options`: the options for the AI instance
    -   `options.type`: the type of AI instance to create (supports 'memoryless' and 'serial')
    -   `options.model`: the AI model to use (currently only supports 'gpt-3.5-turbo')

##### Returns

-   A function that takes a user prompt and an object containing the current graph state and history, and returns a Promise that resolves to the updated graph state according to the AI's interpretation of the prompt.

#### .updateGraph(state, {action, payload})

Updates the graph state based on the action and payload. The following actions are available:

-   `'TASK'`: Change the graph according to a user's prompt
-   `'REDO'`: Redo the last undone command on the graph
-   `'UNDO'`: Undo the last command on the graph
-   `'SAVE'`: Save the graph in a given format
-   `'SET_GRAPH'`: Set the graph to a given graph

##### Arguments

-   `state`: the current state of the graph
-   `options`: the options for the update
    -   `options.action`: the action to perform
    -   `options.payload`: the payload of the action

#### .task(prompt, oracle)

Returns a command to change a graph according to a user's `prompt`. The AI model passed as an `oracle` (e.g., a function returned from `aiFactory`) will interpret the prompt and perform the desired action, such as adding or removing nodes or edges, or changing properties of the graph elements.

##### Arguments

-   `prompt`: the prompt to update the graph with
-   `oracle`: the oracle to use for the prompt 

#### .setGraph(graph)

Returns a command to set the graph to a given graph.

##### Arguments

-   `graph`: the graph to set

#### .resetGraph()

Returns a command to reset the graph to its initial graph.

#### .redo()

Returns a command to redo the last undone command on the graph.

#### .undo()

Returns a command to undo the last command on the graph.

#### .save(config)

Returns a command to save the graph in a given format.

##### Arguments

-   `config`: the graph config payload
    -   `config.format`: the format to save the graph in (defaults to 'json'). Possible values are: 'svg', 'pdf', 'png', 'jpg', 'jpeg', 'gif', 'webp', 'tiff', 'tikz', and 'json'.
    -   `config.draft`: whether to save the graph as a draft (defaults to false)
