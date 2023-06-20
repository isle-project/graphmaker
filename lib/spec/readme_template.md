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

Graphs &mdash; structures consisting of a set of *nodes* and a set of *edges* between some pairs of nodes &mdash;
are commonly used to depict relationships among entities in many different fields.
While there is a variety of good tools for creating pictures of graphs, the practical reality is that making such
pictures tends to be a fiddly process that often takes far longer than expected.
__GraphMaker__ offers a fluid, natural-language interface for building good pictures of graphs efficiently.
You tell GraphMaker what you want added or changed in the graph, and you can see the result at each stage.
GraphMaker supports a variety of graph types and a wide range of styling options for nodes, edges, and decorative
text and markers.
It can output pictures of the graph in a variety of formats (including SVG, PDF, LaTeX/TikZ, and PNG)
and can save its internal representation (conforming to a JSON schema) so that the graph can be modified
or extended in future sessions.
GraphMaker is designed to free the user from fiddling with the specific positions of nodes or edges; it uses
automatic positioning coupled with user-specified constraints to achieve a Do-What-I-Mean quality.

GraphMaker provides an interactive text REPL along with a library that can be used to provide the same 
functionality in other software.
It uses an AI model for parsing user tasks and can accommodate a variety of models and providers.
 
A session might look like

```
> make the graph directed
As you wish.

> add nodes A-E
Ready for more.

> add edges from node A to C and E
Task complete.

> add edges from node B to D and E
As you wish.

> add constraints that nodes A and B are at the same x coordinate
I've got this.

> add constraints that C, D, and E are at the same x coordinate and that A is to the left of C
Stick a fork in me, I'm done.

> make nodes A and B triangles with a fill color of steelblue
As you wish.
```

This produces the following graph

<img style="width: 50%;" />


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

Start the REPL from the command line with command

```text
graphmaker 
```

You will see a simple prompt '&gt;&nbsp;' at which you can
enter a *task* for GraphMaker to adjust the current graph
or a *command* that performs a higher-level operation.

__Tasks__ are natural language descriptions of a change or addition to the current graph.
GraphMaker maintains the state of the current graph (along with this history of all previous states),
and each task modifies the graph to produce a new graph.
At start up, we begin with an undirected graph with no nodes, edges, or decorations.
A task is a sentence that tells GraphMaker how to adjust the current graph:
`add three nodes`, `make the graph directed`, `add an edge from node A to node B`,
and so forth.
All entities (nodes, edges, decorations) have *names* by which you can refer to them,
names which are distinct from any labels you assign the entities. The names do not
appear in a `:save`'d picture but are visible when you `:show` a picture.
By default, nodes are given alphabetic names in the order they are introduced.
See [Labels and Names](#labels-and-names) below for more detail.
While the models can parse quite complex sentences, it is usually a good idea
to keep your meaning and references as clear as possible.

__Commands__ start with ':', the basic ones are
`:help`, `:intro`, `:tips`, `:examples`, 
`:exit`, `:show`, `:save`, `:load`,
`:reset`, `:undo`, and `:redo`.
To see the full list of commands, you can use `:help` from
within the repl or use the `--help` flag on the command line:

```text
graphmaker --help
```

```
@PROCESS-OUTPUT(usage-help, ./bin/cli)
```

The full set of commands is described in detail in the [REPL Capabilities](#repl-capabilities) section.

### Example Session 1

In this session, we build a simple, undirected graph with some basic styling and labels.
GraphMaker's responses have been omitted for clarity.

```
> add seven nodes
> ...
```

### Example Session 2

In this session, we build a finite automaton, where states are represented by nodes
and transitions by edges labeled with the input.
GraphMaker's responses have been omitted for clarity.


```
> make the graph directed
> add nodes A-G
> add constraints that each of nodes A-E is to the left of its successor and has the same y-coordinate
> add a constraint that node F is above node A and has x-coordinate centered on those of nodes A-E
> add a constraint that node G is below node A and has x-coordinate centered on those of nodes A-E
> ...
```

## Usage

### Conventions

GraphMaker tracks three kinds of entities: nodes, edges, and decorations.
Nodes and edges are components of the graph, as expected. Decorations represent
either arbitrary text strings or rectangular regions that are used to demarcate
and label parts of the graph.
Every entity has a name that is used to refer to it when building the graph.
This name appears on the draft pictures of the graph but not in the saved
production picture.
By default, nodes are given alphabetic names (like A, B, C)
and edges are named like AB or AC for the nodes they connect,
but you can specify the names as you prefer.
The next section discusses this in detail.

Every node, edge, and decoration has several properties that can be set by
the user. For instances, nodes and edges have an optional label; edges
have an optional numeric weight; and both can have associated data
as key-value pairs. Edges specify a source node and a target node;
the distinction is only visible if the edge is directed, but it is
maintained in the names and underlying data.

GraphMaker keeps track of the current graph being bulid and the
entire history of changes you make to the graph from the beginning
of the session. You can move through that history, reset the graph
to its initial state, or load a saved graph from a file. When you
enter a task into GraphMaker, you are describing a change to the
current graph. You can view that graph at anytime with the `:show`
command.



### Labels and Names

GraphMaker assigns a name to every node, edge, and decoration.
These names allow the user to refer to the entity in a task and
are distinct from the *labels* that one might add to the picture.
Each name must be unique within the graph.
However, the user need not think of names for everything;
by default, GraphMaker will assign simple and memorable names to nodes and edges
as they are added to the graph.
Default names for nodes are alphabetic labels A, B, C, ...;
and default names for edges are strings like AB, CD, XY comprised of
the names of the nodes being connected (in order from source to target
in the directed case).
If you prefer different names, you can indicate that to GraphMaker 
when you construct the entity. For example:

```
> add nodes "Parent", "Child 1", "Child 2", and "Child 3"
> add an edge "Oldest" from Parent to Child 1
> add an edge "Youngest" from Parent to Child 3
> add a text decoration Title with text "Family Tree" centered just below the top of the canvas
```

Names are only shown on the graph in draft mode during the REPL session
(displayed in a shaded gray color)
and will not be included in the saved output.
(By default, the `:show` command produces pictures in draft mode, though this can be changed 
with the `:config` command. Output produced by the `:save` command has draft mode off.)

In contrast to names, *labels* are arbitrary strings attached to nodes and edges
to be displayed in the graph output.
Labels can be styled in various fonts, sizes, colors, weights, and styles;
they can also include mathematical text in LaTeX.
Labels can be set when a node is added

```
> add nodes A, B, and C with labels "Start", "Middle", and "End"
```

or at any point afterwards

```
> set the label of node Z to "Accept"
```

Labels can include any text, including spaces and unicode characters. 
You can also instruct Graphmaker to treat the label as a mathematical equation,
in either LaTeX or [MathLingo](attn) format.
To do this, you specify the type of label and give the value; no delimiters ($, $$, &Backslash;&lpar;, &Backslash;&lsqb;)
should be included.
For example:

```
> add a node with LaTeX label of \chi^2(\alpha)
> add a node with mathlingo label e to the minus x squared over two
```

You can also set the label of an edge:

```
> add an edge from A to B with label "Shortcut"
```

The label text can be styled with a variety of parameters.

```
> add a node A with label "Pass Go"
> set the font size for A's label to 20, its weight to bold, and its color to tomato
```


See [Style Details](#style-details) for more on the style parameters
for text. These parameters can also be set in defined styles that can
be applied to any entity:

```
> define a style salient with font size 20, font color tomato, and font weight bold
> add the style salient to node A and edge AB
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

@PROCESS-CONTENTS(commands, ./lib/spec/repl-commands.json)

## Style Details

@PROCESS-CONTENTS(styles, ./lib/spec/graph-schema.json)

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

