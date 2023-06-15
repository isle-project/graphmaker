# graphmaker

[![NPM](https://img.shields.io/npm/v/@isle-labs/graphmaker.svg)](https://www.npmjs.com/package/@isle-labs/graphmaker) [![Build Status](https://github.com/isle-project/graphmaker/actions/workflows/test.yml/badge.svg)](https://github.com/isle-project/graphmaker/actions/workflows/test.yml) [![License](https://img.shields.io/npm/l/@isle-labs/graphmaker)](https://github.com/isle-project/graphmaker/blob/main/LICENSE)

> GraphMaker is a tool for creating, manipulating, and exporting graphs using natural language.

---

<p align="center" >
  <img src="https://raw.githubusercontent.com/isle-project/graphmaker/main/graphmaker.gif" alt="Logo" style="width: 75%;" />
</p>

---

## Table of Contents

- [Motivation](#motivation) [CG]
- [Installation](#installation-1) [PB]
- [Getting Started](#getting-started) [PB]
- [Usage](#usage) [CG]
    - [Conventions](#conventions)
    - [Labels and Names](#labels-and-names)
    - [Graph Types](#graph-types)
    - [Constraints](#constraints)
    - [Node Properties](#node-properties)
    - [Edge Properties](#edge-properties)
    - [Decorations](#decorations)
    - [Styling](#styling)
    - [Fine Tuning](#fine-tuning)
    - [Graph Output](#graph-output)
    - [REPL Capabilities](#repl-capabilities)
- [Tips](#tips) [PB]
- [Gallery](#gallery) [PB]
- [Command Details](#command-details) [auto-generated]
- [Style Details](#style-details) [auto-generated]
- [The GraphMaker Node Library](#the-graphmaker-node-library)
    - Installation
    - Usage
    - API

## Motivation

## Installation

### Via installation script:

To install or update `graphmaker`, you can run the install script. You may either download and run the script manually, or use one of the following commands:

```bash
curl -sSL https://raw.githubusercontent.com/isle-project/graphmaker/install-graphmaker.sh | bash
```

```bash
wget -sSL https://raw.githubusercontent.com/isle-project/graphmaker/install-graphmaker.sh | bash
```

### Via npm:

```bash
npm install -g @isle-labs/graphmaker
```

## Getting Started

Start the REPL:

```text
graphmaker 
```
@PROCESS-OUTPUT(usage-help, ./bin/graphmaker)

use natural language to create a graph

basic REPL commands
:reset 
:show 
:help
:exit
:intro
:examples

The full set of commands is described in detail inside the [REPL Capabilities](#repl-capabilities) section.

## Usage

### Conventions

What are the entities?  Nodes, Edges, Decorations 

Every entity has a name that is used to refer to it, see next section
By default, nodes named  A-Z, edges named like AB, AC.




### Labels and Names

Names are used to refer to nodes, edges, and decorations. Each name must be unique within the graph. By default, nodes are named A-Z, while edges are named AB, AC, etc. denoting the nodes they connect. You can tell Graphmaker any name you want to use for a node, edge, or decoration when you create it. For example:

```
> create nodes "Parent", "Child 1", and "Child 2"
```

Names are only shown on the graph during the REPL session. They will be displayed in a shaded gray color to indicate that they will not be part of the final output.

Labels are used to show text on the graph output when it is saved. For example:

```
> create nodes A, B, and C with labels "Node A", "Node B", and "Node C"
```

You can also set the label of a node after it is created:

```
> set label of node A to "Node A"
```

Labels can be any text, including spaces. You can also instruct Graphmaker to use mathematical equations for labels. No $, $$, or other special delimiters are needed, but you should explicitly tell Graphmaker to use LaTeX. For example:

```
> create node A with a LaTeX label of \chi^2(\alpha)
```

You can also set the label of an edge:

```
create an edge from A to B with label "Edge AB"
```

### Graph Types

Graphmaker has explicit support for several graph types.  

You can tell it explicitly to make a graph undirected (no arrows on edges) or directed (arrows on edges).
By default, graphs are initialized as *undirected*.

```
> make this graph directed
```

It also supports the creation of trees or Directed Acyclic Graphs (DAGs).
To create a tree or DAG, you need to specify a __parent relation__ between
nodes:

```
> node A is a parent of node B
```

This implies that there is an edge from A to B and that A is a predecessor
of B. When there are parent relations in the graph, GraphMaker checks if the
graph constitutes a tree or DAG.
If the resulting graph (excluding self-loops) forms a tree, GraphMaker
will format the graph accordingly. Otherwise, if there are parent relations and
no cycles, it will format the graph as a DAG.

Both trees and DAGs have a default layout orientation. The `orientation` config option
sets this. By default, it is `auto` which causes trees to be displayed from the top
down, with the root at the top and DAGs to be displayed left-to-right with the
earliest nodes (with no predecessors) at the left.  The `orientation` option can be
set to `top` (top down), `bottom` (bottom up), `left` (left-to-right), or `right` (right-to-left)
as desired.  This option is ignored for general graphs.

GraphMaker is not limited to simple graphs. You can define multiple edges between two nodes,
which will have distinct names and properties. You can also define edges from a node to itself (self-loops).
When defining multiple edges between nodes, it is helpful to indicate that this edge should be
distinct. For example:

```
> add an edge from A to B
> add another distinct edge from A to B
> add three distinct edges from C to itself
```

Graphmaker can also support other specialized graph forms, such as bipartite and complete graphs.
To generate a complete graph, try

```
> give me a complete graph on six nodes
```

You can also be more direct to the same effect:

```
> add six nodes
> add an edge between each distinct pair of nodes
```

For bipartite graphs, it is often most effective to set style tags
on the nodes to determine their class

```
> add nodes A-G
> add a style tag 'bluebird' to nodes A-D
> add a style tag 'chickadee' to nodes E-G
> define the style 'bluebird' to have square shape and fill color blue
> define the style 'chickadee' to have fill color brown
> add constraints that make all nodes with the same style tag have the same horizontal coordinate
> add edges from A to F and G and from B to E and from C to E, F, and G
```

### Node Properties

To create our graph, one will often start by creating nodes. Each node has a name, an optional label,
several properties that can be set as needed, and several ways to specify how that node is styled.

  + __Node Shape__ 

    Graphmaker supports various shapes for nodes: `circle` (default), `ellipse`, `rectangle`, `square`, `diamond`, `triangle`, and `invisible`.
    (Of course, circles are ellipses and squares are rectangles, but all of them are valid.) An `invisible` node displays no shape, but its labels
    (and names in draft mode) are displayed.

    You can change the shape of a node by telling GraphMaker directly
    
    ```
    > make node A a triangle
    > make nodes B, C, and D a diamond
    ```

    You can also create a node with a shape from the outset

    ```
    > add a diamond node
    ```

    Node shapes can also be set more generally using `style` tags and `data` attributes as described below.
    This can be more efficient when there are multiple nodes whose shape needs to be set or changed.

  + __Node Width To Height__ 

  + __Node Size__ 

  + __Node Style__ 

    We can associate one or more *style tags* with a node. 
    A style tag is just an arbitrary name that will be (separately)
    associated with a set of styling parameter settings.

    We can change or set the style tags associated with the node
    by telling GraphMaker to add that name as an associated style:

    ```
    > add a style 'leaf' to nodes A, D, and F
    > add a style 'branch' to nodes B, C, E, and G
    ```

    At this point, `leaf` and `branch` are just tags, but they
    are assigned meaning by *defining a style* with that name.
    A style is an assignment of one or more styling parameters
    and can also include node and edge properties

    ```
    > define the style 'leaf' to have fill color gray and node shape square
    > define the style 'branch' to have line color steel blue and node shape ellipse with width twice the height
    ```

    Now we can 


    A node may have more than 

    ATTN

  + __Data Attributes__

    We can associate a set of arbitrary data, as key-value pairs,
    with a node. These data can be used by GraphMaker to 
  
    ```
    ATTN
    ```

In addition, one can set any individual styling parameters for the node, such as fill style or line color.
Any individual style parameter set for the node overrides the effect of a style tag. For example:

```
> add nodes A-C
> add a style 'foo' to nodes A and C
> define the style 'foo' to have fill color blue and fill style of vertical hashing
> set the fill color for node A to be 'tomato'
```
Now A and C both inherit the style 'foo' but A's fill color has been changed.

More than one style can be added to a node

```
> append a second style 'bar' to node A
> define the style 'bar' to have line color red and line width thick
```

See the section [Style Details](#style-details) for details on the supported styling parameters and their values.


### Edge Properties

Edges in the graph are the connections between nodes. Each edge has a source and target, specified implicitly when defining the edge. You can create an edge between nodes A and B simply by saying something like

```
> create an undirected edge between A and B
```

or 

```
> create a directed edge from A to B
```

By default, edges in a graph are undirected. To make all edges directed, you can say

```
> make this graph directed
```

It is also possible to create an edge from a node to itself (a self-loop) by saying something like

```
> create a directed edge from A to itself
```

For self loops, you may explicitly specify a loop direction, which defines the angle at which a self-loop edge points to the node. The loop direction is defined as a numeric value giving the counter-clockwise angle from the positive x-direction. For example:

```
> create a directed edge from A to itself with loop direction 45
```

The loop direction can also be set later:

```
> set the loop direction of the edge AA to 45
```

Additionally, there are several more properties of an edge that can be set to customize its appearance and behavior in the graph.

  + __Weight__ 
  
  An optional numeric value associated with the edge. It is often used to represent the *strength* or *cost* of the connection between two nodes. The weight of an edge is displayed as a label on the edge. The weight of an edge can be set when the edge is created or later. For example:

  ```
  > create an edge from A to B with weight 3
  ```
  
  ```
  > set the weight of the edge AB to 11
  ```


source and target  implicitly by defining edge

weight
weightOffset

angleLeaving
angleEntering
softnessLeaving
softnessEntering
loopDirection

style  (tags)

Mention style settings and refer to Style Details

### Decorations

two types: text and region (rectangles)

x,y - coordinates of the center of the decoration (left boundary of canvas is zero, right boundary is one)

width and height (as proportion of canvas width and height) for regions

### Styling

### Fine Tuning

### Graph Output

### REPL Capabilities

## Tips

## Gallery

## Command Details

@PROCESS-CONTENTS(commands, ./spec/repl-commands.json)

## Style Details

@PROCESS-CONTENTS(styles, ./spec/graph-schema.json)

## The GraphMaker Node Library

ATTN: Fill in reasoning and general idea behind this library

### Installation

```bash
npm install @isle-labs/graphmaker
```

### Usage

```javascript
const GraphMaker = require( '@isle-labs/graphmaker' );

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


#### .aiFactory(provider, {type, model})

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
-   `'CONVERT'`: Convert the graph to a given format
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

