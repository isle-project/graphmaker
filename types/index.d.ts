declare module 'graphmaker' {
    function redo(): { action: 'REDO', payload: null }
    function undo(): { action: 'UNDO', payload: null }
}
