# graphmaker

> GraphMaker is a tool for creating, manipulating, and exporting graphs using natural language.

---

<img src="https://raw.githubusercontent.com/isle-project/graphmaker/main/graphmaker.gif?token=GHSAT0AAAAAABPKUBSDJ72NROOJMVPUIQKAZB76NYQ" alt="Logo" style="width: 75%; display: block; margin-left: auto; margin-right: auto;" />

---

## Installation as REPL tool

```bash
npm install -g graphmaker
```

### Usage

Start the REPL:

```bash
graphmaker 
```

### REPL Commands

```txt
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

## Installation as JavaScript / Node.js library

```bash
npm install graphmaker
```

### Usage

```javascript
const GraphMaker = require('graphmaker');

function 
// Initialize a new graph
const state = GraphMaker.initializeGraph(config);

// Update the graph with a natural language prompt
const [newState, output] = await GraphMaker.updateGraph(state, GraphMaker.task('Add a node A'));

// Export the graph in various formats
const [_, svgOutput] = await GraphMaker.updateGraph(state, GraphMaker.save({ format: 'svg' }));
```

### API

#### .initializeGraph(config)

Initializes a new graph state with the given configuration options.

##### Arguments

config: configuration options

##### Returns

The initial graph state
