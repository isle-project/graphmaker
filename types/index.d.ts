import { Buffer } from 'node:buffer';
import type { Graph } from './graph.d.ts';

export interface Maybe<A> {
    toValue: ( this: Maybe<A>, defaultValue: A ) => Maybe<A>,
    get: ( this: Maybe<A>, key: string, defaultValue: any ) => any,
    map: <B>( this: Maybe<A>, f: (x: A) => B ) => Maybe<B>,
    join: ( this: Maybe<Maybe<A>> ) => Maybe<A>
}

export interface MaybeNothing extends Maybe<any> {
    nothing: null
}

export type Action = 'TASK' | 'SET_GRAPH' | 'UNDO' | 'REDO' | 'RESET_POSITIONS' | 'CONVERT'
export type Config = Object
export type ActionPayload<A extends Action, T> = {
    action: A,
    payload: T
}
export type HistoryElement = {
    graph: Graph,
    action: Action
    payload: any,
    diff: string
}

export type GraphState = {
    graph: Graph,
    history: Array<HistoryElement>,
    historyIndex: number,
    config: Config
}

export type UpdateError = {
    kind: 'ERRORS',
    data: Array<Error>,
    context: any
}

export type TextOutput = {
    kind: 'TEXT-OUTPUT',
    data: string
}

export type BinaryOutput = {
    kind: 'SVG-OUTPUT' | 'PDF-OUTPUT' | 'IMAGE-OUTPUT',
    data: Buffer
}

/**
 * Initializes a new graph state.
 *
 * @param config - configuration options
 * @returns the initial graph state
 */
export function initializeGraph(config: Config) : GraphState

/**
 * Updates the graph state according to the given command.
 */
export function updateGraph<T>(state: GraphState, payload: ActionPayload<'TASK',T>) : Promise<[GraphState, Maybe<UpdateError>|MaybeNothing]>
export function updateGraph<T>(state: GraphState, payload: ActionPayload<'SET_GRAPH',T>) : Promise<[GraphState, Maybe<UpdateError>|MaybeNothing]>
export function updateGraph<T>(state: GraphState, payload: ActionPayload<'CONVERT',T>) : Promise<[GraphState, Maybe<BinaryOutput|TextOutput|UpdateError>]>
export function updateGraph<T>(state: GraphState, payload: ActionPayload<'REDO',T>) : Promise<[GraphState, MaybeNothing]>
export function updateGraph<T>(state: GraphState, payload: ActionPayload<'UNDO',T>) : Promise<[GraphState, MaybeNothing]>
export function updateGraph<T>(state: GraphState, payload: ActionPayload<'RESET_POSITIONS',T>) : Promise<[GraphState, MaybeNothing]>

/**
 * Returns a command to change a graph according to a user's prompt.
 */
export function task<T>( prompt: string, oracle: T) : ActionPayload<'TASK', T>

/**
 * Returns a command to set the graph to a given graph.
 */
export function setGraph( graph: Graph) : ActionPayload<'SET_GRAPH', Graph>

/**
 * Returns a command to reset the graph to its initial graph.
 */
export function resetGraph(): ActionPayload<'SET_GRAPH', Graph>

/**
 * Returns a command to clear the _positions information in the current graph.
 */
export function resetPositions(): ActionPayload<'RESET_POSITIONS',null>

/**
 * Returns a command to redo the last undone command on the graph.
 */
export function redo(): ActionPayload<'REDO',null>

/**
 * Returns a command to undo the last command on the graph.
 */
export function undo(): ActionPayload<'UNDO',null>

/**
 * Returns a command to convert the graph to a given format.
 */
export function convert( config: Config ): ActionPayload<'CONVERT', Config>

/**
 * LLM model types.
 */
export type ModelType = 'memoryless' | 'serial'

/**
 * Creates a function that can be used to generate LLM completions.
 *
 * @param provider - the LLM provider to use
 * @param options - options for the AI model
 * @param options.type - whether to use a memoryless or serial chat
 * @param options.model - the name of the model to use
 * @returns function that can be used to generate LLM completions
 */
export function aiFactory( provider: string, {type: ModelType, model: string} ) : (userPrompt: string, currentState: GraphState) => string
